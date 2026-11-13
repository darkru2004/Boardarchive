// 러브레터 (2019판) — 손에 1장, 차례마다 1장 뽑아 2장 중 1장을 내고 효과를 쓴다. 끝까지 살아남거나 가장 높은 카드로 공주의 호감을 얻는다.
// 규칙: 21장(스파이0×2 병사1×6 사제2×2 남작3×2 시녀4×2 왕자5×2 대신6×2 왕7 백작부인8 공주9). 라운드마다 1장 뒷면 제외(2인은 3장 앞면 추가 제외).
//       덱이 비거나(차례 끝 확인) 1명만 남으면 라운드 끝. 덱이 비면 가장 높은 카드가 승리(동점이면 모두 승리). 승자 +1 호감 토큰.
//       스파이를 낸(버린) 생존자가 혼자면 +1 토큰. 목표 토큰: 2인 6 · 3인 5 · 4인 4 · 5~6인 3. 다음 라운드 선 = 직전 승자(동점이면 그중 무작위).
// 규격: 무작위는 전달받은 rng만 / 상태는 JSON / applyMove는 상태를 직접 수정 / 봇은 합법 수 안에서만, 그리고 "공개 정보 + 자기가 아는 것"만 쓴다(남의 손패를 훔쳐보지 않음).
// 공개되는 '버릇(텔)': 실물 게임처럼 "방금 뽑은 카드를 냈는지 / 손에 들고 있던 카드를 냈는지"는 모두가 본다 → 한 카드를 오래 쥐고 있으면 의심받는다.

// ---------- 카드 ----------
export const CARD = [
  { v: 0, name: '스파이', n: 2, tx: '효과 없음. 라운드 끝에 스파이를 낸 생존자가 나 혼자면 호감 +1' },
  { v: 1, name: '병사', n: 6, tx: '상대 1명의 카드를 추측(병사 제외). 맞히면 그 사람 탈락' },
  { v: 2, name: '사제', n: 2, tx: '상대 1명의 카드를 몰래 본다' },
  { v: 3, name: '남작', n: 2, tx: '상대 1명과 몰래 비교. 낮은 쪽 탈락(같으면 무사)' },
  { v: 4, name: '시녀', n: 2, tx: '내 다음 차례까지 다른 사람의 효과를 받지 않는다' },
  { v: 5, name: '왕자', n: 2, tx: '한 명(나 포함)의 카드를 효과 없이 버리고 새로 뽑게 한다' },
  { v: 6, name: '대신', n: 2, tx: '2장 뽑아 1장만 남기고, 2장은 원하는 순서로 덱 맨 아래로' },
  { v: 7, name: '왕', n: 1, tx: '상대 1명과 손패를 바꾼다' },
  { v: 8, name: '백작부인', n: 1, tx: '왕이나 왕자와 함께 들고 있으면 반드시 이 카드를 낸다' },
  { v: 9, name: '공주', n: 1, tx: '내거나 버리면 그 즉시 탈락' }
];
const TOTAL = CARD.map(c => c.n);
const NAME = v => CARD[v].name;
const GOAL = n => (n <= 2 ? 6 : n === 3 ? 5 : n === 4 ? 4 : 3);
const TARGETED = new Set([1, 2, 3, 7]);       // 다른 사람을 지목하는 카드 (왕자는 따로)
const GUESSES = [0, 2, 3, 4, 5, 6, 7, 8, 9];
const mv = (i, t, g) => ({ i, t, g });         // 키 순서 고정(합법 수 비교가 JSON 문자열이라)
const cm = (keep, low) => ({ keep, low });
const clip = (v, a, b) => Math.min(b, Math.max(a, v));

// ---------- 라운드 준비 ----------
function newRound(s, rng, first) {
  const deck = [];
  CARD.forEach(c => { for (let k = 0; k < c.n; k++) deck.push(c.v); });
  s.deck = rng.shuffle(deck);
  s.aside = s.deck.pop();
  s.faceUp = s.n === 2 ? [s.deck.pop(), s.deck.pop(), s.deck.pop()] : [];
  s.hand = Array.from({ length: s.n }, () => [s.deck.pop()]);
  s.out = Array(s.n).fill(false); s.prot = Array(s.n).fill(false); s.spy = Array(s.n).fill(false);
  s.disc = Array.from({ length: s.n }, () => []);
  s.know = Array.from({ length: s.n }, () => Array(s.n).fill(-1));   // know[보는 사람][대상] = 대상이 들고 있다고 확실히 아는 카드
  s.notHas = Array.from({ length: s.n }, () => []);                   // 병사 추측이 빗나가 '그 카드는 아님'이 공개된 값 (손패가 바뀌면 지움)
  s.hold = Array(s.n).fill(0);                                        // 공개 텔: 같은 카드를 몇 차례째 쥐고 있나
  s.countess = Array(s.n).fill(false);                                // 공개 텔: 직전에 백작부인을 냈고 그 뒤 손패가 그대로인가
  s.bottom = Array.from({ length: s.n }, () => []);                   // 대신으로 덱 아래에 넣은 카드 {v,pos} (본인만 앎)
  s.round++; s.phase = 'play'; s.turn = first; s.roundStarter = first;
  s.ev.push({ k: 'round', r: s.round, first });
  draw(s, first);
}
function draw(s, seat) {
  s.prot[seat] = false;
  s.hand[seat].push(s.deck.pop());
}
const alive = s => s.out.map((o, i) => (o ? -1 : i)).filter(i => i >= 0);
function nextSeat(s, from) { for (let k = 1; k <= s.n; k++) { const q = (from + k) % s.n; if (!s.out[q]) return q; } return from; }
function forget(s, seat) {     // 대상 손패가 완전히 바뀜 → 그 사람에 대한 지식·텔 초기화
  for (let x = 0; x < s.n; x++) s.know[x][seat] = -1;
  s.notHas[seat] = []; s.hold[seat] = 0; s.countess[seat] = false;
}
function evPush(s, e) { s.ev.push(e); if (s.ev.length > 40) s.ev.splice(0, s.ev.length - 40); }

function eliminate(s, seat, by) {
  if (s.out[seat]) return;
  const v = s.hand[seat].length ? s.hand[seat][0] : null;
  s.out[seat] = true; s.prot[seat] = false;
  if (v != null) { s.disc[seat].push({ v, how: 'out', fresh: false }); checkBluff(s, seat, v); }
  s.hand[seat] = [];
  evPush(s, { k: 'out', s: seat, v, by });
}
// 손패가 공개될 때: 백작부인을 내 놓고 왕/왕자가 아니었거나, 오래 쥔 카드가 낮은 카드였으면 "허세 들킴" (모두가 기억한다)
function checkBluff(s, seat, v) {
  if ((s.countess[seat] && v !== 5 && v !== 7) || (s.hold[seat] >= 3 && v <= 3)) { s.bluffSeen[seat]++; evPush(s, { k: 'bluff', s: seat, v }); }
}

function endTurn(s, rng) {
  const live = alive(s);
  if (live.length === 1) return endRound(s, rng, live, 'last');
  if (s.deck.length === 0) {
    let best = -1; for (const q of live) best = Math.max(best, s.hand[q][0]);
    for (const q of live) checkBluff(s, q, s.hand[q][0]);
    return endRound(s, rng, live.filter(q => s.hand[q][0] === best), 'show');
  }
  s.turn = nextSeat(s, s.turn); s.phase = 'play';
  draw(s, s.turn);
}

