// Quests Over Coffee 규칙 테스트 — 손으로 만든 장면 + 봇 대량 플레이(불변식·종료·클리어율)
import mod, { QUESTS, ITEMS, ENVS, SHOPS, card, legalMoves, applyMove, botChoose, result, scoreOf, gradeOf, boardPossible, helpCost, shopCost, outcomeOf, analysisOf, _internal as I } from '../games/qoc.js';
import { makeRng } from '../core/rng.js';
let pass = 0, fail = 0;
const t = (name, cond) => { if (cond) pass++; else { fail++; console.log('  ✗ ' + name); } };
const rng = makeRng(5);
const go = (s, m) => applyMove(s, m, rng);

// 장면: 상태를 직접 구성한다. 시작 선택은 끝내고 pick 단계로.
function scene({ packs = ['base'], mode = 'std', env = false, items = [], h = 3, l = 1, m = 2, q = null, dice = null, envCur = null, seed = 4, phase = 'pick' } = {}) {
  const s = mod.newGame({ rng: makeRng(seed), options: { packs, mode, env } });
  if (s.pend && s.pend.k === 'keep') go(s, { a: 'keep', id: s.pend.ids[0] });
  // 시작 아이템 제거 후 지정 아이템으로 교체(덱에서 빼서 중복 방지)
  s.iDeck.push(...s.items); s.items = [];
  for (const id of items) { const i = s.iDeck.indexOf(id); if (i >= 0) s.iDeck.splice(i, 1); s.items.push(id); }
  s.h = h; s.l = l; s.m = m; s.envCur = envCur; if (envCur) s.env = true;
  if (q) {
    s.qAct = [q, ...s.qAct.filter(x => x !== q)].slice(0, 5); if (!s.qAct.includes(q)) s.qAct[0] = q;
    go(s, { a: 'pick', q });
    if (dice) { s.q.dice = dice.map(v => ({ v, k: 'base' })); }
  }
  s.ev = []; return s;
}

// ---------- 1. 시작 ----------
{
  const s = mod.newGame({ rng: makeRng(1), options: {} });
  t('시작: 기본 팩만 → 퀘스트 10장(5 활성 + 5 덱)', s.qAct.length === 5 && s.qDeck.length === 5);
  t('시작: 아이템 2장 중 1장 고르기 대기', s.pend && s.pend.k === 'keep' && s.pend.ids.length === 2);
  go(s, { a: 'keep', id: s.pend.ids[1] });
  t('시작: 고른 1장이 손에, 나머지는 덱 맨 아래', s.items.length === 1 && s.iDeck.length === 5 && s.phase === 'pick');
  t('플레이어 카드 A: 체력3 행운1 돈2', s.h === 3 && s.l === 1 && s.m === 2);
  const b = mod.newGame({ rng: makeRng(1), options: { side: 'B' } });
  t('플레이어 카드 B: 체력2 행운3 돈3', b.h === 2 && b.l === 3 && b.m === 3);
  t('기본 10장의 별 합 21', QUESTS.filter(q => q.pack === 'base').reduce((a, q) => a + q.stars, 0) === 21);
  t('기본만으로는 퀘스트 보드(3·4·3) 불가, 팩을 합치면 가능', !boardPossible(['base']) && boardPossible(['base', 'sci']) && boardPossible(['base', 'sci', 'nc']));
  const bd = mod.newGame({ rng: makeRng(2), options: { packs: ['base', 'sci'], mode: 'board' } });
  const all = [...bd.qAct, ...bd.qDeck].map(id => card(id).stars);
  t('퀘스트 보드: 별 1·2·3개가 3·4·3장, 별 합 20', [1, 2, 3].map(k => all.filter(x => x === k).length).join() === '3,4,3' && bd.stars === 20);
  const fb = mod.newGame({ rng: makeRng(2), options: { packs: ['base'], mode: 'board' } });
  t('보드 불가능하면 표준으로 대체', fb.mode === 'std');
  const tw = mod.newGame({ rng: makeRng(2), options: { packs: ['base', 'sci', 'nc'] } });
  t('팩을 합치면 10장만 뽑는다', tw.qAct.length + tw.qDeck.length === 10);
  t('환경: 켜고 03 팩이면 환경 1장 공개', mod.newGame({ rng: makeRng(2), options: { packs: ['base', 'sci'], env: true } }).envCur != null);
  t('환경: 03 팩이 없으면 켜도 없음', mod.newGame({ rng: makeRng(2), options: { packs: ['base'], env: true } }).envCur == null);
}

