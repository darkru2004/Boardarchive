// 게임 실행기: 게임 모듈을 불러와 ctx를 만들어 주고, 끝나면 기록 저장·업적 판정·결과 화면을 처리한다.
import { makeRng } from '../core/rng.js';
import { buildPlayers } from '../core/runner.js';
import { buildRecord, saveRecord, listRecords } from '../core/records.js';
import { computeAchievements } from '../core/stats.js';
import { campaignKey, saveCampaign, loadCampaign, deleteCampaign } from '../core/storage.js';

// 이어하기(자동 저장) 슬롯 이름. meta.autosave가 있는 게임만 쓴다. 판이 끝나면 지운다.
export const AUTO_SLOT = 'auto';
import { linesFor, activeOnly, pairLinesFor } from '../core/characters.js';
import { h, avatar, modal, toast, dieSvg, ornament, bubbles } from './ui.js';
import { makeFx } from './fx.js';

export const achCtx = app => ({ activeIds: activeOnly(app.characters).map(c => c.id), gameIds: app.games.filter(g => !g.test && g.mode !== 'coop').map(g => g.id) });

export async function unlockNew(app) {
  const recs = await listRecords(app.storage);
  const comp = computeAchievements(recs, app.achievementDefs, achCtx(app));
  const unlocked = (await app.storage.get('settings', 'unlocked')) || {};
  const fresh = comp.filter(a => a.unlocked && !(a.id in unlocked));
  if (fresh.length) {
    fresh.forEach(a => { unlocked[a.id] = a.at; });
    await app.storage.put('settings', 'unlocked', unlocked);   // 한 번 달성한 업적은 영구 보존
  }
  return fresh;
}

export async function launchGame(app, entry, seats, difficulty = null, resume = null) {
  const mod = (await import(`../games/${entry.file}`)).default;
  if (mod.meta.id !== entry.id) throw new Error('게임 파일의 id가 목록과 다릅니다');
  const players = buildPlayers(seats, app.characters, entry.id).map(p => {
    const c = p.human ? { color: '#2a7de1', initial: '나' } : app.lookup(p.characterId);
    return { ...p, color: c.color, initial: c.initial };
  });
  const root = h('div', {});
  const gameRoot = h('div', {});
  let instance = null, finished = false, confirmExit = false;
  const auto = !!mod.meta.autosave;
  const exitBtn = h('button', { class: 'btn small', onclick: () => {
    if (!confirmExit) { confirmExit = true; exitBtn.textContent = auto ? '정말 나갈까요? (이어하기 가능)' : '정말 나갈까요? (기록 안 남음)'; setTimeout(() => { confirmExit = false; exitBtn.textContent = '나가기'; }, 3000); return; }
    leave();
  } }, '나가기');
  root.append(h('div', { class: 'gamebar' }, h('div', { class: 'brand', style: 'font-size:28px' }, entry.name.replace(/\s*\(.*\)\s*$/, ''), h('small', {}, `${players.length}인 · v${entry.version}`)), exitBtn), gameRoot);

  const leave = () => { if (instance && instance.destroy) instance.destroy(); document.body.classList.remove('playing'); return app.goHome(); };

  const ctx = {
    gameId: entry.id,
    players,
    delay: ms => (app.fast ? 5 : ms),         // 자동 테스트(?fast=1)에서만 빠르게
    // 대사를 읽을 시간: 글자 수에 비례(짧은 대사 약 3.5초, 긴 대사 최대 7.5초). 진행 속도와는 별개.
    readMs: text => (app.fast ? 5 : Math.min(7500, Math.max(3500, 2200 + String(text || '').length * 95))),
    theme: entry.theme || null,               // games/index.json의 theme (포인트 색 등)
    kit: { dieSvg, ornament, bubbles },
    fx: makeFx({ fast: app.fast }),           // 공통 이펙트(움직임·소리·진동). 게임에서 ctx.fx.scope(게임루트)로 사용
    rng: makeRng(),
    avatar: (seat, size) => avatar(app, players[seat].characterId, size),
    say: (seat, key) => {
      const p = players[seat];
      if (p.human) return null;
      const card = app.lookup(p.characterId);
      const pair = pairLinesFor(card, players.filter(q => q.seat !== seat && !q.human).map(q => q.characterId), key);   // 같은 판의 특정 캐릭터에게 하는 대사
      const own = linesFor(card, entry.id, key);
      const arr = pair.length && (!own.length || Math.random() < 0.5) ? pair : own;
      return arr.length ? arr[Math.floor(Math.random() * arr.length)] : null;
    },
    // 이어하기: 게임이 수를 둘 때마다 상태를 저장하고(autosave), 다음에 '이어하기'로 열면 resumeState로 돌려준다
    resumeState: resume && resume.data ? resume.data.state : null,
    autosave: auto ? (state => { if (!finished) saveCampaign(app.storage, { gameId: entry.id, slot: AUTO_SLOT, gameVersion: mod.meta.version, saveSchema: mod.meta.autosave.schema || 1, data: { state, seats, difficulty } }).catch(() => {}); }) : null,
    clearAutosave: auto ? (() => deleteCampaign(app.storage, entry.id, AUTO_SLOT).catch(() => {})) : null,
    campaign: {
      load: slot => loadCampaign(app.storage, entry.id, slot),
      save: (slot, data, saveSchema = 1) => saveCampaign(app.storage, { gameId: entry.id, slot, gameVersion: mod.meta.version, saveSchema, data })
    },
    async finish(result) {
      if (finished) return; finished = true;
      if (auto) await deleteCampaign(app.storage, entry.id, AUTO_SLOT).catch(() => {});
      const rec = buildRecord({ game: mod.meta, seats, result, difficulty });
      await saveRecord(app.storage, rec);
      const fresh = await unlockNew(app);
      showResult(app, entry, seats, rec, fresh, { again: async () => { await leave(); app.startSetup(entry, seats.length); }, home: leave });
    }
  };
  app.view.replaceChildren(root);
  document.body.classList.add('playing');
  instance = mod.mount(gameRoot, ctx);
}

