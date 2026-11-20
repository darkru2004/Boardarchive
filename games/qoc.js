// Quests Over Coffee — 1인용 주사위 퀘스트 게임 (원작: Alexander Shen, 비공식 개인용 이식)
// 팩: base(기본) · sci(03 Science Shmience, 환경 9장 포함) · nc(01 Night Carnival)
// 구조: 데이터(카드) → 엔진(규칙·봇) → 화면(mount). 규칙은 엔진 전담, 무작위는 전달받은 rng만 쓴다.

// ===================================================================== 데이터
export const PACKS = {
  base: { id: 'base', name: '기본', en: 'Base', n: 20 },
  sci: { id: 'sci', name: '03 사이언스 시미언스', en: 'Science Shmience', n: 28 },
  nc: { id: 'nc', name: '01 나이트 카니발', en: 'Night Carnival', n: 9 }
};
export const PACK_ORDER = ['base', 'sci', 'nc'];

// 효과 문자열: 'h-2 m+1 i+1' (h체력 l행운 m돈 i아이템, +얻기 -잃기), 'none', 'void'(이 퀘스트를 완전히 버림, 선택)
const parseOps = str => (str === 'none' ? [] : str.split(' ').filter(Boolean).map(tok => {
  if (tok === 'void') return { t: 'void' };
  const m = /^([hlmi])([+-])(\d+)$/.exec(tok); if (!m) throw new Error('효과 형식 오류: ' + tok);
  return { t: m[1], v: (m[2] === '-' ? -1 : 1) * +m[3] };
}));
const parseCond = str => {
  if (str === 'PAIR') return { t: 'pair' };
  if (str === 'STRAIGHT') return { t: 'straight' };
  let m = /^(HEALTH|LUCK|MONEY)([<>=])(\d+)$/.exec(str);
  if (m) return { t: 'stat', k: { HEALTH: 'h', LUCK: 'l', MONEY: 'm' }[m[1]], op: m[2], v: +m[3] };
  m = /^[1-6](,[1-6])*$/.exec(str); if (m) return { t: 'dice', d: str.split(',').map(Number) };
  throw new Error('특수조건 형식 오류: ' + str);
};
const ev = str => { const [v, ops] = str.split('|'); return { v: +v, ops: parseOps(ops) }; };
const Q = (id, pack, ko, stars, img, fail, win, sp) => {
  const [c, ops] = sp.split('|'); return { id, pack, ko, stars, img, f: ev(fail), w: ev(win), x: { c: parseCond(c.replace(/^\[|\]$/g, '')), ops: parseOps(ops) } };
};

export const QUESTS = [
  // ---- 기본 ----
  Q('b01', 'base', '나무 위의 고양이', 1, 1, '8|l-1', '11|l+1', '[1,1,1]|h-1'),
  Q('b02', 'base', '카지노, 한 판 더!', 1, 2, '10|m-1 h-1', '14|m+1', '[PAIR]|m+1'),
  Q('b03', 'base', '여기에 보물이?', 2, 3, '9|h-2', '12|i+1', '[PAIR]|m+1'),
  Q('b04', 'base', '맛있어 보이는 버섯', 2, 4, '6|h-2', '10|h+1', '[STRAIGHT]|l+1'),
  Q('b05', 'base', '붐비는 거리', 2, 5, '4|h-1', '8|l+1', '[PAIR]|m+1'),
  Q('b06', 'base', '오크가 여기에?!', 3, 6, '10|h-3', '13|i+1', '[STRAIGHT]|m+2'),
  Q('b07', 'base', '이거 정말 당신 차 맞아요?', 2, 7, '9|l-1', '12|l+1', '[2,3,4]|m+2'),
  Q('b08', 'base', '선제공격 없이 습격!', 2, 8, '10|h-1', '12|i+1 m+1', '[PAIR]|m+1'),
  Q('b09', 'base', '사악한 아이스크림?!', 3, 9, '10|h-1', '14|l+2', '[2]|m+3'),
  Q('b10', 'base', '내가 지켜줄게!', 3, 10, '9|h-2', '12|none', '[6]|l+2'),
  // ---- 03 Science Shmience ----
  Q('s02', 'sci', '진짜로 터지는 화산!', 1, 1, '7|l+1', '11|l+2', '[3,4]|m-1'),
  Q('s03', 'sci', '됐거든요! (No Thanks)', 3, 2, '10|h-2', '15|l+2 m+2', '[5,5]|l+1'),
  Q('s04', 'sci', '짝퉁 로봇 공장', 2, 3, '8|m-2', '13|m+2', '[PAIR]|l-1'),
  Q('s05', 'sci', '도망쳐!', 3, 4, '4|h-3', '16|l+2', '[LUCK>3]|h+2'),
  Q('s06', 'sci', '실수가 있었어요!', 2, 5, '9|h-1', '12|i+1 l+1', '[PAIR]|h-1'),
  Q('s07', 'sci', '건전지가 더 필요해!', 2, 6, '6|h-1 i-1', '13|m+1', '[HEALTH<3]|l+2'),
  Q('s08', 'sci', '작동하나요?', 1, 7, '5|m-1', '10|h+2', '[PAIR]|h+1'),
  Q('s09', 'sci', '마술사 마이클', 1, 8, '6|m-1', '11|h+1', '[STRAIGHT]|l+1'),
  Q('s10', 'sci', '슈우웅!', 2, 9, '5|l-1', '13|l+2', '[STRAIGHT]|m+3'),
  Q('s11', 'sci', '살아있다! 살아있어!', 2, 10, '3|h-2', '13|h+2 l+1', '[3,6]|m+2'),
  Q('s12', 'sci', '표 두 장 주세요', 3, 11, '9|h-2', '16|l-1', '[MONEY<2]|void'),
  // ---- 01 Night Carnival ----
  Q('n01', 'nc', '후회막심 롤러코스터', 3, 1, '11|h-2', '12|l+1', '[1,2,5]|m-1'),
  Q('n02', 'nc', '수상한 공 던지기', 2, 2, '12|m-2', '13|i+1', '[STRAIGHT]|i+1'),
  Q('n03', 'nc', '점쟁이의 수정구슬', 2, 3, '8|l-1 m-1', '12|l+2', '[3,5]|h+1'),
  Q('n04', 'nc', '상호 존중의 터널', 2, 4, '6|l-1', '10|h+1 l+1', '[PAIR]|l+1'),
  Q('n05', 'nc', '호객꾼', 1, 5, '5|m-2', '7|m-1', '[STRAIGHT]|m+1')
];

// 아이템: img = 팩 이미지 그룹 안 번호. fx = 엔진이 아는 동작 이름.
export const ITEMS = [
  { id: 'b-pizza', pack: 'base', ko: '고급 피자', img: 11, fx: 'ops', ops: parseOps('h+1'), heal: true, desc: '버리고 체력 +1.' },
  { id: 'b-spy', pack: 'base', ko: '마법의 망원경', img: 12, fx: 'plus2', when: 'roll', desc: '버리고 굴린 합계에 +2.' },
  { id: 'b-robo', pack: 'base', ko: '로보 파이터', img: 13, fx: 'robo', when: 'roll', desc: '버리고 이번 퀘스트에서만 주사위 1개를 더 굴림.' },
  { id: 'b-box', pack: 'base', ko: '튼튼한 상자', img: 14, fx: 'box', when: 'quest', desc: '버리고 이번 퀘스트에서 받는 피해 1을 막음.' },
  { id: 'b-cursed', pack: 'base', ko: '저주받은 트레이딩 카드', img: 15, fx: 'ops', ops: parseOps('m+2 h-1'), desc: '버리고 돈 +2, 체력 −1.' },
  { id: 'b-potion', pack: 'base', ko: '냄새나는 물약', img: 16, fx: 'ops', ops: parseOps('h+1 l+1'), heal: true, desc: '버리고 체력 +1, 행운 +1.' },
  { id: 's-badge', pack: 'sci', ko: '쓰던 별 3개 배지', img: 12, fx: 'passive', desc: '가지고 있는 동안, 별 2개 퀘스트에서 주사위를 사는 돈이 1 줄어듦.' },
  { id: 's-medkit', pack: 'sci', ko: '수상한 구급상자', img: 13, fx: 'd6heal', lo: 1, hi: 2, heal: true, desc: '버리고 d6: 1~3이면 체력 +1, 4~6이면 체력 +2.' },
  { id: 's-chem', pack: 'sci', ko: '화학 실험 세트', img: 14, fx: 'd6heal', lo: -1, hi: 3, heal: true, desc: '버리고 d6: 1~3이면 체력 −1, 4~6이면 체력 +3.' },
  { id: 's-multi', pack: 'sci', ko: '멀티 티켓', img: 15, fx: 'reroll', when: 'roll', desc: '버리고 원하는 개수의 주사위를 한 번 다시 굴림(행운 소모 없음).' },
  { id: 's-hike', pack: 'sci', ko: '하이크퍼슨', img: 16, fx: 'passive', endVP: 2, desc: '게임이 끝날 때 가지고 있으면 2점.' },
  { id: 's-darling', pack: 'sci', ko: '달링', img: 17, fx: 'passive', endHP: -1, desc: '게임이 끝날 때 가지고 있으면 체력 −1.' },
  { id: 'n-plush', pack: 'nc', ko: '무허가 인형', img: 6, fx: 'passive', endVP: 2, desc: '게임이 끝날 때 가지고 있으면 2점.' },
  { id: 'n-ticket', pack: 'nc', ko: '경품 티켓 10장', img: 7, fx: 'passive', endVP: 1, desc: '게임이 끝날 때 가지고 있으면 1점.' },
  { id: 'n-hammer', pack: 'nc', ko: '미드웨이 망치', img: 8, fx: 'set6', when: 'roll', cost: parseOps('l-1'), desc: '버리고 행운 −1, 주사위 1개를 6으로 바꿈.' },
  { id: 'n-fried', pack: 'nc', ko: '꼬치 튀김(정체불명)', img: 9, fx: 'set6', when: 'roll', cost: parseOps('h-2'), desc: '버리고 체력 −2, 주사위 1개를 6으로 바꿈.' }
];

// 환경 카드(선택 규칙) — 03 팩에 9장
export const ENVS = [
  { id: 'e-night', pack: 'sci', ko: '춥고 으스스한 밤', img: 20, desc: '행운 2를 버리고 주사위 1개를 원하는 눈으로 바꿀 수 있음.' },
  { id: 'e-band', pack: 'sci', ko: '인기 밴드가 마을에 왔다', img: 21, desc: '별 3개 퀘스트에서 주사위를 사는 돈이 1 줄어듦.' },
  { id: 'e-hot', pack: 'sci', ko: '이야, 엄청 덥네', img: 22, desc: '별 1개 퀘스트의 기본 굴림이 2d6이 됨.' },
  { id: 'e-chilly', pack: 'sci', ko: '좀 쌀쌀한 것 같은데…', img: 23, desc: '행운 1을 버리고 주사위 1개의 눈을 ±1. 퀘스트당 1번.' },
  { id: 'e-fancy', pack: 'sci', ko: '고급 동네', img: 24, desc: '상점의 모든 아이템 가격 +1.' },
  { id: 'e-rain', pack: 'sci', ko: '비야, 저리 가라!', img: 25, desc: '6이 나온 주사위를 1, 2, 3 중 하나로 바꿀 수 있음.' },
  { id: 'e-loss', pack: 'sci', ko: '손해는 우리가, 이익은 당신이', img: 26, desc: '상점의 모든 아이템 가격 −1 (최소 1).' },
  { id: 'e-gems', pack: 'sci', ko: '보석이 사방에!', img: 27, desc: '아이템 카드 1장을 아무 때나 버리고 돈 +1.' },
  { id: 'e-frog', pack: 'sci', ko: '개구리 비가 내린다', img: 28, desc: '행운 1을 버리고 체력 +1.' }
];

