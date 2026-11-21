// 사용자 BGM: 파일을 올려 기기 안(settings 칸)에 저장한다. 그림·폰트와 같은 방식(데이터 주소)이지만 백업 파일에는 넣지 않는다(용량이 커서).
// 저장: settings['bgm:<범위>:<칸>'] = {name,size,dataUrl,updatedAt}. 범위 = all(공용) 또는 게임 id. 게임 전용이 공용보다 우선.
export const BGM_MAX_BYTES = 12 * 1024 * 1024;
export const BGM_SLOTS = [
  { id: 'main', label: '플레이 중 (계속 반복)' },
  { id: 'win', label: '승리 (한 번)' },
  { id: 'lose', label: '패배 (한 번)' }
];
export const BGM_MIME = { mp3: 'audio/mpeg', ogg: 'audio/ogg', oga: 'audio/ogg', wav: 'audio/wav', m4a: 'audio/mp4', aac: 'audio/aac', opus: 'audio/ogg', webm: 'audio/webm', flac: 'audio/flac' };
export const bgmKey = (scope, slot) => `bgm:${scope}:${slot}`;
export const isSafeBgm = d => typeof d === 'string' && /^data:audio\/[a-z0-9.+-]+;base64,/.test(d) && d.length < BGM_MAX_BYTES * 1.4;
export const mimeOf = (name, type) => (type && type.startsWith('audio/') ? type : BGM_MIME[(String(name).split('.').pop() || '').toLowerCase()] || null);

export const ownBgm = (storage, scope, slot) => storage.get('settings', bgmKey(scope, slot));
// 게임 전용이 있으면 그것, 없으면 공용
export async function getBgm(storage, gameId, slot) {
  const own = await ownBgm(storage, gameId, slot);
  if (own && isSafeBgm(own.dataUrl)) return own;
  const all = await ownBgm(storage, 'all', slot);
  return all && isSafeBgm(all.dataUrl) ? all : null;
}
export async function saveBgm(storage, scope, slot, { name, size, dataUrl }) {
  if (!isSafeBgm(dataUrl)) throw new Error('오디오 파일이 아니거나 너무 커요 (최대 12MB)');
  await storage.put('settings', bgmKey(scope, slot), { name, size, dataUrl, updatedAt: new Date().toISOString() });
}
export const delBgm = (storage, scope, slot) => storage.del('settings', bgmKey(scope, slot));
