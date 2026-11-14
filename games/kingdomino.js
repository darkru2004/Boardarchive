// 킹도미노 (개정판 규칙 기준) — 2~4인. 도미노 타일을 골라 내 왕국(5×5, 2인 대결전은 7×7)에 이어 붙인다.
// 점수 = 같은 지형으로 이어진 땅의 칸 수 × 그 땅의 왕관 수. 규칙은 이 파일의 엔진이 전담하고, 봇은 합법 수 안에서만 고른다.
// 지형 그림은 전부 이 파일 안에서 새로 그린 SVG다(원작 그림을 쓰지 않음).

// ---------- 타일 마스터 (48장) : [지형A, 왕관A, 지형B, 왕관B] ----------
// 지형: 1 밀밭 · 2 숲 · 3 호수 · 4 초원 · 5 늪 · 6 광산   (7 = 성)
// 검수 기준(공식 규칙의 지형 합계): 밀밭 26칸(왕관 5) · 숲 22(6) · 호수 18(6) · 초원 14(1×2, 2×2) · 늪 10(1×2, 2×2) · 광산 6(0·1·2·2·2·3)
const TILES = [null,
  [1, 0, 1, 0], [1, 0, 1, 0], [2, 0, 2, 0], [2, 0, 2, 0], [2, 0, 2, 0], [2, 0, 2, 0],
  [3, 0, 3, 0], [3, 0, 3, 0], [3, 0, 3, 0], [4, 0, 4, 0], [4, 0, 4, 0], [5, 0, 5, 0],
  [1, 0, 2, 0], [1, 0, 3, 0], [1, 0, 4, 0], [1, 0, 5, 0], [2, 0, 3, 0], [2, 0, 4, 0],
  [1, 1, 2, 0], [1, 1, 3, 0], [1, 1, 4, 0], [1, 1, 5, 0], [1, 1, 6, 0],
  [2, 1, 1, 0], [2, 1, 1, 0], [2, 1, 1, 0], [2, 1, 1, 0], [2, 1, 3, 0], [2, 1, 4, 0],
  [3, 1, 1, 0], [3, 1, 1, 0], [3, 1, 2, 0], [3, 1, 2, 0], [3, 1, 2, 0], [3, 1, 2, 0],
  [1, 0, 4, 1], [3, 0, 4, 1], [1, 0, 5, 1], [4, 0, 5, 1], [6, 1, 1, 0],
  [1, 0, 4, 2], [3, 0, 4, 2], [1, 0, 5, 2], [4, 0, 5, 2], [6, 2, 1, 0],
  [5, 0, 6, 2], [5, 0, 6, 2], [1, 0, 6, 3]];
const TNAME = ['', '밀밭', '숲', '호수', '초원', '늪', '광산'];
const CASTLE = 7;
const DX = [1, 0, -1, 0], DY = [0, 1, 0, -1];
const code = (t, c, v) => t | (c << 3) | (v << 5);      // 칸 하나 = 지형 | 왕관<<3 | 그림 종류<<5
const variantOf = (id, half) => (id + half) % 3;

function mkBoard(size) {
  const W = 2 * size - 1, c = size - 1, g = new Array(W * W).fill(0);
  g[c * W + c] = CASTLE;
  return { g, x0: c, x1: c, y0: c, y1: c, n: 0, disc: 0 };
}
const cloneBoard = b => ({ g: b.g.slice(), x0: b.x0, x1: b.x1, y0: b.y0, y1: b.y1, n: b.n, disc: b.disc });

function touches(g, W, x, y, t, ex, ey) {
  for (let d = 0; d < 4; d++) {
    const nx = x + DX[d], ny = y + DY[d];
    if (nx < 0 || ny < 0 || nx >= W || ny >= W || (nx === ex && ny === ey)) continue;
    const k = g[ny * W + nx];
    if (k && ((k & 7) === CASTLE || (k & 7) === t)) return true;
  }
  return false;
}

// 한 타일을 놓을 수 있는 모든 자리. {t:'place', x, y, d}: A쪽 칸이 (x,y), B쪽 칸이 d 방향(0 오른쪽·1 아래·2 왼쪽·3 위).
function placements(b, size, id) {
  const [ta, ca, tb, cb] = TILES[id], W = 2 * size - 1, g = b.g, out = [];
  const sym = ta === tb && ca === cb;
  const fx0 = Math.max(0, b.x1 - size + 1), fx1 = Math.min(W - 1, b.x0 + size - 1);
  const fy0 = Math.max(0, b.y1 - size + 1), fy1 = Math.min(W - 1, b.y0 + size - 1);
  for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
    if (g[y * W + x]) continue;
    for (let d = 0; d < (sym ? 2 : 4); d++) {
      const x2 = x + DX[d], y2 = y + DY[d];
      if (x2 < fx0 || x2 > fx1 || y2 < fy0 || y2 > fy1 || g[y2 * W + x2]) continue;
      if (touches(g, W, x, y, ta, x2, y2) || touches(g, W, x2, y2, tb, x, y)) out.push({ t: 'place', x, y, d });
    }
  }
  return out;
}

function applyPlace(b, size, id, m) {
  const [ta, ca, tb, cb] = TILES[id], W = 2 * size - 1, x2 = m.x + DX[m.d], y2 = m.y + DY[m.d];
  b.g[m.y * W + m.x] = code(ta, ca, variantOf(id, 0));
  b.g[y2 * W + x2] = code(tb, cb, variantOf(id, 1));
  b.x0 = Math.min(b.x0, m.x, x2); b.x1 = Math.max(b.x1, m.x, x2);
  b.y0 = Math.min(b.y0, m.y, y2); b.y1 = Math.max(b.y1, m.y, y2);
  b.n += 2;
}

// 정확한 점수 계산 (게임 결과·화면 표시용)
function scoreBoard(b, size, opts) {
  const W = 2 * size - 1, g = b.g, seen = new Uint8Array(W * W), terrs = [];
  let base = 0, maxTerr = 0, crowns = 0;
  for (let i = 0; i < g.length; i++) {
    const k = g[i]; if (!k || seen[i] || (k & 7) === CASTLE) continue;
    const t = k & 7, st = [i], cells = []; seen[i] = 1; let c = 0;
    while (st.length) {
      const j = st.pop(); cells.push(j); c += (g[j] >> 3) & 3;
      const x = j % W, y = (j - x) / W;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d]; if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
        const q = ny * W + nx; if (!seen[q] && g[q] && (g[q] & 7) === t) { seen[q] = 1; st.push(q); }
      }
    }
    terrs.push({ t, size: cells.length, crowns: c, pts: cells.length * c, cells });
    base += cells.length * c; crowns += c; if (cells.length > maxTerr) maxTerr = cells.length;
  }
  terrs.sort((a, b2) => b2.pts - a.pts || b2.size - a.size);
  const c0 = size - 1, half = (size - 1) / 2;
  const centered = c0 - b.x0 <= half && b.x1 - c0 <= half && c0 - b.y0 <= half && b.y1 - c0 <= half;
  const complete = b.n === size * size - 1 && b.disc === 0;
  const mk = opts && opts.mk && centered ? 10 : 0, harmony = opts && opts.harmony && complete ? 5 : 0;
  return { total: base + mk + harmony, base, mk, harmony, terrs, maxTerr, crowns, centered, complete };
}

// ---------- 봇: 판 평가 ----------
// 평가 = 지금 점수 + 앞으로 기대되는 점수(왕관 있는 땅이 더 커질 여지, 왕관을 기다리는 큰 땅) − 메울 수 없는 구멍 + 변형 규칙 보너스.
// 남은 타일(아직 안 나온 타일)의 지형·왕관 수를 세어서 기대값을 구한다. 이미 다 나온 왕관은 기다리지 않는다.
const DEF = { hole: 2.6, grow: 1.3, growCap: 0.6, fit: 0, odd: 0, ord: 0.9, look: 0.9, disc: 3, specK: 0.55, flex: 0, mc: 0, mcW: 0.7, mcPick: 0, K: 0 };   // fit·odd·mcPick은 실험 결과 효과가 없어 꺼 둠
const VIS = new Int32Array(200), MRK = new Int32Array(200), STK = new Int32Array(200), SPEC = new Float64Array(8);
let VSTAMP = 1, MSTAMP = 1;
function evalBoard(b, E) {
  const size = E.size, W = E.W, g = b.g;
  const fx0 = Math.max(0, b.x1 - size + 1), fx1 = Math.min(W - 1, b.x0 + size - 1);
  const fy0 = Math.max(0, b.y1 - size + 1), fy1 = Math.min(W - 1, b.y0 + size - 1);
  const left = size * size - 1 - b.n - 2 * b.disc;        // 앞으로 내가 채울 칸 수
  const vs = ++VSTAMP, P = E.P;
  let score = 0, pot = 0;
  SPEC.fill(0);
  for (let y = b.y0; y <= b.y1; y++) for (let x = b.x0; x <= b.x1; x++) {
    const i = y * W + x, k = g[i];
    if (!k || VIS[i] === vs) continue;
    const t = k & 7; if (t === CASTLE) continue;
    const ms = ++MSTAMP; let sp = 0, z = 0, c = 0, o = 0;
    STK[sp++] = i; VIS[i] = vs;
    while (sp) {
      const j = STK[--sp]; z++; c += (g[j] >> 3) & 3;
      const jx = j % W, jy = (j - jx) / W;
      for (let d = 0; d < 4; d++) {
        const nx = jx + DX[d], ny = jy + DY[d];
        if (nx < fx0 || nx > fx1 || ny < fy0 || ny > fy1) continue;
        const q = ny * W + nx, kq = g[q];
        if (!kq) { if (MRK[q] !== ms) { MRK[q] = ms; o++; } }
        else if ((kq & 7) === t && VIS[q] !== vs) { VIS[q] = vs; STK[sp++] = q; }
      }
    }
    score += z * c;
    if (o && left) {
      const grow = Math.min(o * P.grow, E.rs[t], left * P.growCap);
      pot += c * grow * E.wPot;
      const sv = z + grow * 0.5; if (sv > SPEC[t]) SPEC[t] = sv;
    }
  }
  let pen = 0, holes = 0, mask = 0;
  if (left) {
    for (let t = 1; t <= 6; t++) if (SPEC[t]) pot += E.rc[t] * SPEC[t] * E.wSpec;
    // 메울 수 없는 구멍: 빈 칸인데 옆에 빈 칸이 하나도 없으면 도미노(2칸)가 들어갈 수 없다 → 나중에 타일 하나를 버리게 된다
    for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
      if (g[y * W + x]) continue;
      let e = 0;
      for (let d = 0; d < 4; d++) {
        const nx = x + DX[d], ny = y + DY[d];
        if (nx < fx0 || nx > fx1 || ny < fy0 || ny > fy1) continue;
        if (!g[ny * W + nx]) { e = 1; break; }
      }
      if (!e) { holes++; continue; }
      if (P.fit) {
        for (let d = 0; d < 4; d++) {
          const nx = x + DX[d], ny = y + DY[d];
          if (nx < 0 || ny < 0 || nx >= W || ny >= W) continue;
          const kq = g[ny * W + nx]; if (kq) mask |= (kq & 7) === CASTLE ? 63 : 1 << ((kq & 7) - 1);
        }
      }
    }
    pen = holes * P.hole;
    if (P.fit) pen += (left / 2) * (1 - E.fit[mask]) * P.fit;
    if (P.odd && b.x1 - b.x0 + 1 === size && b.y1 - b.y0 + 1 === size) {
      // 틀이 확정된 뒤: 빈 칸 덩어리의 칸 수가 홀수면 한 칸은 반드시 남는다
      const es = ++VSTAMP; let odd = 0;
      for (let y = fy0; y <= fy1; y++) for (let x = fx0; x <= fx1; x++) {
        const i = y * W + x; if (g[i] || VIS[i] === es) continue;
        let sp = 0, z = 0; STK[sp++] = i; VIS[i] = es;
        while (sp) {
          const j = STK[--sp]; z++; const jx = j % W, jy = (j - jx) / W;
          for (let d = 0; d < 4; d++) { const nx = jx + DX[d], ny = jy + DY[d]; if (nx < fx0 || nx > fx1 || ny < fy0 || ny > fy1) continue; const q = ny * W + nx; if (!g[q] && VIS[q] !== es) { VIS[q] = es; STK[sp++] = q; } }
        }
        if (z > 1 && (z & 1)) odd++;
      }
      pen += odd * P.odd;
    }
  }
  let bonus = 0;
  if (E.opts.harmony) bonus += left ? (b.disc === 0 && holes === 0 ? 3.5 : 0) : (b.n === size * size - 1 && b.disc === 0 ? 5 : 0);
  if (E.opts.mk) {
    const c0 = size - 1, half = (size - 1) / 2;
    if (c0 - b.x0 <= half && b.x1 - c0 <= half && c0 - b.y0 <= half && b.y1 - c0 <= half) bonus += 10;
  }
  return score + pot - pen + bonus;
}

