// 러브레터 고정 테스트: 규격 검사 + "멍청이 장면"(숫자만 보는 봇이 하는 실수)을 측정해 기준선 아래로 내려가지 않게 고정한다.
import fs from 'fs';
import ll from '../games/loveletter.js';
import { makeRng } from '../core/rng.js';
import { contractCheck, simulate, buildPlayers } from '../core/runner.js';
import { drawSeats } from '../core/seating.js';
import { test, assert, eq, report } from './harness.mjs';
const raw = JSON.parse(fs.readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8'));
const CH = raw.characters || raw;
const entry = JSON.parse(fs.readFileSync(new URL('../games/index.json', import.meta.url), 'utf8')).games.find(g => g.id === 'loveletter');
const T = (o = {}) => ({ skill: 7, aggression: 5, risk: 5, patience: 5, bluff: 3, targetMode: 'none', ...o });
const P = n => Array.from({ length: n }, (_, i) => ({ seat: i, human: i === n - 1, characterId: null }));
function scene(seed, hand0, others, deckLen = 10, tweak) {
  const s = ll.newGame({ players: P(4), rng: makeRng(seed) });
  s.turn = 0; s.phase = 'play'; s.hand[0] = hand0.slice(); s.prot = [false, false, false, false];
  others.forEach((v, i) => { s.hand[i + 1] = [v]; });
  s.deck = s.deck.slice(0, deckLen); s.ev = [];
  if (tweak) tweak(s);
  return s;
}
const rate = (fn, N = 300) => { let c = 0; for (let k = 0; k < N; k++) if (fn(k)) c++; return c / N; };
const pick = (s, t, k) => ll.botChoose(s, t, makeRng(k));
const G = '러브레터';

await test(G, '규격 검사 2~6인 (오류·불법 수 0, 시드 재현, JSON 상태, 목록·테마 일치)', () => { const r = contractCheck(ll, entry, CH, { games: 300 }); assert(r.ok, r.problems.join(' / ')); });
await test(G, '규칙: 백작부인+왕/왕자면 백작부인만 낼 수 있다', () => { const s = scene(1, [7, 8], [1, 2, 3]); const m = ll.legalMoves(s); assert(m.length && m.every(x => s.hand[0][x.i] === 8)); });
await test(G, '규칙: 모두 시녀 보호 중이면 병사는 효과 없음, 왕자는 나만', () => { const s = scene(1, [1, 5], [1, 2, 3], 10, s => { s.prot = [false, true, true, true]; }); const m = ll.legalMoves(s); assert(m.filter(x => x.i === 0).every(x => x.t === -1)); assert(m.filter(x => x.i === 1).every(x => x.t === 0)); });
await test(G, '규칙: 덱이 비면 숫자 비교, 동점이면 모두 승리 / 스파이 단독 생존자 +1', () => {
  const s = scene(2, [4, 2], [9, 9, 3], 0, s => { s.spy[2] = true; }); s.tokens = [0, 0, 0, 0];
  ll.applyMove(s, { i: 0, t: -1, g: -1 }, makeRng(1));
  eq(s.lastRound.winners, [1, 2]); eq(s.lastRound.spy, 2); eq(s.tokens, [0, 1, 2, 0]);
});
await test(G, '규칙: 왕자로 공주를 버리게 하면 탈락, 덱이 비면 제외 카드를 받는다', () => {
  const s = scene(3, [5, 2], [9, 3, 4]); ll.applyMove(s, { i: 0, t: 1, g: -1 }, makeRng(1)); assert(s.out[1]);
  const s2 = scene(3, [5, 2], [6, 3, 4], 0); const a = s2.aside; ll.applyMove(s2, { i: 0, t: 1, g: -1 }, makeRng(1)); eq(s2.lastRound.hands[1], a);
});
await test(G, '봇은 남의 손패를 훔쳐보지 않는다 (상대 카드를 바꿔도 판단 동일)', () => {
  for (let k = 0; k < 100; k++) { const a = pick(scene(k, [1, 2], [9, 3, 4]), T(), k), b = pick(scene(k, [1, 2], [2, 5, 6]), T(), k); eq(a.move, b.move); }
});
await test(G, '공주를 스스로 내거나, 공주를 쥐고 자기에게 왕자를 쓰지 않는다', () => { eq(rate(k => pick(scene(k, [9, 1], [2, 3, 4]), T(), k).move.i === 0), 0); eq(rate(k => { const r = pick(scene(k, [9, 5], [2, 3, 4]), T(), k).move; return r.i === 1 && r.t === 0; }), 0); });
await test(G, '남작: 남는 카드가 병사면 쓰지 않고(0%), 공주면 쓴다(90%+)', () => { assert(rate(k => pick(scene(k, [3, 1], [5, 6, 2]), T(), k).move.i === 0) <= 0.05); assert(rate(k => pick(scene(k, [3, 9], [5, 6, 2]), T(), k).move.i === 0) >= 0.9); });
await test(G, '사제로 본 카드는 병사로 부른다 (80%+, 나머지는 실력 낮아 깜빡함)', () => { assert(rate(k => { const r = pick(scene(k, [1, 4], [7, 2, 3], 10, s => { s.know[0][1] = 7; }), T(), k).move; return r.i === 0 && r.t === 1 && r.g === 7; }) >= 0.8); });
await test(G, '다 나온 카드는 부르지 않는다 (카드 세기)', () => { eq(rate(k => pick(scene(k, [1, 1], [3, 3, 3], 10, s => { s.disc[1].push({ v: 5, how: 'play', fresh: true }); s.disc[2].push({ v: 5, how: 'play', fresh: true }); }), T(), k).move.g === 5), 0); });
await test(G, '버릇 읽기: 같은 카드를 4차례 쥔 사람에게는 높은 카드를 부른다 (텔 없을 때보다 크게 높음)', () => {
  const tell = rate(k => { const r = pick(scene(k, [1, 1], [3, 3, 3], 10, s => { s.hold[1] = 4; }), T({ skill: 8 }), k).move; return r.t === 1 && r.g >= 6; });
  const base = rate(k => pick(scene(k, [1, 1], [3, 3, 3]), T({ skill: 8 }), k).move.g >= 6);
  assert(tell >= 0.8 && base <= 0.3, `${tell} / ${base}`);
});
await test(G, '백작부인 읽기: 방금 백작부인을 낸 사람에게 왕/왕자를 부른다', () => { assert(rate(k => { const r = pick(scene(k, [1, 1], [3, 3, 3], 10, s => { s.countess[1] = true; s.disc[1].push({ v: 8, how: 'play', fresh: true }); }), T({ skill: 8 }), k).move; return r.t === 1 && (r.g === 5 || r.g === 7); }) >= 0.8); });
await test(G, '허세: 허세 성향 높은 봇은 초반에 백작부인을 일부러 내고(30%+), 낮은 봇은 거의 안 한다(5% 이하)', () => {
  const hi = rate(k => pick(scene(k, [8, 2], [3, 4, 5], 12), T({ bluff: 7 }), k).move.i === 0), lo = rate(k => pick(scene(k, [8, 2], [3, 4, 5], 12), T({ bluff: 1 }), k).move.i === 0);
  assert(hi >= 0.3 && lo <= 0.05, `${hi} / ${lo}`);
});
await test(G, '공주+시녀면 시녀로 보호 / 마지막 차례엔 높은 카드를 남긴다 / 초반 스파이는 바로 낸다', () => {
  assert(rate(k => pick(scene(k, [9, 4], [5, 6, 2]), T(), k).move.i === 1) >= 0.95);
  assert(rate(k => pick(scene(k, [8, 2], [5, 6, 3], 0), T(), k).move.i === 1) >= 0.95);
  assert(rate(k => pick(scene(k, [0, 7], [3, 3, 3], 12), T(), k).move.i === 0) >= 0.9);
});
await test(G, '실제 캐릭터 2~6인 각 3000판: 오류 0, 쏠림 경고 없음', () => { for (const n of [2, 3, 4, 5, 6]) { const r = simulate(ll, CH, { games: 3000, count: n, seed: 21 }); eq([r.errors, r.illegal], [0, 0]); eq(r.warnings, [], r.warnings.join(',')); } });
process.exit(report('러브레터 테스트') ? 1 : 0);
