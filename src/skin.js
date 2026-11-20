// UI 틀(테두리 이미지) 스킨: 사용자가 올린 투명 PNG/WebP를 "9분할"(모서리는 그대로, 변·가운데만 늘림)로 화면·패널·버튼·카드에 씌운다.
// 저장: portraits 칸 `skin:<범위>:<칸>` = {dataUrl, slice(모서리 %), d(화면 두께 px), updatedAt}. 범위 = all(공용) 또는 게임 id. 게임 전용이 공용보다 우선.
// 적용: 게임 루트에 CSS 변수 --sk-<칸>(그림) --sk-<칸>-s(모서리 %) --sk-<칸>-d(두께)를 세팅. style.css의 [data-skin="칸"] 규칙이 그 변수를 쓴다.
//   · screen: 앱이 게임 화면 전체에 자동으로 씌운다(게임 수정 불필요).
//   · panel / button / card: 게임이 해당 요소에 data-skin="panel" 등을 달면 적용(안 달린 게임은 그대로).
import { h, toast } from './ui.js';

export const SKIN_SLOTS = [
  { id: 'screen', label: '게임 화면 전체', hint: '게임 화면 바깥을 두르는 큰 틀', d: 22, slice: 18 },
  { id: 'panel', label: '패널·상자·메시지창', hint: '게임 안의 정보창·상자. 가운데 색은 아래에서 정해요(그림 가운데가 비어 있어도 채워져요)', d: 16, slice: 18, bg: '#0b1830' },
  { id: 'button', label: '버튼 (그림 전체가 버튼 몸통)', hint: '가로로 긴 그림 권장. 글자는 앱이 위에 올려요. 아래 눌림·비활성이 없으면 자동으로 어둡게·흐리게 보여줘요', d: 10, slice: 30 },
  { id: 'button-down', label: '버튼 눌림 (선택)', hint: '눌렀을 때 쓸 그림. 없으면 평소 그림을 어둡게', sub: 'button' },
  { id: 'button-off', label: '버튼 비활성 (선택)', hint: '누를 수 없을 때 쓸 그림. 없으면 평소 그림을 흐리게', sub: 'button' },
  { id: 'card', label: '카드 테두리', hint: '카드 모양·크기는 그대로, 가장자리 위에 얹는 틀(가운데는 비워 둔 그림)', d: 8, slice: 14 },
  { id: 'bar', label: '게이지 바 틀', hint: '경보 같은 가로 바 위에 얹는 틀(크기 그대로, 가운데는 비워 둔 그림)', d: 6, slice: 30 },
];
export const SKIN_MAX_PX = 800;
export const skinKey = (scope, slot) => `skin:${scope}:${slot}`;
const clamp = (v, a, b, dflt) => { v = Number(v); return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : dflt; };

