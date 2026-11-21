// 레지사이드 인페르노 고정 테스트: 한글 룰북의 준비·내기 조합·직업 능력·적 면역·반격·죽은 척하기·어릿광대·1인 규칙.
import fs from 'fs';
import gm, { _t, cl, rk, val, hpOf, atkOf } from '../games/regicide-inferno.js';
import { makeRng } from '../core/rng.js';
import { contractCheck, simulate } from '../core/runner.js';
import { test, assert, eq, throws, report } from './harness.mjs';
const CH = JSON.parse(fs.readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8')).characters;
const entry = JSON.parse(fs.readFileSync(new URL('../games/index.json', import.meta.url), 'utf8')).games.find(g => g.id === 'regicide-inferno');
const G = '레지사이드 인페르노';
const M = 0, CL = 1, BD = 2, WR = 3, PL = 4;        // 마법사 성직자 음유시인 전사 성기사
const c = (cls, r) => cls * 20 + r;
const sum = a => a.reduce((x, y) => x + y, 0);
const fresh = (seed = 1, opt) => gm.newGame({ rng: makeRng(seed), options: opt });
// 장면: 손패·적·더미를 직접 지정. 필요 없는 더미는 비워 둔다.
function scene(o = {}) {
  const s = fresh(3);
  s.hand = (o.hand || []).slice(); s.tavern = (o.tavern || []).slice(); s.discard = (o.discard || []).slice(); s.banish = []; s.zone = (o.zone || []).slice();
  s.aside = (o.aside || []).slice(); s.plays = []; s.castle = o.castle || [c(WR, 12), c(PL, 12)];
  s.enemy = _t.mkEnemy(o.enemy || c(CL, 11)); Object.assign(s.enemy, o.e || {});
  s.phase = 'play'; s.pend = null; s.need = 0; s.paid = 0; s.over = false; s.won = false; s.defeated = o.defeated || 0; s.jk = o.jk == null ? 2 : o.jk; s.jused = 0;
  return s;
}
const play = (s, ...ids) => gm.applyMove(s, { t: 'play', c: ids.slice().sort((a, b) => a - b) });
const playP = (s, p, ...ids) => gm.applyMove(s, { t: 'play', c: ids.slice().sort((a, b) => a - b), p });
const pick = (s, card) => gm.applyMove(s, { t: 'mage', i: s.pend.look.indexOf(card) });
const disc = (s, ...ids) => ids.forEach(x => gm.applyMove(s, { t: 'disc', c: x }));
const all = s => [...s.tavern, ...s.discard, ...s.banish, ...s.zone, ...s.hand, ...s.aside, ...s.castle, ...(s.enemy ? [s.enemy.id] : []), ...s.plays.flatMap(p => p.c.filter(x => x < 100)), ...(s.pend ? s.pend.look : [])];

await test(G, '규격 검사 (1인, 오류·불법 수 0, 시드 재현, JSON 상태, 목록·테마·협력 표시 일치)', () => {
  const r = contractCheck(gm, entry, CH, { games: 30 });
  assert(r.ok, r.problems.join(' / '));
  eq(entry.mode, 'coop', 'index.json 에 mode:coop');
  eq([entry.players.min, entry.players.max], [1, 1]);
});
await test(G, '준비: 적 15명 순서(잭4→칼란나르→퀸4→말리스→킹4→타차에르), 손패 8, 여관 덱, 동료 카드 5장(숫자 2~6 · 서로 다른 직업), 광대 2장', () => {
  const s = fresh(5);
  const castle = [s.enemy.id, ...s.castle];
  eq(castle.length, 15);
  eq(castle.map(x => rk(x)), [11, 11, 11, 11, 11, 12, 12, 12, 12, 12, 13, 13, 13, 13, 13]);
  eq([castle[4], castle[9], castle[14]], [c(M, 11), c(M, 12), c(M, 13)], '마법사 적은 각 단의 맨 끝');
  assert(castle.slice(0, 4).every(x => cl(x) >= 1) && castle.slice(5, 9).every(x => cl(x) >= 1) && castle.slice(10, 14).every(x => cl(x) >= 1), '일반 적 12명은 성직자·음유시인·전사·성기사');
  eq(s.hand.length, 8, '손패 8장');
  eq(s.tavern.length, 37, '여관 덱 50−5−8');
  eq(s.aside.map(rk), [2, 3, 4, 5, 6]);
  eq(new Set(s.aside.map(cl)).size, 5, '5개 직업이 하나씩');
  eq(s.jk, 2);
  eq(all(s).length, 65); eq(new Set(all(s)).size, 65, '카드 65장 중복 없음');
  eq([hpOf(c(CL, 11)), hpOf(c(CL, 12)), hpOf(c(CL, 13)), hpOf(c(M, 11)), hpOf(c(M, 12)), hpOf(c(M, 13))], [20, 30, 40, 30, 40, 50]);
  eq([val(c(M, 11)), val(c(M, 12)), val(c(M, 13)), val(c(WR, 1))], [10, 15, 20, 1]);
});
await test(G, '내기 조합: 한 장 · 동물(A)+다른 카드 · 같은 숫자 합 12 이하 · 동료 카드는 같은 숫자 동족 공격에만', () => {
  const s = scene({ hand: [c(CL, 2), c(BD, 2), c(WR, 2), c(PL, 2), c(M, 2), c(CL, 6), c(WR, 6), c(BD, 4)], aside: [c(PL, 6), c(M, 5)] });
  const ms = _t.playMoves(s).map(m => m.c.join('-') + (m.p != null ? '+' + m.p : ''));
  assert(ms.includes([c(CL, 2), c(BD, 2), c(WR, 2), c(PL, 2), c(M, 2)].sort((a, b) => a - b).join('-')), '2 다섯 장(합 10)');
  assert(ms.includes([c(CL, 6), c(WR, 6)].join('-')), '6 두 장(합 12)');
  assert(!ms.some(x => x.startsWith([c(CL, 6), c(WR, 6)].join('-') + '-') || x.includes('6-26')), '6 세 장은 없음');
  assert(!ms.includes([c(CL, 2), c(CL, 6)].join('-')), '다른 숫자끼리는 불가');
  assert(ms.includes([c(CL, 6)].join('-') + '+' + c(PL, 6)), '6 한 장 + 동료 6 = 12');
  assert(!ms.includes([c(CL, 6), c(WR, 6)].join('-') + '+' + c(PL, 6)), '6+6+6 = 18 초과');
  assert(!ms.some(x => x.endsWith('+' + c(M, 5))), '손에 5가 없으면 동료 5 못 보탬');
  const s2 = scene({ hand: [c(CL, 1), c(WR, 1), c(M, 13), c(BD, 9)], aside: [c(PL, 3)] });
  const m2 = _t.playMoves(s2).map(m => m.c.join('-'));
  assert(m2.includes([c(CL, 1), c(M, 13)].sort((a, b) => a - b).join('-')), 'A+K');
  assert(m2.includes([c(CL, 1), c(WR, 1)].sort((a, b) => a - b).join('-')), 'A+A');
  assert(!m2.some(x => x.split('-').length === 2 && x.includes(String(c(BD, 9))) && x.includes(String(c(M, 13)))), 'A 없이 다른 카드끼리 불가');
  assert(!_t.playMoves(s2).some(m => m.p != null), 'A가 낀 공격에는 동료 카드 불가');
  const s3 = scene({ hand: [c(CL, 3), c(WR, 3), c(BD, 3), c(PL, 3), c(M, 3)] });
  assert(!_t.playMoves(s3).some(m => m.c.length === 5 || m.c.length === 4 && sum(m.c.map(val)) > 12), '3은 최대 4장(합 12)');
  assert(_t.playMoves(s3).some(m => m.c.length === 4), '3 네 장(합 12)은 가능');
});
await test(G, '규칙: 불법 수는 예외로 거부된다', () => {
  const s = scene({ hand: [c(CL, 3), c(WR, 9)] });
  throws(() => play(s, c(CL, 3), c(WR, 9)), /불법/);
  throws(() => play(s, c(BD, 7)), /불법/);
  throws(() => gm.applyMove(s, { t: 'disc', c: c(CL, 3) }), /불법/);
});
await test(G, '룰북 예시: A(전사)+7(성기사) = 공격력 8, 전사 두 배로 피해 16, 성기사가 적 공격력 8 감소', () => {
  const s = scene({ enemy: c(BD, 12), hand: [c(WR, 1), c(PL, 7), c(CL, 9), c(M, 9)] });   // 음유시인 퀸 15/30
  play(s, c(WR, 1), c(PL, 7));
  eq([s.enemy.dmg, s.enemy.sh], [16, 8]);
  eq(s.need, 15 - 8, '반격 = 15−8');
});
await test(G, '룰북 예시: 3+3+3(음유시인·전사·성기사) = 공격력 9 → 9장 뽑기, 피해 18, 성기사 9', () => {
  const tv = []; for (let i = 0; i < 12; i++) tv.push(c(CL, 2 + (i % 9)));
  const s = scene({ enemy: c(CL, 13), hand: [c(BD, 3), c(WR, 3), c(PL, 3), c(M, 10), c(M, 9)], tavern: tv });   // 성직자 킹 20/40 (성직자 면역 무관)
  play(s, c(BD, 3), c(WR, 3), c(PL, 3));
  eq(s.hand.length, 2 + 6, '손패 한도 8까지만 뽑음(2장 남아 있어 6장)');
  eq([s.enemy.dmg, s.enemy.sh], [18, 9]);
  eq(s.tavern.length, 12 - 6);
});
await test(G, '전사: 피해만 두 배(공격력은 그대로) / 한계: 면역이면 두 배 안 됨', () => {
  const s = scene({ enemy: c(CL, 11), hand: [c(WR, 6), c(BD, 4)] });
  play(s, c(WR, 6)); eq(s.enemy.dmg, 12);
  const t = scene({ enemy: c(WR, 11), hand: [c(WR, 6)] });
  play(t, c(WR, 6)); eq(t.enemy.dmg, 6, '전사 적은 전사 능력에 면역 — 숫자 6만');
});
await test(G, '성기사: 적 공격력 감소는 그 적이 죽을 때까지 누적된다', () => {
  const s = scene({ enemy: c(CL, 12), hand: [c(PL, 4), c(PL, 3), c(BD, 9), c(BD, 10), c(WR, 10), c(BD, 8)] });   // 성직자 퀸 15/30
  play(s, c(PL, 4)); eq([s.enemy.sh, s.need], [4, 11]);
  disc(s, c(BD, 10), c(BD, 9));
  eq(s.phase, 'play');
  eq(s.zone, [c(BD, 9)], '마지막에 버린 카드가 적 구역으로');
  play(s, c(PL, 3)); eq(s.enemy.sh, 7); eq(atkOf(s), 15 + 9 - 7, '15 + 구역 9 − 7');
});
await test(G, '성직자: 버림 더미를 섞어 공격력만큼을 여관 덱 맨 아래로, 나머지는 버림에 남는다', () => {
  const d = [c(BD, 2), c(BD, 3), c(BD, 4), c(BD, 5), c(BD, 6), c(BD, 7)];
  const s = scene({ enemy: c(BD, 11), hand: [c(CL, 4), c(M, 9)], discard: d, tavern: [c(WR, 9)] });
  play(s, c(CL, 4));
  eq(s.tavern.length, 1 + 4); eq(s.discard.length - 0 + s.tavern.length, 1 + 6, '카드 수 보존');
  eq(s.tavern[s.tavern.length - 1], c(WR, 9), '기존 맨 위 카드는 그대로 맨 위');
  assert(s.tavern.slice(0, 4).every(x => d.includes(x)), '바닥 4장은 버림 더미에서');
});
await test(G, '음유시인: 공격력만큼, 손패 한도까지, 덱이 모자라도 불이익 없음', () => {
  const s = scene({ enemy: c(WR, 11), hand: [c(BD, 5), c(CL, 9), c(CL, 8)], tavern: [c(M, 2), c(M, 3)] });
  play(s, c(BD, 5)); eq(s.hand.length, 2 + 2, '덱에 2장뿐');
  const t = scene({ enemy: c(WR, 11), hand: [c(BD, 2), c(CL, 9), c(CL, 8), c(CL, 7), c(CL, 6), c(CL, 5), c(CL, 4), c(CL, 3)], tavern: [c(M, 2), c(M, 3), c(M, 4), c(M, 5)] });
  play(t, c(BD, 2)); eq(t.hand.length, 8, '공격력 2장이어도 손패 한도 8까지(7+1)');
});
await test(G, '마법사: 공격력만큼 몰래 보고 한 장을 골라 공격에 붙임, 나머지는 버림 더미로', () => {
  const s = scene({ enemy: c(BD, 12), hand: [c(M, 4), c(CL, 9)], tavern: [c(WR, 2), c(WR, 3), c(WR, 8), c(PL, 7), c(PL, 6)] });   // 음유시인 퀸 15/30
  play(s, c(M, 4));
  eq(s.phase, 'mage'); eq(s.pend.look.length, 4, '공격력 4장');
  const top4 = s.pend.look.slice();
  pick(s, c(PL, 7));
  eq(s.enemy.dmg, 4 + 7, '붙인 카드의 공격력도 합산');
  eq(s.discard.length, 3); eq(s.tavern, [c(WR, 2)].filter(x => !top4.includes(x)), '덱에는 남은 한 장');
  assert(s.plays[0].add.includes(c(PL, 7)));
  eq(s.enemy.sh, 11, '붙인 성기사 카드의 능력도 정상 발동(공격력 11)');
});
await test(G, '마법사 연쇄(고정 장면): M3 → [W5,M6,W8] 에서 M6 선택 → 6장 → 한 장 선택 후 끝', () => {
  const tv = [c(PL, 7), c(PL, 6), c(PL, 5), c(PL, 4), c(PL, 3), c(PL, 2), c(WR, 4), c(M, 6), c(WR, 5)];
  const s = scene({ enemy: c(BD, 13), hand: [c(M, 3), c(CL, 9)], tavern: tv });   // 음유시인 킹 20/40
  play(s, c(M, 3)); eq(s.pend.look, [c(WR, 5), c(M, 6), c(WR, 4)]);
  pick(s, c(M, 6)); eq(s.pend.look.length, 6);
  pick(s, c(PL, 7));
  eq(s.enemy.dmg, 3 + 6 + 7); eq(s.phase, 'dmg');
  eq(s.plays[0].c, [c(M, 3), c(M, 6), c(PL, 7)]);
});
await test(G, '마법사가 낀 공격은 적이 쓰러질 때 버림이 아니라 추방 더미로(면역이어도)', () => {
  const s = scene({ enemy: c(M, 11), hand: [c(M, 9), c(CL, 9)], tavern: [c(BD, 9)], e: { dmg: 22 } });   // 칼란나르 30(22 맞음) — 마법사 능력엔 면역
  play(s, c(M, 9));
  eq(s.phase, 'play', '카드 9 = 피해 9 ≥ 남은 8 → 처치');
  eq(s.banish, [c(M, 9)]); eq(s.discard.includes(c(M, 9)), false);
  assert(s.tavern.length === 1, '마법사 면역이라 여관 덱에서 아무것도 안 뽑음');
});
await test(G, '마법사 적: 적 구역에 놓인 카드의 직업 능력에도 면역 / 일반 적은 자기 직업만', () => {
  const s = scene({ enemy: c(M, 12), zone: [c(WR, 5)], hand: [c(WR, 4), c(PL, 4), c(BD, 4)] });
  eq([0, 1, 2, 3, 4].map(k => _t.immuneTo(s, k)), [true, false, false, true, false]);
  play(s, c(WR, 4)); eq(s.enemy.dmg, 4, '전사 면역 — 두 배 안 됨');
  const t = scene({ enemy: c(PL, 12), zone: [c(WR, 5)] });
  eq([0, 1, 2, 3, 4].map(k => _t.immuneTo(t, k)), [false, false, false, false, true]);
  eq(_t.immuneTo(s, 3, { j: true }), false, '어릿광대 공격은 면역 무시');
});
await test(G, '반격: 적 공격력 + 적 구역 합 − 성기사, 한 장씩 버리다 채우면 멈춤, 마지막 카드가 적 구역으로', () => {
  const s = scene({ enemy: c(CL, 11), zone: [c(BD, 7)], hand: [c(BD, 2), c(WR, 9), c(WR, 8), c(PL, 7), c(PL, 5)] });   // 공격력 10 + 7
  play(s, c(BD, 2));
  eq(s.need, 17, '10+7');
  eq(_t.legalMoves(s).map(m => m.c), [c(WR, 8), c(WR, 9), c(PL, 5), c(PL, 7)].sort((a, b) => a - b));
  disc(s, c(WR, 9), c(WR, 8));
  eq(s.phase, 'play', '17 채움'); eq(s.zone, [c(BD, 7), c(WR, 8)]);
  eq(atkOf(s), 10 + 7 + 8);
});
await test(G, '죽은 척하기: 손패가 가득(8장)일 때만, 모자라도 손패를 전부 버려 피해를 채운 것으로', () => {
  const full = [c(CL, 2), c(BD, 2), c(WR, 2), c(PL, 2), c(M, 2), c(CL, 3), c(BD, 3), c(WR, 3), c(PL, 3)];   // 8장 합 19
  const s = scene({ enemy: c(M, 13), hand: full.slice(0, 8), e: { sh: 0 } });   // 20/50 마법사 킹
  gm.applyMove(s, { t: 'yield' });
  eq(s.need, 20); eq(_t.legalMoves(s), [{ t: 'fake' }], '합 20 미만 + 손패 가득 → 죽은 척하기만');
  gm.applyMove(s, { t: 'fake' });
  eq(s.hand, []); eq(s.phase, 'play'); eq(s.over, false); eq(s.zone.length, 1);
  const t = scene({ enemy: c(M, 13), hand: full.slice(0, 7) });   // 7장 → 가득 아님
  gm.applyMove(t, { t: 'yield' });
  assert(t.over && !t.won, '못 막으면 패배'); eq(t.phase, 'over');
});
await test(G, '처치: 정확히 맞추면 적 카드가 여관 덱 맨 위로, 아니면 버림 더미 / 적 구역·낸 카드는 버림으로 / 같은 사람이 새 적 상대로 바로 시작', () => {
  const s = scene({ enemy: c(CL, 11), hand: [c(WR, 10), c(BD, 9)], zone: [c(BD, 5)], e: { dmg: 10 }, castle: [c(BD, 12)] });
  play(s, c(WR, 10));   // 전사 두 배 20 ≥ 남은 10 → 넘침
  eq(s.discard.includes(c(CL, 11)), true); eq(s.tavern.includes(c(CL, 11)), false);
  eq(s.zone, []); eq(s.enemy.id, c(BD, 12)); eq(s.phase, 'play'); eq(s.defeated, 1);
  eq(s.discard.includes(c(BD, 5)), true, '적 구역 카드는 버림');
  const t = scene({ enemy: c(CL, 11), hand: [c(WR, 5)], e: { dmg: 10 }, castle: [c(BD, 12)] });   // 5×2 = 10 = 남은 10
  play(t, c(WR, 5));
  eq(t.tavern[t.tavern.length - 1], c(CL, 11), '정확히 → 여관 덱 맨 위'); eq(t.discard.includes(c(CL, 11)), false);
});
await test(G, '처치 단계에는 버림 더미 맨 위를 적 구역에 놓지 않는다 / 피해를 입은 턴에만 놓는다', () => {
  const s = scene({ enemy: c(CL, 11), hand: [c(WR, 10), c(BD, 4), c(BD, 5)], discard: [c(M, 9)], castle: [c(BD, 12)], e: { dmg: 10 } });
  play(s, c(WR, 10)); eq(s.zone, []);
  const t = scene({ enemy: c(CL, 12), hand: [c(BD, 2), c(BD, 9), c(WR, 9), c(WR, 8)], discard: [c(M, 9)] });
  play(t, c(BD, 2)); disc(t, c(WR, 9), c(WR, 8)); eq(t.zone, [c(WR, 8)]);
});
await test(G, '어릿광대(1인): 공격력 8 + 고른 직업 능력, 적 면역 무시, 쓰고 나면 다시 못 씀(2번), 버림 더미로 안 감', () => {
  const s = scene({ enemy: c(WR, 11), hand: [c(CL, 9), c(CL, 8)] });   // 전사 잭 10/20 — 전사 능력엔 면역
  gm.applyMove(s, { t: 'jester', k: 3 });
  eq(s.enemy.dmg, 16, '8 × 전사 두 배(면역 무시)'); eq(s.jk, 1);
  assert(!_t.legalMoves(s).some(m => m.t === 'jester' && m.k === 0), '마법사는 고를 수 없음');
  eq(_t.legalMoves(s).filter(m => m.t === 'jester').map(m => m.k), [], '반격 단계에서는 못 냄');
  disc(s, c(CL, 9), c(CL, 8));
  const t = scene({ enemy: c(WR, 11), hand: [c(CL, 9)], e: { dmg: 10 }, castle: [c(BD, 12)] });
  gm.applyMove(t, { t: 'jester', k: 3 });
  eq(t.jused, 1); eq(t.jk, 1); eq(t.discard.includes(100), false); eq(t.defeated, 1);
  assert(_t.legalMoves(t).filter(m => m.t === 'jester').length === 4 && t.jk === 1, '남은 1장은 쓸 수 있음');
});
await test(G, '동료 카드(1인): 같은 숫자 동족 공격에 한 장 보탬 — 보탠 카드의 직업 능력도 발동, 쓰면 줄어듦', () => {
  const s = scene({ enemy: c(BD, 12), hand: [c(WR, 4), c(M, 9)], aside: [c(PL, 4), c(CL, 2)] });
  playP(s, c(PL, 4), c(WR, 4));
  eq(s.aside, [c(CL, 2)]); eq(s.enemy.dmg, 16, '4+4 = 8, 전사 두 배'); eq(s.enemy.sh, 8, '성기사 8');
});
await test(G, '양보: 카드를 안 내고 바로 반격(1인은 언제든 가능)', () => {
  const s = scene({ enemy: c(CL, 11), hand: [c(WR, 9), c(WR, 8), c(BD, 7)] });
  gm.applyMove(s, { t: 'yield' });
  eq(s.need, 10); disc(s, c(WR, 9), c(WR, 8)); eq(s.phase, 'play');
});
await test(G, '승리: 마지막 적(타차에르)을 처치하면 끝', () => {
  const s = scene({ enemy: c(M, 13), castle: [], hand: [c(WR, 10), c(WR, 9)], e: { dmg: 45 } });
  play(s, c(WR, 6) === 0 ? c(WR, 10) : c(WR, 10));
  assert(s.over && s.won, '승리'); eq(gm.result(s).coop.won, true);
});
await test(G, '상태는 JSON으로 저장·복원되고 같은 수열이면 같은 결과', () => {
  const a = fresh(9), b = JSON.parse(JSON.stringify(a));
  const ra = makeRng(5), rb = makeRng(5);
  for (let i = 0; i < 40 && !a.over; i++) { const x = gm.botChoose(a, {}, ra), y = gm.botChoose(b, {}, rb); eq(x.move, y.move, '같은 시드 → 같은 선택'); gm.applyMove(a, x.move); gm.applyMove(b, y.move); }
  eq(a, b); assert(_t.validState(JSON.parse(JSON.stringify(a))));
});
await test(G, '봇: 한 번에 쓰러뜨릴 수 있으면 그 수를 고른다', () => {
  let ok = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = scene({ enemy: c(CL, 11), hand: [c(WR, 10), c(BD, 7), c(PL, 4), c(M, 3)], tavern: [c(BD, 8), c(BD, 9)] });
    const ch = gm.botChoose(s, {}, makeRng(seed)); const t = JSON.parse(JSON.stringify(s)); gm.applyMove(t, ch.move);
    if (t.defeated === 1) ok++;
  }
  assert(ok >= 19, `놓침 ${20 - ok}`);
});
await test(G, '시뮬레이션: 오류 0 · 불법 수 0 · 카드 보존', () => {
  const r = simulate(gm, CH, { games: 60, count: 1, seed: 17 });
  assert(r.errors === 0 && r.illegal === 0, `오류 ${r.errors}/${r.firstError} 불법 ${r.illegal}`);
  assert(r.coop && r.coop.games === 60, '협력 집계');
  for (let i = 0; i < 20; i++) { const rng = makeRng(200 + i), s = gm.newGame({ rng }); let n = 0; while (!s.over && n++ < 2000) { gm.applyMove(s, gm.botChoose(s, {}, rng).move); eq(all(s).length, 65, '카드 수 보존'); } }
});
process.exit(report('레지사이드 인페르노 테스트') ? 1 : 0);
