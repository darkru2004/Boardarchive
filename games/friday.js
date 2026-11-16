// 프라이데이 (Friday) — 1인용 덱 빌딩. 카드는 Friedemann Friese 원작 규칙(룰북 v1)을 따른다.
// 구조: [데이터] → [엔진: newGame/legalMoves/applyMove/result] → [봇] → [화면 mount]. 규칙은 엔진 전담, 화면은 그 위에 얹는다.
// 카드 그림은 앱의 "카드 그림" 슬롯(ctx.art)에서 받고, 없으면 CSS로 그린 기본 카드가 나온다.

// ───────────────────────── 데이터 ─────────────────────────
// 능력 코드: life1/life2(+생명) card1/card2(+카드) destroy double copy step(단계-1) sort(3장 정렬) ex1/ex2(교환) below(스택 아래로)
// 노화: hi0(가장 높은 카드=0) m1/m2(-1/-2 생명) stop(무료 뽑기 중단)
export const AB_KO = { life1: '+1 생명', life2: '+2 생명', card1: '+1 카드', card2: '+2 카드', destroy: '파괴 ×1', double: '2배 ×1', copy: '복사 ×1', step: '단계 −1', sort: '3장 정렬', ex1: '교환 ×1', ex2: '교환 ×2', below: '아래로 ×1', hi0: '최고값=0', m1: '생명 −1', m2: '생명 −2', stop: '멈춤' };
export const AB_HELP = {
  life1: '예비 생명 1개를 가져옵니다.', life2: '예비 생명을 최대 2개 가져옵니다.',
  card1: '카드 1장을 무료로 더 뽑아 오른쪽에 놓습니다.', card2: '카드를 최대 2장 무료로 더 뽑습니다.',
  destroy: '다른 카드 1장을 뒤집어 효과를 없앱니다(값 0). 싸움이 끝나면 그 카드는 게임에서 제거됩니다.',
  double: '다른 카드 1장의 싸움값을 싸움 끝에 2배로 칩니다. 한 카드엔 한 번만.',
  copy: '다른 카드의 능력 1개를 한 번 더 씁니다.',
  step: '노랑·빨강 단계에서 위험 값을 한 단계 낮은 색 값으로 비교합니다(싸움 끝에 적용).',
  sort: '카드 더미 위 3장을 보고 최대 1장을 버린 뒤 순서를 정해 되돌립니다.',
  ex1: '다른 카드 1장을 버리고 새로 뽑아 그 자리에 놓습니다.', ex2: '다른 카드를 최대 2장 교환합니다.',
  below: '다른 카드 1장을 카드 더미 맨 아래로 보냅니다. 왼쪽(무료) 카드였다면 대신 1장 뽑습니다.',
  hi0: '싸움값이 가장 높은 카드 1장이 0점으로 계산됩니다.', m1: '싸움이 끝날 때 생명 1을 냅니다. 이겨도 냅니다.', m2: '싸움이 끝날 때 생명 2를 냅니다. 이겨도 냅니다.',
  stop: '이 카드가 왼쪽(무료) 자리에 놓이면 무료 뽑기가 멈춥니다.'
};
// 시작 카드 5종(18장): 그림 슬롯 번호 = 순서
export const START_DEFS = [
  { n: 'Weak', v: 0, c: 8 }, { n: 'Eating', v: 0, ab: 'life2', c: 1 }, { n: 'Distracted', v: -1, c: 5 }, { n: 'Bazooka', v: 2, c: 1 }, { n: 'Bullet', v: 1, c: 3 }
];
// 노화 11장(일반 8 + 어려움 3). 그림 슬롯 번호 = 순서. 'Very Stupid'(레벨 1·2에서 제거)는 일반 노화 중 가장 나쁜 −3 카드로 본다.
export const AGING_DEFS = [
  { n: 'Crocodile', v: 0, ab: 'hi0' }, { n: 'Moria', v: 0, ab: 'hi0' }, { n: 'Kuma', v: -1 }, { n: 'Buggy', v: 0, ab: 'm1' }, { n: 'Hancock', v: 0, ab: 'stop' },
  { n: 'Doflamingo', v: -2 }, { n: 'Mihawk', v: -2 }, { n: 'Weevil', v: -3, vs: true },
  { n: 'Big Mom', v: 0, ab: 'm2', hard: true }, { n: 'Kaido', v: -4, hard: true }, { n: 'Blackbeard', v: -5, hard: true }
];
// 위험/지식 카드 30장(그림 슬롯 번호 = 순서+1). f=무료 카드 수, g/y/r=초록·노랑·빨강 위험값, kv/ab=지식 면 싸움값·능력
const H = (n, f, g, y, r, k, kv, ab) => ({ n, f, g, y, r, k, kv, ab });
export const HAZARDS = [
  H('Whole Cake Island', 5, 5, 9, 14, 'Gear 4th', 4), H('Dressrosa', 5, 5, 9, 14, 'Gear 4th', 4), H('Enies Lobby', 4, 4, 7, 11, 'Gear 3rd', 3, 'card1'),
  H('Tequila Wolf', 2, 1, 3, 6, 'Robin', 1, 'copy'), H('Skypiea', 1, 0, 1, 3, 'Robin', 0, 'copy'), H('Thriller Bark', 1, 0, 1, 3, 'Brook', 0, 'step'),
  H('Enies Lobby', 3, 2, 5, 8, 'Gear 2nd', 2, 'card1'), H('Fish-Man Island', 2, 1, 3, 6, 'Jinbe', 1, 'below'), H('Impel Down', 1, 0, 1, 3, 'Jinbe', 0, 'below'),
  H('Kuraigana Island', 4, 4, 7, 11, 'Zoro', 3, 'destroy'),
  H('Enies Lobby', 3, 2, 5, 8, 'Zoro', 2, 'destroy'), H('Baratie', 2, 1, 3, 6, 'Zoro', 1, 'destroy'), H('Weatheria', 4, 4, 7, 11, 'Nami', 3, 'ex1'),
  H('Enies Lobby', 3, 2, 5, 8, 'Nami', 2, 'ex1'), H('Skypiea', 1, 0, 1, 3, 'Nami', 0, 'ex2'), H('Torino Kingdom', 3, 2, 5, 8, 'Chopper', 2, 'life1'),
  H('Sabaody Archipelago', 2, 1, 3, 6, 'Chopper', 1, 'life1'), H('Enies Lobby', 2, 1, 3, 6, 'Chopper', 1, 'life1'), H('Alabasta', 1, 0, 1, 3, 'Chopper', 0, 'life1'),
  H('Drum Island', 1, 0, 1, 3, 'Chopper', 0, 'life1'),
  H('Boin Archipelago', 1, 0, 1, 3, 'Usopp', 0, 'card2'), H('Whisky Peak', 1, 0, 1, 3, 'Zoro', 0, 'destroy'), H('Water 7', 2, 1, 3, 6, 'Franky', 1, 'double'),
  H('Wano Kingdom', 4, 4, 7, 11, 'Sanji', 3, 'sort'), H('Arlong Park', 1, 0, 1, 3, 'Nami', 0, 'ex2'), H('Karakuri Island', 3, 2, 5, 8, 'Franky', 2, 'double'),
  H('Fish-Man Island', 2, 1, 3, 6, 'Franky', 2), H('Punk Hazard', 2, 1, 3, 6, 'Franky', 2), H('Momoiro Island', 3, 2, 5, 8, 'Sanji', 2, 'sort'),
  H('Syrup Village', 1, 0, 1, 3, 'Usopp', 0, 'card2')
];
// 해적 10장(그림 슬롯 번호 = 순서+1). v=null이면 특수 계산. sp: cost2(추가 카드 생명 2) half(카드 절반만) plus1(카드마다 +1) aging2(노화 1장당 +2) rest(남은 위험 전부)
export const PIRATES = [
  { v: 30, f: 8 }, { v: 16, f: 7, sp: 'cost2' }, { v: 22, f: 9, sp: 'half' }, { v: 52, f: 10, sp: 'plus1' }, { v: 40, f: 10 },
  { v: 35, f: 9 }, { v: 20, f: 6 }, { v: null, f: 5, sp: 'aging2' }, { v: null, f: null, sp: 'rest' }, { v: 25, f: 7 }
];
export const PIRATE_HELP = {
  cost2: '추가로 뽑는 카드마다 생명 2를 냅니다.', half: '뽑은 카드 중 절반(올림)만 싸움값으로 칩니다. 노화 카드는 반드시 포함.',
  plus1: '뽑은 카드 한 장마다 싸움값 +1.', aging2: '카드 더미에 들어온 노화 카드 1장당 위험값 +2.', rest: '위험 버린 더미에 남은 위험 카드의 빨강 값을 전부 더한 값과 무료 카드 수의 합이 이 해적의 수치.'
};
export const STEP_KO = ['초록', '노랑', '빨강'];

// ───────────────────────── 카드 인스턴스 ─────────────────────────
// 싸움 카드 = { u(고유번호), t:'S'(시작)|'A'(노화)|'K'(지식), d(정의 번호) }
export const defOf = c => (c.t === 'S' ? START_DEFS[c.d] : c.t === 'A' ? AGING_DEFS[c.d] : null);
export const valOf = c => (c.t === 'K' ? HAZARDS[c.d].kv : defOf(c).v);
export const abOf = c => (c.t === 'K' ? HAZARDS[c.d].ab || null : defOf(c).ab || null);
export const nameOf = c => (c.t === 'K' ? HAZARDS[c.d].k : defOf(c).n);
export const lifeCost = c => (c.t === 'A' ? 2 : 1);
const ACTIVE_AB = new Set(['life1', 'life2', 'card1', 'card2', 'destroy', 'double', 'copy', 'step', 'sort', 'ex1', 'ex2', 'below']);   // 사용자가 직접 쓰는 능력(노화는 자동)

// ───────────────────────── 엔진 ─────────────────────────
const clone = x => JSON.parse(JSON.stringify(x));
const mk = (s, t, d) => ({ u: s.uid++, t, d });

