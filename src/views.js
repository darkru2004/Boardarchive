import { h, avatar, modal, toast, fileToPortrait, downloadJson, fmtDate, pct } from './ui.js';
import { TRAIT_KEYS, TRAIT_LABELS, TARGET_LABELS, APP_VERSION, SCHEMA } from '../core/schema.js';
import { drawSeats } from '../core/seating.js';
import { makeRng } from '../core/rng.js';
import { listRecords } from '../core/records.js';
import { overall, gameStats, characterStats, computeAchievements } from '../core/stats.js';
import { exportBackup, parseBackup, importBackup, migrateBackup } from '../core/backup.js';
import { activeOnly } from '../core/characters.js';
import { launchGame } from './host.js';

export const BACKUP_NUDGE_EVERY = 10;

// ---------------- 홈: 게임 선택 + 자리 뽑기 ----------------
export async function homeView(app, root) {
  root.append(h('h1', {}, '보드게임 아카이브'));
  const recs = await listRecords(app.storage);
  const meta = (await app.storage.get('settings', 'backupMeta')) || { recordsAt: 0, lastAt: null };
  if (recs.length - meta.recordsAt >= BACKUP_NUDGE_EVERY) {
    root.append(h('div', { class: 'banner' }, `마지막 백업 이후 ${recs.length - meta.recordsAt}판이 쌓였어요. 설정 탭에서 백업 파일을 만들어 두세요.`));
  }
  const holder = h('div', { id: 'setupHolder' });
  root.append(...app.games.map(g => gameCard(app, g, holder)), holder);
}

function gameCard(app, g, holder) {
  const maxN = Math.min(g.players.max, activeOnly(app.characters).length + 1);
  const can = maxN >= g.players.min;
  return h('div', { class: 'card' },
    h('h3', {}, g.name, g.test ? h('span', { class: 'tag test' }, '시험용') : null),
    h('div', { class: 'muted' }, `${g.players.min}~${g.players.max}인 · 약 ${g.minutes}분 · v${g.version}`),
    h('div', { style: 'margin:6px 0 10px;font-size:13px' }, g.desc || ''),
    can ? h('button', { class: 'btn blue', onclick: () => app.startSetup(g, g.players.min, holder) }, '플레이')
        : h('div', { class: 'muted' }, `캐릭터가 ${g.players.min - 1 - activeOnly(app.characters).length}명 더 필요합니다`));
}

