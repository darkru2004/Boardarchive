// ================= 기록: 캐릭터별 통계 + 게임별 기록 페이지 =================
import { h, avatar, modal, fmtDate, pct } from './ui.js';
import { DIFFICULTIES, DIFF_LABEL } from '../core/seating.js';
import { listRecords } from '../core/records.js';
import { filterByDifficulty, overall, gameStats, characterStats, botStats, coopStats, isCoop, humanWon, computeAchievements } from '../core/stats.js';
import { achCtx } from './host.js';

const plainName = n => n.replace(/\s*\(.*\)\s*$/, '');
const top = (title, sub, recHtml) => {
  const r = h('div', { class: 'rec' }); r.innerHTML = recHtml || '';
  return h('div', { class: 'top' }, h('div', { class: 'brand' }, title, h('small', {}, sub)), r);
};
const getDiff = () => { try { const d = localStorage.getItem('ba_recdiff'); return d === 'all' || DIFFICULTIES.includes(d) ? d : 'all'; } catch { return 'all'; } };
const diffBar = (app, fdiff) => h('div', { class: 'row wrap', id: 'diffFilter', style: 'gap:6px;margin-bottom:8px;align-items:center' }, h('small', {}, '난이도'),
  ...['all', ...DIFFICULTIES].map(d => h('button', { class: 'btn small' + (d === fdiff ? ' on' : ''), 'data-f': d,
    onclick: () => { try { localStorage.setItem('ba_recdiff', d); } catch {} app.render(); } }, d === 'all' ? '전체' : DIFF_LABEL[d])));
const th = (...c) => h('tr', {}, ...c.map((t, i) => h('th', i ? { class: 'n' } : {}, t)));

// 캐릭터 상세: 그 캐릭터의 전체·게임별 전적 + 나와의 전적
export function charDetail(app, id, bs, cs, gname) {
  const c = app.lookup(id), b = bs[id], vs = cs[id];
  const rows = Object.entries(b.byGame).sort((x, y) => y[1].played - x[1].played);
  const m = modal(h('div', { class: 'charDetail', 'data-id': id },
    h('div', { class: 'row', style: 'gap:12px;align-items:center' }, avatar(app, id, 64),
      h('div', { class: 'grow' }, h('h3', { style: 'margin:0' }, c.name), h('div', { class: 'muted' }, `${b.played}판 · ${b.wins}승 · 승률 ${pct(b.winRate)}(기대 ${pct(b.expected)}) · 평균 ${b.avgRank.toFixed(1)}위`))),
    h('h4', { style: 'margin:14px 0 4px' }, '게임별'),
    h('table', {}, th('게임', '판', '승', '승률', '기대', '평균 순위'),
      ...rows.map(([gid, g]) => h('tr', {}, h('td', {}, gname(gid)), h('td', { class: 'n' }, g.played), h('td', { class: 'n' }, g.wins), h('td', { class: 'n' }, pct(g.winRate)), h('td', { class: 'n muted' }, pct(g.expected)), h('td', { class: 'n' }, g.avgRank.toFixed(1))))),
    vs ? h('div', { class: 'muted', style: 'margin-top:10px' }, `나와의 전적: 내가 ${vs.myWins}승 ${vs.myLosses}패${vs.ties ? ` ${vs.ties}무` : ''}`) : null,
    h('div', { class: 'row', style: 'margin-top:12px' }, h('button', { class: 'btn go grow', onclick: () => m.close() }, '닫기'))));
}

const achList = (comp, sticky, id) => comp.map(a => {
  const done = a.unlocked || a.id in sticky;
  return h('div', { class: 'ach ' + (done ? 'done' : 'lock'), 'data-id': a.id }, h('div', { class: 'ic' }, done ? '✓' : ''),
    h('div', { class: 'grow' }, h('b', {}, a.name), h('div', { class: 'muted' }, a.desc + (done ? '' : `  (${a.progress}/${a.target})`))),
    done ? h('div', { class: 'muted' }, fmtDate(sticky[a.id] || a.at)) : null);
});

