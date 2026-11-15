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
const PRESSURE_CUT = 17.5;                                             // 실질 손해가 이 값 이상이면 칩 압박이 사라진다
const PRESSURE = [0, 15, 8, 3.5, 1.5];                              // 남은 칩 0~4개일 때의 압박(점수 환산)
const WAIT_RESERVE = 2, WAIT_LOOK = 4;                          // 기다리기: 칩은 최소 2개 남김, 최대 4바퀴 앞까지 내다봄
const DENY_W = 0.075;                                           // 견제(일반): 남이 공짜로 키우는 카드를 막는 강도
const ALLY_W = 1.0, ALLY_CAP = 4, ALLY_MIN_CHIPS = 4, ALLY_MAX_COST = 8;   // 도와주기: 동료(relations ally)에게 공짜인 카드는 내가 크게 손해가 아니면 양보, 선두(동료 제외)는 견제
const SHIELD_CHIPS = 3, SHIELD_HURT = 3;                            // 방패: 동료 칩 3개 이하 & 동료 순손해 3점 초과일 때
const LOOK_SNATCH = 2.0, LOOK_RETURN = 0.45;                     // 뒤 사람 읽기: 뺏길 것 같으면 먼저 먹고, 아무도 안 먹을 것 같으면 한 바퀴 돌린다
const LEAD_W = 1.5, TRAIL_W = 3.0, STAND_GAP = 4;                 // 판세: 선두는 무난한 카드를 빨리 정리, 꼴찌는 칩을 더 모으며 버틴다. 선두가 좋아할 카드는 더 견제
const CHIP_EARLY = 0.7, POT_SWING = 0.45, SWING_N = 1.6;      // SWING_N: 인원수 효과 세기                       // 초반 칩 가치 가산, 판 위 칩이 쌓일수록 받을 만해짐(남에게 넘기는 부담)
// 칩 1개의 가치(점): 남은 카드가 많을수록 1보다 크다. 마지막엔 정확히 1.
// 판 위 칩이 쌓이는 속도는 인원수만큼 빠르고(한 바퀴에 n개) 내가 내는 칩은 1개뿐이다.
// 인원이 많을수록 같은 칩을 모으는 데 내 부담이 작아서 더 오래 버티고(문턱↑), 적을수록 일찍 먹는다.
const swingN = n => POT_SWING * Math.pow(4 / n, SWING_N);
const chipValue = (s, skill) => 1 + CHIP_EARLY * (s.deck.length / 23) * (0.4 + 0.06 * skill);

