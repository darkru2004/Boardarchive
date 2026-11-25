import { createIdbStorage, ensureDataSchema } from '../core/storage.js';
import { parseCharacters, makeLookup } from '../core/characters.js';
import { isSafePortrait } from '../core/backup.js';
import { loadSkins } from './skin.js';
import { h, toast } from './ui.js';
import { applyAlbumFonts } from './fontkit.js';
import { fxLabView } from './fxlab.js';
import { homeView, dexView, recordsView, gameRecordsView, settingsView, setupPanel } from './views.js';

const app = {
  fast: new URLSearchParams(location.search).has('fast'),
  storage: null, characters: [], lookup: null, charErrors: [], charactersVersion: null,
  achievementDefs: [], games: [], portraits: new Map(), view: null, tab: 'home',
  async loadPortraits() {
    app.portraits.clear();
    for (const { key, value } of await app.storage.all('portraits')) if (value && isSafePortrait(value.dataUrl)) app.portraits.set(key, value.dataUrl);
    await loadSkins(app);
  },
  goHome() { location.hash = '#/'; return app.render(); },
  startSetup(entry, count, holder) {
    if (app.tab !== 'home') return;
    holder = holder || document.getElementById('setupHolder');
    if (!holder) return;
    if (document.body.classList.contains('playing')) return;
    setupPanel(app, entry, count, holder);
  },
  async render() {
    const root = h('div', {});
    document.body.classList.remove('playing', 'wide', 'immersive');
    document.querySelectorAll('.gmenu').forEach(e => e.remove());
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    const [tab, sub] = (location.hash.replace('#/', '') || 'home').split('/');
    app.tab = tab === 'fxlab' ? 'settings' : ['home', 'dex', 'records', 'settings'].includes(tab) ? tab : 'home';   // 연출 시험장은 설정 아래 화면
    try {
      if (tab === 'fxlab') await fxLabView(app, root);
      else if (app.tab === 'records' && sub) await gameRecordsView(app, root, decodeURIComponent(sub));
      else await { home: homeView, dex: dexView, records: recordsView, settings: settingsView }[app.tab](app, root);
    } catch (e) { root.append(h('div', { class: 'banner' }, '화면 오류: ' + e.message)); console.error(e); }
    app.view.replaceChildren(root);
    renderNav();
    window.scrollTo(0, 0);
  }
};

function renderNav() {
  const items = [['home', 'PLAY', '게임'], ['dex', 'ALBUM', '도감'], ['records', 'RECORD', '기록'], ['settings', 'OPTION', '설정']];
  document.getElementById('nav').replaceChildren(...items.map(([k, en, ko]) =>
    h('a', { href: k === 'home' ? '#/' : `#/${k}`, class: app.tab === k ? 'on' : '', 'data-tab': k }, en, h('small', {}, ko))));
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
    app.achievementDefs = ach.achievements;
    // 개발 중단 게임(retired)은 앱에서 숨긴다. 기록 탭에서만 "개발 중단"으로 남는다. 테스트·점검용으로 localStorage ba_showretired=1이면 다 보인다.
    const showRetired = (() => { try { return localStorage.getItem('ba_showretired') === '1'; } catch { return false; } })();
    app.allGames = games.games;
    app.games = showRetired ? games.games : games.games.filter(g => !g.retired);
    await app.loadPortraits();
    try { await applyAlbumFonts(app); } catch { /* 폰트 실패는 기본 서체로 */ }
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
