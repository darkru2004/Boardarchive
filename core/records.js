import { SCHEMA, uuid, validateRecord } from './schema.js';

// 판 하나 = 기록 한 줄. 원본만 저장하고 통계는 stats.js에서 계산한다.
// game: {id, version}, seats: [{seat, human, characterId}], result: {ranking:[{seat,rank,score}], summary}
export function buildRecord({ game, seats, result, at = new Date(), slot = null }) {
  const players = seats.map(s => {
    const r = result.ranking.find(x => x.seat === s.seat);
    if (!r) throw new Error(`결과에 ${s.seat}번 자리가 없음`);
    return { seat: s.seat, human: !!s.human, characterId: s.human ? null : s.characterId, rank: r.rank, score: r.score ?? null };
  });
  const rec = { v: SCHEMA.record, id: uuid(), at: at.toISOString(), gameId: game.id, gameVersion: game.version,
    mode: 'solo', slot, players, summary: result.summary || '' };
  const errs = validateRecord(rec);
  if (errs.length) throw new Error('기록 형식 오류: ' + errs.join(', '));
  return rec;
}

export async function saveRecord(storage, rec) {
  const errs = validateRecord(rec);
  if (errs.length) throw new Error('기록 형식 오류: ' + errs.join(', '));
  await storage.put('records', rec.id, rec);
  return rec;
}

export async function listRecords(storage) {
  const all = (await storage.all('records')).map(x => x.value);
  all.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : a.id < b.id ? -1 : 1));
  return all;
}
