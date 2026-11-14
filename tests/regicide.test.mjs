// 레지사이드 고정 테스트: 공식 규칙(준비·내기 조합·무늬 힘·면역·격파·반격·광대·패배) · 협력 결과 · 봇이 하면 안 되는 실수 · 클리어율.
import fs from 'fs';
import rg, { playMoves, val, su, rk } from '../games/regicide.js';
import { makeRng } from '../core/rng.js';
import { contractCheck, simulate } from '../core/runner.js';
import { test, assert, eq, throws, report } from './harness.mjs';
const CH = JSON.parse(fs.readFileSync(new URL('../data/characters.json', import.meta.url), 'utf8')).characters;
const entry = JSON.parse(fs.readFileSync(new URL('../games/index.json', import.meta.url), 'utf8')).games.find(g => g.id === 'regicide');
const G = '레지사이드';
const P = n => Array.from({ length: n }, (_, i) => ({ seat: i, human: i === 0, characterId: null }));
const fresh = (n = 4, seed = 1) => rg.newGame({ players: P(n), rng: makeRng(seed) });
// 카드 번호: 무늬*20 + 숫자 (♥0 ♦1 ♣2 ♠3), 광대 100·101
const H = 0, Di = 1, C = 2, S = 3;
const c = (suit, r) => suit * 20 + r;
const sum = a => a.reduce((x, y) => x + y, 0);
// 장면 만들기: 손패·적·더미를 직접 지정 (필요한 카드가 다른 곳에 중복되지 않게 술집은 비워 둔다)
function scene(n, o = {}) {
  const s = fresh(n, 3);
  s.hands = Array.from({ length: n }, (_, i) => (o.hands && o.hands[i] ? o.hands[i].slice() : []));
  s.tavern = o.tavern || []; s.discard = o.discard || []; s.played = [];
  s.castle = o.castle || [c(S, 12), c(C, 12)];
  const id = o.enemy || c(H, 11);
  s.enemy = rg._t.mkEnemy(id); Object.assign(s.enemy, o.e || {});
  s.turn = o.turn || 0; s.phase = 'play'; s.streak = 0; s.over = false; s.won = false; s.defeated = o.defeated || 0;
  return s;
}
const play = (s, ...ids) => rg.applyMove(s, { t: 'play', c: ids.slice().sort((a, b) => a - b) });
const info = seat => ({ seat, rivalSeats: [], allySeats: [] });

