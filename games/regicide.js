// 레지사이드 — 협력 카드 게임. 2~4명이 함께 성의 왕족 12명(J·Q·K)을 쓰러뜨린다. 규칙은 공식 룰북 기준.
// 이 파일은 규칙(엔진) · 협력 AI · 화면을 한 파일에 담는다. 규칙은 전달받은 rng·상태 안의 시드만 쓴다.

// 카드 번호: 무늬*20 + 숫자 (A=1, J=11, Q=12, K=13). 광대는 100·101.
export const SUITS = ['hearts', 'diamonds', 'clubs', 'spades'];
export const SUIT_KO = ['하트', '다이아', '클럽', '스페이드'];
export const SUIT_SYM = ['♥', '♦', '♣', '♠'];
export const POWER_KO = ['회복', '보급', '두 배', '방어'];
const HMAX = { 1: 8, 2: 7, 3: 6, 4: 5 };
const JESTERS = { 1: 0, 2: 0, 3: 1, 4: 2 };
export const isJ = id => id >= 100;
export const rk = id => id % 20;
export const su = id => Math.floor(id / 20);
export const val = id => (isJ(id) ? 0 : ({ 11: 10, 12: 15, 13: 20 })[rk(id)] || rk(id));
export const hpOf = id => ({ 11: 20, 12: 30, 13: 40 })[rk(id)];
export const rankLabel = id => (isJ(id) ? '★' : ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[rk(id)] || String(rk(id)));
export const cardName = id => (isJ(id) ? '광대' : `${SUIT_SYM[su(id)]}${rankLabel(id)}`);
const sum = a => a.reduce((x, y) => x + y, 0);
const handSum = h => sum(h.map(val));