export function setupPanel(app, entry, count, holder) {
  const rng = makeRng();
  const maxN = Math.min(entry.players.max, activeOnly(app.characters).length + 1);
  let seats = drawSeats({ characters: app.characters, count, rng });
  const box = h('div', { class: 'card', id: 'setup' });
  const render = () => {
    box.replaceChildren(
      h('h3', {}, `${entry.name} — 인원 선택`),
      h('div', { class: 'cnt' }, ...Array.from({ length: maxN - entry.players.min + 1 }, (_, i) => entry.players.min + i).map(n =>
        h('button', { class: 'btn' + (n === count ? ' on' : ''), 'data-n': n, onclick: () => { count = n; seats = drawSeats({ characters: app.characters, count, rng }); render(); } }, `${n}인`))),
      h('div', { class: 'muted' }, '캐릭터와 자리 순서는 판마다 랜덤으로 정해져요.'),
      h('div', { class: 'seats' }, ...seats.map(s => h('div', { class: 'seat' + (s.human ? ' me' : '') },
        avatar(app, s.characterId, 32), h('span', {}, `${s.seat + 1}. ${s.human ? '나' : app.lookup(s.characterId).name}`)))),
      h('div', { class: 'row' },
        h('button', { class: 'btn', onclick: () => { seats = drawSeats({ characters: app.characters, count, rng }); render(); } }, '다시 뽑기'),
        h('button', { class: 'btn red grow', id: 'btnStart', onclick: () => launchGame(app, entry, seats).catch(e => toast('실행 오류: ' + e.message)) }, '시작')));
  };
  render();
  holder.replaceChildren(box);
  box.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// ---------------- 도감 ----------------
export async function dexView(app, root) {
  root.append(h('h1', {}, '캐릭터 도감'));
  const recs = await listRecords(app.storage);
  const cs = characterStats(recs);
  root.append(h('div', { class: 'grid' }, ...app.characters.map(c => {
    const st = cs[c.id];
    return h('button', { class: 'dex', 'data-id': c.id, style: `border-color:${c.color}55`, onclick: () => dexDetail(app, c, cs[c.id]) },
      h('div', { style: 'display:flex;justify-content:center' }, avatar(app, c.id, 64)),
      h('div', { class: 'nm' }, c.name, c.status === 'retired' ? h('span', { class: 'tag' }, '퇴역') : null),
      h('div', { class: 'sub' }, `실력 ${c.traits.skill} · ${st ? `${st.met}판 만남` : '미대면'}`));
  })));
  root.append(h('p', { class: 'muted', style: 'margin-top:14px' }, '카드를 눌러 초상화 이미지를 넣을 수 있어요. 초상화는 이 기기에 저장되고 백업 파일에 함께 담깁니다.'));
}

function dexDetail(app, c, st) {
  const body = h('div', {});
  const draw = () => {
    const input = h('input', { type: 'file', accept: 'image/*', style: 'display:none', id: 'portraitFile', onchange: async e => {
      const f = e.target.files[0]; if (!f) return;
      try {
        const dataUrl = await fileToPortrait(f);
        await app.storage.put('portraits', c.id, { dataUrl, updatedAt: new Date().toISOString() });
        app.portraits.set(c.id, dataUrl);
        toast('초상화를 저장했어요'); draw(); app.render();
      } catch (err) { toast('이미지를 읽지 못했어요: ' + err.message); }
    } });
    body.replaceChildren(
      h('div', { class: 'row' }, avatar(app, c.id, 96), h('div', {}, h('h2', { style: 'margin:0' }, c.name),
        h('div', { class: 'muted' }, `견제: ${TARGET_LABELS[c.traits.targetMode]}`))),
      h('div', { style: 'margin-top:12px' }, ...TRAIT_KEYS.map(k => h('div', { class: 'tr' }, h('b', {}, TRAIT_LABELS[k]),
        h('div', { class: 'bar' }, h('i', { style: `width:${c.traits[k] * 10}%` })), h('span', {}, c.traits[k])))),
      c.relations.length ? h('div', { class: 'muted', style: 'margin-top:8px' }, '상성: ' + c.relations.map(r => `${app.lookup(r.id).name}(${r.type === 'rival' ? '라이벌' : '친구'})`).join(', ')) : null,
      (c.lines.start || []).length ? h('div', { class: 'card', style: 'margin-top:10px;font-size:13px' }, `“${c.lines.start[0]}”`) : null,
      h('div', { class: 'muted', style: 'margin-top:8px' }, st ? `나와의 전적: ${st.myWins}승 ${st.myLosses}패 ${st.ties}무 (${st.met}판)` : '아직 같은 판에 앉은 적이 없어요'),
      h('div', { class: 'row', style: 'margin-top:14px' },
        h('button', { class: 'btn blue grow', onclick: () => input.click() }, app.portraits.has(c.id) ? '초상화 바꾸기' : '초상화 넣기'),
        app.portraits.has(c.id) ? h('button', { class: 'btn', onclick: async () => { await app.storage.del('portraits', c.id); app.portraits.delete(c.id); toast('초상화를 지웠어요'); draw(); app.render(); } }, '지우기') : null,
        h('button', { class: 'btn', onclick: () => m.close() }, '닫기')), input);
  };
  draw();
  const m = modal(body);
}

// ---------------- 기록 ----------------
export async function recordsView(app, root) {
  root.append(h('h1', {}, '기록'));
  const recs = await listRecords(app.storage);
  if (!recs.length) { root.append(h('div', { class: 'card muted' }, '아직 기록이 없어요. 한 판 끝내면 여기에 쌓입니다.')); }
  const ov = overall(recs), gs = gameStats(recs), cs = characterStats(recs);
  const gname = id => (app.games.find(g => g.id === id) || { name: `(없는 게임 ${id})` }).name;
  root.append(h('div', { class: 'card', id: 'overall' }, h('b', {}, `총 ${ov.played}판 · ${ov.wins}승 · 승률 ${pct(ov.winRate)}`)));

  if (recs.length) {
    root.append(h('h2', {}, '게임별'), h('div', { class: 'card' }, h('table', {},
      h('tr', {}, h('th', {}, '게임'), h('th', { class: 'n' }, '판'), h('th', { class: 'n' }, '승'), h('th', { class: 'n' }, '승률'), h('th', { class: 'n' }, '평균 순위')),
      ...Object.entries(gs).map(([id, g]) => h('tr', {}, h('td', {}, gname(id)), h('td', { class: 'n' }, g.played), h('td', { class: 'n' }, g.wins), h('td', { class: 'n' }, pct(g.winRate)), h('td', { class: 'n' }, g.avgRank.toFixed(1)))))));
    root.append(h('h2', {}, '캐릭터별 (나와의 순위 비교)'), h('div', { class: 'card' }, h('table', {},
      h('tr', {}, h('th', {}, '캐릭터'), h('th', { class: 'n' }, '만남'), h('th', { class: 'n' }, '내가 앞'), h('th', { class: 'n' }, '내가 뒤'), h('th', { class: 'n' }, '무')),
      ...Object.entries(cs).map(([id, c]) => h('tr', {}, h('td', {}, app.lookup(id).name), h('td', { class: 'n' }, c.met), h('td', { class: 'n' }, c.myWins), h('td', { class: 'n' }, c.myLosses), h('td', { class: 'n' }, c.ties))))));
  }
  const comp = computeAchievements(recs, app.achievementDefs, { activeIds: activeOnly(app.characters).map(c => c.id) });
  const sticky = (await app.storage.get('settings', 'unlocked')) || {};
  root.append(h('h2', {}, '업적'), h('div', { class: 'card', id: 'achs' }, ...comp.map(a => {
    const done = a.unlocked || a.id in sticky;
    return h('div', { class: 'ach ' + (done ? 'done' : 'lock'), 'data-id': a.id }, h('div', { class: 'ic' }, done ? '✓' : '·'),
      h('div', { class: 'grow' }, h('b', {}, a.name), h('div', { class: 'muted' }, a.desc + (done ? '' : `  (${a.progress}/${a.target})`))),
      done ? h('div', { class: 'muted' }, fmtDate(sticky[a.id] || a.at)) : null);
  })));
  if (recs.length) {
    root.append(h('h2', {}, '최근 판'), h('div', { class: 'card' }, ...recs.slice(-20).reverse().map(r => {
      const me = r.players.find(p => p.human);
      return h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px solid var(--line);font-size:13px' },
        h('div', { class: 'grow' }, `${gname(r.gameId)} · ${r.players.length}인`), h('div', { class: 'muted' }, fmtDate(r.at)),
        h('b', { style: me.rank === 1 ? 'color:var(--gold)' : '' }, `${me.rank}위`));
    })));
  }
}