// ---------- 2. 특수조건 판정 ----------
{
  const s = scene();
  const c = I.parseCond, ok = (txt, d, st = {}) => I.condMet({ ...s, ...st }, c(txt), d);
  t('PAIR: 같은 눈 2개', ok('PAIR', [3, 3, 5]) && !ok('PAIR', [1, 3, 5]));
  t('PAIR: 도움 주사위가 있어도(4개) 판정', ok('PAIR', [1, 2, 3, 3, 6]));
  t('STRAIGHT: 3개 연속', ok('STRAIGHT', [2, 3, 4]) && ok('STRAIGHT', [1, 3, 4, 6, 5]) && !ok('STRAIGHT', [1, 2, 4]));
  t('STRAIGHT: 중복이 있어도', ok('STRAIGHT', [2, 2, 3, 4]));
  t('[2,3,4]: 모두 포함', ok('2,3,4', [4, 2, 3]) && !ok('2,3,4', [2, 2, 4]));
  t('[1,1,1]: 같은 눈 3개 필요', ok('1,1,1', [1, 1, 1]) && !ok('1,1,1', [1, 1, 5]));
  t('[5,5]: 5가 두 개', ok('5,5', [5, 5, 1]) && !ok('5,5', [5, 1, 2]));
  t('[6]: 6이 하나', ok('6', [6, 1, 1]) && !ok('6', [5, 1, 1]));
  t('[HEALTH<3]·[LUCK>3]·[MONEY<2]', ok('HEALTH<3', [], { h: 2 }) && !ok('HEALTH<3', [], { h: 3 }) && ok('LUCK>3', [], { l: 4 }) && !ok('LUCK>3', [], { l: 3 }) && ok('MONEY<2', [], { m: 1 }));
}

// ---------- 3. 성공/실패/포기와 특수조건 ----------
{
  // b01: 실패 ≤8, 성공 ≥11, [1,1,1] 체력 −1
  let s = scene({ q: 'b01', dice: [1, 3, 4], l: 0 });                  // 합 8 → 실패
  const o = outcomeOf(s); t('합 8 → 실패', o.res === 'fail');
  go(s, { a: 'done' });
  t('실패: 행운 −1(0에서 바닥), 퀘스트는 실패 목록', s.l === 0 && s.failed.includes('b01') && s.q === null);
  s = scene({ q: 'b01', dice: [4, 4, 3], l: 1 });                       // 합 11 → 성공
  go(s, { a: 'done' }); t('합 11 → 성공: 행운 +1, 퀘스트 보관', s.l === 2 && s.kept.includes('b01'));
  s = scene({ q: 'b01', dice: [3, 3, 3], l: 1 });                       // 합 9 → 포기
  go(s, { a: 'done' }); t('합 9 → 포기: 변화 없음·점수 없음', s.l === 1 && !s.kept.includes('b01') && !s.failed.includes('b01') && !s.qAct.includes('b01'));
  s = scene({ q: 'b01', dice: [1, 1, 1], h: 3 });                       // 합 3 → 실패 + [1,1,1]
  go(s, { a: 'done' }); t('실패와 특수조건이 함께 발동: 행운 −1, 체력 −1', s.h === 2 && s.l === 0);
  s = scene({ q: 'b03', dice: [5, 5, 3], m: 2 });                       // 합 13 ≥12 성공 + PAIR 돈 +1 + 아이템
  go(s, { a: 'done' }); t('성공 + 특수조건: 아이템 1개 + 돈 +1', s.items.length === 1 && s.m === 3);
  s = scene({ q: 'b10', dice: [6, 3, 1] });                              // 합 10 → 포기지만 [6] 행운 +2
  go(s, { a: 'done' }); t('포기여도 특수조건은 발동', s.l === 3 && !s.kept.includes('b10'));
}

