import { h, avatar, modal, toast, fileToPortrait, fileToCover, downloadJson, fmtDate, pct, ornament, bubbles, dieSvg, lockSvg } from './ui.js';
import { TRAIT_KEYS, TRAIT_LABELS, TARGET_LABELS, APP_VERSION, SCHEMA } from '../core/schema.js';
import { drawSeats, DIFFICULTIES, DIFF_LABEL } from '../core/seating.js';
import { makeRng } from '../core/rng.js';
import { listRecords } from '../core/records.js';
import { filterByDifficulty, overall, gameStats, characterStats, botStats, coopStats, isCoop, computeAchievements } from '../core/stats.js';
import { exportBackup, parseBackup, importBackup, migrateBackup, exportImages, parseImages, importImages } from '../core/backup.js';
import { activeOnly } from '../core/characters.js';
import { openArtManager } from './art.js';
import { skinCard } from './skin.js';
import { listFonts, saveFont, deleteFont, loadPrefs, savePref, isSafeFont, ALBUM_ID, FONT_MAX_BYTES, FONT_EXT } from '../core/fonts.js';
import { applyAlbumFonts, forgetFace, ensureFace } from './fontkit.js';
import { bgmCard } from './bgm.js';
export { recordsView, gameRecordsView } from './recviews.js';
import { launchGame, achCtx, AUTO_SLOT } from './host.js';
import { makeFx, fxPrefs } from './fx.js';
import { loadCampaign, deleteCampaign } from '../core/storage.js';

export const BACKUP_NUDGE_EVERY = 10;
const top = (title, sub, recHtml) => {
  const r = h('div', { class: 'rec' }); r.innerHTML = recHtml || '';
  return h('div', { class: 'top' }, h('div', { class: 'brand' }, title, h('small', {}, sub)), r);
};
const plainName = n => n.replace(/\s*\(.*\)\s*$/, '');

