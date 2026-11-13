import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, assert, eq, throws, report } from './harness.mjs';
import { makeRng } from '../core/rng.js';
import { SCHEMA, validateCharacter, validateRecord, normTraits } from '../core/schema.js';
import { parseCharacters, makeLookup, traitsFor, activeOnly } from '../core/characters.js';
import { drawSeats, rivalSeatsFor } from '../core/seating.js';
import { buildRecord, saveRecord, listRecords } from '../core/records.js';
import { overall, gameStats, characterStats, computeAchievements } from '../core/stats.js';
import { createMemoryStorage, ensureDataSchema, saveCampaign, loadCampaign } from '../core/storage.js';
import { exportBackup, importBackup, migrateBackup, parseBackup } from '../core/backup.js';
import { simulate, contractCheck } from '../core/runner.js';
import stopTest from '../games/stop-test.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const readJson = p => JSON.parse(readFileSync(join(ROOT, p), 'utf8'));
const charsJson = readJson('data/characters.json');
const { characters: REAL, errors: realErrs } = parseCharacters(charsJson);
const achDefs = readJson('data/achievements.json').achievements;
const gamesIndex = readJson('games/index.json');

function synth(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `t-${String.fromCharCode(97 + i)}`, name: `테스트${i}`, status: 'active', color: '#336699', initial: 'T',
    traits: { skill: 1 + (i * 3) % 10, aggression: (i * 2) % 11, risk: (i * 5) % 11, patience: (i * 7) % 11, bluff: 5, targetMode: ['none', 'leader', 'human', 'random', 'rival'][i % 5] },
    relations: [], lines: {}, gameTweaks: {}
  }));
}
const mkResult = ranks => ({ ranking: ranks.map((r, seat) => ({ seat, rank: r, score: 10 - r })), summary: 's' });
function rec(game, seats, ranks, at, gv = '0.1.0') {
  return buildRecord({ game: { id: game, version: gv }, seats, result: mkResult(ranks), at: new Date(at) });
}
const SEATS = [{ seat: 0, human: true, characterId: null }, { seat: 1, human: false, characterId: 'rapi' }, { seat: 2, human: false, characterId: 'edel' }];

// ============ 캐릭터 데이터 ============
await test('캐릭터 데이터', 'characters.json이 오류 없이 읽히고 3명이 있다', () => { eq(realErrs, []); eq(REAL.map(c => c.id), ['rapi', 'edel', 'yuno']); });
await test('캐릭터 데이터', '지정한 성향 수치가 그대로 들어 있다 (라피 8/4/2/9/2, 에델 9/8/6/5/7, 유노 6/9/9/3/5)', () => {
  const t = id => REAL.find(c => c.id === id).traits;
  eq([t('rapi').skill, t('rapi').aggression, t('rapi').risk, t('rapi').patience, t('rapi').bluff, t('rapi').targetMode], [8, 4, 2, 9, 2, 'none']);
  eq([t('edel').skill, t('edel').aggression, t('edel').risk, t('edel').patience, t('edel').bluff, t('edel').targetMode], [9, 8, 6, 5, 7, 'leader']);
  eq([t('yuno').skill, t('yuno').aggression, t('yuno').risk, t('yuno').patience, t('yuno').bluff, t('yuno').targetMode], [6, 9, 9, 3, 5, 'human']);
});
await test('캐릭터 데이터', '모든 캐릭터에 대사집 7종(시작·칭찬·실수·추월·견제·승리·패배)이 있다', () => {
  for (const c of REAL) for (const k of ['start', 'good', 'bad', 'overtaken', 'block', 'win', 'lose']) assert(c.lines[k] && c.lines[k].length >= 1, `${c.id}.${k} 없음`);
});
await test('캐릭터 데이터', '잘못된 카드는 건너뛰고 오류로 보고하며 앱은 죽지 않는다', () => {
  const r = parseCharacters({ characters: [{ ...REAL[0] }, { id: 'Bad Id', name: 'x', color: '#fff', initial: 'x', traits: {} }, { ...REAL[0] }] });
  eq(r.characters.length, 1); assert(r.errors.length >= 2, '오류 보고 필요');
});
await test('캐릭터 데이터', '범위 밖/누락 성향은 보정되어 게임 모듈에 안전한 값만 전달된다', () => {
  const t = normTraits({ skill: 99, aggression: -3, targetMode: '엉뚱' });
  eq([t.skill, t.aggression, t.risk, t.targetMode], [10, 0, 5, 'none']);
});
await test('캐릭터 데이터', '게임별 보정(gameTweaks)이 해당 게임에만 적용된다', () => {
  const c = { ...REAL[0], gameTweaks: { 'stop-test': { traits: { risk: 9 } } } };
  eq(traitsFor(c, 'stop-test').risk, 9); eq(traitsFor(c, 'other').risk, 2);
});
await test('캐릭터 데이터', '명단에 없는 id도 "(알 수 없음)" 카드로 안전하게 표시된다', () => {
  const l = makeLookup(REAL); assert(l('rapi').name === '라피'); assert(l('ghost').unknown === true && l('ghost').name.includes('ghost'));
});

