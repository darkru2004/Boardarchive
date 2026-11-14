// 스플렌더 — 2~4인. 보석을 모아 카드를 사고, 카드 보너스로 더 비싼 카드를 사서 먼저 15점.
// 카드 90장·귀족 10장은 공식 카드 목록(사용자 제공 PDF·표)과 같다. 규칙은 이 파일의 엔진이 전담하고, 봇은 합법 수 안에서만 고른다.
// 색 순서(배열 번호): 0 다이아몬드(흰) · 1 사파이어(파랑) · 2 에메랄드(초록) · 3 루비(빨강) · 4 오닉스(검정) · 5 금(조커)

// ---------- 카드 데이터 ----------
// 한 줄 = 색 점수 [검정 흰 빨강 파랑 초록] (PDF의 열 순서 그대로). 색마다 18장: 앞 8장 레벨1, 다음 6장 레벨2, 마지막 4장 레벨3.
const RAW = `
K 0 0 1 1 1 1|K 0 0 0 1 0 2|K 0 0 2 0 0 2|K 0 1 0 3 0 1|K 0 0 0 0 0 3|K 0 0 1 1 2 1|K 0 0 2 1 2 0|K 1 0 0 0 4 0|K 1 0 3 0 2 2|K 1 2 3 0 0 3|K 2 0 0 2 1 4|K 2 0 5 0 0 0|K 2 0 0 3 0 5|K 3 6 0 0 0 0|K 3 0 3 3 3 5|K 4 0 0 7 0 0|K 4 3 0 6 0 3|K 5 3 0 7 0 0
U 0 2 1 0 0 0|U 0 1 1 2 0 1|U 0 1 1 1 0 1|U 0 0 0 1 1 3|U 0 3 0 0 0 0|U 0 0 1 2 0 2|U 0 2 0 0 0 2|U 1 0 0 4 0 0|U 1 0 0 3 2 2|U 1 3 0 0 2 3|U 2 0 5 0 3 0|U 2 0 0 0 5 0|U 2 4 2 1 0 0|U 3 0 0 0 6 0|U 3 5 3 3 0 3|U 4 0 7 0 0 0|U 4 3 6 0 3 0|U 5 0 7 0 3 0
G 0 0 2 0 1 0|G 0 0 0 2 2 0|G 0 0 1 0 3 1|G 0 1 1 1 1 0|G 0 2 1 1 1 0|G 0 2 0 2 1 0|G 0 0 0 3 0 0|G 1 4 0 0 0 0|G 1 0 3 3 0 2|G 1 2 2 0 3 0|G 2 1 4 0 2 0|G 2 0 0 0 0 5|G 2 0 0 0 5 3|G 3 0 0 0 0 6|G 3 3 5 3 3 0|G 4 0 3 0 6 3|G 4 0 0 0 7 0|G 5 0 0 0 7 3
R 0 0 3 0 0 0|R 0 3 1 1 0 0|R 0 0 0 0 2 1|R 0 2 2 0 0 1|R 0 1 2 0 1 1|R 0 1 1 0 1 1|R 0 0 2 2 0 0|R 1 0 4 0 0 0|R 1 3 0 2 3 0|R 1 3 2 2 0 0|R 2 0 1 0 4 2|R 2 5 3 0 0 0|R 2 5 0 0 0 0|R 3 0 0 6 0 0|R 3 3 3 0 5 3|R 4 0 0 0 0 7|R 4 0 0 3 3 6|R 5 0 0 3 0 7
W 0 1 0 0 2 2|W 0 1 0 2 0 0|W 0 1 0 1 1 1|W 0 0 0 0 3 0|W 0 0 0 0 2 2|W 0 1 0 1 1 2|W 0 1 3 0 1 0|W 1 0 0 0 0 4|W 1 2 0 2 0 3|W 1 0 2 3 3 0|W 2 2 0 4 0 1|W 2 0 0 5 0 0|W 2 3 0 5 0 0|W 3 0 6 0 0 0|W 3 3 0 5 3 3|W 4 7 0 0 0 0|W 4 6 3 3 0 0|W 5 7 3 0 0 0`;
const COL = { W: 0, U: 1, G: 2, R: 3, K: 4 };
export const CARDS = (() => {
  const out = [];
  for (const line of RAW.trim().split('\n')) {
    line.split('|').forEach((t, k) => {
      const [c, pts, bk, wh, rd, bl, gr] = t.trim().split(/\s+/);
      out.push({ id: out.length, lv: k < 8 ? 1 : k < 14 ? 2 : 3, col: COL[c], pts: +pts, cost: [+wh, +bl, +gr, +rd, +bk] });
    });
  }
  return out;
})();
// 귀족: 필요한 보너스 [흰 파랑 초록 빨강 검정], 모두 3점
export const NOBLES = [[3, 3, 0, 0, 3], [0, 3, 3, 3, 0], [3, 0, 0, 3, 3], [0, 0, 4, 4, 0], [0, 4, 4, 0, 0], [0, 0, 0, 4, 4], [4, 0, 0, 0, 4], [3, 3, 3, 0, 0], [0, 0, 3, 3, 3], [4, 4, 0, 0, 0]];
const GNAME = ['다이아몬드', '사파이어', '에메랄드', '루비', '오닉스', '금'];
const GEMS_BY_N = { 2: 4, 3: 5, 4: 7 };
const WIN_PTS = 15;

// ---------- 엔진 도우미 (모두 순수 함수) ----------
const sum = a => a.reduce((x, y) => x + y, 0);
const bonusOf = p => { const b = [0, 0, 0, 0, 0]; for (const id of p.cards) b[CARDS[id].col]++; return b; };
const pointsOf = p => sum(p.cards.map(id => CARDS[id].pts)) + 3 * p.nobles.length;
const tokTotal = p => sum(p.tok);
// 카드를 사려면 모자란 보석 수(금으로 메울 몫). 색별 부족분과 합계.
function shortOf(p, b, card) {
  const miss = [0, 0, 0, 0, 0]; let tot = 0;
  for (let i = 0; i < 5; i++) { const m = Math.max(0, card.cost[i] - b[i] - p.tok[i]); miss[i] = m; tot += m; }
  return { miss, tot };
}
const canAfford = (p, b, card) => shortOf(p, b, card).tot <= p.tok[5];
const nobleOk = (b, k) => NOBLES[k].every((r, i) => b[i] >= r);
function combos(arr, k) {
  const out = [];
  (function rec(st, acc) { if (acc.length === k) { out.push(acc.slice()); return; } for (let i = st; i < arr.length; i++) { acc.push(arr[i]); rec(i + 1, acc); acc.pop(); } })(0, []);
  return out;
}
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

function actMoves(s) {
  const seat = s.turn, p = s.players[seat], b = bonusOf(p), ms = [];
  const avail = [0, 1, 2, 3, 4].filter(c => s.supply[c] > 0);
  const k = Math.min(3, avail.length);
  if (k > 0) for (const g of combos(avail, k)) ms.push({ t: 'take', g });
  for (const c of [0, 1, 2, 3, 4]) if (s.supply[c] >= 4) ms.push({ t: 'take2', c });
  s.table.forEach((row, l) => row.forEach((id, i) => { if (id != null && canAfford(p, b, CARDS[id])) ms.push({ t: 'buy', lv: l + 1, i }); }));
  p.res.forEach((r, i) => { if (canAfford(p, b, CARDS[r.id])) ms.push({ t: 'buyr', r: i }); });
  if (p.res.length < 3) {
    s.table.forEach((row, l) => row.forEach((id, i) => { if (id != null) ms.push({ t: 'res', lv: l + 1, i }); }));
    s.decks.forEach((d, l) => { if (d.length) ms.push({ t: 'resd', lv: l + 1 }); });
  }
  return ms.length ? ms : [{ t: 'pass' }];
}
function takeCard(s, lv, i) {
  const id = s.table[lv - 1][i];
  const d = s.decks[lv - 1];
  s.table[lv - 1][i] = d.length ? d.shift() : null;
  return id;
}
function pay(s, p, card) {
  const b = bonusOf(p); let gold = 0; const paid = [0, 0, 0, 0, 0, 0];
  for (let i = 0; i < 5; i++) {
    const req = Math.max(0, card.cost[i] - b[i]), use = Math.min(req, p.tok[i]);
    p.tok[i] -= use; s.supply[i] += use; paid[i] = use; gold += req - use;
  }
  p.tok[5] -= gold; s.supply[5] += gold; paid[5] = gold;
  return paid;
}
// 행동 뒤 처리: 10개 초과 → 반납 단계, 귀족 방문(2명 이상이면 고르기), 15점 → 마지막 라운드, 차례 넘기기
function afterAction(s, seat) {
  const p = s.players[seat];
  if (tokTotal(p) > 10) { s.phase = 'discard'; return; }
  checkNobles(s, seat);
}
function checkNobles(s, seat) {
  const p = s.players[seat], b = bonusOf(p);
  const ok = s.nobles.filter(k => nobleOk(b, k));
  if (ok.length > 1) { s.phase = 'noble'; s.pend = ok; return; }
  if (ok.length === 1) giveNoble(s, seat, ok[0]);
  endTurn(s, seat);
}
function giveNoble(s, seat, k) {
  s.nobles = s.nobles.filter(x => x !== k);
  s.players[seat].nobles.push(k);
  s.fx.push({ t: 'noble', seat, k });
}
function endTurn(s, seat) {
  s.phase = 'act'; s.pend = null;
  if (!s.ending && pointsOf(s.players[seat]) >= WIN_PTS) { s.ending = true; s.fx.push({ t: 'ending', seat }); }
  if (seat === s.n - 1 && s.ending) { s.over = true; return; }
  s.turn = (seat + 1) % s.n;
  if (s.turn === 0) s.round++;
}

