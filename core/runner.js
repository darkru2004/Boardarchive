import { makeRng } from './rng.js';
import { drawSeats, rivalSeatsFor, allySeatsFor } from './seating.js';
import { traitsFor, makeLookup } from './characters.js';
import { normTraits } from './schema.js';

// 자동 대전 러너: 게임 모듈을 봇끼리 돌려 규격 위반·무한루프·승률 쏠림을 점검한다.
// 핵심 검사: 봇이 고른 수가 legalMoves 안에 있는가 (규칙은 엔진 전담, 봇은 선택 취향만).
const BASELINE = normTraits({ skill: 5, aggression: 5, risk: 5, patience: 5, bluff: 5, targetMode: 'none' });

// 동료 지원(ally): 같은 판에 나를 돕는 캐릭터가 앉아 있으면 내 실력이 조금 오른다 (강도 1당 +0.7, 가장 큰 쪽 하나만).
// 규칙을 바꾸지 않고 '조언·보조'를 수치로 옮긴 것. 도움을 주는 쪽의 양보·방패 행동은 게임 모듈이 따로 처리한다.
export const ALLY_SKILL_PER_STRENGTH = 0.7;
function allyBoost(seat, seats, look) {
  let best = 0;
  for (const o of seats) {
    if (o.human || o.seat === seat.seat || o.characterId === seat.characterId) continue;
    const r = (look(o.characterId).relations || []).find(x => x.type === 'ally' && x.id === seat.characterId);
    if (r) best = Math.max(best, r.strength || 1);
  }
  return best * ALLY_SKILL_PER_STRENGTH;
}

export function buildPlayers(seats, characters, gameId) {
  const look = makeLookup(characters);
  return seats.map(s => {
    if (s.human) return { seat: s.seat, human: true, characterId: null, name: '나', traits: BASELINE, rivalSeats: [], allySeats: [] };
    const c = look(s.characterId);
    return { seat: s.seat, human: false, characterId: c.id, name: c.name, traits: (b => { const t = traitsFor(c, gameId); return b ? { ...t, skill: Math.min(10, t.skill + b) } : t; })(allyBoost(s, seats, look)), rivalSeats: rivalSeatsFor(c, seats), allySeats: allySeatsFor(c, seats) };
  });
}

export function runBotGame(mod, players, rng, { maxSteps = 5000 } = {}) {
  const state = mod.newGame({ players: players.map(p => ({ seat: p.seat, human: p.human, characterId: p.characterId })), options: {}, rng });
  let steps = 0, illegal = 0;
  const reasons = {};
  while (!mod.isOver(state)) {
    if (++steps > maxSteps) throw new Error('무한 루프 의심 (최대 수 초과)');
    const moves = mod.legalMoves(state);
    if (!Array.isArray(moves) || !moves.length) throw new Error('합법 수가 없는데 게임이 끝나지 않음');
    const seat = mod.currentSeat(state);
    const p = players[seat];
    if (!p) throw new Error(`currentSeat가 잘못된 자리를 반환: ${seat}`);
    let ch = mod.botChoose(state, p.traits, rng, { seat, rivalSeats: p.rivalSeats, allySeats: p.allySeats });
    if (!ch || !moves.some(m => JSON.stringify(m) === JSON.stringify(ch.move))) {
      illegal++;
      ch = { move: rng.pick(moves), reason: 'fallback' };
    }
    reasons[ch.reason || '-'] = (reasons[ch.reason || '-'] || 0) + 1;
    mod.applyMove(state, ch.move, rng);
  }
  const result = mod.result(state);
  return { state, result, steps, illegal, reasons };
}