function tryEval(b, id, m, E) {
  const [ta, ca, tb, cb] = TILES[id], W = E.W, g = b.g;
  const x2 = m.x + DX[m.d], y2 = m.y + DY[m.d], i1 = m.y * W + m.x, i2 = y2 * W + x2;
  const ox0 = b.x0, ox1 = b.x1, oy0 = b.y0, oy1 = b.y1;
  g[i1] = code(ta, ca, 0); g[i2] = code(tb, cb, 0);
  b.x0 = Math.min(ox0, m.x, x2); b.x1 = Math.max(ox1, m.x, x2); b.y0 = Math.min(oy0, m.y, y2); b.y1 = Math.max(oy1, m.y, y2); b.n += 2;
  const v = evalBoard(b, E);
  g[i1] = 0; g[i2] = 0; b.x0 = ox0; b.x1 = ox1; b.y0 = oy0; b.y1 = oy1; b.n -= 2;
  return v;
}
function bestPlace(b, id, E) {
  const ms = placements(b, E.size, id);
  let best = null, bv = -1e9;
  for (const m of ms) { const v = tryEval(b, id, m, E); if (v > bv) { bv = v; best = m; } }
  return best ? { m: best, v: bv } : null;
}
// 이 타일을 가져오면 내 판 평가가 얼마나 오르나 (놓을 곳이 없으면 버려야 하므로 손해)
function gainOf(b, id, E, base) {
  const r = bestPlace(b, id, E);
  if (r) return r.v - base;
  b.disc++; const v = evalBoard(b, E); b.disc--;
  return v - base - E.P.disc;
}
// 이미 내 것으로 정해진 타일들을 순서대로 가장 좋은 자리에 놓아 본 판 (앞을 내다볼 때 사용)
function settle(b, ids, E) {
  if (!ids.length) return b;
  const bb = cloneBoard(b);
  for (const id of ids) { const r = bestPlace(bb, id, E); if (r) applyPlace(bb, E.size, id, r.m); else bb.disc++; }
  return bb;
}

// 가상 진행(몬테카를로): 아직 안 나온 타일을 무작위로 뽑아 끝까지 놓아 보고 최종 점수를 본다.
// 매 라운드 2장 중 더 나은 쪽을 고른다고 가정(고를 수 있다는 점을 흉내). pool은 미리 섞어 둔 타일 번호 배열.
function rollout(b0, E, pool) {
  const b = cloneBoard(b0), size = E.size;
  let left = size * size - 1 - b.n - 2 * b.disc, k = 0;
  while (left > 0 && k < pool.length) {
    const a = pool[k++], c = k < pool.length ? pool[k++] : 0;
    const base = evalBoard(b, E), ra = bestPlace(b, a, E), rc = c ? bestPlace(b, c, E) : null;
    const pick = rc && (!ra || rc.v > ra.v) ? [c, rc] : [a, ra];
    if (pick[1]) applyPlace(b, size, pick[0], pick[1].m); else b.disc++;
    left -= 2;
  }
  return scoreBoard(b, size, E.opts).total;
}
function makePools(s, E, rng, R) {
  const seen = new Uint8Array(49); for (const id of s.seen) seen[id] = 1;
  const un = []; for (let id = 1; id <= 48; id++) if (!seen[id]) un.push(id);
  return Array.from({ length: R }, () => rng.shuffle(un));
}

function makeEnv(s, traits) {
  const seen = new Uint8Array(49); for (const id of s.seen) seen[id] = 1;
  const sq = [0, 0, 0, 0, 0, 0, 0], cr = [0, 0, 0, 0, 0, 0, 0];
  let unseen = 0;
  for (let id = 1; id <= 48; id++) if (!seen[id]) { const [ta, ca, tb, cb] = TILES[id]; sq[ta]++; sq[tb]++; cr[ta] += ca; cr[tb] += cb; unseen++; }
  const scale = unseen ? s.deck.length / unseen : 0;      // 2인 5×5는 24장이 빠져 있다(무엇이 빠졌는지는 모름 → 기대값만)
  const share = (s.n === 2 ? 2 : 1) / 4;
  const sk = traits.skill, late = 1 - s.deck.length / (s.rounds * 4);
  // 실력에 따라 가상 진행 횟수가 달라진다 (실력 8 이상 8회 · 6~7은 5회 · 4~5는 3회 · 그 아래는 눈앞의 판만 봄)
  const P = { ...DEF, mc: sk >= 8 ? 8 : sk >= 6 ? 5 : sk >= 4 ? 3 : 0, ...(traits._p || {}) };
  // 남은 타일 중 '이 지형들 중 하나라도 가진 타일'의 비율 (지형 묶음 64가지) → 앞으로 타일을 못 놓을 위험 계산용
  const fit = new Float64Array(64);
  if (P.fit && unseen) for (let m = 1; m < 64; m++) { let c = 0; for (let id = 1; id <= 48; id++) if (!seen[id] && ((m >> (TILES[id][0] - 1)) & 1 || (m >> (TILES[id][2] - 1)) & 1)) c++; fit[m] = c / unseen; }
  return { P, fit,
    size: s.size, W: 2 * s.size - 1, opts: s.opts, late,
    rs: sq.map(v => v * scale * share * 0.9), rc: cr.map(v => v * scale * share * P.specK),
    wPot: 0.55 + 0.045 * sk, wSpec: (0.5 + 0.06 * traits.risk) * (0.6 + 0.04 * traits.patience)
  };
}
const noiseOf = (traits, rng) => (rng.next() - 0.5) * 2 * Math.max(0, 10 - traits.skill) * 0.45;

function seatNow(s) { return s.init ? s.init[s.step] : s.prev[s.step].seat; }
function freeIdx(s) { const r = []; s.line.forEach((e, i) => { if (e.seat < 0) r.push(i); }); return r; }
function drawLine(s) {
  const ids = s.deck.splice(0, 4).sort((a, b) => a - b);
  s.line = ids.map(id => ({ id, seat: -1 }));
  for (const id of ids) s.seen.push(id);
}
function quickScores(s) { return s.boards.map(b => scoreBoard(b, s.size, s.opts).total); }

function choosePlace(s, seat, traits, rng) {
  const id = s.prev[s.step].id, b = s.boards[seat];
  const moves = placements(b, s.size, id);
  if (!moves.length) return { move: { t: 'discard' }, reason: 'discard' };
  if (moves.length === 1) return { move: moves[0], reason: 'forced' };
  const E = makeEnv(s, traits), sk = traits.skill;
  const scored = moves.map(m => ({ m, v: tryEval(b, id, m, E) + noiseOf(traits, rng) })).sort((a, c) => c.v - a.v);
  const K = E.P.K || (sk >= 8 ? 5 : sk >= 6 ? 3 : sk >= 4 ? 2 : 1);
  if (K === 1) return { move: scored[0].m, reason: 'normal' };
  // 앞을 내다보기: 이미 내 것인 타일(2인전의 두 번째 왕)과, 바로 이어서 고를 다음 줄 타일까지 놓아 본다
  const mine = s.prev.slice(s.step + 1).filter(e => e.seat === seat).map(e => e.id).concat(s.line ? s.line.filter(e => e.seat === seat).map(e => e.id) : []);
  const choice = s.line ? s.line.filter(e => e.seat < 0).map(e => e.id) : [];
  if (!mine.length && !choice.length) return { move: scored[0].m, reason: 'normal' };
  let best = scored[0], bv = -1e9;
  const pools = E.P.mc ? makePools(s, E, rng, E.P.mc) : null;
  for (const c of scored.slice(0, K)) {
    const b2 = cloneBoard(b); applyPlace(b2, s.size, id, c.m);
    const b3 = settle(b2, mine, E), base = evalBoard(b3, E);
    let look = base, bj = 0;
    if (choice.length) { let g = -1e9; for (const j of choice) { const gj = gainOf(b3, j, E, base); if (gj > g) { g = gj; bj = j; } } look += g * E.P.look; }
    if (pools) {
      const b4 = bj ? settle(b3, [bj], E) : b3; let sum = 0;
      for (const pl of pools) sum += rollout(b4, E, pl);
      look = look * (1 - E.P.mcW) + (sum / pools.length) * E.P.mcW;
    }
    const v = look + (c.v - tryEval(b, id, c.m, E)) * 0.5;     // 판단 흔들림은 절반만 유지
    if (v > bv) { bv = v; best = c; }
  }
  return { move: best.m, reason: 'normal' };
}

