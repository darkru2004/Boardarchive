// 시드 가능한 난수. 게임 모듈은 무작위가 필요하면 반드시 전달받은 rng만 쓴다(재현·자동테스트용).
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeRng(seed) {
  const next = seed == null ? Math.random : mulberry32(seed);
  return {
    next,
    int: n => Math.floor(next() * n),
    chance: p => next() < p,
    pick: a => a[Math.floor(next() * a.length)],
    shuffle(a) {
      const r = a.slice();
      for (let i = r.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [r[i], r[j]] = [r[j], r[i]];
      }
      return r;
    }
  };
}