// 상대 q가 이 카드를 받을지 대략 예측 (봇은 칩 개수를 센다). 막으러 오는 것까지 감안해 문턱을 높게 잡는다.
function wouldTake(s, q, card, potAt, chipsLeft, ownerMarginal) {
  if (chipsLeft <= 0) return true;                                     // 칩이 없으면 강제로 받는다
  const net = marginal(s.cards[q], card) - potAt * chipValue(s, 6);
  const deny = ownerMarginal <= 0 ? Math.min(4, potAt * 0.35) : 0;      // 내가 공짜로 키우는 게 보이면 막으러 올 수 있다
  return net <= BASE + potAt * swingN(s.n) * 0.88 + (chipsLeft <= 2 ? 4 : 0) + deny;
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

// 뒤 사람들이 이 카드를 먹을 확률(부드러운 예측). 반환: 내게 다시 돌아올 확률(아무도 안 먹음)
function backChance(s, me, card, allyIds) {
  let back = 1;
  for (let k = 1; k < s.n; k++) {
    const q = (me + k) % s.n, potAt = s.pot + k, chipsLeft = s.chips[q];
    if (allyIds.has(q)) continue;                                      // 동료가 가져가는 건 뺏기는 게 아니다
    if (chipsLeft <= 0) return 0;
    const netq = marginal(s.cards[q], card) - potAt * chipValue(s, 6);
    const margin = BASE + potAt * swingN(s.n) * 0.88 + (chipsLeft <= 2 ? 4 : 0) - netq;
    back *= 1 - 1 / (1 + Math.exp(-margin / 1.5));
  }
  return back;
}
// 판세: 나와 '나를 뺀 1등'의 점수 차 (양수 = 내가 뒤처짐). 봇은 칩 개수를 센다.
function standingGap(s, me) {
  let best = Infinity; for (let i = 0; i < s.n; i++) if (i !== me) best = Math.min(best, finalScore(s, i));
  return finalScore(s, me) - best;
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
    id: 'nothanks', name: '노땡스!', version: '1.9.0',
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
    const late = 1 - s.deck.length / 23;                              // 0 = 시작, 1 = 마지막 카드
    let leader = -1, ls = Infinity;
    for (let q = 0; q < s.n; q++) { if (q === me || allyIds.has(q)) continue; const v = finalScore(s, q); if (v < ls) { ls = v; leader = q; } }
    if (!(ls < finalScore(s, me))) leader = -1;                       // 내가 1등이면 견제할 선두 없음
    let harm = 0, w = 0;
    for (let q = 0; q < s.n; q++) {
      if (q === me || allyIds.has(q)) continue;
      const wt = q === tg ? 2.5 : q === leader ? 1 + late : 1;
      harm += clip(marginal(s.cards[q], card) - pot, 0, 10) * wt; w += wt;
    }
    harm = w ? harm / w : 0;

    // 뒤 사람 읽기: 내 뒤 사람들이 이 카드를 먹을 것 같으면(돌아올 확률 낮음) 지금 먹고, 아무도 안 먹을 것 같으면 한 바퀴 돌려 칩을 더 얹는다.
    //   돌아올 땐 판 위에 칩이 (인원수−1)개 더 쌓여 있다. 실력이 높을수록 잘 읽는다.
    const back = backChance(s, me, card, allyIds), read = 0.4 + t.skill * 0.06;
    const look = mine > 0 && s.chips[me] > WAIT_RESERVE
      ? read * ((1 - back) * LOOK_SNATCH - back * LOOK_RETURN * (s.n - 1) * chipValue(s, t.skill) * 0.5) : 0;

    // 판세: 앞서면 무난한 카드를 빨리 정리해 판을 굳히고, 크게 뒤처지면 칩을 더 모으며 버틴다(도박). 후반일수록 강하다.
    const gap = standingGap(s, me);
    const stand = gap < 0 ? LEAD_W * clip(-gap / 8, 0, 1) * late
      : -TRAIL_W * clip((gap - STAND_GAP) / 10, 0, 1) * late * (0.6 + t.risk * 0.08);

    // 칩 압박: 칩이 바닥나면 다음 카드는 뭐가 와도 강제로 받는다. 남은 칩이 적을수록 "지금 이 정도면 먹자"로 기운다.
    const pressure = (PRESSURE[s.chips[me]] || 0) * (1 - t.risk * RISK_W * 0.5) * (0.6 + t.skill * 0.04) * Math.min(1, s.deck.length / 8)
      * Math.min(1, Math.max(0, (PRESSURE_CUT - net) / 4));            // 이 카드가 너무 아프면 마지막 칩이라도 넘기는 게 낫다(돌아올 땐 판 위 칩이 더 쌓여 있다)
    const A = BASE + (5 - t.patience) * PAT_W + pressure - t.aggression * AGG_W * harm
      + pot * swingN(s.n) * (0.7 + t.skill * 0.03)                      // 작은 카드도 칩 0개면 일단 넘겨 본다. 칩이 쌓일수록 받을 만해짐
      + look + stand;

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
      for (let q = 0; q < s.n; q++) { if (q === me || allyIds.has(q)) continue; const qm = marginal(s.cards[q], card); if (qm <= 0) dv = Math.max(dv, (pot + Math.min(2, -qm)) * (q === leader ? 1 + late * 0.8 : 1)); }   // 막을 가치 ≈ 그 사람이 챙길 칩
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
    const cardEl = q('.nt-card');
    // 공통 이펙트(아카이브가 ctx.fx로 줌). 없으면 아무것도 안 하는 대역.
    const fx = ctx.fx ? ctx.fx.scope(q('.g-nt')) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : () => Promise.resolve()) });
    const plateOf = i => seatsBox.children[i];

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

    // 연출: 노땡스 = 내 자리에서 칩 하나가 판으로 '짤깍', 받기 = 칩 쌓인 카드가 그 자리로 '촤르륵 탁!'
    function animate(seat, move, { cardR, potR, plateR, pot, net, reason }) {
      if (!fx.on) { if (move === 'take') { fx.sfx(pot ? 'chips' : 'card'); later(() => fx.sfx('deal'), 260); } else fx.sfx('chip'); return; }
      const plate = plateOf(seat);
      if (move === 'pass') {
        fx.fly({ from: plateR, to: potBox.querySelector('.nt-stack') || potBox, node: '<span class="nt-coin" style="width:22px;height:22px"></span>', dur: 380, arc: 0.35, spin: 200 })
          .then(() => { fx.sfx('chip'); fx.pop(potBox.querySelector('.nt-stack .nt-coin:last-child') || potBox, 1.6); fx.float(potBox, '+1', { size: 16, dy: -30 }); });
        fx.float(plate, '−1', { color: '#ff9b8a', size: 16 });
        return;
      }
      fx.sfx('card');
      const ghostCard = cardEl.cloneNode(true);
      ghostCard.querySelector('b').textContent = ghostCard.querySelector('.tl').textContent = ghostCard.querySelector('.br').textContent = String(lastCard);
      const tgt = plate.querySelector('.nt-cards') || plate;
      fx.fly({ from: cardR, to: tgt, node: ghostCard, dur: 460, arc: 0.18, spin: -14, scale: 0.32 }).then(() => {
        fx.sfx('slam'); fx.slam(plate); fx.buzz(14);
        if (reason === 'forced' || net >= 14) { fx.shake(plate); fx.sfx('bad'); }
        else if (net <= -3) { fx.burst(plate, { color: ['#ffd76a', '#fff3c4', '#9fe0a8'] }); fx.sfx('gain'); }
        fx.float(plate, `${lastCard}${pot ? `  +칩${pot}` : ''}`, { color: net <= 0 ? '#9fe0a8' : '#ffd76a', size: 18 });
      });
      if (pot) fx.flyMany(Math.min(pot, 10), { from: potR, to: plate.querySelector('.nt-st') || plate, node: '<span class="nt-coin" style="width:16px;height:16px"></span>', dur: 420, arc: 0.3 }, 40)
        .then(() => fx.sfx('chips'));
      if (!s.over) { cardEl.style.visibility = 'hidden'; later(() => { cardEl.style.visibility = ''; fx.flip(cardEl); fx.sfx('deal'); }, 300); }
    }
    let lastCard = null;

    function step(seat, move, reason) {
      const card = s.card, pot = s.pot, mineGain = marginal(s.cards[seat], card), net = mineGain - pot;
      const leaderBefore = leaderSeat();
      const before = { cardR: fx.rect(cardEl), potR: fx.rect(potBox.querySelector('.nt-stack') || potBox), plateR: fx.rect(plateOf(seat) && (plateOf(seat).querySelector('.nt-top') || plateOf(seat))), pot, net, reason };
      lastCard = card;
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
      animate(seat, move, before);
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
      later(() => {
        const me = res.ranking.find(r => ctx.players[r.seat].human);
        res.ranking.filter(r => r.score === best).forEach(r => { const pl = plateOf(r.seat); fx.burst(pl, { n: 18, color: ['#ffd76a', '#fff', '#f0a35a'], spread: 90 }); fx.glow(pl); });
        fx.sfx(me && me.score === best ? 'win' : 'lose');
      }, 700);
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

    bTake.onclick = () => { if (!s.over && ctx.players[s.turn].human) fx.buzz(8), step(s.turn, 'take', s.chips[s.turn] <= 0 ? 'forced' : 'human'); };
    bPass.onclick = () => { if (!s.over && ctx.players[s.turn].human && s.chips[s.turn] > 0) fx.buzz(8), step(s.turn, 'pass', 'human'); };

    log(`새 게임! 카드 24장, 칩 ${startChips(s.n)}개씩. ${nameOf(s.turn)} 선공`);
    draw();
    later(() => { fx.flip(cardEl); fx.sfx('deal'); [...seatsBox.children].forEach((pl, i) => later(() => { fx.slam(pl); fx.sfx('tap'); }, 90 * i)); }, 60);
    ctx.players.forEach((p, i) => { if (!p.human) later(() => say(i, 'start'), ctx.delay(300 + i * 450)); });
    loop(true);
    return { destroy() { dead = true; timers.forEach(clearTimeout); timers.clear(); container.querySelectorAll('.fx-layer').forEach(e => e.remove()); } };
  }
};

