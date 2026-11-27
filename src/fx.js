// 공통 연출 엔진 v2 (모든 게임 공용) — 움직임 · 입자 · 화면 연출 · 소리 · 진동
// 게임은 ctx.fx로 받는다: const fx = ctx.fx.scope(게임루트)
// v1 호출(fly/flyMany/pop/slam/shake/flip/glow/float/burst/sfx/buzz/wait/rect/union)은 이름·옵션 그대로 받고 속만 새것이다.
// 그래서 게임 코드를 고치지 않아도 v2 움직임이 나온다.
//
// ── 새로 생긴 것 ──
// fx.fly({..., hide, trail, flip, land})   hide: 도착 자리를 날아가는 동안 숨김('auto' 기본) · trail: 잔상 색 또는 false · flip: 날면서 뒤집어 도착 자리 모습으로
// fx.burst(el, { kind: 'spark'|'confetti'|'coin'|'ember'|'smoke'|'star', color, n, spread })
// fx.dust(el) 먼지  · fx.ring(el, {color}) 충격파 고리 · fx.glint(el) 광택이 쓸고 지나감
// fx.shakeScreen(세기) 화면 흔들림 · fx.hitstop(ms) 잠깐 멈춤 · fx.flash(색, 세기) 화면 번쩍임
// fx.countTo(el, 숫자, {from}) 숫자 굴러 올라가기 · fx.banner('내 턴', {sub, color}) 가운데 띠
// fx.seq([함수, 대기ms, ...]) 순서 잇기 · fx.lock() 입력 잠금(누르면 건너뛰기) → 돌려받은 함수로 풀기 · fx.skip() 진행 중 연출 즉시 끝내기
// fx.level 0 끔 · 1 줄임 · 2 보통 · 3 화려 / fx.speed 속도 배율
//
// 설정(localStorage): ba_fx(움직임) ba_sfx(효과음) ba_haptic(진동) '0'이면 끔 · ba_fxlv(세기 0~3, 기본 3) · ba_fxspd(속도 0.8/1/1.3)
//                     ba_shake(화면 흔들림 '0'이면 끔) · ba_sfxvol(효과음 음량 0~100, 기본 80). 테스트(?fast=1)에서는 전부 꺼짐.

const LS = k => { try { return localStorage.getItem(k); } catch { return null; } };
export const fxPrefs = {
  get level() { const v = LS('ba_fxlv'); return v == null ? 3 : Math.max(0, Math.min(3, Math.round(+v) || 0)); },
  get motion() { return LS('ba_fx') !== '0' && this.level > 0; },
  get sound() { return LS('ba_sfx') !== '0'; },
  get haptic() { return LS('ba_haptic') !== '0'; },
  get speed() { const v = +LS('ba_fxspd'); return v > 0.3 && v < 3 ? v : 1; },
  get screenShake() { return LS('ba_shake') !== '0'; },
  get voice() { return LS('ba_voice') !== '0'; },
  get voiceVol() { const v = LS('ba_voicevol'); return v == null ? 0.9 : Math.max(0, Math.min(1, (+v || 0) / 100)); },
  get volume() { const v = LS('ba_sfxvol'); return v == null ? 0.8 : Math.max(0, Math.min(1, (+v || 0) / 100)); },
  set(k, on) { try { localStorage.setItem(k, on ? '1' : '0'); } catch {} },
  setVal(k, v) { try { localStorage.setItem(k, String(v)); } catch {} if (k === 'ba_sfxvol') applyVolume(); if (k === 'ba_voicevol' && SoundHook.voiceChanged) SoundHook.voiceChanged(); }
};

const sleep = ms => new Promise(r => setTimeout(r, ms));
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const rnd = (a, b) => a + Math.random() * (b - a);
const rectOf = x => {
  if (!x) return null;
  const r = x.getBoundingClientRect ? x.getBoundingClientRect() : x;
  return { x: r.left ?? r.x, y: r.top ?? r.y, w: r.width ?? r.w ?? 0, h: r.height ?? r.h ?? 0,
    get cx() { return this.x + this.w / 2; }, get cy() { return this.y + this.h / 2; } };
};
const isEl = x => !!(x && x.nodeType === 1);

// ---------- 곡선 ----------
const EASE = {
  out: t => 1 - (1 - t) ** 3,
  inOut: t => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  // 시작에 살짝 뒤로 당겼다가(준비) 끝에 살짝 지나쳤다 돌아옴(착지) — 카드가 "던져지는" 느낌
  throw: t => { const c1 = 0.9, c2 = c1 * 1.525; return t < 0.5 ? ((2 * t) ** 2 * ((c2 + 1) * 2 * t - c2)) / 2 : ((2 * t - 2) ** 2 * ((c2 + 1) * (t * 2 - 2) + c2) + 2) / 2; },
  spring: (t, z = 0.42, w = 16) => 1 - Math.exp(-z * w * t) * Math.cos(w * Math.sqrt(1 - z * z) * t)
};

