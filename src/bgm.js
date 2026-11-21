// BGM 재생기 + 설정 화면. 게임은 따로 할 일이 없다: 실행기(host.js)가 판이 시작되면 'main'을 반복 재생하고, 끝나면 'win'/'lose'를 한 번 들려준다.
// 소리가 없는 칸은 조용히 건너뛴다. 폰은 첫 터치 뒤에만 소리가 나므로, 막히면 첫 터치에 시작한다. 화면이 가려지면 멈춘다.
import { h, modal, toast } from './ui.js';
import { BGM_SLOTS, BGM_MAX_BYTES, getBgm, ownBgm, saveBgm, delBgm, mimeOf } from '../core/bgm.js';

const LS = k => { try { return localStorage.getItem(k); } catch { return null; } };
const setLS = (k, v) => { try { localStorage.setItem(k, v); } catch {} };
export const bgmPrefs = {
  get on() { return LS('ba_bgm') !== '0'; },
  get vol() { const v = parseFloat(LS('ba_bgmvol')); return Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : 0.5; },
  setOn(on) { setLS('ba_bgm', on ? '1' : '0'); },
  setVol(v) { setLS('ba_bgmvol', String(v)); }
};
const toUrl = dataUrl => {
  const i = dataUrl.indexOf(','), mime = (dataUrl.slice(5, i).split(';')[0]) || 'audio/mpeg', bin = atob(dataUrl.slice(i + 1));
  const u8 = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
  return URL.createObjectURL(new Blob([u8], { type: mime }));
};
const readFile = f => new Promise((res, rej) => {
  const mime = mimeOf(f.name, f.type); if (!mime) return rej(new Error('mp3·ogg·wav·m4a 같은 소리 파일만 넣을 수 있어요'));
  if (f.size > BGM_MAX_BYTES) return rej(new Error(`파일이 너무 커요 (${(f.size / 1048576).toFixed(1)}MB / 최대 ${BGM_MAX_BYTES / 1048576}MB)`));
  const r = new FileReader(); r.onerror = () => rej(new Error('파일을 읽지 못했어요'));
  r.onload = () => res(String(r.result).replace(/^data:[^;,]*/, 'data:' + mime)); r.readAsDataURL(f);
});

export let lastBgm = null;   // 자동 테스트용
export function makeBgm(app, gameId) {
  let el = null, url = null, want = null, dead = false, token = 0, unlock = null;
  const stopEl = () => {
    token++; if (unlock) { window.removeEventListener('pointerdown', unlock); unlock = null; }
    if (el) { try { el.pause(); } catch {} el.removeAttribute('src'); el = null; }
    if (url) { URL.revokeObjectURL(url); url = null; }
  };
  const onVis = () => { if (!el) return; if (document.hidden) el.pause(); else if (bgmPrefs.on) el.play().catch(() => {}); };
  document.addEventListener('visibilitychange', onVis);
  const api = {
    async has(slot = 'main') { return !app.fast && !!(await getBgm(app.storage, gameId, slot)); },
    // slot을 재생. 그 칸에 파일이 없으면 false(아무것도 바꾸지 않음)
    async play(slot = 'main') {
      if (app.fast || dead) return false;
      const rec = await getBgm(app.storage, gameId, slot).catch(() => null);
      if (!rec || dead) return false;
      stopEl(); want = slot; const my = token;
      if (!bgmPrefs.on) return true;
      url = toUrl(rec.dataUrl); el = new Audio(url); el.loop = slot === 'main'; el.volume = bgmPrefs.vol; el.dataset.slot = slot;
      const e = el;
      try { await e.play(); } catch {
        if (my === token && !dead) { unlock = () => { if (my === token && el === e && bgmPrefs.on) e.play().catch(() => {}); window.removeEventListener('pointerdown', unlock); unlock = null; }; window.addEventListener('pointerdown', unlock); }
      }
      return true;
    },
    get playing() { return !!el && !el.paused; },
    get slot() { return el ? want : null; },
    toggle() { const on = !bgmPrefs.on; bgmPrefs.setOn(on); if (on) { if (want) api.play(want); } else stopEl(); return on; },
    setVol(v) { bgmPrefs.setVol(v); if (el) el.volume = v; },
    destroy() { dead = true; stopEl(); document.removeEventListener('visibilitychange', onVis); }
  };
  return (lastBgm = api);
}

