import { createIdbStorage, ensureDataSchema } from '../core/storage.js';
import { parseCharacters, makeLookup } from '../core/characters.js';
import { isSafePortrait } from '../core/backup.js';
import { h, toast } from './ui.js';
import { homeView, dexView, recordsView, settingsView, setupPanel } from './views.js';

const app = {
  fast: new URLSearchParams(location.search).has('fast'),
  storage: null, characters: [], lookup: null, charErrors: [], charactersVersion: null,
  achievementDefs: [], games: [], portraits: new Map(), view: null, tab: 'home',
  async loadPortraits() {
    app.portraits.clear();
    for (const { key, value } of await app.storage.all('portraits')) if (value && isSafePortrait(value.dataUrl)) app.portraits.set(key, value.dataUrl);
  },
  goHome() { location.hash = '#/'; return app.render(); },
  startSetup(entry, count, holder) {
    holder = holder || document.getElementById('setupHolder');
    if (!holder) return;
    if (document.body.classList.contains('playing')) return;
    setupPanel(app, entry, count, holder);
  },
  async render() {
    const root = h('div', {});
    document.body.classList.remove('playing');
    const tab = location.hash.replace('#/', '') || 'home';
    app.tab = ['home', 'dex', 'records', 'settings'].includes(tab) ? tab : 'home';
    try {
      await { home: homeView, dex: dexView, records: recordsView, settings: settingsView }[app.tab](app, root);
    } catch (e) { root.append(h('div', { class: 'banner' }, '화면 오류: ' + e.message)); console.error(e); }
    app.view.replaceChildren(root);
    renderNav();
  }
};

function renderNav() {
  const items = [['home', '게임'], ['dex', '도감'], ['records', '기록'], ['settings', '설정']];
  document.getElementById('nav').replaceChildren(...items.map(([k, label]) =>
    h('a', { href: k === 'home' ? '#/' : `#/${k}`, class: app.tab === k ? 'on' : '', 'data-tab': k }, label)));
}

async function boot() {
  app.view = document.getElementById('view');
  try {
    app.storage = createIdbStorage();
    await ensureDataSchema(app.storage);
    const get = u => fetch(u).then(r => { if (!r.ok) throw new Error(`${u} 불러오기 실패`); return r.json(); });
    const [chars, ach, games] = await Promise.all([get('data/characters.json'), get('data/achievements.json'), get('games/index.json')]);
    const parsed = parseCharacters(chars);
    app.characters = parsed.characters; app.charErrors = parsed.errors; app.charactersVersion = parsed.dataVersion;
    app.lookup = makeLookup(app.characters);
    app.achievementDefs = ach.achievements; app.games = games.games;
    await app.loadPortraits();
    if (navigator.storage && navigator.storage.persist) { try { await navigator.storage.persist(); } catch { /* 무시 */ } }
  } catch (e) {
    app.view.replaceChildren(h('div', { class: 'banner' }, '앱을 시작하지 못했습니다: ' + e.message));
    console.error(e); return;
  }
  window.addEventListener('hashchange', () => app.render());
  window.__ba = app;                          // 자동 테스트·점검용
  await app.render();
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch(() => { /* 미리보기 환경 등에서는 실패해도 앱은 동작 */ });
  }
}
boot();
