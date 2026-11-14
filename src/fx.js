// 공통 이펙트 도구 (모든 게임 공용) — 움직임·반짝임·소리·진동
// 게임은 ctx.fx로 받는다. 화면 요소를 직접 바꾸지 않고, 위에 '유령' 복제본을 띄워 날려 보낸다.
// 그래서 게임의 draw()가 화면을 다시 그려도 연출이 끊기지 않는다.
//
// const fx = ctx.fx.scope(gameRootEl);   // 유령이 게임 CSS(.g-<id>)를 물려받도록 게임 루트 안에 띄움
// fx.fly({ from, to, node, dur, arc, spin, scale, delay })  → Promise (도착 시점)
// fx.flyMany(n, opts, gap)   여러 개를 촤르륵
// fx.pop(el) / fx.slam(el) / fx.shake(el) / fx.flip(el) / fx.glow(el, color)
// fx.float(el, text, { color })   숫자 튀어오름   fx.burst(el, { color, n })   불꽃
// fx.sfx('chip'|'chips'|'card'|'deal'|'slam'|'tap'|'gain'|'bad'|'win'|'lose'|'place'|'pick'|'flip'|'out')
// fx.buzz(ms)   폰 진동
// 설정(localStorage): ba_fx(움직임) · ba_sfx(소리) · ba_haptic(진동) — '0'이면 끔. 테스트(?fast=1)에서는 전부 꺼짐.

const LS = k => { try { return localStorage.getItem(k); } catch { return null; } };
export const fxPrefs = {
  get motion() { return LS('ba_fx') !== '0'; },
  get sound() { return LS('ba_sfx') !== '0'; },
  get haptic() { return LS('ba_haptic') !== '0'; },
  set(k, on) { try { localStorage.setItem(k, on ? '1' : '0'); } catch {} }
};

const wait = ms => new Promise(r => setTimeout(r, ms));
const rectOf = x => {
  if (!x) return null;
  const r = x.getBoundingClientRect ? x.getBoundingClientRect() : x;
  return { x: r.left ?? r.x, y: r.top ?? r.y, w: r.width ?? r.w ?? 0, h: r.height ?? r.h ?? 0,
    get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; } };
};

