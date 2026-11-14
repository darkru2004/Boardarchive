// 통계는 기록(원본)에서 매번 계산한다. 업적 정의·계산식이 바뀌어도 과거 기록은 그대로.
const humanOf = r => r.players.find(p => p.human);
export const humanWon = r => { const h = humanOf(r); return !!h && h.rank === 1; };

export function overall(records) {
  const played = records.length, wins = records.filter(humanWon).length;
  return { played, wins, winRate: played ? wins / played : 0 };
}

export function gameStats(records) {
  const out = {};
  for (const r of records) {
    const g = (out[r.gameId] ||= { played: 0, wins: 0, rankSum: 0, lastAt: null });
    g.played++; if (humanWon(r)) g.wins++;
    g.rankSum += humanOf(r).rank; g.lastAt = r.at;
  }
  for (const g of Object.values(out)) { g.winRate = g.wins / g.played; g.avgRank = g.rankSum / g.played; }
  return out;
}

// 캐릭터별: 같은 판에 앉은 횟수, 나와의 순위 비교(내가 앞/뒤/동순위), 그 캐릭터가 1등 한 횟수
export function characterStats(records, { gameId } = {}) {
  const out = {};
  for (const r of records) {
    if (gameId && r.gameId !== gameId) continue;
    const h = humanOf(r);
    for (const p of r.players) {
      if (p.human) continue;
      const c = (out[p.characterId] ||= { met: 0, myWins: 0, myLosses: 0, ties: 0, theirWins: 0 });
      c.met++;
      if (h.rank < p.rank) c.myWins++; else if (h.rank > p.rank) c.myLosses++; else c.ties++;
      if (p.rank === 1) c.theirWins++;
    }
  }
  for (const c of Object.values(out)) c.winRateVs = c.met ? c.myWins / c.met : 0;
  return out;
}

// 캐릭터 본인의 전적: 그 캐릭터가 앉은 모든 판(내가 이겼든 아니든) 기준 승률·평균 순위, 게임별 세부.
// gameId 지정 시 그 게임만. 동순위 1등도 승으로 센다.
export function botStats(records, { gameId } = {}) {
  const out = {};
  for (const r of records) {
    if (gameId && r.gameId !== gameId) continue;
    for (const p of r.players) {
      if (p.human) continue;
      const c = (out[p.characterId] ||= { played: 0, wins: 0, rankSum: 0, byGame: {}, lastAt: null });
      const g = (c.byGame[r.gameId] ||= { played: 0, wins: 0, rankSum: 0 });
      for (const x of [c, g]) { x.played++; x.rankSum += p.rank; if (p.rank === 1) x.wins++; }
      c.lastAt = r.at;
    }
  }
  for (const c of Object.values(out)) {
    c.winRate = c.wins / c.played; c.avgRank = c.rankSum / c.played;
    for (const g of Object.values(c.byGame)) { g.winRate = g.wins / g.played; g.avgRank = g.rankSum / g.played; }
  }
  return out;
}

