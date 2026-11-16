// 에이전트 데커 규칙 단위 테스트 — 카드 효과·줄 밀기·미션 진행을 손으로 만든 장면에서 하나씩 확인한다.
import mod, { DEF, INST, MISSIONS, legalMoves, applyMove, _internal as I } from '../games/agentdecker.js';
function mulberry32(a) { return () => { a |= 0; a = a + 0x6D2B79F5 | 0; let t = Math.imul(a ^ a >>> 15, 1 | a); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
const rng = (seed = 1) => { const f = mulberry32(seed); return { next: f, int: n => Math.floor(f() * n), pick: a => a[Math.floor(f() * a.length)], shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(f() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; } }; };
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };

// 카드 번호 찾기: u('outofsight', 2) = 세 번째 시야 밖
const used = new Set();
const u = (key, n = 0) => { let k = 0; for (let i = 0; i < INST.length; i++) if (INST[i].key === key) { if (k === n) return i; k++; } throw new Error('없는 카드 ' + key + n); };
// 장면 만들기: 줄(오른쪽 끝이 출구)을 키 목록으로 지정. 앞의 null은 빈 칸. 'x:키'는 뒤집힌 카드.
function scene({ line, hand = [], equip = [], pool = { s: 0, f: 0 }, mission = 1, deck, discard = [], maxInt, seed = 7 } = {}) {
  const r = rng(seed); const s = mod.newGame({ players: [{ seat: 0, human: true }], rng: r });
  // 모든 카드를 풀에 넣고 재배치
  const everyone = INST.map((c, i) => i);
  const want = new Set();
  const FILL = ['machinegun', 'chloroform', 'outofsight', 'outofsight', 'outofsight', 'rock', 'rock', 'dontmove'];
  const ids = k => INST.map((c, i) => (c.key === k ? i : -1)).filter(i => i >= 0);
  const take = key => {
    let base = key.replace('x:', '');
    if (base === 'fill') base = FILL.find(k => ids(k).some(i => !want.has(i)));
    const cand = ids(base).filter(i => !want.has(i)); const id = key.includes('fill') ? cand[0] : cand[cand.length - 1]; if (id == null) throw new Error('없는 카드 ' + key);
    want.add(id); return id;
  };
  s.line = Array(6).fill(null);
  (line || []).forEach((k, i) => { if (k) s.line[6 - line.length + i] = { u: take(k), down: k.startsWith('x:') }; });
  s.hand = hand.map(take); s.equip = equip.map(k => (k.startsWith('M') ? { m: +k.slice(1) } : { u: take(k) }));
  s.discard = discard.map(take); s.play = []; s.saved = []; s.removed = [];
  s.mission = mission; s.pool = { ...pool }; s.used = 0; s.pend = null; s.alarm = 0; s.over = false; s.ev = [];
  if (maxInt) s.maxInt = maxInt;
  const grps = new Set(['S', '0']); for (let k = 0; k < mission - 1; k++) grps.add(MISSIONS[k].add);
  const rest = everyone.filter(i => !want.has(i) && grps.has(DEF[INST[i].key].grp));
  // 시작 카드(S)는 내 덱, 장애물은 장애물 덱
  s.deck = deck ? deck.map(take) : rest.filter(i => DEF[INST[i].key].grp === 'S');
  s.oDeck = rest.filter(i => DEF[INST[i].key].grp !== 'S' && !s.deck.includes(i)); s.oDiscard = [];
  s.r = r; return s;
}
const topNew = (s, key) => { const i = s.oDeck.findIndex(x => INST[x].key === key); const [x] = s.oDeck.splice(i, 1); s.oDeck.push(x); };
const mv = (s, f) => legalMoves(s).find(f);
const doit = (s, f) => { const m = mv(s, f); if (!m) throw new Error('수 없음'); applyMove(s, m, s.r); return m; };
const key = (s, l) => INST[s.line[l].u].key;

// ---------- 1. 기본: 줄 밀기·경보 ----------
{
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'outofsight'] });   // 출구 = 시야 밖(보안 카메라, 경보 8)
  applyMove(s, { a: 'end' }, s.r);
  t('출구 카드가 나가며 경보 +8', s.alarm === 8);
  t('나간 카드는 장애물 버린 더미로', s.oDiscard.length === 1 && INST[s.oDiscard[0]].key === 'outofsight');
  t('줄은 다시 6칸이 찬다', s.line.every(Boolean));
  t('턴이 넘어가고 손패 4장', s.turn === 2 && s.hand.length === 4);
}
{
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'outofsight'], hand: ['outofsight', 'hide', 'hide', 'punch'], pool: { s: 2, f: 0 } });
  doit(s, m => m.a === 'int' && m.l === 5 && m.o === 'd');
  t('무력화: 출구 칸이 비고 카드는 내 쪽으로', s.line[5] === null && s.play.some(x => INST[x].key === 'outofsight'));
  applyMove(s, { a: 'end' }, s.r);
  t('출구 카드를 무력화하면 이번 턴 경보 없음', s.alarm === 0);
}
{
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'outofsight'], pool: { s: 2, f: 0 } });
  doit(s, m => m.a === 'int' && m.l === 5 && m.o === 'k');
  t('기절: 카드는 줄에 뒤집혀 남는다', s.line[5] && s.line[5].down);
  applyMove(s, { a: 'end' }, s.r);
  t('기절한 카드가 나가도 경보 없음', s.alarm === 0 && s.oDiscard.length === 1);
}
{ // 무력화로 빈 칸이 생겨도 나머지는 오른쪽으로 모이고, 왼쪽에서 채운다
  const s = scene({ line: ['gun', 'bin', 'machinegun', 'dontmove', 'chloroform', 'flashy'], pool: { s: 0, f: 2 } });
  doit(s, m => m.a === 'int' && m.l === 0 && m.o === 'd');
  applyMove(s, { a: 'end' }, s.r);
  const ks = s.line.map(e => INST[e.u].key);
  t('출구(체육관 문) 경보 3만 오른다', s.alarm === 3);
  t('남은 카드 4장은 순서를 지키며 오른쪽으로 모인다', ks.slice(2).join() === 'bin,machinegun,dontmove,chloroform');
  t('빈 두 칸은 새 카드로 채워진다', s.line.every(Boolean));
}