function newGame({ players, options, rng }) {
  const level = options && [1, 2, 3, 4].includes(options.level) ? options.level : 1;
  const s = { v: 1, level, step: 0, phase: 'choose', uid: 1, life: level === 4 ? 18 : 20, reserve: 2, over: false, won: false, why: '', humanSeat: Math.max(0, players.findIndex(p => p.human)), turn: 0,
    rob: [], robDisc: [], hazDeck: [], hazDisc: [], aging: [], agingStart: 0, gone: [], offer: [], single: null, pirates: [], pirateNo: -1, beaten: 0, fight: null, ev: [], turns: 0, stats: { wins: 0, losses: 0, sac: 0 } };
  if (s.humanSeat < 0) s.humanSeat = 0;
  // 시작 카드 18장
  const start = [];
  START_DEFS.forEach((d, i) => { for (let k = 0; k < d.c; k++) start.push(mk(s, 'S', i)); });
  // 노화: 일반 7(레벨 3·4는 8: Very Stupid 포함)을 섞고 어려움 3을 섞어 아래에 → 일반이 위
  const norm = [], hard = [];
  AGING_DEFS.forEach((d, i) => { if (d.hard) hard.push(mk(s, 'A', i)); else if (!(d.vs && level < 3)) norm.push(mk(s, 'A', i)); });
  s.aging = rng.shuffle(norm).concat(rng.shuffle(hard));
  s.agingStart = s.aging.length;
  if (level >= 2) start.push(s.aging.shift());   // 레벨 2+: 맨 위 노화 1장을 시작 더미에 섞음
  s.rob = rng.shuffle(start);
  s.hazDeck = rng.shuffle(HAZARDS.map((_, i) => i));
  const pr = rng.shuffle(PIRATES.map((_, i) => i));
  s.pirates = [pr[0], pr[1]];
  nextTurn(s, rng);
  return s;
}

// 위험 카드 더미에서 다음 턴 준비
function nextTurn(s, rng) {
  for (;;) {
    if (s.hazDeck.length >= 2) { s.offer = [s.hazDeck.pop(), s.hazDeck.pop()]; s.phase = 'choose'; s.turns++; return; }
    if (s.hazDeck.length === 1) { s.single = s.hazDeck.pop(); s.phase = 'single'; s.turns++; return; }
    if (s.step >= 2) { s.phase = 'pchoose'; return; }      // 빨강 단계 끝 → 해적
    s.step++;
    s.hazDeck = rng.shuffle(s.hazDisc); s.hazDisc = [];
    s.ev.push({ k: 'step', step: s.step });
  }
}

// 싸움 카드 더미에서 1장 뽑기(맨 위 = rob[0]). 비면 버린 더미 + 노화 1장을 섞어 새 더미.
function drawOne(s, rng) {
  if (!s.rob.length) {
    const pile = s.robDisc; s.robDisc = [];
    if (s.aging.length) { const a = s.aging.shift(); pile.push(a); s.ev.push({ k: 'age', u: a.u }); }
    s.rob = rng.shuffle(pile);
    s.ev.push({ k: 'shuffle' });
  }
  return s.rob.length ? s.rob.shift() : null;
}
const cardsOf = f => f.left.concat(f.right);
const find = (f, u) => cardsOf(f).find(c => c.u === u);
const upOf = f => cardsOf(f).filter(c => !f.down[c.u]);
function hazardInfo(s, ref) {
  if (ref.type === 'h') { const h = HAZARDS[ref.i]; return { name: h.n, free: h.f, vals: [h.g, h.y, h.r], pirate: false }; }
  const p = PIRATES[ref.i];
  let v = p.v, f = p.f;
  if (p.sp === 'aging2') v = 2 * (s.agingStart - s.aging.length);
  if (p.sp === 'rest') { v = s.hazDisc.reduce((a, i) => a + HAZARDS[i].r, 0); f = s.hazDisc.reduce((a, i) => a + HAZARDS[i].f, 0); }
  return { name: 'Marine', free: f, vals: [v, v, v], pirate: true, sp: p.sp || null };
}
function startFight(s, ref) {
  const info = hazardInfo(s, ref);
  s.fight = { ref, left: [], right: [], used: {}, down: {}, dbl: {}, stepdown: 0, free: info.free, need: info.vals, pirate: info.pirate, sp: info.sp || null, pend: null, lost: null };
  s.phase = 'fight';
}
const stopActive = f => f.left.some(c => c.t === 'A' && defOf(c).ab === 'stop' && !f.down[c.u]);
const freeLeft = f => (stopActive(f) ? 0 : Math.max(0, f.free - f.left.length));
const sacCost = f => (f.sp === 'cost2' ? 2 : 1);

// 싸움 점수 계산 (끝낼 때 비교하는 값). 읽기 전용.
export function evalFight(s) {
  const f = s.fight, cards = cardsOf(f), eff = {};
  const hiCards = cards.filter(c => c.t === 'A' && defOf(c).ab === 'hi0' && !f.down[c.u]);
  const base = {}; cards.forEach(c => { base[c.u] = f.down[c.u] ? 0 : valOf(c); eff[c.u] = base[c.u]; });
  const zeroed = new Set();
  for (let k = 0; k < hiCards.length; k++) {
    let best = null; for (const c of cards) { if (zeroed.has(c.u) || f.down[c.u]) continue; if (base[c.u] > 0 && (!best || base[c.u] > base[best.u])) best = c; }
    if (best) { zeroed.add(best.u); eff[best.u] = 0; }
  }
  cards.forEach(c => { if (f.dbl[c.u] && !zeroed.has(c.u)) eff[c.u] = eff[c.u] * 2; });
  let total = 0;
  if (f.sp === 'half') {
    const forced = cards.filter(c => c.t === 'A' && !f.down[c.u]), rest = cards.filter(c => !(c.t === 'A' && !f.down[c.u])).map(c => eff[c.u]).sort((a, b) => b - a);
    const slots = Math.ceil(cards.length / 2);
    total = forced.reduce((a, c) => a + eff[c.u], 0);
    for (let i = 0; i < Math.max(0, slots - forced.length); i++) if (rest[i] != null && rest[i] > 0) total += rest[i];
  } else total = cards.reduce((a, c) => a + eff[c.u], 0);
  if (f.sp === 'plus1') total += cards.length;
  const stepEff = f.pirate ? 0 : Math.max(0, s.step - f.stepdown);
  const need = f.need[stepEff];
  let ageLife = 0; cards.forEach(c => { if (c.t === 'A' && !f.down[c.u]) { const a = defOf(c).ab; if (a === 'm1') ageLife += 1; if (a === 'm2') ageLife += 2; } });
  return { total, need, stepEff, ageLife, eff, zeroed: [...zeroed] };
}

function gain(s, n) { const g = Math.min(n, s.reserve); s.life += g; s.reserve -= g; if (g) s.ev.push({ k: 'life', d: g }); return g; }
function pay(s, n) {
  if (n <= 0) return true;
  if (n > s.life) { s.reserve += s.life; s.life = 0; s.over = true; s.won = false; s.why = 'life'; s.ev.push({ k: 'dead' }); return false; }
  s.life -= n; s.reserve += n; s.ev.push({ k: 'life', d: -n }); return true;
}
function place(s, side, card, at) { const arr = s.fight[side]; if (at == null) arr.push(card); else arr.splice(at, 0, card); s.ev.push({ k: 'draw', u: card.u, side }); }
function drawTo(s, side, rng) { const c = drawOne(s, rng); if (c) place(s, side, c); return c; }

// 능력 후보(대상) 계산
function targetsFor(s, ab, srcU) {
  const f = s.fight;
  const others = upOf(f).filter(c => c.u !== srcU);
  if (ab === 'destroy' || ab === 'ex1' || ab === 'ex2' || ab === 'below') return others.map(c => c.u);
  if (ab === 'double') return others.filter(c => !f.dbl[c.u]).map(c => c.u);
  if (ab === 'copy') return others.filter(c => c.t !== 'A' && abOf(c) && abOf(c) !== 'copy' && ACTIVE_AB.has(abOf(c))).map(c => c.u);
  return [];
}
function abilityUsable(s, ab, srcU) {
  const f = s.fight;
  if (ab === 'life1' || ab === 'life2') return s.reserve > 0;
  if (ab === 'card1' || ab === 'card2' || ab === 'sort') return s.rob.length + s.robDisc.length + s.aging.length > 0;
  if (ab === 'step') return !f.pirate && s.step - f.stepdown > 0;
  return targetsFor(s, ab, srcU).length > 0;
}
// 능력 실행 시작. src = 능력을 쓰는 카드(복사면 복사 카드), 능력은 ab
function runAbility(s, ab, srcU, rng) {
  const f = s.fight;
  if (ab === 'life1') gain(s, 1);
  else if (ab === 'life2') gain(s, 2);
  else if (ab === 'card1') drawTo(s, 'right', rng);
  else if (ab === 'card2') f.pend = { k: 'draw', n: 2, src: srcU };
  else if (ab === 'step') f.stepdown++;
  else if (ab === 'sort') {
    const cs = []; for (let i = 0; i < 3; i++) { const c = drawOne(s, rng); if (c) cs.push(c); }
    if (cs.length) f.pend = { k: 'sort', cards: cs, src: srcU };
  } else if (ab === 'copy') f.pend = { k: 'tgt', ab: 'copy', src: srcU, n: 1 };
  else f.pend = { k: 'tgt', ab, src: srcU, n: ab === 'ex2' ? 2 : 1, done: 0 };
}
function removeFrom(f, u) {
  for (const side of ['left', 'right']) { const i = f[side].findIndex(c => c.u === u); if (i >= 0) return { side, i, card: f[side].splice(i, 1)[0] }; }
  return null;
}
// 대상 선택 처리
function applyTarget(s, u, rng) {
  const f = s.fight, p = f.pend;
  if (p.ab === 'copy') {
    const t = find(f, u), ab = abOf(t);
    f.pend = null; s.ev.push({ k: 'copy', u: t.u });
    runAbility(s, ab, p.src, rng);
    // 복사한 능력은 대상이 없으면 소멸(이미 사용 처리됨)
    if (f.pend && f.pend.k === 'tgt' && !targetsFor(s, f.pend.ab, p.src).length) f.pend = null;
    return;
  }
  if (p.ab === 'destroy') { f.down[u] = 1; s.ev.push({ k: 'destroy', u }); f.pend = null; return; }
  if (p.ab === 'double') { f.dbl[u] = 1; s.ev.push({ k: 'double', u }); f.pend = null; return; }
  if (p.ab === 'ex1' || p.ab === 'ex2') {
    const r = removeFrom(f, u); s.robDisc.push(r.card); s.ev.push({ k: 'out', u });
    const c = drawOne(s, rng); if (c) place(s, r.side, c, r.i);
    p.n--; p.done = (p.done || 0) + 1;
    if (p.n <= 0 || !targetsFor(s, p.ab, p.src).length) f.pend = null;
    return;
  }
  if (p.ab === 'below') {
    const r = removeFrom(f, u);
    if (!s.rob.length) { const pile = s.robDisc; s.robDisc = []; if (s.aging.length) { const a = s.aging.shift(); pile.push(a); s.ev.push({ k: 'age', u: a.u }); } s.rob = rng.shuffle(pile); s.ev.push({ k: 'shuffle' }); }
    s.rob.push(r.card); s.ev.push({ k: 'under', u });
    if (r.side === 'left') { const c = drawOne(s, rng); if (c) place(s, 'left', c, r.i); }
    f.pend = null;
  }
}