// ============ 좌석 ============
await test('좌석 랜덤', '3·4인 좌석: 사람 1명, 봇 중복 없음, 인원 정확', () => {
  const rng = makeRng(5);
  for (const n of [3, 4]) for (let i = 0; i < 200; i++) {
    const s = drawSeats({ characters: REAL, count: n, rng });
    eq(s.length, n); eq(s.filter(x => x.human).length, 1);
    const ids = s.filter(x => !x.human).map(x => x.characterId); eq(new Set(ids).size, n - 1);
  }
});
await test('좌석 랜덤', '사람 자리가 모든 위치에 골고루 나온다 (고정 아님)', () => {
  const rng = makeRng(9); const hit = [0, 0, 0, 0];
  for (let i = 0; i < 800; i++) hit[drawSeats({ characters: REAL, count: 4, rng }).find(x => x.human).seat]++;
  assert(hit.every(h => h > 120), '편중: ' + hit);
});
await test('좌석 랜덤', '퇴역 캐릭터는 뽑히지 않고, 캐릭터가 모자라면 명확한 오류', async () => {
  const chars = [...REAL.slice(0, 2), { ...REAL[2], status: 'retired' }];
  const rng = makeRng(1);
  for (let i = 0; i < 100; i++) assert(!drawSeats({ characters: chars, count: 3, rng }).some(s => s.characterId === 'yuno'));
  await throws(() => drawSeats({ characters: chars, count: 4, rng }), /캐릭터가 부족/);
});
await test('좌석 랜덤', '고정(pinned) 캐릭터는 반드시 앉는다', () => {
  const rng = makeRng(2);
  for (let i = 0; i < 100; i++) assert(drawSeats({ characters: REAL, count: 3, rng, pinned: ['yuno'] }).some(s => s.characterId === 'yuno'));
});
await test('좌석 랜덤', '라이벌 상성: 같은 판에 라이벌이 앉았을 때만 라이벌 좌석이 계산된다', () => {
  const edel = REAL.find(c => c.id === 'edel');
  eq(rivalSeatsFor(edel, [{ seat: 0, human: true }, { seat: 1, characterId: 'yuno' }, { seat: 2, characterId: 'rapi' }]), [1]);
  eq(rivalSeatsFor(edel, [{ seat: 0, human: true }, { seat: 1, characterId: 'rapi' }]), []);
});