// ---------- 4. 주사위 도움·행운 재굴림 ----------
{
  let s = scene({ q: 'b06', dice: [3, 3, 3], m: 5, l: 2 });             // 별 3개 → 주사위당 돈 3
  t('도움 비용 = 별 수', helpCost(s, 3) === 3 && helpCost(s, 1) === 1);
  go(s, { a: 'help' }); t('도움: 돈 −3, 주사위 4개', s.m === 2 && s.q.dice.length === 4 && s.q.help === 1);
  t('도움 최대 3개', (() => { const z = scene({ q: 'b01', dice: [3, 3, 3], m: 10 }); for (let i = 0; i < 3; i++) go(z, { a: 'help' }); return !legalMoves(z).some(m => m.a === 'help') && z.q.dice.length === 6; })());
  t('행운 재굴림: 행운 −1, 선택한 주사위만 바뀜 가능', (() => { const z = scene({ q: 'b01', dice: [1, 1, 1], l: 2 }); go(z, { a: 'reroll', m: 0b101 }); return z.l === 1 && z.q.dice[1].v === 1; })());
  t('행운 0이면 재굴림 불가', !legalMoves(scene({ q: 'b01', dice: [1, 1, 1], l: 0 })).some(m => m.a === 'reroll'));
  t('돈 부족하면 도움 불가', !legalMoves(scene({ q: 'b06', dice: [1, 1, 1], m: 2 })).some(m => m.a === 'help'));
}

// ---------- 5. 아이템 ----------
{
  let s = scene({ q: 'b01', dice: [1, 1, 1], items: ['b-spy'] });
  go(s, { a: 'item', i: 0 }); t('망원경: 합계 +2, 아이템은 덱 맨 아래로', s.q.bonus === 2 && outcomeOf(s).total === 5 && s.iDeck[s.iDeck.length - 1] === 'b-spy' && s.items.length === 0);
  s = scene({ q: 'b01', dice: [1, 1, 1], items: ['b-robo'] });
  go(s, { a: 'item', i: 0 }); t('로보 파이터: 주사위 +1 (도움 한도와 별개)', s.q.dice.length === 4 && s.q.help === 0);
  s = scene({ items: ['b-pizza'], h: 2 });
  go(s, { a: 'item', i: 0 }); t('피자: 체력 +1 (언제든)', s.h === 3);
  s = scene({ items: ['b-pizza'], h: 5 });
  go(s, { a: 'item', i: 0 }); t('체력 상한 5', s.h === 5);
  s = scene({ items: ['b-cursed'], h: 3, m: 2 });
  go(s, { a: 'item', i: 0 }); t('저주받은 카드: 돈 +2, 체력 −1', s.m === 4 && s.h === 2);
  s = scene({ items: ['b-potion'], h: 2, l: 1 });
  go(s, { a: 'item', i: 0 }); t('물약: 체력 +1, 행운 +1', s.h === 3 && s.l === 2);
  s = scene({ q: 'b01', dice: [1, 3, 4], items: ['n-hammer'], l: 2, packs: ['base', 'nc'] });
  t('망치: 6이 아닌 주사위만 대상', legalMoves(s).filter(m => m.a === 'item').length === 3);
  go(s, { a: 'item', i: 0, d: 1 }); t('망치: 주사위 6, 행운 −1', s.q.dice[1].v === 6 && s.l === 1);
  s = scene({ q: 'b01', dice: [2, 2, 2], items: ['n-fried'], h: 3, packs: ['base', 'nc'] });
  go(s, { a: 'item', i: 0, d: 0 }); t('튀김: 주사위 6, 체력 −2', s.q.dice[0].v === 6 && s.h === 1);
  s = scene({ q: 'b01', dice: [2, 2, 2], items: ['s-multi'], l: 0, packs: ['base', 'sci'] });
  go(s, { a: 'item', i: 0, m: 0b111 }); t('멀티 티켓: 행운 없이 재굴림', s.l === 0 && s.items.length === 0);
  t('배지: 별 2개 퀘스트 도움 비용 −1(최소 1)', helpCost(scene({ items: ['s-badge'], packs: ['base', 'sci'] }), 2) === 1 && helpCost(scene({ items: ['s-badge'], packs: ['base', 'sci'] }), 3) === 3);
  s = scene({ items: ['s-medkit'], h: 1, packs: ['base', 'sci'] }); go(s, { a: 'item', i: 0 });
  t('구급상자: d6에 따라 체력 +1/+2', s.h === 2 || s.h === 3);
}

