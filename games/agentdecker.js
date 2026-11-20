// 에이전트 데커 (Agent Decker) — 1인용 덱빌딩 잠입 게임 (원작: Manuel Correia, CC BY-NC 4.0, https://gamesbymanuel.com)
// 디지털 이식: 규칙·카드 데이터는 무료 PnP 풀아트판(2015-09-27) 기준. 그림은 쓰지 않고 SVG/CSS로 다시 그렸다.
//
// 규칙 요약: 내 손패(4장)로 자원(은신 △ / 전투 ○)을 만들어 "줄(Line)" 위 장애물과 상호작용한다. 무력화(Disarm)하면 그 카드가 내 덱에 들어오고,
//   기절(Knock Out)시키면 뒤집어 두어 줄이 밀려 나갈 때 경보가 오르지 않는다. 턴 끝: 미션 확인 → 줄 밀기(맨 끝 카드가 나가며 경보↑) → 보충 → 새 손패.
//   경보가 50이 되거나 장애물이 모자라 줄을 못 채우면 패배. 미션 5개를 모두 끝내면 승리(경보 합계가 낮을수록 좋은 기록).
// 규격: 무작위는 전달받은 rng만 / 상태는 JSON / applyMove는 상태를 직접 수정 / 솔로 게임(캐릭터·상대 없음).

// ---------- 카드 데이터 ----------
const PERSON = 'person', PLACE = 'place', GADGET = 'gadget', DOOR = 'door', ANIMAL = 'animal';
export const TYPE_KO = { person: '사람', place: '장소', gadget: '장치', door: '문', animal: '동물' };
const S = n => ({ k: 's', n }), F = n => ({ k: 'f', n }), C = n => ({ k: 'c', n });   // 비용: 은신 / 전투 / 아무 조합

export const DEF = {};      // key -> 카드 정의
export const INST = [];     // uid -> { key }  (uid = 카드 한 장의 영구 번호)
function def(key, grp, n, rew, ob) {
  DEF[key] = { key, grp, n, rew, ob };
  for (let i = 0; i < n; i++) INST.push({ key });
}
// rew(윗면: 내가 얻는 것): res{s,f} 자원 · draw n장 뽑기 · or(자원 또는 뽑기 중 택1) · calc 계산형 자원 · fx 특수효과 · keep 장비(KEEP) · free 이 유형 장애물을 공짜로 상호작용 · once 쓰면 장애물 버린 더미로
// ob(아랫면: 장애물): type · cost{k,n} · alarm · fx(줄 안에서 작동하는 효과)
def('hide', 'S', 3, { ko: '숨기', en: 'Hide', res: { s: 1 }, tx: '은신 1' }, null);
def('punch', 'S', 5, { ko: '펀치', en: 'Punch', res: { f: 1 }, tx: '전투 1' }, null);

// 기본 장애물 덱 (22장)
def('gun', '0', 3, { ko: '총', en: 'Gun', res: { f: 2 }, tx: '전투 2' },
  { ko: '경비병', en: 'Guard', type: PERSON, cost: F(2), alarm: 4 });
def('interrogate', '0', 2, { ko: '심문', en: 'Interrogate', draw: 2, tx: '카드 2장을 뽑는다.' },
  { ko: '순찰 경비병', en: 'Patrolling Guard', type: PERSON, cost: C(5), alarm: 5, fx: 'patrol', tx: '줄 밀기 때 한 칸 더 앞으로 나아간다(오른쪽 카드와 자리를 바꾼다).' });
def('dontmove', '0', 1, { ko: '움직이지 마', en: "Don't Move", res: { s: 3 }, tx: '은신 3' },
  { ko: '동작 감지 복도', en: 'Motion Sensor Hall', type: PLACE, cost: C(6), alarm: 6 });
def('bin', '0', 2, { ko: '휴지통', en: 'Bin', fx: 'bin', tx: '손패에서 원하는 만큼 골라 게임에서 제거한다.' },
  { ko: '폐기물실', en: 'Waste Room', type: PLACE, cost: C(6), alarm: 3 });
def('follow', '0', 2, { ko: '미행', en: 'Follow', res: { s: 1 }, draw: 1, tx: '은신 1 + 카드 1장 뽑기' },
  { ko: '경비견', en: 'Guard Dog', type: ANIMAL, cost: F(5), alarm: 6, fx: 'dog', tx: '나타날 때 줄에 [사람]이 있으면 그 옆까지 미끄러져 붙는다.' });
def('machinegun', '0', 1, { ko: '기관총', en: 'Machine Gun', res: { f: 3 }, tx: '전투 3' },
  { ko: '감시 포탑', en: 'Sentry Gun', type: GADGET, cost: F(5), alarm: 6 });
def('outofsight', '0', 5, { ko: '시야 밖', en: 'Out of Sight', res: { s: 2 }, tx: '은신 2' },
  { ko: '보안 카메라', en: 'Security Camera', type: GADGET, cost: S(2), alarm: 8 });
def('flashy', '0', 1, { ko: '화려한 동작', en: 'Flashy Move', calc: 'flashy', tx: '내 버린 더미 2장당 전투 1 (내림).' },
  { ko: '체육관 문', en: 'Gym Door', type: DOOR, cost: C(9), alarm: 3 });
def('keycard', '0', 1, { ko: '키카드', en: 'Keycard', keep: true, free: DOOR, tx: '장비. 내 버린 더미에 넣으면 [문]과 공짜로 상호작용한다.' },
  { ko: '잠든 경비병', en: 'Sleeping Guard', type: PERSON, cost: S(3), alarm: 0 });
def('chloroform', '0', 1, { ko: '클로로포름', en: 'Chloroform', keep: true, free: PERSON, tx: '장비. 내 버린 더미에 넣으면 [사람]과 공짜로 상호작용한다.' },
  { ko: '의무실', en: 'Infirmary', type: PLACE, cost: S(3), alarm: 3 });
def('rock', '0', 2, { ko: '돌 던지기', en: 'Throw a Rock', res: { f: 1 }, draw: 1, or: true, tx: '전투 1 또는 카드 1장 뽑기' },
  { ko: '운동장 문', en: 'Yard Door', type: DOOR, cost: S(4), alarm: 4 });
def('misdirect', '0', 1, { ko: '시선 돌리기', en: 'Misdirect', fx: 'mis', tx: '손패에서 원하는 만큼 내려놓고, 한 장마다 은신 2를 얻는다.' },
  { ko: '무선 탑', en: 'Radio Tower', type: PLACE, cost: C(7), alarm: 6, fx: 'tower', tx: '나타날 때 줄의 모든 [사람] 카드가 옆으로 붙는다.' });

// 미션 장애물 B (미션 1 이후 추가)
def('gearup', 'B', 1, { ko: '장비 갖추기!', en: 'Gear Up!', fx: 'gearup', tx: '지금 장비 중인 KEEP 하나당 카드 1장을 뽑는다(최대 3장).' },
  { ko: '사이렌', en: 'Siren', type: GADGET, cost: C(12), alarm: 5, fx: 'siren', tx: '줄 밀기로 버려질 때 줄의 모든 카드를 장애물 버린 더미로 보낸다. 경보는 사이렌 것만 오른다.' });
def('guarduniform', 'B', 1, { ko: '경비 제복', en: 'Guard Uniform', res: { s: 1 }, keep: true, tx: '장비. 매 턴 은신 1.' },
  { ko: '탈의실', en: 'Locker Room', type: PLACE, cost: C(8), alarm: 3 });
def('recall', 'B', 1, { ko: '회수', en: 'Recall', fx: 'recall', tx: '내 버린 더미에서 카드 1장을 손으로 가져온다.' },
  { ko: '감독관', en: 'Inspector', type: PERSON, cost: S(7), alarm: 5, fx: 'inspector', tx: '줄 밀기 때 줄 맨 끝 카드를 앞면으로 뒤집는다. "나타날 때" 효과가 발동한다.' });
// 미션 장애물 D (미션 2 이후)
def('planahead', 'D', 1, { ko: '계획', en: 'Plan Ahead', fx: 'plan', tx: '덱 맨 위 3장을 보고 1장을 손에 넣고 나머지는 원하는 순서로 되돌린다.' },
  { ko: '기록 보관소 문', en: 'Archive Door', type: DOOR, cost: F(8), alarm: 4 });
def('distraction', 'D', 1, { ko: '교란', en: 'Distraction', fx: 'dis', tx: '줄의 카드 1장을 줄의 맨 앞(출구 반대편)으로 끌어당긴다.' },
  { ko: '기숙사', en: 'Dormitory', type: PLACE, cost: C(16), alarm: 7, fx: 'dorm', tx: '줄 밀기 때 뒤집힌 카드는 오른쪽으로 밀리지 않는다. 앞면 카드는 그대로 밀린다.' });
def('emp', 'D', 1, { ko: 'E.M.P.', en: 'E.M.P.', keep: true, free: GADGET, tx: '장비. 내 버린 더미에 넣으면 [장치]와 공짜로 상호작용한다.' },
  { ko: '정비 구역', en: 'Engineering Bay', type: PLACE, cost: S(8), alarm: 6 });
def('retrace', 'D', 1, { ko: '발자취 되짚기', en: 'Retrace Steps', fx: 'retrace', tx: '장애물 버린 더미를 장애물 덱에 섞어 새 덱을 만든다.' },
  { ko: '관제실 문', en: 'C.C.T.V. Room Door', type: DOOR, cost: S(12), alarm: 7 });
// 미션 장애물 F (미션 3 이후)
def('justthing', 'F', 1, { ko: '딱 맞는 물건', en: 'Just the Thing', fx: 'just', tx: '내 덱에서 카드 1장을 찾아 덱을 섞고, 그 카드를 맨 위에 올린다.' },
  { ko: '저격수', en: 'Sniper', type: PERSON, cost: F(10), alarm: 6, fx: 'sniper', tx: '줄에 [사람]이 이 카드뿐일 때만 상호작용할 수 있다.' });
def('foresight', 'F', 1, { ko: '선견', en: 'Foresight', fx: 'fore', tx: '덱 맨 위 5장을 보고 원하는 순서로 되돌린다.' },
  { ko: '감시탑', en: 'Watchtower', type: PLACE, cost: S(12), alarm: 7, fx: 'watch', tx: '이웃한 카드의 비용을 2 늘린다.' });
def('prisoner', 'F', 1, { ko: '포로', en: 'Prisoner', res: { f: 1 }, keep: true, tx: '장비. 매 턴 전투 1.' },
  { ko: '감옥 문', en: 'Prison Door', type: DOOR, cost: F(10), alarm: 5 });
def('burn', 'F', 1, { ko: '소각', en: 'Burn', fx: 'burn', tx: '내 버린 더미에서 최대 2장을 게임에서 제거한다.' },
  { ko: '인화성 드럼통', en: 'Flammable Barrel', type: GADGET, cost: C(14), alarm: 3, fx: 'barrel', tx: '상호작용하면 이웃한 카드를 기절시킨다.' });
def('bazooka', 'F', 1, { ko: '바주카', en: 'Bazooka', res: { f: 5 }, once: true, tx: '전투 5. 쓰면 내 버린 더미 대신 장애물 버린 더미로 간다.' },
  { ko: '바주카 경비병', en: 'Guard with Bazooka', type: PERSON, cost: F(8), alarm: 10 });
// 미션 장애물 H (미션 4 이후)
def('optic', 'H', 1, { ko: '광학 위장', en: 'Optic Camouflage', res: { s: 4 }, once: true, tx: '은신 4. 쓰면 장애물 버린 더미로 간다.' },
  { ko: '기술 컨테이너', en: 'Tech Container', type: GADGET, cost: C(10), alarm: 5 });
def('savebullets', 'H', 1, { ko: '탄약 아끼기', en: 'Save Bullets', fx: 'save', tx: '안 쓴 카드 1장을 다음 턴을 위해 남겨 둔다.' },
  { ko: '철조망', en: 'Chain Link Fence', type: PLACE, cost: S(7), alarm: 5 });
def('superspeed', 'H', 1, { ko: '초고속', en: 'Superspeed', draw: 3, tx: '카드 3장을 뽑는다.' },
  { ko: '레이저 복도', en: 'Laser Hall', type: PLACE, cost: S(14), alarm: 10 });
def('heavyhand', 'H', 1, { ko: '묵직한 주먹', en: 'Heavy Hand', res: { f: 3 }, tx: '전투 3' },
  { ko: '서툰 경비병', en: 'Clumsy Guard', type: PERSON, cost: F(8), alarm: 6, fx: 'clumsy', tx: '상호작용할 때, 대신 이웃한 카드 1장을 기절시킬 수 있다.' });
def('autorifle', 'H', 1, { ko: '자동소총', en: 'Auto Rifle', res: { f: 4 }, tx: '전투 4' },
  { ko: '중무장 경비병', en: 'Armored Guard', type: PERSON, cost: F(12), alarm: 8 });
def('swap', 'H', 1, { ko: '교환', en: 'Swap', fx: 'swap', tx: '내 덱과 버린 더미를 통째로 맞바꾼다.' },
  { ko: '매', en: 'Hawk', type: ANIMAL, cost: F(12), alarm: 6, fx: 'hawk', tx: '앞면으로 줄에 있는 동안 은신만 요구하는 카드와는 상호작용할 수 없다.' });

