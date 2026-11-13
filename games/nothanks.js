// 노땡스! — 카드를 받을지, 칩 1개를 내고 넘길지. 낮은 점수가 승리.
// 규칙: 3~35 카드 중 9장을 뺀 24장. 내 차례에 카드를 "받기"(카드+그 위의 칩 전부) 또는 "노땡스"(칩 1개를 내고 넘김).
//       연속된 숫자는 가장 낮은 카드만 점수로 센다. 최종 점수 = 카드 점수 − 남은 칩. 칩이 0이면 반드시 받아야 한다.
//       시작 칩: 3~5인 11개 / 6인 9개 / 7인 7개.
// 규격: 무작위는 전달받은 rng만 / 상태는 JSON / applyMove는 상태를 직접 수정 / 봇은 합법 수 안에서만 고른다.

// ---------- 규칙 (엔진 전담) ----------
const startChips = n => (n <= 5 ? 11 : n === 6 ? 9 : 7);

// 연속된 숫자는 가장 낮은 카드만 점수로 센다
function cardScore(cards) {
  const c = cards.slice().sort((x, y) => x - y);
  let sum = 0, prev = -9;
  for (const v of c) { if (v !== prev + 1) sum += v; prev = v; }
  return sum;
}
const marginal = (cards, card) => cardScore(cards.concat([card])) - cardScore(cards);
const finalScore = (s, i) => cardScore(s.cards[i]) - s.chips[i];
const clip = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- 봇 튜닝 값 ----------
const BASE = 3, PAT_W = 0.2, SCARCE_AT = 4, SCARCE_W = 2.5, AGG_W = 0.02, NOISE_W = 0.8, RISK_W = 0.08;
const BLOCK_W = 0.2, BLOCK_CAP = 5, BLOCK_MIN_CHIPS = 3, FREE_DENY = 2;                        // 견제
const PRESSURE = [0, 15, 8, 3.5, 1.5];                              // 남은 칩 0~4개일 때의 압박(점수 환산)
const WAIT_RESERVE = 2, WAIT_LOOK = 4;                          // 기다리기: 칩은 최소 2개 남김, 최대 4바퀴 앞까지 내다봄
const DENY_W = 0.075;                                           // 견제(일반): 남이 공짜로 키우는 카드를 막는 강도
const ALLY_W = 1.0, ALLY_CAP = 4, ALLY_MIN_CHIPS = 4, ALLY_MAX_COST = 8;   // 도와주기: 동료(relations ally)에게 공짜인 카드는 내가 크게 손해가 아니면 양보, 선두(동료 제외)는 견제
const SHIELD_CHIPS = 3, SHIELD_HURT = 3;                            // 방패: 동료 칩 3개 이하 & 동료 순손해 3점 초과일 때
const CHIP_EARLY = 0.7, POT_SWING = 0.45;                       // 초반 칩 가치 가산, 판 위 칩이 쌓일수록 받을 만해짐(남에게 넘기는 부담)
// 칩 1개의 가치(점): 남은 카드가 많을수록 1보다 크다. 마지막엔 정확히 1.
const chipValue = (s, skill) => 1 + CHIP_EARLY * (s.deck.length / 23) * (0.4 + 0.06 * skill);

// 상대 q가 이 카드를 받을지 대략 예측 (봇은 칩 개수를 센다). 막으러 오는 것까지 감안해 문턱을 높게 잡는다.
function wouldTake(s, q, card, potAt, chipsLeft, ownerMarginal) {
  if (chipsLeft <= 0) return true;                                     // 칩이 없으면 강제로 받는다
  const net = marginal(s.cards[q], card) - potAt * chipValue(s, 6);
  const deny = ownerMarginal <= 0 ? Math.min(4, potAt * 0.35) : 0;      // 내가 공짜로 키우는 게 보이면 막으러 올 수 있다
  return net <= BASE + potAt * POT_SWING * 0.88 + (chipsLeft <= 2 ? 4 : 0) + deny;
}
// 몇 바퀴까지 돌려도 아무도 채 가지 않을지 (0 = 지금 바로 받아야 안전)
function safeRounds(s, me, card, mine) {
  const opp = []; for (let k = 1; k < s.n; k++) opp.push((me + k) % s.n);
  for (let r = 1; r <= WAIT_LOOK; r++) {
    if (s.chips[me] - r < WAIT_RESERVE) return r - 1;
    for (let i = 0; i < opp.length; i++) {
      const q = opp[i];
      const potAt = s.pot + r + (r - 1) * (s.n - 1) + i;                  // q 차례에 판 위에 쌓여 있을 칩
      if (wouldTake(s, q, card, potAt, s.chips[q] - (r - 1), mine)) return r - 1;
    }
  }
  return WAIT_LOOK;
}

