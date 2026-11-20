// 마키 (Maquis) — 1인용 일꾼 놓기 게임 (원작: Jake Staines, 2013 Solitaire Game Design Contest PnP v1.1)
// 디지털 이식: 규칙은 원문 v1.1 기준. 원작 그림은 코드에 넣지 않고(공개 저장소), 사용자가 올린 그림이 없으면 SVG/CSS 기본 도형으로 그린다.
//
// 규칙 요약: 15일 안에 목표 2개를 달성한다. 매 턴 [배치 → 행동 → 정리]. 저항군과 순찰대가 번갈아 일꾼을 한 칸씩 놓고(순찰 카드 3곳 우선순위),
//   행동 뒤 일꾼은 경찰·군인이 없는 길로 안가(Safe House)까지 돌아와야 한다. 못 돌아오면 체포(영구 제거).
//   사기(morale)가 0이 되면 패배, 목표 2개면 승리, 1개면 무승부.
// 규격: 무작위는 전달받은 rng만 / 상태는 JSON / applyMove는 상태를 직접 수정 / 솔로 게임(캐릭터·상대 없음).

// ---------- 데이터 ----------
export const RES = ['food', 'medicine', 'intel', 'money', 'weapon', 'explosive'];
export const RES_KO = { food: '식량', medicine: '의약품', intel: '정보', money: '자금', weapon: '무기', explosive: '폭약' };
export const LOC_KO = {
  fence: '장물아비', pontnord: '북쪽 다리', baradat: '바라다 거리', poor: '빈민가', black: '암시장', radiob: '무전기 B',
  spare_r1: '빈 방(북동)', doctor: '의사', radioa: '무전기 A', pontleveque: '주교 다리', grocer: '식료품점',
  spare_r2: '빈 방(동)', spare_l: '빈 방(서)', cafe: '카페', safe: '안가', airdrop_l: '공중투하(서)', airdrop_r: '공중투하(동)',
  goalA: '목표 장소(왼쪽 출구)', goalB: '목표 장소(오른쪽 출구)'
};
export const TILES = {
  counterfeiter: { ko: '위조범', en: 'Counterfeiter' }, smuggler: { ko: '밀수업자', en: 'Smuggler' }, informant: { ko: '정보원', en: 'Informant' },
  propagandist: { ko: '선전가', en: 'Propagandist' }, chemist: { ko: '화학자의 실험실', en: "Chemist's Lab" }, safehouse: { ko: '안가(두 번째)', en: 'Safe House' }
};
export const GOALS = {
  newspaper: { ko: '지하 신문', en: 'Underground Newspaper', loc: true },
  train: { ko: '열차 폭파', en: 'Destroy the Train', loc: true },
  spy: { ko: '스파이 지원', en: 'Aid the Spy', loc: true },
  sabotage: { ko: '파괴 공작', en: 'Sabotage', loc: true },
  liberate: { ko: '마을 해방', en: 'Liberate the Town', loc: false },
  assassinate: { ko: '암살', en: 'Assassination', loc: false }
};
const NODES = ['fence', 'pontnord', 'baradat', 'poor', 'black', 'radiob', 'spare_r1', 'doctor', 'radioa', 'pontleveque', 'grocer', 'spare_r2', 'spare_l', 'cafe', 'safe', 'airdrop_l', 'airdrop_r', 'goalA', 'goalB'];
export const EDGES = [
  ['fence', 'baradat'], ['fence', 'poor'], ['pontnord', 'poor'], ['pontnord', 'black'], ['poor', 'black'], ['black', 'radiob'], ['radiob', 'spare_r1'],
  ['black', 'spare_r1'], ['black', 'grocer'], ['grocer', 'spare_r2'], ['grocer', 'safe'], ['baradat', 'doctor'], ['poor', 'pontleveque'], ['doctor', 'radioa'],
  ['doctor', 'pontleveque'], ['doctor', 'spare_l'], ['radioa', 'spare_l'], ['pontleveque', 'safe'], ['cafe', 'airdrop_l'], ['cafe', 'safe'], ['safe', 'airdrop_r'],
  ['fence', 'goalA'], ['pontnord', 'goalB']
];
const ADJ = {}; for (const n of NODES) ADJ[n] = [];
for (const [a, b] of EDGES) { ADJ[a].push(b); ADJ[b].push(a); }
export const SPARES = ['spare_r1', 'spare_r2', 'spare_l'];
export const AIRDROPS = ['airdrop_l', 'airdrop_r'];
// 순찰 카드 10장: 각 카드는 우선순위 3곳
export const PATROLS = [
  ['grocer', 'poor', 'doctor'], ['radiob', 'grocer', 'black'], ['pontleveque', 'pontnord', 'doctor'], ['radioa', 'pontleveque', 'black'], ['fence', 'baradat', 'poor'],
  ['grocer', 'pontnord', 'fence'], ['radiob', 'baradat', 'pontleveque'], ['pontleveque', 'black', 'doctor'], ['radioa', 'baradat', 'grocer'], ['fence', 'pontnord', 'pontleveque']
];
// 사기 트랙: 시작 6, 최대 7. 사기별 최소 순찰 수
export const MORALE_START = 6, MORALE_MAX = 7;
export const minPatrol = m => (m >= 7 ? 2 : m >= 5 ? 3 : m >= 2 ? 4 : 5);
// 턴 트랙: 0=START, 1~14, 15=END. 회색(사기-1) / 빨간 테두리 / 열차
export const TURN_END = 15;
export const GREY = [3, 6, 9, 12, 15], RED = [2, 5, 8, 10, 12], TRAIN = [6, 7, 8, 9];

export const DIFFS = {
  veryeasy: { ko: '매우 쉬움', en: 'Very Easy', work: 3, air: { money: 2, weapon: 2, food: 4 }, loop: true },
  easy: { ko: '쉬움', en: 'Easy', work: 3, air: { money: 2, weapon: 1, food: 4 } },
  normal: { ko: '보통', en: 'Normal', work: 3, air: { money: 1, weapon: 1, food: 3 } },
  tricky: { ko: '까다로움', en: 'Tricky', work: 2, air: { money: 1, weapon: 1, food: 3 }, endAt: 12 },
  hard: { ko: '어려움', en: 'Hard', work: 2, air: { money: 1, weapon: 1, food: 3 }, endAt: 12, redMorale: true },
  veryhard: { ko: '매우 어려움', en: 'Very Hard', work: 2, air: { money: 1, weapon: 1, food: 3 }, endAt: 12, redMorale: true, arrestMorale: true }
};
export const DIFF_ORDER = ['veryeasy', 'easy', 'normal', 'tricky', 'hard', 'veryhard'];

// ---------- 상태 ----------
const zeroRes = () => ({ food: 0, medicine: 0, intel: 0, money: 0, weapon: 0, explosive: 0 });
const clone = o => JSON.parse(JSON.stringify(o));
function pushEv(s, e) { s.ev.push(e); }

export function newState(rng, { difficulty = 'normal', balanced = false, goals = null } = {}) {
  const diff = DIFFS[difficulty] ? difficulty : 'normal';
  const D = DIFFS[diff];
  let g;
  if (goals) g = goals.slice(0, 2);
  else if (balanced) g = [rng.pick(['newspaper', 'train', 'sabotage']), rng.pick(['spy', 'assassinate', 'liberate'])];
  else g = rng.shuffle(Object.keys(GOALS)).slice(0, 2);
  g = rng.shuffle(g);
  const s = {
    v: 1, diff, over: false, why: null, outcome: null,
    goals: g.map((id, i) => ({ id, slot: i, p: { a: 0, b: 0 }, done: false })),
    tiles: { spare_r1: null, spare_r2: null, spare_l: null },
    morale: MORALE_START, soldier: 0, pos: 0, turn: 1,
    pool: D.work, cafe: 2, lost: 0,
    hand: zeroRes(), air: { airdrop_l: null, airdrop_r: null },
    deck: rng.shuffle(PATROLS.map((_, i) => i)), discard: [],
    phase: 'place', plan: null, occ: {}, shot: false, ev: [], tp: [], stat: { arrest: 0, shot: 0, tiles: 0, recruit: 0 }
  };
  startTurn(s);
  return s;
}

// ---------- 도우미 ----------
export const owned = s => s.pool + Object.values(s.occ).filter(o => o.t === 'r').length;
export const totalWorkers = owned;
export const patrolCount = s => Math.max(minPatrol(s.morale), owned(s));
const goalNode = (s, slot) => (slot === 0 ? 'goalA' : 'goalB');
export function activeNodes(s) {
  const a = NODES.filter(n => n !== 'goalA' && n !== 'goalB');
  for (const g of s.goals) if (GOALS[g.id].loc) a.push(goalNode(s, g.slot));
  return a;
}
const goalAt = (s, loc) => s.goals.find(g => GOALS[g.id].loc && goalNode(s, g.slot) === loc) || null;
export const tileAt = (s, loc) => (SPARES.includes(loc) ? s.tiles[loc] : null);
const safeNodes = s => ['safe', ...SPARES.filter(l => s.tiles[l] === 'safehouse')];
export function supplyOf(s, r) {
  let n = 4 - s.hand[r];
  for (const l of AIRDROPS) if (s.air[l] && s.air[l].r === r) n -= s.air[l].n;
  for (const o of Object.values(s.occ)) if (o.t === 'r' && o.pend && o.pend.gain[r]) n -= o.pend.gain[r];
  return Math.max(0, n);
}
export const isTrainTurn = s => TRAIN.includes(s.pos);
export const dayNo = s => s.turn;

// ---------- 목표 진행 ----------
// p.a / p.b : 행동 1 / 행동 2의 성공 횟수
export function goalNeed(id) { return { newspaper: { a: 3 }, train: { a: 1 }, spy: { a: 1, b: 1 }, sabotage: { a: 2, b: 1 } }[id] || null; }
export function goalProgress(s, g) { const nd = goalNeed(g.id); if (!nd) return null; return { a: [g.p.a, nd.a || 0], b: [g.p.b, nd.b || 0] }; }
function pendingSucc(s, g, k) {   // 아직 돌아오지 못한 성공(체크 전)
  let n = 0; for (const o of Object.values(s.occ)) if (o.t === 'r' && o.pend && o.pend.succ && o.pend.succ.g === g.slot && o.pend.succ.k === k) n++; return n;
}
function simpleDone(g) { const nd = goalNeed(g.id); return !!nd && g.p.a >= (nd.a || 0) && g.p.b >= (nd.b || 0); }
function liberateOk(s) { return s.hand.weapon >= 3 && s.morale >= 4; }
function assassinOk(s) { return s.soldier >= patrolCount(s); }
// 목표 완료 평가: 하나씩 계산해 g.done 에 기록(막대 목표는 한 번 달성하면 유지)
export function evalGoals(s, final = false) {
  for (const g of s.goals) if (goalNeed(g.id) && simpleDone(g)) g.done = true;
  const others = g => s.goals.filter(x => x !== g);
  for (const g of s.goals) {
    if (g.id === 'liberate' && !g.done) {
      const okOthers = others(g).every(x => x.done || x.id === 'assassinate');
      if ((final || okOthers) && liberateOk(s)) g.done = true;
    }
  }
  for (const g of s.goals) {
    if (g.id === 'assassinate' && !g.done) {
      if (others(g).every(x => x.done) && assassinOk(s)) g.done = true;
    }
  }
  return s.goals.filter(g => g.done).length;
}

// ---------- 행동(위치별) ----------
// 반환: [{id, ko, cost:{res:n}, gain:{res:n}, arrow:'red'|'white'|'yellow', morale, recruit, air:{loc,r,n}|null, succ:{g,k}|null, tile:id|null, note}]
const A = (id, ko, cost, gain, arrow, extra = {}) => ({ id, ko, cost: cost || {}, gain: gain || {}, arrow, morale: 0, recruit: 0, air: null, succ: null, tile: null, ...extra });
export function optionsAt(s, loc) {
  const out = [];
  const tile = tileAt(s, loc);
  if (loc === 'fence') out.push(A('fence', '자금 1 → 무기 1', { money: 1 }, { weapon: 1 }, 'yellow'));
  else if (loc === 'doctor') out.push(A('doctor', '의약품 1 얻기', null, { medicine: 1 }, 'white'));
  else if (loc === 'grocer') out.push(A('grocer', '식량 1 얻기', null, { food: 1 }, 'white'));
  else if (loc === 'poor') out.push(A('poor', '식량 1 + 의약품 1 → 사기 +1', { food: 1, medicine: 1 }, null, 'red', { morale: 1 }));
  else if (loc === 'black') {
    out.push(A('black_f', '식량 1 → 자금 1, 사기 −1', { food: 1 }, { money: 1 }, 'red', { morale: -1 }));
    out.push(A('black_m', '의약품 1 → 자금 1, 사기 −1', { medicine: 1 }, { money: 1 }, 'red', { morale: -1 }));
  } else if (loc === 'radioa' || loc === 'radiob') {
    out.push(A('radio_intel', '정보 1 얻기', null, { intel: 1 }, 'white'));
    const air = DIFFS[s.diff].air;
    for (const al of AIRDROPS) if (!s.air[al]) for (const r of ['weapon', 'money', 'food']) out.push(A(`radio_air_${al}_${r}`, `공중투하(${al === 'airdrop_l' ? '서' : '동'}): ${RES_KO[r]} ${air[r]}`, null, null, 'white', { air: { loc: al, r, n: air[r] } }));
  } else if (loc === 'cafe') {
    if (s.cafe > 0) out.push(A('cafe', '식량 1 → 일꾼 영입 1', { food: 1 }, null, 'white', { recruit: 1 }));
  } else if (AIRDROPS.includes(loc)) {
    const a = s.air[loc]; if (a) out.push(A('air_take', `투하물 회수: ${RES_KO[a.r]} ${a.n}`, null, { [a.r]: a.n }, 'white', { takeAir: loc }));
  } else if (SPARES.includes(loc)) {
    if (!tile) { for (const t of Object.keys(TILES)) if (!Object.values(s.tiles).includes(t)) out.push(A('room_' + t, `자금 2 → 빈 방 설치: ${TILES[t].ko}`, { money: 2 }, null, 'red', { tile: t })); }
    else if (tile === 'counterfeiter') out.push(A('t_money', '자금 1 얻기', null, { money: 1 }, 'white'));
    else if (tile === 'smuggler') { out.push(A('t_food', '식량 3 얻기', null, { food: 3 }, 'white')); out.push(A('t_med', '의약품 3 얻기', null, { medicine: 3 }, 'white')); }
    else if (tile === 'informant') out.push(A('t_intel', '정보 1 얻기', null, { intel: 1 }, 'white'));
    else if (tile === 'propagandist') out.push(A('t_prop', '사기 +1', null, null, 'red', { morale: 1 }));
    else if (tile === 'chemist') out.push(A('t_chem', '의약품 1 → 폭약 1', { medicine: 1 }, { explosive: 1 }, 'white'));
  } else if (loc === 'goalA' || loc === 'goalB') {
    const g = goalAt(s, loc);
    if (g) {
      const nd = goalNeed(g.id), pa = g.p.a + pendingSucc(s, g, 'a'), pb = g.p.b + pendingSucc(s, g, 'b');
      if (g.id === 'newspaper') { if (pa < nd.a) out.push(A('g_news', '정보 2 → 신문 인쇄 성공', { intel: 2 }, null, 'red', { succ: { g: g.slot, k: 'a' } })); }
      else if (g.id === 'train') { if (pa < nd.a && isTrainTurn(s)) out.push(A('g_train', '폭약 3 → 열차 폭파 성공', { explosive: 3 }, null, 'red', { succ: { g: g.slot, k: 'a' } })); }
      else if (g.id === 'spy') {
        if (pa < nd.a) out.push(A('g_spy1', '무기 2 → 성공 ①', { weapon: 2 }, null, 'red', { succ: { g: g.slot, k: 'a' } }));
        else if (pb < nd.b) out.push(A('g_spy2', '자금 1 + 식량 2 → 성공 ②', { money: 1, food: 2 }, null, 'red', { succ: { g: g.slot, k: 'b' } }));
      } else if (g.id === 'sabotage') {
        if (pa < nd.a) out.push(A('g_sab1', '소동 일으키기 → 성공 ①', null, null, 'red', { succ: { g: g.slot, k: 'a' } }));
        else if (pb < nd.b) out.push(A('g_sab2', '폭약 1 → 공장 폭파 성공 ②', { explosive: 1 }, null, 'red', { succ: { g: g.slot, k: 'b' } }));
      }
    }
  }
  return out;
}
export const canPay = (s, cost) => Object.entries(cost).every(([r, n]) => s.hand[r] >= n);
export const affordable = (s, o) => canPay(s, o.cost);