// ---------- 설정 화면 ----------
function openBgmManager(app, scope, title) {
  let m, prev = null;
  const stopPrev = () => { if (prev) { prev.a.pause(); URL.revokeObjectURL(prev.u); prev = null; } };
  const body = h('div', { class: 'artm', id: 'bgmManager' });
  const redraw = async () => {
    const rows = [];
    for (const s of BGM_SLOTS) {
      const own = await ownBgm(app.storage, scope, s.id);
      const inherit = scope !== 'all' && !own ? await ownBgm(app.storage, 'all', s.id) : null;
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'audio/*,.mp3,.ogg,.wav,.m4a,.aac,.opus,.flac'; inp.style.display = 'none';
      inp.onchange = async e => {
        const f = e.target.files[0]; e.target.value = ''; if (!f) return;
        try { stopPrev(); await saveBgm(app.storage, scope, s.id, { name: f.name, size: f.size, dataUrl: await readFile(f) }); toast('저장했어요'); } catch (err) { toast(err.message); }
        redraw();
      };
      const shown = own || inherit;
      rows.push(h('div', { class: 'artg', 'data-s': s.id },
        h('div', { class: 'row', style: 'align-items:center;gap:6px' }, h('b', { class: 'grow' }, s.label),
          h('button', { class: 'btn small', onclick: () => inp.click() }, own ? '바꾸기' : '넣기'), inp),
        h('div', { class: 'muted', style: 'font-size:11px;margin:3px 0' }, shown ? `${own ? '' : '공용 사용 중 · '}${shown.name} · ${(shown.size / 1048576).toFixed(1)}MB` : '비어 있음 (소리 없음)'),
        shown ? h('div', { class: 'row', style: 'gap:6px' },
          h('button', { class: 'btn small', onclick: ev => {
            if (prev && prev.id === s.id) { stopPrev(); ev.currentTarget.textContent = '▶ 미리듣기'; return; }
            stopPrev(); const u = toUrl(shown.dataUrl), a = new Audio(u); a.volume = bgmPrefs.vol; a.loop = s.id === 'main'; a.play().catch(() => toast('재생하지 못했어요'));
            prev = { a, u, id: s.id }; ev.currentTarget.textContent = '■ 멈춤';
          } }, '▶ 미리듣기'),
          own ? h('button', { class: 'btn small', onclick: async () => { stopPrev(); await delBgm(app.storage, scope, s.id); redraw(); } }, '지우기') : null) : null));
    }
    body.replaceChildren(
      h('h3', { style: 'margin:0 0 4px' }, title),
      h('div', { class: 'muted', style: 'margin-bottom:8px' }, scope === 'all' ? '모든 게임에 쓰이는 BGM이에요. 게임마다 따로 넣으면 그 게임은 그것을 먼저 써요.' : '이 게임만의 BGM이에요. 비어 있는 칸은 공용 BGM을 써요.'),
      ...rows,
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `mp3·ogg·wav·m4a, 파일당 최대 ${BGM_MAX_BYTES / 1048576}MB. 이 기기에만 저장돼요(백업 파일에는 안 들어가니 원본은 따로 보관하세요).`),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn go grow', onclick: () => m.close() }, '닫기')));
  };
  m = modal(body, { onClose: () => { stopPrev(); app.render(); } });
  redraw();
  return m;
}

export function bgmCard(app, games, plainName) {
  const onBtn = h('button', { class: 'btn small' + (bgmPrefs.on ? ' on' : ''), id: 'bgmOn', onclick: ev => {
    const on = !bgmPrefs.on; bgmPrefs.setOn(on); ev.currentTarget.classList.toggle('on', on); ev.currentTarget.lastChild.textContent = on ? '켜짐' : '꺼짐';
  } }, 'BGM ', h('small', {}, bgmPrefs.on ? '켜짐' : '꺼짐'));
  const vol = h('input', { type: 'range', id: 'bgmVol', min: 0, max: 100, value: Math.round(bgmPrefs.vol * 100), style: 'flex:1;min-width:120px', oninput: e => bgmPrefs.setVol(e.target.value / 100) });
  return h('div', { class: 'paper', id: 'bgmCard', style: '--r:-.3deg' },
    h('div', { class: 'row wrap', style: 'gap:8px;align-items:center' }, onBtn, h('small', {}, '음량'), vol),
    h('div', { class: 'row wrap', style: 'gap:6px;margin-top:8px' }, h('button', { class: 'btn small go', id: 'bgmAll', onclick: () => openBgmManager(app, 'all', '공용 BGM (모든 게임)') }, '공용 BGM 넣기')),
    h('div', { style: 'margin-top:8px' }, ...games.map(g => h('div', { class: 'row', 'data-bg': g.id, style: 'gap:6px;align-items:center;padding:5px 0;border-bottom:1px dashed #00000020' },
      h('div', { class: 'grow' }, plainName(g.name)),
      h('button', { class: 'btn small', onclick: () => openBgmManager(app, g.id, `${plainName(g.name)} · BGM`) }, '이 게임 BGM')))),
    h('div', { class: 'muted', style: 'margin-top:6px' }, '플레이 중 반복되는 곡, 승리·패배 때 한 번 나오는 곡을 넣을 수 있어요. 게임 안 ☰ 메뉴나 상단에서 껐다 켤 수 있어요.'));
}