function choosePick(s, seat, traits, rng, info) {
  const free = freeIdx(s);
  if (free.length === 1) return { move: { t: 'pick', i: free[0] }, reason: 'forced' };
  const E = makeEnv(s, traits), sk = traits.skill, n = s.n;
  const pendingOf = who => (s.init ? [] : s.prev.slice(s.step + 1).filter(e => e.seat === who).map(e => e.id)).concat(s.line.filter(e => e.seat === who).map(e => e.id));
  const mb = settle(s.boards[seat], pendingOf(seat), E), base = evalBoard(mb, E);
  const hasNext = s.deck.length > 0;
  const wOrd = hasNext ? E.P.ord + 0.05 * traits.patience : 0;
  let own = free.map(i => gainOf(mb, s.line[i].id, E, base));
  if (E.P.mcPick) {
    // 각 타일을 가져왔다고 치고 끝까지 가상 진행 → 최종 점수 기대값의 차이로 타일 가치를 다시 잰다
    const pools = makePools(s, E, rng, E.P.mcPick);
    const fin = free.map(i => { const bj = settle(mb, [s.line[i].id], E); let sum = 0; for (const pl of pools) sum += rollout(bj, E, pl); return sum / pools.length; });
    const mf = fin.reduce((a, c) => a + c, 0) / fin.length, mo = own.reduce((a, c) => a + c, 0) / own.length;
    own = own.map((v, k) => (v - mo) * (1 - E.P.mcW) + (fin[k] - mf) * E.P.mcW);
  }
  // 견제: 내 뒤에 고를 상대가 이 타일로 얼마나 크게 이득을 보는지(그 상대의 차선책 대비) 계산
  const den = free.map(() => 0);
  if (sk >= 5 && traits.aggression > 0) {
    const allies = (info && info.allySeats) || [], rivals = (info && info.rivalSeats) || [];
    const later = [...new Set(s.init ? s.init.slice(s.step + 1) : s.prev.slice(s.step + 1).map(e => e.seat))].filter(o => o !== seat && !allies.includes(o));
    if (later.length) {
      const sc = quickScores(s);
      let leader = -1; sc.forEach((v, o) => { if (o !== seat && (leader < 0 || v > sc[leader])) leader = o; });
      const tm = traits.targetMode;
      const target = tm === 'human' ? s.humanSeat : tm === 'leader' ? leader : tm === 'rival' ? (rivals.length ? rivals[0] : -1) : tm === 'random' ? (seat + 1 + (s.seen[0] % (n - 1))) % n : -1;
      const A = n === 2 ? 0.3 + 0.07 * traits.aggression : (0.15 + 0.085 * traits.aggression) * 0.55;
      for (const o of later) {
        const ob = settle(s.boards[o], pendingOf(o), E), obase = evalBoard(ob, E);
        const g = free.map(i => gainOf(ob, s.line[i].id, E, obase));
        let t1 = -1e9, t2 = -1e9; for (const v of g) { if (v > t1) { t2 = t1; t1 = v; } else if (v > t2) t2 = v; }
        const w = (n === 2 ? 1 : o === target ? 1 : 0.35) * (o === leader ? 1 + 0.5 * E.late : 1);
        g.forEach((v, k) => { if (v === t1 && t1 - t2 > 0) den[k] = Math.max(den[k], (t1 - t2) * w * A); });
      }
    }
  }
  let bi = 0, bv = -1e9, pi = 0, pv = -1e9;
  free.forEach((i, k) => {
    const plain = own[k] + wOrd * (3 - i) + noiseOf(traits, rng), v = plain + den[k];
    if (v > bv) { bv = v; bi = k; }
    if (plain > pv) { pv = plain; pi = k; }
  });
  const topOwn = Math.max(...own);
  const reason = bi !== pi ? 'block' : (bi === 0 && own[bi] < topOwn - 0.5) ? 'order' : 'normal';
  return { move: { t: 'pick', i: free[bi] }, reason };
}