// ---------- 경로 ----------
export function pathHome(s, from) {
  const dest = new Set(safeNodes(s));
  if (dest.has(from)) return [from];
  const prev = { [from]: null }; const q = [from];
  while (q.length) {
    const c = q.shift();
    for (const n of ADJ[c]) {
      if (prev[n] !== undefined) continue;
      if (!activeNodes(s).includes(n)) continue;
      const o = s.occ[n];
      if (o && o.t !== 'r') continue;        // 경찰·군인이 있으면 못 지나감
      prev[n] = c;
      if (dest.has(n)) { const p = [n]; let x = c; while (x) { p.unshift(x); x = prev[x]; } return p; }
      q.push(n);
    }
  }
  return null;
}

// ---------- 턴 진행 ----------
function drawPatrol(s, rng) {
  if (!s.deck.length) { s.deck = rng.shuffle(s.discard); s.discard = []; pushEv(s, { k: 'reshuffle' }); }
  return s.deck.shift();
}
function placePatrol(s, kind, rng) {
  const ci = drawPatrol(s, rng), card = PATROLS[ci];
  s.discard.push(ci);
  const free = card.find(l => !s.occ[l]);
  if (free) { s.occ[free] = { t: kind }; s.tp.push({ card: ci, loc: free, kind }); pushEv(s, { k: 'patrol', loc: free, kind, card: ci }); return; }
  const tgt = card.find(l => s.occ[l] && s.occ[l].t === 'r');
  if (tgt) {
    s.occ[tgt] = { t: kind }; s.lost++; s.stat.arrest++; s.tp.push({ card: ci, loc: tgt, kind, arrest: true });
    pushEv(s, { k: 'arrest', loc: tgt, kind, card: ci, how: 'place' });
    if (DIFFS[s.diff].arrestMorale) addMorale(s, -1);
    return;
  }
  s.tp.push({ card: ci, loc: null, kind }); pushEv(s, { k: 'idle', card: ci });
}
function startTurn(s, rng) {
  s.phase = 'place'; s.shot = false;
  const nR = s.pool, nP = Math.max(minPatrol(s.morale), nR), sol = Math.min(s.soldier, nP);
  s.plan = { rem: nR, patrols: [...Array(nP - sol).fill('p'), ...Array(sol).fill('s')], pi: 0 };
  s.tp = [];
  pushEv(s, { k: 'turn', turn: s.turn, pos: s.pos, nP, sol });
}
function addMorale(s, d) {
  const old = s.morale; s.morale = Math.max(0, Math.min(MORALE_MAX, s.morale + d));
  if (s.morale !== old) pushEv(s, { k: 'morale', d: s.morale - old });
  if (s.morale <= 0 && !s.over) endGame(s, 'morale');
}
function endGame(s, why) {
  if (s.over) return;
  s.over = true; s.why = why; s.phase = 'over';
  evalGoals(s, true);
  const n = s.goals.filter(g => g.done).length;
  s.outcome = s.morale <= 0 ? 'lose' : n >= 2 ? 'win' : n === 1 ? 'draw' : 'lose';
  pushEv(s, { k: 'over', outcome: s.outcome, why });
}
function beginAction(s) { s.phase = 'action'; pushEv(s, { k: 'phase', phase: 'action' }); }

function upkeep(s, rng) {
  // 순찰대 철수
  for (const l of Object.keys(s.occ)) if (s.occ[l].t !== 'r') delete s.occ[l];
  const D = DIFFS[s.diff];
  s.pos++;
  if (D.loop && s.pos >= TURN_END) s.pos = 0;
  const marks = D.redMorale ? RED : GREY;
  if (marks.includes(s.pos)) { pushEv(s, { k: 'marker', pos: s.pos, hit: true }); addMorale(s, -1); } else pushEv(s, { k: 'marker', pos: s.pos, hit: false });
  if (s.over) return;
  const n = evalGoals(s);
  if (n >= 2) return endGame(s, 'goals');
  if (owned(s) <= 0) return endGame(s, 'arrest');
  if (s.pos >= (D.endAt || TURN_END)) return endGame(s, 'time');
  s.turn++;
  startTurn(s, rng);
}

// ---------- 수 ----------
export function legalMoves(s) {
  if (s.over) return [];
  const mv = [];
  if (s.phase === 'place') {
    for (const l of activeNodes(s)) {
      if (l === 'safe' || s.occ[l]) continue;
      if (AIRDROPS.includes(l) && !s.air[l]) continue;
      mv.push({ a: 'place', loc: l });
    }
    return mv;
  }
  for (const [loc, o] of Object.entries(s.occ)) {
    if (o.t !== 'r') continue;
    if (!o.acted) for (const op of optionsAt(s, loc)) if (affordable(s, op)) mv.push({ a: 'act', loc, o: op.id });
    mv.push({ a: 'retrieve', loc });
  }
  if (!s.shot) {
    const targets = Object.entries(s.occ).filter(([, o]) => o.t === 'p').map(([l]) => l);
    const srcs = [];
    if (s.hand.weapon > 0) srcs.push('h');
    for (const [loc, o] of Object.entries(s.occ)) if (o.t === 'r' && o.pend && o.pend.gain.weapon && o.pend.arrow === 'yellow') srcs.push(loc);
    for (const t of targets) for (const src of srcs) mv.push({ a: 'shoot', loc: t, src });
  }
  return mv;
}

export function applyMove(s, m, rng) {
  s.ev = [];
  if (s.over) return;
  if (m.a === 'place') {
    if (s.phase !== 'place' || s.occ[m.loc] || !activeNodes(s).includes(m.loc) || m.loc === 'safe') throw new Error('둘 수 없는 자리');
    if (AIRDROPS.includes(m.loc) && !s.air[m.loc]) throw new Error('비어 있는 투하 지점');
    s.pool--; s.plan.rem--;
    s.occ[m.loc] = { t: 'r', acted: false, pend: null };
    pushEv(s, { k: 'place', loc: m.loc });
    // 순찰대 한 명이 응수 (저항군 → 순찰 번갈아)
    if (s.plan.pi < s.plan.patrols.length) placePatrol(s, s.plan.patrols[s.plan.pi++], rng);
    if (s.plan.rem <= 0) { while (s.plan.pi < s.plan.patrols.length) placePatrol(s, s.plan.patrols[s.plan.pi++], rng); beginAction(s); checkNoWorkers(s, rng); }
    return;
  }
  if (s.phase !== 'action') throw new Error('행동 단계가 아님');
  if (m.a === 'act') {
    const o = s.occ[m.loc]; if (!o || o.t !== 'r' || o.acted) throw new Error('행동할 수 없음');
    const op = optionsAt(s, m.loc).find(x => x.id === m.o); if (!op || !affordable(s, op)) throw new Error('못 하는 행동');
    for (const [r, n] of Object.entries(op.cost)) s.hand[r] -= n;
    const pend = { gain: {}, morale: op.morale, recruit: 0, air: null, succ: op.succ, tile: op.tile, red: op.arrow === 'red', arrow: op.arrow };
    for (const [r, n] of Object.entries(op.gain)) { const g = Math.min(n, supplyOf(s, r)); if (g > 0) pend.gain[r] = g; }
    if (op.takeAir) s.air[op.takeAir] = null;
    if (op.recruit && s.cafe > 0) { pend.recruit = 1; }
    if (op.air) { const r = op.air.r; const n = Math.min(op.air.n, supplyOf(s, r)); pend.air = { loc: op.air.loc, r, n }; }
    o.acted = true; o.pend = pend; o.opt = op.id;
    pushEv(s, { k: 'act', loc: m.loc, o: op.id, ko: op.ko, cost: op.cost });
    return;
  }
  if (m.a === 'shoot') {
    if (s.shot) throw new Error('이번 턴 이미 사격');
    const tgt = s.occ[m.loc]; if (!tgt || tgt.t !== 'p') throw new Error('경찰만 쏠 수 있음');
    if (m.src === 'h') { if (s.hand.weapon < 1) throw new Error('무기 없음'); s.hand.weapon--; }
    else { const w = s.occ[m.src]; if (!w || w.t !== 'r' || !w.pend || !w.pend.gain.weapon) throw new Error('쓸 무기 없음'); w.pend.gain.weapon--; if (!w.pend.gain.weapon) delete w.pend.gain.weapon; }
    delete s.occ[m.loc]; s.shot = true; s.stat.shot++;
    const old = s.soldier; s.soldier = Math.min(5, s.soldier + 1);
    pushEv(s, { k: 'shoot', loc: m.loc, soldier: s.soldier, old });
    addMorale(s, -1);
    return;
  }
  if (m.a === 'retrieve') {
    const o = s.occ[m.loc]; if (!o || o.t !== 'r') throw new Error('일꾼 없음');
    const path = pathHome(s, m.loc);
    const pend = o.pend;
    delete s.occ[m.loc];
    if (path) {
      s.pool++; pushEv(s, { k: 'home', loc: m.loc, path });
      if (pend) credit(s, pend, m.loc, true);
    } else {
      s.lost++; s.stat.arrest++;
      pushEv(s, { k: 'arrest', loc: m.loc, how: 'route' });
      if (pend) credit(s, pend, m.loc, pend.red);
      if (DIFFS[s.diff].arrestMorale) addMorale(s, -1);
    }
    if (s.over) return;
    if (!Object.values(s.occ).some(x => x.t === 'r')) upkeep(s, rng);
    return;
  }
  throw new Error('알 수 없는 수: ' + m.a);
}
function checkNoWorkers(s, rng) {
  // 모든 일꾼이 배치 중 체포되어 행동할 일꾼이 없으면 바로 정리 단계로
  if (!s.over && s.phase === 'action' && !Object.values(s.occ).some(x => x.t === 'r')) upkeep(s, rng);
}
function credit(s, pend, loc, ok) {
  if (!ok) { pushEv(s, { k: 'lostreward', loc, gain: pend.gain }); return; }
  for (const [r, n] of Object.entries(pend.gain)) { const g = Math.min(n, 4 - s.hand[r]); s.hand[r] += Math.max(0, g); }
  if (pend.air) { s.air[pend.air.loc] = { r: pend.air.r, n: pend.air.n }; pushEv(s, { k: 'airdrop', loc: pend.air.loc, r: pend.air.r, n: pend.air.n }); }
  if (pend.recruit && s.cafe > 0) { s.cafe--; s.pool++; s.stat.recruit++; pushEv(s, { k: 'recruit' }); }
  if (pend.tile) { s.tiles[loc] = pend.tile; s.stat.tiles++; pushEv(s, { k: 'tile', loc, tile: pend.tile }); }
  if (pend.succ) { const g = s.goals.find(x => x.slot === pend.succ.g); g.p[pend.succ.k]++; pushEv(s, { k: 'success', slot: g.slot, id: g.id, kk: pend.succ.k }); }
  if (pend.morale) addMorale(s, pend.morale);
  if (Object.keys(pend.gain).length) pushEv(s, { k: 'gain', loc, gain: pend.gain });
}

export function result(s) {
  const n = s.goals.filter(g => g.done).length;
  const why = { morale: '사기가 바닥나 주민들이 등을 돌렸어요', time: '15일이 지났어요', arrest: '마지막 일꾼이 체포됐어요', goals: '두 목표 모두 달성' }[s.why] || '';
  const oc = s.outcome || 'lose';
  const score = n * 100 + s.morale * 5 + Math.max(0, 15 - s.turn);
  return {
    coop: { won: oc === 'win', score },
    summary: (oc === 'win' ? '승리! 마을을 지켜냈어요' : oc === 'draw' ? '무승부 — 목표 1개 달성' : '패배') + ` · ${why} · ${DIFFS[s.diff].ko}`,
    detail: { outcome: oc, goals: n, days: s.turn, morale: s.morale, soldier: s.soldier, lost: s.lost, shot: s.stat.shot, diff: s.diff, goalIds: s.goals.map(g => g.id) }
  };
}