function rnd(s) { s.rs = (s.rs + 0x6D2B79F5) | 0; let t = Math.imul(s.rs ^ (s.rs >>> 15), 1 | s.rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function shuf(s, a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

function mkEnemy(id) { return { id, hp: hpOf(id), atk: val(id), dmg: 0, sp: 0, jes: false }; }

// 낼 수 있는 조합: 한 장 · 같은 숫자 2~4장(합 10 이하) · 에이스 + 아무 카드 한 장 · 광대(단독)
export function playMoves(hand) {
  const seen = new Set(), out = [];
  const add = c => { c = c.slice().sort((a, b) => a - b); const k = c.join(','); if (!seen.has(k)) { seen.add(k); out.push({ t: 'play', c }); } };
  const nj = hand.filter(c => !isJ(c));
  nj.forEach(c => add([c]));
  const jc = hand.find(isJ); if (jc != null) add([jc]);
  nj.filter(c => rk(c) === 1).forEach(a => nj.forEach(x => { if (x !== a) add([a, x]); }));
  for (let r = 1; r <= 5; r++) {
    const g = nj.filter(c => rk(c) === r);
    for (let m = 3; m < 1 << g.length; m++) {
      const sub = g.filter((_, i) => m >> i & 1);
      if (sub.length >= 2 && sub.length <= 4 && sub.length * r <= 10) add(sub);
    }
  }
  return out;
}

function lose(s, why) { s.over = true; s.won = false; s.why = why; s.phase = 'over'; }
function canYield(s) { return s.streak < s.n - 1; }
function startTurn(s, seat) {
  s.turn = seat; s.phase = 'play';
  if (!playMoves(s.hands[seat]).length && !canYield(s)) lose(s, 'stuck');
}
function afterEnemyTurn(s) {   // 4단계: 적의 반격
  const e = s.enemy, need = Math.max(0, e.atk - e.sp);
  s.need = need;
  s.fx.push({ t: 'hit', seat: s.turn, atk: e.atk, sp: e.sp, need });
  if (need === 0) { startTurn(s, (s.turn + 1) % s.n); return; }
  if (handSum(s.hands[s.turn]) < need) { lose(s, 'dead'); return; }
  s.phase = 'suffer';
}

const game = {
  meta: { id: 'regicide', name: '레지사이드', version: '1.0.0', players: { min: 2, max: 4 }, minutes: 25, campaign: null, autosave: { schema: 1 } },

  newGame({ players, rng }) {
    const n = players.length;
    const s = {
      v: 1, n, humanSeat: players.findIndex(p => p.human), hmax: HMAX[n], rs: Math.floor(rng.next() * 4294967296) | 0,
      tavern: [], discard: [], castle: [], enemy: null, played: [], hands: [],
      turn: 0, phase: 'play', streak: 0, need: 0, over: false, won: false, why: '', defeated: 0, moves: 0, last: null, fx: [], jesterUsed: 0
    };
    const nums = []; for (let su_ = 0; su_ < 4; su_++) for (let r = 1; r <= 10; r++) nums.push(su_ * 20 + r);
    for (let j = 0; j < JESTERS[n]; j++) nums.push(100 + j);
    s.tavern = rng.shuffle(nums);
    for (let r = 11; r <= 13; r++) s.castle.push(...rng.shuffle([0, 1, 2, 3].map(x => x * 20 + r)));
    s.enemy = mkEnemy(s.castle.shift());
    for (let i = 0; i < n; i++) s.hands.push([]);
    for (let k = 0; k < s.hmax; k++) for (let i = 0; i < n; i++) s.hands[i].push(s.tavern.pop());
    s.hands.forEach(h => h.sort((a, b) => a - b));
    return s;
  },
  currentSeat: s => s.turn,
  isOver: s => s.over,
  legalMoves(s) {
    if (s.over) return [];
    const h = s.hands[s.turn];
    if (s.phase === 'suffer') return [...new Set(h)].map(c => ({ t: 'disc', c }));
    if (s.phase === 'next') return Array.from({ length: s.n }, (_, p) => ({ t: 'next', p }));
    const ms = playMoves(h);
    if (canYield(s)) ms.push({ t: 'yield' });
    return ms;
  },
  applyMove(s, m) {
    if (s.over) throw new Error('끝난 게임');
    if (!this.legalMoves(s).some(x => JSON.stringify(x) === JSON.stringify(m))) throw new Error('규칙에 맞지 않는 수: ' + JSON.stringify(m));
    const seat = s.turn, h = s.hands[seat], e = s.enemy;
    s.fx = []; s.moves++;
    if (m.t === 'disc') {
      h.splice(h.indexOf(m.c), 1); s.discard.push(m.c); s.need -= val(m.c);
      s.fx.push({ t: 'disc', seat, c: m.c });
      s.last = { seat, t: 'disc', c: m.c };
      if (s.need <= 0) startTurn(s, (seat + 1) % s.n);
      return;
    }
    if (m.t === 'next') { s.last = { seat, t: 'next', p: m.p }; s.streak = 0; startTurn(s, m.p); return; }
    if (m.t === 'yield') {
      s.streak++; s.last = { seat, t: 'yield' }; s.fx.push({ t: 'yield', seat });
      afterEnemyTurn(s); return;
    }
    // 낸다
    s.streak = 0;
    m.c.forEach(c => { h.splice(h.indexOf(c), 1); s.played.push(c); });
    if (m.c.length === 1 && isJ(m.c[0])) {
      e.jes = true; s.jesterUsed++; s.phase = 'next';
      s.last = { seat, t: 'jester', c: m.c.slice() }; s.fx.push({ t: 'jester', seat });
      return;
    }
    const A = sum(m.c.map(val)), suits = new Set(m.c.map(su));
    const on = x => suits.has(x) && (e.jes || su(e.id) !== x);
    const L = { seat, t: 'play', c: m.c.slice(), A, heal: 0, draw: [], dmg: 0, red: 0, imm: [...suits].filter(x => !on(x)) };
    if (on(0)) {
      const pile = shuf(s, s.discard), k = Math.min(A, pile.length), back = pile.splice(0, k);
      s.discard = pile; s.tavern.unshift(...back); L.heal = k;
      if (k) s.fx.push({ t: 'heal', n: k });
    }
    if (on(1)) {
      let d = A, p = seat, idle = 0;
      while (d > 0 && s.tavern.length && idle < s.n) {
        if (s.hands[p].length < s.hmax) { const c = s.tavern.pop(); s.hands[p].push(c); L.draw.push([p, c]); d--; idle = 0; } else idle++;
        p = (p + 1) % s.n;
      }
      s.hands.forEach(x => x.sort((a, b) => a - b));
      if (L.draw.length) s.fx.push({ t: 'draw', list: L.draw.map(x => x.slice()) });
    }
    const D = A * (on(2) ? 2 : 1); e.dmg += D; L.dmg = D; L.club = on(2);
    if (on(3)) { e.sp += A; L.red = A; }
    s.last = L;
    s.fx.push({ t: 'dmg', seat, A, D, club: on(2), spade: on(3) });
    if (e.dmg >= e.hp) {   // 격파: 정확히 같으면 술집 맨 위로
      const exact = e.dmg === e.hp;
      s.defeated++;
      s.discard.push(...s.played); s.played = [];
      if (exact) s.tavern.push(e.id); else s.discard.push(e.id);
      L.kill = { id: e.id, exact };
      s.fx.push({ t: 'kill', id: e.id, exact });
      if (!s.castle.length) { s.over = true; s.won = true; s.phase = 'over'; s.enemy = null; return; }
      s.enemy = mkEnemy(s.castle.shift()); s.streak = 0;
      startTurn(s, seat); return;
    }
    afterEnemyTurn(s);
  },

  botChoose(s, traits, rng, info) { return botChoose(this, s, traits, rng, info || {}); },
  result(s) {
    return { coop: { won: !!s.won, score: s.defeated }, summary: s.won ? `성 함락! 왕족 12명 격파 · ${s.moves}수` : `왕족 ${s.defeated}/12명 격파 · ${s.moves}수` };
  },
  mount(container, ctx) { return mountRegicide(this, container, ctx); }
};
export default game;

// ---------- 협력 AI ----------
// 봇은 자기 손패와 공개 정보(적·버린 더미 수·다른 사람 손패 장수)만 본다. 특성은 '협력 성향'으로 읽는다:
// skill=판단 정확도, risk=손패를 얇게 두는 대담함, patience=카드 아끼기, aggression=밀어붙이기.
function botParams(tr) {
  const t = tr || {};
  return { skill: t.skill ?? 5, risk: t.risk ?? 5, pat: t.patience ?? 5, agg: t.aggression ?? 5 };
}
const W = { D: 1.15, KILL: 14, EX: 9, SPW: 0.8, HW0: 0.4, HW1: 2.4, HWT: 14, DR: 4.2, CC: 1, MG: 0.9, WANT: 5, JB: -13, FH: 10, YS: 0.6, OV: 0.15 };
const S = { TOP: 8, K: 14, H: 6, EW: { hs: 0.8, tv: 0.25, hp: 100 } };   // 앞내다보기 설정(시뮬레이션으로 정한 값)
let NOSEARCH = false;
function view(s, seat) {
  const e = s.enemy, h = s.hands[seat];
  const free = s.hands.reduce((a, x) => a + Math.max(0, s.hmax - x.length), 0);
  return { e, h, R: e.hp - e.dmg, need0: Math.max(0, e.atk - e.sp), free, others: s.hands.map(x => x.length) };
}
// 한 가지 수의 가치(카드 점수 단위): 피해·방어·회복·보급 − 낸 카드 값 − 손패가 얇아지는 위험
function scorePlay(s, seat, m, P, V = view(s, seat)) {
  const { e, R, need0 } = V;
  const rest = V.h.filter(c => !m.c.includes(c));
  if (m.c.length === 1 && isJ(m.c[0])) {
    const okAny = playMoves(V.h).some(x => !(x.c.length === 1 && isJ(x.c[0])) && handSum(V.h.filter(c => !x.c.includes(c))) >= need0 - 0);
    const hs = handSum(rest);
    let sc = need0 * 0.9 + W.JB + (hs < need0 + 3 ? 40 : 0);
    // 적 무늬에 막힌 카드가 손에 많으면 광대로 면역을 푸는 이득
    const blocked = V.h.filter(c => !isJ(c) && su(c) === su(e.id) && !e.jes).length;
    if (!e.jes && blocked >= 2 && su(e.id) >= 2) sc += blocked * 3;
    if (!okAny) sc += 200;
    return sc;
  }
  const A = sum(m.c.map(val)), suits = new Set(m.c.map(su));
  const on = x => suits.has(x) && (e.jes || su(e.id) !== x);
  const club = on(2), D = A * (club ? 2 : 1);
  const kill = D >= R;
  let sc = D * (W.D + P.agg * 0.02);
  if (kill) sc += W.KILL + need0 * 0.8 + (D === R ? W.EX : 0) - Math.max(0, D - R) * W.OV;
  const red = on(3) && !kill ? Math.min(A, need0) : 0;
  // 방어는 이 싸움이 끝날 때까지 모두가 맞는 횟수만큼 이득: 지금 한 번 + 남은 라운드
  const fut = kill ? 0 : Math.max(0, Math.ceil((R - D) / W.FH));
  sc += red * (1 + fut * W.SPW);
  if (on(0)) sc += Math.min(A, s.discard.length) * (W.HW0 + W.HW1 * Math.max(0, 1 - s.tavern.length / W.HWT));
  let draw = 0;
  if (on(1)) { draw = Math.min(A, V.free, s.tavern.length); sc += draw * W.DR; }
  sc -= A * (W.CC + P.pat * 0.035);
  if (!kill) {
    const newNeed = need0 - red, left = handSum(rest) + draw * 3;
    if (left < newNeed) sc -= 400;      // 맞고 나면 쓰러진다
    else { const margin = left - newNeed, want = W.WANT + (10 - P.risk) * 0.9; if (margin < want) sc -= (want - margin) * W.MG; }
  }
  return sc;
}
// 반격을 막아 낼 가장 값싼 카드 묶음(쓸모 있는 카드는 아끼고, 적과 같은 무늬는 먼저 버린다)
function discardPick(s, seat, need) {
  const h = s.hands[seat], e = s.enemy;
  const w = c => (isJ(c) ? 7 : val(c) + 0.35 + (e && su(c) === su(e.id) ? -0.25 * Math.min(val(c), 6) : 0) + (su(c) >= 2 ? 0.25 : 0) + (rk(c) === 1 ? 0.8 : 0));
  let best = null, bc = 1e9;
  for (let m = 1; m < 1 << h.length; m++) {
    let v = 0, c = 0;
    for (let i = 0; i < h.length; i++) if (m >> i & 1) { v += val(h[i]); c += w(h[i]); }
    if (v < need) continue;
    const over = v - need, cost = c + over * 0.9;
    if (cost < bc) { bc = cost; best = h.filter((_, i) => m >> i & 1); }
  }
  return best || h.slice();
}
function botChoose(mod, s, tr, rng, info) {
  const seat = s.turn, P = botParams(tr), h = s.hands[seat];
  if (s.phase === 'suffer') {
    const set = discardPick(s, seat, s.need).sort((a, b) => val(b) - val(a));
    return { move: { t: 'disc', c: set[0] }, reason: 'guard' };
  }
  if (s.phase === 'next') {
    // 다음 차례: 손패가 많은 동료(공개 정보)에게. 비슷하면 가까운 순서.
    let best = null, bs = -1e9;
    for (let d = 0; d < s.n; d++) {
      const p = (seat + 1 + d) % s.n, sc = s.hands[p].length * 2 - d * 0.1 + (p === seat ? -0.5 : 0);
      if (sc > bs) { bs = sc; best = p; }
    }
    return { move: { t: 'next', p: best }, reason: 'pass' };
  }
  const V = view(s, seat);
  const cand = playMoves(h).map(m => ({ move: m, sc: scorePlay(s, seat, m, P, V) }));
  if (mod.legalMoves(s).some(x => x.t === 'yield')) {
    const hs = handSum(h);
    cand.push({ move: { t: 'yield' }, sc: hs < V.need0 ? -1000 : -V.need0 * 0.0 - (hs - V.need0 < 6 ? (6 - (hs - V.need0)) * W.YS : 0), y: true });
  }
  cand.sort((a, b) => b.sc - a.sc);
  let pick = cand[0];
  if (cand.length > 1 && P.skill >= 1 && !NOSEARCH) {
    const top = cand.filter(c => c.sc > -300).slice(0, S.TOP);
    if (top.length > 1) {
      const K = Math.max(2, Math.round(S.K * (0.4 + P.skill * 0.1)));
      // 팀은 서로의 손패를 알고 상의하는 것으로 친다(뽑을 더미의 순서만 모른다).
      const known = new Set(s.hands.map((_, i) => i));
      const res = search(mod, s, seat, P, rng, top, K, S.H * s.n + 4, known);
      res.sort((a, b) => b.ev - a.ev); pick = res[0];
    }
  }
  const noise = (10 - P.skill) * 0.02;
  if (cand.length > 1 && rng.chance(noise) && cand[1].sc > -300) pick = rng.chance(0.6) || cand.length < 3 ? cand[1] : cand[2];
  const m = pick.move, A = m.t === 'play' ? sum(m.c.map(val)) : 0;
  const why = m.t === 'yield' ? 'yield' : isJ(m.c[0]) && m.c.length === 1 ? 'jester' : A * (m.c.some(c => su(c) === 2) ? 2 : 1) >= V.R ? 'kill' : m.c.some(c => su(c) === 1) ? 'draw' : m.c.some(c => su(c) === 3) ? 'spade' : m.c.some(c => su(c) === 0) ? 'heal' : 'hit';
  return { move: m, reason: why };
}

game._t = { playMoves, handSum, mkEnemy, botParams, scorePlay, discardPick, W, S, setNoSearch: v => { NOSEARCH = v; } };

// ---------- 앞을 내다보기: 안 보이는 카드를 가정해 몇 번씩 끝까지 굴려 보고 가장 잘 풀린 수를 고른다 ----------
const clone = s => JSON.parse(JSON.stringify(s));
function greedy(mod, s, P) {
  const seat = s.turn;
  if (s.phase === 'suffer') { const set = discardPick(s, seat, s.need).sort((a, b) => val(b) - val(a)); return { t: 'disc', c: set[0] }; }
  if (s.phase === 'next') {
    let best = null, bs = -1e9;
    for (let d = 0; d < s.n; d++) { const p = (seat + 1 + d) % s.n, sc = s.hands[p].length * 2 - d * 0.1 + (p === seat ? -0.5 : 0); if (sc > bs) { bs = sc; best = p; } }
    return { t: 'next', p: best };
  }
  const V = view(s, seat), h = s.hands[seat];
  let best = null, bs = -1e9;
  for (const m of playMoves(h)) { const sc = scorePlay(s, seat, m, P, V); if (sc > bs) { bs = sc; best = m; } }
  if (canYield(s)) { const hs = handSum(h), ys = hs < V.need0 ? -1000 : -(hs - V.need0 < 6 ? (6 - (hs - V.need0)) * W.YS : 0); if (ys > bs) best = { t: 'yield' }; }
  return best;
}
function worldOf(s, seat, rng, known) {
  const w = clone(s);
  const unseen = [...w.tavern]; w.hands.forEach((x, i) => { if (i !== seat && !known.has(i)) unseen.push(...x); });
  const sh = rng.shuffle(unseen);
  w.hands.forEach((x, i) => { if (i !== seat && !known.has(i)) { const k = x.length; w.hands[i] = sh.splice(0, k).sort((a, b) => a - b); } });
  w.tavern = sh; w.rs = Math.floor(rng.next() * 4294967296) | 0;
  return w;
}
function evalState(s) {
  let v = s.defeated * 100;
  if (s.won) return v + 5000;
  if (s.enemy) v += S.EW.hp * s.enemy.dmg / s.enemy.hp;
  if (s.over) return v - 220;
  const hs = s.hands.reduce((a, x) => a + handSum(x), 0);
  return v + hs * S.EW.hs + s.tavern.length * S.EW.tv + s.discard.length * 0.05;
}
function search(mod, s, seat, P, rng, cands, K, horizon, known) {
  const out = [];
  for (const c of cands) {
    let tot = 0;
    for (let k = 0; k < K; k++) {
      const w = worldOf(s, seat, rng, known);
      let steps = 0, d0 = w.defeated;
      mod.applyMove(w, c.move);
      while (!w.over && steps < horizon) {
        const m = greedy(mod, w, P); mod.applyMove(w, m); steps++;
        if (w.defeated > d0 && w.phase === 'play' && steps >= 1) break;
      }
      tot += evalState(w);
    }
    out.push({ ...c, ev: tot / K });
  }
  return out;
}

// ---------- 화면: "왕관의 성" 테마 ----------
const SC = ['#d6334c', '#e58a1b', '#23895a', '#34408f'];          // 하트·다이아·클럽·스페이드 (네 가지 색 덱: 폰에서도 무늬가 한눈에)
const SC2 = ['#7d1226', '#8a4a07', '#0e4a2e', '#161c4d'];
const PIPS = {
  2: [[50, 34], [50, 106]], 3: [[50, 34], [50, 70], [50, 106]], 4: [[34, 34], [66, 34], [34, 106], [66, 106]],
  5: [[34, 34], [66, 34], [50, 70], [34, 106], [66, 106]], 6: [[34, 34], [66, 34], [34, 70], [66, 70], [34, 106], [66, 106]],
  7: [[34, 34], [66, 34], [50, 52], [34, 70], [66, 70], [34, 106], [66, 106]],
  8: [[34, 34], [66, 34], [50, 52], [34, 70], [66, 70], [50, 88], [34, 106], [66, 106]],
  9: [[34, 32], [66, 32], [34, 56], [66, 56], [50, 70], [34, 84], [66, 84], [34, 108], [66, 108]],
  10: [[34, 32], [66, 32], [50, 44], [34, 56], [66, 56], [34, 84], [66, 84], [50, 96], [34, 108], [66, 108]]
};
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const useS = (su_, x, y, w, extra = '') => `<use href="#rg-s${su_}" x="${x - w / 2}" y="${y - w / 2}" width="${w}" height="${w}" style="color:${SC[su_]}" ${extra}/>`;

function faceArt(su_, r) {
  const c = SC[su_], d = SC2[su_];
  const robe = `<path d="M22 120 Q24 91 50 87 Q76 91 78 120Z" fill="${c}" stroke="${d}" stroke-width="1.4"/><path d="M50 88 L36 120 M50 88 L64 120" stroke="#fff" stroke-opacity=".35" stroke-width="2"/>
    <path d="M30 108 H70" stroke="#f1cf6a" stroke-width="2.4"/>${useS(su_, 50, 106, 13, 'opacity=".95"')}`;
  const head = `<rect x="45" y="78" width="10" height="11" fill="#e6c59b"/><circle cx="50" cy="66" r="14" fill="#f4dcb8" stroke="#8a6a3c" stroke-width="1.2"/>
    <circle cx="45" cy="65" r="1.6" fill="#3a2a1a"/><circle cx="55" cy="65" r="1.6" fill="#3a2a1a"/><path d="M45.5 72 Q50 75.5 54.5 72" stroke="#7a3b2a" stroke-width="1.4" fill="none" stroke-linecap="round"/>`;
  let top = '', hair = '';
  if (r === 13) {   // 왕: 긴 수염 + 높은 왕관
    hair = `<path d="M36 64 Q36 50 50 50 Q64 50 64 64 Q64 56 50 56 Q36 56 36 64Z" fill="#6b4a2a"/><path d="M40 74 Q50 92 60 74 Q50 80 40 74Z" fill="#6b4a2a"/>`;
    top = `<path d="M34 54 L36 36 L43 46 L50 32 L57 46 L64 36 L66 54Z" fill="#f1cf6a" stroke="#8a6408" stroke-width="1.4" stroke-linejoin="round"/><rect x="34" y="52" width="32" height="5" rx="1.5" fill="#d9ac38" stroke="#8a6408" stroke-width="1.2"/>
      <circle cx="50" cy="45" r="2.6" fill="${c}" stroke="#fff" stroke-width=".8"/><circle cx="42" cy="49" r="1.6" fill="#4a8fe0"/><circle cx="58" cy="49" r="1.6" fill="#23c07a"/>`;
  } else if (r === 12) {   // 여왕: 긴 머리 + 티아라
    hair = `<path d="M34 70 Q32 48 50 48 Q68 48 66 70 L66 92 Q58 84 56 74 Q50 78 44 74 Q42 84 34 92Z" fill="#8a4a2a"/>`;
    top = `<path d="M36 52 L38 41 L44 48 L50 38 L56 48 L62 41 L64 52Z" fill="#f1cf6a" stroke="#8a6408" stroke-width="1.4" stroke-linejoin="round"/><circle cx="50" cy="45" r="2.4" fill="#fff" stroke="${c}" stroke-width="1"/><circle cx="43" cy="49" r="1.5" fill="${c}"/><circle cx="57" cy="49" r="1.5" fill="${c}"/>`;
  } else {   // 시종: 모자 + 깃털
    hair = `<path d="M36 64 Q36 52 50 52 Q64 52 64 64 Q60 58 50 58 Q40 58 36 64Z" fill="#b57b3a"/>`;
    top = `<path d="M34 56 Q50 40 66 56 Q50 52 34 56Z" fill="${c}" stroke="${d}" stroke-width="1.4"/><path d="M62 52 Q80 30 74 42 Q82 36 70 56Z" fill="#fff" stroke="#9aa" stroke-width=".8"/><circle cx="50" cy="48" r="2.2" fill="#f1cf6a"/>`;
  }
  const extra = r === 13 ? `<path d="M20 118 L20 74" stroke="#8a6408" stroke-width="3"/>${useS(su_, 20, 70, 12)}` : r === 12 ? `<path d="M82 118 L82 80" stroke="#8a6408" stroke-width="3"/><circle cx="82" cy="76" r="5" fill="#f1cf6a" stroke="#8a6408"/>` : `<path d="M80 118 L84 62 L88 118Z" fill="#9aa4b8" stroke="#4a5468" stroke-width="1.2"/><rect x="78" y="104" width="12" height="3" fill="#8a6408"/>`;
  return `${useS(su_, 50, 70, 64, 'opacity=".09"')}${extra}${robe}${hair}${head}${top}`;
}
function aceArt(su_) {
  const c = SC[su_];
  let rays = ''; for (let i = 0; i < 16; i++) { const a = i * Math.PI / 8; rays += `<path d="M${(50 + 25 * Math.cos(a)).toFixed(1)} ${(70 + 25 * Math.sin(a)).toFixed(1)} L${(50 + 37 * Math.cos(a)).toFixed(1)} ${(70 + 37 * Math.sin(a)).toFixed(1)}" stroke="${c}" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/>`; }
  return `<circle cx="50" cy="70" r="23" fill="none" stroke="${c}" stroke-opacity=".55" stroke-width="1.4"/>${rays}${useS(su_, 50, 70, 36)}
    <g fill="${c}" opacity=".8"><ellipse cx="50" cy="116" rx="5.5" ry="4.2"/><circle cx="41.5" cy="110.5" r="2.2"/><circle cx="47" cy="106" r="2.2"/><circle cx="53" cy="106" r="2.2"/><circle cx="58.5" cy="110.5" r="2.2"/></g>`;
}
function jesterArt() {
  return `<path d="M22 84 Q14 50 26 30 Q34 46 40 56 Q44 30 50 20 Q56 30 60 56 Q66 46 74 30 Q86 50 78 84Z" fill="#b04ac2" stroke="#5a1f6a" stroke-width="1.5" stroke-linejoin="round"/>
    <path d="M40 56 Q50 62 60 56 L62 84 H38Z" fill="#2aa8a0" stroke="#0d5f5a" stroke-width="1.2"/>
    <circle cx="26" cy="30" r="5" fill="#f1cf6a" stroke="#8a6408"/><circle cx="50" cy="20" r="5" fill="#f1cf6a" stroke="#8a6408"/><circle cx="74" cy="30" r="5" fill="#f1cf6a" stroke="#8a6408"/>
    <circle cx="50" cy="92" r="17" fill="#f4dcb8" stroke="#8a6a3c" stroke-width="1.2"/><circle cx="44" cy="90" r="1.8" fill="#3a2a1a"/><circle cx="56" cy="90" r="1.8" fill="#3a2a1a"/><path d="M42 98 Q50 106 58 98" stroke="#b02a3a" stroke-width="2" fill="none" stroke-linecap="round"/>
    <circle cx="38" cy="96" r="3" fill="#ff8a98" opacity=".6"/><circle cx="62" cy="96" r="3" fill="#ff8a98" opacity=".6"/>
    <path d="M30 118 L50 108 L70 118 L60 124 L50 116 L40 124Z" fill="#b04ac2" stroke="#5a1f6a" stroke-width="1.2"/>`;
}
function cardSVG(id) {
  const j = isJ(id), s_ = j ? 0 : su(id), r = rk(id), c = j ? '#8a3a9a' : SC[s_];
  const lab = j ? '★' : rankLabel(id);
  const art = j ? jesterArt() : r === 1 ? aceArt(s_) : r >= 11 ? faceArt(s_, r) : PIPS[r].map(([x, y]) => useS(s_, x, y, r === 2 || r === 3 ? 25 : 21, y > 72 ? `transform="rotate(180 ${x} ${y})"` : '')).join('');
  const idx = `<text x="14" y="24" text-anchor="middle" class="rg-ix" fill="${c}">${lab}</text>${j ? '' : useS(s_, 14, 33, 12)}`;
  return `<svg class="rg-face" viewBox="0 0 100 140" aria-hidden="true"><rect x="1.5" y="1.5" width="97" height="137" rx="9" fill="url(#rg-paper)" stroke="#6f5a30" stroke-width="1.6"/>
    <rect x="6" y="6" width="88" height="128" rx="5" fill="none" stroke="${c}" stroke-opacity=".5" stroke-width="1.1"/>
    ${r >= 11 || j ? `<rect x="19" y="26" width="62" height="96" rx="4" fill="${c}" fill-opacity=".07" stroke="${c}" stroke-opacity=".35" stroke-width=".9"/>` : ''}
    ${idx}<g transform="rotate(180 50 70)">${idx}</g>${art}</svg>`;
}
const BACK = `<svg class="rg-face" viewBox="0 0 100 140" aria-hidden="true"><rect x="1.5" y="1.5" width="97" height="137" rx="9" fill="#1b2447" stroke="#b48a3a" stroke-width="2"/><rect x="7" y="7" width="86" height="126" rx="5" fill="url(#rg-lat)" stroke="#e7c15d" stroke-opacity=".7" stroke-width="1"/>
  <circle cx="50" cy="70" r="19" fill="#1b2447" stroke="#e7c15d" stroke-width="1.6"/><use href="#rg-crown" x="34" y="56" width="32" height="28"/></svg>`;
const cardHTML = (id, o = {}) => `<div class="rg-card${isJ(id) ? ' rg-jk' : ' rg-s' + su(id)}${o.cls || ''}"${o.attr || ''}>${cardSVG(id)}</div>`;
const backHTML = (o = {}) => `<div class="rg-card rg-back${o.cls || ''}"${o.attr || ''}>${BACK}</div>`;

const SUIT_PATH = ['M50 92 C8 62 0 38 13 21 C26 7 46 13 50 30 C54 13 74 7 87 21 C100 38 92 62 50 92Z', 'M50 3 L90 50 L50 97 L10 50Z',
  '', 'M50 3 C50 3 5 38 5 62 C5 79 20 87 33 82 C39 80 43 77 45 74 C45 85 41 91 34 97 H66 C59 91 55 85 55 74 C57 77 61 80 67 82 C80 87 95 79 95 62 C95 38 50 3 50 3Z'];
const DEFS = `<defs><linearGradient id="rg-paper" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fffdf4"/><stop offset=".6" stop-color="#f6ecd0"/><stop offset="1" stop-color="#e6d8b2"/></linearGradient>
  <pattern id="rg-lat" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><path d="M0 0H12M0 0V12" stroke="#e7c15d" stroke-opacity=".28" stroke-width=".8"/></pattern></defs>
  <symbol id="rg-s0" viewBox="0 0 100 100"><path d="${SUIT_PATH[0]}" fill="currentColor"/><path d="M26 26 Q34 20 42 28" stroke="#fff" stroke-opacity=".55" stroke-width="4" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="rg-s1" viewBox="0 0 100 100"><path d="${SUIT_PATH[1]}" fill="currentColor" stroke="currentColor" stroke-width="4" stroke-linejoin="round"/><path d="M50 16 L24 50" stroke="#fff" stroke-opacity=".5" stroke-width="4" stroke-linecap="round"/></symbol>
  <symbol id="rg-s2" viewBox="0 0 100 100"><g fill="currentColor"><circle cx="50" cy="27" r="21"/><circle cx="27" cy="60" r="21"/><circle cx="73" cy="60" r="21"/><path d="M42 58 Q45 82 33 96 H67 Q55 82 58 58Z"/></g><circle cx="50" cy="55" r="9" fill="currentColor"/><path d="M40 20 Q44 14 50 14" stroke="#fff" stroke-opacity=".5" stroke-width="4" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="rg-s3" viewBox="0 0 100 100"><path d="${SUIT_PATH[3]}" fill="currentColor"/><path d="M30 44 Q38 32 46 24" stroke="#fff" stroke-opacity=".5" stroke-width="4" fill="none" stroke-linecap="round"/></symbol>
  <symbol id="rg-crown" viewBox="0 0 40 30"><path d="M4 24 L2 7 L12 15 L20 3 L28 15 L38 7 L36 24Z" fill="#f3cf63" stroke="#7a5510" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="24" width="32" height="4" rx="1.5" fill="#d9ac38" stroke="#7a5510" stroke-width="1.6"/><circle cx="20" cy="17" r="2.6" fill="#e0303e"/><circle cx="11" cy="19" r="1.8" fill="#2f6fe0"/><circle cx="29" cy="19" r="1.8" fill="#22a35a"/></symbol>
  <symbol id="rg-sword" viewBox="0 0 40 40"><path d="M8 32 L26 14 L30 10 L32 8 L33 11 L30 14 L26 18 L12 36Z" fill="#dfe6f2" stroke="#4a5468" stroke-width="2" stroke-linejoin="round"/><path d="M6 28 L14 36 M4 38 L10 32" stroke="#b48a3a" stroke-width="3.4" stroke-linecap="round"/></symbol>
  <symbol id="rg-shield" viewBox="0 0 40 40"><path d="M20 3 L35 8 V20 Q35 31 20 38 Q5 31 5 20 V8Z" fill="#3b4a8f" stroke="#c9d3ff" stroke-width="2.4" stroke-linejoin="round"/><path d="M20 9 V32" stroke="#c9d3ff" stroke-opacity=".5" stroke-width="2"/></symbol>`;

const LINES = { J: '시종', Q: '여왕', K: '왕' };
const enemyName = id => `${SUIT_KO[su(id)]} ${LINES[rankLabel(id)]}`;

function validState(st, n) {
  return !!(st && st.v === 1 && st.n === n && Array.isArray(st.hands) && st.hands.length === n && st.enemy && !st.over);
}
const keyOf = c => c.slice().sort((a, b) => a - b).join(',');

function mountRegicide(self, container, ctx) {
  const rng = ctx.rng, th = ctx.theme || {}, n = ctx.players.length;
  const timers = new Set(), speech = {}, logs = [];
  let dead = false, finished = false, lock = false, sel = [];
  const resumed = validState(ctx.resumeState, n) && ctx.players[ctx.resumeState.humanSeat] && ctx.players[ctx.resumeState.humanSeat].human;
  const s = resumed ? ctx.resumeState : self.newGame({ players: ctx.players, rng });
  const hs = s.humanSeat;
  let seenHand = new Set(s.hands[hs]);
  let enterBoss = false;

  container.innerHTML = `<style>${CSS}</style>
    <div class="g-regicide" style="--acc:${th.accent || '#e7c15d'};--tb:${th.table || '#3a1830'};--tb2:${th.table2 || '#180a16'}">
      <svg class="rg-defs" width="0" height="0" aria-hidden="true">${DEFS}</svg>
      <div class="rg-top"><span class="rg-prog"></span><span class="rg-tb"><button data-a="log">기록</button><button data-a="rules">규칙</button></span></div>
      <div class="rg-mates"></div>
      <div class="rg-arena">
        <div class="rg-side"><div class="rg-pile rg-castle" title="성에 남은 왕족"></div><div class="rg-pile rg-tavern" title="술집(뽑는 더미)"></div></div>
        <div class="rg-center"><div class="rg-boss"></div><div class="rg-hpbar"></div></div>
        <div class="rg-side"><div class="rg-pile rg-discard" title="버린 더미"></div><div class="rg-info"></div></div>
      </div>
      <div class="rg-played"></div>
      <div class="rg-dock"></div>
      <div class="rg-hand"></div>
      <div class="rg-ov" hidden></div>
      <div class="rg-toasts"></div>
    </div>`;
  const q = x => container.querySelector(x);
  const root = q('.g-regicide'), topBar = q('.rg-prog'), matesBox = q('.rg-mates'), bossBox = q('.rg-boss'), hpBox = q('.rg-hpbar'),
    castleP = q('.rg-castle'), tavernP = q('.rg-tavern'), discardP = q('.rg-discard'), infoBox = q('.rg-info'), playedBox = q('.rg-played'),
    dock = q('.rg-dock'), handBox = q('.rg-hand'), ov = q('.rg-ov'), toasts = q('.rg-toasts');
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const nameOf = seat => (ctx.players[seat].human ? '나' : ctx.players[seat].name.split(' ').pop());
  const colorOf = seat => ctx.players[seat].color || '#888';
  const fillAv = box => box.querySelectorAll('[data-av]').forEach(e => { if (!e.firstChild) e.append(ctx.avatar(+e.dataset.av, 'css')); });
  const myTurn = () => !s.over && s.turn === hs;
  const D = ms => (ctx.delay ? ctx.delay(ms) : ms);

  // ----- 연출: 앱 공통 이펙트(ctx.fx). 규칙은 먼저 끝내고 화면 연출을 그 위에 얹는다 -----
  const fx = ctx.fx ? ctx.fx.scope(root) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : k === 'rect' || k === 'union' ? () => null : () => Promise.resolve()) });
  const snd = name => fx.sfx(name);

  // ----- 그리기 -----
  function drawTop() {
    const pips = [];
    for (let i = 0; i < 12; i++) {
      const lv = ['J', 'Q', 'K'][Math.floor(i / 4)], done = i < s.defeated, cur = i === s.defeated && !s.over;
      pips.push(`<i class="rg-pp l${lv}${done ? ' done' : ''}${cur ? ' cur' : ''}">${done ? '✦' : lv}</i>`);
    }
    topBar.innerHTML = pips.join('');
  }
  function drawMates() {
    const mates = ctx.players.filter(p => !p.human);
    matesBox.className = 'rg-mates n' + mates.length;
    matesBox.innerHTML = mates.map(pl => {
      const i = pl.seat, h = s.hands[i], sp = speech[i];
      const backs = h.map((_, k) => `<i class="rg-mb" style="--k:${k}"></i>`).join('');
      return `<div class="rg-mate${!s.over && s.turn === i ? ' turn' : ''}" data-seat="${i}" style="--pc:${colorOf(i)}">
        <div class="rg-mh"><span class="rg-av" data-av="${i}"></span><b class="rg-mn">${nameOf(i)}</b><span class="rg-mc">${h.length}<small>/${s.hmax}</small></span></div>
        <div class="rg-mbacks">${backs || '<em>빈손</em>'}</div>
        ${sp ? `<div class="rg-say${sp.fresh ? ' pop' : ''}" data-say="${i}">${esc(sp.t)}</div>` : ''}
      </div>`;
    }).join('');
    Object.values(speech).forEach(x => { x.fresh = false; });
    fillAv(matesBox);
  }
  function drawBoss() {
    const e = s.enemy;
    if (!e) { bossBox.innerHTML = ''; hpBox.innerHTML = ''; return; }
    const need = Math.max(0, e.atk - e.sp), left = Math.max(0, e.hp - e.dmg);
    bossBox.className = 'rg-boss rg-bs' + su(e.id) + (enterBoss ? ' enter' : '');
    enterBoss = false;
    bossBox.innerHTML = `${cardHTML(e.id, { cls: ' rg-big' })}
      <div class="rg-badge rg-atk${e.sp ? ' cut' : ''}"><svg viewBox="0 0 40 40"><use href="#rg-sword"/></svg><b>${need}</b>${e.sp ? `<s>${e.atk}</s>` : ''}</div>
      <div class="rg-badge rg-imm${e.jes ? ' off' : ''}" title="${e.jes ? '광대 때문에 면역이 풀렸어요' : '자기 무늬의 힘이 통하지 않아요'}"><svg viewBox="0 0 40 40"><use href="#rg-shield"/></svg><span style="color:${e.jes ? '#8d8ba0' : '#fff'}">${SUIT_SYM[su(e.id)]}</span></div>`;
    hpBox.innerHTML = `<div class="rg-hp"><i style="width:${(left / e.hp) * 100}%"></i><b>${left}<small>/${e.hp}</small></b></div><div class="rg-en">${enemyName(e.id)}${e.jes ? ' · 면역 해제' : ''}</div>`;
  }
  function drawPiles() {
    castleP.innerHTML = `${backHTML({ cls: ' rg-pb rg-cb' })}<b>${s.castle.length + (s.enemy ? 1 : 0)}</b><small>성</small>`;
    tavernP.innerHTML = `${s.tavern.length ? backHTML({ cls: ' rg-pb' }) : '<div class="rg-card rg-emptyp"></div>'}<b>${s.tavern.length}</b><small>술집</small>`;
    discardP.innerHTML = `${s.discard.length ? backHTML({ cls: ' rg-pb rg-dd' }) : '<div class="rg-card rg-emptyp"></div>'}<b>${s.discard.length}</b><small>버린 더미</small>`;
    infoBox.innerHTML = `<span>손패 한도 <b>${s.hmax}</b></span><span>양보 ${s.streak}/${s.n - 1}</span>${s.jesterUsed ? `<span>광대 ${s.jesterUsed}</span>` : ''}`;
  }
  function drawPlayed() {
    const tot = s.played.reduce((a, c) => a + val(c), 0);
    playedBox.innerHTML = s.played.length ? `<span class="rg-pl">이 싸움에 쓴 카드</span>${s.played.map(c => cardHTML(c, { cls: ' rg-mini' })).join('')}<span class="rg-pt">${tot}</span>` : '<span class="rg-pl dim">아직 아무도 공격하지 않았어요</span>';
  }
  const legalKeys = () => new Set(playMoves(s.hands[hs]).map(m => keyOf(m.c)));
  function canAdd(c) {
    if (sel.includes(c)) return true;
    const want = keyOf([...sel, c]);
    return playMoves(s.hands[hs]).some(m => { const k = new Set(m.c); return [...sel, c].every(x => k.has(x)); }) || want === '';
  }
  function drawHand() {
    const h = s.hands[hs], act = myTurn() && !lock;
    const suffer = s.phase === 'suffer', cover = suffer ? sel.reduce((a, c) => a + val(c), 0) : 0;
    handBox.style.setProperty('--n', Math.max(2, h.length));
    handBox.className = 'rg-hand' + (myTurn() ? ' turn' : '');
    handBox.innerHTML = h.length ? h.map((c, k) => {
      const isSel = sel.includes(c), fresh = !seenHand.has(c);
      let off = false;
      if (myTurn() && s.phase === 'play') off = sel.length > 0 && !canAdd(c);
      else if (suffer) off = !isSel && cover >= s.need;
      return cardHTML(c, { cls: (isSel ? ' sel' : '') + (off ? ' off' : '') + (fresh ? ' deal' : '') + (act ? ' live' : ''), attr: ` data-c="${c}" style="--k:${k}"` });
    }).join('') : '<div class="rg-nohand">손패가 없어요</div>';
    seenHand = new Set(h);
  }
  function effText(ids) {
    const e = s.enemy, A = ids.reduce((a, c) => a + val(c), 0), suits = [...new Set(ids.filter(c => !isJ(c)).map(su))].sort();
    if (ids.length === 1 && isJ(ids[0])) return `<span class="rg-eff on">★ 광대: 면역 풀기 · 반격 없음 · 다음 사람 지목</span>`;
    const parts = [];
    suits.forEach(x => {
      const imm = !e.jes && su(e.id) === x;
      const t = [`회복 ${Math.min(A, s.discard.length)}장`, `보급 ${A}장`, `피해 ×2`, `반격 −${A}`][x];
      parts.push(`<span class="rg-eff s${x}${imm ? ' imm' : ' on'}">${SUIT_SYM[x]} ${imm ? '면역' : t}</span>`);
    });
    const club = suits.includes(2) && (e.jes || su(e.id) !== 2);
    return `<span class="rg-eff dmg">피해 <b>${A * (club ? 2 : 1)}</b></span>${parts.join('')}`;
  }
  function drawDock() {
    const parts = [];
    const msg = (b, sm) => `<div class="rg-msg"><b>${b}</b>${sm ? `<small>${sm}</small>` : ''}</div>`;
    const btn = (a, label, on = true, cls = '') => `<button class="rg-btn ${cls}" data-a="${a}"${on ? '' : ' disabled'}>${label}</button>`;
    const e = s.enemy;
    if (s.over) parts.push(msg(s.won ? '성을 되찾았어요!' : '쓰러졌어요…'));
    else if (!myTurn()) {
      const w = s.phase === 'suffer' ? '반격을 막는 중…' : s.phase === 'next' ? '다음 사람을 고르는 중…' : '생각 중…';
      parts.push(msg(`${nameOf(s.turn)} ${w}`, s.last && s.last.seat !== hs ? lastText(s.last) : ''));
    } else if (s.phase === 'next') {
      parts.push(msg('다음에 누가 나설까요?'), `<div class="rg-nx">${ctx.players.map(p => `<button class="rg-btn" data-nx="${p.seat}"><span class="rg-av" data-av="${p.seat}" style="--pc:${colorOf(p.seat)}"></span>${p.human ? '나' : nameOf(p.seat)}<small>${s.hands[p.seat].length}장</small></button>`).join('')}</div>`);
    } else if (s.phase === 'suffer') {
      const cover = sel.reduce((a, c) => a + val(c), 0), ok = cover >= s.need;
      parts.push(msg(`반격 ${s.need}! 카드 값 ${s.need} 이상을 버리세요`, `고른 값 ${cover} / ${s.need}${ok ? ' ✓' : ''}`), btn('auto', '추천'), btn('suffer', '버리기', ok, 'bad'));
    } else {
      const ids = sel.slice(), legal = ids.length && legalKeys().has(keyOf(ids));
      if (!ids.length) {
        const yok = s.streak < s.n - 1;
        parts.push(msg('내 차례 — 카드를 골라 내세요', `${enemyName(e.id)} 체력 ${e.hp - e.dmg} · 반격 ${Math.max(0, e.atk - e.sp)}`), btn('yield', '양보', yok, 'ghost'));
      } else {
        parts.push(`<div class="rg-effs">${legal ? effText(ids) : '<span class="rg-eff dim">이 조합으로는 낼 수 없어요 — 같은 숫자 2~4장(합 10 이하) · A+카드 · 한 장</span>'}</div>`, btn('clear', '취소', true, 'ghost'), btn('play', '내기', !!legal, 'go'));
      }
    }
    dock.className = 'rg-dock' + (myTurn() ? ' mine' : '');
    dock.innerHTML = parts.join('');
    fillAv(dock);
  }
  function lastText(L) {
    if (!L) return '';
    if (L.t === 'play') return `${L.c.map(cardName).join(' ')} · 피해 ${L.dmg}${L.kill ? ' · 격파!' : ''}${L.heal ? ` · 회복 ${L.heal}` : ''}${L.draw && L.draw.length ? ` · 보급 ${L.draw.length}` : ''}${L.red ? ` · 반격 −${L.red}` : ''}`;
    if (L.t === 'yield') return '양보';
    if (L.t === 'jester') return '광대를 냈어요';
    if (L.t === 'next') return `${nameOf(L.p)}에게 넘김`;
    return '';
  }
  function draw() { drawTop(); drawMates(); drawBoss(); drawPiles(); drawPlayed(); drawDock(); drawHand(); }

  // ----- 연출 도구 -----
  function toast(t, cls = '') { const d = document.createElement('div'); d.className = 'rg-toast ' + cls; d.textContent = t; toasts.append(d); later(() => d.remove(), D(2200)); }
  const panelOf = seat => (seat === hs ? handBox : matesBox.querySelector(`[data-seat="${seat}"]`));
  const rectOf = el => (el ? fx.rect(el) : null);
  const wOf = r => (r ? (r.w != null ? r.w : r.width) : 0);
  function ghost(html, fromRect, to, o = {}) {
    if (!fx.on || !fromRect || !to) return Promise.resolve();
    const box = document.createElement('div'); box.innerHTML = html; const node = box.firstElementChild; if (!node) return Promise.resolve();
    const w = o.w || wOf(fromRect) || 56;
    node.style.setProperty('--cw', w + 'px');
    return fx.fly({ from: fromRect, to, node, size: { w, h: w * 1.4 }, delay: o.delay || 0, dur: o.dur || 420, scale: o.scale == null ? 0.7 : o.scale, arc: o.arc == null ? 0.2 : o.arc, spin: o.spin || 0, fade: o.fade });
  }
  function floatAt(el, t, color = '#ffe08a', size = 30) { if (el) fx.float(el, t, { color, size }); }
  function log(t, cls = '') { logs.push({ t, cls }); if (logs.length > 160) logs.shift(); }
  function say(seat, key) {
    if (ctx.players[seat].human || speech[seat]) return;
    const t = ctx.say(seat, key); if (!t) return;
    speech[seat] = { t, fresh: true };
    log(`「${nameOf(seat)}」 ${t}`, 'sp');
    drawMates();
    later(() => { delete speech[seat]; drawMates(); }, ctx.readMs(t));
  }
  function confetti() {
    const box = document.createElement('div'); box.className = 'rg-conf';
    const cols = ['#d6334c', '#e58a1b', '#23895a', '#6b7cff', '#e7c15d', '#fff'];
    for (let i = 0; i < 46; i++) { const e = document.createElement('i'); e.style.cssText = `left:${(i * 37) % 100}%;background:${cols[i % 6]};animation-delay:${(i % 10) * 0.08}s;animation-duration:${1.7 + (i % 7) * 0.15}s`; box.append(e); }
    root.append(box); later(() => box.remove(), 3400);
  }

  // ----- 진행 -----
  const cardRect = (c, seat) => (seat === hs ? rectOf(handBox.querySelector(`[data-c="${c}"]`)) : rectOf(panelOf(seat)));
  function step(seat, moves, reason) {
    if (s.over) return;
    const t0 = moves[0].t, bossEl = bossBox.firstElementChild;
    const pre = {
      cards: t0 === 'play' ? moves[0].c.map(c => cardRect(c, seat)) : t0 === 'disc' ? moves.map(m => cardRect(m.c, seat)) : [],
      boss: rectOf(bossEl), tav: rectOf(tavernP.firstElementChild), dis: rectOf(discardP.firstElementChild), castle: rectOf(castleP.firstElementChild),
      oldEnemy: s.enemy ? s.enemy.id : null, defBefore: s.defeated, hpBefore: s.enemy ? s.enemy.hp - s.enemy.dmg : 0
    };
    const fxAll = []; let last = null;
    moves.forEach(m => { self.applyMove(s, m); fxAll.push(...s.fx); last = s.last; });
    sel = [];
    const killed = fxAll.find(f => f.t === 'kill');
    if (killed && !s.over) enterBoss = true;
    if (!s.over && ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s)));
    lock = seat === hs;
    draw();
    if (seat === hs) later(() => { lock = false; drawHand(); }, D(650));
    animate(seat, moves, fxAll, last, pre, reason);
    if (s.over) return finish();
    loop();
  }
  function animate(seat, moves, fxAll, L, pre, reason) {
    const t0 = moves[0].t, who = nameOf(seat), bossEl = () => bossBox.firstElementChild, panel = panelOf(seat);
    let t = 0;
    const at = (ms, fn) => later(fn, D(ms));
    if (t0 === 'play' && L.t === 'play') {
      snd('card');
      pre.cards.forEach((r, k) => ghost(cardHTML(moves[0].c[k]), r, bossBox, { delay: k * 70, dur: 380, scale: 0.55, spin: k % 2 ? 8 : -8 }));
      t = 380 + moves[0].c.length * 70;
      log(`${who}: ${L.c.map(cardName).join(' ')} (피해 ${L.dmg}${L.club ? ' · 두 배' : ''})${L.red ? ` · 반격 −${L.red}` : ''}${L.heal ? ` · 회복 ${L.heal}장` : ''}${L.draw.length ? ` · 보급 ${L.draw.length}장` : ''}`);
      if (L.imm.length) log(`  ${L.imm.map(x => SUIT_SYM[x]).join('')} 힘은 이 왕족에게 통하지 않아요`, 'dim');
      at(t, () => {
        const b = bossEl(); snd('slam'); if (b) { fx.slam(b); fx.shake(b, 5); }
        fx.buzz(14); floatAt(bossBox, `−${L.dmg}`, L.club ? '#ffd34d' : '#ffb4a8', 34);
        if (L.club) { snd('gain'); floatAt(bossBox, '×2', '#ffd34d', 24); if (b) fx.burst(b, { color: ['#ffd34d', '#fff', '#e58a1b'], n: 14 }); }
        if (L.red) { floatAt(bossBox.querySelector('.rg-atk'), `−${L.red}`, '#9db4ff', 26); fx.glow(bossBox.querySelector('.rg-atk'), '#7f95ff'); }
      });
      t += 380;
      for (const f of fxAll) {
        if (f.t === 'heal') {
          at(t, () => { snd('place'); for (let k = 0; k < Math.min(4, f.n); k++) ghost(backHTML(), rectOf(discardP.firstElementChild), tavernP, { delay: k * 90, w: 36, dur: 420, scale: 0.9 }); floatAt(tavernP, `+${f.n} 회복`, '#ff8da0', 22); });
          t += 480;
        }
        if (f.t === 'draw') {
          at(t, () => {
            snd('deal');
            f.list.forEach(([p], k) => ghost(backHTML(), rectOf(tavernP.firstElementChild), panelOf(p), { delay: k * 110, w: 38, dur: 460, scale: 0.9 }));
            const who2 = [...new Set(f.list.map(x => x[0]))]; who2.forEach(p => { const pn = panelOf(p); if (pn) { fx.pop(pn, 1.03); floatAt(pn, `+${f.list.filter(x => x[0] === p).length}`, '#ffc46b', 24); } });
          });
          t += 450 + f.list.length * 110;
        }
      }
      const kill = fxAll.find(f => f.t === 'kill');
      if (kill) {
        at(t, () => {
          snd('gain'); fx.buzz(26);
          if (pre.boss) ghost(cardHTML(kill.id, { cls: ' rg-big' }), pre.boss, kill.exact ? tavernP : discardP, { w: wOf(pre.boss), dur: 640, scale: 0.28, spin: 24, arc: 0.3, fade: true });
          fx.burst(bossBox, { color: ['#ffd34d', '#fff', '#ff8da0'], n: 22, spread: 90 });
          toast(`${enemyName(kill.id)} 격파!${kill.exact ? ' (정확히 — 술집 맨 위로)' : ''}`, 'gold'); log(`${enemyName(kill.id)} 격파!${kill.exact ? ' 정확히 맞춰 술집 맨 위로' : ''}`, 'good');
          if (!s.over) at(520, () => { snd('flip'); const b = bossEl(); if (b) fx.flip(b); });
        });
        if (seat !== hs) say(seat, 'good'); else ctx.players.forEach(p => { if (!p.human && rng.chance(0.4)) say(p.seat, 'good'); });
        t += 700;
      }
    } else if (t0 === 'yield') {
      log(`${who}: 양보 — 반격을 받아요`); snd('tap');
    } else if (t0 === 'play' && L.t === 'jester') {
      snd('flip'); pre.cards.forEach(r => ghost(cardHTML(moves[0].c[0]), r, bossBox, { dur: 400, scale: 0.55 }));
      at(420, () => { snd('gain'); const b = bossEl(); if (b) fx.glow(b, '#c58cff'); floatAt(bossBox, '면역 해제!', '#e4b8ff', 24); fx.burst(bossBox, { color: ['#b04ac2', '#2aa8a0', '#f1cf6a'], n: 14 }); });
      log(`${who}: 광대! 면역이 풀리고 이번 반격은 없어요`, 'good'); toast(`${who}: 광대 — 반격 없이 다음 사람을 고릅니다`, 'gold');
    } else if (t0 === 'next') {
      log(`${who}: ${nameOf(moves[0].p)}에게 차례를 넘김`); snd('tap');
    } else if (t0 === 'disc') {
      snd('card'); pre.cards.forEach((r, k) => ghost(cardHTML(moves[k].c), r, discardP, { delay: k * 80, dur: 420, scale: 0.3, fade: true, spin: 14 }));
      log(`${who}: ${moves.map(m => cardName(m.c)).join(' ')} 버림`, 'dim');
    }
    // 반격
    const hit = fxAll.find(f => f.t === 'hit');
    if (hit && hit.need > 0) {
      at(t + 100, () => {
        snd('bad'); fx.buzz(34); const pn = panelOf(hit.seat);
        if (pn) { fx.shake(pn, 7); floatAt(pn, `−${hit.need}`, '#ff6b78', 30); }
        const b = bossEl(); if (b) fx.shake(b, 6);
        root.classList.add('rg-flash'); later(() => root.classList.remove('rg-flash'), D(380));
        log(`반격! ${nameOf(hit.seat)}에게 ${hit.need}${hit.sp ? ` (방어 −${hit.sp})` : ''}`, 'bad');
        if (hit.seat !== hs) say(hit.seat, 'bad');
      });
    } else if (hit && hit.need === 0) { at(t + 100, () => { toast('반격을 완전히 막았어요!', 'blue'); snd('gain'); }); log('반격을 완전히 막았어요', 'good'); }
    void reason;
  }
  function loop(first) {
    if (dead || s.over) return;
    const seat = s.turn, p = ctx.players[seat];
    if (p.human) { if (fx.buzz && s.phase === 'play') fx.buzz(12); return; }
    const wait = first ? 1900 : s.phase === 'play' ? 1250 : s.phase === 'suffer' ? 900 : 700;
    later(() => {
      if (s.phase === 'suffer') {                                   // 반격은 한 번에 처리해서 한 번에 보여 준다
        const mv = [], sim = JSON.parse(JSON.stringify(s));
        while (sim.phase === 'suffer' && sim.turn === seat && !sim.over) { const ch = self.botChoose(sim, p.traits, rng, { seat }); self.applyMove(sim, ch.move); mv.push(ch.move); }
        return step(seat, mv, 'guard');
      }
      const ch = self.botChoose(s, p.traits, rng, { seat, rivalSeats: p.rivalSeats, allySeats: p.allySeats });
      step(seat, [ch.move], ch.reason);
    }, D(wait));
  }
  function finish() {
    if (finished) return; finished = true;
    if (ctx.clearAutosave) ctx.clearAutosave();
    const res = self.result(s);
    ctx.players.forEach(p => { if (!p.human) say(p.seat, s.won ? 'win' : 'lose'); });
    log(s.won ? '성을 되찾았어요!' : `패배 — ${whyText()}`, s.won ? 'good' : 'bad');
    later(() => {
      if (s.won) { snd('win'); confetti(); fx.burst(root, { color: ['#ffd34d', '#fff', '#ff8da0', '#6b7cff'], n: 30, spread: 140 }); } else { snd('lose'); fx.shake(root, 8); }
      const pips = Array.from({ length: 12 }, (_, i) => `<i class="rg-pp l${['J', 'Q', 'K'][Math.floor(i / 4)]}${i < s.defeated ? ' done' : ''}">${i < s.defeated ? '✦' : ['J', 'Q', 'K'][Math.floor(i / 4)]}</i>`).join('');
      openOv(`<h3 class="rg-ft ${s.won ? 'win' : 'lose'}">${s.won ? '성을 되찾았다!' : '성은 아직 그들의 것'}</h3><div class="rg-fprog">${pips}</div>
        <p class="rg-fs">${s.won ? `왕족 12명을 모두 쓰러뜨렸어요 · ${s.moves}수 · 광대 ${s.jesterUsed}번 사용` : `${whyText()}<br>왕족 ${s.defeated}/12명 격파 · ${s.moves}수`}</p>
        <button class="rg-btn go wide" data-a="finish">기록 저장하고 마치기</button>`, true);
      ov._res = res;
    }, D(1500));
  }
  function whyText() {
    if (s.why === 'stuck') return `${nameOf(s.turn)}은(는) 낼 카드도, 양보할 수도 없었어요`;
    const p = s.turn; return `${nameOf(p)}이(가) 반격(${s.enemy ? Math.max(0, s.enemy.atk - s.enemy.sp) : 0})을 막지 못했어요`;
  }

  // ----- 겹쳐 뜨는 창 -----
  function openOv(html, keep) { ov.innerHTML = `<div class="rg-sheet">${html}${keep ? '' : '<button class="rg-btn wide" data-a="close">닫기</button>'}</div>`; ov.hidden = false; fillAv(ov); }
  function openLog() { openOv(`<h3 class="rg-ft">진행 기록</h3><div class="rg-log">${logs.slice().reverse().map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join('') || '<div>아직 기록이 없어요</div>'}</div>`); }
  function openRules() {
    openOv(`<h3 class="rg-ft">규칙</h3><ul class="rg-rules">
      <li><b>목표</b> 성의 왕족 12명(J → Q → K, 각 4명)을 모두 쓰러뜨리면 승리. 한 명이라도 반격을 막지 못하면 모두 패배.</li>
      <li><b>내 차례 ①</b> 카드를 냅니다: 한 장 · 같은 숫자 2~4장(합 10 이하) · <b>A + 아무 카드 한 장</b> · 광대 단독. 또는 <b>양보</b>(직전에 다른 모두가 양보했다면 불가).</li>
      <li><b>무늬의 힘</b> ♥ 버린 더미를 섞어 N장을 술집 맨 아래로 · ♦ N장을 나부터 한 장씩 돌아가며 뽑기(손패 한도까지) · ♣ 피해 두 배 · ♠ 이 싸움 동안 왕족의 공격력 −N(계속 쌓임). N은 낸 카드의 합.</li>
      <li>왕족은 <b>자기 무늬의 힘에 면역</b>이에요(숫자는 피해·방어에 그대로 쓰여요).</li>
      <li><b>② 격파</b> 누적 피해가 체력(J 20 · Q 30 · K 40) 이상이면 쓰러집니다. <b>정확히 같으면</b> 술집 맨 위로, 아니면 버린 더미로. 격파한 사람은 반격 없이 한 번 더 냅니다.</li>
      <li><b>③ 반격</b> 못 쓰러뜨렸다면 공격력(J 10 · Q 15 · K 20, ♠ 만큼 감소) 이상의 값을 손패에서 버려야 해요. 못 막으면 패배.</li>
      <li><b>카드 값</b> A=1 · 2~10=숫자 · J=10 · Q=15 · K=20 · 광대=0. 손패 한도는 2인 7 · 3인 6 · 4인 5장.</li>
      <li><b>광대</b> 단독으로 내면 이 싸움 동안 면역이 풀리고(이미 낸 ♣는 소급 안 됨), 반격 없이 다음 사람을 내가 고릅니다. (3인 1장 · 4인 2장, 2인은 없음)</li>
      <li>AI 동료들은 서로의 손패를 알고 의논하는 것으로 처리해요. 술집의 카드 순서는 아무도 몰라요.</li></ul>`);
  }

  // ----- 입력 -----
  function humanAct(moves) { if (lock || !myTurn()) { snd('bad'); return; } step(hs, moves, 'human'); }
  function autoPick() {
    const pick = discardPick(s, hs, s.need); sel = pick.slice(); snd('tap'); drawHand(); drawDock();
  }
  root.addEventListener('click', e => {
    if (dead) return;
    const t = e.target;
    const sayEl = t.closest('[data-say]');
    if (sayEl) { delete speech[+sayEl.dataset.say]; drawMates(); return; }
    const a = t.closest('[data-a]');
    if (a && !a.disabled) {
      const k = a.dataset.a;
      if (k === 'log') return openLog();
      if (k === 'rules') return openRules();
      if (k === 'close') { ov.hidden = true; ov.innerHTML = ''; return; }
      if (k === 'finish') { a.disabled = true; ov.hidden = true; ctx.finish(ov._res); return; }
      if (k === 'clear') { sel = []; snd('tap'); drawHand(); return drawDock(); }
      if (k === 'auto') return autoPick();
      if (!myTurn()) return;
      if (k === 'play') { if (!legalKeys().has(keyOf(sel))) { snd('bad'); return; } if (fx.buzz) fx.buzz(8); return humanAct([{ t: 'play', c: sel.slice().sort((x, y) => x - y) }]); }
      if (k === 'yield') { if (s.streak >= s.n - 1) { snd('bad'); toast('모두가 양보했어요 — 이번엔 꼭 내야 해요'); return; } return humanAct([{ t: 'yield' }]); }
      if (k === 'suffer') {
        let need = s.need; const mv = sel.slice().sort((x, y) => val(y) - val(x)).filter(c => { if (need <= 0) return false; need -= val(c); return true; });
        if (need > 0) { snd('bad'); return; }
        return humanAct(mv.map(c => ({ t: 'disc', c })));
      }
      return;
    }
    const nx = t.closest('[data-nx]');
    if (nx && myTurn() && s.phase === 'next') return humanAct([{ t: 'next', p: +nx.dataset.nx }]);
    if (e.target === ov && !finished) { ov.hidden = true; ov.innerHTML = ''; return; }
    const card = t.closest('.rg-hand [data-c]');
    if (card && myTurn() && !lock) {
      const c = +card.dataset.c;
      if (s.phase === 'play') {
        if (sel.includes(c)) sel = sel.filter(x => x !== c); else if (sel.length === 0 || canAdd(c)) sel.push(c); else { snd('bad'); return; }
        snd('tap'); if (fx.buzz) fx.buzz(6);
      } else if (s.phase === 'suffer') {
        const cover = sel.reduce((x, y) => x + val(y), 0);
        if (sel.includes(c)) sel = sel.filter(x => x !== c); else if (cover < s.need) sel.push(c); else { snd('bad'); return; }
        snd('tap');
      } else return;
      drawHand(); drawDock();
    }
  });

  // ----- 시작 -----
  log(resumed ? `이어서 하기 · ${s.defeated}/12명 격파` : `새 게임! ${n}인 · 손패 ${s.hmax}장 · ${nameOf(0)}부터 시작합니다.`);
  draw();
  if (!resumed) {
    if (ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s)));
    ctx.players.forEach((p, i) => { if (!p.human) later(() => say(i, 'start'), D(300 + i * 500)); });
    later(() => { snd('deal'); const b = bossBox.firstElementChild; if (b) fx.flip(b); }, D(200));
  }
  loop(true);
  return { destroy() { dead = true; timers.forEach(clearTimeout); timers.clear(); container.querySelectorAll('.fx-layer').forEach(e => e.remove()); } };
}