// ---------- 소리: 파일 없이 합성 (WebAudio) ----------
// 바로 소리(dry) + 울림(reverb) 두 갈래 → 압축기 → 스피커. 재생할 때마다 음 높이를 살짝 바꿔 같은 소리 반복 느낌을 줄인다.
export const SoundHook = { play: null, say: null, voiceChanged: null };   // 소리 파일 재생기(src/sounds.js)가 채워 넣는다. 비어 있으면 합성음만.
let comp = null, AC = null, master = null, dry = null, verb = null, noiseBuf = null, PITCH = 1;
function audio() {
  if (AC) return AC;
  const C = window.AudioContext || window.webkitAudioContext; if (!C) return null;
  AC = new C();
  comp = AC.createDynamicsCompressor(); comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.002; comp.release.value = 0.15;
  master = AC.createGain(); master.connect(comp); comp.connect(AC.destination); applyVolume();
  dry = AC.createGain(); dry.connect(master);
  const conv = AC.createConvolver(), len = Math.floor(AC.sampleRate * 1.6), ir = AC.createBuffer(2, len, AC.sampleRate);
  for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.6; }
  conv.buffer = ir; verb = AC.createGain(); const vg = AC.createGain(); vg.gain.value = 0.55; verb.connect(conv); conv.connect(vg); vg.connect(master);
  noiseBuf = AC.createBuffer(1, AC.sampleRate, AC.sampleRate);
  const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return AC;
}
// 소리 파일 재생기가 같은 압축기·음량 경로를 쓰도록 내어 준다
export function audioBus() { const a = audio(); return a ? { AC: a, master, comp, dry, verb } : null; }
function applyVolume() { if (master) master.gain.value = 0.9 * fxPrefs.volume; }
if (typeof window !== 'undefined') {   // 폰은 첫 터치 이후에만 소리가 난다 → 첫 터치에 깨워 둔다
  const wake = () => { const a = audio(); if (a && a.state === 'suspended') a.resume(); };
  window.addEventListener('pointerdown', wake, { passive: true });
}
function out(g, rev) { g.connect(dry); if (rev) { const s = AC.createGain(); s.gain.value = rev; g.connect(s); s.connect(verb); } }
function tone(t0, { f = 440, f2 = null, dur = 0.12, type = 'sine', vol = 0.3, attack = 0.003, rev = 0, lp = 0 }) {
  const o = AC.createOscillator(), g = AC.createGain(); f *= PITCH; if (f2) f2 *= PITCH;
  o.type = type; o.frequency.setValueAtTime(f, t0); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  let n = o; if (lp) { const fl = AC.createBiquadFilter(); fl.type = 'lowpass'; fl.frequency.value = lp; o.connect(fl); n = fl; }
  n.connect(g); out(g, rev); o.start(t0); o.stop(t0 + dur + 0.03);
}
function noise(t0, { dur = 0.08, vol = 0.3, type = 'bandpass', f = 2500, f2 = null, q = 1.2, attack = 0.001, rev = 0 }) {
  const s = AC.createBufferSource(), fl = AC.createBiquadFilter(), g = AC.createGain();
  s.buffer = noiseBuf; s.playbackRate.value = 0.8 + Math.random() * 0.4;
  fl.type = type; fl.frequency.setValueAtTime(f * PITCH, t0); if (f2) fl.frequency.exponentialRampToValueAtTime(f2 * PITCH, t0 + dur); fl.Q.value = q;
  g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + attack); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  s.connect(fl); fl.connect(g); out(g, rev); s.start(t0, Math.random() * 0.5); s.stop(t0 + dur + 0.03);
}
const bell = (t, f, vol = 0.12, dur = 0.5, rev = 0.3) => { tone(t, { f, dur, vol, rev }); tone(t, { f: f * 2.76, dur: dur * 0.45, vol: vol * 0.35, rev }); tone(t, { f: f * 5.4, dur: dur * 0.2, vol: vol * 0.15, rev }); };
const SOUNDS = {
  tap: t => { noise(t, { dur: 0.02, vol: 0.4, f: 3800, q: 3 }); tone(t, { f: 1400, f2: 900, dur: 0.025, vol: 0.12 }); },                                  // 딸깍
  chip: t => { tone(t, { f: 2900, dur: 0.06, vol: 0.16 }); tone(t, { f: 4400, dur: 0.04, vol: 0.1 }); tone(t, { f: 6100, dur: 0.025, vol: 0.06 }); noise(t, { dur: 0.012, vol: 0.28, type: 'highpass', f: 6000 }); },   // 짤깍(사기 칩)
  chips: t => { for (let i = 0; i < 8; i++) { PITCH = rnd(0.9, 1.12); SOUNDS.chip(t + i * 0.034 + Math.random() * 0.02); } },                              // 촤르륵
  card: t => { noise(t, { dur: 0.14, vol: 0.34, f: 900, f2: 4200, q: 0.9, attack: 0.025 }); noise(t + 0.09, { dur: 0.04, vol: 0.12, type: 'highpass', f: 6000 }); },   // 슥
  deal: t => { noise(t, { dur: 0.05, vol: 0.38, f: 2600, f2: 1200 }); tone(t, { f: 160, f2: 70, dur: 0.07, vol: 0.26 }); },                                  // 척
  slam: t => { tone(t, { f: 140, f2: 42, dur: 0.3, vol: 0.75, rev: 0.15 }); tone(t, { f: 70, f2: 35, type: 'triangle', dur: 0.32, vol: 0.3 }); noise(t, { dur: 0.15, vol: 0.5, type: 'lowpass', f: 900, f2: 150, rev: 0.2 }); noise(t, { dur: 0.02, vol: 0.35, f: 3000, q: 1 }); },   // 탁!
  place: t => { tone(t, { f: 600, f2: 540, dur: 0.07, vol: 0.3 }); tone(t, { f: 1650, dur: 0.03, vol: 0.1 }); noise(t, { dur: 0.025, vol: 0.3, f: 1200, q: 2 }); tone(t, { f: 150, f2: 90, dur: 0.06, vol: 0.2 }); },   // 톡(나무 타일)
  pick: t => { tone(t, { f: 620, f2: 1250, dur: 0.09, type: 'triangle', vol: 0.16 }); noise(t, { dur: 0.015, vol: 0.15, type: 'highpass', f: 5000 }); tone(t + 0.06, { f: 1250, dur: 0.14, vol: 0.06, rev: 0.25 }); },
  flip: t => { noise(t, { dur: 0.035, vol: 0.3, f: 1800, q: 1.5 }); noise(t + 0.05, { dur: 0.03, vol: 0.26, f: 3600, q: 1.5 }); tone(t + 0.05, { f: 300, f2: 180, dur: 0.04, vol: 0.1 }); },   // 파락
  gain: t => { [784, 988, 1175, 1568].forEach((f, i) => bell(t + i * 0.055, f, 0.13, 0.45, 0.35)); noise(t + 0.05, { dur: 0.3, vol: 0.05, type: 'highpass', f: 7000, attack: 0.06 }); },   // 띠리링
  bad: t => { tone(t, { f: 300, f2: 190, dur: 0.3, type: 'sawtooth', vol: 0.1, lp: 1400, rev: 0.2 }); tone(t + 0.02, { f: 150, f2: 95, dur: 0.32, type: 'square', vol: 0.07, lp: 900 }); noise(t, { dur: 0.12, vol: 0.18, type: 'lowpass', f: 400 }); },
  out: t => { tone(t, { f: 220, f2: 40, dur: 0.6, vol: 0.55, rev: 0.35 }); noise(t, { dur: 0.55, vol: 0.38, type: 'lowpass', f: 1200, f2: 90, rev: 0.4 }); tone(t, { f: 110, f2: 52, dur: 0.55, type: 'sawtooth', vol: 0.09, lp: 600 }); },   // 탈락
  win: t => { [523, 659, 784, 1047].forEach((f, i) => tone(t + i * 0.08, { f, dur: 0.24, type: 'triangle', vol: 0.16, rev: 0.3 }));
    [523, 659, 784, 1047].forEach(f => tone(t + 0.34, { f, dur: 1.2, vol: 0.07, attack: 0.03, rev: 0.5 }));
    [2093, 2637, 3136, 4186].forEach((f, i) => bell(t + 0.36 + i * 0.05, f, 0.05, 0.6, 0.5)); noise(t + 0.34, { dur: 0.8, vol: 0.05, type: 'highpass', f: 8000, attack: 0.1, rev: 0.4 }); },
  lose: t => { [392, 370, 330, 262].forEach((f, i) => tone(t + i * 0.16, { f, dur: 0.38, type: 'triangle', vol: 0.12, lp: 2000, rev: 0.4 })); tone(t + 0.48, { f: 131, dur: 1.1, vol: 0.12, attack: 0.08, rev: 0.4 }); },
  // v2 추가
  whoosh: t => { noise(t, { dur: 0.26, vol: 0.28, f: 400, f2: 2600, q: 0.8, attack: 0.12 }); },
  impact: t => { SOUNDS.slam(t); noise(t, { dur: 0.05, vol: 0.4, type: 'highpass', f: 2500 }); tone(t, { f: 55, f2: 30, dur: 0.5, vol: 0.35, rev: 0.3 }); },
  sparkle: t => { for (let i = 0; i < 5; i++) bell(t + i * 0.045, rnd(1800, 3600), 0.05, 0.4, 0.5); },
  rise: t => { tone(t, { f: 180, f2: 900, dur: 0.45, type: 'sawtooth', vol: 0.07, lp: 2400, attack: 0.2, rev: 0.3 }); noise(t, { dur: 0.45, vol: 0.12, f: 600, f2: 4000, attack: 0.3 }); },
  coin: t => { bell(t, 1976, 0.1, 0.35, 0.2); bell(t + 0.07, 2637, 0.1, 0.5, 0.3); },
  tick: t => { noise(t, { dur: 0.01, vol: 0.25, type: 'highpass', f: 4000 }); tone(t, { f: 2200, dur: 0.02, vol: 0.06 }); }
};

