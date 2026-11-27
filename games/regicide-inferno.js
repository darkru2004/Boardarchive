// 레지사이드 인페르노 — 1인 전용 협력 카드 게임 (원작: Badgers from Mars). 비공식 개인용 이식.
// 규칙은 한글 룰북(4쪽)을 그대로 옮겼다: 마법사(여관 결합·추방) · 성직자 · 음유시인 · 전사 · 성기사, 적 구역(점점 커지는 반격), 죽은 척하기, 동족 공격(합 12 이하)과 1인용 동료 카드·어릿광대.
// 카드 번호 = 직업*20 + 숫자. 직업 0 마법사 · 1 성직자 · 2 음유시인 · 3 전사 · 4 성기사. 숫자 A=1 · J=11 · Q=12 · K=13. 어릿광대 100·101.
// 더미 배열은 모두 "맨 끝 = 맨 위"(뽑기 = pop). 규칙은 이 파일의 엔진이 전담하고, 봇은 합법 수 안에서만 고른다.

export const CLS_KO = ['마법사', '성직자', '음유시인', '전사', '성기사'];
export const POWER_KO = ['여관 덱에서 카드 하나를 골라 공격에 결합', '버림 더미에서 카드를 여관 덱 아래로 회복', '카드 뽑기', '피해 두 배', '적 공격력 감소'];
const HMAX = 8;
const MAGE_NAME = { 11: '칼란나르', 12: '말리스', 13: '타차에르' };
const TITLE = { 11: '시종', 12: '여왕', 13: '왕' };
export const isJ = id => id >= 100;
export const rk = id => id % 20;
export const cl = id => Math.floor(id / 20);
export const val = id => (isJ(id) ? 0 : ({ 11: 10, 12: 15, 13: 20 })[rk(id)] || rk(id));
export const isFace = id => !isJ(id) && rk(id) >= 11;
export const isMageEnemy = id => !isJ(id) && cl(id) === 0 && rk(id) >= 11;
export const hpOf = id => (isMageEnemy(id) ? { 11: 30, 12: 40, 13: 50 } : { 11: 20, 12: 30, 13: 40 })[rk(id)];
export const rankLabel = id => (isJ(id) ? '★' : ({ 1: 'A', 11: 'J', 12: 'Q', 13: 'K' })[rk(id)] || String(rk(id)));
export const enemyName = id => (isMageEnemy(id) ? MAGE_NAME[rk(id)] : `${CLS_KO[cl(id)]} ${TITLE[rk(id)]}`);
export const cardName = id => (isJ(id) ? '어릿광대' : `${CLS_KO[cl(id)]} ${rankLabel(id)}`);
const sum = a => a.reduce((x, y) => x + y, 0);
const clone = s => JSON.parse(JSON.stringify(s));

function rnd(s) { s.rs = (s.rs + 0x6D2B79F5) | 0; let t = Math.imul(s.rs ^ (s.rs >>> 15), 1 | s.rs); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
function shuf(s, a) { const r = a.slice(); for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd(s) * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; } return r; }

const mkEnemy = id => ({ id, hp: hpOf(id), dmg: 0, sh: 0 });

// ---------- 면역 · 공격력 ----------
// 적은 자기 직업 능력에 면역. 마법사 적 3명은 적 구역에 놓인 카드들의 직업 능력에도 면역. 어릿광대로 만든 공격은 면역을 무시한다.
export function immuneTo(s, c, g) {
  if (g && g.j) return false;
  const e = s.enemy; if (!e) return false;
  if (c === cl(e.id)) return true;
  return isMageEnemy(e.id) && s.zone.some(z => cl(z) === c);
}
export const atkOf = s => (s.enemy ? Math.max(0, val(s.enemy.id) + sum(s.zone.map(val)) - s.enemy.sh) : 0);
export const zoneAtk = s => sum(s.zone.map(val));

// ---------- 합법 수 ----------
function combos(arr, k) {
  const out = [];
  (function rec(i, cur) { if (cur.length === k) { out.push(cur.slice()); return; } for (let j = i; j < arr.length; j++) { cur.push(arr[j]); rec(j + 1, cur); cur.pop(); } })(0, []);
  return out;
}
const byNum = (a, b) => a - b;
// 공격 구성: 한 장 · 동물 동료(A)+다른 카드 한 장 · 같은 숫자 여러 장(합 12 이하, A 불가) · (1인) 같은 숫자 동족 공격에 동료 카드 한 장 추가
export function playMoves(s) {
  const hand = s.hand, out = [], seen = new Set();
  const add = m => { const k = JSON.stringify(m); if (!seen.has(k)) { seen.add(k); out.push(m); } };
  for (const c of hand) add({ t: 'play', c: [c] });
  for (let i = 0; i < hand.length; i++) for (let j = i + 1; j < hand.length; j++) if (rk(hand[i]) === 1 || rk(hand[j]) === 1) add({ t: 'play', c: [hand[i], hand[j]].sort(byNum) });
  const non = hand.filter(c => rk(c) !== 1 && rk(c) <= 10);
  const groups = {};
  for (const c of non) (groups[rk(c)] ||= []).push(c);
  for (const [vs, cs] of Object.entries(groups)) {
    const v = +vs;
    for (let k = 2; k <= cs.length && v * k <= 12; k++) for (const set of combos(cs, k)) add({ t: 'play', c: set.sort(byNum) });
  }
  for (const p of s.aside) {                                  // 동료 카드: 같은 숫자 동족 공격(한 장이라도)에 합 12 이하로 보탤 수 있다
    const v = rk(p);
    const cs = groups[v] || [];
    for (let k = 1; k <= cs.length && v * (k + 1) <= 12; k++) for (const set of combos(cs, k)) add({ t: 'play', c: set.sort(byNum), p });
  }
  return out;
}
export function legalMoves(s) {
  if (s.over) return [];
  if (s.phase === 'play') {
    const m = playMoves(s);
    if (s.jk > 0) for (let k = 1; k <= 4; k++) m.push({ t: 'jester', k });
    m.push({ t: 'yield' });
    return m;
  }
  if (s.phase === 'mage') {
    const m = []; s.pend.look.forEach((c, i) => { if (!isJ(c)) m.push({ t: 'mage', i }); });
    return m;
  }
  if (s.phase === 'dmg') {
    const left = s.need - s.paid, tot = sum(s.hand.map(val));
    if (tot < left) return s.hand.length === s.hmax && s.paid === 0 ? [{ t: 'fake' }] : [];
    return [...new Set(s.hand)].sort(byNum).map(c => ({ t: 'disc', c }));
  }
  return [];
}

// ---------- 진행 ----------
const ev = (s, e) => { s.ev.push(e); };
function lose(s, why) { s.over = true; s.won = false; s.why = why; s.phase = 'over'; s.pend = null; ev(s, { k: 'lose', why }); }
function newTurn(s) { s.phase = 'play'; s.pend = null; s.need = 0; s.paid = 0; s.turns++; }
const hasCls = (g, c) => g.c.some(x => !isJ(x) && cl(x) === c);

function lookTop(s, n) { const look = []; while (look.length < n && s.tavern.length) look.push(s.tavern.pop()); return look; }
function stepMage(s, n) {                                     // 마법사: 공격력(또는 고른 마법사 카드 한 장의 공격력)만큼 여관 위에서 몰래 보고 한 장 고르기
  const look = lookTop(s, n);
  if (!look.length) return finishAttack(s);
  s.phase = 'mage'; s.pend = { k: 'mage', n, look };
  ev(s, { k: 'look', n: look.length });
}
function beginAttack(s, g) {
  s.plays.push(g);
  ev(s, { k: 'play', c: g.c.slice(), j: !!g.j });
  const base = g.j ? 8 : sum(g.c.map(val));
  if (!g.j && hasCls(g, 0) && !immuneTo(s, 0, g)) return stepMage(s, base);
  return finishAttack(s);
}
function finishAttack(s) {
  const g = s.plays[s.plays.length - 1], e = s.enemy;
  const T = g.j ? 8 : sum(g.c.map(val)); g.v = T;
  const cls = g.j ? [g.k] : [...new Set(g.c.filter(c => !isJ(c)).map(cl))];
  const ok = c => cls.includes(c) && !immuneTo(s, c, g);
  const imm = cls.filter(c => c !== 0 && immuneTo(s, c, g));
  if (ok(1)) {                                                 // 성직자: 버림 더미를 섞고 공격력만큼을 여관 덱 맨 아래로
    const sh = shuf(s, s.discard), n = Math.min(T, sh.length);
    const back = sh.slice(sh.length - n); s.discard = sh.slice(0, sh.length - n);
    s.tavern = back.concat(s.tavern);
    ev(s, { k: 'cleric', n });
  }
  if (ok(2)) {                                                 // 음유시인: 손패 한도까지 공격력만큼 뽑기
    let n = 0; while (n < T && s.hand.length < s.hmax && s.tavern.length) { s.hand.push(s.tavern.pop()); n++; }
    s.hand.sort(byNum); ev(s, { k: 'bard', n });
  }
  const x2 = ok(3), dmg = T * (x2 ? 2 : 1);
  e.dmg += dmg; g.d = dmg;
  ev(s, { k: 'dmg', v: dmg, x2, T, imm });
  if (ok(4)) { e.sh += T; ev(s, { k: 'shield', v: T }); }
  if (e.dmg >= e.hp) return defeat(s, e.dmg === e.hp);
  return enterDamage(s);
}
function enterDamage(s) {
  s.phase = 'dmg'; s.need = atkOf(s); s.paid = 0;
  ev(s, { k: 'hit', need: s.need });
  if (s.need <= 0) return endAfterDamage(s);
  const tot = sum(s.hand.map(val));
  if (tot < s.need && s.hand.length < s.hmax) return lose(s, '반격 피해를 막을 카드가 모자라요');
}
function endAfterDamage(s) {                                   // 4a 끝: 버림 더미 맨 위 카드가 적 구역으로 → 적 공격력이 그만큼 커진다
  if (s.discard.length) { const z = s.discard.pop(); s.zone.push(z); ev(s, { k: 'zone', id: z }); }
  newTurn(s);
}
function defeat(s, exact) {
  const e = s.enemy;
  for (const g of s.plays) {
    if (g.j) { s.jused++; continue; }                          // 어릿광대는 이번 게임에서 다시 못 씀
    if (g.c.some(c => !isJ(c) && cl(c) === 0)) s.banish.push(...g.c); else s.discard.push(...g.c);   // 마법사가 낀 공격은 영구 추방
  }
  s.plays = [];
  s.discard.push(...s.zone); s.zone = [];
  if (exact) s.tavern.push(e.id); else s.discard.push(e.id);   // 정확히 처치하면 여관 덱 맨 위로(나중에 손에 들어옴)
  s.defeated++;
  ev(s, { k: 'kill', id: e.id, exact });
  if (!s.castle.length) { s.over = true; s.won = true; s.phase = 'over'; s.enemy = null; ev(s, { k: 'win' }); return; }
  s.enemy = mkEnemy(s.castle.shift()); ev(s, { k: 'next', id: s.enemy.id });
  newTurn(s);
}