function showResult(app, entry, seats, rec, fresh, { again, home }) {
  const sorted = rec.players.slice().sort((a, b) => a.rank - b.rank || a.seat - b.seat);
  const me = rec.players.find(p => p.human);
  const coop = rec.mode === 'coop', won = rec.outcome === 'win';
  const body = [
    coop
      ? h('div', { class: 'brand', style: 'font-size:34px' }, won ? 'Cleared' : 'Defeat', h('small', {}, `${won ? '함께 클리어했습니다' : '이번엔 쓰러졌어요'}${rec.score != null ? ` · ${rec.score}점` : ''}${rec.summary ? ` · ${rec.summary}` : ''}`))
      : h('div', { class: 'brand', style: 'font-size:34px' }, me.rank === 1 ? 'Victory' : `Rank ${me.rank}`, h('small', {}, me.rank === 1 ? '승리했습니다' : `${me.rank}위로 마무리 · ${rec.summary}`)),
    ...sorted.map(p => h('div', { class: 'rank-row' + (coop ? (won ? ' first' : '') : p.rank === 1 ? ' first' : '') },
      h('div', { class: 'r' }, coop ? '·' : p.rank), avatar(app, p.characterId, 38),
      h('div', { class: 'grow' }, p.human ? '나' : app.lookup(p.characterId).name),
      h('div', { style: 'font-family:var(--fd);font-size:18px' }, !coop && p.score != null ? `${p.score}` : ''))),
    fresh.length ? h('div', { class: 'paper taped', style: 'margin-top:16px;--r:-1deg;background:#efece4' }, '업적 달성 · ' + fresh.map(a => app.achievementDefs.find(d => d.id === a.id).name).join(', ')) : null,
    h('div', { class: 'row', style: 'margin-top:16px' },
      h('button', { class: 'btn go grow', onclick: () => { m.close(); again(); } }, '한 판 더', h('small', {}, 'AGAIN')),
      h('button', { class: 'btn grow', onclick: () => { m.close(); home(); } }, '홈으로', h('small', {}, 'HOME')))
  ];
  const m = modal(body);
  if (entry.theme && entry.theme.accent) m.el.firstChild.style.borderTop = `5px solid ${entry.theme.accent}`;
  toast('기록이 저장되었습니다');
}
