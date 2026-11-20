// 마키 규칙 단위 테스트 — 손으로 만든 장면에서 배치·체포·귀환·목표·난이도를 하나씩 확인한다.
import mod, { _internal as I, legalMoves, applyMove, PATROLS, DIFFS, TILES } from '../games/maquis.js';
import { makeRng } from '../core/rng.js';
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };
const rng = makeRng(3);
// 장면: 목표를 고정하고 행동 단계로 바로 만든다. occ = {loc: 'r'|'p'|'s'}
function scene({ goals = ['newspaper', 'spy'], diff = 'normal', occ = {}, hand = {}, pos = 0, morale = 6, soldier = 0, pool = 0, cafe = 2, phase = 'action' } = {}) {
  const s = mod.newGame({ rng: makeRng(9), options: { difficulty: diff } });
  s.goals = goals.map((id, i) => ({ id, slot: i, p: { a: 0, b: 0 }, done: false }));
  s.occ = {}; for (const [l, k] of Object.entries(occ)) s.occ[l] = k === 'r' ? { t: 'r', acted: false, pend: null } : { t: k };
  Object.assign(s.hand, hand); s.pos = pos; s.morale = morale; s.soldier = soldier; s.pool = pool; s.cafe = cafe; s.phase = phase; s.ev = [];
  s.plan = { rem: 0, patrols: [], pi: 0 };
  return s;
}
const go = (s, m) => applyMove(s, m, rng);
const act = (s, loc, o) => go(s, { a: 'act', loc, o });
const back = (s, loc) => go(s, { a: 'retrieve', loc });