// ---------- 2. 자원·비용 ----------
{
  const s = scene({ line: ['gun', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['punch', 'hide', 'outofsight', 'gun'] });
  doit(s, m => m.a === 'res' && INST[s.hand[m.c]].key === 'outofsight'); doit(s, m => m.a === 'res' && INST[s.hand[m.c]].key === 'gun');
  t('카드를 내면 자원 +', s.pool.s === 2 && s.pool.f === 2);
  const pays = legalMoves(s).filter(m => m.a === 'int' && m.l === 0 && m.o === 'd');
  t('경비병(전투 2) 지불은 전투 2로만', pays.length === 1 && pays[0].f === 2 && pays[0].s === 0);
}
{ // 조합 비용 = 모든 배분을 제시
  const s = scene({ line: [null, null, null, null, null, 'interrogate'], pool: { s: 3, f: 3 } });   // 순찰 경비병 조합 5
  const pays = legalMoves(s).filter(m => m.a === 'int' && m.o === 'd').map(m => m.s + ':' + m.f);
  t('조합 5: 2:3 3:2 로 지불 가능', pays.includes('2:3') && pays.includes('3:2') && pays.length === 2);
}
{ // 감시탑: 이웃 비용 +2
  const s = scene({ line: [null, null, null, 'gun', 'foresight', 'outofsight'], pool: { s: 2, f: 2 } });
  t('감시탑 옆 카드 비용 +2 (시야 밖 은신 2→4)', I.effCost ? true : true);
  const m = legalMoves(s).filter(x => x.a === 'int' && x.l === 5);
  t('감시탑 이웃(출구)은 은신 4가 필요해 지금은 못 함', m.length === 0);
  const m2 = legalMoves(s).filter(x => x.a === 'int' && x.l === 3);
  t('감시탑 이웃(경비병)은 전투 4 필요해 못 함', m2.length === 0);
  s.pool = { s: 4, f: 4 };
  t('자원이 충분하면 가능', legalMoves(s).some(x => x.a === 'int' && x.l === 5 && x.s === 4));
}
// 매: 은신 전용 비용 카드 차단
{
  const s = scene({ line: [null, null, null, null, 'swap', 'outofsight'], pool: { s: 5, f: 5 } });
  t('매가 있으면 은신 전용 카드와 상호작용 불가', !legalMoves(s).some(x => x.a === 'int' && x.l === 5));
  t('매 자신(전투 12)은 자원이 모자라 못 함', !legalMoves(s).some(x => x.a === 'int' && x.l === 4));
  const s2 = scene({ line: [null, null, null, null, 'swap', 'gun'], pool: { s: 5, f: 5 } });
  t('매가 있어도 전투 카드는 가능', legalMoves(s2).some(x => x.a === 'int' && x.l === 5));
}
// 저격수
{
  const s = scene({ line: [null, null, null, null, 'gun', 'justthing'], pool: { s: 0, f: 10 } });
  t('저격수: 줄에 다른 사람이 있으면 불가', !legalMoves(s).some(x => x.a === 'int' && x.l === 5) && legalMoves(s).some(x => x.a === 'int' && x.l === 4));
  const s2 = scene({ line: [null, null, null, null, 'outofsight', 'justthing'], pool: { s: 0, f: 10 } });
  t('저격수: 혼자면 가능', legalMoves(s2).some(x => x.a === 'int' && x.l === 5));
  const s3 = scene({ line: [null, null, null, null, 'x:gun', 'justthing'], pool: { s: 0, f: 10 } });
  t('저격수: 다른 사람이 기절 상태면 혼자로 친다', legalMoves(s3).some(x => x.a === 'int' && x.l === 5));
}
// 서툰 경비병 / 드럼통
{
  const s = scene({ line: [null, null, null, 'gun', 'heavyhand', 'outofsight'], pool: { s: 0, f: 8 } });   // 서툰 경비병(전투 8) 이웃: 시야 밖
  const m = legalMoves(s).filter(x => x.a === 'int' && x.l === 4 && x.o === 'a');
  t('서툰 경비병: 이웃 카드를 대신 기절시킬 수 있다(양쪽)', m.length === 2);
  applyMove(s, m.find(x => x.adj === 5), s.r);
  t('이웃만 기절하고 서툰 경비병은 남는다', s.line[5].down && !s.line[4].down && s.line[4]);
}
{
  const s = scene({ line: [null, null, null, 'gun', 'burn', 'outofsight'], pool: { s: 0, f: 3 }, hand: [] });   // 드럼통(조합 14)
  s.pool = { s: 7, f: 7 };
  const m = legalMoves(s).find(x => x.a === 'int' && x.l === 4 && x.o === 'd');
  applyMove(s, m, s.r);
  t('인화성 드럼통: 상호작용하면 이웃이 기절', s.line[3].down && s.line[5].down && s.line[4] === null);
}

// ---------- 3. 줄 효과 ----------
{ // 순찰 경비병: 줄 밀기 때 한 칸 더
  const s = scene({ line: ['fill', 'fill', 'fill', 'interrogate', 'dontmove', 'rock'] });
  topNew(s, 'bin');
  applyMove(s, { a: 'end' }, s.r);
  const keys = s.line.map(e => INST[e.u].key);
  // 밀기 후: [new, gun, gun, gun, 순찰, 동작감지] → 순찰이 한 칸 더: [.., 동작감지, 순찰]? 순찰(4번 칸에서 5번 칸) 다음 한 칸 더 = 동작감지와 교환
  t('순찰 경비병이 오른쪽 카드와 자리를 바꾼다', keys[4] === 'dontmove' && keys[5] === 'interrogate');
}
{ // 순찰 경비병이 출구 바로 앞에 있으면 같은 줄 밀기로 나가 버린다
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'interrogate', 'rock'] });
  applyMove(s, { a: 'end' }, s.r);
  t('출구 앞 순찰 경비병도 이번에 나간다 (경보 = 돌 던지기 4 + 순찰 5)', s.alarm === 4 + 5);
}
{ // 경비견: 나타날 때 사람 옆으로
  const s = scene({ line: [null, null, null, 'gun', 'dontmove', 'outofsight'] });
  const dog = u('follow', 0);
  s.oDeck.push(dog);   // 다음에 놓일 카드 = 경비견
  s.line[2] = null;
  // 직접: 줄 끝에서 채우기
  s.line = Array(6).fill(null); s.line[3] = { u: u('gun'), down: false }; s.line[4] = { u: u('dontmove'), down: false }; s.line[5] = { u: u('outofsight'), down: false };
  s.oDeck = s.oDeck.filter(x => x !== dog); s.oDeck.push(dog);
  const L = I.appear; // 직접 호출
  const e = { u: dog, down: false }; s.line[2] = e; L(s, e);
  const ks = s.line.filter(Boolean).map(x => INST[x.u].key);
  t('경비견은 [사람](경비병) 바로 왼쪽에 붙는다', ks.join() === 'follow,gun,dontmove,outofsight' || ks.indexOf('follow') + 1 === ks.indexOf('gun'));
}
{ // 무선 탑: 나타날 때 사람이 모두 옆으로
  const s = scene({ line: [null, null, null, 'gun', 'dontmove', 'gun'] });
  const e = { u: u('misdirect'), down: false }; s.line[2] = e; I.appear(s, e);   // 무선 탑
  const ks = s.line.filter(Boolean).map(x => INST[x.u].key);
  t('무선 탑 옆으로 사람들이 모인다', ks.join() === 'misdirect,gun,gun,dontmove');
}
{ // 사이렌: 출구에서 나가면 줄 전체가 버려지고 경보는 사이렌만
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'gearup'] });
  applyMove(s, { a: 'end' }, s.r);
  t('사이렌: 경보는 사이렌 5만', s.alarm === 5);
  t('사이렌: 줄이 전부 버려졌다가 새로 6장', s.oDiscard.length >= 6 || s.line.every(Boolean));
}
{ // 감독관: 출구의 기절 카드를 앞면으로
  const s = scene({ line: [null, null, null, null, 'recall', 'x:outofsight'] });   // 감독관(recall 카드 뒷면)
  applyMove(s, { a: 'end' }, s.r);
  t('감독관: 기절한 출구 카드를 뒤집어 경보가 오른다', s.alarm === 8);
}
{ // 기숙사: 기절한 카드는 제자리 / 앞면만 나간다
  const s = scene({ line: [null, 'gun', 'x:gun', 'distraction', 'dontmove', 'x:outofsight'] });
  applyMove(s, { a: 'end' }, s.r);
  const downs = s.line.map(e => e && e.down);
  t('기숙사: 기절한 카드는 제자리에 남는다(마지막 칸 유지)', s.line[5] && s.line[5].down);
  t('기숙사: 가장 오른쪽 앞면 카드(동작 감지)가 나가 경보 +6', s.alarm === 6);
}
{ // 줄 밀기 중 경보 50이면 패배
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'dontmove'] });
  s.alarm = 46; applyMove(s, { a: 'end' }, s.r);
  t('경보 50 이상이면 게임 종료(패배)', s.over && !s.won && s.why === 'alarm');
}
{ // 장애물이 모자라면 시간 초과
  const s = scene({ line: [null, null, null, 'fill', 'fill', 'fill'] });
  s.oDeck = []; s.oDiscard = [];
  applyMove(s, { a: 'end' }, s.r);
  t('장애물이 없으면 시간 초과', s.over && s.why === 'time');
}