// 상점 카드: tradeSlot = 교환 칸(0~2)
export const SHOPS = [
  { id: 'sh-b1', pack: 'base', img: 17, trade: null },
  { id: 'sh-b2', pack: 'base', img: 18, trade: null },
  { id: 'sh-s1', pack: 'sci', img: 18, trade: 1 },
  { id: 'sh-s2', pack: 'sci', img: 19, trade: 1 }
];
export const PLAYER_CARDS = { A: { h: 3, l: 1, m: 2, img: 19 }, B: { h: 2, l: 3, m: 3, img: 20 } };
export const LIM = { h: 5, l: 5, m: 10, items: 3 };

const BY_ID = {}; [...QUESTS, ...ITEMS, ...ENVS, ...SHOPS].forEach(c => { BY_ID[c.id] = c; });
export const card = id => BY_ID[id];
export const STAT_KO = { h: '체력', l: '행운', m: '돈', i: '아이템' };
export const opsText = ops => (ops.length ? ops.map(o => (o.t === 'void' ? '이 퀘스트를 완전히 버려도 됨' : o.t === 'i' ? `아이템 ${o.v > 0 ? '+' : '−'}${Math.abs(o.v)}${o.v > 0 ? ' 획득' : ' 잃음'}` : `${STAT_KO[o.t]} ${o.v > 0 ? '+' : '−'}${Math.abs(o.v)}`)).join(', ') : '아무 일 없음');
export const condText = c => (c.t === 'pair' ? '같은 눈 2개 (페어)' : c.t === 'straight' ? '연속된 눈 3개 (스트레이트)' : c.t === 'dice' ? `주사위에 ${c.d.join(', ')} 포함` : `${STAT_KO[c.k]} ${c.op}${c.v}`);

// ===================================================================== 엔진
const clone = o => JSON.parse(JSON.stringify(o));
export const eligible = (packs) => ({
  quests: QUESTS.filter(q => packs.includes(q.pack)),
  items: ITEMS.filter(i => packs.includes(i.pack)),
  envs: ENVS.filter(e => packs.includes(e.pack)),
  shops: SHOPS.filter(sh => packs.includes(sh.pack))
});
export function boardPossible(packs) {
  const q = eligible(packs).quests; const n = s => q.filter(x => x.stars === s).length;
  return n(1) >= 3 && n(2) >= 4 && n(3) >= 3;
}

function pickQuests(rng, packs, mode) {
  const pool = eligible(packs).quests;
  if (mode === 'board' && boardPossible(packs)) {
    const take = (st, k) => rng.shuffle(pool.filter(q => q.stars === st)).slice(0, k);
    return rng.shuffle([...take(1, 3), ...take(2, 4), ...take(3, 3)]).map(q => q.id);
  }
  return rng.shuffle(pool).slice(0, 10).map(q => q.id);
}

export function newState(rng, { packs = ['base'], mode = 'std', env = false, side = 'A' } = {}) {
  packs = PACK_ORDER.filter(p => p === 'base' || packs.includes(p));
  const E = eligible(packs);
  if (mode === 'board' && !boardPossible(packs)) mode = 'std';
  const qs = pickQuests(rng, packs, mode);
  const pc = PLAYER_CARDS[side === 'B' ? 'B' : 'A'];
  const s = {
    v: 1, over: false, why: null, dead: false, mode, env: !!env && E.envs.length > 0, side: side === 'B' ? 'B' : 'A', packs,
    h: pc.h, l: pc.l, m: pc.m, imax: LIM.items, items: [],
    iDeck: rng.shuffle(E.items.map(i => i.id)),
    qAct: qs.slice(0, 5), qDeck: qs.slice(5), round: 1,
    stars: qs.reduce((a, id) => a + card(id).stars, 0),
    kept: [], failed: [], voided: [], resolved: 0,
    envDeck: [], envCur: null, shop: null,
    q: null, opq: [], pend: null, phase: 'init', ev: [], log: [], moves: 0, rolls: 0
  };
  if (s.env) { s.envDeck = rng.shuffle(E.envs.map(e => e.id)); s.envCur = s.envDeck.shift(); }
  // 시작 아이템: 2장을 뽑아 1장을 고르고 나머지는 덱 맨 아래로
  const a = s.iDeck.shift(), b = s.iDeck.shift();
  s.pend = { k: 'keep', ids: [a, b].filter(Boolean) };
  if (s.pend.ids.length < 2) { if (a) s.items.push(a); s.pend = null; s.phase = 'pick'; }
  log(s, `새 게임 — 퀘스트 ${qs.length}장 · ${mode === 'board' ? '퀘스트 보드(별 3·4·3)' : '표준'}`);
  return s;
}

function log(s, t) { s.log.push(t); if (s.log.length > 60) s.log.shift(); }
const E_ = (s, o) => { s.ev.push(o); };
const held = (s, id) => s.items.includes(id);
const maxOf = (s, k) => (k === 'h' ? LIM.h : k === 'l' ? LIM.l : LIM.m);
const rollDie = rng => rng.int(6) + 1;
const sumDice = q => q.dice.reduce((a, d) => a + d.v, 0) + q.bonus;

export function helpCost(s, st) {
  let c = st;
  if (st === 2 && held(s, 's-badge')) c -= 1;
  if (st === 3 && s.envCur === 'e-band') c -= 1;
  return Math.max(1, c);
}
export const baseDice = (s, q) => (q.stars === 1 && s.envCur === 'e-hot' ? 2 : 3);
export function shopCost(s, d) {
  let c = d;
  if (s.envCur === 'e-fancy') c += 1;
  if (s.envCur === 'e-loss') c = Math.max(1, c - 1);
  return c;
}

export function dicesOf(s) { return s.q ? s.q.dice.map(d => d.v) : []; }
export function straightOf(vals) { const u = [...new Set(vals)].sort((a, b) => a - b); let run = 1, best = 1; for (let i = 1; i < u.length; i++) { run = u[i] === u[i - 1] + 1 ? run + 1 : 1; if (run > best) best = run; } return best >= 3; }
export function pairOf(vals) { const c = {}; for (const v of vals) { c[v] = (c[v] || 0) + 1; if (c[v] >= 2) return true; } return false; }
export function condMet(s, c, vals) {
  if (c.t === 'pair') return pairOf(vals);
  if (c.t === 'straight') return straightOf(vals);
  if (c.t === 'dice') { const have = {}; vals.forEach(v => { have[v] = (have[v] || 0) + 1; }); const need = {}; c.d.forEach(v => { need[v] = (need[v] || 0) + 1; }); return Object.keys(need).every(k => (have[k] || 0) >= need[k]); }
  const cur = s[c.k]; return c.op === '<' ? cur < c.v : c.op === '>' ? cur > c.v : cur === c.v;
}
export function outcomeOf(s) {
  const q = card(s.q.id), t = sumDice(s.q);
  return { total: t, res: t <= q.f.v ? 'fail' : t >= q.w.v ? 'win' : 'aband', special: condMet(s, q.x.c, dicesOf(s)) };
}

// ---- 효과 실행 큐 ----
function die(s, why) { s.over = true; s.dead = true; s.why = why || '체력이 바닥났어요'; s.phase = 'over'; s.pend = null; s.opq = []; log(s, '체력이 0이 되어 쓰러졌습니다 (점수 0)'); E_(s, { t: 'dead' }); }
function dmgOptions(s, amt) {
  const o = [];
  s.items.forEach((id, i) => {
    const it = card(id);
    if (it.fx === 'box' && s.q && !s.q.shield) o.push(i);
    else if (it.heal && s.h - amt <= 0) o.push(i);
  });
  return o;
}
function gainItem(s, rng) {
  if (!s.iDeck.length) { log(s, '아이템 덱이 비어 있어요'); return; }
  const id = s.iDeck.shift();
  E_(s, { t: 'item+', id });
  if (s.items.length < s.imax) { s.items.push(id); log(s, `아이템 획득: ${card(id).ko}`); } else { s.pend = { k: 'over', id }; }
}
function applyOp(s, o, rng) {
  if (o.t === 'void') { s.pend = { k: 'void' }; return; }
  if (o.t === 'i') {
    if (o.v > 0) { if (o.v > 1) s.opq.unshift({ t: 'i', v: o.v - 1 }); gainItem(s, rng); return; }
    if (!s.items.length) return;
    if (s.items.length === 1) { const id = s.items.shift(); s.iDeck.push(id); log(s, `아이템을 잃음: ${card(id).ko}`); E_(s, { t: 'item-', id }); return; }
    s.pend = { k: 'lose' }; return;
  }
  if (o.v > 0) {
    const before = s[o.t]; s[o.t] = Math.min(maxOf(s, o.t), s[o.t] + o.v);
    E_(s, { t: o.t, v: s[o.t] - before, over: before + o.v > maxOf(s, o.t) }); if (s[o.t] > before) log(s, `${STAT_KO[o.t]} +${s[o.t] - before}`);
    return;
  }
  const amt = -o.v;
  if (o.t === 'h') {
    let a = amt;
    if (s.q && s.q.shield > 0 && a > 0) { s.q.shield = 0; a -= 1; log(s, '튼튼한 상자가 피해 1을 막았어요'); E_(s, { t: 'shield' }); }
    if (a <= 0) return;
    if (dmgOptions(s, a).length) { s.pend = { k: 'dmg', amt: a }; return; }
    hurt(s, a); return;
  }
  const before = s[o.t]; s[o.t] = Math.max(0, s[o.t] - amt);
  if (s[o.t] < before) { E_(s, { t: o.t, v: s[o.t] - before }); log(s, `${STAT_KO[o.t]} −${before - s[o.t]}`); }
}
function hurt(s, a) {
  const before = s.h; s.h = Math.max(0, s.h - a);
  E_(s, { t: 'h', v: s.h - before }); log(s, `체력 −${before - s.h}`);
  if (s.h <= 0) die(s);
}
export function pushOps(s, ops) { for (const o of ops) s.opq.push({ ...o }); }
export function runOps(s, rng) {
  while (!s.pend && !s.over && s.opq.length) applyOp(s, s.opq.shift(), rng);
  if (!s.pend && !s.over && !s.opq.length) settle(s, rng);
}
function settle(s, rng) {
  if (s.q && s.q.stage === 'events') finalizeQuest(s, rng);
}
function finalizeQuest(s, rng) {
  const q = card(s.q.id), r = s.q.res;
  s.qAct = s.qAct.filter(id => id !== q.id); s.resolved++;
  if (s.q.voided) { s.voided.push(q.id); log(s, `「${q.ko}」를 완전히 버렸어요`); }
  else if (r === 'win') { s.kept.push(q.id); log(s, `「${q.ko}」 성공 — 별 ${q.stars}개 획득`); }
  else if (r === 'fail') { s.failed.push(q.id); log(s, `「${q.ko}」 실패 (−1점)`); }
  else log(s, `「${q.ko}」 포기 (점수 없음)`);
  s.q = null;
  if (s.qAct.length === 0) {
    if (s.round === 1 && s.qDeck.length) { s.phase = 'shop'; setupShop(s, rng); } else s.phase = 'end';
  } else s.phase = 'pick';
}

// ---- 상점 ----
function setupShop(s, rng) {
  const E = eligible(s.packs);
  const sh = rng.pick(E.shops);
  s.iDeck = rng.shuffle(s.iDeck);
  const costs = [rollDie(rng), rollDie(rng), rollDie(rng)];
  const items = s.iDeck.splice(0, 3);
  s.shop = { card: sh.id, costs, items, sold: [false, false, false], envSwapped: false };
  s.phase = 'shop';
  log(s, '상점에 들렀어요');
}
function leaveShop(s, rng) {
  const rest = s.shop.items.filter((id, i) => id && !s.shop.sold[i]);
  s.iDeck = rng.shuffle([...s.iDeck, ...rest]);
  s.shop = null; s.round = 2; s.qAct = s.qDeck.splice(0, 5); s.phase = 'pick';
  log(s, '2라운드 시작');
}

