// 연출 시험장 (#/fxlab) — 가짜 게임판 위에서 공통 연출(ctx.fx)을 버튼으로 바로 보고 듣는 화면.
// 버튼은 아래 SCENES 목록에서 자동으로 만들어진다. 연출 v2에서 장면·소리가 늘면 목록에 한 줄씩 더하면 된다.
// 사용자는 "약함" 표시를 달아 목록을 복사해 Claude에게 넘긴다(localStorage ba_fxlab_weak, v2는 ba_fxlab_weak_v2).
// v1/v2 스위치: v1은 보존한 옛 엔진(fx1.js)으로 run, v2는 새 엔진(fx.js)으로 run2(없으면 run). v2only 장면은 v2에서만.
import { h, toast } from './ui.js';
import { makeFx, fxPrefs } from './fx.js';
import { makeFx as makeFx1 } from './fx1.js';

const LS = k => { try { return localStorage.getItem(k); } catch { return null; } };
const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
const pick = a => a[Math.floor(Math.random() * a.length)];
const GOLD = ['#ffd76a', '#ffb347', '#fff3b0'], RED = ['#ff5a4e', '#ff8a5c', '#b3261e'], BLUE = ['#7ec8ff', '#b9e3ff', '#4a90e2'];

function scoreOf(b) { return parseInt(b.myScore.firstChild.data, 10) || 0; }
const bump = (fx, b, d) => fx.countTo(b.myScore, Math.max(0, scoreOf(b) + d > 99 ? 12 : scoreOf(b) + d));