// ---------- 자동 플레이어 (테스트·승률 측정용. 화면에는 쓰지 않는 솔로 게임이라 '봇'은 없다) ----------
const cl = o => JSON.parse(JSON.stringify(o));
export function needsOf(s) {
  const nd = zeroRes(); const w = owned(s);
  for (const g of s.goals) {
    if (g.done) continue;
    const need = goalNeed(g.id), p = g.p;
    if (g.id === 'newspaper') nd.intel += 2 * (need.a - p.a);
    else if (g.id === 'train') nd.explosive += 3;
    else if (g.id === 'spy') { if (p.a < need.a) nd.weapon += 2; if (p.b < need.b) { nd.money += 1; nd.food += 2; } }
    else if (g.id === 'sabotage') { if (p.b < need.b) nd.explosive += 1; }
    else if (g.id === 'liberate') nd.weapon += 3;
  }
  if (nd.explosive > 0 && !Object.values(s.tiles).includes('chemist')) nd.money += 2;
  if (nd.intel > 0 && !Object.values(s.tiles).includes('informant')) nd.money += 2;
  if (nd.explosive > 0) nd.medicine += 1;
  if (s.cafe > 0 && w < 4) nd.food += 1;
  return nd;
}
function wantTile(s) {
  const nd = needsOf(s), have = Object.values(s.tiles);
  const pref = [];
  if (nd.explosive > 0) pref.push('chemist');
  if (nd.intel > 0) pref.push('informant');
  if (nd.money > 0 || nd.weapon > 0) pref.push('counterfeiter');
  pref.push('smuggler', 'propagandist', 'counterfeiter', 'informant', 'chemist');
  return pref.find(t => !have.includes(t));
}
function opValue(s, op, nd, hand) {
  let v = 0;
  const wt = r => (hand[r] < nd[r] ? 3 : 0.35);
  for (const [r, n] of Object.entries(op.gain)) v += wt(r) * n;
  for (const [r, n] of Object.entries(op.cost)) v -= (r === 'money' && op.tile ? 0.3 : 0.9) * n * (hand[r] <= nd[r] ? 1.2 : 0.6);
  if (op.succ) v += 14;
  if (op.recruit) v += owned(s) < 4 ? 6 : 1;
  if (op.morale) v += op.morale > 0 ? (s.morale < 6 ? 3.2 : 1.2) * op.morale : (s.morale > 4 ? 2.2 : 6) * op.morale;
  if (op.tile) v += op.tile === wantTile(s) ? 9 : 2;
  if (op.air) v += wt(op.air.r) * op.air.n * 0.7;
  if (op.takeAir) v += 0.3;
  return v;
}
function bestOpValue(s, loc, hand, nd) {
  let best = -9;
  for (const op of optionsAt(s, loc)) {
    if (!canPay({ hand }, op.cost)) continue;
    best = Math.max(best, opValue(s, op, nd, hand));
  }
  return best;
}
function canPay2(hand, cost) { return Object.entries(cost).every(([r, n]) => hand[r] >= n); }
function reachSample(s, loc, rng, N) {
  let ok = 0;
  for (let i = 0; i < N; i++) {
    const t = cl(s); t.deck = rng.shuffle(t.deck);
    t.ev = [];
    try {
      applyMove(t, { a: 'place', loc }, rng);
      let guard = 0;
      while (t.phase === 'place' && !t.over && guard++ < 8) {
        const free = legalMoves(t); applyMove(t, rng.pick(free), rng);
      }
    } catch (e) { continue; }
    if (t.occ[loc] && t.occ[loc].t === 'r' && (t.phase !== 'place') && pathHome(t, loc)) ok++;
    else if (t.over || t.phase === 'place') ok += 0.5;
  }
  return ok / N;
}
function shootFix(s, loc) {   // 이 일꾼의 귀환길을 열어 주는 사격이 있으면 반환
  if (s.shot) return null;
  const srcs = []; if (s.hand.weapon > 0) srcs.push('h');
  for (const [l, o] of Object.entries(s.occ)) if (o.t === 'r' && o.pend && o.pend.gain.weapon && o.pend.arrow === 'yellow') srcs.push(l);
  if (!srcs.length) return null;
  for (const [pl, o] of Object.entries(s.occ)) {
    if (o.t !== 'p') continue;
    const t = cl(s); delete t.occ[pl];
    if (pathHome(t, loc)) return { a: 'shoot', loc: pl, src: srcs[0] };
  }
  return null;
}
export function botChoose(s, traits, rng) {
  const moves = legalMoves(s); if (!moves.length) return null;
  const nd = needsOf(s);
  if (s.phase === 'place') {
    let best = null, bs = -1e9;
    const N = 18;
    for (const m of moves) {
      let v = bestOpValue(s, m.loc, s.hand, nd);
      if (v < 0) v = -0.5;
      if (AIRDROPS.includes(m.loc)) v += 0.8;
      const r = reachSample(s, m.loc, rng, N);
      const sc = (v + 0.6) * r - (1 - r) * 3 + rng.next() * 0.01;
      if (sc > bs) { bs = sc; best = m; }
    }
    return { move: best, reason: 'place' };
  }
  // 행동 단계
  const workers = Object.entries(s.occ).filter(([, o]) => o.t === 'r');
  let bestAct = null, ba = 1.2;
  for (const [loc, o] of workers) {
    if (o.acted) continue;
    const reach = pathHome(s, loc) || shootFix(s, loc);
    for (const op of optionsAt(s, loc)) {
      if (!canPay(s, op.cost)) continue;
      const nb = { ...s.hand };
      const safeRew = op.arrow === 'red';
      let v = opValue(s, op, nd, nb);
      if (!reach && !safeRew) v = -9;
      if (v > ba) { ba = v; bestAct = { a: 'act', loc, o: op.id }; }
    }
  }
  if (bestAct) return { move: bestAct, reason: 'act' };
  // 사격으로 귀환길 열기
  for (const [loc] of workers) {
    if (pathHome(s, loc)) continue;
    const sf = shootFix(s, loc); if (sf && s.morale > 2) return { move: sf, reason: 'shoot' };
  }
  // 암살 목표: 다른 목표가 끝났으면 쏜다
  const as = s.goals.find(g => g.id === 'assassinate' && !g.done);
  if (as && !s.shot && s.goals.every(g => g === as || g.done) && s.hand.weapon > 0 && s.morale > 2) {
    const t = Object.entries(s.occ).find(([, o]) => o.t === 'p'); if (t) return { move: { a: 'shoot', loc: t[0], src: 'h' }, reason: 'assassinate' };
  }
  // 귀환: 행동 끝난 일꾼 중 길이 있는 쪽부터 → 행동 안 한 일꾼
  const order = workers.slice().sort((a, b) => (+!!b[1].acted - +!!a[1].acted) || (+!!pathHome(s, b[0]) - +!!pathHome(s, a[0])));
  return { move: { a: 'retrieve', loc: order[0][0] }, reason: 'retrieve' };
}

// ====================== 화면 (스타일은 .g-maquis 안에서만, 접두사 mq-) ======================
const XY = {
  fence: [28.31, 11.22], pontnord: [55.1, 9.68], baradat: [13.5, 24.97], poor: [38.59, 29.28], black: [64.68, 31.5], radiob: [89.85, 20.65],
  spare_r1: [85.93, 36.44], doctor: [25.09, 46.55], radioa: [10.41, 53.58], pontleveque: [43.25, 56.41], grocer: [66.51, 52.4], spare_r2: [84.8, 61.16],
  spare_l: [22.78, 65.66], cafe: [33.23, 80.58], safe: [50.83, 86.56], airdrop_l: [14.76, 87.55], airdrop_r: [83.49, 84.96], goalA: [28.1, 3.9], goalB: [55.0, 3.9]
};
const NOACT = new Set(['pontnord', 'baradat', 'pontleveque', 'safe', 'goalA', 'goalB']);
const LOC_FR = { fence: 'Receleur', pontnord: 'Pont du Nord', baradat: 'Rue Baradat', poor: 'Quartier Pauvre', black: 'Marché Noir', radiob: 'Radio B', doctor: 'Médecin', radioa: 'Radio A', pontleveque: 'Pont Lévêque', grocer: 'Épicerie', cafe: 'Café', safe: 'Planque' };
const LOC_DESC = {
  pontnord: '일꾼을 둘 수는 있지만 행동은 없어요. 길목이라 순찰이 자주 서요.',
  baradat: '일꾼을 둘 수는 있지만 행동은 없어요. 장물아비와 의사를 잇는 길이에요.',
  pontleveque: '행동은 없어요. 안가로 가는 가장 큰 길목이라, 여기를 경찰이 막으면 큰일이에요.',
  safe: '안가예요. 일꾼은 여기서 출발하고, 행동이 끝나면 여기로 돌아와야 해요.',
  airdrop_l: '공중투하된 물자가 있을 때만 일꾼을 보낼 수 있어요. 투하한 그 턴에는 가져갈 수 없어요.',
  airdrop_r: '공중투하된 물자가 있을 때만 일꾼을 보낼 수 있어요. 투하한 그 턴에는 가져갈 수 없어요.'
};
const GOAL_INFO = {
  newspaper: '신문을 3번 찍어요. 이 장소에서 “정보 2”를 내고 성공 1칸을 채우는 행동을 3번 해요.',
  train: '열차 칸이 있는 날(턴 트랙 6~9)에만, 이 장소에서 “폭약 3”을 내고 열차를 폭파해요. 성공하면 끝.',
  spy: '두 행동을 모두 해야 해요. ① 무기 2 → 성공 ① ② 자금 1 + 식량 2 → 성공 ② (순서대로, ①이 먼저).',
  sabotage: '① 소동(공짜)을 2번 한 다음 ② 폭약 1로 공장을 폭파해요. 숫자 순서대로만 칸을 채울 수 있어요.',
  liberate: '게임이 끝날 때 무기 3개를 갖고 있고 사기가 4 이상이면 달성이에요. (장소 없음)',
  assassinate: '다른 목표를 먼저 끝내고, 마을 순찰이 군인으로만 채워질 만큼 경찰을 처치해야 해요. (장소 없음)'
};
const ARROW_KO = { red: '체포돼도 보상 유지', white: '체포되면 보상 잃음', yellow: '체포되면 보상 잃음(얻은 무기로 바로 사격 가능)' };
const TOK_COL = { food: ['#7cc06a', '식'], medicine: ['#a05fb8', '약'], intel: ['#3d63b4', '정'], money: ['#d6b13c', '돈'], weapon: ['#b83a2e', '총'], explosive: ['#4a4540', '폭'] };
const TILE_ORDER = ['counterfeiter', 'smuggler', 'informant', 'propagandist', 'chemist', 'safehouse'];
const TILE_DESC = {
  counterfeiter: '일꾼 1명으로 자금 1을 얻어요.', smuggler: '식량 3 또는 의약품 3 중 하나를 얻어요.', informant: '정보 1을 얻어요.',
  propagandist: '사기 +1 (체포돼도 효과 유지).', chemist: '의약품 1 → 폭약 1.', safehouse: '행동은 없지만, 두 번째 안가로 쓸 수 있어요.'
};
const GOAL_STAR = { newspaper: [[28.5, 61.6], [49.4, 61.6], [70.2, 61.6]], train: [[50.8, 62.1]], spy: [[39.2, 52.8], [61.4, 52.8]], sabotage: [[32.8, 55.1], [53.3, 55.1], [74.3, 55.1]] };
const GOAL_TR = {
  newspaper: { q: '이런 시국에는 소식을 퍼뜨리는 일이 중요합니다. 지금 무슨 일이 벌어지고 있는지 주민들에게 알리고, 점령군과 그 앞잡이들의 선전에 맞서세요.', c: '지하 신문을 찍으려면, 이 장소에서 아래 행동을 세 번 수행하세요. 성공할 때마다 표식을 하나씩 올려 둡니다.', a: '일꾼 1명 + 정보 2 → 성공 ★ (3번)' },
  train: { q: '점령군이 열흘 뒤 마을 근처 철로로 판저(전차)를 수송한다는 첩보를 입수했습니다. 열차가 지나갈 때 폭탄을 설치해 폭파해야 합니다.', c: '이 목표를 달성하려면, 턴 트랙에 열차 그림이 있는 턴에 아래 행동을 수행하세요. 성공하면 표식을 올립니다.', a: '일꾼 1명 + 폭약 3 → 성공 ★' },
  spy: { q: '며칠 전 영국 스파이가 낙하산으로 침투했습니다. 그가 임무를 수행하려면 장비와 물자가 필요하고, 당신의 도움을 기다리고 있습니다.', c: '이 목표를 달성하려면, 아래 두 행동을 모두 수행하세요. 성공할 때마다 표식을 올립니다.', a: '① 일꾼 1명 + 무기 2 → 성공 1\n② 일꾼 1명 + 자금 1 + 식량 2 → 성공 2' },
  sabotage: { q: '점령군이 마을 변두리에서 군수공장을 돌리고 있습니다. 공장에 잠입해서 어떻게든 작전을 방해해야 합니다.', c: '이 목표를 달성하려면, 소동(첫 번째 행동)을 두 번 한 뒤 마지막으로 두 번째 행동으로 공장을 폭파하세요. 성공할 때마다 표식을 올립니다.', a: '① 일꾼 1명 → 성공 1 (2번)\n② 일꾼 1명 + 폭약 1 → 성공 2' },
  liberate: { q: '연합군이 마을을 향해 진격해 오고 있습니다. 때맞춰 봉기하면 마을을 전쟁의 상처 없이 지켜 낼 수 있겠지만, 그러려면 무기와 용기가 필요합니다!', c: '이 목표를 달성하려면, 게임이 끝날 때 무기 3개와 사기 4 이상을 갖고 있어야 합니다.', a: '' },
  assassinate: { q: '점령군 아래서 사는 것만도 괴로운데, 동포 일부가 준군사 경찰 "밀리스"와 결탁하고 있습니다. 본때를 보여 이 더러운 협력자들에게 경고를 보내야 합니다.', c: '이 목표를 달성하려면, 먼저 다른 목표를 완료하고 경찰을 충분히 처치해서 마을 순찰이 군인으로만 채워지게 해야 합니다.', a: '' }
};
const TILE_FR = { counterfeiter: 'Faussaire', smuggler: 'Contrebandier', informant: 'Informateur', propagandist: 'Propagandiste', chemist: 'Laboratoire du Chimiste', safehouse: 'Planque' };
const TILE_ACT = {
  counterfeiter: '일꾼 1명 → 자금 1', smuggler: '일꾼 1명 → 식량 3 또는 의약품 3 (택1)', informant: '일꾼 1명 → 정보 1',
  propagandist: '일꾼 1명 → 사기 +1 (빨간 화살표: 체포돼도 유지)', chemist: '일꾼 1명 + 의약품 1 → 폭약 1', safehouse: '행동 없음 (두 번째 안가)'
};
const RES_DESC = {
  food: '스파이 지원 ②에 2개 써요. 밀수업자·식료품점에서 얻어요.',
  medicine: '화학자의 실험실에서 폭약 1로 바꿀 수 있어요. 밀수업자·의사에서 얻어요.',
  intel: '지하 신문을 찍을 때마다 2개씩 써요. 정보원·무전기 쪽에서 얻어요.',
  money: '빈 방 설치에 2, 스파이 지원 ②에 1 써요. 위조범·암시장 등에서 얻어요.',
  weapon: '사격에 1, 스파이 지원 ①에 2 써요. 마을 해방은 끝까지 3개를 들고 있어야 해요.',
  explosive: '열차 폭파에 3, 파괴 공작 ②에 1 써요. 화학자의 실험실에서 만들어요.'
};
const GOAL_ORDER = ['newspaper', 'train', 'spy', 'sabotage', 'liberate', 'assassinate'];
const RULES_KO = `
<h4>목표</h4><p>15일 안에 목표 2개를 달성하면 <b>승리</b>, 1개면 <b>무승부</b>, 0개이거나 사기가 0이 되면 <b>패배</b>예요.</p>
<h4>한 턴(하루)</h4>
<p><b>① 배치</b> — 저항군(나)과 순찰대가 번갈아 일꾼을 한 칸씩 놓아요. 빈 자리라면 안가까지 길이 이어지지 않아도 놓을 수 있어요.<br>
순찰은 카드 1장을 뽑아 적힌 3곳 중 첫 번째 빈 곳에 서요. 3곳이 모두 차 있으면 <b>체포</b>를 시도해 첫 번째로 만나는 내 일꾼을 잡아가요(영구 제거). 순찰 수는 “내 일꾼 수”와 “사기별 최소 수” 중 큰 쪽이고, 군인이 있으면 경찰을 대신해 맨 나중에 서요.</p>
<p><b>② 행동</b> — 일꾼마다 그 자리의 행동을 1번 할 수 있어요(안 해도 돼요). 행동 뒤에는 <b>경찰·군인이 없는 길</b>(아무도 없는 곳, 내 일꾼이 있는 곳만 통과)로 안가에 돌아와야 해요. 못 돌아오면 체포돼요. 체포되면 <b>빨간 화살표</b> 행동의 보상만 남고, 흰 화살표 보상은 사라져요.</p>
<p><b>사격</b> — 무기 1개를 버리면 턴마다 1번, 경찰 1명을 없앨 수 있어요. 그때마다 군인 트랙 +1(앞으로 경찰이 군인으로 바뀜), 사기 −1이에요. 군인은 쏠 수 없어요. 장물아비에서 막 얻은 무기도 바로 쏠 수 있어요.</p>
<p><b>③ 정리</b> — 순찰대가 물러가고 턴 트랙이 1칸 가요. 회색 칸에 닿으면 사기 −1이에요.</p>
<h4>특수 행동</h4>
<p><b>빈 방</b>: 자금 2를 내고 타일 1장을 올려요(위조범·밀수업자·정보원·선전가·화학자·안가). 올린 뒤에는 그 타일 행동을 해요.<br>
<b>공중투하</b>: 무전기에서 투하(무기 1 / 자금 1 / 식량 3)를 선택해 투하 지점에 물자를 놓아요. 다음 턴부터 그 지점에 일꾼을 보내 가져와요.<br>
<b>자원 한도</b>: 종류별 최대 4개(손+투하 지점 합계). 공급이 모자라면 모자란 만큼 보상이 사라져요.</p>
<h4>게임 끝</h4><p>마지막 일꾼 체포 / 사기 0 / 두 번째 목표 달성 / 턴 트랙 END 도달. 끝날 때 사기가 0 이하면 다른 건 무시하고 패배예요.</p>
<h4>난이도</h4><p>쉬움 계열은 공중투하가 후해지고, 까다로움 이상은 일꾼 2명으로 시작하고 12일차에 끝나요. 어려움은 사기 감소가 붉은 테두리 칸에서, 매우 어려움은 체포될 때마다 사기 −1이에요.</p>
<p class="mq-sm">이 앱의 해석: 마을 해방은 “다른 목표를 마쳤을 때 조건이 맞으면” 그 턴 정리 단계에서 달성하고, 암살은 정리 단계에서 군인 수가 순찰 수 이상인지 확인해요. 스파이 지원의 ② 비용은 자금 1 + 식량 2로 읽었어요.</p>`;