// ---------- 화면에 띄우는 것들 ----------
const CSS = `
.fx-layer{position:fixed;inset:0;pointer-events:none;z-index:9000;overflow:hidden}
.fx-canvas{position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none}
.fx-ghost{position:fixed;left:0;top:0;margin:0;will-change:transform,opacity,filter;pointer-events:none;backface-visibility:hidden;transform-origin:50% 50%}
.fx-float{position:fixed;font:800 22px/1 var(--fd,system-ui);color:#ffd76a;white-space:nowrap;pointer-events:none;transform:translate(-50%,-50%);
  -webkit-text-stroke:1.2px #0009;paint-order:stroke fill;text-shadow:0 3px 0 #0007,0 0 14px currentColor}
.fx-flash{position:absolute;inset:0;pointer-events:none;mix-blend-mode:screen}
.fx-glint{position:fixed;overflow:hidden;pointer-events:none;border-radius:6px}
.fx-glint i{position:absolute;top:-20%;bottom:-20%;width:45%;left:0;background:linear-gradient(100deg,#fff0 0%,#fff8 45%,#fffd 50%,#fff8 55%,#fff0 100%);mix-blend-mode:overlay}
.fx-banner{position:fixed;display:flex;flex-direction:column;align-items:center;justify-content:center;pointer-events:none;
  background:linear-gradient(90deg,#0000,#000c 18%,#000c 82%,#0000);color:#ffe9a8;text-align:center}
.fx-banner b{font:800 34px/1.05 var(--fd,system-ui);letter-spacing:.04em;text-shadow:0 0 18px currentColor,0 3px 0 #000}
.fx-banner small{font:500 13px var(--fk,system-ui);color:#f3ead2;opacity:.9;margin-top:4px;letter-spacing:.2em}
.fx-lock{position:absolute;inset:0;pointer-events:auto;background:transparent}
`;
function ensureCss() {
  if (document.getElementById('fx-css')) return;
  const st = document.createElement('style'); st.id = 'fx-css'; st.textContent = CSS; document.head.append(st);
}

// ---------- 입자 (캔버스 한 장) ----------
const SYSTEMS = new Set();
let rafId = 0, lastT = 0, frozenUntil = 0;
const sprites = new Map();
function glowSprite(color) {   // 색마다 빛나는 원 그림을 한 번만 만들어 재사용
  if (sprites.has(color)) return sprites.get(color);
  const c = document.createElement('canvas'); c.width = c.height = 64; const g = c.getContext('2d');
  const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, '#ffffff'); gr.addColorStop(0.18, color); gr.addColorStop(0.5, color + '55'); gr.addColorStop(1, color + '00');
  g.fillStyle = gr; g.fillRect(0, 0, 64, 64); sprites.set(color, c); return c;
}
const hex = c => { if (/^#[0-9a-f]{6}$/i.test(c)) return c; if (/^#[0-9a-f]{3}$/i.test(c)) return '#' + [...c.slice(1)].map(x => x + x).join(''); return '#ffd76a'; };
function makeSystem(layer) {
  const cv = document.createElement('canvas'); cv.className = 'fx-canvas'; layer.prepend(cv);
  const sys = { cv, ctx: cv.getContext('2d'), parts: [], layer };
  SYSTEMS.add(sys); return sys;
}
function tick(now) {
  rafId = 0;
  const dt = Math.min(0.05, (now - (lastT || now)) / 1000); lastT = now;
  const frozen = now < frozenUntil;
  let alive = 0;
  for (const s of SYSTEMS) {
    if (!s.cv.isConnected) { SYSTEMS.delete(s); continue; }
    const r = s.layer.getBoundingClientRect(), dpr = Math.min(3, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (s.cv.width !== W || s.cv.height !== H) { s.cv.width = W; s.cv.height = H; }
    const g = s.ctx; g.setTransform(dpr, 0, 0, dpr, -r.left * dpr, -r.top * dpr); g.clearRect(r.left, r.top, r.width, r.height);
    s.parts = s.parts.filter(p => p.age < p.life);
    for (const p of s.parts) {
      if (!frozen) {
        p.age += dt; p.vx += p.ax * dt; p.vy += p.ay * dt; const k = Math.exp(-p.drag * dt); p.vx *= k; p.vy *= k;
        p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      }
      const u = clamp(p.age / p.life, 0, 1), a = p.alpha * (p.fadeIn ? Math.min(1, u * 6) : 1) * (1 - u) ** (p.fadePow || 1.4);
      const size = p.size + (p.size2 - p.size) * u;
      if (a <= 0.005 || size <= 0) continue;
      g.globalAlpha = a; g.globalCompositeOperation = p.add ? 'lighter' : 'source-over';
      if (p.type === 'dot') { const sp = glowSprite(p.color); g.drawImage(sp, p.x - size, p.y - size, size * 2, size * 2); }
      else if (p.type === 'spark') {   // 진행 방향으로 늘어진 불티
        const sp = Math.hypot(p.vx, p.vy), len = clamp(sp * 0.045, 2, 26), nx = p.vx / (sp || 1), ny = p.vy / (sp || 1);
        g.strokeStyle = p.color; g.lineWidth = size; g.lineCap = 'round'; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - nx * len, p.y - ny * len); g.stroke();
        g.globalAlpha = a * 0.9; g.strokeStyle = '#fff'; g.lineWidth = size * 0.45; g.beginPath(); g.moveTo(p.x, p.y); g.lineTo(p.x - nx * len * 0.5, p.y - ny * len * 0.5); g.stroke();
      } else if (p.type === 'star') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.fillStyle = p.color; g.beginPath();
        for (let i = 0; i < 8; i++) { const rr = i % 2 ? size * 0.28 : size; const an = (i / 8) * Math.PI * 2; g.lineTo(Math.cos(an) * rr, Math.sin(an) * rr); }
        g.closePath(); g.fill(); g.restore();
      } else if (p.type === 'confetti') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(1, Math.cos(p.age * p.flipRate)); g.fillStyle = p.color; g.fillRect(-size, -size * 0.55, size * 2, size * 1.1); g.restore();
      } else if (p.type === 'coin') {
        g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.scale(Math.cos(p.age * p.flipRate), 1);
        g.fillStyle = '#b8860b'; g.beginPath(); g.arc(0, 0, size, 0, Math.PI * 2); g.fill(); g.fillStyle = p.color; g.beginPath(); g.arc(0, 0, size * 0.78, 0, Math.PI * 2); g.fill(); g.restore();
      } else if (p.type === 'smoke') {
        const gr = g.createRadialGradient(p.x, p.y, 0, p.x, p.y, size); gr.addColorStop(0, p.color); gr.addColorStop(1, p.color + '00');
        g.fillStyle = gr; g.beginPath(); g.arc(p.x, p.y, size, 0, Math.PI * 2); g.fill();
      } else if (p.type === 'ring') {
        g.strokeStyle = p.color; g.lineWidth = Math.max(0.5, p.width * (1 - u)); g.beginPath(); g.arc(p.x, p.y, size, 0, Math.PI * 2); g.stroke();
      } else if (p.type === 'flare') {   // 가운데 번쩍
        const sp = glowSprite(p.color); g.drawImage(sp, p.x - size, p.y - size, size * 2, size * 2);
      }
    }
    g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    alive += s.parts.length;
  }
  if (alive) rafId = requestAnimationFrame(tick); else lastT = 0;
}
const kick = () => { if (!rafId) rafId = requestAnimationFrame(tick); };
const P = o => Object.assign({ x: 0, y: 0, vx: 0, vy: 0, ax: 0, ay: 0, drag: 2, life: 0.6, age: 0, size: 4, size2: 0, color: '#ffd76a', type: 'dot', rot: 0, vr: 0, alpha: 1, add: true, flipRate: 10 }, o);

