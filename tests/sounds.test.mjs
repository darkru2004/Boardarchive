import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { deflateRawSync } from 'node:zlib';
import { test, assert, eq, throws, report } from './harness.mjs';
import { createMemoryStorage } from '../core/storage.js';
import { slotsFor, findSlot, parseSoundName, putSlotFiles, listScope, delSlot, setSlotGain, migrateBgm, buildZip, readZip, crc32, exportPack, importSoundFiles, sndKey, parseSndKey, SND_MAX_FILES } from '../core/sounds.js';
import { SFX_NAMES } from '../src/fx.js';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const common = JSON.parse(readFileSync(join(ROOT, 'core/sounds.json'), 'utf8'));
const games = JSON.parse(readFileSync(join(ROOT, 'games/index.json'), 'utf8')).games;
const blob = (s, type = 'audio/mpeg') => new Blob([new Uint8Array([1, 2, 3, ...Buffer.from(s)])], { type });
const file = (name, s = name) => Object.assign(blob(s), { name });

await test('소리', '공용 목록: id 중복 없음 · kind·group 올바름 · 합성음 이름이 실제로 있음', () => {
  const ids = common.slots.map(s => s.id); eq(new Set(ids).size, ids.length);
  const gids = new Set(common.groups.map(g => g.id));
  for (const s of common.slots) {
    assert(/^[a-z0-9._-]+$/.test(s.id), s.id); assert(['sfx', 'voice', 'loop', 'oneshot'].includes(s.kind), s.id + ' kind'); assert(gids.has(s.group), s.id + ' group');
    assert(s.label && s.desc, s.id + ' 이름·설명');
    if (s.kind === 'sfx') assert(s.synth && SFX_NAMES.includes(s.synth), s.id + ' synth ' + s.synth);
  }
  for (const k of ['bgm.main', 'bgm.win', 'bgm.lose']) assert(ids.includes(k));
});
await test('소리', '옛 합성음 이름 20종이 모두 공용 칸에 연결됨 (예전 호출이 그대로 파일 칸을 탐)', () => {
  const list = slotsFor(common, null);
  for (const n of SFX_NAMES) assert(findSlot(list, n), '연결 안 됨: ' + n);
  eq(findSlot(list, 'slam').id, 'card.slam'); eq(findSlot(list, 'card.draw').id, 'card.draw');
});
await test('소리', '게임 전용 칸이 공용 같은 id를 덮어씀 · 게임 칸이 앞에 옴', () => {
  const entry = { sound: { slots: [{ id: 'atk.mage', group: '직업별 공격', kind: 'sfx', label: '마법사', synth: 'impact' }, { id: 'hit.heavy', group: '피해', kind: 'sfx', label: '큰 한 방', synth: 'impact' }] } };
  const l = slotsFor(common, entry);
  eq(l.slots[0].id, 'atk.mage'); assert(l.slots[0].own); eq(l.slots.filter(s => s.id === 'hit.heavy').length, 1); assert(findSlot(l, 'hit.heavy').own);
  assert(l.groups[0].own && l.groups[0].label === '직업별 공격');
});
await test('소리', '모든 게임의 sound.slots 검증 (id 형식·중복·kind·대사 길이)', () => {
  for (const g of games) {
    const ss = (g.sound && g.sound.slots) || []; const ids = new Set();
    for (const s of ss) {
      assert(/^[a-z0-9._-]+$/.test(s.id), g.id + ' ' + s.id); assert(!ids.has(s.id), g.id + ' 중복 ' + s.id); ids.add(s.id);
      assert(['sfx', 'voice', 'loop', 'oneshot'].includes(s.kind || 'sfx'), s.id); assert(s.label, s.id);
      if (s.kind === 'voice') assert(s.line && [].concat(s.line).every(l => l.length <= 40), g.id + ' 대사 ' + s.id);
      if ((s.kind || 'sfx') === 'sfx' && s.synth) assert(SFX_NAMES.includes(s.synth), s.id + ' synth');
    }
  }
});
await test('소리', '파일 이름 → 칸 자동 분류', () => {
  const ids = ['regicide-inferno', 'splendor'], lists = { all: slotsFor(common, null), 'regicide-inferno': slotsFor(common, { sound: { slots: [{ id: 'atk.mage', kind: 'sfx', label: 'a' }, { id: 'vo.kalannar.enter', kind: 'voice', label: 'v', line: 'x' }, { id: 'bgm.mage', kind: 'loop', label: 'b' }] } }), splendor: slotsFor(common, null) };
  const ctx = { gameIds: ids, slotsOf: sc => new Set(lists[sc].slots.map(s => s.id)) };
  eq(parseSoundName('regicide-inferno.atk.mage-01.mp3', ctx), { scope: 'regicide-inferno', slot: 'atk.mage', n: 1 });
  eq(parseSoundName('regicide-inferno.vo.kalannar.enter.mp3', ctx), { scope: 'regicide-inferno', slot: 'vo.kalannar.enter', n: 1 });
  eq(parseSoundName('HIT.heavy-02.OGG', ctx), { scope: 'all', slot: 'hit.heavy', n: 2 });
  eq(parseSoundName('폴더/bgm.main.mp3', ctx), { scope: 'all', slot: 'bgm.main', n: 1 });
  eq(parseSoundName('card.draw_3.wav', ctx), { scope: 'all', slot: 'card.draw', n: 3 });
  eq(parseSoundName('regicide-inferno.bgm.mage.mp3', ctx).slot, 'bgm.mage');
  assert(parseSoundName('regicide-inferno.nope-01.mp3', ctx).error); assert(parseSoundName('atk.mage-01.mp3', ctx).error);   // 게임 전용 칸은 공용에서 못 찾음
  assert(parseSoundName('splendor.ui.tap-01.mp3', ctx).scope === 'splendor');
  eq(parseSoundName('atk.mage-02.mp3', { ...ctx, defaultScope: 'regicide-inferno' }), { scope: 'regicide-inferno', slot: 'atk.mage', n: 2 });   // 게임 소리 창에서 올리면 이름에 게임이 없어도 그 게임으로
});
await test('소리', '저장·변형 여러 개·BGM은 한 곡·상한·지우기', async () => {
  const st = createMemoryStorage();
  await putSlotFiles(st, 'all', 'hit.heavy', [file('a.mp3'), file('b.ogg')]);
  eq([...(await listScope(st, 'all')).get('hit.heavy').files.map(f => f.name)], ['a.mp3', 'b.ogg']);
  await putSlotFiles(st, 'all', 'hit.heavy', [file('c.wav')], { append: true });
  eq((await listScope(st, 'all')).get('hit.heavy').files.length, 3);
  await putSlotFiles(st, 'all', 'bgm.main', [file('x.mp3'), file('y.mp3')], { kind: 'loop' });
  eq((await listScope(st, 'all')).get('bgm.main').files.map(f => f.name), ['y.mp3']);
  await throws(() => putSlotFiles(st, 'all', 'ui.tap', Array.from({ length: SND_MAX_FILES + 1 }, (_, i) => file(`t${i}.mp3`))));
  await throws(() => putSlotFiles(st, 'all', 'ui.tap', [Object.assign(blob('x', 'text/plain'), { name: 'a.txt' })]));
  await throws(() => putSlotFiles(st, 'all', 'ui.tap', [Object.assign(blob('x'), { name: 'big.mp3', size: 4 * 1048576 })]));
  await setSlotGain(st, 'all', 'hit.heavy', 9); eq((await listScope(st, 'all')).get('hit.heavy').gain, 2);
  await delSlot(st, 'all', 'hit.heavy'); assert(!(await listScope(st, 'all')).has('hit.heavy'));
  eq(parseSndKey(sndKey('regicide-inferno', 'vo.a.enter')), { scope: 'regicide-inferno', slot: 'vo.a.enter' });
});
await test('소리', '옛 BGM(bgm:범위:칸) → 새 칸 이전: 내용 보존 · 옛 칸 삭제 · 새 칸이 있으면 존중', async () => {
  const st = createMemoryStorage(), du = 'data:audio/mpeg;base64,' + Buffer.from('MUSIC').toString('base64');
  await st.put('settings', 'bgm:all:main', { name: 'song.mp3', size: 5, dataUrl: du, updatedAt: '2026-11-01T00:00:00Z' });
  await st.put('settings', 'bgm:splendor:win', { name: 'w.mp3', size: 5, dataUrl: du });
  await st.put('settings', 'bgm:all:lose', { name: 'old.mp3', size: 5, dataUrl: du });
  await st.put('settings', sndKey('all', 'bgm.lose'), { files: [{ name: 'new.mp3', size: 1, type: 'audio/mpeg', blob: blob('N') }], gain: 1 });
  eq(await migrateBgm(st), 3);
  const a = await listScope(st, 'all'), s = await listScope(st, 'splendor');
  eq(a.get('bgm.main').files[0].name, 'song.mp3'); eq(Buffer.from(await a.get('bgm.main').files[0].blob.arrayBuffer()).toString(), 'MUSIC');
  eq(s.get('bgm.win').files[0].name, 'w.mp3'); eq(a.get('bgm.lose').files[0].name, 'new.mp3');
  assert(!(await st.all('settings')).some(x => x.key.startsWith('bgm:'))); eq(await migrateBgm(st), 0);
});
await test('소리', 'zip: 만들기 → 읽기 (압축 없음) · deflate 읽기 · 한글 이름 · crc', async () => {
  eq(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
  const ents = [{ name: 'a.mp3', data: new Uint8Array([1, 2, 3, 4]) }, { name: '한글.ogg', data: new Uint8Array(1000).fill(7) }];
  const back = await readZip(await buildZip(ents).arrayBuffer());
  eq(back.map(b => b.name), ['a.mp3', '한글.ogg']); eq([...back[0].data], [1, 2, 3, 4]); eq(back[1].data.length, 1000);
  // 다른 프로그램이 만든 deflate zip 흉내
  const raw = new TextEncoder().encode('hello hello hello hello'), cmp = deflateRawSync(raw), nm = Buffer.from('d.txt');
  const hdr = (sig, parts) => Buffer.concat(parts), le = (n, b) => { const x = Buffer.alloc(b); x.writeUIntLE(n, 0, b); return x; };
  const local = Buffer.concat([le(0x04034b50, 4), le(20, 2), le(0, 2), le(8, 2), le(0, 2), le(0x21, 2), le(crc32(raw), 4), le(cmp.length, 4), le(raw.length, 4), le(nm.length, 2), le(0, 2), nm, cmp]);
  const cd = Buffer.concat([le(0x02014b50, 4), le(20, 2), le(20, 2), le(0, 2), le(8, 2), le(0, 2), le(0x21, 2), le(crc32(raw), 4), le(cmp.length, 4), le(raw.length, 4), le(nm.length, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 2), le(0, 4), le(0, 4), nm]);
  const eocd = Buffer.concat([le(0x06054b50, 4), le(0, 2), le(0, 2), le(1, 2), le(1, 2), le(cd.length, 4), le(local.length, 4), le(0, 2)]);
  const z = await readZip(new Uint8Array(Buffer.concat([local, cd, eocd])).buffer);
  eq(new TextDecoder().decode(z[0].data), 'hello hello hello hello');
  await throws(() => readZip(new Uint8Array(50).buffer));
});
await test('소리', '소리 팩 내보내기 → 새 저장소로 가져오기: 칸·변형·음량 그대로', async () => {
  const st = createMemoryStorage(), ids = ['regicide-inferno'];
  await putSlotFiles(st, 'all', 'hit.heavy', [file('a.mp3', 'AAA'), file('b.mp3', 'BBB')]); await setSlotGain(st, 'all', 'hit.heavy', 1.5);
  await putSlotFiles(st, 'regicide-inferno', 'atk.mage', [file('m.ogg', 'MMM')]);
  await putSlotFiles(st, 'regicide-inferno', 'bgm.main', [file('s.mp3', 'SONG')], { kind: 'loop' });
  const pack = await exportPack(st); eq(pack.count, 3); eq(pack.files, 4);
  const lists = { all: slotsFor(common, null), 'regicide-inferno': slotsFor(common, { sound: { slots: [{ id: 'atk.mage', kind: 'sfx', label: 'a' }] } }) };
  const ctx = { gameIds: ids, slotsOf: sc => new Set(lists[sc].slots.map(s => s.id)), kindOf: (sc, id) => lists[sc].slots.find(s => s.id === id).kind };
  const st2 = createMemoryStorage(), r = await importSoundFiles(st2, [Object.assign(pack.blob, { name: 'a0b7cb7a-e17d-470f' })], ctx);   // 이름에 .zip이 없어도 내용으로 알아본다
  eq(r.failed, []); eq(r.added.length, 3);
  const a = await listScope(st2, 'all'), g = await listScope(st2, 'regicide-inferno');
  eq(a.get('hit.heavy').files.length, 2); eq(a.get('hit.heavy').gain, 1.5); eq(Buffer.from(await a.get('hit.heavy').files[1].blob.arrayBuffer()).toString().slice(3), 'BBB');
  eq(g.get('atk.mage').files.length, 1); eq(g.get('bgm.main').files.length, 1);
});
await test('소리', '여러 파일 한 번에: 분류 성공·실패를 따로 알려 줌', async () => {
  const st = createMemoryStorage(), lists = { all: slotsFor(common, null) };
  const ctx = { gameIds: [], slotsOf: () => new Set(lists.all.slots.map(s => s.id)), kindOf: (sc, id) => lists.all.slots.find(s => s.id === id).kind };
  const r = await importSoundFiles(st, [file('ui.tap-01.mp3'), file('ui.tap-02.mp3'), file('이상한이름.mp3'), file('card.draw.ogg'), Object.assign(blob('x', 'text/plain'), { name: 'memo.txt' })], ctx);
  eq(r.added.map(a => `${a.slot}:${a.n}`).sort(), ['card.draw:1', 'ui.tap:2']); eq(r.failed.length, 2);
});
process.exit(report('소리 체계 (3단계)') ? 1 : 0);
