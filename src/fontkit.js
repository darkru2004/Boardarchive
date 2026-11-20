// 사용자 폰트 적용: 게임 루트(또는 앨범 전체)의 --fk(본문)·--fd(제목·숫자) 변수만 바꾼다. 게임 CSS가 var(--fk)/var(--fd)를 쓰면 자동 적용.
import { getFont, loadPrefs, ALBUM_ID, isSafeFont } from '../core/fonts.js';

const loaded = new Map();   // fontId → 불러온 FontFace 이름(또는 null=실패)
export async function ensureFace(app, id) {
  if (loaded.has(id)) return loaded.get(id);
  let name = null;
  try {
    const f = await getFont(app.storage, id);
    if (f && isSafeFont(f.dataUrl)) {
      const face = new FontFace('baf-' + id, `url(${f.dataUrl})`); await face.load(); document.fonts.add(face); name = 'baf-' + id;
    }
  } catch (e) { console.warn('폰트를 불러오지 못함', id, e); }
  loaded.set(id, name); return name;
}
export const forgetFace = id => loaded.delete(id);

const FALL = 'system-ui,"Apple SD Gothic Neo","Noto Sans KR",sans-serif';
// el에 폰트 변수를 적용(선택이 없으면 변수를 지워 기본 서체로 돌아간다). 반환: 적용된 변수 목록
export async function applyFonts(app, gameId, el) {
  const p = (await loadPrefs(app.storage))[gameId] || {};
  const body = p.body ? await ensureFace(app, p.body) : null, title = p.title ? await ensureFace(app, p.title) : null;
  const set = (names, face) => { for (const n of names) { if (face) el.style.setProperty(n, `'${face}',${FALL}`); else el.style.removeProperty(n); } };
  set(['--fk', '--ufk'], body || null);
  set(['--fd', '--ufd'], title || body || null);   // 제목 폰트를 안 골랐으면 본문 폰트를 그대로 쓴다
  return { body: !!body, title: !!title };
}
export const applyAlbumFonts = app => applyFonts(app, ALBUM_ID, document.documentElement);