// 미션 5장 (alphabetical: A C E G I). goal: 미션 확인 때 충족해야 하는 조건 / reward: 완료 보상
export const MISSIONS = [
  { n: 1, grp: 'A', ko: '미션 1', goalTx: '은신 6을 모은다', goal: { k: 'res', s: 6 },
    rewTx: '지도(MAP): 장비. 매 턴 은신 1', add: 'B' },
  { n: 2, grp: 'C', ko: '미션 2', goalTx: '전투 6을 모으고, 장비에 경비 제복이 있다', goal: { k: 'res', f: 6, item: 'guarduniform' },
    rewTx: '새 규칙: 한 턴에 장애물 2장과 상호작용', add: 'D' },
  { n: 3, grp: 'E', ko: '미션 3', goalTx: '손에 카드 7장을 들고 있다', goal: { k: 'hand', n: 7 },
    rewTx: '새 규칙: 턴 시작에 카드 5장을 뽑는다', add: 'F' },
  { n: 4, grp: 'G', ko: '미션 4', goalTx: '아무 조합으로 자원 18을 모으고, 장비에 포로가 있다', goal: { k: 'res', c: 18, item: 'prisoner' },
    rewTx: '새 규칙: 한 턴에 장애물 3장과 상호작용', add: 'H' },
  { n: 5, grp: 'I', ko: '미션 5', goalTx: '줄의 카드 6장을 모두 기절시킨다', goal: { k: 'ko6' },
    rewTx: '임무 완수!', add: null }
];

export const MAX_ALARM = 50, LINE_N = 6;
const D = uid => DEF[INST[uid].key];
export const defOf = D;

// ---------- 도우미 ----------
const clip = (v, a, b) => Math.min(b, Math.max(a, v));
function shuf(rng, a) { const c = a.slice(); const r = rng.shuffle(c); return r || c; }
function evPush(s, e) { s.ev.push(e); if (s.ev.length > 80) s.ev.splice(0, s.ev.length - 80); }
const isUp = e => !e.down;
const upFx = (e, fx) => !e.down && D(e.u).ob.fx === fx;

// 장비 칸 항목: { u: 카드번호 } 또는 { m: 미션번호 }
export function equipRes(en) {
  if (en.m) return en.m === 1 ? { s: 1, f: 0 } : null;
  const r = D(en.u).rew.res; return D(en.u).rew.keep && r ? { s: r.s || 0, f: r.f || 0 } : null;
}
export const equipKeep = en => (en.m ? en.m === 1 || en.m === 2 : !!D(en.u).rew.keep);
export const equipKey = en => (en.m ? 'm' + en.m : D(en.u).key);

// ---------- 줄 · 덱 ----------
function drawCards(s, rng, n) {
  let got = 0;
  for (let i = 0; i < n; i++) {
    if (!s.deck.length) { if (!s.discard.length) break; s.deck = shuf(rng, s.discard); s.discard = []; evPush(s, { k: 'reshuffle' }); }
    s.hand.push(s.deck.pop()); got++;
  }
  if (got) evPush(s, { k: 'draw', n: got });
  return got;
}
function ensureDeck(s, rng) {   // 덱이 비어 있으면 버린 더미를 섞어 덱으로
  if (!s.deck.length && s.discard.length) { s.deck = shuf(rng, s.discard); s.discard = []; evPush(s, { k: 'reshuffle' }); }
}

// 줄은 6칸 고정 슬롯(0=왼쪽 … 5=오른쪽 출구). 빈 칸은 null. 칸 사이 순서를 바꾸는 효과는 "점유된 칸들의 순서"만 바꾼다.
const occ = s => s.line.map((e, i) => (e ? i : -1)).filter(i => i >= 0);
export const lineCount = s => s.line.filter(Boolean).length;
function reorderLine(s, seq) { const idx = occ(s); idx.forEach((slot, k) => { s.line[slot] = seq[k]; }); }

// 새 카드가 줄에 놓이면 "나타날 때" 효과가 발동한다
function appear(s, e) {
  if (e.down) return;
  const d = D(e.u).ob, seq = occ(s).map(i => s.line[i]);
  const p = seq.indexOf(e);
  if (d.fx === 'dog') {
    let t = -1;
    for (let j = p + 1; j < seq.length; j++) if (isUp(seq[j]) && D(seq[j].u).ob.type === PERSON) { t = j; break; }
    const rest = seq.slice(); rest.splice(p, 1);
    if (t >= 0) { rest.splice(t - 1, 0, e); reorderLine(s, rest); }                // 사람 바로 왼쪽까지 미끄러진다
    else { for (let j = p - 1; j >= 0; j--) if (isUp(seq[j]) && D(seq[j].u).ob.type === PERSON) { rest.splice(j + 1, 0, e); reorderLine(s, rest); break; } }
  } else if (d.fx === 'tower') {
    const ppl = seq.filter(x => x !== e && isUp(x) && D(x.u).ob.type === PERSON);
    if (ppl.length) {
      const rest = seq.filter(x => x !== e && !ppl.includes(x));
      const before = seq.slice(0, p).filter(x => rest.includes(x)), after = seq.slice(p + 1).filter(x => rest.includes(x));
      reorderLine(s, [...before, e, ...ppl, ...after]);
    }
  }
}
function placeNew(s, rng) {
  const slot = s.line.lastIndexOf(null);
  if (slot < 0) return true;
  if (!s.oDeck.length) { if (!s.oDiscard.length) return false; s.oDeck = shuf(rng, s.oDiscard); s.oDiscard = []; evPush(s, { k: 'oreshuffle' }); }
  const e = { u: s.oDeck.pop(), down: false };
  s.line[slot] = e;
  evPush(s, { k: 'appear', u: e.u });
  appear(s, e);
  return true;
}
function fillLine(s, rng) {
  while (s.line.includes(null)) {
    if (!placeNew(s, rng)) { lose(s, 'time'); return false; }
  }
  return true;
}
function lose(s, why) { s.over = true; s.won = false; s.why = why; s.pend = null; evPush(s, { k: 'over', won: false, why }); }

// 이웃한 카드 비용 보정 · 상호작용 제한
export function effCost(s, l) {
  const base = D(s.line[l].u).ob.cost; let add = 0;
  for (const j of [l - 1, l + 1]) if (s.line[j] && upFx(s.line[j], 'watch')) add += 2;
  return { k: base.k, n: base.n + add };
}
export function blockReason(s, l) {
  const e = s.line[l], d = D(e.u).ob;
  if (e.down) return '기절한 카드';
  if (d.fx === 'sniper' && s.line.some(x => x && x !== e && isUp(x) && D(x.u).ob.type === PERSON)) return '줄에 다른 [사람]이 있어 건드릴 수 없다';
  if (d.cost.k === 's' && s.line.some(x => x && upFx(x, 'hawk'))) return '매가 지켜보고 있어 은신만으로는 안 된다';
  return null;
}
function payOptions(s, cost) {
  const out = [], ps = s.pool.s, pf = s.pool.f;
  if (cost.k === 's') { if (ps >= cost.n) out.push({ s: cost.n, f: 0 }); }
  else if (cost.k === 'f') { if (pf >= cost.n) out.push({ s: 0, f: cost.n }); }
  else for (let a = Math.max(0, cost.n - pf); a <= Math.min(cost.n, ps); a++) out.push({ s: a, f: cost.n - a });
  return out;
}
const adjIdx = (s, l) => [l - 1, l + 1].filter(j => j >= 0 && j < LINE_N && s.line[j]);
const koAdj = (s, l) => { for (const j of adjIdx(s, l)) if (!s.line[j].down) { s.line[j].down = true; evPush(s, { k: 'ko', u: s.line[j].u }); } };

// ---------- 상태 ----------
export function newState(rng) {
  const s = {
    v: 1, alarm: 0, alarmLog: [], mission: 1, turn: 1, drawN: 4, maxInt: 1, used: 0,
    pool: { s: 0, f: 0 }, deck: [], hand: [], discard: [], play: [], equip: [], saved: [], removed: [],
    oDeck: [], oDiscard: [], line: Array(LINE_N).fill(null), pend: null, over: false, won: false, why: '', ev: [], stat: { disarm: 0, ko: 0, exits: 0 }
  };
  const start = [], base = [];
  INST.forEach((c, uid) => { if (DEF[c.key].grp === 'S') start.push(uid); else if (DEF[c.key].grp === '0') base.push(uid); });
  s.deck = shuf(rng, start); s.oDeck = shuf(rng, base);
  fillLine(s, rng);
  drawCards(s, rng, s.drawN);
  beginTurn(s);
  s.ev = [];
  return s;
}
function beginTurn(s) {
  s.used = 0; s.pool = { s: 0, f: 0 };
  for (const en of s.equip) { const r = equipRes(en); if (r) { s.pool.s += r.s; s.pool.f += r.f; } }
}

// ---------- 미션 ----------
export function goalMet(s) {
  if (s.over) return false;
  const g = MISSIONS[s.mission - 1].goal;
  if (g.item && !s.equip.some(en => !en.m && D(en.u).key === g.item)) return false;
  if (g.k === 'hand') return s.hand.length >= g.n;
  if (g.k === 'ko6') return s.line.every(e => e && e.down);
  if (g.c) return s.pool.s + s.pool.f >= g.c;
  return s.pool.s >= (g.s || 0) && s.pool.f >= (g.f || 0);
}
function missionComplete(s, rng) {
  const m = MISSIONS[s.mission - 1];
  s.alarmLog.push(s.alarm);
  evPush(s, { k: 'mission', n: s.mission, alarm: s.alarm });
  if (s.mission === 5) { s.over = true; s.won = true; s.why = 'clear'; s.pend = null; evPush(s, { k: 'over', won: true }); return; }
  // 보상 (미션 카드가 장비 칸으로)
  s.equip.push({ m: s.mission });
  if (s.mission === 2) s.maxInt = 2; else if (s.mission === 3) s.drawN = 5; else if (s.mission === 4) s.maxInt = 3;
  // 전진: 다음 미션 장애물을 장애물 버린 더미로
  INST.forEach((c, uid) => { if (DEF[c.key].grp === m.add) s.oDiscard.push(uid); });
  // 새 줄: 장애물 버린 더미 + 줄 + 장애물 덱을 섞는다 (기절 카드도 앞면으로)
  s.oDeck = shuf(rng, [...s.oDeck, ...s.oDiscard, ...s.line.filter(Boolean).map(e => e.u)]);
  s.oDiscard = []; s.line = Array(LINE_N).fill(null);
  s.alarm = 0;
  // 내 덱: 놀이 영역·버린 더미·덱·손패를 모두 섞는다 (장비는 그대로)
  s.deck = shuf(rng, [...s.deck, ...s.discard, ...s.play, ...s.hand, ...s.saved]);
  s.discard = []; s.play = []; s.hand = []; s.saved = [];
  s.mission++;
  if (!fillLine(s, rng)) return;
  drawCards(s, rng, s.drawN);
  s.turn++; beginTurn(s);
}

// ---------- 턴 끝 처리 ----------
function exitCard(s, e, tag) {   // 줄에서 밀려 나간 카드를 장애물 버린 더미로
  const d = D(e.u).ob;
  s.oDiscard.push(e.u); s.stat.exits++;
  const add = e.down ? 0 : d.alarm;
  s.alarm += add;
  evPush(s, { k: 'exit', u: e.u, down: e.down, alarm: add, tag });
  return add;
}
function lineScroll(s) {
  const L = s.line;
  // 감독관: 맨 끝(출구) 카드를 앞면으로
  if (L[5] && L[5].down && L.some(e => e && upFx(e, 'inspector'))) { L[5].down = false; evPush(s, { k: 'flip', u: L[5].u }); appear(s, L[5]); }
  const dorm = L.some(e => e && upFx(e, 'dorm'));
  let out = null;
  if (!dorm) {
    out = L[5]; L[5] = null;
    const seq = L.filter(Boolean); L.fill(null);
    seq.forEach((e, k) => { L[LINE_N - seq.length + k] = e; });          // 오른쪽으로 모두 밀기
  } else {   // 기숙사: 뒤집힌 카드는 제자리에 남고, 앞면 카드만 오른쪽으로 흘러 맨 오른쪽 앞면 카드가 나간다
    const ups = L.filter(e => e && !e.down);
    if (ups.length) {
      out = ups.pop();
      const fixed = L.map((e, i) => (e && e.down ? i : -1)).filter(i => i >= 0);
      const free = L.map((_, i) => i).filter(i => !fixed.includes(i));
      for (let i = 0; i < LINE_N; i++) if (!fixed.includes(i)) L[i] = null;
      ups.forEach((e, k) => { L[free[free.length - ups.length + k]] = e; });
    }
  }
  if (out) {
    exitCard(s, out, 'scroll');
    if (!out.down && D(out.u).ob.fx === 'siren') {   // 사이렌: 줄 전체가 장애물 버린 더미로 (경보는 사이렌만)
      L.filter(Boolean).forEach(e => s.oDiscard.push(e.u));
      evPush(s, { k: 'siren' });
      L.fill(null);
      if (s.alarm >= MAX_ALARM) lose(s, 'alarm');
      return;
    }
  }
  // 순찰 경비병: 오른쪽 카드와 자리 바꾸기 (맨 끝이면 그대로 나가 버린다)
  const guards = occ(s).map(i => L[i]).filter(e => upFx(e, 'patrol')).reverse();
  for (const e of guards) {
    const seq = occ(s).map(i => L[i]), p = seq.indexOf(e);
    if (p === seq.length - 1) { L[L.indexOf(e)] = null; exitCard(s, e, 'patrol'); }
    else { [seq[p], seq[p + 1]] = [seq[p + 1], seq[p]]; reorderLine(s, seq); }
  }
  if (s.alarm >= MAX_ALARM) lose(s, 'alarm');
}
function cleanup(s, rng) {
  s.discard.push(...s.hand, ...s.play);
  s.hand = []; s.play = [];
  const keep = s.saved; s.saved = [];
  s.hand.push(...keep);
  drawCards(s, rng, s.drawN);
  s.turn++; beginTurn(s);
}
function endPhase(s, rng) {
  evPush(s, { k: 'end' });
  if (goalMet(s)) return missionComplete(s, rng);
  lineScroll(s);
  if (s.over) return;
  if (!fillLine(s, rng)) return;
  cleanup(s, rng);
}

