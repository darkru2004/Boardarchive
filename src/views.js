import { h, avatar, modal, toast, fileToPortrait, downloadJson, fmtDate, pct, ornament, bubbles, dieSvg, lockSvg } from './ui.js';
import { TRAIT_KEYS, TRAIT_LABELS, TARGET_LABELS, APP_VERSION, SCHEMA } from '../core/schema.js';
import { drawSeats, DIFFICULTIES, DIFF_LABEL } from '../core/seating.js';
import { makeRng } from '../core/rng.js';
import { listRecords } from '../core/records.js';
import { overall, gameStats, characterStats, botStats, computeAchievements } from '../core/stats.js';
import { exportBackup, parseBackup, importBackup, migrateBackup } from '../core/backup.js';
import { activeOnly } from '../core/characters.js';
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
  const ov = overall(recs), gs = gameStats(recs);
  root.append(top('Archive', '보드게임 기록관', `<b>${ov.wins}</b> / ${ov.played}<br>WIN`));
  const meta = (await app.storage.get('settings', 'backupMeta')) || { recordsAt: 0, lastAt: null };
  if (recs.length - meta.recordsAt >= BACKUP_NUDGE_EVERY) {
    root.append(h('div', { class: 'paper taped banner', style: '--r:-1deg' }, `마지막 백업 이후 ${recs.length - meta.recordsAt}판이 쌓였어요. 설정에서 백업 파일을 만들어 두세요.`));
  }
  const grid = h('div', { class: 'ggrid' },
    ...app.games.map((g, i) => gameCard(app, g, i, gs[g.id])),
    h('div', { class: 'lockcard' }, h('b', {}, 'LOCKED'), lockSvg(), h('span', {}, '다음 게임 자리')));
  const wrap = h('div', { style: 'position:relative' }, grid);
  wrap.append(ornament(92, 'left:-12px;top:205px;transform:rotate(-8deg)'), ornament(84, 'right:-6px;top:250px;transform:scaleX(-1) rotate(-6deg)'),
    ...bubbles([['46%', '20px', 14], ['49%', '6px', 8], ['8%', '62%', 10], ['88%', '4px', 11]]));
  root.append(wrap, h('div', { id: 'setupHolder', style: 'margin-top:22px' }));
}

function gameCard(app, g, i, st) {
  const maxN = Math.min(g.players.max, activeOnly(app.characters).length + 1);
  const can = maxN >= g.players.min;
  const status = !can ? 'LOCK' : st ? (st.wins ? 'CLEAR' : 'PLAYED') : 'NEW';
  const th = g.theme || null;     // 게임별 표지 (games/index.json의 theme)
  const pic = th ? h('span', { class: 'big cover', style: `color:${th.accent}` }, th.glyph || plainName(g.name).slice(0, 1))
    : h('span', { class: 'big' }, plainName(g.name).slice(0, 1));
  return h('button', { class: 'pol gcard', 'data-id': g.id, 'aria-label': `${g.name} 플레이`, disabled: !can,
    onclick: () => can && app.startSetup(g, g.players.min) },
    h('div', { class: 'no' }, String(i + 1).padStart(2, '0')),
    h('div', { class: 'st' }, status, g.test ? h('span', { class: 'tag test' }, 'TEST') : null),
    h('div', { class: 'pic', style: th && th.table ? `background:radial-gradient(80% 70% at 40% 35%,${th.table},${th.table2 || th.table})` : '' }, pic),
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
      h('div', { class: 'cnt diff' }, h('small', { style: 'margin-right:6px' }, '난이도'), ...DIFFICULTIES.map(d =>
        h('button', { class: 'btn small' + (d === diff ? ' on' : ''), 'data-d': d, onclick: () => { diff = d; try { localStorage.setItem('ba_diff', d); } catch {} seats = draw(); render(); } }, DIFF_LABEL[d]))),
      h('div', { class: 'seats', style: 'background:#00000030;padding:12px 6px 8px' }, ...seats.map(s => h('div', { class: 'th seat' + (s.human ? ' me' : '') },
        avatar(app, s.characterId, 58), s.human ? '나' : app.lookup(s.characterId).name.split(' ').pop(), h('small', {}, `${s.seat + 1}번 자리`)))),
      h('div', { class: 'muted', style: 'margin-bottom:10px' }, diff === 'random' ? '상대와 자리 순서는 판마다 무작위로 정해져요. 1번 자리부터 시작합니다.' : `${DIFF_LABEL[diff]}: 이 게임에서 실력이 ${diff === 'easy' ? '낮은' : diff === 'hard' ? '높은' : '중간인'} 캐릭터들이 앉아요. (봇 수준은 그대로)`),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { seats = draw(); render(); } }, '다시 뽑기', h('small', {}, 'SHUFFLE')),
        h('button', { class: 'btn go grow', id: 'btnStart', onclick: () => launchGame(app, entry, seats, diff).catch(e => toast('실행 오류: ' + e.message)) }, '시작', h('small', {}, 'START'))));
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