const game = {
  meta: { id: 'kingdomino', name: '킹도미노', version: '1.1.0', players: { min: 2, max: 4 }, minutes: 15, campaign: null },
  _t: { TILES, TNAME, placements, applyPlace, scoreBoard, evalBoard, makeEnv, mkBoard, cloneBoard, code, bestPlace },

  // options: { duel(2인 7×7 대결전, 기본 켬) · mk(중앙 왕국 +10) · harmony(조화 +5) }
  newGame({ players, options, rng }) {
    const n = players.length, o = options || {};
    const duel = n === 2 && o.duel !== false, size = duel ? 7 : 5;
    let deck = rng.shuffle(Array.from({ length: 48 }, (_, i) => i + 1));
    if (n === 2 && !duel) deck = deck.slice(0, 24);
    const first = rng.int(2);
    const s = {
      v: 1, n, size, opts: { duel, mk: !!o.mk, harmony: !!o.harmony }, humanSeat: players.findIndex(p => p.human),
      deck, prev: null, line: null, step: 0, phase: 'pick',
      init: n === 2 ? [first, 1 - first, 1 - first, first] : rng.shuffle(players.map((_, i) => i)),
      boards: players.map(() => mkBoard(size)), seen: [], round: 1, rounds: deck.length / 4, over: false, last: null
    };
    drawLine(s);
    return s;
  },
  currentSeat: s => seatNow(s),
  isOver: s => s.over,
  legalMoves(s) {
    if (s.over) return [];
    if (s.phase === 'pick') return freeIdx(s).map(i => ({ t: 'pick', i }));
    const ms = placements(s.boards[seatNow(s)], s.size, s.prev[s.step].id);
    return ms.length ? ms : [{ t: 'discard' }];              // 놓을 수 있으면 반드시 놓아야 한다
  },
  applyMove(s, m) {
    if (s.over) throw new Error('끝난 게임');
    const seat = seatNow(s);
    if (s.phase === 'pick') {
      const e = m && m.t === 'pick' ? s.line[m.i] : null;
      if (!e || e.seat >= 0) throw new Error('고를 수 없는 타일');
      e.seat = seat; s.last = { seat, kind: 'pick', id: e.id };
      s.step++;
      if (s.step >= (s.init ? s.init.length : s.prev.length)) {
        s.prev = s.line.filter(x => x.seat >= 0); s.init = null; s.step = 0; s.phase = 'place';   // 3인: 아무도 안 고른 타일은 버려진다
        if (s.deck.length) { drawLine(s); s.round++; } else s.line = null;
      } else if (!s.init) s.phase = 'place';
      return;
    }
    const e = s.prev[s.step], b = s.boards[seat];
    const legal = placements(b, s.size, e.id);
    if (m.t === 'discard') { if (legal.length) throw new Error('놓을 수 있는 타일은 버릴 수 없음'); b.disc++; s.last = { seat, kind: 'discard', id: e.id }; }
    else {
      if (!legal.some(q => q.x === m.x && q.y === m.y && q.d === m.d)) throw new Error('놓을 수 없는 자리');
      applyPlace(b, s.size, e.id, m);
      const W = 2 * s.size - 1;
      s.last = { seat, kind: 'place', id: e.id, cells: [m.y * W + m.x, (m.y + DY[m.d]) * W + m.x + DX[m.d]] };
    }
    if (s.line) s.phase = 'pick';
    else if (++s.step >= s.prev.length) s.over = true;
  },
  botChoose(s, traits, rng, info) {
    const seat = (info && info.seat != null) ? info.seat : seatNow(s);
    return s.phase === 'pick' ? choosePick(s, seat, traits, rng, info) : choosePlace(s, seat, traits, rng);
  },
  // 동점이면 가장 큰 땅 → 왕관 수 순서, 그래도 같으면 공동 순위
  result(s) {
    const rows = s.boards.map((b, seat) => ({ seat, d: scoreBoard(b, s.size, s.opts) }))
      .sort((a, b) => b.d.total - a.d.total || b.d.maxTerr - a.d.maxTerr || b.d.crowns - a.d.crowns || a.seat - b.seat);
    let rank = 0;
    const ranking = rows.map((r, i) => {
      const p = rows[i - 1];
      if (!p || p.d.total !== r.d.total || p.d.maxTerr !== r.d.maxTerr || p.d.crowns !== r.d.crowns) rank = i + 1;
      return { seat: r.seat, rank, score: r.d.total };
    });
    return { ranking, summary: `최고 ${rows[0].d.total}점` };
  },

  // ---------- 화면: "왕국 지도" 테마 ----------
  mount(container, ctx) {
    const self = this, rng = ctx.rng, th = ctx.theme || {};
    const n = ctx.players.length, timers = new Set(), speech = {};
    let s = null, dead = false, finished = false, humanSeat = -1;
    let ui = { cell: -1, opts: [], k: 0, pick: -1 };
    let saved = {};
    try { saved = JSON.parse(localStorage.getItem('kd-options') || '{}') || {}; } catch { saved = {}; }
    const opt = { duel: saved.duel !== false, mk: !!saved.mk, harmony: !!saved.harmony };

    container.innerHTML = `<style>${CSS}</style>
      <div class="g-kd" style="--acc:${th.accent || '#e3b341'};--tb:${th.table || '#2f5d7c'};--tb2:${th.table2 || '#1a3447'}">
        ${DEFS}
        <div class="kd-setup"></div>
        <div class="kd-game" hidden>
          <div class="kd-top"><span class="kd-round"></span><span class="kd-badges"></span></div>
          <div class="kd-opps"></div>
          <div class="kd-draft">
            <div class="kd-lbl kd-lbl1"></div><div class="kd-line kd-prev"></div>
            <div class="kd-lbl kd-lbl2"></div><div class="kd-line kd-next"></div>
          </div>
          <div class="kd-mine">
            <div class="kd-mhead"><span class="kd-mname">내 왕국</span><span class="kd-mscore"></span><button class="kd-sbtn" data-a="detail">점수 내역</button></div>
            <div class="kd-board"></div>
          </div>
          <div class="kd-dock"></div>
          <details class="kd-fold kd-logbox"><summary>진행 기록</summary><div class="kd-log"></div></details>
          <details class="kd-fold"><summary>규칙 보기</summary><ul class="kd-rules">
            <li>내 차례에는 <b>①고른 타일을 왕국에 놓고 → ②다음 줄에서 타일 하나를 고릅니다.</b></li>
            <li>타일은 <b>성 옆</b>(성은 모든 지형과 이어짐)이나, <b>같은 지형이 한 칸 이상 맞닿게</b> 놓습니다.</li>
            <li>왕국은 <b class="kd-sz"></b> 크기를 넘을 수 없습니다. 놓을 곳이 없는 타일은 버립니다(놓을 수 있으면 꼭 놓아야 해요).</li>
            <li><b>번호가 낮은 타일</b>을 고른 사람이 다음 라운드에 <b>먼저</b> 놓고 고릅니다. 번호가 높을수록 좋은 타일이지만 순서가 밀려요.</li>
            <li>점수 = 같은 지형으로 이어진 땅마다 <b>칸 수 × 왕관 수</b>. 왕관이 없는 땅은 0점입니다.</li>
            <li>동점이면 가장 큰 땅 → 왕관 수 순서로 가립니다.</li>
            <li class="kd-vr"></li>
          </ul></details>
        </div>
        <div class="kd-ov" hidden></div>
      </div>`;
    const q = sel => container.querySelector(sel);
    const root = q('.g-kd'), setupBox = q('.kd-setup'), gameBox = q('.kd-game'), ov = q('.kd-ov');
    const oppBox = q('.kd-opps'), prevBox = q('.kd-prev'), nextBox = q('.kd-next'), boardBox = q('.kd-board'), dock = q('.kd-dock'), logBox = q('.kd-log');
    const el = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };
    // 공통 이펙트(아카이브가 ctx.fx로 줌). 없으면 아무것도 안 하는 대역.
    const fx = ctx.fx ? ctx.fx.scope(root) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : k === 'rect' || k === 'union' ? () => null : () => Promise.resolve()) });
    const GOLD = ['#ffd76a', '#fff3c4', '#e3b341'];
    const seatBox = i => (ctx.players[i].human ? q('.kd-mine') : oppBox.querySelector(`.kd-opp[data-seat="${i}"]`));
    const boardOf = i => (ctx.players[i].human ? boardBox : oppBox.querySelector(`.kd-opp[data-seat="${i}"] .kd-mini`));
    // 고르기: 그 사람의 말(아바타)이 타일 위로 '톡'
    function animPick(seat, i, fromR) {
      const t = nextBox.children[i]; if (!t) return;
      const av = (seatBox(seat) && seatBox(seat).querySelector('.kd-av')) || null;
      const node = el('span', 'kd-av'); node.style.cssText = `--pc:${colorOf(seat)};width:30px;height:30px;display:block`; node.append(ctx.avatar(seat, 'css'));
      fx.fly({ from: fromR || av || seatBox(seat), to: t.querySelector('.kd-own') || t, node, size: { w: 30, h: 30 }, dur: 380, arc: 0.4, spin: 0 })
        .then(() => { fx.sfx('pick'); fx.pop(t, 1.12); fx.buzz(8); });
    }
    // 놓기: 지금 줄의 타일이 그 사람 왕국의 놓인 자리로 '탁!' + 점수 튀어오름
    function animPlace(seat, srcR, srcNode, gain, discard) {
      const bd = boardOf(seat); if (!bd) return;
      if (discard) { fx.fly({ from: srcR, to: bd, node: srcNode, size: srcR && { w: srcR.w, h: srcR.h }, dur: 420, spin: 40, scale: 0.4, fade: true }).then(() => { fx.sfx('bad'); fx.shake(seatBox(seat)); fx.float(bd, '버림', { color: '#ff9b8a' }); }); return; }
      const cells = bd.querySelectorAll('.kd-new'), tgt = fx.union(cells) || fx.rect(bd);
      const sc = srcR && tgt ? Math.max(0.25, Math.min(1.2, Math.max(tgt.w, tgt.h) / Math.max(srcR.w, srcR.h))) : 0.5;
      fx.sfx('card');
      fx.fly({ from: srcR, to: tgt, node: srcNode, size: srcR && { w: srcR.w, h: srcR.h }, dur: 430, arc: 0.25, spin: -10, scale: sc }).then(() => {
        fx.sfx('place'); fx.slam(bd); fx.buzz(12);
        fx.float(tgt, `${gain >= 0 ? '+' : ''}${gain}`, { color: gain >= 8 ? '#ffd76a' : gain > 0 ? '#bfe9b5' : '#d9d9d9', size: gain >= 8 ? 26 : 19 });
        if (gain >= 8) { fx.burst(tgt, { color: GOLD, n: 14 }); fx.sfx('gain'); }
      });
    }
    // 새 줄이 깔릴 때: 타일이 한 장씩 뒤집혀 '파라락'
    function animDeal() { [...nextBox.children].forEach((t, k) => { t.style.opacity = fx.on ? '0' : ''; later(() => { t.style.opacity = ''; fx.flip(t); fx.sfx('flip'); }, 120 + k * 110); }); }
    const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
    const nameOf = seat => (ctx.players[seat].human ? '나' : ctx.players[seat].name.split(' ').pop());
    const colorOf = seat => ctx.players[seat].color || '#888';

    function log(text, cls) {
      logBox.append(el('div', cls || '', text));
      while (logBox.childNodes.length > 80) logBox.removeChild(logBox.firstChild);
      logBox.scrollTop = logBox.scrollHeight;
    }
    function say(seat, key) {
      if (ctx.players[seat].human || speech[seat]) return;
      const t = ctx.say(seat, key); if (!t) return;
      speech[seat] = { t, fresh: true };
      log(`「${nameOf(seat)}」 ${t}`, 'sp');
      drawOpps();
      later(() => { delete speech[seat]; drawOpps(); }, ctx.readMs(t));
    }

    // ----- 시작 전: 규칙 선택 -----
    function drawSetup() {
      const tog = (key, title, desc) => `<button class="kd-opt${opt[key] ? ' on' : ''}" data-o="${key}"><i></i><span><b>${title}</b><small>${desc}</small></span></button>`;
      setupBox.innerHTML = `<div class="kd-crest"><svg viewBox="-3 -2 24 19">${crownPath(0, 0, 1)}</svg></div>
        <h3>킹도미노</h3><p class="kd-sub">${n}인 · ${n === 2 ? '왕 2개씩' : n === 3 ? '매 라운드 타일 1장은 버려짐' : '타일 48장 전부 사용'}</p>
        ${n === 2 ? `<div class="kd-seg"><button class="${opt.duel ? 'on' : ''}" data-d="1"><b>7×7 대결전</b><small>타일 48장 · 12라운드</small></button><button class="${opt.duel ? '' : 'on'}" data-d="0"><b>5×5 기본</b><small>타일 24장 · 6라운드</small></button></div>` : ''}
        <div class="kd-optl">변형 규칙 (선택)</div>
        ${tog('mk', '중앙 왕국 +10점', '성이 왕국 한가운데에 있으면 보너스')}
        ${tog('harmony', '조화 +5점', '타일을 하나도 버리지 않고 왕국을 꽉 채우면 보너스')}
        <button class="kd-go kd-start">왕국 건설 시작</button>`;
    }
    setupBox.onclick = e => {
      const o = e.target.closest('[data-o]'), d = e.target.closest('[data-d]');
      if (o) { opt[o.dataset.o] = !opt[o.dataset.o]; drawSetup(); }
      else if (d) { opt.duel = d.dataset.d === '1'; drawSetup(); }
      else if (e.target.closest('.kd-start')) start();
    };

    function start() {
      try { localStorage.setItem('kd-options', JSON.stringify(opt)); } catch { /* 저장 못 해도 진행 */ }
      s = self.newGame({ players: ctx.players, options: opt, rng });
      humanSeat = s.humanSeat;
      setupBox.hidden = true; gameBox.hidden = false;
      root.classList.toggle('kd-big', s.size === 7);
      q('.kd-sz').textContent = `${s.size}×${s.size}`;
      q('.kd-vr').textContent = '변형 규칙: ' + ([s.opts.mk ? '중앙 왕국(성이 한가운데면 +10)' : '', s.opts.harmony ? '조화(버린 타일 없이 꽉 채우면 +5)' : ''].filter(Boolean).join(' · ') || '없음');
      log(`새 게임! ${s.size}×${s.size} 왕국, 타일 ${s.rounds * 4}장. 첫 줄은 ${s.init.map(nameOf).join(' → ')} 순서로 고릅니다.`);
      draw();
      animDeal();
      ctx.players.forEach((p, i) => { if (!p.human) later(() => say(i, 'start'), ctx.delay(300 + i * 450)); });
      loop(true);
    }

    // ----- 그리기 -----
    const viewOf = (b, play) => {
      const size = s.size, W = 2 * size - 1, c = size - 1;
      if (!play) {                       // 상대 판·결과: 항상 size×size 창
        const half = (size - 1) / 2, cl = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
        return { x0: cl(c - half, b.x1 - size + 1, b.x0), y0: cl(c - half, b.y1 - size + 1, b.y0), cols: size, rows: size };
      }
      const x0 = Math.max(0, b.x1 - size + 1, b.x0 - 2), x1 = Math.min(W - 1, b.x0 + size - 1, b.x1 + 2);
      const y0 = Math.max(0, b.y1 - size + 1, b.y0 - 2), y1 = Math.min(W - 1, b.y0 + size - 1, b.y1 + 2);
      return { x0, y0, cols: x1 - x0 + 1, rows: y1 - y0 + 1 };
    };
    function boardSvg(b, seat, o = {}) {
      const size = s.size, W = 2 * size - 1, g = b.g, v = viewOf(b, o.play);
      const fx0 = b.x1 - size + 1, fx1 = b.x0 + size - 1, fy0 = b.y1 - size + 1, fy1 = b.y0 + size - 1;
      let slots = '', cells = '', edges = '', hl = '', taps = '', ghost = '';
      const ghostAt = {}; if (o.ghost) o.ghost.forEach(c => { ghostAt[c.i] = c.k; });
      for (let r = 0; r < v.rows; r++) for (let cx = 0; cx < v.cols; cx++) {
        const x = v.x0 + cx, y = v.y0 + r, i = y * W + x, k = g[i], px = cx * 100, py = r * 100;
        const feas = x >= fx0 && x <= fx1 && y >= fy0 && y <= fy1;
        if (!k) {
          slots += `<rect x="${px + 4}" y="${py + 4}" width="92" height="92" rx="10" class="${feas ? 'kd-slot' : 'kd-slot off'}"/>`;
          if (o.hl && o.hl.has(i) && ghostAt[i] == null) hl += `<rect x="${px + 9}" y="${py + 9}" width="82" height="82" rx="9" class="kd-hl"/>`;
        } else {
          const t = k & 7;
          cells += t === CASTLE ? `<use href="#kd-castle" x="${px}" y="${py}" width="100" height="100" style="color:${colorOf(seat)}"/>`
            : `<use href="#kd-c${t}${k >> 5}" x="${px}" y="${py}" width="100" height="100"${o.fresh && o.fresh.includes(i) ? ' class="kd-new"' : ''}/>${crownG((k >> 3) & 3, px, py)}`;
          const kr = x + 1 < W ? g[i + 1] : 0, kd = y + 1 < W ? g[i + W] : 0, kl = x > 0 ? g[i - 1] : 0, ku = y > 0 ? g[i - W] : 0;
          if (!kr || (kr & 7) !== t) edges += `M${px + 100} ${py}v100`;
          if (!kd || (kd & 7) !== t) edges += `M${px} ${py + 100}h100`;
          if (!kl) edges += `M${px} ${py}v100`;
          if (!ku) edges += `M${px} ${py}h100`;
        }
        if (ghostAt[i] != null) { const gk = ghostAt[i]; ghost += `<g class="kd-ghost"><use href="#kd-c${gk & 7}${gk >> 5}" x="${px}" y="${py}" width="100" height="100"/>${crownG((gk >> 3) & 3, px, py)}<rect x="${px + 3}" y="${py + 3}" width="94" height="94" rx="6" class="kd-gr"/></g>`; }
        if (o.tap && feas) taps += `<rect x="${px}" y="${py}" width="100" height="100" fill="transparent" data-i="${i}"/>`;
      }
      return `<svg viewBox="-4 -4 ${v.cols * 100 + 8} ${v.rows * 100 + 8}" class="kd-svg" style="max-width:${o.play ? v.cols * Math.min(58, Math.floor(324 / v.rows)) : 9999}px">${slots}${cells}<path d="${edges}" class="kd-edge"/>${hl}${ghost}${taps}</svg>`;
    }
    const tileSvg = id => {
      const [ta, ca, tb, cb] = TILES[id];
      return `<svg viewBox="0 0 200 100"><use href="#kd-c${ta}${variantOf(id, 0)}" width="100" height="100"/><use href="#kd-c${tb}${variantOf(id, 1)}" x="100" width="100" height="100"/>${crownG(ca, 0, 0)}${crownG(cb, 100, 0)}${ta !== tb ? '<path d="M100 3v94" stroke="#1d150855" stroke-width="2.5"/>' : ''}<rect x="2" y="2" width="196" height="96" rx="7" fill="none" stroke="#1d1508" stroke-width="4"/></svg>`;
    };
    const pairSvg = (id, d) => {
      const [ta, ca, tb, cb] = TILES[id], pa = [[0, 0], [0, 0], [100, 0], [0, 100]][d], pb = [[100, 0], [0, 100], [0, 0], [0, 0]][d], hz = d % 2 === 0;
      return `<svg viewBox="0 0 ${hz ? 200 : 100} ${hz ? 100 : 200}" class="${hz ? 'hz' : 'vt'}"><use href="#kd-c${ta}${variantOf(id, 0)}" x="${pa[0]}" y="${pa[1]}" width="100" height="100"/><use href="#kd-c${tb}${variantOf(id, 1)}" x="${pb[0]}" y="${pb[1]}" width="100" height="100"/>${crownG(ca, pa[0], pa[1])}${crownG(cb, pb[0], pb[1])}<rect x="2" y="2" width="${hz ? 196 : 96}" height="${hz ? 96 : 196}" rx="7" fill="none" stroke="#1d1508" stroke-width="4"/></svg>`;
    };

    function tileEl(e, i, kind) {
      const d = el('div', 'kd-tile');
      d.innerHTML = tileSvg(e.id);
      d.append(el('span', 'kd-num', String(e.id)));
      if (e.seat >= 0) {
        const o = el('span', 'kd-own'); o.style.setProperty('--pc', colorOf(e.seat)); o.append(ctx.avatar(e.seat, 'css')); d.append(o);
        if (e.seat === humanSeat) d.classList.add('mine');
      }
      if (kind === 'next') {
        d.dataset.i = i;
        if (e.seat < 0) d.classList.add('free');
        if (ui.pick === i) d.classList.add('sel');
      } else {
        const done = i < s.step || (i === s.step && s.phase === 'pick');
        if (done) d.classList.add('done');
        else if (i === s.step) d.classList.add('now');
      }
      return d;
    }
    function drawOpps() {
      if (!s) return;
      const sc = quickScores(s);
      const turn = s.over ? -1 : seatNow(s);
      oppBox.className = 'kd-opps n' + (n - 1);
      oppBox.replaceChildren(...ctx.players.filter(p => !p.human).map(p => {
        const i = p.seat, card = el('div', 'kd-opp' + (turn === i ? ' turn' : ''));
        card.dataset.seat = i;
        const head = el('div', 'kd-oh'), av = el('span', 'kd-av'); av.style.setProperty('--pc', colorOf(i)); av.append(ctx.avatar(i, 'css'));
        const info = el('div', 'kd-oi'); info.append(el('b', '', nameOf(i)), el('span', '', `${sc[i]}점`));
        head.append(av, info);
        const mb = el('div', 'kd-mini'); mb.innerHTML = boardSvg(s.boards[i], i, { fresh: s.last && s.last.seat === i && s.last.kind === 'place' ? s.last.cells : null });
        card.append(head, mb);
        const sp = speech[i];
        if (sp) { const bub = el('div', 'kd-say' + (sp.fresh ? ' pop' : ''), sp.t); sp.fresh = false; bub.onclick = ev => { ev.stopPropagation(); delete speech[i]; drawOpps(); }; card.append(bub); }
        return card;
      }));
    }
    function myLegal() { return s.phase === 'place' && !s.over && seatNow(s) === humanSeat ? placements(s.boards[humanSeat], s.size, s.prev[s.step].id) : []; }
    const cellsOf = m => { const W = 2 * s.size - 1; return [m.y * W + m.x, (m.y + DY[m.d]) * W + m.x + DX[m.d]]; };

    function draw() {
      if (!s) return;
      const turn = s.over ? -1 : seatNow(s), mine = turn === humanSeat, b = s.boards[humanSeat];
      const now = scoreBoard(b, s.size, s.opts);
      q('.kd-round').textContent = s.over ? '게임 종료' : `라운드 ${s.round} / ${s.rounds} · 남은 타일 ${s.deck.length}장`;
      q('.kd-badges').textContent = [s.opts.mk ? '중앙 왕국' : '', s.opts.harmony ? '조화' : ''].filter(Boolean).join(' · ');
      drawOpps();
      // 타일 줄
      q('.kd-lbl1').textContent = s.prev ? '지금 놓는 줄 (왼쪽부터 차례)' : '첫 줄 고르기';
      q('.kd-lbl1').hidden = !s.prev; prevBox.hidden = !s.prev;
      if (s.prev) prevBox.replaceChildren(...s.prev.map((e, i) => tileEl(e, i, 'prev')));
      q('.kd-lbl2').textContent = s.line ? (s.prev ? '다음 줄 · 여기서 고르기' : `첫 줄 · 고르는 순서: ${s.init.map(nameOf).join(' → ')}`) : '마지막 라운드 — 남은 타일을 놓으면 끝나요';
      nextBox.hidden = !s.line;
      if (s.line) nextBox.replaceChildren(...s.line.map((e, i) => tileEl(e, i, 'next')));
      nextBox.classList.toggle('can', mine && s.phase === 'pick');
      // 내 판
      const legal = myLegal(), W = 2 * s.size - 1;
      let hl = null, ghost = null, after = null;
      if (legal.length) {
        hl = new Set(); legal.forEach(m => cellsOf(m).forEach(i => hl.add(i)));
        const m = ui.opts[ui.k];
        if (m) {
          const id = s.prev[s.step].id, [ta, ca, tb, cb] = TILES[id], cs = cellsOf(m);
          ghost = [{ i: cs[0], k: code(ta, ca, variantOf(id, 0)) }, { i: cs[1], k: code(tb, cb, variantOf(id, 1)) }];
          const b2 = cloneBoard(b); applyPlace(b2, s.size, id, m); after = scoreBoard(b2, s.size, s.opts);
        }
      }
      boardBox.innerHTML = boardSvg(b, humanSeat, { play: true, tap: legal.length > 0, hl, ghost, fresh: s.last && s.last.seat === humanSeat && s.last.kind === 'place' ? s.last.cells : null });
      q('.kd-mscore').textContent = `${now.total}점`;
      q('.kd-mine').classList.toggle('turn', mine);
      // 조작 영역
      dock.replaceChildren();
      dock.className = 'kd-dock' + (mine ? ' mine' : '');
      if (s.over) { dock.append(el('div', 'kd-dmsg', '게임이 끝났어요.')); return; }
      if (!mine) { dock.append(el('div', 'kd-dmsg', `${nameOf(turn)} ${s.phase === 'pick' ? '타일 고르는 중…' : '타일 놓는 중…'}`)); return; }
      if (s.phase === 'place') {
        const id = s.prev[s.step].id, m = ui.opts[ui.k];
        const pv = el('div', 'kd-hand'); pv.innerHTML = pairSvg(id, m ? m.d : 0);
        const txt = el('div', 'kd-dtxt');
        if (!legal.length) {
          txt.append(el('b', '', '놓을 수 있는 곳이 없어요'), el('small', '', '이 타일은 버려야 합니다.'));
          const bt = el('button', 'kd-go warn', '타일 버리기'); bt.dataset.a = 'discard';
          dock.append(pv, txt, bt); return;
        }
        if (!m) txt.append(el('b', '', '빛나는 칸을 눌러 놓을 자리를 고르세요'), el('small', '', '같은 칸을 다시 누르면 방향이 바뀝니다.'));
        else {
          const diff = after.total - now.total;
          txt.append(el('b', '', `${diff > 0 ? '+' + diff : diff === 0 ? '+0' : diff}점  →  합계 ${after.total}점`), el('small', '', ui.opts.length > 1 ? `방향 ${ui.k + 1} / ${ui.opts.length} · 회전으로 바꾸기` : '이 칸은 이 방향만 가능'));
        }
        const rot = el('button', 'kd-sbtn kd-rot', '⟳ 회전'); rot.dataset.a = 'rot'; rot.disabled = !m || ui.opts.length < 2;
        const ok = el('button', 'kd-go', '놓기'); ok.dataset.a = 'place'; ok.disabled = !m;
        dock.append(pv, txt, rot, ok);
      } else {
        const txt = el('div', 'kd-dtxt');
        if (ui.pick < 0) { txt.append(el('b', '', '다음 줄에서 가져올 타일을 누르세요'), el('small', '', s.deck.length ? '번호가 낮을수록 다음 라운드에 먼저 합니다.' : '마지막 줄입니다. 순서는 상관없어요.')); dock.append(txt); return; }
        const id = s.line[ui.pick].id, ms = placements(b, s.size, id);
        let best = -1; for (const m of ms) { const b2 = cloneBoard(b); applyPlace(b2, s.size, id, m); best = Math.max(best, scoreBoard(b2, s.size, s.opts).total - now.total); }
        const [ta, , tb] = TILES[id];
        const pv = el('div', 'kd-hand'); pv.innerHTML = pairSvg(id, 0);
        txt.append(el('b', '', `${id}번 · ${ta === tb ? TNAME[ta] : TNAME[ta] + ' + ' + TNAME[tb]}`),
          el('small', ms.length ? '' : 'bad', ms.length ? `지금 왕국 기준 최대 +${best}점 · 다음 순서 ${ui.pick + 1}번째` : '⚠ 지금 왕국에는 놓을 자리가 없어요'));
        const ok = el('button', 'kd-go', '이 타일 선택'); ok.dataset.a = 'pick';
        dock.append(pv, txt, ok);
      }
    }

    // ----- 진행 -----
    function step(seat, move, reason) {
      const before = quickScores(s), wasLeader = before.indexOf(Math.max(...before));
      const phase = s.phase, id = phase === 'pick' ? s.line[move.i].id : s.prev[s.step].id;
      const srcEl = phase === 'place' ? prevBox.children[s.step] : null, srcR = srcEl && fx.rect(srcEl), srcNode = srcEl && srcEl.cloneNode(true);
      if (srcNode) srcNode.classList.remove('now', 'done');
      const roundBefore = s.round;
      self.applyMove(s, move);
      ui = { cell: -1, opts: [], k: 0, pick: -1 };
      const after = quickScores(s), gain = after[seat] - before[seat];
      if (phase === 'pick') {
        log(`${nameOf(seat)}: ${id}번 타일 선택${reason === 'block' ? ' · 상대가 노리던 타일을 가로챔(견제)' : reason === 'order' ? ' · 다음 순서를 위해 낮은 번호' : ''}`);
        if (reason === 'block') say(seat, 'block');
      } else if (move.t === 'discard') {
        log(`${nameOf(seat)}: ${id}번 타일을 놓을 곳이 없어 버림`, 'bad');
        say(seat, 'bad');
      } else {
        log(`${nameOf(seat)}: ${id}번 타일 배치 (${gain >= 0 ? '+' : ''}${gain}점 → ${after[seat]}점)`);
        if (gain >= 8) say(seat, 'good');
        const nl = after.indexOf(Math.max(...after));
        if (nl !== wasLeader && nl === seat && !ctx.players[wasLeader].human && before[wasLeader] > 0) say(wasLeader, 'overtaken');
      }
      draw();
      if (phase === 'pick') animPick(seat, move.i);
      else animPlace(seat, srcR, srcNode, gain, move.t === 'discard');
      if (s.round !== roundBefore && s.line) animDeal();
      if (s.over) return finish();
      loop();
    }
    function loop(first) {
      if (dead || s.over) return;
      const seat = seatNow(s), p = ctx.players[seat];
      if (p.human) return;
      later(() => {
        const ch = self.botChoose(s, p.traits, rng, { seat, rivalSeats: p.rivalSeats, allySeats: p.allySeats });
        step(seat, ch.move, ch.reason);
      }, ctx.delay(first ? 2200 : s.phase === 'pick' ? 750 : 950));
    }

    function kingdomPanel(seat, title) {
      const d = scoreBoard(s.boards[seat], s.size, s.opts), box = el('div', 'kd-kp');
      const hd = el('div', 'kd-kh'); const av = el('span', 'kd-av'); av.style.setProperty('--pc', colorOf(seat)); av.append(ctx.avatar(seat, 'css'));
      hd.append(av, el('b', '', title || `${nameOf(seat)}의 왕국`), el('span', 'kd-kt', `${d.total}점`));
      const bd = el('div', 'kd-kb'); bd.innerHTML = boardSvg(s.boards[seat], seat, {});
      const list = el('div', 'kd-kl');
      d.terrs.filter(t => t.pts > 0).forEach(t => { const r = el('div', 'kd-kr'); r.innerHTML = `<svg viewBox="0 0 100 100"><use href="#kd-c${t.t}0" width="100" height="100"/></svg><span>${TNAME[t.t]} ${t.size}칸 × 왕관 ${t.crowns}</span><b>${t.pts}</b>`; list.append(r); });
      const zero = d.terrs.filter(t => t.pts === 0).reduce((a, t) => a + t.size, 0);
      if (zero) list.append(el('div', 'kd-kr dim', `왕관 없는 땅 ${zero}칸 = 0점`));
      if (s.opts.mk) list.append(el('div', 'kd-kr' + (d.mk ? '' : ' dim'), `중앙 왕국 ${d.mk ? '+10' : (d.centered ? '(아직 가능)' : '실패')}`));
      if (s.opts.harmony) list.append(el('div', 'kd-kr' + (d.harmony ? '' : ' dim'), `조화 ${d.harmony ? '+5' : (s.boards[seat].disc ? '실패 (타일 버림)' : s.over ? '실패 (빈 칸 있음)' : '(아직 가능)')}`));
      if (s.boards[seat].disc) list.append(el('div', 'kd-kr dim', `버린 타일 ${s.boards[seat].disc}장`));
      box.append(hd, bd, list);
      return box;
    }
    function openOv(...nodes) { const sh = el('div', 'kd-sheet'); sh.append(...nodes); ov.replaceChildren(sh); ov.hidden = false; }
    function showKingdom(seat) {
      const close = el('button', 'kd-go', '닫기'); close.dataset.a = 'close';
      openOv(kingdomPanel(seat, seat === humanSeat ? '내 왕국' : null), close);
    }
    function finish() {
      if (finished) return; finished = true;
      const res = self.result(s), best = res.ranking[0].score, last = res.ranking[res.ranking.length - 1];
      res.ranking.forEach(r => { if (ctx.players[r.seat].human) return; if (r.rank === 1) say(r.seat, 'win'); else if (r.seat === last.seat) say(r.seat, 'lose'); });
      log(res.ranking[0].seat === humanSeat ? `당신의 승리! ${best}점` : `${nameOf(res.ranking[0].seat)} 승리 · ${best}점`);
      later(() => { res.ranking.filter(r => r.rank === 1).forEach(r => { const b = seatBox(r.seat); fx.burst(b, { n: 18, color: GOLD, spread: 90 }); fx.glow(b); }); fx.sfx(res.ranking.find(r => r.seat === humanSeat).rank === 1 ? 'win' : 'lose'); }, 500);
      later(() => {
        const title = el('h3', 'kd-ft', res.ranking.find(r => r.seat === humanSeat).rank === 1 ? '왕국 완성 — 승리!' : '왕국 완성');
        const rows = res.ranking.map(r => { const w = el('div', 'kd-fr' + (r.rank === 1 ? ' first' : '')); w.append(el('i', '', `${r.rank}위`), kingdomPanel(r.seat, r.seat === humanSeat ? '내 왕국' : null)); return w; });
        const done = el('button', 'kd-go kd-finish', '기록 저장하고 마치기'); done.dataset.a = 'finish';
        openOv(title, ...rows, done);
        ov._res = res;
      }, ctx.delay(1400));
    }

    // ----- 입력 -----
    boardBox.onclick = e => {
      const t = e.target.closest('[data-i]'); if (!t || !s || s.over) return;
      const legal = myLegal(); if (!legal.length) return;
      const i = +t.dataset.i;
      if (i === ui.cell && ui.opts.length) { ui.k = (ui.k + 1) % ui.opts.length; return draw(); }
      const b = s.boards[humanSeat], id = s.prev[s.step].id, base = scoreBoard(b, s.size, s.opts).total;
      const here = legal.filter(m => cellsOf(m).includes(i)).map(m => { const b2 = cloneBoard(b); applyPlace(b2, s.size, id, m); return { m, v: scoreBoard(b2, s.size, s.opts).total - base }; });
      if (!here.length) return;
      here.sort((a, c) => c.v - a.v);                  // 점수가 가장 좋은 방향부터 보여 준다
      ui.cell = i; ui.opts = here.map(h => h.m); ui.k = 0; draw();
    };
    nextBox.onclick = e => {
      const t = e.target.closest('.kd-tile.free'); if (!t || !s || s.over || seatNow(s) !== humanSeat || s.phase !== 'pick') return;
      const i = +t.dataset.i;
      if (ui.pick === i) return step(humanSeat, { t: 'pick', i }, 'human');     // 같은 타일을 한 번 더 누르면 확정
      ui.pick = i; draw();
    };
    dock.onclick = e => {
      const a = e.target.closest('[data-a]'); if (!a || a.disabled || !s || s.over || seatNow(s) !== humanSeat) return;
      const k = a.dataset.a;
      if (k === 'rot' && ui.opts.length > 1) { ui.k = (ui.k + 1) % ui.opts.length; draw(); }
      else if (k === 'place' && ui.opts[ui.k]) step(humanSeat, ui.opts[ui.k], 'human');
      else if (k === 'discard') step(humanSeat, { t: 'discard' }, 'human');
      else if (k === 'pick' && ui.pick >= 0) step(humanSeat, { t: 'pick', i: ui.pick }, 'human');
    };
    oppBox.onclick = e => { const c = e.target.closest('.kd-opp'); if (c && s) showKingdom(+c.dataset.seat); };
    q('[data-a=detail]').onclick = () => { if (s) showKingdom(humanSeat); };
    ov.onclick = e => {
      const a = e.target.closest('[data-a]');
      if (a && a.dataset.a === 'finish') { a.disabled = true; ov.hidden = true; ctx.finish(ov._res); }   // 결과창(앨범)이 위에 뜨도록 내 화면은 닫는다
      else if ((a && a.dataset.a === 'close') || (e.target === ov && !finished)) { ov.hidden = true; ov.replaceChildren(); }
    };

    drawSetup();
    return { destroy() { dead = true; timers.forEach(clearTimeout); timers.clear(); container.querySelectorAll('.fx-layer').forEach(x => x.remove()); } };
  }
};
export default game;