function endRound(s, rng, winners, why) {
  const live = alive(s);
  const spies = live.filter(q => s.spy[q]);
  const spy = spies.length === 1 ? spies[0] : -1;
  winners.forEach(q => s.tokens[q]++);
  if (spy >= 0) s.tokens[spy]++;
  s.lastRound = { r: s.round, winners, why, spy, hands: s.hand.map((h, i) => (s.out[i] ? null : h[0])), aside: s.aside, tokens: s.tokens.slice() };
  evPush(s, { k: 'roundEnd', ...s.lastRound });
  if (s.tokens.some(t => t >= s.goal)) { s.over = true; s.phase = 'over'; return; }
  newRound(s, rng, winners.length === 1 ? winners[0] : rng.pick(winners));
}

// ---------- 봇: 믿음(확률) — 공개 정보 + 내 지식만 ----------
function pool(s, me) {   // 내 입장에서 '어딘가(덱/제외 카드/남의 손)'에 있을 수 있는 카드 수
  const c = TOTAL.slice();
  const sub = v => { if (v != null && v >= 0) c[v] = Math.max(0, c[v] - 1); };
  s.disc.forEach(d => d.forEach(x => sub(x.v)));
  s.faceUp.forEach(sub); s.hand[me].forEach(sub);
  return c;
}
function unknownPool(s, me, mem) {   // 남의 '모르는' 손패에 있을 수 있는 카드 (내가 아는 남의 카드·덱 아래 넣은 카드 제외)
  const c = pool(s, me);
  for (let q = 0; q < s.n; q++) if (q !== me && !s.out[q] && mem[q] >= 0) c[mem[q]] = Math.max(0, c[mem[q]] - 1);
  for (const b of s.bottom[me]) if (b.pos < s.deck.length) c[b.v] = Math.max(0, c[b.v] - 1);
  return c;
}
function belief(s, me, q, t, mem, up) {
  if (mem[q] >= 0) { const d = Array(10).fill(0); d[mem[q]] = 1; return d; }
  const read = t.skill / 10;
  const d = up.slice();
  for (const v of s.notHas[q]) d[v] = 0;
  const h = Math.min(s.hold[q], 5);
  // 오래 쥔 카드 = 그동안 뽑은 카드들보다 좋았던 카드 → '그 값 이하일 확률'을 쥔 횟수만큼 곱한다 (실력이 높을수록 이 추론을 믿음)
  const tot = up.reduce((x, y) => x + y, 0) || 1;
  let cum = 0; const F = up.map(c => (cum += c) / tot);
  for (let v = 0; v < 10; v++) {
    if (h) d[v] *= (0.15 + F[v]) ** (h * read * 0.8);
    if (s.countess[q] && (v === 5 || v === 7)) d[v] *= 1 + read * 3 / (1 + s.bluffSeen[q] * 4);   // 백작부인을 냈다 → 왕/왕자? (허세 전적이 있으면 덜 믿음)
  }
  let sum = d.reduce((a, b) => a + b, 0);
  if (sum <= 0) { const u = up.slice(); sum = u.reduce((a, b) => a + b, 0) || 1; return u.map(x => x / sum); }
  return d.map(x => x / sum);
}

// 성향별 견제 대상
function targetSeat(s, me, t, info) {
  let q = -1;
  if (t.targetMode === 'human') q = s.humanSeat;
  else if (t.targetMode === 'random') q = s.targets[me];
  else if (t.targetMode === 'rival') q = (info.rivalSeats || []).find(x => !s.out[x]) ?? -1;
  else if (t.targetMode === 'leader') {
    let best = -1, bt = -1;
    for (let i = 0; i < s.n; i++) if (i !== me && s.tokens[i] > bt) { bt = s.tokens[i]; best = i; }
    q = bt >= s.tokens[me] ? best : -1;
  }
  return q >= 0 && q !== me && !s.out[q] ? q : -1;
}

// 봇의 판단 재료를 한 번에 계산
function mind(s, me, t, rng, info) {
  const live = alive(s), a = live.length, opps = live.filter(q => q !== me);
  const mem = s.know[me].slice();
  for (const q of opps) if (mem[q] >= 0 && rng.next() < (10 - t.skill) * 0.04) mem[q] = -1;   // 실력이 낮으면 본 카드를 깜빡함
  const up = unknownPool(s, me, mem);
  const B = {}; for (const q of opps) B[q] = belief(s, me, q, t, mem, up);
  const allies = new Set((info.allySeats || []).map(x => x.seat));
  const tg = targetSeat(s, me, t, info);
  const deckLeft = s.deck.length;
  const late = clip(1 - deckLeft / 14, 0, 1);
  const last = deckLeft === 0;      // 이번이 라운드 마지막 차례(내 뒤에 바로 비교)
  const elim = q => {
    let v = 6 * (1 / Math.max(1, a - 1) - 1 / a) + (a === 2 ? 1.2 : 0);   // 탈락 1명 = 내 라운드 승률 상승 + 나를 노릴 사람 감소
    v *= 1 + 0.35 * s.tokens[q] / s.goal;
    if (q === tg) v *= 1 + 0.12 * t.aggression;
    if (allies.has(q)) v *= 0.55;                      // 동료는 가볍게만 봐준다(트롤 금지)
    return v;
  };
  const showP = v => { let p = 1; for (const q of opps) { let lo = 0, eqp = 0; for (let x = 0; x < 10; x++) { if (x < v) lo += B[q][x]; else if (x === v) eqp += B[q][x]; } p *= lo + 0.6 * eqp; } return p; };
  const exposed = v => opps.some(q => s.know[q][me] >= 0 && s.know[q][me] === v);
  const OPT = [-0.25, 0.3, 0.1, 0.15, 0.2, 0.3, 0.15, 0.2, 0, 0];
  const guardsLeft = up[1] + 0.0;
  const keep = v => {
    if (last) return 3 * showP(v);
    let k = 3 * late * showP(v) + OPT[v] * (1 - late * 0.7);
    if (exposed(v) && v !== 1) k -= 0.35 + 0.15 * Math.min(3, guardsLeft);
    if (v === 9) k -= 0.04 * s.hold[me];           // 공주를 오래 쥐면 왕자의 표적
    return k;
  };
  return { live, a, opps, mem, up, B, allies, tg, late, last, elim, showP, keep, exposed };
}

function evalPlay(s, me, t, M, m) {
  const hand = s.hand[me], v = hand[m.i], k = hand[1 - m.i];
  const { a, opps, B, elim, keep, up } = M;
  const life = 3 / a + keep(k);
  let e = 0;
  switch (v) {
    case 0: {   // 스파이: 일찍 내 두는 게 이득. 다른 생존자가 이미 냈다면 내 스파이는 상대 보너스를 지운다(견제)
      const others = opps.filter(q => s.spy[q]).length;
      e = s.spy[me] ? 0 : others === 0 ? 3 * 0.4 * (1 - M.late * 0.5) * ((up[0] > 0) ? 0.75 : 1) : others === 1 ? 0.45 : 0;
      break;
    }
    case 1: if (m.t >= 0) e = B[m.t][m.g] * elim(m.t); break;
    case 2: if (m.t >= 0) { const mx = Math.max(...B[m.t]); e = (1 - mx) * (0.25 + (k === 1 ? 0.45 : k === 3 ? 0.25 : k === 5 ? 0.15 : 0)) * (1 - M.late * 0.6); if (m.t === M.tg) e *= 1.3; } break;
    case 3: if (m.t >= 0) {
      let win = 0, lose = 0; for (let x = 0; x < 10; x++) { if (x < k) win += B[m.t][x]; else if (x > k) lose += B[m.t][x]; }
      e = win * elim(m.t) - lose * life * (1.3 - t.risk * 0.06);
    } break;
    case 4: {
      const imp = k === 9 ? 1 : M.exposed(k) ? 0.9 : k >= 7 ? 0.6 : k >= 5 ? 0.35 : 0.15;
      e = 0.12 * (a - 1) * imp * life * (1 - M.late * 0.3);
    } break;
    case 5: if (m.t === me) {
      if (k === 9) { e = -50; break; }
      const pl = up.slice(); const tot = pl.reduce((x, y) => x + y, 0) || 1;
      let ex = 0; for (let x = 0; x < 10; x++) ex += pl[x] / tot * (x === 9 ? keep(9) : keep(x));
      e = ex - keep(k) + (k === 0 && !s.spy[me] ? 0.6 : 0) - 0.05;
    } else if (m.t >= 0) {
      const pP = B[m.t][9];
      e = pP * elim(m.t) + 0.05 + (M.late > 0.5 ? 0.25 * B[m.t].reduce((acc, p, x) => acc + p * x / 9, 0) : 0) - B[m.t][0] * 0.5;
    } break;
    case 6: e = s.deck.length ? 0.12 + (k <= 3 ? 0.15 : 0) : 0; break;
    case 7: if (m.t >= 0) {
      let ex = 0; for (let x = 0; x < 10; x++) ex += B[m.t][x] * keep(x);
      e = ex - keep(k) - 0.12;
    } break;
    case 8: e = (k !== 5 && k !== 7) ? t.bluff * 0.08 * (1 - M.late) ** 2 : 0; break;   // 허세: 백작부인을 내면 "왕/왕자를 쥐었다"고 믿게 만든다
    case 9: e = -100; break;
  }
  // 버릇 위장: 허세가 높으면 낮은 카드를 쥐고 '오래 쥔 척'(뽑은 카드를 바로 냄)도 한다
  if (m.i === 1 && k <= 3 && !M.last) e += t.bluff * 0.006 * Math.min(3, s.hold[me] + 1);
  return e + keep(k);
}