// ================= 기록 =================

// 캐릭터 상세: 그 캐릭터의 전체·게임별 전적 + 나와의 전적
function charDetail(app, id, bs, cs, gname) {
  const c = app.lookup(id), b = bs[id], vs = cs[id];
  const rows = Object.entries(b.byGame).sort((x, y) => y[1].played - x[1].played);
  const m = modal(h('div', { class: 'charDetail', 'data-id': id },
    h('div', { class: 'row', style: 'gap:12px;align-items:center' }, avatar(app, id, 64),
      h('div', { class: 'grow' }, h('h3', { style: 'margin:0' }, c.name), h('div', { class: 'muted' }, `${b.played}판 · ${b.wins}승 · 승률 ${pct(b.winRate)} · 평균 ${b.avgRank.toFixed(1)}위`))),
    h('h4', { style: 'margin:14px 0 4px' }, '게임별'),
    h('table', {}, h('tr', {}, h('th', {}, '게임'), h('th', { class: 'n' }, '판'), h('th', { class: 'n' }, '승'), h('th', { class: 'n' }, '승률'), h('th', { class: 'n' }, '평균 순위')),
      ...rows.map(([gid, g]) => h('tr', {}, h('td', {}, gname(gid)), h('td', { class: 'n' }, g.played), h('td', { class: 'n' }, g.wins), h('td', { class: 'n' }, pct(g.winRate)), h('td', { class: 'n' }, g.avgRank.toFixed(1))))),
    vs ? h('div', { class: 'muted', style: 'margin-top:10px' }, `나와의 전적: 내가 ${vs.myWins}승 ${vs.myLosses}패${vs.ties ? ` ${vs.ties}무` : ''}`) : null,
    h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn go grow', onclick: () => m.close() }, '닫기'))));
}
export async function recordsView(app, root) {
  const recs = await listRecords(app.storage);
  const ov = overall(recs), gs = gameStats(recs), cs = characterStats(recs);
  const gname = id => plainName((app.games.find(g => g.id === id) || { name: `(없는 게임 ${id})` }).name);
  root.append(top('Record', '전적 기록', `승률<br><b>${pct(ov.winRate)}</b>`));
  root.append(h('div', { class: 'paper taped', id: 'overall', style: '--r:-1deg' },
    h('div', { class: 'row' }, h('div', { class: 'big-num' }, ov.played), h('div', { class: 'grow' }, `총 ${ov.played}판 · ${ov.wins}승 · 승률 ${pct(ov.winRate)}`)),
    recs.length ? null : h('div', { class: 'muted', style: 'margin-top:6px' }, '아직 기록이 없어요. 한 판 끝내면 여기에 쌓입니다.')));
  if (recs.length) {
    root.append(h('h2', {}, 'By Game', h('small', {}, '게임별')), h('div', { class: 'paper', style: '--r:.6deg' }, h('table', {},
      h('tr', {}, h('th', {}, '게임'), h('th', { class: 'n' }, '판'), h('th', { class: 'n' }, '승'), h('th', { class: 'n' }, '승률'), h('th', { class: 'n' }, '평균 순위')),
      ...Object.entries(gs).map(([id, g]) => h('tr', {}, h('td', {}, gname(id)), h('td', { class: 'n' }, g.played), h('td', { class: 'n' }, g.wins), h('td', { class: 'n' }, pct(g.winRate)), h('td', { class: 'n' }, g.avgRank.toFixed(1)))))));
    const bs = botStats(recs);
    const ids = Object.keys(bs).sort((a, b) => bs[b].winRate - bs[a].winRate || bs[b].played - bs[a].played);
    root.append(h('h2', {}, 'Characters', h('small', {}, '캐릭터별 전적 · 눌러서 게임별 보기')), h('div', { class: 'paper', id: 'charTable', style: '--r:-.5deg' },
      h('table', {}, h('tr', {}, h('th', {}, '캐릭터'), h('th', { class: 'n' }, '판'), h('th', { class: 'n' }, '승률'), h('th', { class: 'n' }, '평균 순위')),
        ...ids.map(id => h('tr', { class: 'crow', 'data-id': id, style: 'cursor:pointer', onclick: () => charDetail(app, id, bs, cs, gname) },
          h('td', {}, app.lookup(id).name), h('td', { class: 'n' }, bs[id].played), h('td', { class: 'n' }, pct(bs[id].winRate)), h('td', { class: 'n' }, bs[id].avgRank.toFixed(1))))),
      h('div', { class: 'muted', style: 'margin-top:6px' }, '내가 함께 앉은 모든 판 기준이에요. 판 수가 적을 땐 숫자가 크게 흔들려요.')));
  }
  const comp = computeAchievements(recs, app.achievementDefs, achCtx(app));
  const sticky = (await app.storage.get('settings', 'unlocked')) || {};
  const isDone = a => a.unlocked || a.id in sticky;
  const groups = [...new Set(comp.map(a => a.group))];
  root.append(h('h2', {}, 'Stamps', h('small', {}, `업적 ${comp.filter(isDone).length}/${comp.length}`)), ...groups.map(gr => {
    const list = comp.filter(a => a.group === gr);
    return h('div', { class: 'paper', id: 'achs', 'data-group': gr, style: '--r:.4deg;margin-bottom:12px' },
      h('h4', { style: 'margin:0 0 4px' }, `${gr}  ${list.filter(isDone).length}/${list.length}`),
      ...list.map(a => {
        const done = isDone(a);
        return h('div', { class: 'ach ' + (done ? 'done' : 'lock'), 'data-id': a.id }, h('div', { class: 'ic' }, done ? '✓' : ''),
          h('div', { class: 'grow' }, h('b', {}, a.name), h('div', { class: 'muted' }, a.desc + (done ? '' : `  (${a.progress}/${a.target})`))),
          done ? h('div', { class: 'muted' }, fmtDate(sticky[a.id] || a.at)) : null);
      }));
  }));
  if (recs.length) {
    root.append(h('h2', {}, 'Recent', h('small', {}, '최근 판')), h('div', { class: 'paper', style: '--r:-.4deg' }, ...recs.slice(-20).reverse().map(r => {
      const me = r.players.find(p => p.human);
      return h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px dashed #00000020;font-size:13px' },
        h('div', { class: 'grow' }, `${gname(r.gameId)} · ${r.players.length}인`), h('div', { class: 'muted' }, fmtDate(r.at)),
        h('b', { style: `font-family:var(--fd);font-size:18px;${me.rank === 1 ? 'color:var(--blue2)' : ''}` }, `${me.rank}위`));
    })));
  }
}

// ================= 설정: 백업·저장 상태 =================
export async function settingsView(app, root) {
  root.append(top('Option', '설정', ''));
  // 게임 연출 켜기/끄기 (기기에 저장)
  const fxRow = (key, label, get) => h('button', { class: 'btn small' + (get() ? ' on' : ''), 'data-fx': key, onclick: ev => {
    const on = !get(); fxPrefs.set(key, on); ev.currentTarget.classList.toggle('on', on); ev.currentTarget.lastChild.textContent = on ? '켜짐' : '꺼짐';
    if (on && key === 'ba_sfx') makeFx().sfx('chips'); if (on && key === 'ba_haptic') makeFx().buzz(30);
  } }, label + ' ', h('small', {}, get() ? '켜짐' : '꺼짐'));
  root.append(h('h2', {}, 'Effects', h('small', {}, '게임 연출')), h('div', { class: 'paper', id: 'fxPrefs', style: '--r:-.4deg' },
    h('div', { class: 'row wrap' }, fxRow('ba_fx', '움직임', () => fxPrefs.motion), fxRow('ba_sfx', '효과음', () => fxPrefs.sound), fxRow('ba_haptic', '진동', () => fxPrefs.haptic)),
    h('div', { class: 'muted', style: 'margin-top:6px' }, '카드·칩·타일이 날아가는 움직임, 효과음, 폰 진동. 진동은 안드로이드에서만 동작해요.')));
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

  root.append(h('div', { class: 'paper taped', id: 'backupCard', style: '--r:-.6deg' },
    h('h3', {}, '백업'),
    h('div', { class: 'muted', style: 'margin-bottom:10px' }, `기록 ${recs.length}판 · 초상화 ${app.portraits.size}개 · 마지막 백업 ${meta.lastAt ? fmtDate(meta.lastAt) : '없음'}`),
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

  root.append(h('div', { class: 'paper', id: 'storageCard', style: '--r:.5deg' },
    h('h3', {}, '저장 상태'),
    h('div', { class: 'muted' }, `영구 저장 보호: ${persisted === true ? '켜짐' : persisted === false ? '꺼짐 (브라우저가 공간이 부족하면 지울 수 있어요. 백업을 꼭 만들어 두세요)' : '확인 불가'}`),
    h('div', { class: 'muted' }, `사용량: ${usage}`)));

  root.append(h('div', { class: 'paper', style: '--r:-.3deg' },
    h('h3', {}, '앱 정보'),
    h('div', { class: 'muted' }, `앱 v${APP_VERSION} · 기록 형식 v${SCHEMA.record} · 백업 형식 v${SCHEMA.backup}`),
    h('div', { class: 'muted' }, `캐릭터 ${app.characters.length}명 (데이터 v${app.charactersVersion ?? '-'}) · 게임 ${app.games.length}개`),
    app.charErrors.length ? h('div', { class: 'muted', style: 'margin-top:8px;color:var(--danger)' }, `캐릭터 데이터 경고 ${app.charErrors.length}건: ${app.charErrors[0]}`) : null));

  root.append(h('div', { class: 'paper', style: '--r:.4deg' },
    h('h3', { style: 'color:var(--danger)' }, '모든 데이터 삭제'),
    h('div', { class: 'muted', style: 'margin-bottom:10px' }, '기록·초상화·캠페인 저장을 모두 지웁니다. 먼저 백업을 만들어 두세요.'),
    h('button', { class: 'btn warn', id: 'btnWipe', onclick: async ev => {
      const b = ev.currentTarget;
      if (b.dataset.armed !== '1') { b.dataset.armed = '1'; b.textContent = '정말 삭제합니다. 한 번 더 누르세요'; return; }
      for (const s of ['records', 'portraits', 'campaigns', 'settings']) await app.storage.clear(s);
      app.portraits.clear(); toast('모두 삭제했어요'); app.render();
    } }, '모두 삭제')));
}