// ---------- 그림: 지형 6종 × 3가지 + 성 + 왕관 (전부 직접 그린 SVG) ----------
function crownPath(x, y, k = 1) { return `<path transform="translate(${x},${y}) scale(${k})" d="M0 15L-1 3L4.5 8L9 0L13.5 8L19 3L18 15Z" fill="#ffd34d" stroke="#6b4400" stroke-width="1.3" stroke-linejoin="round"/>`; }
function crownG(c, x, y) {
  if (!c) return '';
  let o = `<g transform="translate(${x + 6},${y + 6})"><rect width="${10 + c * 25}" height="30" rx="9" fill="#1d1508" opacity=".8"/>`;
  for (let k = 0; k < c; k++) o += crownPath(8 + k * 25, 7, 1.15);
  return o + '</g>';
}
const stalk = (x, y, h) => `<path d="M${x} ${y}v-${h}" stroke="#8a5a10" stroke-width="2.2"/><path d="M${x} ${y - h}l-5-7M${x} ${y - h}l5-7M${x} ${y - h + 7}l-5-7M${x} ${y - h + 7}l5-7M${x} ${y - h + 14}l-5-7M${x} ${y - h + 14}l5-7M${x} ${y - h}v-8" stroke="#fff1a8" stroke-width="3.6" stroke-linecap="round"/>`;
const furrows = `<path d="M-5 30q30-12 55 0t55 0M-5 55q30-12 55 0t55 0M-5 80q30-12 55 0t55 0" fill="none" stroke="#b9860f" stroke-width="2" opacity=".55"/>`;
const pine = (x, y, k, f) => `<path d="M${x - 2.5 * k} ${y}h${5 * k}v${-7 * k}h${-5 * k}z" fill="#5a3a1c"/><path d="M${x} ${y - 38 * k}l${11 * k} ${15 * k}h${-5 * k}l${8 * k} ${11 * k}h${-5 * k}l${8 * k} ${9 * k}h${-34 * k}l${8 * k} ${-9 * k}h${-5 * k}l${8 * k} ${-11 * k}h${-5 * k}z" fill="${f}" stroke="#12331b" stroke-width="1.5" stroke-linejoin="round"/>`;
const oak = (x, y, k, f) => `<path d="M${x - 2.5 * k} ${y}h${5 * k}v${-14 * k}h${-5 * k}z" fill="#5a3a1c"/><g fill="${f}" stroke="#12331b" stroke-width="1.5"><circle cx="${x - 8 * k}" cy="${y - 18 * k}" r="${9 * k}"/><circle cx="${x + 8 * k}" cy="${y - 18 * k}" r="${9 * k}"/><circle cx="${x}" cy="${y - 27 * k}" r="${11 * k}"/></g>`;
const wave = (x, y) => `<path d="M${x} ${y}q5-6 10 0t10 0t10 0" fill="none" stroke="#d6efff" stroke-width="2.6" stroke-linecap="round" opacity=".85"/>`;
const tuft = (x, y) => `<path d="M${x} ${y}l-4-9M${x} ${y}v-11M${x} ${y}l4-9" stroke="#3c7d24" stroke-width="2.2" stroke-linecap="round"/>`;
const flower = (x, y, f) => `<g fill="${f}"><circle cx="${x - 3.2}" cy="${y}" r="3"/><circle cx="${x + 3.2}" cy="${y}" r="3"/><circle cx="${x}" cy="${y - 3.2}" r="3"/><circle cx="${x}" cy="${y + 3.2}" r="3"/></g><circle cx="${x}" cy="${y}" r="2" fill="#ffcf3a"/>`;
const sheep = (x, y) => `<path d="M${x - 6} ${y + 6}v7M${x + 6} ${y + 6}v7" stroke="#2b2b2b" stroke-width="2.4"/><ellipse cx="${x}" cy="${y}" rx="12" ry="8.5" fill="#fbfbf4" stroke="#55604a" stroke-width="1.4"/><circle cx="${x + 12}" cy="${y - 3}" r="5" fill="#2b2b2b"/>`;
const reed = (x, y, h) => `<path d="M${x} ${y}v-${h}" stroke="#3b4a22" stroke-width="2.2"/><rect x="${x - 3}" y="${y - h - 4}" width="6" height="15" rx="3" fill="#4b2a12"/><path d="M${x} ${y}q7-10 10-20" fill="none" stroke="#56682f" stroke-width="2.2" stroke-linecap="round"/>`;
const puddle = (x, y, rx, ry) => `<ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}" fill="#3b5650" stroke="#a9b48a" stroke-width="1.5" opacity=".95"/><path d="M${x - rx * 0.5} ${y - ry * 0.2}h${rx * 0.6}" stroke="#9fc3b4" stroke-width="1.6" stroke-linecap="round" opacity=".7"/>`;
const peak = (x, y, w, h, f) => `<path d="M${x} ${y}l${w / 2} ${-h}l${w / 2} ${h}z" fill="${f}" stroke="#221d28" stroke-width="1.6" stroke-linejoin="round"/><path d="M${x + w / 2} ${y - h}l${w * 0.15} ${h * 0.3}l${-w * 0.1} ${-h * 0.06}l${-w * 0.07} ${h * 0.1}l${-w * 0.13} ${-h * 0.04}z" fill="#f4f2f7"/>`;
const adit = (x, y) => `<path d="M${x - 13} ${y}v-17a13 13 0 0 1 26 0v17z" fill="#15111a"/><path d="M${x - 15} ${y}v-20M${x + 15} ${y}v-20M${x - 18} ${y - 21}h36" stroke="#b47a32" stroke-width="4.5" stroke-linecap="round"/>`;
const gem = (x, y, f) => `<path d="M${x} ${y - 9}l6 6l-6 9l-6-9z" fill="${f}" stroke="#1a1620" stroke-width="1.2"/><path d="M${x - 6} ${y - 3}h12" stroke="#ffffffaa" stroke-width="1"/>`;
const BGC = { 1: ['#f3cb52', '#dca824'], 2: ['#42884c', '#255a30'], 3: ['#5cb0ea', '#2c74bb'], 4: ['#acdc70', '#7cbd4b'], 5: ['#8f8659', '#5d5839'], 6: ['#746c7c', '#423c4a'] };
const ART = {
  1: [
    furrows + stalk(18, 44, 22) + stalk(40, 62, 26) + stalk(62, 46, 22) + stalk(82, 70, 26) + stalk(22, 92, 24) + stalk(58, 94, 22),
    furrows + `<g stroke="#8a5a10" stroke-width="1.8"><path d="M12 66q16-46 32 0z" fill="#f8de7c"/><path d="M52 88q18-52 36 0z" fill="#f8de7c"/><path d="M17 56h22M20 47h16M58 76h24M61 66h18M65 56h10" fill="none" opacity=".7"/></g>` + stalk(74, 40, 20) + stalk(28, 94, 20),
    furrows + `<path d="M44 86l4-40h14l4 40z" fill="#f6efe0" stroke="#5a4320" stroke-width="2"/><path d="M45 47l10-13l10 13z" fill="#b5452c" stroke="#5a2414" stroke-width="1.6"/><rect x="52" y="70" width="7" height="16" fill="#5a4320"/><g transform="rotate(20 55 42)" stroke="#5a4320" stroke-width="1.4" fill="#fff8e6"><rect x="53" y="12" width="5" height="28"/><rect x="53" y="44" width="5" height="28"/><rect x="25" y="40" width="28" height="5"/><rect x="57" y="40" width="28" height="5"/></g><circle cx="55" cy="42" r="3" fill="#5a4320"/>` + stalk(18, 90, 22) + stalk(86, 92, 22)
  ],
  2: [
    pine(26, 52, 0.8, '#2f6e3a') + pine(72, 48, 0.75, '#2f6e3a') + pine(48, 92, 1.15, '#3c8a48') + pine(84, 94, 0.7, '#357b40') + pine(14, 94, 0.7, '#357b40'),
    oak(28, 50, 0.9, '#3f8f4a') + oak(74, 54, 0.85, '#357b40') + oak(50, 94, 1.15, '#4a9d55') + `<circle cx="16" cy="84" r="3" fill="#d8402f"/><circle cx="86" cy="86" r="3" fill="#d8402f"/>`,
    pine(22, 60, 0.95, '#2f6e3a') + oak(68, 50, 0.85, '#4a9d55') + pine(80, 94, 0.95, '#3c8a48') + oak(36, 96, 0.8, '#3f8f4a') + `<path d="M54 90v-6" stroke="#f1e6cf" stroke-width="3"/><path d="M48 84a6 5 0 0 1 12 0z" fill="#d8402f" stroke="#6e1a12" stroke-width="1"/>`
  ],
  3: [
    wave(8, 20) + wave(56, 34) + wave(6, 84) + wave(58, 90) + `<path d="M32 64h36l-7 11h-22z" fill="#8a4f24" stroke="#3c2110" stroke-width="1.8"/><path d="M50 64v-34" stroke="#3c2110" stroke-width="2.4"/><path d="M53 32l19 26h-19z" fill="#fff8ea" stroke="#3c2110" stroke-width="1.6"/><path d="M47 38l-13 20h13z" fill="#f1d9b0" stroke="#3c2110" stroke-width="1.6"/>`,
    wave(52, 18) + wave(6, 40) + wave(54, 86) + `<g stroke="#1f5b2a" stroke-width="1.5"><path d="M24 76a13 9 0 1 0 1-.2l-1 8z" fill="#58b05c"/><path d="M70 58a11 8 0 1 0 1-.2l-1 7z" fill="#6cc06e"/></g><circle cx="30" cy="74" r="4" fill="#ffd1e6" stroke="#b9507f" stroke-width="1.2"/><path d="M22 22q12-10 22 0q-10 10-22 0zM44 22l9-7v14z" fill="#ff9a3c" stroke="#8a4208" stroke-width="1.5" stroke-linejoin="round"/><circle cx="28" cy="20.500" r="1.6" fill="#201204"/>`,
    wave(6, 18) + wave(56, 26) + wave(8, 90) + `<ellipse cx="54" cy="68" rx="30" ry="12" fill="#e9d59a" stroke="#8a7440" stroke-width="1.6"/><path d="M38 64q8-22 26-10q12 8 6 12z" fill="#9aa0a8" stroke="#3d4148" stroke-width="1.6"/><path d="M34 66v-16M30 66v-11" stroke="#2f6a2a" stroke-width="2.4" stroke-linecap="round"/><circle cx="78" cy="46" r="6" fill="none" stroke="#d6efff" stroke-width="1.6" opacity=".7"/>`
  ],
  4: [
    tuft(16, 32) + tuft(72, 24) + tuft(44, 62) + tuft(88, 70) + tuft(14, 86) + flower(36, 28, '#ffffff') + flower(70, 52, '#ff8fb5') + flower(26, 60, '#ffe36b') + flower(60, 86, '#ffffff'),
    tuft(14, 30) + tuft(84, 34) + tuft(50, 92) + sheep(34, 44) + sheep(64, 72) + flower(84, 88, '#ffffff') + flower(14, 74, '#ff8fb5'),
    tuft(18, 88) + tuft(80, 84) + `<g stroke="#5a3a1c" stroke-width="4" stroke-linecap="round"><path d="M12 62v-26M38 62v-26M64 62v-26M90 62v-26"/><path d="M6 44h90M6 54h90" stroke-width="3.4" stroke="#8a5d30"/></g>` + flower(30, 80, '#ffe36b') + flower(58, 84, '#ffffff') + flower(76, 22, '#ff8fb5') + tuft(24, 22)
  ],
  5: [
    puddle(34, 74, 24, 10) + puddle(74, 34, 16, 7) + reed(20, 52, 26) + reed(34, 46, 30) + reed(78, 86, 26) + reed(64, 90, 20),
    puddle(28, 82, 20, 8) + puddle(76, 74, 14, 6) + `<path d="M52 84q-3-26 0-52M52 58l-16-16M52 48l15-18M40 46l-4-12M62 36l10-2" fill="none" stroke="#2f2519" stroke-width="4" stroke-linecap="round"/><g fill="#fff" opacity=".22"><ellipse cx="26" cy="30" rx="22" ry="6"/><ellipse cx="72" cy="52" rx="22" ry="5"/></g>`,
    puddle(52, 54, 34, 15) + reed(14, 40, 22) + reed(88, 90, 24) + `<g fill="none" stroke="#c8d6b0" stroke-width="1.5"><circle cx="44" cy="52" r="4"/><circle cx="60" cy="58" r="2.6"/><circle cx="56" cy="46" r="2"/></g><path d="M22 84a7 5 0 0 1 14 0z" fill="#5f9a3a" stroke="#21381a" stroke-width="1.4"/><circle cx="25.500" cy="78" r="2.4" fill="#5f9a3a" stroke="#21381a"/><circle cx="32.500" cy="78" r="2.4" fill="#5f9a3a" stroke="#21381a"/>`
  ],
  6: [
    peak(2, 62, 46, 44, '#8f8898') + peak(40, 62, 58, 54, '#a39cab') + `<path d="M0 62h100v38h-100z" fill="#2d2833" opacity=".45"/>` + adit(50, 92) + gem(84, 86, '#5fe0ff'),
    peak(30, 44, 66, 38, '#8f8898') + adit(28, 78) + `<path d="M52 72h34l-4 14h-26z" fill="#7a4a22" stroke="#2b190a" stroke-width="1.8"/><circle cx="60" cy="89" r="4.5" fill="#2b2b2b"/><circle cx="79" cy="89" r="4.5" fill="#2b2b2b"/><g fill="#ffd34d" stroke="#8a5a00" stroke-width="1"><circle cx="60" cy="69" r="4.5"/><circle cx="70" cy="66" r="5"/><circle cx="79" cy="69" r="4.5"/></g>`,
    `<g fill="#8f8898" stroke="#221d28" stroke-width="1.6"><path d="M8 88l12-22l16 6l8 16z"/><path d="M52 90l10-30l20 4l10 26z"/><path d="M30 44l14-18l18 10l-6 16z"/></g>` + gem(26, 58, '#c78bff') + gem(72, 50, '#5fe0ff') + gem(46, 82, '#ffd34d') + `<path d="M74 20l-22 22" stroke="#8a5d30" stroke-width="4" stroke-linecap="round"/><path d="M64 14q14 0 18 14" fill="none" stroke="#cfd3da" stroke-width="4.5" stroke-linecap="round"/>`
  ]
};
const DEFS = (() => {
  let o = '<svg class="kd-defs" width="0" height="0" aria-hidden="true"><defs>';
  for (let t = 1; t <= 6; t++) {
    o += `<linearGradient id="kd-g${t}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${BGC[t][0]}"/><stop offset="1" stop-color="${BGC[t][1]}"/></linearGradient>`;
    for (let v = 0; v < 3; v++) o += `<symbol id="kd-c${t}${v}" viewBox="0 0 100 100"><rect width="100" height="100" fill="url(#kd-g${t})"/>${ART[t][v]}</symbol>`;
  }
  o += `<symbol id="kd-castle" viewBox="0 0 100 100"><rect width="100" height="100" fill="#d9d1bd"/><g fill="none" stroke="#b9b09a" stroke-width="2"><path d="M0 25h100M0 50h100M0 75h100M25 0v25M70 0v25M50 25v25M15 50v25M80 50v25M40 75v25"/></g>
    <g stroke="#3a3024" stroke-width="2.2" stroke-linejoin="round"><path d="M18 86v-40h-3v-9h6v4h5v-4h6v4h5v-4h6v9h-3v40z" fill="#f2ede0"/><path d="M60 86v-40h-3v-9h6v4h5v-4h6v4h5v-4h6v9h-3v40z" fill="#f2ede0"/><path d="M34 86v-30h32v30z" fill="#e6dfcd"/><path d="M43 86v-14a7 7 0 0 1 14 0v14z" fill="#5a3a1c"/><path d="M50 56v-34" /><path d="M50 22l20 7l-20 7z" fill="currentColor"/><path d="M24 58h7v9h-7zM69 58h7v9h-7z" fill="currentColor"/></g></symbol>`;
  return o + '</defs></svg>';
})();