// ---------- 6. 피해 반응(나중에 쓴 것부터) ----------
{
  let s = scene({ q: 'b02', dice: [1, 1, 1], items: ['b-pizza'], h: 1, m: 3 });  // 실패 ≤10: 돈 −1, 체력 −1
  go(s, { a: 'done' });
  t('치명 피해 직전에 반응 창이 뜬다', s.pend && s.pend.k === 'dmg' && s.pend.amt === 1);
  go(s, { a: 'react', i: 0 });
  t('피자를 먼저 쓰면 살아남는다(체력 1+1−1=1)', !s.over && s.h === 1 && !s.pend);
  s = scene({ q: 'b02', dice: [1, 1, 1], items: ['b-pizza'], h: 1, m: 3 });
  go(s, { a: 'done' }); go(s, { a: 'take' });
  t('그냥 받으면 쓰러져 점수 0', s.over && s.dead && result(s).coop.score === 0 && result(s).coop.won === false);
  s = scene({ q: 'b06', dice: [1, 1, 1], items: ['b-box'], h: 3 });               // 실패: 체력 −3
  go(s, { a: 'done' });
  t('상자를 가지고 있으면 피해 반응 창', s.pend && s.pend.k === 'dmg');
  go(s, { a: 'react', i: 0 }); t('상자: 피해 3 → 2', s.h === 1 && !s.pend);
  s = scene({ q: 'b06', dice: [1, 1, 1], items: ['b-box'], h: 3 });
  go(s, { a: 'item', i: 0 }); t('굴림 중 상자를 미리 준비', s.q.shield === 1);
  go(s, { a: 'done' }); t('준비한 상자가 자동으로 피해 1 방어', s.h === 1 && !s.pend);
  s = scene({ q: 'b02', dice: [1, 1, 1], h: 1 }); go(s, { a: 'done' });
  t('방어 수단이 없으면 반응 창 없이 바로 쓰러짐', s.over && s.dead);
}

// ---------- 7. 아이템 한도·잃기·완전 버리기 ----------
{
  let s = scene({ q: 'b03', dice: [6, 6, 6], items: ['b-pizza', 'b-potion', 'b-cursed'] });
  go(s, { a: 'done' });
  t('아이템 4개째를 얻으면 하나를 버려야 한다', s.pend && s.pend.k === 'over' && s.items.length === 3);
  go(s, { a: 'drop', i: 1 }); t('버린 뒤 새 아이템이 들어온다', s.items.length === 3 && !s.items.includes('b-potion') && !s.pend);
  s = scene({ q: 's07', packs: ['base', 'sci'], dice: [1, 1, 1], items: ['b-pizza', 'b-potion'], h: 3 }); // 실패: 체력 −1 아이템 −1
  go(s, { a: 'done' });
  t('아이템을 잃을 땐 어떤 걸 잃을지 고른다', s.pend && s.pend.k === 'lose'); go(s, { a: 'drop', i: 0 });
  t('잃은 아이템은 덱 아래로', s.items.length === 1 && s.iDeck[s.iDeck.length - 1] === 'b-pizza');
  s = scene({ q: 's12', packs: ['base', 'sci'], dice: [1, 1, 1], m: 1, h: 4 });       // 실패 체력 −2 + [MONEY<2] 완전 버리기
  go(s, { a: 'done' });
  t('특수조건으로 완전히 버릴지 묻는다', s.pend && s.pend.k === 'void');
  go(s, { a: 'void', y: true }); t('버리면 실패로도 안 센다', s.voided.includes('s12') && !s.failed.includes('s12') && s.h === 2);
  s = scene({ q: 's12', packs: ['base', 'sci'], dice: [1, 1, 1], m: 1, h: 4 }); go(s, { a: 'done' }); go(s, { a: 'void', y: false });
  t('안 버리면 실패 −1점', s.failed.includes('s12'));
}