// ============ 기록·통계·업적 ============
await test('기록·통계', '기록 한 줄이 형식 검사를 통과하고, 사람이 없거나 2명이면 거부된다', async () => {
  const r = rec('stop-test', SEATS, [1, 2, 3], '2026-01-01T00:00:00Z'); eq(validateRecord(r), []);
  assert(validateRecord({ ...r, players: r.players.map(p => ({ ...p, human: false, characterId: p.characterId || 'rapi' })) }).length > 0);
  assert(validateRecord({ ...r, players: [r.players[0]] }).length > 0);
});
await test('기록·통계', '전적·승률·캐릭터별 상대 전적이 기록에서 정확히 계산된다', () => {
  const R = [
    rec('stop-test', SEATS, [1, 2, 3], '2026-01-01T00:00:00Z'),   // 내가 1등
    rec('stop-test', SEATS, [3, 1, 2], '2026-01-02T00:00:00Z'),   // 라피 1등, 에델 2등, 나 3등
    rec('stop-test', SEATS, [2, 2, 1], '2026-01-03T00:00:00Z'),   // 에델 1등, 나=라피 동순위
    rec('other-game', SEATS, [1, 3, 2], '2026-01-04T00:00:00Z')
  ];
  eq(overall(R), { played: 4, wins: 2, winRate: 0.5 });
  const g = gameStats(R); eq(g['stop-test'].played, 3); eq(g['stop-test'].wins, 1); eq(g['other-game'].wins, 1);
  const c = characterStats(R);
  eq([c.rapi.met, c.rapi.myWins, c.rapi.myLosses, c.rapi.ties, c.rapi.theirWins], [4, 2, 1, 1, 1]);
  eq([c.edel.myWins, c.edel.myLosses, c.edel.ties, c.edel.theirWins], [2, 2, 0, 1]);
  eq(characterStats(R, { gameId: 'other-game' }).rapi.met, 1);
});
await test('기록·통계', '업적: 첫 승리·3연승·캐릭터 격파·전원 집합이 달성 시점과 함께 계산된다', () => {
  const R = [
    rec('stop-test', SEATS, [2, 1, 3], '2026-01-01T00:00:00Z'),
    rec('stop-test', SEATS, [1, 2, 3], '2026-01-02T00:00:00Z'),
    rec('stop-test', SEATS, [1, 2, 3], '2026-01-03T00:00:00Z'),
    rec('stop-test', SEATS, [1, 2, 3], '2026-01-04T00:00:00Z')
  ];
  const a = Object.fromEntries(computeAchievements(R, achDefs, { activeIds: ['rapi', 'edel'] }).map(x => [x.id, x]));
  eq(a['first-game'].at, '2026-01-01T00:00:00.000Z'); eq(a['first-win'].at, '2026-01-02T00:00:00.000Z');
  eq(a['win-streak-3'].at, '2026-01-04T00:00:00.000Z'); eq(a['beat-rapi'].at, '2026-01-02T00:00:00.000Z');
  assert(a['meet-all'].unlocked, '전원 집합(2명 기준) 달성'); assert(!a['beat-yuno'].unlocked && !a['ten-games'].unlocked);
  eq(a['ten-games'].progress, 4);
});
await test('기록·통계', '업적 정의에 모르는 종류가 있어도 앱이 죽지 않는다', () => {
  const r = computeAchievements([], [{ id: 'x', name: 'x', desc: 'x', type: '미래의업적' }]); assert(r[0].unknownType && !r[0].unlocked);
});