function esc(t) { return String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }

const CSS = `
.g-maquis{position:fixed;inset:0;z-index:50;overflow:hidden;font-family:var(--fk,'Nanum Myeongjo','Noto Serif KR',serif);color:#2a2418;background:radial-gradient(ellipse at 50% 30%,#2c3526 0%,#1a1f17 70%,#12150f 100%);user-select:none;-webkit-user-select:none;-webkit-tap-highlight-color:transparent}
.g-maquis *{box-sizing:border-box}
.g-maquis button{font-family:inherit;cursor:pointer}
.g-maquis .mq-stage{position:absolute;transform-origin:0 0}
.g-maquis .mq-fd{font-family:var(--fd,'Cormorant SC','Cormorant Garamond',serif)}
.g-maquis .mq-pan{background:linear-gradient(180deg,#eee6cf,#e2d8bb);border:1px solid #5d5030;border-radius:6px;box-shadow:inset 0 0 0 3px #e8dfc6,inset 0 0 0 4px #8c7d52,0 5px 12px rgba(0,0,0,.45);padding:10px 12px;overflow:hidden}
.g-maquis .mq-pan h5{margin:0 0 6px;display:flex;justify-content:space-between;align-items:baseline;font-size:14px;font-weight:700}
.g-maquis .mq-pan h5 small{font-size:11px;font-weight:400;color:#7a6c47}
.g-maquis .mq-btn{background:linear-gradient(180deg,#efe7d0,#ddd2b2);color:#2a2418;border:1px solid #5d5030;border-radius:6px;box-shadow:inset 0 0 0 2px #e8dfc6,inset 0 0 0 3px #8c7d52,0 3px 7px rgba(0,0,0,.4);font-weight:700;font-size:13px;line-height:1.15;padding:4px 6px;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;word-break:keep-all;overflow-wrap:anywhere;min-width:0}
.g-maquis .mq-btn.go{background:linear-gradient(180deg,#3d63b4,#27468a);color:#f5efdb;border-color:#15264d;box-shadow:inset 0 0 0 2px #27468a,inset 0 0 0 3px #d9cfa8,0 3px 7px rgba(0,0,0,.5)}
.g-maquis .mq-btn.red{background:linear-gradient(180deg,#b8433f,#8a2622);color:#fbeee8;border-color:#4d1210;box-shadow:inset 0 0 0 2px #8a2622,inset 0 0 0 3px #e8c9b8,0 3px 7px rgba(0,0,0,.5)}
.g-maquis .mq-btn:disabled,.g-maquis .mq-btn.dis{opacity:.45;cursor:default}
.g-maquis .mq-btn small{display:block;font-weight:400;font-size:10.5px;color:inherit;opacity:.75}
.g-maquis .mq-top{position:absolute;left:0;top:0;right:0;height:var(--th,56px);display:flex;align-items:center;gap:10px;padding:0 var(--tp,18px);padding-right:calc(var(--tp,18px) + 46px / var(--sc,1));background:linear-gradient(180deg,#34311f,#1f1d14);border-bottom:1px solid #8c7d52;color:#efe6c8;overflow:hidden}
.g-maquis .mq-logo{font-size:var(--tl,28px);letter-spacing:.14em;line-height:1;white-space:nowrap}
.g-maquis .mq-pill{padding:5px 12px;border-radius:16px;background:rgba(255,255,255,.08);color:#d9cfa8;font-size:var(--tf,15px);font-weight:700;border:1px solid #6d5f3d;white-space:nowrap}
.g-maquis .mq-pill.on{background:#3d63b4;color:#fff;border-color:#8fb0ff}.g-maquis .mq-pill.dn{background:rgba(79,157,74,.25)}
.g-maquis .mq-chip{padding:5px 10px;border-radius:6px;background:rgba(0,0,0,.35);border:1px solid #8c7d52;font-size:var(--tf,15px);font-weight:700;white-space:nowrap}
.g-maquis .mq-ib{width:var(--ib,38px);height:var(--ib,38px);border-radius:6px;background:rgba(255,255,255,.07);border:1px solid #8c7d52;color:#efe6c8;font-size:calc(var(--ib,38px)*.5);padding:0;display:flex;align-items:center;justify-content:center}
.g-maquis .mq-sp{flex:1}
/* 보드 */
.g-maquis .mq-board{position:absolute;box-shadow:0 8px 22px rgba(0,0,0,.55);border-radius:6px;background:#5a5a45}
.g-maquis .mq-board>img.mq-bg{position:absolute;inset:0;width:100%;height:100%;border-radius:6px;display:block;pointer-events:none}
.g-maquis .mq-fb{position:absolute;inset:0;border-radius:6px;overflow:hidden;background:linear-gradient(135deg,#d9cfa6,#bfb48a)}
.g-maquis .mq-fb svg{position:absolute;inset:0;width:100%;height:100%}
.g-maquis .mq-ph{position:absolute;transform:translate(-50%,-50%);width:12.6%;height:7.6%;border:1px solid #6d5f3d;border-radius:3px;background:#efe6cb;font-size:calc(var(--bw)*.0098);text-align:center;display:flex;flex-direction:column;align-items:center;justify-content:center;line-height:1.1;color:#3b331f;pointer-events:none;padding:0 2px}
.g-maquis .mq-ph b{font-size:calc(var(--bw)*.0115)}
.g-maquis .mq-hot{position:absolute;transform:translate(-50%,-50%);width:12.8%;height:8.4%;border-radius:4px;background:transparent;border:0;padding:0;z-index:3}
.g-maquis .mq-hot.can{box-shadow:0 0 0 2px rgba(255,236,150,.0);animation:mqp 1.6s infinite}
.g-maquis .mq-hot.can:hover,.g-maquis .mq-hot.sel{background:rgba(255,236,150,.18);box-shadow:0 0 0 2px #ffd24a}
.g-maquis .mq-hot.sel{box-shadow:0 0 0 3px #ffd24a,0 0 12px 3px rgba(255,210,74,.65)}
@keyframes mqp{0%,100%{box-shadow:0 0 0 2px rgba(255,236,150,.15)}50%{box-shadow:0 0 0 3px rgba(255,236,150,.55)}}
.g-maquis .mq-pw{position:absolute;width:0;height:0;z-index:4;pointer-events:none}
.g-maquis .mq-pw img,.g-maquis .mq-pw svg{position:absolute;left:0;top:0;height:var(--pw);transform:translate(-50%,-90%);filter:drop-shadow(0 3px 3px rgba(0,0,0,.5));width:auto}
.g-maquis .mq-pw svg{width:calc(var(--pw)*.55)}
.g-maquis .mq-pw .sh{position:absolute;left:calc(var(--pw)*-.36);top:calc(var(--pw)*-.09);width:calc(var(--pw)*.72);height:calc(var(--pw)*.18);border-radius:50%;background:radial-gradient(ellipse at center,rgba(0,0,0,.5),rgba(0,0,0,0) 70%)}
.g-maquis .mq-pw .bd{position:absolute;left:calc(var(--pw)*.22);top:calc(var(--pw)*-.95);min-width:calc(var(--pw)*.34);height:calc(var(--pw)*.34);border-radius:50%;background:#2f7a35;color:#fff;font-size:calc(var(--pw)*.22);font-weight:700;display:flex;align-items:center;justify-content:center;border:1px solid #f2ead0}
.g-maquis .mq-pw .bd.r{background:#a6232b}
.g-maquis .mq-air{position:absolute;transform:translate(-50%,-50%);z-index:3;pointer-events:none}
.g-maquis .mq-tilebd{position:absolute;transform:translate(-50%,-50%);width:13.2%;z-index:2;pointer-events:none;border-radius:3px;box-shadow:0 2px 5px rgba(0,0,0,.5)}
.g-maquis .mq-tilebd img{width:100%;display:block;border-radius:3px}
.g-maquis .mq-heat{position:absolute;transform:translate(-50%,-50%);min-width:calc(var(--bw)*.022);height:calc(var(--bw)*.022);border-radius:50%;background:rgba(166,35,43,.88);color:#fff;font-size:calc(var(--bw)*.014);font-weight:700;display:flex;align-items:center;justify-content:center;z-index:5;pointer-events:none;border:1px solid #fff}
.g-maquis .mq-route{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:2}
.g-maquis .mq-gt{position:absolute;transform:translateX(-50%);top:3px;width:13.4%;z-index:2;border-radius:3px;box-shadow:0 2px 6px rgba(0,0,0,.45);outline:2px solid #3d63b4;background:#efe6cb;pointer-events:none}
.g-maquis .mq-gt img{width:100%;display:block;border-radius:3px}
.g-maquis .mq-gt.ph{height:5.4%;font-size:calc(var(--bw)*.0105);text-align:center;display:flex;align-items:center;justify-content:center;line-height:1.1;padding:2px;color:#3b331f}
.g-maquis .mq-chipb{position:absolute;padding:6px 11px;border-radius:16px;font-size:calc(var(--bw)*.0125);font-weight:700;z-index:6;pointer-events:none;border:1px solid;white-space:nowrap}
.g-maquis .mq-chipb.ok{background:rgba(36,86,44,.93);border-color:#8be39a;color:#e6ffe9}.g-maquis .mq-chipb.no{background:rgba(120,30,30,.93);border-color:#ff9b8f;color:#ffe9e5}
/* 팝오버 */
.g-maquis .mq-pop{position:absolute;z-index:30;width:var(--popw,310px);max-height:96%;overflow:auto;font-size:var(--pf,13px);line-height:1.4}
.g-maquis .mq-pop h4{margin:0 0 6px;font-size:calc(var(--pf,13px) + 3px);display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.g-maquis .mq-pop h4 small{font-size:calc(var(--pf,13px) - 1px);font-weight:400;color:#7a6c47}
.g-maquis .mq-pop p{margin:4px 0}.g-maquis .mq-pop .x{position:absolute;right:6px;top:4px;width:26px;height:26px;border:0;background:none;font-size:18px;color:#6d5f3d}
.g-maquis .mq-opt{width:100%;text-align:left;justify-content:flex-start;flex-direction:column;align-items:stretch;gap:3px;margin-top:6px;padding:6px 8px;font-size:var(--pf,13px)}
.g-maquis .mq-opt .row{display:flex;align-items:center;gap:6px;flex-wrap:wrap}
.g-maquis .mq-opt .ar{font-size:calc(var(--pf,13px) + 6px);font-weight:700;line-height:1}.g-maquis .mq-opt .ar.red{color:#a6232b}.g-maquis .mq-opt .ar.white,.g-maquis .mq-opt .ar.yellow{color:#8a8a8a}
.g-maquis .mq-opt .ef{font-size:calc(var(--pf,13px) - 1px);font-weight:700;color:#27468a;background:#dfe6f6;border-radius:9px;padding:1px 7px}
.g-maquis .mq-opt .ds{font-weight:400;font-size:calc(var(--pf,13px) - 1.5px);color:#5a4d2e}
.g-maquis .mq-st{font-size:calc(var(--pf,13px) - 1px);margin:6px 0 0;padding:4px 8px;border-radius:5px}
.g-maquis .mq-st.ok{background:#d8efd9;color:#1f5a27}.g-maquis .mq-st.no{background:#f6d9d4;color:#8a2622}
.g-maquis .mq-tok{position:relative;display:inline-block;flex:none}
.g-maquis .mq-tok img{display:block;width:100%;height:100%;filter:drop-shadow(0 2px 2px rgba(0,0,0,.45))}
.g-maquis .mq-tok .d{width:100%;height:100%;border-radius:50%;display:flex;align-items:center;justify-content:center;color:#fff;font-weight:700;border:2px solid rgba(255,255,255,.7);box-shadow:0 2px 3px rgba(0,0,0,.4)}
.g-maquis .mq-tok.dim{opacity:.35;filter:grayscale(.6)}
.g-maquis .mq-tok .n{position:absolute;right:-4px;bottom:-4px;min-width:17px;height:17px;border-radius:9px;background:#a6232b;color:#fff;font-size:11px;font-weight:700;text-align:center;line-height:15px;border:1.5px solid #f2ead0;padding:0 3px}
.g-maquis .mq-tok.dim .n{background:#6b6450}
/* 패널들 */
.g-maquis .mq-resrow{display:flex;justify-content:space-between;margin-top:6px}
.g-maquis .mq-resrow>div{display:flex;flex-direction:column;align-items:center;gap:5px;font-size:11px;color:#4b4129}
.g-maquis .mq-wk{display:flex;gap:4px;align-items:flex-end;flex-wrap:wrap}
.g-maquis .mq-wk .w{display:flex;flex-direction:column;align-items:center;font-size:10.5px;color:#6d5f3d;gap:2px}
.g-maquis .mq-wk img,.g-maquis .mq-wk svg{height:var(--wh,70px);width:auto;filter:drop-shadow(0 3px 3px rgba(0,0,0,.4))}
.g-maquis .mq-wk svg{width:calc(var(--wh,70px)*.55)}.g-maquis .mq-wk .w.g img,.g-maquis .mq-wk .w.g svg{opacity:.3;filter:grayscale(1)}
.g-maquis .mq-tiles{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:5px}
.g-maquis .mq-tile{position:relative;border:0;background:none;padding:0;border-radius:3px;overflow:hidden;min-height:34px}
.g-maquis .mq-tile img{display:block;width:100%;border-radius:3px;box-shadow:0 2px 4px rgba(0,0,0,.4)}
.g-maquis .mq-tile .ph{display:flex;align-items:center;justify-content:center;height:100%;min-height:36px;background:#efe6cb;border:1px solid #8c7d52;border-radius:3px;font-size:11.5px;font-weight:700;padding:2px;text-align:center;line-height:1.1}
.g-maquis .mq-tile.dim img,.g-maquis .mq-tile.dim .ph{opacity:.4;filter:grayscale(.7)}
.g-maquis .mq-tile .ck{position:absolute;right:3px;top:3px;background:#2f7a35;color:#fff;border-radius:8px;font-size:10px;padding:0 5px}
.g-maquis .mq-gc{position:relative;border-radius:6px;overflow:hidden;box-shadow:0 6px 14px rgba(0,0,0,.5);border:0;background:none;padding:0;width:100%;display:block;text-align:left}
.g-maquis .mq-gc>img{display:block;width:100%}
.g-maquis .mq-gc .stars{position:absolute;left:0;right:0;bottom:0;display:flex;justify-content:center;gap:4px;padding:5px;background:linear-gradient(0deg,rgba(24,20,10,.8),rgba(24,20,10,0))}
.g-maquis .mq-gc .st{width:26px;height:26px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:700;border:2px solid #8c7d52;background:#2d2a1c;color:#8c7d52}
.g-maquis .mq-gc .st.on{background:#ffd24a;color:#6b4a00;border-color:#fff}
.g-maquis .mq-gc .st img{width:100%;height:100%}
.g-maquis .mq-cube{position:absolute;width:8%;aspect-ratio:1;transform:translate(-50%,-50%);border-radius:5px;background:linear-gradient(135deg,#fffdf4,#cfc8b0);box-shadow:0 3px 5px rgba(0,0,0,.55),inset 0 0 0 1px #9a937c;pointer-events:none}
.g-maquis .mq-gcf{background:#efe6cb;padding:12px 14px;border:1px solid #6d5f3d;font-size:13px;line-height:1.4;color:#3b331f;min-height:200px}
.g-maquis .mq-gcf h6{margin:0 0 2px;font-size:19px}.g-maquis .mq-gcf .en{font-size:11px;color:#7a6c47;margin-bottom:8px}.g-maquis .mq-gcf .stars{position:static;background:none;justify-content:flex-start;padding:8px 0 0}
.g-maquis .mq-gcf.done{outline:3px solid #2f7a35}
.g-maquis .mq-gc.done::after{content:'달성';position:absolute;right:8px;top:8px;background:#2f7a35;color:#fff;border-radius:10px;padding:2px 10px;font-size:12px;font-weight:700}
.g-maquis .mq-tk{display:flex;gap:var(--tg,4px);flex-wrap:nowrap;margin:3px 0 2px}
.g-maquis .mq-tk i{position:relative;flex:1 1 0;min-width:0;aspect-ratio:1;max-width:var(--tk,36px);border-radius:50%;border:2px solid #9b8f69;background:#f3ecd6;display:flex;align-items:center;justify-content:center;font-style:normal;font-size:calc(var(--tk,36px)*.36);font-weight:700;color:#3b331f}
.g-maquis .mq-tk i.g{background:#8b8672;color:#fff}.g-maquis .mq-tk i.r{border-color:#a6232b;box-shadow:0 0 0 1px #a6232b inset}.g-maquis .mq-tk i.f{border-color:#a6232b;color:#a6232b}
.g-maquis .mq-tk i.t::after{content:'🚂';position:absolute;right:-2px;top:-5px;font-size:calc(var(--tk,36px)*.4)}
.g-maquis .mq-tk i.dm{opacity:.35}.g-maquis .mq-tk i.on{background:#ffe27a;border-color:#27468a;box-shadow:0 0 0 2px #27468a}
.g-maquis .mq-tk i .mk{position:absolute;left:50%;top:50%;width:120%;height:120%;transform:translate(-50%,-50%);object-fit:contain;z-index:2;filter:drop-shadow(0 2px 2px rgba(0,0,0,.5))}
.g-maquis .mq-tk i .mkd{position:absolute;left:50%;top:50%;width:70%;height:70%;transform:translate(-50%,-50%);border-radius:50%;background:#27468a;border:2px solid #fff;z-index:2}
.g-maquis .mq-tkl{display:flex;align-items:center;gap:6px;font-size:12px;font-weight:700;margin-top:4px}
.g-maquis .mq-tkl small{font-weight:400;color:#7a6c47;font-size:10.5px}
.g-maquis .mq-pat{display:flex;gap:6px;margin-top:6px;flex-wrap:wrap}
.g-maquis .mq-clip{width:var(--cw,98px);border-radius:5px;background:linear-gradient(135deg,#5b3a22,#3f2616);padding:8px 6px 6px;box-shadow:0 3px 6px rgba(0,0,0,.5)}
.g-maquis .mq-clip .pp{background:#f3f1ea;border-radius:2px;padding:4px 3px;font-size:10.5px;text-align:center;color:#2c2a24;line-height:1.15}
.g-maquis .mq-clip .pp b{display:block;font-size:10px;letter-spacing:.08em;margin-bottom:3px}
.g-maquis .mq-clip .pp div{padding:2px 0;margin:2px 0;border-radius:2px}
.g-maquis .mq-clip .pp div.pk{background:#27468a;color:#fff}.g-maquis .mq-clip .pp div.pa{background:#a6232b;color:#fff}.g-maquis .mq-clip .pp div.sk{text-decoration:line-through;color:#9b9686}
.g-maquis .mq-clip.o .pp{opacity:.55}.g-maquis .mq-clip.o .pp div.pk{opacity:.8}
.g-maquis .mq-log{font-size:12.5px;line-height:1.4;overflow:hidden}
.g-maquis .mq-log div{padding:4px 0;border-bottom:1px dotted #b3a578;color:#3c341f}.g-maquis .mq-log div.b{font-weight:700}.g-maquis .mq-log div.bad{color:#8a2622}.g-maquis .mq-log div.good{color:#1f5a27}
/* 오버레이 */
.g-maquis .mq-ov{position:absolute;inset:0;z-index:40;background:rgba(10,10,6,.72);display:flex;align-items:center;justify-content:center;padding:calc(10px / var(--sc,1))}
.g-maquis .mq-card{position:relative;max-width:96%;max-height:94%;overflow:auto;width:var(--ovw,640px);font-size:var(--pf,14px);line-height:1.5;padding:16px 20px}
.g-maquis .mq-card h3{margin:0 0 8px;font-size:calc(var(--pf,14px) + 7px)}.g-maquis .mq-card h4{margin:12px 0 4px;font-size:calc(var(--pf,14px) + 1px);border-bottom:1px solid #b3a578;padding-bottom:2px}
.g-maquis .mq-tr{margin:6px 0;padding:8px 12px;border-left:3px solid #8c7d52;background:rgba(255,250,232,.55);border-radius:0 5px 5px 0;font-style:italic}.g-maquis .mq-tr.act{font-style:normal;white-space:pre-line;font-weight:700;color:#27468a}.g-maquis .mq-resrow>div{cursor:pointer}.g-maquis .mq-card p{margin:4px 0}.g-maquis .mq-sm{font-size:calc(var(--pf,14px) - 2px);color:#5a4d2e}
.g-maquis .mq-dif{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;margin:8px 0}
.g-maquis .mq-dif button{padding:8px 4px;flex-direction:column}.g-maquis .mq-dif button.sel{background:linear-gradient(180deg,#3d63b4,#27468a);color:#fff}
.g-maquis .mq-ck{display:flex;align-items:center;gap:8px;margin:6px 0;font-size:var(--pf,14px)}.g-maquis .mq-ck input{width:18px;height:18px}
.g-maquis .mq-toast{position:absolute;left:50%;top:calc(var(--th,56px) + 8px);transform:translateX(-50%);z-index:35;padding:7px 14px;border-radius:7px;background:rgba(24,22,16,.9);border:1px solid #8c7d52;color:#efe6c8;font-size:var(--tf,14px);pointer-events:none;max-width:90%;text-align:center}
.g-maquis .mq-ft{font-size:calc(var(--pf,14px) + 9px);font-weight:700;margin:0 0 6px}.g-maquis .mq-ft.win{color:#1f5a27}.g-maquis .mq-ft.lose{color:#8a2622}
.g-maquis .mq-qk{display:flex;gap:4px}.g-maquis .mq-qk{flex:none}.g-maquis .mq-qk .mq-btn{flex:1;font-size:12px;padding:3px 2px}
/* 배치: 넓은 화면(1920×1080) */
.g-maquis[data-mode=wide]{--th:56px;--tp:18px;--tf:15px;--tl:28px;--ib:38px;--pf:13px;--tk:34px}
.g-maquis[data-mode=wide] .mq-goals{position:absolute;left:12px;top:64px;width:344px;height:1004px;display:flex;flex-direction:column;gap:12px}
.g-maquis[data-mode=wide] .mq-gprog{margin-top:auto}
.g-maquis[data-mode=wide] .mq-board{left:372px;top:64px;width:1120px;height:792px}
.g-maquis[data-mode=wide] .mq-strip{position:absolute;left:372px;top:864px;width:1120px;height:204px;display:grid;grid-template-columns:424px 226px 246px 1fr;gap:11px}
.g-maquis[data-mode=wide] .mq-strip .mq-pan{height:204px}
.g-maquis[data-mode=wide] .mq-acts{display:flex;flex-direction:column;gap:9px}
.g-maquis[data-mode=wide] .mq-acts .mq-btn{flex:1}
.g-maquis[data-mode=wide] .mq-side{position:absolute;left:1508px;top:64px;width:400px;height:1004px;display:flex;flex-direction:column;gap:10px}
.g-maquis[data-mode=wide] .mq-side .mq-log-pan{flex:1;min-height:0}
.g-maquis[data-mode=wide] .mq-tilepan .mq-tile{min-height:46px}
/* 가로 폰 */
.g-maquis[data-mode=land]{--th:30px;--tp:8px;--tf:12px;--tl:17px;--ib:24px;--pf:11.5px;--tk:19px;--tg:2px;--wh:38px;--popw:300px;--ovw:560px;--cw:90px}
.g-maquis[data-mode=land] .mq-board{left:4px;top:34px}
.g-maquis[data-mode=land] .mq-hud{position:absolute;top:34px;bottom:4px;display:flex;flex-direction:column;gap:5px}
.g-maquis[data-mode=land] .mq-pan{padding:4px 7px;flex:none}.g-maquis[data-mode=land] .mq-pan h5{display:none}.g-maquis[data-mode=land] .mq-tkl small{display:none}.g-maquis[data-mode=land] .mq-tkl{margin-top:1px;font-size:11px}.g-maquis[data-mode=land] .mq-tk{margin:1px 0}.g-maquis[data-mode=land] .mq-resrow{margin-top:0}.g-maquis[data-mode=land] .mq-resrow>div{gap:1px;font-size:10px}.g-maquis[data-mode=land] .mq-wk .w{font-size:9px}
.g-maquis[data-mode=land] .mq-btn{font-size:11.5px;padding:2px 4px}
.g-maquis[data-mode=land] .mq-pop{left:6px!important;right:auto!important;top:auto!important;bottom:6px!important}
/* 세로 폰 */
.g-maquis[data-mode=port]{--th:34px;--tp:8px;--tf:12px;--tl:18px;--ib:26px;--pf:13px;--tk:34px;--tg:3px;--wh:48px;--popw:370px;--ovw:370px;--cw:100px}
.g-maquis[data-mode=port] .mq-board{left:4px;top:38px}
.g-maquis[data-mode=port] .mq-hud{position:absolute;left:4px;right:4px;display:flex;flex-direction:column;gap:6px}
.g-maquis[data-mode=port] .mq-pop{left:8px!important;right:auto!important;top:auto!important;bottom:8px!important}
.g-maquis[data-mode=port] .mq-pan{padding:7px 9px;flex:none}.g-maquis[data-mode=port] .mq-log-pan{flex:1;min-height:60px;overflow:hidden}
`;

