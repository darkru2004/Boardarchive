// 장면 묶음 (연출 v2): 게임에서 자주 일어나는 순간을 효과 여러 개로 엮어 놓은 것. 어느 프로젝트에서든 그대로 쓴다.
//   import { makeFx } from './fx.js'; import { playScene } from './fxscenes.js';
//   const fx = makeFx().scope(boardEl);
//   await playScene(fx, 'hit', { play: cardEl, opp: [enemyEl] });
// t(대상 요소 묶음)에서 장면마다 필요한 것만 넘기면 된다. 빠진 것이 있으면 그 장면은 아무 일도 하지 않고 끝난다(오류 없음).
//   hand: [요소…] 내 손패   deck: 덱   play: 가운데 놓는 자리   me: 내 자리   score: 내 점수칸(글자만 든 요소)
//   opp: [요소…] 상대들   pot: 칩 더미   tile: 타일 놓는 자리   board: 판 전체(흔들림·패배 어둡게에 쓴다. 없으면 me의 부모)
//   chip / tileNode: 날려 보낼 조각의 HTML(없으면 기본 모양)
// o(옵션): amount(점수 증감·피해량), color, target(상대 중 누구를 칠지 번호)
const GOLD = ['#ffd76a', '#ffb347', '#fff3b0'], RED = ['#ff5a4e', '#ff8a5c', '#b3261e'];
const CHIP = '<span style="display:block;width:22px;height:22px;border-radius:50%;background:#d9b25a;border:2px solid #fff3b0;box-sizing:border-box"></span>';
const TILE = '<div style="width:46px;height:46px;border-radius:6px;background:#8a6a3a;border:2px solid #d9b25a;box-sizing:border-box"></div>';
const pick = a => a[Math.floor(Math.random() * a.length)];
const oppOf = (t, o) => (t.opp && t.opp.length ? t.opp[Math.min(o.target ?? Math.floor(Math.random() * t.opp.length), t.opp.length - 1)] : null);
const scoreNow = t => parseInt((t.score && t.score.textContent) || '0', 10) || 0;
const bump = (fx, t, d) => (t.score ? fx.countTo(t.score, Math.max(0, scoreNow(t) + d)) : null);
const boardOf = t => t.board || (t.me && t.me.parentNode);
const dim = (els, ms) => els.forEach(c => c.animate([{ filter: 'none' }, { filter: 'grayscale(.9) brightness(.7)', offset: 0.25 }, { filter: 'grayscale(.9) brightness(.7)', offset: 0.85 }, { filter: 'none' }], { duration: ms }));

