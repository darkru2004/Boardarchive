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
await test(G, '카드 18장: 가로로 긴 2×2, 카드마다 구역 네 종류가 하나씩, 길은 카드 안에서 서로 마주 보고, 도로 1~2개, 점수 조건 18종(번호 1:1)', () => {
  const cs = T.BASE_CARDS;
  eq(cs.map(c => c.id), Array.from({ length: 18 }, (_, i) => i + 1));
  const cnt = [0, 0, 0, 0]; cs.forEach(c => c.z.forEach(z => cnt[z]++)); eq(cnt, [18, 18, 18, 18]);
  const roadsOf = [2, 2, 1, 1, 2, 2], longest = [2, 2, 3, 3, 2, 2];
  for (const c of cs) {
    eq([...c.z].sort(), [0, 1, 2, 3], `카드 ${c.id}: 구역 네 종류가 하나씩`);
    const b = (m, bit) => (m & bit ? 1 : 0), m = c.m;
    eq(b(m[0], 2), b(m[1], 8), `카드 ${c.id} 위 줄 가운데 길`); eq(b(m[2], 2), b(m[3], 8), `카드 ${c.id} 아래 줄 가운데 길`);
    eq(b(m[0], 4), b(m[2], 1), `카드 ${c.id} 왼쪽 세로 길`); eq(b(m[1], 4), b(m[3], 1), `카드 ${c.id} 오른쪽 세로 길`);
    const s = fresh(1); s.cells = {}; cellsOf(c, 0).forEach(q => { s.cells[`${q.dx},${q.dy}`] = q.z * 16 + q.m; });
    const sc = scoreOf(s); eq(sc.roads, roadsOf[(c.id - 1) % 6], `카드 ${c.id} 도로 수`); eq(sc.a.roadLens[0], longest[(c.id - 1) % 6], `카드 ${c.id} 가장 긴 도로(칸)`);
  }
  eq(T.GOALS.map(g => g.id), Array.from({ length: 18 }, (_, i) => i + 1)); assert(T.GOALS.every(g => g.num === g.id && g.name && g.en && g.desc && g.dia));
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
  for (const sd of [1, 2, 3]) { const s = fresh(1, sd); eq(targetOf(s), s.goals.reduce((x, y) => x + y, 0), '목표 점수 = 점수 조건 카드에 적힌 번호의 합'); }
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
await test(G, '점수 조건 설명 그림: 18장 모두 그림 속 도시를 실제로 계산하면 그림에 적힌 점수와 같다', () => {
  const s = fresh(1);
  for (const g of T.GOALS) {
    const d = g.dia; s.cells = {};
    d.g.forEach((row, y) => [...row].forEach((ch, x) => { if (ch === '.') return; let m = 0; for (const c of (d.r && d.r[`${x},${y}`]) || '') m |= [1, 2, 4, 8]['NESW'.indexOf(c)]; s.cells[`${x},${y}`] = 'RCIP'.indexOf(ch) * 16 + m; }));
    s.goals = [g.id, g.id === 1 ? 2 : 1, 3];
    eq(scoreOf(s).g[0], d.exp, `${g.id}번 ${g.name} 그림`);
    for (const [x, y] of d.l.map(l => l)) assert(d.g[y] && d.g[y][x] && d.g[y][x] !== '.', `${g.id}번 그림의 표시 위치`);
  }
});
await test(G, '점수 조건 1~6: 변두리 · 활짝 핀 공원 · 초록 도시 · 블록 파티 · 중심가 혜택 · 계획 도시', () => {
  const s = fresh(1);
  board(s, ['RRR', 'RRR', 'RRR'], ['6ac', '505', '3a9']); eq(scoreOf(s).roads, 1); eq(pts(s, 1), 1, '고리 도로는 어디서도 끝나지 않으므로 +1');
  board(s, ['RR'], ['2a']); eq(pts(s, 1), -1, '오른쪽 가장자리 밖으로 뻗은 도로 −1');
  board(s, ['RRR'], ['2a8']); eq(pts(s, 1), 1, '양끝이 블록에서 막힌 도로 +1');
  board(s, ['RR', 'RR'], ['2c', '01']); eq(pts(s, 1), 1, '양끝이 도시 안에서 끝남');
  board(s, ['PPPP', 'PPPP']); eq(pts(s, 2), 8, '공원 4칸 가로줄 둘 (세로줄은 2칸이라 0)');
  board(s, ['PR', 'RR']); eq(pts(s, 2), -4, '가로 2줄·세로 2줄 모두 공원 0~1칸');
  board(s, ['PPII']); eq(pts(s, 3), 2 - 6);
  board(s, ['RC', 'IP']); eq(pts(s, 4), -8, '2×2 모임 없음');
  board(s, ['RRR', 'RRR', 'RRR']); eq(pts(s, 4), 4, '3×3 안의 2×2 네 곳(겹침 가능)');
  board(s, ['RRRR', 'RRRR', 'RRRR']); eq(pts(s, 4), 7, '여섯 곳 → 5개 이상');
  board(s, ['PPP', 'PPP', 'PPP']); eq(pts(s, 5), 1 - 16, '안쪽 1칸 +1, 가장자리 8칸 −16');
  board(s, ['RCI', 'CPC', 'IRC']); eq(pts(s, 5), 1, '사방이 막힌 공원 한 칸');
  board(s, ['IIR']); eq(pts(s, 6), 1 - 2, '주거 1 − 공업 2');
});
await test(G, '점수 조건 7~12: 마천루 · 교외 · 콘크리트 정글 · 번화가 · 미니 마트 · 고속도로', () => {
  const s = fresh(1);
  board(s, ['IR']); eq(pts(s, 7), 0, '주거와 붙은 공업은 안 됨'); board(s, ['IC']); eq(pts(s, 7), 2, '이웃이 적어도(빈 쪽이 있어도) 상업뿐이면 됨');
  board(s, ['RRPIRR']); eq(pts(s, 8), 1, '가장 큰 주거 덩어리가 둘이면 유리한 쪽');
  board(s, ['RRR', 'PIP']); eq(pts(s, 8), 0, '공원 둘 +2, 공업 하나 −2');
  board(s, ['II']); eq(pts(s, 9), 0, '변으로만 닿은 공업은 해당 없음'); board(s, ['IR', 'RI']); eq(pts(s, 9), 2, '모서리로 맞댄 공업 둘');
  board(s, ['C', 'C', 'C', 'R']); eq(pts(s, 10), 3, '세로줄도 가능');
  board(s, ['RC', '.R'], ['2c', '.1']); eq(pts(s, 11), 2, '꺾인(계단) 모양도 됨');
  board(s, ['RC', '.R'], ['2c', '.0']); eq(pts(s, 11), 0, '도로가 이어지지 않으면 0');
  board(s, ['RCR'], ['0a0']); eq(pts(s, 11), 0, '길이 있어도 주거까지 닿지 않으면 0');
  board(s, ['RRRRRRRRRRRRR'], ['2aaaaaaaaaaa8']); eq(pts(s, 12), 6, '13칸 → 6점');
  board(s, ['RRRR', 'RRRR'], ['2a8.'.replace('.', '0'), '2a80']); eq(pts(s, 12), 1, '가장 긴 도로 3칸 → 1점 (긴 것 하나만 셈)');
});
await test(G, '점수 조건 13~18: 공원 뛰기 · 순환 도로 · 빈민가 · 출근길 · 관광객 함정 · 스프롤로폴리스', () => {
  const s = fresh(1);
  board(s, ['PRC'], ['2a8']); eq(pts(s, 13), 0, '한쪽 끝이 공원이 아님'); board(s, ['PRP'], ['2a8']); eq(pts(s, 13), 2, '공원에서 다른 공원으로');
  board(s, ['PRP'], ['0a0']); eq(pts(s, 13), 0, '공원에 닿지 않는 도로');
  board(s, ['RR.', 'RRR'], ['6c.', '3b8']); eq(pts(s, 14), 4, '2×2 고리 4칸, 꼬리는 제외'); eq(scoreOf(s).roads, 1);
  board(s, ['RRR'], ['2a8']); eq(pts(s, 14), 0, '고리 없음');
  board(s, ['RRR', 'RRR', 'RRR'], ['6ac', '505', '3a9']); eq(pts(s, 14), 8);
  board(s, ['IRI']); eq(pts(s, 15), 2); board(s, ['IRIR', 'RICI']); assert(pts(s, 15) >= 4, '여러 칸');
  board(s, ['IRI', 'ICI']); eq(pts(s, 15), 2, '공업 둘과 맞닿은 주거 하나');
  board(s, ['RC', 'RC'], ['22', '22']); eq(pts(s, 16), 0, '길이 서로 이어지지 않으면 각각 주거/상업 하나뿐');
  board(s, ['RC', 'RC'], ['2c', '03']); eq(pts(s, 16), 2, '주거와 상업을 지나는 한 도로');
  board(s, ['RC', 'RC'], ['28', '28']); eq(pts(s, 16), 4, '두 도로 각각 +2');
  board(s, ['CCC', 'CCC', 'CCC']); eq(pts(s, 17), 8 * 2 - 4);
  board(s, ['RRR', 'RRR']); eq(pts(s, 17), 0);
  board(s, ['RRRRR']); eq(pts(s, 18), 5 + 1);
  board(s, ['RRR', '.R.', '.R.']); eq(pts(s, 18), 3 + 3, '가로 3 + 세로 3');
  board(s, ['R.R', '...', 'R.R']); eq(pts(s, 18), 2 + 2, '빈 땅은 건너뛰고 블록만 셈');
});
await test(G, '점수 조건: 도시를 통째로 옮겨도 같은 값 (줄·가장자리·고리 판정은 위치와 무관)', () => {
  const s = fresh(1);
  board(s, ['PPPP', 'PRPP', 'PPPC'], ['2a8.'.replace('.', '0'), '0000', '0000']); s.goals = [2, 5, 14]; const a = scoreOf(s);
  const t = {}; for (const [k, v] of Object.entries(s.cells)) { const [x, y] = k.split(',').map(Number); t[`${x - 9},${y + 11}`] = v; } s.cells = t;
  const b = scoreOf(s); eq(b.g, a.g); eq(b.per, a.per); eq(b.roads, a.roads);
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
  const s = fresh(1, 1); s.goals = [3, 6, 10];
  board(s, ['RR', 'RR']);
  s.hands[0] = [19]; const card = { id: 19, z: [0, 0, 0, 0], m: [0, 0, 0, 0] };
  SETS.t = { name: 't', cards: [card], goals: [] }; s.deck = [];
  const ch = sp.botChoose(s, { skill: 10, risk: 5, patience: 5, aggression: 5 }, makeRng(1)).move;
  const sc = T.evalPlace(...(() => { const g = T.gridOf(s); return [g.G, g.L, g.n]; })(), card, ch.rot, ch.x, ch.y, s.goals, 'normal');
  eq(sc.per[0], 8, '주거 덩어리가 8칸으로 이어짐'); delete SETS.t;
});
await test(G, '확장 구조: SETS에 카드·점수 조건 묶음을 더하면 options.sets 로 함께 쓸 수 있다', () => {
  const extra = Array.from({ length: 4 }, (_, i) => T.mkCard(19 + i, 'RCIP', [10, 10, 12, 0]));
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
await test(G, '실제 캐릭터 12명 1~4인 각 150판: 오류 0 · 불법 수 0 · 보통 클리어율이 극단으로 쏠리지 않고(55~98%), 어려움(공식 변형)은 더 낮다', () => {
  const normal = [];
  for (let n = 1; n <= 4; n++) {
    const r = simulate(sp, CH, { games: 150, count: n, seed: 100 + n });
    eq([r.errors, r.illegal], [0, 0], `${n}인 오류/불법`);
    assert(r.coop && r.coop.clearRate >= 0.55 && r.coop.clearRate <= 0.98, `${n}인 클리어율 ${(r.coop.clearRate * 100).toFixed(1)}%`);
    normal.push(r.coop.clearRate);
  }
  for (const n of [1, 4]) {
    const rng = makeRng(300 + n); let win = 0; const games = 80;
    for (let g = 0; g < games; g++) {
      const s = sp.newGame({ players: P(n), options: { mode: 'hard' }, rng });
      while (!sp.isOver(s)) sp.applyMove(s, sp.botChoose(s, TR, rng).move);
      if (sp.result(s).coop.won) win++;
    }
    const rate = win / games; assert(rate >= 0.25 && rate <= 0.9, `어려움 ${n}인 클리어율 ${(rate * 100).toFixed(0)}%`);
    assert(rate < normal[n === 1 ? 0 : 3], `어려움(${rate})이 보통(${normal[n === 1 ? 0 : 3]})보다 낮아야 함`);
  }
});
process.exit(report('스프롤로폴리스') ? 1 : 0);