// 저장된 스킨(없으면 공용). 반환 {dataUrl, slice, d} 또는 null
export function findSkin(app, scope, slot) {
  const def = SKIN_SLOTS.find(s => s.id === slot); if (!def) return null;
  if (def.sub) {   // 눌림·비활성: 그림만 따로, 모서리·두께는 버튼 것을 따른다
    const par = findSkin(app, scope, def.sub);
    for (const sc of [scope, 'all']) { const r = app.skinRecs && app.skinRecs.get(skinKey(sc, slot)); if (r && r.dataUrl && par) return { dataUrl: r.dataUrl, slice: par.slice, d: par.d }; }
    return null;
  }
  for (const sc of [scope, 'all']) {
    const r = app.skinRecs && app.skinRecs.get(skinKey(sc, slot));
    if (r && r.dataUrl) return { dataUrl: r.dataUrl, slice: clamp(r.slice, 5, 45, def.slice), d: clamp(r.d, 2, 60, def.d), bg: /^#[0-9a-f]{6}$/i.test(r.bg || '') ? r.bg : def.bg };
  }
  return null;
}
// el에 스킨 변수를 적용(없으면 지움). 반환: 적용된 칸 id 목록
export function applySkins(app, gameId, el) {
  const on = [];
  for (const s of SKIN_SLOTS) {
    const k = findSkin(app, gameId, s.id);
    if (k) { el.style.setProperty(`--sk-${s.id}`, `url("${k.dataUrl}")`); el.style.setProperty(`--sk-${s.id}-s`, `${k.slice}%`); el.style.setProperty(`--sk-${s.id}-d`, `${k.d}px`); if (k.bg) el.style.setProperty(`--sk-${s.id}-bg`, k.bg); else el.style.removeProperty(`--sk-${s.id}-bg`); on.push(s.id); }
    else for (const v of ['', '-s', '-d', '-bg']) el.style.removeProperty(`--sk-${s.id}${v}`);
  }
  if (on.length) el.setAttribute('data-skins', on.join(' ')); else el.removeAttribute('data-skins');
  if (on.includes('screen')) el.setAttribute('data-skin', 'screen'); else if (el.getAttribute('data-skin') === 'screen') el.removeAttribute('data-skin');
  return on;
}
export async function loadSkins(app) {
  app.skinRecs = new Map();
  for (const { key, value } of await app.storage.all('portraits')) {
    if (!(key.startsWith('skin:') && value && value.dataUrl)) continue;
    let v = value;
    if (!v.trimmed) {   // 예전에 올린 그림: 투명한 바깥 여백을 한 번 잘라 틀이 가장자리에 딱 붙게 한다
      try { v = { ...v, dataUrl: await trimDataUrl(v.dataUrl), trimmed: true }; await app.storage.put('portraits', key, v); app.portraits.set(key, v.dataUrl); } catch { v = value; }
    }
    app.skinRecs.set(key, v);
  }
}
// 투명한 바깥 여백을 잘라낸다(틀이 그림 가장자리에 딱 붙도록)
function trimCanvas(cv) {
  const w = cv.width, h = cv.height, d = cv.getContext('2d').getImageData(0, 0, w, h).data;
  let x0 = w, y0 = h, x1 = -1, y1 = -1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (d[(y * w + x) * 4 + 3] > 12) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
  if (x1 < 0 || (x0 === 0 && y0 === 0 && x1 === w - 1 && y1 === h - 1)) return cv;
  const o = document.createElement('canvas'); o.width = x1 - x0 + 1; o.height = y1 - y0 + 1;
  o.getContext('2d').drawImage(cv, x0, y0, o.width, o.height, 0, 0, o.width, o.height); return o;
}
async function trimDataUrl(url) {
  const img = new Image(); img.src = url; await img.decode();
  const cv = document.createElement('canvas'); cv.width = img.naturalWidth; cv.height = img.naturalHeight; cv.getContext('2d').drawImage(img, 0, 0);
  return trimCanvas(cv).toDataURL('image/png');
}

// 올린 그림을 투명도를 유지한 채 긴 변 800px 이하로 줄여 PNG로 저장
export async function fileToSkin(file) {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, SKIN_MAX_PX / Math.max(bmp.width, bmp.height));
  const cv = document.createElement('canvas'); cv.width = Math.round(bmp.width * k); cv.height = Math.round(bmp.height * k);
  cv.getContext('2d').drawImage(bmp, 0, 0, cv.width, cv.height);
  return trimCanvas(cv).toDataURL('image/png');
}
async function putSkin(app, scope, slot, patch) {
  const key = skinKey(scope, slot), cur = app.skinRecs.get(key) || {};
  const def = SKIN_SLOTS.find(s => s.id === slot);
  const rec = { dataUrl: cur.dataUrl, slice: def.slice, d: def.d, ...cur, ...patch, trimmed: true, updatedAt: new Date().toISOString() };
  await app.storage.put('portraits', key, rec); app.portraits.set(key, rec.dataUrl); app.skinRecs.set(key, rec);
  return rec;
}
async function delSkin(app, scope, slot) { const key = skinKey(scope, slot); await app.storage.del('portraits', key); app.portraits.delete(key); app.skinRecs.delete(key); }

