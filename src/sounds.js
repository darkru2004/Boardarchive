// 소리 체계 (3단계) — 사용자 소리 파일 재생 + 설정 화면.
// · 효과음·목소리: 파일을 한 번 풀어 두고(AudioBuffer) 재생. 한 칸에 파일이 여러 개면 번갈아(같은 것이 연달아 나오지 않게).
//   칸이 비면 칸에 적힌 합성음이 대신 난다(fx.js). 찾는 순서: 게임 전용 → 공용 → 합성음.
// · 목소리: 한 번에 하나, 나오는 동안 BGM이 줄어든다. 설정에서 따로 끌 수 있다. fx.say(id)는 끝나면 풀리는 Promise({line}=자막).
// · BGM은 src/bgm.js(스트리밍). 이 파일은 같은 칸 체계로 설정 화면과 소리 팩(zip)을 다룬다.
import { h, modal, toast } from './ui.js';
import { SoundHook, audioBus, fxPrefs, makeFx } from './fx.js';
import { bgmPrefs, duckBgm } from './bgm.js';
import { slotsFor, findSlot, listScope, listAll, putSlotFiles, delSlot, setSlotGain, importSoundFiles, exportPack, isBgmKind, migrateBgm, SND_MAX_FILES } from '../core/sounds.js';
import { parseBgm, importBgm } from '../core/backup.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const S = { app: null, bufs: new Map(), active: 0, voice: null, vg: null };
export const soundState = S;   // 자동 테스트용

// ---------- 시작 ----------
export function initSounds(app) {
  S.app = app; app.soundLists = { all: slotsFor(app.soundCatalog, null) };
  for (const g of app.allGames) app.soundLists[g.id] = slotsFor(app.soundCatalog, g);
}
const listOf = scope => (S.app.soundLists[scope] || S.app.soundLists.all);

// 범위의 소리 파일(효과음·목소리)을 풀어 둔다. 게임을 시작할 때 부르면 첫 소리부터 파일로 난다(끝나기 전에는 합성음).
export async function loadScope(app, scope) {
  const bus = audioBus(); if (!bus) return;
  const recs = await listScope(app.storage, scope), list = listOf(scope), m = new Map();
  for (const [slot, rec] of recs) {
    const def = list.slots.find(s => s.id === slot);
    if ((def && isBgmKind(def.kind)) || (!def && /^bgm\./.test(slot))) continue;
    const bufs = [];
    for (const f of rec.files) { try { bufs.push(await bus.AC.decodeAudioData(await f.blob.arrayBuffer())); } catch { /* 깨진 파일은 건너뜀 */ } }
    if (bufs.length) m.set(slot, { bufs, gain: rec.gain || 1, last: -1 });
  }
  S.bufs.set(scope, m);
}
export const forget = scope => S.bufs.delete(scope);
const entryOf = (scope, id) => (scope && S.bufs.get(scope) && S.bufs.get(scope).get(id)) || (S.bufs.get('all') && S.bufs.get('all').get(id)) || null;
const pickIdx = e => { let i = 0; if (e.bufs.length > 1) do i = Math.floor(Math.random() * e.bufs.length); while (i === e.last); e.last = i; return i; };

