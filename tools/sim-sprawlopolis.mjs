// 스프롤로폴리스 봇 클리어율 보고서: 인원수·난이도별로 봇이 목표 점수를 얼마나 넘는지, 점수 조건마다 평균 몇 점인지 잰다.
// 사용: node tools/sim-sprawlopolis.mjs [판수=300]
import sp, { scoreOf, targetOf } from '../games/sprawlopolis.js';
import { makeRng } from '../core/rng.js';
const N = +process.argv[2] || 300;
const rng = makeRng(20261115);
const P = n => Array.from({ length: n }, (_, i) => ({ seat: i, human: i === 0, characterId: null }));
const tr = () => ({ skill: 3 + rng.int(6), risk: 3 + rng.int(6), patience: 3 + rng.int(6), aggression: 3 + rng.int(6) });
const goalPts = {}, goalWin = {};
for (const mode of ['easy', 'normal', 'hard']) {
  const row = [];
  for (let n = 1; n <= 4; n++) {
    let win = 0, tot = 0, margin = 0;
    for (let g = 0; g < N; g++) {
      const s = sp.newGame({ players: P(n), options: { mode }, rng });
      const trs = Array.from({ length: n }, tr);
      while (!sp.isOver(s)) sp.applyMove(s, sp.botChoose(s, trs[s.turn], rng).move);
      const sc = scoreOf(s), t = targetOf(s), ok = sc.total >= t;
      if (ok) win++; tot += sc.total; margin += sc.total - t;
      if (mode === 'normal') s.goals.forEach((id, k) => { (goalPts[id] ||= []).push(sc.g[k]); goalWin[id] = (goalWin[id] || []); goalWin[id].push(ok ? 1 : 0); });
    }
    row.push(`${n}인 ${(100 * win / N).toFixed(0)}% (평균 ${(tot / N).toFixed(1)}, 목표 대비 ${(margin / N).toFixed(1)})`);
  }
  console.log(mode.padEnd(7), row.join(' | '));
}
console.log('점수 조건별 (보통): 평균 점수 / 그 조건이 나온 판의 클리어율');
for (const id of Object.keys(goalPts).sort((a, b) => a - b)) { const a = goalPts[id], w = goalWin[id]; console.log(' ', String(id).padStart(2), sp._t.goalOf(+id).name.padEnd(8), (a.reduce((x, y) => x + y, 0) / a.length).toFixed(1).padStart(6), (100 * w.reduce((x, y) => x + y, 0) / w.length).toFixed(0) + '%'); }