function chooseChancellor(s, me, t, rng, M, moves) {
  let best = moves[0], bs = -Infinity;
  for (const m of moves) {
    const hv = s.hand[me];
    const v = hv[m.keep];
    // 맨 아래(low)에는 상대가 받으면 곤란한 높은 카드를 넣어 늦게 나오게 한다
    const rest = hv.map((x, j) => j).filter(j => j !== m.keep);
    let order = 0;
    if (rest.length === 2) { const other = rest.find(j => j !== m.low); order = (hv[m.low] - hv[other]) * 0.01; }
    const sc = M.keep(v) + order + (10 - t.skill) * 0.04 * (rng.next() + rng.next() - 1);
    if (sc > bs) { bs = sc; best = m; }
  }
  return { move: best, reason: 'chancellor' };
}

function reasonOf(s, me, m, M) {
  const v = s.hand[me][m.i], k = s.hand[me][1 - m.i];
  if (v === 8 && k !== 5 && k !== 7) return 'bluff';
  if (v === 8) return 'forced';
  if (m.t >= 0 && m.t !== me && M.mem[m.t] >= 0) return 'known';
  if (m.t >= 0 && m.t === M.tg) return 'block';
  if ((v === 1 || v === 5) && m.t >= 0 && m.t !== me && (s.hold[m.t] >= 2 || s.countess[m.t])) return 'read';
  return 'normal';
}

// ---------- 모듈 ----------
export default {
  meta: { id: 'loveletter', name: '러브레터', version: '1.0.0', players: { min: 2, max: 6 }, minutes: 15, campaign: null },

  newGame({ players, rng }) {
    const n = players.length;
    const s = {
      n, humanSeat: players.findIndex(p => p.human), goal: GOAL(n),
      tokens: Array(n).fill(0), bluffSeen: Array(n).fill(0), round: 0, over: false, ev: [], lastRound: null,
      targets: players.map((_, i) => { let x = rng.int(n - 1); if (x >= i) x++; return x; })
    };
    newRound(s, rng, rng.int(n));
    s.ev = [];
    return s;
  },

  currentSeat: s => s.turn,
  isOver: s => s.over,

  legalMoves(s) {
    if (s.over) return [];
    const me = s.turn, h = s.hand[me];
    if (s.phase === 'chancellor') {
      const out = [];
      for (let keep = 0; keep < h.length; keep++) {
        const rest = h.map((_, j) => j).filter(j => j !== keep);
        for (const low of rest) out.push(cm(keep, low));
      }
      return out;
    }
    const forced = h.includes(8) && (h.includes(7) || h.includes(5));
    const others = alive(s).filter(q => q !== me && !s.prot[q]);
    const out = [];
    h.forEach((v, i) => {
      if (forced && v !== 8) return;
      if (TARGETED.has(v)) {
        if (!others.length) out.push(mv(i, -1, -1));
        else for (const q of others) { if (v === 1) for (const g of GUESSES) out.push(mv(i, q, g)); else out.push(mv(i, q, -1)); }
      } else if (v === 5) { for (const q of [...others, me]) out.push(mv(i, q, -1)); }
      else out.push(mv(i, -1, -1));
    });
    return out;
  },

  applyMove(s, m, rng) {
    if (s.over) throw new Error('이미 끝난 게임');
    if (!this.legalMoves(s).some(x => JSON.stringify(x) === JSON.stringify(m))) throw new Error('불법 수: ' + JSON.stringify(m));
    const me = s.turn;

    if (s.phase === 'chancellor') {
      const h = s.hand[me];
      const keepV = h[m.keep];
      const rest = h.map((_, j) => j).filter(j => j !== m.keep);
      const lowV = h[m.low], upper = rest.filter(j => j !== m.low).map(j => h[j]);
      const back = [lowV, ...upper];                       // back[0]이 맨 아래
      for (let x = 0; x < s.n; x++) s.bottom[x].forEach(b => { b.pos += back.length; });
      s.deck.unshift(...back);
      back.forEach((v, pos) => s.bottom[me].push({ v, pos }));
      s.hand[me] = [keepV];
      forget(s, me);
      s.phase = 'play';
      evPush(s, { k: 'chanDone', s: me, n: back.length });
      endTurn(s, rng);
      return s;
    }

    const h = s.hand[me];
    const v = h[m.i], fresh = m.i === h.length - 1;
    h.splice(m.i, 1);
    s.disc[me].push({ v, how: 'play', fresh });
    if (v === 0) s.spy[me] = true;
    // 공개 텔 갱신: 뽑은 카드를 냈다 = 손에 있던 카드를 계속 쥔다
    if (fresh) s.hold[me]++; else { s.hold[me] = 0; for (let x = 0; x < s.n; x++) s.know[x][me] = -1; s.notHas[me] = []; }
    s.countess[me] = v === 8;
    const e = { k: 'play', s: me, v, fresh, t: m.t, g: m.g };

    switch (v) {
      case 1: if (m.t >= 0) {
        const hit = s.hand[m.t][0] === m.g;
        e.hit = hit;
        evPush(s, e);
        if (hit) eliminate(s, m.t, me); else if (!s.notHas[m.t].includes(m.g)) s.notHas[m.t].push(m.g);
      } else evPush(s, e); break;
      case 2: if (m.t >= 0) { e.seen = s.hand[m.t][0]; s.know[me][m.t] = e.seen; } evPush(s, e); break;
      case 3: if (m.t >= 0) {
        const a = s.hand[me][0], b = s.hand[m.t][0];
        e.mine = a; e.theirs = b;
        s.know[me][m.t] = b; s.know[m.t][me] = a;
        e.loser = a < b ? me : b < a ? m.t : -1;
        evPush(s, e);
        if (e.loser >= 0) eliminate(s, e.loser, me);
      } else evPush(s, e); break;
      case 4: s.prot[me] = true; evPush(s, e); break;
      case 5: {
        const q = m.t, old = s.hand[q][0];
        e.dropped = old;
        evPush(s, e);
        s.hand[q] = [];
        s.disc[q].push({ v: old, how: 'prince', fresh: false });
        if (old === 0) s.spy[q] = true;
        checkBluff(s, q, old);
        forget(s, q);
        if (old === 9) { s.out[q] = true; s.prot[q] = false; evPush(s, { k: 'out', s: q, v: null, by: me, princess: true }); }
        else {
          if (s.deck.length) s.hand[q] = [s.deck.pop()];
          else { s.hand[q] = [s.aside]; s.aside = null; e.usedAside = true; }
        }
      } break;
      case 6:
        evPush(s, e);
        if (s.deck.length) {
          const k = Math.min(2, s.deck.length);
          for (let j = 0; j < k; j++) s.hand[me].push(s.deck.pop());
          s.phase = 'chancellor';
          evPush(s, { k: 'chan', s: me, n: k });
          return s;                                             // 같은 사람이 이어서 고른다
        } break;
      case 7: if (m.t >= 0) {
        const q = m.t;
        const ka = s.know.map(r => r[me]), kb = s.know.map(r => r[q]);
        [s.hand[me], s.hand[q]] = [s.hand[q], s.hand[me]];
        for (let x = 0; x < s.n; x++) { s.know[x][me] = kb[x]; s.know[x][q] = ka[x]; }
        s.know[me][q] = s.hand[q][0]; s.know[q][me] = s.hand[me][0];
        [s.notHas[me], s.notHas[q]] = [s.notHas[q], s.notHas[me]];
        s.hold[me] = 0; s.hold[q] = 0; s.countess[q] = false; s.countess[me] = false;
        evPush(s, e);
      } else evPush(s, e); break;
      case 9: evPush(s, e); eliminate(s, me, me); break;
      default: evPush(s, e);
    }
    endTurn(s, rng);
    return s;
  },

  botChoose(s, t, rng, info = {}) {
    const me = s.turn, moves = this.legalMoves(s);
    const M = mind(s, me, t, rng, info);
    if (s.phase === 'chancellor') return chooseChancellor(s, me, t, rng, M, moves);
    if (moves.length === 1) return { move: moves[0], reason: s.hand[me].includes(8) && s.hand[me][moves[0].i] === 8 && (s.hand[me].includes(5) || s.hand[me].includes(7)) ? 'forced' : 'only' };
    const noiseW = (10 - t.skill) * 0.04;
    const scored = moves.map(m => ({ m, sc: evalPlay(s, me, t, M, m) }));
    // 같은 카드 내기(대상·추측만 다른 수)끼리는 소음을 공유하고, 카드 선택에만 실력 소음을 준다
    const cardNoise = [0, 0].map(() => noiseW * (rng.next() + rng.next() + rng.next() - 1.5));
    let best = null, bs = -Infinity;
    for (const x of scored) { const sc = x.sc + cardNoise[x.m.i] + rng.next() * 0.01; if (sc > bs) { bs = sc; best = x.m; } }
    return { move: best, reason: reasonOf(s, me, best, M) };
  },

  result(s) {
    const order = s.tokens.map((tk, seat) => ({ seat, score: tk })).sort((a, b) => b.score - a.score || a.seat - b.seat);
    let rank = 0, prev = null;
    const ranking = order.map((o, i) => { if (o.score !== prev) { rank = i + 1; prev = o.score; } return { seat: o.seat, rank, score: o.score }; });
    return { ranking, summary: `호감 ${order[0].score}개 · ${s.round}라운드` };
  },

  mount(container, ctx) { return mountLL(this, container, ctx); }
};