// ---------- 합법 수 ----------
const SUBS = (n, max) => { const out = []; const rec = (i, cur) => { if (i === n) { out.push(cur.slice()); return; } rec(i + 1, cur); if (cur.length < max) { cur.push(i); rec(i + 1, cur); cur.pop(); } }; rec(0, []); return out; };
const PERMS = a => { if (a.length <= 1) return [a.slice()]; const out = []; a.forEach((x, i) => PERMS([...a.slice(0, i), ...a.slice(i + 1)]).forEach(p => out.push([x, ...p]))); return out; };
const uniqBy = (idxs, keyf) => { const seen = new Set(), out = []; for (const i of idxs) { const k = keyf(i); if (!seen.has(k)) { seen.add(k); out.push(i); } } return out; };
export const topOf = (s, n) => s.deck.slice(-n).reverse();   // 덱 맨 위부터

export function legalMoves(s) {
  if (s.over) return [];
  const p = s.pend;
  if (p) {
    switch (p.k) {
      case 'bin': case 'mis': return SUBS(s.hand.length, 99).map(set => ({ a: p.k, set }));
      case 'burn': return SUBS(s.discard.length, 2).map(set => ({ a: 'burn', set }));
      case 'rec': return uniqBy(s.discard.map((_, i) => i), i => INST[s.discard[i]].key).map(i => ({ a: 'rec', i }));
      case 'just': return uniqBy(s.deck.map((_, i) => i), i => INST[s.deck[i]].key).map(i => ({ a: 'just', i }));
      case 'dis': return occ(s).slice(1).map(i => ({ a: 'dis', l: i }));
      case 'save': return [{ a: 'save', i: -1 }, ...uniqBy(s.hand.map((_, i) => i), i => INST[s.hand[i]].key).map(i => ({ a: 'save', i }))];
      case 'plan': {
        const v = topOf(s, 3), out = [];
        v.forEach((_, k) => { const rest = v.map((__, i) => i).filter(i => i !== k); PERMS(rest).forEach(o => out.push({ a: 'plan', k, o })); });
        return out;
      }
      case 'fore': { const v = topOf(s, 5); return PERMS(v.map((_, i) => i)).map(o => ({ a: 'fore', o })); }
    }
    return [];
  }
  const out = [{ a: 'end' }];
  s.hand.forEach((uid, i) => {
    const r = D(uid).rew;
    const hasRes = !!(r.res || r.calc), hasFx = !!(r.fx || r.draw);
    if (hasRes && hasFx && r.or) { out.push({ a: 'res', c: i }); out.push({ a: 'fx', c: i }); }
    else if (hasRes) out.push({ a: 'res', c: i });
    else if (hasFx) out.push({ a: 'fx', c: i });
    if (r.keep) out.push({ a: 'equip', c: i });
  });
  if (s.used < s.maxInt) {
    s.line.forEach((e, l) => {
      if (!e || blockReason(s, l)) return;
      const d = D(e.u).ob, cost = effCost(s, l);
      const pays = payOptions(s, cost).map(x => ({ s: x.s, f: x.f, it: -1 }));
      s.equip.forEach((en, it) => { if (!en.m && D(en.u).rew.free === d.type) pays.push({ s: 0, f: 0, it }); });
      for (const pay of pays) {
        out.push({ a: 'int', l, o: 'd', adj: -1, s: pay.s, f: pay.f, it: pay.it });
        out.push({ a: 'int', l, o: 'k', adj: -1, s: pay.s, f: pay.f, it: pay.it });
        if (d.fx === 'clumsy') adjIdx(s, l).filter(j => !s.line[j].down).forEach(j => out.push({ a: 'int', l, o: 'a', adj: j, s: pay.s, f: pay.f, it: pay.it }));
      }
    });
  }
  return out;
}

// ---------- 수 적용 ----------
function playToArea(s, i) {            // 손패 → 놀이 영역 (once 카드는 장애물 버린 더미로)
  const uid = s.hand.splice(i, 1)[0];
  if (D(uid).rew.once) s.oDiscard.push(uid); else s.play.push(uid);
  return uid;
}
function startFx(s, rng, key) {         // 특수효과 → 필요하면 선택 대기(pend)
  switch (key) {
    case 'bin': if (s.hand.length) s.pend = { k: 'bin' }; break;
    case 'mis': if (s.hand.length) s.pend = { k: 'mis' }; break;
    case 'gearup': drawCards(s, rng, Math.min(3, s.equip.filter(equipKeep).length)); break;
    case 'recall': if (s.discard.length) s.pend = { k: 'rec' }; break;
    case 'plan': ensureDeck(s, rng); if (s.deck.length > 1) s.pend = { k: 'plan' }; else if (s.deck.length === 1) s.hand.push(s.deck.pop()); break;
    case 'dis': if (lineCount(s) > 1) s.pend = { k: 'dis' }; break;
    case 'retrace': s.oDeck = shuf(rng, [...s.oDeck, ...s.oDiscard]); s.oDiscard = []; evPush(s, { k: 'oreshuffle' }); break;
    case 'just': ensureDeck(s, rng); if (s.deck.length) s.pend = { k: 'just' }; break;
    case 'fore': ensureDeck(s, rng); if (s.deck.length > 1) s.pend = { k: 'fore' }; break;
    case 'burn': if (s.discard.length) s.pend = { k: 'burn' }; break;
    case 'save': if (s.hand.length) s.pend = { k: 'save' }; break;
    case 'swap': { const t = s.deck; s.deck = s.discard; s.discard = t; evPush(s, { k: 'swap' }); break; }
  }
}

export function applyMove(s, m, rng) {
  if (s.over) throw new Error('이미 끝난 게임');
  if (!legalMoves(s).some(x => JSON.stringify(x) === JSON.stringify(m))) throw new Error('불법 수: ' + JSON.stringify(m));
  switch (m.a) {
    case 'end': endPhase(s, rng); return s;
    case 'res': case 'fx': {
      const uid = s.hand[m.c], r = D(uid).rew;
      playToArea(s, m.c);
      evPush(s, { k: 'play', u: uid, mode: m.a });
      if (m.a === 'res') {
        if (r.calc === 'flashy') s.pool.f += Math.floor(s.discard.length / 2);
        else { s.pool.s += r.res.s || 0; s.pool.f += r.res.f || 0; }
        if (r.draw && !r.or) drawCards(s, rng, r.draw);
      } else {
        if (r.draw) drawCards(s, rng, r.draw);
        if (r.fx) startFx(s, rng, r.fx);
      }
      return s;
    }
    case 'equip': {
      const uid = s.hand.splice(m.c, 1)[0];
      s.equip.push({ u: uid });
      evPush(s, { k: 'equip', u: uid });
      const re = equipRes(s.equip[s.equip.length - 1]); if (re) { s.pool.s += re.s; s.pool.f += re.f; }
      return s;
    }
    case 'int': {
      const e = s.line[m.l], d = D(e.u).ob;
      if (m.it >= 0) { const en = s.equip.splice(m.it, 1)[0]; s.discard.push(en.u); evPush(s, { k: 'useItem', u: en.u }); }
      else { s.pool.s -= m.s; s.pool.f -= m.f; }
      s.used++;
      evPush(s, { k: 'int', u: e.u, o: m.o });
      if (d.fx === 'barrel') koAdj(s, m.l);
      if (m.o === 'a') { s.line[m.adj].down = true; s.stat.ko++; evPush(s, { k: 'ko', u: s.line[m.adj].u }); return s; }
      if (m.o === 'k') { e.down = true; s.stat.ko++; evPush(s, { k: 'ko', u: e.u }); return s; }
      // 무력화: 줄에서 빼서 내 쪽으로
      s.line[m.l] = null; s.stat.disarm++;
      if (D(e.u).rew.keep) { s.equip.push({ u: e.u }); const re = equipRes(s.equip[s.equip.length - 1]); if (re) { s.pool.s += re.s; s.pool.f += re.f; } evPush(s, { k: 'equip', u: e.u }); }
      else s.play.push(e.u);
      return s;
    }
    case 'bin': {
      const set = m.set.slice().sort((a, b) => b - a); const gone = [];
      for (const i of set) gone.push(s.hand.splice(i, 1)[0]);
      s.removed.push(...gone); s.pend = null; evPush(s, { k: 'bin', n: gone.length }); return s;
    }
    case 'mis': {
      const set = m.set.slice().sort((a, b) => b - a);
      for (const i of set) s.play.push(s.hand.splice(i, 1)[0]);
      s.pool.s += 2 * set.length; s.pend = null; evPush(s, { k: 'mis', n: set.length }); return s;
    }
    case 'burn': {
      const set = m.set.slice().sort((a, b) => b - a);
      for (const i of set) s.removed.push(s.discard.splice(i, 1)[0]);
      s.pend = null; evPush(s, { k: 'burn', n: set.length }); return s;
    }
    case 'rec': s.hand.push(s.discard.splice(m.i, 1)[0]); s.pend = null; evPush(s, { k: 'rec' }); return s;
    case 'just': {
      const uid = s.deck.splice(m.i, 1)[0];
      s.deck = shuf(rng, s.deck); s.deck.push(uid); s.pend = null; evPush(s, { k: 'just' }); return s;
    }
    case 'dis': { const seq = occ(s).map(i => s.line[i]); const e = seq.splice(occ(s).indexOf(m.l), 1)[0]; seq.unshift(e); reorderLine(s, seq); s.pend = null; evPush(s, { k: 'dis' }); return s; }
    case 'save': { if (m.i >= 0) s.saved.push(s.hand.splice(m.i, 1)[0]); s.pend = null; evPush(s, { k: 'save', n: m.i >= 0 ? 1 : 0 }); return s; }
    case 'plan': {
      const v = topOf(s, 3), n = v.length;
      s.deck.splice(s.deck.length - n, n);
      s.hand.push(v[m.k]);
      for (let j = m.o.length - 1; j >= 0; j--) s.deck.push(v[m.o[j]]);   // o[0]이 맨 위
      s.pend = null; evPush(s, { k: 'plan' }); return s;
    }
    case 'fore': {
      const v = topOf(s, 5), n = v.length;
      s.deck.splice(s.deck.length - n, n);
      for (let j = m.o.length - 1; j >= 0; j--) s.deck.push(v[m.o[j]]);
      s.pend = null; evPush(s, { k: 'fore' }); return s;
    }
  }
  throw new Error('알 수 없는 수: ' + JSON.stringify(m));
}

// ---------- 봇 (자동 테스트·시뮬레이션용 / 솔로 게임이라 화면에서는 쓰지 않는다) ----------
// 합법 수 목록 안에서만 고른다. 규칙을 확인하고 난이도(이길 수 있는 게임인지)를 재는 용도.
function cardValue(uid) {
  const r = D(uid).rew;
  let v = 0;
  if (r.res) v += (r.res.s || 0) + (r.res.f || 0);
  if (r.calc) v += 2;
  if (r.draw) v += r.draw * 1.3;
  if (r.keep) v += r.res ? 4 : 2.5;
  if (r.fx === 'plan' || r.fx === 'recall' || r.fx === 'gearup') v += 1.5;
  if (r.fx === 'swap' || r.fx === 'retrace') v -= 1;
  if (r.once) v -= 0.5;
  return v;
}
const PLAYFX = new Set(['gearup']);   // 봇이 직접 쓰는 특수효과 카드 (나머지는 필요할 때만)
function pickSplit(s, group) {          // 같은 상호작용의 지불 방식 중 하나: 미션 목표를 위해 남겨 둘 자원을 아낀다
  const g = MISSIONS[s.mission - 1].goal;
  const keepS = g.s ? 1 : 0, keepF = g.f ? 1 : 0;
  let best = group[0], bs = -Infinity;
  for (const m of group) {
    const rs = s.pool.s - m.s, rf = s.pool.f - m.f;
    const sc = keepS * rs * 3 + keepF * rf * 3 - Math.abs(rs - rf) * 0.1;
    if (sc > bs) { bs = sc; best = m; }
  }
  return best;
}
export function botChoose(s, traits, rng) {
  const moves = legalMoves(s);
  const p = s.pend;
  if (p) {
    const one = (arr, f) => arr.reduce((b, x) => (f(x) > f(b) ? x : b), arr[0]);
    switch (p.k) {
      case 'bin': { const set = s.hand.map((u, i) => (D(u).grp === 'S' && s.mission >= 2 ? i : -1)).filter(i => i >= 0); return { move: { a: 'bin', set }, reason: 'thin' }; }
      case 'mis': return { move: { a: 'mis', set: s.hand.map((_, i) => i) }, reason: 'all' };
      case 'burn': { const set = s.discard.map((u, i) => (D(u).grp === 'S' ? i : -1)).filter(i => i >= 0).slice(0, 2); return { move: { a: 'burn', set }, reason: 'thin' }; }
      case 'rec': return { move: one(moves, m => cardValue(s.discard[m.i])), reason: 'best' };
      case 'just': return { move: one(moves, m => cardValue(s.deck[m.i])), reason: 'best' };
      case 'dis': return { move: moves[moves.length - 1], reason: 'pull' };
      case 'save': return { move: one(moves, m => (m.i < 0 ? -1 : cardValue(s.hand[m.i]))), reason: 'best' };
      case 'plan': { const v = topOf(s, 3); return { move: one(moves, m => cardValue(v[m.k]) * 10 + m.o.reduce((a, i, j) => a + cardValue(v[i]) * (3 - j) * 0.01, 0)), reason: 'best' }; }
      case 'fore': { const v = topOf(s, 5); return { move: one(moves, m => m.o.reduce((a, i, j) => a + cardValue(v[i]) * (6 - j), 0)), reason: 'order' }; }
    }
  }
  const mission = s.mission, g = MISSIONS[mission - 1].goal;
  if (goalMet(s)) return { move: { a: 'end' }, reason: 'goal' };
  // 1) 장비
  const eq = moves.find(m => m.a === 'equip'); if (eq) return { move: eq, reason: 'equip' };
  // 2) 카드 뽑기 효과 먼저
  const fxm = moves.filter(m => m.a === 'fx' && (D(s.hand[m.c]).rew.draw || PLAYFX.has(D(s.hand[m.c]).rew.fx)) && !(D(s.hand[m.c]).rew.fx && !PLAYFX.has(D(s.hand[m.c]).rew.fx)));
  if (fxm.length && !(g.k === 'hand' && s.hand.length >= g.n)) return { move: fxm[0], reason: 'draw' };
  // 3) 자원 카드 (미션 3은 손패를 모으는 게 목표라 자원은 쓰지 않는다)
  if (g.k !== 'hand') {
    const rm = moves.filter(m => m.a === 'res');
    if (rm.length) return { move: rm.reduce((b, m) => (cardValue(s.hand[m.c]) > cardValue(s.hand[b.c]) ? m : b), rm[0]), reason: 'res' };
  } else if (s.hand.length < g.n) {
    const rm = moves.filter(m => m.a === 'fx' && D(s.hand[m.c]).rew.draw);
    if (rm.length) return { move: rm[0], reason: 'draw' };
  }
  // 4) 상호작용: 가치 계산
  const groups = new Map();
  for (const m of moves) if (m.a === 'int') { const key = [m.l, m.o, m.adj, m.it].join(); (groups.get(key) || groups.set(key, []).get(key)).push(m); }
  let best = null, bs = 0.4;
  for (const group of groups.values()) {
    const m0 = group[0], e = s.line[m0.l], d = D(e.u), dist = 5 - m0.l;
    const cost = m0.it >= 0 ? 1.5 : m0.s + m0.f;
    let gain = 0;
    const fac = clip(1 - dist / 6, 0.12, 1), sav = d.ob.alarm * fac * (e.down ? 0 : 1);
    if (g.k === 'ko6') gain = m0.o === 'k' ? 6 : -9;
    else if (m0.o === 'd') {
      gain = cardValue(e.u) * 1.4 + 1 + sav;
      if (g.item && d.key === g.item) gain += 12;
      if (mission === 1 && d.rew.res && d.rew.res.s) gain += 1.5;
    } else if (m0.o === 'k') gain = sav * 0.95;
    else gain = sav * 0.9 + 1;
    if (g.k === 'hand') gain -= 3;
    const net = gain - cost * 0.75;
    if (net > bs) { bs = net; best = pickSplit(s, group); }
  }
  if (best) return { move: best, reason: best.o === 'd' ? 'disarm' : 'knock' };
  return { move: { a: 'end' }, reason: 'end' };
}