// 이 봇이 지금 노리는 상대 자리 (없으면 -1)
function targetSeat(s, me, t, info) {
  if (t.targetMode === 'human') return s.humanSeat >= 0 && s.humanSeat !== me ? s.humanSeat : -1;
  if (t.targetMode === 'random') return s.targets[me] >= 0 && s.targets[me] !== me ? s.targets[me] : -1;
  const pool = t.targetMode === 'rival' ? (info.rivalSeats || []).filter(x => x !== me) : t.targetMode === 'leader' ? s.chips.map((_, i) => i).filter(i => i !== me) : [];
  let best = -1, bs = Infinity;
  for (const i of pool) { const v = finalScore(s, i); if (v < bs) { bs = v; best = i; } }
  if (t.targetMode === 'leader' && !(best >= 0 && bs < finalScore(s, me))) return -1;   // 내가 1등이면 견제 대상 없음
  return best;
}

// 동료를 돕는 봇의 견제 대상: 동료 중 가장 앞선 사람보다 앞서 있는 '동료 아닌 사람' 중 1등 (없으면 -1)
function allyTargetSeat(s, me, allies) {
  const ids = new Set(allies.map(a => a.seat));
  let ab = Infinity; for (const a of allies) ab = Math.min(ab, finalScore(s, a.seat));
  let best = -1, bs = Infinity;
  for (let i = 0; i < s.n; i++) { if (i === me || ids.has(i)) continue; const v = finalScore(s, i); if (v < bs) { bs = v; best = i; } }
  return best >= 0 && bs < ab ? best : -1;
}