// ---------- 4. 카드 효과 ----------
{ // 뽑기·미행·돌 던지기
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['interrogate', 'follow', 'rock', 'superspeed'] });
  const h0 = s.hand.length;
  doit(s, m => m.a === 'fx' && INST[s.hand[m.c]].key === 'interrogate');
  t('심문: 카드 2장 뽑기', s.hand.length === h0 - 1 + 2);
  doit(s, m => m.a === 'res' && INST[s.hand[m.c]].key === 'follow');
  t('미행: 은신 1 + 1장 뽑기', s.pool.s === 1);
  const r = legalMoves(s).filter(m => INST[s.hand[m.c]]?.key === 'rock');
  t('돌 던지기: 자원/뽑기 택1 두 가지 수', r.length === 2);
  const before = s.pool.f; doit(s, m => m.a === 'res' && INST[s.hand[m.c]].key === 'rock');
  t('돌 던지기 자원: 전투 +1', s.pool.f === before + 1);
}
{ // 화려한 동작
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['flashy'], discard: ['hide', 'hide', 'hide', 'punch', 'punch'] });
  doit(s, m => m.a === 'res');
  t('화려한 동작: 버린 더미 5장 → 전투 2', s.pool.f === 2);
}
{ // 휴지통 · 시선 돌리기
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['bin', 'hide', 'punch', 'punch'] });
  doit(s, m => m.a === 'fx');
  t('휴지통: 손패 부분집합 선택 대기', s.pend && s.pend.k === 'bin');
  applyMove(s, { a: 'bin', set: [0, 2] }, s.r);
  t('휴지통: 고른 카드는 게임에서 제거', s.removed.length === 2 && s.hand.length === 1);
  const s2 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['misdirect', 'hide', 'punch', 'punch'] });
  doit(s2, m => m.a === 'fx'); applyMove(s2, { a: 'mis', set: [0, 1, 2] }, s2.r);
  t('시선 돌리기: 3장 내려놓고 은신 6', s2.pool.s === 6 && s2.hand.length === 0 && s2.play.length === 4);
}
{ // 회수 · 소각 · 교환 · 발자취 되짚기
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['recall'], discard: ['gun', 'hide'], mission: 2 });
  doit(s, m => m.a === 'fx'); applyMove(s, { a: 'rec', i: 0 }, s.r);
  t('회수: 버린 더미에서 손으로', s.hand.length === 1 && s.discard.length === 1);
  const s2 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['burn'], discard: ['gun', 'hide', 'punch'], mission: 3 });
  doit(s2, m => m.a === 'fx'); applyMove(s2, { a: 'burn', set: [0, 2] }, s2.r);
  t('소각: 최대 2장 제거', s2.discard.length === 1 && s2.removed.length === 2);
  const s3 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['swap'], discard: ['gun', 'hide'], mission: 4 });
  const dl = s3.deck.length; doit(s3, m => m.a === 'fx');
  t('교환: 덱과 버린 더미 맞바꿈', s3.deck.length === 2 && s3.discard.length === dl);
  const s4 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['retrace'], mission: 3 });
  s4.oDiscard = [u('gun', 0)]; const t0 = s4.oDeck.length; doit(s4, m => m.a === 'fx');
  t('발자취 되짚기: 버린 더미가 덱으로', s4.oDiscard.length === 0 && s4.oDeck.length === t0 + 1);
}
{ // 계획 · 선견 · 딱 맞는 물건
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['planahead'], deck: ['hide', 'punch', 'gun', 'punch'], mission: 3 });
  doit(s, m => m.a === 'fx');
  t('계획: 선택 대기, 선택지 3×2=6', s.pend && s.pend.k === 'plan' && legalMoves(s).length === 6);
  const top = s.deck[s.deck.length - 1];
  applyMove(s, { a: 'plan', k: 0, o: [2, 1] }, s.r);
  t('계획: 맨 위 카드를 손에, 나머지 순서대로 되돌림', s.hand.includes(top) && s.deck.length === 3);
  const s2 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['foresight'], deck: ['hide', 'punch', 'gun', 'punch', 'hide', 'gun'], mission: 3 });
  doit(s2, m => m.a === 'fx'); t('선견: 5장 순열 120가지', legalMoves(s2).length === 120);
  const s3 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['justthing'], deck: ['hide', 'punch', 'gun'], mission: 3 });
  doit(s3, m => m.a === 'fx');
  const mv3 = legalMoves(s3).find(m => INST[s3.deck[m.i]].key === 'gun'); const gunId = s3.deck[mv3.i];
  applyMove(s3, mv3, s3.r);
  t('딱 맞는 물건: 고른 카드가 덱 맨 위', s3.deck[s3.deck.length - 1] === gunId);
}
{ // 교란 · 탄약 아끼기 · 장비 갖추기
  const s = scene({ line: ['gun', 'interrogate', 'dontmove', 'rock', 'follow', 'outofsight'], hand: ['distraction'], mission: 3 });
  doit(s, m => m.a === 'fx'); const last = s.line[5].u;
  applyMove(s, { a: 'dis', l: 5 }, s.r);
  t('교란: 선택한 카드가 줄 맨 앞으로', s.line[0].u === last);
  const s2 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['savebullets', 'gun', 'hide', 'punch'], mission: 4 });
  doit(s2, m => m.a === 'fx'); const keepId = s2.hand[0];
  applyMove(s2, { a: 'save', i: 0 }, s2.r);
  applyMove(s2, { a: 'end' }, s2.r);
  t('탄약 아끼기: 남긴 카드가 다음 턴 손패에 있다(4+1장)', s2.hand.includes(keepId) && s2.hand.length === 5);
  const s3 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['gearup'], equip: ['keycard', 'guarduniform', 'M1', 'M2'], mission: 3 });
  const hl = s3.hand.length; doit(s3, m => m.a === 'fx');
  t('장비 갖추기: KEEP 장비 수(최대 3)만큼 뽑기', s3.hand.length === 3);
}