// 싸움 정리: 카드들을 어디로 보낼지
function settle(s, { win, destroyU = [] }) {
  const f = s.fight;
  const kill = new Set(destroyU);
  for (const c of cardsOf(f)) {
    if (f.down[c.u] || kill.has(c.u)) { s.gone.push(c); s.ev.push({ k: 'gone', u: c.u }); } else s.robDisc.push(c);
  }
  if (f.ref.type === 'h') { if (win) s.robDisc.push(mk(s, 'K', f.ref.i)); else s.hazDisc.push(f.ref.i); }
  s.fight = null;
}
function afterFight(s, rng) {
  s.phase = 'choose';
  if (s.pirateNo >= 0) {   // 해적 싸움이었음
    if (s.beaten >= 2) { s.over = true; s.won = true; s.why = 'win'; s.phase = 'over'; return; }
    s.pirateNo = 1; startFight(s, { type: 'p', i: s.pirates[1] }); return;
  }
  nextTurn(s, rng);
}

function legalMoves(s) {
  if (s.over) return [];
  const ph = s.phase;
  if (ph === 'choose') return [{ t: 'pick', i: 0 }, { t: 'pick', i: 1 }];
  if (ph === 'single') return [{ t: 'fight1' }, { t: 'skip1' }];
  if (ph === 'pchoose') return [{ t: 'pirate', i: 0 }, { t: 'pirate', i: 1 }];
  if (ph === 'lose') {
    const L = s.fight.lose, out = [];
    for (const c of cardsOf(s.fight)) if (!s.fight.down[c.u] && !L.picked.includes(c.u) && lifeCost(c) <= L.budget) out.push({ t: 'dest', u: c.u });
    out.push({ t: 'fin' }); return out;
  }
  const f = s.fight, p = f.pend, out = [];
  if (p) {
    if (p.k === 'tgt') { targetsFor(s, p.ab, p.src).forEach(u => out.push({ t: 'tgt', u })); if (p.done > 0) out.push({ t: 'psk' }); }
    else if (p.k === 'draw') { out.push({ t: 'pdraw' }, { t: 'psk' }); }
    else if (p.k === 'sort') {
      const n = p.cards.length, idx = [...Array(n).keys()];
      const perms = a => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms([...a.slice(0, i), ...a.slice(i + 1)]).map(r => [x, ...r])));
      for (const d of [null, ...idx]) for (const pm of perms(idx.filter(i => i !== d))) out.push({ t: 'sort', d, o: pm });
    }
    return out;
  }
  if (cardsOf(f).length < 99) out.push({ t: 'draw' });
  for (const c of upOf(f)) {
    const ab = abOf(c); if (c.t === 'A' || !ab || f.used[c.u] || !ACTIVE_AB.has(ab)) continue;
    if (abilityUsable(s, ab, c.u)) out.push({ t: 'ab', u: c.u });
  }
  if (cardsOf(f).length) {
    const e = evalFight(s);
    if (e.total >= e.need) { if (e.ageLife <= s.life) out.push({ t: 'end' }); }
    else if (!f.pirate && e.need - e.total + e.ageLife <= s.life) out.push({ t: 'end' });
  }
  return out;
}

function applyMove(s, m, rng) {
  if (s.over) return;
  s.ev = [];
  const ph = s.phase;
  if (ph === 'choose') {
    const keep = s.offer[m.i], other = s.offer[1 - m.i];
    s.hazDisc.push(other); s.offer = []; s.ev.push({ k: 'pick', i: keep });
    startFight(s, { type: 'h', i: keep }); return;
  }
  if (ph === 'single') {
    const h = s.single; s.single = null;
    if (m.t === 'fight1') startFight(s, { type: 'h', i: h }); else { s.hazDisc.push(h); nextTurn(s, rng); }
    return;
  }
  if (ph === 'pchoose') {
    s.pirateNo = 0; s.pirates = m.i === 0 ? s.pirates : [s.pirates[1], s.pirates[0]];
    startFight(s, { type: 'p', i: s.pirates[0] }); return;
  }
  if (ph === 'lose') {
    const L = s.fight.lose;
    if (m.t === 'dest') { const c = find(s.fight, m.u); L.picked.push(m.u); L.budget -= lifeCost(c); }
    if (m.t === 'fin' || !legalMoves(s).some(x => x.t === 'dest')) { settle(s, { win: false, destroyU: L.picked }); afterFight(s, rng); }
    return;
  }
  const f = s.fight, p = f.pend;
  if (p) {
    if (m.t === 'tgt') applyTarget(s, m.u, rng);
    else if (m.t === 'psk') f.pend = null;
    else if (m.t === 'pdraw') { drawTo(s, 'right', rng); p.n--; if (p.n <= 0) f.pend = null; }
    else if (m.t === 'sort') {
      const keep = p.cards.filter((_, i) => i !== m.d), ord = m.o.map(i => p.cards[i]);
      if (m.d != null) s.robDisc.push(p.cards[m.d]);
      s.rob = ord.concat(s.rob); f.pend = null; void keep;
    }
    return;
  }
  if (m.t === 'draw') {
    if (freeLeft(f) > 0) { if (!drawTo(s, 'left', rng)) f.free = f.left.length; }
    else { const c = sacCost(f); if (!pay(s, c)) return; s.stats.sac++; drawTo(s, 'right', rng); }
    return;
  }
  if (m.t === 'ab') {
    const c = find(f, m.u); f.used[c.u] = 1; s.ev.push({ k: 'use', u: c.u });
    runAbility(s, abOf(c), c.u, rng); return;
  }
  if (m.t === 'end') {
    const e = evalFight(s);
    if (e.total >= e.need) {
      if (!pay(s, e.ageLife)) return;
      if (f.pirate) s.beaten++; else s.stats.wins++;
      s.ev.push({ k: 'win', pirate: f.pirate });
      settle(s, { win: true }); afterFight(s, rng); return;
    }
    // 일부러 지기: 모자란 만큼 + 노화 생명을 낸다
    const miss = e.need - e.total;
    if (!pay(s, miss + e.ageLife)) return;
    s.stats.losses++; s.ev.push({ k: 'lose', miss });
    f.lose = { budget: miss, picked: [] }; s.phase = 'lose';
    if (!legalMoves(s).some(x => x.t === 'dest')) { settle(s, { win: false }); afterFight(s, rng); }
  }
}

// 점수 (룰북 Scoring)
export function scoreOf(s) {
  const all = s.rob.concat(s.robDisc, s.fight ? cardsOf(s.fight) : [], s.phase === 'lose' ? [] : []);
  const cardsSum = all.reduce((a, c) => a + (c.t === 'A' ? -5 : valOf(c)), 0);
  const pir = 15 * s.beaten, lifeP = s.won ? 5 * s.life : 0, haz = -3 * s.hazDisc.length;
  return { cards: cardsSum, pirates: pir, life: lifeP, hazards: haz, total: cardsSum + pir + lifeP + haz };
}