// ================= 홈: 스테이지(게임) 선택 =================
export async function homeView(app, root) {
  const recs = await listRecords(app.storage);
  const ov = overall(recs), gs = gameStats(recs), cs = coopStats(recs).byGame;
  root.append(top('Archive', '보드게임 기록관', `<b>${ov.wins}</b> / ${ov.played}<br>WIN`));
  const meta = (await app.storage.get('settings', 'backupMeta')) || { recordsAt: 0, lastAt: null };
  if (recs.length - meta.recordsAt >= BACKUP_NUDGE_EVERY) {
    root.append(h('div', { class: 'paper taped banner', style: '--r:-1deg' }, `마지막 백업 이후 ${recs.length - meta.recordsAt}판이 쌓였어요. 설정에서 백업 파일을 만들어 두세요.`));
  }
  const st = (g) => (g.mode === 'coop' ? (cs[g.id] && { wins: cs[g.id].wins }) : gs[g.id]);
  const prefs = await homePrefs(app);
  const count = (id) => recs.filter(r => r.gameId === id).length;
  const order = app.games.map((g, i) => ({ g, i }));
  let favs;
  if (prefs.mode === 'pin') {
    const pinned = prefs.pins.map(id => order.find(o => o.g.id === id)).filter(Boolean);
    favs = pinned.slice(0, prefs.count);
  } else {
    favs = order.filter(o => count(o.g.id) > 0).sort((a, b) => count(b.g.id) - count(a.g.id) || a.i - b.i).slice(0, prefs.count);
  }
  if (favs.length < Math.min(prefs.count, order.length) && prefs.mode !== 'pin') favs = favs.concat(order.filter(o => !favs.includes(o)).slice(0, prefs.count - favs.length));
  const rest = order.filter(o => !favs.includes(o));
  // 이어하기: 저장된 판이 있는 게임(AUTO_SLOT) 모으기
  const resumes = new Map();
  for (const g of app.games) { try { const r = await loadCampaign(app.storage, g.id, AUTO_SLOT); if (r && r.data && Array.isArray(r.data.seats)) resumes.set(g.id, r); } catch {} }
  const lock = h('div', { class: 'lockcard' }, h('b', {}, 'LOCKED'), lockSvg(), h('span', {}, '다음 게임 자리'));
  const wrap = h('div', { style: 'position:relative' });
  // 분류 칩: 전체 / 경쟁 / 협력 / 1인 (마지막 선택 기억)
  const FILTERS = [['all', '전체', () => true], ['vs', '경쟁', g => g.mode !== 'coop'], ['coop', '협력', g => g.mode === 'coop'], ['solo', '1인', g => g.players.max === 1]];
  let hf = 'all'; try { const v = localStorage.getItem('ba_homefilter'); if (FILTERS.some(f => f[0] === v)) hf = v; } catch {}
  const chips = h('div', { class: 'homechips', id: 'homeFilter' }, ...FILTERS.map(([k, n, fn]) => h('button', { class: 'btn small' + (hf === k ? ' on' : ''), 'data-hf': k,
    onclick: () => { try { localStorage.setItem('ba_homefilter', k); } catch {} app.render(); } }, n, h('small', {}, String(app.games.filter(fn).length)))));
  wrap.append(chips);
  if (resumes.size) wrap.append(h('h2', { class: 'secH' }, 'Continue', h('small', {}, '이어서 하기')),
    h('div', { class: 'paper resumebox', id: 'resumeList', style: '--r:-.4deg' }, ...[...resumes].map(([id, r]) => {
      const g = app.games.find(x => x.id === id), d = r.data;
      return h('div', { class: 'row rsrow', 'data-g': id, style: 'gap:8px;align-items:center;padding:6px 0;border-bottom:1px dashed #00000020' },
        h('div', { class: 'grow' }, h('b', {}, plainName(g.name)), h('div', { class: 'muted', style: 'font-size:11px' }, `${d.seats.length}인${d.state && d.state.round ? ` · ${d.state.round}라운드` : ''} · ${fmtDate(r.updatedAt)}`)),
        h('button', { class: 'btn small go', onclick: () => launchGame(app, g, d.seats, d.difficulty || null, r).catch(e => toast('실행 오류: ' + e.message)) }, '이어하기'));
    })));
  const gc = (o, compact) => gameCard(app, o.g, o.i, st(o.g), compact, resumes.has(o.g.id));
  if (hf !== 'all') {
    const fn = FILTERS.find(f => f[0] === hf)[2], list = order.filter(o => fn(o.g));
    wrap.append(h('h2', { class: 'secH' }, FILTERS.find(f => f[0] === hf)[1], h('small', {}, `${list.length}개 게임`)),
      h('div', { class: 'ggrid', id: 'allGrid' }, ...list.map(o => gc(o, false))));
  } else {
    if (favs.length) wrap.append(h('h2', { class: 'secH' }, 'Favorites', h('small', {}, prefs.mode === 'pin' ? '고정한 게임' : '자주 하는 게임')),
      h('div', { class: 'ggrid compact', id: 'favGrid' }, ...favs.map(o => gc(o, true))));
    wrap.append(rest.length ? h('h2', { class: 'secH' }, 'All Games', h('small', {}, '전체 게임')) : null,
      h('div', { class: 'ggrid' + (rest.length ? '' : ' compact'), id: 'allGrid' }, ...rest.map(o => gc(o, false)), lock));
  }
  wrap.append(ornament(92, 'left:-12px;top:205px;transform:rotate(-8deg)'), ornament(84, 'right:-6px;top:250px;transform:scaleX(-1) rotate(-6deg)'),
    ...bubbles([['46%', '20px', 14], ['49%', '6px', 8], ['8%', '62%', 10], ['88%', '4px', 11]]));
  root.append(wrap, h('div', { id: 'setupHolder', style: 'margin-top:22px' }));
}

// 홈 표시 설정: mode 'auto'(플레이 횟수 순) | 'pin'(직접 고정), count 6|8, pins [gameId]
export async function homePrefs(app) {
  const p = (await app.storage.get('settings', 'homePrefs')) || {};
  return { mode: p.mode === 'pin' ? 'pin' : 'auto', count: p.count === 8 ? 8 : 6, pins: Array.isArray(p.pins) ? p.pins : [] };
}
const coverKey = id => 'game:' + id;

function gameCard(app, g, i, st, compact = false, resume = false) {
  const maxN = Math.min(g.players.max, activeOnly(app.characters).length + 1);
  const can = maxN >= g.players.min;
  const status = !can ? 'LOCK' : st ? (st.wins ? 'CLEAR' : 'PLAYED') : 'NEW';
  const th = g.theme || null;     // 게임별 표지 (games/index.json의 theme)
  const pic = th ? h('span', { class: 'big cover', style: `color:${th.accent}` }, th.glyph || plainName(g.name).slice(0, 1))
    : h('span', { class: 'big' }, plainName(g.name).slice(0, 1));
  const cover = app.portraits.get(coverKey(g.id));
  return h('button', { class: 'pol gcard' + (compact ? ' compact' : '') + (cover ? ' hasimg' : ''), 'data-id': g.id, 'aria-label': `${g.name} 플레이`, disabled: !can,
    onclick: () => can && app.startSetup(g, g.players.min) },
    h('div', { class: 'no' }, String(i + 1).padStart(2, '0')),
    h('div', { class: 'st' }, status, g.test ? h('span', { class: 'tag test' }, 'TEST') : null, g.mode === 'coop' ? h('span', { class: 'tag test' }, '협력') : null, resume ? h('span', { class: 'tag resume' }, '이어하기') : null),
    h('div', { class: 'pic', style: cover ? `background:#111 url(${cover}) center/cover no-repeat` : th && th.table ? `background:radial-gradient(80% 70% at 40% 35%,${th.table},${th.table2 || th.table})` : '' }, cover ? null : pic),
    h('div', { class: 'ttl' }, plainName(g.name)),
    h('div', { class: 'meta' }, can ? `${g.players.min}~${g.players.max}인` : '캐릭터 부족'));
}

