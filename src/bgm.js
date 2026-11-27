// BGM 재생기. 게임은 따로 할 일이 없다: 실행기(host.js)가 판이 시작되면 'main'을 반복 재생하고, 끝나면 'win'/'lose'를 한 번 들려준다.
// 게임이 곡을 바꾸고 싶으면 ctx.bgm.play('mage')처럼 부른다 → 곡이 서서히 바뀐다(크로스페이드). 칸이 비어 있으면 아무것도 바꾸지 않고 false.
// 소리 파일은 소리 체계(core/sounds.js)의 'bgm.<이름>' 칸에서 가져온다(게임 전용 → 공용). 큰 파일이라 통째로 풀지 않고 스트리밍(Audio)으로 튼다.
// 목소리가 나는 동안은 BGM을 줄인다(duck). 폰은 첫 터치 뒤에만 소리가 나므로, 막히면 첫 터치에 시작한다. 화면이 가려지면 멈춘다.
import { getSlotRec } from '../core/sounds.js';

const LS = k => { try { return localStorage.getItem(k); } catch { return null; } };
const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export const bgmPrefs = {
  get on() { return LS('ba_bgm') !== '0'; },
  get vol() { const v = parseFloat(LS('ba_bgmvol')); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5; },
  setOn(on) { setLS('ba_bgm', on ? '1' : '0'); },
  setVol(v) { setLS('ba_bgmvol', String(v)); live.forEach(b => b._apply()); }
};
const live = new Set();   // 지금 떠 있는 재생기들 (음량·덕킹을 한꺼번에 반영)

// 덕킹: 목소리가 나는 동안 BGM을 줄인다. 겹치면 개수를 센다.
let duckN = 0, duckNow = 1, ticker = null;
const DUCK_TO = 0.3;
export function duckBgm(on) { duckN = Math.max(0, duckN + (on ? 1 : -1)); wake(); }
function wake() { if (!ticker) ticker = setInterval(tick, 40); }
function tick() {
  let busy = false;
  const goal = duckN > 0 ? DUCK_TO : 1;
  if (Math.abs(duckNow - goal) > 0.01) { duckNow += (goal - duckNow) * 0.25; busy = true; } else duckNow = goal;
  for (const b of live) if (b._step()) busy = true;
  if (!busy) { clearInterval(ticker); ticker = null; }
}

export let lastBgm = null;   // 자동 테스트용
const norm = s => (String(s || 'main').startsWith('bgm.') ? String(s) : 'bgm.' + s);
const short = s => norm(s).slice(4);

export function makeBgm(app, gameId) {
  // tracks: 지금 떠 있는 곡들. {el, url, slot, f(0~1 페이드), to(목표 f), kill(다 사라지면 치움)}
  let tracks = [], want = null, dead = false, token = 0, unlock = null;
  const vol = t => bgmPrefs.vol * duckNow * t.f;
  const dispose = t => { try { t.el.pause(); } catch {} t.el.removeAttribute('src'); try { t.el.load(); } catch {} if (t.url) URL.revokeObjectURL(t.url); tracks = tracks.filter(x => x !== t); };
  const api = {
    _apply() { for (const t of tracks) t.el.volume = Math.min(1, Math.max(0, vol(t))); },
    _step() {
      let busy = false;
      for (const t of [...tracks]) {
        if (t.f !== t.to) { const d = t.to - t.f, st = (40 / (t.ms || 1)); t.f = Math.abs(d) <= st ? t.to : t.f + Math.sign(d) * st; busy = true; }
        if (t.kill && t.f <= 0) { dispose(t); continue; }
        t.el.volume = Math.min(1, Math.max(0, vol(t)));
      }
      return busy;
    },
    async rec(slot) {   // 게임 전용 → 공용
      const id = norm(slot);
      const own = await getSlotRec(app.storage, gameId, id).catch(() => null);
      if (own && own.files && own.files.length) return own;
      const all = await getSlotRec(app.storage, 'all', id).catch(() => null);
      return all && all.files && all.files.length ? all : null;
    },
    async has(slot = 'main') { return !app.fast && !!(await api.rec(slot)); },
    // slot을 재생. 그 칸에 파일이 없으면 false(아무것도 바꾸지 않음). fade: 곡이 바뀌는 데 걸리는 ms
    async play(slot = 'main', { fade = 1200 } = {}) {
      if (app.fast || dead) return false;
      const rec = await api.rec(slot); if (!rec || dead) return false;
      const id = norm(slot), def = ((app.soundLists && app.soundLists[gameId]) || { slots: [] }).slots.find(s => s.id === id);
      const once = def ? def.kind === 'oneshot' : /^bgm\.(win|lose)$/.test(id);
      if (want === short(slot) && tracks.some(t => !t.kill && t.slot === short(slot)) && !once) return true;
      const my = ++token; want = short(slot);
      for (const t of tracks) { t.to = 0; t.ms = once ? 350 : fade; t.kill = true; }   // 옛 곡은 서서히 사라진다
      if (!bgmPrefs.on) { for (const t of [...tracks]) dispose(t); return true; }
      const blob = rec.files[0].blob, url = URL.createObjectURL(blob), el = new Audio(url);
      el.loop = !once; el.dataset.slot = short(slot);
      const fresh = !tracks.length, t = { el, url, slot: short(slot), f: fresh || once ? 1 : 0, to: 1, ms: fade, kill: false };
      el.volume = Math.min(1, Math.max(0, vol(t))); tracks.push(t); wake();
      try { await el.play(); } catch {
        if (my === token && !dead) { unlock = () => { if (my === token && tracks.includes(t) && bgmPrefs.on) el.play().catch(() => {}); window.removeEventListener('pointerdown', unlock); unlock = null; }; window.addEventListener('pointerdown', unlock); }
      }
      return true;
    },
    get playing() { return tracks.some(t => !t.kill && !t.el.paused); },
    get volume() { const t = tracks.find(x => !x.kill); return t ? t.el.volume : null; },   // 자동 테스트용
    get trackCount() { return tracks.length; },
    get slot() { const t = tracks.find(x => !x.kill); return t ? t.slot : null; },
    toggle() { const on = !bgmPrefs.on; bgmPrefs.setOn(on); if (on) { if (want) { const w = want; want = null; api.play(w, { fade: 400 }); } } else { token++; for (const t of [...tracks]) dispose(t); } return on; },
    setVol(v) { bgmPrefs.setVol(v); },
    destroy() { dead = true; token++; if (unlock) { window.removeEventListener('pointerdown', unlock); unlock = null; } for (const t of [...tracks]) dispose(t); live.delete(api); document.removeEventListener('visibilitychange', onVis); }
  };
  const onVis = () => { for (const t of tracks) { if (document.hidden) t.el.pause(); else if (bgmPrefs.on && !t.kill) t.el.play().catch(() => {}); } };
  document.addEventListener('visibilitychange', onVis);
  live.add(api);
  return (lastBgm = api);
}
