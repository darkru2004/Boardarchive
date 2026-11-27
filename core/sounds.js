// 소리 체계(3단계) 핵심 규칙: 칸 목록 합치기 · 파일 이름으로 칸 찾기 · 저장 · 옛 BGM 옮기기 · 소리 팩(zip) 만들기/읽기.
// 화면·소리 재생과 무관한 순수 코드라서 자동 테스트가 가능하다. 재생은 src/sounds.js, BGM은 src/bgm.js.
// 저장: settings['snd:<범위>:<칸 id>'] = { files:[{name,size,type,blob}], gain, updatedAt }. 범위 = all(공용) 또는 게임 id.
// 찾는 순서: 게임 전용 → 공용 → (둘 다 비면) 합성음.
import { BGM_MIME, BGM_MAX_BYTES, mimeOf } from './bgm.js';
export const SND_MAX_SHORT = 3 * 1024 * 1024;            // 효과음·목소리 파일 한 개 상한
export const SND_MAX_BGM = BGM_MAX_BYTES;                // BGM 파일 한 개 상한 (12MB)
export const SND_MAX_FILES = 8;                          // 한 칸에 넣을 수 있는 변형 수
export const sndKey = (scope, slot) => `snd:${scope}:${slot}`;
const KEY_RE = /^snd:([a-z0-9_-]{1,60}):([a-z0-9._-]{1,80})$/;
export const parseSndKey = k => { const m = KEY_RE.exec(k); return m ? { scope: m[1], slot: m[2] } : null; };
export const isBgmKind = kind => kind === 'loop' || kind === 'oneshot';

// ---------- 칸 목록 ----------
// common = core/sounds.json, entry = games/index.json의 게임 항목(없으면 공용만)
export function slotsFor(common, entry) {
  const ownGroups = [];
  const own = ((entry && entry.sound && entry.sound.slots) || []).map(s => {
    const gl = s.group || '게임 전용', gid = 'g:' + gl;
    if (!ownGroups.some(g => g.id === gid)) ownGroups.push({ id: gid, label: gl, own: true });
    return { ...s, group: gid, own: true, kind: s.kind || 'sfx' };
  });
  const groups = [...ownGroups, ...common.groups.map(g => ({ id: g.id, label: g.label }))];
  // 게임 전용이 공용과 같은 id면 게임 쪽이 이긴다(공용 칸은 목록에서 빠짐)
  const ids = new Set(own.map(s => s.id));
  const slots = [...own, ...common.slots.filter(s => !ids.has(s.id))];
  return { groups: groups.filter(g => slots.some(s => s.group === g.id)), slots };
}
// 이름(칸 id 또는 옛 합성음 이름)으로 칸 정의 찾기. 없으면 null
export function findSlot(list, name) {
  return list.slots.find(s => s.id === name) || list.slots.find(s => s.legacy && s.legacy.includes(name)) || null;
}

// ---------- 파일 이름 → 칸 ----------
// 'regicide-inferno.atk.mage-01.mp3' → {scope:'regicide-inferno', slot:'atk.mage', n:1}
// 'hit.heavy-02.ogg' → {scope:'all', slot:'hit.heavy', n:2}.  못 찾으면 {error}
export function parseSoundName(filename, ctx) {
  // ctx: { gameIds:[...], slotsOf: scope => 칸 id 목록(Set), defaultScope?: 이름에 게임이 없을 때 쓸 범위(기본 all) }
  const base0 = String(filename).split(/[\\/]/).pop().replace(/\.[A-Za-z0-9]{2,5}$/, '').trim().toLowerCase();
  const m = /^(.*?)[-_ ]?(\d{1,2})$/.exec(base0), base = m && m[1] ? m[1] : base0, n = m && m[1] ? +m[2] : 1;
  for (const g of [...ctx.gameIds].sort((a, b) => b.length - a.length)) {
    if (base.startsWith(g + '.')) {
      const slot = base.slice(g.length + 1);
      return ctx.slotsOf(g).has(slot) ? { scope: g, slot, n } : { error: `${g}에 '${slot}' 칸이 없어요` };
    }
  }
  const sc = ctx.defaultScope || 'all';   // 게임 이름이 안 붙은 파일은 지금 열어 둔 범위(게임 소리 창이면 그 게임)로
  return ctx.slotsOf(sc).has(base) ? { scope: sc, slot: base, n } : { error: `'${base}' 칸을 찾지 못했어요` };
}

// ---------- 파일 검사 ----------
export function checkSoundFile(file, kind) {
  const type = mimeOf(file.name, file.type);
  if (!type) throw new Error('mp3·ogg·wav·m4a 같은 소리 파일만 넣을 수 있어요');
  const max = isBgmKind(kind) ? SND_MAX_BGM : SND_MAX_SHORT;
  if (file.size > max) throw new Error(`파일이 너무 커요 (${(file.size / 1048576).toFixed(1)}MB / 최대 ${max / 1048576}MB): ${file.name}`);
  return type;
}