// ---------- 장면 목록 ----------
// group: 그룹 이름 · id: 고유 이름(약함 표시 저장 키) · label: 버튼 글자 · desc: 무엇을 보는지 · run(c): 실행 (c = {fx, b} b = 게임판 요소들)
export const SCENES = [
  // 1) 부품 하나씩 (v1 도구 12종)
  { group: '부품', id: 'p.fly', label: '날리기', desc: '내 손패 카드 → 가운데 놓는 자리 (포물선)', run: ({ fx, b }) => { const c = pick(b.hand); return fx.fly({ from: c, to: b.play, node: c, dur: 430, arc: 0.22, spin: -8, scale: 0.9 }); } },
  { group: '부품', id: 'p.flyMany', label: '여러 개 날리기', desc: '칩 6개가 가운데 칩 더미 → 내 점수칸', run: ({ fx, b }) => fx.flyMany(6, { from: b.pot, to: b.myScore, node: '<span class="lchip"></span>', dur: 420, arc: 0.3 }, 45) },
  { group: '부품', id: 'p.pop', label: '통통', desc: '내 점수칸이 커졌다 돌아옴', run: ({ fx, b }) => fx.pop(b.myScore) },
  { group: '부품', id: 'p.slam', label: '탁 (내려꽂기)', desc: '가운데 카드가 위에서 꽂힘', run: ({ fx, b }) => fx.slam(b.play) },
  { group: '부품', id: 'p.shake', label: '흔들기', desc: '상대 1이 좌우로 흔들림', run: ({ fx, b }) => fx.shake(b.opp[0]) },
  { group: '부품', id: 'p.flip', label: '뒤집기', desc: '덱 맨 위 카드가 뒤집힘', run: ({ fx, b }) => fx.flip(b.deck) },
  { group: '부품', id: 'p.glow', label: '반짝임', desc: '상대 2 테두리가 빛남', run: ({ fx, b }) => fx.glow(b.opp[1]) },
  { group: '부품', id: 'p.float', label: '숫자 튀어오름', desc: '+5가 내 점수칸 위로', run: ({ fx, b }) => fx.float(b.myScore, '+5') },
  { group: '부품', id: 'p.burst', label: '불꽃', desc: '가운데에서 금빛 불꽃', run: ({ fx, b }) => fx.burst(b.play, { color: GOLD, n: 14 }) },
  { group: '부품', id: 'p.buzz', label: '진동', desc: '폰 진동 30ms (안드로이드)', run: ({ fx }) => { fx.buzz(30); } },

  // 2) 게임에서 쓰는 조합 장면 (fx-guide.md "게임에 넣을 장면 목록" 그대로)
  { group: '장면', id: 's.deal', label: '시작: 카드 깔기', desc: '손패 5장이 덱에서 착착 깔림', run: async ({ fx, b }) => {
    fx.sfx('deal');
    await Promise.all(b.hand.map((c, i) => fx.fly({ from: b.deck, to: c, node: c, dur: 360, arc: 0.12, delay: i * 90, fromScale: 0.7 }).then(() => { fx.sfx('tap'); fx.slam(c); })));
  } },
  { group: '장면', id: 's.play', label: '카드 내기', desc: '손패 → 가운데, 도착하면 탁', run: async ({ fx, b }) => {
    const c = pick(b.hand); fx.sfx('card');
    await fx.fly({ from: c, to: b.play, node: c, dur: 430, arc: 0.22, spin: -10 });
    fx.sfx('slam'); fx.slam(b.play); fx.buzz(12);
  } },
  { group: '장면', id: 's.draw', label: '카드 뽑기', desc: '덱 → 손패, 뒤집으며 도착', run: async ({ fx, b }) => {
    const c = pick(b.hand); fx.sfx('pick');
    await fx.fly({ from: b.deck, to: c, node: b.deck, dur: 400, arc: 0.18, spin: 6 });
    fx.sfx('flip'); fx.flip(c);
  } },
  { group: '장면', id: 's.chips', label: '칩 가져오기', desc: '칩 촤르륵 → 내 점수칸 +3', run: async ({ fx, b }) => {
    fx.sfx('chips');
    await fx.flyMany(3, { from: b.pot, to: b.myScore, node: '<span class="lchip"></span>', dur: 420, arc: 0.3 }, 60);
    fx.slam(b.myScore); fx.float(b.myScore, '+3');
  } },
  { group: '장면', id: 's.gain', label: '이득', desc: '내 점수칸: 탁 + 숫자 + 불꽃 + 띠리링', run: ({ fx, b }) => { fx.sfx('gain'); fx.slam(b.myScore); fx.float(b.myScore, '+4'); fx.buzz(15); return fx.burst(b.myScore, { color: GOLD }); } },
  { group: '장면', id: 's.loss', label: '손해', desc: '내 점수칸: 흔들기 + 붉은 숫자', run: ({ fx, b }) => { fx.sfx('bad'); fx.float(b.myScore, '-2', { color: '#ff6b5e' }); fx.buzz(25); return fx.shake(b.myScore); } },
  { group: '장면', id: 's.hit', label: '피격 (상대)', desc: '내 카드가 상대에게 날아가 맞음', run: async ({ fx, b }) => {
    const t = pick(b.opp); fx.sfx('card');
    await fx.fly({ from: b.play, to: t, node: b.play, dur: 360, arc: 0.1, scale: 0.6, fade: true });
    fx.sfx('slam'); fx.shake(t, 9); fx.float(t, '-3', { color: '#ff6b5e' }); fx.buzz(20);
    return fx.burst(t, { color: RED, n: 10, spread: 50 });
  } },
  { group: '장면', id: 's.out', label: '탈락', desc: '상대 3: 흔들기 + 붉은 불꽃 + 탈락음', run: ({ fx, b }) => { fx.sfx('out'); fx.buzz(40); fx.burst(b.opp[2], { color: RED, n: 16 }); return fx.shake(b.opp[2], 10); } },
  { group: '장면', id: 's.reveal', label: '공개', desc: '상대 셋의 카드가 차례로 뒤집힘', run: async ({ fx, b }) => {
    for (const o of b.opp) { fx.sfx('flip'); fx.flip(o.querySelector('.lmini')); await fx.wait(160); }
  } },
  { group: '장면', id: 's.place', label: '타일 놓기', desc: '타일이 판에 톡 놓임', run: async ({ fx, b }) => {
    await fx.fly({ from: b.deck, to: b.tile, node: '<div class="ltile"></div>', dur: 380, arc: 0.2 });
    fx.sfx('place'); return fx.slam(b.tile);
  } },
  { group: '장면', id: 's.win', label: '승리', desc: '내 자리: 불꽃 + 반짝임 + 승리음', run: ({ fx, b }) => { fx.sfx('win'); fx.buzz(40); fx.glow(b.me, '#ffd76a'); fx.burst(b.me, { color: GOLD, n: 22, spread: 110 }); return fx.burst(b.play, { color: BLUE, n: 14, spread: 90 }); } },
  { group: '장면', id: 's.lose', label: '패배', desc: '상대 1 반짝임 + 패배음', run: ({ fx, b }) => { fx.sfx('lose'); fx.glow(b.opp[0], '#ffd76a'); return fx.burst(b.opp[0], { color: GOLD, n: 12 }); } },

  // 4) v2에서 새로 생긴 화면 연출
  { group: 'v2 신규', v2only: true, id: 'n.turn', label: '내 턴 띠', desc: '가운데를 가로지르는 띠 + 차오르는 소리', run: ({ fx }) => { fx.sfx('rise'); return fx.banner('내 턴', { sub: 'YOUR TURN' }); } },
  { group: 'v2 신규', v2only: true, id: 'n.round', label: '라운드 띠', desc: '라운드가 바뀔 때', run: ({ fx }) => { fx.sfx('tick'); return fx.banner('라운드 2', { sub: 'ROUND 2', color: '#b9e3ff' }); } },
  { group: 'v2 신규', v2only: true, id: 'n.shake', label: '화면 흔들림', desc: '게임판 전체가 묵직하게 흔들림', run: ({ fx }) => { fx.sfx('impact'); fx.buzz(40); return fx.shakeScreen(10, 420); } },
  { group: 'v2 신규', v2only: true, id: 'n.hitstop', label: '잠깐 멈춤 (히트스톱)', desc: '카드가 꽂히는 순간 0.15초 멈췄다 터짐', run: async ({ fx, b }) => {
    const c = b.hand[2]; fx.sfx('whoosh'); await fx.fly({ from: c, to: b.play, node: c, dur: 380, arc: 0.18, land: false });
    fx.sfx('impact'); fx.buzz(30); const p = fx.slam(b.play, { power: 1.4 }); await fx.hitstop(150); fx.burst(b.play, { color: GOLD, n: 14 }); return p;
  } },
  { group: 'v2 신규', v2only: true, id: 'n.flash', label: '화면 번쩍', desc: '흰빛이 확 터졌다 사라짐', run: ({ fx }) => { fx.sfx('sparkle'); return fx.flash('#ffffff', 0.6); } },
  { group: 'v2 신규', v2only: true, id: 'n.ring', label: '충격파 고리', desc: '가운데 카드에서 금빛 고리가 퍼짐', run: ({ fx, b }) => { fx.sfx('tick'); fx.ring(b.play, { color: '#ffd76a', power: 1.6 }); return fx.wait(200).then(() => fx.ring(b.play, { color: '#ffffff', power: 1 })); } },
  { group: 'v2 신규', v2only: true, id: 'n.count', label: '숫자 굴러 올라가기', desc: '내 점수가 촤르르 올라감', run: ({ fx, b }) => { const v = scoreOf(b) >= 60 ? -48 : 15; fx.sfx(v > 0 ? 'coin' : 'bad'); return fx.countTo(b.myScore, scoreOf(b) + v); } },
  { group: 'v2 신규', v2only: true, id: 'n.glint', label: '광택', desc: '카드 위를 빛이 쓸고 지나감', run: ({ fx, b }) => { fx.sfx('sparkle'); return fx.glint(b.play); } },
  { group: 'v2 신규', v2only: true, id: 'n.confetti', label: '종이꽃가루', desc: 'burst kind: confetti', run: ({ fx, b }) => { fx.sfx('win'); return fx.burst(b.me, { kind: 'confetti', color: ['#ff5a4e', '#ffd76a', '#7ec8ff', '#8bc46a', '#c58bff'], n: 26, spread: 90 }); } },
  { group: 'v2 신규', v2only: true, id: 'n.coin', label: '동전', desc: 'burst kind: coin', run: ({ fx, b }) => { fx.sfx('coin'); return fx.burst(b.pot, { kind: 'coin', n: 10 }); } },
  { group: 'v2 신규', v2only: true, id: 'n.ember', label: '불씨', desc: 'burst kind: ember (위로 피어오름)', run: ({ fx, b }) => fx.burst(b.play, { kind: 'ember', color: ['#ff7a2f', '#ffb347', '#ffd76a'], n: 18, dur: 900 }) },
  { group: 'v2 신규', v2only: true, id: 'n.smoke', label: '연기', desc: 'burst kind: smoke', run: ({ fx, b }) => { fx.sfx('out'); return fx.burst(b.opp[1], { kind: 'smoke', n: 10 }); } },
  { group: 'v2 신규', v2only: true, id: 'n.star', label: '별', desc: 'burst kind: star', run: ({ fx, b }) => { fx.sfx('sparkle'); return fx.burst(b.myScore, { kind: 'star', color: ['#ffd76a', '#ffffff'], n: 10 }); } },

  // 3) 효과음 14종 (합성음)
  ...[['tap', '딸깍'], ['chip', '짤깍'], ['chips', '촤르륵'], ['card', '슥 (카드)'], ['deal', '척 (나눠 주기)'], ['slam', '탁!'], ['place', '톡 (타일)'], ['pick', '집기'], ['flip', '파락 (뒤집기)'], ['gain', '띠리링 (이득)'], ['bad', '손해'], ['out', '탈락'], ['win', '승리'], ['lose', '패배']]
    .map(([n, ko]) => ({ group: '효과음', id: 'snd.' + n, label: ko, desc: `fx.sfx('${n}')`, sound: true, run: ({ fx }) => { fx.sfx(n); } })),
  ...[['whoosh', '휙 (날아감)'], ['impact', '쿵! (강타)'], ['sparkle', '반짝'], ['rise', '차오름'], ['coin', '동전'], ['tick', '똑']]
    .map(([n, ko]) => ({ group: '효과음', v2only: true, id: 'snd.' + n, label: ko, desc: `fx.sfx('${n}') · v2 추가`, sound: true, run: ({ fx }) => { fx.sfx(n); } }))
];