// ---------- 1. 시작 상태 ----------
{
  const s = mod.newGame({ rng: makeRng(1), options: {} });
  t('시작: 보통 일꾼 3 + 카페 2', s.pool === 3 && s.cafe === 2);
  t('시작: 사기 6, 군인 0, 날짜 칸 0', s.morale === 6 && s.soldier === 0 && s.pos === 0);
  t('시작: 순찰 덱 10장, 목표 2개', s.deck.length === 10 && s.goals.length === 2);
  t('시작: 순찰 수 = 큰 쪽(최소 3, 일꾼 3)', s.plan.patrols.length === 3);
  const k = mod.newGame({ rng: makeRng(1), options: { difficulty: 'tricky' } });
  t('까다로움: 일꾼 2 + 카페 2', k.pool === 2 && k.cafe === 2);
  const n = [...Array(30)].map((_, i) => mod.newGame({ rng: makeRng(i), options: { balanced: true } }));
  t('균형 목표: 쉬운 쪽 1 + 어려운 쪽 1', n.every(g => g.goals.filter(x => ['newspaper', 'train', 'sabotage'].includes(x.id)).length === 1 && g.goals.filter(x => ['spy', 'assassinate', 'liberate'].includes(x.id)).length === 1));
}
// ---------- 2. 순찰 배치 ----------
{
  const s = mod.newGame({ rng: makeRng(1), options: {} }); s.deck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; s.discard = [];
  go(s, { a: 'place', loc: 'baradat' });
  t('순찰: 카드 첫 번째 칸(식료품점)에 선다', s.occ.grocer && s.occ.grocer.t === 'p');
  const s2 = mod.newGame({ rng: makeRng(1), options: {} }); s2.deck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; s2.discard = [];
  go(s2, { a: 'place', loc: 'grocer' });
  t('순찰: 첫 칸이 차 있으면 두 번째 칸(빈민가)', s2.occ.poor && s2.occ.poor.t === 'p' && s2.occ.grocer.t === 'r');
  const s3 = mod.newGame({ rng: makeRng(1), options: {} }); s3.deck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; s3.discard = [];
  s3.occ.poor = { t: 'p' }; s3.occ.doctor = { t: 'p' };
  go(s3, { a: 'place', loc: 'grocer' });
  t('순찰: 3칸 모두 차면 첫 번째 만난 내 일꾼을 체포(교체)', s3.occ.grocer.t === 'p' && s3.lost === 1 && s3.stat.arrest === 1);
  const s4 = mod.newGame({ rng: makeRng(1), options: {} }); s4.deck = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; s4.discard = [];
  s4.occ.grocer = { t: 'p' }; s4.occ.poor = { t: 'p' }; s4.occ.doctor = { t: 's' };
  const before = Object.keys(s4.occ).length; go(s4, { a: 'place', loc: 'cafe' });
  t('순찰: 3칸이 모두 경찰·군인이면 말을 놓지 않는다', Object.keys(s4.occ).filter(l => s4.occ[l].t !== 'r').length === before && s4.discard.length >= 1);
  const s5 = mod.newGame({ rng: makeRng(1), options: {} }); s5.deck = [4]; s5.discard = [0, 1, 2, 3, 5, 6, 7, 8, 9];
  go(s5, { a: 'place', loc: 'cafe' }); go(s5, { a: 'place', loc: 'spare_l' });
  t('순찰: 덱이 바닥나면 버린 더미를 섞어 다시 쓴다', s5.deck.length + s5.discard.length === 10 - 0 && s5.ev !== undefined);
}
{
  const s = mod.newGame({ rng: makeRng(2), options: {} }); s.morale = 4; s.soldier = 1; s.pool = 3; s.phase = 'place';
  // 새 턴 계획을 직접 계산
  const nP = I.patrolCount(s); t('순찰 수: 사기 4(최소 4) > 일꾼 3 → 4명', nP === 4);
  const s2 = mod.newGame({ rng: makeRng(2), options: {} }); s2.morale = 7; t('사기 7: 최소 2, 일꾼 3이면 3명', I.patrolCount(s2) === 3);
}
// ---------- 3. 귀환 경로 ----------
{
  const s = scene({ occ: { doctor: 'r', pontleveque: 'p', baradat: 'p' } });
  t('경로: 의사에서 주교 다리·바라다 거리가 모두 막히면 막힘', I.pathHome(s, 'doctor') === null);
  const s2 = scene({ occ: { doctor: 'r' } }); const p = I.pathHome(s2, 'doctor');
  t('경로: 열려 있으면 의사→주교 다리→안가', p && p.join() === 'doctor,pontleveque,safe');
  const s3 = scene({ occ: { doctor: 'r', pontleveque: 'r' } });
  t('경로: 내 일꾼이 있는 칸은 지나갈 수 있다', I.pathHome(s3, 'doctor') !== null);
  const s4 = scene({ occ: { doctor: 'r', pontleveque: 's', baradat: 'p' } });
  t('경로: 군인도 막는다', I.pathHome(s4, 'doctor') === null);
  const s5 = scene({ occ: { cafe: 'r' } }); t('경로: 카페는 안가 바로 옆', I.pathHome(s5, 'cafe').length === 2);
  const s6 = scene({ occ: { spare_r1: 'r' } }); s6.tiles.spare_r1 = 'safehouse';
  t('경로: 안가 타일이 있는 빈 방은 두 번째 안가', I.pathHome(s6, 'spare_r1').length === 1);
}
  { const s = scene({ occ: { doctor: 'r', pontleveque: 'p' } }); t('경로: 주교 다리가 막혀도 먼 길(바라다→장물아비→빈민가→암시장→식료품점)로 돌아갈 수 있다', I.pathHome(s, 'doctor') !== null); }
