import { SCHEMA, APP_VERSION, validateRecord } from './schema.js';

export const BACKUP_FORMAT = 'boardarchive-backup';
// 초상화는 이미지 data URL만 허용(화면에 그대로 쓰이므로 형식 검사)
export const isSafePortrait = u => typeof u === 'string' && /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(u);
const PORTABLE_SETTINGS = ['unlocked']; // 기기마다 다른 값(마지막 백업 시각 등)은 백업에 넣지 않는다

export async function exportBackup(storage) {
  const records = (await storage.all('records')).map(x => x.value);
  const portraits = {};
  for (const { key, value } of await storage.all('portraits')) portraits[key] = value;
  const campaigns = {};
  for (const { key, value } of await storage.all('campaigns')) campaigns[key] = value;
  const settings = {};
  for (const k of PORTABLE_SETTINGS) { const v = await storage.get('settings', k); if (v !== undefined) settings[k] = v; }
  return {
    format: BACKUP_FORMAT, schemaVersion: SCHEMA.backup, appVersion: APP_VERSION,
    exportedAt: new Date().toISOString(),
    data: { records, portraits, campaigns, settings }
  };
}

export function parseBackup(text) {
  let obj;
  try { obj = JSON.parse(text); } catch { throw new Error('백업 파일을 읽을 수 없습니다 (JSON 형식이 아님)'); }
  if (!obj || obj.format !== BACKUP_FORMAT) throw new Error('이 앱의 백업 파일이 아닙니다');
  return obj;
}

// 옛 백업 -> 현재 형식. 입력은 복사해서 쓰므로 원본 객체는 그대로 남는다.
// migrations[n] = (obj) => obj  (n 버전 -> n+1 버전)
export function migrateBackup(input, { migrations = {}, current = SCHEMA.backup } = {}) {
  let obj = structuredClone(input);
  if (!Number.isInteger(obj.schemaVersion) || obj.schemaVersion < 1) throw new Error('백업 버전 정보가 없습니다');
  if (obj.schemaVersion > current) throw new Error(`백업(v${obj.schemaVersion})이 이 앱(v${current})보다 새 버전입니다. 앱을 업데이트하세요.`);
  while (obj.schemaVersion < current) {
    const m = migrations[obj.schemaVersion];
    if (!m) throw new Error(`백업 v${obj.schemaVersion}→v${obj.schemaVersion + 1} 변환 함수가 없습니다`);
    obj = m(obj);
    obj.schemaVersion = obj.schemaVersion + 1;
  }
  return obj;
}

// mode 'merge'(기본): 기존 기록은 두고 없는 것만 추가(같은 파일을 두 번 가져와도 중복 없음).
// mode 'replace': 현재 기록·초상화·캠페인을 비우고 백업 내용으로 교체.
export async function importBackup(storage, input, { mode = 'merge', migrations, current } = {}) {
  const obj = migrateBackup(input, { migrations, current });
  const d = obj.data;
  if (!d || !Array.isArray(d.records)) throw new Error('백업 내용이 손상되었습니다 (records 없음)');
  const good = [], invalid = [];
  for (const r of d.records) (validateRecord(r).length ? invalid : good).push(r);

  const summary = { mode, records: { added: 0, skipped: 0, invalid: invalid.length }, portraits: { added: 0, updated: 0, kept: 0 },
    campaigns: { added: 0, updated: 0, kept: 0 }, unlocked: { added: 0 } };

  if (mode === 'replace') {
    for (const s of ['records', 'portraits', 'campaigns']) await storage.clear(s);
    for (const k of PORTABLE_SETTINGS) await storage.del('settings', k);
  }
  const existing = new Set((await storage.all('records')).map(x => x.key));
  for (const r of good) {
    if (existing.has(r.id)) { summary.records.skipped++; continue; }
    await storage.put('records', r.id, r); summary.records.added++;
  }
  const mergeNewer = async (store, items, counts) => {
    for (const [key, v] of Object.entries(items || {})) {
      if (store === 'portraits' && !isSafePortrait(v && v.dataUrl)) { summary.portraits.invalid = (summary.portraits.invalid || 0) + 1; continue; }
      const cur = await storage.get(store, key);
      if (!cur) { await storage.put(store, key, v); counts.added++; }
      else if ((v.updatedAt || '') > (cur.updatedAt || '')) { await storage.put(store, key, v); counts.updated++; }
      else counts.kept++;
    }
  };
  await mergeNewer('portraits', d.portraits, summary.portraits);
  await mergeNewer('campaigns', d.campaigns, summary.campaigns);
  const inU = (d.settings && d.settings.unlocked) || {};
  const curU = (await storage.get('settings', 'unlocked')) || {};
  for (const [id, at] of Object.entries(inU)) {
    if (!(id in curU) || at < curU[id]) { if (!(id in curU)) summary.unlocked.added++; curU[id] = at; }
  }
  await storage.put('settings', 'unlocked', curU);
  return summary;
}