// v2에서 같은 장면을 새 엔진의 조합으로 다시 짠 것 (4단계 '장면 묶음'의 미리보기)
const RUN2 = {
  's.deal': async ({ fx, b }) => {
    await Promise.all(b.hand.map((c, i) => fx.wait(i * 85).then(() => { fx.sfx('deal', { pitch: 0.9 + i * 0.05 }); return fx.fly({ from: b.deck, to: c, node: b.deck, flip: true, dur: 420, arc: 0.16, spin: -6 + i * 3, fromScale: 0.8 }); })));
    fx.sfx('tap'); return fx.ring(b.me, { color: '#fff2c4', power: 0.8 });
  },
  's.play': async ({ fx, b }) => {
    const c = pick(b.hand); fx.sfx('whoosh');
    await fx.fly({ from: c, to: b.play, node: c, dur: 440, arc: 0.24, spin: -8, land: false });
    fx.sfx('slam'); fx.buzz(18); return fx.slam(b.play, { power: 1.1 });
  },
  's.draw': async ({ fx, b }) => {
    const c = pick(b.hand); fx.sfx('pick');
    await fx.fly({ from: b.deck, to: c, node: b.deck, flip: true, dur: 460, arc: 0.2, spin: 8 });
    fx.sfx('flip'); return fx.glint(c);
  },
  's.chips': async ({ fx, b }) => {
    fx.sfx('chips');
    await fx.flyMany(5, { from: b.pot, to: b.myScore, node: '<span class="lchip"></span>', dur: 440, arc: 0.32 }, 55);
    fx.sfx('coin'); fx.burst(b.myScore, { kind: 'coin', n: 5, spread: 40 }); fx.float(b.myScore, '+5'); return bump(fx, b, 5);
  },
  's.gain': ({ fx, b }) => { fx.sfx('gain'); fx.buzz(15); fx.glow(b.myScore, '#ffd76a'); fx.float(b.myScore, '+4', { size: 28 }); fx.burst(b.myScore, { kind: 'star', color: ['#ffd76a', '#fff3b0'], n: 9 }); return bump(fx, b, 4); },
  's.loss': ({ fx, b }) => { fx.sfx('bad'); fx.buzz(30); fx.flash('#ff2a1a', 0.16); fx.float(b.myScore, '-2', { size: 26 }); fx.shake(b.myScore, 9); return bump(fx, b, -2); },
  's.hit': async ({ fx, b }) => {
    const t = pick(b.opp); fx.sfx('whoosh');
    await fx.fly({ from: b.play, to: t, node: b.play, dur: 340, arc: 0.12, scale: 0.75, hide: false, land: false, trail: '#ffb38a' });
    fx.sfx('impact'); fx.buzz(35);
    fx.ring(t, { color: '#ff5a4e', power: 1.3 }); fx.burst(t, { color: RED, n: 14, spread: 60 }); fx.flash('#ff2a1a', 0.2);
    await fx.hitstop(80);
    fx.shakeScreen(7); fx.float(t, '-3', { size: 30 }); return fx.shake(t, 11);
  },
  's.out': async ({ fx, b }) => {
    const t = b.opp[2]; fx.sfx('out'); fx.buzz(60);
    fx.flash('#ff2a1a', 0.3); fx.burst(t, { color: RED, n: 16, spread: 80 });
    await fx.hitstop(120);
    fx.shakeScreen(10, 450); fx.burst(t, { kind: 'smoke', n: 9, color: '#3a2f2a' });
    t.animate([{ filter: 'none' }, { filter: 'grayscale(1) brightness(.55)', offset: 0.3 }, { filter: 'grayscale(1) brightness(.55)', offset: 0.8 }, { filter: 'none' }], { duration: 1500 });
    return fx.shake(t, 12);
  },
  's.reveal': async ({ fx, b }) => {
    for (const [i, o] of b.opp.entries()) { fx.sfx('flip', { pitch: 0.9 + i * 0.12 }); fx.flip(o.querySelector('.lmini')); await fx.wait(260); }
    fx.sfx('sparkle'); return fx.ring(b.opp[1], { color: '#ffd76a', power: 2 });
  },
  's.place': async ({ fx, b }) => {
    fx.sfx('whoosh');
    await fx.fly({ from: b.deck, to: b.tile, node: '<div class="ltile"></div>', dur: 400, arc: 0.24, spin: 90, land: false });
    fx.sfx('place'); fx.buzz(12); return fx.slam(b.tile, { power: 0.8 });
  },
  's.win': async ({ fx, b }) => {
    fx.sfx('win'); fx.buzz([40, 60, 80]); fx.flash('#ffd76a', 0.28);
    fx.banner('승리!', { sub: 'VICTORY', hold: 900 });
    fx.glow(b.me, '#ffd76a'); fx.burst(b.me, { kind: 'confetti', color: ['#ff5a4e', '#ffd76a', '#7ec8ff', '#8bc46a', '#c58bff'], n: 30, spread: 110 });
    await fx.wait(250); return fx.burst(b.myScore, { color: GOLD, n: 18, spread: 90 });
  },
  's.lose': async ({ fx, b }) => {
    fx.sfx('lose'); fx.buzz(50);
    const board = b.me.parentNode;
    [...board.children].filter(c => !c.classList.contains('fx-layer')).forEach(c => c.animate([{ filter: 'none' }, { filter: 'grayscale(.9) brightness(.7)', offset: 0.25 }, { filter: 'grayscale(.9) brightness(.7)', offset: 0.8 }, { filter: 'none' }], { duration: 2200 }));
    fx.burst(b.me, { kind: 'smoke', n: 8, color: '#5a5a62' });
    return fx.banner('패배', { sub: 'DEFEAT', color: '#aab3c2', hold: 900 });
  }
};
SCENES.forEach(s => { if (RUN2[s.id]) s.run2 = RUN2[s.id]; });