// ---- 합법 수 ----
const subsets = n => { const r = []; for (let m = 1; m < (1 << n); m++) r.push(m); return r; };
function usableAnytime(s) {   // 언제든 쓸 수 있는 아이템·환경 수(대기 중인 선택이 없을 때)
  const mv = [];
  s.items.forEach((id, i) => {
    const it = card(id);
    if (it.fx === 'ops') mv.push({ a: 'item', i });
    else if (it.fx === 'd6heal') mv.push({ a: 'item', i });
    else if (it.fx === 'box' && s.q && !s.q.shield && s.phase === 'roll') mv.push({ a: 'item', i });
  });
  if (s.envCur === 'e-gems') s.items.forEach((id, i) => mv.push({ a: 'env', e: 'gem', i }));
  if (s.envCur === 'e-frog' && s.l >= 1) mv.push({ a: 'env', e: 'frog' });
  return mv;
}
export function legalMoves(s) {
  if (s.over) return [];
  const p = s.pend;
  if (p) {
    if (p.k === 'keep') return p.ids.map(id => ({ a: 'keep', id }));
    if (p.k === 'over') return [...s.items.map((id, i) => ({ a: 'drop', i })), { a: 'drop', i: -1 }];
    if (p.k === 'lose') return s.items.map((id, i) => ({ a: 'drop', i }));
    if (p.k === 'void') return [{ a: 'void', y: true }, { a: 'void', y: false }];
    if (p.k === 'dmg') return [...dmgOptions(s, p.amt).map(i => ({ a: 'react', i })), { a: 'take' }];
  }
  if (s.phase === 'pick') return [...s.qAct.map(id => ({ a: 'pick', q: id })), ...usableAnytime(s).filter(m => !(m.a === 'item' && card(s.items[m.i]).fx === 'box'))];
  if (s.phase === 'roll') {
    const q = s.q, mv = [{ a: 'done' }];
    const n = q.dice.length;
    if (s.l >= 1) subsets(n).forEach(m => mv.push({ a: 'reroll', m }));
    const st = card(q.id).stars, cost = helpCost(s, st);
    if (q.help < 3 && s.m >= cost) mv.push({ a: 'help' });
    s.items.forEach((id, i) => {
      const it = card(id);
      if (it.fx === 'plus2' || it.fx === 'robo') mv.push({ a: 'item', i });
      else if (it.fx === 'reroll') subsets(n).forEach(m => mv.push({ a: 'item', i, m }));
      else if (it.fx === 'set6') q.dice.forEach((d, di) => { if (d.v !== 6) mv.push({ a: 'item', i, d: di }); });
    });
    q.dice.forEach((d, di) => {
      if (s.envCur === 'e-night' && s.l >= 2) for (let v = 1; v <= 6; v++) if (v !== d.v) mv.push({ a: 'env', e: 'set', d: di, v });
      if (s.envCur === 'e-chilly' && s.l >= 1 && !q.chilly) { if (d.v < 6) mv.push({ a: 'env', e: 'nudge', d: di, v: d.v + 1 }); if (d.v > 1) mv.push({ a: 'env', e: 'nudge', d: di, v: d.v - 1 }); }
      if (s.envCur === 'e-rain' && d.v === 6) [1, 2, 3].forEach(v => mv.push({ a: 'env', e: 'rain', d: di, v }));
    });
    return [...mv, ...usableAnytime(s)];
  }
  if (s.phase === 'shop') {
    const sh = s.shop, shopC = card(sh.card), mv = [{ a: 'leave' }];
    sh.items.forEach((id, k) => {
      if (!id || sh.sold[k]) return;
      const cost = shopCost(s, sh.costs[k]);
      if (s.m >= cost) { if (s.items.length < s.imax) mv.push({ a: 'buy', k }); else s.items.forEach((x, i) => mv.push({ a: 'buy', k, drop: i })); }
      if (shopC.trade === k) s.items.forEach((x, i) => mv.push({ a: 'trade', k, i }));
    });
    if (s.env && !sh.envSwapped && s.envDeck.length) mv.push({ a: 'envswap' });
    return [...mv, ...usableAnytime(s)];
  }
  if (s.phase === 'end') return [{ a: 'finish' }, ...usableAnytime(s)];
  return [];
}

function discardItem(s, idx) { const id = s.items.splice(idx, 1)[0]; s.iDeck.push(id); return id; }
function useItem(s, m, rng) {
  const id = s.items[m.i], it = card(id);
  switch (it.fx) {
    case 'ops': discardItem(s, m.i); log(s, `${it.ko} 사용`); pushOps(s, it.ops); break;
    case 'd6heal': { discardItem(s, m.i); const r = rollDie(rng); const v = r <= 3 ? it.lo : it.hi; log(s, `${it.ko}: d6=${r}`); E_(s, { t: 'd6', v: r }); pushOps(s, [{ t: 'h', v }]); break; }
    case 'plus2': discardItem(s, m.i); s.q.bonus += 2; log(s, '망원경: 합계 +2'); E_(s, { t: 'bonus' }); break;
    case 'robo': discardItem(s, m.i); { const v = rollDie(rng); s.q.dice.push({ v, k: 'item' }); E_(s, { t: 'die+', i: s.q.dice.length - 1 }); log(s, `로보 파이터: 주사위 +1 (${v})`); } break;
    case 'box': discardItem(s, m.i); s.q.shield = 1; log(s, '튼튼한 상자 준비 — 이번 퀘스트 피해 1 방어'); E_(s, { t: 'shield' }); break;
    case 'reroll': { discardItem(s, m.i); rerollMask(s, m.m, rng); log(s, '멀티 티켓: 다시 굴림'); break; }
    case 'set6': { discardItem(s, m.i); s.q.dice[m.d].v = 6; E_(s, { t: 'dieset', i: m.d }); log(s, `${it.ko}: 주사위를 6으로`); pushOps(s, it.cost); break; }
    default: throw new Error('못 쓰는 아이템');
  }
}
function rerollMask(s, mask, rng) {
  const idx = []; s.q.dice.forEach((d, i) => { if (mask & (1 << i)) { d.v = rollDie(rng); idx.push(i); } });
  E_(s, { t: 'reroll', idx });
}

export function applyMove(s, m, rng) {
  if (s.over) throw new Error('이미 끝난 게임');
  const legal = legalMoves(s);
  if (!legal.some(x => JSON.stringify(x) === JSON.stringify(m))) throw new Error('불법 수: ' + JSON.stringify(m));
  s.ev = []; s.moves++;
  if (s.moves > 4000) { s.over = true; s.why = '수가 너무 많아 종료'; s.phase = 'over'; return s; }
  const p = s.pend;
  switch (m.a) {
    case 'keep': { s.pend = null; const other = p.ids.find(x => x !== m.id); s.items.push(m.id); if (other) s.iDeck.push(other); s.phase = 'pick'; log(s, `시작 아이템: ${card(m.id).ko}`); E_(s, { t: 'item+', id: m.id }); break; }
    case 'drop': { s.pend = null; if (p.k === 'over') { if (m.i === -1) { s.iDeck.push(p.id); log(s, `${card(p.id).ko}를 포기`); } else { const old = discardItem(s, m.i); s.items.push(p.id); log(s, `${card(old).ko}를 버리고 ${card(p.id).ko} 획득`); } } else { const old = discardItem(s, m.i); log(s, `아이템을 잃음: ${card(old).ko}`); E_(s, { t: 'item-', id: old }); } break; }
    case 'void': { s.pend = null; if (m.y) s.q.voided = true; break; }
    case 'react': { s.pend = null; const rest = s.opq; s.opq = []; useItem(s, { a: 'item', i: m.i }, rng); s.opq.push({ t: 'h', v: -p.amt }, ...rest); break; }
    case 'take': { s.pend = null; hurt(s, p.amt); break; }
    case 'pick': {
      const q = card(m.q); const n = baseDice(s, q);
      s.q = { id: q.id, dice: [], bonus: 0, help: 0, shield: 0, chilly: false, stage: 'roll', res: null, voided: false };
      for (let i = 0; i < n; i++) s.q.dice.push({ v: rollDie(rng), k: 'base' });
      s.rolls++; s.phase = 'roll'; E_(s, { t: 'roll', n });
      log(s, `「${q.ko}」 도전 — ${s.q.dice.map(d => d.v).join(' ')}`);
      break;
    }
    case 'reroll': { s.l -= 1; E_(s, { t: 'l', v: -1 }); rerollMask(s, m.m, rng); log(s, `행운 재굴림 → ${s.q.dice.map(d => d.v).join(' ')}`); break; }
    case 'help': { const st = card(s.q.id).stars, c = helpCost(s, st); s.m -= c; E_(s, { t: 'm', v: -c }); s.q.help++; const v = rollDie(rng); s.q.dice.push({ v, k: 'help' }); E_(s, { t: 'die+', i: s.q.dice.length - 1 }); log(s, `도움 요청(돈 −${c}): 주사위 +1 (${v})`); break; }
    case 'item': useItem(s, m, rng); break;
    case 'env': {
      if (m.e === 'set') { s.l -= 2; E_(s, { t: 'l', v: -2 }); s.q.dice[m.d].v = m.v; E_(s, { t: 'dieset', i: m.d }); }
      else if (m.e === 'nudge') { s.l -= 1; E_(s, { t: 'l', v: -1 }); s.q.chilly = true; s.q.dice[m.d].v = m.v; E_(s, { t: 'dieset', i: m.d }); }
      else if (m.e === 'rain') { s.q.dice[m.d].v = m.v; E_(s, { t: 'dieset', i: m.d }); }
      else if (m.e === 'gem') { const id = discardItem(s, m.i); log(s, `${card(id).ko}를 버리고 돈 +1`); pushOps(s, [{ t: 'm', v: 1 }]); }
      else if (m.e === 'frog') { s.l -= 1; E_(s, { t: 'l', v: -1 }); pushOps(s, [{ t: 'h', v: 1 }]); }
      break;
    }
    case 'done': {
      const o = outcomeOf(s), q = card(s.q.id);
      s.q.res = o.res; s.q.stage = 'events'; E_(s, { t: 'resolve', res: o.res, special: o.special, total: o.total });
      log(s, `합계 ${o.total} → ${o.res === 'win' ? '성공' : o.res === 'fail' ? '실패' : '포기'}${o.special ? ' + 특수조건!' : ''}`);
      const ops = [...(o.res === 'fail' ? q.f.ops : o.res === 'win' ? q.w.ops : []), ...(o.special ? q.x.ops : [])];
      pushOps(s, ops); break;
    }
    case 'buy': {
      const sh = s.shop, cost = shopCost(s, sh.costs[m.k]); s.m -= cost; E_(s, { t: 'm', v: -cost });
      const id = sh.items[m.k]; sh.sold[m.k] = true;
      if (m.drop != null) { const old = discardItem(s, m.drop); log(s, `${card(old).ko}를 버림`); }
      s.items.push(id); log(s, `구매: ${card(id).ko} (돈 −${cost})`); E_(s, { t: 'item+', id }); break;
    }
    case 'trade': { const sh = s.shop, id = sh.items[m.k]; sh.sold[m.k] = true; const old = s.items[m.i]; s.items[m.i] = id; s.iDeck.push(old); log(s, `교환: ${card(old).ko} → ${card(id).ko}`); E_(s, { t: 'item+', id }); break; }
    case 'envswap': { s.shop.envSwapped = true; const old = s.envCur; s.envCur = s.envDeck.shift(); s.envDeck.push(old); log(s, `환경 교체: ${card(s.envCur).ko}`); break; }
    case 'leave': leaveShop(s, rng); break;
    case 'finish': finishGame(s); break;
    default: throw new Error('모르는 수');
  }
  if (!s.over) runOps(s, rng);
  return s;
}