// ============ 저장·백업 ============
await test('저장·백업', '기록 저장 후 시간순으로 읽힌다', async () => {
  const st = createMemoryStorage();
  await saveRecord(st, rec('stop-test', SEATS, [1, 2, 3], '2026-01-02T00:00:00Z'));
  await saveRecord(st, rec('stop-test', SEATS, [2, 1, 3], '2026-01-01T00:00:00Z'));
  const l = await listRecords(st); eq(l.map(r => r.at.slice(0, 10)), ['2026-01-01', '2026-01-02']);
});
await test('저장·백업', '내보내기→빈 저장소로 가져오기하면 기록·초상화·캠페인·업적이 그대로 복원된다', async () => {
  const a = createMemoryStorage();
  await saveRecord(a, rec('stop-test', SEATS, [1, 2, 3], '2026-01-01T00:00:00Z'));
  await a.put('portraits', 'rapi', { dataUrl: 'data:image/jpeg;base64,AAAA', updatedAt: '2026-01-01T00:00:00Z' });
  await saveCampaign(a, { gameId: 'legacy-x', slot: 1, gameVersion: '1.0.0', saveSchema: 1, data: { chapter: 3, flags: ['a'] } });
  await a.put('settings', 'unlocked', { 'first-game': '2026-01-01T00:00:00.000Z' });
  const b = createMemoryStorage();
  const sum = await importBackup(b, JSON.parse(JSON.stringify(await exportBackup(a))));
  eq([sum.records.added, sum.portraits.added, sum.campaigns.added, sum.unlocked.added], [1, 1, 1, 1]);
  eq((await listRecords(b)).length, 1);
  eq((await b.get('portraits', 'rapi')).dataUrl, 'data:image/jpeg;base64,AAAA');
  eq((await loadCampaign(b, 'legacy-x', 1)).data, { chapter: 3, flags: ['a'] });
});
await test('저장·백업', '같은 백업을 두 번 가져와도 기록이 중복되지 않는다 (합치기)', async () => {
  const a = createMemoryStorage(); await saveRecord(a, rec('stop-test', SEATS, [1, 2, 3], '2026-01-01T00:00:00Z'));
  const bk = await exportBackup(a); const b = createMemoryStorage();
  await importBackup(b, bk); const s2 = await importBackup(b, bk);
  eq((await listRecords(b)).length, 1); eq([s2.records.added, s2.records.skipped], [0, 1]);
});
await test('저장·백업', '합치기는 기존 기록을 지우지 않고, 전체 교체는 백업 내용으로 바꾼다', async () => {
  const a = createMemoryStorage(); await saveRecord(a, rec('stop-test', SEATS, [1, 2, 3], '2026-01-01T00:00:00Z'));
  const bk = await exportBackup(a); const b = createMemoryStorage();
  await saveRecord(b, rec('stop-test', SEATS, [2, 1, 3], '2026-02-01T00:00:00Z'));
  await importBackup(b, bk, { mode: 'merge' }); eq((await listRecords(b)).length, 2);
  await importBackup(b, bk, { mode: 'replace' }); eq((await listRecords(b)).length, 1);
});
await test('저장·백업', '초상화·캠페인은 합칠 때 더 최근 것이 남는다', async () => {
  const a = createMemoryStorage(), b = createMemoryStorage();
  await a.put('portraits', 'rapi', { dataUrl: 'data:image/png;base64,NEW', updatedAt: '2026-05-01T00:00:00Z' });
  await b.put('portraits', 'rapi', { dataUrl: 'data:image/png;base64,OLD', updatedAt: '2026-01-01T00:00:00Z' });
  await importBackup(b, await exportBackup(a)); eq((await b.get('portraits', 'rapi')).dataUrl, 'data:image/png;base64,NEW');
  const c = createMemoryStorage(); await c.put('portraits', 'rapi', { dataUrl: 'data:image/png;base64,MID', updatedAt: '2026-09-01T00:00:00Z' });
  const s = await importBackup(c, await exportBackup(a)); eq((await c.get('portraits', 'rapi')).dataUrl, 'data:image/png;base64,MID'); eq(s.portraits.kept, 1);
});
await test('저장·백업', '이상한 파일은 거부된다: JSON 아님 / 다른 앱 / 더 새 버전 / 내용 손상', async () => {
  await throws(() => parseBackup('이건 json이 아님'), /읽을 수 없/);
  await throws(() => parseBackup('{"format":"other"}'), /이 앱의 백업/);
  await throws(() => migrateBackup({ format: 'boardarchive-backup', schemaVersion: 99, data: {} }), /새 버전/);
  await throws(() => importBackup(createMemoryStorage(), { format: 'boardarchive-backup', schemaVersion: 1, data: {} }), /손상/);
});
await test('저장·백업', '손상된 기록·위험한 초상화 문자열은 건너뛰고 나머지는 가져온다', async () => {
  const a = createMemoryStorage(); await saveRecord(a, rec('stop-test', SEATS, [1, 2, 3], '2026-01-01T00:00:00Z'));
  const bk = await exportBackup(a);
  bk.data.records.push({ v: 1, id: 'broken-record-id', players: [] });
  bk.data.portraits.evil = { dataUrl: 'javascript:alert(1)', updatedAt: '2026-01-01T00:00:00Z' };
  const b = createMemoryStorage(); const s = await importBackup(b, bk);
  eq([s.records.added, s.records.invalid], [1, 1]); assert(!(await b.get('portraits', 'evil')), '위험 초상화 저장됨');
});
await test('저장·백업', '백업 형식이 바뀌어도(v1→v2) 옛 백업이 변환되어 열리고 원본 객체는 건드리지 않는다', async () => {
  const old = { format: 'boardarchive-backup', schemaVersion: 1, data: { records: [], portraits: {}, campaigns: {}, settings: {} } };
  const snapshot = JSON.stringify(old);
  const mig = { 1: o => ({ ...o, data: { ...o.data, extra: 'new-field' } }) };
  const out = migrateBackup(old, { migrations: mig, current: 2 });
  eq(out.schemaVersion, 2); eq(out.data.extra, 'new-field'); eq(JSON.stringify(old), snapshot);
  await throws(() => migrateBackup(old, { migrations: {}, current: 2 }), /변환 함수가 없/);
});
await test('저장·백업', '앱 데이터 스키마가 올라가면 변환 전 기록 스냅샷이 남고 기록이 보존된다', async () => {
  const st = createMemoryStorage();
  await ensureDataSchema(st, { current: 1 });
  const r = rec('stop-test', SEATS, [1, 2, 3], '2026-01-01T00:00:00Z'); await saveRecord(st, r);
  const out = await ensureDataSchema(st, { current: 2, migrations: { 1: async s => { const all = await s.all('records'); for (const { key, value } of all) await s.put('records', key, { ...value, note: 'migrated' }); } } });
  eq(out.ran, [2]);
  eq((await st.get('records', r.id)).note, 'migrated');
  eq((await st.get('meta', 'snapshot-before-v2')).records[0].value.note, undefined);   // 원본 보존
  await throws(() => ensureDataSchema(st, { current: 1 }), /새 버전/);
});
await test('저장·백업', '캠페인 저장 슬롯: 슬롯별로 저장·불러오기·덮어쓰기가 되고 서로 섞이지 않는다', async () => {
  const st = createMemoryStorage();
  await saveCampaign(st, { gameId: 'legacy-x', slot: 1, gameVersion: '1.0.0', data: { ch: 1 } });
  await saveCampaign(st, { gameId: 'legacy-x', slot: 2, gameVersion: '1.0.0', data: { ch: 7 } });
  await saveCampaign(st, { gameId: 'legacy-x', slot: 1, gameVersion: '1.1.0', saveSchema: 2, data: { ch: 2 } });
  eq((await loadCampaign(st, 'legacy-x', 1)).data, { ch: 2 }); eq((await loadCampaign(st, 'legacy-x', 1)).saveSchema, 2); eq((await loadCampaign(st, 'legacy-x', 2)).data, { ch: 7 });
  eq(await loadCampaign(st, 'legacy-x', 3), undefined);
});