const CSS = `
.g-fxlab{--lt:#24463a;--lt2:#15302a;position:sticky;top:0;z-index:5;margin:0 -4px 10px;border-radius:12px;padding:10px;color:#f3ead2;
  background:radial-gradient(120% 90% at 50% 40%,var(--lt),var(--lt2));box-shadow:0 6px 16px #0006,inset 0 0 0 2px #0003;font-family:var(--fk);user-select:none}
.g-fxlab .lrow{display:flex;justify-content:space-around;gap:6px}
.g-fxlab .lopp{display:flex;flex-direction:column;align-items:center;gap:3px;padding:6px 8px;border-radius:10px;background:#0003;min-width:78px}
.g-fxlab .lav{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;font:700 15px var(--fd);background:var(--c);color:#fff;box-shadow:0 2px 0 #0005}
.g-fxlab .lopp small{font-size:11px;opacity:.85}
.g-fxlab .lmini{width:20px;height:28px;border-radius:3px;background:linear-gradient(135deg,#8a2a2a,#4e1515);border:1.5px solid #e8d7a6;box-shadow:0 1px 0 #0006}
.g-fxlab .lmid{display:flex;align-items:center;justify-content:center;gap:16px;margin:12px 0}
.g-fxlab .lcard{width:54px;height:76px;border-radius:6px;display:grid;place-items:center;font:700 22px var(--fd);color:#2e2d29;
  background:linear-gradient(160deg,#fbf6e6,#e3d9bd);border:2px solid #fff8;box-shadow:0 3px 6px #0006}
.g-fxlab .lcard.back{background:repeating-linear-gradient(45deg,#7a2323 0 6px,#5c1919 6px 12px);border-color:#e8d7a6;color:transparent}
.g-fxlab .lplay{outline:2px dashed #ffffff40;outline-offset:4px}
.g-fxlab .lpot{width:54px;height:54px;border-radius:50%;display:grid;place-items:center;background:#0004;font:700 14px var(--fd)}
.g-fxlab .ltile{width:30px;height:30px;border-radius:4px;background:linear-gradient(135deg,#8bc46a,#4f8a3a);border:2px solid #e9f5d8;box-shadow:0 2px 3px #0006}
.g-fxlab .lchip{display:block;width:16px;height:16px;border-radius:50%;background:radial-gradient(circle at 35% 35%,#ffe9a0,#d9a520);border:2px solid #fff6;box-shadow:0 1px 2px #0007}
.g-fxlab .lme{display:flex;align-items:flex-end;justify-content:space-between;gap:8px;padding:6px;border-radius:10px;background:#0002}
.g-fxlab .lhand{display:flex;gap:4px}
.g-fxlab .lhand .lcard{width:44px;height:62px;font-size:18px}
.g-fxlab .lscore{min-width:54px;padding:6px 8px;border-radius:8px;background:#0005;text-align:center;font:700 20px var(--fd);color:#ffd76a}
.g-fxlab .lscore small{display:block;font:400 10px var(--fk);color:#f3ead2;opacity:.8}
.fxl-list .fxg{margin-bottom:12px}
.fxl-list .fxs{display:flex;align-items:center;gap:8px;padding:6px 0;border-bottom:1px dashed #00000020}
.fxl-list .fxs .grow small{display:block;color:var(--ink2);font-size:11px}
.fxl-list .fxs .weak.on{background:#b3261e;color:#fff}
.fxl-top{display:flex;flex-wrap:wrap;gap:6px;align-items:center;margin-bottom:8px}
.fxl-list .fxs.dim{opacity:.45}
.fxl-ctl summary{cursor:pointer;list-style:none}
.fxl-ctl summary::-webkit-details-marker{display:none}
.fxc input[type=range]{accent-color:#b8860b}
`;