// ---------- 8. 상점 ----------
{
  const s = scene({ packs: ['base', 'sci'] });
  // 첫 라운드를 모두 "포기" 처리하는 가장 짧은 길: 눈을 맞춰 포기 구간으로
  for (let i = 0; i < 5; i++) {
    const id = s.qAct[0], q = card(id); go(s, { a: 'pick', q: id });
    const target = Math.floor((q.f.v + q.w.v) / 2); const vals = [1, 1, 1]; let need = target - 3, k = 0; while (need > 0) { const add = Math.min(5, need); vals[k % 3] += add; need -= add; k++; }
    s.q.dice = vals.map(v => ({ v, k: 'base' }));
    if (outcomeOf(s).res !== 'aband') { s.q.dice = [3, 3, 3].map(v => ({ v, k: 'base' })); }
    s.h = 5; s.l = 5; s.m = 10; go(s, { a: 'done' });
    while (s.pend) go(s, legalMoves(s)[0]);
  }
  t('5장을 끝내면 상점으로', s.phase === 'shop' && s.shop && s.shop.items.length === 3 && s.shop.costs.every(c => c >= 1 && c <= 6));
  const trade = card(s.shop.card).trade;
  t('상점 카드가 교환 칸을 가질 수 있다(03 상점)', trade === null || trade === 1);
  const buy = legalMoves(s).find(m => m.a === 'buy' && m.drop == null);
  if (buy) { const before = s.m, cost = shopCost(s, s.shop.costs[buy.k]); go(s, buy); t('구매: 돈 차감, 아이템 획득', s.m === before - cost && s.shop.sold[buy.k]); }
  const n = s.shop.items.filter((id, i) => id && !s.shop.sold[i]).length, deckBefore = s.iDeck.length;
  go(s, { a: 'leave' });
  t('나가면 안 산 아이템은 덱에 섞여 돌아간다', s.iDeck.length === deckBefore + n);
  t('2라운드: 활성 퀘스트 5장', s.round === 2 && s.qAct.length === 5 && s.qDeck.length === 0 && s.phase === 'pick');
}
{
  const s = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-fancy' });
  t('고급 동네: 상점 가격 +1', shopCost(s, 3) === 4);
  s.envCur = 'e-loss'; t('손해는 우리가: 가격 −1(최소 1)', shopCost(s, 3) === 2 && shopCost(s, 1) === 1);
}

// ---------- 9. 환경 ----------
{
  let s = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-hot', q: 'b01', dice: [3, 3] });
  t('더운 날: 별 1개 퀘스트 기본 2d6', (() => { const z = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-hot', q: 'b01' }); return z.q.dice.length === 2; })() && (() => { const z = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-hot', q: 'b03' }); return z.q.dice.length === 3; })());
  s = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-night', q: 'b01', dice: [1, 1, 1], l: 3 });
  go(s, { a: 'env', e: 'set', d: 0, v: 6 }); t('춥고 으스스한 밤: 행운 2로 주사위를 원하는 눈으로', s.q.dice[0].v === 6 && s.l === 1);
  t('행운이 모자라면 못 쓴다', !legalMoves(scene({ packs: ['base', 'sci'], env: true, envCur: 'e-night', q: 'b01', dice: [1, 1, 1], l: 1 })).some(m => m.a === 'env'));
  s = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-chilly', q: 'b01', dice: [3, 3, 3], l: 3 });
  go(s, { a: 'env', e: 'nudge', d: 0, v: 4 });
  t('쌀쌀한 날: ±1은 퀘스트당 1번', s.q.dice[0].v === 4 && !legalMoves(s).some(m => m.e === 'nudge'));
  s = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-rain', q: 'b01', dice: [6, 6, 2] });
  t('비야 저리 가라: 6만 1·2·3으로', legalMoves(s).filter(m => m.e === 'rain').length === 6); go(s, { a: 'env', e: 'rain', d: 0, v: 1 }); t('  → 6이 1로', s.q.dice[0].v === 1);
  s = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-gems', items: ['b-pizza'] });
  go(s, { a: 'env', e: 'gem', i: 0 }); t('보석: 아이템을 버리고 돈 +1', s.items.length === 0 && s.m === 3);
  s = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-frog', l: 2, h: 2 });
  go(s, { a: 'env', e: 'frog' }); t('개구리: 행운 1로 체력 +1', s.l === 1 && s.h === 3);
  s = scene({ packs: ['base', 'sci'], env: true, envCur: 'e-band' }); t('인기 밴드: 별 3개 도움 비용 −1', helpCost(s, 3) === 2 && helpCost(s, 2) === 2);
}