// ---------- 봇 ----------
// 성향 → 판단: skill(실력: 높을수록 정교, 낮으면 판단에 흔들림) · aggression(남의 큰 카드 가로채기 예약)
// · risk(큰 점수 카드를 미리 예약해 두기) · patience(당장 점수보다 엔진=보너스 카드 키우기) · targetMode(누구를 견제할지)
function botParams(tr) {
  const sk = tr.skill ?? 5, ag = tr.aggression ?? 5, rk = tr.risk ?? 5, pa = tr.patience ?? 5;
  return {
    noise: Math.max(0, (10 - sk) * 0.07),            // 평가값 흔들림
    slip: Math.max(0, (6 - sk) * 0.05),              // 가끔 엉뚱한 수(실력 5 이하에서만)
    ptw: 12 - (pa - 5) * 0.7,                         // 점수 가중치
    syn: 2 + (pa - 5) * 0.25,                         // 다른 카드 할인에 도움(엔진)
    tw: 1.3, nw: 4,
    block: Math.min(0.95, 0.15 + ag * 0.09),          // 가로채기 확률
    reserve: Math.max(0, (rk - 5) * 0.09),            // 목표 카드를 미리 예약할 확률
    late: sk >= 4,                                    // 막판 점수 몰이 판단
    winSense: sk >= 3                                 // 이번 수로 이길 수 있으면 놓치지 않기
  };
}
const jitter = (v, rng, k) => (k ? v * (1 + k * (rng.next() * 2 - 1)) : v);
function nobleHelp(s, b, card) { return s.nobles.filter(k => NOBLES[k][card.col] > b[card.col]).length; }
function synergy(s, b, card) {
  let n = 0;
  for (const row of s.table) for (const id of row) if (id != null && id !== card.id && CARDS[id].cost[card.col] > b[card.col]) n++;
  return n;
}
const maxPts = s => Math.max(...s.players.map(pointsOf));
// 지금 노릴 카드 하나: 점수·귀족 도움 ÷ (모자란 보석 + 1)
function aiTarget(s, seat, P, rng) {
  const p = s.players[seat], b = bonusOf(p), late = P.late && maxPts(s) >= 11;
  const all = [];
  for (const row of s.table) for (const id of row) if (id != null) all.push(CARDS[id]);
  for (const r of p.res) all.push(CARDS[r.id]);
  let best = null, bs = -1;
  for (const c of all) {
    const def = Math.max(0, shortOf(p, b, c).tot - p.tok[5]);
    let v = late ? (c.pts * 4 + 1) / (def + 1) : (c.pts * P.tw + 1 + nobleHelp(s, b, c) * P.nw) / (def + 1);
    v = jitter(v, rng, P.noise * 1.5);
    if (v > bs) { bs = v; best = c; }
  }
  return best;
}
// 이 카드를 사면 귀족이 오는가
function nobleAfter(s, b, card) { const b2 = b.slice(); b2[card.col]++; return s.nobles.some(k => nobleOk(b2, k)); }
// 견제 대상 좌석들
function blockTargets(s, seat, tr, info) {
  const allies = new Set((info.allySeats || []).map(a => (typeof a === 'object' ? a.seat : a)));
  let ts = s.players.map((_, i) => i).filter(i => i !== seat && !allies.has(i));
  const mode = tr.targetMode || 'none';
  if (mode === 'human' && ts.includes(s.humanSeat)) ts = [s.humanSeat];
  else if (mode === 'rival' && info.rivalSeats && info.rivalSeats.some(r => ts.includes(r))) ts = info.rivalSeats.filter(r => ts.includes(r));
  else if (mode === 'leader') { const top = Math.max(...ts.map(i => pointsOf(s.players[i]))); ts = ts.filter(i => pointsOf(s.players[i]) === top); }
  return ts;
}
function chooseAct(s, seat, tr, rng, info) {
  const P = botParams(tr), p = s.players[seat], b = bonusOf(p), moves = actMoves(s);
  const find = pred => moves.find(pred);
  if (moves.length === 1 && moves[0].t === 'pass') return { move: moves[0], reason: 'pass' };
  const myPts = pointsOf(p);
  // 이번 수로 15점에 닿는 구매가 있으면 (실력 3 이상은) 놓치지 않는다 — 그중 점수가 가장 큰 것
  if (P.winSense) {
    let wm = null, wg = -1;
    for (const m of moves) {
      if (m.t !== 'buy' && m.t !== 'buyr') continue;
      const c = CARDS[m.t === 'buy' ? s.table[m.lv - 1][m.i] : p.res[m.r].id], g = c.pts + (nobleAfter(s, b, c) ? 3 : 0);
      if (myPts + g >= WIN_PTS && g > wg) { wg = g; wm = m; }
    }
    if (wm) return { move: wm, reason: 'win' };
  }
  if (P.slip && rng.chance(P.slip)) return { move: rng.pick(moves), reason: 'slip' };
  // 1) 살 수 있는 카드 평가
  const buys = moves.filter(m => m.t === 'buy' || m.t === 'buyr').map(m => {
    const c = CARDS[m.t === 'buy' ? s.table[m.lv - 1][m.i] : p.res[m.r].id];
    const spent = sum(c.cost.map((n, i) => Math.max(0, n - b[i])));
    const nb = nobleAfter(s, b, c);
    const gain = c.pts + (nb ? 3 : 0);
    let v = c.pts * P.ptw + nobleHelp(s, b, c) * 6 + synergy(s, b, c) * P.syn - spent * 0.3 + (c.lv === 1 ? 0.5 : 0) + (nb ? 30 : 0) + (m.t === 'buyr' ? 2 : 0);
    if (P.late && maxPts(s) >= 11) v += c.pts * 6;
    if (P.winSense && myPts + gain >= WIN_PTS) v += 200 + gain * 10;
    return { m, c, gain, v: jitter(v, rng, P.noise) };
  });
  // 2) 가로채기: 상대가 바로 살 수 있는 큰 카드(또는 그걸로 이길 카드)를 예약
  if (p.res.length < 3) {
    let blk = null, bp = 0;
    for (const o of blockTargets(s, seat, tr, info)) {
      const op = s.players[o], ob = bonusOf(op), oPts = pointsOf(op);
      s.table.forEach((row, l) => row.forEach((id, i) => {
        if (id == null) return;
        const c = CARDS[id];
        if (!canAfford(op, ob, c) || canAfford(p, b, c)) return;
        const wins = oPts + c.pts + (nobleAfter(s, ob, c) ? 3 : 0) >= WIN_PTS;
        const thr = oPts >= 10 ? 2 : 3;
        const val = wins ? 100 + c.pts : c.pts >= thr ? c.pts : 0;
        if (val > bp) { bp = val; blk = { lv: l + 1, i }; }
      }));
    }
    const bestBuy = buys.reduce((a, x) => (!a || x.v > a.v ? x : a), null);
    const urgent = bp >= 100 && P.winSense && !(bestBuy && myPts + bestBuy.gain >= WIN_PTS);
    if (blk && (urgent ? rng.chance(Math.max(0.6, P.block)) : (!bestBuy || bestBuy.c.pts === 0) && s.supply[5] > 0 && rng.chance(P.block))) {
      return { move: find(m => m.t === 'res' && m.lv === blk.lv && m.i === blk.i), reason: 'block' };
    }
  }
  if (buys.length) {
    buys.sort((a, c) => c.v - a.v);
    const top = buys[0];
    return { move: top.m, reason: myPts + top.gain >= WIN_PTS ? 'win' : nobleAfter(s, b, top.c) ? 'noble' : top.c.pts >= 3 ? 'big' : 'buy' };
  }
  // 3) 목표 카드: 미리 예약(성향 risk) 또는 필요한 보석 가져오기
  const t = aiTarget(s, seat, P, rng);
  if (t && P.reserve && t.pts >= 3 && p.res.length < 2 && s.supply[5] > 0 && !p.res.some(r => r.id === t.id) && rng.chance(P.reserve)) {
    for (let l = 0; l < 3; l++) { const i = s.table[l].indexOf(t.id); if (i >= 0) return { move: find(m => m.t === 'res' && m.lv === l + 1 && m.i === i), reason: 'reserve' }; }
  }
  const takes = moves.filter(m => m.t === 'take' || m.t === 'take2');
  if (t && takes.length) {
    const miss = shortOf(p, b, t).miss;
    const need = [0, 1, 2, 3, 4].filter(c => miss[c] > 0 && s.supply[c] > 0).sort((x, y) => miss[y] - miss[x]);
    if (need.length === 1 && miss[need[0]] >= 2) { const m2 = find(m => m.t === 'take2' && m.c === need[0]); if (m2) return { move: m2, reason: 'take2' }; }
    if (need.length) {
      // 필요한 색을 최대한 포함하고, 나머지는 다른 카드에 쓸모 있는 색
      const want = [0, 0, 0, 0, 0];
      for (const row of s.table) for (const id of row) if (id != null) { const c = CARDS[id]; for (let i = 0; i < 5; i++) want[i] += Math.max(0, c.cost[i] - b[i] - p.tok[i]) * (c.pts + 1); }
      let bm = null, bv = -1e9;
      for (const m of takes) {
        if (m.t !== 'take') continue;
        const v = m.g.reduce((a, c) => a + (miss[c] > 0 ? 100 : 0) + want[c] * 0.1, 0) + rng.next() * 0.01;
        if (v > bv) { bv = v; bm = m; }
      }
      if (bm) return { move: bm, reason: 'take' };
    }
  }
  if (takes.length) return { move: rng.pick(takes.filter(m => m.t === 'take').length ? takes.filter(m => m.t === 'take') : takes), reason: 'take' };
  // 4) 보석도 없으면: 예약(금이라도 얻기)
  const rs = moves.filter(m => m.t === 'res' || m.t === 'resd');
  if (rs.length) {
    let bm = null, bv = -1e9;
    for (const m of rs) { const v = m.t === 'res' ? CARDS[s.table[m.lv - 1][m.i]].pts + rng.next() : -1 + rng.next(); if (v > bv) { bv = v; bm = m; } }
    return { move: bm, reason: 'reserve' };
  }
  return { move: rng.pick(moves), reason: 'forced' };
}
function chooseDiscard(s, seat, tr, rng) {
  const p = s.players[seat], b = bonusOf(p), t = aiTarget(s, seat, botParams(tr), rng);
  const want = [0, 0, 0, 0, 0];
  if (t) for (let i = 0; i < 5; i++) want[i] = Math.max(0, t.cost[i] - b[i]);
  let best = -1, bs = -1e9;
  for (let c = 0; c < 5; c++) if (p.tok[c] > 0) { const v = p.tok[c] - want[c] + rng.next() * 0.01; if (v > bs) { bs = v; best = c; } }
  if (best < 0) best = 5;
  return { move: { t: 'discard', c: best }, reason: 'discard' };
}
// 귀족 둘 이상: 다른 사람이 가장 먼저 데려갈 것 같은 귀족을 먼저 데려간다
function chooseNoble(s, seat) {
  let best = s.pend[0], bd = 1e9;
  for (const k of s.pend) {
    let d = 1e9;
    s.players.forEach((o, i) => { if (i === seat) return; const ob = bonusOf(o); d = Math.min(d, sum(NOBLES[k].map((r, j) => Math.max(0, r - ob[j])))); });
    if (d < bd) { bd = d; best = k; }
  }
  return { move: { t: 'noble', k: best }, reason: 'pick' };
}