// ---------- 연출 조절판 (시험장과 설정 화면이 같이 씀) ----------
export function fxControls(onChange = () => {}) {
  const re = () => { box.replaceWith(fxControls(onChange)); onChange(); };
  const lv = fxPrefs.level, spd = fxPrefs.speed;
  const seg = (label, items) => h('div', { class: 'row wrap fxc-row', style: 'gap:6px;align-items:center;margin:4px 0' }, h('small', { style: 'min-width:64px' }, label), ...items);
  const box = h('div', { class: 'fxc', id: 'fxControls' },
    seg('연출 세기', ['끔', '줄임', '보통', '화려'].map((t, i) => h('button', { class: 'btn small' + (lv === i ? ' on' : ''), 'data-lv': i, onclick: () => { fxPrefs.setVal('ba_fxlv', i); re(); } }, t))),
    seg('연출 속도', [['느긋', 0.8], ['보통', 1], ['빠름', 1.3]].map(([t, v]) => h('button', { class: 'btn small' + (Math.abs(spd - v) < 0.01 ? ' on' : ''), 'data-spd': v, onclick: () => { fxPrefs.setVal('ba_fxspd', v); re(); } }, t))),
    seg('화면 흔들림', [h('button', { class: 'btn small' + (fxPrefs.screenShake ? ' on' : ''), 'data-shake': '1', onclick: () => { fxPrefs.set('ba_shake', !fxPrefs.screenShake); re(); } }, fxPrefs.screenShake ? '켜짐' : '꺼짐')]),
    seg('효과음 음량', [h('input', { type: 'range', min: 0, max: 100, step: 5, id: 'sfxVol', value: Math.round(fxPrefs.volume * 100), style: 'flex:1;min-width:120px',
      onchange: e => { fxPrefs.setVal('ba_sfxvol', e.target.value); makeFx().sfx('chip'); } })]));
  return box;
}