// ---------- 소리: 파일 없이 합성 (WebAudio) ----------
let AC = null, master = null, noiseBuf = null;
function audio() {
  if (AC) return AC;
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  AC = new C(); master = AC.createGain(); master.gain.value = 0.55; master.connect(AC.destination);
  noiseBuf = AC.createBuffer(1, AC.sampleRate * 0.5, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return AC;
}
if (typeof window !== 'undefined') {   // 폰은 첫 터치 이후에만 소리가 난다 → 첫 터치에 깨워 둔다
  const wake = () => { const a = audio(); if (a && a.state === 'suspended') a.resume(); };
  window.addEventListener('pointerdown', wake, { passive: true });
}
function tone(t0, { f = 440, f2 = null, dur = 0.12, type = 'sine', vol = 0.3, attack = 0.004 }) {
  const o = AC.createOscillator(), g = AC.createGain();
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g); g.connect(master); o.start(t0); o.stop(t0 + dur + 0.02);
}
function noise(t0, { dur = 0.08, vol = 0.3, type = 'bandpass', f = 2500, f2 = null, q = 1.2 }) {
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; fl.type = type; fl.frequency.setValueAtTime(f, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2, t0 + dur); fl.Q.value = q;
  g.gain.setValueAtTime(vol, t0); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); g.connect(master); s.start(t0); s.stop(t0 + dur + 0.02);
}
const SOUNDS = {
  tap: t => { noise(t, { dur: 0.03, vol: 0.25, f: 3500 }); },                                                       // 딸깍
  chip: t => { tone(t, { f: 2400, dur: 0.07, type: 'triangle', vol: 0.18 }); tone(t + 0.035, { f: 3100, dur: 0.06, type: 'triangle', vol: 0.12 }); noise(t, { dur: 0.025, vol: 0.2, f: 5000 }); },   // 짤그랑
  chips: t => { for (let i = 0; i < 6; i++) SOUNDS.chip(t + i * 0.045 + Math.random() * 0.015); },                // 촤르륵
  card: t => { noise(t, { dur: 0.11, vol: 0.28, type: 'highpass', f: 1200, f2: 5000, q: 0.7 }); },                 // 슥
  deal: t => { noise(t, { dur: 0.06, vol: 0.3, type: 'bandpass', f: 3000, f2: 1500 }); tone(t + 0.04, { f: 180, f2: 90, dur: 0.06, vol: 0.18 }); },   // 척
  slam: t => { tone(t, { f: 150, f2: 55, dur: 0.16, vol: 0.55 }); noise(t, { dur: 0.05, vol: 0.4, type: 'lowpass', f: 1800 }); },                 // 탁!
  place: t => { tone(t, { f: 220, f2: 110, dur: 0.1, vol: 0.4 }); noise(t, { dur: 0.04, vol: 0.3, f: 900 }); },                                   // 톡 (타일 놓기)
  pick: t => { tone(t, { f: 660, f2: 990, dur: 0.08, type: 'triangle', vol: 0.18 }); },                                                            // 집기
  flip: t => { noise(t, { dur: 0.05, vol: 0.25, f: 2200 }); noise(t + 0.06, { dur: 0.04, vol: 0.2, f: 3200 }); },                                // 파락
  gain: t => { [523, 659, 784].forEach((f, i) => tone(t + i * 0.06, { f, dur: 0.14, type: 'triangle', vol: 0.18 })); },                          // 띠리링
  bad: t => { tone(t, { f: 330, f2: 220, dur: 0.22, type: 'sawtooth', vol: 0.08 }); tone(t + 0.1, { f: 247, f2: 165, dur: 0.25, type: 'sawtooth', vol: 0.07 }); },
  out: t => { tone(t, { f: 200, f2: 60, dur: 0.35, type: 'square', vol: 0.1 }); noise(t, { dur: 0.15, vol: 0.3, type: 'lowpass', f: 600 }); },  // 탈락
  win: t => { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.09, { f, dur: 0.3, type: 'triangle', vol: 0.2 })); tone(t + 0.36, { f: 1319, dur: 0.5, type: 'sine', vol: 0.12 }); },
  lose: t => { [392, 330, 262].forEach((f, i) => tone(t + i * 0.13, { f, dur: 0.3, type: 'triangle', vol: 0.15 })); }
};

// ---------- 움직임 ----------
const CSS = `
.fx-layer{position:fixed;inset:0;pointer-events:none;z-index:9000;overflow:hidden}
.fx-ghost{position:fixed;left:0;top:0;margin:0;will-change:transform,opacity;pointer-events:none}
.fx-float{position:fixed;font:700 20px/1 var(--fd,system-ui);color:#ffd76a;text-shadow:0 2px 0 #0008,0 0 10px #0006;white-space:nowrap;pointer-events:none;transform:translate(-50%,-50%)}
.fx-spark{position:fixed;width:7px;height:7px;border-radius:50%;pointer-events:none;box-shadow:0 0 8px currentColor;background:currentColor}
`;
function ensureCss() {
  if (document.getElementById('fx-css')) return;
  const st = document.createElement('style'); st.id = 'fx-css'; st.textContent = CSS; document.head.append(st);
}