export function setupPanel(app, entry, count, holder) {
  const rng = makeRng();
  const maxN = Math.min(entry.players.max, activeOnly(app.characters).length + 1);
  let diff = (() => { try { const d = localStorage.getItem('ba_diff'); return DIFFICULTIES.includes(d) ? d : 'random'; } catch { return 'random'; } })();
  const draw = () => drawSeats({ characters: app.characters, count, rng, difficulty: diff, gameId: entry.id });
  let seats = draw();
  const box = h('div', { class: 'paper taped', id: 'setup', style: '--r:.5deg' });
  const render = () => {
    box.replaceChildren(
      h('h3', {}, `${plainName(entry.name)} · 자리 뽑기`),
      h('div', { class: 'cnt' }, ...Array.from({ length: maxN - entry.players.min + 1 }, (_, i) => entry.players.min + i).map(n =>
        h('button', { class: 'btn small' + (n === count ? ' on' : ''), 'data-n': n, onclick: () => { count = n; seats = draw(); render(); } }, `${n}인`))),
      entry.mode === 'coop' ? h('div', { class: 'muted', style: 'margin:6px 0' }, '협력 게임: 캐릭터들이 한 팀이에요. 난이도는 게임 안에서 고릅니다.') : h('div', { class: 'cnt diff' }, h('small', { style: 'margin-right:6px' }, '난이도'), ...DIFFICULTIES.map(d =>
        h('button', { class: 'btn small' + (d === diff ? ' on' : ''), 'data-d': d, onclick: () => { diff = d; try { localStorage.setItem('ba_diff', d); } catch {} seats = draw(); render(); } }, DIFF_LABEL[d]))),
      h('div', { class: 'seats', style: 'background:#00000030;padding:12px 6px 8px' }, ...seats.map(s => h('div', { class: 'th seat' + (s.human ? ' me' : '') },
        avatar(app, s.characterId, 58), s.human ? '나' : app.lookup(s.characterId).name.split(' ').pop(), h('small', {}, `${s.seat + 1}번 자리`)))),
      h('div', { class: 'muted', style: 'margin-bottom:10px' }, entry.mode === 'coop' || diff === 'random' ? '함께할 캐릭터와 자리 순서는 판마다 무작위로 정해져요. 1번 자리부터 시작합니다.' : `${DIFF_LABEL[diff]}: 이 게임에서 실력이 ${diff === 'easy' ? '낮은' : diff === 'hard' ? '높은' : '중간인'} 캐릭터들이 앉아요. (봇 수준은 그대로)`),
      h('div', { class: 'row' },
        h('button', { class: 'btn small', id: 'btnRec', onclick: () => { location.hash = '#/records/' + entry.id; } }, '기록', h('small', {}, 'RECORD')),
        h('button', { class: 'btn', onclick: () => { seats = draw(); render(); } }, '다시 뽑기', h('small', {}, 'SHUFFLE')),
        h('button', { class: 'btn go grow', id: 'btnStart', onclick: () => launchGame(app, entry, seats, entry.mode === 'coop' ? null : diff).catch(e => toast('실행 오류: ' + e.message)) }, '시작', h('small', {}, 'START'))));
  };
  render();
  holder.replaceChildren(box);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  resumeNote(app, entry, holder);
}

// 이어하기: 끝나지 않은 판이 저장되어 있으면 자리 뽑기 위에 쪽지로 보여 준다(새로 시작하면 덮어씀)
async function resumeNote(app, entry, holder) {
  let rec = null;
  try { rec = await loadCampaign(app.storage, entry.id, AUTO_SLOT); } catch { rec = null; }
  if (!rec || !rec.data || !Array.isArray(rec.data.seats) || !holder.isConnected) return;
  const d = rec.data, names = d.seats.filter(x => !x.human).map(x => app.lookup(x.characterId).name.split(' ').pop()).join(' · ');
  const box = h('div', { class: 'paper taped', id: 'resume', style: '--r:-.6deg;margin-bottom:14px' },
    h('h3', {}, '이어서 하기'),
    h('div', { class: 'muted', style: 'margin-bottom:10px' }, `${d.seats.length}인 · ${names}${d.state && d.state.round ? ` · ${d.state.round}라운드` : ''} · ${fmtDate(rec.updatedAt)} 저장`),
    h('div', { class: 'row' },
      h('button', { class: 'btn', onclick: async () => { await deleteCampaign(app.storage, entry.id, AUTO_SLOT); box.remove(); toast('저장된 판을 지웠어요'); } }, '지우기', h('small', {}, 'DELETE')),
      h('button', { class: 'btn go grow', id: 'btnResume', onclick: () => launchGame(app, entry, d.seats, d.difficulty || null, rec).catch(e => toast('실행 오류: ' + e.message)) }, '이어하기', h('small', {}, 'CONTINUE'))),
    h('div', { class: 'muted', style: 'margin-top:8px;font-size:12px' }, '아래에서 새로 시작하면 저장된 판은 지워져요.'));
  holder.prepend(box);
}