// ---------- 저장 ----------
export const getSlotRec = (storage, scope, slot) => storage.get('settings', sndKey(scope, slot));
export async function putSlotFiles(storage, scope, slot, files, { append = false, kind = 'sfx' } = {}) {
  const cur = append ? await getSlotRec(storage, scope, slot) : null;
  const list = [...((cur && cur.files) || [])];
  for (const f of files) {
    const type = checkSoundFile(f, kind);
    list.push({ name: f.name, size: f.size, type, blob: f instanceof Blob ? f : new Blob([f.data], { type }) });
  }
  if (isBgmKind(kind) && list.length > 1) list.splice(0, list.length - 1);   // BGM은 칸마다 한 곡
  if (list.length > SND_MAX_FILES) throw new Error(`한 칸에는 파일을 ${SND_MAX_FILES}개까지 넣을 수 있어요`);
  await storage.put('settings', sndKey(scope, slot), { files: list, gain: (cur && cur.gain) || 1, updatedAt: new Date().toISOString() });
}
export async function setSlotGain(storage, scope, slot, gain) {
  const cur = await getSlotRec(storage, scope, slot); if (!cur) return;
  await storage.put('settings', sndKey(scope, slot), { ...cur, gain: Math.min(2, Math.max(0.2, +gain || 1)), updatedAt: new Date().toISOString() });
}
export const delSlot = (storage, scope, slot) => storage.del('settings', sndKey(scope, slot));
// 한 범위의 저장된 칸 전부 → Map(slot → record)
export async function listScope(storage, scope) {
  const out = new Map(), pre = `snd:${scope}:`;
  for (const { key, value } of await storage.all('settings')) if (key.startsWith(pre) && value && Array.isArray(value.files) && value.files.length) out.set(key.slice(pre.length), value);
  return out;
}
export async function listAll(storage) {
  const out = [];
  for (const { key, value } of await storage.all('settings')) { const k = parseSndKey(key); if (k && value && Array.isArray(value.files) && value.files.length) out.push({ ...k, rec: value }); }
  return out;
}

// ---------- 옛 BGM(bgm:<범위>:<칸>, 데이터 주소) → 새 칸(snd:<범위>:bgm.<칸>, 파일 그대로) ----------
export async function migrateBgm(storage) {
  let n = 0;
  for (const { key, value } of await storage.all('settings')) {
    const m = /^bgm:([a-z0-9_-]{1,60}):(main|win|lose)$/.exec(key); if (!m) continue;
    try {
      if (value && typeof value.dataUrl === 'string') {
        const i = value.dataUrl.indexOf(','), mime = value.dataUrl.slice(5, i).split(';')[0] || 'audio/mpeg', bin = atob(value.dataUrl.slice(i + 1));
        const u8 = new Uint8Array(bin.length); for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
        const to = sndKey(m[1], 'bgm.' + m[2]);
        if (!(await storage.get('settings', to))) {   // 새 칸이 이미 있으면 그쪽을 존중
          await storage.put('settings', to, { files: [{ name: value.name || `${m[2]}.mp3`, size: u8.length, type: mime, blob: new Blob([u8], { type: mime }) }], gain: 1, updatedAt: value.updatedAt || new Date().toISOString() });
        }
        n++;
      }
      await storage.del('settings', key);   // 옮겼으면(또는 깨진 것이면) 옛 칸은 지운다
    } catch { /* 한 칸이 깨져도 나머지는 계속 */ }
  }
  return n;
}