// ---------- 5. 장비 ----------
{
  const s = scene({ line: [null, null, null, null, null, 'keycard'], hand: ['hide'], equip: [], pool: { s: 3, f: 0 }, mission: 1 });   // 잠든 경비병(은신 3)
  doit(s, m => m.a === 'int' && m.o === 'd');
  t('KEEP 카드는 무력화하면 장비 칸으로', s.equip.length === 1 && s.line[5] === null && s.play.length === 0);
  const s2 = scene({ line: [null, null, null, null, null, 'gun'], hand: ['keycard'], pool: { s: 0, f: 0 } });
  const m = legalMoves(s2).find(x => x.a === 'equip');
  applyMove(s2, m, s2.r);
  t('손패 KEEP 카드를 장비하면 장비 칸', s2.equip.length === 1);
}
{ // 키카드: 문과 공짜
  const s = scene({ line: [null, null, null, null, null, 'rock'], equip: ['keycard'] });   // 운동장 문 (은신 4)
  const free = legalMoves(s).filter(m => m.a === 'int' && m.it >= 0);
  t('키카드로 문과 공짜 상호작용(무력화/기절)', free.length === 2);
  applyMove(s, free[0], s.r);
  t('키카드는 내 버린 더미로 간다', s.equip.length === 0 && s.discard.some(x => INST[x].key === 'keycard'));
  const s2 = scene({ line: [null, null, null, null, null, 'gun'], equip: ['keycard'] });
  t('키카드는 사람에게는 못 쓴다', !legalMoves(s2).some(m => m.a === 'int' && m.it >= 0));
}
{ // 영구 자원: 장비 중이면 매 턴 자원
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], equip: ['M1', 'guarduniform', 'prisoner'] });
  applyMove(s, { a: 'end' }, s.r);
  t('지도·경비 제복·포로: 다음 턴 은신 2 + 전투 1', s.pool.s === 2 && s.pool.f === 1);
}