// ================= 도감: 캐릭터 셀렉트 =================
export async function dexView(app, root) {
  const recs = await listRecords(app.storage);
  const cs = characterStats(recs);
  const met = app.characters.filter(c => cs[c.id]).length;
  root.append(top('Album', '인물 도감', `<b>${met}</b> / ${app.characters.length}<br>MET`));
  if (!app.characters.length) { root.append(h('div', { class: 'paper' }, '캐릭터 데이터가 없습니다.')); return; }
  const sel = app.characters.find(c => c.id === app.dexSel) || app.characters[0];
  const st = cs[sel.id];
  const rank = sel.traits.skill >= 9 ? 'S' : sel.traits.skill >= 7 ? 'A' : 'B';
  const rivals = sel.relations.filter(r => r.type === 'rival').map(r => app.lookup(r.id).name.split(' ').pop());
  const line = (sel.lines.win || sel.lines.start || [])[0];
  const input = h('input', { type: 'file', accept: 'image/*', style: 'display:none', id: 'portraitFile', onchange: async e => {
    const f = e.target.files[0]; if (!f) return;
    try {
      const dataUrl = await fileToPortrait(f);
      await app.storage.put('portraits', sel.id, { dataUrl, updatedAt: new Date().toISOString() });
      app.portraits.set(sel.id, dataUrl); toast('초상화를 저장했어요'); app.render();
    } catch (err) { toast('이미지를 읽지 못했어요: ' + err.message); }
  } });
  const heroAv = avatar(app, sel.id, 'css');
  root.append(h('div', { class: 'dexstage' },
    h('div', { class: 'pol sel hero', style: 'cursor:default' },
      h('div', { class: 'no' }, rank), h('div', { class: 'st' }, rivals.length ? `RIVAL · ${rivals.join(', ')}` : ''),
      h('div', { class: 'pic' }, heroAv, app.portraits.has(sel.id) ? null : h('span', { class: 'lbl' }, 'PORTRAIT')),
      h('div', { class: 'ttl' }, sel.name), h('div', { class: 'meta' }, TARGET_LABELS[sel.traits.targetMode])),
    h('div', { class: 'paper sheet' }, h('h4', {}, sel.name),
      h('div', { class: 'rk' }, st ? `rank ${rank} · ${st.met}전 · 내가 ${st.myWins}승 ${st.myLosses}패` : `rank ${rank} · 미대면`),
      ...TRAIT_KEYS.map(k => h('div', { class: 'stat' }, h('b', {}, TRAIT_LABELS[k]), h('div', {}, h('i', { style: `width:${sel.traits[k] * 10}%` }))))),
    line ? h('div', { class: 'paper taped quote' }, line, h('em', {}, sel.lines.win ? '이겼을 때' : '시작할 때')) : null,
    ornament(80, 'left:44%;top:300px'), ...bubbles([['82%', '70px', 14], ['87%', '52px', 8], ['4%', '300px', 10]])));
  root.append(h('div', { class: 'row', style: 'justify-content:center;margin:6px 0 18px' },
    h('button', { class: 'btn go small', onclick: () => input.click() }, app.portraits.has(sel.id) ? '초상화 바꾸기' : '초상화 넣기'),
    app.portraits.has(sel.id) ? h('button', { class: 'btn small', onclick: async () => { await app.storage.del('portraits', sel.id); app.portraits.delete(sel.id); toast('초상화를 지웠어요'); app.render(); } }, '지우기') : null, input));
  root.append(h('div', { class: 'thumbs', style: 'background:#00000026;padding:14px 8px 10px' }, ...app.characters.map(c =>
    h('button', { class: 'th dex' + (c.id === sel.id ? ' on' : ''), 'data-id': c.id, onclick: () => { app.dexSel = c.id; app.render(); } },
      avatar(app, c.id, 62), c.name.split(' ').pop(), h('small', {}, c.status === 'retired' ? '퇴역' : cs[c.id] ? `${cs[c.id].met}판` : '미대면')))));
  root.append(h('p', { class: 'muted', style: 'margin:12px 4px' }, '초상화는 이 기기에 저장되고 백업 파일에 함께 담깁니다.'));
}