// ---------- 모듈 ----------
export default {
  meta: { id: 'agentdecker', name: '에이전트 데커', version: '1.0.0', players: { min: 1, max: 1 }, minutes: 60, campaign: null, autosave: { schema: 1 } },

  newGame({ rng }) { return newState(rng); },
  currentSeat: () => 0,
  isOver: s => s.over,
  legalMoves,
  applyMove,
  botChoose,

  result(s) {
    const total = s.alarmLog.reduce((a, b) => a + b, 0) + (s.won ? 0 : s.alarm);
    const why = { alarm: '경보 50 도달', time: '장애물 고갈', clear: '임무 완수' }[s.why] || '';
    return {
      coop: { won: !!s.won, score: total },
      summary: s.won ? `임무 완수 · 경보 합계 ${total}` : `작전 실패(${why}) · 미션 ${s.mission} · 경보 합계 ${total}`,
      detail: { missions: s.won ? 5 : s.alarmLog.length, alarm: total, turns: s.turn, disarm: s.stat.disarm, ko: s.stat.ko }
    };
  },

  mount(container, ctx) { return mountAD(this, container, ctx); }
};

export const _internal = { DEF, INST, MISSIONS, goalMet, legalMoves, cardValue, newState, endPhase, lineScroll, appear };

// ---------- 화면: "비밀 요원 작전 파일" 테마 (스타일은 .g-ad 안에서만, 접두사 ad-) ----------
const SYM_S = '#4458c9', SYM_F = '#d8323c';
function symSvg(k, n, cls = '') {   // k: s 은신(삼각) / f 전투(원) / c 조합(원+삼각)
  const num = n == null ? '' : `<text x="20" y="${k === 's' ? 32 : 26}" text-anchor="middle" class="n">${n}</text>`;
  if (k === 's') return `<svg viewBox="0 0 40 40" class="ad-sym ${cls}"><path d="M20 4 L37 35 H3 Z" fill="${SYM_S}" stroke="#c9d2ff" stroke-width="2.4" stroke-linejoin="round"/>${num}</svg>`;
  if (k === 'f') return `<svg viewBox="0 0 40 40" class="ad-sym ${cls}"><circle cx="20" cy="20" r="16" fill="${SYM_F}" stroke="#ffd0d3" stroke-width="2.4"/>${num}</svg>`;
  return `<svg viewBox="0 0 40 40" class="ad-sym ${cls}"><circle cx="20" cy="20" r="16" fill="${SYM_S}" stroke="#c9d2ff" stroke-width="2.4"/><path d="M20 7 L33 31 H7 Z" fill="none" stroke="${SYM_F}" stroke-width="2.6" stroke-linejoin="round"/>${num}</svg>`;
}
const alarmSvg = n => `<svg viewBox="0 0 40 40" class="ad-sym al"><circle cx="20" cy="20" r="15" fill="#101418" stroke="#fff" stroke-width="2.6"/><path d="M20 1v6M20 33v6M1 20h6M33 20h6" stroke="#fff" stroke-width="2.6"/><text x="20" y="26" text-anchor="middle" class="n">${n}</text></svg>`;
const TYPE_SVG = {
  person: '<svg viewBox="0 0 24 24" class="ad-ty"><circle cx="12" cy="7.5" r="4"/><path d="M4 21c0-5 3.6-8 8-8s8 3 8 8z"/></svg>',
  place: '<svg viewBox="0 0 24 24" class="ad-ty"><path d="M12 2a7 7 0 0 0-7 7c0 5 7 13 7 13s7-8 7-13a7 7 0 0 0-7-7zm0 9.5A2.5 2.5 0 1 1 12 6.5a2.5 2.5 0 0 1 0 5z"/></svg>',
  gadget: '<svg viewBox="0 0 24 24" class="ad-ty"><path d="M12 2a7 7 0 0 0-4 12.7V17h8v-2.3A7 7 0 0 0 12 2zM9 19h6v1.5a1.5 1.5 0 0 1-1.5 1.5h-3A1.5 1.5 0 0 1 9 20.5z"/></svg>',
  door: '<svg viewBox="0 0 24 24" class="ad-ty"><path d="M6 2h12v20H6zM15 11a1.3 1.3 0 1 0 0 2.6 1.3 1.3 0 0 0 0-2.6z" fill-rule="evenodd"/></svg>',
  animal: '<svg viewBox="0 0 24 24" class="ad-ty"><ellipse cx="12" cy="16.5" rx="5" ry="4"/><circle cx="5.5" cy="11" r="2.1"/><circle cx="9.5" cy="6.5" r="2.1"/><circle cx="14.5" cy="6.5" r="2.1"/><circle cx="18.5" cy="11" r="2.1"/></svg>'
};
const resTx = r => [r.s ? `은신 ${r.s}` : '', r.f ? `전투 ${r.f}` : ''].filter(Boolean).join(' · ');
const costTx = c => (c.k === 's' ? `은신 ${c.n}` : c.k === 'f' ? `전투 ${c.n}` : `조합 ${c.n}`);
const esc = x => String(x).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// 카드의 윗면(얻는 것) 요약 아이콘
function rewBadge(r) {
  let h = '';
  if (r.res) { if (r.res.s) h += symSvg('s', r.res.s, 'sm'); if (r.res.f) h += symSvg('f', r.res.f, 'sm'); }
  if (r.calc) h += '<span class="ad-x">X</span>';
  if (r.draw && !r.res) h += `<span class="ad-draw">+${r.draw}장</span>`;
  if (r.keep) h += '<span class="ad-keep">KEEP</span>';
  return h;
}

// 앱의 "카드 그림" 칸(group 'card')에 올리는 파일 순서 = card-01 ~ card-38
const ART_ORDER = ['hide','punch','gun','interrogate','dontmove','bin','follow','machinegun','outofsight','flashy','keycard','chloroform','rock','misdirect','gearup','guarduniform','recall','planahead','distraction','emp','retrace','justthing','foresight','prisoner','burn','bazooka','optic','savebullets','superspeed','heavyhand','autorifle','swap','m1','m2','m3','m4','m5','alarm'];

function goalProgress(s) {
  const g = MISSIONS[s.mission - 1].goal, parts = [];
  if (g.k === 'hand') parts.push([`손패 ${s.hand.length}/${g.n}`, s.hand.length >= g.n]);
  else if (g.k === 'ko6') { const n = s.line.filter(e => e && e.down).length; parts.push([`기절 ${n}/6`, n === 6]); }
  else {
    if (g.c) parts.push([`자원 ${s.pool.s + s.pool.f}/${g.c}`, s.pool.s + s.pool.f >= g.c]);
    if (g.s) parts.push([`은신 ${s.pool.s}/${g.s}`, s.pool.s >= g.s]);
    if (g.f) parts.push([`전투 ${s.pool.f}/${g.f}`, s.pool.f >= g.f]);
    if (g.item) { const has = s.equip.some(en => !en.m && D(en.u).key === g.item); parts.push([`${D(INST.findIndex(c => c.key === g.item)).rew.ko} 장비`, has]); }
  }
  return parts;
}