export function makeFx({ fast = false } = {}) {
  const off = () => fast || !fxPrefs.motion || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const anim = (el, frames, opts) => (off() || !el || !el.animate ? Promise.resolve() : el.animate(frames, { easing: 'cubic-bezier(.2,.8,.3,1)', ...opts }).finished.catch(() => {}));

  function build(scopeEl) {
    let layer = null;
    const getLayer = () => {
      ensureCss();
      const host = scopeEl && scopeEl.isConnected ? scopeEl : document.body;
      if (!layer || !layer.isConnected || layer.parentNode !== host) { layer = document.createElement('div'); layer.className = 'fx-layer'; host.append(layer); }
      return layer;
    };
    const api = {
      get on() { return !off(); },
      scope: el => build(el),

      // 유령을 from에서 to로 포물선 이동. node: 복제할 요소 / HTML 문자열 / 요소. 도착하면 사라진다.
      async fly({ from, to, node, size = null, dur = 430, arc = 0.22, spin = 0, scale = 1, fromScale = 1, delay = 0, fade = false, keep = 0 } = {}) {
        if (off()) return;
        const a = rectOf(from), b = rectOf(to); if (!a || !b) return;
        if (delay) await wait(delay);
        let g;
        if (typeof node === 'string') { g = document.createElement('div'); g.innerHTML = node; g = g.firstElementChild || g; }
        else if (node && node.cloneNode) g = node.isConnected ? node.cloneNode(true) : node;
        else { g = document.createElement('div'); }
        const cloned = !!(node && node.isConnected);
        g.classList.add('fx-ghost');
        getLayer().append(g);
        let src;
        if (size) { src = { w: size.w, h: size.h }; Object.assign(g.style, { width: size.w + 'px', height: size.h + 'px', boxSizing: 'border-box' }); }
        else if (cloned) { src = rectOf(node); Object.assign(g.style, { width: src.w + 'px', height: src.h + 'px', boxSizing: 'border-box' }); }
        else { const r = g.getBoundingClientRect(); src = { w: r.width || 20, h: r.height || 20 }; }   // 새로 만든 조각은 제 크기 그대로
        const x0 = a.cx - src.w / 2, y0 = a.cy - src.h / 2, x1 = b.cx - src.w / 2, y1 = b.cy - src.h / 2;
        const lift = Math.max(30, Math.hypot(x1 - x0, y1 - y0) * arc);
        const frames = [];
        for (let i = 0; i <= 10; i++) {
          const t = i / 10, x = x0 + (x1 - x0) * t, y = y0 + (y1 - y0) * t - Math.sin(Math.PI * t) * lift;
          const sc = fromScale + (scale - fromScale) * t + Math.sin(Math.PI * t) * 0.12;
          frames.push({ transform: `translate(${x}px,${y}px) rotate(${spin * t}deg) scale(${sc})`, opacity: fade && t > 0.75 ? 1 - (t - 0.75) * 4 : 1, offset: t });
        }
        await g.animate(frames, { duration: dur, easing: 'cubic-bezier(.35,.05,.25,1)', fill: 'forwards' }).finished.catch(() => {});
        if (keep) await wait(keep);
        g.remove();
      },
      // 여러 개를 시간차로 날린다 (칩 촤르륵). 마지막이 도착하면 끝난다.
      flyMany(n, opts, gap = 45) {
        const jitter = () => ({ x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 10 });
        return Promise.all(Array.from({ length: n }, (_, i) => {
          const a = rectOf(opts.from), j = jitter();
          return api.fly({ ...opts, from: a && { x: a.x + j.x, y: a.y + j.y, w: a.w, h: a.h }, delay: (opts.delay || 0) + i * gap, spin: (opts.spin || 0) + (Math.random() - 0.5) * 60 });
        }));
      },
      pop: (el, s = 1.22) => anim(el, [{ transform: 'scale(1)' }, { transform: `scale(${s})`, offset: 0.35 }, { transform: 'scale(.96)', offset: 0.7 }, { transform: 'scale(1)' }], { duration: 300 }),
      // 위에서 내려꽂히며 찌그러졌다 펴짐 (척!)
      slam: el => anim(el, [{ transform: 'translateY(-26px) scale(1.15)', opacity: 0.4 }, { transform: 'translateY(0) scale(1.08,.9)', opacity: 1, offset: 0.55 }, { transform: 'scale(.97,1.04)', offset: 0.78 }, { transform: 'none' }], { duration: 300, easing: 'cubic-bezier(.5,0,.75,0)' }),
      shake: (el, px = 7) => anim(el, [0, -px, px, -px * 0.7, px * 0.5, -px * 0.3, 0].map(x => ({ transform: `translateX(${x}px)` })), { duration: 360, easing: 'linear' }),
      flip: el => anim(el, [{ transform: 'perspective(600px) rotateY(90deg) scale(.9)', opacity: 0.3 }, { transform: 'perspective(600px) rotateY(-12deg) scale(1.04)', opacity: 1, offset: 0.65 }, { transform: 'none' }], { duration: 380 }),
      glow: (el, color = '#ffd76a') => anim(el, [{ boxShadow: `0 0 0 0 ${color}00` }, { boxShadow: `0 0 0 6px ${color}cc, 0 0 26px 6px ${color}88`, offset: 0.3 }, { boxShadow: `0 0 0 0 ${color}00` }], { duration: 700, easing: 'ease-out' }),
      // 숫자/글자가 튀어 올랐다 사라짐 (+5, -1 등)
      float(el, text, { color = '#ffd76a', size = 20, dy = -46, dur = 900 } = {}) {
        if (off()) return Promise.resolve(); const r = rectOf(el); if (!r) return Promise.resolve();
        const f = document.createElement('div'); f.className = 'fx-float'; f.textContent = text; Object.assign(f.style, { left: r.cx + 'px', top: r.cy + 'px', color, fontSize: size + 'px' });
        getLayer().append(f);
        return f.animate([{ transform: 'translate(-50%,-50%) scale(.5)', opacity: 0 }, { transform: 'translate(-50%,-90%) scale(1.25)', opacity: 1, offset: 0.2 }, { transform: `translate(-50%,calc(-50% + ${dy}px)) scale(1)`, opacity: 0 }], { duration: dur, easing: 'cubic-bezier(.2,.8,.3,1)' }).finished.catch(() => {}).then(() => f.remove());
      },
      // 불꽃 튀김
      burst(el, { color = '#ffd76a', n = 12, spread = 70, dur = 650 } = {}) {
        if (off()) return Promise.resolve(); const r = rectOf(el); if (!r) return Promise.resolve();
        const L = getLayer();
        return Promise.all(Array.from({ length: n }, (_, i) => {
          const p = document.createElement('div'); p.className = 'fx-spark'; p.style.color = Array.isArray(color) ? color[i % color.length] : color;
          Object.assign(p.style, { left: r.cx - 3 + 'px', top: r.cy - 3 + 'px' }); L.append(p);
          const ang = (i / n) * Math.PI * 2 + Math.random() * 0.4, d = spread * (0.6 + Math.random() * 0.6);
          return p.animate([{ transform: 'translate(0,0) scale(1.2)', opacity: 1 }, { transform: `translate(${Math.cos(ang) * d}px,${Math.sin(ang) * d + 14}px) scale(.2)`, opacity: 0 }], { duration: dur * (0.8 + Math.random() * 0.4), easing: 'cubic-bezier(.1,.7,.3,1)' }).finished.catch(() => {}).then(() => p.remove());
        }));
      },
      sfx(name) {
        if (fast || !fxPrefs.sound) return; const fn = SOUNDS[name]; if (!fn) return;
        try { const a = audio(); if (!a) return; if (a.state === 'suspended') a.resume(); fn(a.currentTime + 0.005); } catch {}
      },
      buzz(ms = 12) { if (fast || !fxPrefs.haptic) return; try { navigator.vibrate && navigator.vibrate(ms); } catch {} },
      wait: ms => (off() ? Promise.resolve() : wait(ms)),
      rect: rectOf,
      // 여러 요소를 감싸는 사각형 (예: 방금 놓은 타일 두 칸)
      union(els) {
        const rs = [...els].map(rectOf).filter(r => r && r.w); if (!rs.length) return null;
        const x = Math.min(...rs.map(r => r.x)), y = Math.min(...rs.map(r => r.y)), x2 = Math.max(...rs.map(r => r.x + r.w)), y2 = Math.max(...rs.map(r => r.y + r.h));
        return rectOf({ x, y, w: x2 - x, h: y2 - y });
      }
    };
    return api;
  }
  return build(null);
}

// 게임이 ctx.fx 없이 돌 때(자동 대전 등)를 위한 빈 도구
export const NOFX = (() => {
  const nop = () => Promise.resolve();
  const api = { on: false, union: () => null, fly: nop, flyMany: nop, pop: nop, slam: nop, shake: nop, flip: nop, glow: nop, float: nop, burst: nop, sfx() {}, buzz() {}, wait: nop, rect: () => null };
  api.scope = () => api; return api;
})();