// ---------- 재생 ----------
function playSfx(e, pitch) {
  const bus = audioBus(); if (!bus) return false;
  if (S.active >= 12) return true;   // 너무 많이 겹치면 새 소리는 건너뜀
  if (bus.AC.state === 'suspended') bus.AC.resume();
  const src = bus.AC.createBufferSource(), g = bus.AC.createGain();
  src.buffer = e.bufs[pickIdx(e)]; src.playbackRate.value = Math.min(2, Math.max(0.5, pitch ?? rnd(0.97, 1.03)));
  g.gain.value = e.gain * rnd(0.92, 1); src.connect(g); g.connect(bus.master); S.active++;
  src.onended = () => { S.active--; try { g.disconnect(); } catch {} };
  src.start(bus.AC.currentTime + 0.005); return true;
}
const lineOf = (def, i) => (Array.isArray(def.line) ? (def.line[i] ?? def.line[0]) : def.line) || null;
function say(scope, id, { force = false } = {}) {
  const def = findSlot(listOf(scope), id); if (!def) return Promise.resolve({ line: null, played: false });
  const e = entryOf(scope, def.id), idx = e ? pickIdx(e) : Math.floor(Math.random() * [].concat(def.line || []).length || 0), line = lineOf(def, idx);
  if (!e || (!force && !fxPrefs.voice)) return Promise.resolve({ line, played: false });
  const bus = audioBus(); if (!bus) return Promise.resolve({ line, played: false });
  if (bus.AC.state === 'suspended') bus.AC.resume();
  if (S.voice) S.voice.stop();
  if (!S.vg || S.vg.context !== bus.AC) { S.vg = bus.AC.createGain(); S.vg.connect(bus.comp); }
  S.vg.gain.value = fxPrefs.voiceVol;
  const src = bus.AC.createBufferSource(), g = bus.AC.createGain(); src.buffer = e.bufs[idx] || e.bufs[0]; g.gain.value = e.gain; src.connect(g); g.connect(S.vg);
  return new Promise(res => {
    let done = false; duckBgm(true);
    const fin = () => { if (done) return; done = true; duckBgm(false); if (S.voice && S.voice.src === src) S.voice = null; try { g.disconnect(); } catch {} res({ line, played: true }); };
    src.onended = fin; S.voice = { src, stop: () => { try { src.stop(); } catch {} fin(); } };
    setTimeout(fin, src.buffer.duration * 1000 + 600);
    src.start(bus.AC.currentTime + 0.005);
  });
}
SoundHook.play = (game, name, pitch) => {
  const def = findSlot(listOf(game), name); if (!def || isBgmKind(def.kind)) return null;
  if (def.kind === 'voice') { if (!fxPrefs.voice) return 'mute'; say(game, def.id); return entryOf(game, def.id) ? true : 'mute'; }
  const e = entryOf(game, def.id);
  if (e) return playSfx(e, pitch);
  return def.synth ? { synth: def.synth, pitch: def.pitch } : null;   // 파일이 없으면 칸에 적힌 합성음
};
SoundHook.say = (game, id) => say(game, id);
SoundHook.voiceChanged = () => { if (S.vg) S.vg.gain.value = fxPrefs.voiceVol; };