// ───────────────────────── 봇 (자동 대전·시뮬레이션용 단순 정책) ─────────────────────────
function pickBy(moves, score) { let best = moves[0], bs = -Infinity; for (const m of moves) { const v = score(m); if (v > bs) { bs = v; best = m; } } return best; }
function botChoose(s, traits, rng) {
  const moves = legalMoves(s), by = t => moves.filter(m => m.t === t);
  const ph = s.phase;
  const T = traits || {}, risk = (T.risk ?? 5) / 10;
  if (ph === 'choose') {
    const mu = deckMu(s);
    const val = i => { const h = HAZARDS[i], need = [h.g, h.y, h.r][s.step], margin = h.f * mu - need;
      const win = 1 / (1 + Math.exp(-(margin + 0.6) / 1.4));                      // 무료 카드만으로 이길 가능성(대략)
      return win * (2.4 + h.kv * 0.5 + (h.ab ? 1.3 : 0)) - (1 - win) * Math.max(0, -margin) * 0.55 - (s.step === 2 ? need * 0.08 : 0); };
    const a = s.offer[0], b = s.offer[1];
    return { move: { t: 'pick', i: val(a) >= val(b) ? 0 : 1 }, reason: 'normal' };
  }
  if (ph === 'single') { const h = HAZARDS[s.single]; return { move: h.f >= 2 || s.life > 14 ? { t: 'fight1' } : { t: 'skip1' }, reason: 'normal' }; }
  if (ph === 'pchoose') return { move: { t: 'pirate', i: PIRATES[s.pirates[0]].sp ? 1 : 0 }, reason: 'normal' };
  if (ph === 'lose') {
    const d = by('dest'); if (!d.length) return { move: { t: 'fin' }, reason: 'normal' };
    const f = s.fight; return { move: pickBy(d, m => { const c = find(f, m.u); return (c.t === 'A' ? 100 : 0) - valOf(c) * 3 - (c.t === 'K' ? 5 : 0); }), reason: 'normal' };
  }
  const f = s.fight, p = f.pend;
  if (p) {
    if (p.k === 'tgt') {
      const t = by('tgt'); const cs = t.map(m => ({ m, c: find(f, m.u) }));
      if (p.ab === 'destroy' || p.ab === 'ex1' || p.ab === 'ex2' || p.ab === 'below') {
        const w = cs.slice().sort((a, b) => (valOf(a.c) - (a.c.t === 'A' ? 3 : 0)) - (valOf(b.c) - (b.c.t === 'A' ? 3 : 0)))[0];
        const bad = valOf(w.c) <= 0 || w.c.t === 'A';
        if (!bad && by('psk').length) return { move: { t: 'psk' }, reason: 'normal' };
        return { move: w.m, reason: 'normal' };
      }
      if (p.ab === 'double') return { move: cs.sort((a, b) => valOf(b.c) - valOf(a.c))[0].m, reason: 'normal' };
      if (p.ab === 'copy') return { move: cs.sort((a, b) => abScore(abOf(b.c)) - abScore(abOf(a.c)))[0].m, reason: 'normal' };
      return { move: t[0], reason: 'normal' };
    }
    if (p.k === 'draw') { const e = evalFight(s); return { move: e.total < e.need && s.life > 6 ? { t: 'pdraw' } : { t: 'psk' }, reason: 'normal' }; }
    if (p.k === 'sort') {
      // 나쁜 카드(노화·음수)는 버리고, 좋은 카드를 위로
      const cs = p.cards, sc = c => (c.t === 'A' ? -9 : valOf(c) + (abOf(c) ? 0.6 : 0));
      const worst = cs.map((c, i) => [sc(c), i]).sort((a, b) => a[0] - b[0])[0];
      const d = worst[0] < 0 ? worst[1] : null;
      const order = cs.map((_, i) => i).filter(i => i !== d).sort((a, b) => sc(cs[b]) - sc(cs[a]));
      return { move: { t: 'sort', d, o: order }, reason: 'normal' };
    }
  }
  // 능력 사용
  const e = evalFight(s), abs = by('ab');
  const need = e.need - e.total;
  const prio = ['sort', 'life2', 'life1', 'card2', 'card1', 'destroy', 'double', 'ex2', 'ex1', 'copy', 'below', 'step'];
  const useful = abs.filter(m => {
    const ab = abOf(find(f, m.u));
    if (ab === 'life1' || ab === 'life2') return s.reserve > 0 && s.life < 18;
    if (ab === 'destroy') return upOf(f).some(c => c.u !== m.u && (c.t === 'A' || valOf(c) < 0));
    if (ab === 'ex1' || ab === 'ex2' || ab === 'below') return upOf(f).some(c => c.u !== m.u && (c.t === 'A' || valOf(c) <= 0));
    if (ab === 'double') return upOf(f).some(c => c.u !== m.u && valOf(c) >= 2);
    if (ab === 'sort') return need > 0 || f.left.length + f.right.length < 2;
    if (ab === 'card1' || ab === 'card2') return need > 0 || (f.free > f.left.length);
    if (ab === 'step') return need > 0 || s.step > 0;
    return need > 0;
  });
  if (useful.length) { const pick = useful.slice().sort((a, b) => prio.indexOf(abOf(find(f, a.u))) - prio.indexOf(abOf(find(f, b.u))))[0]; return { move: pick, reason: 'ability' }; }
  // 무료 뽑기
  if (freeLeft(f) > 0 && by('draw').length) return { move: { t: 'draw' }, reason: 'free' };
  const ended = by('end').length;
  if (e.total >= e.need && ended) return { move: { t: 'end' }, reason: 'win' };
  const cost = sacCost(f);
  if (f.pirate) return { move: { t: 'draw' }, reason: s.life >= cost ? 'sacrifice' : 'forced' };
  // 이길 수 없다: (a) 생명으로 더 뽑아 이긴다 vs (b) 일부러 지고 나쁜 카드를 없앤다 중 이득이 큰 쪽
  const miss = e.need - e.total;
  const pool = s.rob.length ? s.rob : s.robDisc.concat(s.aging);
  const lam = s.life >= 16 ? BOT.lam[0] : s.life >= 12 ? BOT.lam[1] : s.life >= 8 ? BOT.lam[2] : BOT.lam[3];
  const gainWin = BOT.gw[s.step], floor = BOT.floor[s.step];
  // (a) 더 뽑는 계획: 남은 더미의 값 분포로 "이길 확률·낼 생명" 계산 (복원 추출 근사)
  const dist = {}; pool.forEach(c => { const v = Math.max(-5, Math.min(5, valOf(c) + (c.t === 'K' && abOf(c) && abOf(c) !== 'life1' ? 0.7 : 0))); const k = Math.round(v); dist[k] = (dist[k] || 0) + 1; });
  const vals = Object.keys(dist).map(Number), tot = pool.length || 1;
  let st = { [miss]: 1 }, pWin = 0, expCost = 0;
  const maxK = Math.max(0, Math.min(BOT.drawCap, Math.floor((s.life - floor) / cost)));
  for (let k = 0; k < maxK; k++) {
    const nx = {};
    for (const r of Object.keys(st)) { const pr = st[r]; expCost += pr * cost; for (const v of vals) { const q = pr * dist[v] / tot, r2 = +r - v; if (r2 <= 0) pWin += q; else nx[r2] = (nx[r2] || 0) + q; } }
    st = nx;
  }
  const pFail = 1 - pWin; let failMiss = 0; for (const r of Object.keys(st)) failMiss += st[r] * +r;
  const valueA = maxK > 0 ? pWin * gainWin - (expCost + failMiss * 0.9) * lam * (1 - 0.1 * risk) : -99;
  // (b) 파괴 이득: 낼 수 있는 예산(miss) 안에서 나쁜 카드 제거
  let budget = miss, benefit = 0;
  const cand = cardsOf(f).filter(c => !f.down[c.u]).map(c => ({ c, w: c.t === 'A' ? 5 + (abOf(c) === 'hi0' ? -1 : 0) : valOf(c) < 0 ? 1.6 : valOf(c) === 0 ? 0.5 : -2, k: lifeCost(c) })).filter(x => x.w > 0).sort((x, y) => y.w / y.k - x.w / x.k);
  for (const x of cand) if (x.k <= budget) { budget -= x.k; benefit += x.w; }
  const valueB = ended ? benefit * BOT.loseW - (miss + e.ageLife * 0.5) * lam : -99;
  if (valueA >= valueB && valueA > -50 && by('draw').length) return { move: { t: 'draw' }, reason: 'sacrifice' };
  if (ended) return { move: { t: 'end' }, reason: 'lose' };
  return { move: { t: 'draw' }, reason: 'forced' };
}
export const BOT = { loseW: 1, drawCap: 6, gw: [3, 2.6, 2.2], floor: [4, 5, 6], lam: [0.7, 1, 1.5, 2.2] };
function deckMu(s) { const pool = s.rob.length ? s.rob : s.robDisc.concat(s.aging); return pool.length ? pool.reduce((a, c) => a + valOf(c), 0) / pool.length : 0; }
function abScore(ab) { return { life1: 1, life2: 2, card1: 3, card2: 4, destroy: 5, double: 4, step: 2, sort: 3, ex1: 2, ex2: 3, below: 1 }[ab] || 0; }

// ───────────────────────── 모듈 ─────────────────────────
const game = {
  meta: { id: 'friday', name: '프라이데이', version: '1.0.0', players: { min: 1, max: 1 }, minutes: 25, campaign: null, autosave: { schema: 1 } },
  newGame,
  currentSeat: s => s.humanSeat,
  isOver: s => s.over,
  legalMoves,
  applyMove,
  botChoose: (s, traits, rng) => botChoose(s, traits, rng),
  result(s) {
    const sc = scoreOf(s), won = s.won;
    const detail = { level: s.level, beaten: s.beaten, score: sc.total, life: s.life, turns: s.turns, sac: s.stats.sac, fights: s.stats.wins + s.stats.losses, cards: s.rob.length + s.robDisc.length };
    return { coop: { won, score: sc.total }, summary: `레벨 ${s.level} · ${won ? '탈출 성공' : s.beaten ? '해적 1명을 쓰러뜨렸지만 쓰러짐' : '섬에서 쓰러짐'} · ${sc.total}점`, detail };
  },
  mount(container, ctx) { return mountFriday(this, container, ctx); },
  _t: { evalFight, targetsFor, freeLeft, hazardInfo, legalMoves, scoreOf }
};
export default game;