// 테스트·화면에서 쓰는 도우미
export const _internal = { CARD, GOAL, alive, belief, unknownPool, mind, evalPlay };


// ---------- 화면: "밀랍 봉인 편지" 테마 (스타일은 .g-ll 안에서만) ----------
const HUE = ['#4b5563', '#8b5a2b', '#5f8796', '#5b6b2f', '#a86f99', '#b8862b', '#3f6e7a', '#7a2e3a', '#8e3b6e', '#c2185b'];
const HEART = 'M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z';

function mountLL(self, container, ctx) {
  const rng = ctx.rng, th = ctx.theme || {};
  const s = self.newGame({ players: ctx.players, rng });
  const H = s.humanSeat;
  const timers = new Set(); let dead = false, finished = false, paused = false;
  const speech = {};
  let sel = null;           // 사람 선택 중: {i, t, g} 또는 대신 단계 {keep, low}
  let peek = null;          // 나만 보는 정보 쪽지
  const pendingLog = [];    // 결과창을 닫은 뒤에 찍을 줄 (다음 라운드 시작)

  container.innerHTML = `<style>${LL_CSS}</style>
    <div class="g-ll" style="--acc:${th.accent || '#d8a657'};--wine:${th.table || '#5a1e2c'};--wine2:${th.table2 || '#33101a'}">
      <div class="ll-bar"><span class="ll-rd"></span><span class="ll-goal"></span></div>
      <div class="ll-seats"></div>
      <div class="ll-mid"><div class="ll-pile"></div><div class="ll-banner"></div></div>
      <div class="ll-peek"></div>
      <div class="ll-me"></div>
      <div class="ll-hand"></div>
      <div class="ll-panel"></div>
      <div class="ll-over"></div>
      <details class="ll-count"><summary>카드 세기 (아직 안 보인 카드)</summary><div class="ll-ct"></div></details>
      <div class="ll-log"></div>
      <details class="ll-rules"><summary>규칙 보기</summary><ul>
        <li>손에 1장. 내 차례에 1장 뽑고, <b>2장 중 1장을 내서</b> 효과를 씁니다. 낸 카드는 모두에게 공개돼요.</li>
        <li><b>마지막까지 혼자 살아남거나</b>, 덱이 다 떨어졌을 때 <b>가장 높은 카드</b>를 쥔 사람이 호감 토큰 1개(동점이면 모두).</li>
        <li>스파이를 낸 생존자가 나 혼자면 라운드 끝에 토큰 +1. 목표 토큰(2인 6 · 3인 5 · 4인 4 · 5~6인 3)을 먼저 모으면 승리.</li>
        <li>백작부인은 왕·왕자와 함께 들고 있으면 반드시 내야 해요. 그냥 내도 됩니다 — <b>허세</b>로 쓸 수 있어요.</li>
        <li><b>버릇이 보입니다</b>: 실물처럼 "방금 뽑은 카드를 냈는지, 들고 있던 카드를 냈는지"는 모두가 봐요. 같은 카드를 오래 쥐면 의심받고, 봇들도 그걸 읽어요.</li>
        <li>봇은 남의 손패를 훔쳐보지 않습니다. 공개된 카드와 자기가 본 것(사제·남작·왕)만으로 판단해요.</li>
      </ul></details>
    </div>`;
  const q = x => container.querySelector(x);
  const seatsBox = q('.ll-seats'), pileBox = q('.ll-pile'), banner = q('.ll-banner'), meBox = q('.ll-me'), handBox = q('.ll-hand');
  const panel = q('.ll-panel'), overBox = q('.ll-over'), logBox = q('.ll-log'), ctBox = q('.ll-ct'), peekBox = q('.ll-peek');

  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
  const btn = (text, cls, fn) => { const b = el('button', 'll-btn ' + (cls || ''), text); b.onclick = fn; return b; };
  const nm = seat => (seat === H ? '나' : ctx.players[seat].name.split(' ').pop());
  const cn = v => `${NAME(v)}(${v})`;
  const svgHeart = on => { const ns = 'http://www.w3.org/2000/svg'; const sv = document.createElementNS(ns, 'svg'); sv.setAttribute('viewBox', '0 0 24 24'); sv.setAttribute('class', 'll-ht' + (on ? ' on' : '')); const pth = document.createElementNS(ns, 'path'); pth.setAttribute('d', HEART); sv.append(pth); return sv; };
  const hearts = seat => { const w = el('span', 'll-hearts'); for (let k = 0; k < s.goal; k++) w.append(svgHeart(k < s.tokens[seat])); return w; };
  const mini = (v, extra) => { const m = el('span', 'll-mini' + (extra || ''), String(v)); m.style.setProperty('--h', HUE[v]); m.title = NAME(v); return m; };
  function bigCard(v, cls) {
    const c = el('div', 'll-card ' + (cls || '')); c.style.setProperty('--h', HUE[v]);
    c.append(el('b', 'll-n', String(v)), el('div', 'll-nm', NAME(v)), el('div', 'll-tx', CARD[v].tx));
    return c;
  }
  function backCard(cls) { const c = el('div', 'll-back ' + (cls || '')); const seal = el('i', 'll-seal'); seal.append(svgHeart(true)); c.append(seal); return c; }

  function log(text, cls) {
    const d = el('div', cls || '', text); logBox.append(d);
    while (logBox.childNodes.length > 80) logBox.removeChild(logBox.firstChild);
    logBox.scrollTop = logBox.scrollHeight;
  }
  function say(seat, keys) {
    if (seat === H || seat < 0 || speech[seat]) return;
    let t = null; for (const k of [].concat(keys)) { t = ctx.say(seat, k); if (t) break; }
    if (!t) return;
    speech[seat] = { t, fresh: true };
    log(`「${nm(seat)}」 ${t}`, 'sp');
    later(() => { delete speech[seat]; draw(); }, ctx.readMs(t));
  }
  function showPeek(text) { peek = text; log(text, 'pk'); later(() => { if (peek === text) { peek = null; draw(); } }, ctx.delay(4200)); }
  const leader = () => { let b = -1, bt = 0; s.tokens.forEach((t, i) => { if (t > bt) { bt = t; b = i; } }); return b; };

  // 엔진 이벤트 → 로그·말풍선·나만 보는 쪽지
  function consume() {
    const evs = s.ev.splice(0);
    let roundEnd = null;
    for (const e of evs) {
      if (e.k === 'round') { const line = `— 라운드 ${e.r} · ${nm(e.first)} 먼저 —`; if (roundEnd) pendingLog.push(line); else log(line, 'rd'); }
      else if (e.k === 'play') {
        const tell = e.fresh ? '방금 뽑은 카드' : '들고 있던 카드';
        let t = `${nm(e.s)}: ${cn(e.v)} [${tell}]`;
        if (e.v === 1) t += e.t < 0 ? ' · 대상 없음' : ` → ${nm(e.t)} "${NAME(e.g)}?" ${e.hit ? '적중!' : '빗나감'}`;
        else if (e.v === 2) t += e.t < 0 ? ' · 대상 없음' : ` → ${nm(e.t)}의 카드를 몰래 봄${e.t === H ? ' (내 카드를 봤어요)' : ''}`;
        else if (e.v === 3) t += e.t < 0 ? ' · 대상 없음' : ` ⇄ ${nm(e.t)} 비교 → ${e.loser < 0 ? '같은 숫자, 무사' : nm(e.loser) + ' 패배'}`;
        else if (e.v === 4) t += ' · 다음 차례까지 보호';
        else if (e.v === 5) t += ` → ${nm(e.t)} 카드 버림: ${cn(e.dropped)}${e.usedAside ? ' (덱이 비어 제외 카드를 받음)' : ''}`;
        else if (e.v === 6) t += s.phase === 'chancellor' || e.t === -1 ? '' : '';
        else if (e.v === 7) t += e.t < 0 ? ' · 대상 없음' : ` ↔ ${nm(e.t)} 손패 교환`;
        else if (e.v === 9) t += ' · 공주를 내서 탈락!';
        log(t, e.s === H ? 'me' : '');
        banner.textContent = t;
        if (e.v === 2 && e.s === H && e.t >= 0) showPeek(`${nm(e.t)}의 카드: ${cn(e.seen)}`);
        if (e.v === 3 && e.t >= 0 && (e.s === H || e.t === H)) { const other = e.s === H ? e.t : e.s; showPeek(`남작 비교 — 나 ${cn(e.s === H ? e.mine : e.theirs)} vs ${nm(other)} ${cn(e.s === H ? e.theirs : e.mine)}`); }
        if (e.v === 7 && e.t >= 0 && (e.s === H || e.t === H)) showPeek(`교환으로 받은 카드: ${cn(s.hand[H][0] ?? '-')}`);
        if (e.v === 1 && e.hit && e.s !== H) say(e.s, s.out[e.t] && e.t === targetOf(e.s) ? ['block', 'hit', 'good'] : ['hit', 'good']);
      } else if (e.k === 'chan') log(`${nm(e.s)}: 대신 — ${e.n}장 뽑아서 고르는 중`);
      else if (e.k === 'chanDone') log(`${nm(e.s)}: ${e.n}장을 덱 맨 아래로`);
      else if (e.k === 'out') { log(e.princess ? `${nm(e.s)} 공주를 버려 탈락` : `${nm(e.s)} 탈락${e.v != null ? ` (쥐고 있던 카드: ${cn(e.v)})` : ''}`, 'out'); say(e.s, ['out', 'bad']); if (e.by !== e.s && e.by !== H && e.v !== 1) { /* 공격자 대사는 위에서 */ } }
      else if (e.k === 'bluff') { log(`${nm(e.s)}의 허세가 들통났어요 (${cn(e.v)})`, 'bl'); say(e.s, ['bluff']); }
      else if (e.k === 'roundEnd') roundEnd = e;
    }
    return roundEnd;
  }
  const targetOf = seat => { const p = ctx.players[seat]; return p.human ? -1 : targetSeat(s, seat, p.traits, { rivalSeats: p.rivalSeats }); };

  function seatPlate(i) {
    const p = ctx.players[i];
    const plate = el('div', 'll-seat' + (s.out[i] ? ' out' : '') + (!s.over && s.turn === i && !paused ? ' turn' : ''));
    const top = el('div', 'll-top');
    const info = el('div', 'll-info');
    info.append(el('div', 'll-nmx', nm(i)), hearts(i));
    top.append(ctx.avatar(i, 36), info);
    const tags = el('div', 'll-tags');
    if (s.out[i]) tags.append(el('span', 'll-tag x', '탈락'));
    if (s.prot[i]) tags.append(el('span', 'll-tag pr', '보호'));
    if (s.spy[i] && !s.out[i]) tags.append(el('span', 'll-tag sp', '스파이'));
    if (s.countess[i] && !s.out[i]) tags.append(el('span', 'll-tag ct', '백작부인 냄'));
    if (s.hold[i] >= 2 && !s.out[i]) tags.append(el('span', 'll-tag hd', `${s.hold[i]}차례째 같은 카드`));
    if (s.bluffSeen[i]) tags.append(el('span', 'll-tag bl', `허세 들킴 ${s.bluffSeen[i]}`));
    if (i !== H && s.know[H][i] >= 0 && !s.out[i]) tags.append(el('span', 'll-tag kn', `내 메모: ${cn(s.know[H][i])}`));
    if (i !== H && s.know[i][H] >= 0 && !s.out[H] && s.hand[H][0] === s.know[i][H]) tags.append(el('span', 'll-tag wk', '내 카드를 앎'));
    const ds = el('div', 'll-disc');
    s.disc[i].forEach(d => ds.append(mini(d.v, d.how === 'out' ? ' o' : d.how === 'prince' ? ' p' : '')));
    plate.append(top, tags, ds);
    const sp = speech[i];
    if (sp) { const b = el('div', 'll-say' + (sp.fresh ? ' pop' : ''), sp.t); sp.fresh = false; b.onclick = () => { delete speech[i]; draw(); }; plate.append(b); }
    return plate;
  }

  function counts() {
    const c = pool(s, H);
    ctBox.replaceChildren(...CARD.map(x => { const r = el('div', 'll-cr' + (c[x.v] ? '' : ' z')); r.append(mini(x.v), el('span', '', `${x.name}`), el('b', '', `${c[x.v]} / ${x.n}`)); return r; }));
  }

  function draw() {
    q('.ll-rd').textContent = s.over ? '게임 종료' : `라운드 ${s.round} · 덱 ${s.deck.length}장`;
    q('.ll-goal').textContent = `목표 호감 ${s.goal}`;
    seatsBox.replaceChildren(...ctx.players.map((_, i) => i).filter(i => i !== H).map(seatPlate));
    // 가운데: 덱 · 제외 카드 · (2인) 공개 제외 카드
    pileBox.replaceChildren();
    const dk = el('div', 'll-stack'); dk.append(backCard('sm'), el('span', '', `덱 ${s.deck.length}`)); pileBox.append(dk);
    const as = el('div', 'll-stack'); as.append(s.aside == null ? el('div', 'll-empty', '사용됨') : backCard('sm dim'), el('span', '', '제외 1장')); pileBox.append(as);
    if (s.faceUp.length) { const fu = el('div', 'll-fu'); s.faceUp.forEach(v => fu.append(mini(v))); fu.append(el('span', '', '공개 제외')); pileBox.append(fu); }
    peekBox.textContent = peek || ''; peekBox.style.display = peek ? 'block' : 'none';
    meBox.replaceChildren(seatPlate(H));
    meBox.firstChild.classList.add('mine');
    // 내 손패
    handBox.replaceChildren();
    const mine = !s.over && !paused && s.turn === H && !s.out[H];
    const h = s.hand[H] || [];
    const legal = mine ? self.legalMoves(s) : [];
    h.forEach((v, i) => {
      const c = bigCard(v);
      if (mine && s.phase === 'play') {
        const ok = legal.some(m => m.i === i);
        if (!ok) c.classList.add('no');
        if (sel && sel.i === i) c.classList.add('sel');
        if (i === h.length - 1 && h.length === 2) c.append(el('em', 'll-new', '방금 뽑음'));
        c.onclick = () => { if (!ok) return; sel = { i, t: null, g: null }; draw(); };
      } else if (mine && s.phase === 'chancellor') {
        if (sel && sel.keep === i) c.classList.add('sel');
        if (sel && sel.low === i) c.classList.add('low');
        c.onclick = () => { if (!sel || sel.keep == null || sel.keep === i) sel = { keep: i, low: null }; else sel.low = i; draw(); };
      }
      handBox.append(c);
    });
    if (s.out[H] && !s.over) handBox.append(el('div', 'll-wait', '이번 라운드는 탈락했어요. 다음 라운드를 기다리는 중…'));
    panelDraw(mine, legal);
    counts();
  }

  function panelDraw(mine, legal) {
    panel.replaceChildren();
    if (s.over || paused) return;
    if (!mine) { panel.append(el('div', 'll-msg', s.out[H] ? '' : `${nm(s.turn)} 차례…`)); return; }
    const h = s.hand[H];
    if (s.phase === 'chancellor') {
      if (!sel || sel.keep == null) { panel.append(el('div', 'll-msg', '대신: 남길 카드 1장을 고르세요')); return; }
      const rest = h.map((_, j) => j).filter(j => j !== sel.keep);
      if (rest.length === 2 && sel.low == null) { panel.append(el('div', 'll-msg', `남길 카드: ${cn(h[sel.keep])}. 나머지 중 덱 '맨 아래'에 넣을 카드를 고르세요`)); rest.forEach(j => panel.append(btn(`${cn(h[j])} 맨 아래로`, '', () => { sel.low = j; draw(); }))); return; }
      const low = sel.low ?? rest[0];
      const m = legal.find(x => x.keep === sel.keep && x.low === low);
      panel.append(el('div', 'll-msg', `${cn(h[sel.keep])}를 남기고 ${rest.map(j => cn(h[j])).join(', ')}를 덱 아래로${rest.length === 2 ? ` (맨 아래: ${cn(h[low])})` : ''}`), btn('확정', 'go', () => human(m)), btn('다시 고르기', '', () => { sel = null; draw(); }));
      return;
    }
    const forced = h.includes(8) && (h.includes(7) || h.includes(5));
    if (!sel) { panel.append(el('div', 'll-msg', forced ? '왕/왕자와 함께라서 백작부인을 반드시 내야 해요' : '낼 카드를 고르세요')); return; }
    const v = h[sel.i];
    const opts = legal.filter(m => m.i === sel.i);
    const head = el('div', 'll-msg'); head.append(el('b', '', cn(v)), ` — ${CARD[v].tx}`); panel.append(head);
    const others = alive(s).filter(x => x !== H);
    if ((TARGETED.has(v) || v === 5) && opts[0].t >= 0) {
      if (sel.t == null) {
        const row = el('div', 'll-row');
        const tlist = v === 5 ? [...others, H] : others;
        tlist.forEach(x => { const ok = opts.some(m => m.t === x); const b = btn(x === H ? '나 자신' : nm(x), ok ? '' : 'off', () => { if (!ok) return; sel.t = x; draw(); }); if (!ok) b.title = '보호 중'; if (!ok) b.textContent += ' (보호)'; row.append(b); });
        panel.append(el('div', 'll-sub', '누구에게?'), row);
        if (v === 5 && h[1 - sel.i] === 9) panel.append(el('div', 'll-warn', '나 자신을 고르면 공주를 버리게 되어 탈락해요!'));
        return;
      }
      if (v === 1 && sel.g == null) {
        const c = pool(s, H), grid = el('div', 'll-grid');
        GUESSES.forEach(g => { const b = btn(`${NAME(g)} ${g}`, c[g] ? '' : 'off', () => { sel.g = g; draw(); }); b.append(el('small', '', `남은 ${c[g]}`)); grid.append(b); });
        panel.append(el('div', 'll-sub', `${nm(sel.t)}의 카드는?`), grid);
        return;
      }
      const m = opts.find(x => x.t === sel.t && (v !== 1 || x.g === sel.g));
      panel.append(el('div', 'll-sub', `${sel.t === H ? '나 자신' : nm(sel.t)}${v === 1 ? `에게 "${NAME(sel.g)}?"` : ''}`), btn('내기', 'go', () => human(m)), btn('취소', '', () => { sel = null; draw(); }));
      return;
    }
    if (TARGETED.has(v)) panel.append(el('div', 'll-warn', '모두 보호 중이라 효과 없이 냅니다'));
    if (v === 9) panel.append(el('div', 'll-warn', '공주를 내면 이번 라운드 탈락이에요!'));
    if (v === 8 && !forced) panel.append(el('div', 'll-sub', '그냥 내도 돼요. 다들 "왕이나 왕자를 쥐었나?" 하고 의심할 거예요 (허세)'));
    panel.append(btn(v === 9 ? '그래도 내기' : '내기', v === 9 ? 'warn' : 'go', () => human(opts[0])), btn('취소', '', () => { sel = null; draw(); }));
  }

  function human(m) { if (!m || dead || s.over || s.turn !== H) return; sel = null; act(m); }

  function act(m) {
    const leadBefore = leader();
    self.applyMove(s, m, rng);
    const re = consume();
    const leadNow = leader();
    if (leadBefore >= 0 && leadNow !== leadBefore && s.tokens[leadNow] > s.tokens[leadBefore]) say(leadBefore, 'overtaken');
    if (re) return roundOver(re);
    draw();
    loop();
  }

  function roundOver(e) {
    paused = true;
    const why = e.why === 'last' ? '마지막 생존' : '카드 비교';
    e.winners.forEach(w => { if (w !== H) say(w, s.over ? [] : ['round', 'good']); });
    log(`라운드 ${e.r} 승리: ${e.winners.map(nm).join(', ')} (${why})${e.spy >= 0 ? ` · 스파이 보너스 ${nm(e.spy)}` : ''}`, 'rw');
    const box = el('div', 'll-ovbox');
    box.append(el('b', 'll-ovt', `라운드 ${e.r} 결과 · ${why}`));
    ctx.players.forEach((_, i) => {
      const r = el('div', 'll-ovr' + (e.winners.includes(i) ? ' win' : ''));
      r.append(ctx.avatar(i, 26), el('span', 'll-ovn', nm(i)));
      if (e.hands[i] != null) r.append(mini(e.hands[i])); else r.append(el('span', 'll-ovx', '탈락'));
      r.append(hearts(i));
      if (e.winners.includes(i)) r.append(el('em', '', '+1'));
      if (e.spy === i) r.append(el('em', 'spy', '스파이 +1'));
      box.append(r);
    });
    box.append(el('div', 'll-ovs', `제외됐던 카드: ${e.aside == null ? '(왕자로 사용됨)' : cn(e.aside)}`));
    const go = btn(s.over ? '최종 결과' : '다음 라운드', 'go', () => next());
    box.append(go);
    overBox.replaceChildren(box); overBox.style.display = 'flex';
    draw();
    let left = 8;
    const tick = () => { if (!paused) return; go.textContent = `${s.over ? '최종 결과' : '다음 라운드'} (${left})`; if (left-- <= 0) return next(); later(tick, ctx.delay(1000)); };
    tick();
    function next() {
      if (!paused) return; paused = false;
      overBox.style.display = 'none'; overBox.replaceChildren();
      if (s.over) return finish();
      pendingLog.splice(0).forEach(l => log(l, 'rd'));
      banner.textContent = '';
      draw(); loop(true);
    }
  }

  function finish() {
    if (finished) return; finished = true;
    const res = self.result(s);
    const best = res.ranking[0].score;
    res.ranking.forEach((r, k) => { if (r.seat === H) return; if (r.score === best) say(r.seat, 'win'); else if (k === res.ranking.length - 1) say(r.seat, 'lose'); });
    log(res.ranking[0].seat === H && res.ranking[0].score === best ? '당신이 공주의 마음을 얻었습니다!' : `${nm(res.ranking[0].seat)} 승리`, 'rw');
    draw();
    later(() => ctx.finish(res), ctx.delay(4800));
  }

  function loop(first) {
    if (dead || s.over || paused) return;
    if (s.turn === H) { draw(); return; }
    const p = ctx.players[s.turn];
    later(() => {
      if (dead || paused || s.turn === H) return;
      const ch = self.botChoose(s, p.traits, rng, { seat: s.turn, rivalSeats: p.rivalSeats, allySeats: p.allySeats });
      act(ch.move);
    }, ctx.delay(first ? 2400 : s.out[H] ? 650 : s.phase === 'chancellor' ? 700 : 1100));
  }

  log(`새 게임! ${s.n}인 · 호감 ${s.goal}개를 먼저 모으면 승리`);
  consume();
  draw();
  ctx.players.forEach((p, i) => { if (!p.human) later(() => say(i, 'start'), ctx.delay(300 + i * 450)); });
  loop(true);
  return { destroy() { dead = true; timers.forEach(clearTimeout); timers.clear(); } };
}