// ============ 패치해도 기록 보존 ============
await test('패치 보존', '캐릭터를 추가·수정·퇴역시키고 게임 버전을 올려도 기존 기록과 통계는 그대로다', async () => {
  const st = createMemoryStorage();
  await saveRecord(st, rec('stop-test', SEATS, [1, 2, 3], '2026-01-01T00:00:00Z', '0.1.0'));
  const before = JSON.stringify(await listRecords(st));
  // 패치: 라피 이름 변경, 에델 퇴역, 신규 캐릭터 추가
  const patched = parseCharacters({ characters: [
    { ...REAL[0], name: '라피(개정)' }, { ...REAL[1], status: 'retired' }, REAL[2],
    { ...synth(1)[0], id: 'newbie' }] }).characters;
  const look = makeLookup(patched);
  eq(JSON.stringify(await listRecords(st)), before);                                  // 기록 바이트 단위로 동일
  const cs = characterStats(await listRecords(st)); eq(cs.rapi.met, 1); eq(cs.edel.met, 1);
  assert(look('rapi').name === '라피(개정)' && look('edel').status === 'retired');
  assert(!drawSeats({ characters: patched, count: 3, rng: makeRng(1) }).some(s => s.characterId === 'edel'), '퇴역자는 더 이상 안 앉음');
  // 게임 버전 업 이후 기록과 섞여도 같은 게임으로 집계, 버전은 기록에 남음
  await saveRecord(st, rec('stop-test', SEATS, [2, 1, 3], '2026-01-02T00:00:00Z', '0.2.0'));
  const l = await listRecords(st); eq(gameStats(l)['stop-test'].played, 2); eq(l.map(r => r.gameVersion), ['0.1.0', '0.2.0']);
});
await test('패치 보존', '명단에서 완전히 사라진 캐릭터의 기록도 통계·화면 계산이 깨지지 않는다', () => {
  const R = [rec('stop-test', [{ seat: 0, human: true }, { seat: 1, characterId: 'ghost' }, { seat: 2, characterId: 'rapi' }], [1, 2, 3], '2026-01-01T00:00:00Z')];
  eq(characterStats(R).ghost.met, 1); assert(makeLookup(REAL)('ghost').name.includes('ghost'));
});

