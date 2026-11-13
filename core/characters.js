import { validateCharacter, normTraits, LINE_KEYS } from './schema.js';

// characters.json -> 검증된 카드 목록. 잘못된 카드는 건너뛰고 errors로 보고(앱이 죽지 않게).
export function parseCharacters(json) {
  const errors = [];
  const out = [];
  const seen = new Set();
  const list = json && Array.isArray(json.characters) ? json.characters : null;
  if (!list) return { characters: [], errors: ['characters 배열이 없음'], dataVersion: null };
  for (const c of list) {
    const errs = validateCharacter(c);
    if (c && seen.has(c.id)) errs.push(`id 중복: ${c.id}`);
    if (errs.length) { errors.push(...errs); continue; }
    seen.add(c.id);
    out.push({
      ...c,
      status: c.status || 'active',
      traits: normTraits(c.traits),
      lines: c.lines || {},
      relations: c.relations || [],
      gameTweaks: c.gameTweaks || {},
      withLines: c.withLines || {},
      tags: c.tags || [],
      bio: c.bio || ''
    });
  }
  return { characters: out, errors, dataVersion: json.dataVersion ?? null };
}

export const activeOnly = list => list.filter(c => c.status !== 'retired');

// 기록에 남아 있지만 명단에서 사라진 id도 화면이 깨지지 않게 대체 카드로 보여 준다.
export function unknownCard(id) {
  return { id, name: `(알 수 없음: ${id})`, color: '#5b6070', initial: '?', status: 'retired', unknown: true,
    traits: normTraits({}), lines: {}, relations: [], gameTweaks: {}, tags: [], bio: '' };
}
export function makeLookup(list) {
  const m = new Map(list.map(c => [c.id, c]));
  return id => m.get(id) || unknownCard(id);
}

// 게임별 보정(gameTweaks)을 얹은 성향
export function traitsFor(card, gameId) {
  const tw = card.gameTweaks && card.gameTweaks[gameId];
  return normTraits({ ...card.traits, ...((tw && tw.traits) || {}) });
}
export function linesFor(card, gameId, key) {
  const tw = card.gameTweaks && card.gameTweaks[gameId];
  const own = tw && tw.lines && tw.lines[key];
  const arr = (own && own.length ? own : card.lines[key]) || [];
  return arr;
}
// 같은 판에 특정 캐릭터가 있을 때만 하는 대사(withLines). 해당하는 상대가 없거나 대사가 없으면 빈 배열.
export function pairLinesFor(card, otherIds, key) {
  const out = [];
  for (const oid of otherIds) { const a = card.withLines && card.withLines[oid] && card.withLines[oid][key]; if (a && a.length) out.push(...a); }
  return out;
}
export { LINE_KEYS };