// ---------- 설정 화면 ----------
const ACCEPT = 'audio/*,.mp3,.ogg,.wav,.m4a,.aac,.opus,.flac,.zip,application/zip';
const mkCtx = (app, defaultScope = 'all') => ({
  gameIds: app.allGames.map(g => g.id), defaultScope,
  slotsOf: sc => new Set(listOf(sc).slots.map(s => s.id)),
  kindOf: (sc, id) => (listOf(sc).slots.find(s => s.id === id) || {}).kind || 'sfx'
});
const toUrl = blob => URL.createObjectURL(blob);
async function runImport(app, files, defaultScope, then) {
  const r = await importSoundFiles(app.storage, files, mkCtx(app, defaultScope));
  for (const sc of new Set(r.added.map(a => a.scope))) { forget(sc); loadScope(app, sc).catch(() => {}); }
  const n = r.added.reduce((a, x) => a + x.n, 0);
  toast(`${r.added.length}칸에 파일 ${n}개를 넣었어요${r.failed.length ? ` · 못 넣은 것 ${r.failed.length}개` : ''}`);
  if (r.failed.length) {
    const m = modal(h('div', { class: 'artm', id: 'soundFailed' }, h('h3', { style: 'margin:0 0 6px' }, '칸을 찾지 못한 파일'),
      h('div', { class: 'muted', style: 'margin-bottom:8px' }, '파일 이름이 칸 id와 같아야 해요. 예: hit.heavy-01.mp3 (게임 전용은 게임id.칸id-01.mp3)'),
      ...r.failed.slice(0, 40).map(f => h('div', { style: 'font-size:12px;padding:2px 0' }, h('b', {}, f.name), ' — ', f.why)),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn go grow', onclick: () => m.close() }, '닫기'))));
  }
  if (then) then(r); return r;
}

export function openSoundManager(app, scope, title) {
  let m, prev = null; const open = new Set(), list = listOf(scope);
  const stopPrev = () => { if (prev) { prev.a.pause(); URL.revokeObjectURL(prev.u); prev = null; } };
  const body = h('div', { class: 'artm', id: 'soundManager', 'data-scope': scope });
  const reload = () => { forget(scope); return loadScope(app, scope).catch(() => {}); };
  const redraw = async () => {
    const own = await listScope(app.storage, scope), inh = scope === 'all' ? new Map() : await listScope(app.storage, 'all');
    const filled = def => own.has(def.id) || (!def.own && inh.has(def.id));
    const total = list.slots.length, got = list.slots.filter(filled).length;
    const bulk = h('input', { type: 'file', multiple: true, accept: ACCEPT, style: 'display:none', id: 'soundBulk', onchange: async e => { const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return; stopPrev(); try { await runImport(app, fs, scope); } catch (err) { toast(err.message); } redraw(); } });
    const groups = list.groups.map(g => {
      const slots = list.slots.filter(s => s.group === g.id);
      const rows = slots.map(def => {
        const rec = own.get(def.id), via = !rec && scope !== 'all' ? inh.get(def.id) : null, shown = rec || via, bgm = isBgmKind(def.kind);
        const inp = h('input', { type: 'file', multiple: !bgm, accept: ACCEPT.replace(',.zip,application/zip', ''), style: 'display:none', onchange: async e => {
          const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return; stopPrev();
          try { await putSlotFiles(app.storage, scope, def.id, fs, { append: !bgm, kind: def.kind }); await reload(); toast('저장했어요'); } catch (err) { toast(err.message); }
          redraw();
        } });
        const names = shown ? shown.files.map(f => f.name).join(', ') : '';
        const hint = def.variants ? ` · 권장 ${def.variants}개` : '';
        const line = def.line ? h('div', { style: 'font-size:12px;margin:2px 0;opacity:.9' }, '“', [].concat(def.line).join('” / “'), '”') : null;
        return h('div', { class: 'artg snd-slot', 'data-s': def.id, 'data-n': shown ? shown.files.length : 0 },
          h('div', { class: 'row', style: 'align-items:center;gap:6px' }, h('b', { class: 'grow' }, (def.pri ? '★ ' : '') + def.label), h('small', { class: 'muted' }, def.id),
            h('button', { class: 'btn small', onclick: () => inp.click() }, rec ? (bgm ? '바꾸기' : '더 넣기') : '넣기'), inp),
          h('div', { class: 'muted', style: 'font-size:11px;margin:3px 0' }, def.desc + hint), line,
          h('div', { class: 'muted', style: 'font-size:11px;margin:3px 0' }, shown ? `${via ? '공용 사용 중 · ' : ''}${shown.files.length}개 · ${names.length > 70 ? names.slice(0, 70) + '…' : names}` : (def.synth ? '비어 있음 (합성음이 대신 나요)' : '비어 있음 (소리 없음)')),
          h('div', { class: 'row', style: 'gap:6px;align-items:center' },
            h('button', { class: 'btn small', onclick: ev => preview(def, shown, ev.currentTarget) }, '▶ 듣기'),
            rec ? h('button', { class: 'btn small', onclick: async () => { stopPrev(); await delSlot(app.storage, scope, def.id); await reload(); redraw(); } }, '지우기') : null,
            rec && !bgm ? h('span', { class: 'row', style: 'gap:4px;align-items:center;flex:1' }, h('small', {}, '음량'), h('input', { type: 'range', min: 20, max: 200, value: Math.round((rec.gain || 1) * 100), style: 'flex:1;min-width:60px', onchange: async e => { await setSlotGain(app.storage, scope, def.id, e.target.value / 100); await reload(); } })) : null));
      });
      const gg = slots.filter(filled).length;
      const d = h('details', { 'data-g': g.id, ...(open.has(g.id) ? { open: true } : {}), ontoggle: ev => { if (ev.target.open) open.add(g.id); else open.delete(g.id); } },
        h('summary', { style: 'cursor:pointer;padding:6px 0;font-weight:bold' }, `${g.label} · ${gg}/${slots.length}`), ...rows);
      return d;
    });
    body.replaceChildren(
      h('h3', { style: 'margin:0 0 4px' }, title),
      h('div', { class: 'muted', style: 'margin-bottom:6px' }, scope === 'all' ? '모든 게임에 쓰이는 소리예요. 게임마다 따로 넣으면 그 게임은 그것을 먼저 써요.' : '이 게임의 소리예요. 비어 있는 칸은 공용 소리, 그것도 없으면 합성음을 써요.'),
      h('div', { class: 'row wrap', style: 'gap:8px;align-items:center;margin-bottom:8px' }, h('b', { id: 'soundSummary' }, `채운 칸 ${got}/${total}`),
        h('button', { class: 'btn small go', id: 'soundBulkBtn', onclick: () => bulk.click() }, '여러 파일 한 번에 올리기'), bulk),
      h('div', { class: 'muted', style: 'font-size:11px;margin-bottom:6px' }, scope === 'all' ? '파일 이름이 칸 id와 같으면 알아서 분류돼요. 예: hit.heavy-01.mp3 (변형은 -01, -02). 소리 팩(zip)도 올릴 수 있어요.' : `파일 이름이 칸 id와 같으면 알아서 분류돼요. 예: atk.mage-01.mp3 또는 ${scope}.atk.mage-01.mp3. 소리 팩(zip)도 올릴 수 있어요.`),
      ...groups,
      h('div', { class: 'muted', style: 'font-size:11px;margin-top:6px' }, `mp3·ogg·wav·m4a. 효과음·목소리는 파일당 3MB, BGM은 12MB까지. 칸마다 변형 ${SND_MAX_FILES}개까지. 이 기기에만 저장돼요 — 옮길 때는 데이터 탭의 소리 팩을 쓰세요.`),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn go grow', onclick: () => m.close() }, '닫기')));
  };
  async function preview(def, shown, btn) {
    if (prev && prev.id === def.id) { stopPrev(); btn.textContent = '▶ 듣기'; return; }
    stopPrev();
    if (isBgmKind(def.kind)) {
      if (!shown) return toast('비어 있어요');
      const u = toUrl(shown.files[0].blob), a = new Audio(u); a.volume = bgmPrefs.vol; a.loop = def.kind === 'loop'; a.play().catch(() => toast('재생하지 못했어요'));
      prev = { a, u, id: def.id }; btn.textContent = '■ 멈춤'; return;
    }
    if (!S.bufs.has(scope)) await loadScope(app, scope).catch(() => {});
    if (def.kind === 'voice') { const r = await say(scope, def.id, { force: true }); if (!r.played) toast(r.line ? `파일이 없어요 · 대사: ${r.line}` : '비어 있어요'); return; }
    makeFx({ game: scope === 'all' ? null : scope }).sfx(def.id);
  }
  m = modal(body, { onClose: () => { stopPrev(); app.render(); } });
  loadScope(app, scope).catch(() => {});
  redraw(); return m;
}

function downloadBlob(blob, name) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

// 설정 > 일반: 소리 카드
export function soundCard(app, games, plainName) {
  const tog = (id, label, get, set) => h('button', { class: 'btn small' + (get() ? ' on' : ''), id, onclick: ev => { const on = !get(); set(on); ev.currentTarget.classList.toggle('on', on); ev.currentTarget.lastChild.textContent = on ? '켜짐' : '꺼짐'; } }, label + ' ', h('small', {}, get() ? '켜짐' : '꺼짐'));
  const slider = (id, val, on) => h('input', { type: 'range', id, min: 0, max: 100, value: Math.round(val * 100), style: 'flex:1;min-width:100px', oninput: e => on(e.target.value / 100) });
  const rows = games.map(g => h('div', { class: 'row', 'data-bg': g.id, style: 'gap:6px;align-items:center;padding:5px 0;border-bottom:1px dashed #00000020' },
    h('div', { class: 'grow' }, plainName(g.name), h('small', { class: 'muted snd-count', style: 'margin-left:6px' }, '')),
    h('button', { class: 'btn small', onclick: () => openSoundManager(app, g.id, `${plainName(g.name)} · 소리`) }, '이 게임 소리')));
  listAll(app.storage).then(all => {
    for (const r of rows) {
      const gid = r.dataset.bg, own = new Set(all.filter(x => x.scope === gid).map(x => x.slot)), list = listOf(gid);
      const n = list.slots.filter(s => own.has(s.id)).length, own2 = list.slots.filter(s => s.own).length;
      r.querySelector('.snd-count').textContent = own2 ? `전용 칸 ${list.slots.filter(s => s.own && own.has(s.id)).length}/${own2}` : (n ? `${n}칸` : '');
    }
  }).catch(() => {});
  return h('div', { class: 'paper', id: 'soundCard', style: '--r:-.3deg' },
    h('div', { class: 'row wrap', style: 'gap:8px;align-items:center' },
      tog('bgmOn', 'BGM', () => bgmPrefs.on, on => bgmPrefs.setOn(on)), h('small', {}, '음량'), slider('bgmVol', bgmPrefs.vol, v => bgmPrefs.setVol(v))),
    h('div', { class: 'row wrap', style: 'gap:8px;align-items:center;margin-top:8px' },
      tog('voiceOn', '목소리', () => fxPrefs.voice, on => fxPrefs.set('ba_voice', on)), h('small', {}, '음량'), slider('voiceVol', fxPrefs.voiceVol, v => fxPrefs.setVal('ba_voicevol', Math.round(v * 100)))),
    h('div', { class: 'row wrap', style: 'gap:6px;margin-top:8px' }, h('button', { class: 'btn small go', id: 'soundAll', onclick: () => openSoundManager(app, 'all', '공용 소리 (모든 게임)') }, '공용 소리 넣기')),
    h('div', { style: 'margin-top:8px' }, ...rows),
    h('div', { class: 'muted', style: 'margin-top:6px' }, '효과음·BGM·목소리 파일을 넣을 수 있어요. 칸이 비어 있으면 합성음이 나거나 조용해요. 효과음 음량은 위 연출 조절판에 있어요. 폰으로 옮길 때는 데이터 탭의 소리 팩을 쓰세요.'));
}

// 설정 > 데이터: 소리 팩(zip) 내보내기·가져오기 (+ 예전 BGM 백업 가져오기)
export async function soundPackCard(app) {
  const all = await listAll(app.storage);
  const files = all.reduce((a, x) => a + x.rec.files.length, 0), bytes = all.reduce((a, x) => a + x.rec.files.reduce((b, f) => b + (f.size || 0), 0), 0);
  const pin = h('input', { type: 'file', multiple: true, accept: ACCEPT, style: 'display:none', id: 'packFile', onchange: async e => {
    const fs = [...e.target.files]; e.target.value = ''; if (!fs.length) return;
    try { await runImport(app, fs, 'all'); app.render(); } catch (err) { toast(err.message); }
  } });
  const old = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', id: 'bgmFile', onchange: async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try { const o = parseBgm(await f.text()), r = await importBgm(app.storage, o), n = await migrateBgm(app.storage); toast(`예전 BGM ${Object.keys(o.data.bgm).length}개 중 ${n}칸을 옮겼어요`); app.render(); } catch (err) { toast(err.message); }
  } });
  return h('div', { class: 'paper taped', id: 'soundPackCard', style: '--r:-.4deg' },
    h('h3', {}, '③ 소리 팩', h('small', { style: 'margin-left:8px' }, 'zip')),
    h('div', { class: 'muted', style: 'margin-bottom:10px' }, `저장된 소리 ${all.length}칸 · 파일 ${files}개 · 약 ${(bytes / 1048576).toFixed(1)}MB. 소리 파일만 zip 하나로 묶여요. 풀어 보면 파일 이름이 칸 id라서, 그대로 다시 올려도 알아서 분류돼요.`),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn go', id: 'btnExportPack', disabled: !all.length, onclick: async ev => {
        const b = ev.currentTarget; b.disabled = true;
        try { const p = await exportPack(app.storage), d = new Date(), z = n => String(n).padStart(2, '0'); downloadBlob(p.blob, `boardarchive-sounds-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.zip`); toast(`소리 ${p.count}칸(파일 ${p.files}개)을 묶었어요`); } catch (err) { toast(err.message); }
        b.disabled = false;
      } }, '소리 팩 내보내기', h('small', {}, 'EXPORT')),
      h('button', { class: 'btn', id: 'btnImportPack', onclick: () => pin.click() }, '소리 팩·파일 가져오기', h('small', {}, 'IMPORT'))),
    h('div', { class: 'muted', style: 'margin-top:8px' }, '가져오면 같은 칸은 새 파일로 바뀌어요. zip 말고 소리 파일 여러 개를 한꺼번에 골라도 돼요.'),
    h('div', { class: 'row', style: 'margin-top:6px' }, h('button', { class: 'btn small', onclick: () => old.click() }, '예전 BGM 백업(.json) 가져오기')), pin, old);
}