const game = {
  meta: { id: 'splendor', name: '스플렌더', version: '1.0.0', players: { min: 2, max: 4 }, minutes: 25, campaign: null, autosave: { schema: 1 } },
  _t: { CARDS, NOBLES, bonusOf, pointsOf, tokTotal, shortOf, canAfford, actMoves, botParams },

  newGame({ players, rng }) {
    const n = players.length, g = GEMS_BY_N[n];
    const decks = [1, 2, 3].map(lv => rng.shuffle(CARDS.filter(c => c.lv === lv).map(c => c.id)));
    const table = decks.map(d => d.splice(0, 4));
    return {
      v: 1, n, humanSeat: players.findIndex(p => p.human),
      decks, table, nobles: rng.shuffle(NOBLES.map((_, k) => k)).slice(0, n + 1),
      supply: [g, g, g, g, g, 5],
      players: players.map(() => ({ tok: [0, 0, 0, 0, 0, 0], cards: [], res: [], nobles: [] })),
      turn: 0, round: 1, phase: 'act', pend: null, ending: false, over: false, moves: 0, last: null, fx: []
    };
  },
  currentSeat: s => s.turn,
  isOver: s => s.over,
  legalMoves(s) {
    if (s.over) return [];
    const p = s.players[s.turn];
    if (s.phase === 'discard') return [0, 1, 2, 3, 4, 5].filter(c => p.tok[c] > 0).map(c => ({ t: 'discard', c }));
    if (s.phase === 'noble') return s.pend.map(k => ({ t: 'noble', k }));
    return actMoves(s);
  },
  applyMove(s, m) {
    if (s.over) throw new Error('끝난 게임');
    if (!this.legalMoves(s).some(x => same(x, m))) throw new Error('규칙에 맞지 않는 수: ' + JSON.stringify(m));
    const seat = s.turn, p = s.players[seat];
    s.fx = []; s.moves++;
    switch (m.t) {
      case 'take': m.g.forEach(c => { s.supply[c]--; p.tok[c]++; }); s.last = { seat, t: 'take', g: m.g.slice() }; afterAction(s, seat); break;
      case 'take2': s.supply[m.c] -= 2; p.tok[m.c] += 2; s.last = { seat, t: 'take', g: [m.c, m.c] }; afterAction(s, seat); break;
      case 'buy': case 'buyr': {
        const id = m.t === 'buy' ? takeCard(s, m.lv, m.i) : p.res.splice(m.r, 1)[0].id;
        const paid = pay(s, p, CARDS[id]);
        p.cards.push(id);
        s.last = { seat, t: 'buy', id, from: m.t === 'buy' ? 'table' : 'res', paid };
        afterAction(s, seat); break;
      }
      case 'res': case 'resd': {
        const id = m.t === 'res' ? takeCard(s, m.lv, m.i) : s.decks[m.lv - 1].shift();
        p.res.push({ id, open: m.t === 'res' });
        const gold = s.supply[5] > 0; if (gold) { s.supply[5]--; p.tok[5]++; }
        s.last = { seat, t: 'res', id, open: m.t === 'res', lv: CARDS[id].lv, gold };
        afterAction(s, seat); break;
      }
      case 'discard': p.tok[m.c]--; s.supply[m.c]++; s.fx.push({ t: 'discard', seat, c: m.c }); if (tokTotal(p) <= 10) checkNobles(s, seat); break;
      case 'noble': giveNoble(s, seat, m.k); endTurn(s, seat); break;
      case 'pass': s.last = { seat, t: 'pass' }; endTurn(s, seat); break;
    }
  },
  botChoose(s, traits, rng, info) {
    const seat = s.turn, inf = info || {};
    const r = s.phase === 'discard' ? chooseDiscard(s, seat, traits, rng) : s.phase === 'noble' ? chooseNoble(s, seat) : chooseAct(s, seat, traits, rng, inf);
    if (!r.move) { const ms = this.legalMoves(s); return { move: rng.pick(ms), reason: 'fallback' }; }
    return r;
  },
  // 점수가 높은 순, 같으면 산 카드가 적은 쪽이 앞. 둘 다 같으면 공동 순위.
  result(s) {
    const rows = s.players.map((p, seat) => ({ seat, pts: pointsOf(p), cards: p.cards.length }))
      .sort((a, b) => b.pts - a.pts || a.cards - b.cards || a.seat - b.seat);
    let rank = 0;
    const ranking = rows.map((r, i) => { const q = rows[i - 1]; if (!q || q.pts !== r.pts || q.cards !== r.cards) rank = i + 1; return { seat: r.seat, rank, score: r.pts }; });
    return { ranking, summary: `최고 ${rows[0].pts}점 · ${s.round}라운드` };
  },

  mount(container, ctx) { return mountSplendor(this, container, ctx); }
};
export default game;