// ---------- 도착 자리 숨김 (여러 비행이 겹쳐도 안전하게 숫자로 센다) ----------
const HIDDEN = new WeakMap(), CLIPS = new WeakMap();
function hideEl(el) { const s = HIDDEN.get(el); if (s) s.n++; else { HIDDEN.set(el, { n: 1, v: el.style.visibility }); el.style.visibility = 'hidden'; } }
function showEl(el) { const s = HIDDEN.get(el); if (!s) return; if (--s.n <= 0) { el.style.visibility = s.v; HIDDEN.delete(el); } }

// ---------- 엔진 ----------
export function makeFx({ fast = false, game = null } = {}) {
  const reduced = () => typeof window !== 'undefined' && window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const off = () => fast || !fxPrefs.motion || reduced();
  const LV = () => (off() ? 0 : fxPrefs.level);
  const D = ms => ms / fxPrefs.speed;
  const RUNNING = new Set();
  const track = a => { RUNNING.add(a); a.finished.catch(() => {}).then(() => RUNNING.delete(a)); return a; };
  // 요소에 움직임을 더한다(composite add: 게임이 원래 준 기울기·위치 위에 얹힘)
  const anim = (el, frames, opts = {}) => {
    if (off() || !el || !el.animate) return Promise.resolve();
    let a; try { a = el.animate(frames, { composite: 'add', ...opts, duration: D(opts.duration || 300) }); } catch { a = el.animate(frames, { ...opts, duration: D(opts.duration || 300) }); }
    return track(a).finished.catch(() => {});
  };
  const springFrames = (fn, n = 24) => Array.from({ length: n + 1 }, (_, i) => ({ ...fn(i / n), offset: i / n }));

  function build(scopeEl) {
    let layer = null, sys = null;
    const getLayer = () => {
      ensureCss();
      const host = scopeEl && scopeEl.isConnected ? scopeEl : document.body;
      if (!layer || !layer.isConnected || layer.parentNode !== host) { layer = document.createElement('div'); layer.className = 'fx-layer'; host.append(layer); sys = null; }
      return layer;
    };
    const parts = () => { getLayer(); if (!sys || !sys.cv.isConnected) sys = makeSystem(layer); return sys; };
    const emit = list => { if (!list.length) return; const s = parts(); s.parts.push(...list); kick(); };
    const colors = (c, def) => (Array.isArray(c) ? c : c ? [c] : def).map(hex);
    const lifeWait = sec => sleep(D(sec * 1000));

    const api = {
      get on() { return !off(); },
      get level() { return LV(); },
      get speed() { return fxPrefs.speed; },
      scope: el => build(el),

      // ── 날리기 v2 ──
      async fly({ from, to, node, size = null, dur = 430, arc = 0.22, spin = 0, scale = 1, fromScale = 1, delay = 0, fade = false, keep = 0, hide = 'auto', trail, flip = false, land = true } = {}) {
        if (off()) return;
        const a = rectOf(from), b = rectOf(to); if (!a || !b) return;
        if (delay) await sleep(D(delay));
        const lv = LV();
        const mk = n => {
          let g;
          if (typeof n === 'string') { const d = document.createElement('div'); d.innerHTML = n; g = d.firstElementChild || d; }
          else if (n && n.cloneNode) g = n.isConnected ? n.cloneNode(true) : n;
          else g = document.createElement('div');
          g.classList.add('fx-ghost'); g.style.visibility = 'visible'; getLayer().append(g); return g;
        };
        const g = mk(node), cloned = !!(node && node.isConnected);
        let src;
        if (size) { src = { w: size.w, h: size.h }; Object.assign(g.style, { width: size.w + 'px', height: size.h + 'px', boxSizing: 'border-box' }); }
        else if (cloned) { src = rectOf(node); Object.assign(g.style, { width: src.w + 'px', height: src.h + 'px', boxSizing: 'border-box' }); }
        else { const r = g.getBoundingClientRect(); src = { w: r.width || 20, h: r.height || 20 }; }
        // 날면서 뒤집기: 도착 자리의 모습(앞면)을 하나 더 만들어 가운데에서 바꿔 낀다
        let face = null;
        if (flip && isEl(to)) { face = mk(to); Object.assign(face.style, { width: src.w + 'px', height: src.h + 'px', boxSizing: 'border-box' }); }
        // 도착 자리 숨김: 같은 크기쯤의 자리로 날아가는 경우(카드가 자리에 내려앉는 경우)만
        const sw = src.w * scale, sh = src.h * scale;
        const hideTo = hide === true || (hide === 'auto' && isEl(to) && !fade && b.w / sw > 0.7 && b.w / sw < 1.45 && b.h / sh > 0.7 && b.h / sh < 1.45);
        if (hideTo) hideEl(to);
        const x0 = a.cx - src.w / 2, y0 = a.cy - src.h / 2, x1 = b.cx - src.w / 2, y1 = b.cy - src.h / 2;
        const dist = Math.hypot(x1 - x0, y1 - y0), lift = Math.max(26, dist * arc);
        const ease = lv >= 2 ? EASE.throw : EASE.inOut;
        const pos = t => { const p = ease(t), h = Math.sin(Math.PI * clamp(p, 0, 1)); return { x: x0 + (x1 - x0) * p, y: y0 + (y1 - y0) * p - h * lift, h, p }; };
        const N = 28, frames = [], fframes = [];
        let prev = pos(0);
        for (let i = 0; i <= N; i++) {
          const t = i / N, q = pos(t), vx = (q.x - prev.x) * N / Math.max(1, dist) ; prev = q;
          const tilt = lv >= 2 ? clamp(vx * 9, -13, 13) * q.h : 0;
          const lift3d = lv >= 2 ? 1 + 0.16 * q.h : 1 + 0.08 * q.h;
          let sx = (fromScale + (scale - fromScale) * clamp(q.p, 0, 1)) * lift3d, sy = sx;
          if (lv >= 2 && t > 0.9) { const k = (t - 0.9) / 0.1; sx *= 1 + 0.05 * Math.sin(Math.PI * k); sy *= 1 - 0.06 * Math.sin(Math.PI * k); }   // 착지 눌림
          const fl = flip ? Math.abs(Math.cos(Math.PI * t)) : 1;
          const tr = `translate(${q.x}px,${q.y}px) rotate(${spin * clamp(q.p, 0, 1) + tilt}deg) scale(${sx * Math.max(0.02, fl)},${sy})`;
          const op = fade && t > 0.75 ? 1 - (t - 0.75) * 4 : 1;
          const sh = lv >= 2 ? `drop-shadow(0 ${4 + 20 * q.h}px ${5 + 14 * q.h}px rgba(0,0,0,${0.32 + 0.18 * q.h}))` : 'none';
          frames.push({ transform: tr, opacity: face && t > 0.5 ? 0 : op, filter: sh, offset: t });
          if (face) fframes.push({ transform: tr, opacity: t > 0.5 ? op : 0, filter: sh, offset: t });
        }
        const T = D(dur);
        const runs = [track(g.animate(frames, { duration: T, easing: 'linear', fill: 'forwards' }))];
        if (face) runs.push(track(face.animate(fframes, { duration: T, easing: 'linear', fill: 'forwards' })));
        // 잔상: 지나온 길에 빛 알갱이를 흘린다
        const tc = trail === false || lv < 3 ? null : hex(trail || '#fff2c4');
        if (tc) {
          const t0 = performance.now(), base = Math.max(3, Math.min(src.w, src.h) * scale * 0.16);
          const step = () => {
            if (!g.isConnected) return; const t = (performance.now() - t0) / T; if (t >= 0.96) return;
            if (performance.now() >= frozenUntil) {
              const q = pos(clamp(t, 0, 1)), cx = q.x + src.w / 2, cy = q.y + src.h / 2;
              emit([P({ x: cx + rnd(-4, 4), y: cy + rnd(-4, 4), size: base * (0.9 + q.h), size2: 0, life: 0.32, alpha: 0.55, color: tc, drag: 4 })]);
            }
            requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
        try { await Promise.all(runs.map(r => r.finished)); } catch {}
        if (keep) await sleep(D(keep));
        g.remove(); if (face) face.remove();
        if (hideTo) showEl(to);
        // 도착: 자리가 살짝 눌렸다 펴지고, 화려 단계에서는 먼지가 인다
        if (land && isEl(to) && !fade) {
          anim(to, [{ transform: 'scale(1.06,.93)' }, { transform: 'scale(.98,1.02)', offset: 0.5 }, { transform: 'scale(1,1)' }], { duration: 170, easing: 'ease-out' });
          if (lv >= 3 && hideTo) api.dust(to, { n: 5, power: 0.6 });
        }
      },
      // 여러 개를 시간차로 (칩 촤르륵). 더미로 모이는 것이라 도착 자리는 숨기지 않는다.
      flyMany(n, opts, gap = 45) {
        const jitter = () => ({ x: (Math.random() - 0.5) * 14, y: (Math.random() - 0.5) * 10 });
        return Promise.all(Array.from({ length: n }, (_, i) => {
          const a = rectOf(opts.from), j = jitter();
          return api.fly({ hide: false, land: i === n - 1, ...opts, from: a && { x: a.x + j.x, y: a.y + j.y, w: a.w, h: a.h }, delay: (opts.delay || 0) + i * gap, spin: (opts.spin || 0) + (Math.random() - 0.5) * 60, trail: i % 2 ? false : opts.trail });
        }));
      },

      // ── 요소 연출 ──
      pop(el, s = 1.22) {   // 스프링처럼 통통: 커졌다 → 살짝 작아졌다 → 제자리
        const k = s - 1;
        return anim(el, [{ transform: 'scale(1)' }, { transform: `scale(${1 + k})`, offset: 0.18 }, { transform: `scale(${1 - k * 0.3})`, offset: 0.42 }, { transform: `scale(${1 + k * 0.15})`, offset: 0.64 }, { transform: `scale(${1 - k * 0.05})`, offset: 0.82 }, { transform: 'scale(1)' }], { duration: 460, easing: 'ease-in-out' });
      },
      slam(el, { power = 1 } = {}) {   // 위에서 내려꽂혀 찌그러졌다 펴지고, 먼지·고리·화면 진동
        if (off() || !el) return Promise.resolve();
        const lv = LV(), rot = rnd(-3, 3) * power;
        const p = anim(el, [
          { transform: `translateY(${-34 * power}px) scale(${1 + 0.2 * power}) rotate(${rot}deg)`, offset: 0 },
          { transform: `translateY(0) scale(${1 + 0.1 * power},${1 - 0.14 * power}) rotate(0deg)`, offset: 0.42 },
          { transform: `scale(${1 - 0.04 * power},${1 + 0.05 * power})`, offset: 0.66 },
          { transform: 'scale(1.01,.995)', offset: 0.84 }, { transform: 'scale(1)', offset: 1 }
        ], { duration: 340, easing: 'cubic-bezier(.55,0,.6,1)' });
        setTimeout(() => {
          if (off()) return;
          if (lv >= 2) { api.dust(el, { power }); api.ring(el, { color: '#ffffff', power: 0.7 * power }); }
          if (lv >= 3) api.shakeScreen(2.5 * power, 160);
        }, D(340 * 0.42));
        return p;
      },
      shake(el, px = 7) {   // 감쇠 흔들림 + 붉은 빛
        if (off() || !el) return Promise.resolve();
        const fr = springFrames(t => { const d = Math.exp(-4.2 * t), w = Math.sin(t * Math.PI * 9); return { transform: `translate(${w * px * d}px,${Math.sin(t * Math.PI * 13) * px * 0.35 * d}px) rotate(${w * px * 0.25 * d}deg)` }; }, 30);
        if (LV() >= 2) anim(el, [{ filter: 'drop-shadow(0 0 0 #ff3b2f00) brightness(1)' }, { filter: 'drop-shadow(0 0 12px #ff3b2fee) brightness(1.35)', offset: 0.15 }, { filter: 'drop-shadow(0 0 0 #ff3b2f00) brightness(1)' }], { duration: 420, composite: 'replace' });
        return anim(el, fr, { duration: 440, easing: 'linear' });
      },
      flip(el) {   // 3D로 들렸다 뒤집혀 내려앉음 + 광택
        if (off() || !el) return Promise.resolve();
        const p = anim(el, [
          { transform: 'perspective(700px) translateY(0) rotateY(90deg) scale(.92)', offset: 0 },
          { transform: 'perspective(700px) translateY(-12px) rotateY(-14deg) scale(1.12)', offset: 0.55 },
          { transform: 'perspective(700px) translateY(0) rotateY(5deg) scale(.98)', offset: 0.8 },
          { transform: 'perspective(700px) rotateY(0) scale(1)', offset: 1 }
        ], { duration: 480, easing: 'cubic-bezier(.2,.7,.3,1)' });
        if (LV() >= 2) setTimeout(() => api.glint(el), D(260));
        return p;
      },
      glow(el, color = '#ffd76a') {   // 두 번 맥박치는 테두리 빛 + 바깥 고리
        if (off() || !el) return Promise.resolve();
        const c = hex(color);
        if (LV() >= 2) api.ring(el, { color: c, power: 1.2 });
        return anim(el, [
          { boxShadow: `0 0 0 0 ${c}00` }, { boxShadow: `0 0 0 5px ${c}dd, 0 0 30px 8px ${c}99`, offset: 0.2 },
          { boxShadow: `0 0 0 2px ${c}66, 0 0 12px 2px ${c}44`, offset: 0.45 }, { boxShadow: `0 0 0 5px ${c}cc, 0 0 26px 6px ${c}88`, offset: 0.65 }, { boxShadow: `0 0 0 0 ${c}00` }
        ], { duration: 900, easing: 'ease-out', composite: 'replace' });
      },
      // 숫자·글자가 통 튀어나와 떠오름. '-'로 시작하면 붉게 떨림
      float(el, text, { color = null, size = 24, dy = -52, dur = 950 } = {}) {
        if (off()) return Promise.resolve(); const r = rectOf(el); if (!r) return Promise.resolve();
        const neg = /^[-−]/.test(String(text)); color = color || (neg ? '#ff6b5e' : '#ffd76a');
        const f = document.createElement('div'); f.className = 'fx-float'; f.textContent = text;
        Object.assign(f.style, { left: r.cx + 'px', top: r.cy + 'px', color, fontSize: size + 'px' });
        getLayer().append(f);
        const dx = rnd(-10, 10);
        if (LV() >= 3) emit(Array.from({ length: 5 }, () => P({ x: r.cx + rnd(-10, 10), y: r.cy, vx: rnd(-60, 60), vy: rnd(-140, -60), ay: 200, size: 3, life: 0.5, color: hex(color), type: 'star', vr: 6 })));
        const fr = springFrames(t => {
          const s = t < 0.25 ? 0.3 + 1.1 * EASE.spring(t / 0.25, 0.3, 14) : 1.4 - 0.4 * Math.min(1, (t - 0.25) / 0.2);
          const y = t < 0.25 ? -18 * (t / 0.25) : -18 + (dy + 18) * EASE.out((t - 0.25) / 0.75);
          const sh = neg && t < 0.35 ? Math.sin(t * 90) * 4 * (1 - t / 0.35) : 0;
          return { transform: `translate(calc(-50% + ${dx * t + sh}px),calc(-50% + ${y}px)) scale(${s})`, opacity: t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3 };
        }, 30);
        return track(f.animate(fr, { duration: D(dur), easing: 'linear' })).finished.catch(() => {}).then(() => f.remove());
      },

      // ── 입자 ──
      burst(el, { color = null, n = 12, spread = 70, dur = 650, kind = 'spark' } = {}) {
        if (off()) return Promise.resolve(); const r = rectOf(el); if (!r) return Promise.resolve();
        const lv = LV(), cs = colors(color, ['#ffd76a', '#ffb347', '#fff3b0']), k = lv >= 3 ? 1.6 : lv >= 2 ? 1 : 0.6;
        const cnt = Math.round(n * k), life = dur / 1000, x = r.cx, y = r.cy, sp = spread * 3.2, list = [];
        const pick = i => cs[i % cs.length];
        if (kind === 'confetti') for (let i = 0; i < cnt * 1.5; i++) { const an = rnd(-Math.PI, 0) - 0.0, v = rnd(0.5, 1.2) * sp * 1.4; list.push(P({ x, y, vx: Math.cos(an) * v * 0.8, vy: Math.sin(an) * v, ay: 520, drag: 1.4, life: life * 2.2, size: rnd(3, 5.5), color: pick(i), type: 'confetti', add: false, rot: rnd(0, 6), vr: rnd(-8, 8), flipRate: rnd(6, 16), fadePow: 3 })); }
        else if (kind === 'coin') for (let i = 0; i < cnt; i++) { const an = rnd(-Math.PI * 0.85, -Math.PI * 0.15), v = rnd(0.6, 1.1) * sp * 1.3; list.push(P({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, ay: 900, drag: 0.6, life: life * 1.6, size: rnd(5, 7), color: '#ffd76a', type: 'coin', add: false, flipRate: rnd(10, 20), fadePow: 4 })); }
        else if (kind === 'ember') for (let i = 0; i < cnt; i++) list.push(P({ x: x + rnd(-r.w / 2, r.w / 2), y: y + rnd(-r.h / 3, r.h / 2), vx: rnd(-30, 30), vy: rnd(-160, -60), ay: -40, drag: 1, life: life * rnd(1.2, 2), size: rnd(2, 4.5), color: pick(i), fadeIn: true }));
        else if (kind === 'smoke') for (let i = 0; i < cnt; i++) { const an = rnd(0, Math.PI * 2), v = rnd(0.2, 0.6) * sp; list.push(P({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v - 30, drag: 3, life: life * 1.8, size: rnd(8, 14), size2: rnd(26, 40), color: cs[0] === '#ffd76a' ? '#8a8378' : pick(i), type: 'smoke', add: false, alpha: 0.35, fadeIn: true })); }
        else if (kind === 'star') for (let i = 0; i < cnt; i++) { const an = (i / cnt) * Math.PI * 2 + rnd(-0.2, 0.2), v = rnd(0.6, 1.1) * sp; list.push(P({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, ay: 160, drag: 3, life: life * 1.3, size: rnd(4, 8), color: pick(i), type: 'star', vr: rnd(-8, 8) })); }
        else {   // spark: 불티 + 빛 알갱이 + 별 몇 개 + 가운데 번쩍
          for (let i = 0; i < cnt; i++) { const an = (i / cnt) * Math.PI * 2 + rnd(-0.25, 0.25), v = rnd(0.7, 1.3) * sp; list.push(P({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, ay: 380, drag: 2.6, life: life * rnd(0.7, 1.15), size: rnd(1.6, 2.8), color: pick(i), type: 'spark' })); }
          for (let i = 0; i < cnt / 2; i++) { const an = rnd(0, Math.PI * 2), v = rnd(0.2, 0.7) * sp; list.push(P({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, ay: 60, drag: 3, life: life * rnd(0.8, 1.4), size: rnd(4, 9), color: pick(i) })); }
          if (lv >= 3) for (let i = 0; i < 4; i++) { const an = rnd(0, Math.PI * 2), v = rnd(0.4, 0.8) * sp; list.push(P({ x, y, vx: Math.cos(an) * v, vy: Math.sin(an) * v, ay: 220, drag: 2, life: life * 1.3, size: rnd(5, 8), color: '#ffffff', type: 'star', vr: rnd(-7, 7) })); }
          if (lv >= 2) list.push(P({ x, y, size: Math.max(r.w, r.h) * 0.6, size2: Math.max(r.w, r.h) * 1.3, life: 0.22, color: cs[0], type: 'flare', fadePow: 2 }));
        }
        emit(list);
        return lifeWait(life);
      },
      dust(el, { n = 8, power = 1, color = '#d8ccb4' } = {}) {   // 바닥에 닿을 때 양옆으로 퍼지는 먼지
        if (off() || LV() < 2) return Promise.resolve(); const r = rectOf(el); if (!r) return Promise.resolve();
        const c = hex(color), list = [];
        for (let i = 0; i < n * (LV() >= 3 ? 1.5 : 1); i++) { const side = i % 2 ? 1 : -1; list.push(P({ x: r.cx + side * rnd(0, r.w * 0.45), y: r.y + r.h - 2, vx: side * rnd(60, 190) * power, vy: rnd(-50, -10), drag: 4.5, life: rnd(0.45, 0.7), size: rnd(4, 8), size2: rnd(14, 24) * power, color: c, type: 'smoke', add: false, alpha: 0.45, fadeIn: true })); }
        emit(list); return lifeWait(0.7);
      },
      ring(el, { color = '#ffffff', power = 1 } = {}) {   // 퍼져 나가는 충격파 고리
        if (off() || LV() < 2) return Promise.resolve(); const r = rectOf(el); if (!r) return Promise.resolve();
        const R = Math.max(r.w, r.h) * 0.5;
        emit([P({ x: r.cx, y: r.cy, size: R * 0.8, size2: R * (1.6 + 0.8 * power), life: 0.38, color: hex(color), type: 'ring', width: 5 * power, alpha: 0.85, fadePow: 1.2 })]);
        return lifeWait(0.38);
      },
      glint(el) {   // 광택이 비스듬히 쓸고 지나감
        if (off() || LV() < 2) return Promise.resolve(); const r = rectOf(el); if (!r || !r.w) return Promise.resolve();
        const box = document.createElement('div'); box.className = 'fx-glint'; Object.assign(box.style, { left: r.x + 'px', top: r.y + 'px', width: r.w + 'px', height: r.h + 'px', borderRadius: getComputedStyle(el).borderRadius });
        const bar = document.createElement('i'); box.append(bar); getLayer().append(box);
        return track(bar.animate([{ transform: `translateX(${-r.w * 0.6}px)` }, { transform: `translateX(${r.w * 1.3}px)` }], { duration: D(520), easing: 'cubic-bezier(.4,0,.2,1)' })).finished.catch(() => {}).then(() => box.remove());
      },

      // ── 화면 연출 ──
      shakeScreen(power = 6, dur = 320) {   // 게임 화면 전체가 흔들림 (설정에서 끌 수 있음)
        if (off() || !fxPrefs.screenShake || LV() < 2) return Promise.resolve();
        const host = scopeEl && scopeEl.isConnected ? scopeEl : null; if (!host) return Promise.resolve();
        const kids = [...host.children].filter(c => !c.classList.contains('fx-layer'));   // 연출 층은 빼고 흔든다(유령이 튀지 않게)
        const ph = rnd(0, 6);
        const fr = springFrames(t => { const d = (1 - t) ** 2; return { transform: `translate(${Math.sin(t * 38 + ph) * power * d}px,${Math.cos(t * 31 + ph) * power * 0.8 * d}px)` }; }, 24);
        // 흔드는 동안 화면 밖으로 삐져나온 부분 때문에 가로 스크롤이 생기지 않게 잘라 둔다(원래 overflow가 visible일 때만)
        const clip = CLIPS.has(host) || getComputedStyle(host).overflowX === 'visible';
        if (clip) { CLIPS.set(host, (CLIPS.get(host) || 0) + 1); host.style.overflow = 'clip'; }
        return Promise.all(kids.map(k => anim(k, fr, { duration: dur, easing: 'linear' }))).finally(() => {
          if (!clip) return; const n = (CLIPS.get(host) || 1) - 1;
          if (n <= 0) { CLIPS.delete(host); host.style.overflow = ''; } else CLIPS.set(host, n);
        });
      },
      hitstop(ms = 70) {   // 맞는 순간 모든 움직임이 잠깐 멈춤 (타격감의 핵심)
        if (off() || LV() < 2) return Promise.resolve();
        const all = document.getAnimations ? document.getAnimations().filter(a => a.playState === 'running') : [];
        all.forEach(a => { try { a.pause(); } catch {} });
        frozenUntil = performance.now() + ms;
        return sleep(ms).then(() => all.forEach(a => { try { a.play(); } catch {} }));
      },
      flash(color = '#ffffff', strength = 0.5, dur = 260) {   // 화면 번쩍
        if (off() || LV() < 2) return Promise.resolve();
        const f = document.createElement('div'); f.className = 'fx-flash'; f.style.background = color; getLayer().append(f);
        return track(f.animate([{ opacity: 0 }, { opacity: strength, offset: 0.12 }, { opacity: 0 }], { duration: D(dur), easing: 'ease-out' })).finished.catch(() => {}).then(() => f.remove());
      },
      // 숫자 굴러 올라가기: 요소 안의 첫 숫자 글자만 바꾼다(옆의 다른 글자는 그대로)
      countTo(el, to, { from = null, dur = 650, color = null } = {}) {
        if (!el) return Promise.resolve();
        const walk = document.createTreeWalker(el, NodeFilter.SHOW_TEXT); let tn = null;
        while (walk.nextNode()) if (/-?\d/.test(walk.currentNode.data)) { tn = walk.currentNode; break; }
        if (!tn) return Promise.resolve();
        const m = tn.data.match(/-?\d+/), start = from ?? (m ? +m[0] : 0), pre = tn.data.slice(0, m.index), post = tn.data.slice(m.index + m[0].length);
        const set = v => { tn.data = pre + v + post; };
        if (off()) { set(to); return Promise.resolve(); }
        const up = to >= start, T = D(dur), t0 = performance.now();
        const c = color || (up ? '#7dff9a' : '#ff6b5e');
        anim(el, [{ color: c, textShadow: `0 0 12px ${c}` }, { color: c, offset: 0.8 }, {}], { duration: dur + 300, composite: 'replace' });
        return new Promise(res => {
          let last = start;
          const step = () => {
            const t = clamp((performance.now() - t0) / T, 0, 1), v = Math.round(start + (to - start) * EASE.out(t));
            if (v !== last) { set(v); last = v; if (LV() >= 2) anim(el, [{ transform: 'scale(1.18)' }, { transform: 'scale(1)' }], { duration: 120, composite: 'replace' }); }
            if (t < 1) requestAnimationFrame(step); else { set(to); api.pop(el, 1.3); res(); }
          };
          requestAnimationFrame(step);
        });
      },
      banner(text, { sub = '', color = '#ffe9a8', hold = 650 } = {}) {   // 가운데를 가로지르는 띠 ("내 턴", "라운드 2")
        if (off()) return Promise.resolve();
        const host = rectOf(scopeEl && scopeEl.isConnected ? scopeEl : document.body), Hh = 92;
        const vis = { x: Math.max(0, host.x), w: Math.min(host.w, window.innerWidth), y: Math.max(host.y, 0), h: Math.min(host.h, window.innerHeight - Math.max(host.y, 0)) };
        const b = document.createElement('div'); b.className = 'fx-banner';
        Object.assign(b.style, { left: vis.x + 'px', width: vis.w + 'px', top: vis.y + vis.h / 2 - Hh / 2 + 'px', height: Hh + 'px', color });
        const t = document.createElement('b'); t.textContent = text; b.append(t);
        if (sub) { const s = document.createElement('small'); s.textContent = sub; b.append(s); }
        getLayer().append(b);
        const T = D(380 + hold + 300), h1 = 380 / (380 + hold + 300), h2 = (380 + hold) / (380 + hold + 300);
        track(t.animate([{ transform: 'translateX(-60%) skewX(-18deg)', opacity: 0, letterSpacing: '.5em' }, { transform: 'translateX(0) skewX(0)', opacity: 1, letterSpacing: '.04em', offset: h1 }, { transform: 'translateX(4%)', opacity: 1, offset: h2 }, { transform: 'translateX(60%) skewX(18deg)', opacity: 0 }], { duration: T, easing: 'cubic-bezier(.2,.8,.3,1)' }));
        return track(b.animate([{ transform: 'scaleY(0)', opacity: 0 }, { transform: 'scaleY(1)', opacity: 1, offset: h1 * 0.6 }, { transform: 'scaleY(1)', opacity: 1, offset: h2 }, { transform: 'scaleY(0)', opacity: 0 }], { duration: T, easing: 'ease-out' })).finished.catch(() => {}).then(() => b.remove());
      },

      // ── 감독 ──
      // 순서 잇기: 함수는 실행하고(돌려준 Promise를 기다림), 숫자는 그만큼 기다린다. 배열 안 배열은 동시에.
      async seq(steps) {
        for (const s of steps) {
          if (typeof s === 'number') await api.wait(s);
          else if (Array.isArray(s)) await Promise.all(s.map(f => (typeof f === 'function' ? f() : null)));
          else if (typeof s === 'function') await s();
        }
      },
      skip() {   // 진행 중인 연출을 바로 끝 모습으로
        for (const a of [...RUNNING]) { try { a.finish(); } catch { try { a.cancel(); } catch {} } }
        for (const s of SYSTEMS) s.parts.length = 0;
        frozenUntil = 0;
      },
      lock() {   // 연출 중 입력을 막는다. 화면을 누르면 건너뛴다. 돌려받은 함수를 부르면 풀린다.
        if (off()) return () => {};
        const L = getLayer(), d = document.createElement('div'); d.className = 'fx-lock';
        d.addEventListener('pointerdown', e => { e.preventDefault(); e.stopPropagation(); api.skip(); }, { capture: true });
        L.append(d); return () => d.remove();
      },

      // ── 소리·진동 ──
      sfx(name, { pitch = null } = {}) {
        if (fast || !fxPrefs.sound) return;
        let fn = SOUNDS[name], base = 1;
        if (SoundHook.play) {   // 사용자 소리 파일이 있으면 그것을, 칸이 합성음을 지정했으면 그 합성음을
          let r = null; try { r = SoundHook.play(game, name, pitch); } catch { r = null; }
          if (r === true) return;
          if (r && r.synth) { fn = SOUNDS[r.synth]; base = r.pitch || 1; } else if (r === 'mute') return;
        }
        if (!fn) return;
        try {
          const a = audio(); if (!a) return; if (a.state === 'suspended') a.resume();
          PITCH = (pitch ?? rnd(0.95, 1.05)) * base; fn(a.currentTime + 0.005); PITCH = 1;
        } catch { PITCH = 1; }
      },
      // 목소리: 재생이 끝나면 풀리는 Promise. 파일이 없거나 목소리를 껐으면 바로 풀린다. {line}은 자막용 대사.
      say(id) { if (fast || !SoundHook.say) return Promise.resolve({ line: null }); try { return SoundHook.say(game, id); } catch { return Promise.resolve({ line: null }); } },
      buzz(ms = 12) { if (fast || !fxPrefs.haptic) return; try { navigator.vibrate && navigator.vibrate(ms); } catch {} },
      wait: ms => (off() ? Promise.resolve() : sleep(D(ms))),
      rect: rectOf,
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
export const SFX_NAMES = Object.keys(SOUNDS);

// 게임이 ctx.fx 없이 돌 때(자동 대전 등)를 위한 빈 도구
export const NOFX = (() => {
  const nop = () => Promise.resolve();
  const api = { on: false, level: 0, speed: 1, union: () => null, rect: () => null, sfx() {}, say: () => Promise.resolve({ line: null }), buzz() {}, skip() {}, lock: () => () => {} };
  for (const k of ['fly', 'flyMany', 'pop', 'slam', 'shake', 'flip', 'glow', 'float', 'burst', 'dust', 'ring', 'glint', 'shakeScreen', 'hitstop', 'flash', 'countTo', 'banner', 'seq', 'wait']) api[k] = nop;
  api.scope = () => api; return api;
})();