// ================= 설정: 백업·저장 상태 =================
export async function settingsView(app, root) {
  root.append(top('Option', '설정', ''));
  // 설정은 탭 4개로 나눈다: 일반 / 홈 / 꾸미기 / 데이터 (마지막으로 본 탭을 기억)
  const TABS = [['general', '일반'], ['home', '홈'], ['deco', '꾸미기'], ['data', '데이터']];
  const P = Object.fromEntries(TABS.map(([k]) => [k, h('div', { class: 'spane', 'data-pane': k })]));
  let curTab = 'general'; try { const t = localStorage.getItem('ba_settab'); if (P[t]) curTab = t; } catch {}
  const showTab = k => { curTab = k; try { localStorage.setItem('ba_settab', k); } catch {} for (const [id, el] of Object.entries(P)) el.hidden = id !== k; bar.querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.st === k)); };
  const bar = h('div', { class: 'settabs', id: 'settabs' }, ...TABS.map(([k, n]) => h('button', { class: 'btn small', 'data-st': k, onclick: () => showTab(k) }, n)));
  root.append(bar, ...Object.values(P));
  // 게임 연출 켜기/끄기 (기기에 저장)
  const fxRow = (key, label, get) => h('button', { class: 'btn small' + (get() ? ' on' : ''), 'data-fx': key, onclick: ev => {
    const on = !get(); fxPrefs.set(key, on); ev.currentTarget.classList.toggle('on', on); ev.currentTarget.lastChild.textContent = on ? '켜짐' : '꺼짐';
    if (on && key === 'ba_sfx') makeFx().sfx('chips'); if (on && key === 'ba_haptic') makeFx().buzz(30);
  } }, label + ' ', h('small', {}, get() ? '켜짐' : '꺼짐'));
  P.general.append(h('h2', {}, 'Effects', h('small', {}, '게임 연출')), h('div', { class: 'paper', id: 'fxPrefs', style: '--r:-.4deg' },
    h('div', { class: 'row wrap' }, fxRow('ba_fx', '움직임', () => fxPrefs.motion), fxRow('ba_sfx', '효과음', () => fxPrefs.sound), fxRow('ba_haptic', '진동', () => fxPrefs.haptic)),
    h('div', { class: 'muted', style: 'margin-top:6px' }, '카드·칩·타일이 날아가는 움직임, 효과음, 폰 진동. 진동은 안드로이드에서만 동작해요.')));
  P.general.append(h('h2', {}, 'Music', h('small', {}, 'BGM')), bgmCard(app, app.games, plainName));
  // 홈 화면: 자주 하는 게임 + 게임 타이틀 이미지
  const hp = await homePrefs(app);
  const saveHp = async () => { await app.storage.put('settings', 'homePrefs', hp); app.render(); };
  const coverIn = h('input', { type: 'file', accept: 'image/*', style: 'display:none', id: 'coverFile', onchange: async e => {
    const f = e.target.files[0], id = coverIn.dataset.gid; e.target.value = ''; if (!f || !id) return;
    try { const dataUrl = await fileToCover(f); await app.storage.put('portraits', coverKey(id), { dataUrl, updatedAt: new Date().toISOString() }); app.portraits.set(coverKey(id), dataUrl); toast('타이틀 이미지를 저장했어요'); app.render(); }
    catch (err) { toast('이미지를 읽지 못했어요: ' + err.message); }
  } });
  P.home.append(h('h2', {}, 'Home', h('small', {}, '홈 화면')), h('div', { class: 'paper', id: 'homePrefs', style: '--r:.3deg' },
    h('div', { class: 'row wrap', style: 'gap:6px;align-items:center' }, h('small', {}, '자주 하는 게임'),
      h('button', { class: 'btn small' + (hp.mode === 'auto' ? ' on' : ''), 'data-hm': 'auto', onclick: () => { hp.mode = 'auto'; saveHp(); } }, '자동(많이 한 순)'),
      h('button', { class: 'btn small' + (hp.mode === 'pin' ? ' on' : ''), 'data-hm': 'pin', onclick: () => { hp.mode = 'pin'; saveHp(); } }, '직접 고정')),
    h('div', { class: 'row wrap', style: 'gap:6px;align-items:center;margin-top:6px' }, h('small', {}, '표시 개수'),
      ...[6, 8].map(n => h('button', { class: 'btn small' + (hp.count === n ? ' on' : ''), 'data-hc': n, onclick: () => { hp.count = n; saveHp(); } }, `${n}개`))),
    hp.mode === 'pin' ? h('div', { style: 'margin-top:10px' }, ...app.games.map(g => {
      const pinned = hp.pins.includes(g.id);
      return h('div', { class: 'row', 'data-g': g.id, style: 'gap:6px;align-items:center;padding:5px 0;border-bottom:1px dashed #00000020' },
        h('div', { class: 'grow' }, plainName(g.name)),
        h('button', { class: 'btn small pinb' + (pinned ? ' on' : ''), onclick: () => { hp.pins = pinned ? hp.pins.filter(x => x !== g.id) : [...hp.pins, g.id]; saveHp(); } }, pinned ? '고정됨' : '고정'));
    })) : null,
    h('div', { class: 'muted', style: 'margin-top:6px' }, hp.mode === 'pin' ? '고정한 순서대로 홈 위쪽에 나와요.' : '자동: 많이 한 게임이 위에 나와요. 아직 안 한 게임은 목록 순서대로 채워요.')));
  P.deco.append(h('h2', {}, 'Images', h('small', {}, '게임 그림')), h('div', { class: 'paper', id: 'gameImages', style: '--r:-.2deg' },
    h('div', { class: 'muted', style: 'margin-bottom:6px' }, '홈에 보이는 게임 타이틀 이미지와, 카드가 있는 게임의 카드 그림을 넣어요.'),
    ...app.games.map(g => {
      const has = app.portraits.has(coverKey(g.id));
      return h('div', { class: 'row', 'data-g': g.id, style: 'gap:6px;align-items:center;padding:5px 0;border-bottom:1px dashed #00000020' },
        h('div', { class: 'grow' }, plainName(g.name)),
        g.art ? h('button', { class: 'btn small artb', onclick: () => openArtManager(app, g) }, '카드 그림') : null,
        h('button', { class: 'btn small covb', onclick: () => { coverIn.dataset.gid = g.id; coverIn.click(); } }, has ? '이미지 바꾸기' : '이미지 넣기'),
        has ? h('button', { class: 'btn small', onclick: async () => { await app.storage.del('portraits', coverKey(g.id)); app.portraits.delete(coverKey(g.id)); toast('타이틀 이미지를 지웠어요'); app.render(); } }, '지우기') : null);
    }), coverIn));
  const recs = await listRecords(app.storage);
  const meta = (await app.storage.get('settings', 'backupMeta')) || { recordsAt: 0, lastAt: null };
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
  let usage = '';
  try { const e = await navigator.storage.estimate(); usage = `${(e.usage / 1024).toFixed(0)}KB 사용`; } catch { usage = '확인 불가'; }

  const importBox = h('div', { id: 'importBox' });
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', id: 'importFile', onchange: async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const obj = migrateBackup(parseBackup(await f.text()));
      const d = obj.data;
      importBox.replaceChildren(h('div', { class: 'paper', style: 'margin-top:12px;--r:.5deg;background:#efece4' },
        h('div', {}, `파일 내용: 기록 ${d.records.length}판 · 초상화 ${Object.keys(d.portraits || {}).length}개 · 캠페인 슬롯 ${Object.keys(d.campaigns || {}).length}개`),
        h('div', { class: 'muted' }, `만든 시각 ${fmtDate(obj.exportedAt)}`),
        h('div', { class: 'row wrap', style: 'margin-top:10px' },
          h('button', { class: 'btn go', id: 'btnMerge', onclick: () => doImport(obj, 'merge') }, '합치기 (권장)'),
          h('button', { class: 'btn warn', id: 'btnReplace', onclick: ev => {
            const b = ev.currentTarget;
            if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '현재 데이터가 지워집니다. 한 번 더 누르세요'; return; }
            doImport(obj, 'replace');
          } }, '전체 교체'),
          h('button', { class: 'btn', onclick: () => importBox.replaceChildren() }, '취소')),
        h('div', { class: 'muted', style: 'margin-top:8px' }, '합치기: 지금 있는 기록은 그대로 두고 없는 것만 추가합니다. 같은 파일을 다시 가져와도 중복되지 않아요.')));
    } catch (err) { importBox.replaceChildren(h('div', { class: 'paper taped', style: 'margin-top:14px' }, err.message)); }
  } });
  async function doImport(obj, mode) {
    try {
      const s = await importBackup(app.storage, obj, { mode });
      await app.loadPortraits();
      toast(`가져오기 완료: 기록 +${s.records.added} (중복 ${s.records.skipped}, 오류 ${s.records.invalid}), 초상화 +${s.portraits.added + s.portraits.updated}`);
      app.render();
    } catch (err) { importBox.replaceChildren(h('div', { class: 'paper taped', style: 'margin-top:14px' }, '가져오기 실패: ' + err.message)); }
  }

  P.data.append(h('div', { class: 'paper taped', id: 'backupCard', style: '--r:-.6deg' },
    h('h3', {}, '백업'),
    h('div', { class: 'muted', style: 'margin-bottom:10px' }, `기록 ${recs.length}판 · 초상화·이미지 ${app.portraits.size}개 · 마지막 백업 ${meta.lastAt ? fmtDate(meta.lastAt) : '없음'}`),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn go', id: 'btnExport', onclick: async () => {
        const b = await exportBackup(app.storage);
        const d = new Date(), z = n => String(n).padStart(2, '0');
        downloadJson(b, `boardarchive-backup-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.json`);
        await app.storage.put('settings', 'backupMeta', { lastAt: d.toISOString(), recordsAt: recs.length });
        toast('백업 파일을 만들었어요'); app.render();
      } }, '백업 파일 만들기', h('small', {}, 'EXPORT')),
      h('button', { class: 'btn', onclick: () => fileIn.click() }, '백업 가져오기', h('small', {}, 'IMPORT'))),
    h('div', { class: 'muted', style: 'margin-top:10px' }, 'PC에서 만든 백업 파일을 폰에서 가져오면 기록·초상화가 그대로 옮겨져요.'),
    importBox, fileIn));

  // 폰트: 파일을 올려 두고 게임·앨범마다 "본문 / 제목·숫자" 폰트를 고른다
  const fonts = await listFonts(app.storage), fprefs = await loadPrefs(app.storage);
  await Promise.all(fonts.map(f => ensureFace(app, f.id)));   // 목록 미리보기용
  const b64 = buf => { let s = ''; const u = new Uint8Array(buf); for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const fontIn = h('input', { type: 'file', accept: '.ttf,.otf,.woff,.woff2', multiple: true, style: 'display:none', id: 'fontFile', onchange: async e => {
    const files = [...e.target.files]; e.target.value = ''; let ok = 0;
    for (const f of files) {
      const ext = (f.name.split('.').pop() || '').toLowerCase();
      if (!FONT_EXT.includes(ext)) { toast(`${f.name}: ttf·otf·woff·woff2 파일만 돼요`); continue; }
      if (f.size > FONT_MAX_BYTES) { toast(`${f.name}: ${(f.size / 1048576).toFixed(1)}MB — 6MB 이하만 돼요`); continue; }
      try {
        const buf = await f.arrayBuffer(); const test = new FontFace('baf-test', buf); await test.load();   // 읽을 수 있는 폰트인지 확인
        const id = 'f' + Date.now().toString(36) + Math.floor(Math.random() * 36).toString(36);
        await saveFont(app.storage, { id, name: f.name.replace(/\.[^.]+$/, ''), ext, size: f.size, dataUrl: `data:font/${ext};base64,${b64(buf)}`, updatedAt: new Date().toISOString() }); ok++;
      } catch { toast(`${f.name}: 읽을 수 없는 폰트예요`); }
    }
    if (ok) toast(`폰트 ${ok}개를 저장했어요`); app.render();
  } });
  const fsel = (gid, slot) => h('select', { 'data-g': gid, 'data-slot': slot, onchange: async e => {
    await savePref(app.storage, gid, slot, e.target.value || null);
    if (gid === ALBUM_ID) await applyAlbumFonts(app); toast('폰트를 바꿨어요' + (gid === ALBUM_ID ? '' : ' (게임을 새로 열면 적용)'));
  } }, h('option', { value: '' }, '기본'), ...fonts.map(f => h('option', { value: f.id, selected: (fprefs[gid] || {})[slot] === f.id }, f.name)));
  P.deco.append(h('h2', {}, 'Fonts', h('small', {}, '폰트')), h('div', { class: 'paper', id: 'fontsCard', style: '--r:-.3deg' },
    h('div', { class: 'row wrap', style: 'gap:6px;align-items:center' }, h('button', { class: 'btn small go', id: 'btnAddFont', onclick: () => fontIn.click() }, '폰트 파일 올리기'),
      h('small', {}, `.ttf .otf .woff .woff2 · 6MB 이하 · ${fonts.length}개 저장됨`)),
    fonts.length ? h('div', { style: 'margin-top:6px' }, ...fonts.map(f => h('div', { class: 'row', 'data-f': f.id, style: 'gap:6px;align-items:center;padding:3px 0' },
      h('div', { class: 'grow', style: `font-family:'baf-${f.id}'` }, f.name, h('small', { style: 'margin-left:6px;font-family:inherit' }, `${(f.size / 1048576).toFixed(1)}MB`)),
      h('button', { class: 'btn small', onclick: async () => { await deleteFont(app.storage, f.id); forgetFace(f.id); await applyAlbumFonts(app); toast('폰트를 지웠어요'); app.render(); } }, '지우기')))) : null,
    fonts.length ? h('div', { style: 'margin-top:10px' },
      h('div', { class: 'row', style: 'gap:6px;font-size:11px;color:var(--ink2)' }, h('div', { class: 'grow' }), h('div', { style: 'width:34%' }, '본문(글·대사)'), h('div', { style: 'width:34%' }, '제목·숫자')),
      ...[{ id: ALBUM_ID, name: '앨범 (홈·기록·설정)' }, ...app.games].map(g => h('div', { class: 'row', 'data-fg': g.id, style: 'gap:6px;align-items:center;padding:4px 0;border-bottom:1px dashed #00000020' },
        h('div', { class: 'grow' }, plainName(g.name)), h('div', { style: 'width:34%' }, fsel(g.id, 'body')), h('div', { style: 'width:34%' }, fsel(g.id, 'title'))))) : h('div', { class: 'muted', style: 'margin-top:8px' }, '폰트를 올리면 게임마다 본문·제목 폰트를 고를 수 있어요. 안 고르면 기본 서체 그대로예요.'),
    fontIn));
  P.deco.append(h('h2', {}, 'Frames', h('small', {}, 'UI 틀')), skinCard(app, app.games, plainName));
  // 이미지만 백업(초상화·게임 타이틀·카드 그림)
  const imgIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', id: 'imagesFile', onchange: async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const o = parseImages(await f.text()), n = Object.keys(o.data.portraits).length;
      const r = await importImages(app.storage, o); await app.loadPortraits();
      toast(`이미지 ${n}개 중 새로 ${r.added} · 갱신 ${r.updated} · 그대로 ${r.kept}${r.invalid ? ` · 건너뜀 ${r.invalid}` : ''}`); app.render();
    } catch (err) { toast(err.message); }
  } });
  P.data.append(h('div', { class: 'paper taped', id: 'imagesCard', style: '--r:.5deg' },
    h('h3', {}, '이미지만 백업'),
    h('div', { class: 'muted', style: 'margin-bottom:10px' }, `캐릭터 초상화 · 게임 타이틀 · 카드 일러스트 ${app.portraits.size}개와 폰트 ${fonts.length}개. 기록은 들어가지 않아요.`),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn go', id: 'btnExportImages', onclick: async () => {
        const b = await exportImages(app.storage), d = new Date(), z = n => String(n).padStart(2, '0');
        downloadJson(b, `boardarchive-images-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.json`);
        toast('이미지 파일을 만들었어요');
      } }, '이미지만 내보내기', h('small', {}, 'EXPORT')),
      h('button', { class: 'btn', onclick: () => imgIn.click() }, '이미지만 가져오기', h('small', {}, 'IMPORT'))),
    h('div', { class: 'muted', style: 'margin-top:8px' }, '가져오면 같은 이미지는 더 최근 것을 남기고 합쳐요. 기록은 그대로예요.'), imgIn));

  P.data.append(h('div', { class: 'paper', id: 'storageCard', style: '--r:.5deg' },
    h('h3', {}, '저장 상태'),
    h('div', { class: 'muted' }, `영구 저장 보호: ${persisted === true ? '켜짐' : persisted === false ? '꺼짐 (브라우저가 공간이 부족하면 지울 수 있어요. 백업을 꼭 만들어 두세요)' : '확인 불가'}`),
    h('div', { class: 'muted' }, `사용량: ${usage}`)));

  P.data.append(h('div', { class: 'paper', style: '--r:-.3deg' },
    h('h3', {}, '앱 정보'),
    h('div', { class: 'muted' }, `앱 v${APP_VERSION} · 기록 형식 v${SCHEMA.record} · 백업 형식 v${SCHEMA.backup}`),
    h('div', { class: 'muted' }, `캐릭터 ${app.characters.length}명 (데이터 v${app.charactersVersion ?? '-'}) · 게임 ${app.games.length}개`),
    app.charErrors.length ? h('div', { class: 'muted', style: 'margin-top:8px;color:var(--danger)' }, `캐릭터 데이터 경고 ${app.charErrors.length}건: ${app.charErrors[0]}`) : null));

  P.data.append(h('div', { class: 'paper', style: '--r:.4deg' },
    h('h3', { style: 'color:var(--danger)' }, '모든 데이터 삭제'),
    h('div', { class: 'muted', style: 'margin-bottom:10px' }, '기록·초상화·캠페인 저장을 모두 지웁니다. 먼저 백업을 만들어 두세요.'),
    h('button', { class: 'btn warn', id: 'btnWipe', onclick: async ev => {
      const b = ev.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '정말 삭제합니다. 한 번 더 누르세요'; return; }
      for (const s of ['records', 'portraits', 'campaigns', 'settings']) await app.storage.clear(s);
      app.portraits.clear(); toast('모두 삭제했어요'); app.render();
    } }, '모두 삭제')));
  showTab(curTab);
}