// ============ 게임 모듈 규격 ============
const entry = gamesIndex.games.find(g => g.id === 'stop-test');
const SYN = synth(8);
await test('게임 모듈 규격', '시험용 게임이 규격 검사를 통과한다 (3~7인 × 200판: 오류 0, 불법 수 0, 시드 재현, JSON 저장 가능)', () => {
  const r = contractCheck(stopTest, entry, SYN, { games: 200 });
  assert(r.ok, r.problems.join(' / '));
  eq(r.sims.map(s => s.count), [3, 4, 5, 6, 7]);
  const total = r.sims.reduce((a, s) => a + s.ok, 0); assert(total === 1000, `정상 완료 ${total}/1000`);
});
await test('게임 모듈 규격', '실제 캐릭터 3명으로 3·4인 1000판: 오류 0건, 불법 수 0건', () => {
  for (const n of [3, 4]) { const s = simulate(stopTest, REAL, { games: 1000, count: n, seed: 21 }); eq([s.errors, s.illegal, s.ok], [0, 0, 1000]); }
});
await test('게임 모듈 규격', 'games/index.json의 모든 게임 파일이 존재하고 메타 정보가 모듈과 일치한다', async () => {
  for (const g of gamesIndex.games) {
    assert(existsSync(join(ROOT, 'games', g.file)), `${g.file} 없음`);
    const m = (await import(`../games/${g.file}`)).default; const r = contractCheck(m, g, SYN, { games: 50 }); assert(r.ok, `${g.id}: ${r.problems.join(' / ')}`);
  }
});
await test('게임 모듈 규격', '[검사기 자체 점검] 봇이 불법 수를 고르는 게임은 잡아낸다', () => {
  const bad = { ...stopTest, botChoose: () => ({ move: 'fly', reason: 'x' }) };
  const r = contractCheck(bad, entry, SYN, { games: 30 }); assert(!r.ok && r.problems.some(p => p.includes('불법 수')), '불법 수를 못 잡음');
});
await test('게임 모듈 규격', '[검사기 자체 점검] 전달받은 rng 대신 Math.random을 쓰는 게임은 잡아낸다', () => {
  const bad = { ...stopTest, applyMove(s, mv, rng) { return stopTest.applyMove.call(bad, s, mv, { ...rng, int: n => Math.floor(Math.random() * n) }); } };
  const r = contractCheck(bad, entry, SYN, { games: 50 }); assert(!r.ok && r.problems.some(p => p.includes('시드')), '비결정성을 못 잡음');
});
await test('게임 모듈 규격', '[검사기 자체 점검] 끝나지 않는 게임(무한 루프)과 목록/메타 불일치를 잡아낸다', () => {
  const loop = { ...stopTest, isOver: () => false };
  assert(!contractCheck(loop, entry, SYN, { games: 5 }).ok, '무한 루프를 못 잡음');
  assert(!contractCheck(stopTest, { ...entry, version: '9.9.9' }, SYN).ok, '메타 불일치를 못 잡음');
});
await test('게임 모듈 규격', '인원 범위: 캐릭터 수가 모자라면 가능한 인원까지만 검사한다 (실제 3명 → 3·4인)', () => {
  const r = contractCheck(stopTest, entry, REAL, { games: 50 }); assert(r.ok); eq(r.sims.map(s => s.count), [3, 4]);
});