// 이 게임 화면에서만 쓰는 스타일 (.g-kd 안으로 가둠)
const CSS = `
.g-kd{position:relative;padding:10px 8px 12px;border-radius:18px;color:#f5eeda;font-family:var(--fk);
 background:radial-gradient(90% 50% at 50% 0%,#ffffff1c,transparent 70%),repeating-linear-gradient(135deg,#ffffff06 0 2px,#0000 2px 5px),radial-gradient(120% 90% at 50% 30%,var(--tb),var(--tb2));
 box-shadow:inset 0 0 0 3px #4a3418,inset 0 0 0 5px #9a7436,inset 0 0 60px #0009,0 10px 24px #0006}
.g-kd *{box-sizing:border-box}
.g-kd [hidden]{display:none!important}
.g-kd button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.g-kd .kd-defs{position:absolute}
.g-kd .kd-setup{padding:18px 12px 14px;text-align:center}
.g-kd .kd-crest svg,.g-kd .kd-crest{height:54px}
.g-kd .kd-crest{display:flex;justify-content:center}
.g-kd .kd-setup h3{font-family:var(--fd);font-size:34px;margin:6px 0 2px;letter-spacing:.04em;color:#ffe9a8}
.g-kd .kd-sub{margin:0 0 16px;font-size:13px;color:#d9d2bb}
.g-kd .kd-seg{display:flex;gap:8px;margin-bottom:14px}
.g-kd .kd-seg button,.g-kd .kd-opt{flex:1;border:1.5px solid #ffffff33;background:#00000038;color:#f5eeda;border-radius:12px;padding:10px 8px;text-align:left}
.g-kd .kd-seg button{text-align:center}
.g-kd .kd-seg b,.g-kd .kd-opt b{display:block;font-size:15px}
.g-kd .kd-seg small,.g-kd .kd-opt small{display:block;font-size:11.5px;color:#cfc8b0;margin-top:3px;line-height:1.35}
.g-kd .kd-seg button.on,.g-kd .kd-opt.on{border-color:var(--acc);background:#e3b34126;box-shadow:0 0 0 1px var(--acc)}
.g-kd .kd-optl{font-family:var(--fd);font-size:13px;letter-spacing:.14em;color:#d9c98c;text-align:left;margin:4px 4px 6px}
.g-kd .kd-opt{display:flex;gap:10px;align-items:center;width:100%;margin-bottom:8px}
.g-kd .kd-opt i{flex:none;width:22px;height:22px;border-radius:6px;border:2px solid #ffffff66;background:#0004}
.g-kd .kd-opt.on i{background:var(--acc);border-color:var(--acc);box-shadow:inset 0 0 0 3px #2a2010}
.g-kd .kd-go{border:0;border-radius:12px;padding:12px 16px;font-weight:800;font-size:15px;color:#2a2010;background:linear-gradient(#ffe08a,#e3b341);box-shadow:0 3px 0 #8a6414,0 6px 12px #0006}
.g-kd .kd-go:active{transform:translateY(2px);box-shadow:0 1px 0 #8a6414}
.g-kd .kd-go:disabled{filter:grayscale(.8);opacity:.5;box-shadow:none}
.g-kd .kd-go.warn{background:linear-gradient(#ffb3a0,#e0664a);box-shadow:0 3px 0 #7c2a16,0 6px 12px #0006}
.g-kd .kd-start{width:100%;margin-top:10px;font-size:17px;padding:14px}
.g-kd .kd-sbtn{border:1px solid #ffffff44;background:#0000004d;color:#f5eeda;border-radius:10px;padding:7px 10px;font-size:12.5px;font-weight:700}
.g-kd .kd-sbtn:disabled{opacity:.35}
.g-kd .kd-top{display:flex;justify-content:space-between;gap:8px;font-family:var(--fd);font-size:13px;letter-spacing:.06em;color:#e8dcb8;margin:0 6px 8px}
.g-kd .kd-badges{color:#ffe08a}
.g-kd .kd-opps{display:grid;gap:6px;margin-bottom:8px}
.g-kd .kd-opps.n1{grid-template-columns:1fr}.g-kd .kd-opps.n2{grid-template-columns:1fr 1fr}.g-kd .kd-opps.n3{grid-template-columns:1fr 1fr 1fr}
.g-kd .kd-opp{position:relative;background:#00000042;border:1.5px solid #ffffff22;border-radius:12px;padding:6px;cursor:pointer;min-width:0}
.g-kd .kd-opps.n1 .kd-opp{display:flex;gap:10px;align-items:center}
.g-kd .kd-opps.n1 .kd-oh{flex:1;flex-direction:column;align-items:flex-start;gap:6px}
.g-kd .kd-opps.n1 .kd-mini{width:132px;flex:none}
.g-kd .kd-opps.n1 .kd-av{width:44px;height:44px}
.g-kd .kd-opp.turn{border-color:var(--acc);box-shadow:0 0 0 1.5px var(--acc),0 0 14px #ffd96a55}
.g-kd .kd-oh{display:flex;gap:6px;align-items:center;margin-bottom:5px;min-width:0}
.g-kd .kd-av{flex:none;width:30px;height:30px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2.5px var(--pc,#888),0 1px 3px #000a;display:block;background:#333}
.g-kd .kd-av>*,.g-kd .kd-own>*{width:100%!important;height:100%!important;display:grid;place-items:center;font-size:12px;border-radius:50%;object-fit:cover}
.g-kd .kd-oi{min-width:0;line-height:1.15}
.g-kd .kd-oi b{display:block;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.g-kd .kd-oi span{font-family:var(--fd);font-size:15px;color:#ffe08a;font-weight:700}
.g-kd .kd-mini{background:#e9dfc4;border-radius:6px;padding:2px;line-height:0}
.g-kd .kd-svg{display:block;width:100%;height:auto;margin:0 auto}
.g-kd .kd-slot{fill:#00000012;stroke:#0000001f;stroke-width:2}
.g-kd .kd-slot.off{fill:#00000030;stroke:none}
.g-kd .kd-edge{fill:none;stroke:#1d1508;stroke-width:5;stroke-linecap:round}
.g-kd .kd-hl{fill:#fff6a833;stroke:#fff3a0;stroke-width:5;stroke-dasharray:14 9;animation:kdpulse 1.3s ease-in-out infinite}
@keyframes kdpulse{50%{fill:#fff6a866;stroke:#ffd84a}}
.g-kd .kd-ghost{opacity:.9}
.g-kd .kd-gr{fill:none;stroke:#fff;stroke-width:7;filter:drop-shadow(0 0 6px #ffe36b)}
.g-kd .kd-new{animation:kddrop .45s ease-out}
@keyframes kddrop{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}
.g-kd .kd-say{position:absolute;left:0;right:0;top:calc(100% - 6px);z-index:8;background:#fbf6e6;color:#2a2016;border-radius:10px;padding:6px 9px;font-size:12.5px;line-height:1.4;box-shadow:0 4px 12px #000a;cursor:pointer}
.g-kd .kd-say:after{content:"";position:absolute;left:18px;top:-6px;border:6px solid transparent;border-bottom-color:#fbf6e6;border-top:0}
.g-kd .kd-say.pop{animation:kdpop .18s ease-out}
@keyframes kdpop{from{transform:translateY(-5px) scale(.96);opacity:0}to{transform:none;opacity:1}}
.g-kd .kd-draft{background:#0000003a;border-radius:12px;padding:6px 6px 7px;margin-bottom:8px}
.g-kd .kd-lbl{font-size:11.5px;color:#d9d2bb;margin:1px 3px 4px}
.g-kd .kd-line{display:grid;grid-template-columns:repeat(4,1fr);gap:5px}
.g-kd .kd-prev{margin-bottom:13px}
.g-kd .kd-next{margin-bottom:5px}
.g-kd .kd-tile{position:relative;border-radius:6px;line-height:0;box-shadow:0 2px 5px #0008;transition:transform .12s}
.g-kd .kd-tile svg{display:block;width:100%;height:auto;border-radius:5px}
.g-kd .kd-num{position:absolute;right:3px;bottom:3px;min-width:18px;padding:0 3px;height:15px;line-height:15px;text-align:center;font-family:var(--fd);font-weight:700;font-size:12px;border-radius:5px;background:#1d1508cc;color:#ffe9a8}
.g-kd .kd-own{position:absolute;left:50%;bottom:-6px;width:24px;height:24px;margin:0 0 0 -12px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2.5px var(--pc,#888),0 0 0 4px #fff,0 2px 6px #000;background:#333}
.g-kd .kd-tile.done{opacity:.28;filter:grayscale(.6)}
.g-kd .kd-tile.now{box-shadow:0 0 0 2.5px var(--acc),0 0 12px #ffd96a99}
.g-kd .kd-next.can .kd-tile.free{cursor:pointer;animation:kdbob 1.4s ease-in-out infinite}
@keyframes kdbob{50%{transform:translateY(-3px)}}
.g-kd .kd-next .kd-tile.sel{animation:none;transform:translateY(-5px) scale(1.04);box-shadow:0 0 0 3px #fff,0 0 16px #ffe36b}
.g-kd .kd-mine{background:#0000002e;border:1.5px solid #ffffff1c;border-radius:14px;padding:7px}
.g-kd .kd-mine.turn{border-color:var(--acc)}
.g-kd .kd-mhead{display:flex;align-items:center;gap:8px;margin:0 2px 6px}
.g-kd .kd-mname{font-weight:800;font-size:14px}
.g-kd .kd-mscore{font-family:var(--fd);font-weight:700;font-size:20px;color:#ffe08a;flex:1}
.g-kd .kd-board{background:#e9dfc4;border-radius:10px;padding:5px;box-shadow:inset 0 0 0 2px #b9a676,inset 0 0 18px #7a633055;touch-action:manipulation}
.g-kd .kd-dock{position:sticky;bottom:6px;z-index:5;display:flex;align-items:center;gap:8px;min-height:64px;margin-top:8px;padding:8px;border-radius:14px;background:#17212bf2;border:1.5px solid #ffffff26;box-shadow:0 6px 16px #000a}
.g-kd .kd-dock.mine{border-color:var(--acc)}
.g-kd .kd-dmsg{flex:1;text-align:center;font-size:13.5px;color:#d9d2bb}
.g-kd .kd-hand{flex:none;width:64px;height:64px;display:grid;place-items:center}
.g-kd .kd-hand svg{display:block;border-radius:5px;box-shadow:0 2px 6px #000a}
.g-kd .kd-hand svg.hz{width:64px;height:32px}.g-kd .kd-hand svg.vt{width:32px;height:64px}
.g-kd .kd-dtxt{flex:1;min-width:0;line-height:1.3}
.g-kd .kd-dtxt b{display:block;font-size:13.5px;white-space:nowrap}
.g-kd .kd-dtxt small{display:block;font-size:11.5px;color:#cfc8b0;margin-top:2px}
.g-kd .kd-dtxt small.bad{color:#ffb09a;font-weight:700}
.g-kd .kd-rot{flex:none;padding:11px 8px;white-space:nowrap}
.g-kd .kd-dock .kd-go{flex:none}
.g-kd .kd-fold{margin-top:8px;background:#00000030;border-radius:10px;padding:6px 10px;font-size:12.5px}
.g-kd .kd-fold summary{cursor:pointer;color:#e8dcb8}
.g-kd .kd-log{max-height:150px;overflow:auto;margin-top:6px;line-height:1.55;color:#e6dfc8}
.g-kd .kd-log .sp{color:#ffe08a}.g-kd .kd-log .bad{color:#ffb09a}
.g-kd .kd-rules{margin:6px 0 2px;padding-left:18px;line-height:1.6}
.g-kd .kd-rules b{color:#ffe08a}
.g-kd .kd-ov{position:fixed;inset:0;z-index:60;background:#0b1118d9;display:flex;align-items:flex-end;justify-content:center}
.g-kd .kd-sheet{width:100%;max-width:600px;max-height:92vh;overflow:auto;padding:16px 14px 18px;border-radius:18px 18px 0 0;background:linear-gradient(170deg,#263a4c,#18252f);box-shadow:0 -6px 24px #000a;display:flex;flex-direction:column;gap:12px}
.g-kd .kd-kh{display:flex;align-items:center;gap:8px;margin-bottom:8px}
.g-kd .kd-kh b{flex:1;font-size:15px}
.g-kd .kd-kt{font-family:var(--fd);font-weight:700;font-size:24px;color:#ffe08a}
.g-kd .kd-kb{background:#e9dfc4;border-radius:10px;padding:5px;max-width:330px;margin:0 auto 8px}
.g-kd .kd-kr{display:flex;align-items:center;gap:8px;font-size:13px;padding:3px 2px;border-bottom:1px solid #ffffff14}
.g-kd .kd-kr svg{width:20px;height:20px;border-radius:4px;flex:none}
.g-kd .kd-kr span{flex:1}
.g-kd .kd-kr b{font-family:var(--fd);font-size:17px;color:#ffe08a}
.g-kd .kd-kr.dim{color:#a9a698}
.g-kd .kd-ft{font-family:var(--fd);font-size:28px;margin:0;text-align:center;color:#ffe9a8}
.g-kd .kd-fr{position:relative;background:#0000003a;border:1.5px solid #ffffff22;border-radius:14px;padding:10px}
.g-kd .kd-fr.first{border-color:var(--acc);box-shadow:0 0 14px #ffd96a44}
.g-kd .kd-fr>i{position:absolute;right:12px;top:-9px;font-style:normal;font-family:var(--fd);font-weight:700;font-size:13px;background:var(--acc);color:#2a2010;border-radius:8px;padding:1px 8px}
.g-kd .kd-fr .kd-kb{max-width:230px}
`;