const CSS = `
.g-regicide{position:relative;container-type:inline-size;padding:7px 6px 9px;border-radius:18px;color:#f3ecda;font-family:var(--fk);user-select:none;-webkit-user-select:none;overflow:hidden;
 --hw:min(20cqw,80px,calc((100dvh - 420px) / 3.8));--bw:min(34cqw,130px,calc((100dvh - 420px) / 2.3));
 background:radial-gradient(90% 40% at 50% 0%,#ffffff1a,transparent 70%),repeating-linear-gradient(45deg,#ffffff05 0 2px,#0000 2px 7px),radial-gradient(130% 90% at 50% 38%,var(--tb),var(--tb2));
 box-shadow:inset 0 0 0 3px #2a1208,inset 0 0 0 5px #b48a3a,inset 0 0 54px #000b,0 10px 24px #0006}
.g-regicide *{box-sizing:border-box}
.g-regicide [hidden]{display:none!important}
.g-regicide button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;color:inherit}
.g-regicide .rg-defs{position:absolute;width:0;height:0;overflow:hidden}
.g-regicide.rg-flash:after{content:"";position:absolute;inset:0;background:radial-gradient(70% 60% at 50% 50%,#0000,#d6334c88);pointer-events:none;animation:rgflash .38s ease-out;z-index:30}
@keyframes rgflash{from{opacity:1}to{opacity:0}}

/* 카드 */
.g-regicide .rg-card{position:relative;width:var(--cw,56px);aspect-ratio:5/7;flex:none;border-radius:calc(var(--cw,56px)*.085);filter:drop-shadow(0 2px 3px #000a)}
.g-regicide .rg-face{display:block;width:100%;height:100%;overflow:visible}
.g-regicide .rg-ix{font:800 19px/1 var(--fd,Georgia),serif;font-family:Georgia,'Times New Roman',serif}
.g-regicide .rg-big{--cw:var(--bw)}
.g-regicide .rg-mini{--cw:25px;filter:drop-shadow(0 1px 2px #000a)}
.g-regicide .rg-pb{--cw:34px}
.g-regicide .rg-cb{filter:drop-shadow(0 2px 3px #000a) hue-rotate(110deg) saturate(1.3)}
.g-regicide .rg-dd{opacity:.65;filter:grayscale(.5) drop-shadow(0 2px 3px #000a)}
.g-regicide .rg-emptyp{--cw:34px;border:1.5px dashed #ffffff44;background:#0003;filter:none}

/* 윗줄 */
.g-regicide .rg-top{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 3px 5px}
.g-regicide .rg-prog{display:flex;gap:2px;flex-wrap:nowrap;min-width:0}
.g-regicide .rg-pp{font:700 9px/1 sans-serif;font-style:normal;width:15px;height:19px;border-radius:3px;display:grid;place-items:center;color:#cbb88e;background:#0005;border:1px solid #ffffff2a}
.g-regicide .rg-pp.lQ{margin-left:0}.g-regicide .rg-pp:nth-child(4n+1){margin-left:5px}.g-regicide .rg-pp:first-child{margin-left:0}
.g-regicide .rg-pp.done{background:linear-gradient(#ffe08a,#b8860b);color:#4a2f00;border-color:#fff3;box-shadow:0 0 6px #e7c15d88}
.g-regicide .rg-pp.cur{border-color:var(--acc);color:#fff;animation:rgblink 1s ease-in-out infinite alternate}
@keyframes rgblink{from{box-shadow:0 0 0 #0000}to{box-shadow:0 0 8px var(--acc)}}
.g-regicide .rg-tb{margin-left:auto;display:flex;gap:4px}
.g-regicide .rg-tb button{border:1px solid #ffffff3a;background:#0004;border-radius:999px;font-size:11px;padding:2px 9px;min-height:22px}

/* 동료 */
.g-regicide .rg-mates{display:grid;gap:5px;margin-bottom:6px;position:relative;z-index:3}
.g-regicide .rg-mates.n1{grid-template-columns:1fr}.g-regicide .rg-mates.n2{grid-template-columns:1fr 1fr}.g-regicide .rg-mates.n3{grid-template-columns:1fr 1fr 1fr}
.g-regicide .rg-mate{position:relative;background:linear-gradient(#ffffff14,#0000003a);border:1.5px solid #ffffff22;border-radius:11px;padding:4px 5px 5px;min-width:0;transition:box-shadow .3s,border-color .3s}
.g-regicide .rg-mate.turn{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 0 14px #e7c15d88}
.g-regicide .rg-mh{display:flex;align-items:center;gap:4px;margin-bottom:3px;min-width:0}
.g-regicide .rg-av{flex:none;width:22px;height:22px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2px var(--pc,#888),0 1px 3px #000a;display:block;background:#333}
.g-regicide .rg-av>*{width:100%!important;height:100%!important;display:grid;place-items:center;font-size:10px;border-radius:50%}
.g-regicide .rg-mn{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.g-regicide .rg-mate.turn .rg-mn:after{content:" …";animation:rgblink .6s infinite alternate}
.g-regicide .rg-mc{font:700 16px/1 var(--fd,Georgia);color:#ffe9a6;text-shadow:0 1px 2px #000}.g-regicide .rg-mc small{font-size:10px;opacity:.7}
.g-regicide .rg-mbacks{display:flex;height:34px;align-items:center;padding-left:2px;overflow:hidden}
.g-regicide .rg-mbacks em{font-size:11px;opacity:.55;font-style:normal}
.g-regicide .rg-mb{flex:none;width:22px;height:31px;border-radius:3.5px;margin-left:-11px;border:1px solid #e7c15d99;background:repeating-linear-gradient(45deg,#e7c15d33 0 2px,#0000 2px 5px),linear-gradient(160deg,#2b3870,#141c3d);box-shadow:0 1px 3px #000a;transform:rotate(calc((var(--k) - 2) * 3deg))}
.g-regicide .rg-mb:first-child{margin-left:0}
.g-regicide .rg-say{position:absolute;left:6px;right:6px;top:100%;margin-top:3px;z-index:6;background:#fff8e4;color:#2a1a0a;border-radius:9px;padding:4px 8px;font-size:12px;line-height:1.3;box-shadow:0 3px 8px #0009;cursor:pointer}
.g-regicide .rg-say:before{content:"";position:absolute;left:14px;top:-5px;border:5px solid transparent;border-top:0;border-bottom-color:#fff8e4}
.g-regicide .rg-say.pop{animation:rgpop .25s ease-out}
@keyframes rgpop{from{transform:scale(.7);opacity:0}to{transform:none;opacity:1}}

/* 경기장 */
.g-regicide .rg-arena{display:grid;grid-template-columns:1fr auto 1fr;gap:4px;align-items:center;margin:2px 0 4px}
.g-regicide .rg-side{display:flex;flex-direction:column;gap:8px;align-items:center}
.g-regicide .rg-pile{position:relative;display:flex;flex-direction:column;align-items:center;gap:1px;min-height:62px;justify-content:flex-start}
.g-regicide .rg-pile b{position:absolute;top:10px;left:50%;transform:translateX(-50%);font:800 15px/1 var(--fd,Georgia);color:#fff;text-shadow:0 1px 3px #000,0 0 6px #000}
.g-regicide .rg-pile small{font-size:10px;opacity:.8;margin-top:2px}
.g-regicide .rg-info{display:flex;flex-direction:column;align-items:center;gap:1px;font-size:10px;opacity:.85}
.g-regicide .rg-info b{color:#ffe9a6}
.g-regicide .rg-center{display:flex;flex-direction:column;align-items:center;gap:5px}
.g-regicide .rg-boss{position:relative;width:var(--bw);border-radius:8px}
.g-regicide .rg-boss .rg-card{filter:none;box-shadow:0 0 0 2px #f1cf6a,0 0 0 4px #5a3d0a,0 6px 16px #000b,0 0 22px var(--gl);animation:rgaura 2.4s ease-in-out infinite alternate}
.g-regicide .rg-bs0{--gl:#d6334c99}.g-regicide .rg-bs1{--gl:#e58a1b99}.g-regicide .rg-bs2{--gl:#23895a99}.g-regicide .rg-bs3{--gl:#5a68d099}
@keyframes rgaura{from{box-shadow:0 0 0 2px #f1cf6a,0 0 0 4px #5a3d0a,0 6px 16px #000b,0 0 10px var(--gl)}to{box-shadow:0 0 0 2px #f1cf6a,0 0 0 4px #5a3d0a,0 6px 16px #000b,0 0 28px var(--gl)}}
.g-regicide .rg-boss.enter .rg-card{animation:rgenter .6s cubic-bezier(.2,.9,.3,1.2) both,rgaura 2.4s .6s ease-in-out infinite alternate}
@keyframes rgenter{0%{opacity:0;transform:translateY(-26px) scale(.82) rotate(-6deg)}100%{opacity:1;transform:none}}
.g-regicide .rg-badge{position:absolute;display:flex;align-items:center;justify-content:center;border-radius:50%;width:38px;height:38px;border:2px solid #f1cf6a;background:radial-gradient(#4a1a24,#1a0a10);box-shadow:0 3px 8px #000c;font-weight:800}
.g-regicide .rg-badge svg{position:absolute;inset:3px;width:calc(100% - 6px);height:calc(100% - 6px);opacity:.28}
.g-regicide .rg-badge b{position:relative;font:800 18px/1 var(--fd,Georgia);color:#fff;text-shadow:0 1px 3px #000}
.g-regicide .rg-badge s{position:absolute;right:-9px;top:-7px;font-size:11px;color:#ff9aa4;background:#000a;border-radius:6px;padding:0 3px}
.g-regicide .rg-atk{left:-14px;bottom:-8px}.g-regicide .rg-atk.cut b{color:#9db4ff}
.g-regicide .rg-imm{right:-12px;top:-8px;background:radial-gradient(#2a3a7a,#0e1436);border-color:#c9d3ff}
.g-regicide .rg-imm svg{opacity:.8}.g-regicide .rg-imm span{position:relative;font-size:17px;text-shadow:0 1px 3px #000}.g-regicide .rg-imm.off{filter:grayscale(1) opacity(.7)}
.g-regicide .rg-hp{position:relative;width:calc(var(--bw) + 22px);height:16px;border-radius:9px;background:#0007;border:1.5px solid #f1cf6a88;overflow:hidden}
.g-regicide .rg-hp i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(#ff8a98,#b3202f);transition:width .5s}
.g-regicide .rg-hp b{position:relative;display:block;text-align:center;font:800 11px/13px var(--fd,Georgia);text-shadow:0 1px 2px #000}.g-regicide .rg-hp small{font-weight:400;opacity:.75}
.g-regicide .rg-en{font-size:11px;color:#ecdcae;text-align:center;margin-top:-2px}

/* 이번 싸움에 낸 카드 */
.g-regicide .rg-played{display:flex;align-items:center;gap:3px;min-height:32px;padding:2px 6px;margin:0 2px 4px;background:#0003;border-radius:9px;overflow:hidden}
.g-regicide .rg-played .rg-mini{margin-left:-8px}.g-regicide .rg-played .rg-pl+.rg-mini{margin-left:0}
.g-regicide .rg-pl{font-size:10px;color:#e9dfc4;margin-right:6px;white-space:nowrap}.g-regicide .rg-pl.dim{opacity:.55}
.g-regicide .rg-pt{margin-left:auto;font:800 14px/1 var(--fd,Georgia);color:#ffe9a6;padding-left:6px}

/* 안내줄 */
.g-regicide .rg-dock{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:50px;padding:5px 7px;margin-bottom:5px;border-radius:12px;background:linear-gradient(#0000002a,#0000005a);border:1px solid #ffffff1a}
.g-regicide .rg-dock.mine{border-color:var(--acc);box-shadow:0 0 0 1px #e7c15d55,inset 0 0 14px #e7c15d22}
.g-regicide .rg-msg{flex:1;min-width:120px;display:flex;flex-direction:column;gap:1px;line-height:1.25}
.g-regicide .rg-msg b{font-size:13px}.g-regicide .rg-msg small{font-size:11px;opacity:.78}
.g-regicide .rg-effs{flex:1;min-width:120px;display:flex;flex-wrap:wrap;gap:4px;align-items:center}
.g-regicide .rg-eff{font-size:11.5px;border-radius:999px;padding:2px 8px;background:#ffffff1c;border:1px solid #ffffff2a}
.g-regicide .rg-eff.dmg{background:#7a1c28;border-color:#ff8a98}.g-regicide .rg-eff.dmg b{font-size:14px}
.g-regicide .rg-eff.s0.on{background:#7d1226aa}.g-regicide .rg-eff.s1.on{background:#8a4a07aa}.g-regicide .rg-eff.s2.on{background:#0e4a2eaa}.g-regicide .rg-eff.s3.on{background:#161c4dcc}
.g-regicide .rg-eff.imm{text-decoration:line-through;opacity:.6}.g-regicide .rg-eff.dim{background:none;border:0;opacity:.7;padding:0}
.g-regicide .rg-eff.on{border-color:#ffffff55}
.g-regicide .rg-btn{border:1.5px solid #ffffff44;background:linear-gradient(#ffffff22,#00000033);border-radius:11px;padding:7px 14px;font-size:14px;font-weight:700;min-height:38px;display:inline-flex;align-items:center;gap:6px;justify-content:center}
.g-regicide .rg-btn.go{background:linear-gradient(#ffe08a,#c9921c);color:#3a2300;border-color:#fff6;text-shadow:0 1px 0 #fff6}
.g-regicide .rg-btn.bad{background:linear-gradient(#ff8a98,#b3202f);border-color:#fff6;color:#fff}
.g-regicide .rg-btn.ghost{background:#0003}
.g-regicide .rg-btn:disabled{opacity:.4;cursor:default}
.g-regicide .rg-btn.wide{width:100%;margin-top:10px}
.g-regicide .rg-btn small{opacity:.7;font-weight:400;font-size:11px}
.g-regicide .rg-nx{display:flex;flex-wrap:wrap;gap:6px;width:100%}.g-regicide .rg-nx .rg-btn{flex:1;min-width:76px;padding:5px 8px}.g-regicide .rg-nx .rg-av{width:20px;height:20px}

/* 내 손패 */
.g-regicide .rg-hand{display:flex;justify-content:center;align-items:flex-end;padding:20px 4px 4px;min-height:calc(var(--hw) * 1.4 + 26px)}
.g-regicide .rg-hand .rg-card{--cw:var(--hw);margin-left:min(5px,calc((100cqw - 22px - var(--hw) * var(--n)) / (var(--n) - 1)));transition:transform .18s ease,filter .18s ease;transform-origin:50% 100%}
.g-regicide .rg-hand .rg-card:first-child{margin-left:0}
.g-regicide .rg-hand .rg-card.live{cursor:pointer}
.g-regicide .rg-hand .rg-card.sel{transform:translateY(-17px);z-index:5;filter:drop-shadow(0 0 7px var(--acc)) drop-shadow(0 4px 5px #000b)}
.g-regicide .rg-hand .rg-card.off{filter:brightness(.45) saturate(.6) drop-shadow(0 2px 3px #000a)}
.g-regicide .rg-hand.turn .rg-card:not(.off):not(.sel){filter:drop-shadow(0 2px 4px #000b) drop-shadow(0 0 3px #e7c15d55)}
.g-regicide .rg-hand .rg-card.deal{animation:rgdeal .38s cubic-bezier(.2,.9,.3,1.2) both;animation-delay:calc(var(--k) * 70ms)}
@keyframes rgdeal{from{opacity:0;transform:translateY(-40px) scale(.7) rotate(-8deg)}to{opacity:1;transform:none}}
.g-regicide .rg-nohand{opacity:.6;font-size:13px;padding:18px 0}

/* 창 */
.g-regicide .rg-ov{position:absolute;inset:0;background:#000b;z-index:40;display:grid;place-items:center;padding:14px;backdrop-filter:blur(2px)}
.g-regicide .rg-sheet{width:100%;max-height:100%;overflow:auto;background:linear-gradient(#2e1626,#180a14);border:2px solid #b48a3a;border-radius:16px;padding:14px;box-shadow:0 12px 32px #000c}
.g-regicide .rg-ft{margin:0 0 8px;font:800 20px/1.2 var(--fd,Georgia);text-align:center;color:#ffe9a6}
.g-regicide .rg-ft.win{color:#ffd34d;text-shadow:0 0 14px #e7c15d}.g-regicide .rg-ft.lose{color:#ff9aa4}
.g-regicide .rg-fs{text-align:center;font-size:13px;opacity:.9;line-height:1.5}
.g-regicide .rg-fprog{display:flex;justify-content:center;gap:2px;margin:8px 0}.g-regicide .rg-fprog .rg-pp{width:19px;height:25px;font-size:11px}
.g-regicide .rg-rules{margin:0;padding-left:18px;font-size:12.5px;line-height:1.55}.g-regicide .rg-rules li{margin-bottom:6px}
.g-regicide .rg-log{font-size:12.5px;line-height:1.5;max-height:60vh;overflow:auto}.g-regicide .rg-log div{padding:2px 0;border-bottom:1px solid #ffffff12}
.g-regicide .rg-log .good{color:#ffe08a}.g-regicide .rg-log .bad{color:#ff9aa4}.g-regicide .rg-log .dim{opacity:.6}.g-regicide .rg-log .sp{color:#bfe3ff}
.g-regicide .rg-toasts{position:absolute;left:0;right:0;top:46%;z-index:35;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.g-regicide .rg-toast{background:#1a0a12ee;border:1.5px solid #b48a3a;border-radius:999px;padding:6px 16px;font-size:13px;font-weight:700;animation:rgtoast 2.2s ease-out both;box-shadow:0 4px 14px #000a}
.g-regicide .rg-toast.gold{color:#ffe08a;border-color:#ffd34d}.g-regicide .rg-toast.blue{color:#c9d3ff;border-color:#8a9cff}
@keyframes rgtoast{0%{opacity:0;transform:translateY(10px) scale(.9)}10%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-8px)}}
.g-regicide .rg-conf{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:45}
.g-regicide .rg-conf i{position:absolute;top:-12px;width:8px;height:14px;border-radius:2px;animation:rgfall linear forwards}
@keyframes rgfall{to{transform:translateY(780px) rotate(720deg);opacity:.9}}
@media (prefers-reduced-motion:reduce){.g-regicide .rg-boss .rg-card,.g-regicide .rg-pp.cur{animation:none}}
`;
game._t.ui = { cardHTML, backHTML, DEFS, CSS };