// ---------- 기록 탭: 게임 목록 · 캐릭터별 통계 · 업적 ----------
export async function recordsView(app, root) {
  const recs = await listRecords(app.storage);
  const fdiff = getDiff(), frecs = filterByDifficulty(recs, fdiff);
  const ALL = app.allGames || app.games;
  const gname = id => plainName((ALL.find(g => g.id === id) || { name: `(없는 게임 ${id})` }).name);
  root.append(top('Record', '기록', `총 <b>${recs.length}</b>판`));

  // 게임별 기록으로 가는 길
  const gs = gameStats(recs), cs0 = coopStats(recs).byGame;
  root.append(h('h2', {}, 'Games', h('small', {}, '게임별 기록 · 눌러서 보기')), h('div', { class: 'recgames', id: 'recGames' }, ...ALL.filter(g => app.games.includes(g) || recs.some(r => r.gameId === g.id)).map(g => {   // 개발 중단 게임은 기록이 있을 때만 남긴다
    const n = recs.filter(r => r.gameId === g.id).length;
    const sub = !n ? '기록 없음' : g.mode === 'coop' && cs0[g.id] ? `${n}판 · 클리어 ${pct(cs0[g.id].clearRate)}` : gs[g.id] ? `${n}판 · 승률 ${pct(gs[g.id].winRate)}` : `${n}판`;
    return h('a', { class: 'paper recg' + (g.retired ? ' retired' : ''), 'data-id': g.id, href: `#/records/${g.id}` }, h('b', {}, plainName(g.name)), h('small', {}, g.retired ? `개발 중단 · ${sub}` : sub));
  })));

  // 캐릭터별 통계
  const bs = botStats(frecs), cs = characterStats(frecs);
  const ids = Object.keys(bs).sort((a, b) => bs[b].winRate - bs[a].winRate || bs[b].played - bs[a].played);
  root.append(h('h2', {}, 'Characters', h('small', {}, '캐릭터별 전적 · 눌러서 게임별 보기')), h('div', { class: 'paper taped', id: 'overall', style: '--r:-.6deg' },
    diffBar(app, fdiff),
    h('div', { class: 'muted' }, `이 기준 경쟁 ${filterByDifficulty(recs, fdiff).filter(r => !isCoop(r)).length}판 · 내 승률 ${pct(overall(frecs).winRate)}(기대 ${pct(overall(frecs).expected)})`),
    fdiff !== 'all' ? h('div', { class: 'muted', style: 'margin-top:4px' }, `${DIFF_LABEL[fdiff]} 난이도로 한 판만 모아 본 숫자예요.`) : null));
  if (ids.length) root.append(h('div', { class: 'paper', id: 'charTable', style: '--r:-.5deg;margin-top:10px' },
    h('table', {}, th('캐릭터', '판', '승률', '기대', '평균 순위'),
      ...ids.map(id => h('tr', { class: 'crow', 'data-id': id, style: 'cursor:pointer', onclick: () => charDetail(app, id, bs, cs, gname) },
        h('td', {}, app.lookup(id).name), h('td', { class: 'n' }, bs[id].played), h('td', { class: 'n' }, pct(bs[id].winRate)), h('td', { class: 'n muted' }, pct(bs[id].expected)), h('td', { class: 'n' }, bs[id].avgRank.toFixed(1))))),
    h('div', { class: 'muted', style: 'margin-top:6px' }, '내가 함께 앉은 모든 경쟁 게임 기준이에요. "기대"는 모두 같은 실력일 때의 승률이고, 판 수가 적을 땐 숫자가 크게 흔들려요.')));
  const cp = coopStats(recs);
  if (cp.total.played) {
    const mates = Object.entries(cp.byChar).sort((a, b) => b[1].clearRate - a[1].clearRate || b[1].played - a[1].played);
    root.append(h('div', { class: 'paper', id: 'mateTable', style: '--r:-.4deg;margin-top:10px' }, h('b', {}, '협력 게임에서 같이 한 동료'),
      h('table', {}, th('동료', '함께한 판', '클리어율'),
        ...mates.map(([id, v]) => h('tr', {}, h('td', {}, app.lookup(id).name), h('td', { class: 'n' }, v.played), h('td', { class: 'n' }, pct(v.clearRate))))),
      h('div', { class: 'muted', style: 'margin-top:6px' }, '협력 기록은 경쟁 통계와 섞이지 않아요.')));
  }

  // 업적
  const comp = computeAchievements(recs, app.achievementDefs, achCtx(app));
  const sticky = (await app.storage.get('settings', 'unlocked')) || {};
  const hasCoopGame = app.games.some(g => g.mode === 'coop');
  const isDone = a => a.unlocked || a.id in sticky;
  const groups = [...new Set(comp.map(a => a.group))].filter(g => g !== '협력' || hasCoopGame || comp.some(a => a.group === '협력' && isDone(a)));
  root.append(h('h2', {}, 'Stamps', h('small', {}, `업적 ${comp.filter(isDone).length}/${comp.length}`)), ...groups.map(gr => {
    const list = comp.filter(a => a.group === gr);
    return h('div', { class: 'paper', id: 'achs', 'data-group': gr, style: '--r:.4deg;margin-bottom:12px' },
      h('h4', { style: 'margin:0 0 4px' }, `${gr}  ${list.filter(isDone).length}/${list.length}`), ...achList(list, sticky));
  }));
}