// ---------- 10. 점수·등급·끝 ----------
{
  const s = scene({ packs: ['base', 'sci', 'nc'], items: ['n-plush', 's-hike', 's-darling'], h: 3 });
  s.kept = ['b06', 'b03']; s.failed = ['b01']; s.phase = 'end'; s.qAct = []; s.stars = 21;
  t('점수: 별 5 − 실패 1 + 아이템 4 = 8', scoreOf(s).vp === 8);
  go(s, { a: 'finish' });
  t('달링: 끝날 때 체력 −1', s.over && !s.dead && s.h === 2);
  const r = result(s); t('결과 필드: coop.won/score, summary, detail', typeof r.coop.won === 'boolean' && r.coop.score === 8 && typeof r.summary === 'string' && r.detail.vp === 8);
  const z = scene({ items: ['s-darling'], packs: ['base', 'sci'], h: 1 }); z.phase = 'end'; z.qAct = []; go(z, { a: 'finish' });
  t('달링 때문에 체력 0이면 쓰러짐(점수 0)', z.dead && result(z).coop.score === 0);
  const st = { mode: 'std', stars: 33 }, bd = { mode: 'board', stars: 20 };
  t('표준 등급: 별 합 기준 33점 = 최고, 28~32, 23~27, 22 이하', [33, 30, 25, 20].map(v => gradeOf(st, v).tier).join() === '0,1,2,3');
  t('퀘스트 보드 등급: 20 / 18-19 / 16-17 / 14-15 / ≤13', [20, 19, 17, 15, 9].map(v => gradeOf(bd, v).tier).join() === '0,1,2,3,4');
}