// ---- 점수 ----
export function gradeOf(s, vp) {
  if (s.mode === 'board') {
    const t = [[20, '완벽한 한 잔!'], [18, '진하고 대담한 맛이에요!'], [16, '괜찮고 좋은 한 잔'], [14, '주유소 커피'], [-99, '커피가 식었어요… 일부러 그런 건 아니에요']];
    const i = t.findIndex(x => vp >= x[0]); return { tier: i, text: t[i][1] };
  }
  const d = s.stars - vp;
  const i = d <= 0 ? 0 : d <= 5 ? 1 : d <= 10 ? 2 : 3;
  return { tier: i, text: ['환상적이에요! 완벽한 모험가!', '잘했어요! 스스로 뿌듯해해도 돼요', '조금 아쉽지만 괜찮아요. 냉장고에 붙여둘 만해요', '내일도 열어요! 일찍 와서 공짜 커피 한 잔 하세요'][i] };
}
export function scoreOf(s) {
  const stars = s.kept.reduce((a, id) => a + card(id).stars, 0), pen = s.failed.length;
  let vp = stars - pen; const endvp = s.items.reduce((a, id) => a + (card(id).endVP || 0), 0);
  return { stars, pen, endvp, vp: vp + endvp };
}
function finishGame(s) {
  for (const id of s.items) { const it = card(id); if (it.endHP) { s.h = Math.max(0, s.h + it.endHP); log(s, `${it.ko}: 체력 ${it.endHP}`); } }
  if (s.h <= 0) { die(s); return; }
  s.over = true; s.phase = 'over'; s.why = '완주';
}
export function result(s) {
  const sc = s.dead ? { stars: 0, pen: 0, endvp: 0, vp: 0 } : scoreOf(s);
  const g = s.dead ? { tier: 99, text: '쓰러졌어요' } : gradeOf(s, sc.vp);
  const won = !s.dead && (s.mode === 'board' ? sc.vp >= 16 : g.tier <= 1);
  return { coop: { won, score: sc.vp }, summary: s.dead ? `쓰러졌어요 · 0점` : `${g.text} · ${sc.vp}점${s.mode === 'board' ? '(퀘스트 보드)' : `/${s.stars}`}`,
    detail: { vp: sc.vp, stars: s.stars, board: s.mode === 'board', packs: s.packs, side: s.side, env: s.env, kept: s.kept.length, failed: s.failed.length, dead: s.dead, tier: g.tier } };
}

// ---- 봇(자동 테스트·추천용): 합법 수 안에서만 고른다 ----
const P3 = (() => { const p = {}; for (let n = 1; n <= 6; n++) { let d = { 0: 1 }; for (let i = 0; i < n; i++) { const nd = {}; for (const [k, c] of Object.entries(d)) for (let f = 1; f <= 6; f++) nd[+k + f] = (nd[+k + f] || 0) + c; d = nd; } const tot = 6 ** n; p[n] = Object.fromEntries(Object.entries(d).map(([k, c]) => [k, c / tot])); } return p; })();
export const probs = (n, fail, win, bonus = 0) => { let f = 0, w = 0; for (const [k, p] of Object.entries(P3[n])) { const t = +k + bonus; if (t <= fail) f += p; else if (t >= win) w += p; } return { fail: f, win: w, ab: 1 - f - w }; };
export function botChoose(s, traits, rng) {
  const mv = legalMoves(s); const pick = f => mv.find(f);
  const p = s.pend;
  if (p) {
    if (p.k === 'keep') return { move: mv[0], reason: 'keep' };
    if (p.k === 'void') return { move: pick(m => m.y === true) || mv[0], reason: 'void' };
    if (p.k === 'dmg') return { move: pick(m => m.a === 'react') || pick(m => m.a === 'take'), reason: 'react' };
    const dm = mv.filter(m => m.a === 'drop'); const worst = dm.find(m => m.i === -1) || dm[0]; return { move: worst, reason: 'drop' };
  }
  if (s.phase === 'pick') {
    const heal = pick(m => m.a === 'item' && card(s.items[m.i]).heal && s.h <= 2);
    if (heal) return { move: heal, reason: 'heal' };
    let best = null, bv = -1e9;
    for (const id of s.qAct) { const q = card(id), n = baseDice(s, q), pr = probs(n, q.f.v, q.w.v); const v = q.stars * pr.win - pr.fail - 0.02 * q.stars; if (v > bv) { bv = v; best = id; } }
    return { move: pick(m => m.a === 'pick' && m.q === best), reason: 'pick' };
  }
  if (s.phase === 'roll') {
    const q = s.q, c = card(q.id), o = outcomeOf(s);
    if (o.res === 'win') return { move: pick(m => m.a === 'done'), reason: 'ok' };
    const sp = pick(m => m.a === 'item' && card(s.items[m.i]).fx === 'plus2'); if (sp && o.total + 2 >= c.w.v) return { move: sp, reason: 'spy' };
    const need = o.res === 'fail' ? c.f.v + 1 - o.total : c.w.v - o.total;
    const six = mv.find(m => m.a === 'item' && m.d != null && card(s.items[m.i]).fx === 'set6'); if (six && o.total + (6 - q.dice[six.d].v) >= c.w.v) return { move: six, reason: 'six' };
    if (s.l >= 2 || (s.l >= 1 && o.res === 'fail')) {
      let mask = 0; q.dice.forEach((d, i) => { if (d.v <= 3) mask |= 1 << i; });
      if (mask) { const r = pick(m => m.a === 'reroll' && m.m === mask); if (r) return { move: r, reason: 'luck' }; }
    }
    const cost = helpCost(s, c.stars); const hp = pick(m => m.a === 'help');
    if (hp && s.m - cost >= 1 && o.res !== 'win') return { move: hp, reason: 'help' };
    const mt = pick(m => m.a === 'item' && card(s.items[m.i]).fx === 'reroll' && m.m === (1 << q.dice.length) - 1); if (mt && o.res === 'fail') return { move: mt, reason: 'ticket' };
    return { move: pick(m => m.a === 'done'), reason: 'done' };
  }
  if (s.phase === 'shop') {
    const buys = mv.filter(m => m.a === 'buy' && m.drop == null).sort((a, b) => s.shop.costs[b.k] - s.shop.costs[a.k]);
    if (buys.length && s.m >= 3) return { move: buys[0], reason: 'buy' };
    const heal = pick(m => m.a === 'item' && card(s.items[m.i]).heal && s.h <= 3); if (heal) return { move: heal, reason: 'heal' };
    return { move: pick(m => m.a === 'leave'), reason: 'leave' };
  }
  return { move: pick(m => m.a === 'finish') || mv[0], reason: 'finish' };
}

// ---------- 모듈 ----------
const self = {
  meta: { id: 'qoc', name: 'Quests Over Coffee', version: '1.0.0', players: { min: 1, max: 1 }, minutes: 15, campaign: null, autosave: { schema: 1 } },
  newGame({ rng, options }) { const o = options || {}; return newState(rng, { packs: o.packs, mode: o.mode, env: o.env, side: o.side }); },
  currentSeat: () => 0,
  isOver: s => s.over,
  legalMoves, applyMove, botChoose, result,
  mount(container, ctx) { return mountQOC(self, container, ctx); }
};
export default self;
export const _internal = { newState, runOps, pushOps, outcomeOf, helpCost, shopCost, condMet, parseOps, parseCond };

// ===================================================================== 화면 (스타일은 .g-qoc 안에서만, 접두사 qc-)
const esc = x => String(x).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ART_GROUP = { base: 'c-base', sci: 'c-sci', nc: 'c-nc' };
const PIPS = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
const dieHTML = (d, i, sel, extra = '') => `<button class="qc-die k-${d.k} ${sel ? 'sel' : ''} ${extra}" data-act="die" data-i="${i}" aria-label="주사위 ${d.v}">${[0, 1, 2, 3, 4, 5, 6, 7, 8].map(c => `<i class="${(PIPS[d.v] || []).includes(c) ? 'on' : ''}"></i>`).join('')}</button>`;
const starsTx = n => '★'.repeat(n);
const RES_KO = { win: '성공', fail: '실패', aband: '포기' };
const OPT_KEY = 'qoc_opts';
const loadOpts = () => { try { const o = JSON.parse(localStorage.getItem(OPT_KEY) || '{}'); return { packs: Array.isArray(o.packs) ? o.packs.filter(p => PACK_ORDER.includes(p)) : ['base', 'sci', 'nc'], mode: o.mode === 'board' ? 'board' : 'std', env: o.env !== false, side: o.side === 'B' ? 'B' : 'A' }; } catch (e) { return { packs: ['base', 'sci', 'nc'], mode: 'std', env: true, side: 'A' }; } };
const saveOpts = o => { try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch (e) { /* 설정 저장은 덤 */ } };

const RULES_HTML = `
<h3>한 판의 흐름</h3>
<p>퀘스트 카드 5장 중 하나를 골라 주사위 3개(3d6)를 굴립니다. 합계가 <b>실패 숫자 이하</b>면 실패 효과, <b>성공 숫자 이상</b>이면 성공 효과, 그 사이면 <b>포기</b>(아무 일도 없고 점수도 없음)입니다. 카드에 적힌 <b>특수조건</b>을 만족하면 결과와 상관없이 그 효과가 추가로 일어납니다.</p>
<p>5장을 모두 끝내면 상점에 들러 아이템을 사고 팔 수 있고, 나머지 5장으로 2라운드를 합니다.</p>
<h3>굴린 뒤에 할 수 있는 일</h3>
<ul><li><b>행운 재굴림</b>: 행운 1을 내고, 원하는 주사위 몇 개든 다시 굴림 (횟수 제한 없음).</li>
<li><b>도움 요청</b>: 돈을 내고 주사위 1개를 더 굴림. 값은 별 개수만큼, 퀘스트당 최대 3개까지.</li>
<li><b>아이템</b>: 가지고 있는 아이템을 버리고 효과를 얻음. 최대 3장까지 가질 수 있음.</li></ul>
<h3>자원과 점수</h3>
<ul><li>체력 최대 5, 행운 최대 5, 돈 최대 10. 체력이 0이 되면 쓰러지고 점수는 0점입니다.</li>
<li>점수 = 성공한 퀘스트의 별 합 − 실패한 퀘스트 수 + 끝날 때 가진 아이템의 점수.</li>
<li>체력 피해를 입기 직전에는 아이템(피자 등)을 먼저 써서 버틸 수 있습니다.</li></ul>
<h3>모드</h3>
<ul><li><b>표준</b>: 퀘스트 10장의 별 합과 내 점수의 차이로 등급을 매깁니다.</li>
<li><b>퀘스트 보드</b>: 별 1개 3장·2개 4장·3개 3장을 뽑아 20점 만점으로 겨룹니다 (16점 이상이면 클리어).</li></ul>
<p class="qc-note">이 화면은 개인용으로 만든 비공식 이식입니다. 애매한 규칙은 가장 자연스러운 쪽으로 해석했어요.</p>`;