// ---------- 게임별 기록 페이지 (#/records/<게임id>) ----------
export async function gameRecordsView(app, root, gameId) {
  const entry = (app.allGames || app.games).find(g => g.id === gameId);
  const back = h('button', { class: 'btn small', id: 'recBack', style: 'margin:6px 0', onclick: () => { location.hash = '#/records'; } }, '← 기록 목록');
  if (!entry) { root.append(top('Record', '기록', ''), back, h('div', { class: 'banner' }, '없는 게임이에요: ' + gameId)); return; }
  const recsAll = await listRecords(app.storage);
  const all = recsAll.filter(r => r.gameId === gameId);
  const comp = all.filter(r => !isCoop(r)), coop = all.filter(isCoop);
  const gname = id => plainName(((app.allGames || app.games).find(g => g.id === id) || { name: id }).name);
  root.append(top(plainName(entry.name), '게임 기록', `<b>${all.length}</b>판`), back);
  if (entry.retired) root.append(h('div', { class: 'muted', id: 'retiredNote', style: 'margin:4px 0 8px' }, '개발이 중단된 게임이에요. 지난 기록만 볼 수 있어요.'));
  if (!all.length) root.append(h('div', { class: 'paper', style: '--r:-.5deg' }, '아직 이 게임 기록이 없어요. 한 판 끝내면 여기에 쌓입니다.'));

  // 경쟁 기록
  if (comp.length || (!coop.length && entry.mode !== 'coop' && all.length)) {
    const fdiff = getDiff(), fr = filterByDifficulty(comp, fdiff), ov = overall(fr), g = gameStats(fr)[gameId];
    root.append(h('div', { class: 'paper taped', id: 'gOverall', style: '--r:-.8deg' }, diffBar(app, fdiff),
      h('div', { class: 'row' }, h('div', { class: 'big-num' }, ov.played), h('div', { class: 'grow' }, `${ov.played}판 · ${ov.wins}승 · 승률 ${pct(ov.winRate)}${ov.played ? `(기대 ${pct(ov.expected)}) · 평균 ${g.avgRank.toFixed(1)}위` : ''}`)),
      ov.played ? null : h('div', { class: 'muted', style: 'margin-top:6px' }, '이 난이도로 한 판이 아직 없어요.')));
    if (ov.played) {
      const byN = {};
      for (const r of fr) { const o = (byN[r.players.length] ||= { played: 0, wins: 0, exp: 0 }); o.played++; o.exp += 1 / r.players.length; if (humanWon(r)) o.wins++; }
      root.append(h('div', { class: 'paper', id: 'byPlayers', style: '--r:.4deg;margin-top:10px' }, h('b', {}, '인원별'),
        h('table', {}, th('인원', '판', '승', '승률', '기대'), ...Object.entries(byN).map(([n, o]) => h('tr', {}, h('td', {}, `${n}인`), h('td', { class: 'n' }, o.played), h('td', { class: 'n' }, o.wins), h('td', { class: 'n' }, pct(o.wins / o.played)), h('td', { class: 'n muted' }, pct(o.exp / o.played)))))));
      const bs = botStats(fr), cs = characterStats(fr), ids = Object.keys(bs).sort((a, b) => bs[b].winRate - bs[a].winRate || bs[b].played - bs[a].played);
      root.append(h('div', { class: 'paper', id: 'gCharTable', style: '--r:-.4deg;margin-top:10px' }, h('b', {}, '이 게임의 캐릭터별 전적'),
        h('table', {}, th('캐릭터', '판', '승률', '기대', '평균 순위'), ...ids.map(id => h('tr', { class: 'crow', 'data-id': id, style: 'cursor:pointer', onclick: () => charDetail(app, id, bs, cs, gname) },
          h('td', {}, app.lookup(id).name), h('td', { class: 'n' }, bs[id].played), h('td', { class: 'n' }, pct(bs[id].winRate)), h('td', { class: 'n muted' }, pct(bs[id].expected)), h('td', { class: 'n' }, bs[id].avgRank.toFixed(1)))))));
    }
  }

  // 협력 기록
  if (coop.length) {
    const cp = coopStats(coop), mates = Object.entries(cp.byChar).sort((a, b) => b[1].clearRate - a[1].clearRate || b[1].played - a[1].played);
    root.append(h('div', { class: 'paper taped', id: 'coopBox', style: '--r:.5deg' },
      h('div', { class: 'row' }, h('div', { class: 'big-num' }, cp.total.wins), h('div', { class: 'grow' }, `${cp.total.played}판 중 ${cp.total.wins}번 클리어 · 클리어율 ${pct(cp.total.clearRate)}${cp.total.best != null ? ` · 최고점 ${cp.total.best}` : ''}${cp.bestStreak > 1 ? ` · 최고 ${cp.bestStreak}연속 클리어` : ''}`)),
      Object.keys(cp.byPlayers).length ? h('div', { class: 'muted', style: 'margin-top:8px' }, '인원별 클리어율: ' + Object.entries(cp.byPlayers).map(([n, v]) => `${n}인 ${pct(v.clearRate)}(${v.played}판)`).join(' · ')) : null,
      Object.keys(cp.byDiff).length ? h('div', { class: 'muted', style: 'margin-top:4px' }, '난이도별: ' + Object.entries(cp.byDiff).map(([d, v]) => `${DIFF_LABEL[d] || d} ${pct(v.clearRate)}(${v.played}판)`).join(' · ')) : null));
    if (mates.length) root.append(h('div', { class: 'paper', id: 'mateTable', style: '--r:-.4deg;margin-top:10px' }, h('b', {}, '같이 한 동료'),
      h('table', {}, th('동료', '함께한 판', '클리어율'), ...mates.map(([id, v]) => h('tr', {}, h('td', {}, app.lookup(id).name), h('td', { class: 'n' }, v.played), h('td', { class: 'n' }, pct(v.clearRate)))))));
  }

  // 게임 전용 기록 보드 자리 (2단계)
  const boards = h('div', { id: 'gBoards' }); root.append(boards);
  try {   // 게임 파일이 recordBoards(records, kit)를 갖고 있으면 게임 전용 기록 보드를 그린다
    const mod = (await import(`../games/${entry.file}`)).default;
    if (mod && typeof mod.recordBoards === 'function') boards.append(...mod.recordBoards(all, { h, fmtDate, pct, modal, DIFF_LABEL }));
  } catch (e) { console.warn('게임 전용 기록 보드를 못 그림', e); }

  // 이 게임 업적
  const comps = computeAchievements(recsAll, app.achievementDefs, achCtx(app)).filter(a => a.gameId === gameId || (app.achievementDefs.find(d => d.id === a.id) || {}).gameId === gameId);
  const sticky = (await app.storage.get('settings', 'unlocked')) || {};
  if (comps.length) root.append(h('h2', {}, 'Stamps', h('small', {}, '이 게임 업적')), h('div', { class: 'paper', id: 'gachs', style: '--r:.4deg' }, ...achList(comps, sticky)));

  // 최근 20판
  if (all.length) root.append(h('h2', {}, 'Recent', h('small', {}, '최근 판')), h('div', { class: 'paper', id: 'gRecent', style: '--r:-.4deg' }, ...all.slice(-20).reverse().map(r => {
    const me = r.players.find(p => p.human);
    const res = isCoop(r) ? (r.outcome === 'win' ? '클리어' : '실패') : `${me.rank}위`;
    const win = isCoop(r) ? r.outcome === 'win' : me.rank === 1;
    const sc = isCoop(r) ? r.score : me.score;
    return h('div', { class: 'row', style: 'padding:6px 0;border-bottom:1px dashed #00000020;font-size:13px;gap:6px' },
      h('div', { class: 'grow' }, `${r.players.length}인${r.difficulty ? ' · ' + (DIFF_LABEL[r.difficulty] || r.difficulty) : ''}${sc != null ? ` · ${sc}점` : ''}`), h('div', { class: 'muted' }, fmtDate(r.at)),
      h('b', { style: `font-family:var(--fd);font-size:18px;${win ? 'color:var(--blue2)' : ''}` }, res));
  })));
}