function mountAD(self, container, ctx) {
  const rng = ctx.rng, th = ctx.theme || {};
  const fx = ctx.fx ? ctx.fx.scope(container) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : k === 'rect' || k === 'union' ? () => null : () => Promise.resolve()) });
  const artArr = ctx.art ? ctx.art('card') : [];
  const ART = Array.isArray(artArr) && artArr.length >= ART_ORDER.length ? artArr : null;
  const artOf = uid => (ART ? ART[ART_ORDER.indexOf(INST[uid].key)] || null : null);
  const bgArr = ctx.art ? ctx.art('bg') : [];
  const BG = Array.isArray(bgArr) && bgArr.length ? bgArr[0] : null;
  const timers = new Set(); let dead = false;
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const safe = fn => { try { fn(); } catch (e) { /* 연출은 실패해도 게임을 멈추지 않는다 */ } };
  let s = null, ui = { sheet: null }, logLines = [], finished = false, busy = false;

  container.innerHTML = `<style>${AD_CSS}</style>
  <div class="g-ad" style="--acc:${th.accent || '#4aa3ff'};--bg1:${th.table || '#10294a'};--bg2:${th.table2 || '#060f1a'}">
    <div class="ad-top"></div>
    <div class="ad-goal"></div>
    <div class="ad-linewrap"><div class="ad-line"></div></div>
    <div class="ad-exit"></div>
    <div class="ad-pool"></div>
    <div class="ad-equip"></div>
    <div class="ad-hand"></div>
    <div class="ad-bar"></div>
    <div data-skin="panel" class="ad-log"></div>
    <div class="ad-sheet" hidden></div>
    <div class="ad-over" hidden></div>
  </div>`;
  const root = container.querySelector('.g-ad');
  if (BG) { root.style.backgroundImage = `linear-gradient(#0008,#000b),url(${BG})`; root.style.backgroundSize = 'cover'; root.style.backgroundPosition = 'center'; root.style.backgroundAttachment = 'local'; }
  const q = x => root.querySelector(x);
  const el = { top: q('.ad-top'), goal: q('.ad-goal'), line: q('.ad-line'), exit: q('.ad-exit'), pool: q('.ad-pool'), equip: q('.ad-equip'), hand: q('.ad-hand'), bar: q('.ad-bar'), log: q('.ad-log'), sheet: q('.ad-sheet'), over: q('.ad-over') };

  const log = (t, cls) => { logLines.push({ t, cls }); if (logLines.length > 60) logLines.shift(); };
  const nm = u => D(u).rew.ko;          // 카드 윗면 이름(내 카드로서의 이름)
  const on = u => D(u).ob.ko;           // 아랫면 이름(장애물로서의 이름)

  // ----- 카드 그리기 -----
  function lineCard(e, l) {
    if (!e) return `<div class="ad-slot empty"><span>빈 칸</span></div>`;
    const d = D(e.u), o = d.ob, r = d.rew, last = l === 5;
    const blocked = blockReason(s, l);
    const cost = e.down ? null : effCost(s, l);
    const watch = cost && cost.n !== o.cost.n;
    const img = e.down ? null : artOf(e.u);
    if (img) return `<div data-skin="card" class="ad-card ob img ${blocked ? 'blk' : ''} ${ui.sheet && ui.sheet.k === 'line' && ui.sheet.l === l ? 'sel' : ''}" data-act="line" data-l="${l}" data-u="${e.u}" style="background-image:url(${img})">
      ${watch ? `<span class="ad-wc">${symSvg(o.cost.k, cost.n)}</span>` : ''}${last ? '<i class="ad-exm">출구</i>' : ''}${blocked ? '<i class="ad-lock">🔒</i>' : ''}</div>`;
    if (e.down) return `<div data-skin="card" class="ad-card ob down" data-u="${e.u}"><div class="ad-dn"><b>기절</b><small>${esc(o.ko)}</small></div>${last ? '<i class="ad-exm">출구</i>' : ''}</div>`;
    return `<div data-skin="card" class="ad-card ob ${blocked ? 'blk' : ''} ${ui.sheet && ui.sheet.k === 'line' && ui.sheet.l === l ? 'sel' : ''}" data-act="line" data-l="${l}" data-u="${e.u}">
      <div class="ad-rw"><span class="t">${esc(r.ko)}</span>${rewBadge(r)}</div>
      <div class="ad-ob"><div class="ad-nm">${esc(o.ko)}</div><div class="ad-en">${esc(o.en)}</div>
        <div class="ad-row">${TYPE_SVG[o.type]}<span class="ad-cs ${watch ? 'up' : ''}">${symSvg(o.cost.k, cost.n)}</span>${alarmSvg(o.alarm)}</div>
        ${o.tx ? `<div class="ad-tx">${esc(o.tx)}</div>` : ''}</div>
      ${last ? '<i class="ad-exm">출구</i>' : ''}${blocked ? '<i class="ad-lock">🔒</i>' : ''}</div>`;
  }
  function handCard(uid, i, extra = '') {
    const r = D(uid).rew, img = artOf(uid);
    if (img) return `<div data-skin="card" class="ad-card hd himg ${extra}" data-act="hand" data-i="${i}" data-u="${uid}" style="background-image:url(${img})"></div>`;
    return `<div data-skin="card" class="ad-card hd ${extra}" data-act="hand" data-i="${i}" data-u="${uid}"><div class="ad-hn">${esc(r.ko)}</div><div class="ad-hb">${rewBadge(r)}</div><div class="ad-ht">${esc(r.tx || '')}</div></div>`;
  }
  const faceMini = (uid, side = 'rew') => { const d = D(uid), r = d.rew; return side === 'rew' ? `<div class="ad-mini"><b>${esc(r.ko)}</b>${rewBadge(r)}<small>${esc(r.tx || '')}</small></div>` : `<div class="ad-mini"><b>${esc(d.ob.ko)}</b><small>${costTx(d.ob.cost)} · 경보 ${d.ob.alarm}</small></div>`; };

  // ----- 화면 갱신 -----
  let fanUnits = 4, fanGroups = 4;
  function draw() {
    const m = MISSIONS[s.mission - 1];
    // 상단
    const pct = Math.min(100, s.alarm / MAX_ALARM * 100);
    const done = s.alarmLog.map((a, i) => `<i>M${i + 1} ${a}</i>`).join('');
    el.top.innerHTML = `<div class="ad-mn"><b>미션 ${s.mission}/5</b><span>턴 ${s.turn}</span><button data-skin="button" class="ad-ib" data-act="rules">규칙</button><button data-skin="button" class="ad-ib" data-act="cards">내 카드</button></div>
      <div data-skin="bar" class="ad-gauge"><div class="ad-gf ${pct > 70 ? 'hot' : ''}" style="width:${pct}%"></div><span>경보 ${s.alarm} / ${MAX_ALARM}</span></div>${done ? `<div class="ad-done">${done}</div>` : ''}`;
    // 미션 카드
    const gp = goalProgress(s), ok = goalMet(s);
    el.goal.innerHTML = `<div data-skin="panel" class="ad-gm ${ok ? 'ok' : ''}"><div class="ad-gt"><b>${m.ko} 목표</b> ${esc(m.goalTx)}</div>
      <div class="ad-gp">${gp.map(([t, k]) => `<span class="${k ? 'y' : ''}">${k ? '✓' : '·'} ${esc(t)}</span>`).join('')}</div><div class="ad-gr">보상: ${esc(m.rewTx)}</div></div>`;
    // 줄
    el.line.innerHTML = s.line.map((e, l) => lineCard(e, l)).join('');
    const ex = s.line[5];
    el.exit.innerHTML = `<div data-skin="panel" class="ad-ex">출구 ▶ ${ex ? (ex.down ? '기절한 카드가 나갑니다 (경보 +0)' : `${esc(on(ex.u))} 이(가) 나가면 <b>경보 +${D(ex.u).ob.alarm}</b>`) : '출구 칸이 비어 있어 이번 턴은 아무도 나가지 않습니다'}</div>`;
    // 자원
    el.pool.innerHTML = `<div data-skin="panel" class="ad-pl"><span class="ps">${symSvg('s', null, 'sm')}<b>${s.pool.s}</b></span><span class="pf">${symSvg('f', null, 'sm')}<b>${s.pool.f}</b></span>
      <span class="pi">상호작용 <b>${s.used}/${s.maxInt}</b></span><span class="pd" data-act="cards">덱 ${s.deck.length} · 버림 ${s.discard.length}</span></div>`;
    // 장비
    el.equip.innerHTML = s.equip.length ? `<div class="ad-eq"><small>장비</small>${s.equip.map((en, i) => {
      const nmx = en.m ? ['', '지도', '새 규칙 ×2', '새 규칙 ×5', '새 규칙 ×3'][en.m] : nm(en.u);
      const r = en.m ? (en.m === 1 ? rewBadge({ res: { s: 1 } }) : '') : rewBadge(D(en.u).rew);
      const fr = !en.m && D(en.u).rew.free ? `<em>${TYPE_KO[D(en.u).rew.free]} 공짜</em>` : '';
      return `<span class="ad-ec" data-act="equip" data-i="${i}">${esc(nmx)}${r}${fr}</span>`;
    }).join('')}</div>` : '';
    // 손패
    const lock = !!s.pend;
    const fan = s.hand.length >= 5;
    let handHtml;
    if (!s.hand.length) handHtml = '<span class="ad-none">손패 없음</span>';
    else if (!fan) handHtml = s.hand.map((u, i) => handCard(u, i)).join('');
    else {
      const groups = [];
      s.hand.forEach((u, i) => { const k = INST[u].key; let g = groups.find(x => x.k === k); if (!g) groups.push(g = { k, a: [] }); g.a.push([u, i]); });
      handHtml = groups.map(g => `<div class="ad-stk" style="--n:${g.a.length}">${g.a.map(([u, i], k) => handCard(u, i, 'k' + Math.min(k, 7))).join('')}${g.a.length > 1 ? `<i class="ad-cnt">×${g.a.length}</i>` : ''}</div>`).join('');
      fanUnits = groups.reduce((a, g) => a + 1 + 0.3 * (g.a.length - 1), 0); fanGroups = groups.length;
    }
    if (!fan) { fanUnits = 4; fanGroups = 4; }
    el.hand.innerHTML = `<div class="ad-hl">손패 ${s.hand.length}장${s.saved.length ? ` · 남겨 둔 카드 ${s.saved.length}` : ''}${fan ? ' · 같은 카드는 겹쳐 놓았어요' : ''}</div><div class="ad-hs ${fan ? 'fan' : ''} ${lock ? 'lock' : ''}">${handHtml}</div>`;
    // 하단 버튼
    el.bar.innerHTML = `<button data-skin="button" class="ad-end ${ok ? 'go' : ''}" data-act="end" ${s.pend || s.over ? 'disabled' : ''}>${ok ? '미션 완료하기 (턴 종료)' : '턴 종료'}</button>`;
    el.log.innerHTML = logLines.slice(-14).reverse().map(l => `<div class="${l.cls || ''}">${esc(l.t)}</div>`).join('');
    drawSheet();
    fit();
  }
  // 한 화면에 들어오도록 카드 크기를 맞춘다(스킨 테두리가 차지하는 만큼 포함해 실제 높이를 재서 줄임)
  function fit() {
    if (dead || !el.line.firstElementChild || el.sheet.matches(':not([hidden])') && false) return;
    root.style.removeProperty('--lw'); root.style.removeProperty('--hw');
    const gapH = 6, availH = el.hand.clientWidth;
    let hw = Math.floor((availH - gapH * (fanGroups - 1)) / fanUnits);
    const hw4 = Math.floor((availH - gapH * 3) / 4);
    hw = Math.min(hw, hw4);
    let lw = el.line.firstElementChild.getBoundingClientRect().width;
    root.style.setProperty('--hw', hw + 'px');
    const limit = window.innerHeight - 6;
    for (let n = 0; n < 3; n++) {
      const bottom = el.bar.getBoundingClientRect().bottom + (window.scrollY || 0) - (window.scrollY || 0);
      const over = bottom - limit; if (over <= 0) break;
      const k = 2.83 * lw + 1.41 * hw, f = Math.max(0.62, 1 - over / k);
      if (f >= 0.999) break;
      lw = Math.floor(lw * f); hw = Math.max(40, Math.floor(hw * f));
      root.style.setProperty('--lw', lw + 'px'); root.style.setProperty('--hw', hw + 'px');
    }
  }
  const onResize = () => fit();
  window.addEventListener('resize', onResize);


  // ----- 시트(선택 창) -----
  function sheetHtml() {
    if (s.over) return '';
    const p = s.pend;
    if (p) return pendHtml(p);
    const sh = ui.sheet; if (!sh) return '';
    if (sh.k === 'line') return lineSheet(sh);
    if (sh.k === 'hand') return handSheet(sh);
    if (sh.k === 'equip') { const en = s.equip[sh.i]; if (!en) return ''; const t = en.m ? MISSIONS[en.m - 1].rewTx : D(en.u).rew.tx; const nmx = en.m ? MISSIONS[en.m - 1].ko + ' 보상' : nm(en.u); return `<div data-skin="panel" class="ad-sh"><b>${esc(nmx)}</b><p>${esc(t)}</p>${!en.m && D(en.u).rew.free ? `<p class="hint">${TYPE_KO[D(en.u).rew.free]} 장애물을 고르면 "${esc(nm(en.u))} 사용" 지불 방법이 나옵니다.</p>` : ''}<div class="ad-sb"><button data-skin="button" data-act="close">닫기</button></div></div>`; }
    if (sh.k === 'info') return infoHtml(sh.u);
    if (sh.k === 'rules') return rulesHtml();
    if (sh.k === 'cards') return cardsHtml(sh);
    return '';
  }
  function drawSheet() {
    const h = sheetHtml();
    el.sheet.hidden = !h; el.sheet.innerHTML = h ? `<div class="ad-back" data-act="${s.pend ? 'noop' : 'close'}"></div>${h}` : '';
  }

  function lineSheet(sh) {
    const e = s.line[sh.l]; if (!e || e.down) return '';
    const d = D(e.u), o = d.ob, r = d.rew, cost = effCost(s, sh.l), blocked = blockReason(s, sh.l);
    const cands = legalMoves(s).filter(m => m.a === 'int' && m.l === sh.l);
    const pays = []; for (const m of cands) { const k = [m.s, m.f, m.it].join(); if (!pays.some(p => p.k === k)) pays.push({ k, s: m.s, f: m.f, it: m.it }); }
    if (sh.pay == null || sh.pay >= pays.length) {
      // 기본: 공짜 장비가 있으면 그것, 아니면 자원이 균형 잡히게 남는 지불
      let best = 0, bs = -1e9; pays.forEach((p, i) => { const sc = p.it >= 0 ? 100 : -Math.abs((s.pool.s - p.s) - (s.pool.f - p.f)); if (sc > bs) { bs = sc; best = i; } });
      sh.pay = best;
    }
    const pay = pays[sh.pay];
    const payHtml = pays.length > 1 ? `<div class="ad-pays"><small>지불 방법</small>${pays.map((p, i) => `<button data-skin="button" class="${i === sh.pay ? 'on' : ''}" data-act="pay" data-i="${i}">${p.it >= 0 ? esc(nm(s.equip[p.it].u)) + ' 사용(공짜)' : costTx({ k: 'c', n: 0 }).slice(0, 0) + [p.s ? `은신 ${p.s}` : '', p.f ? `전투 ${p.f}` : ''].filter(Boolean).join(' + ')}</button>`).join('')}</div>` : (pay ? `<div class="ad-pays"><small>지불</small><span>${pay.it >= 0 ? esc(nm(s.equip[pay.it].u)) + ' 사용(공짜)' : [pay.s ? `은신 ${pay.s}` : '', pay.f ? `전투 ${pay.f}` : ''].filter(Boolean).join(' + ')}</span></div>` : '');
    const mvOf = (o, adj = -1) => cands.find(m => m.o === o && m.adj === adj && m.s === pay.s && m.f === pay.f && m.it === pay.it);
    let btns = '';
    if (pay) {
      btns += `<button data-skin="button" class="go" data-act="int" data-o="d">무력화 — 카드를 내 것으로${r.keep ? ' (장비)' : ''}</button><button data-skin="button" data-act="int" data-o="k">기절 — 줄에 뒤집어 둠 (경보 없이 지나감)</button>`;
      if (o.fx === 'clumsy') { const adj = [sh.l - 1, sh.l + 1].filter(j => s.line[j] && !s.line[j].down); adj.forEach(j => { btns += `<button data-skin="button" data-act="int" data-o="a" data-adj="${j}">대신 ${j < sh.l ? '왼쪽' : '오른쪽'} ${esc(on(s.line[j].u))} 기절</button>`; }); }
    }
    const why = blocked ? `<p class="warn">🔒 ${esc(blocked)}</p>` : (!cands.length ? `<p class="warn">자원이 모자랍니다 (필요: ${costTx(cost)}${cost.n !== o.cost.n ? ` · 감시탑 효과 +${cost.n - o.cost.n}` : ''})</p>` : '');
    return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>${esc(o.ko)}</b> <em>${esc(o.en)}</em></div>
      <div class="ad-shrow">${TYPE_SVG[o.type]}<span>${TYPE_KO[o.type]}</span>${symSvg(o.cost.k, cost.n)}<span>${costTx(cost)}</span>${alarmSvg(o.alarm)}<span>경보 ${o.alarm}</span></div>
      ${o.tx ? `<p class="fxp">${esc(o.tx)}</p>` : ''}<p class="rwp">무력화하면 얻는 것: <b>${esc(r.ko)}</b> — ${esc(r.tx || '')}</p>
      ${why}${s.used >= s.maxInt ? '<p class="warn">이번 턴 상호작용 횟수를 다 썼어요.</p>' : ''}${payHtml}<div class="ad-sb vert">${btns}<button data-skin="button" data-act="close">닫기</button></div></div>`;
  }
  function handSheet(sh) {
    const uid = s.hand[sh.i]; if (uid == null) return '';
    const r = D(uid).rew, mv = legalMoves(s).filter(m => m.c === sh.i);
    const lab = m => (m.a === 'equip' ? '장비하기 (장비 칸에 두고 매 턴 사용)' : m.a === 'res' ? (r.draw && !r.or ? `사용: ${r.res ? resTx(r.res) : ''} + 카드 ${r.draw}장 뽑기` : r.calc ? '사용: 버린 더미 2장당 전투 1' : `사용: ${resTx(r.res)}`) : (r.draw ? `카드 ${r.draw}장 뽑기` : '효과 사용'));
    return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>${esc(r.ko)}</b> <em>${esc(r.en)}</em></div><p class="fxp">${esc(r.tx || '')}</p>
      <div class="ad-sb vert">${mv.map(m => `<button data-skin="button" class="go" data-act="hmove" data-a="${m.a}">${lab(m)}</button>`).join('')}<button data-skin="button" data-act="close">닫기</button></div></div>`;
  }
  // 선택 대기 창들
  function pendHtml(p) {
    const pk = (uid, i, on_, mode = 'rew') => `<span class="ad-pk ${on_ ? 'on' : ''}" data-act="tog" data-i="${i}">${faceMini(uid, mode)}</span>`;
    const sel = ui.sel || [];
    switch (p.k) {
      case 'bin': return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>휴지통</b></div><p>게임에서 영구 제거할 손패를 고르세요(0장도 가능).</p><div class="ad-pks">${s.hand.map((u, i) => pk(u, i, sel.includes(i))).join('')}</div><div class="ad-sb"><button data-skin="button" class="go" data-act="pend" data-a="bin">${sel.length}장 제거</button></div></div>`;
      case 'mis': return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>시선 돌리기</b></div><p>내려놓을 손패를 고르세요. 한 장마다 은신 2를 얻습니다.</p><div class="ad-pks">${s.hand.map((u, i) => pk(u, i, sel.includes(i))).join('')}</div><div class="ad-sb"><button data-skin="button" class="go" data-act="pend" data-a="mis">${sel.length}장 내려놓기 (은신 +${sel.length * 2})</button></div></div>`;
      case 'burn': return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>소각</b></div><p>버린 더미에서 최대 2장을 게임에서 제거합니다.</p><div class="ad-pks">${s.discard.map((u, i) => pk(u, i, sel.includes(i))).join('')}</div><div class="ad-sb"><button data-skin="button" class="go" data-act="pend" data-a="burn">${sel.length}장 제거</button></div></div>`;
      case 'rec': { const m = legalMoves(s); return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>회수</b></div><p>버린 더미에서 손으로 가져올 카드를 고르세요.</p><div class="ad-pks">${m.map(x => `<span class="ad-pk" data-act="pend" data-a="rec" data-i="${x.i}">${faceMini(s.discard[x.i])}</span>`).join('')}</div></div>`; }
      case 'just': { const m = legalMoves(s); return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>딱 맞는 물건</b></div><p>덱에서 카드 1장을 찾습니다. 덱을 섞은 뒤 맨 위에 올립니다.</p><div class="ad-pks">${m.map(x => `<span class="ad-pk" data-act="pend" data-a="just" data-i="${x.i}">${faceMini(s.deck[x.i])}</span>`).join('')}</div></div>`; }
      case 'dis': return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>교란</b></div><p>줄 맨 앞(출구 반대편)으로 끌어당길 카드를 고르세요.</p><div class="ad-pks">${legalMoves(s).map(x => `<span class="ad-pk" data-act="pend" data-a="dis" data-l="${x.l}">${faceMini(s.line[x.l].u, 'ob')}</span>`).join('')}</div></div>`;
      case 'save': return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>탄약 아끼기</b></div><p>다음 턴을 위해 남겨 둘 카드를 고르세요.</p><div class="ad-pks">${legalMoves(s).filter(x => x.i >= 0).map(x => `<span class="ad-pk" data-act="pend" data-a="save" data-i="${x.i}">${faceMini(s.hand[x.i])}</span>`).join('')}</div><div class="ad-sb"><button data-skin="button" data-act="pend" data-a="save" data-i="-1">남기지 않음</button></div></div>`;
      case 'plan': {
        const v = topOf(s, 3);
        if (ui.keep == null) return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>계획</b></div><p>덱 맨 위 ${v.length}장입니다. <b>손에 넣을 1장</b>을 고르세요.</p><div class="ad-pks">${v.map((u, i) => `<span class="ad-pk" data-act="keep" data-i="${i}">${faceMini(u)}</span>`).join('')}</div></div>`;
        const rest = v.map((_, i) => i).filter(i => i !== ui.keep);
        if (rest.length === 2 && ui.top == null) return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>계획</b></div><p>남은 2장 중 <b>맨 위에 둘 카드</b>를 고르세요.</p><div class="ad-pks">${rest.map(i => `<span class="ad-pk" data-act="ptop" data-i="${i}">${faceMini(v[i])}</span>`).join('')}</div></div>`;
        return '';
      }
      case 'fore': {
        const v = topOf(s, 5), ord = ui.ord || [];
        const left = v.map((_, i) => i).filter(i => !ord.includes(i));
        return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>선견</b></div><p>덱 맨 위 ${v.length}장입니다. <b>위에서부터 놓을 순서</b>대로 눌러 주세요 (${ord.length}/${v.length}).</p>
          <div class="ad-ord">${ord.map((i, k) => `<span>${k + 1}. ${esc(nm(v[i]))}</span>`).join('')}</div><div class="ad-pks">${left.map(i => `<span class="ad-pk" data-act="ford" data-i="${i}">${faceMini(v[i])}</span>`).join('')}</div>
          <div class="ad-sb"><button data-skin="button" data-act="fclr">순서 다시</button></div></div>`;
      }
    }
    return '';
  }
  function infoHtml(u) {
    const d = D(u), r = d.rew, o = d.ob; if (!o) return '';
    const rtx = (r.res ? `얻는 자원: ${resTx(r.res)}` : '') + (r.calc ? '버린 더미 2장당 전투 1' : '') + (r.draw ? ` 카드 ${r.draw}장 뽑기` : '');
    return `<div data-skin="panel" class="ad-sh"><div class="ad-shh"><b>${esc(o.ko)}</b> <em>${esc(o.en)}</em></div>
      <p class="rwp">${TYPE_KO[o.type]} · 비용 ${costTx(o.cost)} · 경보 ${o.alarm}</p>${o.tx ? `<p class="fxp">${esc(o.tx)}</p>` : ''}
      <div class="ad-shh" style="margin-top:10px"><b>${esc(r.ko)}</b> <em>${esc(r.en)}</em></div>
      <p class="rwp">${esc(rtx.trim())}${r.keep ? ' · KEEP(장비)' : ''}</p>${r.tx ? `<p class="fxp">${esc(r.tx)}</p>` : ''}
      <div class="ad-sb"><button data-skin="button" class="go" data-act="close">닫기</button></div></div>`;
  }
  function rulesHtml() {
    return `<div data-skin="panel" class="ad-sh rules"><div class="ad-shh"><b>규칙 요약</b></div><ul>
      <li>손패로 <b>은신 △ / 전투 ○</b> 자원을 만들어 줄의 장애물과 <b>상호작용</b>합니다. 한 턴에 하는 상호작용 수는 처음엔 1장(미션을 깨면 늘어요).</li>
      <li><b>무력화</b>: 카드가 내 것이 됩니다(내 덱에 들어와 다음에 쓸 수 있음). <b>기절</b>: 줄에 뒤집어 둡니다. 기절한 카드는 효과가 사라지고, 줄 밖으로 나가도 경보가 오르지 않아요.</li>
      <li>상호작용한 카드는 줄에서 빠지거나 기절하므로 <b>출구 칸(맨 오른쪽)</b> 카드를 처리하면 이번 턴 그 카드는 경보를 올리지 못합니다.</li>
      <li>턴 끝: ① 미션 목표를 채웠으면 미션 완료 ② 출구 칸 카드가 나가며 <b>경보 +</b> ③ 줄이 오른쪽으로 모이고 왼쪽에서 새 카드가 채워짐 ④ 손패 4장 새로 뽑기.</li>
      <li><b>패배</b>: 경보가 50이 되거나, 장애물이 모자라 줄을 6장으로 못 채울 때. <b>승리</b>: 미션 5개 완료. 경보 합계가 낮을수록 좋은 기록입니다.</li>
      <li>KEEP 카드: 무력화하면 장비 칸으로 갑니다. 장비한 자원은 매 턴 사용, 키카드·클로로포름·E.M.P.는 해당 유형 장애물을 공짜로 상대할 수 있는 대신 버린 더미로 돌아갑니다.</li>
      <li>원작: Agent Decker — Manuel Correia (CC BY-NC 4.0). 이 화면은 규칙을 새로 그린 비공식 개인용 이식입니다.</li></ul><div class="ad-sb"><button data-skin="button" class="go" data-act="close">닫기</button></div></div>`;
  }
  function cardsHtml(sh) {
    const tab = sh.tab || 'deck';
    const tally = arr => { const m = new Map(); arr.forEach(u => m.set(nm(u), (m.get(nm(u)) || 0) + 1)); return [...m].sort((a, b) => b[1] - a[1]).map(([k, n]) => `<span class="ad-tl">${esc(k)} ×${n}</span>`).join('') || '<span class="ad-none">없음</span>'; };
    const known = [...s.deck, ...s.discard];
    const body = tab === 'deck' ? `<p class="hint">덱의 순서는 모르지만 구성은 압니다 (손패 제외, 버린 더미 포함 전체 ${known.length}장).</p><div class="ad-tls">${tally(s.deck)}</div>`
      : tab === 'disc' ? `<div class="ad-tls">${tally(s.discard)}</div>` : tab === 'oth' ? `<p class="hint">장애물 덱 ${s.oDeck.length}장 · 장애물 버린 더미 ${s.oDiscard.length}장</p><div class="ad-tls">${tally(s.oDiscard)}</div>` : `<div class="ad-tls">${tally(s.removed)}</div>`;
    return `<div data-skin="panel" class="ad-sh"><div class="ad-tabs">${[['deck', `내 덱 ${s.deck.length}`], ['disc', `버린 더미 ${s.discard.length}`], ['oth', '장애물 더미'], ['rem', `제거됨 ${s.removed.length}`]].map(([k, t]) => `<button data-skin="button" class="${k === tab ? 'on' : ''}" data-act="tab" data-k="${k}">${t}</button>`).join('')}</div>${body}<div class="ad-sb"><button data-skin="button" data-act="close">닫기</button></div></div>`;
  }

  // ----- 연출 -----
  function rectsNow() { const m = {}; if (!fx.on) return m; root.querySelectorAll('[data-u]').forEach(n => { const r = fx.rect(n); if (r) m[n.dataset.u + (n.classList.contains('hd') ? 'h' : 'l')] = r; }); return m; }
  function animate(evs, snap, before) {
    let n = 0;
    for (const e of evs) {
      switch (e.k) {
        case 'play': safe(() => { fx.sfx('card'); const from = snap[e.u + 'h']; const to = q('.ad-pl'); if (from && to) fx.fly({ from, to, node: `<div class="ad-card hd" style="width:70px;height:90px"></div>`, dur: 300, arc: 0.2 }).then(() => fx.pop(to, 1.08)); }); break;
        case 'int': safe(() => { fx.sfx(e.o === 'd' ? 'pick' : 'slam'); if (e.o === 'd') { const from = snap[e.u + 'l']; const to = q('.ad-pl .pd') || q('.ad-pl'); if (from && to) fx.fly({ from, to, node: `<div class="ad-card ob" style="width:80px;height:100px"></div>`, dur: 360, arc: 0.25, scale: 0.5 }); } }); break;
        case 'ko': safe(() => { const t = root.querySelector(`.ad-card.down[data-u="${e.u}"]`); if (t) { fx.flip(t); fx.shake(t, 4); } fx.sfx('slam'); fx.buzz(14); }); break;
        case 'exit': safe(() => { const from = snap[e.u + 'l']; const to = q('.ad-exit'); if (from && to) fx.fly({ from, to, node: `<div class="ad-card ob" style="width:80px;height:100px"></div>`, dur: 380, arc: -0.1, fade: true }); if (e.alarm) { const g = q('.ad-gauge'); fx.sfx('bad'); fx.shake(g, 5); fx.float(g, '+' + e.alarm, { color: '#ff6b6b', size: 22 }); fx.buzz(22); } }); break;
        case 'appear': safe(() => { const t = root.querySelector(`.ad-line .ad-card[data-u="${e.u}"]`); if (t) later(() => { fx.slam(t); fx.sfx('deal'); }, n++ * 90); }); break;
        case 'draw': safe(() => { fx.sfx('deal'); root.querySelectorAll('.ad-hs .ad-card').forEach((c, i, all) => { if (i >= all.length - e.n) later(() => fx.pop(c, 1.1), (i - (all.length - e.n)) * 70); }); }); break;
        case 'equip': safe(() => { fx.sfx('gain'); const t = q('.ad-eq'); if (t) fx.burst(t, { color: ['#7fc0ff', '#ffffff'], n: 12 }); }); break;
        case 'mission': safe(() => { fx.sfx('win'); fx.burst(q('.ad-top'), { color: ['#4aa3ff', '#ffe27a', '#ffffff'], n: 26, spread: 120 }); fx.buzz(40); }); break;
        case 'siren': safe(() => { fx.sfx('bad'); fx.shake(q('.ad-linewrap'), 8); }); break;
        case 'over': safe(() => fx.sfx(e.won ? 'win' : 'lose')); break;
      }
    }
  }

  // ----- 로그 문장 -----
  function consume(evs) {
    for (const e of evs) {
      const o = e.u != null ? D(e.u) : null;
      switch (e.k) {
        case 'play': log(`${o.rew.ko} ${e.mode === 'fx' ? '효과 사용' : '사용'}`); break;
        case 'int': log(`${o.ob.ko} ${e.o === 'd' ? '무력화 → 내 카드: ' + o.rew.ko : e.o === 'k' ? '기절' : '(서툰 경비병) 이웃을 기절시킴'}`, 'i'); break;
        case 'ko': break;
        case 'useItem': log(`${o.rew.ko} 사용 (버린 더미로)`); break;
        case 'equip': log(`${o.rew.ko} 장비`, 'g'); break;
        case 'exit': log(e.down ? `${o.ob.ko} (기절) 줄 밖으로 — 경보 없음` : `${o.ob.ko} 줄 밖으로 → 경보 +${e.alarm}`, e.alarm ? 'w' : ''); break;
        case 'flip': log(`${o.ob.ko} 감독관이 앞면으로 뒤집음`, 'w'); break;
        case 'siren': log('사이렌! 줄의 모든 카드가 사라졌습니다', 'w'); break;
        case 'mission': log(`★ 미션 ${e.n} 완료! (경보 ${e.alarm})`, 'g'); break;
        case 'reshuffle': log('내 덱을 새로 섞음'); break;
        case 'oreshuffle': log('장애물 덱을 새로 섞음'); break;
        case 'bin': log(`휴지통으로 ${e.n}장 제거`); break;
        case 'burn': log(`소각으로 ${e.n}장 제거`); break;
        case 'over': log(e.won ? '★ 임무 완수!' : '✕ 작전 실패', e.won ? 'g' : 'w'); break;
      }
    }
  }

  // ----- 수 실행 -----
  function run(m) {
    if (dead || s.over || busy) return;
    const snap = rectsNow();
    try { self.applyMove(s, m, rng); } catch (err) { log('(잘못된 수: ' + err.message + ')', 'w'); draw(); return; }
    const evs = s.ev.splice(0);
    ui.sel = null; ui.keep = null; ui.top = null; ui.ord = null;
    if (!(m.a === 'int' && s.pend)) ui.sheet = null;
    consume(evs);
    draw();
    animate(evs, snap);
    save();
    if (s.over) later(showOver, fx.on ? 900 : 100);
  }
  function save() {
    try { if (!s.over && ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s))); } catch (e) { /* 저장은 덤 */ }
  }
  function showOver() {
    if (finished) return;
    const res = self.result(s);
    const total = res.coop.score;
    el.over.hidden = false;
    el.over.innerHTML = `<div data-skin="panel" class="ad-ov ${s.won ? 'win' : 'lose'}"><h2>${s.won ? '임무 완수' : '작전 실패'}</h2>
      <p class="sub">${esc(res.summary)}</p>
      <div class="ad-ovl">${MISSIONS.map((m, i) => `<span class="${i < s.alarmLog.length ? 'y' : ''}">미션 ${i + 1}: ${i < s.alarmLog.length ? '경보 ' + s.alarmLog[i] : (i === s.mission - 1 && !s.won ? '실패 (경보 ' + s.alarm + ')' : '—')}</span>`).join('')}</div>
      <p>경보 합계 <b>${total}</b> · 무력화 ${s.stat.disarm}장 · 기절 ${s.stat.ko}장 · ${s.turn}턴</p>
      <button data-skin="button" class="ad-end go" data-act="finish">결과 저장하고 나가기</button></div>`;
  }

  // ----- 입력 -----
  let lp = null, lpDone = false;
  const lpClear = () => { if (lp) { clearTimeout(lp); lp = null; } };
  root.addEventListener('pointerdown', ev => {
    const c = ev.target.closest('.ad-card[data-u]'); if (!c || ev.target.closest('.ad-i')) return;
    lpDone = false; lpClear();
    lp = setTimeout(() => { lp = null; lpDone = true; if (!dead && !s.pend) { ui.sheet = { k: 'info', u: +c.dataset.u }; draw(); safe(() => fx.buzz(12)); } }, 450);
  });
  ['pointerup', 'pointercancel', 'pointerleave', 'pointermove'].forEach(n => root.addEventListener(n, ev => { if (n === 'pointermove' && Math.abs(ev.movementX) + Math.abs(ev.movementY) < 4) return; lpClear(); }));
  root.addEventListener('contextmenu', ev => { if (ev.target.closest('.ad-card')) ev.preventDefault(); });
  root.addEventListener('click', ev => {
    if (lpDone) { lpDone = false; ev.stopPropagation(); return; }
    const t = ev.target.closest('[data-act]'); if (!t || dead) return;
    if (t.dataset.act === 'info') { ui.sheet = { k: 'info', u: +t.dataset.u }; draw(); return; }
    const a = t.dataset.act, d = t.dataset;
    safe(() => fx.buzz(6));
    if (a === 'noop') return;
    if (a === 'finish') { if (finished) return; finished = true; ctx.finish(self.result(s)); return; }
    if (a === 'close') { ui.sheet = null; draw(); return; }
    if (a === 'rules' || a === 'cards') { ui.sheet = { k: a, tab: 'deck' }; draw(); return; }
    if (a === 'tab') { ui.sheet.tab = d.k; draw(); return; }
    if (a === 'equip') { ui.sheet = { k: 'equip', i: +d.i }; draw(); return; }
    if (s.over) return;
    if (a === 'line') { if (s.pend) return; ui.sheet = { k: 'line', l: +d.l, pay: null }; draw(); return; }
    if (a === 'pay') { ui.sheet.pay = +d.i; draw(); return; }
    if (a === 'hand') {
      if (s.pend) return;
      const mv = legalMoves(s).filter(m => m.c === +d.i);
      if (mv.length === 1) { run(mv[0]); return; }
      if (!mv.length) { log('이 카드는 지금 쓸 수 없어요'); draw(); return; }
      ui.sheet = { k: 'hand', i: +d.i }; draw(); return;
    }
    if (a === 'hmove') { const mv = legalMoves(s).find(m => m.c === ui.sheet.i && m.a === d.a); if (mv) run(mv); return; }
    if (a === 'int') {
      const sh = ui.sheet; if (!sh || sh.k !== 'line') return;
      const cands = legalMoves(s).filter(m => m.a === 'int' && m.l === sh.l);
      const pays = []; for (const m of cands) { const k = [m.s, m.f, m.it].join(); if (!pays.some(p => p.k === k)) pays.push({ k, s: m.s, f: m.f, it: m.it }); }
      const pay = pays[sh.pay == null ? 0 : sh.pay];
      const adj = d.adj != null ? +d.adj : -1;
      const mv = cands.find(m => m.o === d.o && m.adj === adj && pay && m.s === pay.s && m.f === pay.f && m.it === pay.it);
      if (mv) run(mv); return;
    }
    if (a === 'end') { if (s.pend) return; ui.sheet = null; run({ a: 'end' }); return; }
    // 선택 대기 창
    if (a === 'tog') {
      const i = +d.i; ui.sel = ui.sel || []; const k = ui.sel.indexOf(i);
      const max = s.pend && s.pend.k === 'burn' ? 2 : 99;
      if (k >= 0) ui.sel.splice(k, 1); else if (ui.sel.length < max) ui.sel.push(i);
      draw(); return;
    }
    if (a === 'pend') {
      const p = s.pend; if (!p) return;
      const sel = (ui.sel || []).slice().sort((x, y) => x - y);
      const m = d.a === 'bin' || d.a === 'mis' || d.a === 'burn' ? { a: d.a, set: sel } : d.a === 'dis' ? { a: 'dis', l: +d.l } : { a: d.a, i: +d.i };
      run(m); return;
    }
    if (a === 'keep') { ui.keep = +d.i; const v = topOf(s, 3); const rest = v.map((_, i) => i).filter(i => i !== ui.keep); if (rest.length < 2) { run({ a: 'plan', k: ui.keep, o: rest }); return; } draw(); return; }
    if (a === 'ptop') { const v = topOf(s, 3); const rest = v.map((_, i) => i).filter(i => i !== ui.keep); const top = +d.i; run({ a: 'plan', k: ui.keep, o: [top, rest.find(i => i !== top)] }); return; }
    if (a === 'ford') { ui.ord = ui.ord || []; ui.ord.push(+d.i); const v = topOf(s, 5); if (ui.ord.length === v.length) { run({ a: 'fore', o: ui.ord.slice() }); return; } draw(); return; }
    if (a === 'fclr') { ui.ord = []; draw(); return; }
  });

  // ----- 시작: 이어하기 확인 -----
  function begin(state) {
    s = state || self.newGame({ players: ctx.players, rng });
    s.ev = [];
    log(state ? '작전을 이어서 진행합니다.' : '작전 개시! 은신 6을 모아 첫 미션을 완수하세요.');
    draw();
  }
  const rs = ctx.resumeState;
  if (rs && rs.v === 1 && Array.isArray(rs.line) && !rs.over) begin(rs); else begin(null);
  container._ad = { get state() { return s; }, run, draw, get ui() { return ui; } };   // 테스트용 손잡이
  return { destroy() { dead = true; window.removeEventListener('resize', onResize); timers.forEach(clearTimeout); timers.clear(); container.querySelectorAll('.fx-layer').forEach(e => e.remove()); } };
}

