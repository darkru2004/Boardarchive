import { SCHEMA } from './schema.js';

// 저장소 어댑터: 같은 인터페이스를 메모리(자동 테스트)와 IndexedDB(실제 앱)가 구현한다.
// 칸(store): meta(내부 정보) / records(판 기록) / portraits(초상화) / campaigns(캠페인 저장 슬롯) / settings(설정)
export const STORES = ['meta', 'records', 'portraits', 'campaigns', 'settings'];

export function createMemoryStorage() {
  const m = Object.fromEntries(STORES.map(s => [s, new Map()]));
  const cp = v => (v === undefined ? undefined : structuredClone(v));
  return {
    kind: 'memory',
    async get(s, k) { return cp(m[s].get(k)); },
    async put(s, k, v) { m[s].set(k, cp(v)); },
    async del(s, k) { m[s].delete(k); },
    async all(s) { return [...m[s]].map(([key, value]) => ({ key, value: cp(value) })); },
    async clear(s) { m[s].clear(); }
  };
}

export function createIdbStorage(dbName = 'boardarchive') {
  let dbp = null;
  const open = () => new Promise((resolve, reject) => {
    const req = indexedDB.open(dbName, 1);
    // DB 구조(칸 목록)가 바뀔 때만 이 숫자를 올린다. 데이터 스키마와는 별개.
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const s of STORES) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  const db = () => (dbp ||= open());
  const run = async (store, mode, fn) => {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, mode);
      let value;
      t.oncomplete = () => resolve(value);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      fn(t.objectStore(store), v => { value = v; });
    });
  };
  return {
    kind: 'idb',
    get: (s, k) => run(s, 'readonly', (st, set) => { const r = st.get(k); r.onsuccess = () => set(r.result); }),
    put: (s, k, v) => run(s, 'readwrite', st => { st.put(v, k); }),
    del: (s, k) => run(s, 'readwrite', st => { st.delete(k); }),
    clear: s => run(s, 'readwrite', st => { st.clear(); }),
    all: s => run(s, 'readonly', (st, set) => {
      const keys = st.getAllKeys(), vals = st.getAll();
      vals.onsuccess = () => set(keys.result.map((key, i) => ({ key, value: vals.result[i] })));
    }),
    async close() { if (dbp) { (await dbp).close(); dbp = null; } },
    async destroy() {
      await this.close();
      await new Promise((res, rej) => { const r = indexedDB.deleteDatabase(dbName); r.onsuccess = res; r.onblocked = res; r.onerror = () => rej(r.error); });
    }
  };
}

// 앱 시작 시 호출: 저장된 데이터의 스키마 버전을 확인하고 필요하면 단계별로 변환한다.
// 변환 직전에 기록 전체를 meta에 스냅샷으로 남겨 원본을 보존한다.
export async function ensureDataSchema(storage, { current = SCHEMA.data, migrations = {} } = {}) {
  const cur = await storage.get('meta', 'dataSchema');
  if (cur === undefined) { await storage.put('meta', 'dataSchema', current); return { from: null, to: current, ran: [] }; }
  if (cur > current) throw new Error(`저장된 데이터(v${cur})가 이 앱(v${current})보다 새 버전입니다. 앱을 최신으로 업데이트하세요.`);
  const ran = [];
  let v = cur;
  while (v < current) {
    const m = migrations[v];
    if (!m) throw new Error(`데이터 v${v}→v${v + 1} 변환 함수가 없습니다`);
    await storage.put('meta', `snapshot-before-v${v + 1}`, { at: new Date().toISOString(), records: await storage.all('records') });
    await m(storage);
    v++;
    await storage.put('meta', 'dataSchema', v);
    ran.push(v);
  }
  return { from: cur, to: v, ran };
}

// 캠페인(레거시)형 게임용 저장 슬롯. 게임 모듈은 자기 저장 형식(saveSchema)을 스스로 관리한다.
export const campaignKey = (gameId, slot) => `${gameId}:${slot}`;
export async function saveCampaign(storage, { gameId, slot, gameVersion, saveSchema = 1, data }) {
  const rec = { gameId, slot, gameVersion, saveSchema, data, updatedAt: new Date().toISOString() };
  await storage.put('campaigns', campaignKey(gameId, slot), rec);
  return rec;
}
export const loadCampaign = (storage, gameId, slot) => storage.get('campaigns', campaignKey(gameId, slot));
export const deleteCampaign = (storage, gameId, slot) => storage.del('campaigns', campaignKey(gameId, slot));
