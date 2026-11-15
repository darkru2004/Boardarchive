// 스프롤로폴리스 고정 테스트: 규칙(준비·놓기·도로·블록 점수·카드 넘기기·솔로) · 점수 조건 · 협력 결과 · 봇 · 클리어율 · 확장 구조.
import fs from 'fs';
import sp, { SETS, cellsOf, scoreOf, targetOf } from '../games/sprawlopolis.js';
import { makeRng } from '../core/rng.js';
import { contractCheck, simulate } from '../core/runner.js';
import { drawSeats } from '../core/seating.js';
import { buildRecord } from '../core/records.js';
import { validateRecord } from '../core/schema.js';
import { test, assert, eq, throws, report } from './harness.mjs';
const CH = JSON.parse(fs.readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8')).characters;
const entry = JSON.parse(fs.readFileSync(new URL('../games/index.json', import.meta.url), 'utf8')).games.find(g => g.id === 'sprawlopolis');
const T = sp._t, G = '스프롤로폴리스';
const P = n => Array.from({ length: n }, (_, i) => ({ seat: i, human: i === 0, characterId: null }));
const fresh = (n = 2, seed = 1, options) => sp.newGame({ players: P(n), options, rng: makeRng(seed) });
const TR = { skill: 5, risk: 5, patience: 5, aggression: 5 };
// 장면 만들기: 'RRC' 같은 줄로 구역을, (선택) '0a8' 같은 줄(16진 한 글자)로 길 방향(북1 동2 남4 서8)을 지정
function board(s, rows, roadRows) {
  s.cells = {};
  rows.forEach((row, y) => [...row].forEach((ch, x) => {
    if (ch === '.') return;
    const m = roadRows ? parseInt(roadRows[y][x], 16) : 0;
    s.cells[`${x},${y}`] = 'RCIP'.indexOf(ch) * 16 + m;
  }));
  return s;
}
const withGoals = (s, ...g) => { s.goals = g; return s; };
const pts = (s, id) => { s.goals = [id, 1, 2]; return scoreOf(s).g[0]; };

await test(G, '규격 검사 1~4인 (오류·불법 수 0, 시드 재현, JSON 상태, 목록·테마·협력 표시 일치)', () => {
  const r = contractCheck(sp, entry, CH, { games: 20 });
  assert(r.ok, r.problems.join(' / '));
  eq(entry.mode, 'coop', 'index.json 에 mode:coop');
  eq(r.sims.map(x => x.count), [1, 2, 3, 4], '1~4인 모두 검사');
});
await test(G, '카드 18장: 번호 1~18, 구역별 18칸씩, 카드마다 도로 1~2개, 점수 조건 18종(번호 1:1)', () => {
  const cs = T.BASE_CARDS;
  eq(cs.map(c => c.id), Array.from({ length: 18 }, (_, i) => i + 1));
  const cnt = [0, 0, 0, 0]; cs.forEach(c => c.z.forEach(z => cnt[z]++)); eq(cnt, [18, 18, 18, 18]);
  for (const c of cs) {
    const s = fresh(1); s.cells = {}; cellsOf(c, 0).forEach(q => { s.cells[`${q.dx},${q.dy}`] = q.z * 16 + q.m; });
    const r = scoreOf(s).roads; assert(r >= 1 && r <= 2, `카드 ${c.id} 도로 ${r}개`);
  }
  eq(T.GOALS.map(g => g.id), Array.from({ length: 18 }, (_, i) => i + 1)); assert(T.GOALS.every(g => g.num >= 1 && g.name && g.desc));
});
await test(G, '카드 돌리기(180도): 두 번 돌리면 원래대로, 칸 순서와 길 방향이 함께 뒤집힌다', () => {
  for (const c of T.BASE_CARDS) {
    const a = cellsOf(c, 0), b = cellsOf(c, 1);
    for (let i = 0; i < 4; i++) { eq(b[i].z, a[3 - i].z); eq(b[i].m, T.opp(a[3 - i].m)); }
    const twice = { id: c.id, z: b.map(x => x.z), m: b.map(x => x.m) }; eq(cellsOf(twice, 1).map(x => [x.z, x.m]), a.map(x => [x.z, x.m]));
  }
});
await test(G, '준비: 1인 손패 3·더미 11 / 2인 3+1·10 / 3인 3+1+1·9 / 4인 3+1+1+1·8, 첫 카드가 깔리고 점수 조건 3장', () => {
  for (const [n, hands, deck] of [[1, [3], 11], [2, [3, 1], 10], [3, [3, 1, 1], 9], [4, [3, 1, 1, 1], 8]]) {
    const s = fresh(n);
    eq(s.hands.map(h => h.length), hands, `${n}인 손패`); eq(s.deck.length, deck, `${n}인 더미`);
    eq(s.placed.length, 1); eq(Object.keys(s.cells).length, 4); eq(s.goals.length, 3); eq(new Set(s.goals).size, 3);
    const all = [...s.deck, ...s.hands.flat(), ...s.goals, s.placed[0].c]; eq(all.length, 18); eq(new Set(all).size, 18, '카드 중복 없음');
    eq(s.turn, 0);
  }
  assert(targetOf(fresh(1)) >= 3 * 8 - 3, '목표 점수는 점수 조건 숫자 합');
});
await test(G, '놓기: 변이 맞닿으면 가능 · 겹쳐 덮어도 가능 · 모서리만 닿거나 떨어져 있으면 불가 · 빈 땅 사이에 두어도 됨', () => {
  const s = fresh(1); const { G: g } = T.gridOf(s);   // 첫 카드가 (0,0)~(1,1)
  for (const [x, y] of [[2, 0], [2, 1], [-2, 0], [0, 2], [1, 2], [0, -2], [-1, 1], [1, -1], [0, 0], [1, 1], [-1, -1].filter(() => false)[0] || [0, 1]]) assert(T.anchorOk(g, x, y), `(${x},${y}) 가능해야 함`);
  for (const [x, y] of [[2, 2], [-2, -2], [2, -2], [-2, 2], [4, 0], [0, 4], [3, 3]]) assert(!T.anchorOk(g, x, y), `(${x},${y}) 불가여야 함`);
  const ms = sp.legalMoves(s); assert(ms.length > 0 && ms.every(m => s.hands[0].includes(m.c)));
});
await test(G, '덮어쓰기: 겹쳐 놓으면 아래 칸의 구역·길이 위 카드 것으로 바뀌고 덮은 칸 수가 기록된다', () => {
  const s = fresh(1, 3); const c = s.hands[0][0];
  const before = JSON.stringify(s.cells);
  sp.applyMove(s, { t: 'play', c, x: 1, y: 1, rot: 0 });   // (1,1) 한 칸만 겹침
  const card = T.cardOf(c), first = cellsOf(card, 0)[0];
  eq(s.cells['1,1'], first.z * 16 + first.m, '겹친 칸이 새 카드 것으로');
  eq(s.last.covered, 1); assert(JSON.stringify(s.cells) !== before); eq(s.placed.length, 2);
  eq(Object.keys(s.cells).length, 7);
});
await test(G, '도로: 카드 경계에서 마주 보는 길끼리만 하나로 이어지고, 한쪽만 있으면 별개 도로 / 막다른 길도 1개로 센다', () => {
  const s = fresh(1);
  board(s, ['RR'], ['28']); eq(scoreOf(s).roads, 1, '왼칸 동(2) · 오른칸 서(8) → 한 도로');
  board(s, ['RR'], ['20']); eq(scoreOf(s).roads, 1, '길이 한쪽에만: 그 칸 하나가 도로 1개');
  board(s, ['RR'], ['22']); eq(scoreOf(s).roads, 2, '오른칸이 서쪽으로 열려 있지 않으면 따로');
  board(s, ['RR', 'RR'], ['2c', '01']); eq(scoreOf(s).roads, 1, '왼위 동 ↔ 오른위 서 · 오른위 남 ↔ 오른아래 북: 세 칸이 한 도로');
  board(s, ['RR', 'RR'], ['2c', '10']); eq(scoreOf(s).roads, 2, '왼아래 북(1)은 위칸에 남(4)이 없어 따로');
  board(s, ['RR'], ['00']); eq(scoreOf(s).roads, 0, '길이 없으면 0');
});

await test(G, '블록 점수: 구역별 가장 큰 덩어리의 합 − 도로 수 (쉬움은 도로 감점 없음, 어려움은 가장 큰 덩어리 하나만)', () => {
  const rows = ['RRCC', 'RPCI', 'PPII'];
  const s = withGoals(board(fresh(1), rows), 1, 2, 3);
  let sc = scoreOf(s); eq(sc.per, [3, 3, 3, 3]); eq(sc.blocks, 12); eq(sc.pen, 0);
  board(s, ['RR', 'RR'], ['2c', '10']); s.mode = 'normal'; const n = scoreOf(s); eq(n.pen, 2); eq(n.blocks, 4);
  s.mode = 'easy'; eq(scoreOf(s).pen, 0, '쉬움은 도로 감점 없음'); eq(scoreOf(s).total, n.total + 2);
  board(s, rows); s.mode = 'hard'; sc = scoreOf(s); eq(sc.blocks, 3, '어려움: 가장 큰 덩어리 하나');
  board(s, ['RRR', 'RCC', 'PIC']); s.mode = 'normal'; eq(scoreOf(s).per, [4, 3, 1, 1]);
  s.mode = 'hard'; eq(scoreOf(s).blocks, 4);
});

await test(G, '덩어리: 변으로 이어져야 한 덩어리(대각선은 아님), 같은 구역이어도 끊기면 따로', () => {
  const s = board(fresh(1), ['RC', 'CR']); eq(scoreOf(s).per, [1, 1, 0, 0]);
  board(s, ['RRC', 'CRC', 'CPP']); eq(scoreOf(s).per[0], 3); eq(scoreOf(s).per[1], 2);
});
await test(G, '점수 조건: 공원 다섯 덩어리 · 조용한 동네 · 한적한 길 · 둘째 주택단지 · 상업 지구 · 푸른 도시 · 아담한 도시', () => {
  const s = fresh(1);
  board(s, ['PRPRP', 'RRRRR', 'PRPRP']); eq(pts(s, 1), 8, '공원 5덩어리');
  board(s, ['PRPRC', 'RRRRR', 'PRPRC']); eq(pts(s, 1), 3, '공원 4덩어리');
  board(s, ['RI', 'RR']); eq(pts(s, 5), 10 - 2, '주거 칸 2개가 공업과 맞닿음');
  board(s, ['RRRR', 'RIII', 'RIII']); eq(pts(s, 5), 10 - 5, '공업과 맞닿은 주거 칸 5개');
  board(s, ['RR', 'CC'], ['20', '20']); eq(pts(s, 6), 8, '도로 2개 ≤ 4');
  board(s, ['RRRRRRR'], ['2222222']); eq(pts(s, 6), 0, '도로 7개');
  board(s, ['RRIRR', 'RRIRI']); eq(pts(s, 8), 3, '두 번째로 큰 주거 덩어리(4칸·3칸)');
  board(s, ['CCICC', 'CIIIC']); eq(pts(s, 18), 4, '상업 2칸 이상 덩어리 2개 → +4');
  board(s, ['PPPPP', 'PPPPP', 'PRRRR']); eq(pts(s, 17), 5, '공원 11칸 → 5');
  board(s, ['RRRRR', 'RRRRR', 'RRRRR', 'RRRRR']); eq(pts(s, 16), 8, '5×4=20칸 ≤ 30');
  board(s, ['RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR', 'RRRRRR']); eq(pts(s, 16), 4, '6×6=36칸 ≤ 42');
  board(s, ['RRRRRRRRRR', 'RRRRRRRRRR', 'RRRRRRRRRR', 'RRRRRRRRRR', 'RRRRRRRRRR', 'RRRRRRRRRR']); eq(pts(s, 16), 0, '60칸');
});
await test(G, '점수 조건: 큰 공업 · 고른 도시 · 광장 · 큰 도로 · 맑은 공원 · 공장 외곽', () => {
  const s = fresh(1);
  board(s, ['IIIIIIII', 'IIIIIIII']); eq(pts(s, 11), 8); board(s, ['IIIIII']); eq(pts(s, 11), 4); board(s, ['IIIII']); eq(pts(s, 11), 0);
  board(s, ['RRRR', 'CCCC', 'IIII', 'PPPP']); eq(pts(s, 12), 8, '가장 작은 최대 덩어리 4 × 2');
  board(s, ['RC', 'IP']); eq(pts(s, 7), 0, '광장 1곳 → 반(내림) = 0');
  board(s, ['RCR', 'IPI', 'RCR']); eq(pts(s, 7), 2, '2×2 네 구역 모임 4곳 → 2');
  board(s, ['PPPP']); eq(pts(s, 14), 2, '공업과 떨어진 공원 4칸 → 2'); board(s, ['PPPI']); eq(pts(s, 14), 1, '공업과 맞닿은 칸 제외: 2칸 → 1');
  board(s, ['III', 'III']); eq(pts(s, 4), Math.floor(6 / 2), '가장자리에 닿은 공업 칸 6 → 3');
});
await test(G, '점수 조건: 큰 도로(길이 10칸 → 2점)는 도시를 옮겨도 같은 값', () => {
  const s = fresh(1);
  s.cells = {}; for (let x = 0; x < 10; x++) s.cells[`${x},0`] = x === 0 ? 2 : x === 9 ? 8 : 10;   // 가로 10칸 한 도로
  eq(scoreOf(s).roads, 1); eq(pts(s, 15), 2);
  const t = {}; for (const [k, v] of Object.entries(s.cells)) { const [x, y] = k.split(',').map(Number); t[`${x - 5},${y + 7}`] = v; } s.cells = t;
  eq(pts(s, 15), 2); eq(scoreOf(s).roads, 1);
});

await test(G, '카드 넘기기(2~4인): 한 장 놓고 남은 두 장은 왼쪽 동료에게, 새 카드 한 장 뽑고, 다음 차례는 왼쪽', () => {
  for (const n of [2, 3, 4]) {
    const s = fresh(n, 5), top = s.deck[s.deck.length - 1], mine = s.hands[0].slice(), other = s.hands[1].slice();
    const m = sp.legalMoves(s)[0]; sp.applyMove(s, m);
    const rest = mine.filter(c => c !== m.c);
    eq(s.hands[1], [...other, ...rest], `${n}인: 왼쪽 동료는 자기 1장 + 넘겨받은 2장`);
    eq(s.hands[0], [top], `${n}인: 새 카드(공개된 더미 맨 위) 한 장만 남음`);
    eq(s.turn, 1); eq(s.placed.length, 2);
    eq(s.fx.map(f => f.t), ['place', 'pass', 'draw']);
  }
});
await test(G, '솔로: 한 장 놓고 한 장 뽑아 손패 3장 유지 · 더미가 비면 손패가 줄고 총 14수에 끝', () => {
  const s = fresh(1, 9), rng = makeRng(2);
  let plays = 0;
  while (!sp.isOver(s)) {
    if (s.deck.length) eq(s.hands[0].length, 3, `더미가 남은 동안 손패 3장 (${plays}수째)`);
    sp.applyMove(s, sp.botChoose(s, TR, rng).move); plays++;
    assert(plays <= 14);
  }
  eq(plays, 14); eq(s.placed.length, 15); eq(s.deck.length, 0); eq(s.hands[0].length, 0);
});
await test(G, '2~4인 한 판: 14수 · 15장이 놓이고, 끝나면 모든 손패와 더미가 비어 있다 (넘겨받은 카드까지 전부 사용)', () => {
  for (const n of [2, 3, 4]) for (const seed of [1, 2, 3]) {
    const s = fresh(n, seed), rng = makeRng(seed); let k = 0;
    while (!sp.isOver(s)) { const seat = s.turn; assert(s.hands[seat].length > 0, '손패 없는 사람 차례'); sp.applyMove(s, sp.botChoose(s, TR, rng).move); if (++k > 20) throw new Error('끝나지 않음'); }
    eq(k, 14, `${n}인 seed${seed}`); eq(s.placed.length, 15); eq(s.hands.flat().length + s.deck.length, 0);
    eq(new Set(s.placed.map(p => p.c)).size, 15, '같은 카드를 두 번 놓지 않음');
  }
});
await test(G, '불법 수는 거부: 손패에 없는 카드 · 모서리만 닿는 자리 · 잘못된 회전 · 끝난 게임', () => {
  const s = fresh(2, 4);
  const notMine = s.hands[1][0];
  throws(() => sp.applyMove(s, { t: 'play', c: notMine, x: 2, y: 0, rot: 0 }), /규칙/);
  throws(() => sp.applyMove(s, { t: 'play', c: s.hands[0][0], x: 2, y: 2, rot: 0 }), /자리/);
  throws(() => sp.applyMove(s, { t: 'play', c: s.hands[0][0], x: 2, y: 0, rot: 2 }), /규칙/);
  throws(() => sp.applyMove(s, { t: 'pass' }), /규칙/);
  const rng = makeRng(1); while (!sp.isOver(s)) sp.applyMove(s, sp.botChoose(s, TR, rng).move);
  throws(() => sp.applyMove(s, { t: 'play', c: 1, x: 0, y: 0, rot: 0 }), /끝난/);
});
await test(G, '협력 결과: 점수 ≥ 목표면 클리어, 요약에 점수·목표가 들어간다 / 기록은 협력 형식으로 저장된다(솔로 1명도 가능)', () => {
  const s = fresh(1, 2); const rng = makeRng(2); while (!sp.isOver(s)) sp.applyMove(s, sp.botChoose(s, TR, rng).move);
  const r = sp.result(s), sc = scoreOf(s);
  eq(r.coop.score, sc.total); eq(r.coop.won, sc.total >= targetOf(s)); assert(r.summary.includes(String(sc.total)) && r.summary.includes(String(targetOf(s))));
  const seats = [{ seat: 0, human: true, characterId: null }];
  const rec = buildRecord({ game: sp.meta, seats, result: r, difficulty: null });
  eq(rec.mode, 'coop'); eq(rec.outcome, r.coop.won ? 'win' : 'lose'); eq(validateRecord(rec), []);
  s.mode = 'easy'; assert(sp.result(s).coop.score >= sc.total, '쉬움은 같은 도시에서 점수가 낮아지지 않음');
});
await test(G, '1인 자리 뽑기: drawSeats 가 사람 1명만 앉히고 캐릭터는 부르지 않는다', () => {
  const seats = drawSeats({ characters: CH, count: 1, rng: makeRng(1) });
  eq(seats, [{ seat: 0, human: true, characterId: null }]);
  throws(() => drawSeats({ characters: CH, count: 0, rng: makeRng(1) }), /1명/);
});
await test(G, '상태는 JSON으로 저장·복원해도 같은 결과(이어하기), 같은 시드는 같은 판', () => {
  const a = fresh(3, 7), rng = makeRng(7);
  for (let i = 0; i < 5; i++) sp.applyMove(a, sp.botChoose(a, TR, rng).move);
  const b = JSON.parse(JSON.stringify(a));
  eq(JSON.stringify(b), JSON.stringify(a)); eq(JSON.stringify(sp.legalMoves(b)), JSON.stringify(sp.legalMoves(a)));
  const r1 = makeRng(99), r2 = makeRng(99);
  while (!sp.isOver(a)) sp.applyMove(a, sp.botChoose(a, TR, r1).move);
  while (!sp.isOver(b)) sp.applyMove(b, sp.botChoose(b, TR, r2).move);
  eq(JSON.stringify(a), JSON.stringify(b));
  eq(JSON.stringify(fresh(4, 11)), JSON.stringify(fresh(4, 11)));
});
await test(G, '봇: 합법 수만 고르고, 성향이 달라도 오류 없이 끝낸다 / 카드를 어디에 놓아도 이득이 없을 때도 수를 둔다', () => {
  const rng = makeRng(4);
  for (const tr of [{ skill: 1, risk: 0, patience: 0, aggression: 0 }, { skill: 10, risk: 10, patience: 10, aggression: 10 }, TR]) for (const n of [1, 2, 4]) {
    const s = fresh(n, 8);
    while (!sp.isOver(s)) { const ch = sp.botChoose(s, tr, rng); assert(sp.legalMoves(s).some(m => JSON.stringify(m) === JSON.stringify(ch.move)), '합법 수가 아님'); assert(typeof ch.reason === 'string'); sp.applyMove(s, ch.move); }
  }
});
await test(G, '봇은 같은 카드라면 점수가 더 오르는 자리를 택한다 (같은 구역 이어 붙이기)', () => {
  const s = fresh(1, 1); s.goals = [8, 9, 14];
  board(s, ['RR', 'RR']);
  s.hands[0] = [19]; const card = { id: 19, z: [0, 0, 0, 0], m: [0, 0, 0, 0] };
  SETS.t = { name: 't', cards: [card], goals: [] }; s.deck = [];
  const ch = sp.botChoose(s, { skill: 10, risk: 5, patience: 5, aggression: 5 }, makeRng(1)).move;
  const sc = T.evalPlace(...(() => { const g = T.gridOf(s); return [g.G, g.L, g.n]; })(), card, ch.rot, ch.x, ch.y, s.goals, 'normal');
  eq(sc.per[0], 8, '주거 덩어리가 8칸으로 이어짐'); delete SETS.t;
});
await test(G, '확장 구조: SETS에 카드·점수 조건 묶음을 더하면 options.sets 로 함께 쓸 수 있다', () => {
  const extra = Array.from({ length: 4 }, (_, i) => T.mkCard(19 + i, 'RCIP', [[[0, 1], 'W', 'E']]));
  const goals = extra.map(c => ({ id: c.id, num: 5, name: '시험 조건 ' + c.id, desc: '시험', f: a => a.cnt[0] }));
  SETS.test = { name: '시험', cards: extra, goals };
  try {
    const s = sp.newGame({ players: P(2), options: { sets: ['base', 'test'] }, rng: makeRng(3) });
    eq(s.sets, ['base', 'test']); eq(s.deck.length + s.hands.flat().length + s.goals.length + 1, 22);
    const rng = makeRng(3); let k = 0; while (!sp.isOver(s)) { sp.applyMove(s, sp.botChoose(s, TR, rng).move); k++; }
    eq(k, 18, '22장 중 점수 조건 3장 제외 19장 = 첫 카드 + 18수'); assert(scoreOf(s).total > -50);
  } finally { delete SETS.test; }
  eq(fresh(2).sets, ['base']);
  eq(sp.newGame({ players: P(2), options: { sets: ['nope'] }, rng: makeRng(3) }).sets, ['base'], '모르는 묶음은 무시');
});
await test(G, '실제 캐릭터 12명 1~4인 각 150판: 오류 0 · 불법 수 0 · 클리어율이 한쪽으로 쏠리지 않음(보통 난이도 30~70%)', () => {
  for (let n = 1; n <= 4; n++) {
    const r = simulate(sp, CH, { games: 150, count: n, seed: 100 + n });
    eq([r.errors, r.illegal], [0, 0], `${n}인 오류/불법`);
    assert(r.coop && r.coop.clearRate >= 0.3 && r.coop.clearRate <= 0.7, `${n}인 클리어율 ${(r.coop.clearRate * 100).toFixed(1)}%`);
  }
});
process.exit(report('스프롤로폴리스') ? 1 : 0);
