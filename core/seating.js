import { traitsFor } from './characters.js';

export const DIFFICULTIES = ['easy', 'normal', 'hard', 'random'];
export const DIFF_LABEL = { easy: '쉬움', normal: '보통', hard: '어려움', random: '무작위' };

// 난이도 = 봇의 실력을 깎는 게 아니라 '앉는 캐릭터'를 고르는 방식.
// 이 게임에서의 실력(skill)으로 줄을 세워 쉬움=하위, 보통=중간, 어려움=상위 구간에서만 뽑는다.
// 구간 크기는 전체의 1/3, 단 필요한 봇 수보다 작아지지 않는다(캐릭터가 적을 때도 앉힐 수 있게).
export function difficultyPool(pool, difficulty, botsNeeded, gameId, rng) {
  if (!difficulty || difficulty === 'random' || pool.length <= botsNeeded) return pool;
  const sk = c => traitsFor(c, gameId).skill;
  const sorted = rng.shuffle(pool).sort((a, b) => sk(a) - sk(b));   // 동점은 무작위
  const size = Math.min(pool.length, Math.max(botsNeeded, Math.ceil(pool.length / 3)));
  const start = difficulty === 'easy' ? 0 : difficulty === 'hard' ? pool.length - size : Math.floor((pool.length - size) / 2);
  return sorted.slice(start, start + size);
}

// 판마다 캐릭터를 랜덤으로 앉힌다. 사람 자리도 랜덤. 퇴역(retired) 캐릭터는 뽑지 않는다.
// pinned: 꼭 앉힐 캐릭터 id (선택), excludeIds: 제외할 id (선택)
// difficulty: 'easy'|'normal'|'hard'|'random' (기본 random), gameId: 실력 보정(gameTweaks) 기준 게임
export function drawSeats({ characters, count, rng, pinned = [], excludeIds = [], difficulty = 'random', gameId = null }) {
  const botsNeeded = count - 1;
  const all = characters.filter(c => c.status !== 'retired' && !excludeIds.includes(c.id));
  const pool = all.filter(c => pinned.includes(c.id)).concat(difficultyPool(all.filter(c => !pinned.includes(c.id)), difficulty, Math.max(0, botsNeeded - pinned.length), gameId, rng));
  if (botsNeeded < 1) throw new Error('인원은 2명 이상');
  if (pool.length < botsNeeded) throw new Error(`캐릭터가 부족합니다 (필요 ${botsNeeded}, 보유 ${pool.length})`);
  const pins = pinned.filter(id => pool.some(c => c.id === id)).slice(0, botsNeeded);
  const rest = rng.shuffle(pool.filter(c => !pins.includes(c.id)));
  const ids = rng.shuffle([...pins, ...rest.slice(0, botsNeeded - pins.length).map(c => c.id)]);
  const humanAt = rng.int(count);
  let k = 0;
  return Array.from({ length: count }, (_, seat) =>
    seat === humanAt ? { seat, human: true, characterId: null } : { seat, human: false, characterId: ids[k++] });
}

// 같은 판에 앉은 라이벌 좌석 계산 (targetMode 'rival'용). 캐릭터 상성 relations 사용.
export function rivalSeatsFor(card, seats) {
  const rivals = new Set((card.relations || []).filter(r => r.type === 'rival').map(r => r.id));
  return seats.filter(s => !s.human && rivals.has(s.characterId)).map(s => s.seat);
}

// 같은 판에 앉은, 이 캐릭터가 돕는 자리 [{seat, strength}] (relations의 type 'ally')
export function allySeatsFor(card, seats) {
  const m = new Map((card.relations || []).filter(r => r.type === 'ally').map(r => [r.id, r.strength || 1]));
  return seats.filter(s => !s.human && m.has(s.characterId) && s.characterId !== card.id).map(s => ({ seat: s.seat, strength: m.get(s.characterId) }));
}