// ───────────────────────── 화면 ─────────────────────────
const ART_N = { start: 5, aging: 11, haz: 30, know: 30, pirate: 10, step: 3, back: 1 };
const LEVEL_INFO = [
  ['레벨 1', '기본 규칙. 처음이라면 여기서. (생명 20+예비 2, 노화 카드 10장)'],
  ['레벨 2', '시작 더미에 노화 카드 1장이 섞여 있어요.'],
  ['레벨 3', '노화 카드가 11장(Weevil 포함)으로 늘어요.'],
  ['레벨 4', '생명 18으로 시작해요. 진짜 프라이데이!']
];
const esc = x => String(x).replace(/[&<>"]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[m]));
const clone2 = x => JSON.parse(JSON.stringify(x));
const SC = ['#3fae49', '#e6c229', '#d9362f'];

function mountFriday(self, container, ctx) {
  const rng = ctx.rng, th = ctx.theme || {};
  const timers = new Set(), logs = [];
  let dead = false, finished = false, lock = false;
  let sel = null, detail = null, sortSel = [], showRules = false;
  const resumed = !!(ctx.resumeState && ctx.resumeState.v === 1 && Array.isArray(ctx.resumeState.rob) && !ctx.resumeState.over);
  let s = resumed ? ctx.resumeState : null;
  const D = ms => (ctx.delay ? ctx.delay(ms) : ms);
  const fx = ctx.fx ? ctx.fx.scope(container) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : k === 'rect' || k === 'union' ? () => null : () => Promise.resolve()) });
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };

  // ----- 그림: 그룹이 다 채워졌을 때만 쓰고, 아니면 CSS 기본 카드 -----
  const ART = {}; for (const g of Object.keys(ART_N)) { const a = ctx.art ? ctx.art(g) : []; ART[g] = Array.isArray(a) && a.length >= ART_N[g] ? a : null; }
  const made = new Set(); let styleArt = null;
  const imgCls = (g, i) => { const k = `fr-im-${g}-${i}`; if (!made.has(k)) { made.add(k); styleArt.append(`.${k}{background-image:url("${ART[g][i]}")}`); } return k; };

  container.innerHTML = `<style>${CSS}</style><style class="fr-art"></style>
    <div class="g-friday" style="--acc:${th.accent || '#f0b24a'};--tb:${th.table || '#14566b'};--tb2:${th.table2 || '#0a2f3d'}">
      <div class="fr-hud"></div><div class="fr-main"></div><div class="fr-dock"></div><div class="fr-ov" hidden></div><div class="fr-toast"></div>
    </div>`;
  styleArt = container.querySelector('style.fr-art');
  const q = x => container.querySelector(x);
  const root = q('.g-friday'), hud = q('.fr-hud'), main = q('.fr-main'), dock = q('.fr-dock'), ov = q('.fr-ov'), toast = q('.fr-toast');

  // ----- 카드 그리기 -----
  const cardOf = u => (s.fight ? cardsOf(s.fight).find(c => c.u === u) : null);
  function valTxt(v) { return v > 0 ? '+' + v : String(v); }
  function faceHTML(c, cls = '', attrs = '') {      // 싸움 카드(시작·노화·지식)
    const g = c.t === 'S' ? 'start' : c.t === 'A' ? 'aging' : 'know', i = c.d;
    const f = s && s.fight, st = f ? ` ${f.down[c.u] ? 'down' : ''} ${f.used[c.u] ? 'used' : ''} ${f.dbl[c.u] ? 'dbl' : ''}` : '';
    if (ART[g]) return `<div class="fr-c fr-img ${imgCls(g, i)} k${c.t}${st} ${cls}" data-u="${c.u}" ${attrs}>${st.includes('dbl') ? '<i class="fr-x2">×2</i>' : ''}</div>`;
    const ab = abOf(c);
    return `<div class="fr-c fr-css k${c.t}${st} ${cls}" data-u="${c.u}" ${attrs}><b class="fr-v">${valTxt(valOf(c))}</b><span class="fr-n">${esc(nameOf(c))}</span>${ab ? `<em class="fr-ab">${AB_KO[ab]}</em>` : ''}${st.includes('dbl') ? '<i class="fr-x2">×2</i>' : ''}</div>`;
  }
  function hazHTML(i, cls = '', attrs = '') {
    const h = HAZARDS[i];
    if (ART.haz) return `<div class="fr-c fr-img ${imgCls('haz', i)} kH ${cls}" ${attrs}></div>`;
    return `<div class="fr-c fr-css kH ${cls}" ${attrs}><span class="fr-n">${esc(h.n)}</span><span class="fr-free">${h.f}</span><span class="fr-dots">${[h.g, h.y, h.r].map((v, k) => `<b class="fr-dot" style="background:${SC[k]}">${v}</b>`).join('')}</span></div>`;
  }
  function pirHTML(i, cls = '', attrs = '') {
    const p = PIRATES[i], info = hazardInfo(s || { hazDisc: [], agingStart: 0, aging: [] }, { type: 'p', i });
    const chip = (p.sp === 'aging2' || p.sp === 'rest') && s ? `<i class="fr-pchip">필요 ${info.vals[0]} · 무료 ${info.free}</i>` : '';
    if (ART.pirate) return `<div class="fr-c fr-img fr-pir ${imgCls('pirate', i)} ${cls}" ${attrs}>${chip}</div>`;
    return `<div class="fr-c fr-css fr-pir kP ${cls}" ${attrs}><span class="fr-n">MARINE</span><b class="fr-v">${p.v == null ? '＊' : p.v}</b><span class="fr-free">${p.f == null ? '＊' : p.f}</span>${p.sp ? `<em class="fr-ab">${esc(PIRATE_HELP[p.sp])}</em>` : ''}${chip}</div>`;
  }
  const backHTML = (cls = '') => (ART.back ? `<div class="fr-c fr-img ${imgCls('back', 0)} ${cls}"></div>` : `<div class="fr-c fr-css kB ${cls}"><span class="fr-n">FRIDAY</span></div>`);

  // ----- 화면 -----
  const stepTxt = () => (s.pirateNo >= 0 || s.phase === 'pchoose' ? '해적전' : STEP_KO[s.step] + ' 단계');
  function drawHud() {
    if (!s) { hud.innerHTML = ''; return; }
    const sc = s.pirateNo >= 0 || s.phase === 'pchoose' ? '#8ecdf5' : SC[s.step];
    hud.innerHTML = `<span class="fr-step" style="--sc:${sc}"><i></i>${stepTxt()}<small>Lv${s.level}</small></span>
      <span class="fr-life" data-a="life"><b>♥ ${s.life}</b><small>예비 ${s.reserve}</small></span>
      <span class="fr-piles"><span title="카드 더미 / 버린 더미">🂠 ${s.rob.length}/${s.robDisc.length}</span><span title="위험 더미 / 버린 더미">☠ ${s.hazDeck.length}/${s.hazDisc.length}</span><span title="노화 더미">⌛ ${s.aging.length}</span></span>
      <span class="fr-tb"><button data-a="rules">규칙</button><button data-a="log">기록</button></span>`;
  }
  function gaugeHTML() {
    const f = s.fight, e = evalFight(s), pct = Math.max(0, Math.min(100, e.need > 0 ? (e.total / e.need) * 100 : 100));
    const notes = [];
    if (e.stepEff !== s.step && !f.pirate) notes.push(`단계 −${s.step - e.stepEff}`);
    if (e.ageLife) notes.push(`노화 생명 −${e.ageLife}`);
    if (f.sp) notes.push(PIRATE_HELP[f.sp]);
    const ok = e.total >= e.need;
    return `<div class="fr-gauge ${ok ? 'ok' : ''}"><div class="fr-gnum"><span>필요 <b style="color:${f.pirate ? '#8ecdf5' : SC[e.stepEff]}">${e.need}</b></span><span>현재 <b>${e.total}</b></span></div><div class="fr-bar"><i style="width:${pct}%"></i></div>${notes.length ? `<div class="fr-gnote">${notes.map(esc).join(' · ')}</div>` : ''}</div>`;
  }
  const pendPrompt = p => (p.k === 'tgt' ? { destroy: '뒤집어 없앨 카드를 고르세요', double: '2배로 칠 카드를 고르세요', copy: '능력을 복사할 카드를 고르세요', ex1: '바꿀 카드를 고르세요', ex2: `바꿀 카드를 고르세요 (${p.n}회 남음)`, below: '더미 맨 아래로 보낼 카드를 고르세요' }[p.ab] : p.k === 'draw' ? `무료로 ${p.n}장 더 뽑을 수 있어요` : '더미 위 카드를 확인하세요');
  function drawMain() {
    if (!s) { main.innerHTML = ''; return; }
    const ph = s.phase, f = s.fight, legal = s.over ? [] : self.legalMoves(s);
    const tgt = new Set(legal.filter(m => m.t === 'tgt' || m.t === 'dest').map(m => m.u));
    let h = '';
    if (ph === 'choose') {
      h += `<div class="fr-tt">위험 카드 2장 중 싸울 한 장을 고르세요 <small>(남은 한 장은 버려져요)</small></div><div class="fr-offer">${s.offer.map((i, k) => `<div class="fr-opt ${sel === k ? 'sel' : ''}" data-opt="${k}">${hazHTML(i)}<span class="fr-need">${HAZARDS[i].f} <i>무료</i> · 지금 <b style="color:${SC[s.step]}">${[HAZARDS[i].g, HAZARDS[i].y, HAZARDS[i].r][s.step]}</b></span><span class="fr-kn">얻는 카드 ▸ ${esc(HAZARDS[i].k)} ${valTxt(HAZARDS[i].kv)}${HAZARDS[i].ab ? ' · ' + AB_KO[HAZARDS[i].ab] : ''}</span></div>`).join('')}</div>`;
    } else if (ph === 'single') {
      const i = s.single; h += `<div class="fr-tt">이 단계의 마지막 카드예요. 싸우거나 버릴 수 있어요</div><div class="fr-offer one"><div class="fr-opt">${hazHTML(i)}<span class="fr-need">${HAZARDS[i].f} <i>무료</i> · 지금 <b style="color:${SC[s.step]}">${[HAZARDS[i].g, HAZARDS[i].y, HAZARDS[i].r][s.step]}</b></span><span class="fr-kn">얻는 카드 ▸ ${esc(HAZARDS[i].k)} ${valTxt(HAZARDS[i].kv)}${HAZARDS[i].ab ? ' · ' + AB_KO[HAZARDS[i].ab] : ''}</span></div></div>`;
    } else if (ph === 'pchoose') {
      h += `<div class="fr-tt">최후의 대결! 먼저 맞설 해적을 고르세요 <small>(둘 다 이겨야 탈출)</small></div><div class="fr-offer pir">${s.pirates.map((i, k) => `<div class="fr-opt ${sel === k ? 'sel' : ''}" data-opt="${k}">${pirHTML(i)}${PIRATES[i].sp ? `<span class="fr-kn">${esc(PIRATE_HELP[PIRATES[i].sp])}</span>` : ''}</div>`).join('')}</div>`;
    } else if (f) {
      const href = f.ref;
      h += `<div class="fr-hz" data-a="hz">${href.type === 'h' ? hazHTML(href.i, 'big') : pirHTML(href.i, 'big')}</div>${gaugeHTML()}`;
      if (s.phase === 'lose') h += `<div class="fr-tt lose">일부러 졌어요 — 낸 생명으로 없앨 카드를 고르세요 <small>(남은 ${f.lose.budget}점 · 시작·지식 1점, 노화 2점)</small></div>`;
      else if (f.pend) h += `<div class="fr-tt pend">${pendPrompt(f.pend)}</div>`;
      const row = (label, arr, cls) => `<div class="fr-row ${cls}"><div class="fr-rl">${label}</div><div class="fr-cards">${arr.map(c => faceHTML(c, `${tgt.has(c.u) ? 'tgt' : ''} ${detail === c.u ? 'sel' : ''}`)).join('') || '<span class="fr-empty">없음</span>'}</div></div>`;
      const fl = freeLeftNow();
      h += row(`무료 칸 <small>${f.left.length}/${f.free}${fl === 0 && f.left.length < f.free ? ' · 멈춤!' : ''}</small>`, f.left, 'left') + row(`생명으로 뽑은 카드 <small>${f.right.length}장</small>`, f.right, 'right');
    }
    main.innerHTML = h;
  }
  const freeLeftNow = () => (s.fight ? self._t.freeLeft(s.fight) : 0);
  function drawDock() {
    if (!s) { dock.innerHTML = ''; return; }
    const ph = s.phase, f = s.fight, legal = s.over ? [] : self.legalMoves(s), has = t => legal.some(m => m.t === t);
    const btn = (a, label, cls = '', dis = false) => `<button class="fr-btn ${cls}" data-a="${a}" ${dis ? 'disabled' : ''}>${label}</button>`;
    let h = '';
    if (s.over) h = '';
    else if (ph === 'choose' || ph === 'pchoose') h = btn(ph === 'choose' ? 'pick' : 'pir', ph === 'choose' ? '이 위험과 싸운다' : '이 해적과 먼저 싸운다', 'go wide', sel == null);
    else if (ph === 'single') h = btn('fight1', '싸운다', 'go') + btn('skip1', '버리고 다음 단계로');
    else if (ph === 'lose') h = btn('fin', '마치기', 'go wide');
    else if (f && f.pend) {
      const p = f.pend;
      if (p.k === 'draw') h = btn('pdraw', `한 장 더 뽑기 (${p.n})`, 'go') + btn('psk', '그만');
      else if (p.k === 'sort') h = '';
      else if (has('psk')) h = btn('psk', '여기까지', 'wide');
      else h = '<span class="fr-hint">카드를 눌러 고르세요</span>';
    } else if (f) {
      const e = evalFight(s), fl = freeLeftNow(), cost = f.sp === 'cost2' ? 2 : 1;
      const endLegal = has('end'), win = e.total >= e.need;
      const drawLbl = fl > 0 ? `카드 뽑기 <small>무료 ${fl}장 남음</small>` : `생명 ${cost} 내고 뽑기`;
      let endLbl;
      if (!f.left.length && !f.right.length) endLbl = '먼저 카드를 뽑으세요';
      else if (win) endLbl = `이기고 끝내기${e.ageLife ? ` <small>(노화 생명 −${e.ageLife})</small>` : ''}`;
      else if (f.pirate) endLbl = `이길 수 없어요 <small>(필요 ${e.need})</small>`;
      else endLbl = `일부러 지기 <small>(생명 −${e.need - e.total + e.ageLife})</small>`;
      h = btn('draw', drawLbl, fl > 0 ? 'go' : 'warn') + btn('end', endLbl, win ? 'go' : '', !endLegal);
    }
    dock.innerHTML = h;
  }
  const draw = () => { drawHud(); drawMain(); drawDock(); if (s && s.fight && s.fight.pend && s.fight.pend.k === 'sort') openSort(); };

  // ----- 겹쳐 뜨는 창 -----
  const openOv = (html, keep) => { ov.innerHTML = `<div class="fr-sheet">${html}${keep ? '' : '<button class="fr-btn wide" data-a="close">닫기</button>'}</div>`; ov.hidden = false; };
  const closeOv = () => { ov.hidden = true; ov.innerHTML = ''; detail = null; };
  function openDetail(u) {
    const c = cardOf(u); if (!c) return; detail = u;
    const ab = abOf(c), legal = self.legalMoves(s), canUse = !s.fight.pend && legal.some(m => m.t === 'ab' && m.u === u);
    const f = s.fight, st = f.down[u] ? ' · 뒤집힘(효과 없음)' : f.used[u] ? ' · 이번 싸움에서 사용함' : '';
    openOv(`<div class="fr-dcard">${faceHTML(c, 'big')}</div><h3 class="fr-ft">${esc(nameOf(c))} <small>싸움값 ${valTxt(valOf(c))}${st}</small></h3>
      <p class="fr-fs">${ab ? `<b>${AB_KO[ab]}</b> — ${AB_HELP[ab]}` : '특별한 능력이 없어요.'}${c.t === 'A' ? '<br>노화 카드: 없애려면 생명 2가 필요해요(또는 파괴 능력).' : '<br>없애려면 생명 1이 필요해요.'}</p>${canUse ? '<button class="fr-btn go wide" data-a="use">능력 사용</button>' : ''}`);
  }
  function openSort() {
    const p = s.fight.pend; if (ov._sort === p) return; ov._sort = p;
    const n = p.cards.length;
    const body = () => `<h3 class="fr-ft">카드 더미 위 ${n}장 <small>위로 올릴 순서대로 눌러요 · 안 누른 1장은 버려요</small></h3>
      <div class="fr-sortrow">${p.cards.map((c, i) => `<div class="fr-sc ${sortSel.includes(i) ? 'on' : ''}" data-sort="${i}">${faceHTML(c, 'mid')}${sortSel.includes(i) ? `<b class="fr-sn">${sortSel.indexOf(i) + 1}</b>` : ''}</div>`).join('')}</div>
      <p class="fr-fs">${sortSel.length >= n - 1 ? (sortSel.length === n ? '모두 되돌려요 (버리는 카드 없음)' : '안 고른 카드는 버려요') : '순서를 정하세요'}</p>
      <button class="fr-btn go wide" data-a="sortok" ${sortSel.length >= n - 1 ? '' : 'disabled'}>정했어요</button>`;
    openOv(body(), true); ov._body = body;
  }
  function openRules() {
    openOv(`<h3 class="fr-ft">프라이데이 규칙 요약</h3><div class="fr-fs fr-rules">
      <p><b>목표</b> 위험을 이기며 카드를 모으고, 마지막에 해적 2명을 이기면 탈출. 생명이 모자라 하나라도 더 내야 하면 패배(0은 괜찮아요).</p>
      <p><b>한 턴</b> 위험 2장 중 1장 선택 → 카드를 뽑아 싸움(무료 칸 수만큼 공짜, 그 뒤는 생명 1당 1장) → 합계가 위험값 이상이면 승리(그 위험이 내 새 카드가 됨).</p>
      <p><b>일부러 지기</b> 모자란 만큼 생명을 내고, 그 생명으로 이번에 뽑은 카드를 없앱니다(시작·지식 1, 노화 2). 아주 중요한 전략!</p>
      <p><b>단계</b> 초록 → 노랑 → 빨강 순으로 위험값이 커져요. 위험 더미가 비면 버린 더미를 섞어 다음 단계로.</p>
      <p><b>카드 더미가 바닥나면</b> 버린 더미를 섞고 노화 카드 1장이 함께 들어와요.</p>
      <p><b>능력</b> 카드를 눌러 쓰고, 한 싸움에 카드마다 한 번. 노화 카드 효과는 자동이에요.</p>
      <p><b>점수</b> 모든 카드 값(노화는 −5) + 해적 15점씩 + 남은 생명 5점씩 − 못 이긴 위험 3점씩.</p></div>
      <h3 class="fr-ft" style="margin-top:8px">능력 도감</h3><div class="fr-fs">${Object.keys(AB_KO).map(k => `<p><b>${AB_KO[k]}</b> ${AB_HELP[k]}</p>`).join('')}</div>`);
  }
  const openLog = () => openOv(`<h3 class="fr-ft">진행 기록</h3><div class="fr-log">${logs.slice().reverse().map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join('') || '<div>아직 기록이 없어요</div>'}</div>`);
  function openLevel() {
    openOv(`<h3 class="fr-ft">난이도를 고르세요</h3><p class="fr-fs">처음이면 레벨 1부터. 이기면 올려 보세요.</p>${LEVEL_INFO.map((l, i) => `<button class="fr-btn lvl" data-lv="${i + 1}"><b>${l[0]}</b><small>${l[1]}</small></button>`).join('')}`, true);
  }
  const say = (t, cls = '') => { logs.push({ t, cls }); toast.textContent = t; toast.className = 'fr-toast show ' + cls; later(() => { toast.className = 'fr-toast'; }, D(1800)); };

  // ----- 진행 -----
  const save = () => { if (!s.over && ctx.autosave) ctx.autosave(clone2(s)); };
  const rectOf = sel2 => { const e = container.querySelector(sel2); return e ? fx.rect(e) : null; };
  function step(m) {
    if (lock || s.over) return;
    const deckRect = rectOf('.fr-piles span');
    const wasFight = s.fight ? { hz: s.fight.ref } : null; void wasFight;
    self.applyMove(s, m, rng); sel = null; detail = null; sortSel = []; ov._sort = null;
    const E = s.ev.slice(); save();
    if (!(s.fight && s.fight.pend && s.fight.pend.k === 'sort')) closeOv();
    draw(); animate(E, deckRect);
    if (s.over) finish();
  }
  function animate(E, deckRect) {
    let delay = 0;
    for (const e of E) {
      if (e.k === 'draw') {
        const el = container.querySelector(`[data-u="${e.u}"]`); if (!el) continue; el.style.visibility = 'hidden';
        later(() => { fx.sfx('deal'); if (deckRect) fx.fly({ from: deckRect, to: el, node: backHTML('mini'), dur: 330, arc: 0.18 }).then(() => { el.style.visibility = ''; fx.pop(el); }); else { el.style.visibility = ''; } }, D(delay)); delay += 90;
      } else if (e.k === 'life') { const el = q('.fr-life'); later(() => { fx.float(el, e.d > 0 ? '+' + e.d : String(e.d), { color: e.d > 0 ? '#6fe08a' : '#ff8a7a' }); fx.sfx(e.d > 0 ? 'gain' : 'chip'); }, D(80)); }
      else if (e.k === 'destroy' || e.k === 'gone') { const el = container.querySelector(`[data-u="${e.u}"]`); if (el) later(() => { fx.shake(el, 6); fx.sfx('bad'); }, D(60)); }
      else if (e.k === 'win') { later(() => { fx.sfx('gain'); fx.burst(main, { color: ['#ffd34d', '#fff', '#6fe08a'], n: e.pirate ? 36 : 18, spread: 120 }); fx.buzz(14); }, D(40)); say(e.pirate ? '해적을 쓰러뜨렸다!' : '위험을 이겼다! 새 카드를 얻었어요', 'good'); }
      else if (e.k === 'lose') { later(() => { fx.shake(main, 6); fx.sfx('bad'); }, D(40)); say(`일부러 졌어요 (생명 −${e.miss})`, 'bad'); }
      else if (e.k === 'step') say(`${STEP_KO[e.step]} 단계가 시작됐어요`, 'info');
      else if (e.k === 'shuffle') say('카드 더미가 바닥나 버린 카드를 섞었어요', 'info');
      else if (e.k === 'age') say('노화 카드가 더미에 섞였어요…', 'bad');
      else if (e.k === 'dead') later(() => fx.sfx('out'), D(60));
    }
  }
  function finish() {
    if (finished) return; finished = true;
    if (ctx.clearAutosave) ctx.clearAutosave();
    const res = self.result(s), won = res.coop.won, sc = scoreOf(s);
    later(() => {
      fx.sfx(won ? 'win' : 'lose'); if (won) fx.burst(root, { color: ['#ffd34d', '#fff', '#8ecdf5', '#6fe08a'], n: 40, spread: 150 });
      openOv(`<h3 class="fr-ft ${won ? 'win' : 'lose'}">${won ? '탈출 성공! 섬에 다시 평화가…' : s.why === 'life' ? '로빈슨이 쓰러졌어요…' : '실패'}</h3>
        <table class="fr-score"><tr><td>카드 값 합계 (노화 −5)</td><td>${sc.cards}</td></tr><tr><td>쓰러뜨린 해적 ${s.beaten}명</td><td>${sc.pirates}</td></tr><tr><td>남은 생명 ${s.life}</td><td>${sc.life}</td></tr><tr><td>못 이긴 위험 ${s.hazDisc.length}장</td><td>${sc.hazards}</td></tr><tr class="t"><td>합계</td><td>${sc.total}점</td></tr></table>
        <button class="fr-btn go wide" data-a="finish">기록 저장하고 마치기</button>`, true);
      ov._res = res;
    }, D(900));
  }
  function begin(level) {
    s = self.newGame({ players: ctx.players, options: { level }, rng }); save(); logs.push({ t: `새 게임! 레벨 ${level}`, cls: 'info' });
    closeOv(); draw(); say(`레벨 ${level} 시작 — 초록 단계`, 'info');
  }

  // ----- 입력 -----
  container.addEventListener('click', e => {
    if (dead) return; const t = e.target;
    const lv = t.closest('[data-lv]'); if (lv) { fx.sfx('tap'); return begin(+lv.dataset.lv); }
    const so = t.closest('[data-sort]');
    if (so && s && s.fight && s.fight.pend && s.fight.pend.k === 'sort') { const i = +so.dataset.sort; const k = sortSel.indexOf(i); if (k >= 0) sortSel.splice(k, 1); else sortSel.push(i); fx.sfx('tap'); ov.querySelector('.fr-sheet').innerHTML = ov._body(); return; }
    const a = t.closest('[data-a]');
    if (a && !a.disabled) {
      const k = a.dataset.a; fx.sfx('tap');
      if (k === 'close') return closeOv();
      if (k === 'rules') return openRules();
      if (k === 'log') return openLog();
      if (k === 'life') return say(`생명 ${s.life} · 예비 ${s.reserve} (+생명 능력은 예비에서 가져와요)`, 'info');
      if (k === 'finish') { a.disabled = true; closeOv(); ctx.finish(ov._res || self.result(s)); return; }
      if (!s || s.over) return;
      if (k === 'pick') return step({ t: 'pick', i: sel });
      if (k === 'pir') return step({ t: 'pirate', i: sel });
      if (k === 'fight1' || k === 'skip1' || k === 'fin' || k === 'psk' || k === 'pdraw' || k === 'draw' || k === 'end') { if (fx.buzz) fx.buzz(8); return step({ t: k }); }
      if (k === 'use') { const u = detail; return step({ t: 'ab', u }); }
      if (k === 'sortok') { const p = s.fight.pend, n = p.cards.length, d = sortSel.length === n ? null : p.cards.map((_, i) => i).find(i => !sortSel.includes(i)); const m = { t: 'sort', d: d === undefined ? null : d, o: sortSel.slice() }; ov._sort = null; return step(m); }
      if (k === 'hz' && s.fight) { const r = s.fight.ref, h = r.type === 'h' ? HAZARDS[r.i] : PIRATES[r.i]; return openOv(`<div class="fr-dcard">${r.type === 'h' ? hazHTML(r.i, 'big') : pirHTML(r.i, 'big')}</div><h3 class="fr-ft">${r.type === 'h' ? esc(h.n) : 'Marine 해적'}</h3><p class="fr-fs">${r.type === 'h' ? `무료 ${h.f}장 · 초록 ${h.g} / 노랑 ${h.y} / 빨강 ${h.r}<br>이기면 ${esc(h.k)} ${valTxt(h.kv)}${h.ab ? ' (' + AB_KO[h.ab] + ')' : ''} 카드가 내 덱에 들어와요.` : esc(PIRATES[r.i].sp ? PIRATE_HELP[PIRATES[r.i].sp] : '특수 능력 없음. 일부러 질 수 없어요.')}</p>`); }
      return;
    }
    if (!s || s.over) return;
    const op = t.closest('[data-opt]'); if (op) { sel = +op.dataset.opt; fx.sfx('tap'); drawMain(); drawDock(); return; }
    const c = t.closest('.fr-c[data-u]');
    if (c && s.fight) {
      const u = +c.dataset.u, legal = self.legalMoves(s);
      if (legal.some(m => (m.t === 'tgt' || m.t === 'dest') && m.u === u)) { if (fx.buzz) fx.buzz(8); return step({ t: legal.find(m => (m.t === 'tgt' || m.t === 'dest') && m.u === u).t, u }); }
      if (s.fight.pend || s.phase === 'lose') return;
      fx.sfx('tap'); return openDetail(u);
    }
  });

  // ----- 시작 -----
  if (resumed) { logs.push({ t: '이어서 하기', cls: 'info' }); draw(); }
  else openLevel();
  return { destroy() { dead = true; timers.forEach(clearTimeout); timers.clear(); container.querySelectorAll('.fx-layer').forEach(e => e.remove()); } };
}