function mountQOC(mod, container, ctx) {
  const rng = ctx.rng, th = ctx.theme || {};
  const fx = ctx.fx ? ctx.fx.scope(container) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : k === 'rect' || k === 'union' ? () => null : () => Promise.resolve()) });
  const ART = {};
  for (const p of PACK_ORDER) { const a = ctx.art ? ctx.art(ART_GROUP[p]) : []; ART[p] = Array.isArray(a) && a.length === PACKS[p].n ? a : null; }   // 장수가 맞을 때만 적용
  const artOf = c => { const a = c && ART[c.pack]; return a ? a[c.img - 1] || null : null; };
  const timers = new Set(); let dead = false;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const safe = fn => { try { fn(); } catch (e) { /* 연출이 실패해도 게임은 계속 */ } };
  let s = null, opts = loadOpts(), finished = false;
  const ui = { sheet: null, sel: [], tab: 'base' };

  container.innerHTML = `<style>${QC_CSS}</style>
  <div class="g-qoc" style="--acc:${th.accent || '#e0a53a'};--bg1:${th.table || '#4a3426'};--bg2:${th.table2 || '#2a1d15'}">
    <div class="qc-l"><div data-skin="panel" class="qc-stats"></div><div data-skin="panel" class="qc-items"></div><div data-skin="panel" class="qc-env"></div></div>
    <div class="qc-c"></div>
    <div class="qc-r"><div data-skin="panel" class="qc-score"></div><div data-skin="panel" class="qc-log"></div><div class="qc-menu"></div></div>
    <div class="qc-sheet" hidden></div><div class="qc-over" hidden></div><div class="qc-setup" hidden></div>
  </div>`;
  const root = container.querySelector('.g-qoc');
  const q = x => root.querySelector(x);
  const el = { stats: q('.qc-stats'), items: q('.qc-items'), env: q('.qc-env'), c: q('.qc-c'), score: q('.qc-score'), log: q('.qc-log'), menu: q('.qc-menu'), sheet: q('.qc-sheet'), over: q('.qc-over'), setup: q('.qc-setup') };

  // ----- 화면 크기: PC는 1280×720 기준으로 배율, 폰은 390 기준 -----
  function fit() {
    const w = window.innerWidth, h = window.innerHeight, wide = w >= 900 && h >= 520 && w / h > 1.15;
    root.classList.toggle('wide', wide); root.classList.toggle('imm', !!ctx.immersive);
    root.style.fontSize = (wide ? 16 * Math.min(w / 1280, h / 720) : Math.min(21, 14 * w / 390)) + 'px';
    let below = 0; for (let e = container; e && e !== document.body; e = e.parentElement) below += parseFloat(getComputedStyle(e).paddingBottom) || 0;
    root.style.height = wide ? Math.max(300, h - Math.max(0, container.getBoundingClientRect().top) - below) + 'px' : '';
  }
  window.addEventListener('resize', fit); fit();

  // ----- 카드 그리기 -----
  const kindOf = c => (c.stars != null ? 'q' : c.fx ? 'i' : String(c.id).startsWith('e-') ? 'e' : c.id.startsWith('pc-') ? 'p' : 's');
  function fallback(c) {
    const k = kindOf(c);
    if (k === 'q') return `<b class="t">${esc(c.ko)}</b><i class="st">${starsTx(c.stars)}</i><small>실패 ≤${c.f.v}<br>성공 ≥${c.w.v}</small>`;
    if (k === 'i') return `<b class="t">${esc(c.ko)}</b><small>${esc(c.desc)}</small>`;
    if (k === 'e') return `<b class="t">${esc(c.ko)}</b><small>${esc(c.desc)}</small>`;
    return `<b class="t">${esc(c.ko)}</b>`;
  }
  function cardHTML(c, o = {}) {
    const img = artOf(c);
    return `<div data-skin="card" class="qc-card k-${kindOf(c)} ${img ? 'img' : ''} ${o.cls || ''}" ${o.act === null ? '' : `data-act="${o.act || 'card'}"`} data-id="${c.id}" ${o.attrs || ''} ${img ? `style="background-image:url(${img})"` : ''}>${img ? '' : fallback(c)}${o.badge || ''}</div>`;
  }
  const pcCard = () => ({ id: 'pc-' + s.side, pack: 'base', img: PLAYER_CARDS[s.side].img, ko: `플레이어 카드 ${s.side}`, desc: `체력 ${PLAYER_CARDS[s.side].h} · 행운 ${PLAYER_CARDS[s.side].l} · 돈 ${PLAYER_CARDS[s.side].m}에서 시작` });
  const cardOf = id => (String(id).startsWith('pc-') ? pcCard() : card(id));
  const nameOf = c => c.ko || (c.id.startsWith('sh-') ? '상점' : c.id);

  // ----- 갱신 -----
  const log = t => { s.log.push(t); };
  const pipRow = (n, max, cls) => Array.from({ length: max }, (_, i) => `<i class="${cls} ${i < n ? 'on' : ''}"></i>`).join('');
  function drawSide() {
    el.stats.innerHTML = `<div class="qc-stat" data-stat="h"><span class="lb">체력</span><span class="pp">${pipRow(s.h, LIM.h, 'hp')}</span><b>${s.h}</b></div>
      <div class="qc-stat" data-stat="l"><span class="lb">행운</span><span class="pp">${pipRow(s.l, LIM.l, 'lk')}</span><b>${s.l}</b></div>
      <div class="qc-stat" data-stat="m"><span class="lb">돈</span><span class="pp mny">${pipRow(s.m, LIM.m, 'mo')}</span><b>${s.m}</b></div>`;
    const slots = [];
    for (let i = 0; i < s.imax; i++) slots.push(s.items[i] ? cardHTML(card(s.items[i]), { attrs: `data-slot="${i}"` }) : `<div class="qc-slot"><span>빈 칸</span></div>`);
    el.items.innerHTML = `<div class="qc-h">아이템 <small>${s.items.length}/${s.imax}</small></div><div class="qc-irow">${slots.join('')}</div>`;
    const e = s.envCur ? card(s.envCur) : null;
    el.env.hidden = !s.env;
    el.env.innerHTML = e ? `<div class="qc-h">환경</div><div class="qc-erow">${cardHTML(e)}<div class="qc-et"><b>${esc(e.ko)}</b><small>${esc(e.desc)}</small></div></div>` : '';
    const sc = scoreOf(s);
    el.score.innerHTML = `<div class="qc-h">${s.mode === 'board' ? '퀘스트 보드' : '표준'} · 라운드 ${Math.min(s.round, 2)}/2</div>
      <div class="qc-sc"><span>성공 ★<b>${sc.stars}</b></span><span>실패 <b>${sc.pen}</b></span>${sc.endvp ? `<span>아이템 <b>${sc.endvp}</b></span>` : ''}<span class="tot">현재 <b>${sc.vp}</b>점</span></div>
      <small class="qc-gr">${s.mode === 'board' ? '만점 20점 · 16점 이상이면 클리어' : `퀘스트 별 합 ${s.stars} · 이 점수에 가까울수록 좋은 등급`}</small>`;
    el.log.innerHTML = s.log.slice(-14).map(t => `<p>${esc(t)}</p>`).join('');
    el.log.scrollTop = el.log.scrollHeight;
    el.menu.innerHTML = `<button data-skin="button" class="qc-btn sm" data-act="rules">규칙</button><button data-skin="button" class="qc-btn sm" data-act="cards">카드 목록</button>`;
  }
  // 퀘스트 효과 설명(성공/실패/특수조건, 지금 결과에 해당하는 줄 강조)
  function questText(c, hi) {
    const row = (cls, name, ops, on) => `<div class="qc-fr ${cls} ${on ? 'on' : ''}"><em>${name}</em><span>${esc(opsText(ops))}</span></div>`;
    return `${row('f', `실패 · 합계 ${c.f.v} 이하`, c.f.ops, hi && hi.res === 'fail')}${row('a', `포기 · ${c.f.v + 1}~${c.w.v - 1}`, [], hi && hi.res === 'aband')}${row('w', `성공 · 합계 ${c.w.v} 이상`, c.w.ops, hi && hi.res === 'win')}
      <div class="qc-fr x ${hi && hi.special ? 'on' : ''}"><em>특수조건 · ${esc(condText(c.x.c))}</em><span>${esc(opsText(c.x.ops))}</span></div>`;
  }
  function drawCenter() {
    const mv = legalMoves(s);
    if (s.phase === 'pick') {
      el.c.innerHTML = `<div class="qc-h big">퀘스트를 고르세요 <small>${s.qAct.length}장 남음 · 카드를 누르면 한글 설명</small></div>
        <div class="qc-qrow">${s.qAct.map(id => cardHTML(card(id), { cls: 'pickable' })).join('')}</div>
        <div class="qc-hint">누른 카드에서 <b>도전</b>을 선택하면 주사위를 굴립니다. 아이템·환경 효과는 왼쪽 카드를 눌러 쓸 수 있어요.</div>`;
    } else if (s.phase === 'roll') {
      const c = card(s.q.id), o = outcomeOf(s), idle = !!s.pend;
      const mask = ui.sel.reduce((a, i) => a | (1 << i), 0), cost = helpCost(s, c.stars);
      const canHelp = mv.some(m => m.a === 'help'), canRe = mask && s.l >= 1;
      el.c.innerHTML = `<div class="qc-roll"><div class="qc-rq">${cardHTML(c)}<div class="qc-rt"><b>${esc(c.ko)}</b> <i>${starsTx(c.stars)}</i>${questText(c, o)}</div></div>
        <div class="qc-dice">${s.q.dice.map((d, i) => dieHTML(d, i, ui.sel.includes(i))).join('')}${s.q.bonus ? `<span class="qc-bonus">+${s.q.bonus}</span>` : ''}${s.q.shield ? '<span class="qc-shd" title="상자 준비됨">🛡</span>' : ''}</div>
        <div class="qc-out ${o.res}"><div class="qc-total" data-total>${o.total}</div><div class="qc-bar"><span class="seg f" style="flex:${c.f.v - 2}">실패 ≤${c.f.v}</span><span class="seg a" style="flex:${c.w.v - c.f.v - 1}">포기</span><span class="seg w" style="flex:${19 - c.w.v}">성공 ≥${c.w.v}</span><i class="mk" style="left:${Math.max(1, Math.min(99, (o.total - 2.5) / 16 * 100))}%"></i></div>
          <div class="qc-rs">${RES_KO[o.res]}${o.special ? ' + 특수조건!' : ''}</div></div>
        <div class="qc-act"><button data-skin="button" class="qc-btn" data-act="reroll" ${canRe && !idle ? '' : 'disabled'}>행운 재굴림<small>${mask ? `선택 ${ui.sel.length}개 · 행운 −1` : '주사위를 눌러 고르세요'}</small></button>
          <button data-skin="button" class="qc-btn" data-act="help" ${canHelp && !idle ? '' : 'disabled'}>도움 요청<small>${s.q.help >= 3 ? '더 못 불러요' : `돈 −${cost} · ${s.q.help}/3`}</small></button>
          <button data-skin="button" class="qc-btn go" data-act="done" ${idle ? 'disabled' : ''}>결과 확정<small>${RES_KO[o.res]}${o.special ? ' + 특수' : ''}</small></button></div></div>`;
    } else if (s.phase === 'shop') {
      const sh = s.shop, shopC = card(sh.card);
      const full = s.items.length >= s.imax;
      el.c.innerHTML = `<div class="qc-h big">상점 <small>아이템 ${s.items.length}/${s.imax} · 돈 ${s.m}</small></div>
        <div class="qc-shop">${cardHTML(shopC)}<div class="qc-shi">${sh.items.map((id, k) => {
          if (!id) return '<div class="qc-slot"></div>';
          const sold = sh.sold[k], cost = shopCost(s, sh.costs[k]), can = !sold && s.m >= cost, tr = shopC.trade === k && !sold;
          return `<div class="qc-sp ${sold ? 'sold' : ''}">${cardHTML(card(id))}<div class="qc-pr">${sold ? '판매됨' : `돈 ${cost}`}</div>
            ${sold ? '' : `<button data-skin="button" class="qc-btn sm" data-act="buy" data-k="${k}" ${can ? '' : 'disabled'}>${full ? '버리고 구매' : '구매'}</button>`}${tr ? `<button data-skin="button" class="qc-btn sm" data-act="trade" data-k="${k}" ${s.items.length ? '' : 'disabled'}>교환</button>` : ''}</div>`;
        }).join('')}</div></div>
        <div class="qc-act">${s.env && !sh.envSwapped && s.envDeck.length ? '<button data-skin="button" class="qc-btn" data-act="mv" data-mv=\'{"a":"envswap"}\'>환경 카드 바꾸기<small>1번만</small></button>' : ''}<button data-skin="button" class="qc-btn go" data-act="mv" data-mv='{"a":"leave"}'>상점 나가기<small>2라운드 시작</small></button></div>
        <div class="qc-hint">안 산 아이템은 덱에 섞여 돌아갑니다. 교환: 내 아이템 1장을 내고 그 칸의 아이템을 받음.</div>`;
    } else if (s.phase === 'end') {
      const sc = scoreOf(s);
      el.c.innerHTML = `<div class="qc-h big">모든 퀘스트를 마쳤어요</div><div class="qc-endp"><p>성공한 퀘스트 ${s.kept.length}장 (별 ${sc.stars}) · 실패 ${s.failed.length}장${sc.endvp ? ` · 아이템 점수 ${sc.endvp}` : ''}</p><p>지금 점수 <b>${sc.vp}</b>점</p>${s.items.includes('s-darling') ? '<p class="warn">달링을 가지고 있어 끝날 때 체력 −1입니다.</p>' : ''}</div>
        <div class="qc-act"><button data-skin="button" class="qc-btn go" data-act="mv" data-mv='{"a":"finish"}'>끝내기<small>점수 계산</small></button></div>`;
    } else el.c.innerHTML = '';
  }

  // ----- 팝업(카드 설명·선택 대기·규칙·카드 목록) -----
  const mvBtn = (m, label, cls = '', dis = false) => `<button data-skin="button" class="qc-btn ${cls}" data-act="mv" data-mv="${esc(JSON.stringify(m))}" ${dis ? 'disabled' : ''}>${label}</button>`;
  const maskOf = () => ui.sel.reduce((a, i) => a | (1 << i), 0);
  function useButtons(idx) {
    const it = card(s.items[idx]), all = legalMoves(s).filter(m => m.a === 'item' && m.i === idx);
    if (!all.length) return `<p class="qc-warn">${s.pend ? '지금은 선택부터 끝내세요.' : it.when === 'roll' ? '주사위를 굴리는 중에만 쓸 수 있어요.' : '지금은 쓸 수 없어요.'}</p>`;
    let pick = all, hint = '';
    if (it.fx === 'reroll') { pick = all.filter(m => m.m === maskOf()); if (!pick.length) hint = '다시 굴릴 주사위를 먼저 눌러 고른 뒤 이 카드를 다시 열어 주세요.'; }
    if (it.fx === 'set6') { pick = all.filter(m => ui.sel.length === 1 && m.d === ui.sel[0]); if (!pick.length) hint = '6으로 바꿀 주사위 1개를 먼저 눌러 고른 뒤 이 카드를 다시 열어 주세요.'; }
    return (hint ? `<p class="qc-warn">${hint}</p>` : '') + (pick.length ? mvBtn(pick[0], '사용하기 (버리고 효과)', 'go') : '');
  }
  function envButtons() {
    const e = s.envCur, mv = legalMoves(s).filter(m => m.a === 'env'), one = ui.sel.length === 1 ? ui.sel[0] : -1;
    if (e === 'e-gems') return s.items.length ? s.items.map((id, i) => mvBtn({ a: 'env', e: 'gem', i }, `${esc(card(id).ko)} 버리기 (돈 +1)`)).join('') : '<p class="qc-warn">버릴 아이템이 없어요.</p>';
    if (e === 'e-frog') return mvBtn({ a: 'env', e: 'frog' }, '행운 1로 체력 +1', 'go', !mv.some(m => m.e === 'frog'));
    if (['e-night', 'e-chilly', 'e-rain'].includes(e)) {
      if (s.phase !== 'roll') return '<p class="qc-warn">주사위를 굴리는 중에만 쓸 수 있어요.</p>';
      if (one < 0) return '<p class="qc-warn">바꿀 주사위 1개를 먼저 눌러 고른 뒤 이 카드를 다시 열어 주세요.</p>';
      const mine = mv.filter(m => m.d === one);
      return mine.length ? mine.map(m => mvBtn(m, `주사위 ${s.q.dice[one].v} → ${m.v}`)).join('') : '<p class="qc-warn">지금 이 주사위에는 쓸 수 없어요.</p>';
    }
    return '';
  }
  function cardSheet(id) {
    const c = cardOf(id), k = kindOf(c); let body = '', btns = '';
    if (k === 'q') {
      body = `<h3>${esc(c.ko)} <i>${starsTx(c.stars)}</i></h3>${questText(c, s.phase === 'roll' && s.q && s.q.id === id ? outcomeOf(s) : null)}`;
      if (s.phase === 'pick' && !s.pend && s.qAct.includes(id)) btns = mvBtn({ a: 'pick', q: id }, '이 퀘스트에 도전!', 'go');
    } else if (k === 'i') {
      body = `<h3>${esc(c.ko)}</h3><p>${esc(c.desc)}</p>`;
      const idx = s.items.indexOf(id);
      btns = idx >= 0 ? useButtons(idx) : '<p class="qc-warn">내 손에 없는 카드예요.</p>';
    } else if (k === 'e') {
      body = `<h3>${esc(c.ko)}</h3><p>${esc(c.desc)}</p>${id === s.envCur ? '' : '<p class="qc-warn">지금 적용 중인 환경이 아니에요.</p>'}`;
      if (id === s.envCur) btns = envButtons();
    } else if (k === 'p') body = `<h3>${esc(c.ko)}</h3><p>${esc(c.desc)}</p>`;
    else body = `<h3>상점 카드</h3><p>아이템 3장이 d6 가격으로 진열됩니다.${c.trade != null ? ` ${c.trade + 1}번째 칸은 내 아이템과 교환할 수 있어요.` : ''}</p>`;
    return `<div class="qc-shc">${cardHTML(c, { act: null })}<div class="qc-sht">${body}</div></div><div class="qc-shb">${btns}<button data-skin="button" class="qc-btn" data-act="close">닫기</button></div>`;
  }
  function pendSheet() {
    const p = s.pend, mv = legalMoves(s);
    if (p.k === 'keep') return `<h3>시작 아이템을 1장 고르세요</h3><p>고르지 않은 카드는 덱 맨 아래로 갑니다.</p><div class="qc-pcs">${p.ids.map(id => `<div class="qc-pc">${cardHTML(card(id), { act: null })}<b>${esc(card(id).ko)}</b><small>${esc(card(id).desc)}</small>${mvBtn({ a: 'keep', id }, '이걸로!', 'go')}</div>`).join('')}</div>`;
    if (p.k === 'over' || p.k === 'lose') {
      const newc = p.k === 'over' ? card(p.id) : null;
      return `<h3>${p.k === 'over' ? '아이템이 가득 찼어요' : '잃을 아이템을 고르세요'}</h3>${newc ? `<p>새 아이템 <b>${esc(newc.ko)}</b> — ${esc(newc.desc)}<br>버릴 카드를 고르거나 새 아이템을 포기하세요.</p>` : '<p>효과로 아이템 1장을 잃어요.</p>'}<div class="qc-pcs">${s.items.map((id, i) => `<div class="qc-pc">${cardHTML(card(id), { act: null })}<b>${esc(card(id).ko)}</b>${mvBtn({ a: 'drop', i }, '이 카드 버리기')}</div>`).join('')}</div>${p.k === 'over' ? mvBtn({ a: 'drop', i: -1 }, `${esc(newc.ko)} 포기하기`) : ''}`;
    }
    if (p.k === 'void') return `<h3>이 퀘스트를 완전히 버릴까요?</h3><p>버리면 실패로도 성공으로도 세지 않아서 점수가 깎이지 않습니다.</p><div class="qc-shb">${mvBtn({ a: 'void', y: true }, '완전히 버린다', 'go')}${mvBtn({ a: 'void', y: false }, '그대로 둔다')}</div>`;
    if (p.k === 'dmg') {
      const reacts = mv.filter(m => m.a === 'react');
      return `<h3>체력 피해 ${p.amt}!</h3><p>지금 체력 ${s.h} → ${Math.max(0, s.h - p.amt)}${s.h - p.amt <= 0 ? ' <b class="warn">쓰러집니다</b>' : ''}. 맞기 전에 아이템을 쓸 수 있어요.</p><div class="qc-shb col">${reacts.map(m => mvBtn(m, `${esc(card(s.items[m.i]).ko)} — ${esc(card(s.items[m.i]).desc)}`)).join('')}${mvBtn({ a: 'take' }, `그대로 받는다 (체력 −${p.amt})`, 'bad')}</div>`;
    }
    return '';
  }
  function cardsSheet() {
    const pk = ui.tab, ids = [...QUESTS, ...ITEMS, ...ENVS, ...SHOPS].filter(c => c.pack === pk);
    return `<div class="qc-tabs">${PACK_ORDER.map(p => `<button data-skin="button" class="qc-btn sm ${p === pk ? 'go' : ''}" data-act="tab" data-k="${p}">${esc(PACKS[p].name)}${s.packs.includes(p) ? '' : ' (안 씀)'}</button>`).join('')}</div>
      <div class="qc-list">${ids.map(c => `<div class="qc-li">${cardHTML(c, { act: null })}<div class="qc-lt"><b>${esc(nameOf(c))}${c.stars != null ? ` <i>${starsTx(c.stars)}</i>` : ''}</b>${c.stars != null ? questText(c) : `<span>${esc(c.desc || (c.trade != null ? `교환 칸 ${c.trade + 1}번` : '아이템 3장 진열'))}</span>`}</div></div>`).join('')}</div>
      <div class="qc-shb"><button data-skin="button" class="qc-btn" data-act="close">닫기</button></div>`;
  }
  function drawSheet() {
    let html = '', modal = false;
    if (s && s.pend && !s.over) { html = pendSheet(); modal = true; }
    else if (ui.sheet) {
      const sh = ui.sheet;
      if (sh.k === 'card') html = cardSheet(sh.id);
      else if (sh.k === 'rules') html = `<div class="qc-rules">${RULES_HTML}</div><div class="qc-shb"><button data-skin="button" class="qc-btn" data-act="close">닫기</button></div>`;
      else if (sh.k === 'cards') html = cardsSheet();
      else if (sh.k === 'buy' || sh.k === 'trade') {
        const mvs = legalMoves(s).filter(m => m.a === sh.k && m.k === sh.kk);
        html = `<h3>${sh.k === 'buy' ? '아이템이 가득 찼어요 — 버릴 카드를 고르세요' : '교환할 내 아이템을 고르세요'}</h3><div class="qc-pcs">${mvs.map(m => { const id = s.items[sh.k === 'buy' ? m.drop : m.i]; return `<div class="qc-pc">${cardHTML(card(id), { act: null })}<b>${esc(card(id).ko)}</b>${mvBtn(m, sh.k === 'buy' ? '버리고 구매' : '이걸 내고 교환', 'go')}</div>`; }).join('')}</div><div class="qc-shb"><button data-skin="button" class="qc-btn" data-act="close">취소</button></div>`;
      }
    }
    el.sheet.hidden = !html;
    el.sheet.innerHTML = html ? `<div class="qc-back" ${modal ? '' : 'data-act="close"'}></div><div data-skin="panel" class="qc-sh ${ui.sheet && ui.sheet.k === 'cards' ? 'wide' : ''}">${html}</div>` : '';
  }
  function draw() { drawSide(); drawCenter(); drawSheet(); }

  // ----- 설정창 -----
  function drawSetup() {
    const can = boardPossible(opts.packs), envOk = opts.packs.includes('sci');
    el.setup.hidden = false;
    el.setup.innerHTML = `<div class="qc-back"></div><div data-skin="panel" class="qc-sh setup"><h2>☕ Quests Over Coffee</h2><p class="sub">커피 한 잔 시간의 주사위 퀘스트 · 1인용</p>
      <div class="qc-opt"><em>카드 팩</em><div><button data-skin="button" class="qc-btn sm go" disabled>기본</button>${['sci', 'nc'].map(p => `<button data-skin="button" class="qc-btn sm ${opts.packs.includes(p) ? 'go' : ''}" data-act="optpack" data-k="${p}">${esc(PACKS[p].name)}</button>`).join('')}</div></div>
      <div class="qc-opt"><em>모드</em><div><button data-skin="button" class="qc-btn sm ${opts.mode === 'std' || !can ? 'go' : ''}" data-act="optmode" data-k="std">표준</button><button data-skin="button" class="qc-btn sm ${opts.mode === 'board' && can ? 'go' : ''}" data-act="optmode" data-k="board" ${can ? '' : 'disabled'}>퀘스트 보드</button></div>${can ? '' : '<small>기본 팩만으로는 별 3·4·3 구성을 만들 수 없어요</small>'}</div>
      <div class="qc-opt"><em>환경 카드</em><div><button data-skin="button" class="qc-btn sm ${opts.env && envOk ? 'go' : ''}" data-act="optenv" ${envOk ? '' : 'disabled'}>${opts.env && envOk ? '켜짐' : '꺼짐'}</button></div>${envOk ? '' : '<small>03 팩이 있어야 해요</small>'}</div>
      <div class="qc-opt"><em>플레이어 카드</em><div><button data-skin="button" class="qc-btn sm ${opts.side === 'A' ? 'go' : ''}" data-act="optside" data-k="A">A · 체력3 행운1 돈2</button><button data-skin="button" class="qc-btn sm ${opts.side === 'B' ? 'go' : ''}" data-act="optside" data-k="B">B · 체력2 행운3 돈3</button></div></div>
      <div class="qc-shb"><button data-skin="button" class="qc-btn go" data-act="start">시작하기</button><button data-skin="button" class="qc-btn" data-act="rules">규칙 보기</button></div></div>`;
  }

  // ----- 끝 -----
  function showOver() {
    if (finished) return;
    const res = mod.result(s), sc = scoreOf(s);
    el.over.hidden = false;
    el.over.innerHTML = `<div class="qc-back"></div><div data-skin="panel" class="qc-sh ov ${s.dead ? 'lose' : res.coop.won ? 'win' : ''}"><h2>${s.dead ? '쓰러졌어요…' : res.coop.won ? '잘 마셨어요! ☕' : '다음 잔을 기약해요'}</h2><p class="sub">${esc(res.summary)}</p>
      <div class="qc-ovl"><span>성공 ${s.kept.length}장 (★${s.dead ? 0 : sc.stars})</span><span>실패 ${s.failed.length}장</span><span>포기·버림 ${s.resolved - s.kept.length - s.failed.length}장</span>${s.dead ? `<span>${esc(s.why || '')}</span>` : `<span>아이템 점수 ${sc.endvp}</span>`}</div>
      <div class="qc-shb"><button data-skin="button" class="qc-btn go" data-act="quit">결과 저장하고 나가기</button></div></div>`;
  }

  // ----- 연출 -----
  function animate(evs) {
    if (!fx.on) return;
    const die = i => root.querySelectorAll('.qc-die')[i], stat = k => root.querySelector(`[data-stat="${k}"] b`);
    const items = () => root.querySelectorAll('.qc-irow .qc-card');
    evs.slice(0, 14).forEach((e, n) => later(() => safe(() => {
      if (e.t === 'roll') { root.querySelectorAll('.qc-die').forEach((d, i) => later(() => safe(() => fx.flip(d)), i * 70)); fx.sfx('deal'); }
      else if (e.t === 'reroll') { const idx = Array.isArray(e.idx) ? e.idx : [...Array(s.q ? s.q.dice.length : 0).keys()].filter(i => e.idx & (1 << i)); idx.forEach((i, j) => later(() => safe(() => fx.flip(die(i))), j * 60)); fx.sfx('flip'); }
      else if (e.t === 'die+') { fx.pop(die(e.i)); fx.sfx('chip'); }
      else if (e.t === 'dieset') { fx.pop(die(e.i), 1.35); fx.sfx('chip'); }
      else if (e.t === 'h' || e.t === 'l' || e.t === 'm') { const t = stat(e.t); if (t && e.v) { fx.float(t, `${e.v > 0 ? '+' : ''}${e.v}`, { color: e.v > 0 ? '#8be28b' : '#ff8a80', size: 26 }); fx.pop(t, 1.4); fx.sfx(e.v > 0 ? 'gain' : 'bad'); if (e.t === 'h' && e.v < 0) fx.shake(root, 5); fx.buzz(e.v < 0 ? 25 : 8); } }
      else if (e.t === 'resolve') { const t = root.querySelector('.qc-out') || root; fx.slam(t); if (e.res === 'win') { fx.sfx('win'); fx.burst(t, { color: '#ffd76a', n: 16 }); } else if (e.res === 'fail') fx.sfx('lose'); else fx.sfx('tap'); }
      else if (e.t === 'item+') { const it = items(); if (it.length) { fx.pop(it[it.length - 1]); fx.sfx('card'); } }
      else if (e.t === 'item-') fx.sfx('out');
      else if (e.t === 'shield' || e.t === 'bonus') { fx.glow(root.querySelector('.qc-dice') || root, '#7fc4ff'); fx.sfx('tap'); }
      else if (e.t === 'dead') { fx.shake(root, 12); fx.sfx('lose'); fx.buzz(60); }
    }), n * 80));
  }

  // ----- 진행 -----
  function save() { try { if (!s.over && ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s))); } catch (e) { /* 저장은 덤 */ } }
  function run(m) {
    if (dead || !s || s.over) return;
    const key = JSON.stringify(m);
    if (!legalMoves(s).some(x => JSON.stringify(x) === key)) { draw(); return; }
    try { mod.applyMove(s, m, rng); } catch (err) { log('(잘못된 수: ' + err.message + ')'); draw(); return; }
    const evs = s.ev.splice(0);
    ui.sel = []; ui.sheet = null;
    draw(); animate(evs); save();
    if (s.over) later(showOver, fx.on ? 900 : 60);
  }

  // ----- 입력 -----
  root.addEventListener('click', ev => {
    const t = ev.target.closest('[data-act]'); if (!t || dead) return;
    const a = t.dataset.act; if (t.disabled) return;
    safe(() => fx.buzz(6));
    if (a === 'quit') { if (finished) return; finished = true; el.over.hidden = true; el.over.innerHTML = ''; el.sheet.hidden = true; root.style.display = 'none'; ctx.finish(mod.result(s)); return; }
    if (a === 'rules') {
      if (s) { ui.sheet = { k: 'rules' }; draw(); return; }
      el.setup.hidden = true; el.sheet.hidden = false;
      el.sheet.innerHTML = `<div class="qc-back" data-act="closesetup"></div><div data-skin="panel" class="qc-sh"><div class="qc-rules">${RULES_HTML}</div><div class="qc-shb"><button data-skin="button" class="qc-btn" data-act="closesetup">닫기</button></div></div>`; return;
    }
    if (a === 'closesetup') { el.sheet.hidden = true; el.sheet.innerHTML = ''; drawSetup(); return; }
    if (a === 'optpack') { const p = t.dataset.k; opts.packs = opts.packs.includes(p) ? opts.packs.filter(x => x !== p) : [...opts.packs, p]; if (!boardPossible(['base', ...opts.packs])) opts.mode = 'std'; drawSetup(); return; }
    if (a === 'optmode') { opts.mode = t.dataset.k; drawSetup(); return; }
    if (a === 'optenv') { opts.env = !opts.env; drawSetup(); return; }
    if (a === 'optside') { opts.side = t.dataset.k; drawSetup(); return; }
    if (a === 'start') { saveOpts(opts); el.setup.hidden = true; el.setup.innerHTML = ''; begin(null); return; }
    if (!s) return;
    if (a === 'close') { ui.sheet = null; draw(); return; }
    if (a === 'cards') { ui.sheet = { k: 'cards' }; draw(); return; }
    if (a === 'tab') { ui.tab = t.dataset.k; draw(); return; }
    if (s.over) return;
    if (a === 'card') { if (s.pend) return; ui.sheet = { k: 'card', id: t.dataset.id }; draw(); return; }
    if (a === 'die') { if (s.phase !== 'roll' || s.pend) return; const i = +t.dataset.i, k = ui.sel.indexOf(i); if (k >= 0) ui.sel.splice(k, 1); else ui.sel.push(i); draw(); return; }
    if (a === 'mv') { try { run(JSON.parse(t.dataset.mv)); } catch (e) { /* 무시 */ } return; }
    if (a === 'reroll') { const m = maskOf(); if (m) run({ a: 'reroll', m }); return; }
    if (a === 'help') { run({ a: 'help' }); return; }
    if (a === 'done') { run({ a: 'done' }); return; }
    if (a === 'buy') { const k = +t.dataset.k; if (s.items.length < s.imax) run({ a: 'buy', k }); else { ui.sheet = { k: 'buy', kk: k }; draw(); } return; }
    if (a === 'trade') { ui.sheet = { k: 'trade', kk: +t.dataset.k }; draw(); return; }
  });
  const onKey = ev => {
    if (dead || (ev.target.closest && ev.target.closest('input,textarea'))) return;
    if (ev.key === 'Escape' && s && !s.pend && ui.sheet) { ui.sheet = null; draw(); }
  };
  document.addEventListener('keydown', onKey);
  root.addEventListener('contextmenu', ev => { if (ev.target.closest('.qc-card')) ev.preventDefault(); });

  // ----- 시작 -----
  function begin(state) {
    s = state || mod.newGame({ players: ctx.players, rng, options: { packs: opts.packs, mode: opts.mode, env: opts.env, side: opts.side } });
    s.ev = []; ui.sel = []; ui.sheet = null;
    log(state ? '이어서 진행합니다.' : '새 게임을 시작했어요. 퀘스트를 고르세요.');
    draw(); save();
  }
  const rs = ctx.resumeState;
  if (rs && rs.v === 1 && Array.isArray(rs.qAct) && !rs.over) begin(rs); else drawSetup();
  container._qoc = { get state() { return s; }, run, draw, get ui() { return ui; }, get opts() { return opts; } };   // 테스트용 손잡이
  return { destroy() { dead = true; window.removeEventListener('resize', fit); document.removeEventListener('keydown', onKey); timers.forEach(clearTimeout); timers.clear(); container.querySelectorAll('.fx-layer').forEach(e => e.remove()); container.textContent = ''; } };
}