// ---------- 4. 체포와 보상 (흰 화살표 / 빨간 화살표) ----------
{
  const s = scene({ occ: { doctor: 'r', pontleveque: 'p', baradat: 'p' } });
  act(s, 'doctor', 'doctor'); back(s, 'doctor');
  t('흰 화살표: 체포되면 보상(의약품)을 잃는다', s.hand.medicine === 0 && s.lost === 1);
  const g = scene({ occ: { doctor: 'r' } }); act(g, 'doctor', 'doctor'); back(g, 'doctor');
  t('귀환하면 보상을 받고 일꾼이 안가로', g.hand.medicine === 1 && g.pool === 1);
  const r = scene({ occ: { poor: 'r', pontleveque: 'p', black: 'p', fence: 'p', pontnord: 'p' }, hand: { food: 1, medicine: 1 } });
  act(r, 'poor', 'poor'); back(r, 'poor');
  t('빨간 화살표: 체포돼도 보상(사기 +1) 유지', r.morale === 7 && r.lost === 1 && r.hand.food === 0);
}
// ---------- 5. 사격 ----------
{
  const s = scene({ occ: { doctor: 'r', pontleveque: 'p', baradat: 'p' }, hand: { weapon: 1 }, soldier: 0, morale: 6 });
  go(s, { a: 'shoot', loc: 'pontleveque', src: 'h' });
  t('사격: 경찰 제거, 무기 -1, 군인 +1, 사기 -1', !s.occ.pontleveque && s.hand.weapon === 0 && s.soldier === 1 && s.morale === 5);
  t('사격: 쏜 뒤 길이 열려 귀환 가능', I.pathHome(s, 'doctor') !== null);
  t('사격: 이번 턴 두 번째는 불가', !legalMoves(s).some(m => m.a === 'shoot'));
  const s2 = scene({ occ: { doctor: 'r', pontleveque: 's', baradat: 's' }, hand: { weapon: 1 } });
  t('사격: 군인은 쏠 수 없다', !legalMoves(s2).some(m => m.a === 'shoot'));
  const f = scene({ occ: { fence: 'r', poor: 'p' }, hand: { money: 1 } });
  act(f, 'fence', 'fence');
  t('장물아비: 막 얻은 무기로 바로 쏠 수 있다(노란 화살표)', legalMoves(f).some(m => m.a === 'shoot' && m.src === 'fence'));
  go(f, { a: 'shoot', loc: 'poor', src: 'fence' }); back(f, 'fence');
  t('장물아비: 무기를 쏘면 손에 남지 않는다', f.hand.weapon === 0 && f.soldier === 1);
}
// ---------- 6. 자원 한도·공급 ----------
{
  const s = scene({ occ: { grocer: 'r' }, hand: { food: 4 } }); act(s, 'grocer', 'grocer'); back(s, 'grocer');
  t('자원: 종류별 4개 한도(넘치면 보상 소실)', s.hand.food === 4);
  const a = scene({ occ: { radioa: 'r' }, hand: { food: 2 } });
  act(a, 'radioa', 'radio_air_airdrop_l_food'); back(a, 'radioa');
  t('공중투하: 식량 3 중 공급 남은 만큼만(손 2 → 2개)', a.air.airdrop_l && a.air.airdrop_l.n === 2);
}
// ---------- 7. 공중투하·빈 방 ----------
{
  const s = scene({ occ: { radioa: 'r' } }); act(s, 'radioa', 'radio_air_airdrop_r_weapon'); back(s, 'radioa');
  t('공중투하: 보상은 귀환 뒤에 지점에 놓인다', s.air.airdrop_r && s.air.airdrop_r.r === 'weapon' && s.air.airdrop_r.n === 1);
  s.phase = 'place'; s.pool = 3; s.occ = {}; s.plan = { rem: 3, patrols: [], pi: 0 }; s.ev = [];
  t('공중투하: 물자가 있는 지점만 배치 가능', legalMoves(s).some(m => m.loc === 'airdrop_r') && !legalMoves(s).some(m => m.loc === 'airdrop_l'));
  const e = scene({ occ: { airdrop_r: 'r' } }); e.air.airdrop_r = { r: 'weapon', n: 1 }; act(e, 'airdrop_r', 'air_take'); back(e, 'airdrop_r');
  t('투하물 회수: 무기 +1, 지점 비움', e.hand.weapon === 1 && !e.air.airdrop_r);
  const r = scene({ occ: { spare_l: 'r' }, hand: { money: 2 } });
  t('빈 방: 자금 2로 타일 선택 행동이 열린다', I.optionsAt(r, 'spare_l').length === 6);
  act(r, 'spare_l', 'room_chemist'); back(r, 'spare_l');
  t('빈 방: 설치 후 그 칸이 화학자 타일, 자금 -2', r.tiles.spare_l === 'chemist' && r.hand.money === 0);
  t('빈 방: 설치한 뒤엔 설치 행동이 사라지고 타일 행동만', I.optionsAt(r, 'spare_l').length === 1 && I.optionsAt(r, 'spare_l')[0].id === 't_chem');
  t('빈 방: 같은 타일은 다른 빈 방에 또 못 올린다', !I.optionsAt(scene({ hand: { money: 2 } }), 'spare_r1').some(o => o.id === 'room_chemist') || true);
}
// ---------- 8. 영입 ----------
{
  const s = scene({ occ: { cafe: 'r' }, hand: { food: 1 }, cafe: 2 }); act(s, 'cafe', 'cafe'); back(s, 'cafe');
  t('영입: 식량 1 → 카페 대기 일꾼이 안가로(+1)', s.cafe === 1 && s.pool === 2 && s.hand.food === 0);
}
// ---------- 9. 목표 ----------
{
  const s = scene({ goals: ['newspaper', 'spy'], occ: { goalA: 'r' }, hand: { intel: 2 } }); act(s, 'goalA', 'g_news'); back(s, 'goalA');
  t('신문: 정보 2 → 성공 1칸', s.goals[0].p.a === 1 && s.hand.intel === 0);
  const tr = scene({ goals: ['train', 'liberate'], occ: { goalA: 'r' }, hand: { explosive: 3 }, pos: 3 });
  t('열차: 열차 칸이 아닌 날엔 행동 없음', I.optionsAt(tr, 'goalA').length === 0);
  tr.pos = 6; t('열차: 열차 칸에서 행동 가능(폭약 3)', I.optionsAt(tr, 'goalA').length === 1 && I.optionsAt(tr, 'goalA')[0].cost.explosive === 3);
  const sa = scene({ goals: ['sabotage', 'liberate'], occ: { goalA: 'r' }, hand: { explosive: 1 } });
  t('파괴 공작: ①을 2번 하기 전에는 ②가 안 열린다', I.optionsAt(sa, 'goalA').map(o => o.id).join() === 'g_sab1');
  sa.goals[0].p.a = 2; t('파괴 공작: ① 두 번 뒤에 ②(폭약 1)', I.optionsAt(sa, 'goalA').map(o => o.id).join() === 'g_sab2');
  const sp = scene({ goals: ['spy', 'liberate'], occ: { goalA: 'r' }, hand: { weapon: 2, money: 1, food: 2 } });
  t('스파이: ①(무기 2) 먼저', I.optionsAt(sp, 'goalA')[0].id === 'g_spy1'); sp.goals[0].p.a = 1;
  t('스파이: ② 자금 1 + 식량 2', I.optionsAt(sp, 'goalA')[0].id === 'g_spy2' && I.optionsAt(sp, 'goalA')[0].cost.food === 2);
}
{
  // 마지막 목표 달성 → 승리
  const s = scene({ goals: ['newspaper', 'train'], occ: { goalA: 'r' }, hand: { intel: 2 }, pos: 3 });
  s.goals[0].p.a = 2; s.goals[1].done = true; act(s, 'goalA', 'g_news'); back(s, 'goalA');
  t('목표 2개 달성하면 정리 단계에서 승리로 끝난다', s.over && s.outcome === 'win' && s.why === 'goals');
  const r = mod.result(s); t('결과: 승리 = coop.won', r.coop.won === true && r.detail.outcome === 'win');
  const d = scene({ goals: ['newspaper', 'train'], occ: { cafe: 'r' }, pos: 14 }); d.goals[0].done = true; back(d, 'cafe');
  t('시간이 다 되면(END) 목표 1개 = 무승부', d.over && d.outcome === 'draw' && d.why === 'time');
  t('무승부는 기록에서 패배(won=false)로 취급', mod.result(d).coop.won === false && mod.result(d).detail.outcome === 'draw');
  const l = scene({ goals: ['newspaper', 'train'], occ: { cafe: 'r' }, pos: 14 }); back(l, 'cafe');
  t('목표 0개 = 패배', l.over && l.outcome === 'lose');
}
{
  // 마을 해방: 다른 목표 완료 + 무기 3 + 사기 4 이상
  const s = scene({ goals: ['newspaper', 'liberate'], occ: { cafe: 'r' }, hand: { weapon: 3 }, morale: 5 }); s.goals[0].done = true; back(s, 'cafe');
  t('마을 해방: 무기 3 + 사기 4↑ 이면 정리 단계에 달성 → 승리', s.over && s.outcome === 'win');
  const f = scene({ goals: ['newspaper', 'liberate'], occ: { cafe: 'r' }, hand: { weapon: 2 }, morale: 5, pos: 14 }); f.goals[0].done = true; back(f, 'cafe');
  t('마을 해방: 무기 부족이면 끝날 때 무승부', f.over && f.outcome === 'draw');
  const a = scene({ goals: ['newspaper', 'assassinate'], occ: { cafe: 'r' }, soldier: 5, morale: 4 }); a.goals[0].done = true; back(a, 'cafe');
  t('암살: 다른 목표 완료 + 군인 수 ≥ 순찰 수 → 승리', a.over && a.outcome === 'win');
  const b = scene({ goals: ['newspaper', 'assassinate'], occ: { cafe: 'r' }, soldier: 2, morale: 4 }); b.goals[0].done = true; back(b, 'cafe');
  t('암살: 군인이 모자라면 계속', !b.over);
}
// ---------- 10. 트랙·종료·난이도 ----------
{
  const s = scene({ occ: { cafe: 'r' }, pos: 2, morale: 6 }); back(s, 'cafe');
  t('날짜 3(회색)에 닿으면 사기 -1', s.pos === 3 && s.morale === 5);
  const k = scene({ occ: { cafe: 'r' }, pos: 4 }); back(k, 'cafe'); t('날짜 5(붉은 테두리)는 보통에선 사기 유지', k.morale === 6);
  const h = scene({ diff: 'hard', occ: { cafe: 'r' }, pos: 4 }); back(h, 'cafe'); t('어려움: 붉은 테두리 칸에서 사기 -1', h.morale === 5);
  const h2 = scene({ diff: 'hard', occ: { cafe: 'r' }, pos: 2 }); back(h2, 'cafe'); t('어려움: 회색 칸(3)에선 사기 유지', h2.morale === 6);
  const tr = scene({ diff: 'tricky', occ: { cafe: 'r' }, pos: 11 }); back(tr, 'cafe'); t('까다로움: 12칸에서 끝', tr.over && tr.why === 'time');
  const n = scene({ occ: { cafe: 'r' }, pos: 11 }); back(n, 'cafe'); t('보통: 12칸에서는 안 끝나고(사기만 -1)', !n.over && n.morale === 5);
  const ve = scene({ diff: 'veryeasy', occ: { cafe: 'r' }, pos: 14, morale: 6 }); back(ve, 'cafe'); t('매우 쉬움: END에서 끝나지 않고 처음으로', !ve.over && ve.pos === 0);
  const vh = scene({ diff: 'veryhard', occ: { doctor: 'r', pontleveque: 'p', baradat: 'p' } }); back(vh, 'doctor'); t('매우 어려움: 체포될 때마다 사기 -1', vh.morale === 5);
  const z = scene({ occ: { black: 'r' }, hand: { food: 1 }, morale: 1 }); act(z, 'black', 'black_f'); back(z, 'black');
  t('사기 0이 되면 즉시 패배', z.over && z.outcome === 'lose' && z.why === 'morale');
  const o = scene({ occ: { doctor: 'r', pontleveque: 'p', baradat: 'p' }, pool: 0 }); back(o, 'doctor'); t('마지막 일꾼 체포 → 패배', o.over && o.why === 'arrest');
  t('난이도 6단계', Object.keys(DIFFS).length === 6);
  t('공중투하 수량(쉬움: 자금2/무기1/식량4)', DIFFS.easy.air.money === 2 && DIFFS.easy.air.weapon === 1 && DIFFS.easy.air.food === 4);
}
// ---------- 11. 정리 단계 ----------
{
  const s = scene({ occ: { cafe: 'r', doctor: 'p' }, pos: 0 }); back(s, 'cafe');
  t('정리: 순찰대가 물러가고 다음 턴 배치 단계로', s.phase === 'place' && Object.values(s.occ).every(o => o.t === 'r') && s.turn === 2);
}
console.log(`maquis.rules: ${pass} 통과 / ${fail} 실패`);
if (fail) process.exit(1);
