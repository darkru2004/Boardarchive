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

// ---- 업적: 선언형 정의(data/achievements.json) + 아래 계산기 ----
const byGame = (d, r) => !d.gameId || d.gameId === r.gameId;
const TYPES = {
  games_played: { init: () => 0, step: (a, r, d) => (byGame(d, r) ? a + 1 : a), value: a => a, target: d => d.n },
  wins: { init: () => 0, step: (a, r, d) => (byGame(d, r) && humanWon(r) ? a + 1 : a), value: a => a, target: d => d.n },
  win_streak: {
    init: () => ({ cur: 0, best: 0 }),
    step: (a, r) => { const c = humanWon(r) ? a.cur + 1 : 0; return { cur: c, best: Math.max(a.best, c) }; },
    value: a => a.best, target: d => d.n
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
    const T = TYPES[def.type];
    if (!T) return { id: def.id, name: def.name, desc: def.desc, unknownType: true, unlocked: false, progress: 0, target: 0, at: null };
    let acc = T.init(), at = null;
    const target = T.target(def, ctx);
    for (const r of records) {
      acc = T.step(acc, r, def);
      if (at === null && target > 0 && T.value(acc, ctx) >= target) at = r.at;
    }
    return { id: def.id, name: def.name, desc: def.desc, progress: T.value(acc, ctx), target, unlocked: at !== null, at };
  });
}
