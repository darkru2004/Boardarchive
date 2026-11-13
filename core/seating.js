// 판마다 캐릭터를 랜덤으로 앉힌다. 사람 자리도 랜덤. 퇴역(retired) 캐릭터는 뽑지 않는다.
// pinned: 꼭 앉힐 캐릭터 id (선택), excludeIds: 제외할 id (선택)
export function drawSeats({ characters, count, rng, pinned = [], excludeIds = [] }) {
  const botsNeeded = count - 1;
  const pool = characters.filter(c => c.status !== 'retired' && !excludeIds.includes(c.id));
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