// ---------- 소리 팩 (zip, 압축 없이 묶기) ----------
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
export function crc32(u8) { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; }
const enc = new TextEncoder(), dec = new TextDecoder();
const u16 = n => new Uint8Array([n & 255, (n >> 8) & 255]);
const u32 = n => new Uint8Array([n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255]);
// entries: [{name, data:Uint8Array}] → zip Blob
export function buildZip(entries) {
  const parts = [], central = []; let off = 0;
  for (const e of entries) {
    const nm = enc.encode(e.name), crc = crc32(e.data), size = e.data.length;
    const lh = [u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(nm.length), u16(0), nm];   // 0x0800 = 이름이 UTF-8
    parts.push(...lh, e.data);
    central.push([u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0x21), u32(crc), u32(size), u32(size), u16(nm.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(off), nm]);
    off += lh.reduce((a, b) => a + b.length, 0) + size;
  }
  const cdStart = off; let cdSize = 0;
  for (const c of central) { parts.push(...c); cdSize += c.reduce((a, b) => a + b.length, 0); }
  parts.push(u32(0x06054b50), u16(0), u16(0), u16(entries.length), u16(entries.length), u32(cdSize), u32(cdStart), u16(0));
  return new Blob(parts, { type: 'application/zip' });
}
// zip(ArrayBuffer) → [{name, data:Uint8Array}]  (압축 안 한 것과 deflate 둘 다 읽음)
export async function readZip(buf) {
  const u8 = new Uint8Array(buf), dv = new DataView(buf); let e = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 22 - 65535); i--) if (dv.getUint32(i, true) === 0x06054b50) { e = i; break; }
  if (e < 0) throw new Error('zip 파일이 아니에요');
  const n = dv.getUint16(e + 10, true); let p = dv.getUint32(e + 16, true); const out = [];
  if (n > 2000) throw new Error('파일이 너무 많아요');
  for (let k = 0; k < n; k++) {
    if (dv.getUint32(p, true) !== 0x02014b50) throw new Error('zip 구조가 손상됐어요');
    const flags = dv.getUint16(p + 8, true), method = dv.getUint16(p + 10, true), csize = dv.getUint32(p + 20, true), nl = dv.getUint16(p + 28, true), xl = dv.getUint16(p + 30, true), cl = dv.getUint16(p + 32, true), lo = dv.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl)); p += 46 + nl + xl + cl;
    if (name.endsWith('/') || /(^|\/)(__MACOSX|\.DS_Store|Thumbs\.db)/.test(name) || (flags & 1)) continue;
    const ds = lo + 30 + dv.getUint16(lo + 26, true) + dv.getUint16(lo + 28, true), raw = u8.subarray(ds, ds + csize);
    let data;
    if (method === 0) data = raw;
    else if (method === 8) {
      if (typeof DecompressionStream === 'undefined') throw new Error('이 브라우저는 압축된 zip을 풀 수 없어요');
      data = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
    } else continue;
    out.push({ name, data });
  }
  return out;
}
const extOf = f => (/\.([A-Za-z0-9]{2,5})$/.exec(f.name || '') || [])[1] || (Object.entries(BGM_MIME).find(([, m]) => m === f.type) || ['mp3'])[0];
// 저장된 소리 전부 → zip Blob. 이름 규칙: 공용 '칸-NN.확장자', 게임 '게임id.칸-NN.확장자' (그대로 다시 올리면 자동 분류)
export async function exportPack(storage) {
  const all = await listAll(storage), entries = [], slots = {};
  for (const { scope, slot, rec } of all) {
    const names = [];
    for (const [i, f] of rec.files.entries()) {
      const nm = `${scope === 'all' ? '' : scope + '.'}${slot}-${String(i + 1).padStart(2, '0')}.${extOf(f)}`;
      entries.push({ name: nm, data: new Uint8Array(await f.blob.arrayBuffer()) }); names.push(nm);
    }
    slots[`${scope}:${slot}`] = { gain: rec.gain || 1, files: names };
  }
  entries.push({ name: 'pack.json', data: enc.encode(JSON.stringify({ format: 'boardarchive-sound-pack', schemaVersion: 1, exportedAt: new Date().toISOString(), slots }, null, 1)) });
  return { blob: buildZip(entries), count: all.length, files: entries.length - 1 };
}
// 파일 여러 개(또는 소리 팩 zip)를 이름으로 분류해 저장. 같은 칸의 새 파일은 기존 것을 대체한다(같은 올리기 안에서는 모아서).
// files: [{name, type, size, blob?|data?}]  →  { added:[{scope,slot,n}], failed:[{name,why}], gains }
export async function importSoundFiles(storage, files, ctx) {
  const flat = [], failed = []; let gains = {};
  for (const f of files) {
    const bl = f instanceof Blob ? f : f.blob || (f.data ? new Blob([f.data]) : null);
    let head = []; try { head = bl ? new Uint8Array(await bl.slice(0, 4).arrayBuffer()) : []; } catch { /* 못 읽으면 확장자로만 판단 */ }
    const magicZip = head[0] === 0x50 && head[1] === 0x4b && head[2] === 3 && head[3] === 4;   // 이름에 .zip이 없어도(다운로드 임시 이름 등) zip이면 푼다
    if (magicZip || /\.zip$/i.test(f.name) || f.type === 'application/zip') {
      try {
        for (const z of await readZip(await (f instanceof Blob ? f : f.blob || new Blob([f.data])).arrayBuffer())) {
          if (z.name === 'pack.json') { try { const m = JSON.parse(dec.decode(z.data)); if (m && m.slots) gains = m.slots; } catch {} continue; }
          flat.push({ name: z.name, size: z.data.length, type: mimeOf(z.name, ''), data: z.data });
        }
      } catch (e) { failed.push({ name: f.name, why: e.message }); }
    } else flat.push(f);
  }
  const groups = new Map();
  for (const f of flat) {
    const r = parseSoundName(f.name, ctx);
    if (r.error) { failed.push({ name: f.name, why: r.error }); continue; }
    const k = `${r.scope}\u0000${r.slot}`; if (!groups.has(k)) groups.set(k, { ...r, items: [] });
    groups.get(k).items.push({ f, n: r.n });
  }
  const added = [];
  for (const g of groups.values()) {
    g.items.sort((a, b) => a.n - b.n || String(a.f.name).localeCompare(String(b.f.name)));
    const kind = ctx.kindOf(g.scope, g.slot);
    try {
      await putSlotFiles(storage, g.scope, g.slot, g.items.map(x => x.f), { kind });
      const gain = gains[`${g.scope}:${g.slot}`] && gains[`${g.scope}:${g.slot}`].gain; if (gain && gain !== 1) await setSlotGain(storage, g.scope, g.slot, gain);
      added.push({ scope: g.scope, slot: g.slot, n: g.items.length });
    } catch (e) { failed.push({ name: g.items[0].f.name, why: e.message }); }
  }
  return { added, failed };
}
