// 공통 상수·검증. 스키마 버전은 여기서만 관리한다.
export const APP_VERSION = '0.3.0';
export const SCHEMA = { record: 1, backup: 1, character: 1, data: 1 };

export const TRAIT_KEYS = ['skill', 'aggression', 'risk', 'patience', 'bluff'];
export const TRAIT_LABELS = { skill: '실력', aggression: '공격성', risk: '모험심', patience: '인내', bluff: '허세' };
export const TARGET_MODES = ['none', 'leader', 'human', 'random', 'rival'];
export const TARGET_LABELS = { none: '없음', leader: '선두 견제', human: '플레이어 견제', random: '판마다 랜덤', rival: '라이벌 견제' };
export const LINE_KEYS = ['start', 'good', 'bad', 'overtaken', 'block', 'win', 'lose'];
export const RELATION_TYPES = ['rival', 'friend'];
export const ID_RE = /^[a-z][a-z0-9-]{1,31}$/;

export function clampN(v, a, b, d) {
  v = Number(v);
  return Number.isFinite(v) ? Math.min(b, Math.max(a, v)) : d;
}

// 성향 정규화: 누락·범위 밖 값은 기본값/한도로 보정. 모든 게임 모듈은 이걸 거친 값만 받는다.
export function normTraits(t) {
  t = t || {};
  return {
    skill: clampN(t.skill, 1, 10, 5),
    aggression: clampN(t.aggression, 0, 10, 5),
    risk: clampN(t.risk, 0, 10, 5),
    patience: clampN(t.patience, 0, 10, 5),
    bluff: clampN(t.bluff, 0, 10, 5),
    targetMode: TARGET_MODES.includes(t.targetMode) ? t.targetMode : 'none'
  };
}

export function uuid() {
  const c = globalThis.crypto;
  if (c && c.randomUUID) return c.randomUUID();
  const b = new Uint8Array(16);
  if (c && c.getRandomValues) c.getRandomValues(b); else for (let i = 0; i < 16; i++) b[i] = Math.floor(Math.random() * 256);
  b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function validateCharacter(c) {
  const e = [];
  if (!c || typeof c !== 'object') return ['캐릭터 카드가 객체가 아님'];
  if (typeof c.id !== 'string' || !ID_RE.test(c.id)) e.push(`id 형식 오류(영문 소문자·숫자·-, 2~32자): ${c.id}`);
  if (typeof c.name !== 'string' || !c.name.trim()) e.push(`${c.id}: 이름 없음`);
  if (c.status != null && !['active', 'retired'].includes(c.status)) e.push(`${c.id}: status는 active/retired`);
  if (typeof c.color !== 'string' || !/^#[0-9a-f]{6}$/i.test(c.color)) e.push(`${c.id}: color는 #rrggbb`);
  if (typeof c.initial !== 'string' || c.initial.length < 1 || c.initial.length > 2) e.push(`${c.id}: initial은 1~2글자`);
  if (!c.traits || typeof c.traits !== 'object') e.push(`${c.id}: traits 없음`);
  else {
    for (const k of TRAIT_KEYS) {
      const v = c.traits[k];
      const lo = k === 'skill' ? 1 : 0;
      if (typeof v !== 'number' || v < lo || v > 10) e.push(`${c.id}: traits.${k}는 ${lo}~10 숫자`);
    }
    if (!TARGET_MODES.includes(c.traits.targetMode)) e.push(`${c.id}: traits.targetMode 오류`);
  }
  if (c.lines != null) {
    if (typeof c.lines !== 'object') e.push(`${c.id}: lines는 객체`);
    else for (const [k, v] of Object.entries(c.lines)) {
      if (!Array.isArray(v) || !v.every(s => typeof s === 'string' && s)) e.push(`${c.id}: lines.${k}는 문자열 배열`);
    }
  }
  if (c.relations != null) {
    if (!Array.isArray(c.relations)) e.push(`${c.id}: relations는 배열`);
    else for (const r of c.relations) {
      if (!r || !ID_RE.test(r.id || '') || !RELATION_TYPES.includes(r.type)) e.push(`${c.id}: relations 항목 오류`);
    }
  }
  return e;
}

export function validateRecord(r) {
  const e = [];
  if (!r || typeof r !== 'object') return ['기록이 객체가 아님'];
  if (r.v !== SCHEMA.record) e.push(`record.v는 ${SCHEMA.record}이어야 함`);
  if (typeof r.id !== 'string' || r.id.length < 8) e.push('id 오류');
  if (typeof r.at !== 'string' || Number.isNaN(Date.parse(r.at))) e.push('at(날짜) 오류');
  if (typeof r.gameId !== 'string' || !ID_RE.test(r.gameId)) e.push('gameId 오류');
  if (typeof r.gameVersion !== 'string') e.push('gameVersion 오류');
  if (!Array.isArray(r.players) || r.players.length < 2) e.push('players는 2명 이상');
  else {
    let humans = 0;
    for (const p of r.players) {
      if (!Number.isInteger(p.seat) || !Number.isInteger(p.rank) || p.rank < 1) e.push('player seat/rank 오류');
      if (p.score != null && typeof p.score !== 'number') e.push('player score 오류');
      if (p.human) { humans++; if (p.characterId != null) e.push('사람 플레이어는 characterId가 null'); }
      else if (typeof p.characterId !== 'string' || !ID_RE.test(p.characterId)) e.push('봇 characterId 오류');
    }
    if (humans !== 1) e.push('사람 플레이어는 정확히 1명');
  }
  return e;
}