export default {
  meta: {
    id: 'nothanks', name: '노땡스!', version: '1.6.0',
    players: { min: 3, max: 7 }, minutes: 10,
    campaign: null
  },

  newGame({ players, rng }) {
    const n = players.length;
    const deck = rng.shuffle(Array.from({ length: 33 }, (_, i) => i + 3)).slice(9);   // 9장 제외 → 24장
    return {
      n, humanSeat: players.findIndex(p => p.human),
      chips: Array(n).fill(startChips(n)), cards: players.map(() => []),
      deck, card: deck.pop(), pot: 0, turn: 0, over: false,
      waits: Array(n).fill(0),
      targets: players.map((_, i) => { let t = rng.int(n - 1); if (t >= i) t++; return t; })   // 'random' 견제용: 판마다 무작위
    };
  },

  currentSeat: s => s.turn,
  isOver: s => s.over,
  legalMoves(s) { return s.over ? [] : (s.chips[s.turn] > 0 ? ['take', 'pass'] : ['take']); },

  applyMove(s, move) {
    if (s.over) throw new Error('이미 끝난 게임');
    if (!this.legalMoves(s).includes(move)) throw new Error('불법 수: ' + move);
    const me = s.turn;
    if (move === 'pass') {
      if (marginal(s.cards[me], s.card) <= 0) s.waits[me]++;     // 공짜 카드를 넘기면 "기다림" 1회
      s.chips[me]--; s.pot++; s.turn = (me + 1) % s.n;
    } else {
      s.cards[me].push(s.card); s.chips[me] += s.pot; s.pot = 0; s.waits = s.waits.map(() => 0);
      if (s.deck.length === 0) { s.card = null; s.over = true; } else s.card = s.deck.pop();
    }
    return s;
  },

  // 성향 → 받을지 넘길지. 결과는 항상 합법 수 + 이유(normal/free/wait/block/forced).
  botChoose(s, t, rng, info) {
    const me = s.turn;
    if (s.chips[me] <= 0) return { move: 'take', reason: 'forced' };
    const card = s.card, pot = s.pot;
    const mine = marginal(s.cards[me], card);
    const net = mine - pot * chipValue(s, t.skill);                   // net 낮을수록 이득 (칩은 초반일수록 비쌈)
    const allies = info.allySeats || [];
    const tg = allies.length ? allyTargetSeat(s, me, allies) : targetSeat(s, me, t, info);

    // 다른 사람들이 이 카드를 받으면 얼마나 아플까 (대상은 가중)
    const allyIds = new Set(allies.map(a => a.seat));                // 동료에게 생길 손해는 '견제 거리'가 아니다
    let harm = 0, w = 0;
    for (let q = 0; q < s.n; q++) {
      if (q === me || allyIds.has(q)) continue;
      const wt = q === tg ? 2.5 : 1;
      harm += clip(marginal(s.cards[q], card) - pot, 0, 10) * wt; w += wt;
    }
    harm = w ? harm / w : 0;

    // 칩 압박: 칩이 바닥나면 다음 카드는 뭐가 와도 강제로 받는다. 남은 칩이 적을수록 "지금 이 정도면 먹자"로 기운다.
    const pressure = (PRESSURE[s.chips[me]] || 0) * (1 - t.risk * RISK_W * 0.5) * (0.6 + t.skill * 0.04) * Math.min(1, s.deck.length / 8);
    const A = BASE + (5 - t.patience) * PAT_W + pressure - t.aggression * AGG_W * harm
      + pot * POT_SWING * (0.7 + t.skill * 0.03);                     // 작은 카드도 칩 0개면 일단 넘겨 본다. 칩이 쌓일수록 받을 만해짐

    // 견제: 대상에게 이득인 카드를 내가 손해를 보더라도 먼저 가져간다 (한도 있음)
    let grudge = 0;
    if (tg >= 0 && s.chips[me] >= BLOCK_MIN_CHIPS) {
      const tm = marginal(s.cards[tg], card);
      const dv = Math.max(0, pot - tm) + (tm <= 0 ? FREE_DENY : 0);
      grudge = Math.min(BLOCK_CAP, dv * t.aggression * BLOCK_W);
    }

    // 견제(일반): 누군가 이 카드를 공짜로 받을 수 있고 판 위 칩이 두둑하면, 손해를 감수하고 먼저 가져간다
    if (s.chips[me] >= BLOCK_MIN_CHIPS) {
      let dv = 0;
      for (let q = 0; q < s.n; q++) { if (q === me || allyIds.has(q)) continue; const qm = marginal(s.cards[q], card); if (qm <= 0) dv = Math.max(dv, pot + Math.min(2, -qm)); }   // 막을 가치 ≈ 그 사람이 챙길 칩
      grudge = Math.max(grudge, Math.min(BLOCK_CAP, dv * t.aggression * DENY_W));
    }

    // 방패: 동료의 칩이 얼마 안 남았는데 이 카드가 동료에게 크게 아프면, 내가 대신 받는다(한도 있음)
    if (allies.length && s.chips[me] >= ALLY_MIN_CHIPS) {
      for (const a of allies) {
        if (s.chips[a.seat] > SHIELD_CHIPS) continue;
        const hurt = marginal(s.cards[a.seat], card) - pot;
        if (hurt > SHIELD_HURT) grudge = Math.max(grudge, Math.min(ALLY_CAP * 1.5, a.strength * ALLY_W * 0.5 * (hurt - SHIELD_HURT)));
      }
    }

    // 기다리기: 나에게 공짜인 카드는 "아무도 채 가지 않을 만큼" 돌려 칩을 모은다.
    //   안전한 바퀴 수를 먼저 계산하고, 인내심이 그중 몇 바퀴를 쓸지 정한다.
    //   인내심이 높으면 가끔 안전선을 한 바퀴 넘겨 욕심을 내다가 뺏길 수도 있다(발목 잡기).
    if (mine <= 0) {
      let safe = safeRounds(s, me, card, mine);
      if (rng.next() < (10 - t.skill) * 0.05) safe += rng.next() < 0.5 ? -1 : 1;      // 실력 낮으면 오판
      const gamble = t.patience >= 7 ? 0.3 + t.risk * 0.04 : t.patience >= 4 ? 0.1 + t.risk * 0.02 : 0;   // 안전선을 넘겨 한 바퀴 더 욕심낼 확률
      const greed = Math.min(t.patience >= 7 ? 4 : t.patience >= 4 ? 2 : 1, safe + (rng.next() < gamble ? 1 : 0));
      if (s.waits[me] < greed && s.chips[me] > WAIT_RESERVE) return { move: 'pass', reason: 'wait' };
    }

    // 도와주기: 동료가 이 카드를 공짜로 받을 수 있으면(판 위 칩은 덤) 내가 크게 손해가 아닌 한 양보한다. 칩이 바닥나기 전까지만.
    let yieldv = 0;
    if (allies.length && s.chips[me] >= ALLY_MIN_CHIPS && mine <= ALLY_MAX_COST) {
      for (const a of allies) { const am = marginal(s.cards[a.seat], card); if (am <= 0) yieldv = Math.max(yieldv, Math.min(ALLY_CAP, a.strength * ALLY_W * (1 + Math.min(pot, 6) * 0.35 + Math.min(2, -am) * 0.5))); }
    }

    const noise = (10 - t.skill) * NOISE_W * (rng.next() + rng.next() - 1) * 2;
    if (!(net + noise <= A - yieldv + grudge)) return { move: 'pass', reason: (yieldv > 0 && net + noise <= A + grudge) ? 'assist' : 'normal' };
    const reason = (net + noise <= A) ? (mine <= 0 ? 'free' : 'normal') : 'block';

    return { move: 'take', reason };
  },

  // 점수 = 카드 점수 − 남은 칩 (낮을수록 승리). 같은 점수는 공동 순위.
  result(s) {
    const order = s.chips.map((_, seat) => ({ seat, score: finalScore(s, seat) })).sort((a, b) => a.score - b.score || a.seat - b.seat);
    let rank = 0, prev = null;
    const ranking = order.map((o, i) => { if (o.score !== prev) { rank = i + 1; prev = o.score; } return { seat: o.seat, rank, score: o.score }; });
    return { ranking, summary: `최저 ${order[0].score}점` };
  },

  // ---------- 화면: "카드 테이블" 테마 (이 게임만의 색·모양. 스타일은 이 화면 안에서만 적용) ----------
  mount(container, ctx) {
    const self = this, rng = ctx.rng;
    const th = ctx.theme || {};
    const s = this.newGame({ players: ctx.players, rng });
    const humanSeat = s.humanSeat;
    const timers = new Set();
    let dead = false, finished = false;
    const speech = {};              // seat → { t, fresh }  (캐릭터마다 자기 말풍선)
    const logs = [];

    container.innerHTML = `<style>${CSS}</style>
      <div class="g-nt" style="--acc:${th.accent || '#d9b25a'};--felt:${th.table || '#1f4d3a'};--felt2:${th.table2 || '#153a2b'}">
        <div class="nt-bar"><span class="nt-deck"></span><span class="nt-chips">시작 칩 ${startChips(s.n)}개</span></div>
        <div class="nt-seats"></div>
        <div class="nt-table">
          <div class="nt-card"><i class="tl"></i><b></b><i class="br"></i></div>
          <div class="nt-pot"></div>
          <div class="nt-msg"></div>
          <div class="nt-hint"></div>
        </div>
        <div class="nt-acts"><button class="nt-btn take" data-a="take"></button><button class="nt-btn pass" data-a="pass"></button></div>
        <div class="nt-result"></div>
        <div class="nt-log"></div>
        <details class="nt-rules"><summary>규칙 보기</summary><ul>
          <li>내 차례에 <b>카드를 받거나</b>, <b>칩 1개를 내고 넘깁니다</b>(노땡스).</li>
          <li>받으면 그 카드와 <b>카드 위의 칩을 전부</b> 가져가고, 이어서 다음 카드가 나옵니다.</li>
          <li><b>연속된 숫자는 가장 낮은 카드만</b> 점수로 셉니다. 취소선 카드는 점수에 안 들어가요.</li>
          <li>최종 점수 = 카드 점수 − 남은 칩. <b>낮을수록 승리</b>입니다. 칩이 0개면 반드시 받아야 합니다.</li>
          <li>카드는 3~35 중 9장을 뺀 24장입니다. 상대 칩은 끝날 때까지 숨겨져 있지만, 봇은 칩 개수를 세고 있어요.</li>
        </ul></details>
      </div>`;
    const q = sel => container.querySelector(sel);
    const seatsBox = q('.nt-seats'), deckInfo = q('.nt-deck'), cardNum = q('.nt-card b'), cardTl = q('.nt-card .tl'), cardBr = q('.nt-card .br');
    const potBox = q('.nt-pot'), msgBox = q('.nt-msg'), hintBox = q('.nt-hint'), logBox = q('.nt-log'), resBox = q('.nt-result');
    const bTake = q('[data-a=take]'), bPass = q('[data-a=pass]'), acts = q('.nt-acts');

    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
    const nameOf = seat => (ctx.players[seat].human ? '나' : ctx.players[seat].name);
    const shortName = seat => (ctx.players[seat].human ? '나' : ctx.players[seat].name.split(' ').pop());
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    const coin = () => el('span', 'nt-coin');

    function log(text, cls) {
      logs.push({ text, cls }); if (logs.length > 60) logs.shift();
      const d = el('div', cls || '', text); logBox.append(d);
      while (logBox.childNodes.length > 60) logBox.removeChild(logBox.firstChild);
      logBox.scrollTop = logBox.scrollHeight;
    }

    // 말풍선: 캐릭터마다 자기 자리에 읽을 시간만큼 머문다. 누르면 바로 닫힘. 대사는 로그에도 남는다.
    function say(seat, key) {
      if (ctx.players[seat].human || speech[seat]) return;
      const t = ctx.say(seat, key);
      if (!t) return;
      speech[seat] = { t, fresh: true };
      log(`「${shortName(seat)}」 ${t}`, 'sp');
      draw();
      later(() => { delete speech[seat]; draw(); }, ctx.readMs(t));
    }

    function leaderSeat() {
      let best = 0, bs = Infinity;
      for (let i = 0; i < s.n; i++) { const v = finalScore(s, i); if (v < bs) { bs = v; best = i; } }
      return best;
    }

    function hintHtml(seat) {
      const mine = marginal(s.cards[seat], s.card), net = mine - s.pot;
      const box = document.createDocumentFragment();
      if (s.chips[seat] <= 0) { const b = el('b', '', '반드시 받아야'); box.append('칩이 없어서 ', b, ' 해요.'); return box; }
      const c = mine > 0 ? `카드 +${mine}점` : mine === 0 ? '카드 0점 (연속이라 공짜!)' : `카드 ${mine}점 (이어 붙어서 오히려 줄어요!)`;
      const r = net > 0 ? `실질 ${net}점 손해` : net < 0 ? `실질 ${-net}점 이득` : '실질 변화 없음';
      box.append('받으면: ', el('b', '', c), ` · 칩 +${s.pot} → `, el('b', '', r), document.createElement('br'), '넘기면: 칩 1개(=1점) 소모');
      return box;
    }

    function draw() {
      const reveal = s.over;
      seatsBox.replaceChildren(...ctx.players.map((p, i) => {
        const plate = el('div', 'nt-seat' + (p.human ? ' me' : '') + (!s.over && s.turn === i ? ' turn' : ''));
        const sorted = s.cards[i].slice().sort((a, b) => a - b);
        const top = el('div', 'nt-top');
        const av = ctx.avatar(i, 42);
        const info = el('div', 'nt-info');
        info.append(el('div', 'nt-nm', p.human ? '나' : p.name.split(' ').pop()));
        const st = el('div', 'nt-st'); st.append(coin(), (p.human || reveal) ? `${s.chips[i]}` : '?', `  ·  ${cardScore(s.cards[i])}점`);
        info.append(st); top.append(av, info);
        const cards = el('div', 'nt-cards');
        sorted.forEach((v, k) => cards.append(el('span', 'nt-c' + (k > 0 && sorted[k - 1] === v - 1 ? ' dim' : ''), String(v))));
        plate.append(top, cards);
        const sp = speech[i];
        if (sp) {
          const b = el('div', 'nt-say' + (sp.fresh ? ' pop' : ''), sp.t); sp.fresh = false;
          b.onclick = () => { delete speech[i]; draw(); };
          plate.append(b);
        }
        return plate;
      }));
      deckInfo.textContent = s.over ? '게임 종료' : `남은 카드 ${s.deck.length}장`;
      const v = s.card == null ? '✓' : String(s.card);
      cardNum.textContent = v; cardTl.textContent = v; cardBr.textContent = v;
      potBox.replaceChildren();
      if (!s.over) {
        const row = el('div', 'nt-stack');
        for (let k = 0; k < Math.min(s.pot, 14); k++) row.append(coin());
        potBox.append(row, `판 위 칩 ${s.pot}개`);
      }
      const mine = !s.over && ctx.players[s.turn].human;
      bTake.disabled = !mine; bPass.disabled = !mine || s.chips[s.turn] <= 0;
      bTake.textContent = mine ? `받기 (+칩 ${s.pot}개)` : '받기';
      bPass.textContent = '노땡스 (칩 −1)';
      acts.style.display = s.over ? 'none' : 'flex';
      msgBox.textContent = s.over ? '' : (mine ? '당신 차례예요' : `${nameOf(s.turn)} 생각 중...`);
      hintBox.replaceChildren();
      if (mine) hintBox.append(hintHtml(s.turn));
    }

    function step(seat, move, reason) {
      const card = s.card, pot = s.pot, mineGain = marginal(s.cards[seat], card), net = mineGain - pot;
      const leaderBefore = leaderSeat();
      self.applyMove(s, move);
      if (move === 'pass') {
        log(`${nameOf(seat)}: 노땡스 (칩 -1)${reason === 'wait' ? ' · 공짜 카드라 칩을 더 모으려 기다림' : reason === 'assist' ? ' · 동료에게 양보' : ''}`);
        if (reason === 'wait' && Math.random() < 0.6) say(seat, 'wait');
        else if (reason === 'assist') say(seat, 'assist');
      } else {
        let note = '';
        if (reason === 'forced') note = ' · 칩이 없어 강제로 받음';
        else if (mineGain < 0) note = ' · 이어 붙어서 점수가 줄었어요';
        else if (mineGain === 0) note = ' · 연속 카드라 점수 증가 없음';
        if (reason === 'block') note += ' · 상대에게 넘기지 않으려고 받음(견제)';
        log(`${nameOf(seat)}: ${card} 받음 (칩 +${pot})${note}`);
        if (!ctx.players[seat].human) {
          if (reason === 'forced') say(seat, 'forced');
          else if (reason === 'block') say(seat, 'block');
          else if (net <= -3) say(seat, 'good');
          else if (net >= 14) say(seat, 'bad');
        }
        const now = leaderSeat();
        if (now !== leaderBefore && !ctx.players[leaderBefore].human) say(leaderBefore, 'overtaken');
      }
      draw();
      if (s.over) return finish();
      loop();
    }

    function finish() {
      if (finished) return; finished = true;
      const res = self.result(s);
      const best = res.ranking[0].score, last = res.ranking[res.ranking.length - 1];
      res.ranking.forEach(r => {
        if (ctx.players[r.seat].human) return;
        if (r.score === best) say(r.seat, 'win'); else if (r.seat === last.seat) say(r.seat, 'lose');
      });
      resBox.replaceChildren(el('b', '', '결과 (카드 점수 − 칩, 낮을수록 승리)'),
        ...res.ranking.map(r => el('div', 'nt-row' + (r.score === best ? ' first' : ''), `${r.rank}위 ${nameOf(r.seat)}   ${cardScore(s.cards[r.seat])} − ${s.chips[r.seat]} = ${r.score}`)));
      log(ctx.players[res.ranking[0].seat].human ? '당신이 이겼습니다!' : `${nameOf(res.ranking[0].seat)} 승리`);
      draw();
      later(() => ctx.finish(res), ctx.delay(4800));      // 마지막 대사를 읽을 시간
    }

    function loop(first) {
      if (dead || s.over) return;
      const p = ctx.players[s.turn];
      if (p.human) return;
      later(() => {
        const ch = self.botChoose(s, p.traits, rng, { seat: s.turn, rivalSeats: p.rivalSeats, allySeats: p.allySeats });
        step(s.turn, ch.move, ch.reason);
      }, ctx.delay(first ? 2600 : 800));    // 진행은 빠르게, 첫 수만 시작 대사를 읽을 여유를 둔다
    }

    bTake.onclick = () => { if (!s.over && ctx.players[s.turn].human) step(s.turn, 'take', s.chips[s.turn] <= 0 ? 'forced' : 'human'); };
    bPass.onclick = () => { if (!s.over && ctx.players[s.turn].human && s.chips[s.turn] > 0) step(s.turn, 'pass', 'human'); };

    log(`새 게임! 카드 24장, 칩 ${startChips(s.n)}개씩. ${nameOf(s.turn)} 선공`);
    draw();
    ctx.players.forEach((p, i) => { if (!p.human) later(() => say(i, 'start'), ctx.delay(300 + i * 450)); });
    loop(true);
    return { destroy() { dead = true; timers.forEach(clearTimeout); timers.clear(); } };
  }
};