// 이 게임 화면에서만 쓰는 스타일 (.g-nt 안으로 가둠: 앨범/다른 게임에 영향 없음)
const CSS = `
/* NO THANKS! · mobile table redesign */
.g-nt{--nt-ink:#f4eddc;--nt-muted:#b8c5b2;--nt-gold:#e4bd68;--nt-line:#ffffff20;position:relative;isolation:isolate;overflow:hidden;padding:14px 12px 18px;border-radius:22px;color:var(--nt-ink);background:radial-gradient(ellipse at 50% 32%,#27543e 0%,#173d2e 48%,#102b22 100%);border:1px solid #b68b4a;box-shadow:inset 0 0 0 3px #241b13,inset 0 0 0 5px #8b6638,inset 0 0 55px #06160f,0 14px 32px #0008;font-family:var(--fk,system-ui,sans-serif)}
.g-nt:before{content:"";position:absolute;inset:9px;border:1px solid #d8b56b55;border-radius:15px;pointer-events:none;z-index:-1}
.g-nt *{box-sizing:border-box}
.g-nt .nt-bar{display:flex;justify-content:space-between;align-items:center;gap:8px;margin:1px 2px 12px;padding:0 2px 10px;border-bottom:1px solid #ffffff22;color:#e8d6ad;font-family:var(--fd,Georgia,serif);font-size:12px;letter-spacing:.08em}
.g-nt .nt-deck:before{content:"◈";color:var(--nt-gold);margin-right:7px;font-size:14px}
.g-nt .nt-chips{padding:5px 9px;border:1px solid #d5b46c66;border-radius:999px;background:#0002;color:#f2d99f}
.g-nt .nt-seats{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;padding:0 1px}
.g-nt .nt-seat{position:relative;min-width:0;min-height:82px;padding:9px 8px 8px;border:1px solid var(--nt-line);border-radius:13px;background:linear-gradient(145deg,#ffffff0d,#00000025);box-shadow:inset 0 1px #ffffff0c;transition:border-color .2s,background .2s,box-shadow .2s}
.g-nt .nt-seat.me{border-color:#d9b96a88;background:linear-gradient(145deg,#d9b96a18,#00000020)}
.g-nt .nt-seat.turn{border-color:var(--nt-gold);background:linear-gradient(145deg,#d6ad5428,#00000020);box-shadow:0 0 0 1px #e6c47766,0 0 18px #e4bd6826,inset 0 1px #fff2}
.g-nt .nt-seat.turn:after{content:"YOUR TURN";position:absolute;right:7px;top:6px;font:700 8px var(--fd,Georgia,serif);letter-spacing:.1em;color:#f1d38d}
.g-nt .nt-top{display:flex;gap:8px;align-items:center;min-width:0}
.g-nt .nt-top .av{width:34px!important;height:34px!important;flex:none;border-radius:50%;border:1px solid #d9c18a88;box-shadow:0 2px 6px #0005;font-size:14px!important}
.g-nt .nt-info{min-width:0;flex:1}
.g-nt .nt-nm{font-size:12px;font-weight:800;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:#f6f0e2}
.g-nt .nt-st{margin-top:4px;font:12px var(--fd,Georgia,serif);color:#e5d2a5;white-space:nowrap}
.g-nt .nt-st .nt-coin{width:10px;height:10px;margin-right:4px}
.g-nt .nt-cards{display:flex;flex-wrap:wrap;gap:3px;margin-top:8px;min-height:20px}
.g-nt .nt-c{min-width:21px;padding:2px 4px;border-radius:4px;text-align:center;background:linear-gradient(160deg,#fff9e9,#dfd2b2);color:#332719;font:700 12px var(--fd,Georgia,serif);box-shadow:0 1px 2px #0006}
.g-nt .nt-c.dim{background:#637064;color:#c0c9b9;text-decoration:line-through;opacity:.8;box-shadow:none}
.g-nt .nt-say{position:absolute;left:7px;right:7px;bottom:calc(100% - 2px);z-index:6;padding:8px 10px;border:1px solid #c9a65f;border-radius:10px;background:#f7eed8;color:#302719;font-size:12px;line-height:1.4;box-shadow:0 5px 16px #0009;cursor:pointer}
.g-nt .nt-say:after{content:"";position:absolute;left:18px;bottom:-6px;border:6px solid transparent;border-top-color:#f7eed8;border-bottom:0}
.g-nt .nt-say.pop{animation:ntpop .18s ease-out}
@keyframes ntpop{from{transform:translateY(5px) scale(.96);opacity:0}to{transform:none;opacity:1}}
.g-nt .nt-table{position:relative;margin:14px 0 10px;padding:17px 10px 14px;text-align:center;border:1px solid #d5b46b55;border-radius:17px;background:radial-gradient(ellipse at 50% 38%,#ffffff0b,transparent 65%),#071d16a8;box-shadow:inset 0 0 24px #0006,0 5px 14px #0003}
.g-nt .nt-table:before{content:"THE COMMON POT";display:block;margin:0 0 12px;color:#bda979;font:10px var(--fd,Georgia,serif);letter-spacing:.24em}
.g-nt .nt-card{position:relative;display:inline-block;width:116px;height:154px;border-radius:13px;background:linear-gradient(145deg,#fff9e9 0%,#eee2c5 55%,#d7c49a 100%);color:#2b2117;box-shadow:0 0 0 1px #fff8,0 0 0 4px #9c783d,0 0 0 6px #2b2117,0 12px 22px #0009;transform:rotate(-2deg)}
.g-nt .nt-card:after{content:"";position:absolute;inset:8px;border:1px solid #a88a54;border-radius:7px;pointer-events:none}
.g-nt .nt-card b{display:block;font:700 72px/154px var(--fd,Georgia,serif);text-shadow:0 1px #fff8}
.g-nt .nt-card i{position:absolute;z-index:1;font:700 15px var(--fd,Georgia,serif);font-style:normal}
.g-nt .nt-card .tl{left:13px;top:10px}.g-nt .nt-card .br{right:13px;bottom:10px;transform:rotate(180deg)}
.g-nt .nt-pot{margin-top:16px;color:#f2d58f;font-size:14px;font-weight:800;letter-spacing:.02em}
.g-nt .nt-stack{display:flex;justify-content:center;flex-wrap:wrap;gap:3px;margin:0 auto 7px;min-height:17px}
.g-nt .nt-coin{display:inline-block;width:14px;height:14px;border-radius:50%;vertical-align:-2px;margin-right:4px;border:1.5px solid #805817;background:radial-gradient(circle at 32% 27%,#fff0bd 0 9%,#edc45e 32%,#bd8628 72%,#795017 100%);box-shadow:0 1px 2px #0007}
.g-nt .nt-stack .nt-coin{margin:0}
.g-nt .nt-msg{margin-top:11px;min-height:20px;color:#f4e4bd;font-size:13px;font-weight:700}
.g-nt .nt-hint{margin:8px auto 0;max-width:420px;min-height:20px;padding:9px 10px;border-radius:9px;background:#ffffff0a;border:1px solid #ffffff16;color:#d7d8c6;font-size:12px;line-height:1.65}
.g-nt .nt-hint b{color:#ffdc8d}
.g-nt .nt-acts{display:flex;gap:9px;margin-top:11px}
.g-nt .nt-btn{flex:1;min-width:0;min-height:54px;padding:10px 7px;border:1px solid #ffffff35;border-radius:12px;cursor:pointer;color:#fff;font-size:14px;font-weight:900;box-shadow:0 4px 0 #0005,0 7px 14px #0004;transition:transform .12s,filter .12s}
.g-nt .nt-btn.take{background:linear-gradient(160deg,#c95a45,#8f3028);border-color:#e9a18b}
.g-nt .nt-btn.pass{background:linear-gradient(160deg,#568b75,#285b49);border-color:#8eb59a}
.g-nt .nt-btn:active:not(:disabled){transform:translateY(3px);box-shadow:0 1px 0 #0006}
.g-nt .nt-btn:disabled{opacity:.35;cursor:default;filter:grayscale(.7)}
.g-nt .nt-result{margin-top:13px;font-size:13px}
.g-nt .nt-result>b{display:block;margin:0 0 8px;color:#f2d58f;font-size:14px}
.g-nt .nt-result .nt-row{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:9px 11px;border:1px solid #ffffff1c;border-radius:9px;background:#0003;margin-top:5px}
.g-nt .nt-result .nt-row.first{background:linear-gradient(100deg,#8b682b,#59431e);border-color:#e5c477;color:#ffe7a8;font-weight:800}
.g-nt .nt-log{margin-top:13px;padding:10px 11px;border:1px solid #ffffff18;border-radius:11px;background:#061a14a8;color:#c4cbbd;font-size:11px;line-height:1.55;max-height:112px;overflow:auto}
.g-nt .nt-log:before{content:"GAME LOG";display:block;margin-bottom:6px;color:#b99b60;font:10px var(--fd,Georgia,serif);letter-spacing:.2em}
.g-nt .nt-log div{padding:2px 0;border-bottom:1px solid #ffffff0b}
.g-nt .nt-log .sp{color:#f0d18c;font-style:italic}
.g-nt .nt-rules{margin-top:11px;padding:10px 12px;border:1px solid #ffffff20;border-radius:11px;background:#061a1480;color:#d8d5c5;font-size:12px;line-height:1.65}
.g-nt .nt-rules summary{cursor:pointer;color:#e7d2a0;font-weight:800;list-style:none}
.g-nt .nt-rules summary:after{content:"＋";float:right;color:#d9b96a}
.g-nt .nt-rules[open] summary:after{content:"−"}
.g-nt .nt-rules ul{padding-left:18px;margin:9px 0 2px}.g-nt .nt-rules li{margin:4px 0}
@media(max-width:380px){.g-nt{padding:12px 9px 14px;border-radius:18px}.g-nt .nt-seats{gap:7px}.g-nt .nt-seat{padding:8px 6px;min-height:77px}.g-nt .nt-top{gap:6px}.g-nt .nt-top .av{width:30px!important;height:30px!important}.g-nt .nt-nm{font-size:11px}.g-nt .nt-st{font-size:11px}.g-nt .nt-card{width:104px;height:142px}.g-nt .nt-card b{font-size:64px;line-height:142px}.g-nt .nt-btn{font-size:13px;min-height:50px}}
`;