const LL_CSS = `
.g-ll{position:relative;padding:12px 10px 14px;border-radius:18px;color:#f6ead6;font-family:var(--fk);
 background:radial-gradient(90% 55% at 50% 0%,#ffffff12,transparent 70%),repeating-linear-gradient(135deg,#ffffff06 0 1px,#0000 1px 9px),repeating-linear-gradient(45deg,#ffffff05 0 1px,#0000 1px 9px),radial-gradient(130% 90% at 50% 35%,var(--wine),var(--wine2));
 box-shadow:inset 0 0 0 2px #2a0c13,inset 0 0 0 4px var(--acc),inset 0 0 0 5px #2a0c13,inset 0 0 70px #000a,0 10px 24px #0006}
.g-ll *{box-sizing:border-box}
.g-ll .ll-bar{display:flex;justify-content:space-between;font-family:var(--fd);font-size:13px;letter-spacing:.1em;color:#ecd7a8;margin:2px 6px 6px}
.g-ll .ll-seats{display:grid;grid-template-columns:1fr 1fr;gap:10px 8px;padding-top:30px}
.g-ll .ll-seat{position:relative;background:#00000038;border:1px solid #ffffff1f;border-radius:12px;padding:7px;min-height:74px}
.g-ll .ll-seat.turn{border-color:var(--acc);box-shadow:0 0 0 2px var(--acc),0 0 16px #ffd38a55}
.g-ll .ll-seat.out{opacity:.5;filter:grayscale(.7)}
.g-ll .ll-seat.mine{margin-top:6px;background:#0000004d}
.g-ll .ll-top{display:flex;gap:8px;align-items:center}
.g-ll .ll-info{min-width:0}
.g-ll .ll-nmx{font-weight:800;font-size:14px;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-ll .ll-hearts{display:flex;gap:2px;margin-top:2px}
.g-ll .ll-ht{width:13px;height:13px;fill:#00000055;stroke:#e6c98f;stroke-width:1.6}
.g-ll .ll-ht.on{fill:#e8536f;stroke:#ffd0d9}
.g-ll .ll-tags{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px}
.g-ll .ll-tag{font-size:10.5px;padding:1px 6px;border-radius:9px;background:#ffffff1c;color:#f3e3c3;white-space:nowrap}
.g-ll .ll-tag.x{background:#000a}.g-ll .ll-tag.pr{background:#a86f99}.g-ll .ll-tag.sp{background:#4b5563}.g-ll .ll-tag.ct{background:#8e3b6e}
.g-ll .ll-tag.hd{background:#b8862b;color:#20140a}.g-ll .ll-tag.bl{background:#3d2a52}.g-ll .ll-tag.kn{background:#f1e2bd;color:#3a1520;font-weight:700}.g-ll .ll-tag.wk{background:#c0392b}
.g-ll .ll-disc{display:flex;flex-wrap:wrap;gap:3px;margin-top:5px;min-height:4px}
.g-ll .ll-mini{display:inline-flex;align-items:center;justify-content:center;min-width:20px;height:24px;padding:0 3px;border-radius:4px;font-family:var(--fd);font-weight:700;font-size:14px;color:#2a1a10;background:linear-gradient(#fbf3df,#ead9b4);border-top:4px solid var(--h);box-shadow:0 1px 2px #0007}
.g-ll .ll-mini.o{outline:2px solid #000;opacity:.8}.g-ll .ll-mini.p{outline:1.5px dashed #ffd38a}
.g-ll .ll-say{position:absolute;left:2px;right:2px;bottom:calc(100% - 4px);z-index:6;background:#fff7ea;color:#3a1520;border-radius:10px;padding:6px 9px;font-size:12.5px;line-height:1.4;box-shadow:0 4px 12px #000a;cursor:pointer}
.g-ll .ll-say:after{content:"";position:absolute;left:22px;bottom:-6px;border:6px solid transparent;border-top-color:#fff7ea;border-bottom:0}
.g-ll .ll-say.pop{animation:llpop .18s ease-out}
@keyframes llpop{from{transform:translateY(5px) scale(.96);opacity:0}to{transform:none;opacity:1}}
.g-ll .ll-mid{margin:14px 0 6px;text-align:center}
.g-ll .ll-pile{display:flex;justify-content:center;align-items:flex-end;gap:16px}
.g-ll .ll-stack,.g-ll .ll-fu{display:flex;flex-direction:column;align-items:center;gap:3px;font-size:11.5px;color:#ecd7a8}
.g-ll .ll-fu{flex-direction:row;flex-wrap:wrap;max-width:110px;justify-content:center}
.g-ll .ll-fu span{width:100%}
.g-ll .ll-back{position:relative;width:52px;height:72px;border-radius:7px;background:repeating-linear-gradient(45deg,#7a2238 0 5px,#6a1c30 5px 10px);box-shadow:0 0 0 2px var(--acc) inset,0 4px 10px #0009}
.g-ll .ll-back.dim{filter:brightness(.7)}
.g-ll .ll-seal{position:absolute;left:50%;top:50%;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;background:radial-gradient(circle at 35% 30%,#e0475f,#9e1530 70%);box-shadow:0 1px 3px #0008;display:flex;align-items:center;justify-content:center}
.g-ll .ll-seal .ll-ht{width:13px;height:13px;fill:#f6d58f;stroke:none}
.g-ll .ll-empty{width:52px;height:72px;border-radius:7px;border:1px dashed #ffffff44;font-size:11px;display:flex;align-items:center;justify-content:center;color:#ecd7a899}
.g-ll .ll-banner{margin-top:10px;min-height:20px;font-size:13px;color:#ffe2b0;line-height:1.45}
.g-ll .ll-peek{display:none;margin:8px auto 0;max-width:420px;padding:8px 12px;border-radius:10px;background:#f6ead0;color:#3a1520;font-weight:700;font-size:13.5px;text-align:center;box-shadow:0 4px 12px #0008}
.g-ll .ll-hand{display:flex;justify-content:center;gap:10px;margin-top:10px;min-height:20px;flex-wrap:wrap}
.g-ll .ll-card{position:relative;width:104px;min-height:146px;border-radius:11px;padding:7px 7px 8px;background:linear-gradient(165deg,#fdf6e3,#ecdcb6);color:#2e1a12;box-shadow:0 0 0 2px var(--h) inset,0 0 0 4px #f8e9c9 inset,0 6px 14px #0009;cursor:pointer;transition:transform .15s}
.g-ll .ll-card:before{content:"";position:absolute;left:0;right:0;top:0;height:8px;border-radius:11px 11px 0 0;background:var(--h)}
.g-ll .ll-card .ll-n{display:block;font-family:var(--fd);font-weight:700;font-size:38px;line-height:1;margin-top:6px;color:var(--h)}
.g-ll .ll-card .ll-nm{font-weight:800;font-size:15px;margin-top:2px}
.g-ll .ll-card .ll-tx{font-size:10.5px;line-height:1.35;margin-top:4px;color:#5a4030}
.g-ll .ll-card .ll-new{position:absolute;right:6px;top:12px;font-style:normal;font-size:10px;background:#3a1520;color:#ffe2b0;border-radius:8px;padding:0 5px}
.g-ll .ll-card.sel{transform:translateY(-10px);box-shadow:0 0 0 2px var(--h) inset,0 0 0 4px #f8e9c9 inset,0 0 0 3px var(--acc),0 0 18px #ffd38a99}
.g-ll .ll-card.low{opacity:.75;transform:translateY(6px)}
.g-ll .ll-card.no{opacity:.45;cursor:not-allowed}
.g-ll .ll-wait{font-size:13px;color:#ecd7a8;padding:10px}
.g-ll .ll-panel{margin-top:10px;text-align:center}
.g-ll .ll-msg{font-size:13.5px;line-height:1.5;color:#f6ead6;margin-bottom:6px}
.g-ll .ll-msg b{color:#ffe2b0}
.g-ll .ll-sub{font-size:13px;color:#ecd7a8;margin:4px 0}
.g-ll .ll-warn{font-size:13px;color:#ffb3b3;font-weight:700;margin:4px 0}
.g-ll .ll-row{display:flex;flex-wrap:wrap;gap:6px;justify-content:center}
.g-ll .ll-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:6px}
.g-ll .ll-btn{border:0;cursor:pointer;padding:10px 12px;margin:3px;border-radius:10px;font-weight:800;font-size:14px;color:#3a1520;background:linear-gradient(#fbf1dc,#e3cfa3);box-shadow:0 3px 0 #0006}
.g-ll .ll-grid .ll-btn{margin:0;padding:8px 4px;font-size:13px}
.g-ll .ll-btn small{display:block;font-size:10.5px;font-weight:600;color:#7a5a40}
.g-ll .ll-btn.go{color:#fff;background:linear-gradient(#c94a63,#8e2238)}
.g-ll .ll-btn.warn{color:#fff;background:linear-gradient(#555,#222)}
.g-ll .ll-btn.off{opacity:.4;cursor:not-allowed}
.g-ll .ll-btn:active:not(.off){transform:translateY(2px);box-shadow:0 1px 0 #0006}
.g-ll .ll-over{display:none;position:fixed;inset:0;z-index:50;background:#1a060bcc;align-items:center;justify-content:center;padding:16px;overflow:auto}
.g-ll .ll-ovbox{width:100%;max-width:400px;background:linear-gradient(170deg,#fdf6e3,#ecdcb6);color:#2e1a12;border-radius:14px;padding:14px;box-shadow:0 0 0 3px var(--acc),0 12px 30px #000c}
.g-ll .ll-ovt{display:block;font-size:16px;margin-bottom:8px;color:#7a2238}
.g-ll .ll-ovr{display:flex;align-items:center;gap:7px;padding:5px 6px;border-radius:8px;margin-top:3px;background:#0000000d}
.g-ll .ll-ovr.win{background:#e8536f33;font-weight:800}
.g-ll .ll-ovr .ll-ovn{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.g-ll .ll-ovr .ll-ovx{font-size:12px;color:#7a5a40}
.g-ll .ll-ovr em{font-style:normal;font-size:12px;color:#c2185b;font-weight:800}
.g-ll .ll-ovr em.spy{color:#4b5563}
.g-ll .ll-ovr .ll-ht{fill:#0000001a;stroke:#b8862b}.g-ll .ll-ovr .ll-ht.on{fill:#e8536f;stroke:#c2185b}
.g-ll .ll-ovs{font-size:12.5px;margin:8px 0;color:#5a4030}
.g-ll .ll-ovbox .ll-btn{width:100%;margin:4px 0 0}
.g-ll .ll-count,.g-ll .ll-rules{margin-top:10px;background:#00000038;border-radius:10px;padding:8px 10px;font-size:13px;line-height:1.6;color:#ecd7a8}
.g-ll .ll-count summary,.g-ll .ll-rules summary{cursor:pointer;font-weight:700}
.g-ll .ll-ct{display:grid;grid-template-columns:1fr 1fr;gap:4px 10px;margin-top:6px}
.g-ll .ll-cr{display:flex;align-items:center;gap:6px}.g-ll .ll-cr b{margin-left:auto}.g-ll .ll-cr.z{opacity:.4}
.g-ll .ll-rules li{margin:2px 0}
.g-ll .ll-log{margin-top:12px;background:#00000045;border-radius:10px;padding:7px 10px;font-size:12px;line-height:1.5;color:#ecd7a8;max-height:160px;overflow:auto}
.g-ll .ll-log .me{color:#fff}.g-ll .ll-log .sp{color:#ffe2b0;font-style:italic}.g-ll .ll-log .pk{color:#9fe0ff;font-weight:700}
.g-ll .ll-log .out{color:#ff9fae}.g-ll .ll-log .rd{color:#d8a657;margin-top:4px}.g-ll .ll-log .rw{color:#ffd38a;font-weight:700}.g-ll .ll-log .bl{color:#c9a7ff}
`;