await test(G, '규격 검사 2~4인 (오류·불법 수 0, 시드 재현, JSON 상태, 목록·테마·협력 표시 일치)', () => {
  const r = contractCheck(rg, entry, CH, { games: 30 });
  assert(r.ok, r.problems.join(' / '));
  eq(entry.mode, 'coop', 'index.json 에 mode:coop');
});
await test(G, '준비: 손패 7·6·5장, 광대 0·1·2장, 성 12장은 J→Q→K 순서, 술집은 나머지', () => {
  for (const [n, hand, jk] of [[2, 7, 0], [3, 6, 1], [4, 5, 2]]) {
    const s = fresh(n);
    eq(s.hands.map(h => h.length), Array(n).fill(hand), `${n}인 손패`);
    eq(s.tavern.length, 40 + jk - n * hand, `${n}인 술집`);
    eq(s.tavern.filter(x => x >= 100).length + s.hands.flat().filter(x => x >= 100).length, jk, `${n}인 광대`);
    const castle = [s.enemy.id, ...s.castle];
    eq(castle.length, 12); eq(castle.map(x => rk(x)), [11, 11, 11, 11, 12, 12, 12, 12, 13, 13, 13, 13], 'J 4 → Q 4 → K 4');
    eq(new Set(castle).size, 12);
    eq(new Set([...s.tavern, ...s.hands.flat(), ...castle]).size, 52 + jk, '카드 중복 없음');
  }
  const s = fresh(4); eq([s.enemy.hp, s.enemy.atk], [20, 10]);
});
await test(G, '내기 조합: 한 장 · 같은 숫자 2~4장(합 10 이하) · A+아무 카드 · 광대 단독만 가능', () => {
  const key = ms => ms.map(m => m.c.join('-')).sort();
  const s = scene(3, { hands: [[c(H, 2), c(Di, 2), c(C, 2), c(S, 2), c(H, 5), c(S, 5), c(H, 6)]] });
  const ms = playMoves(s.hands[0]).map(m => m.c);
  assert(ms.some(x => x.length === 4 && x.every(y => rk(y) === 2)), '2 네 장(합 8)');
  assert(ms.some(x => x.length === 2 && x.every(y => rk(y) === 5)), '5 두 장(합 10)');
  assert(!ms.some(x => x.length === 2 && x.includes(c(H, 6)) && x.length === 2 && x.some(y => rk(y) === 2)), '다른 숫자끼리는 불가');
  const s2 = scene(3, { hands: [[c(H, 3), c(Di, 3), c(C, 3), c(S, 3)]] });
  assert(!playMoves(s2.hands[0]).some(m => m.c.length === 4), '3 네 장은 합 12라서 불가');
  assert(playMoves(s2.hands[0]).some(m => m.c.length === 3), '3 세 장은 합 9로 가능');
  const s3 = scene(3, { hands: [[c(H, 1), c(S, 1), c(C, 13), c(Di, 8)]] });
  const m3 = playMoves(s3.hands[0]).map(m => m.c.join('-'));
  assert(m3.includes([c(H, 1), c(C, 13)].join('-')), 'A+K');
  assert(m3.includes([c(H, 1), c(S, 1)].join('-')), 'A+A');
  assert(!m3.includes([c(C, 13), c(Di, 8)].sort((a, b) => a - b).join('-')), 'A 없는 서로 다른 두 장은 불가');
  const s4 = scene(3, { hands: [[100, c(H, 4)]] });
  assert(playMoves(s4.hands[0]).some(m => m.c.length === 1 && m.c[0] === 100), '광대 단독');
  assert(!playMoves(s4.hands[0]).some(m => m.c.includes(100) && m.c.length > 1), '광대는 다른 카드와 같이 못 냄');
  key([]);
});
await test(G, '규칙: 불법 수는 예외로 거부된다', () => {
  const s = scene(3, { hands: [[c(H, 3), c(S, 9)]] });
  throws(() => rg.applyMove(s, { t: 'play', c: [c(H, 3), c(S, 9)] }), /규칙/);
  throws(() => rg.applyMove(s, { t: 'play', c: [c(C, 7)] }), /규칙/);
});
await test(G, '♣ 두 배 / ♠ 방어는 이 싸움 내내 누적 / 숫자 합이 힘의 크기', () => {
  const s = scene(3, { enemy: c(H, 12), hands: [[c(C, 6), c(S, 4), c(S, 3), c(Di, 9)], [c(H, 2), c(C, 3), c(Di, 4), c(H, 9)], [c(C, 5), c(H, 3)]] });   // 하트 여왕 hp30 atk15
  play(s, c(S, 4));
  eq([s.enemy.dmg, s.enemy.sp], [4, 4], '♠4: 피해 4 · 방어 4');
  eq(s.need, 11, '15−4');
  assert(s.phase === 'suffer');
  rg.applyMove(s, { t: 'disc', c: c(S, 3) }); rg.applyMove(s, { t: 'disc', c: c(C, 6) }); rg.applyMove(s, { t: 'disc', c: c(Di, 9) });
  eq(s.turn, 1, '반격을 막으면 다음 사람');
  play(s, c(C, 3));
  eq(s.enemy.dmg, 4 + 6, '♣3 → 피해 6 (두 배)');
  eq(s.enemy.sp, 4);
  assert(s.phase === 'suffer' && s.need === 11, '방어는 누적되어 15−4=11');
});
await test(G, '면역: 왕족과 같은 무늬의 힘은 안 통하지만 숫자는 피해에 그대로 센다 / 광대가 면역을 푼다', () => {
  const s = scene(3, { enemy: c(S, 11), hands: [[c(S, 6), c(H, 9), c(H, 4)], [c(C, 3)], [c(H, 2)]] });
  play(s, c(S, 6));
  eq([s.enemy.dmg, s.enemy.sp], [6, 0], '♠ 방어는 면역, 피해는 6');
  eq(s.need, 10, '방어가 안 먹혀 반격은 그대로 10');
  const t = scene(3, { enemy: c(S, 11), hands: [[c(H, 2)], [100, c(S, 5)], [c(C, 3)]], turn: 1 });
  play(t, 100);
  assert(t.enemy.jes, '면역 해제');
  rg.applyMove(t, { t: 'next', p: 2 });
  play(t, c(C, 3));
  eq(t.enemy.dmg, 6, '광대 뒤 ♣3은 두 배');
});
await test(G, '광대: 반격 없이 다음 사람을 내가 고른다 / 이미 낸 ♣는 소급되지 않는다', () => {
  const s = scene(4, { enemy: c(C, 11), hands: [[c(C, 4), c(H, 9), c(H, 3)], [100, c(H, 2)], [c(H, 5)], [c(C, 5), c(H, 6)]], turn: 0 });
  play(s, c(C, 4));
  eq(s.enemy.dmg, 4, '♣는 면역이라 두 배가 안 됨');
  rg.applyMove(s, { t: 'disc', c: c(H, 9) }); rg.applyMove(s, { t: 'disc', c: c(H, 3) });
  eq(s.turn, 1);
  play(s, 100);
  eq(s.phase, 'next'); eq(rg.legalMoves(s).length, 4, '자기 자신 포함 모두 지목 가능');
  rg.applyMove(s, { t: 'next', p: 3 });
  eq([s.turn, s.phase], [3, 'play']); eq(s.enemy.dmg, 4, '이미 낸 ♣4는 소급되지 않음');
  assert(s.hands[1].length === 1, '광대는 손패에서 나갔음');
  play(s, c(C, 5));
  eq(s.enemy.dmg, 4 + 10, '이제 ♣5는 두 배(면역 해제)');
});
await test(G, '♥ 회복: 버린 더미를 섞어 N장을 술집 맨 아래로 (이번 싸움에 낸 카드는 아직 버린 더미가 아님)', () => {
  const dis = [c(Di, 2), c(Di, 3), c(Di, 4), c(C, 2), c(C, 3)];
  const s = scene(3, { enemy: c(S, 11), hands: [[c(H, 3), c(H, 4)], [c(C, 3)], [c(C, 4)]], discard: dis, tavern: [c(Di, 9), c(Di, 10)] });
  play(s, c(H, 3));
  eq(s.discard.length, 2, '5장 중 3장 회복');
  eq(s.tavern.length, 5); eq(s.tavern.slice(3), [c(Di, 9), c(Di, 10)].slice(0, 2), '기존 술집 위치는 그대로(맨 위쪽)');
  assert(!s.discard.includes(c(H, 3)) && !s.tavern.includes(c(H, 3)), '방금 낸 카드는 회복 대상이 아님');
  eq(s.tavern.slice(0, 3).filter(x => dis.includes(x)).length, 3);
});
await test(G, '♦ 보급: 나부터 시계방향으로 한 장씩, 손패 한도가 찬 사람은 건너뜀', () => {
  const s = scene(4, { enemy: c(S, 11), hands: [[c(Di, 6), c(H, 2)], [c(H, 3), c(H, 4), c(H, 5), c(H, 6), c(H, 7)], [c(H, 8)], [c(C, 3)]], tavern: Array.from({ length: 8 }, (_, i) => c(Di, 1 + i % 5) + 100 * 0 + (i < 5 ? 0 : 0)).map((x, i) => (i < 4 ? c(C, 5 + i) : c(S, 5 + (i - 4)))) });
  eq(s.hmax, 5);
  const top = s.tavern.slice(-6).reverse();
  play(s, c(Di, 6));
  assert(s.hands[1].length === 5, '가득 찬 사람은 못 뽑음');
  eq(s.hands[0].length + s.hands[2].length + s.hands[3].length, 1 + 1 + 1 + 6, '6장 모두 나눔(본인 1장 남음+3명)');
  eq(s.hands[0].includes(top[0]), true, '첫 장은 나');
  eq(s.hands[2].includes(top[1]), true, '둘째 장은 다음 사람(가득 찬 사람은 건너뜀)');
});
await test(G, '격파: 정확히 맞으면 술집 맨 위로, 넘치면 버린 더미로 / 격파한 사람은 반격 없이 한 번 더', () => {
  const a = scene(3, { enemy: c(H, 11), hands: [[c(C, 10), c(S, 5)], [c(H, 2)], [c(H, 3)]], tavern: [c(S, 2)] });
  play(a, c(C, 10));   // ♣10 → 20 = hp 20
  eq(a.defeated, 1); eq(a.tavern[a.tavern.length - 1], c(H, 11), '정확히 같으면 술집 맨 위');
  eq(a.turn, 0, '격파한 사람이 다시'); eq(a.phase, 'play'); assert(a.discard.includes(c(C, 10)), '낸 카드는 버림');
  eq(a.enemy.id, c(S, 12), '다음 적'); eq(a.enemy.dmg, 0);
  const b = scene(3, { enemy: c(H, 11), hands: [[c(C, 10), c(C, 9)], [c(H, 2)], [c(H, 3)]] });
  play(b, c(C, 10), ...[]); b.enemy.dmg = 0;
  const b2 = scene(3, { enemy: c(H, 11), hands: [[c(C, 10)], [c(H, 2)], [c(H, 3)]] });
  b2.enemy.dmg = 5; play(b2, c(C, 10));
  assert(b2.discard.includes(c(H, 11)) && !b2.tavern.includes(c(H, 11)), '넘치면 버린 더미');
});
await test(G, '반격: 값의 합이 공격력 이상이 되도록 버려야 하고, 못 막으면 전원 패배', () => {
  const s = scene(3, { enemy: c(C, 13), hands: [[c(H, 2), c(H, 3)], [c(H, 9), c(H, 10)], [c(H, 5)]] });   // 클럽 왕 atk20
  play(s, c(H, 2));
  eq(s.over, true); eq(s.won, false); eq(s.why, 'dead');
  const t = scene(3, { enemy: c(C, 11), hands: [[c(S, 2), c(H, 9), c(H, 4)], [c(H, 2)], [c(H, 3)]] });   // atk 10
  play(t, c(S, 2));
  eq(t.phase, 'suffer'); eq(t.need, 8);
  rg.applyMove(t, { t: 'disc', c: c(H, 9) });
  eq(t.turn, 1, '9로 8 이상을 막았으니 끝');
  const u = scene(3, { enemy: c(H, 11), hands: [[c(S, 9), c(H, 4)], [c(H, 2)], [c(H, 3)]] });
  play(u, c(S, 9)); eq(u.need, 1, '♠9로 10−9');
});
await test(G, '양보: 다른 모두가 직전에 양보했다면 못 한다 / 내기 뒤에는 다시 가능', () => {
  const s = scene(3, { enemy: c(H, 11), hands: [[c(H, 9), c(H, 3)], [c(H, 10)], [c(H, 8), c(H, 7)]] });
  const yl = x => rg.legalMoves(x).some(m => m.t === 'yield');
  assert(yl(s));
  rg.applyMove(s, { t: 'yield' }); rg.applyMove(s, { t: 'disc', c: c(H, 9) }); rg.applyMove(s, { t: 'disc', c: c(H, 3) });
  eq(s.turn, 1); assert(yl(s), '한 명만 양보했으니 아직 가능');
  rg.applyMove(s, { t: 'yield' }); rg.applyMove(s, { t: 'disc', c: c(H, 10) });
  eq([s.turn, s.streak], [2, 2]); assert(!yl(s), '나머지 둘이 연속 양보했으니 양보 불가');
  play(s, c(H, 7)); eq(s.streak, 0, '내면 초기화');
});
await test(G, '낼 카드도 양보도 못 하는 차례면 패배(막힘)', () => {
  const s = scene(2, { enemy: c(H, 11), hands: [[c(H, 9), c(H, 8), c(H, 3)], []] });
  rg.applyMove(s, { t: 'yield' }); rg.applyMove(s, { t: 'disc', c: c(H, 9) }); rg.applyMove(s, { t: 'disc', c: c(H, 3) });
  eq(s.over, true); eq(s.won, false); eq(s.why, 'stuck');
});
await test(G, '결과: 승리·패배가 {coop:{won,score}}로 나오고 순위 형식(ranking)은 쓰지 않는다', () => {
  const s = scene(3, { enemy: c(C, 13), castle: [], hands: [[c(S, 10), c(H, 10), c(H, 3)], [c(H, 2)], [c(H, 4)]], defeated: 11 });
  s.enemy.dmg = 30; s.enemy.sp = 0;
  play(s, c(H, 10));   // ♥10 → 피해 10, 합 40 = hp 40 → 정확히 격파, 성이 비었으니 승리
  eq(s.won, true); eq(s.over, true);
  const r = rg.result(s);
  eq(r.coop, { won: true, score: 12 }); assert(!r.ranking); assert(/함락|12/.test(r.summary));
  const l = scene(3, { enemy: c(C, 13), hands: [[c(H, 2)], [c(H, 3)], [c(H, 4)]], defeated: 5 });
  play(l, c(H, 2));
  const rl = rg.result(l); eq(rl.coop, { won: false, score: 5 });
});
await test(G, '상태는 JSON으로 저장·복원돼도 그대로 이어서 같은 결과(이어하기)', () => {
  const rng = makeRng(8), s = rg.newGame({ players: P(3), rng }), bots = [{ skill: 5, aggression: 5, risk: 5, patience: 5, bluff: 3, targetMode: 'none' }];
  for (let i = 0; i < 20 && !s.over; i++) rg.applyMove(s, rg.botChoose(s, bots[0], rng, info(s.turn)).move);
  const copy = JSON.parse(JSON.stringify(s));
  eq(copy, s);
  const m = rg.legalMoves(s)[0];
  rg.applyMove(s, m); rg.applyMove(copy, m);
  eq(copy, s, '복원한 상태도 같은 수에 같은 결과(회복 섞기도 상태 안 시드 사용)');
});
await test(G, '같은 시드·같은 수 → 같은 판 (rng를 밖에서 안 쓴다)', () => {
  const run = () => { const rng = makeRng(21), s = rg.newGame({ players: P(4), rng }); for (let i = 0; i < 60 && !s.over; i++) rg.applyMove(s, rg.botChoose(s, { skill: 5, risk: 5, patience: 5, aggression: 5 }, rng, info(s.turn)).move); return JSON.stringify(s); };
  eq(run(), run());
});
await test(G, '봇: 합법 수만 고르고, 맞으면 쓰러지는 수는 피하고, 죽기 전에 막아 준다', () => {
  const rng = makeRng(2), tr = { skill: 8, aggression: 5, risk: 5, patience: 5, bluff: 3, targetMode: 'none' };
  // 반격 10 · 손패 합 12: ♦3(공격 3)만 내면 남은 9로 10을 못 막는다 → 다른 카드를 내거나 양보해야 함
  const s = scene(3, { enemy: c(H, 11), hands: [[c(Di, 3), c(C, 9), c(S, 3)], [c(H, 5), c(H, 6)], [c(H, 7), c(H, 8)]], tavern: [c(S, 8)] });
  const ch = rg.botChoose(s, tr, rng, info(0));
  assert(rg.legalMoves(s).some(m => JSON.stringify(m) === JSON.stringify(ch.move)), '합법 수');
  const after = JSON.parse(JSON.stringify(s)); rg.applyMove(after, ch.move);
  assert(!after.over, '봇이 스스로 죽는 수를 두었음: ' + JSON.stringify(ch.move));
  // 반격을 막을 때는 값이 모자라지 않게 버린다(여러 번 호출해도 끝까지 막아 냄)
  const t = scene(3, { enemy: c(C, 12), hands: [[c(H, 9), c(Di, 8), c(S, 2), c(H, 3)], [c(H, 2)], [c(H, 3)]] });
  t.phase = 'suffer'; t.need = 15;
  let k = 0; while (t.phase === 'suffer' && k++ < 10) rg.applyMove(t, rg.botChoose(t, tr, rng, info(0)).move);
  assert(t.phase !== 'suffer' && !t.over, '반격을 막아 냄');
  assert(t.hands[0].length >= 1, '필요한 만큼만 버림');
});
await test(G, '봇: 한 번에 쓰러뜨릴 수 있으면 그 수를 고른다 (♣ 두 배로 정확히 맞추기 포함)', () => {
  const rng = makeRng(4), tr = { skill: 8, aggression: 5, risk: 5, patience: 5, bluff: 3, targetMode: 'none' };
  let ok = 0, n = 0;
  for (let seed = 1; seed <= 20; seed++) {
    const s = scene(3, { enemy: c(H, 11), hands: [[c(C, 10), c(S, 7), c(Di, 4), c(H, 3)], [c(H, 5), c(H, 6)], [c(H, 7), c(H, 8)]], tavern: [c(S, 8), c(S, 9)] });   // ♣10×2=20 = 정확히 격파
    const ch = rg.botChoose(s, tr, makeRng(seed), info(0)); n++;
    const t = JSON.parse(JSON.stringify(s)); rg.applyMove(t, ch.move);
    if (t.defeated === 1) ok++;
  }
  assert(ok >= 19, `쓰러뜨릴 수 있는데 ${n - ok}번 놓침`);
});
await test(G, '시뮬레이션: 2·3·4인 클리어율이 0%·100%가 아니다(협력 결과로 집계됨)', () => {
  for (const n of [2, 3, 4]) {
    const r = simulate(rg, CH, { games: 60, count: n, seed: 17 });
    assert(r.errors === 0 && r.illegal === 0, `${n}인 오류 ${r.errors}/${r.firstError} 불법 ${r.illegal}`);
    assert(r.coop && r.coop.games === 60, '협력 집계');
    assert(r.coop.clearRate > 0 && r.coop.clearRate < 1, `${n}인 클리어율 ${r.coop.clearRate}`);
  }
});
process.exit(report('레지사이드 테스트') ? 1 : 0);