// ---------- 11. 봇 대량 플레이: 불변식·종료·재현 ----------
const CONFIGS = [
  ['기본', { packs: ['base'] }], ['기본·보드불가→표준', { packs: ['base'], mode: 'board' }],
  ['기본+03', { packs: ['base', 'sci'] }], ['기본+03+환경', { packs: ['base', 'sci'], env: true }],
  ['기본+01', { packs: ['base', 'nc'] }], ['전체+보드+환경', { packs: ['base', 'sci', 'nc'], mode: 'board', env: true }],
  ['전체 B면', { packs: ['base', 'sci', 'nc'], env: true, side: 'B' }]
];
const stats = {};
for (const [name, opt] of CONFIGS) {
  let ok = 0, dead = 0, won = 0, vp = 0, steps = 0, bad = null; const N = 400;
  for (let g = 0; g < N; g++) {
    const r = makeRng(1000 + g);
    try {
      const s = mod.newGame({ rng: r, options: opt }); let n = 0;
      const total = s.iDeck.length + s.items.length + (s.pend && s.pend.ids ? s.pend.ids.length : 0);
      while (!s.over) {
        if (++n > 3000) throw new Error('무한 루프');
        const mv = legalMoves(s); if (!mv.length) throw new Error('합법 수 없음');
        const ch = botChoose(s, {}, r);
        if (!mv.some(m => JSON.stringify(m) === JSON.stringify(ch.move))) throw new Error('봇이 불법 수: ' + JSON.stringify(ch.move));
        applyMove(s, ch.move, r);
        if (s.h < 0 || s.h > 5 || s.l < 0 || s.l > 5 || s.m < 0 || s.m > 10) throw new Error('자원 범위 오류 ' + [s.h, s.l, s.m]);
        if (s.items.length > s.imax) throw new Error('아이템 한도 초과');
        const cnt = s.iDeck.length + s.items.length + (s.shop ? s.shop.items.filter((id, i) => id && !s.shop.sold[i]).length : 0) + (s.pend && s.pend.k === 'keep' ? s.pend.ids.length : 0) + (s.pend && s.pend.k === 'over' ? 1 : 0);
        if (cnt !== total && !s.over) throw new Error(`아이템 보존 오류 ${cnt} != ${total} (${s.phase}${s.pend ? '/' + s.pend.k : ''})`);
        JSON.stringify(s);
      }
      const rs = result(s); ok++; steps += n; if (s.dead) dead++; if (rs.coop.won) won++; vp += rs.coop.score;
      if (!s.dead && s.resolved !== 10) throw new Error('퀘스트 10장을 못 끝냄: ' + s.resolved);
    } catch (e) { bad ||= String(e.message || e); }
  }
  stats[name] = { ok, N, dead: dead / N, won: won / N, avgVP: vp / N, avgSteps: steps / N };
  t(`봇 ${N}판 [${name}]: 오류 0·종료`, !bad && ok === N);
  if (bad) console.log('    →', bad);
}
{
  const a = mod.newGame({ rng: makeRng(77), options: { packs: ['base', 'sci', 'nc'], env: true } }), b = mod.newGame({ rng: makeRng(77), options: { packs: ['base', 'sci', 'nc'], env: true } });
  t('같은 시드면 같은 시작', JSON.stringify(a) === JSON.stringify(b));
}

// ---------- 12. 운 vs 선택 분석 ----------
{
  const z = scene({ q: 'b01', dice: [1, 1, 1], l: 3 });                      // 실패 ≤8, 성공 ≥11, 별 1
  go(z, { a: 'reroll', m: 0b111 });
  const st = z.an[z.an.length - 1].steps[0];
  t('분석: 3개 모두 재굴림의 기대 점수는 정확히 계산(≈0.241)', Math.abs(st.ev - (108 / 216 - 56 / 216)) < 0.002 && st.vb === -1 && st.cl === 1);
  const y = scene({ q: 'b01', dice: [3, 3, 3], l: 0, items: ['b-spy'] });     // 합 9(포기) → 망원경 +2 = 11 성공
  go(y, { a: 'item', i: 0 }); const s2 = y.an[y.an.length - 1].steps[0];
  t('분석: 결정적인 선택은 기대=실제(운 0), 이득 +1', s2.ev === s2.va && s2.va - s2.vb === 1);
  let worst = 0, n = 0;
  for (const [, opt] of CONFIGS) for (let g = 0; g < 60; g++) {
    const r = makeRng(5000 + g), s = mod.newGame({ rng: r, options: opt });
    while (!s.over) { const ch = botChoose(s, {}, r); applyMove(s, ch.move, r); }
    if (s.dead) continue;
    const a = analysisOf(s), sc = scoreOf(s); worst = Math.max(worst, Math.abs(a.total - (sc.stars - sc.pen))); n++;
  }
  t(`분석: 기대+운+선택 합이 실제 퀘스트 점수와 정확히 일치 (${n}판, 최대 오차 ${worst.toExponential(1)})`, n > 100 && worst < 1e-6);
}

console.log('\n봇(약한 기준선) 지표:'); for (const [k, v] of Object.entries(stats)) console.log(`  ${k}: 사망 ${(v.dead * 100).toFixed(0)}% · 클리어 ${(v.won * 100).toFixed(0)}% · 평균 점수 ${v.avgVP.toFixed(1)} · 평균 ${v.avgSteps.toFixed(0)}수`);
console.log(`\nQOC 규칙 테스트: ${pass}/${pass + fail} 통과${fail ? ', 실패 ' + fail : ''}`);
process.exit(fail ? 1 : 0);