// 이 게임 화면에서만 쓰는 스타일 (.g-nt 안으로 가둠: 앨범/다른 게임에 영향 없음)
const CSS = `
.g-nt{position:relative;padding:12px 10px 14px;border-radius:18px;color:#f4ecd6;
 background:radial-gradient(90% 60% at 50% 0%,#ffffff14,transparent 70%),repeating-linear-gradient(45deg,#ffffff05 0 2px,#0000 2px 4px),radial-gradient(120% 90% at 50% 40%,var(--felt),var(--felt2));
 box-shadow:inset 0 0 0 3px #5a3a22,inset 0 0 0 5px #8a6236,inset 0 0 60px #000a,0 10px 24px #0006;font-family:var(--fk)}
.g-nt *{box-sizing:border-box}
.g-nt .nt-bar{display:flex;justify-content:space-between;font-family:var(--fd);font-size:13px;letter-spacing:.12em;color:#e8dcb8;margin:2px 6px 8px}
.g-nt .nt-seats{display:grid;grid-template-columns:1fr 1fr;gap:10px 8px;padding-top:30px}
.g-nt .nt-seat{position:relative;background:#00000040;border:1px solid #ffffff22;border-radius:12px;padding:7px;min-height:84px}
.g-nt .nt-seat.turn{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc),0 0 16px #ffd96a66}
.g-nt .nt-top{display:flex;gap:8px;align-items:center}
.g-nt .nt-info{min-width:0}
.g-nt .nt-nm{font-weight:800;font-size:14px;line-height:1.2;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.g-nt .nt-st{font-family:var(--fd);font-size:14px;color:#e8dcb8;white-space:pre}
.g-nt .nt-cards{display:flex;flex-wrap:wrap;gap:3px;margin-top:6px}
.g-nt .nt-c{min-width:25px;padding:1px 4px;text-align:center;font-family:var(--fd);font-weight:700;font-size:14px;border-radius:4px;background:#f6efdb;color:#2a2016;box-shadow:0 1px 2px #0006}
.g-nt .nt-c.dim{background:#6f735f;color:#c9c5b0;text-decoration:line-through;box-shadow:none}
.g-nt .nt-say{position:absolute;left:2px;right:2px;bottom:calc(100% - 4px);z-index:6;background:#fbf6e6;color:#2a2016;border-radius:10px;padding:6px 9px;font-size:12.5px;line-height:1.4;box-shadow:0 4px 12px #000a;cursor:pointer}
.g-nt .nt-say:after{content:"";position:absolute;left:22px;bottom:-6px;border:6px solid transparent;border-top-color:#fbf6e6;border-bottom:0}
.g-nt .nt-say.pop{animation:ntpop .18s ease-out}
@keyframes ntpop{from{transform:translateY(5px) scale(.96);opacity:0}to{transform:none;opacity:1}}
.g-nt .nt-table{margin:16px 0 10px;text-align:center}
.g-nt .nt-card{position:relative;display:inline-block;width:112px;height:150px;border-radius:12px;background:linear-gradient(160deg,#fbf5e1,#eadfc0);color:#2a2016;box-shadow:0 0 0 3px var(--acc) inset,0 8px 18px #000a;transform:rotate(-2deg)}
.g-nt .nt-card b{display:block;font-family:var(--fd);font-weight:700;font-size:70px;line-height:150px}
.g-nt .nt-card i{position:absolute;font-style:normal;font-family:var(--fd);font-weight:700;font-size:16px}
.g-nt .nt-card .tl{left:10px;top:7px}.g-nt .nt-card .br{right:10px;bottom:7px;transform:rotate(180deg)}
.g-nt .nt-pot{margin-top:10px;font-size:14px;font-weight:700;color:#ffe3a0}
.g-nt .nt-stack{display:flex;justify-content:center;flex-wrap:wrap;gap:2px;margin-bottom:4px;min-height:14px}
.g-nt .nt-coin{display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:-2px;margin-right:4px;border:1.5px solid #7a5512;background:radial-gradient(circle at 35% 30%,#ffe7a0,#d9a93a 60%,#a97a1c)}
.g-nt .nt-stack .nt-coin{margin:0}
.g-nt .nt-msg{margin-top:4px;font-size:13px;color:#d9ceae;min-height:18px}
.g-nt .nt-hint{margin:6px auto 0;max-width:420px;min-height:20px;font-size:13px;line-height:1.55;color:#f4ecd6}
.g-nt .nt-hint b{color:#ffe3a0}
.g-nt .nt-acts{display:flex;gap:10px;margin-top:8px}
.g-nt .nt-btn{flex:1;border:0;cursor:pointer;padding:13px 8px;border-radius:10px;font-weight:800;font-size:15px;color:#fff;box-shadow:0 3px 0 #0006,0 6px 12px #0005}
.g-nt .nt-btn.take{background:linear-gradient(#d8584f,#a93a33)}
.g-nt .nt-btn.pass{background:linear-gradient(#4a86c9,#2f5f97)}
.g-nt .nt-btn:active:not(:disabled){transform:translateY(2px);box-shadow:0 1px 0 #0006}
.g-nt .nt-btn:disabled{opacity:.35;cursor:default;filter:grayscale(.6)}
.g-nt .nt-result{margin-top:10px;font-size:14px}
.g-nt .nt-result .nt-row{padding:7px 9px;border-radius:8px;background:#00000040;margin-top:4px}
.g-nt .nt-result .nt-row.first{background:#6d5416cc;color:#ffe3a0;font-weight:700}
.g-nt .nt-log{margin-top:12px;background:#00000050;border-radius:10px;padding:7px 10px;font-size:12px;color:#d9ceae;max-height:140px;overflow:auto}
.g-nt .nt-log div{padding:1px 0}
.g-nt .nt-log .sp{color:#ffe3a0;font-style:italic}
.g-nt .nt-rules{margin-top:10px;background:#00000040;border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.6;color:#e8dcb8}
.g-nt .nt-rules summary{cursor:pointer;font-weight:700}
.g-nt .nt-rules li{margin:2px 0}
`;