function applyMove(s, m) {
  const ms = legalMoves(s), key = JSON.stringify(m);
  if (!ms.some(x => JSON.stringify(x) === key)) throw new Error('불법 수: ' + key);
  s.ev = []; s.moves++;
  if (m.t === 'play') {
    for (const c of m.c) s.hand.splice(s.hand.indexOf(c), 1);
    const g = { c: m.c.slice(), add: [], j: false };
    if (m.p != null) { s.aside.splice(s.aside.indexOf(m.p), 1); g.c.push(m.p); g.p = m.p; }
    return beginAttack(s, g);
  }
  if (m.t === 'jester') { const jid = 100 + (2 - s.jk); s.jk--; return beginAttack(s, { c: [jid], add: [], j: true, k: m.k }); }
  if (m.t === 'yield') { ev(s, { k: 'yield' }); return enterDamage(s); }
  if (m.t === 'mage') {
    const p = s.pend, g = s.plays[s.plays.length - 1], pick = p.look[m.i];
    for (let i = 0; i < p.look.length; i++) if (i !== m.i) s.discard.push(p.look[i]);
    g.c.push(pick); g.add.push(pick); s.pend = null;
    ev(s, { k: 'pick', id: pick, n: p.look.length });
    if (cl(pick) === 0 && !isJ(pick)) return stepMage(s, val(pick));   // 고른 카드가 또 마법사면 그 카드 한 장의 공격력으로 반복
    return finishAttack(s);
  }
  if (m.t === 'disc') {
    s.hand.splice(s.hand.indexOf(m.c), 1); s.discard.push(m.c); s.paid += val(m.c);
    ev(s, { k: 'disc', id: m.c });
    if (s.paid >= s.need) return endAfterDamage(s);
    return;
  }
  if (m.t === 'fake') {
    s.discard.push(...s.hand); ev(s, { k: 'fake', n: s.hand.length }); s.hand = [];
    return endAfterDamage(s);
  }
}

// ---------- 새 판 ----------
function newState(rng, opt = {}) {
  const s = {
    v: 1, rs: Math.floor(rng.next() * 4294967296) | 0, hmax: HMAX,
    castle: [], enemy: null, tavern: [], discard: [], banish: [], zone: [], plays: [], hand: [], aside: [], jk: 2, jused: 0,
    phase: 'play', pend: null, need: 0, paid: 0, over: false, won: false, why: '', defeated: 0, turns: 1, moves: 0, ev: []
  };
  const perm = opt.partner || rng.shuffle([0, 1, 2, 3, 4]);   // 동료 카드 5장: 숫자 2~6 각 한 장, 서로 다른 5개 직업
  s.aside = [2, 3, 4, 5, 6].map((v, i) => perm[i] * 20 + v);
  const nums = [];
  for (let c = 0; c < 5; c++) for (let r = 1; r <= 10; r++) nums.push(c * 20 + r);
  s.tavern = rng.shuffle(nums.filter(x => !s.aside.includes(x)));
  const tier = r => rng.shuffle([1, 2, 3, 4].map(c => c * 20 + r));
  s.castle = [...tier(11), 11, ...tier(12), 12, ...tier(13), 13];   // 위→아래: 잭 4 · 칼란나르 · 퀸 4 · 말리스 · 킹 4 · 타차에르
  s.enemy = mkEnemy(s.castle.shift());
  for (let i = 0; i < HMAX; i++) s.hand.push(s.tavern.pop());
  s.hand.sort(byNum);
  return s;
}
function validState(st) {
  return !!st && st.v === 1 && Array.isArray(st.hand) && Array.isArray(st.tavern) && Array.isArray(st.castle) && Array.isArray(st.aside) && Array.isArray(st.plays) && (st.over || !!st.enemy) && typeof st.rs === 'number';
}

// ---------- 봇(규격 검사 · "추천" 버튼). 보이는 정보(손패·버림·추방·적 구역·여관 덱의 "남은 카드 구성")만 쓴다 ----------
function expBest(vals, n, rng) {
  if (!vals.length || n <= 0) return 0;
  n = Math.min(n, vals.length);
  let t = 0; const K = 14;
  for (let k = 0; k < K; k++) { let best = 0; const used = new Set(); for (let i = 0; i < n; i++) { let j; do { j = Math.floor(rng.next() * vals.length); } while (used.has(j)); used.add(j); if (vals[j] > best) best = vals[j]; } t += best; }
  return t / K;
}
function scorePlay(s, m, rng) {
  const e = s.enemy, hand = s.hand, g = { j: m.t === 'jester' };
  const cards = m.t === 'jester' ? [] : m.c.concat(m.p != null ? [m.p] : []);
  const cls = m.t === 'jester' ? [m.k] : [...new Set(cards.map(cl))];
  const ok = c => cls.includes(c) && !immuneTo(s, c, g);
  let T = m.t === 'jester' ? 8 : sum(cards.map(val)), add = 0, mageN = 0;
  if (m.t !== 'jester' && ok(0)) { const vals = s.tavern.map(val); add = expBest(vals, T, rng); T += add; mageN = cards.length + 1; }
  const x2 = ok(3), dmg = T * (x2 ? 2 : 1), rem = e.hp - e.dmg, kill = dmg >= rem - 0.01;
  let sc = 0;
  const handAfter = hand.filter(c => !(m.c || []).includes(c)), spent = sum((m.c || []).map(val));
  if (kill) sc += 60 + (Math.abs(dmg - rem) < 0.5 ? 10 : 0) + (isMageEnemy(e.id) ? 6 : 0) - Math.max(0, dmg - rem) * 0.4;
  else sc += Math.min(dmg, rem) * 1.1;
  sc -= spent * (kill ? 0.3 : 0.7);
  if (m.t === 'jester') sc -= kill ? 14 : 26;
  if (m.p != null) sc += 4;
  const mageHit = m.t !== 'jester' && cls.includes(0);
  if (mageHit) sc -= cards.length * 1.2 + sum(cards.map(val)) * 0.25 + 1;
  let draws = 0;
  if (ok(2)) { draws = Math.min(T, s.hmax - handAfter.length, s.tavern.length); sc += draws * 3.4; }
  if (ok(1)) sc += Math.min(T, s.discard.length) * 1.1;
  let atk = atkOf(s); if (ok(4)) atk = Math.max(0, atk - T);
  if (!kill) {
    sc += (ok(4) ? Math.min(T, atkOf(s)) * 0.9 : 0);
    const avgDraw = 5.2, est = sum(handAfter.map(val)) + draws * avgDraw;
    if (est < atk && !(handAfter.length === s.hmax)) sc -= 1000;
    else sc -= Math.max(0, atk - est * 0.45) * 0.6;
    if (handAfter.length + draws <= 2) sc -= 6;
  } else sc += handAfter.length * 0.4;
  return sc;
}
function pickDisc(s) {
  const left = s.need - s.paid, hand = s.hand.slice();
  const cost = c => val(c) + (rk(c) === 1 ? 2.5 : 0) + (rk(c) >= 11 ? 1 : 0);
  let best = null;
  const n = hand.length;
  for (let mask = 1; mask < (1 << n); mask++) {
    let t = 0, cst = 0, mn = 99;
    for (let i = 0; i < n; i++) if (mask & (1 << i)) { t += val(hand[i]); cst += cost(hand[i]); mn = Math.min(mn, val(hand[i])); }
    if (t < left || t - mn >= left) continue;                    // 마지막 카드로 처음 채워지는 조합만(더 못 버림 규칙)
    const sc = cst - mn * 0.2;                                   // 마지막(적 구역으로 갈) 카드는 작을수록 좋다
    if (!best || sc < best.sc) best = { sc, mask };
  }
  if (!best) return hand.sort((a, b) => val(b) - val(a))[0];
  const set = []; for (let i = 0; i < n; i++) if (best.mask & (1 << i)) set.push(hand[i]);
  set.sort((a, b) => val(b) - val(a));
  return set[0];
}
function botChoose(s, traits, rng) {
  const ms = legalMoves(s);
  if (s.phase === 'mage') {
    const g = s.plays[s.plays.length - 1], T = sum(g.c.map(val)), mult = !immuneTo(s, 3, g) && (hasCls(g, 3) || false) ? 2 : 1;
    const rem = s.enemy.hp - s.enemy.dmg;
    let best = null;
    ms.forEach(m => {
      const c = s.pend.look[m.i], v = val(c);
      const kill = (T + v) * mult >= rem, exact = (T + v) * mult === rem;
      const sc = (kill ? 100 - ((T + v) * mult - rem) * 0.5 + (exact ? 12 : 0) : (T + v) * mult) + (cl(c) === 0 ? 3 : 0) - (isFace(c) && !kill ? 0 : 0);
      if (!best || sc > best.sc) best = { sc, m };
    });
    return { move: best.m, reason: 'mage' };
  }
  if (s.phase === 'dmg') {
    if (ms.length === 1 && ms[0].t === 'fake') return { move: ms[0], reason: 'fake' };
    return { move: { t: 'disc', c: pickDisc(s) }, reason: 'discard' };
  }
  let best = null;
  for (const m of ms) {
    if (m.t === 'yield') continue;
    const sc = scorePlay(s, m, rng) + rng.next() * 0.01;
    if (!best || sc > best.sc) best = { sc, m };
  }
  if (!best || best.sc < -900) return { move: { t: 'yield' }, reason: 'yield' };
  return { move: best.m, reason: m2r(best.m) };
}
const m2r = m => (m.t === 'jester' ? 'jester' : m.c.length > 1 ? 'combo' : 'single');

const game = {
  meta: { id: 'regicide-inferno', name: '레지사이드 인페르노', version: '1.0.0', players: { min: 1, max: 1 }, minutes: 20, campaign: null, autosave: { schema: 1 } },
  newGame({ rng, options }) { return newState(rng, options || {}); },
  currentSeat: () => 0,
  isOver: s => s.over,
  legalMoves,
  applyMove(s, m) { applyMove(s, m); return s; },
  botChoose,
  result(s) {
    return { coop: { won: !!s.won, score: s.defeated }, summary: s.won ? `타차에르 격파! 15명 모두 쓰러뜨렸어요 · ${s.turns}턴` : `왕족 ${s.defeated}/15명 격파 · ${s.why || ''}` };
  },
  mount(container, ctx) { return mountInferno(this, container, ctx); }
};
export default game;
export const _t = { newState, validState, playMoves, legalMoves, applyMove, mkEnemy, immuneTo, atkOf, scorePlay, pickDisc, clone, sum, hasCls };