/*__UI__*/
// ---------- 화면: "보석상의 벨벳 테이블" 테마 ----------
const LVNAME = ['', '광산', '공방·운송', '보석상'];
function validState(st, n) {
  return !!(st && st.v === 1 && st.n === n && Array.isArray(st.players) && st.players.length === n && Array.isArray(st.table) && !st.over);
}
function mountSplendor(self, container, ctx) {
  const rng = ctx.rng, th = ctx.theme || {}, n = ctx.players.length;
  const timers = new Set(), speech = {}, logs = [];
  let dead = false, finished = false, lock = false;
  const resumed = validState(ctx.resumeState, n) && ctx.players[ctx.resumeState.humanSeat] && ctx.players[ctx.resumeState.humanSeat].human;
  const s = resumed ? ctx.resumeState : self.newGame({ players: ctx.players, rng });
  const hs = s.humanSeat;
  let sel = { gems: [], card: null };
  let prevTable = new Set(s.table.flat());

  container.innerHTML = `<style>${CSS}</style>
    <div class="g-splendor" style="--acc:${th.accent || '#e7c15d'};--tb:${th.table || '#1b2547'};--tb2:${th.table2 || '#0b1026'}">
      <svg class="sp-defs" width="0" height="0" aria-hidden="true">${DEFS}</svg>
      <div class="sp-top"><span class="sp-rd"></span><span class="sp-flag" hidden>마지막 라운드</span>
        <span class="sp-tb"><button data-a="log" title="진행 기록">기록</button><button data-a="rules" title="규칙">규칙</button></span></div>
      <div class="sp-opps"></div>
      <div class="sp-nobles"></div>
      <div class="sp-board"></div>
      <div class="sp-bank"></div>
      <div class="sp-dock"></div>
      <div class="sp-me"></div>
      <div class="sp-ov" hidden></div>
      <div class="sp-toasts"></div>
    </div>`;
  const q = x => container.querySelector(x);
  const root = q('.g-splendor'), oppBox = q('.sp-opps'), nobBox = q('.sp-nobles'), board = q('.sp-board'), bank = q('.sp-bank'),
    dock = q('.sp-dock'), meBox = q('.sp-me'), ov = q('.sp-ov'), toasts = q('.sp-toasts');
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const nameOf = seat => (ctx.players[seat].human ? '나' : ctx.players[seat].name.split(' ').pop());
  const colorOf = seat => ctx.players[seat].color || '#888';
  const fillAv = box => box.querySelectorAll('[data-av]').forEach(e => { if (!e.firstChild) e.append(ctx.avatar(+e.dataset.av, 'css')); });
  const myTurn = () => !s.over && s.turn === hs;
  const P = seat => s.players[seat];

  // ----- 연출: 앱 공통 이펙트 도구(ctx.fx) — 설정의 움직임·효과음·진동 켜기/끄기를 그대로 따른다 -----
  const fx = ctx.fx ? ctx.fx.scope(root) : null;
  const snd = name => { if (fx) fx.sfx(name); };
  const SFX = {
    pick: () => snd('tap'), take: () => snd('chips'), buy: () => { snd('card'); snd('gain'); }, res: () => snd('flip'),
    noble: () => { snd('gain'); if (fx) fx.buzz(25); }, err: () => snd('bad'), win: () => snd('win'), lose: () => snd('lose')
  };

  // ----- 그림 조각 -----
  const gem = (c, cls = '') => `<svg class="sp-gem ${cls}" viewBox="0 0 40 40"><use href="#sp-g${c}"/></svg>`;
  function cardHTML(id, o = {}) {
    const c = CARDS[id], b = o.bonus;
    const pips = c.cost.map((v, i) => (v ? `<i class="sp-pip sp-k${i}${b && b[i] >= v ? ' ok' : ''}">${v}</i>` : '')).join('');
    return `<div class="sp-card sp-k${c.col} sp-l${c.lv}${o.cls || ''}"${o.attr || ''}>
      <svg class="sp-art" viewBox="0 0 100 70" preserveAspectRatio="xMidYMid slice"><use href="#sp-a${c.lv}${c.id % 2}"/></svg>
      <div class="sp-hd"><b class="sp-pt">${c.pts || ''}</b><span class="sp-lvd">${'◆'.repeat(c.lv)}</span>${gem(c.col, 'sp-bn')}</div>
      <div class="sp-cost">${pips}</div></div>`;
  }
  const backHTML = (lv, cnt, o = {}) => `<div class="sp-back sp-l${lv}${o.cls || ''}"${o.attr || ''}><span class="sp-bk">${'◆'.repeat(lv)}</span><b>${LVNAME[lv]}</b>${cnt != null ? `<small>${cnt}</small>` : ''}</div>`;
  const nobleHTML = (k, cls = '') => `<div class="sp-nb${cls}"><svg class="sp-crown" viewBox="0 0 40 30"><use href="#sp-crown"/></svg><b>3</b><div class="sp-req">${NOBLES[k].map((r, i) => (r ? `<i class="sp-k${i}">${r}</i>` : '')).join('')}</div></div>`;

  // ----- 그리기 -----
  function drawTop() {
    q('.sp-rd').textContent = s.over ? '게임 종료' : `라운드 ${s.round} · ${nameOf(s.turn)} 차례`;
    q('.sp-flag').hidden = !s.ending || s.over;
  }
  function cellsHTML(seat, big) {
    const p = P(seat), b = bonusOf(p), disc = big && myTurn() && s.phase === 'discard';
    return [0, 1, 2, 3, 4, 5].map(c => {
      const t = p.tok[c], bn = c < 5 ? b[c] : null;
      const tag = disc && t > 0 ? 'button' : 'span';
      return `<${tag} class="sp-cc sp-k${c}${disc && t > 0 ? ' sp-dc' : ''}${!t && !bn ? ' zero' : ''}"${disc && t > 0 ? ` data-dc="${c}"` : ''}>${c < 5 ? `<b class="sp-cb">${bn}</b>` : `<b class="sp-cb sp-gold">★</b>`}<span class="sp-ct">${gem(c)}${t}</span></${tag}>`;
    }).join('');
  }
  function drawOpps() {
    const opp = ctx.players.filter(p => !p.human);
    oppBox.className = 'sp-opps n' + opp.length;
    oppBox.innerHTML = opp.map(pl => {
      const i = pl.seat, p = P(i), sp = speech[i];
      return `<div class="sp-opp${!s.over && s.turn === i ? ' turn' : ''}" data-seat="${i}" style="--pc:${colorOf(i)}">
        <div class="sp-oh"><span class="sp-av" data-av="${i}"></span><b class="sp-on">${nameOf(i)}</b><span class="sp-op">${pointsOf(p)}</span></div>
        <div class="sp-cols">${cellsHTML(i)}</div>
        <div class="sp-of"><span>카드 ${p.cards.length}</span><span>예약 ${p.res.length}</span><span>귀족 ${p.nobles.length}</span><span>보석 ${tokTotal(p)}</span></div>
        ${sp ? `<div class="sp-say${sp.fresh ? ' pop' : ''}" data-say="${i}">${esc(sp.t)}</div>` : ''}
      </div>`;
    }).join('');
    Object.values(speech).forEach(x => { x.fresh = false; });
    fillAv(oppBox);
  }
  function drawNobles() {
    nobBox.innerHTML = s.nobles.map(k => nobleHTML(k)).join('') || '<span class="sp-dim">귀족이 모두 떠났어요</span>';
  }
  function drawBoard() {
    const me = P(hs), b = bonusOf(me), mine = myTurn() && s.phase === 'act';
    board.innerHTML = [2, 1, 0].map(l => {
      const lv = l + 1, d = s.decks[l].length;
      const deck = d ? backHTML(lv, d, { cls: ' sp-deck' + (sel.card && sel.card.k === 'd' && sel.card.lv === lv ? ' sel' : ''), attr: ` data-d="${lv}"` }) : `<div class="sp-back sp-empty"><b>빈 덱</b></div>`;
      const cards = s.table[l].map((id, i) => {
        if (id == null) return '<div class="sp-slot"></div>';
        const isSel = sel.card && sel.card.k === 't' && sel.card.lv === lv && sel.card.i === i;
        const can = mine && canAfford(me, b, CARDS[id]);
        const fresh = !prevTable.has(id);
        return cardHTML(id, { bonus: b, cls: (can ? ' can' : '') + (isSel ? ' sel' : '') + (fresh ? ' deal' : ''), attr: ` data-t="${lv}:${i}" data-id="${id}"` });
      }).join('');
      return `<div class="sp-row">${deck}${cards}</div>`;
    }).join('');
    prevTable = new Set(s.table.flat());
  }
  function selGemCount(c) { return sel.gems.filter(x => x === c).length; }
  function drawBank() {
    const can = myTurn() && s.phase === 'act';
    bank.innerHTML = [0, 1, 2, 3, 4, 5].map(c => {
      const k = selGemCount(c);
      return `<button class="sp-tok sp-k${c}${k ? ' on' : ''}${s.supply[c] ? '' : ' none'}" data-g="${c}"${can ? '' : ' tabindex="-1"'}>${gem(c)}<b>${s.supply[c] - k}</b>${k ? `<i class="sp-plus">+${k}</i>` : ''}</button>`;
    }).join('');
    bank.classList.toggle('live', can);
  }
  function srcCard(sc) {
    if (!sc) return null;
    if (sc.k === 't') return s.table[sc.lv - 1][sc.i];
    if (sc.k === 'r') return P(hs).res[sc.r] ? P(hs).res[sc.r].id : null;
    return null;
  }
  function gemsMove() {
    const g = sel.gems.slice().sort((a, b) => a - b);
    if (g.length === 2 && g[0] === g[1]) return { t: 'take2', c: g[0] };
    return { t: 'take', g };
  }
  const isLegal = m => self.legalMoves(s).some(x => JSON.stringify(x) === JSON.stringify(m));
  function drawDock() {
    const parts = [];
    const msg = (b, sm) => `<div class="sp-msg"><b>${b}</b>${sm ? `<small>${sm}</small>` : ''}</div>`;
    const btn = (a, label, on = true, cls = '') => `<button class="sp-btn ${cls}" data-a="${a}"${on ? '' : ' disabled'}>${label}</button>`;
    if (s.over) parts.push(msg('게임이 끝났어요'));
    else if (!myTurn()) parts.push(msg(`${nameOf(s.turn)} ${s.phase === 'discard' ? '보석 반납 중…' : '생각 중…'}`, s.last && s.last.seat !== hs ? lastText(s.last) : ''));
    else if (s.phase === 'discard') parts.push(msg(`보석이 10개를 넘었어요 · ${tokTotal(P(hs)) - 10}개 반납`, '아래 내 보석을 눌러 돌려주세요'));
    else if (s.phase === 'noble') parts.push(msg('귀족 둘 이상이 방문하려 해요'), btn('noble', '귀족 고르기', true, 'go'));
    else if (sel.gems.length) {
      const m = gemsMove(), ok = isLegal(m);
      const k = Math.min(3, [0, 1, 2, 3, 4].filter(c => s.supply[c] > 0).length);
      parts.push(msg(sel.gems.map(c => GNAME[c]).join(' · '), ok ? `가져온 뒤 보석 ${tokTotal(P(hs)) + sel.gems.length}개` : (sel.gems.length === 2 && sel.gems[0] === sel.gems[1] ? '같은 색 2개는 4개 이상 쌓인 색만' : `서로 다른 색 ${k}개를 고르세요`)),
        btn('cancel', '취소'), btn('take', '가져오기', ok, 'go'));
    } else if (sel.card) {
      const me = P(hs), b = bonusOf(me), sc = sel.card;
      if (sc.k === 'd') {
        const ok = isLegal({ t: 'resd', lv: sc.lv });
        parts.push(msg(`레벨 ${sc.lv} 덱에서 몰래 예약`, me.res.length >= 3 ? '예약은 3장까지예요' : s.supply[5] ? '맨 위 카드를 뒤집지 않고 가져오고 금 1개' : '금이 없어 카드만 가져와요'), btn('cancel', '취소'), btn('resd', '덱 예약', ok, 'res'));
      } else {
        const id = srcCard(sc), c = CARDS[id], sh = shortOf(me, b, c), afford = canAfford(me, b, c);
        const need = sh.miss.map((v, i) => (v ? `<i class="sp-pip sp-k${i}">${v}</i>` : '')).join('');
        const info = afford ? (sh.tot ? `금 ${sh.tot}개를 섞어서 살 수 있어요` : '바로 살 수 있어요') : `<span class="sp-need">부족 ${need}${me.tok[5] ? ` <small>(금 ${me.tok[5]})</small>` : ''}</span>`;
        parts.push(msg(`레벨 ${c.lv} · ${c.pts ? c.pts + '점' : '0점'} · ${GNAME[c.col]} 보너스`, info), btn('cancel', '취소'));
        if (sc.k === 't') parts.push(btn('res', s.supply[5] ? '예약 +금' : '예약', me.res.length < 3, 'res'));
        parts.push(btn('buy', '구매', afford, 'go'));
      }
    } else {
      const ms = self.legalMoves(s);
      if (ms.length === 1 && ms[0].t === 'pass') parts.push(msg('할 수 있는 행동이 없어요'), btn('pass', '넘기기', true, 'go'));
      else parts.push(msg(s.ending ? '마지막 차례예요!' : '내 차례', '보석을 고르거나(다른 색 3개 · 같은 색 2개) 카드를 누르세요'));
    }
    dock.className = 'sp-dock' + (myTurn() ? ' mine' : '');
    dock.innerHTML = parts.join('');
  }
  function drawMe() {
    const p = P(hs);
    const res = [0, 1, 2].map(r => {
      const x = p.res[r];
      if (!x) return '<div class="sp-rslot"></div>';
      const can = myTurn() && s.phase === 'act' && canAfford(p, bonusOf(p), CARDS[x.id]);
      return cardHTML(x.id, { bonus: bonusOf(p), cls: ' sp-mini' + (can ? ' can' : '') + (sel.card && sel.card.k === 'r' && sel.card.r === r ? ' sel' : ''), attr: ` data-r="${r}"` });
    }).join('');
    meBox.className = 'sp-me' + (myTurn() ? ' turn' : '');
    meBox.innerHTML = `<div class="sp-mh"><span class="sp-av" data-av="${hs}"></span><b>나</b><span class="sp-mp">${pointsOf(p)}<small>점</small></span>
        <span class="sp-mi">${p.nobles.length ? `귀족 ${p.nobles.length}` : ''}</span><span class="sp-mi">카드 ${p.cards.length}</span><span class="sp-mi${tokTotal(p) > 10 ? ' bad' : ''}">보석 ${tokTotal(p)}/10</span></div>
      <div class="sp-mrow"><div class="sp-cols big">${cellsHTML(hs, true)}</div><div class="sp-mres">${res}</div></div>`;
    fillAv(meBox);
  }
  function draw() { drawTop(); drawOpps(); drawNobles(); drawBoard(); drawBank(); drawDock(); drawMe(); }

  // ----- 연출 -----
  function toast(t, cls = '') {
    const d = document.createElement('div'); d.className = 'sp-toast ' + cls; d.textContent = t; toasts.append(d);
    later(() => d.remove(), ctx.delay(2200));
  }
  function panelOf(seat) { return seat === hs ? meBox : oppBox.querySelector(`[data-seat="${seat}"]`); }
  function fly(fromRect, html, seat, delay = 0, gemFly = false) {
    const to = panelOf(seat); if (!fx || !fromRect || !to) return;
    const size = gemFly ? { w: 30, h: 30 } : { w: fromRect.width, h: fromRect.height };
    const box = document.createElement('div'); box.innerHTML = html;
    const node = box.firstElementChild; if (!node) return;
    if (!gemFly) node.style.setProperty('--cw', fromRect.width + 'px');
    fx.fly({ from: fromRect, to, node, size, delay, dur: gemFly ? 520 : 600, scale: gemFly ? 0.8 : 0.32, fade: !gemFly, spin: gemFly ? 160 : 0 })
      .then(() => { const t2 = panelOf(seat); if (t2 && fx) fx.pop(t2, 1.04); });
  }
  function floatText(seat, t, color = '#ffe08a') { const to = panelOf(seat); if (fx && to) fx.float(to, t, { color, size: 28 }); }
  function confetti() {
    const box = document.createElement('div'); box.className = 'sp-conf';
    const cols = ['#f3f0e8', '#3e7ee0', '#33a865', '#de4552', '#e7c15d'];
    for (let i = 0; i < 40; i++) { const e = document.createElement('i'); e.style.cssText = `left:${(i * 37) % 100}%;background:${cols[i % 5]};animation-delay:${(i % 10) * 0.08}s;animation-duration:${1.6 + (i % 7) * 0.15}s`; box.append(e); }
    root.append(box); later(() => box.remove(), 3200);
  }
  function lastText(L) {
    if (!L) return '';
    if (L.t === 'take') return `보석 ${L.g.map(c => GNAME[c]).join('·')}`;
    if (L.t === 'buy') { const c = CARDS[L.id]; return `레벨 ${c.lv} ${GNAME[c.col]} 카드 구매${c.pts ? ` (+${c.pts}점)` : ''}`; }
    if (L.t === 'res') return `${L.open ? `레벨 ${L.lv} 카드` : `레벨 ${L.lv} 덱`} 예약${L.gold ? ' +금' : ''}`;
    if (L.t === 'pass') return '할 수 있는 행동이 없어 넘김';
    return '';
  }
  function log(t, cls = '') { logs.push({ t, cls }); if (logs.length > 120) logs.shift(); }
  function say(seat, key) {
    if (ctx.players[seat].human || speech[seat]) return;
    const t = ctx.say(seat, key); if (!t) return;
    speech[seat] = { t, fresh: true };
    log(`「${nameOf(seat)}」 ${t}`, 'sp');
    drawOpps();
    later(() => { delete speech[seat]; drawOpps(); }, ctx.readMs(t));
  }

  // ----- 진행 -----
  function rectSel(sel2) { const e = root.querySelector(sel2); return e ? e.getBoundingClientRect() : null; }
  function step(seat, move, reason) {
    if (s.over) return;
    // 연출용: 수를 두기 전 위치를 기억
    let from = null, html = '', gemRects = [];
    if (move.t === 'take' || move.t === 'take2') gemRects = (move.t === 'take' ? move.g : [move.c, move.c]).map(c => rectSel(`.sp-tok[data-g="${c}"]`));
    if (move.t === 'buy' || move.t === 'res') { from = rectSel(`[data-t="${move.lv}:${move.i}"]`); html = cardHTML(s.table[move.lv - 1][move.i]); }
    if (move.t === 'buyr') { from = seat === hs ? rectSel(`[data-r="${move.r}"]`) : rectSel(`.sp-opp[data-seat="${seat}"]`); html = cardHTML(P(seat).res[move.r].id); }
    if (move.t === 'resd') { from = rectSel(`[data-d="${move.lv}"]`); html = backHTML(move.lv); }
    const goldRect = rectSel('.sp-tok[data-g="5"]');
    const before = s.players.map(pointsOf), leader = before.indexOf(Math.max(...before));
    const phase = s.phase, wasEnding = s.ending;
    self.applyMove(s, move);
    sel = { gems: [], card: null };
    const after = s.players.map(pointsOf);
    if (!s.over && ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s)));
    draw();
    // 기록·소리·대사
    const L = s.last;
    if (phase === 'act') {
      if (move.t === 'take' || move.t === 'take2') { SFX.take(); gemRects.forEach((r, k) => fly(r, gem(L.g[k], 'sp-flygem'), seat, k * 90, true)); }
      else if (move.t === 'buy' || move.t === 'buyr') { SFX.buy(); fly(from, html, seat); const c = CARDS[L.id]; if (c.pts) later(() => floatText(seat, `+${c.pts}`), ctx.delay(500)); }
      else if (move.t === 'res' || move.t === 'resd') { SFX.res(); fly(from, html, seat); if (L.gold) fly(goldRect, gem(5, 'sp-flygem'), seat, 150, true); }
      log(`${nameOf(seat)}: ${lastText(L)}${reason === 'block' ? ' · 견제' : ''}`);
      if (seat !== hs) {
        if (reason === 'block') say(seat, 'block');
        else if (move.t.startsWith('buy') && CARDS[L.id].pts >= 3) say(seat, 'good');
      }
    } else if (move.t === 'discard') { log(`${nameOf(seat)}: ${GNAME[move.c]} 반납`, 'dim'); if (seat !== hs && s.phase !== 'discard') say(seat, 'bad'); }
    for (const f of s.fx) {
      if (f.t === 'noble') { log(`${nameOf(f.seat)}: 귀족 방문 (+3점)`, 'good'); toast(`${nameOf(f.seat)} — 귀족 방문 +3`, 'gold'); later(() => { SFX.noble(); floatText(f.seat, '+3 귀족'); const pn = panelOf(f.seat); if (fx && pn) fx.burst(pn, { color: ['#f3cf63', '#ffffff', '#c58cff'], n: 16 }); }, ctx.delay(300)); if (f.seat !== hs) say(f.seat, 'good'); }
      if (f.t === 'ending') { log(`${nameOf(f.seat)} ${after[f.seat]}점 도달! 이번 라운드까지만 진행해요.`, 'good'); toast('15점 도달 — 마지막 라운드!', 'red'); }
    }
    void wasEnding;
    const nl = after.indexOf(Math.max(...after));
    if (nl !== leader && after[nl] > before[leader] && !ctx.players[leader].human && before[leader] > 0) say(leader, 'overtaken');
    if (s.over) return finish();
    loop();
  }
  function loop(first) {
    if (dead || s.over) return;
    const seat = s.turn, p = ctx.players[seat];
    if (p.human) { if (s.phase === 'noble') openNoble(); else if (s.phase === 'act' && fx) fx.buzz(12); return; }
    const wait = first ? 1800 : s.phase === 'act' ? 950 : 380;
    later(() => {
      const ch = self.botChoose(s, p.traits, rng, { seat, rivalSeats: p.rivalSeats, allySeats: p.allySeats });
      step(seat, ch.move, ch.reason);
    }, ctx.delay(wait));
  }
  function finish() {
    if (finished) return; finished = true;
    if (ctx.clearAutosave) ctx.clearAutosave();
    const res = self.result(s), meRank = res.ranking.find(r => r.seat === hs).rank, last = res.ranking[res.ranking.length - 1];
    res.ranking.forEach(r => { if (ctx.players[r.seat].human) return; if (r.rank === 1) say(r.seat, 'win'); else if (r.seat === last.seat) say(r.seat, 'lose'); });
    log(meRank === 1 ? '당신의 승리!' : `${nameOf(res.ranking[0].seat)} 승리`, 'good');
    later(() => {
      if (meRank === 1) { SFX.win(); confetti(); } else SFX.lose();
      const rows = res.ranking.map(r => {
        const p = P(r.seat), b = bonusOf(p);
        return `<div class="sp-fr${r.rank === 1 ? ' first' : ''}" style="--pc:${colorOf(r.seat)}"><i>${r.rank}위</i><span class="sp-av" data-av="${r.seat}"></span>
          <div class="sp-fi"><b>${r.seat === hs ? '나' : nameOf(r.seat)}</b><small>카드 ${p.cards.length} · 귀족 ${p.nobles.length} · 보너스 ${b.map((v, i) => `<em class="sp-k${i}">${v}</em>`).join('')}</small></div><span class="sp-fp">${r.score}<small>점</small></span></div>`;
      }).join('');
      openOv(`<h3 class="sp-ft">${meRank === 1 ? '승리!' : `${meRank}위`}</h3><p class="sp-fs">${s.round}라운드 · 점수가 같으면 카드가 적은 쪽이 앞</p>${rows}<button class="sp-btn go wide" data-a="finish">기록 저장하고 마치기</button>`, true);
      ov._res = res;
    }, ctx.delay(1500));
  }

  // ----- 겹쳐 뜨는 창 -----
  function openOv(html, keep) { ov.innerHTML = `<div class="sp-sheet">${html}${keep ? '' : '<button class="sp-btn wide" data-a="close">닫기</button>'}</div>`; ov.hidden = false; fillAv(ov); }
  function openNoble() {
    openOv(`<h3 class="sp-ft">귀족 고르기</h3><p class="sp-fs">조건을 채운 귀족 중 한 명만 이번 차례에 방문해요.</p><div class="sp-nbpick">${s.pend.map(k => `<button data-nk="${k}">${nobleHTML(k, ' big')}</button>`).join('')}</div>`, true);
  }
  function openOpp(seat) {
    const p = P(seat), mine = seat === hs;
    const res = p.res.map(x => (x.open || mine ? cardHTML(x.id) : backHTML(CARDS[x.id].lv, null))).join('') || '<span class="sp-dim">없음</span>';
    const cards = [0, 1, 2, 3, 4].map(c => { const ids = p.cards.filter(id => CARDS[id].col === c); return ids.length ? `<div class="sp-stack">${ids.map(id => cardHTML(id, { cls: ' sp-tiny' })).join('')}</div>` : ''; }).join('') || '<span class="sp-dim">아직 없음</span>';
    openOv(`<div class="sp-dh" style="--pc:${colorOf(seat)}"><span class="sp-av" data-av="${seat}"></span><b>${mine ? '나' : nameOf(seat)}</b><span class="sp-fp">${pointsOf(p)}<small>점</small></span></div>
      <div class="sp-cols big">${cellsHTML(seat)}</div>
      <h4>예약한 카드</h4><div class="sp-dres">${res}</div>
      <h4>산 카드</h4><div class="sp-dcards">${cards}</div>
      ${p.nobles.length ? `<h4>방문한 귀족</h4><div class="sp-dres">${p.nobles.map(k => nobleHTML(k)).join('')}</div>` : ''}`);
  }
  function openLog() { openOv(`<h3 class="sp-ft">진행 기록</h3><div class="sp-log">${logs.slice().reverse().map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join('') || '<div>아직 기록이 없어요</div>'}</div>`); }
  function openRules() {
    openOv(`<h3 class="sp-ft">규칙</h3><ul class="sp-rules">
      <li>내 차례에 <b>하나만</b> 합니다: ① 서로 다른 색 보석 3개 ② 같은 색 2개(그 색이 4개 이상 남았을 때) ③ 카드 1장 예약 + 금 1개 ④ 카드 1장 구매.</li>
      <li>산 카드는 <b>보너스</b>가 되어, 그 색 보석 1개만큼 영원히 할인해 줍니다. 금은 아무 색으로나 쓸 수 있어요.</li>
      <li>예약은 3장까지. 판 위의 카드나 덱 맨 위 카드(몰래)를 가져올 수 있고, 예약한 카드는 나만 살 수 있어요.</li>
      <li>차례가 끝날 때 보석이 10개를 넘으면 넘는 만큼 반납합니다.</li>
      <li>보너스가 귀족 조건을 채우면 차례 끝에 귀족이 방문합니다(+3점, 한 번에 1명).</li>
      <li>누군가 <b>15점</b>에 닿으면 그 라운드를 마지막 자리까지 마치고 끝. 점수가 가장 높은 사람이 승리, 같으면 산 카드가 적은 사람이 승리.</li>
      <li>보석 수: 2인 4개 · 3인 5개 · 4인 7개씩, 금 5개. 귀족은 인원 +1명.</li></ul>`);
  }

  // ----- 입력 -----
  function clickGem(c) {
    if (!myTurn() || s.phase !== 'act') return;
    if (c === 5) { toast('금은 카드를 예약할 때 받아요'); SFX.err(); return; }
    sel.card = null;
    const g = sel.gems;
    if (g.includes(c)) {
      if (g.length === 1 && s.supply[c] >= 4) g.push(c);              // 같은 색 한 번 더 → 2개
      else sel.gems = g.length === 2 && g[0] === g[1] ? [] : g.filter(x => x !== c);
    } else if (s.supply[c] <= 0) { SFX.err(); return; }
    else if (g.length === 2 && g[0] === g[1]) sel.gems = [c];
    else if (g.length >= 3) { SFX.err(); toast('서로 다른 색은 3개까지'); return; }
    else g.push(c);
    SFX.pick(); drawBank(); drawDock(); drawBoard(); drawMe();
  }
  function humanMove(m) { if (lock || !myTurn() || !isLegal(m)) { SFX.err(); return; } step(hs, m, 'human'); }
  root.addEventListener('click', e => {
    if (dead) return;
    const t = e.target;
    const sayEl = t.closest('[data-say]');
    if (sayEl) { delete speech[+sayEl.dataset.say]; drawOpps(); return; }
    const a = t.closest('[data-a]');
    if (a && !a.disabled) {
      const k = a.dataset.a;
      if (k === 'log') return openLog();
      if (k === 'rules') return openRules();
      if (k === 'close') { ov.hidden = true; ov.innerHTML = ''; return; }
      if (k === 'finish') { a.disabled = true; ov.hidden = true; ctx.finish(ov._res); return; }
      if (k === 'noble') return openNoble();
      if (k === 'cancel') { sel = { gems: [], card: null }; return draw(); }
      if (k === 'take') return humanMove(gemsMove());
      if (k === 'pass') return humanMove({ t: 'pass' });
      const sc = sel.card;
      if (k === 'buy' && sc) return humanMove(sc.k === 'r' ? { t: 'buyr', r: sc.r } : { t: 'buy', lv: sc.lv, i: sc.i });
      if (k === 'res' && sc && sc.k === 't') return humanMove({ t: 'res', lv: sc.lv, i: sc.i });
      if (k === 'resd' && sc && sc.k === 'd') return humanMove({ t: 'resd', lv: sc.lv });
      return;
    }
    const nk = t.closest('[data-nk]');
    if (nk) { ov.hidden = true; return humanMove({ t: 'noble', k: +nk.dataset.nk }); }
    const g = t.closest('[data-g]');
    if (g) return clickGem(+g.dataset.g);
    const dc = t.closest('[data-dc]');
    if (dc) return humanMove({ t: 'discard', c: +dc.dataset.dc });
    const opp = t.closest('.sp-opp');
    if (opp) return openOpp(+opp.dataset.seat);
    if (t.closest('.sp-mh')) return openOpp(hs);
    if (e.target === ov && !finished) { ov.hidden = true; ov.innerHTML = ''; return; }
    const pick = t.closest('[data-t],[data-r],[data-d]');
    if (pick && myTurn() && s.phase === 'act') {
      let sc;
      if (pick.dataset.t) { const [lv, i] = pick.dataset.t.split(':').map(Number); sc = { k: 't', lv, i }; }
      else if (pick.dataset.r) sc = { k: 'r', r: +pick.dataset.r };
      else sc = { k: 'd', lv: +pick.dataset.d };
      const same2 = sel.card && JSON.stringify(sel.card) === JSON.stringify(sc);
      sel = { gems: [], card: same2 ? null : sc };
      SFX.pick(); drawBoard(); drawBank(); drawDock(); drawMe();
    }
  });

  // ----- 시작 -----
  log(resumed ? `이어서 하기 · 라운드 ${s.round}` : `새 게임! ${n}인 · 보석 ${GEMS_BY_N[n]}개씩 · 귀족 ${n + 1}명. ${nameOf(0)}부터 시작합니다.`);
  draw();
  if (!resumed) ctx.players.forEach((p, i) => { if (!p.human) later(() => say(i, 'start'), ctx.delay(300 + i * 500)); });
  if (!resumed && ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s)));
  loop(true);
  return { destroy() { dead = true; timers.forEach(clearTimeout); timers.clear(); } };
}
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// ---------- 그림: 보석 6종 · 왕관 · 카드 풍경 6종 (전부 직접 그린 SVG, 색은 카드 색을 따라감) ----------
const GEMDEF = [['#ffffff', '#d9dde6', '#8d97a8'], ['#7fb2ff', '#2f6fe0', '#163c8c'], ['#7be3a2', '#22a35a', '#0f5a31'], ['#ff8a92', '#e0303e', '#7d121b'], ['#8d8796', '#3b3740', '#121015']];
const DEFS = GEMDEF.map(([hi, mid, dk], i) => `<symbol id="sp-g${i}" viewBox="0 0 40 40">
  <polygon points="11,5 29,5 37,15 20,36 3,15" fill="${mid}" stroke="${dk}" stroke-width="1.6" stroke-linejoin="round"/>
  <polygon points="11,5 29,5 25,15 15,15" fill="${hi}" opacity=".85"/><polygon points="11,5 15,15 3,15" fill="${hi}" opacity=".45"/>
  <polygon points="3,15 15,15 20,36" fill="${dk}" opacity=".35"/><polygon points="37,15 25,15 20,36" fill="${dk}" opacity=".6"/>
  <polygon points="15,15 25,15 20,36" fill="${hi}" opacity=".18"/><path d="M14 9 l3 -2" stroke="#fff" stroke-width="1.6" stroke-linecap="round" opacity=".9"/></symbol>`).join('') + `
<symbol id="sp-g5" viewBox="0 0 40 40"><circle cx="20" cy="20" r="16" fill="#e6b52c" stroke="#8a6408" stroke-width="2"/><circle cx="20" cy="20" r="11.5" fill="none" stroke="#9c740d" stroke-width="1.4"/>
  <path d="M20 11.5l2.6 5.4 5.9.8-4.3 4.1 1.1 5.8-5.3-2.8-5.3 2.8 1.1-5.8-4.3-4.1 5.9-.8z" fill="#fff4bf"/><path d="M10 15 a11 11 0 0 1 7 -7" stroke="#fff8" stroke-width="2" fill="none" stroke-linecap="round"/></symbol>
<symbol id="sp-crown" viewBox="0 0 40 30"><path d="M4 24 L2 7 L12 15 L20 3 L28 15 L38 7 L36 24Z" fill="#f3cf63" stroke="#7a5510" stroke-width="2" stroke-linejoin="round"/><rect x="4" y="24" width="32" height="4" rx="1.5" fill="#d9ac38" stroke="#7a5510" stroke-width="1.6"/><circle cx="20" cy="17" r="2.6" fill="#e0303e"/><circle cx="11" cy="19" r="1.8" fill="#2f6fe0"/><circle cx="29" cy="19" r="1.8" fill="#22a35a"/></symbol>
<symbol id="sp-a10" viewBox="0 0 100 70"><path d="M-2 72 L22 30 L34 40 L52 12 L78 44 L88 36 L104 72Z" fill="currentColor" opacity=".55"/><path d="M52 12 L60 24 L54 22 L48 28 L44 24Z" fill="#fff" opacity=".35"/>
  <path d="M39 72 V57 a11 11 0 0 1 22 0 V72Z" fill="#000" opacity=".45"/><path d="M37 57 h26 M41 57 v15 M59 57 v15" stroke="#000" stroke-opacity=".55" stroke-width="2.5" fill="none"/>
  <path d="M24 47 l3 -5 3 5 -3 5z M70 30 l2.5 -4 2.5 4 -2.5 4z M82 54 l2 -3 2 3 -2 3z M16 60 l2 -3 2 3 -2 3z" fill="#fff" opacity=".85"/></symbol>
<symbol id="sp-a11" viewBox="0 0 100 70"><path d="M-2 72 L8 52 L24 44 L40 54 L58 40 L76 50 L90 42 L104 54 V72Z" fill="currentColor" opacity=".55"/>
  <path d="M28 50 h32 l-5 13 h-22z" fill="#000" opacity=".4"/><circle cx="37" cy="65" r="4.5" fill="#000" opacity=".55"/><circle cx="52" cy="65" r="4.5" fill="#000" opacity=".55"/>
  <path d="M33 50 l4 -7 4 7z M42 50 l5 -9 5 9z M52 50 l3 -5 3 5z" fill="#fff" opacity=".85"/>
  <path d="M68 20 q12 -8 24 4" stroke="#000" stroke-opacity=".5" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M80 18 L68 48" stroke="#000" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/></symbol>
<symbol id="sp-a20" viewBox="0 0 100 70"><path d="M0 66 H100" stroke="currentColor" stroke-opacity=".6" stroke-width="2"/><path d="M18 34 q26 -30 52 0z" fill="currentColor" opacity=".45"/><path d="M14 34 h60 v16 h-60z" fill="currentColor" opacity=".7"/>
  <path d="M74 44 L94 52" stroke="#000" stroke-opacity=".5" stroke-width="3" stroke-linecap="round"/>
  <g fill="none" stroke="#000" stroke-opacity=".55" stroke-width="2.5"><circle cx="28" cy="56" r="9"/><circle cx="60" cy="56" r="9"/><path d="M19 56h18M28 47v18M51 56h18M60 47v18"/></g>
  <path d="M26 34 l4 -6 4 6z M38 34 l5 -8 5 8z M52 34 l4 -6 4 6z" fill="#fff" opacity=".85"/></symbol>
<symbol id="sp-a21" viewBox="0 0 100 70"><path d="M8 46 h84 l-13 14 h-58z" fill="currentColor" opacity=".75"/><path d="M50 46 V6" stroke="#000" stroke-opacity=".5" stroke-width="2.5"/>
  <path d="M53 9 q24 15 0 34z" fill="currentColor" opacity=".45"/><path d="M47 13 q-22 13 0 29z" fill="currentColor" opacity=".35"/><path d="M50 6 l11 3 -11 3z" fill="#fff" opacity=".85"/>
  <path d="M0 66 q8 -4 16 0 t16 0 t16 0 t16 0 t16 0 t16 0" stroke="currentColor" stroke-opacity=".7" stroke-width="2" fill="none"/></symbol>
<symbol id="sp-a30" viewBox="0 0 100 70"><path d="M6 72 V30 h13 V72z M81 72 V30 h13 V72z" fill="currentColor" opacity=".5"/><path d="M4 30 l8.5 -13 8.5 13z M79 30 l8.5 -13 8.5 13z" fill="currentColor" opacity=".7"/>
  <path d="M18 72 V40 h64 V72z" fill="currentColor" opacity=".7"/><path d="M29 40 q21 -38 42 0z" fill="currentColor" opacity=".55"/><path d="M50 9 V1" stroke="currentColor" stroke-width="2"/><circle cx="50" cy="10" r="2.5" fill="#fff" opacity=".8"/>
  <path d="M25 46 h6 v26 h-6z M40 46 h6 v26 h-6z M54 46h6v26h-6z M69 46 h6 v26 h-6z" fill="#000" opacity=".28"/><path d="M38 24 q12 -14 24 0" stroke="#fff" stroke-opacity=".5" stroke-width="2" fill="none"/></symbol>
<symbol id="sp-a31" viewBox="0 0 100 70"><path d="M26 72 V22 h48 V72z" fill="currentColor" opacity=".7"/><path d="M21 23 l29 -19 29 19z" fill="currentColor" opacity=".5"/>
  <path d="M23 44 h54 l-5 8 h-44z" fill="#fff" opacity=".55"/><path d="M30 44 l-2 8 M40 44 l-1 8 M50 44 v8 M60 44 l1 8 M70 44 l2 8" stroke="#000" stroke-opacity=".3" stroke-width="2"/>
  <path d="M43 72 v-12 a7 7 0 0 1 14 0 v12z M32 27 h8 v11 h-8z M60 27 h8 v11 h-8z" fill="#000" opacity=".38"/><path d="M74 25 h16 l-5 6 5 6 h-16z" fill="#fff" opacity=".7"/><path d="M50 4 V-2" stroke="currentColor" stroke-width="2"/></symbol>`;