// ---------- 화면 ----------
export async function fxLabView(app, root) {
  if (!document.getElementById('fxlab-css')) document.head.append(h('style', { id: 'fxlab-css' }, CSS));
  let ver = LS('ba_fxlab_ver') === 'v1' ? 'v1' : 'v2';
  const WK = ver === 'v2' ? 'ba_fxlab_weak_v2' : 'ba_fxlab_weak';
  const weak = new Set((LS(WK) || '').split(',').filter(Boolean));
  const saveWeak = () => setLS(WK, [...weak].join(','));

  // 가짜 게임판
  const opp = ['#c0504d', '#4f81bd', '#8064a2'].map((c, i) => h('div', { class: 'lopp', 'data-o': i },
    h('div', { class: 'lav', style: `--c:${c}` }, ['A', 'B', 'C'][i]), h('div', { class: 'lmini' }), h('small', {}, `상대 ${i + 1} · ${[7, 4, 9][i]}점`)));
  const deck = h('div', { class: 'lcard back', id: 'fxlDeck' }, '?');
  const play = h('div', { class: 'lcard lplay', id: 'fxlPlay' }, '7');
  const pot = h('div', { class: 'lpot', id: 'fxlPot' }, h('span', { class: 'lchip' }));
  const tile = h('div', { class: 'ltile', id: 'fxlTile' });
  const hand = [3, 5, 8, 2, 6].map((n, i) => h('div', { class: 'lcard', style: `transform:rotate(${(i - 2) * 4}deg) translateY(${Math.abs(i - 2) * 3}px)` }, String(n)));
  const myScore = h('div', { class: 'lscore', id: 'fxlScore' }, '12', h('small', {}, '내 점수'));
  const me = h('div', { class: 'lme', id: 'fxlMe' }, h('div', { class: 'lhand' }, ...hand), myScore);
  const board = h('div', { class: 'g-fxlab', id: 'fxlBoard' },
    h('div', { class: 'lrow' }, ...opp), h('div', { class: 'lmid' }, deck, play, pot, tile), me);
  const b = { opp, deck, play, pot, tile, hand, myScore, me };
  const fx = (ver === 'v2' ? makeFx : makeFx1)({ fast: app.fast }).scope(board);
  const ctx = { fx, b };
  const usable = s => ver === 'v2' || !s.v2only;

  let running = false;
  const run = async s => {
    if (!usable(s)) { toast('v2에서만 볼 수 있어요'); return; }
    try { await (ver === 'v2' && s.run2 ? s.run2 : s.run)(ctx); } catch (e) { console.error('fxlab', s.id, e); toast(`오류: ${s.label} — ${e.message}`); }
  };
  const runAll = async (list = SCENES.filter(s => !s.sound)) => {
    if (running) return; running = true; allBtn.textContent = '■ 재생 중';
    try { for (const s of list.filter(usable)) { if (!running) break; mark(s.id); await run(s); await new Promise(r => setTimeout(r, app.fast ? 0 : 450)); } }
    finally { running = false; allBtn.textContent = '▶ 전부 이어서'; mark(null); }
  };
  const mark = id => root.querySelectorAll('.fxs').forEach(r => r.style.background = r.dataset.s === id ? '#ffd76a40' : '');

  // 위쪽 조작줄
  const verBtn = v => h('button', { class: 'btn small' + (ver === v ? ' on' : ''), 'data-ver': v,
    onclick: () => { setLS('ba_fxlab_ver', v); app.render(); } }, v === 'v1' ? '예전 (v1)' : '새 엔진 (v2)');
  const allBtn = h('button', { class: 'btn small go', id: 'fxlAll', onclick: () => (running ? (running = false) : runAll()) }, '▶ 전부 이어서');
  const weakCount = h('small', { id: 'fxlWeakN' }, String(weak.size));
  const copyBtn = h('button', { class: 'btn small', id: 'fxlCopy', onclick: async () => {
    const txt = SCENES.filter(s => weak.has(s.id)).map(s => `- [${s.group}] ${s.label} (${s.id})`).join('\n') || '(표시 없음)';
    const set = ver === 'v2' ? ` · 세기 ${['끔', '줄임', '보통', '화려'][fxPrefs.level]} · 속도 ${fxPrefs.speed}` : '';
    const full = `연출 시험장 — 약하다고 표시한 것 ${weak.size}개 (${ver}${set})\n${txt}`;
    out.value = full;
    try { await navigator.clipboard.writeText(full); toast('복사했어요. Claude 대화창에 붙여 넣으세요'); } catch { out.hidden = false; }
  } }, '약함 목록 복사 ', weakCount);
  const clearBtn = h('button', { class: 'btn small', onclick: () => { weak.clear(); saveWeak(); app.render(); } }, '표시 지우기');
  const out = h('textarea', { id: 'fxlOut', hidden: true, readonly: true, style: 'width:100%;height:110px;margin-top:6px;font-size:12px' });

  const warn = [];
  if (LS('ba_fx') === '0') warn.push('움직임');
  if (!fxPrefs.sound) warn.push('효과음');
  const reduced = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  // 장면 버튼 (목록에서 자동 생성)
  const groups = [...new Set(SCENES.map(s => s.group))];
  const list = h('div', { class: 'fxl-list', id: 'fxlList' }, ...groups.map(g => h('div', { class: 'paper fxg', 'data-g': g, style: '--r:-.3deg' },
    h('div', { class: 'row', style: 'align-items:center;gap:6px;margin-bottom:4px' }, h('b', { class: 'grow' }, g, h('small', { class: 'muted' }, ` ${SCENES.filter(s => s.group === g).length}개`)),
      g !== '효과음' && SCENES.some(s => s.group === g && usable(s)) ? h('button', { class: 'btn small', onclick: () => runAll(SCENES.filter(s => s.group === g)) }, '이 묶음 이어서') : null),
    ...SCENES.filter(s => s.group === g).map(s => h('div', { class: 'fxs' + (usable(s) ? '' : ' dim'), 'data-s': s.id },
      h('button', { class: 'btn small go', 'data-run': s.id, disabled: !usable(s), onclick: () => { mark(s.id); run(s); } }, '▶'),
      h('div', { class: 'grow' }, s.label, h('small', {}, usable(s) ? s.desc : 'v2에서만')),
      h('button', { class: 'btn small weak' + (weak.has(s.id) ? ' on' : ''), 'data-weak': s.id, disabled: !usable(s), onclick: ev => {
        weak.has(s.id) ? weak.delete(s.id) : weak.add(s.id); saveWeak(); ev.currentTarget.classList.toggle('on', weak.has(s.id)); weakCount.textContent = String(weak.size);
      } }, '약함')))) ));

  const ctlWrap = h('details', { class: 'paper fxl-ctl', id: 'fxlCtl', open: ver === 'v2', style: '--r:.2deg;margin-bottom:8px' },
    h('summary', {}, h('b', {}, '연출 조절'), h('small', { class: 'muted' }, ' 세기·속도·흔들림·음량 (게임에도 그대로 적용)')),
    ver === 'v2' ? fxControls() : h('div', { class: 'muted' }, 'v1에는 조절 항목이 없어요. 위에서 "새 엔진 (v2)"를 고르세요.'));

  root.append(
    h('div', { class: 'row', style: 'align-items:center;gap:8px;margin:6px 0' },
      app.standalone ? null : h('button', { class: 'btn small', id: 'fxlBack', onclick: () => { location.hash = '#/settings'; } }, '← 설정'),
      h('h2', { style: 'margin:0', class: 'grow' }, 'FX Lab', h('small', {}, '연출 시험장'))),
    board,
    warn.length || reduced ? h('div', { class: 'banner', id: 'fxlWarn' }, [warn.length ? `설정에서 ${warn.join('·')}이(가) 꺼져 있어요. ` : '', reduced ? '폰의 "애니메이션 줄이기"가 켜져 있으면 움직임이 나오지 않아요.' : ''].join('')) : null,
    h('div', { class: 'fxl-top' }, verBtn('v1'), verBtn('v2'), allBtn, copyBtn, clearBtn), out,
    ctlWrap,
    h('div', { class: 'muted', style: 'margin-bottom:8px' }, ver === 'v2'
      ? '새 엔진입니다. 위 "예전 (v1)"과 번갈아 눌러 비교해 보세요. 아직 약한 것에 "약함"을 눌러 목록을 복사해 주세요(v1 표시와 따로 저장돼요).'
      : '예전 엔진입니다. "새 엔진 (v2)"를 눌러 같은 장면을 비교해 보세요.'),
    list);

  window.__fxlab = { scenes: SCENES, runAll, run, board, ver };   // 자동 테스트용
}