const AD_CSS = `
.g-ad{position:relative;padding:10px 8px 16px;border-radius:16px;color:#e8eefc;font-family:var(--fk,system-ui,sans-serif);
 background:radial-gradient(120% 60% at 50% 0%,#ffffff10,transparent 70%),repeating-linear-gradient(0deg,#ffffff05 0 1px,transparent 1px 4px),linear-gradient(180deg,var(--bg1),var(--bg2));
 box-shadow:inset 0 0 0 1.5px #ffffff22,inset 0 0 60px #000a,0 8px 22px #0007;-webkit-user-select:none;user-select:none}
.g-ad *{box-sizing:border-box}
.g-ad button{font-family:inherit}
.g-ad .ad-mn{display:flex;align-items:center;gap:8px;font-size:13px;color:#b8c8ee}
.g-ad .ad-mn b{font-family:var(--fd,inherit);font-size:17px;letter-spacing:.06em;color:#fff}
.g-ad .ad-mn span{flex:1}
.g-ad .ad-ib{border:1px solid #ffffff33;background:#ffffff12;color:#dbe6ff;border-radius:14px;padding:3px 10px;font-size:12px;cursor:pointer}
.g-ad .ad-gauge{position:relative;height:22px;margin-top:6px;border-radius:11px;background:#0a1220;box-shadow:inset 0 0 0 1px #ffffff22;overflow:hidden}
.g-ad .ad-gf{position:absolute;inset:0 auto 0 0;background:linear-gradient(90deg,#2d7be0,#e9c14b);transition:width .4s}
.g-ad .ad-gf.hot{background:linear-gradient(90deg,#e9c14b,#ff4b4b)}
.g-ad .ad-gauge span{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font-size:12.5px;font-weight:800;text-shadow:0 1px 2px #000}
.g-ad .ad-done{display:flex;gap:6px;flex-wrap:wrap;margin-top:5px;font-size:11px}.g-ad .ad-done i{font-style:normal;background:#ffffff14;border-radius:8px;padding:1px 7px;color:#bcd0ff}
.g-ad .ad-gm{margin-top:8px;padding:8px 10px;border-radius:10px;background:#0b1830cc;border:1px solid #ffffff1f;font-size:12.5px;line-height:1.5}
.g-ad .ad-gm.ok{border-color:#6dd28a;box-shadow:0 0 12px #6dd28a66}
.g-ad .ad-gt b{color:var(--acc);margin-right:4px}
.g-ad .ad-gp{display:flex;gap:10px;flex-wrap:wrap;margin-top:3px;color:#9fb2dd}.g-ad .ad-gp .y{color:#7fe29a;font-weight:700}
.g-ad .ad-gr{margin-top:2px;font-size:11.5px;color:#8fa3cf}
.g-ad .ad-linewrap{margin-top:10px}
.g-ad .ad-line{display:grid;grid-template-columns:repeat(3,1fr);gap:7px}
.g-ad .ad-slot.empty{min-height:150px;border-radius:10px;border:1.5px dashed #ffffff30;display:flex;align-items:center;justify-content:center;font-size:11px;color:#ffffff55}
.g-ad .ad-card{position:relative;border-radius:10px;cursor:pointer;overflow:hidden;transition:transform .12s}
.g-ad .ad-card.ob{min-height:150px;background:linear-gradient(170deg,#1b2d52 0,#1b2d52 26%,#0e1118 26%,#0e1118);box-shadow:0 0 0 1.5px #5b78c4 inset,0 4px 10px #0008}
.g-ad .ad-card.ob.sel{transform:translateY(-4px);box-shadow:0 0 0 2px var(--acc) inset,0 0 16px var(--acc)}
.g-ad .ad-card.ob.blk{opacity:.6}
.g-ad .ad-card.ob.down{background:repeating-linear-gradient(45deg,#1a1d24 0 6px,#14161c 6px 12px);box-shadow:0 0 0 1.5px #3b4255 inset;cursor:default;display:flex;align-items:center;justify-content:center}
.g-ad .ad-dn{text-align:center;color:#8791a8}.g-ad .ad-dn b{display:block;font-size:15px;letter-spacing:.2em}.g-ad .ad-dn small{font-size:10.5px}
.g-ad .ad-rw{display:flex;align-items:center;gap:3px;min-height:38px;padding:4px 6px 3px;font-size:11px;font-weight:800;color:#cfe0ff}
.g-ad .ad-rw .t{flex:1;min-width:0;line-height:1.15}
.g-ad .ad-ob{padding:3px 6px 6px}
.g-ad .ad-nm{font-weight:900;font-size:14px;line-height:1.15;color:#fff}.g-ad .ad-en{font-size:9px;color:#7d8aa8;letter-spacing:.02em;margin-bottom:3px}
.g-ad .ad-row{display:flex;align-items:center;gap:4px}
.g-ad .ad-ty{width:17px;height:17px;fill:#aebde6;flex:none}
.g-ad .ad-cs.up svg{filter:drop-shadow(0 0 4px #ff6b6b)}
.g-ad .ad-sym{width:30px;height:30px;flex:none}.g-ad .ad-sym.sm{width:22px;height:22px}
.g-ad .ad-sym .n{font:900 17px var(--fd,system-ui);fill:#fff;stroke:#0008;stroke-width:.6px}
.g-ad .ad-sym.al .n{font-size:16px}
.g-ad .ad-tx{margin-top:3px;font-size:9.5px;line-height:1.3;color:#b6c3e4}
.g-ad .ad-exm{position:absolute;right:4px;top:4px;font-style:normal;font-size:9px;background:#ff5a5a;color:#fff;border-radius:6px;padding:0 5px;font-weight:800}
.g-ad .ad-lock{position:absolute;right:4px;bottom:3px;font-style:normal;font-size:13px}
.g-ad .ad-x,.g-ad .ad-draw,.g-ad .ad-keep{font-size:10px;font-weight:900;border-radius:5px;padding:0 4px}
.g-ad .ad-x{background:#444b6a;color:#fff}.g-ad .ad-draw{background:#2a6b4a;color:#c8ffe0}.g-ad .ad-keep{background:#f2d230;color:#3a2a00;transform:rotate(-4deg)}
.g-ad .ad-exit{margin:7px 2px 0}.g-ad .ad-ex{font-size:12px;color:#c5d2f0;background:#ffffff0d;border-radius:8px;padding:5px 9px}.g-ad .ad-ex b{color:#ff8b8b}
.g-ad .ad-pool{margin-top:8px}
.g-ad .ad-pl{display:flex;align-items:center;gap:12px;padding:6px 10px;border-radius:10px;background:#0b1830cc;border:1px solid #ffffff1f;font-size:12.5px}
.g-ad .ad-pl .ps,.g-ad .ad-pl .pf{display:flex;align-items:center;gap:3px}.g-ad .ad-pl b{font-size:19px}
.g-ad .ad-pl .pi{flex:1;text-align:right;color:#9fb2dd}.g-ad .ad-pl .pd{color:#8fa3cf;font-size:11px;cursor:pointer;text-decoration:underline dotted}
.g-ad .ad-eq{margin-top:7px;display:flex;flex-wrap:wrap;align-items:center;gap:5px}.g-ad .ad-eq small{color:#8fa3cf}
.g-ad .ad-ec{display:inline-flex;align-items:center;gap:3px;background:#1b3a6a;border:1px solid #5b8bd8;border-radius:12px;padding:2px 8px;font-size:11.5px;cursor:pointer}
.g-ad .ad-ec em{font-style:normal;color:#ffe27a;font-size:10px}
.g-ad .ad-hl{margin:10px 2px 4px;font-size:12px;color:#9fb2dd}
.g-ad .ad-hs{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.g-ad .ad-hs.lock{opacity:.5;pointer-events:none}
.g-ad .ad-card.hd{min-height:104px;padding:5px 5px 4px;background:linear-gradient(170deg,#274a86,#16294d);box-shadow:0 0 0 1.5px #7fa2ee inset,0 3px 8px #0008}
.g-ad .ad-hn{font-weight:900;font-size:11.5px;line-height:1.15;color:#fff}.g-ad .ad-hb{display:flex;gap:2px;flex-wrap:wrap;margin:3px 0}
.g-ad .ad-ht{font-size:8.8px;line-height:1.25;color:#c5d4f7}
.g-ad .ad-none{color:#7a89ad;font-size:12px;padding:6px}
.g-ad .ad-bar{margin-top:12px}
.g-ad .ad-end{display:block;width:100%;border:0;border-radius:12px;padding:13px;font-size:15px;font-weight:900;color:#dbe6ff;background:#26396a;box-shadow:0 3px 0 #0007;cursor:pointer;margin-top:8px}
.g-ad .ad-end.go{background:linear-gradient(#3b88f0,#2556b8);color:#fff}.g-ad .ad-end:disabled{opacity:.4}
.g-ad .ad-log{margin-top:10px;max-height:150px;overflow:auto;background:#00000055;border-radius:10px;padding:6px 10px;font-size:11.5px;line-height:1.55;color:#aebde6}
.g-ad .ad-log .w{color:#ff9b9b}.g-ad .ad-log .g{color:#8fe3a8}.g-ad .ad-log .i{color:#d6e2ff}
.g-ad .ad-sheet{position:fixed;inset:0;z-index:60;display:flex;align-items:flex-end;justify-content:center}.g-ad .ad-sheet[hidden]{display:none}
.g-ad .ad-back{position:absolute;inset:0;background:#000a}
.g-ad .ad-sh{position:relative;width:100%;max-width:520px;max-height:82vh;overflow:auto;background:linear-gradient(#16264a,#0b1630);border-radius:16px 16px 0 0;padding:14px 14px 18px;box-shadow:0 -6px 24px #000c,0 0 0 1px #ffffff22 inset}
.g-ad .ad-shh{font-size:17px;margin-bottom:6px}.g-ad .ad-shh em{font-style:normal;font-size:11px;color:#8da0d0;margin-left:5px}
.g-ad .ad-shrow{display:flex;align-items:center;gap:7px;font-size:12.5px;margin-bottom:6px}.g-ad .ad-shrow svg{width:26px;height:26px}
.g-ad .ad-sh p{font-size:13px;line-height:1.5;margin:6px 0;color:#d2def8}.g-ad .ad-sh .warn{color:#ff9b9b}.g-ad .ad-sh .hint{color:#8da0d0;font-size:12px}
.g-ad .ad-sh .rwp{color:#aebde6}
.g-ad .ad-pays{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin:8px 0}.g-ad .ad-pays small{color:#8da0d0}
.g-ad .ad-pays button{border:1px solid #5b78c4;background:#122244;color:#dbe6ff;border-radius:14px;padding:5px 10px;font-size:12px}.g-ad .ad-pays button.on{background:#2d6be0;border-color:#9cc0ff}
.g-ad .ad-sb{display:flex;gap:8px;margin-top:10px;flex-wrap:wrap}.g-ad .ad-sb.vert{flex-direction:column}
.g-ad .ad-sb button{border:0;border-radius:11px;padding:12px;font-size:14px;font-weight:800;color:#dbe6ff;background:#26396a;cursor:pointer;flex:1}
.g-ad .ad-sb button.go{background:linear-gradient(#3b88f0,#2556b8);color:#fff}
.g-ad .ad-pks{display:grid;grid-template-columns:repeat(2,1fr);gap:7px;margin-top:6px}
.g-ad .ad-pk{display:block;border-radius:10px;padding:7px 9px;background:#122244;border:1.5px solid #3b568f;cursor:pointer}.g-ad .ad-pk.on{border-color:#ffe27a;background:#2a3a66}
.g-ad .ad-mini b{display:block;font-size:12.5px}.g-ad .ad-mini small{display:block;font-size:10px;color:#a9b9e0;line-height:1.35;margin-top:2px}
.g-ad .ad-mini svg.sm{width:18px;height:18px}
.g-ad .ad-ord{display:flex;gap:6px;flex-wrap:wrap;font-size:12px;color:#ffe27a;margin:4px 0}
.g-ad .ad-tabs{display:flex;gap:5px;flex-wrap:wrap}.g-ad .ad-tabs button{border:1px solid #3b568f;background:#122244;color:#cfe0ff;border-radius:14px;padding:4px 10px;font-size:12px}.g-ad .ad-tabs button.on{background:#2d6be0}
.g-ad .ad-tls{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}.g-ad .ad-tl{background:#1a2c52;border-radius:9px;padding:3px 9px;font-size:12px}
.g-ad .rules ul{padding-left:18px;margin:6px 0}.g-ad .rules li{font-size:12.5px;line-height:1.55;margin:4px 0;color:#d2def8}
.g-ad .ad-over{position:fixed;inset:0;z-index:70;background:#000c;display:flex;align-items:center;justify-content:center;padding:16px}.g-ad .ad-over[hidden]{display:none}
.g-ad .ad-ov{width:100%;max-width:400px;background:linear-gradient(#16264a,#0b1630);border-radius:16px;padding:20px 18px;text-align:center;box-shadow:0 0 0 2px var(--acc),0 12px 30px #000c}
.g-ad .ad-ov.win{box-shadow:0 0 0 2px #7fe29a,0 12px 30px #000c}.g-ad .ad-ov.lose{box-shadow:0 0 0 2px #ff6b6b,0 12px 30px #000c}
.g-ad .ad-ov h2{margin:0 0 4px;font-size:24px;letter-spacing:.08em}.g-ad .ad-ov .sub{color:#aebde6;font-size:13px}
.g-ad .ad-ovl{display:flex;flex-direction:column;gap:3px;margin:10px 0;font-size:12.5px;color:#7a89ad}.g-ad .ad-ovl .y{color:#bfe9cc}
.g-ad .ad-card.ob.img{background-size:100% 100%;background-color:#0e1118;aspect-ratio:63/89;min-height:0;-webkit-touch-callout:none}
.g-ad .ad-card.hd.himg{background-size:100% 100%;background-repeat:no-repeat;min-height:0;aspect-ratio:63/89;padding:0;background-color:#0e1118;box-shadow:0 0 0 1.5px #7fa2ee inset,0 3px 8px #0008}
.g-ad .ad-i{position:absolute;left:3px;top:3px;width:20px;height:20px;border:0;border-radius:50%;padding:0;font-size:12px;line-height:20px;background:#000a;color:#cfe0ff}
.g-ad .ad-card.hd .ad-i{left:auto;right:2px;top:2px;width:16px;height:16px;font-size:10px;line-height:16px}
.g-ad .ad-wc{position:absolute;right:5px;bottom:34%;background:#000b;border-radius:10px;padding:1px 3px;filter:drop-shadow(0 0 5px #ff6b6b)}
.g-ad{padding:4px 4px 8px}
.g-ad .ad-gm,.g-ad .ad-pl,.g-ad .ad-ex,.g-ad .ad-log{--sk-panel-d:9px}
.g-ad .ad-top .ad-mn{font-size:12px}.g-ad .ad-mn b{font-size:15px}
.g-ad .ad-gauge{margin-top:3px;height:24px}
.g-ad .ad-gm{margin-top:4px;padding:2px 6px;font-size:12px;line-height:1.35}
.g-ad .ad-gp{margin-top:1px}.g-ad .ad-gr{display:none}
.g-ad .ad-linewrap{margin-top:5px}
.g-ad .ad-line{grid-template-columns:repeat(3,var(--lw,1fr));justify-content:center;gap:6px}
.g-ad .ad-exit{margin:3px 0 0}.g-ad .ad-ex{padding:2px 6px;font-size:11.5px}
.g-ad .ad-pool{margin-top:3px}.g-ad .ad-pl{padding:1px 6px;gap:10px}.g-ad .ad-pl b{font-size:17px}
.g-ad .ad-eq{margin-top:3px}
.g-ad .ad-hl{margin:4px 2px 2px;font-size:11px}
.g-ad .ad-bar{margin-top:5px}.g-ad .ad-end{padding:6px;margin-top:0;font-size:14px}
.g-ad .ad-hs{display:flex;justify-content:center;gap:6px;flex-wrap:nowrap}
.g-ad .ad-hs .ad-card.hd{width:var(--hw,22%);flex:none}
.g-ad .ad-stk{position:relative;flex:none;width:calc(var(--hw) * (1 + .3 * (var(--n) - 1)));height:calc(var(--hw) * 1.413)}
.g-ad .ad-stk .ad-card.hd{position:absolute;top:0;left:calc(var(--k,0) * var(--hw) * .3);width:var(--hw);z-index:calc(var(--k,0) + 1);transform-origin:50% 100%;
 transform:rotate(calc((var(--k,0) - (var(--n) - 1) / 2) * 3.5deg)) translateY(calc(var(--k,0) * -1px));box-shadow:0 0 0 1.5px #7fa2ee inset,-4px 3px 8px #000b}
.g-ad .k0{--k:0}.g-ad .k1{--k:1}.g-ad .k2{--k:2}.g-ad .k3{--k:3}.g-ad .k4{--k:4}.g-ad .k5{--k:5}.g-ad .k6{--k:6}.g-ad .k7{--k:7}
.g-ad .ad-cnt{position:absolute;right:-2px;bottom:-5px;z-index:20;font-style:normal;font-weight:900;font-size:12px;background:#ffe27a;color:#3a2a00;border-radius:9px;padding:0 6px;box-shadow:0 2px 4px #000a}
@media (min-width:520px){.g-ad .ad-line{grid-template-columns:repeat(6,var(--lw,1fr))}.g-ad .ad-card.ob{min-height:170px}}
`;