// =====================================================================
//  화면 (1인 전용)
// =====================================================================
const CC = ['#c9a45a', '#b0304f', '#9a5ad8', '#a8a4bd', '#6f8fb8'];   // 마법사 황갈·성직자 자홍·음유시인(연금술) 보라·전사 강철·성기사 청회
const CI = ['🔥', '🧪', '🎻', '⚔️', '🛡️'];
const ART_G = ['card-m', 'card-c', 'card-b', 'card-w', 'card-p'];
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

function mountInferno(self, container, ctx) {
  const rng = ctx.rng, th = ctx.theme || {};
  let fx = ctx.fx ? ctx.fx.scope(container) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : k === 'rect' || k === 'union' ? () => null : () => Promise.resolve()) });
  // 그림은 긴 데이터 주소 대신 짧은 blob 주소로 바꿔 쓴다: 화면을 다시 그릴 때마다 수 MB 문자열을 해석·디코딩하던 지연을 없앤다.
  const blobUrls = [];
  const lite = d => { try { if (!/^data:/.test(d)) return d; const i = d.indexOf(','), mime = d.slice(5, i).split(';')[0] || 'image/png', bin = atob(d.slice(i + 1)), u8 = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k); const u = URL.createObjectURL(new Blob([u8], { type: mime })); blobUrls.push(u); return u; } catch (e) { return d; } };
  const A = g => { try { const a = ctx.art ? ctx.art(g) : []; return Array.isArray(a) ? a.map(lite) : []; } catch (e) { return []; } };
  const ART = ART_G.map(A), BACK = A('back')[0] || null, JOK = A('joker')[0] || null, BG = A('bg')[0] || null;
  const keep = blobUrls.map(u => { const im = new Image(); im.src = u; if (im.decode) im.decode().catch(() => {}); return im; });   // 미리 디코딩해 두기(첫 표시 끊김 방지)
  const artOf = id => (isJ(id) ? JOK : ART[cl(id)][rk(id) - 1] || null);
  const timers = new Set(); let dead = false;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const safe = fn => { try { fn(); } catch (e) { /* 연출 실패는 무시 */ } };
  let s = null, selC = [], selD = [], selP = null, hint = null, big = false, logs = [], finished = false, sheet = null;

  container.innerHTML = `<style>${RI_CSS}</style>
  <div class="g-regicide-inferno" style="--acc:${th.accent || '#f0b24a'};--bg1:${th.table || '#2b1812'};--bg2:${th.table2 || '#110908'}">
    <div class="ri-top"></div>
    <div class="ri-grid">
      <div class="ri-l"><div data-skin="panel" class="ri-enemy"></div><div class="ri-piles"></div></div>
      <div class="ri-c"><div data-skin="panel" class="ri-field"></div><div data-skin="panel" class="ri-dock"></div></div>
      <div class="ri-r"><div data-skin="panel" class="ri-log"></div></div>
      <div class="ri-bt"><div class="ri-hand"></div><div class="ri-aux"></div></div>
    </div>
    <div class="ri-ov" hidden></div>
  </div>`;
  const root = container.querySelector('.g-regicide-inferno');
  root.classList.toggle('ri-imm', !!ctx.immersive);
  if (BG) { root.style.backgroundImage = `linear-gradient(#0009,#000c),url(${BG})`; root.style.backgroundSize = 'cover'; root.style.backgroundPosition = 'center'; root.style.backgroundAttachment = 'local'; }
  const q = x => root.querySelector(x);
  if (ctx.fx) fx = ctx.fx.scope(root);   // 날아가는 카드가 게임 CSS를 물려받도록 게임 루트 안에 띄운다
  if (BACK) { root.style.setProperty('--bk', `url(${BACK})`); root.classList.add('hasbk'); }
  const el = { top: q('.ri-top'), enemy: q('.ri-enemy'), piles: q('.ri-piles'), field: q('.ri-field'), dock: q('.ri-dock'), aux: q('.ri-aux'), hand: q('.ri-hand'), log: q('.ri-log'), ov: q('.ri-ov') };

  function fit() { if (!matchMedia('(min-width:1000px) and (min-height:560px)').matches) { root.style.removeProperty('--k'); return; } if (!root.style.getPropertyValue('--k')) root.style.setProperty('--k', '1'); }
  const onResize = () => { fit(); if (s) fitHand(); }; window.addEventListener('resize', onResize); fit();

  const log = (t, cls) => { logs.push({ t, cls: cls || '' }); if (logs.length > 80) logs.shift(); };

  // ----- 카드 -----
  function cardHTML(id, o = {}) {
    const j = isJ(id), c = j ? 0 : cl(id), col = j ? '#d9d9e8' : CC[c], a = artOf(id);
    const st = a ? ` style="--cc:${col};background-image:url(${a})"` : ` style="--cc:${col}"`;
    const mid = a ? '' : `<span class="ri-ic">${j ? '🃏' : CI[c]}</span>`;
    return `<div${o.attr || ''} data-skin="card" class="ri-card${a ? ' art' : ''}${o.cls || ''}"${st}><b class="ri-rk">${rankLabel(id)}</b>${mid}<i class="ri-vl">${j ? '' : val(id)}</i></div>`;
  }
  const backHTML = (cls = '') => `<div class="ri-card back${cls}"${BACK ? ` style="background-image:url(${BACK})"` : ''}><span class="ri-ic">${BACK ? '' : '🔥'}</span></div>`;
  const small = ids => ids.map(id => cardHTML(id, { cls: ' sm' })).join('');

  // ----- 그리기 -----
  const ms = () => (s ? game.legalMoves(s) : []);
  function sameSet(a, b) { return a.length === b.length && a.every((x, i) => x === b[i]); }
  function curMove() {
    if (!s || s.phase !== 'play' || !selC.length) return null;
    const cs = selC.slice().sort((a, b) => a - b);
    return ms().find(m => m.t === 'play' && sameSet(m.c, cs) && (m.p == null ? selP == null : m.p === selP)) || null;
  }
  function extendable(id) {
    const base = selC.includes(id) ? selC : selC.concat(id), cs = base.slice().sort((a, b) => a - b);
    return ms().some(m => m.t === 'play' && cs.every(c => m.c.includes(c)) && (selP == null || m.p === selP));
  }
  function drawTop() {
    const pips = []; const all = [...Array(4).fill(11), 11, ...Array(4).fill(12), 12, ...Array(4).fill(13), 13];
    for (let i = 0; i < 15; i++) {
      const m = i === 4 || i === 9 || i === 14, cls = i < s.defeated ? 'done' : i === s.defeated && !s.over ? 'cur' : '';
      pips.push(`<i class="ri-pip ${cls}${m ? ' m' : ''}">${m ? '★' : ''}</i>`);
    }
    el.top.innerHTML = `<div class="ri-pips">${pips.join('')}</div><span class="ri-tn">턴 ${s.turns}</span>
      <button data-skin="button" class="ri-ib" data-a="log">기록</button><button data-skin="button" class="ri-ib" data-a="rules">규칙</button><button data-skin="button" class="ri-ib" data-a="big">${big ? '축소' : '확대'}</button>`;
  }
  function drawEnemy() {
    const e = s.enemy;
    if (!e) { el.enemy.innerHTML = '<b>승리!</b>'; return; }
    const hpL = Math.max(0, e.hp - e.dmg), pct = Math.round(hpL / e.hp * 100), atk = atkOf(s);
    const im = [0, 1, 2, 3, 4].filter(c => immuneTo(s, c, null)).map(c => `<i style="--cc:${CC[c]}">${CI[c]}</i>`).join('');
    el.enemy.innerHTML = `<div class="ri-eh">${cardHTML(e.id, { cls: ' en', attr: ' data-a="zoomE"' })}
      <div class="ri-ei"><b class="ri-en">${esc(enemyName(e.id))}</b>
      <div data-skin="bar" class="ri-hp"><div style="width:${pct}%"></div><span>${hpL} / ${e.hp}</span></div>
      <div class="ri-st"><span title="적 공격력">⚔ 공격 <b>${atk}</b></span>${e.sh ? `<span>🛡 −${e.sh}</span>` : ''}</div>
      <div class="ri-im">면역 ${im || '없음'}</div></div></div>`;
  }
  // 성·여관·버림·추방: 카드 뒷면이 쌓인 더미. 버림 더미는 맨 위 카드 앞면이 보인다.
  function stack(key, n, label, o = {}) {
    const layers = n ? '<i></i>'.repeat(n >= 12 ? 3 : n >= 4 ? 2 : 1) : '';
    const face = o.top != null ? cardHTML(o.top, { cls: ' stkf' }) : '';
    const inner = `<span class="ri-stk${n ? '' : ' emp'}">${layers}${face}<em class="ri-pn">${n}</em></span><small>${label}</small>`;
    return o.a ? `<button data-a="${o.a}" class="ri-pl ${key}" data-pile="${key}">${inner}</button>` : `<span class="ri-pl ${key}" data-pile="${key}">${inner}</span>`;
  }
  function drawPiles() {
    el.piles.innerHTML = `<div class="ri-pg">${stack('castle', s.castle.length, '성', { a: 'pCastle' })}${stack('tavern', s.tavern.length, '여관')}</div>
      <div class="ri-pg">${stack('disc', s.discard.length, '버림', { a: 'pDisc', top: s.discard.length ? s.discard[s.discard.length - 1] : null })}${stack('ban', s.banish.length, '추방', { a: 'pBan' })}</div>`;
  }
  function drawField() {
    const pl = s.plays.map(g => `<div class="ri-grp${g.j ? ' j' : ''}">${g.c.map(id => cardHTML(id, { cls: ' sm' + (g.add.includes(id) ? ' side' : '') })).join('')}</div>`).join('');
    el.field.innerHTML = `<div class="ri-fl"><h4>적 구역 <small>합 ${zoneAtk(s)}</small></h4><div class="ri-row">${s.zone.length ? small(s.zone) : '<em>비어 있음</em>'}</div></div>
      <div class="ri-fl"><h4>이번 공격</h4><div class="ri-row">${pl || '<em>아직 없음</em>'}</div></div>`;
  }
  function preview() {
    const cs = selC.concat(selP != null ? [selP] : []);
    if (!cs.length) return '';
    const g = { c: cs, j: false }, T = cs.reduce((a, c) => a + val(c), 0), has = c => cs.some(x => cl(x) === c), ok = c => has(c) && !immuneTo(s, c, g);
    const p = [`합 ${T}`];
    p.push(ok(3) ? `피해 <b>${T * 2}</b>(×2)` : `피해 <b>${T}</b>`);
    if (ok(4)) p.push(`방어 +${T}`); if (ok(1)) p.push(`회복 ${T}`); if (ok(2)) p.push(`뽑기 ${T}`);
    if (ok(0)) p.push('마법사: 여관 덱 확인');
    const bad = [0, 1, 2, 3, 4].filter(c => has(c) && immuneTo(s, c, g)); if (bad.length) p.push(`면역 ${bad.map(c => CI[c]).join('')} 무효`);
    return p.join(' · ');
  }
  function selSum() { return selD.reduce((a, c) => a + val(c), 0); }
  function drawDock() {
    const m = ms(); let msg = '', btn = '';
    if (s.over) msg = s.won ? '타차에르를 쓰러뜨렸어요!' : '패배… ' + (s.why || '');
    else if (s.phase === 'dmg') {
      const got = s.paid + selSum(), okD = got >= s.need;
      msg = `<b>피해를 받습니다</b> — 버릴 카드를 골라 <b>${s.need}</b> 이상 채운 뒤 확인하세요 (<b style="color:${okD ? '#8fe38f' : '#ffb08a'}">${got}</b>/${s.need})`;
      btn += `<button data-skin="button" class="ri-b pri" data-a="dconf"${okD ? '' : ' disabled'}>버리기 확인${selD.length ? ` (${selD.length}장)` : ''}</button>`;
      if (selD.length) btn += `<button data-skin="button" class="ri-b" data-a="dclear">선택 해제</button>`;
      if (m.some(x => x.t === 'fake')) btn += `<button data-skin="button" class="ri-b" data-a="fake">죽은 척하기</button>`;
    } else if (s.phase === 'mage') msg = `<b>마법사</b> — 위 카드 중 하나를 골라 공격에 더하세요`;
    else {
      const cm = curMove(), pv = preview();
      msg = pv || '카드를 골라 공격하거나 양보하세요';
      btn += `<button data-skin="button" class="ri-b pri" data-a="atk"${cm ? '' : ' disabled'}>공격</button>`;
      btn += `<button data-skin="button" class="ri-b" data-a="yield"${m.some(x => x.t === 'yield') ? '' : ' disabled'}>양보</button>`;
      if (selC.length || selP != null) btn += `<button data-skin="button" class="ri-b" data-a="clear">선택 해제</button>`;
    }
    btn += `<button data-skin="button" class="ri-b" data-a="hint"${s.over ? ' disabled' : ''}>추천</button>`;
    el.dock.innerHTML = `<div class="ri-msg">${msg}</div><div class="ri-btns">${btn}</div>`;
  }
  function drawAux() {
    const m = ms(), jm = s.phase === 'play' && m.some(x => x.t === 'jester');
    const partners = s.aside.map(p => {
      const can = s.phase === 'play' && m.some(x => x.t === 'play' && x.p === p && selC.every(c => x.c.includes(c)));
      return cardHTML(p, { cls: ' sm' + (selP === p ? ' sel' : '') + (can || selP === p ? '' : ' dim'), attr: ` data-a="partner" data-id="${p}"` });
    }).join('');
    const jk = [0, 1].map(i => (i < s.jk ? `<button data-a="jester" class="ri-j${jm ? '' : ' dim'}${hint && hint.t === 'jester' ? ' hint' : ''}" title="어릿광대">${JOK ? '' : '🃏'}${JOK ? `<span style="background-image:url(${JOK})"></span>` : ''}</button>` : `<span class="ri-j used"></span>`)).join('');
    el.aux.innerHTML = `<div class="ri-ax"><h4>동료 카드</h4><div class="ri-row">${partners || '<em>없음</em>'}</div></div><div class="ri-ax"><h4>어릿광대 (공격 8)</h4><div class="ri-row">${jk}</div></div>`;
  }
  function drawHand() {
    const m = ms(), dmg = s.phase === 'dmg', play = s.phase === 'play';
    const hintC = hint && (hint.t === 'play' ? hint.c : hint.t === 'disc' ? [hint.c] : []), full = dmg && s.paid + selSum() >= s.need;
    el.hand.className = 'ri-hand' + (big ? ' big' : '');
    el.hand.innerHTML = s.hand.map(id => {
      const can = dmg ? !full && m.some(x => x.t === 'disc' && x.c === id) : play ? extendable(id) : false;
      const cls = (selC.includes(id) || selD.includes(id) ? ' sel' : '') + (!can && !selC.includes(id) && !selD.includes(id) ? ' dim' : '') + (hintC && hintC.includes(id) ? ' hint' : '') + (dmg && can ? ' dsc' : '');
      return cardHTML(id, { cls, attr: ` data-a="hand" data-id="${id}"` });
    }).join('') || '<em class="ri-emp">손패가 없습니다</em>';
  }
  function drawLog() { el.log.innerHTML = `<h4>진행</h4><div class="ri-lg">${logs.slice(-14).reverse().map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join('')}</div>`; }
  function drawMage() {
    if (s.phase !== 'mage' || !s.pend) { if (sheet === 'mage') { sheet = null; el.ov.hidden = true; el.ov.innerHTML = ''; } return; }
    sheet = 'mage';
    const hi = hint && hint.t === 'mage' ? hint.i : -1;
    el.ov.hidden = false;
    el.ov.innerHTML = `<div data-skin="panel" class="ri-sheet"><h3>🔥 마법사 — 하나를 고르세요</h3><p class="ri-sub">고르지 않은 카드는 버림 더미로 갑니다.</p>
      <div class="ri-row ctr">${s.pend.look.map((id, i) => cardHTML(id, { cls: i === hi ? ' hint' : '', attr: ` data-a="mage" data-i="${i}"` })).join('')}</div></div>`;
  }
  function drawEnd() {
    if (!s.over) return;
    sheet = 'end'; el.ov.hidden = false;
    el.ov.innerHTML = `<div data-skin="panel" class="ri-sheet"><h3>${s.won ? '🏆 승리' : '💀 패배'}</h3><p>${esc(self.result(s).summary)}</p>
      <button data-skin="button" class="ri-b pri wide" data-a="finish">${finished ? '저장됨' : '결과 저장하고 마치기'}</button></div>`;
  }
  let fitMemo = {};
  function fitHand() {
    const pc = matchMedia('(min-width:1000px) and (min-height:560px)').matches;
    root.style.removeProperty('--hw');
    if (!pc) {
      root.style.removeProperty('--k'); root.style.minHeight = '';
      if (big) return;
      const hh = el.hand.offsetHeight, rows = Math.ceil((s.hand.length || 1) / 4) || 1;
      if (rows < 2) return;
      const top = root.getBoundingClientRect().top + window.scrollY, avail = innerHeight - top - 12;
      const other = root.scrollHeight - hh, cardH = (avail - other - 6) / 2, colW = (el.hand.clientWidth - 18) / 4;
      const w = Math.max(52, Math.min(colW, cardH * 5 / 7));
      root.style.setProperty('--hw', w.toFixed(1) + 'px');
      return;
    }
    // PC: 화면 높이를 꽉 채운다. 위쪽(적·필드·기록)의 배율 k를 가장 크게 키우되, 손패 한 줄(8장)이 같이 들어가도록 맞춘다.
    root.style.minHeight = '';
    const top = root.getBoundingClientRect().top + window.scrollY, avail = Math.max(300, innerHeight - top - 6);
    const handW = k => { const cs = getComputedStyle(root), pad = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight); return (root.clientWidth - pad - k * 10 * (big ? 3 : 7)) / (big ? 4 : 8); };
    const setHand = w => root.style.setProperty('--hw', Math.max(40, w).toFixed(1) + 'px');
    const tryK = k => { root.style.setProperty('--k', k.toFixed(3)); setHand(handW(k)); return root.scrollHeight <= avail; };
    let lo = 0.85, hi = Math.min(3, innerWidth / 900);
    const memo = fitMemo.key === `${innerWidth}x${innerHeight}|${big}` ? fitMemo.k : null;   // 같은 창 크기면 지난번 배율부터 확인(재계산 한 번으로 끝나는 경우가 대부분)
    if (memo && tryK(memo) && avail - root.scrollHeight < avail * 0.04) { lo = memo; hi = memo; }
    else if (tryK(hi)) lo = hi; else { for (let i = 0; i < 9; i++) { const mid = (lo + hi) / 2; if (tryK(mid)) lo = mid; else hi = mid; } }
    fitMemo = { key: `${innerWidth}x${innerHeight}|${big}`, k: lo };
    root.style.setProperty('--k', lo.toFixed(3));
    let w = handW(lo); setHand(w);
    for (let i = 0; i < 24 && root.scrollHeight > avail + 1 && w > 50; i++) { w *= 0.93; setHand(w); }   // 그래도 넘치면 손패만 줄인다
    root.style.minHeight = avail + 'px';
  }
  function draw() { drawTop(); drawEnemy(); drawPiles(); drawField(); drawDock(); drawAux(); drawHand(); drawLog(); drawMage(); drawEnd(); fitHand(); }

  // ----- 진행 -----
  const nm = id => cardName(id);
  function narrate(before) {
    const E = s.ev || [];
    E.forEach(e => {
      switch (e.k) {
        case 'play': log(`공격: ${e.c.map(nm).join(' + ')}${e.j ? ' (어릿광대)' : ''}`); break;
        case 'look': log(`마법사: 여관 덱 ${e.n}장 확인`); break;
        case 'pick': log(`${nm(e.id)} 선택 (${e.n}장 중)`); break;
        case 'cleric': log(`성직자: 버림 더미에서 ${e.n}장 회복`, 'g'); break;
        case 'bard': log(`음유시인: ${e.n}장 뽑음`, 'g'); break;
        case 'dmg': log(`피해 ${e.v}${e.x2 ? ' (×2)' : ''}`, 'g'); break;
        case 'shield': log(`방어 +${e.v}`, 'g'); break;
        case 'hit': log(`적의 반격 — 피해 ${e.need}`, 'r'); break;
        case 'disc': log(`버림: ${nm(e.id)}`); break;
        case 'fake': log(`죽은 척하기: 손패 ${e.n}장 버림`, 'r'); break;
        case 'zone': log(`${nm(e.id)} → 적 구역`, 'r'); break;
        case 'kill': log(`${enemyName(e.id)} 격파${e.exact ? ' (정확히! 여관 덱 위로)' : ''}`, 'g'); break;
        case 'next': log(`다음 적: ${enemyName(e.id)}`); break;
        case 'yield': log('양보'); break;
        case 'win': log('승리!', 'g'); break;
        case 'lose': log('패배: ' + e.why, 'r'); break;
      }
    });
  }
  function anim(rich) {
    (s.ev || []).forEach(e => safe(() => {
      if (e.k === 'play') fx.sfx('card');
      else if (e.k === 'dmg') { if (rich) setTimeout(() => safe(() => fx.sfx('slam')), 330); else { fx.sfx('slam'); const t = q('.ri-card.en'); if (t) fx.shake(t, 4); } }
      else if (rich) { if (e.k === 'win') fx.sfx('win'); else if (e.k === 'lose') fx.sfx('lose'); }
      else if (e.k === 'hit') { fx.sfx('bad'); fx.buzz(20); }
      else if (e.k === 'kill') { fx.sfx('gain'); const t = q('.ri-card.en'); if (t) fx.slam(t); }
      else if (e.k === 'win') fx.sfx('win');
      else if (e.k === 'lose') fx.sfx('lose');
      else if (e.k === 'disc' || e.k === 'pick') fx.sfx('tap');
    }));
  }
  function save() { safe(() => { if (!ctx.autosave) return; if (s.over) { if (ctx.clearAutosave) ctx.clearAutosave(); } else ctx.autosave(JSON.parse(JSON.stringify(s))); }); }
  // ===== 연출: 카드가 날아가고 공격 이펙트가 터진다 (화면은 먼저 새로 그리고, 위에 '유령' 카드만 날린다) =====
  const FXC = [['#ff6a2b', '#ffb347', '#ffe08a'], ['#ff8fb1', '#fff3c4', '#ffffff'], ['#c28bff', '#e8d2ff', '#8a5cff'], ['#ffffff', '#cfd6e6', '#9aa6c0'], ['#8fb3e8', '#d6e6ff', '#ffffff']];
  const FXL = () => { let l = root.querySelector('.ri-fxl'); if (!l) { l = document.createElement('div'); l.className = 'ri-fxl'; root.append(l); } return l; };
  const R = n => (n ? fx.rect(n) : null);
  const stk = k => root.querySelector(`.ri-pl[data-pile="${k}"] .ri-stk`);
  const mid = r => r && { x: r.x + r.w / 2 - 1, y: r.y + r.h / 2 - 1, w: 2, h: 2 };
  function snap() {
    const cardR = {};
    root.querySelectorAll('.ri-hand .ri-card[data-id], .ri-aux .ri-card[data-id]').forEach(n => { cardR[n.dataset.id] = R(n); });
    return { cardR, jR: [...root.querySelectorAll('.ri-aux .ri-j:not(.used)')].map(R), enemyR: R(q('.ri-card.en')), enemyHTML: (q('.ri-card.en') || {}).outerHTML || '', enemyId: s.enemy ? s.enemy.id : null,
      hand: s.hand.slice(), n: { castle: s.castle.length, tavern: s.tavern.length, disc: s.discard.length, ban: s.banish.length },
      playsR: R(root.querySelector('.ri-fl:nth-child(2) .ri-row')), cls: s.plays.map(g => g.c).flat() };
  }
  const ghost = (id, r, o = {}) => fx.fly({ from: r, node: id === 'back' ? backHTML(' fxg') : cardHTML(id, { cls: ' fxg' }), size: { w: r.w, h: r.h }, ...o });
  function slash(r, ang = -35, col = '#fff') {
    if (!r) return; const l = FXL(), w = Math.max(r.w, r.h) * 1.5, d = document.createElement('div');
    Object.assign(d.style, { position: 'fixed', left: r.x + r.w / 2 - w / 2 + 'px', top: r.y + r.h / 2 - 3 + 'px', width: w + 'px', height: '6px', borderRadius: '3px', background: `linear-gradient(90deg,transparent,${col},transparent)`, boxShadow: `0 0 14px 3px ${col}`, transform: `rotate(${ang}deg) scaleX(0)`, opacity: 0 });
    l.append(d); d.animate([{ transform: `rotate(${ang}deg) scaleX(0)`, opacity: 1 }, { transform: `rotate(${ang}deg) scaleX(1)`, opacity: 1, offset: .35 }, { transform: `rotate(${ang}deg) scaleX(1)`, opacity: 0 }], { duration: 330, easing: 'ease-out' }).finished.catch(() => {}).then(() => d.remove());
  }
  function flash(col, a = .4, dur = 380) {
    const d = document.createElement('div'); Object.assign(d.style, { position: 'fixed', inset: 0, background: `radial-gradient(ellipse at center,transparent 35%,${col} 130%)` });
    FXL().append(d); d.animate([{ opacity: 0 }, { opacity: a, offset: .25 }, { opacity: 0 }], { duration: dur }).finished.catch(() => {}).then(() => d.remove());
  }
  function impact(classes, e, r, bossEl) {
    if (!r) return;
    const T = mid(r), cs = [...new Set(classes)];
    cs.forEach((c, i) => setTimeout(() => { if (dead) return; safe(() => {
      fx.burst(T, { color: FXC[c] || FXC[0], n: 14, spread: r.w * 0.8 });
      if (c === 3) { slash(r, -38, '#fff'); setTimeout(() => safe(() => slash(r, 32, '#ffd9a0')), 90); }
      if (bossEl && c === 0) fx.glow(bossEl, '#ff8a3a');
      if (c === 1) { if (bossEl) fx.glow(bossEl, '#ffe9a8'); fx.float(T, '✚', { color: '#ffe9a8', size: 30, dy: -60 }); }
      if (c === 2) fx.float(T, '♪', { color: '#d9b8ff', size: 30, dy: -60 });
      if (bossEl && c === 4) fx.glow(bossEl, '#8fb3e8');
    }); }, i * 80));
    if (e && e.v > 0) { fx.float(T, `−${e.v}`, { color: e.x2 ? '#ff7a55' : '#ffe08a', size: e.x2 ? 54 : 36, dy: -70, dur: 1000 }); if (e.x2) { fx.float(T, '×2!', { color: '#ff7a55', size: 24, dy: -112, dur: 1000 }); safe(() => fx.shake(root, 5)); } }
    if (bossEl) safe(() => fx.shake(bossEl, e && e.x2 ? 10 : 6));
  }
  const hideNew = [];   // 날아오는 동안 도착 자리를 비워 두기
  const hide = n => { if (n) { n.style.visibility = 'hidden'; hideNew.push(n); } return n; };
  const reveal = n => { if (n) n.style.visibility = ''; };
  async function choreo(sn, evs, after, bossG) {
    const K = k => evs.filter(e => e.k === k);
    const en = () => q('.ri-card.en');
    try {
      // 1) 공격: 손패(또는 동료·광대)에서 보스에게
      const play = K('play')[0], dmg = K('dmg')[0], enR = sn.enemyR;
      if (play) {
        const jIdx = { n: 0 };
        const flights = play.c.map((id, i) => {
          const r = isJ(id) ? sn.jR[jIdx.n++] : sn.cardR[id]; if (!r || !enR) return null;
          return ghost(id, r, { to: mid(enR), dur: 340, arc: 0.18, spin: (i % 2 ? 1 : -1) * 14, scale: Math.min(1, enR.w / r.w) * 0.85, delay: i * 80, fade: true });
        }).filter(Boolean);
        await Promise.all(flights);
        if (dead) return;
        const pcs = play.c.map(id => (isJ(id) ? 99 : cl(id))).filter(c => c < 5);
        impact(pcs.length ? pcs : [0, 2, 3], dmg, enR, bossG ? bossG.firstElementChild : en());
        await fx.wait(260);
      }
      // 2) 격파: 쓰러진 적이 더미로 날아가고, 다음 적이 성에서 등장
      const kill = K('kill')[0];
      if (kill && sn.enemyR) {
        const tgt = stk(kill.exact ? 'tavern' : 'disc');
        if (tgt) { fx.sfx('gain'); fx.burst(mid(sn.enemyR), { color: ['#ffd36b', '#fff3c4', '#ffb84a'], n: 22, spread: sn.enemyR.w * 1.1 }); fx.float(mid(sn.enemyR), '격파!', { color: '#ffd36b', size: 34, dy: -70 }); }
        if (bossG) bossG.remove();
        if (sn.enemyHTML && tgt) await fx.fly({ from: sn.enemyR, to: tgt, node: sn.enemyHTML.replace('class="ri-card', 'class="ri-card fxg'), size: { w: sn.enemyR.w, h: sn.enemyR.h }, dur: 420, arc: 0.2, spin: 12, scale: 0.35, fade: true });
        if (dead) return;
        // 이번 공격에 쓴 카드들: 버림/추방 더미로
        const nb = s.banish.length - sn.n.ban, pr = sn.playsR || sn.enemyR;
        if (nb > 0 && stk('ban')) { fx.flyMany(Math.min(nb, 5), { from: mid(pr), node: backHTML(' fxg'), size: { w: 40, h: 56 }, to: stk('ban'), dur: 420, arc: .2 }, 40); }
        const nxt = K('next')[0], ne = en();
        if (nxt && ne && stk('castle')) {
          const r = R(ne); fx.sfx('deal');
          const cr = R(stk('castle')); await fx.fly({ from: cr, to: mid(r), node: backHTML(' fxg'), size: { w: cr.w, h: cr.h }, dur: 460, arc: .15, spin: 0, scale: r.w / cr.w, fade: false });
          reveal(ne); fx.pop(ne);
        }
      }
      // 3) 방어(성기사) / 회복(성직자) / 뽑기(음유시인)
      const sh = K('shield')[0], ne2 = en();
      if (sh && ne2 && !kill) { fx.glow(ne2, '#8fb3e8'); fx.float(ne2, `🛡 −${sh.v}`, { color: '#9cc3ff', size: 26, dy: -50 }); }
      const cle = K('cleric')[0];
      if (cle && stk('disc') && stk('tavern')) { fx.sfx('gain'); const f = fx.flyMany(Math.min(cle.n, 6), { from: stk('disc'), to: stk('tavern'), node: backHTML(' fxg'), size: { w: 38, h: 53 }, dur: 380, arc: .2 }, 70); fx.float(stk('tavern'), `+${cle.n}`, { color: '#ffe9a8', size: 22 }); await f; }
      const drawn = s.hand.filter(id => !sn.hand.includes(id));
      if (drawn.length && stk('tavern')) {
        fx.sfx('deal');
        await Promise.all(drawn.slice(0, 8).map((id, i) => {
          const n = root.querySelector(`.ri-hand .ri-card[data-id="${id}"]`); if (!n) return null; const r = R(n), pr = R(stk('tavern')), p = fx.fly({ from: pr, to: r, node: backHTML(' fxg'), size: { w: pr.w, h: pr.h }, dur: 400, arc: .2, scale: r.w / pr.w, delay: i * 90 });
          return p.then(() => reveal(n));
        }).filter(Boolean));
      }
      // 4) 반격 / 버림
      const hit = K('hit')[0];
      if (hit) { const e2 = en(); if (hit.need > 0) { fx.sfx('bad'); fx.buzz(25); flash('#d11a1a', .55, 420); fx.shake(root, 7); if (e2) { fx.slam(e2); fx.float(e2, `반격 ${hit.need}`, { color: '#ff6a55', size: 30, dy: -60 }); } } else if (e2) fx.float(e2, '막아냄!', { color: '#9cc3ff', size: 30, dy: -60 }); }
      for (const d of K('disc')) { const r = sn.cardR[d.id], t = stk('disc'); if (r && t) { ghost(d.id, r, { to: t, dur: 330, arc: .12, spin: 18, scale: 0.5, fade: true }); fx.sfx('tap'); } }
      const fake = K('fake')[0];
      if (fake && stk('disc')) { sn.hand.forEach((id, i) => { const r = sn.cardR[id]; if (r) ghost(id, r, { to: stk('disc'), dur: 380, arc: .15, spin: (i % 2 ? 1 : -1) * 20, scale: .4, fade: true, delay: i * 45 }); }); flash('#d11a1a', .4, 500); }
      const zn = K('zone')[0];
      if (zn && stk('disc')) { const zc = [...root.querySelectorAll('.ri-fl:first-child .ri-card')].pop(); if (zc) { hide(zc); const r = R(zc); await ghost(zn.id, R(stk('disc')), { to: r, dur: 420, arc: .2, scale: r.w / R(stk('disc')).w }); reveal(zc); } }
      if (K('win')[0]) { const e3 = sn.enemyR; if (e3) fx.burst(mid(e3), { color: ['#ffd36b', '#fff', '#ff8a3a', '#9cc3ff'], n: 40, spread: 260, dur: 1100 }); flash('#ffd36b', .35, 900); }
      if (K('lose')[0]) flash('#8a0f0f', .7, 900);
    } catch (e) { /* 연출 실패는 무시 */ } finally { hideNew.splice(0).forEach(reveal); if (bossG) bossG.remove(); if (after) after(); }
  }
  function run(m) {
    if (dead || s.over) return false;
    const sn = fx.on ? safe2(snap) : null;
    const list = Array.isArray(m) ? m : [m], allEv = [];
    try { for (const x of list) { if (s.over) break; game.applyMove(s, x); allEv.push(...(s.ev || [])); } } catch (e) { safe(() => fx.sfx('bad')); s.ev = allEv; selD = []; narrate(); draw(); save(); return false; }
    s.ev = allEv;
    selC = []; selP = null; hint = null; selD = [];
    narrate(); draw(); save();
    if (sn) {
      const evs = (s.ev || []).slice();
      // 날아오는 카드의 도착 자리를 먼저 비워 둔다
      s.hand.filter(id => !sn.hand.includes(id)).forEach(id => hide(root.querySelector(`.ri-hand .ri-card[data-id="${id}"]`)));
      let bossG = null;
      if (evs.some(e => e.k === 'kill') && sn.enemyR && sn.enemyHTML) {   // 쓰러지는 적은 공격이 닿을 때까지 제자리에 남겨 둔다
        bossG = document.createElement('div'); bossG.innerHTML = sn.enemyHTML.replace('class="ri-card', 'class="ri-card fxg'); const c0 = bossG.firstElementChild;
        Object.assign(bossG.style, { position: 'fixed', left: sn.enemyR.x + 'px', top: sn.enemyR.y + 'px', width: sn.enemyR.w + 'px', height: sn.enemyR.h + 'px' }); c0.style.width = '100%'; FXL().append(bossG);
        hide(q('.ri-card.en'));
      }
      if (s.phase === 'mage') { el.ov.style.visibility = 'hidden'; later(() => { el.ov.style.visibility = ''; }, 700); }   // 공격이 먼저 보이도록 선택창은 잠시 뒤에
      anim(true); choreo(sn, evs, () => { if (!dead) ['castle', 'tavern', 'disc', 'ban'].forEach(k => { const n = root.querySelector(`.ri-pl[data-pile="${k}"] .ri-pn`); if (n && +n.textContent !== sn.n[k]) safe(() => fx.pop(n, 1.4)); }); }, bossG);
    } else anim(false);
    return true;
  }
  const safe2 = fn => { try { return fn(); } catch (e) { return null; } };
  function begin(state) {
    s = state || game.newGame({ rng });
    s.ev = []; selC = []; selD = []; selP = null; hint = null;
    log(state ? '이어서 진행합니다.' : '여정 시작! 15명의 왕족을 쓰러뜨리세요. 첫 적: ' + enemyName(s.enemy.id));
    draw();
  }

  // ----- 시트 -----
  function openSheet(html) { sheet = 'info'; el.ov.hidden = false; el.ov.innerHTML = `<div data-skin="panel" class="ri-sheet">${html}<button data-skin="button" class="ri-b wide" data-a="close">닫기</button></div>`; }
  function listSheet(title, ids, note) {
    openSheet(`<h3>${title} (${ids.length})</h3>${note ? `<p class="ri-sub">${note}</p>` : ''}<div class="ri-row ctr">${ids.length ? ids.slice().sort((a, b) => a - b).map(id => cardHTML(id, { cls: ' sm' })).join('') : '<em>없음</em>'}</div>`);
  }
  function castleSheet() {
    const L = s.castle.map(id => `<li style="color:${CC[cl(id)]}">${esc(enemyName(id))} <small>HP ${hpOf(id)} · 공격 ${val(id)}</small></li>`).join('');
    openSheet(`<h3>남은 적 (${s.castle.length + (s.enemy ? 1 : 0)})</h3><ol class="ri-cl">${s.enemy ? `<li class="now">${esc(enemyName(s.enemy.id))} <small>(지금)</small></li>` : ''}${L}</ol>`);
  }
  function rulesSheet() {
    openSheet(`<h3>규칙 요약 (1인)</h3><ul class="ri-rules">
      <li><b>목표</b> 왕족 15명(잭4·칼란나르·퀸4·말리스·킹4·타차에르)을 순서대로 쓰러뜨리면 승리.</li>
      <li><b>내 차례</b> ① 카드로 공격(한 장 / A+다른 카드 / 같은 숫자 합 12 이하 / 동료 카드 추가) 또는 양보 → ② 능력 발동 → ③ 피해 → ④ 적 반격: 적 공격력만큼 손패를 버립니다.</li>
      <li><b>능력</b> 🔥마법사: 여관 덱 N장을 보고 1장을 공격에 더함(추방됨) · 🧪성직자: 버림→여관 덱 아래 · 🎻음유시인: 뽑기 · ⚔️전사: 피해 ×2 · 🛡️성기사: 적 공격 감소(누적).</li>
      <li><b>면역</b> 적은 자기 직업 능력에 면역. 마법사 왕족은 적 구역 카드의 직업에도 면역. 어릿광대는 면역 무시.</li>
      <li><b>반격</b> 피해를 받으면 버림 더미 맨 위 카드가 적 구역에 놓여 적이 강해집니다.</li>
      <li><b>정확히 격파</b> 피해가 적 HP와 같으면 적 카드가 여관 덱 맨 위로 — 다음 턴 드로우에 도움.</li>
      <li><b>어릿광대</b> 2장: 공격 8, 직업(성직자·음유시인·전사·성기사) 선택, 면역 무시, 사용 후 제거.</li>
      <li><b>죽은 척하기</b> 손패가 가득(8장)인데 합이 피해보다 작을 때만, 전부 버리고 생존.</li></ul>`);
  }

  // ----- 입력 -----
  root.addEventListener('click', e => {
    if (dead) return;
    const a = e.target.closest('[data-a]'); if (!a || a.disabled) return;
    const k = a.dataset.a;
    if (k === 'close') { el.ov.hidden = true; el.ov.innerHTML = ''; sheet = null; return; }
    if (k === 'log') { openSheet(`<h3>진행 기록</h3><div class="ri-lg full">${logs.slice().reverse().map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join('')}</div>`); return; }
    if (k === 'rules') return rulesSheet();
    if (k === 'big') { big = !big; draw(); return; }
    if (k === 'pCastle') return castleSheet();
    if (k === 'pDisc') return listSheet('버림 더미', s.discard, '모두에게 공개된 카드');
    if (k === 'pBan') return listSheet('추방', s.banish, '마법사 카드를 쓴 공격은 격파 후 추방됩니다');
    if (k === 'zoomE' && s.enemy) return openSheet(`<div class="ri-row ctr">${cardHTML(s.enemy.id, { cls: ' zoom' })}</div><p class="ri-sub">${esc(enemyName(s.enemy.id))} · HP ${s.enemy.hp} · 기본 공격 ${val(s.enemy.id)}</p>`);
    if (k === 'finish') { if (finished) return; finished = true; a.disabled = true; ctx.finish(self.result(s)); return; }
    if (s.over) return;
    if (k === 'mage') return void run({ t: 'mage', i: +a.dataset.i });
    if (k === 'hand') {
      const id = +a.dataset.id;
      if (s.phase === 'dmg') {   // 반격: 누르면 고르기만, '버리기 확인'으로 한꺼번에 버린다
        hint = null;
        if (selD.includes(id)) selD = selD.filter(x => x !== id);
        else if (s.paid + selSum() < s.need && s.hand.includes(id)) selD = selD.concat(id);
        else { safe(() => fx.sfx('bad')); return; }
        safe(() => fx.sfx('tap')); drawDock(); drawHand(); return;
      }
      if (s.phase !== 'play') return;
      hint = null;
      if (selC.includes(id)) selC = selC.filter(x => x !== id);
      else if (extendable(id)) selC = selC.concat(id).sort((x, y) => x - y); else { safe(() => fx.sfx('bad')); return; }
      if (selP != null && !ms().some(m => m.t === 'play' && m.p === selP && selC.every(c => m.c.includes(c)))) selP = null;
      safe(() => fx.sfx('tap')); drawDock(); drawAux(); drawHand(); return;
    }
    if (k === 'partner') {
      if (s.phase !== 'play') return; const p = +a.dataset.id; hint = null;
      if (selP === p) selP = null; else if (ms().some(m => m.t === 'play' && m.p === p && selC.every(c => m.c.includes(c)))) selP = p; else return;
      drawDock(); drawAux(); drawHand(); return;
    }
    if (k === 'clear') { selC = []; selP = null; hint = null; drawDock(); drawAux(); drawHand(); return; }
    if (k === 'atk') { const m = curMove(); if (m) run(m); return; }
    if (k === 'yield') return void run({ t: 'yield' });
    if (k === 'fake') return void run({ t: 'fake' });
    if (k === 'dclear') { selD = []; hint = null; drawDock(); drawHand(); return; }
    if (k === 'dconf') { if (s.phase !== 'dmg' || s.paid + selSum() < s.need) return; return void run(selD.map(c => ({ t: 'disc', c }))); }
    if (k === 'jester') {
      if (!ms().some(m => m.t === 'jester')) return;
      openSheet(`<h3>🃏 어릿광대 (공격 8, 면역 무시)</h3><p class="ri-sub">능력으로 쓸 직업을 고르세요</p><div class="ri-jk">${[1, 2, 3, 4].map(c => `<button data-skin="button" class="ri-b" data-a="jk" data-c="${c}" style="--cc:${CC[c]}">${CI[c]} ${CLS_KO[c]}<small>${POWER_KO[c]}</small></button>`).join('')}</div>`);
      return;
    }
    if (k === 'jk') { el.ov.hidden = true; el.ov.innerHTML = ''; sheet = null; return void run({ t: 'jester', k: +a.dataset.c }); }
    if (k === 'hint') {
      if (s.phase === 'dmg') {
        const c = JSON.parse(JSON.stringify(s)), pick = []; let fk = false;
        for (let i = 0; i < 12 && c.phase === 'dmg' && !c.over; i++) { const mv = game.botChoose(JSON.parse(JSON.stringify(c)), {}, rng).move; if (mv.t !== 'disc') { fk = mv.t === 'fake'; break; } pick.push(mv.c); game.applyMove(c, mv); }
        if (fk) { selD = []; hint = { t: 'fake' }; log('추천: 죽은 척하기', 'g'); } else { selD = pick; hint = null; log(`추천: ${pick.length}장 버리기`, 'g'); }
        draw(); return;
      }
      const r = game.botChoose(JSON.parse(JSON.stringify(s)), {}, rng), m = r.move; hint = m;
      if (m.t === 'play') { selC = m.c.slice().sort((x, y) => x - y); selP = m.p != null ? m.p : null; hint = { t: 'play', c: selC }; }
      else if (m.t === 'yield') log('추천: 양보', 'g');
      else if (m.t === 'jester') log(`추천: 어릿광대 (${CLS_KO[m.k]})`, 'g');
      else if (m.t === 'fake') log('추천: 죽은 척하기', 'g');
      draw();
    }
  });

  const rs = ctx.resumeState;
  if (rs && _t.validState(rs) && !rs.over) begin(rs); else begin(null);
  container._ri = { get state() { return s; }, run, draw, get sel() { return { selC, selD, selP }; } };   // 테스트용 손잡이
  return { destroy() { dead = true; blobUrls.forEach(u => URL.revokeObjectURL(u)); keep.length = 0; window.removeEventListener('resize', onResize); timers.forEach(clearTimeout); timers.clear(); container.querySelectorAll('.fx-layer').forEach(n => n.remove()); container.innerHTML = ''; } };
}