const CSS = `
.g-friday{--acc:#f0b24a;--tb:#14566b;--tb2:#0a2f3d;position:relative;display:flex;flex-direction:column;height:100%;min-height:560px;color:#eaf6f8;font-family:'Nanum Myeongjo',system-ui,sans-serif;background:radial-gradient(120% 80% at 50% 0%,var(--tb),var(--tb2));overflow:hidden}
.g-friday *{box-sizing:border-box}
.g-friday button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.g-friday .fr-hud{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;padding:8px 10px;background:rgba(0,0,0,.28);border-bottom:1px solid rgba(255,255,255,.12);font-size:13px}
.g-friday .fr-step{display:inline-flex;align-items:center;gap:6px;font-weight:700}
.g-friday .fr-step i{width:12px;height:12px;border-radius:50%;background:var(--sc);box-shadow:0 0 8px var(--sc)}
.g-friday .fr-step small{opacity:.7;font-weight:400}
.g-friday .fr-life{display:inline-flex;align-items:baseline;gap:5px;padding:2px 9px;border-radius:12px;background:rgba(255,255,255,.1)}
.g-friday .fr-life b{font-size:17px;color:#ff9c8f}.g-friday .fr-life small{opacity:.75}
.g-friday .fr-piles{display:inline-flex;gap:8px;opacity:.9;margin-left:auto}
.g-friday .fr-tb{display:inline-flex;gap:5px}
.g-friday .fr-tb button{background:rgba(255,255,255,.12);border:1px solid rgba(255,255,255,.2);border-radius:8px;padding:3px 9px;font-size:12px}
.g-friday .fr-main{flex:1;overflow-y:auto;padding:8px 10px 10px;-webkit-overflow-scrolling:touch}
.g-friday .fr-dock{display:flex;gap:8px;padding:8px 10px calc(8px + env(safe-area-inset-bottom));background:rgba(0,0,0,.35);border-top:1px solid rgba(255,255,255,.14);min-height:12px}
.g-friday .fr-dock:empty{display:none}
.g-friday .fr-btn{flex:1;min-height:46px;padding:8px 10px;border-radius:12px;border:1px solid rgba(255,255,255,.25);background:rgba(255,255,255,.1);font-weight:700;font-size:14px;line-height:1.2}
.g-friday .fr-btn small{display:block;font-weight:400;font-size:11px;opacity:.85}
.g-friday .fr-btn.go{background:linear-gradient(#f6c25e,#d8932a);color:#2a1a00;border-color:#ffe3a0}
.g-friday .fr-btn.warn{background:rgba(214,84,66,.45);border-color:#ff9c8f}
.g-friday .fr-btn.wide{width:100%;flex:none}
.g-friday .fr-btn:disabled{opacity:.4;cursor:default}
.g-friday .fr-btn.lvl{display:block;width:100%;text-align:left;margin-top:7px}
.g-friday .fr-btn.lvl b{font-size:15px}
.g-friday .fr-hint{align-self:center;flex:1;text-align:center;opacity:.8;font-size:13px}
.g-friday .fr-tt{margin:4px 2px 8px;font-size:14px;font-weight:700}.g-friday .fr-tt small{font-weight:400;opacity:.75}
.g-friday .fr-tt.pend{background:rgba(240,178,74,.18);border:1px solid var(--acc);border-radius:10px;padding:7px 10px}
.g-friday .fr-tt.lose{background:rgba(214,84,66,.2);border:1px solid #ff9c8f;border-radius:10px;padding:7px 10px}
.g-friday .fr-offer{display:flex;gap:10px}.g-friday .fr-offer .fr-opt{flex:1;min-width:0;border:2px solid transparent;border-radius:12px;padding:4px;background:rgba(0,0,0,.2)}
.g-friday .fr-offer .fr-opt.sel{border-color:var(--acc);box-shadow:0 0 14px rgba(240,178,74,.55)}
.g-friday .fr-offer.one{justify-content:center}.g-friday .fr-offer.one .fr-opt{max-width:70%}
.g-friday .fr-need{display:block;margin:5px 2px 0;font-size:12px}.g-friday .fr-need i{font-style:normal;opacity:.7}.g-friday .fr-need b{font-size:16px}
.g-friday .fr-kn{display:block;margin:2px 2px 4px;font-size:11px;opacity:.85}
.g-friday .fr-hz{display:flex;justify-content:center;margin-bottom:6px}.g-friday .fr-hz .fr-c{width:min(62%,300px)}
.g-friday .fr-c{position:relative;aspect-ratio:10/7;border-radius:9px;overflow:hidden;box-shadow:0 2px 6px rgba(0,0,0,.45);background-size:100% 100%;background-repeat:no-repeat;transition:transform .15s,filter .15s}
.g-friday .fr-c.fr-pir{aspect-ratio:520/373}
.g-friday .fr-c.fr-img{background-size:100% 100%;background-repeat:no-repeat;background-color:#0b2a36}
.g-friday .fr-c.mini{width:56px}.g-friday .fr-c.mid{width:100%}
.g-friday .fr-c.used{transform:rotate(90deg) scale(.82);filter:brightness(.7)}
.g-friday .fr-c.down{filter:grayscale(1) brightness(.45)}
.g-friday .fr-c.down::after{content:'✕';position:absolute;inset:0;display:grid;place-items:center;font-size:38px;color:#ff9c8f;font-weight:900}
.g-friday .fr-c.tgt{outline:3px solid var(--acc);box-shadow:0 0 14px var(--acc);animation:frp 1s infinite alternate}
.g-friday .fr-c.sel{outline:3px solid #8ecdf5}
@keyframes frp{to{transform:scale(1.04)}}
.g-friday .fr-x2{position:absolute;right:4px;top:4px;background:#ffd34d;color:#4a2c00;font-style:normal;font-weight:900;border-radius:8px;padding:0 6px;font-size:13px}
.g-friday .fr-pchip{position:absolute;left:6px;bottom:6px;background:rgba(0,0,0,.65);padding:2px 8px;border-radius:9px;font-style:normal;font-size:12px}
.g-friday .fr-css{display:flex;flex-direction:column;justify-content:flex-end;padding:6px 8px;color:#fff}
.g-friday .fr-css .fr-n{position:absolute;left:46px;right:8px;top:6px;font-size:11px;font-weight:700;text-shadow:0 1px 2px #000;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-friday .fr-css .fr-v{position:absolute;left:6px;top:4px;width:34px;height:34px;border-radius:50%;background:#fff;color:#111;display:grid;place-items:center;font-size:18px}
.g-friday .fr-css .fr-ab{font-style:normal;font-size:12px;font-weight:700;background:rgba(255,255,255,.92);color:#111;border-radius:9px;padding:2px 7px;align-self:center;text-align:center}
.g-friday .fr-css.kS{background:linear-gradient(135deg,#2e86c9,#6fc0ee)}.g-friday .fr-css.kK{background:linear-gradient(135deg,#1b5fa8,#3aa0e8)}
.g-friday .fr-css.kA{background:linear-gradient(135deg,#46215e,#7b3f9a)}.g-friday .fr-css.kH{background:linear-gradient(135deg,#1c7f8a,#58c3c9)}
.g-friday .fr-css.kP{background:linear-gradient(135deg,#243b70,#5877c4)}.g-friday .fr-css.kB{background:linear-gradient(135deg,#1d6d3a,#e6c229)}
.g-friday .kH .fr-free{position:absolute;left:8px;bottom:6px;width:32px;height:38px;border-radius:5px;background:#fff;color:#111;display:grid;place-items:center;font-weight:900;font-size:19px}
.g-friday .fr-dots{position:absolute;right:6px;top:6px;bottom:6px;display:flex;flex-direction:column;justify-content:space-between}
.g-friday .kH .fr-dot{width:27px;height:27px;border-radius:50%;display:grid;place-items:center;font-size:14px;color:#111;border:2px solid #111}
.g-friday .kP .fr-v{background:#2f8fe0;color:#fff}.g-friday .kP .fr-free{position:absolute;left:8px;bottom:6px;width:30px;height:34px;border-radius:5px;background:#fff;color:#111;display:grid;place-items:center;font-weight:900;font-size:17px}
.g-friday .fr-gauge{margin:2px 0 8px;padding:7px 10px;border-radius:12px;background:rgba(0,0,0,.28);border:1px solid rgba(255,255,255,.15)}
.g-friday .fr-gauge.ok{border-color:#6fe08a}
.g-friday .fr-gnum{display:flex;justify-content:space-between;font-size:14px}.g-friday .fr-gnum b{font-size:22px}
.g-friday .fr-bar{height:8px;background:rgba(255,255,255,.15);border-radius:5px;margin-top:4px;overflow:hidden}.g-friday .fr-bar i{display:block;height:100%;background:linear-gradient(90deg,#d8932a,#6fe08a);transition:width .3s}
.g-friday .fr-gnote{margin-top:4px;font-size:11px;opacity:.85}
.g-friday .fr-row{margin-bottom:8px}.g-friday .fr-rl{font-size:12px;font-weight:700;margin:0 2px 4px;opacity:.9}.g-friday .fr-rl small{font-weight:400;opacity:.8}
.g-friday .fr-cards{display:grid;grid-template-columns:repeat(3,1fr);gap:7px;min-height:30px}.g-friday .fr-empty{opacity:.5;font-size:12px;padding:4px}
.g-friday .fr-row.right .fr-rl{color:#ffb4a8}
.g-friday .fr-ov{position:absolute;inset:0;background:rgba(0,0,0,.62);display:flex;align-items:flex-end;justify-content:center;z-index:9}
.g-friday .fr-ov[hidden]{display:none}
.g-friday .fr-sheet{width:100%;max-height:92%;overflow-y:auto;background:#10303d;border-top:2px solid var(--acc);border-radius:16px 16px 0 0;padding:14px 14px calc(14px + env(safe-area-inset-bottom))}
.g-friday .fr-ft{margin:0 0 6px;font-size:17px}.g-friday .fr-ft small{font-weight:400;font-size:12px;opacity:.8;display:block;margin-top:2px}
.g-friday .fr-ft.win{color:#ffd34d}.g-friday .fr-ft.lose{color:#ff9c8f}
.g-friday .fr-fs{font-size:13px;line-height:1.5;opacity:.95}.g-friday .fr-fs p{margin:0 0 7px}
.g-friday .fr-dcard{display:flex;justify-content:center;margin-bottom:8px}.g-friday .fr-dcard .fr-c{width:min(80%,320px)}
.g-friday .fr-sortrow{display:flex;gap:8px;margin:8px 0}.g-friday .fr-sc{position:relative;flex:1;min-width:0;border:2px solid transparent;border-radius:11px;padding:2px}.g-friday .fr-sc.on{border-color:var(--acc)}
.g-friday .fr-sn{position:absolute;right:4px;top:4px;width:24px;height:24px;border-radius:50%;background:var(--acc);color:#2a1a00;display:grid;place-items:center}
.g-friday .fr-score{width:100%;border-collapse:collapse;margin:8px 0 12px;font-size:14px}.g-friday .fr-score td{padding:5px 3px;border-bottom:1px solid rgba(255,255,255,.12)}.g-friday .fr-score td:last-child{text-align:right;font-weight:700}.g-friday .fr-score tr.t td{font-size:17px;color:var(--acc)}
.g-friday .fr-log div{padding:4px 0;border-bottom:1px solid rgba(255,255,255,.08);font-size:13px}.g-friday .fr-log .good{color:#8de7a0}.g-friday .fr-log .bad{color:#ff9c8f}
.g-friday .fr-toast{position:absolute;left:50%;top:54px;transform:translateX(-50%);max-width:90%;padding:7px 14px;border-radius:18px;background:rgba(0,0,0,.78);font-size:13px;opacity:0;pointer-events:none;transition:opacity .2s;z-index:8;text-align:center}
.g-friday .fr-toast.show{opacity:1}.g-friday .fr-toast.good{border:1px solid #6fe08a}.g-friday .fr-toast.bad{border:1px solid #ff9c8f}
`;