// ---------- 마운트 ----------
const ART_GROUPS = ['board', 'res', 'pol', 'sol', 'tok', 'room', 'goal', 'gtile', 'mk', 'star'];
function mountMQ(self, container, ctx) {
  const root = document.createElement('div'); root.className = 'g-maquis'; root.setAttribute('data-skin', 'screen');
  const styleEl = document.createElement('style'); styleEl.textContent = CSS;
  const view = document.createElement('div'); view.className = 'mq-view';
  root.append(styleEl, view); container.appendChild(root);
  const fx = ctx.fx ? ctx.fx.scope(root) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : k === 'rect' || k === 'union' ? () => null : () => Promise.resolve()) });
  const rng = ctx.rng;
  const ART = {}; for (const g of ART_GROUPS) { try { ART[g] = ctx.art ? (ctx.art(g) || []) : []; } catch (e) { ART[g] = []; } }
  const timers = new Set(); let dead = false;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ctx.delay ? ctx.delay(ms) : ms); timers.add(id); };
  const q = sel => root.querySelector(sel);
  const hash = str => { let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0; return h; };
  const exact = (g, i) => (ART[g] && ART[g][i]) || null;
  const cyc = (g, i) => (ART[g] && ART[g].length ? ART[g][i % ART[g].length] : null);

  let opts = { warn: true, heat: false, diff: 'normal', balanced: false };
  try { Object.assign(opts, JSON.parse(localStorage.getItem('mq_opts') || '{}')); } catch (e) { /* 저장 못 해도 진행 */ }
  const saveOpts = () => { try { localStorage.setItem('mq_opts', JSON.stringify(opts)); } catch (e) { /* ignore */ } };

  let s = ctx.resumeState || null, sel = null, ov = ctx.resumeState ? null : { k: 'setup' }, lock = false, hist = [], logs = [], finished = false, toastMsg = '', toastT = 0, L = null;
  if (s && !s.tp) s.tp = [];
  const save = () => { if (s && !s.over && ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s))); };
  const tmsg = t => { toastMsg = t; const my = ++toastT; draw(); later(() => { if (my === toastT) { toastMsg = ''; const e = q('.mq-toast'); if (e) e.remove(); } }, 2600); };

  // ----- 조각 -----
  function pawnImg(kind, key) {
    const g = kind === 'r' ? 'res' : kind === 'p' ? 'pol' : 'sol', u = cyc(g, hash(key));
    if (u) return `<img src="${u}" alt="">`;
    const c = kind === 'r' ? '#3a6fd8' : kind === 'p' ? '#59667a' : '#a6232b';
    return `<svg viewBox="0 0 40 72"><circle cx="20" cy="14" r="11" fill="${c}" stroke="#fff" stroke-width="2"/><path d="M4 68c0-22 7-31 16-31s16 9 16 31z" fill="${c}" stroke="#fff" stroke-width="2"/></svg>`;
  }
  function tok(r, size, cnt, dim) {
    const u = exact('tok', RES.indexOf(r)), c = TOK_COL[r];
    return `<span class="mq-tok${dim ? ' dim' : ''}" style="width:${size}px;height:${size}px">${u ? `<img src="${u}" alt="">` : `<span class="d" style="background:${c[0]};font-size:${Math.round(size * 0.45)}px">${c[1]}</span>`}${cnt != null ? `<span class="n">${cnt}</span>` : ''}</span>`;
  }
  const mkImg = i => { const u = exact('mk', i); return u ? `<img class="mk" src="${u}" alt="">` : '<b class="mkd"></b>'; };
  const starImg = () => { const u = exact('star', 0); return u ? `<img src="${u}" alt="">` : '★'; };

  // ----- 배치 계산 -----
  function layout() {
    const w = root.clientWidth || window.innerWidth, h = root.clientHeight || window.innerHeight;
    let mode, W, H, sc;
    if (Math.min(w, h) < 540) mode = w > h ? 'land' : 'port'; else mode = w / h > 1.1 ? 'wide' : 'port';
    if (mode === 'wide') { W = 1920; H = 1080; sc = Math.min(w / W, h / H); }
    else if (mode === 'land') { sc = h / 390; W = w / sc; if (W < 700) { sc = w / 700; W = 700; } H = h / sc; }
    else { sc = w / 390; W = 390; H = h / sc; if (H < 740) { sc = h / 740; H = 740; W = w / sc; } }
    const o = { mode, W, H, sc, ox: (w - W * sc) / 2, oy: (h - H * sc) / 2 };
    if (mode === 'wide') { o.bw = 1120; o.bh = 792; o.bx = 372; o.by = 64; }
    else if (mode === 'land') { let bh = H - 38, bw = bh * 1.4156; if (bw > W * 0.62) { bw = W * 0.62; bh = bw / 1.4156; } Object.assign(o, { bw, bh, bx: 4, by: 34 }); }
    else { const bw = W - 8; Object.assign(o, { bw, bh: bw / 1.4156, bx: 4, by: 38 }); }
    o.pw = mode === 'wide' ? 84 : o.bw * 0.085;
    return o;
  }

  // ----- 패널 조각들 -----
  const D = () => DIFFS[s.diff];
  function tracks() {
    const d = D();
    const row = (arr, cur, mark, cls) => `<div class="mq-tk">${arr.map((lab, i) => `<i class="${cls(i)}${i === cur ? ' on' : ''}">${lab}${i === cur ? mkImg(mark) : ''}</i>`).join('')}</div>`;
    const marr = [7, 'S', 5, 4, 3, 2, 1, '✕'], curM = 7 - s.morale;
    const turnArr = ['S', ...Array.from({ length: 14 }, (_, i) => i + 1), 'E'];
    const endAt = d.endAt || TURN_END, marks = d.redMorale ? RED : GREY;
    return `<h5>트랙 <small>${d.redMorale ? '붉은 칸 = 사기 −1' : '회색 칸 = 사기 −1'}</small></h5>
      <div class="mq-tkl">사기 <small>순찰 최소 ${minPatrol(s.morale)}명</small></div>${row(marr, curM, 0, i => (i === 7 ? 'f' : ''))}
      <div class="mq-tkl">군인 <small>쏠 때마다 +1 · 경찰→군인</small></div>${row(['S', 1, 2, 3, 4, 5], s.soldier, 1, () => '')}
      <div class="mq-tkl">날짜 <small>${s.turn}일차${d.endAt ? ` · ${d.endAt}에서 종료` : ''}${d.loop ? ' · 끝나면 처음으로' : ''}</small></div>${row(turnArr, s.pos, 2, i => `${marks.includes(i) ? (d.redMorale ? 'r' : 'g') : (RED.includes(i) && !d.redMorale ? 'r' : '')}${TRAIN.includes(i) ? ' t' : ''}${i === endAt ? ' f' : ''}${i > endAt ? ' dm' : ''}`)}`;
  }
  function resP() {
    const sup = r => supplyOf(s, r);
    return `<h5>보유 자원 <small>종류별 최대 4개</small></h5><div class="mq-resrow">${RES.map(r => `<div data-res="${r}" data-do="res:${r}">${tok(r, L.mode === 'wide' ? 54 : L.mode === 'land' ? 30 : 38, s.hand[r], s.hand[r] === 0)}<span>${RES_KO[r]}</span></div>`).join('')}</div>${L.mode === 'wide' ? `<div class="mq-sm" style="margin-top:12px;padding-top:8px;border-top:1px dashed #a89a6e">공급 남음: ${RES.map(r => `${RES_KO[r]} ${sup(r)}`).join(' · ')}</div>` : ''}`;
  }
  function workP() {
    const onb = Object.values(s.occ).filter(o => o.t === 'r').length;
    const w = (n, g, lab) => Array.from({ length: n }, (_, i) => `<span class="w${g ? ' g' : ''}">${pawnImg('r', 'w' + i + lab)}${L.mode === 'wide' ? `<span>${lab}</span>` : ''}</span>`).join('');
    return `<h5>일꾼 <small>${owned(s)}명 보유${s.lost ? ` · 체포 ${s.lost}` : ''}</small></h5><div class="mq-wk">${w(s.pool, false, '안가')}${w(onb, false, '출동')}${w(s.cafe, true, '카페')}</div>`;
  }
  function tilesP() {
    return `<h5>빈 방 타일 <small>자금 2로 설치</small></h5><div class="mq-tiles">${TILE_ORDER.map((t, i) => {
      const at = SPARES.find(l => s.tiles[l] === t), u = exact('room', i);
      return `<button class="mq-tile${at ? '' : ''}" data-do="tile:${t}">${u ? `<img src="${u}" alt="${TILES[t].ko}">` : `<span class="ph">${TILES[t].ko}</span>`}${at ? '<span class="ck">설치됨</span>' : ''}</button>`;
    }).join('')}</div>`;
  }
  function goalCard(g, big) {
    const info = GOALS[g.id], gi = GOAL_ORDER.indexOf(g.id), u = exact('goal', gi), nd = goalNeed(g.id);
    let stars = '';
    if (nd) {
      const lst = g.id === 'newspaper' ? [['★', g.p.a >= 1], ['★', g.p.a >= 2], ['★', g.p.a >= 3]] : g.id === 'train' ? [['★', g.p.a >= 1]] : g.id === 'spy' ? [['1', g.p.a >= 1], ['2', g.p.b >= 1]] : [['1', g.p.a >= 1], ['1', g.p.a >= 2], ['2', g.p.b >= 1]];
      stars = `<div class="stars">${lst.map(([n, on]) => `<span class="st${on ? ' on' : ''}">${on ? starImg() : n}</span>`).join('')}</div>`;
    } else if (g.id === 'liberate') stars = `<div class="stars"><span class="mq-chip" style="font-size:12px">무기 ${s.hand.weapon}/3 · 사기 ${s.morale}/4</span></div>`;
    else stars = `<div class="stars"><span class="mq-chip" style="font-size:12px">군인 ${s.soldier} / 순찰 ${patrolCount(s)}</span></div>`;
    if (u) {
      const cubes = nd && GOAL_STAR[g.id] ? GOAL_STAR[g.id].map(([x, y], i) => { const on = g.id === 'newspaper' ? g.p.a > i : g.id === 'train' ? g.p.a >= 1 : g.id === 'spy' ? (i === 0 ? g.p.a >= 1 : g.p.b >= 1) : (i < 2 ? g.p.a > i : g.p.b >= 1); return on ? `<i class="mq-cube" style="left:${x}%;top:${y}%"></i>` : ''; }).join('') : '';
      return `<button class="mq-gc${g.done ? ' done' : ''}" data-do="goal:${g.id}"><img src="${u}" alt="${info.ko}">${cubes}${nd ? '' : stars}</button>`;
    }
    return `<button class="mq-gc mq-gcf${g.done ? ' done' : ''}" data-do="goal:${g.id}"><h6>${info.ko}</h6><div class="en">${info.en}${GOALS[g.id].loc ? ` · ${g.slot === 0 ? '왼쪽' : '오른쪽'} 출구` : ''}</div>${esc(GOAL_INFO[g.id])}${stars}</button>`;
  }
  function goalProg(g) {
    if (!g) return '';
    const pr = goalProgress(s, g);
    if (pr) return `${pr.a[0] + pr.b[0]} / ${pr.a[1] + pr.b[1]}`;
    if (g.id === 'liberate') return `무기 ${Math.min(3, s.hand.weapon)}/3 · 사기 ${s.morale}/4`;
    return `군인 ${Math.min(s.soldier, patrolCount(s))}/${patrolCount(s)}`;
  }
  function goalsP() { return s.goals.map(g => goalCard(g)).join(''); }
  function progP() {
    return `<div class="mq-pan mq-gprog"><h5>목표 진행</h5>${s.goals.map(g => {
      const pr = goalProgress(s, g); let cur = 0, tot = 0;
      if (pr) { cur = pr.a[0] + pr.b[0]; tot = pr.a[1] + pr.b[1]; } else if (g.id === 'liberate') { cur = Math.min(3, s.hand.weapon) + (s.morale >= 4 ? 1 : 0); tot = 4; } else { cur = Math.min(s.soldier, patrolCount(s)); tot = patrolCount(s); }
      return `<div style="display:flex;justify-content:space-between;font-size:13px;margin-top:6px"><span>${GOALS[g.id].ko}${g.id === 'train' ? ' <small style="color:#7a6c47">(7~10일차 열차 칸)</small>' : ''}</span><b style="color:#27468a">${g.done ? '달성' : `${cur} / ${tot}`}</b></div><div style="height:7px;border-radius:4px;background:#cdbf98;margin-top:3px;overflow:hidden"><div style="width:${tot ? Math.min(100, cur / tot * 100) : 0}%;height:7px;background:${g.done ? '#2f7a35' : '#3d63b4'}"></div></div>`;
    }).join('')}</div>`;
  }
  function clip(tp, compactNo) {
    const card = PATROLS[tp.card];
    const ci = tp.loc ? card.indexOf(tp.loc) : -1;
    return `<div class="mq-clip"><div class="pp"><b>PATROL</b>${card.map((l, i) => `<div class="${tp.arrest ? (i === ci ? 'pa' : 'sk') : (ci >= 0 ? (i === ci ? 'pk' : i < ci ? 'sk' : '') : 'sk')}">${LOC_KO[l]}</div>`).join('')}</div></div>`;
  }
  function patrolP() {
    const tps = s.tp.slice(-(L.mode === 'wide' ? 3 : 2));
    return `<h5>순찰 덱 <small>남은 ${s.deck.length} · 버린 ${s.discard.length}</small></h5><div class="mq-pat">${tps.length ? tps.map(clip).join('') : '<div class="mq-sm">이번 턴 순찰은 아직 안 섰어요.</div>'}</div>
      <div class="mq-sm" style="margin-top:6px">파랑 = 순찰이 선 곳 · 줄 = 이미 차 있던 곳 · 빨강 = 체포</div><button class="mq-btn" style="margin-top:6px;width:100%;height:30px" data-do="ov:patrol">버린 카드·남은 카드 보기</button>`;
  }
  function logP() { return `<h5>일지</h5><div class="mq-log">${logs.slice(-(L.mode === 'wide' ? 16 : 30)).reverse().map(l => `<div class="${l.c || ''}">${esc(l.t)}</div>`).join('')}</div>`; }
  function actsP() {
    const act = s.phase === 'action', nW = Object.values(s.occ).filter(o => o.t === 'r').length;
    const shootable = !s.shot && (s.hand.weapon > 0 || Object.values(s.occ).some(o => o.t === 'r' && o.pend && o.pend.arrow === 'yellow' && o.pend.gain.weapon));
    return `<button class="mq-btn go" data-do="endday" ${act && nW ? '' : 'disabled'} style="font-size:${L.mode === 'wide' ? 19 : 13}px">${act ? `하루 마치기<small>일꾼 ${nW}명 귀환</small>` : `일꾼 배치 중<small>${s.plan ? s.plan.rem : 0}명 남음</small>`}</button>
      <button class="mq-btn red" data-do="shoothint" ${act ? '' : 'disabled'}>경찰 사살<small>${s.shot ? '이번 턴 사용함' : shootable ? '무기 1 · 경찰을 눌러요' : '무기 필요'}</small></button>
      <button class="mq-btn" data-do="undo" ${hist.length && act ? '' : 'disabled'}>↶ 되돌리기</button>`;
  }
  function qk() { return `<div class="mq-qk"><button class="mq-btn" data-do="ov:goals">목표</button><button class="mq-btn" data-do="ov:patrol">순찰</button><button class="mq-btn" data-do="ov:log">일지</button><button class="mq-btn" data-do="ov:tiles">타일</button></div>`; }

  // ----- 보드 -----
  function routeInfo(loc) { const p = pathHome(s, loc); return { ok: !!p, path: p }; }
  function boardHTML() {
    const { bw, bh, pw } = L, bu = exact('board', 0);
    let h = `<div class="mq-board" style="left:${L.bx}px;top:${L.by}px;width:${bw}px;height:${bh}px;--bw:${bw}px;--pw:${pw}px">`;
    if (bu) h += `<img class="mq-bg" src="${bu}" alt="">`;
    else {
      h += `<div class="mq-fb"><svg viewBox="0 0 100 100" preserveAspectRatio="none">${EDGES.filter(([a, b]) => XY[a] && XY[b] && activeNodes(s).includes(a) && activeNodes(s).includes(b)).map(([a, b]) => `<line x1="${XY[a][0]}" y1="${XY[a][1]}" x2="${XY[b][0]}" y2="${XY[b][1]}" stroke="#d6b13c" stroke-width="3.5" vector-effect="non-scaling-stroke" stroke-linecap="round"/>`).join('')}</svg>`;
      for (const l of activeNodes(s)) {
        if (l.startsWith('goal')) continue;
        const t = tileAt(s, l), nm = SPARES.includes(l) ? (t ? TILES[t].ko : '빈 방') : AIRDROPS.includes(l) ? '공중투하' : LOC_KO[l];
        h += `<div class="mq-ph" style="left:${XY[l][0]}%;top:${XY[l][1]}%"><b>${nm}</b>${LOC_FR[l] ? `<span>${LOC_FR[l]}</span>` : ''}</div>`;
      }
      h += '</div>';
    }
    // 목표 장소 판
    for (const g of s.goals) {
      if (!GOALS[g.id].loc) continue;
      const loc = g.slot === 0 ? 'goalA' : 'goalB', gi = ['newspaper', 'train'].indexOf(g.id), u = gi >= 0 ? exact('gtile', gi) : null;
      h += u ? `<div class="mq-gt" style="left:${XY[loc][0]}%"><img src="${u}" alt="${GOALS[g.id].ko}"></div>` : `<div class="mq-gt ph" style="left:${XY[loc][0]}%"><b>${GOALS[g.id].ko}</b></div>`;
    }
    // 설치된 빈 방 타일
    if (bu) for (const l of SPARES) {
      const t = s.tiles[l]; if (!t) continue; const i = TILE_ORDER.indexOf(t), u = exact('room', i);
      h += u ? `<div class="mq-tilebd" style="left:${XY[l][0]}%;top:${XY[l][1]}%"><img src="${u}" alt=""></div>` : `<div class="mq-ph" style="left:${XY[l][0]}%;top:${XY[l][1]}%;background:#e6efd8;z-index:2"><b>${TILES[t].ko}</b></div>`;
    }
    // 공중투하물
    for (const l of AIRDROPS) { const a = s.air[l]; if (a) h += `<div class="mq-air" style="left:${XY[l][0]}%;top:${XY[l][1]}%" data-air="${l}">${tok(a.r, Math.max(26, bw * 0.05), a.n)}</div>`; }
    // 귀환 경로 미리보기
    const so = sel && s.occ[sel] && s.occ[sel].t === 'r' && s.phase === 'action' ? sel : null;
    if (so && opts.warn) {
      const ri = routeInfo(so);
      if (ri.ok && ri.path.length > 1) { const pts = ri.path.map(n => XY[n].join(',')).join(' '); h += `<svg class="mq-route" viewBox="0 0 100 100" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="rgba(0,0,0,.55)" stroke-width="9" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke" opacity=".35"/><polyline points="${pts}" fill="none" stroke="#4fe07a" stroke-width="5" stroke-dasharray="14 9" stroke-linecap="round" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`; }
      h += `<div class="mq-chipb ${ri.ok ? 'ok' : 'no'}" style="left:3%;bottom:3%">${ri.ok ? '✔ 귀환 경로 안전' : '✖ 귀환 경로 막힘 — 이대로면 체포'}</div>`;
    }
    // 순찰 위험 표시
    if (opts.heat && s.phase === 'place') {
      for (const l of activeNodes(s)) { if (s.occ[l] || l === 'safe' || l.startsWith('goal') || AIRDROPS.includes(l) || SPARES.includes(l) || l === 'cafe') continue; const n = s.deck.filter(c => PATROLS[c].includes(l)).length; if (n) h += `<span class="mq-heat" style="left:${XY[l][0] + 5.2}%;top:${XY[l][1] - 3.6}%">${n}</span>`; }
    }
    // 핫스팟
    for (const l of activeNodes(s)) {
      if (l === 'safe') continue;
      const o = s.occ[l], can = s.phase === 'place' ? (!o && (!AIRDROPS.includes(l) || s.air[l])) : (o && o.t === 'r' && !o.acted);
      const pos = l.startsWith('goal') ? [XY[l][0], XY[l][1] + 0.2] : XY[l];
      h += `<button class="mq-hot${can ? ' can' : ''}${sel === l ? ' sel' : ''}" data-loc="${l}" style="left:${pos[0]}%;top:${pos[1]}%;${l.startsWith('goal') ? 'width:13.6%;height:7.4%' : ''}" aria-label="${LOC_KO[l]}"></button>`;
    }
    // 말
    for (const [l, o] of Object.entries(s.occ)) {
      const g = l.startsWith('goal'), x = XY[l][0] + (g ? 8.4 : NOACT.has(l) ? 0 : -4.2), y = XY[l][1] + (g ? 6.2 : 1.2);
      const bd = o.t === 'r' && o.acted ? `<span class="bd${o.pend && o.pend.red ? '' : ''}">✓</span>` : '';
      h += `<div class="mq-pw" data-pw="${l}" style="left:${x}%;top:${y}%"><span class="sh"></span>${pawnImg(o.t, l)}${bd}</div>`;
    }
    // 안가 대기 일꾼 / 카페 대기 일꾼
    for (let i = 0; i < s.pool; i++) h += `<div class="mq-pw" style="left:${XY.safe[0] + (i - (s.pool - 1) / 2) * 3.4}%;top:${XY.safe[1] + 0.4}%;--pw:${pw * 0.62}px"><span class="sh"></span>${pawnImg('r', 'h' + i)}</div>`;
    for (let i = 0; i < s.cafe; i++) h += `<div class="mq-pw" style="left:${XY.cafe[0] - 6.5 + i * 2.8}%;top:${XY.cafe[1] - 3.2}%;--pw:${pw * 0.5}px;opacity:.55"><span class="sh"></span>${pawnImg('r', 'c' + i)}</div>`;
    return h + '</div>';
  }

  // ----- 팝오버(칸 눌렀을 때) -----
  function effChips(op) {
    const c = [];
    if (op.morale) c.push(`사기 ${op.morale > 0 ? '+' : ''}${op.morale}`);
    if (op.recruit) c.push('일꾼 +1');
    if (op.succ) c.push('목표 성공');
    if (op.tile) c.push(`타일: ${TILES[op.tile].ko}`);
    if (op.air) c.push(`투하: ${RES_KO[op.air.r]} ${op.air.n}`);
    return c.map(x => `<span class="ef">${x}</span>`).join('');
  }
  const toks = (obj, size) => Object.entries(obj).map(([r, n]) => tok(r, size, n > 1 ? n : null)).join('');
  function optBtn(loc, op, interactive) {
    const can = canPay(s, op.cost) && interactive;
    const ar = op.arrow === 'red' ? 'red' : op.arrow;
    return `<button class="mq-btn mq-opt${can ? '' : ' dis'}" ${can ? `data-do="act:${loc}:${op.id}"` : 'disabled'}><span class="row">${toks(op.cost, 24)}<span class="ar ${ar}">→</span>${toks(op.gain, 24)}${effChips(op)}</span><span class="ds">${esc(op.ko)} · ${ARROW_KO[op.arrow]}${!canPay(s, op.cost) ? ' · <b style="color:#8a2622">재료 부족</b>' : ''}</span></button>`;
  }
  function popBody() {
    const loc = sel, o = s.occ[loc], nm = `${LOC_KO[loc]}${LOC_FR[loc] ? ` <small>${LOC_FR[loc]}</small>` : ''}`;
    const ops = optionsAt(s, loc), t = tileAt(s, loc);
    let body = `<button class="x" data-do="close">✕</button><h4>${nm}</h4>`;
    const desc = LOC_DESC[loc] || (SPARES.includes(loc) ? (t ? `설치된 타일: ${TILES[t].ko}. ${TILE_DESC[t]}` : '빈 방이에요. 자금 2를 내면 타일 1장을 설치할 수 있어요.') : '');
    if (o && o.t === 'p') {
      body += `<p>${o.t === 'p' ? '경찰' : '군인'}이 서 있어요. 이 자리를 지나 돌아갈 수 없어요.</p>`;
      if (s.phase === 'action') {
        const src = [];
        if (!s.shot) { if (s.hand.weapon > 0) src.push(['h', '손에 든 무기 1개로 사살']); for (const [l, w] of Object.entries(s.occ)) if (w.t === 'r' && w.pend && w.pend.arrow === 'yellow' && w.pend.gain.weapon) src.push([l, `${LOC_KO[l]}에서 막 얻은 무기로 사살`]); }
        body += s.shot ? '<p class="mq-st no">이번 턴에는 이미 쏘았어요.</p>' : src.length ? src.map(([k, lab]) => `<button class="mq-btn red mq-opt" data-do="shoot:${loc}:${k}"><span class="row"><b>${lab}</b></span><span class="ds">사기 −1 · 군인 트랙 +1 (이후 경찰이 군인으로 바뀌어요)</span></button>`).join('') : '<p class="mq-st no">쓸 수 있는 무기가 없어요.</p>';
      }
      return body;
    }
    if (o && o.t === 's') return body + '<p>군인이에요. 군인은 쏠 수 없고, 길도 막아요.</p>';
    if (o && o.t === 'r' && s.phase === 'action') {
      body += `<p class="mq-sm">${o.acted ? `행동 완료: ${esc(optionsAt(s, loc).find(x => x.id === o.opt) ? optionsAt(s, loc).find(x => x.id === o.opt).ko : '완료')} (귀환하면 보상을 받아요)` : '이 일꾼이 할 행동을 고르세요.'}</p>`;
      if (!o.acted) body += ops.length ? ops.map(op => optBtn(loc, op, true)).join('') : `<p class="mq-sm">${desc || '여기서 할 수 있는 행동이 없어요.'}</p>`;
      const ri = routeInfo(loc);
      if (opts.warn) body += `<p class="mq-st ${ri.ok ? 'ok' : 'no'}">${ri.ok ? '✔ 귀환 경로 안전' : '✖ 귀환 경로 막힘 — 경찰을 쏘아 길을 열지 않으면 체포돼요' + (o.acted && o.pend && !o.pend.red ? ' (이 행동은 흰 화살표라 보상도 잃어요)' : '')}</p>`;
      body += `<button class="mq-btn go" style="width:100%;height:38px;margin-top:8px" data-do="retrieve:${loc}">${o.acted ? '귀환(회수)' : '행동 없이 귀환'}</button>`;
      return body;
    }
    if (s.phase === 'place' && !o) {
      const free = !AIRDROPS.includes(loc) || s.air[loc];
      body += `<p class="mq-sm">${esc(desc)}</p>`;
      body += ops.length ? ops.map(op => optBtn(loc, op, false).replace('disabled', 'disabled')).join('') : (loc === 'safe' ? '' : `<p class="mq-sm">${loc.startsWith('goal') && !isTrainTurn(s) && s.goals.some(g => g.id === 'train' && !g.done && ((g.slot === 0 ? 'goalA' : 'goalB') === loc)) ? '열차 칸이 있는 날(7~10일차)에만 행동할 수 있어요.' : '지금은 할 수 있는 행동이 없어요.'}</p>`);
      if (loc !== 'safe') {
        const n = s.deck.filter(c => PATROLS[c].includes(loc)).length;
        if (!loc.startsWith('goal') && !SPARES.includes(loc) && loc !== 'cafe' && !AIRDROPS.includes(loc)) body += `<p class="mq-sm">순찰 카드: 남은 ${s.deck.length}장 중 ${n}장에 이 자리가 적혀 있어요.</p>`;
        body += free ? `<button class="mq-btn go" style="width:100%;height:40px;margin-top:8px" data-do="place:${loc}">여기에 일꾼 배치</button>` : '<p class="mq-st no">투하물이 없어서 일꾼을 보낼 수 없어요.</p>';
      }
      return body;
    }
    body += `<p class="mq-sm">${esc(desc)}</p>`;
    if (ops.length) body += ops.map(op => optBtn(loc, op, false)).join('');
    else if (!desc) body += '<p class="mq-sm">행동이 없는 자리예요.</p>';
    return body;
  }
  function popHTML() {
    if (!sel || ov) return '';
    let st = '';
    if (L.mode === 'wide') {
      const x = L.bx + XY[sel][0] / 100 * L.bw, y = L.by + XY[sel][1] / 100 * L.bh, W = 310;
      const left = XY[sel][0] < 55 ? x + L.bw * 0.07 : x - L.bw * 0.07 - W, top = Math.max(L.by + 6, Math.min(L.by + L.bh - 340, y - 70));
      st = `left:${left}px;top:${top}px;`;
    }
    return `<div class="mq-pop mq-pan" data-skin="panel" style="${st}">${popBody()}</div>`;
  }

  // ----- 오버레이 -----
  function ovHTML() {
    if (!ov) return '';
    let b = '';
    const close = '<button class="mq-btn" style="margin-top:12px;width:100%;height:36px" data-do="closeov">닫기</button>';
    if (ov.k === 'setup') {
      b = `<h3 class="mq-fd">MAQUIS</h3><p class="mq-sm">점령된 프랑스 마을에서 15일 안에 목표 2개를 달성하세요. 순찰을 피해 일꾼을 놓고, 안전하게 돌아오세요.</p>
        <h4>난이도</h4><div class="mq-dif">${DIFF_ORDER.map(k => `<button class="mq-btn${opts.diff === k ? ' sel' : ''}" data-do="diff:${k}">${DIFFS[k].ko}<small>${DIFFS[k].en}</small></button>`).join('')}</div>
        <p class="mq-sm">${{ veryeasy: '15일이 끝나도 계속돼요. 공중투하가 아주 후해요.', easy: '공중투하가 후해요.', normal: '원작 기본 규칙 그대로예요.', tricky: '일꾼 2명으로 시작하고, 12일차에 끝나요. (어려운 맛 추천)', hard: '까다로움 + 사기 감소가 붉은 테두리 칸에서 일어나요.', veryhard: '어려움 + 일꾼이 체포될 때마다 사기 −1.' }[opts.diff]}</p>
        <label class="mq-ck"><input type="checkbox" data-opt="balanced" ${opts.balanced ? 'checked' : ''}>균형 목표 (쉬운 쪽 1개 + 어려운 쪽 1개)</label>
        <label class="mq-ck"><input type="checkbox" data-opt="warn" ${opts.warn ? 'checked' : ''}>귀환 경로 안내·경고 보기</label>
        <label class="mq-ck"><input type="checkbox" data-opt="heat" ${opts.heat ? 'checked' : ''}>배치 때 순찰 위험 숫자 보기 (남은 카드 기준)</label>
        <button class="mq-btn go" style="margin-top:10px;width:100%;height:46px;font-size:17px" data-do="start">작전 시작</button>
        <button class="mq-btn" style="margin-top:8px;width:100%;height:34px" data-do="ov:rules">규칙 보기</button>`;
    } else if (ov.k === 'opts') {
      b = `<h3>옵션</h3><label class="mq-ck"><input type="checkbox" data-opt="warn" ${opts.warn ? 'checked' : ''}>귀환 경로 안내·경고 보기</label><label class="mq-ck"><input type="checkbox" data-opt="heat" ${opts.heat ? 'checked' : ''}>배치 때 순찰 위험 숫자 보기</label><p class="mq-sm">난이도: ${DIFFS[s.diff].ko} (진행 중에는 바꿀 수 없어요)</p>${close}`;
    } else if (ov.k === 'rules') b = `<h3>규칙 안내</h3>${RULES_KO}${close}`;
    else if (ov.k === 'goals') b = `<h3>목표</h3><div style="display:grid;grid-template-columns:${L.mode === 'port' ? '1fr' : '1fr 1fr'};gap:10px">${s.goals.map(g => goalCard(g)).join('')}</div>${progP()}${close}`;
    else if (ov.k === 'goal') {
      const g = s.goals.find(x => x.id === ov.id), tr = GOAL_TR[ov.id], pr = goalProg(g);
      b = `<h3>${GOALS[ov.id].ko} <small class="mq-sm">${GOALS[ov.id].en}</small></h3><h4>카드 번역</h4><p class="mq-tr">${esc(tr.q)}</p><p>${esc(tr.c)}</p>${tr.a ? `<p class="mq-tr act">${esc(tr.a)}</p>` : ''}<h4>이 앱에서는</h4><p>${GOAL_INFO[ov.id]}</p>${g && g.done ? '<p class="mq-st ok">달성했어요!</p>' : `<p class="mq-sm">지금 진행: <b>${pr}</b></p>`}${close}`;
    }
    else if (ov.k === 'tile') b = `<h3>${TILES[ov.id].ko} <small class="mq-sm">${TILES[ov.id].en}</small></h3><p class="mq-sm">${TILE_FR[ov.id]}</p><p class="mq-tr act">${TILE_ACT[ov.id]}</p><p>${TILE_DESC[ov.id]}</p><p class="mq-sm">${SPARES.find(l => s.tiles[l] === ov.id) ? `설치됨: ${LOC_KO[SPARES.find(l => s.tiles[l] === ov.id)]}` : '아직 설치하지 않았어요. 빈 방에서 자금 2를 내고 고를 수 있어요.'}</p>${close}`;
    else if (ov.k === 'res') b = `<h3>${RES_KO[ov.id]} <small class="mq-sm">${ov.id}</small></h3><p>${RES_DESC[ov.id]}</p><p class="mq-sm">지금 손에 <b>${s.hand[ov.id]}</b>개 · 공급 ${supplyOf(s, ov.id)}개 남음 (종류별 최대 4개)</p>${close}`;
    else if (ov.k === 'tiles') b = `<h3>빈 방 타일</h3>${tilesP()}${close}`;
    else if (ov.k === 'log') b = `<h3>일지</h3>${logP().replace('<h5>일지</h5>', '')}${close}`;
    else if (ov.k === 'patrol') {
      const rem = new Set(s.deck), cnt = {};
      for (const c of s.deck) for (const l of PATROLS[c]) cnt[l] = (cnt[l] || 0) + 1;
      b = `<h3>순찰 카드 (10장)</h3><p class="mq-sm">밝은 카드 ${s.deck.length}장이 아직 안 뽑힌 카드예요(순서는 몰라요). 어두운 카드는 이미 버려졌어요. 덱이 비면 버린 카드를 섞어 다시 써요.</p>
        <div class="mq-pat">${PATROLS.map((c, i) => `<div class="mq-clip${rem.has(i) ? '' : ' o'}"><div class="pp"><b>${rem.has(i) ? 'PATROL' : '버림'}</b>${c.map(l => `<div>${LOC_KO[l]}</div>`).join('')}</div></div>`).join('')}</div>
        <h4>남은 카드에 적힌 횟수</h4><p class="mq-sm">${Object.entries(cnt).sort((a, b2) => b2[1] - a[1]).map(([l, n]) => `${LOC_KO[l]} ${n}`).join(' · ') || '없음'}</p>${close}`;
    } else if (ov.k === 'confirm') b = `<h3>하루를 마칠까요?</h3><p>귀환 경로가 막힌 일꾼 <b>${ov.n}명</b>이 체포돼요. (영구 제거)</p><button class="mq-btn red" style="width:100%;height:40px;margin-top:8px" data-do="endday!">그래도 마친다</button>${close}`;
    else if (ov.k === 'over') {
      const r = self.result(s), oc = s.outcome;
      b = `<h3 class="mq-ft ${oc}">${oc === 'win' ? '해방의 날이 밝았어요!' : oc === 'draw' ? '절반의 성공…' : '작전 실패'}</h3><p>${esc(r.summary)}</p>
        <p class="mq-sm">${s.goals.map(g => `${g.done ? '✔' : '✘'} ${GOALS[g.id].ko}`).join('<br>')}</p><p class="mq-sm">${s.turn}일차 · 사기 ${s.morale} · 체포 ${s.lost}명 · 사살 ${s.stat.shot}번</p>
        <button class="mq-btn go" style="width:100%;height:44px;margin-top:10px" data-do="finish">기록 저장하고 마치기</button>`;
    }
    return `<div class="mq-ov" data-do="${ov.k === 'setup' || ov.k === 'over' || ov.k === 'confirm' ? '' : 'closeov'}"><div class="mq-card mq-pan" data-skin="panel" data-do="noop">${b}</div></div>`;
  }

  // ----- 일지 -----
  const nm = l => LOC_KO[l] || l;
  function logEvents(E) {
    for (const e of E) {
      if (e.k === 'turn') logs.push({ t: `${e.turn}일차 — 순찰 ${e.nP}명${e.sol ? ` (군인 ${e.sol})` : ''}`, c: 'b' });
      else if (e.k === 'place') logs.push({ t: `배치: ${nm(e.loc)}` });
      else if (e.k === 'patrol') logs.push({ t: `순찰(${e.kind === 's' ? '군인' : '경찰'}) → ${nm(e.loc)}` });
      else if (e.k === 'idle') logs.push({ t: '순찰 1명은 설 자리가 없어 빠졌어요' });
      else if (e.k === 'arrest') logs.push({ t: e.how === 'place' ? `체포! ${nm(e.loc)}의 일꾼이 붙잡혔어요` : `체포! ${nm(e.loc)}에서 안가로 돌아오지 못했어요`, c: 'bad' });
      else if (e.k === 'act') logs.push({ t: `${nm(e.loc)}: ${e.ko}` });
      else if (e.k === 'home') logs.push({ t: `${nm(e.loc)} 일꾼 귀환` });
      else if (e.k === 'gain') logs.push({ t: `획득: ${Object.entries(e.gain).map(([r, n]) => `${RES_KO[r]} ${n}`).join(', ')}`, c: 'good' });
      else if (e.k === 'lostreward') logs.push({ t: `보상 소실: ${Object.entries(e.gain).map(([r, n]) => `${RES_KO[r]} ${n}`).join(', ') || '효과'}`, c: 'bad' });
      else if (e.k === 'shoot') logs.push({ t: `${nm(e.loc)}의 경찰 사살 (사기 −1, 군인 ${e.soldier})`, c: 'b' });
      else if (e.k === 'morale') logs.push({ t: `사기 ${e.d > 0 ? '+' : ''}${e.d}`, c: e.d > 0 ? 'good' : 'bad' });
      else if (e.k === 'marker') logs.push({ t: e.hit ? '날짜가 한 칸 — 사기 감소 칸!' : '날짜가 한 칸 지나갔어요', c: e.hit ? 'bad' : '' });
      else if (e.k === 'success') logs.push({ t: `목표 성공: ${GOALS[e.id].ko}`, c: 'good' });
      else if (e.k === 'tile') logs.push({ t: `${nm(e.loc)}에 ${TILES[e.tile].ko} 설치`, c: 'good' });
      else if (e.k === 'recruit') logs.push({ t: '새 일꾼 영입', c: 'good' });
      else if (e.k === 'airdrop') logs.push({ t: `공중투하: ${RES_KO[e.r]} ${e.n} (${nm(e.loc)})` });
      else if (e.k === 'reshuffle') logs.push({ t: '순찰 덱을 다시 섞었어요' });
      else if (e.k === 'over') logs.push({ t: e.outcome === 'win' ? '작전 성공!' : e.outcome === 'draw' ? '무승부' : '작전 실패', c: 'b' });
    }
    if (logs.length > 200) logs.splice(0, logs.length - 200);
  }

  // ----- 연출 (규칙과 무관: 화면에서만) -----
  function animate(E) {
    let t = 0; const P = l => q(`[data-pw="${l}"]`);
    for (const e of E) {
      if (e.k === 'place') { const el = P(e.loc); if (el) { fx.sfx('place'); fx.slam(el); } }
      else if (e.k === 'patrol' || (e.k === 'arrest' && e.how === 'place')) {
        const el = P(e.loc); if (!el) continue;
        el.style.visibility = 'hidden'; const d0 = t; t += 230;
        later(() => { el.style.visibility = ''; fx.sfx(e.k === 'arrest' ? 'bad' : 'slam'); fx.slam(el); if (e.k === 'arrest') { fx.shake(el, 8); fx.burst(el, { color: ['#ff6b5f', '#fff'], n: 10, spread: 50 }); fx.buzz(14); } }, d0 + 140);
      } else if (e.k === 'arrest') { later(() => { fx.sfx('out'); const b = q('.mq-board'); if (b) { fx.shake(b, 6); fx.float(b, '체포!', { color: '#ff8a7a', size: 26 }); } fx.buzz(18); }, t + 60); t += 200; }
      else if (e.k === 'shoot') { later(() => { fx.sfx('slam'); const b = q('.mq-board'); if (b) { fx.shake(b, 5); fx.burst(b, { color: ['#ffd34d', '#ff6b5f', '#fff'], n: 16, spread: 80 }); } fx.buzz(16); }, t + 40); t += 180; }
      else if (e.k === 'gain') { later(() => { fx.sfx('gain'); for (const [r, n] of Object.entries(e.gain)) { const el = q(`[data-res="${r}"]`); if (el) { fx.pop(el, 1.2); fx.float(el, '+' + n, { color: '#6fe08a' }); } } }, t + 60); t += 120; }
      else if (e.k === 'success') { later(() => { fx.sfx('win'); const el = q('.mq-gc'); if (el) { fx.glow(el, '#ffd34d'); fx.burst(el, { color: ['#ffd34d', '#fff'], n: 20, spread: 90 }); } fx.buzz(20); }, t + 60); t += 260; }
      else if (e.k === 'tile') { later(() => { fx.sfx('deal'); const el = q('.mq-tilebd') || q('.mq-ph'); if (el) fx.slam(el); }, t + 40); t += 160; }
      else if (e.k === 'airdrop') { later(() => { fx.sfx('chips'); const el = q(`[data-air="${e.loc}"]`); if (el) fx.slam(el); }, t + 40); t += 140; }
      else if (e.k === 'recruit') { later(() => { fx.sfx('gain'); const el = q('.mq-wk'); if (el) fx.pop(el, 1.15); }, t + 40); t += 120; }
      else if (e.k === 'morale') { later(() => { fx.sfx(e.d > 0 ? 'gain' : 'bad'); const el = q('.mq-tk i.on'); if (el) { fx.pop(el, 1.4); fx.float(el, (e.d > 0 ? '+' : '') + e.d, { color: e.d > 0 ? '#6fe08a' : '#ff8a7a' }); } }, t + 40); t += 160; }
      else if (e.k === 'marker' && e.hit) { later(() => fx.sfx('bad'), t + 20); }
      else if (e.k === 'turn' && e.turn > 1) { later(() => tmsg(`${e.turn}일차 — 순찰 ${e.nP}명${e.sol ? ` (군인 ${e.sol})` : ''}`), t + 30); }
      else if (e.k === 'home') { later(() => fx.sfx('tap'), t + 10); t += 60; }
      else if (e.k === 'over') { const win = e.outcome === 'win'; later(() => { fx.sfx(win ? 'win' : 'lose'); if (win) fx.burst(root, { color: ['#ffd34d', '#fff', '#8ecdf5', '#6fe08a'], n: 40, spread: 150 }); }, t + 300); t += 900; }
    }
    if (t > 0) { lock = true; later(() => { lock = false; }, Math.min(2200, t + 200)); }
    if (s && s.over && !finished) later(() => { ov = { k: 'over' }; draw(); }, t + 700);
  }

  // ----- 진행 -----
  const clone = o => JSON.parse(JSON.stringify(o));
  function after() {
    const E = s.ev.slice(); logEvents(E); save(); sel = null;
    if (s.phase === 'place') hist.length = 0;
    draw(); animate(E);
  }
  function run(m) {
    if (lock || finished || !s || s.over) return;
    if (s.phase === 'action') hist.push({ st: clone(s), nlog: logs.length }); else hist.length = 0;
    try { self.applyMove(s, m, rng); } catch (err) { if (hist.length && s.phase === 'action') hist.pop(); tmsg(String((err && err.message) || err)); return; }
    after();
  }
  function endDay() {
    if (lock || !s || s.over) return;
    ov = null; hist.push({ st: clone(s), nlog: logs.length });
    const E = [];
    while (!s.over && s.phase === 'action' && Object.values(s.occ).some(o => o.t === 'r')) {
      const ws = Object.keys(s.occ).filter(l => s.occ[l].t === 'r').sort((a, b) => (+!!pathHome(s, b)) - (+!!pathHome(s, a)));
      self.applyMove(s, { a: 'retrieve', loc: ws[0] }, rng); E.push(...s.ev);
    }
    s.ev = E; after();
  }
  function begin() {
    s = self.newGame({ players: ctx.players, options: { difficulty: opts.diff, balanced: opts.balanced }, rng });
    logs = []; hist = []; ov = null; sel = null; saveOpts(); logEvents(s.ev); const E = s.ev.slice(); save(); draw(); animate(E);
  }

  // ----- 그리기 -----
  function topBar() {
    const d = s ? D() : null, phase = s ? s.phase : 'place';
    const pill = (txt, cls) => `<span class="mq-pill ${cls}">${txt}</span>`;
    const pills = L.mode === 'port' ? pill(phase === 'place' ? '① 배치' : phase === 'action' ? '② 행동' : '끝', 'on') :
      `${pill('① 배치', phase === 'place' ? 'on' : 'dn')}${pill('② 행동', phase === 'action' ? 'on' : '')}${pill('③ 정리', '')}`;
    return `<div class="mq-top"><span style="display:flex;align-items:center;gap:8px"><span class="mq-logo mq-fd">MAQUIS</span></span><span class="mq-sp"></span>${s ? pills : ''}<span class="mq-sp"></span>${s ? `<span class="mq-chip">${s.turn}일차 <small style="font-weight:400;color:#b9ad86">/ ${d.loop ? '15+' : (d.endAt || 15)}</small></span>${L.mode === 'port' ? '' : `<span class="mq-chip" style="background:rgba(166,35,43,.3);border-color:#c2635f">${d.ko}</span>`}` : ''}<button class="mq-ib" data-do="ov:rules" aria-label="규칙">?</button><button class="mq-ib" data-do="ov:opts" aria-label="옵션">⚙</button></div>`;
  }
  function draw() {
    if (dead) return;
    L = layout(); root.dataset.mode = L.mode; root.style.setProperty('--sc', L.sc);
    let h = `<div class="mq-stage" style="left:${L.ox}px;top:${L.oy}px;width:${L.W}px;height:${L.H}px;transform:scale(${L.sc})">${topBar()}`;
    if (s) {
      if (L.mode === 'wide') {
        h += `<div class="mq-goals">${goalsP()}${progP()}</div>${boardHTML()}
          <div class="mq-strip"><div class="mq-pan" data-skin="panel">${resP()}</div><div class="mq-pan" data-skin="panel">${workP()}</div><div class="mq-pan mq-tilepan" data-skin="panel">${tilesP()}</div><div class="mq-acts">${actsP()}</div></div>
          <div class="mq-side"><div class="mq-pan" data-skin="panel">${tracks()}</div><div class="mq-pan" data-skin="panel">${patrolP()}</div><div class="mq-pan mq-log-pan" data-skin="panel">${logP()}</div></div>`;
      } else {
        const hudStyle = L.mode === 'land' ? `left:${L.bx + L.bw + 6}px;right:4px` : `top:${L.by + L.bh + 6}px;bottom:4px`;
        const abtn = L.mode === 'land' ? 38 : 48;
        h += `${boardHTML()}<div class="mq-hud" style="${hudStyle}"><div class="mq-pan" data-skin="panel">${tracks()}</div><div class="mq-pan" data-skin="panel">${resP()}${workP().replace('<h5>', '<h5 style="margin-top:4px">')}</div>${L.mode === 'land' ? '' : ''}${qk()}<div style="display:grid;grid-template-columns:1.5fr 1fr 1fr;gap:5px;height:${abtn}px;flex:none">${actsP()}</div>${L.mode === 'port' ? `<div class="mq-pan mq-log-pan" data-skin="panel">${logP()}</div>` : ''}</div>`;
      }
      h += popHTML();
    }
    if (toastMsg) h += `<div class="mq-toast">${esc(toastMsg)}</div>`;
    h += `${ovHTML()}</div>`;
    view.innerHTML = h;
  }

  // ----- 입력 -----
  const onClick = e => {
    if (dead) return;
    const t = e.target.closest('[data-do],[data-loc]');
    if (!t) { if (sel) { sel = null; draw(); } return; }
    if (t.dataset.loc) { if (lock || !s || ov) return; fx.sfx('tap'); fx.buzz(8); sel = sel === t.dataset.loc ? null : t.dataset.loc; draw(); return; }
    const [a, x, y] = t.dataset.do.split(':');
    if (a === 'noop' || a === '') return;
    fx.sfx('tap'); fx.buzz(8);
    if (a === 'diff') { opts.diff = x; saveOpts(); return draw(); }
    if (a === 'start') return begin();
    if (a === 'ov') { ov = { k: x }; sel = null; return draw(); }
    if (a === 'closeov') { ov = null; return draw(); }
    if (a === 'close') { sel = null; return draw(); }
    if (a === 'goal') { ov = { k: 'goal', id: x }; return draw(); }
    if (a === 'res') { ov = { k: 'res', id: x }; return draw(); }
    if (a === 'tile') { ov = { k: 'tile', id: x }; return draw(); }
    if (a === 'place') return run({ a: 'place', loc: x });
    if (a === 'act') return run({ a: 'act', loc: x, o: y });
    if (a === 'shoot') return run({ a: 'shoot', loc: x, src: y });
    if (a === 'retrieve') return run({ a: 'retrieve', loc: x });
    if (a === 'endday') { const n = Object.keys(s.occ).filter(l => s.occ[l].t === 'r' && !pathHome(s, l)).length; if (n && opts.warn) { ov = { k: 'confirm', n }; return draw(); } return endDay(); }
    if (a === 'endday!') return endDay();
    if (a === 'shoothint') return tmsg('막고 있는 경찰 말을 눌러서 사살해요 (무기 1개)');
    if (a === 'undo') { const hh = hist.pop(); if (!hh) return; s = hh.st; logs.length = hh.nlog; sel = null; save(); return draw(); }
    if (a === 'finish') { if (finished) return; finished = true; return ctx.finish(self.result(s)); }
  };
  const onChange = e => { const k = e.target && e.target.dataset && e.target.dataset.opt; if (!k) return; opts[k] = !!e.target.checked; saveOpts(); if (k !== 'balanced') draw(); };
  const onKey = e => { if (e.key === 'Escape') { if (ov && ov.k !== 'setup' && ov.k !== 'over') ov = null; else sel = null; draw(); } };
  let rt = 0; const onResize = () => { clearTimeout(rt); rt = setTimeout(() => { if (!dead) draw(); }, 80); };
  root.addEventListener('click', onClick); root.addEventListener('change', onChange);
  document.addEventListener('keydown', onKey); window.addEventListener('resize', onResize);
  root._mq = { get s() { return s; }, run, draw, endDay, begin, get ov() { return ov; }, set sel(v) { sel = v; draw(); } };
  draw();
  if (s && s.over && !finished) { ov = { k: 'over' }; draw(); }
  return { destroy() { dead = true; clearTimeout(rt); timers.forEach(clearTimeout); timers.clear(); window.removeEventListener('resize', onResize); document.removeEventListener('keydown', onKey); container.querySelectorAll('.fx-layer').forEach(e => e.remove()); root.remove(); } };
}

// ---------- 모듈 ----------
export default {
  meta: { id: 'maquis', name: '마키 (Maquis)', version: '1.0.0', players: { min: 1, max: 1 }, minutes: 25, campaign: null, autosave: { schema: 1 } },
  newGame({ rng, options }) { return newState(rng, { difficulty: options && options.difficulty, balanced: !!(options && options.balanced) }); },
  currentSeat: () => 0,
  isOver: s => s.over,
  legalMoves, applyMove, botChoose, result,
  mount(container, ctx) { return mountMQ(this, container, ctx); }
};
export const _internal = { newState, optionsAt, pathHome, evalGoals, supplyOf, patrolCount, needsOf };