const RI_CSS = `
.g-regicide-inferno{position:relative;padding:6px 6px 10px;border-radius:16px;color:#f3e6d2;font-family:var(--fk,system-ui,sans-serif);
 background:radial-gradient(120% 60% at 50% 0%,#ff9a3a18,transparent 70%),repeating-linear-gradient(0deg,#ffffff05 0 1px,transparent 1px 4px),linear-gradient(180deg,var(--bg1),var(--bg2));
 box-shadow:inset 0 0 0 1.5px #ffffff22,inset 0 0 60px #000a,0 8px 22px #0007;-webkit-user-select:none;user-select:none}
.g-regicide-inferno *{box-sizing:border-box}
.g-regicide-inferno button{font-family:inherit;color:inherit}
.g-regicide-inferno h4{margin:0 0 4px;font-size:12px;color:#e9c98a;font-weight:700}
.g-regicide-inferno em{font-size:12px;color:#ffffff66;font-style:normal;padding:4px}
.g-regicide-inferno .ri-top{display:flex;align-items:center;gap:6px;flex-wrap:nowrap;margin-bottom:6px}
.g-regicide-inferno.ri-imm .ri-top{padding-right:52px}
.g-regicide-inferno .ri-pips{display:flex;gap:3px;flex:1;min-width:80px}
.g-regicide-inferno .ri-pip{flex:1;height:12px;border-radius:4px;background:#ffffff1c;font-size:9px;font-style:normal;text-align:center;line-height:12px;color:#ffd36b}
.g-regicide-inferno .ri-pip.done{background:#c8472b}.g-regicide-inferno .ri-pip.cur{background:#ffb347;box-shadow:0 0 8px #ffb347}
.g-regicide-inferno .ri-tn{white-space:nowrap;font-size:12px;color:#d9c3a0}
.g-regicide-inferno .ri-ib{border:1px solid #ffffff33;background:#ffffff12;border-radius:14px;padding:3px 8px;font-size:12px;cursor:pointer;white-space:nowrap}
.g-regicide-inferno .ri-grid{display:flex;flex-direction:column;gap:6px}
.g-regicide-inferno .ri-l,.g-regicide-inferno .ri-c,.g-regicide-inferno .ri-r{display:flex;flex-direction:column;gap:6px;min-width:0}
.g-regicide-inferno .ri-enemy,.g-regicide-inferno .ri-field,.g-regicide-inferno .ri-dock,.g-regicide-inferno .ri-log{background:#00000055;border:1px solid #ffffff22;border-radius:12px;padding:5px 8px;--sk-panel-d:5px}
.g-regicide-inferno .ri-r{display:none}
.g-regicide-inferno .ri-bt{display:flex;flex-direction:column;gap:6px;min-width:0}
.g-regicide-inferno .ri-eh{display:flex;gap:10px;align-items:flex-start}
.g-regicide-inferno .ri-ei{flex:1;min-width:0;display:flex;flex-direction:column;gap:5px}
.g-regicide-inferno .ri-en{font-size:16px;color:#ffd9a0}
.g-regicide-inferno .ri-hp{position:relative;height:26px;border-radius:10px;background:#0008;overflow:hidden;box-shadow:inset 0 0 0 1px #ffffff2a}
.g-regicide-inferno .ri-hp div{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#b8321f,#ef8a3a);transition:width .35s}
.g-regicide-inferno .ri-hp span{position:absolute;inset:0;text-align:center;line-height:26px;font-size:13px;font-weight:800;text-shadow:0 1px 2px #000}
.g-regicide-inferno .ri-st{display:flex;gap:10px;font-size:13px}.g-regicide-inferno .ri-st b{color:#ff8a6a;font-size:16px}
.g-regicide-inferno .ri-im{font-size:12px;color:#c9b79a;display:flex;gap:4px;align-items:center}
.g-regicide-inferno .ri-im i{font-style:normal;border:1px solid var(--cc);border-radius:10px;padding:0 5px;background:#0006}
.g-regicide-inferno .ri-l{position:relative}
.g-regicide-inferno .ri-piles{position:absolute;right:12px;bottom:9px;display:flex;gap:8px;z-index:2}
.g-regicide-inferno .ri-pg{display:contents}
.g-regicide-inferno .ri-pl{border:0;background:none;padding:0;display:flex;flex-direction:column;align-items:center;gap:1px;cursor:pointer;font-size:9px;color:#e9d9bd}
.g-regicide-inferno span.ri-pl{cursor:default}.g-regicide-inferno .ri-pl small{line-height:1;text-shadow:0 1px 2px #000}
.g-regicide-inferno .ri-stk{position:relative;display:block;width:var(--sw,34px);aspect-ratio:5/7;margin-bottom:5px}
.g-regicide-inferno .ri-stk>i{position:absolute;inset:0;border-radius:calc(var(--sw,34px)*.1);background:var(--bk,none) center/cover,linear-gradient(160deg,#6a3320,#2a120c);border:1px solid #d9a35a88;box-shadow:0 2px 5px #000b}
.g-regicide-inferno .ri-stk>i:last-of-type::after{content:'🔥';position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:calc(var(--sw,34px)*.42);opacity:.55}
.g-regicide-inferno.hasbk .ri-stk>i::after{display:none}
.g-regicide-inferno .ri-stk>i:nth-child(1){transform:translate(-4px,-4px) rotate(-3deg)}.g-regicide-inferno .ri-stk>i:nth-child(2){transform:translate(-2px,-2px) rotate(2deg)}
.g-regicide-inferno .ri-stk>i:nth-child(3){transform:translate(2px,1px) rotate(-1deg)}.g-regicide-inferno .ri-stk>i:last-of-type{transform:none}
.g-regicide-inferno .ri-stk .ri-card.stkf{position:absolute;inset:0;width:100%;margin:0;border-radius:calc(var(--sw,34px)*.1);cursor:inherit}
.g-regicide-inferno .ri-stk.emp{border:1.5px dashed #ffffff44;border-radius:calc(var(--sw,34px)*.1);background:#00000033}
.g-regicide-inferno .ri-pn{position:absolute;left:50%;bottom:-7px;transform:translateX(-50%);background:#000d;color:#ffd36b;font-style:normal;font-weight:800;font-size:11px;line-height:1.25;padding:0 6px;border-radius:9px;border:1px solid #ffffff3a;z-index:3;min-width:20px;text-align:center}
.g-regicide-inferno .ri-pl.castle .ri-stk>i{border-color:#ffd36bcc;box-shadow:0 2px 5px #000b,0 0 8px #ffb84a55}
.g-regicide-inferno .ri-pl.ban .ri-stk>i{filter:grayscale(1) brightness(.55)}
.g-regicide-inferno .ri-pl.disc .ri-stk .ri-card{filter:saturate(.7) brightness(.85)}
.g-regicide-inferno .ri-card.fxg{pointer-events:none;transition:none;cursor:default;border-radius:6px}
.g-regicide-inferno .ri-fxl{position:fixed;inset:0;pointer-events:none;z-index:8999;overflow:hidden}
.g-regicide-inferno .ri-field{display:grid;grid-template-columns:1fr 1fr;gap:8px}.g-regicide-inferno .ri-field h4{margin:0 0 2px}.g-regicide-inferno .ri-field .ri-card.sm{width:32px}.g-regicide-inferno .ri-field .ri-row{gap:3px;min-height:20px}
.g-regicide-inferno .ri-row{display:flex;gap:5px;flex-wrap:wrap;align-items:center;min-height:30px}.g-regicide-inferno .ri-row.ctr{justify-content:center}
.g-regicide-inferno .ri-grp{display:flex;gap:3px;padding:3px;border-radius:8px;background:#ffffff0d}.g-regicide-inferno .ri-grp.j{background:#d9d9e822}
.g-regicide-inferno .ri-msg{font-size:13px;line-height:1.5;min-height:20px}.g-regicide-inferno .ri-msg b{color:#ffd36b}
.g-regicide-inferno .ri-btns{display:flex;gap:6px;flex-wrap:wrap;margin-top:4px}
.g-regicide-inferno .ri-b{border:1px solid #ffffff3a;background:#ffffff14;border-radius:10px;padding:6px 12px;font-size:14px;cursor:pointer}
.g-regicide-inferno .ri-b.pri{background:linear-gradient(180deg,#e0792b,#a8431a);border-color:#ffb27a;font-weight:800}
.g-regicide-inferno .ri-b.wide{width:100%;margin-top:10px}.g-regicide-inferno .ri-b:disabled{opacity:.4;cursor:default}
.g-regicide-inferno .ri-b small{display:block;font-size:10px;color:#e6d6b8;margin-top:2px}
.g-regicide-inferno .ri-aux{display:flex;gap:6px;flex-wrap:nowrap;justify-content:center}.g-regicide-inferno .ri-ax{flex:none;min-width:0;background:#00000040;border-radius:10px;padding:3px 6px}.g-regicide-inferno .ri-ax .ri-row{flex-wrap:nowrap;gap:4px;min-height:0}.g-regicide-inferno .ri-ax h4{margin:0 0 2px;font-size:11px}
.g-regicide-inferno .ri-j{width:42px;height:59px;padding:0;border-radius:7px;border:1.5px solid #d9d9e8;background:#2a2740;font-size:26px;cursor:pointer;position:relative;overflow:hidden}
.g-regicide-inferno .ri-j span{position:absolute;inset:0;background-size:cover;background-position:center}
.g-regicide-inferno .ri-j.used{opacity:.18;border-style:dashed;cursor:default}.g-regicide-inferno .ri-j.dim{opacity:.45}
.g-regicide-inferno .ri-j.hint,.g-regicide-inferno .ri-card.hint{box-shadow:0 0 0 3px #fff,0 0 14px 4px #ffd36b}
.g-regicide-inferno .ri-hand{display:grid;grid-template-columns:repeat(4,var(--hw,1fr));gap:6px;justify-content:center}
.g-regicide-inferno .ri-hand.big{grid-template-columns:repeat(3,1fr)}
.g-regicide-inferno .ri-emp{grid-column:1/-1;text-align:center;padding:16px}
.g-regicide-inferno .ri-card{position:relative;width:100%;aspect-ratio:5/7;border-radius:9px;border:2px solid var(--cc);cursor:pointer;overflow:hidden;
 background:linear-gradient(160deg,color-mix(in srgb,var(--cc) 38%,#14100c),#14100c 78%);background-size:cover;background-position:center;box-shadow:0 3px 8px #0008;transition:transform .12s,filter .12s}
.g-regicide-inferno .ri-card.art{border:0;box-shadow:0 3px 8px #000a}.g-regicide-inferno .ri-card.art .ri-rk,.g-regicide-inferno .ri-card.art .ri-vl{display:none}
.g-regicide-inferno .ri-card.back{border-color:#c28a4a;background-color:#3a1b12}
.g-regicide-inferno .ri-rk{position:absolute;top:2px;left:4px;font-size:clamp(15px,5.2vw,22px);line-height:1;color:#fff;text-shadow:0 0 3px #000,0 1px 3px #000,0 0 6px #000}
.g-regicide-inferno .ri-ic{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:clamp(24px,9vw,38px);opacity:.9}
.g-regicide-inferno .ri-vl{position:absolute;right:0;bottom:0;font-style:normal;font-size:11px;font-weight:800;background:#000a;padding:1px 6px;border-radius:7px 0 0 0;color:#fff}
.g-regicide-inferno .ri-card.sel{transform:translateY(-8px);box-shadow:0 0 0 3px #ffd36b,0 8px 14px #000a}
.g-regicide-inferno .ri-card.dim{filter:grayscale(.7) brightness(.55);cursor:default}
.g-regicide-inferno .ri-card.dsc{box-shadow:0 0 0 2px #e0553b}
.g-regicide-inferno .ri-card.sm{width:46px;border-radius:6px;border-width:1.5px;cursor:default}
.g-regicide-inferno .ri-card.sm .ri-rk{font-size:14px}.g-regicide-inferno .ri-card.sm .ri-ic{font-size:18px}.g-regicide-inferno .ri-card.sm .ri-vl{font-size:9px;padding:0 4px}
.g-regicide-inferno .ri-card.sm.side{transform:rotate(8deg);margin-left:4px}
.g-regicide-inferno [data-a="partner"].ri-card.sm{width:44px;cursor:pointer}
.g-regicide-inferno .ri-card.en{width:min(136px,38vw);flex:none}
.g-regicide-inferno .ri-card.zoom{width:min(70vw,260px);cursor:default}.g-regicide-inferno .ri-card.zoom .ri-rk{font-size:30px}.g-regicide-inferno .ri-card.zoom .ri-vl{font-size:15px}
.g-regicide-inferno .ri-lg{font-size:12px;line-height:1.55;max-height:120px;overflow:auto;color:#d9c9ac}.g-regicide-inferno .ri-lg.full{max-height:60vh;font-size:13px}
.g-regicide-inferno .ri-lg .g{color:#8be29b}.g-regicide-inferno .ri-lg .r{color:#ff8f7a}
.g-regicide-inferno .ri-ov{position:fixed;inset:0;z-index:40;background:#000b;display:flex;align-items:center;justify-content:center;padding:14px}.g-regicide-inferno .ri-ov[hidden]{display:none}
.g-regicide-inferno .ri-sheet{width:100%;max-width:520px;max-height:88vh;overflow:auto;border-radius:16px;padding:16px 14px 14px;background:#241510;border:1px solid #ffffff33;box-shadow:0 12px 30px #000c}
.g-regicide-inferno .ri-sheet h3{margin:0 0 8px;font-size:17px;color:#ffd9a0}.g-regicide-inferno .ri-sub{margin:0 0 10px;font-size:12.5px;color:#d9c3a0}
.g-regicide-inferno .ri-sheet .ri-card:not(.sm):not(.zoom){width:72px}
.g-regicide-inferno .ri-rules{padding-left:18px;margin:0;font-size:13px;line-height:1.6}.g-regicide-inferno .ri-rules li{margin-bottom:5px}
.g-regicide-inferno .ri-cl{margin:0;padding-left:22px;font-size:14px;line-height:1.8}.g-regicide-inferno .ri-cl small{color:#bba98b}.g-regicide-inferno .ri-cl .now{font-weight:800;color:#ffd36b}
.g-regicide-inferno .ri-jk{display:grid;gap:8px}.g-regicide-inferno .ri-jk .ri-b{border-color:var(--cc);text-align:left}
.g-regicide-inferno{--sk-panel-d:8px}.g-regicide-inferno .ri-sheet{--sk-panel-d:14px}
@media (min-width:1000px) and (min-height:560px){
 .g-regicide-inferno{padding:calc(var(--k,1)*12px);display:flex;flex-direction:column}
 .g-regicide-inferno .ri-grid{display:grid;grid-template-columns:calc(var(--k,1)*300px) 1fr calc(var(--k,1)*250px);gap:calc(var(--k,1)*12px);align-items:start;flex:1;grid-template-rows:auto 1fr auto}
 .g-regicide-inferno .ri-l,.g-regicide-inferno .ri-c{display:contents}
 .g-regicide-inferno .ri-eh{align-items:center}
 .g-regicide-inferno .ri-enemy{grid-column:1;grid-row:1}.g-regicide-inferno .ri-dock{grid-column:2;grid-row:1}.g-regicide-inferno .ri-r{grid-column:3;grid-row:1}
 .g-regicide-inferno .ri-field{grid-column:2;grid-row:2;align-self:stretch;align-content:center}
 .g-regicide-inferno .ri-piles{position:static;display:contents}
 .g-regicide-inferno .ri-pg{display:flex;grid-row:2;align-self:center;justify-content:center;gap:calc(var(--k,1)*18px);--sw:calc(var(--k,1)*62px)}
 .g-regicide-inferno .ri-pg:first-child{grid-column:1}.g-regicide-inferno .ri-pg:last-child{grid-column:3}
 .g-regicide-inferno .ri-pl{font-size:calc(var(--k,1)*12px);gap:calc(var(--k,1)*4px)}.g-regicide-inferno .ri-pn{font-size:calc(var(--k,1)*13px);bottom:calc(var(--k,1)*-9px)}
 .g-regicide-inferno .ri-bt{grid-column:1/-1;grid-row:3;align-self:end}
 .g-regicide-inferno .ri-r{display:flex}
 .g-regicide-inferno .ri-hand{grid-template-columns:repeat(8,var(--hw,1fr));gap:calc(var(--k,1)*10px);justify-content:center}
 .g-regicide-inferno .ri-hand.big{grid-template-columns:repeat(4,var(--hw,1fr))}
 .g-regicide-inferno .ri-card.en{width:calc(var(--k,1)*124px)}
 .g-regicide-inferno .ri-field .ri-card.sm{width:calc(var(--k,1)*62px)}
 .g-regicide-inferno .ri-ax{flex:1;padding:5px 8px}.g-regicide-inferno .ri-aux{justify-content:stretch}
 .g-regicide-inferno .ri-j{width:calc(var(--k,1)*54px);height:calc(var(--k,1)*76px)}
 .g-regicide-inferno .ri-enemy,.g-regicide-inferno .ri-field,.g-regicide-inferno .ri-dock,.g-regicide-inferno .ri-log{padding:8px 10px;--sk-panel-d:8px}
 .g-regicide-inferno .ri-card.sm{width:calc(var(--k,1)*50px)}
 .g-regicide-inferno [data-a="partner"].ri-card.sm{width:calc(var(--k,1)*64px)}
 .g-regicide-inferno .ri-rk{font-size:calc(var(--k,1)*22px)}.g-regicide-inferno .ri-card.sm .ri-rk{font-size:calc(var(--k,1)*15px)}
 .g-regicide-inferno .ri-msg{font-size:calc(var(--k,1)*14px)}.g-regicide-inferno .ri-b{font-size:calc(var(--k,1)*14px);padding:calc(var(--k,1)*8px) calc(var(--k,1)*16px)}
 .g-regicide-inferno .ri-lg{max-height:calc(var(--k,1)*210px);font-size:calc(var(--k,1)*12.5px)}
 .g-regicide-inferno .ri-en{font-size:calc(var(--k,1)*18px)}
}`;