export const SCENES = {
  // 손패를 덱에서 차례로 깐다
  async deal(fx, t) {
    if (!t.deck || !t.hand) return;
    await Promise.all(t.hand.map((c, i) => fx.wait(i * 85).then(() => { fx.sfx('deal', { pitch: 0.9 + i * 0.05 }); return fx.fly({ from: t.deck, to: c, node: t.deck, flip: true, dur: 420, arc: 0.16, spin: -6 + i * 3, fromScale: 0.8 }); })));
    fx.sfx('tap'); if (t.me) return fx.ring(t.me, { color: '#fff2c4', power: 0.8 });
  },
  // 손패 한 장을 가운데에 낸다
  async play(fx, t, o = {}) {
    const c = o.card || (t.hand && pick(t.hand)); if (!c || !t.play) return;
    fx.sfx('whoosh');
    await fx.fly({ from: c, to: t.play, node: c, dur: 440, arc: 0.24, spin: -8, land: false });
    fx.sfx('slam'); fx.buzz(18); return fx.slam(t.play, { power: 1.1 });
  },
  // 덱에서 한 장 뽑아 손패로
  async draw(fx, t, o = {}) {
    const c = o.card || (t.hand && pick(t.hand)); if (!c || !t.deck) return;
    fx.sfx('pick');
    await fx.fly({ from: t.deck, to: c, node: t.deck, flip: true, dur: 460, arc: 0.2, spin: 8 });
    fx.sfx('flip'); return fx.glint(c);
  },
  // 칩을 가져온다
  async chips(fx, t, o = {}) {
    if (!t.pot || !t.score) return; const n = o.amount || 5;
    fx.sfx('chips');
    await fx.flyMany(Math.min(n, 8), { from: t.pot, to: t.score, node: t.chip || CHIP, dur: 440, arc: 0.32 }, 55);
    fx.sfx('coin'); fx.burst(t.score, { kind: 'coin', n: 5, spread: 40 }); fx.float(t.score, '+' + n); return bump(fx, t, n);
  },
  gain(fx, t, o = {}) {
    if (!t.score) return; const n = o.amount || 4;
    fx.sfx('gain'); fx.buzz(15); fx.glow(t.score, '#ffd76a'); fx.float(t.score, '+' + n, { size: 28 });
    fx.burst(t.score, { kind: 'star', color: ['#ffd76a', '#fff3b0'], n: 10 }); return bump(fx, t, n);
  },
  loss(fx, t, o = {}) {
    if (!t.score) return; const n = o.amount || 2;
    fx.sfx('bad'); fx.buzz(30); fx.flash('#ff2a1a', 0.16); fx.float(t.score, '-' + n, { size: 26 }); fx.shake(t.score, 9); return bump(fx, t, -n);
  },
  // 가운데 카드가 상대에게 날아가 맞는다 (날아감 → 번쩍 → 잠깐 멈춤 → 화면 흔들림)
  async hit(fx, t, o = {}) {
    const e = oppOf(t, o); if (!e || !t.play) return; const n = o.amount || 3;
    fx.sfx('whoosh');
    await fx.fly({ from: t.play, to: e, node: t.play, dur: 340, arc: 0.12, scale: 0.75, hide: false, land: false, trail: '#ffb38a' });
    fx.sfx('impact'); fx.buzz(35);
    fx.ring(e, { color: '#ff5a4e', power: 1.3 }); fx.burst(e, { color: RED, n: 14, spread: 60 }); fx.flash('#ff2a1a', 0.2);
    await fx.hitstop(80);
    fx.shakeScreen(7); fx.float(e, '-' + n, { size: 30 }); return fx.shake(e, 11);
  },
  // 상대 탈락
  async out(fx, t, o = {}) {
    const e = oppOf(t, o); if (!e) return;
    fx.sfx('out'); fx.buzz(60); fx.flash('#ff2a1a', 0.3); fx.burst(e, { color: RED, n: 16, spread: 80 });
    await fx.hitstop(120);
    fx.shakeScreen(10, 450); fx.burst(e, { kind: 'smoke', n: 9, color: '#3a2f2a' });
    e.animate([{ filter: 'none' }, { filter: 'grayscale(1) brightness(.55)', offset: 0.3 }, { filter: 'grayscale(1) brightness(.55)', offset: 0.8 }, { filter: 'none' }], { duration: 1500 });
    return fx.shake(e, 12);
  },
  // 상대 카드를 차례로 뒤집어 공개
  async reveal(fx, t) {
    if (!t.opp || !t.opp.length) return;
    for (const [i, e] of t.opp.entries()) { fx.sfx('flip', { pitch: 0.9 + i * 0.12 }); fx.flip(e); await fx.wait(260); }
    fx.sfx('sparkle'); return fx.ring(t.opp[Math.floor(t.opp.length / 2)], { color: '#ffd76a', power: 2 });
  },
  // 타일을 판에 놓는다
  async place(fx, t) {
    if (!t.deck || !t.tile) return;
    fx.sfx('whoosh');
    await fx.fly({ from: t.deck, to: t.tile, node: t.tileNode || TILE, dur: 400, arc: 0.24, spin: 90, land: false });
    fx.sfx('place'); fx.buzz(12); return fx.slam(t.tile, { power: 0.8 });
  },
  async win(fx, t) {
    if (!t.me) return;
    fx.sfx('win'); fx.buzz([40, 60, 80]); fx.flash('#ffd76a', 0.28);
    fx.banner('승리!', { sub: 'VICTORY', hold: 900 });
    fx.glow(t.me, '#ffd76a'); fx.burst(t.me, { kind: 'confetti', color: ['#ff5a4e', '#ffd76a', '#7ec8ff', '#8bc46a', '#c58bff'], n: 30, spread: 110 });
    await fx.wait(250); return t.score ? fx.burst(t.score, { color: GOLD, n: 18, spread: 90 }) : null;
  },
  lose(fx, t) {
    if (!t.me) return;
    fx.sfx('lose'); fx.buzz(50);
    const board = boardOf(t); if (board) dim([...board.children].filter(c => !c.classList.contains('fx-layer')), 1600);
    fx.burst(t.me, { kind: 'smoke', n: 8, color: '#5a5a62' });
    return fx.banner('패배', { sub: 'DEFEAT', color: '#aab3c2', hold: 900 });
  },
  // 화면 연출 단품
  turn(fx, t, o = {}) { fx.sfx('rise'); return fx.banner(o.text || '내 턴', { sub: o.sub || 'YOUR TURN' }); },
  round(fx, t, o = {}) { fx.sfx('tick'); return fx.banner(o.text || '라운드', { sub: o.sub || 'ROUND', color: '#b9e3ff' }); },
  impact(fx) { fx.sfx('impact'); fx.buzz(40); return fx.shakeScreen(10, 420); }
};
export const SCENE_NAMES = Object.keys(SCENES);

// 이름으로 장면을 실행. 모르는 이름이면 false, 실행했으면 끝날 때까지 기다리는 Promise.
export async function playScene(fx, name, t = {}, o = {}) {
  const s = SCENES[name]; if (!s) return false;
  await s(fx, t, o); return true;
}