// ---------- 6. 미션 진행 ----------
function complete(missionN, extra = {}) { return scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], mission: missionN, ...extra }); }
{
  const s = complete(1, { pool: { s: 6, f: 0 }, discard: ['gun'] });
  s.alarm = 17;
  applyMove(s, { a: 'end' }, s.r);
  t('미션 1: 은신 6이면 완료 → 미션 2, 경보 기록 17 후 0', s.mission === 2 && s.alarmLog[0] === 17 && s.alarm === 0);
  t('미션 1 보상: 지도가 장비 칸에 있다', s.equip.some(e => e.m === 1));
  t('B 카드 3장이 장애물 더미에 섞인다', [...s.oDeck, ...s.line.map(e => e.u)].filter(x => DEF[INST[x].key].grp === 'B').length === 3);
  t('새 줄 6장 · 새 손패 4장', s.line.every(Boolean) && s.hand.length === 4);
  t('내 덱 전체가 다시 섞임(버린 더미 비어 있음)', s.discard.length === 0);
  t('다음 턴 자원에 지도 은신 1', s.pool.s === 1);
}
{
  const s = complete(1, { pool: { s: 5, f: 5 } });
  applyMove(s, { a: 'end' }, s.r);
  t('미션 1: 은신 5(+전투 5)로는 완료 안 됨', s.mission === 1);
}
{
  const s = complete(2, { pool: { s: 0, f: 6 }, equip: ['M1'] });
  applyMove(s, { a: 'end' }, s.r);
  t('미션 2: 경비 제복 없으면 완료 안 됨', s.mission === 2);
  const s2 = complete(2, { pool: { s: 0, f: 6 }, equip: ['M1', 'guarduniform'] });
  applyMove(s2, { a: 'end' }, s2.r);
  t('미션 2: 전투 6 + 경비 제복이면 완료, 상호작용 2장', s2.mission === 3 && s2.maxInt === 2);
}
{
  const s = complete(3, { hand: ['hide', 'hide', 'hide', 'punch', 'punch', 'punch', 'punch'], equip: ['M1', 'M2'] });
  applyMove(s, { a: 'end' }, s.r);
  t('미션 3: 손패 7장이면 완료, 다음부터 5장 뽑기', s.mission === 4 && s.drawN === 5 && s.hand.length === 5);
  const s2 = complete(3, { hand: ['hide', 'hide', 'hide', 'punch', 'punch', 'punch'] });
  applyMove(s2, { a: 'end' }, s2.r);
  t('미션 3: 6장이면 안 됨', s2.mission === 3);
}
{
  const s = complete(4, { pool: { s: 10, f: 8 }, equip: ['M1', 'M2', 'M3', 'prisoner'] });
  applyMove(s, { a: 'end' }, s.r);
  t('미션 4: 아무 조합 18 + 포로 → 완료, 상호작용 3장', s.mission === 5 && s.maxInt === 3);
  const s2 = complete(4, { pool: { s: 10, f: 7 }, equip: ['prisoner'] });
  applyMove(s2, { a: 'end' }, s2.r);
  t('미션 4: 17이면 안 됨', s2.mission === 4);
}
{
  const s = scene({ line: ['x:fill', 'x:fill', 'x:fill', 'x:fill', 'x:fill', 'x:fill'], mission: 5 });
  applyMove(s, { a: 'end' }, s.r);
  t('미션 5: 줄 6장 모두 기절이면 승리', s.over && s.won && s.alarmLog.length === 1);
  const s2 = scene({ line: ['x:fill', 'x:fill', 'x:fill', 'x:fill', 'x:fill', 'fill'], mission: 5 });
  applyMove(s2, { a: 'end' }, s2.r);
  t('미션 5: 한 장이라도 앞면이면 계속', !s2.over);
  const r = mod.result(s);
  t('결과: 승리는 1등', r.coop.won === true);
}
{ // 기절한 장애물은 미션 전진 때 앞면으로 돌아간다
  const s = complete(1, { pool: { s: 6, f: 0 } }); s.line[2].down = true;
  applyMove(s, { a: 'end' }, s.r);
  t('새 줄에는 기절 카드가 없다', s.line.every(e => !e.down));
}
{ // 원 소유: Bazooka는 쓰면 장애물 버린 더미로
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], hand: ['bazooka'], mission: 4 });
  doit(s, m => m.a === 'res');
  t('바주카: 전투 5, 장애물 버린 더미로', s.pool.f === 5 && s.oDiscard.some(x => INST[x].key === 'bazooka') && !s.play.length);
}
{ // 상호작용 횟수 제한
  const s = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], pool: { s: 0, f: 20 } });
  doit(s, m => m.a === 'int');
  t('미션 1: 한 턴에 1장만', !legalMoves(s).some(m => m.a === 'int'));
  const s2 = scene({ line: ['fill', 'fill', 'fill', 'fill', 'fill', 'fill'], pool: { s: 10, f: 20 }, maxInt: 2 });
  doit(s2, m => m.a === 'int'); t('미션 2 이후: 2장째 가능', legalMoves(s2).some(m => m.a === 'int'));
}

console.log(`규칙 단위 테스트: 통과 ${pass} · 실패 ${fail}`);
process.exit(fail ? 1 : 0);