const QC_CSS = `
.g-qoc{position:relative;box-sizing:border-box;color:#f5e9d8;font-family:var(--fk,system-ui,sans-serif);background:radial-gradient(120% 90% at 50% 0%,var(--bg1),var(--bg2));overflow:hidden;line-height:1.35;
 display:flex;flex-direction:column;gap:.6em;padding:.5em;border-radius:1em;font-size:14px;user-select:none;-webkit-user-select:none}
.g-qoc *{box-sizing:border-box}
.g-qoc button{font-family:inherit;cursor:pointer;color:inherit}
.g-qoc [hidden]{display:none!important}
.g-qoc.wide{display:grid;grid-template-columns:17em minmax(0,1fr) 19em;gap:.8em;padding:.8em;border-radius:0;align-items:stretch}
.g-qoc.imm{padding-top:2.6em}
.g-qoc .qc-l,.g-qoc .qc-r{display:flex;flex-direction:column;gap:.6em;min-height:0}
.g-qoc .qc-c{display:flex;flex-direction:column;gap:.6em;min-width:0;min-height:0}
.g-qoc [data-skin="panel"]{background-color:#00000066;border:1px solid #ffffff22;border-radius:.7em;padding:.6em .7em}
.g-qoc .qc-h{font-weight:900;font-size:.95em;color:var(--acc);margin-bottom:.3em;display:flex;justify-content:space-between;align-items:baseline;gap:.5em}
.g-qoc .qc-h small{font-weight:400;color:#d9c8b0;font-size:.78em}
.g-qoc .qc-h.big{font-size:1.25em}
.g-qoc .qc-stat{display:flex;align-items:center;gap:.5em;margin:.2em 0}
.g-qoc .qc-stat .lb{width:2.6em;font-size:.85em;color:#e8d6bc}
.g-qoc .qc-stat .pp{display:flex;gap:.18em;flex:1}
.g-qoc .qc-stat b{width:1.4em;text-align:right;font-size:1.15em}
.g-qoc .qc-stat i{width:.95em;height:.95em;border-radius:50%;border:1px solid #fff4;background:#0005}
.g-qoc .qc-stat .pp.mny i{width:.62em;height:.95em;border-radius:.2em}
.g-qoc .qc-stat i.hp.on{background:#e5484d;border-color:#ffb4b4;box-shadow:0 0 .5em #e5484d88}
.g-qoc .qc-stat i.lk.on{background:#4fc3f7;border-color:#c8f0ff;box-shadow:0 0 .5em #4fc3f788}
.g-qoc .qc-stat i.mo.on{background:#f2c14e;border-color:#fff1bd}
.g-qoc .qc-card{position:relative;width:calc(var(--cw,5em) / .62);aspect-ratio:360/504;border-radius:.45em;background:#f6ecd7 center/cover no-repeat;color:#3b2a1a;border:2px solid #2a1d15;overflow:hidden;cursor:pointer;flex:none;display:flex;flex-direction:column;justify-content:space-between;padding:.3em;font-size:.62em;line-height:1.15;box-shadow:0 .15em .4em #0008;transition:transform .12s}
.g-qoc .qc-card.img{padding:0;border-color:#1a110b}
.g-qoc .qc-card .t{font-size:1.15em}
.g-qoc .qc-card small{font-size:.9em;display:block}
.g-qoc .qc-card .st{color:#b7791f;font-style:normal;font-size:1.2em}
.g-qoc .qc-card.k-i{background-color:#e4efe0}.g-qoc .qc-card.k-e{background-color:#dde8f4}.g-qoc .qc-card.k-s,.g-qoc .qc-card.k-p{background-color:#efe0f1}
.g-qoc .qc-card:hover{transform:translateY(-.2em) scale(1.04);z-index:3}
.g-qoc.wide .qc-card.img:hover{transform:translateY(-.4em) scale(1.55);z-index:20;box-shadow:0 .6em 1.6em #000c}
.g-qoc .qc-slot{width:calc(var(--cw,5em) / .62);aspect-ratio:360/504;border:2px dashed #fff3;border-radius:.45em;display:flex;align-items:center;justify-content:center;color:#fff5;font-size:.62em;flex:none}
.g-qoc .qc-irow,.g-qoc .qc-qrow{display:flex;gap:.5em;flex-wrap:nowrap}
.g-qoc .qc-qrow{justify-content:center;flex-wrap:wrap}
.g-qoc .qc-erow{display:flex;gap:.5em;align-items:flex-start}
.g-qoc .qc-et{display:flex;flex-direction:column;gap:.2em;font-size:.82em}.g-qoc .qc-et small{color:#e8d6bc}
.g-qoc{--cw:5em}.g-qoc.wide{--cw:7.4em}
.g-qoc.wide .qc-l{--cw:4.9em}
.g-qoc .qc-env .qc-erow .qc-card{--cw:4.4em}
.g-qoc .qc-qrow .qc-card.pickable{box-shadow:0 0 0 .15em #e0a53a66,0 .2em .5em #000a}
.g-qoc .qc-roll{display:flex;flex-direction:column;gap:.9em}
.g-qoc.wide .qc-roll{gap:1.3em;padding-top:.4em}
.g-qoc.wide .qc-die{width:5em;height:5em;padding:.7em}.g-qoc.wide .qc-dice{gap:1em;min-height:6em}
.g-qoc.wide .qc-total{font-size:3.2em}.g-qoc.wide .qc-out{padding:.8em 1em}.g-qoc.wide .qc-btn{padding:.8em 1em;font-size:1.1em}
.g-qoc .qc-irow .qc-card small,.g-qoc .qc-env .qc-card small{display:none}
.g-qoc .qc-rq{display:flex;gap:.8em;align-items:flex-start}
.g-qoc .qc-rq .qc-card{--cw:6em}.g-qoc.wide .qc-rq .qc-card{--cw:7.2em}
.g-qoc .qc-rt{flex:1;min-width:0}.g-qoc .qc-rt b{font-size:1.15em}.g-qoc .qc-rt i,.g-qoc h3 i,.g-qoc .qc-lt i{color:#f2c14e;font-style:normal}
.g-qoc .qc-fr{display:flex;justify-content:space-between;gap:.6em;padding:.22em .5em;margin:.2em 0;border-radius:.4em;background:#0004;border-left:.25em solid #fff3;font-size:.86em}
.g-qoc .qc-fr em{font-style:normal;color:#e8d6bc}.g-qoc .qc-fr span{text-align:right;font-weight:700}
.g-qoc .qc-fr.f{border-left-color:#e5484d}.g-qoc .qc-fr.w{border-left-color:#5cc46a}.g-qoc .qc-fr.x{border-left-color:#7fc4ff}.g-qoc .qc-fr.a{border-left-color:#aaa}
.g-qoc .qc-fr.on{background:#f2c14e33;outline:1px solid #f2c14e;box-shadow:0 0 .8em #f2c14e55}
.g-qoc .qc-dice{display:flex;gap:.6em;align-items:center;justify-content:center;flex-wrap:wrap;min-height:4.4em}
.g-qoc .qc-die{width:3.6em;height:3.6em;border-radius:.6em;border:2px solid #3a2a1c;background:linear-gradient(#fffaf0,#e9dcc3);display:grid;grid-template:repeat(3,1fr)/repeat(3,1fr);padding:.5em;gap:.1em;box-shadow:0 .18em 0 #0007;cursor:pointer;position:relative}
.g-qoc .qc-die i{border-radius:50%;margin:12%}.g-qoc .qc-die i.on{background:#2a1d15}
.g-qoc .qc-die.k-help{background:linear-gradient(#e6f2ff,#b9d4f2)}.g-qoc .qc-die.k-item{background:linear-gradient(#e9ffe9,#b9e6bb)}
.g-qoc .qc-die.sel{transform:translateY(-.35em);outline:.2em solid #f2c14e;box-shadow:0 .5em 0 #0007,0 0 1em #f2c14e}
.g-qoc .qc-bonus{font-size:1.4em;font-weight:900;color:#7fc4ff}.g-qoc .qc-shd{font-size:1.5em}
.g-qoc .qc-out{display:flex;align-items:center;gap:.8em;padding:.5em .7em;border-radius:.7em;background:#0005;border:1px solid #fff2}
.g-qoc .qc-total{font:900 2.4em/1 var(--fd,serif);min-width:1.4em;text-align:center}
.g-qoc .qc-bar{flex:1;display:flex;position:relative;height:1.7em;border-radius:.4em;overflow:hidden;font-size:.72em}
.g-qoc .qc-bar .seg{display:flex;align-items:center;justify-content:center;white-space:nowrap}
.g-qoc .qc-bar .f{background:#8f2f33}.g-qoc .qc-bar .a{background:#5d5148}.g-qoc .qc-bar .w{background:#2f7a3b}
.g-qoc .qc-bar .mk{position:absolute;top:0;bottom:0;width:.25em;background:#fff;box-shadow:0 0 .5em #fff;transform:translateX(-50%);transition:left .25s}
.g-qoc .qc-rs{font-weight:900;font-size:1.05em;min-width:5.2em;text-align:center}
.g-qoc .qc-out.win .qc-rs,.g-qoc .qc-out.win .qc-total{color:#8be28b}.g-qoc .qc-out.fail .qc-rs,.g-qoc .qc-out.fail .qc-total{color:#ff8a80}
.g-qoc .qc-act{display:flex;gap:.6em;flex-wrap:wrap}
.g-qoc .qc-act .qc-btn{flex:1;min-width:6em}
.g-qoc .qc-btn{border:1px solid #ffffff44;background:#ffffff16;border-radius:.6em;padding:.55em .8em;font-size:1em;font-weight:900;color:#f5e9d8;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:.1em;min-height:2.4em}
.g-qoc .qc-btn small{font-size:.66em;font-weight:400;color:#e8d6bc}
.g-qoc .qc-btn.go{background:linear-gradient(#d99a2a,#a86d12);color:#fff;border-color:#f2c14e}
.g-qoc .qc-btn.bad{background:#7a2a2d;border-color:#ff8a80}
.g-qoc .qc-btn.sm{padding:.3em .7em;font-size:.82em;min-height:0;flex-direction:row}
.g-qoc .qc-btn:disabled{opacity:.4;cursor:default}
.g-qoc .qc-hint{font-size:.8em;color:#d9c8b0;text-align:center}
.g-qoc .qc-menu{display:flex;gap:.5em}
.g-qoc .qc-menu .qc-btn{flex:1}
.g-qoc .qc-score .qc-sc{display:flex;gap:.8em;flex-wrap:wrap;align-items:baseline;font-size:.9em}.g-qoc .qc-sc b{font-size:1.2em}.g-qoc .qc-sc .tot{margin-left:auto;color:var(--acc)}.g-qoc .qc-gr{color:#d9c8b0;display:block;margin-top:.3em;font-size:.76em}
.g-qoc .qc-log{flex:1;min-height:7em;max-height:12em;overflow-y:auto;font-size:.8em;color:#e8d6bc}.g-qoc.wide .qc-log{max-height:none}
.g-qoc .qc-log p{margin:.15em 0;padding-left:.4em;border-left:2px solid #fff2}
.g-qoc .qc-shop{display:flex;gap:1em;align-items:flex-start;justify-content:center;flex-wrap:wrap}
.g-qoc .qc-shop>.qc-card{--cw:6.2em}
.g-qoc .qc-shi{display:flex;gap:.7em;flex-wrap:wrap;justify-content:center}
.g-qoc .qc-sp{display:flex;flex-direction:column;align-items:center;gap:.3em}.g-qoc .qc-sp .qc-card{--cw:6em}.g-qoc.wide .qc-sp .qc-card{--cw:7em}
.g-qoc .qc-sp.sold{opacity:.45}.g-qoc .qc-pr{font-weight:900;color:#f2c14e}
.g-qoc .qc-endp{text-align:center;font-size:1.05em;padding:1em}.g-qoc .qc-endp b{font-size:1.8em;color:var(--acc)}.g-qoc .warn,.g-qoc .qc-warn{color:#ffb4a8}
.g-qoc .qc-sheet,.g-qoc .qc-over,.g-qoc .qc-setup{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;padding:1em}
.g-qoc .qc-over,.g-qoc .qc-setup{z-index:70}
.g-qoc .qc-back{position:absolute;inset:0;background:#000b}
.g-qoc .qc-sh{position:relative;width:min(34em,100%);max-height:92vh;overflow-y:auto;padding:1em 1.1em!important;background-color:#2a1d15!important;font-size:1.05em}
.g-qoc .qc-sh.wide{width:min(46em,100%)}
.g-qoc .qc-sh h2{margin:.1em 0;font-size:1.5em;color:var(--acc);text-align:center}.g-qoc .qc-sh h3{margin:.1em 0 .4em;font-size:1.2em}
.g-qoc .qc-sh .sub{text-align:center;color:#d9c8b0;margin:.2em 0 .8em}
.g-qoc .qc-shc{display:flex;gap:1em;align-items:flex-start}.g-qoc .qc-shc .qc-card{--cw:8em;cursor:default}.g-qoc .qc-shc .qc-card:hover{transform:none}.g-qoc .qc-sht{flex:1;min-width:0}
.g-qoc .qc-shb{display:flex;gap:.6em;flex-wrap:wrap;margin-top:.8em}.g-qoc .qc-shb .qc-btn{flex:1;min-width:8em}.g-qoc .qc-shb.col{flex-direction:column}
.g-qoc .qc-pcs{display:flex;gap:.8em;justify-content:center;flex-wrap:wrap;margin:.5em 0}.g-qoc .qc-pc{display:flex;flex-direction:column;align-items:center;gap:.3em;width:9em;text-align:center}.g-qoc .qc-pc .qc-card{--cw:7em;cursor:default}.g-qoc .qc-pc small{font-size:.75em;color:#d9c8b0}
.g-qoc .qc-rules{font-size:.92em}.g-qoc .qc-rules h3{color:var(--acc);margin-top:.7em}.g-qoc .qc-rules p,.g-qoc .qc-rules ul{margin:.3em 0}.g-qoc .qc-rules ul{padding-left:1.2em}.g-qoc .qc-note{color:#b9a58a;font-size:.85em}
.g-qoc .qc-tabs{display:flex;gap:.4em;margin-bottom:.6em;flex-wrap:wrap}
.g-qoc .qc-list{display:grid;grid-template-columns:1fr;gap:.6em;max-height:62vh;overflow-y:auto}
.g-qoc.wide .qc-list{grid-template-columns:1fr 1fr}
.g-qoc .qc-li{display:flex;gap:.6em;padding:.4em;border-radius:.5em;background:#0003}.g-qoc .qc-li .qc-card{--cw:5em;cursor:default}.g-qoc .qc-li .qc-card:hover{transform:none}.g-qoc .qc-lt{flex:1;min-width:0;font-size:.85em}
.g-qoc .qc-opt{margin:.7em 0}.g-qoc .qc-opt em{display:block;font-style:normal;color:var(--acc);margin-bottom:.25em;font-size:.9em}.g-qoc .qc-opt>div{display:flex;gap:.4em;flex-wrap:wrap}.g-qoc .qc-opt small{display:block;color:#d9c8b0;font-size:.75em;margin-top:.2em}
.g-qoc .qc-ovl{display:flex;flex-direction:column;gap:.25em;align-items:center;margin:.5em 0}
.g-qoc .qc-sh.ov.lose h2{color:#ff8a80}.g-qoc .qc-sh.ov.win h2{color:#8be28b}
@media (prefers-reduced-motion:reduce){.g-qoc *{transition:none!important}}
`;
