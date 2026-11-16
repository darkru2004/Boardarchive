// 프라이데이 고정 테스트: 카드 데이터(룰북 수치) · 준비(레벨 1~4) · 싸움(이기기/지기/희생/파괴) · 능력 12종 · 노화 효과 · 더미 순환 · 단계 진행 · 해적 특수 5종 · 점수 · 규격.
import fs from 'fs';
import fr, { START_DEFS, AGING_DEFS, HAZARDS, PIRATES, evalFight, scoreOf } from '../games/friday.js';
import { makeRng } from '../core/rng.js';
import { contractCheck } from '../core/runner.js';
import { buildRecord } from '../core/records.js';
import { test, assert, eq, report } from './harness.mjs';
const CH = JSON.parse(fs.readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8')).characters;
const entry = JSON.parse(fs.readFileSync(new URL('../games/index.json', import.meta.url), 'utf8')).games.find(g => g.id === 'friday');
const G = '프라이데이', P1 = [{ seat: 0, human: true, characterId: null }];
const fresh = (level = 1, seed = 1) => fr.newGame({ players: P1, options: { level }, rng: makeRng(seed) });
let U = 1000;
const S = d => ({ u: U++, t: 'S', d }), A = d => ({ u: U++, t: 'A', d }), K = d => ({ u: U++, t: 'K', d });
const W = 0, EAT = 1, DIS = 2, BAZ = 3, BUL = 4;                         // 시작 카드 번호
const AG = n => AGING_DEFS.findIndex(a => a.n === n), HZ = (n, k) => HAZARDS.findIndex((h, i) => h.n === n && (k == null || h.k === k));
const mv = (s, m, rng = makeRng(9)) => { const ok = fr.legalMoves(s).some(x => JSON.stringify(x) === JSON.stringify(m)); if (!ok) throw new Error('불법 수: ' + JSON.stringify(m) + ' / 합법: ' + JSON.stringify(fr.legalMoves(s)).slice(0, 160)); fr.applyMove(s, m, rng); };
// 장면: 싸움 중인 상태 만들기 (더미는 지정한 카드들)
function scene({ level = 1, step = 0, ref = { type: 'h', i: HZ('Skypiea') }, rob = [], disc = [], left = [], right = [], life = 20, hazDisc = [], aging, deck = [] } = {}) {
  const s = fresh(level); s.step = step; s.life = life; s.reserve = 22 - life; s.rob = rob; s.robDisc = disc; s.hazDisc = hazDisc; s.hazDeck = deck; s.offer = []; s.single = null;
  if (aging) { s.aging = aging; s.agingStart = Math.max(s.agingStart, aging.length); }
  s.pirateNo = ref.type === 'p' ? 0 : -1; s.phase = 'fight'; startF(s, ref); s.fight.left = left; s.fight.right = right; return s;
}
function startF(s, ref) { const info = fr._t.hazardInfo(s, ref); s.fight = { ref, left: [], right: [], used: {}, down: {}, dbl: {}, stepdown: 0, free: info.free, need: info.vals, pirate: info.pirate, sp: info.sp || null, pend: null, lost: null }; }

await test(G, '카드 데이터: 시작 18(2×1·1×3·0×8·−1×5·+2생명 1) · 노화 11(일반 8·어려움 3) · 위험 30 · 해적 10 — 룰북 수치와 일치', () => {
  const st = []; START_DEFS.forEach(d => { for (let i = 0; i < d.c; i++) st.push(d.ab ? 'e' : d.v); });
  eq(st.length, 18); eq(st.filter(x => x === 2).length, 1); eq(st.filter(x => x === 1).length, 3); eq(st.filter(x => x === 0).length, 8); eq(st.filter(x => x === -1).length, 5); eq(st.filter(x => x === 'e').length, 1);
  eq(AGING_DEFS.length, 11); eq(AGING_DEFS.filter(a => a.hard).length, 3);
  const nv = AGING_DEFS.filter(a => !a.hard); eq(nv.filter(a => a.v === -1).length, 1); eq(nv.filter(a => a.v === -2).length, 2); eq(nv.filter(a => a.v === -3).length, 1);
  eq(nv.filter(a => a.ab === 'hi0').length, 2); eq(nv.filter(a => a.ab === 'm1').length, 1); eq(nv.filter(a => a.ab === 'stop').length, 1);
  eq(AGING_DEFS.filter(a => a.hard).map(a => a.ab || a.v).sort(), ['m2', -4, -5].sort());
  eq(HAZARDS.length, 30); const byF = {}; HAZARDS.forEach(h => { byF[h.f] = (byF[h.f] || 0) + 1; }); eq(byF, { 1: 10, 2: 8, 3: 6, 4: 4, 5: 2 });
  const pat = { 1: [0, 1, 3], 2: [1, 3, 6], 3: [2, 5, 8], 4: [4, 7, 11], 5: [5, 9, 14] };
  HAZARDS.forEach(h => eq([h.g, h.y, h.r], pat[h.f], h.n + ' 위험값 패턴'));
  eq(PIRATES.length, 10); eq(PIRATES.filter(p => !p.sp).length, 5); eq(PIRATES.filter(p => p.sp).map(p => p.sp).sort(), ['aging2', 'cost2', 'half', 'plus1', 'rest']);
  const ab = {}; HAZARDS.forEach(h => { ab[h.ab || '-'] = (ab[h.ab || '-'] || 0) + 1; }); eq(Object.keys(ab).filter(k => k !== '-').sort(), ['below', 'card1', 'card2', 'copy', 'destroy', 'double', 'ex1', 'ex2', 'life1', 'sort', 'step']);
});
await test(G, '규격 검사(1인, 오류·불법 수 0, 시드 재현, JSON 상태, 목록·테마·협력 표시 일치)', () => {
  const r = contractCheck(fr, entry, CH, { games: 40 });
  assert(r.ok, r.problems.join(' / ')); eq(entry.mode, 'coop', 'index.json 에 mode:coop');
});
await test(G, '준비 레벨 1~4: 노화 더미·시작 더미·생명·예비·해적 2장', () => {
  let s = fresh(1); eq([s.rob.length, s.aging.length, s.life, s.reserve, s.pirates.length], [18, 10, 20, 2, 2]);
  assert(!s.aging.some(a => AGING_DEFS[a.d].vs), 'Very Stupid 제거'); eq(s.aging.slice(0, 7).every(a => !AGING_DEFS[a.d].hard) && s.aging.slice(7).every(a => AGING_DEFS[a.d].hard), true, '일반 7장이 위, 어려움 3장이 아래');
  s = fresh(2); eq([s.rob.length, s.aging.length], [19, 9]); eq(s.rob.filter(c => c.t === 'A').length, 1);
  s = fresh(3); eq([s.rob.length, s.aging.length, s.life], [19, 10, 20]); assert([...s.aging, ...s.rob].some(c => c.t === 'A' && AGING_DEFS[c.d].vs), 'L3은 Very Stupid 포함');
  s = fresh(4); eq([s.life, s.reserve], [18, 2]); eq(s.hazDeck.length + s.offer.length, 30);
});
await test(G, '턴 시작: 위험 2장 중 1장을 고르고 나머지는 버림 더미로', () => {
  const s = fresh(); eq(s.phase, 'choose'); const [a, b] = s.offer; mv(s, { t: 'pick', i: 1 });
  eq(s.fight.ref, { type: 'h', i: b }); eq(s.hazDisc, [a]); eq(s.hazDeck.length, 28);
});
await test(G, '무료 카드는 흰 칸 수만큼 왼쪽, 그 뒤는 생명 1을 내고 오른쪽 · 이기면 지식 카드가 버린 더미로', () => {
  const s = scene({ ref: { type: 'h', i: HZ('Enies Lobby', 'Zoro') }, rob: [S(BUL), S(W), S(BAZ), S(DIS), S(BUL)], disc: [] });   // 무료 3, 초록 2
  mv(s, { t: 'draw' }); mv(s, { t: 'draw' }); mv(s, { t: 'draw' }); eq([s.fight.left.length, s.fight.right.length, fr._t.freeLeft(s.fight)], [3, 0, 0]);
  eq(evalFight(s).total, 3); eq(s.life, 20);
  mv(s, { t: 'draw' }); eq([s.fight.right.length, s.life, s.reserve], [1, 19, 3]);                         // 희생
  mv(s, { t: 'end' }); eq(s.stats.wins, 1); eq(s.robDisc.some(c => c.t === 'K' && HAZARDS[c.d].k === 'Zoro'), true, '지식 카드 획득'); eq(s.robDisc.length, 5);
});
await test(G, '지기: 모자란 만큼 생명을 내고, 그 생명으로 시작·지식 1점/노화 2점짜리를 파괴 · 위험 카드는 버림 더미로', () => {
  const s = scene({ step: 0, ref: { type: 'h', i: HZ('Whole Cake Island') }, left: [S(DIS), A(AG('Kuma')), S(W)], right: [], deck: [20, 21, 22] });  // 필요 5, 합계 −1
  eq(evalFight(s).total, -2);
  mv(s, { t: 'end' }); eq(s.life, 13); eq(s.phase, 'lose'); eq(s.fight.lose.budget, 7);
  mv(s, { t: 'dest', u: s.fight.left[1].u }); eq(s.fight.lose.budget, 5);   // 노화 2
  mv(s, { t: 'dest', u: s.fight.left[0].u }); mv(s, { t: 'fin' });
  eq(s.gone.length, 2); eq(s.robDisc.length, 1); eq(s.hazDisc.includes(HZ('Whole Cake Island')), true); eq(s.stats.losses, 1);
});
await test(G, '지기에서 예산보다 비싼 카드(노화 2점)는 파괴할 수 없다', () => {
  const s = scene({ ref: { type: 'h', i: HZ('Tequila Wolf') }, left: [S(DIS), S(DIS), A(AG('Kuma'))] });   // 초록 1 / 합계 −3 → 모자람 4
  mv(s, { t: 'end' }); eq(s.fight.lose.budget, 4);
  mv(s, { t: 'dest', u: s.fight.left[2].u }); mv(s, { t: 'dest', u: s.fight.left[0].u }); eq(s.fight.lose.budget, 1);
  assert(!fr.legalMoves(s).some(m => m.t === 'dest' && s.fight.left.find(c => c.u === m.u).t === 'A'), '남은 1점으로 노화 파괴 불가');
});
await test(G, '생명이 모자라면 일부러 지기 불가(끝내기 수가 없음) · 해적에게서는 질 수 없다', () => {
  const s = scene({ ref: { type: 'h', i: HZ('Whole Cake Island') }, left: [S(DIS)], life: 3 });
  assert(!fr.legalMoves(s).some(m => m.t === 'end'), '지불 불가');
  const p = scene({ ref: { type: 'p', i: 0 }, left: [S(W)] }); assert(!fr.legalMoves(p).some(m => m.t === 'end'), '해적은 지는 끝내기 없음');
});
await test(G, '능력 파괴: 뒤집어 0점·능력 취소, 싸움이 끝나면 게임에서 제거(이겨도). 노화 카드도 공짜로 없앤다', () => {
  const zoro = K(HZ('Kuraigana Island')), age = A(AG('Doflamingo'));
  const s = scene({ ref: { type: 'h', i: HZ('Skypiea') }, left: [zoro, age] });
  eq(evalFight(s).total, 3 - 2); mv(s, { t: 'ab', u: zoro.u }); mv(s, { t: 'tgt', u: age.u }); eq(evalFight(s).total, 3);
  assert(!fr.legalMoves(s).some(m => m.t === 'ab' && m.u === zoro.u), '한 번만'); mv(s, { t: 'end' });
  eq(s.gone.map(c => c.u), [age.u]); eq(s.life, 20);
});
await test(G, '능력 2배: 싸움 끝에 한 카드 값만 2배, 같은 카드에 겹치지 않는다', () => {
  const f1 = K(HZ('Water 7')), f2 = K(HZ('Karakuri Island')), b = K(HZ('Kuraigana Island'));   // Franky1 double, Franky2 double, Zoro3
  const s = scene({ ref: { type: 'h', i: HZ('Whole Cake Island') }, left: [f1, f2, b] });
  mv(s, { t: 'ab', u: f1.u }); mv(s, { t: 'tgt', u: b.u }); eq(evalFight(s).total, 1 + 2 + 6);
  mv(s, { t: 'ab', u: f2.u }); assert(!fr.legalMoves(s).some(m => m.t === 'tgt' && m.u === b.u), '이미 2배인 카드는 대상 아님'); mv(s, { t: 'tgt', u: f1.u }); eq(evalFight(s).total, 2 + 2 + 6);
});
await test(G, '능력 복사: 다른 카드의 능력을 한 번 더, 같은 능력을 여러 복사로 · 복사 카드는 복사 불가', () => {
  const rob = K(HZ('Tequila Wolf')), chop = K(HZ('Torino Kingdom')), rob2 = K(HZ('Skypiea'));    // Robin1 copy, Chopper2 life1, Robin0 copy
  const s = scene({ left: [rob, chop, rob2], life: 10 });
  mv(s, { t: 'ab', u: chop.u }); eq(s.life, 11);
  mv(s, { t: 'ab', u: rob.u }); eq(fr.legalMoves(s).filter(m => m.t === 'tgt').map(m => m.u), [chop.u], '복사 카드는 대상 아님'); mv(s, { t: 'tgt', u: chop.u }); eq(s.life, 12);
  mv(s, { t: 'ab', u: rob2.u }); mv(s, { t: 'tgt', u: chop.u }); eq(s.life, 13);
});
await test(G, '능력 생명: 예비 생명(내가 냈던 것 포함)에서만 가져온다', () => {
  const eat = S(EAT), s = scene({ left: [eat], life: 22 }); assert(!fr.legalMoves(s).some(m => m.t === 'ab'), '예비 0이면 쓸 수 없음');
  const t = scene({ left: [eat], life: 21 }); mv(t, { t: 'ab', u: eat.u }); eq([t.life, t.reserve], [22, 0]);
});
await test(G, '능력 카드 +1/+2: 오른쪽에 무료로 뽑는다(+2는 최대 2장, 중간에 멈출 수 있음)', () => {
  const g2 = K(HZ('Enies Lobby', 'Gear 3rd')), us = K(HZ('Boin Archipelago'));
  const s = scene({ left: [g2, us], rob: [S(BUL), S(W), S(BAZ)] });
  mv(s, { t: 'ab', u: g2.u }); eq(s.fight.right.length, 1); mv(s, { t: 'ab', u: us.u }); eq(s.fight.pend.k, 'draw'); mv(s, { t: 'pdraw' }); mv(s, { t: 'psk' }); eq([s.fight.right.length, s.life, s.rob.length], [2, 20, 1], '무료라 생명 그대로');
});
await test(G, '능력 교환: 같은 자리에 새 카드, 교환 2회(두 번째는 건너뛸 수 있음)', () => {
  const na = K(HZ('Weatheria')), bad = S(DIS), bad2 = S(DIS);
  const s = scene({ left: [na, bad], right: [bad2], rob: [S(BAZ), S(BUL), S(W)] });
  mv(s, { t: 'ab', u: na.u }); mv(s, { t: 'tgt', u: bad.u }); eq(s.fight.left[1].d, BAZ); eq(s.robDisc.map(c => c.u), [bad.u]); eq(s.fight.pend, null);
  const n2 = K(HZ('Arlong Park')), t = scene({ left: [n2, bad], right: [bad2], rob: [S(BAZ), S(BUL), S(W)] });
  mv(t, { t: 'ab', u: n2.u }); mv(t, { t: 'tgt', u: bad.u }); assert(t.fight.pend && fr.legalMoves(t).some(m => m.t === 'psk'), '두 번째 교환은 선택'); mv(t, { t: 'tgt', u: bad2.u }); eq(t.fight.right[0].d, BUL); eq(t.fight.pend, null);
});
await test(G, '능력 아래로: 더미 맨 밑으로, 왼쪽(무료) 카드면 1장 새로 뽑음 / 오른쪽이면 안 뽑음', () => {
  const jin = K(HZ('Fish-Man Island', 'Jinbe')), x = S(DIS), y = S(DIS);
  const s = scene({ left: [jin, x], right: [y], rob: [S(BAZ), S(BUL)] });
  mv(s, { t: 'ab', u: jin.u }); mv(s, { t: 'tgt', u: x.u }); eq(s.rob.map(c => c.d), [BUL, DIS]); eq(s.fight.left[1].d, BAZ);
  const t = scene({ left: [jin, x], right: [y], rob: [S(BAZ), S(BUL)] }); mv(t, { t: 'ab', u: jin.u }); mv(t, { t: 'tgt', u: y.u }); eq(t.fight.right.length, 0); eq(t.rob.length, 3);
});
await test(G, '능력 3장 정렬: 위 3장을 보고 1장 버리고 순서 정하기', () => {
  const san = K(HZ('Wano Kingdom')), s = scene({ left: [san], rob: [S(DIS), S(BAZ), S(BUL), S(W)] });
  mv(s, { t: 'ab', u: san.u }); eq(s.fight.pend.cards.length, 3); eq(s.rob.length, 1);
  mv(s, { t: 'sort', d: 0, o: [2, 1] }); eq(s.rob.map(c => c.d), [BUL, BAZ, W]); eq(s.robDisc.map(c => c.d), [DIS]);
});
await test(G, '능력 단계 −1: 노랑/빨강에서만, 끝낼 때 낮은 색 값으로 비교 · 초록과 해적엔 쓸 수 없음', () => {
  const brook = K(HZ('Thriller Bark')), hz = { type: 'h', i: HZ('Whole Cake Island') };
  const g = scene({ step: 0, ref: hz, left: [brook] }); assert(!fr.legalMoves(g).some(m => m.t === 'ab'), '초록에선 무의미');
  const s = scene({ step: 2, ref: hz, left: [brook, K(HZ('Kuraigana Island')), K(HZ('Whole Cake Island', 'Gear 4th'))] });   // 빨강 14
  mv(s, { t: 'ab', u: brook.u }); eq(evalFight(s).need, 9); eq(evalFight(s).total, 3 + 4);
  const p = scene({ step: 2, ref: { type: 'p', i: 0 }, left: [brook] }); assert(!fr.legalMoves(p).some(m => m.t === 'ab'), '해적엔 무의미');
});

await test(G, '노화 생명 −1/−2: 싸움이 끝날 때 이겨도 낸다 · 파괴로 뒤집으면 취소', () => {
  const bug = A(AG('Buggy')), big = A(AG('Big Mom')), s = scene({ ref: { type: 'h', i: HZ('Skypiea') }, left: [S(BAZ), bug, big], life: 10 });
  mv(s, { t: 'end' }); eq(s.life, 7); eq(s.stats.wins, 1);
  const zoro = K(HZ('Kuraigana Island')), t = scene({ left: [zoro, A(AG('Big Mom'))], life: 10 }); mv(t, { t: 'ab', u: zoro.u }); mv(t, { t: 'tgt', u: t.fight.left[1].u }); mv(t, { t: 'end' }); eq(t.life, 10);
});
await test(G, '노화 최고값=0: 가장 높은 양수 카드 1장이 0점(동점이면 1장만) · 노화 2장이면 2장', () => {
  const s = scene({ left: [S(BAZ), S(BUL), S(BUL), A(AG('Crocodile'))] }); eq(evalFight(s).total, 2);
  const t = scene({ left: [S(BUL), S(BUL), A(AG('Crocodile'))] }); eq(evalFight(t).total, 1);
  const u = scene({ left: [S(BAZ), S(BUL), S(BUL), A(AG('Crocodile')), A(AG('Moria'))] }); eq(evalFight(u).total, 1);
});
await test(G, '노화 멈춤: 왼쪽에 놓이면 무료 뽑기 중단 · 파괴로 뒤집으면 다시 뽑을 수 있다 · 오른쪽이면 무관', () => {
  const han = A(AG('Hancock')), s = scene({ ref: { type: 'h', i: HZ('Enies Lobby', 'Zoro') }, rob: [S(BUL), S(BUL), S(BUL)], left: [han] });
  eq(fr._t.freeLeft(s.fight), 0); mv(s, { t: 'draw' }); eq([s.fight.left.length, s.fight.right.length, s.life], [1, 1, 19], '희생으로만');
  const zoro = K(HZ('Kuraigana Island')), t = scene({ ref: { type: 'h', i: HZ('Enies Lobby', 'Zoro') }, rob: [S(BUL)], left: [A(AG('Hancock')), zoro] });
  mv(t, { t: 'ab', u: zoro.u }); mv(t, { t: 'tgt', u: t.fight.left[0].u }); eq(fr._t.freeLeft(t.fight), 1);
});
await test(G, '더미가 비면: 남은 카드를 다 뽑은 뒤 버린 더미+노화 1장을 섞어 새 더미 (미리 섞지 않음)', () => {
  const s = scene({ ref: { type: 'h', i: HZ('Whole Cake Island') }, rob: [S(BUL)], disc: [S(W), S(W), S(DIS)] });
  const ag0 = s.aging.length; mv(s, { t: 'draw' }); eq([s.rob.length, s.robDisc.length, s.aging.length], [0, 3, ag0], '마지막 카드를 뽑아도 아직 안 섞음');
  mv(s, { t: 'draw' }); eq([s.robDisc.length, s.aging.length], [0, ag0 - 1]); eq(s.rob.length, 3, '새 더미 4장(버림 3+노화 1) 중 1장을 뽑음');
});
await test(G, '단계 진행: 더미가 비면 버린 더미를 섞어 다음 단계 · 마지막 1장은 싸우거나 버릴 수 있음 · 빨강이 끝나면 해적', () => {
  const t = scene({ left: [S(BAZ)], hazDisc: [10, 11, 12] }); mv(t, { t: 'end' });
  eq(t.step, 1); eq(t.hazDisc.length, 0); eq(t.hazDeck.length + t.offer.length, 3); eq(t.phase, 'choose');
  const u = scene({ left: [S(BAZ)], hazDisc: [10] }); mv(u, { t: 'end' }); eq([u.step, u.phase], [1, 'single']); mv(u, { t: 'skip1' }); eq([u.step, u.phase], [2, 'single'], '버린 1장이 다시 섞여 다음 단계 마지막 1장이 됨');
  const w = scene({ left: [S(BAZ)], hazDisc: [10] }); mv(w, { t: 'end' }); mv(w, { t: 'fight1' }); eq(w.phase, 'fight');
  const v = scene({ step: 2, left: [S(BAZ), S(BUL), S(BUL)] }); mv(v, { t: 'end' }); eq(v.phase, 'pchoose');
});
await test(G, '해적: 해적 2장 중 먼저 싸울 한 장 선택 → 이기면 바로 다음 해적 · 둘 다 이기면 승리 · 지는 끝내기는 없다', () => {
  const s = fresh(); s.hazDeck = []; s.offer = []; s.step = 2; s.phase = 'pchoose'; s.pirates = [0, 6];
  mv(s, { t: 'pirate', i: 1 }); eq(s.fight.ref, { type: 'p', i: 6 }); eq(s.fight.free, 6);
  s.fight.left = [K(HZ('Whole Cake Island', 'Gear 4th')), K(HZ('Whole Cake Island', 'Gear 4th')), K(HZ('Wano Kingdom')), K(HZ('Kuraigana Island')), K(HZ('Kuraigana Island')), K(HZ('Enies Lobby', 'Zoro'))];
  eq(evalFight(s).need, 20); eq(evalFight(s).total, 4 + 4 + 3 + 3 + 3 + 2 - 0 + 0, '합계 19'.length ? 19 : 0); s.fight.right = [S(BUL), S(BUL)]; mv(s, { t: 'end' });
  eq(s.beaten, 1); eq(s.fight.ref, { type: 'p', i: 0 }); eq(s.phase, 'fight'); eq(s.over, false);
  s.fight.left = Array.from({ length: 8 }, () => K(HZ('Whole Cake Island', 'Gear 4th'))); mv(s, { t: 'end' }); eq([s.over, s.won, s.beaten], [true, true, 2]);
});
await test(G, '해적 특수 5종: 추가 카드 생명 2 · 절반만 · 카드마다 +1 · 노화 1장당 위험 +2 · 남은 위험 전부', () => {
  const idx = sp => PIRATES.findIndex(p => p.sp === sp);
  let s = scene({ ref: { type: 'p', i: idx('cost2') }, left: Array.from({ length: 7 }, () => S(W)), rob: [S(BUL), S(BUL)] }); mv(s, { t: 'draw' }); eq(s.life, 18);
  s = scene({ ref: { type: 'p', i: idx('half') }, left: [S(BAZ), S(BUL), S(BUL), S(BUL), A(AG('Kuma'))] }); eq(evalFight(s).total, -1 + 2 + 1, '카드 5장 → 3칸: 노화 1 + 가장 높은 2장');
  s = scene({ ref: { type: 'p', i: idx('plus1') }, left: [S(BUL), S(W), A(AG('Kuma'))] }); eq(evalFight(s).total, 1 + 0 - 1 + 3);
  s = scene({ ref: { type: 'p', i: idx('aging2') }, left: [S(BUL)], aging: fresh().aging.slice(0, 7) }); s.agingStart = 10; eq(evalFight(s).need, 6, '10장 중 3장이 더미에 들어옴 → +6'); eq(s.fight.free, 5);
  s = scene({ ref: { type: 'p', i: idx('rest') }, left: [S(BUL)], hazDisc: [HZ('Whole Cake Island'), HZ('Skypiea')] }); eq([evalFight(s).need, s.fight.free], [14 + 3, 5 + 1]);
});
await test(G, '해적전에 생명이 모자라면 뽑다가 쓰러져 패배(생명 0은 괜찮고 하나 더 필요하면 패배)', () => {
  const s = scene({ ref: { type: 'p', i: 0 }, left: [S(W)], life: 1 }); s.fight.free = 1; mv(s, { t: 'draw' }); eq(s.over, false); eq(s.life, 0);
  mv(s, { t: 'draw' }); eq([s.over, s.won, s.why], [true, false, 'life']);
});
await test(G, '점수: 모든 카드 값(노화 −5) + 해적 15 + 남은 생명 5(승리 시) − 버린 위험 3', () => {
  const s = scene({ rob: [S(BAZ), K(HZ('Whole Cake Island'))], disc: [A(AG('Kaido')), S(DIS)], hazDisc: [1, 2], life: 4 }); s.fight = null; s.beaten = 2; s.won = true;
  eq(scoreOf(s), { cards: 2 + 4 - 5 - 1, pirates: 30, life: 20, hazards: -6, total: 0 + 30 + 20 - 6 });
  const l = fresh(); l.won = false; l.beaten = 1; eq(scoreOf(l).life, 0);
});
await test(G, '결과·기록: 협력 결과 {won, score} 형식, 기록 검증 통과, 상태는 JSON으로 저장·복원 가능', () => {
  const s = fresh(), rng = makeRng(5);
  for (let i = 0; i < 40 && !s.over; i++) { const c = fr.botChoose(s, {}, rng); fr.applyMove(s, c.move, rng); }
  eq(JSON.stringify(JSON.parse(JSON.stringify(s))), JSON.stringify(s));
  const r = fr.result(s); assert(typeof r.coop.won === 'boolean' && Number.isFinite(r.coop.score));
  const rec = buildRecord({ game: { id: 'friday', version: '1.0.0' }, seats: P1, result: r }); eq(rec.mode, 'coop');
});
await test(G, '같은 시드 → 같은 판, 봇 수는 항상 합법(레벨 1~4 × 150판)', () => {
  const sig = seed => { const rng = makeRng(seed), s = fr.newGame({ players: P1, options: { level: 2 }, rng }); let n = 0; while (!s.over && n++ < 2000) { const c = fr.botChoose(s, {}, rng); fr.applyMove(s, c.move, rng); } return JSON.stringify(fr.result(s)) + n; };
  eq(sig(21), sig(21));
  for (const level of [1, 2, 3, 4]) for (let i = 0; i < 150; i++) {
    const rng = makeRng(900 + i), s = fr.newGame({ players: P1, options: { level }, rng }); let n = 0;
    while (!s.over) { if (++n > 3000) throw new Error('무한 루프'); const mvs = fr.legalMoves(s), c = fr.botChoose(s, {}, rng); assert(mvs.some(m => JSON.stringify(m) === JSON.stringify(c.move)), `불법 수 L${level}#${i} ${s.phase}`); fr.applyMove(s, c.move, rng); }
  }
});
process.exitCode = report('프라이데이') ? 1 : 0;
