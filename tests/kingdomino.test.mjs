// 킹도미노 고정 테스트: 규칙(타일·배치·점수·인원별 진행) + 봇이 하면 안 되는 실수를 수치로 고정한다.
import fs from 'fs';
import kd from '../games/kingdomino.js';
import { makeRng } from '../core/rng.js';
import { contractCheck, simulate } from '../core/runner.js';
import { test, assert, eq, throws, report } from './harness.mjs';
const CH = JSON.parse(fs.readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8')).characters;
const entry = JSON.parse(fs.readFileSync(new URL('../games/index.json', import.meta.url), 'utf8')).games.find(g => g.id === 'kingdomino');
const { TILES, placements, applyPlace, scoreBoard, mkBoard, cloneBoard, code } = kd._t;
const T = (o = {}) => ({ skill: 9, aggression: 5, risk: 5, patience: 5, bluff: 3, targetMode: 'none', ...o });
const P = n => Array.from({ length: n }, (_, i) => ({ seat: i, human: i === 0, characterId: null }));
const G = '킹도미노';
const info = seat => ({ seat, rivalSeats: [], allySeats: [] });
// 단순 탐욕 봇: 지금 점수가 가장 많이 오르는 자리·타일만 본다 (비교 기준)
function greedy(s, rng) {
  const b = s.boards[kd.currentSeat(s)], base = scoreBoard(b, s.size, s.opts).total;
  const best = id => { let bv = -1e9, bm = null; for (const m of placements(b, s.size, id)) { const b2 = cloneBoard(b); applyPlace(b2, s.size, id, m); const v = scoreBoard(b2, s.size, s.opts).total - base + rng.next() * 0.01; if (v > bv) { bv = v; bm = m; } } return { bv, bm }; };
  if (s.phase === 'place') return best(s.prev[s.step].id).bm || { t: 'discard' };
  let bi = -1, bv = -1e9; s.line.forEach((e, i) => { if (e.seat >= 0) return; const r = best(e.id), v = (r.bm ? r.bv : -2) + rng.next() * 0.01; if (v > bv) { bv = v; bi = i; } });
  return { t: 'pick', i: bi };
}
function play(n, bots, seed, options = {}, hook) {
  const rng = makeRng(seed), s = kd.newGame({ players: P(n), options, rng });
  while (!kd.isOver(s)) {
    const seat = kd.currentSeat(s), b = bots[seat];
    const ch = b === 'g' ? { move: greedy(s, rng) } : kd.botChoose(s, b, rng, info(seat));
    if (hook) hook(s, seat, ch);
    kd.applyMove(s, ch.move);
  }
  return s;
}
const put = (b, size, x, y, t, c = 0) => { const W = 2 * size - 1, o = size - 1; b.g[(o + y) * W + o + x] = code(t, c, 0); b.x0 = Math.min(b.x0, o + x); b.x1 = Math.max(b.x1, o + x); b.y0 = Math.min(b.y0, o + y); b.y1 = Math.max(b.y1, o + y); b.n++; };

await test(G, '타일 48장: 지형 칸 수·왕관 분포가 공식 규칙과 일치', () => {
  const d = {}; for (let i = 1; i <= 48; i++) { const [a, ca, b, cb] = TILES[i]; for (const [t, c] of [[a, ca], [b, cb]]) d[t + ':' + c] = (d[t + ':' + c] || 0) + 1; }
  eq(d, { '1:0': 21, '2:0': 16, '3:0': 12, '4:0': 10, '5:0': 6, '1:1': 5, '6:0': 1, '2:1': 6, '3:1': 6, '4:1': 2, '5:1': 2, '6:1': 1, '4:2': 2, '5:2': 2, '6:2': 3, '6:3': 1 });
});
await test(G, '규격 검사 2~4인 (오류·불법 수 0, 시드 재현, JSON 상태, 목록·테마 일치)', () => { const r = contractCheck(kd, entry, CH, { games: 60 }); assert(r.ok, r.problems.join(' / ')); });
await test(G, '규칙: 성은 모든 지형과 이어지고, 그 밖에는 같은 지형끼리만 맞닿아야 한다', () => {
  const b = mkBoard(5), c = 4, W = 9;
  const first = placements(b, 5, 13); assert(first.length > 0);
  for (const m of first) { const cs = [[m.x, m.y], [m.x + [1, 0, -1, 0][m.d], m.y + [0, 1, 0, -1][m.d]]]; assert(cs.some(([x, y]) => Math.abs(x - c) + Math.abs(y - c) === 1), '성 옆이 아님'); }
  applyPlace(b, 5, 1, { x: c + 1, y: c, d: 0 });        // 성 오른쪽에 밀밭 2칸
  for (const m of placements(b, 5, 3)) {               // 숲+숲: 밀밭 옆만으로는 못 놓는다
    const cs = [[m.x, m.y], [m.x + [1, 0, -1, 0][m.d], m.y + [0, 1, 0, -1][m.d]]];
    assert(cs.some(([x, y]) => Math.abs(x - c) + Math.abs(y - c) === 1), '지형이 안 맞는데 놓임');
  }
  assert(placements(b, 5, 2).some(m => m.x === c + 3 && m.y === c), '밀밭 옆에 밀밭을 못 놓음');
  void W;
});
await test(G, '규칙: 5×5(대결전 7×7)를 넘는 자리에는 놓을 수 없다', () => {
  for (const size of [5, 7]) {
    const b = mkBoard(size); for (let x = 1; x < size; x++) put(b, size, x, 0, 1);
    const o = size - 1;
    for (const m of placements(b, size, 1)) { const x2 = m.x + [1, 0, -1, 0][m.d]; assert(Math.min(m.x, x2) >= o && Math.max(m.x, x2) <= o + size - 1, '가로 폭 초과'); }
  }
});
await test(G, '규칙: 놓을 수 있으면 버릴 수 없고, 놓을 곳이 없으면 버리기만 가능', async () => {
  const s = kd.newGame({ players: P(4), rng: makeRng(1) });
  while (s.phase !== 'place') kd.applyMove(s, kd.legalMoves(s)[0]);
  await throws(() => kd.applyMove(s, { t: 'discard' }), /버릴 수 없음/);
  const b = s.boards[kd.currentSeat(s)], W = 9;
  for (let i = 0; i < W * W; i++) if (!b.g[i]) b.g[i] = code(6, 0, 0);     // 판을 꽉 막는다
  eq(kd.legalMoves(s), [{ t: 'discard' }]);
});
await test(G, '점수: 숲 7칸×왕관 3 = 21점, 왕관 없는 호수 9칸 = 0점, 떨어진 땅은 따로 계산', () => {
  const b = mkBoard(5);
  [[1, 0, 1], [2, 0, 0], [1, 1, 1], [2, 1, 0], [1, 2, 1], [2, 2, 0], [1, 3, 0]].forEach(([x, y, c]) => put(b, 5, x, y, 2, c));
  for (let k = 0; k < 9; k++) put(b, 5, -1 - (k % 3), -1 + Math.floor(k / 3), 3);
  put(b, 5, 0, -1, 2, 1);
  const d = scoreBoard(b, 5, {}); eq(d.total, 22); eq(d.maxTerr, 9);
});
await test(G, '변형 규칙: 중앙 왕국 +10(성이 한가운데), 조화 +5(버림 없이 꽉 채움)', () => {
  const s = play(4, [T(), T(), T(), T()], 3, { mk: true, harmony: true });
  s.boards.forEach(b => { const d = scoreBoard(b, 5, s.opts), o = 4; const cen = o - b.x0 <= 2 && b.x1 - o <= 2 && o - b.y0 <= 2 && b.y1 - o <= 2; eq(d.mk, cen ? 10 : 0); eq(d.harmony, b.n === 24 && b.disc === 0 ? 5 : 0); eq(d.total, d.base + d.mk + d.harmony); });
  const b = mkBoard(5); put(b, 5, 3, 0, 1, 1); eq(scoreBoard(b, 5, { mk: true }).mk, 0);
});
await test(G, '인원별 진행: 4인 12장씩 / 3인 12라운드(매번 1장 버려짐) / 2인 대결전 7×7·24장씩 / 2인 5×5·12장씩', () => {
  const cnt = (n, o) => { const got = Array(n).fill(0); const s = play(n, Array(n).fill('g'), 7, o, (st, seat, ch) => { if (ch.move.t !== 'pick') got[seat]++; }); return { s, got }; };
  let r = cnt(4); eq(r.got, [12, 12, 12, 12]); eq(r.s.rounds, 12); eq(r.s.seen.length, 48);
  r = cnt(3); eq(r.got, [12, 12, 12]); eq(r.s.seen.length, 48); eq(r.s.size, 5);
  r = cnt(2); eq(r.got, [24, 24]); eq(r.s.size, 7);
  r = cnt(2, { duel: false }); eq(r.got, [12, 12]); eq(r.s.size, 5); eq(r.s.seen.length, 24);
});
await test(G, '순서: 번호가 낮은 타일을 고른 사람이 다음 라운드에 먼저 한다 / 2인 첫 줄은 A-B-B-A', () => {
  const s = kd.newGame({ players: P(4), rng: makeRng(5) });
  const order = s.init.slice(); [3, 2, 1, 0].forEach(i => kd.applyMove(s, { t: 'pick', i }));
  eq(s.prev.map(e => e.seat), order.slice().reverse()); eq(kd.currentSeat(s), order[3]);
  assert(s.prev.every((e, i) => !i || s.prev[i - 1].id < e.id));
  const s2 = kd.newGame({ players: P(2), rng: makeRng(5) }); eq([s2.init[0], s2.init[3]], [s2.init[0], s2.init[0]]); eq(s2.init[1], s2.init[2]); assert(s2.init[0] !== s2.init[1]);
});
await test(G, '동점이면 가장 큰 땅, 그다음 왕관 수로 가린다', () => {
  const s = kd.newGame({ players: P(2), options: { duel: false }, rng: makeRng(1) }); s.over = true;
  put(s.boards[0], 5, 1, 0, 1, 2); put(s.boards[0], 5, 2, 0, 1, 0);                     // 2칸×2 = 4
  put(s.boards[1], 5, 1, 0, 2, 1); put(s.boards[1], 5, 2, 0, 2); put(s.boards[1], 5, 3, 0, 2); put(s.boards[1], 5, 4, 0, 2);   // 4칸×1 = 4
  eq(kd.result(s).ranking.map(r => [r.seat, r.rank, r.score]), [[1, 1, 4], [0, 2, 4]]);
});
await test(G, '봇은 아직 안 나온 타일의 순서를 훔쳐보지 않는다 (덱 순서를 바꿔도 같은 판단)', () => {
  for (let k = 0; k < 12; k++) {
    const rng = makeRng(k), s = kd.newGame({ players: P(4), rng });
    for (let i = 0; i < 20 + k; i++) kd.applyMove(s, kd.botChoose(s, T(), rng, info(kd.currentSeat(s))).move);
    const s2 = JSON.parse(JSON.stringify(s)); s2.deck.reverse();
    eq(kd.botChoose(s, T(), makeRng(99), info(kd.currentSeat(s))).move, kd.botChoose(s2, T(), makeRng(99), info(kd.currentSeat(s2))).move);
  }
});
await test(G, '왕관 타일은 같은 지형의 큰 땅에 붙인다 (성 옆에 따로 떼어 놓지 않는다)', () => {
  let ok = 0; const N = 40;
  for (let k = 0; k < N; k++) {
    const s = kd.newGame({ players: P(4), rng: makeRng(k) });
    const b = s.boards[0]; put(b, 5, 1, 0, 2); put(b, 5, 2, 0, 2); put(b, 5, 1, 1, 2); put(b, 5, 2, 1, 2);       // 숲 4칸
    s.init = null; s.prev = [{ id: 24, seat: 0 }, { id: 2, seat: 1 }, { id: 7, seat: 2 }, { id: 10, seat: 3 }]; s.step = 0; s.phase = 'place';
    const m = kd.botChoose(s, T(), makeRng(k), info(0)).move; kd.applyMove(s, m);
    if (scoreBoard(s.boards[0], 5, {}).total === 5) ok++;
  }
  assert(ok / N >= 0.95, `숲 왕관을 숲에 붙인 비율 ${ok / N}`);
});
await test(G, '견제(2인): 상대에게 큰 점수가 되는 타일은 가로챈다 — 공격 성향이 높을수록, 낮으면 자기 타일', () => {
  const run = aggr => { let c = 0; for (let k = 0; k < 40; k++) {
    const s = kd.newGame({ players: P(2), options: { duel: false }, rng: makeRng(k) });
    s.init = [0, 1, 1, 0]; s.step = 0; s.line = [13, 19, 30, 36].map(id => ({ id, seat: -1 })); s.seen = [13, 19, 30, 36];
    const me = s.boards[0], op = s.boards[1];
    put(me, 5, 1, 0, 1); put(me, 5, 2, 0, 1); put(me, 5, 1, 1, 1);                         // 내 밀밭 3칸
    [[1, 0, 1], [2, 0, 1], [1, 1, 0], [2, 1, 0], [1, 2, 0], [2, 2, 0]].forEach(([x, y, cr]) => put(op, 5, x, y, 3, cr));   // 상대 호수 6칸·왕관 2
    if (s.line[kd.botChoose(s, T({ aggression: aggr }), makeRng(k), info(0)).move.i].id === 30) c++;
  } return c / 40; };
  const hi = run(9), lo = run(0); assert(hi >= 0.8 && lo <= 0.2, `${hi} / ${lo}`);
});
await test(G, '마지막 줄에서는 다음 순서를 따지지 않는다 (순서 때문에 낮은 번호를 고르지 않음)', () => {
  let bad = 0; for (let k = 0; k < 12; k++) play(4, [T(), T(), T(), T()], 40 + k, {}, (s, seat, ch) => { if (s.phase === 'pick' && !s.deck.length && ch.reason === 'order') bad++; });
  eq(bad, 0);
});
await test(G, '실력 9 봇 vs 단순 탐욕 봇 3명: 평균 8점 이상 앞서고, 타일을 거의 버리지 않는다(판당 0.45장 이하)', () => {
  let a = 0, g = 0, d = 0; const N = 60;
  for (let k = 0; k < N; k++) { const me = k % 4, s = play(4, [0, 1, 2, 3].map(i => (i === me ? T() : 'g')), 300 + k); s.boards.forEach((b, i) => { const v = scoreBoard(b, 5, s.opts).total; if (i === me) { a += v; d += b.disc; } else g += v / 3; }); }
  assert(a / N - g / N >= 8 && d / N <= 0.45, `봇 ${a / N} / 탐욕 ${g / N} / 버림 ${d / N}`);
});
await test(G, '중앙 왕국 규칙을 켜면 성을 한가운데에 둔다 (실력 9: 90% 이상)', () => {
  let c = 0, t = 0; for (let k = 0; k < 15; k++) { const s = play(4, [T(), T(), T(), T()], 500 + k, { mk: true }); s.boards.forEach(b => { t++; if (scoreBoard(b, 5, s.opts).mk) c++; }); }
  assert(c / t >= 0.9, `${c}/${t}`);
});
await test(G, '실력 차이가 결과에 드러난다 (실력 9·7·5·3 → 9가 3보다 평균 8점 이상 높음)', () => {
  const sum = [0, 0, 0, 0]; const N = 60;
  for (let k = 0; k < N; k++) { const s = play(4, [0, 1, 2, 3].map(i => T({ skill: [9, 7, 5, 3][(i + k) % 4] })), 700 + k); s.boards.forEach((b, i) => { sum[(i + k) % 4] += scoreBoard(b, 5, s.opts).total / N; }); }
  assert(sum[0] - sum[3] >= 8 && sum[0] > sum[2], sum.map(v => v.toFixed(1)).join(' '));
});
await test(G, '실제 캐릭터 2~4인 자동 대전: 오류 0·불법 수 0·자리 편향 없음', () => {
  for (const [n, games] of [[2, 60], [3, 200], [4, 300]]) { const r = simulate(kd, CH, { games, count: n, seed: 21 }); eq([r.errors, r.illegal], [0, 0], r.firstError || ''); eq(r.warnings.filter(w => w.includes('자리')), []); }
});
process.exit(report('킹도미노 테스트') ? 1 : 0);
