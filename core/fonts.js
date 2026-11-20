// 사용자 폰트: 파일을 올려 기기 안(settings 칸)에 저장하고, 게임·앨범별로 "본문 / 제목·숫자" 폰트를 고른다.
// 저장: settings['font:<id>'] = {id,name,ext,size,dataUrl,updatedAt} · settings['fontPrefs'] = { <게임id 또는 '_album'>: {body,title} }
export const FONT_MAX_BYTES = 6 * 1024 * 1024;
export const FONT_EXT = ['ttf', 'otf', 'woff', 'woff2'];
export const ALBUM_ID = '_album';
export const isSafeFont = d => typeof d === 'string' && /^data:font\/(ttf|otf|woff2?);base64,/.test(d) && d.length < FONT_MAX_BYTES * 1.4;
export const fontKey = id => 'font:' + id;

export async function listFonts(storage) {
  return (await storage.all('settings')).filter(x => x.key.startsWith('font:')).map(x => x.value).sort((a, b) => (a.updatedAt || '').localeCompare(b.updatedAt || ''));
}
export const getFont = (storage, id) => storage.get('settings', fontKey(id));
export const saveFont = (storage, rec) => storage.put('settings', fontKey(rec.id), rec);
export const loadPrefs = async storage => (await storage.get('settings', 'fontPrefs')) || {};
export async function savePref(storage, gameId, slot, fontId) {
  const p = await loadPrefs(storage), cur = { ...(p[gameId] || {}) };
  if (fontId) cur[slot] = fontId; else delete cur[slot];
  if (cur.body || cur.title) p[gameId] = cur; else delete p[gameId];
  await storage.put('settings', 'fontPrefs', p);
}
// 폰트를 지우면 그 폰트를 가리키던 선택도 함께 지운다.
export async function deleteFont(storage, id) {
  await storage.del('settings', fontKey(id));
  const p = await loadPrefs(storage);
  for (const [g, v] of Object.entries(p)) { if (v.body === id) delete v.body; if (v.title === id) delete v.title; if (!v.body && !v.title) delete p[g]; }
  await storage.put('settings', 'fontPrefs', p);
}
export async function exportFonts(storage) {
  const fonts = {}; for (const f of await listFonts(storage)) fonts[f.id] = f;
  return { fonts, prefs: await loadPrefs(storage) };
}
// 같은 id는 더 늦게 저장된 쪽을 남기고, 형식이 이상한 폰트는 건너뛴다. 선택(prefs)은 비어 있는 곳만 채운다.
export async function importFonts(storage, data) {
  const sum = { added: 0, updated: 0, kept: 0, invalid: 0 };
  for (const [id, v] of Object.entries((data && data.fonts) || {})) {
    if (!/^[a-z0-9]{2,24}$/.test(id) || !v || v.id !== id || !isSafeFont(v.dataUrl)) { sum.invalid++; continue; }
    const cur = await getFont(storage, id);
    if (!cur) { await saveFont(storage, v); sum.added++; }
    else if ((v.updatedAt || '') > (cur.updatedAt || '')) { await saveFont(storage, v); sum.updated++; }
    else sum.kept++;
  }
  const p = await loadPrefs(storage), have = new Set((await listFonts(storage)).map(f => f.id));
  for (const [g, v] of Object.entries((data && data.prefs) || {})) {
    if (p[g]) continue;
    const c = {}; if (v.body && have.has(v.body)) c.body = v.body; if (v.title && have.has(v.title)) c.title = v.title;
    if (c.body || c.title) p[g] = c;
  }
  await storage.put('settings', 'fontPrefs', p);
  return sum;
}
