// 스플렌더 고정 테스트: 카드 데이터(공식 목록) · 규칙 · 종료/순위 · 봇이 하면 안 되는 실수를 수치로 고정한다.
import fs from 'fs';
import sp from '../games/splendor.js';
import { makeRng } from '../core/rng.js';
import { contractCheck, simulate } from '../core/runner.js';
import { test, assert, eq, throws, report } from './harness.mjs';
const CH = JSON.parse(fs.readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8')).characters;
const entry = JSON.parse(fs.readFileSync(new URL('../games/index.json', import.meta.url), 'utf8')).games.find(g => g.id === 'splendor');
const { CARDS, NOBLES, bonusOf, pointsOf, tokTotal } = sp._t;
const T = (o = {}) => ({ skill: 9, aggression: 5, risk: 5, patience: 5, bluff: 3, targetMode: 'none', ...o });
const P = n => Array.from({ length: n }, (_, i) => ({ seat: i, human: i === 0, characterId: null }));
const G = '스플렌더';
const info = seat => ({ seat, rivalSeats: [], allySeats: [] });
const sum = a => a.reduce((x, y) => x + y, 0);
const fresh = (n = 2, seed = 1) => sp.newGame({ players: P(n), rng: makeRng(seed) });
const cardWhere = f => CARDS.find(f).id;
// 판 위 첫 칸에 원하는 카드를 놓는다(덱에서 빼서 중복 없게)
function place(s, id, slot = 0) { const c = CARDS[id], l = c.lv - 1; s.decks[l] = s.decks[l].filter(x => x !== id); s.table.forEach(r => { const k = r.indexOf(id); if (k >= 0) r[k] = s.decks[r === s.table[l] ? l : s.table.indexOf(r)].shift(); }); s.table[l][slot] = id; }
function play(n, bots, seed) {
  const rng = makeRng(seed), s = sp.newGame({ players: P(n), rng });
  let k = 0;
  while (!sp.isOver(s)) { if (++k > 4000) throw new Error('무한 루프'); const seat = s.turn; sp.applyMove(s, sp.botChoose(s, bots[seat], rng, info(seat)).move); }
  return s;
}

await test(G, '카드 90장(레벨 40·30·20) · 색마다 18장 · 귀족 10장이 공식 목록과 일치', () => {
  eq([1, 2, 3].map(l => CARDS.filter(c => c.lv === l).length), [40, 30, 20]);
  eq([0, 1, 2, 3, 4].map(c => CARDS.filter(x => x.col === c).length), [18, 18, 18, 18, 18]);
  eq([1, 2, 3].map(l => sum(CARDS.filter(c => c.lv === l).map(c => c.pts))), [5, 55, 80], '레벨별 점수 합');
  // PDF 몇 장 대조: 검정 1레벨 첫 장(흰1 파랑1 초록1 빨강1), 파랑 3레벨 5점(흰7 파랑3), 흰 2레벨 3점(흰6)
  eq(CARDS.find(c => c.col === 4 && c.lv === 1).cost, [1, 1, 1, 1, 0]);
  assert(CARDS.some(c => c.col === 1 && c.lv === 3 && c.pts === 5 && JSON.stringify(c.cost) === '[7,3,0,0,0]'), '파랑 5점 카드');
  assert(CARDS.some(c => c.col === 0 && c.lv === 2 && c.pts === 3 && JSON.stringify(c.cost) === '[6,0,0,0,0]'), '흰 3점 카드');
  eq(NOBLES.length, 10); assert(NOBLES.every(r => sum(r) === 8 || sum(r) === 9), '귀족 조건 합 8 또는 9');
});
await test(G, '규격 검사 2~4인 (오류·불법 수 0, 시드 재현, JSON 상태, 목록·테마 일치)', () => { const r = contractCheck(sp, entry, CH, { games: 80 }); assert(r.ok, r.problems.join(' / ')); });
await test(G, '준비: 인원별 보석 4·5·7개 + 금 5개, 귀족 인원+1, 판 위 카드 12장', () => {
  for (const [n, g] of [[2, 4], [3, 5], [4, 7]]) {
    const s = fresh(n);
    eq(s.supply, [g, g, g, g, g, 5]); eq(s.nobles.length, n + 1);
    eq(s.table.map(r => r.length), [4, 4, 4]); eq(s.decks.map(d => d.length), [36, 26, 16]);
  }
});
await test(G, '규칙: 다른 색 3개 / 같은 색 2개는 4개 이상 남은 색만 / 보석이 모자란 카드는 못 산다', () => {
  const s = fresh(2);
  const ms = sp.legalMoves(s);
  eq(ms.filter(m => m.t === 'take').length, 10, '다른 색 3개 조합');
  eq(ms.filter(m => m.t === 'take2').length, 5);
  eq(ms.filter(m => m.t === 'buy').length, 0, '처음엔 살 카드 없음');
  s.supply[2] = 3; assert(!sp.legalMoves(s).some(m => m.t === 'take2' && m.c === 2), '3개 남은 색 2개 가져오기');
  s.supply = [0, 0, 1, 1, 0, 5];
  eq(sp.legalMoves(s).filter(m => m.t === 'take').map(m => m.g), [[2, 3]], '남은 색이 2가지면 2개만');
  throws(() => sp.applyMove(s, { t: 'take', g: [0, 1, 2] }), /규칙/);
});
await test(G, '규칙: 보너스 할인 + 금으로 모자란 몫을 메워 구매, 낸 보석은 창고로', () => {
  const s = fresh(2), p = s.players[0];
  const id = cardWhere(c => c.lv === 1 && c.col === 4 && c.cost.join() === '1,1,1,1,0');   // 흰·파랑·초록·빨강 1개씩
  place(s, id);
  p.tok = [1, 1, 0, 0, 0, 1]; p.cards = [cardWhere(c => c.lv === 1 && c.col === 2 && c.id !== id)];   // 초록 보너스 1
  s.supply = [3, 3, 4, 4, 4, 4];
  assert(sp.legalMoves(s).some(m => m.t === 'buy' && m.lv === 1 && m.i === 0), '살 수 있어야 함');
  sp.applyMove(s, { t: 'buy', lv: 1, i: 0 });
  eq(p.tok, [0, 0, 0, 0, 0, 0]); eq(s.supply, [4, 4, 4, 4, 4, 5]);
  assert(p.cards.includes(id)); assert(s.table[0][0] !== id && s.table[0][0] != null, '빈칸은 덱에서 채움');
});
await test(G, '규칙: 예약은 3장까지, 금 1개(남아 있을 때), 덱 몰래 예약, 예약 카드는 나만 산다', () => {
  const s = fresh(3), p = s.players[0];
  sp.applyMove(s, { t: 'res', lv: 3, i: 0 });
  eq(p.tok[5], 1); eq(p.res.length, 1); assert(p.res[0].open);
  s.turn = 0; s.supply[5] = 0;
  sp.applyMove(s, { t: 'resd', lv: 2 });
  eq(p.tok[5], 1, '금이 없으면 카드만'); assert(!p.res[1].open, '덱 예약은 비공개'); eq(s.decks[1].length, 25);
  s.turn = 0; sp.applyMove(s, { t: 'res', lv: 1, i: 2 });
  s.turn = 0; assert(!sp.legalMoves(s).some(m => m.t === 'res' || m.t === 'resd'), '4장째 예약 불가');
  s.turn = 1; assert(!sp.legalMoves(s).some(m => m.t === 'buyr'), '남의 예약 카드는 못 삼');
});
await test(G, '규칙: 10개를 넘으면 반납 단계 → 10개가 되면 차례가 넘어간다', () => {
  const s = fresh(2), p = s.players[0];
  p.tok = [3, 3, 2, 0, 0, 1];
  sp.applyMove(s, { t: 'take', g: [2, 3, 4] });
  eq(s.phase, 'discard'); eq(s.turn, 0); eq(tokTotal(p), 12);
  sp.applyMove(s, { t: 'discard', c: 0 }); eq(s.phase, 'discard');
  sp.applyMove(s, { t: 'discard', c: 5 });
  eq(s.phase, 'act'); eq(s.turn, 1); eq(tokTotal(p), 10);
});
await test(G, '규칙: 귀족은 차례 끝에 1명 방문(+3점), 둘 이상이면 고르기', () => {
  const s = fresh(2), p = s.players[0];
  s.nobles = [3, 4, 0];                        // [초록4 빨강4] · [파랑4 초록4] · [흰3 파랑3 검정3]
  const g = CARDS.filter(c => c.col === 2 && c.lv === 1).map(c => c.id), u = CARDS.filter(c => c.col === 1 && c.lv === 1).map(c => c.id), r = CARDS.filter(c => c.col === 3 && c.lv === 1).map(c => c.id);
  p.cards = [...g.slice(0, 4), ...u.slice(0, 4), ...r.slice(0, 4)];
  sp.applyMove(s, { t: 'take', g: [0, 1, 2] });
  eq(s.phase, 'noble'); eq(s.pend.slice().sort(), [3, 4]);
  sp.applyMove(s, { t: 'noble', k: 4 });
  eq(p.nobles, [4]); eq(s.nobles.slice().sort(), [0, 3]); eq(s.turn, 1);
  eq(pointsOf(p), sum(p.cards.map(id => CARDS[id].pts)) + 3);
});
await test(G, '종료: 15점에 닿으면 마지막 자리까지 그 라운드를 마치고, 동점은 카드가 적은 쪽이 이김', () => {
  const s = fresh(3), hi = CARDS.filter(c => c.pts >= 4).map(c => c.id);
  s.turn = 1; s.players[1].cards = hi.slice(0, 4);   // 4장으로 16점 이상
  sp.applyMove(s, { t: 'take', g: [0, 1, 2] });
  assert(s.ending && !s.over, '1번 자리에서 15점 → 아직 안 끝남'); eq(s.turn, 2);
  s.players[2].cards = hi.slice(4, 9);
  const p1 = pointsOf(s.players[1]); while (pointsOf(s.players[2]) > p1) s.players[2].cards.pop();
  if (pointsOf(s.players[2]) < p1) s.players[2].cards.push(CARDS.find(c => c.pts === p1 - pointsOf(s.players[2]) && !s.players[2].cards.includes(c.id) && !s.players[1].cards.includes(c.id)).id);
  sp.applyMove(s, { t: 'take', g: [0, 1, 3] });
  assert(s.over, '마지막 자리(2번)까지 하면 끝');
  const r = sp.result(s);
  eq(pointsOf(s.players[1]), pointsOf(s.players[2]), '동점 만들기');
  const winner = s.players[1].cards.length < s.players[2].cards.length ? 1 : s.players[1].cards.length > s.players[2].cards.length ? 2 : -1;
  if (winner >= 0) eq(r.ranking[0].seat, winner); else eq(r.ranking[0].rank, r.ranking[1].rank);
});
await test(G, '봇: 이번 수로 15점을 넘길 수 있으면 놓치지 않는다 (실력 3 이상)', () => {
  let ok = 0, tot = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = fresh(2, seed), p = s.players[1]; s.turn = 1;
    const big = s.table[2][0]; p.tok = CARDS[big].cost.concat([0]);
    p.cards = CARDS.filter(c => c.pts === 3 && c.lv === 2).slice(0, 4).map(c => c.id);    // 12점
    if (pointsOf(p) + CARDS[big].pts < 15) continue;
    tot++;
    const ch = sp.botChoose(s, T({ skill: 5 }), makeRng(seed), info(1));
    const s2 = JSON.parse(JSON.stringify(s)); sp.applyMove(s2, ch.move);
    if (ch.move.t.startsWith('buy') && pointsOf(s2.players[1]) >= 15) ok++;
  }
  assert(tot >= 10 && ok === tot, `이기는 구매 ${ok}/${tot}`);
});
await test(G, '봇: 상대가 바로 사서 이길 카드는 실력 있는 봇이 예약으로 가로챈다', () => {
  let blk = 0, tot = 0;
  for (let seed = 1; seed <= 60; seed++) {
    const s = fresh(2, seed), me = s.players[1], o = s.players[0]; s.turn = 1;
    const big = s.table[2][1];
    o.tok = CARDS[big].cost.concat([0]); o.cards = CARDS.filter(c => c.pts === 3 && c.lv === 2).slice(0, 4).map(c => c.id);
    if (pointsOf(o) + CARDS[big].pts < 15) continue;
    tot++;
    const ch = sp.botChoose(s, T({ skill: 8, aggression: 6 }), makeRng(seed), info(1));
    if (ch.move.t === 'res' && ch.move.lv === 3 && ch.move.i === 1) blk++;
    void me;
  }
  assert(tot >= 10 && blk / tot >= 0.6, `가로채기 ${blk}/${tot}`);
});
await test(G, '봇: 동료(ally)는 가로채지 않는다', () => {
  let blk = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const s = fresh(2, seed), o = s.players[0]; s.turn = 1;
    const big = s.table[2][1]; o.tok = CARDS[big].cost.concat([0]); o.cards = CARDS.filter(c => c.pts === 3 && c.lv === 2).slice(0, 4).map(c => c.id);
    const ch = sp.botChoose(s, T({ skill: 8, aggression: 10 }), makeRng(seed), { seat: 1, rivalSeats: [], allySeats: [{ seat: 0, strength: 2 }] });
    if (ch.move.t === 'res') blk++;
  }
  eq(blk, 0, '동료 카드 가로채기');
});
await test(G, '봇: 첫 수는 보석 가져오기, 보석 반납은 거의 없다(한 판 평균 1회 미만/인)', () => {
  let firstTake = 0, disc = 0, games = 0;
  for (let seed = 1; seed <= 150; seed++) {
    const rng = makeRng(seed), s = sp.newGame({ players: P(3), rng });
    const ch = sp.botChoose(s, T({ skill: 7 }), rng, info(0)); if (ch.move.t.startsWith('take')) firstTake++;
    let k = 0;
    while (!sp.isOver(s) && ++k < 4000) { const m = sp.botChoose(s, T({ skill: 7 }), rng, info(s.turn)).move; if (m.t === 'discard') disc++; sp.applyMove(s, m); }
    games++;
  }
  assert(firstTake === games, `첫 수 보석 ${firstTake}/${games}`);
  assert(disc / (games * 3) < 1, `반납 평균 ${(disc / games / 3).toFixed(2)}`);
});
await test(G, '봇 실력: 실력 9가 실력 3을 2인전에서 65% 이상 이긴다 · 한 판 20~35라운드', () => {
  let w = 0, rounds = 0; const N = 300;
  for (let g = 0; g < N; g++) {
    const strong = g % 2, bots = [0, 1].map(i => (i === strong ? T({ skill: 9 }) : T({ skill: 3 })));
    const s = play(2, bots, 100 + g); rounds += s.round;
    const r = sp.result(s), win = r.ranking.filter(x => x.rank === 1);
    if (win.some(x => x.seat === strong)) w += 1 / win.length;
  }
  assert(w / N >= 0.65, `승률 ${(w / N * 100).toFixed(1)}%`);
  assert(rounds / N >= 20 && rounds / N <= 35, `평균 ${(rounds / N).toFixed(1)}라운드`);
});
await test(G, '실제 캐릭터 2~4인 각 1500판: 오류·불법 수 0, 승률 쏠림·자리 편향 경고 없음', () => {
  for (const n of [2, 3, 4]) {
    const r = simulate(sp, CH, { games: 1500, count: n, seed: 40 + n });
    assert(!r.errors && !r.illegal, `${n}인 오류 ${r.errors} 불법 ${r.illegal} ${r.firstError || ''}`);
    assert(!r.warnings.length, `${n}인 ${r.warnings.join(', ')}`);
  }
});
await test(G, '상태는 JSON 왕복 후에도 그대로 이어진다 (이어하기)', () => {
  const rng = makeRng(9), s = sp.newGame({ players: P(4), rng });
  for (let i = 0; i < 40; i++) sp.applyMove(s, sp.botChoose(s, T(), rng, info(s.turn)).move);
  const s2 = JSON.parse(JSON.stringify(s)); const r1 = makeRng(5), r2 = makeRng(5);
  for (let i = 0; i < 30 && !s.over; i++) { const a = sp.botChoose(s, T(), r1, info(s.turn)).move, b = sp.botChoose(s2, T(), r2, info(s2.turn)).move; eq(a, b); sp.applyMove(s, a); sp.applyMove(s2, b); }
  eq(JSON.stringify(s), JSON.stringify(s2));
});

process.exit(report('스플렌더 테스트') ? 1 : 0);