// 설정 화면 카드. games = app.games(이름 목록)
export function skinCard(app, games, plainName = n => n) {
  const card = h('div', { class: 'paper', id: 'skinCard', style: '--r:.3deg' });
  let scope = 'all';
  const draw = () => {
    const sel = h('select', { id: 'skinScope', onchange: e => { scope = e.target.value; draw(); } },
      h('option', { value: 'all', selected: scope === 'all' }, '공용 (모든 게임)'), ...games.map(g => h('option', { value: g.id, selected: scope === g.id }, plainName(g.name))));
    card.replaceChildren(
      h('div', { class: 'row', style: 'gap:6px;align-items:center' }, h('b', { class: 'grow' }, '적용 범위'), h('div', { style: 'width:55%' }, sel)),
      h('div', { class: 'muted', style: 'margin:6px 0' }, '투명 배경 PNG·WebP 한 장을 올리면 모서리는 그대로 두고 변·가운데만 늘려서 어떤 크기에도 씁니다. 게임 전용 틀이 있으면 공용보다 우선해요. 글자는 그림에 넣지 마세요.'),
      ...SKIN_SLOTS.map(s => {
        const own = app.skinRecs.get(skinKey(scope, s.id)), eff = findSkin(app, scope, s.id);
        const file = h('input', { type: 'file', accept: 'image/png,image/webp', style: 'display:none', 'data-f': s.id, onchange: async e => {
          const f = e.target.files[0]; e.target.value = ''; if (!f) return;
          try { await putSkin(app, scope, s.id, { dataUrl: await fileToSkin(f) }); toast('틀을 저장했어요' + (scope === 'all' ? '' : ' (게임을 새로 열면 적용)')); draw(); } catch { toast('그림을 읽을 수 없어요'); }
        } });
        const prev = h('div', { class: 'skprev' });
        const paint = r => { if (r) { prev.style.borderWidth = r.d + 'px'; prev.style.borderImage = `url("${r.dataUrl}") ${r.slice}% fill / ${r.d}px stretch`; } else { prev.style.borderImage = 'none'; prev.style.borderWidth = '0'; } };
        paint(eff);
        const num = (name, lbl, a, b, val) => h('label', { class: 'sknum' }, lbl, h('input', { type: 'number', min: a, max: b, step: 1, value: val, 'data-n': name, disabled: !own, onchange: async e => {
          const v = clamp(e.target.value, a, b, val); e.target.value = v; paint(await putSkin(app, scope, s.id, { [name]: v }));
        } }));
        const bgIn = s.bg && own ? h('label', { class: 'sknum' }, '가운데 색', h('input', { type: 'color', 'data-n': 'bg', value: /^#[0-9a-f]{6}$/i.test(own.bg || '') ? own.bg : s.bg, onchange: async e => { await putSkin(app, scope, s.id, { bg: e.target.value }); } })) : null;
        return h('div', { class: 'skslot', 'data-slot': s.id },
          h('div', { class: 'row', style: 'gap:6px;align-items:center' }, h('b', { class: 'grow' }, s.label), h('small', {}, own ? '이 범위에 저장됨' : eff ? '공용 사용 중' : '없음 (기본 모양)'),
            h('button', { class: 'btn small', onclick: () => file.click() }, own ? '바꾸기' : '올리기'), own ? h('button', { class: 'btn small', onclick: async () => { await delSkin(app, scope, s.id); draw(); } }, '지우기') : null, file),
          h('div', { class: 'muted', style: 'font-size:11px' }, s.hint),
          eff ? h('div', { class: 'row', style: 'gap:10px;align-items:center;margin-top:6px' }, prev, own && !s.sub ? h('div', {}, num('slice', '모서리 %', 5, 45, own.slice ?? s.slice), num('d', '화면 두께 px', 2, 60, own.d ?? s.d), bgIn) : null) : null);
      }));
  };
  draw();
  return card;
}
