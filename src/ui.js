// 화면 도우미. 텍스트는 항상 textContent로 넣어 데이터(캐릭터 이름·대사)가 코드로 해석되지 않게 한다.
export function h(tag, attrs, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v == null || v === false) continue;
    if (k === 'class') e.className = v;
    else if (k === 'style') e.style.cssText = v;
    else if (k.startsWith('on')) e.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) e.setAttribute(k, '');
    else e.setAttribute(k, v);
  }
  for (const kid of kids.flat(Infinity)) {
    if (kid == null || kid === false) continue;
    e.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
  }
  return e;
}

export function avatar(app, characterId, size = 44) {
  const c = characterId ? app.lookup(characterId) : { color: '#2a7de1', initial: '나' };
  const img = characterId ? app.portraits.get(characterId) : null;
  const e = h('div', { class: 'av', style: `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;background-color:${c.color}` }, img ? null : c.initial);
  if (img) e.style.backgroundImage = `url("${img}")`;
  return e;
}

export function toast(msg) {
  const box = document.getElementById('toast');
  const d = h('div', {}, msg);
  box.append(d);
  setTimeout(() => d.remove(), 3200);
}

export function modal(content, { onClose } = {}) {
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) close(); } }, h('div', { class: 'sheet' }, content));
  const close = () => { m.remove(); if (onClose) onClose(); };
  document.body.append(m);
  return { close, el: m };
}

// 이미지 파일 -> 정사각 중앙 크롭 192px JPEG data URL (초상화 저장용, 약 10~20KB)
export async function fileToPortrait(file, size = 192) {
  const bmp = await createImageBitmap(file);
  const s = Math.min(bmp.width, bmp.height);
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  cv.getContext('2d').drawImage(bmp, (bmp.width - s) / 2, (bmp.height - s) / 2, s, s, 0, 0, size, size);
  return cv.toDataURL('image/jpeg', 0.86);
}

export function downloadJson(obj, filename) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const a = h('a', { href: URL.createObjectURL(blob), download: filename });
  document.body.append(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500);
}

export const fmtDate = iso => new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
export const pct = v => `${Math.round(v * 100)}%`;
