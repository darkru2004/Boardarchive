// 게임별 일러스트 슬롯: 사용자가 올린 그림을 portraits 칸에 `art:<게임id>:<그룹>:<번호>` 키로 저장한다.
// 게임은 ctx.art(그룹) → 그림 주소 배열만 받는다(없으면 빈 배열 → 게임이 기본 그림을 쓴다).
import { h, modal, toast, fileToCover } from './ui.js';

export const artKey = (gameId, group, n) => `art:${gameId}:${group}:${String(n).padStart(2, '0')}`;
export function artList(app, gameId, group) {
  const pre = `art:${gameId}:${group}:`;
  return [...app.portraits.keys()].filter(k => k.startsWith(pre)).sort().map(k => app.portraits.get(k));
}
const slotsOf = (app, gameId, group) => [...app.portraits.keys()].filter(k => k.startsWith(`art:${gameId}:${group.id}:`)).sort();

async function saveArt(app, entry, grp, file, n) {
  const dataUrl = await fileToCover(file, grp.w, grp.h);
  const key = artKey(entry.id, grp.id, n);
  await app.storage.put('portraits', key, { dataUrl, updatedAt: new Date().toISOString() });
  app.portraits.set(key, dataUrl);
}
function freeSlot(app, entry, grp) {
  for (let n = 1; n <= grp.max; n++) if (!app.portraits.has(artKey(entry.id, grp.id, n))) return n;
  return null;
}

export function openArtManager(app, entry) {
  const groups = (entry.art && entry.art.groups) || [];
  let m;
  const body = h('div', { class: 'artm', id: 'artManager' });
  const redraw = () => {
    body.replaceChildren(
      h('h3', { style: 'margin:0 0 4px' }, `${entry.name.replace(/\s*\(.*\)\s*$/, '')} · 카드 일러스트`),
      h('div', { class: 'muted', style: 'margin-bottom:8px' }, '그림이 없는 칸은 기본 그림이 그대로 나와요. 같은 그룹에 여러 장을 올리면 카드마다 돌려 써요. 규칙 숫자·비용은 앱이 그림 위에 그려요.'),
      h('div', { class: 'row wrap', style: 'gap:6px;margin-bottom:8px' },
        h('button', { class: 'btn small go', id: 'artBulk', onclick: () => bulk.click() }, '여러 장 한꺼번에'),
        h('small', { style: 'align-self:center' }, '파일 이름이 card-r-01.png 처럼 그룹 이름으로 시작하면 자동으로 분류해요')),
      ...groups.map(g => {
        const keys = slotsOf(app, entry.id, g);
        const one = document.createElement('input'); one.type = 'file'; one.accept = 'image/*'; one.multiple = g.max > 1; one.style.display = 'none';
        one.onchange = async e => {
          const files = [...e.target.files]; e.target.value = ''; let ok = 0;
          for (const f of files) { const n = g.max === 1 ? 1 : freeSlot(app, entry, g); if (n == null) { toast(`${g.label}: 최대 ${g.max}장이에요`); break; } try { await saveArt(app, entry, g, f, n); ok++; } catch {} }
          if (ok) toast(`${ok}장 저장했어요`); redraw();
        };
        return h('div', { class: 'artg', 'data-g': g.id },
          h('div', { class: 'row', style: 'align-items:center;gap:6px' }, h('b', { class: 'grow' }, g.label), h('small', {}, `${keys.length}/${g.max}`),
            h('button', { class: 'btn small', onclick: () => one.click() }, g.max === 1 && keys.length ? '바꾸기' : '추가'), one),
          h('div', { class: 'muted', style: 'font-size:11px' }, `${g.hint || ''} · 권장 ${g.w * 1.5}×${g.h * 1.5}px (자동으로 ${g.w}×${g.h}로 줄여 저장)`),
          keys.length ? h('div', { class: 'row wrap', style: 'gap:6px;margin-top:5px' }, ...keys.map(k => h('div', { class: 'athumb', style: `background-image:url(${app.portraits.get(k)})`, 'data-k': k },
            h('button', { class: 'ax', 'aria-label': '지우기', onclick: async () => { await app.storage.del('portraits', k); app.portraits.delete(k); redraw(); } }, '×')))) : null);
      }),
      h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn go grow', onclick: () => m.close() }, '닫기')), bulk);
  };
  const bulk = document.createElement('input'); bulk.type = 'file'; bulk.accept = 'image/*'; bulk.multiple = true; bulk.style.display = 'none'; bulk.id = 'artBulkFile';
  bulk.onchange = async e => {
    const files = [...e.target.files]; e.target.value = ''; let ok = 0, miss = 0;
    const byLen = groups.slice().sort((a, b) => b.id.length - a.id.length);
    for (const f of files) {
      const name = f.name.toLowerCase().replace(/\.[a-z0-9]+$/, '');
      const g = byLen.find(x => name === x.id || name.startsWith(x.id + '-') || name.startsWith(x.id + '_'));
      if (!g) { miss++; continue; }
      const num = (name.slice(g.id.length).match(/\d+/) || [])[0];
      let n = num ? +num : null;
      if (g.max === 1) n = 1; else if (!n || n < 1 || n > g.max) n = freeSlot(app, entry, g);
      if (n == null) { miss++; continue; }
      try { await saveArt(app, entry, g, f, n); ok++; } catch { miss++; }
    }
    toast(`${ok}장 저장${miss ? ` · ${miss}장은 이름을 못 알아봤거나 자리가 없어요` : ''}`); redraw();
  };
  m = modal(body, { onClose: () => app.render() });
  redraw();
  return m;
}