// ---- 업적: 선언형 정의(data/achievements.json) + 아래 계산기 ----
const byGame = (d, r) => !d.gameId || d.gameId === r.gameId;
const dayOf = at => { const t = new Date(at); return `${t.getFullYear()}-${t.getMonth() + 1}-${t.getDate()}`; };   // 기기 시간대 기준 날짜
const TYPES = {
  games_played: { init: () => 0, step: (a, r, d) => (byGame(d, r) ? a + 1 : a), value: a => a, target: d => d.n },
  wins: { init: () => 0, step: (a, r, d) => (byGame(d, r) && humanWon(r) ? a + 1 : a), value: a => a, target: d => d.n },
  win_streak: {   // gameId를 주면 그 게임 기록만 이어서 센다
    init: () => ({ cur: 0, best: 0 }),
    step: (a, r, d) => { if (!byGame(d, r)) return a; const c = humanWon(r) ? a.cur + 1 : 0; return { cur: c, best: Math.max(a.best, c) }; },
    value: a => a.best, target: d => d.n
  },
  last_streak: {  // 꼴찌(2위 이하 중 가장 낮은 순위)를 연속으로
    init: () => ({ cur: 0, best: 0 }),
    step: (a, r, d) => {
      if (!byGame(d, r)) return a;
      const me = humanOf(r), last = me.rank > 1 && me.rank >= Math.max(...r.players.map(p => p.rank));
      const c = last ? a.cur + 1 : 0; return { cur: c, best: Math.max(a.best, c) };
    },
    value: a => a.best, target: d => d.n
  },
  wins_with_players: {   // minPlayers명 이상 앉은 판에서 승리
    init: () => 0,
    step: (a, r, d) => (byGame(d, r) && humanWon(r) && r.players.length >= d.minPlayers ? a + 1 : a),
    value: a => a, target: d => d.n
  },
  wins_difficulty: {     // 난이도를 골라 이긴 판 (옛 기록엔 난이도가 없어 세지 않음)
    init: () => 0,
    step: (a, r, d) => (byGame(d, r) && humanWon(r) && r.difficulty === d.difficulty ? a + 1 : a),
    value: a => a, target: d => d.n
  },
  wins_distinct_games: {
    init: () => new Set(),
    step: (a, r) => { if (humanWon(r)) a.add(r.gameId); return a; },
    value: (a, ctx) => (ctx.gameIds ? ctx.gameIds.filter(id => a.has(id)).length : a.size),
    target: (d, ctx) => (d.all && ctx.gameIds ? ctx.gameIds.length : d.n)
  },
  beat_distinct: {       // 서로 다른 캐릭터 n명(all이면 도감 전원)보다 높은 순위로 끝내기
    init: () => new Set(),
    step: (a, r, d) => {
      if (!byGame(d, r)) return a;
      const h = humanOf(r); r.players.forEach(p => { if (!p.human && h.rank < p.rank) a.add(p.characterId); }); return a;
    },
    value: (a, ctx) => (ctx.activeIds && ctx.activeIds.length ? ctx.activeIds.filter(id => a.has(id)).length : a.size),
    target: (d, ctx) => (d.all ? ctx.activeIds.length : d.n)
  },
  play_days: {           // 서로 다른 날짜에 플레이
    init: () => new Set(),
    step: (a, r) => { a.add(dayOf(r.at)); return a; },
    value: a => a.size, target: d => d.n
  },
  day_games: {           // 하루에 몰아서 n판
    init: () => ({}),
    step: (a, r) => { const k = dayOf(r.at); a[k] = (a[k] || 0) + 1; return a; },
    value: a => Math.max(0, ...Object.values(a)), target: d => d.n
  },
  beat_character: {
    init: () => 0,
    step: (a, r, d) => {
      const h = humanOf(r);
      return r.players.some(p => !p.human && p.characterId === d.characterId && h.rank < p.rank) ? a + 1 : a;
    },
    value: a => a, target: d => d.n
  },
  games_tried: { init: () => new Set(), step: (a, r) => { a.add(r.gameId); return a; }, value: a => a.size, target: d => d.n },
  met_all_characters: {
    init: () => new Set(),
    step: (a, r) => { r.players.forEach(p => p.characterId && a.add(p.characterId)); return a; },
    value: (a, ctx) => ctx.activeIds.filter(id => a.has(id)).length,
    target: (d, ctx) => ctx.activeIds.length
  }
};

export function computeAchievements(records, defs, ctx = { activeIds: [] }) {
  return defs.map(def => {
    const base = { group: def.group || '기타' };
    const T = TYPES[def.type];
    if (!T) return { ...base, id: def.id, name: def.name, desc: def.desc, unknownType: true, unlocked: false, progress: 0, target: 0, at: null };
    let acc = T.init(), at = null;
    const target = T.target(def, ctx);
    for (const r of records) {
      acc = T.step(acc, r, def);
      if (at === null && target > 0 && T.value(acc, ctx) >= target) at = r.at;
    }
    return { ...base, id: def.id, name: def.name, desc: def.desc, progress: T.value(acc, ctx), target, unlocked: at !== null, at };
  });
}