export function simulate(mod, characters, { games = 500, count = 4, seed = 1 } = {}) {
  const rng = makeRng(seed);
  const stat = {};
  const seatWins = Array(count).fill(0);
  const reasons = {};
  let errors = 0, illegal = 0, steps = 0, ok = 0, firstError = null, coopWins = 0, coopGames = 0;
  for (let g = 0; g < games; g++) {
    try {
      const seats = drawSeats({ characters, count, rng });
      const players = buildPlayers(seats, characters, mod.meta.id);
      const r = runBotGame(mod, players, rng);
      ok++; steps += r.steps; illegal += r.illegal;
      for (const [k, v] of Object.entries(r.reasons)) reasons[k] = (reasons[k] || 0) + v;
      if (r.result.coop) {   // 협력 게임: 순위·승률 쏠림 대신 클리어율을 본다 (경쟁 통계와 무관)
        coopGames++; if (r.result.coop.won) coopWins++; continue;
      }
      const winners = r.result.ranking.filter(x => x.rank === 1);
      for (const p of players) {
        const id = p.human ? '@기준봇' : p.characterId;
        const s = (stat[id] ||= { played: 0, wins: 0 });
        s.played++;
        const w = winners.find(x => x.seat === p.seat);
        if (w) { s.wins += 1 / winners.length; seatWins[p.seat] += 1 / winners.length; }
      }
    } catch (e) { errors++; firstError ||= String(e.message || e); }
  }
  for (const s of Object.values(stat)) s.winRate = s.played ? s.wins / s.played : 0;
  const fair = 1 / count;
  const coop = coopGames ? { games: coopGames, clearRate: coopWins / coopGames } : null;
  const warnings = [];
  if (coop && (coop.clearRate === 0 || coop.clearRate === 1) && coop.games >= 50) warnings.push(`클리어율이 ${coop.clearRate * 100}%라 난이도 조정이 필요해 보임`);
  for (const [id, s] of Object.entries(stat)) {
    if (s.played >= 100 && (s.winRate > fair * 1.6 || s.winRate < fair * 0.4)) warnings.push(`승률 쏠림: ${id} ${(s.winRate * 100).toFixed(1)}% (공정 ${(fair * 100).toFixed(1)}%)`);
  }
  if (!coopGames) seatWins.forEach((w, i) => { const wr = ok ? w / ok : 0; if (ok >= 100 && (wr > fair * 1.5 || wr < fair * 0.5)) warnings.push(`자리 편향: ${i}번 자리 승률 ${(wr * 100).toFixed(1)}%`); });
  return { games, count, ok, errors, illegal, firstError, avgSteps: ok ? steps / ok : 0, coop, perCharacter: stat, seatWinRate: seatWins.map(w => (ok ? w / ok : 0)), reasons, warnings };
}

// 게임 모듈 규격 검사. 새 게임 파일을 아카이브에 넣기 전에 이것만 통과하면 된다.
export function contractCheck(mod, entry, characters, { games = 200, seed = 7 } = {}) {
  const problems = [];
  const sims = [];
  const m = mod && mod.meta;
  if (!m) return { ok: false, problems: ['meta 없음'], sims };
  for (const f of ['id', 'name', 'version']) if (typeof m[f] !== 'string' || !m[f]) problems.push(`meta.${f} 없음`);
  if (!m.players || !Number.isInteger(m.players.min) || !Number.isInteger(m.players.max) || m.players.min < 2 || m.players.max < m.players.min) problems.push('meta.players {min,max} 오류');
  for (const fn of ['newGame', 'legalMoves', 'applyMove', 'botChoose', 'currentSeat', 'isOver', 'result', 'mount']) {
    if (typeof mod[fn] !== 'function') problems.push(`함수 없음: ${fn}`);
  }
  if (entry) for (const f of ['id', 'name', 'version']) if (entry[f] !== m[f]) problems.push(`games/index.json의 ${f}(${entry[f]})와 모듈 meta(${m[f]})가 다름`);
  if (entry && entry.players && (entry.players.min !== m.players?.min || entry.players.max !== m.players?.max)) problems.push('games/index.json의 인원 정보가 모듈 meta와 다름');
  if (entry && entry.theme) {
    for (const k of ['accent', 'table', 'table2']) if (entry.theme[k] != null && !/^#[0-9a-f]{6}$/i.test(entry.theme[k])) problems.push(`index.json theme.${k}는 #rrggbb 형식`);
  }
  if (problems.length) return { ok: false, problems, sims };

  const maxSeat = Math.min(m.players.max, characters.filter(c => c.status !== 'retired').length + 1);
  for (let n = m.players.min; n <= maxSeat; n++) {
    const r = simulate(mod, characters, { games, count: n, seed });
    sims.push(r);
    if (r.errors) problems.push(`${n}인: 오류 ${r.errors}건 (${r.firstError})`);
    if (r.illegal) problems.push(`${n}인: 봇이 불법 수를 고른 횟수 ${r.illegal}`);
  }
  // 상태가 JSON으로 저장 가능해야 캠페인 저장·재현이 가능
  try {
    const rng = makeRng(3);
    const seats = drawSeats({ characters, count: m.players.min, rng });
    const players = buildPlayers(seats, characters, m.id);
    const st = mod.newGame({ players: players.map(p => ({ seat: p.seat, human: p.human, characterId: p.characterId })), options: {}, rng });
    if (JSON.stringify(JSON.parse(JSON.stringify(st))) !== JSON.stringify(st)) problems.push('상태가 JSON으로 저장/복원되지 않음');
  } catch (e) { problems.push('newGame 오류: ' + e.message); }
  // 같은 시드 -> 같은 결과 (모듈이 전달받은 rng만 쓰는지)
  const a = JSON.stringify(simulate(mod, characters, { games: 60, count: m.players.min, seed: 11 }).perCharacter);
  const b = JSON.stringify(simulate(mod, characters, { games: 60, count: m.players.min, seed: 11 }).perCharacter);
  if (a !== b) problems.push('같은 시드인데 결과가 다름 (Math.random 등 직접 사용 의심)');
  return { ok: problems.length === 0, problems, sims, warnings: sims.flatMap(s => s.warnings.map(w => `${s.count}인 ${w}`)) };
}