// ---------------- 설정: 백업·저장 상태 ----------------
export async function settingsView(app, root) {
  root.append(h('h1', {}, '설정'));
  const recs = await listRecords(app.storage);
  const meta = (await app.storage.get('settings', 'backupMeta')) || { recordsAt: 0, lastAt: null };
  const persisted = navigator.storage && navigator.storage.persisted ? await navigator.storage.persisted() : null;
  let usage = '';
  try { const e = await navigator.storage.estimate(); usage = `${(e.usage / 1024).toFixed(0)}KB 사용`; } catch { usage = '확인 불가'; }

  root.append(h('div', { class: 'card', id: 'backupCard' },
    h('h3', {}, '백업'),
    h('div', { class: 'muted', style: 'margin-bottom:8px' }, `기록 ${recs.length}판 · 초상화 ${app.portraits.size}개 · 마지막 백업 ${meta.lastAt ? fmtDate(meta.lastAt) : '없음'}`),
    h('div', { class: 'row wrap' },
      h('button', { class: 'btn blue', id: 'btnExport', onclick: async () => {
        const b = await exportBackup(app.storage);
        const d = new Date(), z = n => String(n).padStart(2, '0');
        downloadJson(b, `boardarchive-backup-${d.getFullYear()}${z(d.getMonth() + 1)}${z(d.getDate())}-${z(d.getHours())}${z(d.getMinutes())}.json`);
        await app.storage.put('settings', 'backupMeta', { lastAt: d.toISOString(), recordsAt: recs.length });
        toast('백업 파일을 만들었어요'); app.render();
      } }, '백업 파일 만들기'),
      h('button', { class: 'btn', onclick: () => fileIn.click() }, '백업 가져오기')),
    h('div', { class: 'muted', style: 'margin-top:8px' }, 'PC에서 만든 백업 파일을 폰에서 가져오면 기록·초상화가 그대로 옮겨져요.'),
    h('div', { id: 'importBox' })));
  const importBox = root.querySelector('#importBox');
  const fileIn = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none', id: 'importFile', onchange: async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const obj = migrateBackup(parseBackup(await f.text()));
      const d = obj.data;
      const box = h('div', { class: 'card', style: 'margin-top:10px' },
        h('div', {}, `파일 내용: 기록 ${d.records.length}판 · 초상화 ${Object.keys(d.portraits || {}).length}개 · 캠페인 슬롯 ${Object.keys(d.campaigns || {}).length}개`),
        h('div', { class: 'muted' }, `만든 시각 ${fmtDate(obj.exportedAt)}`),
        h('div', { class: 'row wrap', style: 'margin-top:10px' },
          h('button', { class: 'btn green', id: 'btnMerge', onclick: () => doImport(obj, 'merge') }, '합치기 (권장)'),
          h('button', { class: 'btn red', id: 'btnReplace', onclick: ev => {
            if (ev.target.dataset.armed !== '1') { ev.target.dataset.armed = '1'; ev.target.textContent = '현재 데이터가 지워집니다. 한 번 더 누르세요'; return; }
            doImport(obj, 'replace');
          } }, '전체 교체'),
          h('button', { class: 'btn', onclick: () => importBox.replaceChildren() }, '취소')),
        h('div', { class: 'muted', style: 'margin-top:6px' }, '합치기: 지금 있는 기록은 그대로 두고 없는 것만 추가합니다. 같은 파일을 다시 가져와도 중복되지 않아요.'));
      importBox.replaceChildren(box);
    } catch (err) { importBox.replaceChildren(h('div', { class: 'banner', style: 'margin-top:10px' }, err.message)); }
  } });
  async function doImport(obj, mode) {
    try {
      const s = await importBackup(app.storage, obj, { mode });
      await app.loadPortraits();
      toast(`가져오기 완료: 기록 +${s.records.added} (중복 ${s.records.skipped}, 오류 ${s.records.invalid}), 초상화 +${s.portraits.added + s.portraits.updated}`);
      app.render();
    } catch (err) { importBox.replaceChildren(h('div', { class: 'banner', style: 'margin-top:10px' }, '가져오기 실패: ' + err.message)); }
  }
  root.append(fileIn);

  root.append(h('div', { class: 'card', id: 'storageCard' },
    h('h3', {}, '저장 상태'),
    h('div', { class: 'muted' }, `영구 저장 보호: ${persisted === true ? '켜짐' : persisted === false ? '꺼짐 (브라우저가 공간 부족 시 지울 수 있어요. 백업을 꼭 만들어 두세요)' : '확인 불가'}`),
    h('div', { class: 'muted' }, `사용량: ${usage}`)));

  root.append(h('div', { class: 'card' },
    h('h3', {}, '앱 정보'),
    h('div', { class: 'muted' }, `앱 v${APP_VERSION} · 기록 형식 v${SCHEMA.record} · 백업 형식 v${SCHEMA.backup}`),
    h('div', { class: 'muted' }, `캐릭터 ${app.characters.length}명 (데이터 v${app.charactersVersion ?? '-'}) · 게임 ${app.games.length}개`),
    app.charErrors.length ? h('div', { class: 'banner', style: 'margin-top:8px' }, `캐릭터 데이터 경고 ${app.charErrors.length}건: ${app.charErrors[0]}`) : null));

  root.append(h('div', { class: 'card danger' },
    h('h3', {}, '모든 데이터 삭제'),
    h('div', { class: 'muted', style: 'margin-bottom:8px' }, '기록·초상화·캠페인 저장을 모두 지웁니다. 먼저 백업을 만들어 두세요.'),
    h('button', { class: 'btn red', id: 'btnWipe', onclick: async ev => {
      if (ev.target.dataset.armed !== '1') { ev.target.dataset.armed = '1'; ev.target.textContent = '정말 삭제합니다. 한 번 더 누르세요'; return; }
      for (const s of ['records', 'portraits', 'campaigns', 'settings']) await app.storage.clear(s);
      app.portraits.clear(); toast('모두 삭제했어요'); app.render();
    } }, '모두 삭제')));
}