// ============ 배포 파일 점검 ============
await test('배포 파일', 'precache.json이 최신이다 (파일을 추가했다면 node tools/build.mjs 재실행 필요)', () => {
  const listed = new Set(readJson('precache.json').files); const SKIP = new Set(['tests', 'tools', 'node_modules', 'precache.json', 'sw.js']);
  const actual = [];
  (function walk(d) { for (const n of readdirSync(d)) { if (SKIP.has(n) || n.startsWith('.')) continue; const p = join(d, n); statSync(p).isDirectory() ? walk(p) : actual.push(relative(ROOT, p).split('\\').join('/')); } })(ROOT);
  const missing = actual.filter(f => !listed.has(f)); assert(!missing.length, '목록에 빠짐: ' + missing.join(', '));
});
await test('배포 파일', 'index.html·매니페스트가 가리키는 파일이 모두 존재한다 (아이콘·스크립트·스타일)', () => {
  const html = readFileSync(join(ROOT, 'index.html'), 'utf8');
  for (const m of html.matchAll(/(?:src|href)="([^"#]+)"/g)) assert(existsSync(join(ROOT, m[1])), `없음: ${m[1]}`);
  for (const i of readJson('manifest.webmanifest').icons) assert(existsSync(join(ROOT, i.src)), `아이콘 없음: ${i.src}`);
});
await test('배포 파일', '모든 경로가 상대 경로다 (하위 폴더에 올려도 동작: 절대경로 "/..." 사용 없음)', () => {
  for (const f of ['index.html', 'sw.js', 'src/app.js', 'src/host.js', 'src/views.js']) {
    const t = readFileSync(join(ROOT, f), 'utf8');
    assert(!/(?:src|href)="\/[^/]/.test(t) && !/fetch\(\s*['"`]\//.test(t) && !/from\s+['"]\//.test(t), `${f}에 절대경로 사용`);
  }
});

const fail = report('코어·규격 자동 테스트');

// ---- 참고: 시험용 게임 봇 대전 승률 (4인, 2000판) ----
const s4 = simulate(stopTest, REAL, { games: 2000, count: 4, seed: 99 });
console.log('\n[참고] 시험용 게임 4인 2000판 승률 (사람 자리=기준봇)');
for (const [id, v] of Object.entries(s4.perCharacter)) console.log(`  ${id.padEnd(8)} ${(v.winRate * 100).toFixed(1)}%`);
console.log(`  평균 ${s4.avgSteps.toFixed(0)}수, 경고: ${s4.warnings.length ? s4.warnings.join('; ') : '없음'}`);
process.exit(fail ? 1 : 0);
