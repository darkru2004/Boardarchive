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
  const dim = typeof size === 'number' ? `width:${size}px;height:${size}px;font-size:${Math.round(size * 0.42)}px;` : '';
  const e = h('div', { class: 'av', style: `${dim}--c:${c.color}` }, img ? null : c.initial);
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
  const m = h('div', { class: 'modal', onclick: e => { if (e.target === m) close(); } }, h('div', { class: 'sheetm' }, content));
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

// ---- 장식(새로 그린 단순 도형): 넝쿨·잎·겹꽃 / 물방울 / 주사위 / 자물쇠 ----
const SVGNS = 'http://www.w3.org/2000/svg';
export function svgEl(markup) {
  const t = document.createElement('template'); t.innerHTML = markup.trim(); return t.content.firstChild;
}
export function ornament(width = 96, style = '') {
  const leaf = (x, y, r) => `<ellipse cx="${x}" cy="${y}" rx="6" ry="2.6" transform="rotate(${r} ${x} ${y})" fill="#5d6857"/>`;
  const bloom = (x, y, s) => `<g transform="translate(${x} ${y}) scale(${s})"><circle r="11" fill="#8f98aa"/><circle r="8" fill="#b4bccb"/><circle r="5.2" fill="#9aa3b6"/><circle r="2.6" fill="#c9d0dc"/></g>`;
  const el = svgEl(`<svg xmlns="${SVGNS}" class="orn" width="${width}" height="${Math.round(width * 0.7)}" viewBox="0 0 100 70" style="${style}" aria-hidden="true">
    <path d="M2 66C20 50 30 58 46 40S70 18 98 10" stroke="#4f5a4a" stroke-width="1.3" fill="none"/>
    ${leaf(18, 56, -30)}${leaf(30, 50, 30)}${leaf(52, 36, -40)}${leaf(64, 26, 20)}${leaf(80, 16, -20)}${bloom(14, 60, 1)}${bloom(32, 63, 0.75)}</svg>`);
  return el;
}
export function bubbles(list) {
  return list.map(([x, y, s]) => h('i', { class: 'bub', style: `left:${x};top:${y};width:${s}px;height:${s}px`, 'aria-hidden': 'true' }));
}
const PIPS = { 1: [[.5, .5]], 2: [[.28, .28], [.72, .72]], 3: [[.28, .28], [.5, .5], [.72, .72]], 4: [[.28, .28], [.72, .28], [.28, .72], [.72, .72]],
  5: [[.28, .28], [.72, .28], [.5, .5], [.28, .72], [.72, .72]], 6: [[.28, .25], [.72, .25], [.28, .5], [.72, .5], [.28, .75], [.72, .75]] };
export function dieSvg(n, size = 76) {
  const pts = PIPS[n] || [];
  return svgEl(`<svg xmlns="${SVGNS}" width="${size}" height="${size}" viewBox="0 0 1 1" role="img" aria-label="주사위 ${n || '?'}"><rect x=".05" y=".05" width=".9" height=".9" rx=".14" fill="#2e2d29"/>${pts.map(([x, y]) => `<circle cx="${x}" cy="${y}" r=".075" fill="#ebe7dc"/>`).join('')}${n ? '' : '<text x=".5" y=".64" font-size=".42" text-anchor="middle" fill="#ebe7dc" font-family="Georgia,serif">?</text>'}</svg>`);
}
export function lockSvg() {
  return svgEl(`<svg xmlns="${SVGNS}" width="22" height="26" viewBox="0 0 22 26" aria-hidden="true"><path d="M5 11V7a6 6 0 0 1 12 0v4" stroke="#5d5b54" stroke-width="2.4" fill="none"/><rect x="2" y="11" width="18" height="14" rx="2" fill="#5d5b54"/><circle cx="11" cy="17" r="2" fill="#cfcbbf"/></svg>`);
}