const CSS = `
.g-splendor{position:relative;container-type:inline-size;padding:7px 6px 9px;border-radius:18px;color:#f3ecda;font-family:var(--fk);user-select:none;-webkit-user-select:none;
 --cw:min(19.8cqw,104px,calc((100dvh - 462px) / 3.95));
 background:radial-gradient(90% 40% at 50% 0%,#ffffff18,transparent 70%),repeating-linear-gradient(45deg,#ffffff05 0 2px,#0000 2px 6px),radial-gradient(130% 90% at 50% 35%,var(--tb),var(--tb2));
 box-shadow:inset 0 0 0 3px #3a2a10,inset 0 0 0 5px #b48a3a,inset 0 0 50px #000a,0 10px 24px #0006}
.g-splendor *{box-sizing:border-box}
.g-splendor [hidden]{display:none!important}
.g-splendor button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;color:inherit}
.g-splendor .sp-defs{position:absolute;width:0;height:0;overflow:hidden}
.g-splendor .sp-k0{--c1:#fffdf7;--c2:#cdc3ad;--art:#6f6450;--ink:#2a2318}
.g-splendor .sp-k1{--c1:#5a95ec;--c2:#183a83;--art:#bcd6ff;--ink:#fff}
.g-splendor .sp-k2{--c1:#4fbf7c;--c2:#13553a;--art:#c3f2d4;--ink:#fff}
.g-splendor .sp-k3{--c1:#ea5b64;--c2:#77141d;--art:#ffd0d3;--ink:#fff}
.g-splendor .sp-k4{--c1:#6b6573;--c2:#18161c;--art:#d6d0de;--ink:#fff}
.g-splendor .sp-k5{--c1:#ffe08a;--c2:#b07f12;--art:#fff;--ink:#3a2a05}
.g-splendor .sp-l1{--fr:#c08d5c}.g-splendor .sp-l2{--fr:#d8e0ea}.g-splendor .sp-l3{--fr:#f4cf64}
.g-splendor .sp-gem{display:block;width:100%;height:100%}
.g-splendor .sp-dim{opacity:.6;font-size:12px}

/* 윗줄 */
.g-splendor .sp-top{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 4px 4px;font-size:12px;color:#e9dfc4}
.g-splendor .sp-rd{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-splendor .sp-flag{background:#c0303c;color:#fff;border-radius:999px;padding:1px 8px;font-size:11px;font-weight:800;animation:spblink 1.2s ease-in-out infinite alternate;white-space:nowrap}
.g-splendor .sp-tb{margin-left:auto;display:flex;gap:4px}
.g-splendor .sp-tb button{border:1px solid #ffffff3a;background:#0004;border-radius:999px;font-size:11px;padding:2px 9px;min-height:22px}

/* 상대 */
.g-splendor .sp-opps{display:grid;gap:5px;margin-bottom:5px;position:relative;z-index:3}
.g-splendor .sp-opps.n1{grid-template-columns:1fr}.g-splendor .sp-opps.n2{grid-template-columns:1fr 1fr}.g-splendor .sp-opps.n3{grid-template-columns:1fr 1fr 1fr}
.g-splendor .sp-opp{position:relative;background:linear-gradient(#ffffff14,#0000003a);border:1.5px solid #ffffff22;border-radius:11px;padding:4px 4px 3px;cursor:pointer;min-width:0;transition:box-shadow .3s,border-color .3s}
.g-splendor .sp-opp.turn{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 0 14px #e7c15d88}
.g-splendor .sp-opp.turn .sp-on:after{content:" …";animation:spblink .6s infinite alternate}
.g-splendor .sp-oh{display:flex;align-items:center;gap:4px;margin-bottom:3px;min-width:0}
.g-splendor .sp-av{flex:none;width:22px;height:22px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2px var(--pc,#888),0 1px 3px #000a;display:block;background:#333}
.g-splendor .sp-av>*{width:100%!important;height:100%!important;display:grid;place-items:center;font-size:10px;border-radius:50%}
.g-splendor .sp-on{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.g-splendor .sp-op{font:700 19px/1 var(--fd);color:#ffe9a6;text-shadow:0 1px 2px #000}
.g-splendor .sp-cols{display:grid;grid-template-columns:repeat(6,1fr);gap:2px}
.g-splendor .sp-cc{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0;border:0;background:none;padding:0}
.g-splendor .sp-cc.zero{opacity:.38}
.g-splendor .sp-cb{display:grid;place-items:center;width:100%;height:15px;border-radius:3px;font:800 11px/1 var(--fd);background:linear-gradient(160deg,var(--c1),var(--c2));color:var(--ink);box-shadow:inset 0 0 0 1px #0005}
.g-splendor .sp-cb.sp-gold{background:none;box-shadow:none;color:#f3cf63;font-size:10px}
.g-splendor .sp-ct{display:flex;align-items:center;gap:1px;font:700 11px/1 var(--fd);color:#fff}
.g-splendor .sp-ct .sp-gem{width:9px;height:9px}
.g-splendor .sp-of{display:flex;justify-content:space-between;gap:2px;font-size:9.5px;color:#d8cfb6;margin-top:2px;white-space:nowrap;overflow:hidden}
.g-splendor .sp-opps.n3 .sp-of span:last-child{display:none}
.g-splendor .sp-say{position:absolute;left:0;right:0;top:calc(100% + 4px);z-index:9;background:#fbf6e6;color:#2a2016;border-radius:10px;padding:6px 9px;font-size:12.5px;line-height:1.4;box-shadow:0 4px 12px #000a;cursor:pointer;min-width:120px}
.g-splendor .sp-opps.n3 .sp-opp:last-child .sp-say{left:auto;right:0}
.g-splendor .sp-say:after{content:"";position:absolute;left:16px;top:-6px;border:6px solid transparent;border-bottom-color:#fbf6e6;border-top:0}
.g-splendor .sp-say.pop{animation:sppop .2s ease-out}

/* 귀족 */
.g-splendor .sp-nobles{display:flex;justify-content:center;gap:5px;margin-bottom:5px;min-height:calc(var(--cw)*.6)}
.g-splendor .sp-nb{position:relative;width:calc(var(--cw)*.6);height:calc(var(--cw)*.6);border-radius:7px;flex:none;
 background:radial-gradient(circle at 50% 30%,#6b3d8c,#2a1340);box-shadow:inset 0 0 0 2px #f2cd6399,0 2px 5px #0009;display:flex;flex-direction:column;align-items:center;justify-content:space-between;padding:3px 2px}
.g-splendor .sp-crown{position:absolute;left:3px;top:3px;width:42%;height:auto;opacity:.95}
.g-splendor .sp-nb>b{position:absolute;right:5px;top:1px;font:700 calc(var(--cw)*.2)/1 var(--fd);color:#fff;text-shadow:0 1px 2px #000}
.g-splendor .sp-req{display:flex;gap:2px;margin-top:auto}
.g-splendor .sp-req i{font:800 calc(var(--cw)*.14)/1 var(--fd);font-style:normal;min-width:calc(var(--cw)*.14);padding:2px 1px;border-radius:2px;text-align:center;background:linear-gradient(160deg,var(--c1),var(--c2));color:var(--ink);box-shadow:inset 0 0 0 1px #0006}
.g-splendor .sp-nb.big{--cw:96px}

/* 카드 */
.g-splendor .sp-board{display:flex;flex-direction:column;gap:5px;align-items:center;margin-bottom:6px}
.g-splendor .sp-row{display:flex;gap:4px;align-items:center}
.g-splendor .sp-card{position:relative;flex:none;width:var(--cw);height:calc(var(--cw)*1.3);border-radius:calc(var(--cw)*.09);overflow:hidden;cursor:pointer;
 background:linear-gradient(165deg,var(--c1),var(--c2));color:var(--ink);
 box-shadow:inset 0 0 0 calc(var(--cw)*.035) var(--fr),inset 0 0 0 calc(var(--cw)*.05) #0005,0 3px 6px #000a;transition:transform .15s,box-shadow .2s}
.g-splendor .sp-card:after{content:"";position:absolute;inset:0;background:linear-gradient(120deg,#ffffff38 0%,#ffffff00 32%,#ffffff00 62%,#ffffff1a 75%,#0000 85%);pointer-events:none}
.g-splendor .sp-art{position:absolute;left:6%;right:6%;top:25%;width:88%;height:50%;color:var(--art)}
.g-splendor .sp-hd{position:absolute;left:0;right:0;top:0;height:27%;display:flex;align-items:center;gap:2px;padding:0 7% 0 9%;background:linear-gradient(#000b,#0005 70%,#0000);border-radius:calc(var(--cw)*.09) calc(var(--cw)*.09) 0 0}
.g-splendor .sp-pt{font:700 calc(var(--cw)*.34)/1 var(--fd);color:#fff;text-shadow:0 1px 0 #000,0 0 5px #000;min-width:calc(var(--cw)*.2)}
.g-splendor .sp-lvd{flex:1;text-align:center;font-size:calc(var(--cw)*.075);letter-spacing:1px;color:var(--fr);text-shadow:0 0 3px #000}
.g-splendor .sp-bn{width:calc(var(--cw)*.27);height:calc(var(--cw)*.27);filter:drop-shadow(0 1px 2px #000c)}
.g-splendor .sp-cost{position:absolute;left:6%;right:6%;bottom:5.5%;display:flex;gap:4%;flex-wrap:wrap-reverse}
.g-splendor .sp-pip{flex:none;width:calc(var(--cw)*.205);height:calc(var(--cw)*.205);border-radius:50%;display:grid;place-items:center;font:700 calc(var(--cw)*.15)/1 var(--fd);font-style:normal;
 background:radial-gradient(circle at 35% 30%,var(--c1),var(--c2));color:var(--ink);box-shadow:0 0 0 1.2px #000c,inset 0 1px 1px #fff7}
.g-splendor .sp-pip.ok{opacity:.35}
.g-splendor .sp-card.can{box-shadow:inset 0 0 0 calc(var(--cw)*.035) var(--fr),0 0 0 2px #8affbc,0 0 12px 3px #3fe08acc;animation:spcan 1.4s ease-in-out infinite alternate}
.g-splendor .sp-card.sel,.g-splendor .sp-back.sel{transform:translateY(-4px) scale(1.05);box-shadow:inset 0 0 0 calc(var(--cw)*.035) var(--fr),0 0 0 2.5px var(--acc),0 6px 14px #000c;z-index:2}
.g-splendor .sp-card.deal{animation:spdeal .5s ease-out}
.g-splendor .sp-slot{flex:none;width:var(--cw);height:calc(var(--cw)*1.3);border-radius:calc(var(--cw)*.09);border:1.5px dashed #ffffff26}
.g-splendor .sp-back{position:relative;flex:none;width:calc(var(--cw)*.6);height:calc(var(--cw)*1.3);border-radius:calc(var(--cw)*.08);display:flex;flex-direction:column;align-items:center;justify-content:center;gap:4px;cursor:pointer;
 background:repeating-linear-gradient(45deg,#ffffff12 0 3px,#0000 3px 7px),radial-gradient(circle at 50% 40%,var(--bk1),var(--bk2));box-shadow:inset 0 0 0 2px var(--fr),inset 0 0 0 4px #0006,0 3px 6px #000a;transition:transform .15s}
.g-splendor .sp-back.sp-l1{--bk1:#6b4a2b;--bk2:#2c1a0c}.g-splendor .sp-back.sp-l2{--bk1:#3e5a7e;--bk2:#14223a}.g-splendor .sp-back.sp-l3{--bk1:#6a3f8e;--bk2:#251036}
.g-splendor .sp-bk{font-size:calc(var(--cw)*.11);color:var(--fr);writing-mode:vertical-rl;letter-spacing:2px}
.g-splendor .sp-back b{display:none}
.g-splendor .sp-back small{font:700 calc(var(--cw)*.2)/1 var(--fd);color:#fff;text-shadow:0 1px 2px #000}
.g-splendor .sp-back.sp-empty{--fr:#ffffff20;background:none;box-shadow:inset 0 0 0 1.5px #ffffff22;cursor:default}
.g-splendor .sp-back.sp-empty b{display:block;font-size:9px;font-weight:400;opacity:.5;writing-mode:vertical-rl}

/* 보석 창고 */
.g-splendor .sp-bank{display:flex;justify-content:center;gap:6px;margin-bottom:5px}
.g-splendor .sp-tok{position:relative;width:min(13cqw,46px);height:min(13cqw,46px);border-radius:50%;padding:0;border:2px solid #0007;
 background:radial-gradient(circle at 35% 30%,var(--c1),var(--c2));box-shadow:inset 0 0 0 3px #ffffff38,inset 0 -3px 5px #0006,0 3px 5px #000a;display:grid;place-items:center;transition:transform .15s}
.g-splendor .sp-tok .sp-gem{width:58%;height:58%;filter:drop-shadow(0 1px 1px #0009)}
.g-splendor .sp-tok.sp-k5 .sp-gem{width:72%;height:72%}
.g-splendor .sp-tok>b{position:absolute;right:-5px;bottom:-4px;min-width:19px;height:19px;border-radius:10px;background:#120d06;border:1.5px solid var(--acc);color:#fff;font:700 12px/16px var(--fd);text-align:center}
.g-splendor .sp-tok.none{opacity:.3}
.g-splendor .sp-tok.on{transform:translateY(-5px);box-shadow:0 0 0 2.5px var(--acc),0 0 14px #e7c15dcc,inset 0 0 0 3px #ffffff38}
.g-splendor .sp-plus{position:absolute;left:-5px;top:-6px;font:800 12px/1 var(--fd);font-style:normal;background:var(--acc);color:#2a1d05;border-radius:8px;padding:2px 4px}
.g-splendor .sp-bank.live .sp-tok:not(.none):not(.sp-k5){animation:spbreathe 2.4s ease-in-out infinite}

/* 조작 줄 */
.g-splendor .sp-dock{display:flex;align-items:center;gap:5px;min-height:44px;padding:4px 6px;margin-bottom:5px;border-radius:11px;background:#0000004a;border:1px solid #ffffff1c}
.g-splendor .sp-dock.mine{border-color:#e7c15d88;background:#2a1f0a66}
.g-splendor .sp-msg{flex:1;min-width:0;display:flex;flex-direction:column;gap:1px}
.g-splendor .sp-msg b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-splendor .sp-msg small{font-size:11px;color:#d9cfb3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;display:flex;align-items:center;gap:2px}
.g-splendor .sp-need{display:flex;align-items:center;gap:3px}
.g-splendor .sp-need .sp-pip{--cw:70px}
.g-splendor .sp-btn{flex:none;border:1.5px solid #ffffff44;background:#ffffff14;border-radius:10px;padding:8px 11px;font-size:13px;font-weight:700;min-height:38px}
.g-splendor .sp-btn.go{background:linear-gradient(#f6d77e,#c99a2e);color:#2b1d03;border-color:#fff3}
.g-splendor .sp-btn.res{background:linear-gradient(#8a5bb8,#4d2a74);border-color:#fff3}
.g-splendor .sp-btn:disabled{opacity:.35;cursor:default}
.g-splendor .sp-btn.wide{display:block;width:100%;margin-top:10px}

/* 내 자리 */
.g-splendor .sp-me{position:relative;border-radius:12px;padding:5px 6px 6px;background:linear-gradient(#ffffff16,#00000040);border:1.5px solid #ffffff26;transition:box-shadow .3s,border-color .3s}
.g-splendor .sp-me.turn{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 0 16px #e7c15d77}
.g-splendor .sp-mh{display:flex;align-items:center;gap:6px;margin-bottom:4px;cursor:pointer;font-size:12px}
.g-splendor .sp-mh>b{font-size:13px}
.g-splendor .sp-mp{font:700 24px/1 var(--fd);color:#ffe9a6;text-shadow:0 1px 2px #000}
.g-splendor .sp-mp small{font-size:12px;margin-left:1px}
.g-splendor .sp-mi{font-size:11px;color:#d9cfb3}
.g-splendor .sp-mi.bad{color:#ff9aa1;font-weight:800}
.g-splendor .sp-mi:last-child{margin-left:auto}
.g-splendor .sp-mrow{display:flex;gap:6px;align-items:flex-end}
.g-splendor .sp-cols.big{flex:1;gap:4px}
.g-splendor .sp-cols.big .sp-cb{height:calc(var(--cw)*.36);font-size:calc(var(--cw)*.24);border-radius:5px}
.g-splendor .sp-cols.big .sp-cb.sp-gold{font-size:calc(var(--cw)*.18)}
.g-splendor .sp-cols.big .sp-ct{font-size:15px;gap:2px}
.g-splendor .sp-cols.big .sp-ct .sp-gem{width:14px;height:14px}
.g-splendor .sp-dc{cursor:pointer;border-radius:6px;padding:2px 0;box-shadow:0 0 0 2px #ff8a92,0 0 10px #ff5a66aa;animation:spcan 1s ease-in-out infinite alternate}
.g-splendor .sp-mres{display:flex;gap:3px}
.g-splendor .sp-mini{--cw:min(11.5cqw,52px)}
.g-splendor .sp-rslot{flex:none;width:min(11.5cqw,52px);height:calc(min(11.5cqw,52px)*1.3);border-radius:5px;border:1.5px dashed #ffffff22}
.g-splendor .sp-tiny{--cw:34px;margin-top:-30px}
.g-splendor .sp-tiny:first-child{margin-top:0}

/* 겹침 창 · 연출 */
.g-splendor .sp-ov{position:fixed;inset:0;z-index:40;background:#000b;display:flex;align-items:center;justify-content:center;padding:14px}
.g-splendor .sp-sheet{width:100%;max-width:480px;max-height:88vh;overflow:auto;border-radius:16px;padding:16px 14px 14px;color:#f3ecda;
 background:radial-gradient(120% 80% at 50% 0%,var(--tb),var(--tb2));box-shadow:inset 0 0 0 2px #b48a3a,0 12px 30px #000c}
.g-splendor .sp-sheet h4{margin:12px 0 6px;font-size:13px;color:#e9d9a8}
.g-splendor .sp-ft{font:700 30px/1.1 var(--fd);text-align:center;margin:0 0 4px;color:#ffe9a6}
.g-splendor .sp-fs{text-align:center;font-size:12px;color:#d9cfb3;margin:0 0 12px}
.g-splendor .sp-fr{display:flex;align-items:center;gap:8px;padding:8px;border-radius:10px;background:#ffffff10;margin-bottom:6px}
.g-splendor .sp-fr.first{background:linear-gradient(90deg,#e7c15d44,#ffffff10);box-shadow:inset 0 0 0 1.5px var(--acc)}
.g-splendor .sp-fr>i{font-style:normal;font-weight:800;width:30px;color:#ffe9a6}
.g-splendor .sp-fr .sp-av,.g-splendor .sp-dh .sp-av{width:34px;height:34px}
.g-splendor .sp-fi{flex:1;min-width:0;display:flex;flex-direction:column;gap:2px}
.g-splendor .sp-fi small{font-size:11px;color:#d9cfb3;display:flex;align-items:center;gap:3px;flex-wrap:wrap}
.g-splendor .sp-fi em{font-style:normal;font:700 11px/1 var(--fd);padding:2px 4px;border-radius:3px;background:linear-gradient(160deg,var(--c1),var(--c2));color:var(--ink)}
.g-splendor .sp-fp{font:700 26px/1 var(--fd);color:#ffe9a6}
.g-splendor .sp-fp small{font-size:12px}
.g-splendor .sp-dh{display:flex;align-items:center;gap:10px;margin-bottom:10px;font-size:16px}
.g-splendor .sp-dh .sp-fp{margin-left:auto}
.g-splendor .sp-dres{display:flex;gap:6px;flex-wrap:wrap;--cw:70px}
.g-splendor .sp-dcards{display:flex;gap:6px;align-items:flex-start;min-height:40px}
.g-splendor .sp-stack{display:flex;flex-direction:column}
.g-splendor .sp-nbpick{display:flex;gap:10px;justify-content:center;flex-wrap:wrap}
.g-splendor .sp-nbpick button{border:0;background:none;padding:0}
.g-splendor .sp-log{font-size:12.5px;line-height:1.55;max-height:60vh;overflow:auto}
.g-splendor .sp-log .sp{color:#f6e6b6}.g-splendor .sp-log .good{color:#9ff0bd}.g-splendor .sp-log .dim{opacity:.6}
.g-splendor .sp-rules{padding-left:18px;font-size:13px;line-height:1.6;margin:0}
.g-splendor .sp-rules li{margin-bottom:5px}
.g-splendor .sp-toasts{position:absolute;left:0;right:0;top:38%;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none;z-index:30}
.g-splendor .sp-toast{background:#120d06ee;border:1.5px solid #ffffff44;color:#fff;border-radius:12px;padding:9px 16px;font-size:14px;font-weight:700;box-shadow:0 6px 18px #000c;animation:sptoast 2.2s ease forwards}
.g-splendor .sp-toast.gold{border-color:var(--acc);color:#ffe9a6}
.g-splendor .sp-toast.red{background:#5a0f17ee;border-color:#ff8a92}
.g-splendor .sp-flygem{filter:drop-shadow(0 2px 4px #000)}
.g-splendor .sp-conf{position:fixed;inset:0;pointer-events:none;z-index:45;overflow:hidden}
.g-splendor .sp-conf i{position:absolute;top:-12px;width:8px;height:12px;border-radius:2px;animation:spfall linear forwards}
@keyframes spcan{from{filter:brightness(1)}to{filter:brightness(1.18)}}
@keyframes spdeal{from{transform:rotateY(90deg) scale(.8);opacity:.2}to{transform:none;opacity:1}}
@keyframes spbreathe{0%,100%{filter:brightness(1)}50%{filter:brightness(1.15)}}
@keyframes spblink{from{opacity:1}to{opacity:.45}}
@keyframes sppop{from{transform:scale(.85);opacity:0}to{transform:none;opacity:1}}
@keyframes sptoast{0%{opacity:0;transform:translateY(8px) scale(.95)}12%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-10px)}}
@keyframes spfall{to{transform:translateY(105vh) rotate(540deg)}}
@media (min-width:560px){.g-splendor .sp-on{font-size:13px}.g-splendor .sp-cb{height:17px;font-size:12px}}
`;
