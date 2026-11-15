// 스프롤로폴리스 점수 조건 숫자(num) 맞추기: 봇이 각 조건에서 평균 몇 점을 얻는지 재서 num = 평균 + δ 를 제안한다.
// 사용: node tools/tune-sprawlopolis.mjs [판수] [δ]   (δ를 생략하면 클리어율 50%가 되는 값을 찾는다)
import sp, { scoreOf } from '../games/sprawlopolis.js';
import { makeRng } from '../core/rng.js';
const N = +process.argv[2] || 1200, fixedDelta = process.argv[3] != null ? +process.argv[3] : null;
const rng = makeRng(20261115);
const P = n => Array.from({ length: n }, (_, i) => ({ seat: i, human: i === 0, characterId: null }));
const goalPts = {}, rows = [];
for (let g = 0; g < N; g++) {
  const n = 1 + (g % 4), mode = 'normal';
  const s = sp.newGame({ players: P(n), options: { mode }, rng });
  const tr = () => ({ skill: 3 + rng.int(6), risk: 3 + rng.int(6), patience: 3 + rng.int(6), aggression: 3 + rng.int(6) });
  const trs = Array.from({ length: n }, tr);
  while (!sp.isOver(s)) { const ch = sp.botChoose(s, trs[s.turn], rng); sp.applyMove(s, ch.move); }
  const sc = scoreOf(s);
  s.goals.forEach((id, k) => { (goalPts[id] ||= []).push(sc.g[k]); });
  rows.push({ n, base: sc.blocks - sc.pen, g: s.goals.slice(), pts: sc.g.slice() });
  if (g % 200 === 199) process.stderr.write(`${g + 1}/${N}\n`);
}
const E = {};
for (const [id, a] of Object.entries(goalPts)) E[id] = a.reduce((x, y) => x + y, 0) / a.length;
const margins = rows.map(r => r.base + r.pts.reduce((x, y, k) => x + (y - E[r.g[k]]), 0)).sort((a, b) => a - b);
const median = margins[Math.floor(margins.length / 2)];
const delta = fixedDelta ?? median / 3;
console.log('평균 점수 조건 점수:'); Object.keys(E).sort((a, b) => a - b).forEach(id => console.log(' ', id, E[id].toFixed(2), '→ num', Math.max(1, Math.round(E[id] + delta))));
console.log('기본(블록−도로) 평균', (rows.reduce((a, r) => a + r.base, 0) / rows.length).toFixed(1), '마진 중앙값', median.toFixed(1), 'δ', delta.toFixed(2));
const nums = {}; Object.keys(E).forEach(id => { nums[id] = Math.max(1, Math.round(E[id] + delta)); });
const clear = rows.filter(r => r.base + r.pts.reduce((x, y) => x + y, 0) >= r.g.reduce((x, id) => x + nums[id], 0));
console.log('제안한 num으로 클리어율', (100 * clear.length / rows.length).toFixed(1) + '%', JSON.stringify(nums));
