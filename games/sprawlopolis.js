// 스프롤로폴리스 — 협력/솔로 도시 건설 카드 게임 (1~4인). 규칙(배치·도로·블록 점수·카드 넘기기)은 공식 룰북 기준.
// 카드 18장(앞면)과 점수 조건 18종(뒷면)은 원본 카드 사진을 옮겨 만들었다. 카드 한 장 = 가로로 긴 2×2 블록(구역 네 종류가 하나씩), 도로는 블록 한가운데를 지난다.
// 앞면과 뒷면이 같은 카드끼리 짝이 맞는지는 사진에 없어서 번호 순서대로 짝지었다(게임에는 영향 없음). 확장팩은 SETS에 데이터만 더하면 됨.
// 이 파일은 규칙(엔진) · 협력 AI · 화면을 한 파일에 담는다. 무작위는 전달받은 rng만 쓴다.

// ---------- 기본 정의 ----------
export const ZONES = ['R', 'C', 'I', 'P'];                 // 주거 · 상업 · 공업 · 공원
export const ZONE_KO = ['주거', '상업', '공업', '공원'];
export const ZONE_COLOR = ['#e8913a', '#4b9ce0', '#8d95a3', '#5db05b'];
const SZ = 64, OFF = 32;                                   // 판 격자(내부용): 도시가 어디로 퍼져도 충분한 크기
const NB = [-SZ, 1, SZ, -1];                               // 북·동·남·서 이웃의 인덱스 차이
const BIT = [1, 2, 4, 8];                                  // 길이 어느 쪽으로 이어지는지 (북1 동2 남4 서8)
const idxOf = (x, y) => (y + OFF) * SZ + (x + OFF);
const xOf = i => (i % SZ) - OFF;
const yOf = i => Math.floor(i / SZ) - OFF;
const opp = m => ((m & 1) ? 4 : 0) | ((m & 4) ? 1 : 0) | ((m & 2) ? 8 : 0) | ((m & 8) ? 2 : 0);

// ---------- 카드 데이터 ----------
// 카드 한 장 = 2×2 블록. 칸 순서: 0 왼위 · 1 오른위 · 2 왼아래 · 3 오른아래. z = 구역(R C I P 글자), m = 칸마다 길이 뻗는 방향(북1 동2 남4 서8).
// 카드 안에서 이웃한 칸의 길은 서로 마주 봐야 한다(왼위의 동쪽이 열려 있으면 오른위의 서쪽도 열려 있음).
function mkCard(id, zones, masks) { return { id, z: [...zones].map(ch => ZONES.indexOf(ch)), m: masks.slice() }; }
// 원본 사진의 도로 모양 6종: 가로 직선+왼아래 꺾임 / 가로 직선+오른아래 꺾임 / ㄷ자 3칸(둘) / 세로 직선 + 꺾임(둘)
const ROAD_SHAPES = {
  a: [10, 10, 12, 0],   // 위 줄을 가로로 가로지르고, 왼아래 칸에서 서쪽→남쪽
  b: [10, 10, 0, 6],    // 위 줄을 가로로 가로지르고, 오른아래 칸에서 동쪽→남쪽
  c: [6, 10, 5, 0],     // 오른위 → 왼위로 꺾여 왼아래로 내려감 (3칸 한 도로)
  d: [10, 12, 0, 5],    // 왼위 → 오른위에서 꺾여 오른아래로 내려감 (3칸 한 도로)
  e: [5, 3, 5, 0],      // 왼쪽 세로 직선(2칸) + 오른위 칸의 북쪽→동쪽
  f: [9, 5, 0, 5]       // 왼위 칸의 서쪽→북쪽 + 오른쪽 세로 직선(2칸)
};
// 구역 배치(왼위·오른위·왼아래·오른아래): 공원 자리는 모양마다 고정, 나머지 셋이 돌아가며 놓인다
const ZONE_SETS = { A: ['CIRP', 'IRCP', 'RCIP'], B: ['ICPR', 'RIPC', 'CRPI'] };
const SHAPE_ZONE = [['a', 'A'], ['b', 'B'], ['c', 'A'], ['d', 'B'], ['e', 'A'], ['f', 'B']];
const BASE_CARDS = [];
for (let r = 0; r < 3; r++) SHAPE_ZONE.forEach(([sh, zs], k) => BASE_CARDS.push(mkCard(r * 6 + k + 1, ZONE_SETS[zs][r], ROAD_SHAPES[sh])));

// 카드 뒤집기(180도): 칸 순서가 뒤집히고 길 방향도 반대가 된다
export function cellsOf(card, rot) {
  const o = [];
  for (let i = 0; i < 4; i++) {
    const j = rot ? 3 - i : i;
    o.push({ dx: i & 1, dy: i >> 1, z: card.z[j], m: rot ? opp(card.m[j]) : card.m[j] });
  }
  return o;
}

// ---------- 점수 계산 (빠른 계산용 배열 격자) ----------
const seen = new Int32Array(SZ * SZ), seenR = new Int32Array(SZ * SZ), par = new Int32Array(SZ * SZ), stk = new Int32Array(SZ * SZ), rlen = new Int32Array(SZ * SZ);
let stamp = 0, stampR = 0;
const zAt = (G, i) => (G[i] ? (G[i] - 1) >> 4 : -1);
const mAt = (G, i) => (G[i] ? (G[i] - 1) & 15 : 0);
const val = (z, m) => z * 16 + m + 1;
function find(i) { while (par[i] !== i) { par[i] = par[par[i]]; i = par[i]; } return i; }

// 도시를 한 번 훑어 덩어리·도로 수·경계를 구한다. 점수 조건은 이 결과(a)에 더해 필요할 때만 a.road() / a.lines() 를 부른다.
function analyze(G, L, n) {
  stamp++;
  const sizes = [[], [], [], []], cnt = [0, 0, 0, 0];
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let k = 0; k < n; k++) {
    const i = L[k], x = i % SZ, y = (i / SZ) | 0;
    cnt[(G[i] - 1) >> 4]++;
    if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y;
  }
  for (let k = 0; k < n; k++) {
    const i0 = L[k];
    if (seen[i0] === stamp) continue;
    const z = (G[i0] - 1) >> 4;
    let sp = 0, size = 0; stk[sp++] = i0; seen[i0] = stamp;
    while (sp) {
      const c = stk[--sp]; size++;
      for (let d = 0; d < 4; d++) { const j = c + NB[d]; if (seen[j] !== stamp && G[j] && ((G[j] - 1) >> 4) === z) { seen[j] = stamp; stk[sp++] = j; } }
    }
    sizes[z].push(size);
  }
  for (let z = 0; z < 4; z++) sizes[z].sort((p, q) => q - p);
  // 도로: 길이 있는 칸끼리, 마주 보는 방향이 둘 다 이어질 때만 한 도로
  let nr = 0;
  for (let k = 0; k < n; k++) { const i = L[k]; if (mAt(G, i)) { par[i] = i; nr++; } }
  for (let k = 0; k < n; k++) {
    const i = L[k], m = mAt(G, i);
    if (!m) continue;
    if ((m & 2) && G[i + 1] && (mAt(G, i + 1) & 8)) { const a = find(i), b = find(i + 1); if (a !== b) par[a] = b; }
    if ((m & 4) && G[i + SZ] && (mAt(G, i + SZ) & 1)) { const a = find(i), b = find(i + SZ); if (a !== b) par[a] = b; }
  }
  const roots = [];
  for (let k = 0; k < n; k++) { const i = L[k]; if (mAt(G, i)) { const r = find(i); if (rlen[r] === 0) roots.push(r); rlen[r]++; } }
  const roadLens = roots.map(r => rlen[r]).sort((p, q) => q - p);
  roots.forEach(r => { rlen[r] = 0; });
  const a = { G, L, n, sizes, cnt, roads: roots.length, roadLens, minx, maxx, miny, maxy, w: maxx - minx + 1, h: maxy - miny + 1, nr, _road: null, _lines: null };
  a.road = () => a._road || (a._road = roadComps(G, L, n));
  a.lines = () => a._lines || (a._lines = lineCounts(G, L, n));
  return a;
}
// 도로 한 줄기(이어진 길 칸들)마다 칸 목록
function roadComps(G, L, n) {
  stampR++;
  const comps = [];
  for (let k = 0; k < n; k++) {
    const i0 = L[k];
    if (!mAt(G, i0) || seenR[i0] === stampR) continue;
    const nodes = [i0]; seenR[i0] = stampR;
    for (let h = 0; h < nodes.length; h++) {
      const i = nodes[h], m = mAt(G, i);
      for (let d = 0; d < 4; d++) if (m & BIT[d]) { const j = i + NB[d]; if (G[j] && seenR[j] !== stampR && (mAt(G, j) & BIT[(d + 2) & 3])) { seenR[j] = stampR; nodes.push(j); } }
    }
    comps.push(nodes);
  }
  return comps;
}
// 줄(가로·세로)마다 구역별 블록 수. [구역 0~3, 합계] 순서로 5칸씩.
function lineCounts(G, L, n) {
  const row = new Int16Array(SZ * 5), col = new Int16Array(SZ * 5);
  for (let k = 0; k < n; k++) { const i = L[k], x = i % SZ, y = (i / SZ) | 0, z = (G[i] - 1) >> 4; row[y * 5 + z]++; row[y * 5 + 4]++; col[x * 5 + z]++; col[x * 5 + 4]++; }
  return { row, col };
}
// 도로 한 줄기 안에서 고리(닫힌 길)에 속한 칸 수: 다리(끊으면 갈라지는 연결)가 아닌 연결에 닿은 칸
function loopCells(G, nodes) {
  const m = nodes.length, id = new Map();
  nodes.forEach((v, k) => id.set(v, k));
  const adj = nodes.map(i => { const arr = [], mm = mAt(G, i); for (let d = 0; d < 4; d++) if (mm & BIT[d]) { const j = i + NB[d]; if (G[j] && (mAt(G, j) & BIT[(d + 2) & 3])) arr.push(id.get(j)); } return arr; });
  const disc = new Array(m).fill(-1), low = new Array(m).fill(0), cyc = new Array(m).fill(0);
  let timer = 0;
  const st = [[0, -1, 0]]; disc[0] = low[0] = timer++;
  while (st.length) {
    const f = st[st.length - 1], u = f[0];
    if (f[2] < adj[u].length) {
      const v = adj[u][f[2]++];
      if (v === f[1]) continue;
      if (disc[v] === -1) { disc[v] = low[v] = timer++; st.push([v, u, 0]); }
      else { if (disc[v] < low[u]) low[u] = disc[v]; if (disc[v] < disc[u]) { cyc[u]++; cyc[v]++; } }   // 되돌아오는 연결 = 고리
    } else {
      st.pop();
      if (st.length) { const p = st[st.length - 1][0]; if (low[u] < low[p]) low[p] = low[u]; if (low[u] <= disc[p]) { cyc[p]++; cyc[u]++; } }   // 다리가 아닌 연결
    }
  }
  return cyc.filter(c => c > 0).length;
}

// ---------- 점수 조건 18종 (원본) ----------
// num = 점수 조건 카드에 적힌 번호(목표 점수에 더해짐). en = 원본 이름. dia = 설명 그림(g 구역 줄 · r 도로 · l 점수 표시 · c 설명 · exp 그림 전체 점수).
// 도시 가장자리(edge)는 '블록이 없는 칸(바깥이나 빈 땅)과 변이 맞닿은 것', 줄(row/column)은 블록이 하나라도 있는 가로·세로 한 줄이다.
const exposed = (G, i) => !G[i - SZ] || !G[i + 1] || !G[i + SZ] || !G[i - 1];
const eachCell = (a, fn) => { for (let k = 0; k < a.n; k++) { const i = a.L[k]; fn(i, zAt(a.G, i)); } };
const roadNbr = (G, i, d) => { const j = i + NB[d]; return (mAt(G, i) & BIT[d]) && G[j] && (mAt(G, j) & BIT[(d + 2) & 3]) ? j : -1; };
function hasDiag(G, i, z) { return zAt(G, i - SZ - 1) === z || zAt(G, i - SZ + 1) === z || zAt(G, i + SZ - 1) === z || zAt(G, i + SZ + 1) === z; }
function largestGroups(a, z) {   // 가장 큰 덩어리(동점이면 모두)의 칸 목록들
  const G = a.G, mark = new Set(), groups = [];
  eachCell(a, (i0, zz) => {
    if (zz !== z || mark.has(i0)) return;
    const g = [i0]; mark.add(i0);
    for (let h = 0; h < g.length; h++) for (let d = 0; d < 4; d++) { const j = g[h] + NB[d]; if (!mark.has(j) && zAt(G, j) === z) { mark.add(j); g.push(j); } }
    groups.push(g);
  });
  const best = Math.max(0, ...groups.map(g => g.length));
  return groups.filter(g => g.length === best);
}
const GOALS = [
  { id: 1, en: 'THE OUTSKIRTS', name: '변두리', desc: '도시 가장자리에서 끝나지 않는 도로 +1 · 가장자리에서 끝나는 도로 −1',
    f: a => { let s = 0; for (const nodes of a.road()) { let edge = false; for (const i of nodes) { const m = mAt(a.G, i); for (let d = 0; d < 4; d++) if ((m & BIT[d]) && !a.G[i + NB[d]]) edge = true; } s += edge ? -1 : 1; } return s; },
    dia: { g: ['RCIP', 'CIPR', 'PRCI'], r: { '1,1': 'WE', '2,1': 'WE', '3,0': 'NS' }, l: [[1, 1, '+1'], [2, 1, '+1'], [3, 0, '−1']], c: '안쪽 도로 +1, 바깥으로 뻗은 도로 −1', exp: 0 } },
  { id: 2, en: 'BLOOM BLOOM', name: '활짝 핀 공원', desc: '공원이 4칸 이상인 가로줄·세로줄마다 +4 · 공원이 0~1칸인 줄마다 −1',
    f: a => { const { row, col } = a.lines(); let s = 0; for (let y = a.miny; y <= a.maxy; y++) { const p = row[y * 5 + 3]; s += p >= 4 ? 4 : p <= 1 ? -1 : 0; } for (let x = a.minx; x <= a.maxx; x++) { const p = col[x * 5 + 3]; s += p >= 4 ? 4 : p <= 1 ? -1 : 0; } return s; },
    dia: { g: ['PPPP', 'RCIC', 'PPPP'], r: {}, l: [[3, 0, '+4'], [3, 2, '+4'], [3, 1, '−1']], c: '공원 4칸 줄 둘 +8, 공원 없는 줄 −1', exp: 7 } },
  { id: 3, en: 'GO GO GREEN', name: '초록 도시', desc: '공원 블록 1칸당 +1 · 공업 블록 1칸당 −3',
    f: a => a.cnt[3] - 3 * a.cnt[2],
    dia: { g: ['PPI', 'PPC'], r: {}, l: [[0, 0, '+1'], [1, 0, '+1'], [0, 1, '+1'], [1, 1, '+1'], [2, 0, '−3']], c: '공원 4칸 +4, 공업 1칸 −3', exp: 1 } },
  { id: 4, en: 'BLOCK PARTY', name: '블록 파티', desc: '같은 구역 블록 4칸이 2×2로 모인 곳(여러 개·겹침 가능)의 수로 점수: 0개 −8 · 1개 −5 · 2개 −2 · 3개 +1 · 4개 +4 · 5개 이상 +7',
    f: a => { let c = 0; eachCell(a, (i, z) => { if (zAt(a.G, i + 1) === z && zAt(a.G, i + SZ) === z && zAt(a.G, i + SZ + 1) === z) c++; }); return [-8, -5, -2, 1, 4, 7][Math.min(c, 5)]; },
    dia: { g: ['PPCC', 'PPCC', 'RRII'], r: {}, l: [[1, 0, '①'], [3, 0, '②']], c: '2×2 모임 2개 → −2 (0개 −8 · 1개 −5 · 3개 +1 · 4개 +4 · 5개+ +7)', exp: -2 } },
  { id: 5, en: 'CENTRAL PERKS', name: '중심가 혜택', desc: '도시 안쪽의 공원 블록 +1 · 가장자리의 공원 블록 −2',
    f: a => { let s = 0; eachCell(a, (i, z) => { if (z === 3) s += exposed(a.G, i) ? -2 : 1; }); return s; },
    dia: { g: ['RCIR', 'CPPI', 'IRCP'], r: {}, l: [[1, 1, '+1'], [2, 1, '+1'], [3, 2, '−2']], c: '사방이 막힌 공원 +1, 가장자리 공원 −2', exp: 0 } },
  { id: 6, en: 'MASTER PLANNED', name: '계획 도시', desc: '가장 큰 주거 덩어리의 칸 수에서 가장 큰 공업 덩어리의 칸 수를 뺀 만큼',
    f: a => (a.sizes[0][0] || 0) - (a.sizes[2][0] || 0),
    dia: { g: ['RRI', 'RRI', 'RCC'], r: {}, l: [], c: '주거 5칸 − 공업 2칸 = +3', exp: 3 } },
  { id: 7, en: 'STACKS AND SCRAPERS', name: '마천루', desc: '이웃이 모두 상업 또는 공업 블록인 공업 블록마다 +2 (이웃이 적어도 됨)',
    f: a => { let s = 0; eachCell(a, (i, z) => { if (z === 2 && NB.every(d => { const q = zAt(a.G, i + d); return q < 0 || q === 1 || q === 2; })) s += 2; }); return s; },
    dia: { g: ['CIC', 'CII', 'RPI'], r: {}, l: [[1, 0, '+2'], [2, 1, '+2']], c: '이웃이 상업·공업뿐인 공업 블록 둘 → +4', exp: 4 } },
  { id: 8, en: "THE 'BURBS", name: '교외', desc: '가장 큰 주거 덩어리와 붙은 공원 블록 +1 · 붙은 공업 블록 −2',
    f: a => { let best = -1e9; const gs = largestGroups(a, 0); if (!gs.length) return 0; for (const g of gs) { const mem = new Set(g), adj = new Set(); let s = 0; for (const i of g) for (const d of NB) { const j = i + d, z = zAt(a.G, j); if ((z === 3 || z === 2) && !mem.has(j) && !adj.has(j)) { adj.add(j); s += z === 3 ? 1 : -2; } } if (s > best) best = s; } return best; },
    dia: { g: ['PRR', 'PRR', 'CPI'], r: {}, l: [[0, 0, '+1'], [0, 1, '+1'], [1, 2, '+1'], [2, 2, '−2']], c: '큰 주거단지 옆 공원 3칸 +3, 공업 1칸 −2', exp: 1 } },
  { id: 9, en: 'CONCRETE JUNGLE', name: '콘크리트 정글', desc: '다른 공업 블록과 모서리(대각선)를 맞댄 공업 블록마다 +1',
    f: a => { let s = 0; eachCell(a, (i, z) => { if (z === 2 && hasDiag(a.G, i, 2)) s++; }); return s; },
    dia: { g: ['IRC', 'RIP', 'CRI'], r: {}, l: [[0, 0, '+1'], [1, 1, '+1'], [2, 2, '+1']], c: '대각선으로 이어진 공업 3칸 → +3', exp: 3 } },
  { id: 10, en: 'THE STRIP', name: '번화가', desc: '상업 블록이 가장 많은 한 줄(가로 또는 세로 중 하나만) 1칸당 +1',
    f: a => { const { row, col } = a.lines(); let b = 0; for (let y = a.miny; y <= a.maxy; y++) b = Math.max(b, row[y * 5 + 1]); for (let x = a.minx; x <= a.maxx; x++) b = Math.max(b, col[x * 5 + 1]); return b; },
    dia: { g: ['CCICC', 'RPRIP'], r: {}, l: [[0, 0, '+1'], [1, 0, '+1'], [3, 0, '+1'], [4, 0, '+1']], c: '한 줄의 상업 4칸 → +4', exp: 4 } },
  { id: 11, en: 'MINI MARTS', name: '미니 마트', desc: '같은 도로로 이어진 주거 – 상업 – 주거 사이에 낀 상업 블록마다 +2 (일직선도, 꺾인 계단 모양도 됨)',
    f: a => { let s = 0; eachCell(a, (i, z) => { if (z !== 1) return; let rc = 0; for (let d = 0; d < 4; d++) { const j = roadNbr(a.G, i, d); if (j >= 0 && zAt(a.G, j) === 0) rc++; } if (rc >= 2) s += 2; }); return s; },
    dia: { g: ['RCR', 'PIP'], r: { '0,0': 'E', '1,0': 'WE', '2,0': 'W' }, l: [[1, 0, '+2']], c: '한 도로로 주거–상업–주거 → +2', exp: 2 } },
  { id: 12, en: 'SUPERHIGHWAY', name: '고속도로', desc: '가장 긴 도로를 이루는 도로 칸 2칸마다 +1 (내림)',
    f: a => { let b = 0; for (const nodes of a.road()) if (nodes.length > b) b = nodes.length; return b >> 1; },
    dia: { g: ['CRIC', 'PIRP'], r: { '0,0': 'E', '1,0': 'WS', '1,1': 'NE', '2,1': 'WE', '3,1': 'W' }, l: [], c: '가장 긴 도로 5칸 → +2', exp: 2 } },
  { id: 13, en: 'PARK HOPPING', name: '공원 뛰기', desc: '한 공원에서 시작해 다른 공원에서 끝나는 도로마다 +2',
    f: a => { let s = 0; for (const nodes of a.road()) { let pe = 0; for (const i of nodes) { let deg = 0; for (let d = 0; d < 4; d++) if (roadNbr(a.G, i, d) >= 0) deg++; if (deg <= 1 && zAt(a.G, i) === 3) pe++; } if (pe >= 2) s += 2; } return s; },
    dia: { g: ['PRC', 'ICP'], r: { '0,0': 'E', '1,0': 'WS', '1,1': 'NE', '2,1': 'W' }, l: [[0, 0, '+2']], c: '두 공원을 잇는 도로 → +2', exp: 2 } },
  { id: 14, en: 'LOOPING LANES', name: '순환 도로', desc: '닫힌 고리를 이룬 도로 칸마다 +1 (고리가 여러 개여도 모두)',
    f: a => { let s = 0; for (const nodes of a.road()) if (nodes.length >= 4) s += loopCells(a.G, nodes); return s; },
    dia: { g: ['RCI', 'PRR', 'CIP'], r: { '0,0': 'ES', '1,0': 'WE', '2,0': 'WS', '2,1': 'NS', '2,2': 'NW', '1,2': 'WE', '0,2': 'NE', '0,1': 'NS' }, l: [], c: '고리를 이룬 도로 8칸 → +8', exp: 8 } },
  { id: 15, en: 'SKID ROW', name: '빈민가', desc: '공업 블록 2칸 이상과 맞닿은 주거 블록마다 +2',
    f: a => { let s = 0; eachCell(a, (i, z) => { if (z !== 0) return; let c = 0; for (const d of NB) if (zAt(a.G, i + d) === 2) c++; if (c >= 2) s += 2; }); return s; },
    dia: { g: ['IRI', 'CPC'], r: {}, l: [[1, 0, '+2']], c: '공업 둘과 맞닿은 주거 → +2', exp: 2 } },
  { id: 16, en: 'MORNING COMMUTE', name: '출근길', desc: '주거 블록과 상업 블록을 모두 지나가는 도로마다 +2',
    f: a => { let s = 0; for (const nodes of a.road()) { let r = false, c = false; for (const i of nodes) { const z = zAt(a.G, i); if (z === 0) r = true; else if (z === 1) c = true; } if (r && c) s += 2; } return s; },
    dia: { g: ['RCP', 'IPI'], r: { '0,0': 'E', '1,0': 'WS', '1,1': 'N' }, l: [[1, 0, '+2']], c: '주거와 상업을 모두 지나는 도로 → +2', exp: 2 } },
  { id: 17, en: 'TOURIST TRAPS', name: '관광객 함정', desc: '도시 가장자리의 상업 블록 +2 · 안쪽의 상업 블록 −4',
    f: a => { let s = 0; eachCell(a, (i, z) => { if (z === 1) s += exposed(a.G, i) ? 2 : -4; }); return s; },
    dia: { g: ['CRIC', 'PCPR', 'IRCP'], r: {}, l: [[0, 0, '+2'], [3, 0, '+2'], [1, 1, '−4'], [2, 2, '+2']], c: '가장자리 상업 셋 +6, 안쪽 상업 −4', exp: 2 } },
  { id: 18, en: 'SPRAWLOPOLIS', name: '스프롤로폴리스', desc: '가장 긴 가로줄의 블록 수 + 가장 긴 세로줄의 블록 수 (빈 땅은 건너뛰고 블록만 셈)',
    f: a => { const { row, col } = a.lines(); let r = 0, c = 0; for (let y = a.miny; y <= a.maxy; y++) r = Math.max(r, row[y * 5 + 4]); for (let x = a.minx; x <= a.maxx; x++) c = Math.max(c, col[x * 5 + 4]); return r + c; },
    dia: { g: ['RC.PI', 'CPRIR', '.IRC.'], r: {}, l: [], c: '가장 긴 가로 5 + 가장 긴 세로 3 = +8', exp: 8 } }
];
GOALS.forEach(g => { g.num = g.id; });
// 확장팩: 카드와 점수 조건을 한 묶음으로 더한다. (카드 id·점수 조건 id는 1:1, 새 묶음은 다음 번호부터)
export const SETS = { base: { name: '기본', cards: BASE_CARDS, goals: GOALS } };
const cardsOfSets = sets => sets.flatMap(k => SETS[k].cards);
const goalOf = id => { for (const k of Object.keys(SETS)) { const g = SETS[k].goals.find(x => x.id === id); if (g) return g; } return null; };
const cardOf = id => { for (const k of Object.keys(SETS)) { const c = SETS[k].cards.find(x => x.id === id); if (c) return c; } return null; };

// 점수 한 번 계산: 블록 − 도로 + 점수 조건. mode: easy(도로 감점 없음) · normal · hard(구역 중 가장 큰 덩어리 하나만)
function scoreParts(a, goalIds, mode) {
  const per = [0, 1, 2, 3].map(z => a.sizes[z][0] || 0);
  const blocks = mode === 'hard' ? Math.max(...per) : per[0] + per[1] + per[2] + per[3];
  const pen = mode === 'easy' ? 0 : a.roads;
  const g = goalIds.map(id => goalOf(id).f(a));
  return { per, blocks, roads: a.roads, pen, g, goalSum: g.reduce((x, y) => x + y, 0), total: blocks - pen + g.reduce((x, y) => x + y, 0), a };
}

// 상태(JSON)에서 배열 격자 만들기
function gridOf(s) {
  const G = new Int16Array(SZ * SZ), L = new Int32Array(512);
  let n = 0;
  for (const [k, v] of Object.entries(s.cells)) {
    const [x, y] = k.split(',').map(Number), i = idxOf(x, y);
    G[i] = v + 1; L[n++] = i;
  }
  return { G, L, n };
}
export function scoreOf(s) {
  const { G, L, n } = gridOf(s);
  return scoreParts(analyze(G, L, n), s.goals, s.mode);
}
export const targetOf = s => s.goals.reduce((a, id) => a + goalOf(id).num, 0);

// ---------- 놓기 규칙 ----------
// 카드는 (x,y)가 왼쪽 위 칸. 겹쳐 놓아도 되고(위에 덮음), 칸의 변이 기존 칸과 맞닿아도 된다. 모서리만 닿는 것은 불가.
function legalAnchors(G, L, n) {
  let minx = 1e9, maxx = -1e9, miny = 1e9, maxy = -1e9;
  for (let k = 0; k < n; k++) { const x = xOf(L[k]), y = yOf(L[k]); if (x < minx) minx = x; if (x > maxx) maxx = x; if (y < miny) miny = y; if (y > maxy) maxy = y; }
  const out = [];
  for (let y = miny - 2; y <= maxy + 1; y++) for (let x = minx - 2; x <= maxx + 1; x++) if (anchorOk(G, x, y)) out.push([x, y]);
  return out;
}
function anchorOk(G, x, y) {
  const i = idxOf(x, y);
  if (G[i] || G[i + 1] || G[i + SZ] || G[i + SZ + 1]) return true;                                  // 겹침 = 맞닿음
  return !!(G[i - 1] || G[i + SZ - 1] || G[i + 2] || G[i + SZ + 2] || G[i - SZ] || G[i - SZ + 1] || G[i + 2 * SZ] || G[i + 2 * SZ + 1]);
}
const mv = (c, x, y, rot) => ({ t: 'play', c, x, y, rot });
function putCard(G, L, n, card, rot, x, y) {   // 격자에 놓고, 되돌릴 정보와 새 칸 수를 돌려준다
  const cs = cellsOf(card, rot), undo = [];
  let m = n;
  for (const c of cs) {
    const i = idxOf(x + c.dx, y + c.dy);
    undo.push([i, G[i]]);
    if (!G[i]) L[m++] = i;
    G[i] = val(c.z, c.m);
  }
  return { n: m, undo };
}
const unput = (G, undo) => { for (let k = undo.length - 1; k >= 0; k--) G[undo[k][0]] = undo[k][1]; };

// ---------- 게임 모듈 ----------
const sum = a => a.reduce((x, y) => x + y, 0);
function advance(s, seat) {   // 다음 차례: 왼쪽 이웃부터, 손패가 있는 첫 사람
  for (let k = 1; k <= s.n; k++) {
    const p = (seat + k) % s.n;
    if (s.hands[p].length) { s.turn = p; return; }
  }
  s.over = true;
}

const game = {
  meta: { id: 'sprawlopolis', name: '스프롤로폴리스', version: '2.0.0', players: { min: 1, max: 4 }, minutes: 15, campaign: null, autosave: { schema: 2 } },

  newGame({ players, options, rng }) {
    const n = players.length;
    const mode = options && ['easy', 'normal', 'hard'].includes(options.mode) ? options.mode : 'normal';
    const sets = options && Array.isArray(options.sets) && options.sets.every(k => SETS[k]) && options.sets.length ? options.sets : ['base'];
    const ids = rng.shuffle(cardsOfSets(sets).map(c => c.id));
    const goals = ids.splice(0, 3).sort((a, b) => a - b);           // 3장은 점수 조건으로 옆에 둔다(도시에는 쓰지 않음)
    const deck = ids;                                              // 맨 위 = 배열 끝 (앞면이 보이는 더미)
    const hands = Array.from({ length: n }, () => []);
    for (let k = 0; k < 3; k++) hands[0].push(deck.pop());
    for (let p = 1; p < n; p++) hands[p].push(deck.pop());
    const s = { v: 2, n, mode, sets, humanSeat: players.findIndex(p => p.human), goals, deck, hands, cells: {}, placed: [], turn: 0, over: false, moves: 0, last: null, fx: [] };
    const first = deck.pop(), card = cardOf(first);
    cellsOf(card, 0).forEach(c => { s.cells[`${c.dx},${c.dy}`] = c.z * 16 + c.m; });
    s.placed.push({ c: first, x: 0, y: 0, rot: 0, by: -1 });
    return s;
  },
  currentSeat: s => s.turn,
  isOver: s => s.over,
  legalMoves(s) {
    if (s.over) return [];
    const { G, L, n } = gridOf(s), anc = legalAnchors(G, L, n), out = [];
    for (const c of s.hands[s.turn]) for (let rot = 0; rot < 2; rot++) for (const [x, y] of anc) out.push(mv(c, x, y, rot));
    return out;
  },
  applyMove(s, m) {
    if (s.over) throw new Error('끝난 게임');
    const seat = s.turn, h = s.hands[seat];
    if (!m || m.t !== 'play' || !h.includes(m.c) || (m.rot !== 0 && m.rot !== 1) || !Number.isInteger(m.x) || !Number.isInteger(m.y)) throw new Error('규칙에 맞지 않는 수: ' + JSON.stringify(m));
    const g = gridOf(s);
    if (!anchorOk(g.G, m.x, m.y)) throw new Error('놓을 수 없는 자리: ' + JSON.stringify(m));
    if (Math.abs(m.x) > 28 || Math.abs(m.y) > 28) throw new Error('도시가 너무 멀리 퍼짐');
    const before = scoreParts(analyze(g.G, g.L, g.n), s.goals, s.mode).total;
    const card = cardOf(m.c), covered = cellsOf(card, m.rot).filter(c => s.cells[`${m.x + c.dx},${m.y + c.dy}`] != null).length;
    cellsOf(card, m.rot).forEach(c => { s.cells[`${m.x + c.dx},${m.y + c.dy}`] = c.z * 16 + c.m; });
    s.placed.push({ c: m.c, x: m.x, y: m.y, rot: m.rot, by: seat });
    h.splice(h.indexOf(m.c), 1);
    s.moves++;
    const after = scoreOf(s).total;
    s.fx = [{ t: 'place', seat, c: m.c, x: m.x, y: m.y, rot: m.rot, covered, gain: after - before }];
    s.last = { seat, c: m.c, x: m.x, y: m.y, rot: m.rot, covered, gain: after - before };
    if (s.n > 1) {                                                   // 남은 카드는 모두 왼쪽 이웃에게
      const rest = h.splice(0), to = (seat + 1) % s.n;
      if (rest.length) { s.hands[to].push(...rest); s.fx.push({ t: 'pass', from: seat, to, n: rest.length }); }
    }
    if (s.deck.length) { s.hands[seat].push(s.deck.pop()); s.fx.push({ t: 'draw', seat }); }   // 맨 위 카드를 뽑아 손패 채움
    advance(s, seat);
    if (s.n === 1 && !s.over) s.turn = 0;
  },
  botChoose(s, traits, rng, info) { return botChoose(s, traits, rng, info || {}); },
  result(s) {
    const sc = scoreOf(s), target = targetOf(s);
    return { coop: { won: sc.total >= target, score: sc.total }, summary: `점수 ${sc.total} / 목표 ${target}${s.mode === 'easy' ? ' (쉬움)' : s.mode === 'hard' ? ' (어려움)' : ''}` };
  },
  mount(container, ctx) { return mountSprawl(this, container, ctx); }
};
export default game;

// ---------- 협력 AI ----------
// 봇은 자기 손패 · 앞면이 보이는 더미 맨 위 · 도시만 본다(다른 사람의 손패는 모른다). 특성은 '도시를 짓는 취향'으로 읽는다:
// skill=앞을 내다보는 정도, risk=점수 조건을 노리는 대담함, patience=깔끔하고 아담한 도시를 선호, aggression=기존 건물을 덮어쓰는 과감함.
function params(tr) { const t = tr || {}; return { skill: t.skill ?? 5, risk: t.risk ?? 5, pat: t.patience ?? 5, agg: t.aggression ?? 5 }; }
function evalPlace(G, L, n, card, rot, x, y, goals, mode) {
  const p = putCard(G, L, n, card, rot, x, y);
  const r = scoreParts(analyze(G, L, p.n), goals, mode);
  unput(G, p.undo);
  return r;
}
// 지금 상태에서 한 카드를 가장 잘 놓았을 때의 점수(앞내다보기용)
function bestWith(G, L, n, cardId, goals, mode) {
  const card = cardOf(cardId), anc = legalAnchors(G, L, n);
  let best = -1e9;
  for (let rot = 0; rot < 2; rot++) for (const [x, y] of anc) { const t = evalPlace(G, L, n, card, rot, x, y, goals, mode).total; if (t > best) best = t; }
  return best;
}
function botChoose(s, tr, rng) {
  const P = params(tr), seat = s.turn, hand = s.hands[seat];
  const { G, L, n } = gridOf(s), anc = legalAnchors(G, L, n);
  const base = scoreParts(analyze(G, L, n), s.goals, s.mode);
  const cand = [];
  for (const c of hand) {
    const card = cardOf(c);
    for (let rot = 0; rot < 2; rot++) for (const [x, y] of anc) {
      const r = evalPlace(G, L, n, card, rot, x, y, s.goals, s.mode);
      // 성향: 아담한 도시(인내) · 덮어쓰기(과감) · 큰 덩어리 둘째까지 키우기(대담)
      const covered = cellsOf(card, rot).filter(q => G[idxOf(x + q.dx, y + q.dy)]).length;
      const areaGrow = Math.max(0, Math.max(r.a.maxx, base.a.maxx) - Math.min(r.a.minx, base.a.minx) + 1) * Math.max(0, Math.max(r.a.maxy, base.a.maxy) - Math.min(r.a.miny, base.a.miny) + 1);
      const adj = (P.agg - 5) * 0.12 * covered - (P.pat - 5) * 0.02 * areaGrow + (P.risk - 5) * 0.1 * (r.a.sizes[0][1] || 0);
      cand.push({ c, x, y, rot, sc: r.total, adj, r });
    }
  }
  cand.forEach(q => { q.v = q.sc + q.adj; });
  cand.sort((a, b) => b.v - a.v);
  // 같은 카드를 어디에 놓느냐 + 어떤 카드를 남겨 다음 사람에게 넘기느냐: 카드마다 가장 좋은 2곳만 앞내다보기
  const per = new Map();
  for (const q of cand) { const arr = per.get(q.c) || []; if (arr.length < 2) { arr.push(q); per.set(q.c, arr); } }
  const wf = 0.25 + P.skill * 0.05;
  const pool = [...per.values()].flat();
  if (hand.length > 1 || (s.deck.length && s.n === 1)) {
    for (const q of pool) {
      const p = putCard(G, L, n, cardOf(q.c), q.rot, q.x, q.y);
      const gains = hand.filter(h => h !== q.c).map(h => bestWith(G, L, p.n, h, s.goals, s.mode) - q.sc);
      unput(G, p.undo);
      if (gains.length) q.fut = s.n === 1 ? sum(gains) / gains.length : 0.7 * Math.max(...gains) + 0.3 * Math.min(...gains);
      q.v = q.sc + q.adj + wf * (q.fut || 0);
    }
    pool.sort((a, b) => b.v - a.v);
  } else pool.sort((a, b) => b.v - a.v);
  let pick = pool[0];
  if (pool.length > 1 && rng.chance((10 - P.skill) * 0.025)) pick = pool[Math.min(pool.length - 1, 1 + rng.int(2))];
  const gain = pick.sc - base.total;
  const why = gain <= -2 ? 'bad' : pick.r.goalSum - base.goalSum >= 3 ? 'goal' : pick.r.blocks - base.blocks >= 3 ? 'merge' : pick.r.roads < base.roads ? 'road' : gain >= 3 ? 'good' : 'normal';
  return { move: mv(pick.c, pick.x, pick.y, pick.rot), reason: why };
}
game._t = { SZ, analyze, scoreParts, gridOf, legalAnchors, anchorOk, evalPlace, bestWith, GOALS, BASE_CARDS, ROAD_SHAPES, goalOf, cardOf, mkCard, cellsOf, opp, idxOf, putCard, unput, loopCells, roadComps };

// ---------- 화면: "도시 설계도" 테마 ----------
const esc = t => String(t).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const BW = 42, BH = 30;                                    // 블록 하나의 크기(SVG 단위): 실제 카드처럼 가로로 긴 직사각형 (카드 = 84×60)
const DEFS = `<symbol id="sr-z0" viewBox="0 0 30 30"><path d="M6 16 L15 7 L24 16 H21 V24 H9 V16Z" fill="#fff"/><rect x="13" y="17" width="4" height="7" fill="#0006"/></symbol>
  <symbol id="sr-z1" viewBox="0 0 30 30"><rect x="6" y="9" width="8" height="15" fill="#fff"/><rect x="16" y="14" width="8" height="10" fill="#fff"/><g fill="#0006"><rect x="8" y="12" width="2" height="2"/><rect x="8" y="17" width="2" height="2"/><rect x="18" y="17" width="2" height="2"/></g></symbol>
  <symbol id="sr-z2" viewBox="0 0 30 30"><path d="M5 24 V14 L11 18 V14 L17 18 V9 H21 V18 L25 14 V24Z" fill="#fff"/><rect x="18" y="5" width="3" height="5" fill="#fff"/></symbol>
  <symbol id="sr-z3" viewBox="0 0 30 30"><circle cx="15" cy="12" r="7" fill="#fff"/><circle cx="10" cy="17" r="5" fill="#fff"/><circle cx="20" cy="17" r="5" fill="#fff"/><rect x="14" y="18" width="3" height="8" fill="#fff"/></symbol>`;
const ROAD = '#2b303a';
function roadSVG(m, cx, cy, bw, bh, rw) {   // 블록 한가운데에서 열린 방향의 가장자리까지
  if (!m) return '';
  let d = '';
  BIT.forEach((b, k) => { if (m & b) d += `M${cx} ${cy}L${cx + [0, 1, 0, -1][k] * bw / 2} ${cy + [-1, 0, 1, 0][k] * bh / 2}`; });
  return `<path d="${d}" stroke="${ROAD}" stroke-width="${rw}" fill="none"/><circle cx="${cx}" cy="${cy}" r="${rw / 2}" fill="${ROAD}"/><path d="${d}" stroke="#f4e9b5" stroke-width="1.1" stroke-dasharray="3 3" fill="none" opacity=".85"/>`;
}
const cellSVG = (z, m, px, py, extra = '') => `<g${extra}><rect x="${px}" y="${py}" width="${BW}" height="${BH}" fill="${ZONE_COLOR[z]}" stroke="#0007" stroke-width=".8"/><use href="#sr-z${z}" x="${px + (BW - 26) / 2}" y="${py + (BH - 26) / 2}" width="26" height="26" opacity=".42"/>${roadSVG(m, px + BW / 2, py + BH / 2, BW, BH, BH * 0.3)}</g>`;
const cardSVG = (card, rot) => `<svg class="sr-cardsvg" viewBox="0 0 ${2 * BW} ${2 * BH}" aria-hidden="true">${cellsOf(card, rot).map(c => cellSVG(c.z, c.m, c.dx * BW, c.dy * BH)).join('')}<rect x=".8" y=".8" width="${2 * BW - 1.6}" height="${2 * BH - 1.6}" fill="none" stroke="#f1e6c3" stroke-width="1.6" rx="3"/></svg>`;
const cardHTML = (id, o = {}) => `<div class="sr-card${o.cls || ''}"${o.attr || ''}>${cardSVG(cardOf(id), o.rot || 0)}</div>`;
const backHTML = (o = {}) => `<div class="sr-card sr-back${o.cls || ''}"${o.attr || ''}><svg class="sr-cardsvg" viewBox="0 0 84 60"><rect x="1" y="1" width="82" height="58" rx="4" fill="#1d2b3f" stroke="#e8a33d" stroke-width="1.6"/><path d="M8 8H76V52H8Z M8 30H76 M42 8V52" fill="none" stroke="#e8a33d" stroke-opacity=".5" stroke-width="1.2"/><circle cx="42" cy="30" r="8" fill="#1d2b3f" stroke="#e8a33d" stroke-width="1.4"/></svg></div>`;

// 점수 조건 카드 뒷면 그림(설명용 작은 도시)
const DW = 20, DH = 14;
function diaSVG(d) {
  const rows = d.g, h = rows.length, w = Math.max(...rows.map(r => r.length));
  let o = `<svg class="sr-dia" viewBox="0 0 ${w * DW + 8} ${h * DH + 8}" aria-hidden="true"><g transform="translate(4 4)">`;
  rows.forEach((row, y) => [...row].forEach((ch, x) => { const z = ZONES.indexOf(ch); if (z >= 0) o += `<rect x="${x * DW}" y="${y * DH}" width="${DW}" height="${DH}" fill="${ZONE_COLOR[z]}" stroke="#fffb" stroke-width=".8"/>`; }));
  let p = '';
  for (const [k, ds] of Object.entries(d.r || {})) { const [x, y] = k.split(',').map(Number), cx = x * DW + DW / 2, cy = y * DH + DH / 2; p += `M${cx} ${cy}`; for (const ch of ds) { const dir = 'NESW'.indexOf(ch); p += `M${cx} ${cy}L${cx + [0, 1, 0, -1][dir] * DW / 2} ${cy + [-1, 0, 1, 0][dir] * DH / 2}`; } }
  if (p) o += `<path d="${p}" stroke="${ROAD}" stroke-width="4.4" fill="none"/><path d="${p}" stroke="#f4e9b5" stroke-width="1" stroke-dasharray="2.5 2.5" fill="none"/>`;
  for (const [x, y, t] of d.l || []) { const neg = /^[−-]/.test(t); o += `<text x="${x * DW + DW / 2}" y="${y * DH + DH / 2 + 0.5}" text-anchor="middle" dominant-baseline="central" font-size="9.5" font-weight="800" font-family="sans-serif" fill="${neg ? '#ffc4c4' : '#fff6b0'}" stroke="#000c" stroke-width="2.4" paint-order="stroke">${t}</text>`; }
  return o + '</g></svg>';
}
const goalCardHTML = (id, o = {}) => { const g = goalOf(id); return `<div class="sr-gc${o.on ? ' on' : ''}"><i class="sr-gn">${g.num}</i><b class="sr-gen">${esc(g.en)}</b><b class="sr-gko">${esc(g.name)}</b><p>${esc(g.desc)}</p>${g.dia ? `${diaSVG(g.dia)}<small>${esc(g.dia.c)}</small>` : ''}${o.pts != null ? `<span class="sr-gnow${o.pts < 0 ? ' neg' : ''}">지금 ${o.pts >= 0 ? '+' : ''}${o.pts}점</span>` : ''}</div>`; };

function boardSVG(s, ghost, hint) {
  const keys = Object.keys(s.cells).map(k => k.split(',').map(Number));
  let minx = Math.min(...keys.map(k => k[0])), maxx = Math.max(...keys.map(k => k[0])), miny = Math.min(...keys.map(k => k[1])), maxy = Math.max(...keys.map(k => k[1]));
  if (ghost) { minx = Math.min(minx, ghost.x); maxx = Math.max(maxx, ghost.x + 1); miny = Math.min(miny, ghost.y); maxy = Math.max(maxy, ghost.y + 1); }
  minx -= 2; maxx += 2; miny -= 2; maxy += 2;
  const need = (lo, hi, min) => { const w = hi - lo + 1; if (w >= min) return [lo, hi]; const add = min - w; return [lo - Math.floor(add / 2), hi + Math.ceil(add / 2)]; };
  [minx, maxx] = need(minx, maxx, 9); [miny, maxy] = need(miny, maxy, 7);
  const W = (maxx - minx + 1) * BW, H = (maxy - miny + 1) * BH;
  let out = `<svg class="sr-bsvg" viewBox="${minx * BW} ${miny * BH} ${W} ${H}" data-minx="${minx}" data-miny="${miny}" preserveAspectRatio="xMidYMid meet">`;
  const grid = []; for (let x = minx; x <= maxx + 1; x++) grid.push(`M${x * BW} ${miny * BH}V${(maxy + 1) * BH}`); for (let y = miny; y <= maxy + 1; y++) grid.push(`M${minx * BW} ${y * BH}H${(maxx + 1) * BW}`);
  out += `<path d="${grid.join('')}" stroke="#9fc4e6" stroke-opacity=".14" stroke-width=".8" fill="none"/>`;
  if (hint) for (const k of hint) { const [x, y] = k.split(',').map(Number); out += `<rect class="sr-hint" x="${x * BW + 2}" y="${y * BH + 2}" width="${BW - 4}" height="${BH - 4}" rx="3"/>`; }
  for (const [k, v] of Object.entries(s.cells)) { const [x, y] = k.split(',').map(Number); out += cellSVG(v >> 4, v & 15, x * BW, y * BH); }
  if (s.last) out += `<rect class="sr-last" x="${s.last.x * BW}" y="${s.last.y * BH}" width="${2 * BW}" height="${2 * BH}" fill="none" stroke="#ffd34d" stroke-width="2.4" rx="3"/>`;
  if (ghost) {
    out += `<g class="sr-ghost" opacity=".86">${cellsOf(cardOf(ghost.c), ghost.rot).map(c => cellSVG(c.z, c.m, (ghost.x + c.dx) * BW, (ghost.y + c.dy) * BH)).join('')}</g><rect x="${ghost.x * BW}" y="${ghost.y * BH}" width="${2 * BW}" height="${2 * BH}" fill="none" stroke="#fff" stroke-width="2.2" stroke-dasharray="5 3" rx="3"/>`;
  }
  return out + '</svg>';
}

function validState(st, n) { return !!(st && st.v === 2 && st.n === n && Array.isArray(st.hands) && st.hands.length === n && Array.isArray(st.goals) && st.goals.length === 3 && st.cells && !st.over); }
const MODE_KO = { easy: '쉬움', normal: '보통', hard: '어려움' };
const LIFT = 38;                                           // 드래그할 때 손가락 위로 카드를 띄우는 거리(px)

function mountSprawl(self, container, ctx) {
  const rng = ctx.rng, th = ctx.theme || {}, n = ctx.players.length;
  const timers = new Set(), speech = {}, logs = [];
  let dead = false, finished = false, lock = false, started = false;
  let sel = null, rot = 0, anchor = null, hintCache = null, drag = null, noClickUntil = 0;
  const resumed = validState(ctx.resumeState, n) && ctx.players[ctx.resumeState.humanSeat] && ctx.players[ctx.resumeState.humanSeat].human;
  const s = resumed ? ctx.resumeState : self.newGame({ players: ctx.players, options: { mode: 'normal' }, rng });
  const hs = s.humanSeat;
  let seenHand = new Set(s.hands[hs]);

  container.innerHTML = `<style>${CSS}</style>
    <div class="g-sprawlopolis" style="--acc:${th.accent || '#e8a33d'};--tb:${th.table || '#2c3a4a'};--tb2:${th.table2 || '#141c26'}">
      <svg class="sr-defs" width="0" height="0" aria-hidden="true">${DEFS}</svg>
      <div class="sr-top"><span class="sr-prog"></span><span class="sr-tb"><button data-a="goals">조건 도감</button><button data-a="log">기록</button><button data-a="rules">규칙</button></span></div>
      <div class="sr-goals"></div>
      <div class="sr-mates"></div>
      <div class="sr-board"></div>
      <div class="sr-meter" data-a="score"></div>
      <div class="sr-deckrow"></div>
      <div class="sr-dock"></div>
      <div class="sr-hand"></div>
      <div class="sr-ov" hidden></div>
      <div class="sr-toasts"></div>
    </div>`;
  const q = x => container.querySelector(x);
  const root = q('.g-sprawlopolis'), topBar = q('.sr-prog'), goalsBox = q('.sr-goals'), matesBox = q('.sr-mates'), boardBox = q('.sr-board'), meter = q('.sr-meter'),
    deckRow = q('.sr-deckrow'), dock = q('.sr-dock'), handBox = q('.sr-hand'), ov = q('.sr-ov'), toasts = q('.sr-toasts');
  const later = (fn, ms) => { const id = setTimeout(() => { timers.delete(id); if (!dead) fn(); }, ms); timers.add(id); return id; };
  const nameOf = seat => (ctx.players[seat].human ? '나' : ctx.players[seat].name.split(' ').pop());
  const colorOf = seat => ctx.players[seat].color || '#888';
  const fillAv = box => box.querySelectorAll('[data-av]').forEach(e => { if (!e.firstChild) e.append(ctx.avatar(+e.dataset.av, 'css')); });
  const myTurn = () => !s.over && s.turn === hs;
  const D = ms => (ctx.delay ? ctx.delay(ms) : ms);
  const fx = ctx.fx ? ctx.fx.scope(root) : new Proxy({}, { get: (t, k) => (k === 'on' ? false : k === 'rect' || k === 'union' ? () => null : () => Promise.resolve()) });
  const snd = name => fx.sfx(name);
  const target = targetOf(s);
  const totalCards = 15;

  // ----- 그리기 -----
  const placedCount = () => s.placed.length;
  function drawTop() { topBar.innerHTML = `<b>${placedCount()}</b><small>/${totalCards}장</small><span class="sr-mode">${MODE_KO[s.mode]}</span>`; }
  function goalChips() {
    const sc = scoreOf(s);
    return s.goals.map((id, k) => { const g = goalOf(id); return `<button class="sr-goal" data-goal="${id}"><b>${esc(g.name)}</b><small>${esc(g.desc)}</small><span class="sr-gp${sc.g[k] < 0 ? ' neg' : ''}">${sc.g[k] >= 0 ? '+' : ''}${sc.g[k]}</span><i class="sr-gn" title="목표 점수에 더해지는 숫자">${g.num}</i></button>`; }).join('');
  }
  function drawGoals() { goalsBox.innerHTML = goalChips(); }
  function drawMates() {
    const mates = ctx.players.filter(p => !p.human);
    matesBox.className = 'sr-mates n' + mates.length;
    matesBox.innerHTML = mates.map(pl => {
      const i = pl.seat, h = s.hands[i], sp = speech[i];
      return `<div class="sr-mate${!s.over && s.turn === i ? ' turn' : ''}" data-seat="${i}" style="--pc:${colorOf(i)}">
        <div class="sr-mh"><span class="sr-av" data-av="${i}"></span><b class="sr-mn">${nameOf(i)}</b><span class="sr-mc">${h.length}<small>장</small></span></div>
        <div class="sr-mbacks">${h.map((_, k) => `<i class="sr-mb" style="--k:${k}"></i>`).join('') || '<em>빈손</em>'}</div>
        ${sp ? `<div class="sr-say${sp.fresh ? ' pop' : ''}" data-say="${i}">${esc(sp.t)}</div>` : ''}</div>`;
    }).join('');
    Object.values(speech).forEach(x => { x.fresh = false; });
    fillAv(matesBox);
  }
  // 선택한 카드로 놓을 수 있는 칸 (손으로 누를 수 있다는 표시)
  function legalInfo() {
    if (hintCache && hintCache.moves === s.moves) return hintCache;
    const g = gridOf(s), anc = legalAnchors(g.G, g.L, g.n), cells = new Set();
    anc.forEach(([x, y]) => { for (let dx = 0; dx < 2; dx++) for (let dy = 0; dy < 2; dy++) cells.add(`${x + dx},${y + dy}`); });
    hintCache = { moves: s.moves, anc, ancSet: new Set(anc.map(a => a.join(','))), cells, g };
    return hintCache;
  }
  function drawBoard() {
    const ghostC = sel != null && anchor ? { c: sel, rot, x: anchor.x, y: anchor.y } : null;
    boardBox.innerHTML = boardSVG(s, ghostC, sel != null && myTurn() ? legalInfo().cells : null);
  }
  function drawMeter() {
    const sc = scoreOf(s), pct = Math.max(0, Math.min(100, (sc.total / target) * 100)), ok = sc.total >= target;
    meter.innerHTML = `<div class="sr-mrow"><span>점수 <b class="${ok ? 'ok' : ''}">${sc.total}</b> / 목표 <b>${target}</b></span><small>블록 ${sc.blocks} − 도로 ${sc.pen} + 조건 ${sc.goalSum} ▸ 자세히</small></div><div class="sr-bar${ok ? ' ok' : ''}"><i style="width:${pct}%"></i></div>`;
  }
  function drawDeck() {
    const top = s.deck.length ? s.deck[s.deck.length - 1] : null;
    deckRow.innerHTML = `<span class="sr-dk"><span class="sr-dkn"><b>${s.deck.length}</b>장 남음</span>${top ? cardHTML(top, { cls: ' sr-mini sr-dtop' }) : '<span class="sr-card sr-mini sr-empty"></span>'}<small>${top ? '맨 위 카드(공개)' : '더미 없음'}</small></span><span class="sr-modeinfo">${s.mode === 'easy' ? '도로 감점 없음' : s.mode === 'hard' ? '블록은 가장 큰 덩어리 하나만' : ''}</span>`;
  }
  function drawHand() {
    const h = s.hands[hs], act = myTurn() && !lock;
    handBox.style.setProperty('--n', Math.max(2, h.length));
    handBox.className = 'sr-hand' + (myTurn() ? ' turn' : '');
    handBox.innerHTML = h.length ? h.map((c, k) => cardHTML(c, { cls: (sel === c ? ' sel' : '') + (!seenHand.has(c) ? ' deal' : '') + (act ? ' live' : ''), attr: ` data-c="${c}" style="--k:${k}"`, rot: sel === c ? rot : 0 })).join('') : '<div class="sr-nohand">지금은 손패가 없어요</div>';
    seenHand = new Set(h);
  }
  function drawDock() {
    const parts = [];
    const msg = (b, sm) => `<div class="sr-msg"><b>${b}</b>${sm ? `<small>${sm}</small>` : ''}</div>`;
    const btn = (a, label, on = true, cls = '') => `<button class="sr-btn ${cls}" data-a="${a}"${on ? '' : ' disabled'}>${label}</button>`;
    if (s.over) parts.push(msg(scoreOf(s).total >= target ? '도시가 완성됐어요!' : '도시가 완성됐어요…', `점수 ${scoreOf(s).total} / 목표 ${target}`));
    else if (!myTurn()) parts.push(msg(`${nameOf(s.turn)} 생각 중…`, s.last && s.last.seat !== hs && s.last.seat >= 0 ? lastText(s.last) : ''));
    else if (sel == null) parts.push(msg('내 차례 — 카드를 끌어다 도시에 놓으세요', s.n > 1 ? '카드를 눌러 고른 뒤 칸을 눌러도 돼요. 남은 카드는 왼쪽 동료에게 넘어가요' : '카드를 눌러 고른 뒤 칸을 눌러도 돼요. 한 장을 놓으면 새 카드를 뽑아요'));
    else if (!anchor) parts.push(msg('도시 위로 끌어다 놓거나 칸을 눌러 보세요', '고른 카드를 한 번 더 누르면 180° 돌아가요'), btn('rot', '↻ 돌리기', true, 'ghost'), btn('cancel', '취소', true, 'ghost'));
    else {
      const g = legalInfo().g, p = evalPlace(g.G, g.L, g.n, cardOf(sel), rot, anchor.x, anchor.y, s.goals, s.mode), cur = scoreOf(s).total, d = p.total - cur;
      parts.push(msg(`놓으면 점수 ${p.total} <em class="${d >= 0 ? 'up' : 'down'}">(${d >= 0 ? '+' : ''}${d})</em>`, `목표까지 ${Math.max(0, target - p.total)}점`), btn('rot', '↻', true, 'ghost'), btn('cancel', '취소', true, 'ghost'), btn('place', '여기에 놓기', true, 'go'));
    }
    dock.className = 'sr-dock' + (myTurn() ? ' mine' : '');
    dock.innerHTML = parts.join('');
  }
  function lastText(L) {
    if (!L || L.seat < 0) return '';
    return `${L.gain >= 0 ? '+' : ''}${L.gain}점${L.covered ? ` · ${L.covered}칸 덮음` : ''}`;
  }
  function draw() { drawTop(); drawGoals(); drawMates(); drawBoard(); drawMeter(); drawDeck(); drawDock(); drawHand(); }

  // ----- 연출 -----
  function toast(t, cls = '') { const d = document.createElement('div'); d.className = 'sr-toast ' + cls; d.textContent = t; toasts.append(d); later(() => d.remove(), D(2200)); }
  const panelOf = seat => (seat === hs ? handBox : matesBox.querySelector(`[data-seat="${seat}"]`));
  const rectOf = el => (el ? fx.rect(el) : null);
  const wOf = r => (r ? (r.w != null ? r.w : r.width) : 0);
  function ghost(html, fromRect, to, o = {}) {
    if (!fx.on || !fromRect || !to) return Promise.resolve();
    const box = document.createElement('div'); box.innerHTML = html; const node = box.firstElementChild; if (!node) return Promise.resolve();
    const w = o.w || wOf(fromRect) || 64;
    node.style.setProperty('--cw', w + 'px');
    return fx.fly({ from: fromRect, to, node, size: { w, h: Math.round(w * 5 / 7) }, delay: o.delay || 0, dur: o.dur || 420, scale: o.scale == null ? 0.8 : o.scale, arc: o.arc == null ? 0.2 : o.arc, spin: o.spin || 0, fade: o.fade });
  }
  function log(t, cls = '') { logs.push({ t, cls }); if (logs.length > 120) logs.shift(); }
  function say(seat, key) {
    if (ctx.players[seat].human || speech[seat]) return;
    const t = ctx.say(seat, key); if (!t) return;
    speech[seat] = { t, fresh: true };
    log(`「${nameOf(seat)}」 ${t}`, 'sp');
    drawMates();
    later(() => { delete speech[seat]; drawMates(); }, ctx.readMs(t));
  }
  function confetti() {
    const box = document.createElement('div'); box.className = 'sr-conf';
    const cols = ['#e8913a', '#4b9ce0', '#5db05b', '#8d95a3', '#ffd34d', '#fff'];
    for (let i = 0; i < 46; i++) { const e = document.createElement('i'); e.style.cssText = `left:${(i * 37) % 100}%;background:${cols[i % 6]};animation-delay:${(i % 10) * 0.08}s;animation-duration:${1.7 + (i % 7) * 0.15}s`; box.append(e); }
    root.append(box); later(() => box.remove(), 3400);
  }

  // ----- 진행 -----
  function step(seat, move, reason) {
    if (s.over) return;
    const src = seat === hs ? rectOf(handBox.querySelector(`[data-c="${move.c}"]`)) : rectOf(panelOf(seat));
    const deckRect = rectOf(deckRow.querySelector('.sr-dtop'));
    const wasSel = sel; sel = null; anchor = null;
    self.applyMove(s, move);
    const E = s.fx.slice(), L = s.last;
    if (!s.over && ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s)));
    lock = seat === hs;
    draw();
    if (seat === hs) later(() => { lock = false; drawHand(); }, D(650));
    // 카드를 도시로 날리기 → 탁!
    const tgt = boardBox.querySelector('.sr-last');
    snd('card');
    const cw = Math.min(96, Math.max(60, wOf(boardBox.getBoundingClientRect ? fx.rect(boardBox) : null) / 5));
    ghost(cardHTML(move.c, { rot: move.rot, cls: ' sr-gh' }), src, tgt, { w: cw, dur: 420, scale: 1, spin: seat === hs ? 0 : -6 });
    const who = nameOf(seat);
    log(`${who}: 카드 ${move.c}번을 놓음 (${L.gain >= 0 ? '+' : ''}${L.gain}점${L.covered ? ` · ${L.covered}칸 덮음` : ''})`, L.gain < 0 ? 'bad' : 'good');
    later(() => {
      const svg = boardBox.querySelector('.sr-bsvg'); snd('slam'); if (svg) fx.shake(svg, 3);
      fx.buzz(12);
      if (L.gain !== 0) fx.float(boardBox, `${L.gain > 0 ? '+' : ''}${L.gain}`, { color: L.gain > 0 ? '#ffe08a' : '#ff9aa4', size: 34 });
      if (L.gain >= 4) { snd('gain'); fx.burst(boardBox, { color: ['#ffd34d', '#fff', '#e8913a'], n: 16 }); }
      if (L.gain < 0) snd('bad');
      const mt = meter.querySelector('b'); if (mt) fx.pop(mt, 1.3);
    }, D(430));
    // 남은 카드 넘기기 · 새 카드 뽑기
    let t = 520;
    for (const f of E) {
      if (f.t === 'pass') {
        later(() => { snd('deal'); for (let k = 0; k < f.n; k++) ghost(backHTML(), rectOf(panelOf(f.from)), panelOf(f.to), { delay: k * 90, w: 46, dur: 420, scale: 0.8 }); const pn = panelOf(f.to); if (pn) fx.pop(pn, 1.03); }, D(t));
        log(`${nameOf(f.from)} → ${nameOf(f.to)}: 카드 ${f.n}장 넘김`, 'dim');
        t += 420;
      }
      if (f.t === 'draw') {
        later(() => { if (deckRect && panelOf(f.seat)) ghost(backHTML(), deckRect, panelOf(f.seat), { w: 46, dur: 420, scale: 0.8 }); snd('flip'); }, D(t));
        t += 260;
      }
    }
    if (seat !== hs) {
      if (['good', 'goal', 'merge', 'road'].includes(reason) && rng.chance(0.55)) say(seat, 'good');
      else if (reason === 'bad') say(seat, 'bad');
    } else void wasSel;
    if (s.over) return finish();
    loop();
  }
  function loop(first) {
    if (dead || s.over || !started) return;
    const seat = s.turn, p = ctx.players[seat];
    if (p.human) { if (fx.buzz) fx.buzz(12); return; }
    later(() => {
      const ch = self.botChoose(s, p.traits, rng, { seat, rivalSeats: p.rivalSeats, allySeats: p.allySeats });
      step(seat, ch.move, ch.reason);
    }, D(first ? 1900 : 1300));
  }
  function breakdownHTML() {
    const sc = scoreOf(s), won = sc.total >= target;
    const chip = (z, v) => `<span class="sr-chip" style="background:${ZONE_COLOR[z]}"><i>${ZONE_KO[z]}</i><b>${v}</b></span>`;
    return `<div class="sr-chips">${[0, 1, 2, 3].map(z => chip(z, sc.per[z])).join('')}</div>
      <table class="sr-tbl"><tr><td>블록 (${s.mode === 'hard' ? '가장 큰 덩어리 하나' : '구역별 가장 큰 덩어리 합'})</td><td>${sc.blocks}</td></tr>
      <tr><td>도로 ${sc.roads}개${s.mode === 'easy' ? ' (쉬움: 감점 없음)' : ''}</td><td>−${sc.pen}</td></tr>
      ${s.goals.map((id, k) => `<tr><td>${esc(goalOf(id).name)}<br><small>${esc(goalOf(id).desc)}</small></td><td>${sc.g[k] >= 0 ? '+' : ''}${sc.g[k]}</td></tr>`).join('')}
      <tr class="tot"><td>합계</td><td>${sc.total}</td></tr><tr><td>목표 (${s.goals.map(id => goalOf(id).num).join(' + ')})</td><td>${target}</td></tr></table>
      <p class="sr-fs ${won ? 'ok' : 'no'}">${won ? '목표 달성!' : `목표까지 ${target - sc.total}점 모자라요`}</p>`;
  }
  function finish() {
    if (finished) return; finished = true;
    if (ctx.clearAutosave) ctx.clearAutosave();
    const res = self.result(s), won = res.coop.won;
    ctx.players.forEach(p => { if (!p.human) say(p.seat, won ? 'win' : 'lose'); });
    log(won ? '목표 달성! 도시 완성' : '목표에 닿지 못했어요', won ? 'good' : 'bad');
    later(() => {
      if (won) { snd('win'); confetti(); fx.burst(root, { color: ['#ffd34d', '#fff', '#e8913a', '#5db05b'], n: 30, spread: 140 }); } else { snd('lose'); fx.shake(root, 8); }
      openOv(`<h3 class="sr-ft ${won ? 'win' : 'lose'}">${won ? '시장님이 웃었다!' : '시장님이 한숨을 쉰다…'}</h3>${breakdownHTML()}<button class="sr-btn go wide" data-a="finish">기록 저장하고 마치기</button>`, true);
      ov._res = res;
    }, D(1500));
  }

  // ----- 겹쳐 뜨는 창 -----
  function openOv(html, keep) { ov.innerHTML = `<div class="sr-sheet">${html}${keep ? '' : '<button class="sr-btn wide" data-a="close">닫기</button>'}</div>`; ov.hidden = false; fillAv(ov); }
  const closeOv = () => { ov.hidden = true; ov.innerHTML = ''; };
  function openLog() { openOv(`<h3 class="sr-ft">진행 기록</h3><div class="sr-log">${logs.slice().reverse().map(l => `<div class="${l.cls}">${esc(l.t)}</div>`).join('') || '<div>아직 기록이 없어요</div>'}</div>`); }
  function openGoal(id) { const sc = scoreOf(s), k = s.goals.indexOf(id); openOv(`<h3 class="sr-ft">점수 조건 카드 (뒷면)</h3>${goalCardHTML(id, { pts: k >= 0 ? sc.g[k] : null, on: k >= 0 })}`); }
  function openGoals() {
    const sc = scoreOf(s), all = Object.values(SETS).flatMap(x => x.goals).sort((a, b) => a.id - b.id);
    openOv(`<h3 class="sr-ft">점수 조건 도감</h3><p class="sr-fs">이번 판에 쓰는 3장은 금색 테두리예요.<br>카드 위 숫자는 목표 점수에 더해지는 값입니다.</p><div class="sr-glist">${all.map(g => { const k = s.goals.indexOf(g.id); return goalCardHTML(g.id, { on: k >= 0, pts: k >= 0 ? sc.g[k] : null }); }).join('')}</div>`);
  }
  function openRules() {
    openOv(`<h3 class="sr-ft">규칙</h3><ul class="sr-rules">
      <li><b>목표</b> 카드 15장으로 도시를 완성해 <b>목표 점수</b> 이상을 얻으면 승리. 목표 점수 = 점수 조건 카드 3장의 숫자 합.</li>
      <li><b>카드</b> 가로로 긴 카드 한 장은 블록 4개(주거·상업·공업·공원 하나씩)이고, 도로는 블록 한가운데를 지나요.</li>
      <li><b>내 차례</b> 손패 한 장을 <b>끌어다</b> 도시에 놓아요(카드를 눌러 고른 뒤 칸을 눌러도 됩니다). 새 카드는 이미 놓인 칸과 <b>변이 맞닿거나</b> 칸을 <b>덮어서</b> 놓아야 하고, 모서리만 닿는 건 안 돼요. 고른 카드를 한 번 더 누르면 180도 돌아가요(가로 그대로). 중간에 빈 땅이 생겨도 괜찮아요.</li>
      <li><b>카드 넘기기</b> 2~4인: 한 장을 놓고 남은 카드는 모두 왼쪽 동료에게 넘기고, 더미 맨 위 카드 한 장을 뽑아요. 넘겨받은 동료가 다음 차례. 솔로: 한 장을 놓고 한 장을 뽑아 손패 3장을 유지해요.</li>
      <li><b>블록</b> 구역(주거·상업·공업·공원)별로 <b>가장 큰 덩어리</b>의 칸 수가 1칸당 1점. 덩어리 = 변으로 이어진 같은 구역.</li>
      <li><b>도로</b> 길이 이어진 하나하나가 도로 1개이고 도로 1개당 −1점. 카드 경계에서 마주 보는 길끼리 이어져요.</li>
      <li><b>점수 조건</b> 위쪽의 3장(누르면 뒷면 그림 설명). 점수를 더하거나 깎아요. 오른쪽 위 숫자는 목표 점수에 더해지는 값.</li>
      <li><b>난이도</b> 쉬움: 도로 감점 없음 · 어려움: 블록은 가장 큰 덩어리 하나만 점수.</li>
      <li>봇 동료는 서로의 손패를 모르고 자기 카드와 공개된 더미 맨 위 카드만 보고 판단해요. 카드와 점수 조건은 원본 카드를 옮긴 구성이에요.</li></ul>`);
  }
  function openModePick() {
    openOv(`<h3 class="sr-ft">도시 설계 시작</h3><p class="sr-fs">${n === 1 ? '혼자서' : `동료 ${n - 1}명과 함께`} 15장으로 도시를 지어요.<br>목표 점수 <b>${target}</b> 이상이면 승리!</p>
      <div class="sr-modes">${['easy', 'normal', 'hard'].map(m => `<button class="sr-btn ${s.mode === m ? 'go' : ''}" data-mode="${m}"><b>${MODE_KO[m]}</b><small>${m === 'easy' ? '도로 감점 없음' : m === 'normal' ? '기본 규칙' : '블록은 가장 큰 덩어리 하나만'}</small></button>`).join('')}</div>
      <button class="sr-btn go wide" data-a="begin">시작</button>`, true);
  }
  function begin() { started = true; closeOv(); drawTop(); drawMeter(); drawDeck(); snd('deal'); loop(true); }

  // ----- 입력 -----
  function pickAnchor(cx, cy) {
    const info = legalInfo();
    const cands = [[cx, cy], [cx - 1, cy], [cx, cy - 1], [cx - 1, cy - 1]].filter(([x, y]) => info.ancSet.has(`${x},${y}`));
    if (!cands.length) return null;
    const at = anchor ? cands.findIndex(([x, y]) => x === anchor.x && y === anchor.y) : -1;
    const [x, y] = cands[(at + 1) % cands.length];
    return { x, y };
  }
  const toBoard = (clientX, clientY) => {   // 화면 좌표 → 판 위의 칸 좌표(소수)
    const svg = boardBox.querySelector('.sr-bsvg'); if (!svg) return null;
    const m = svg.getScreenCTM(); if (!m) return null;
    const pt = svg.createSVGPoint(); pt.x = clientX; pt.y = clientY;
    const p = pt.matrixTransform(m.inverse());
    return { fx: p.x / BW, fy: p.y / BH };
  };
  root.addEventListener('click', e => {
    if (dead) return;
    const t = e.target;
    const sayEl = t.closest('[data-say]');
    if (sayEl) { delete speech[+sayEl.dataset.say]; drawMates(); return; }
    const md = t.closest('[data-mode]');
    if (md) { s.mode = md.dataset.mode; openModePick(); drawMeter(); drawDeck(); drawTop(); drawGoals(); snd('tap'); return; }
    const gl = t.closest('[data-goal]');
    if (gl) { snd('tap'); return openGoal(+gl.dataset.goal); }
    const a = t.closest('[data-a]');
    if (a && !a.disabled) {
      const k = a.dataset.a;
      if (k === 'log') return openLog();
      if (k === 'rules') return openRules();
      if (k === 'goals') return openGoals();
      if (k === 'score') { if (started || resumed) return openOv(`<h3 class="sr-ft">현재 점수</h3>${breakdownHTML()}`); return; }
      if (k === 'close') return closeOv();
      if (k === 'begin') return begin();
      if (k === 'finish') { a.disabled = true; closeOv(); ctx.finish(ov._res); return; }
      if (!myTurn() || lock) return;
      if (k === 'rot') { rot = rot ? 0 : 1; snd('tap'); drawBoard(); drawHand(); return drawDock(); }
      if (k === 'cancel') { sel = null; anchor = null; snd('tap'); drawBoard(); drawHand(); return drawDock(); }
      if (k === 'place') { if (sel == null || !anchor) return; if (fx.buzz) fx.buzz(8); const mvv = mv(sel, anchor.x, anchor.y, rot); rot = 0; return step(hs, mvv, 'human'); }
      return;
    }
    if (e.target === ov && !finished && started) { closeOv(); return; }
    const card = t.closest('.sr-hand [data-c]');
    if (card && myTurn() && !lock) {
      if (performance.now() < noClickUntil) return;
      const c = +card.dataset.c;
      if (sel === c) { rot = rot ? 0 : 1; } else { sel = c; rot = 0; anchor = null; }   // 고른 카드를 다시 누르면 180도 돌림
      snd('tap'); if (fx.buzz) fx.buzz(6);
      drawBoard(); drawHand(); drawDock(); return;
    }
    const svg = t.closest('.sr-bsvg');
    if (svg && sel != null && myTurn() && !lock) {
      const p = toBoard(e.clientX, e.clientY); if (!p) return;
      const next = pickAnchor(Math.floor(p.fx), Math.floor(p.fy));
      if (!next) { snd('bad'); return; }
      anchor = next; snd('place'); if (fx.buzz) fx.buzz(6);
      drawBoard(); drawDock();
    }
  });

  // ----- 끌어서 놓기 -----
  // 손패의 카드를 누른 채 움직이면 손가락 위로 카드가 떠오르고, 도시 위에서는 가장 가까운 놓을 수 있는 자리에 붙어 미리 보인다. 손을 떼면 그 자리에 놓는다.
  function nearestAnchor(fx_, fy_) {   // 카드 중심이 (fx_, fy_)에 오도록 했을 때 가장 가까운 합법 자리 (한 칸 넘게 떨어지면 없음)
    const info = legalInfo(), ax = fx_ - 1, ay = fy_ - 1;
    let best = null, bd = 1e9;
    for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) {
      const x = Math.round(ax) + dx, y = Math.round(ay) + dy;
      if (!info.ancSet.has(`${x},${y}`)) continue;
      const d = (x - ax) * (x - ax) + (y - ay) * (y - ay);
      if (d < bd) { bd = d; best = { x, y }; }
    }
    return bd <= 1.6 ? best : null;
  }
  function dragEnd(cancel) {
    if (!drag) return;
    const d = drag; drag = null;
    try { d.el.releasePointerCapture(d.id); } catch { /* 이미 풀림 */ }
    if (!d.on) return;
    noClickUntil = performance.now() + 400;
    if (d.node) d.node.remove();
    d.el.classList.remove('lifted');
    if (!cancel && anchor && myTurn() && !lock && sel != null) { if (fx.buzz) fx.buzz(8); const mvv = mv(sel, anchor.x, anchor.y, rot); rot = 0; step(hs, mvv, 'human'); return; }
    anchor = null; drawBoard(); drawDock(); drawHand();
  }
  handBox.addEventListener('pointerdown', e => {
    if (dead || !myTurn() || lock || (e.button != null && e.button > 0)) return;
    const el = e.target.closest('.sr-card[data-c]'); if (!el) return;
    drag = { c: +el.dataset.c, id: e.pointerId, x0: e.clientX, y0: e.clientY, on: false, el, node: null };
    try { el.setPointerCapture(e.pointerId); } catch { /* 지원 안 함 */ }
  });
  handBox.addEventListener('pointermove', e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.on) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 9) return;
      drag.on = true;
      if (sel !== drag.c) { sel = drag.c; rot = 0; }
      anchor = null;
      const w = drag.el.getBoundingClientRect().width, node = document.createElement('div');
      node.className = 'sr-drag'; node.style.width = w + 'px'; node.innerHTML = cardSVG(cardOf(drag.c), rot);
      root.append(node); drag.node = node; drag.w = w;
      handBox.querySelectorAll('.sr-card').forEach(x => x.classList.toggle('sel', +x.dataset.c === sel));
      drag.el.classList.add('lifted');
      drawBoard(); drawDock(); snd('tap');
    }
    const rr = root.getBoundingClientRect();
    drag.node.style.transform = `translate(${e.clientX - rr.left - drag.w / 2}px,${e.clientY - rr.top - LIFT - drag.w * 5 / 14}px)`;
    const p = toBoard(e.clientX, e.clientY - LIFT), br = boardBox.getBoundingClientRect();
    const inside = p && e.clientX >= br.left - 6 && e.clientX <= br.right + 6 && e.clientY - LIFT >= br.top - 6 && e.clientY - LIFT <= br.bottom + 6;
    const next = inside ? nearestAnchor(p.fx, p.fy) : null;
    drag.node.classList.toggle('over', !!next);
    if ((next && (!anchor || next.x !== anchor.x || next.y !== anchor.y)) || (!next && anchor)) {
      anchor = next; drawBoard(); drawDock(); if (next) snd('place');
    }
  });
  handBox.addEventListener('pointerup', e => { if (drag && e.pointerId === drag.id) dragEnd(false); });
  handBox.addEventListener('pointercancel', e => { if (drag && e.pointerId === drag.id) dragEnd(true); });

  // ----- 시작 -----
  log(resumed ? `이어서 하기 · ${placedCount()}/${totalCards}장` : `새 게임! ${n}인 · 목표 ${target}점`);
  draw();
  if (resumed) { started = true; loop(true); }
  else {
    if (ctx.autosave) ctx.autosave(JSON.parse(JSON.stringify(s)));
    ctx.players.forEach((p, i) => { if (!p.human) later(() => say(i, 'start'), D(500 + i * 500)); });
    openModePick();
  }
  return { destroy() { dead = true; timers.forEach(clearTimeout); timers.clear(); container.querySelectorAll('.fx-layer').forEach(e => e.remove()); } };
}

const CSS = `
.g-sprawlopolis{position:relative;container-type:inline-size;padding:7px 6px 9px;border-radius:18px;color:#eaf1f8;font-family:var(--fk);user-select:none;-webkit-user-select:none;overflow:hidden;
 --hw:min(31cqw,124px,calc((100dvh - 470px) / 0.95));
 background:linear-gradient(#9fc4e60d 1px,transparent 1px) 0 0/22px 22px,linear-gradient(90deg,#9fc4e60d 1px,transparent 1px) 0 0/22px 22px,radial-gradient(120% 90% at 50% 30%,var(--tb),var(--tb2));
 box-shadow:inset 0 0 0 3px #0b1018,inset 0 0 0 5px #4d6580,inset 0 0 54px #000a,0 10px 24px #0006}
.g-sprawlopolis *{box-sizing:border-box}
.g-sprawlopolis [hidden]{display:none!important}
.g-sprawlopolis button{font-family:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent;color:inherit}
.g-sprawlopolis .sr-defs{position:absolute;width:0;height:0;overflow:hidden}
.g-sprawlopolis .sr-top{display:flex;align-items:center;gap:6px;min-height:24px;padding:0 3px 4px}
.g-sprawlopolis .sr-prog{font:800 16px/1 var(--fd,Georgia);color:#ffe9a6;display:flex;align-items:baseline;gap:2px}.g-sprawlopolis .sr-prog small{font-size:11px;opacity:.7;font-weight:400}
.g-sprawlopolis .sr-mode{margin-left:8px;font:700 10px/1 sans-serif;padding:3px 7px;border-radius:999px;background:#0005;border:1px solid #ffffff2a;color:#cfe}
.g-sprawlopolis .sr-tb{margin-left:auto;display:flex;gap:4px}
.g-sprawlopolis .sr-tb button{border:1px solid #ffffff3a;background:#0004;border-radius:999px;font-size:11px;padding:2px 9px;min-height:22px}
.g-sprawlopolis .sr-goals{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin-bottom:5px}
.g-sprawlopolis .sr-goal{position:relative;display:block;width:100%;text-align:left;background:linear-gradient(#ffffff16,#0000003a);border:1.5px solid #9fc4e633;border-radius:9px;padding:5px 6px 14px;min-height:74px;min-width:0}
.g-sprawlopolis .sr-goal b{display:block;font-size:11.5px;line-height:1.2;padding-right:18px;color:#ffe9a6}
.g-sprawlopolis .sr-goal small{display:block;font-size:9.5px;line-height:1.3;opacity:.82;margin-top:2px}
.g-sprawlopolis .sr-gn{position:absolute;right:4px;top:4px;font:800 11px/1 var(--fd,Georgia);font-style:normal;width:18px;height:18px;border-radius:50%;display:grid;place-items:center;background:#e8a33d;color:#2a1a00}
.g-sprawlopolis .sr-gp{position:absolute;right:6px;bottom:2px;font:800 14px/1 var(--fd,Georgia);color:#9be39b}.g-sprawlopolis .sr-gp.neg{color:#ff9aa4}
.g-sprawlopolis .sr-mates{display:grid;gap:5px;margin-bottom:5px;position:relative;z-index:3}
.g-sprawlopolis .sr-mates:empty{display:none}
.g-sprawlopolis .sr-mates.n1{grid-template-columns:1fr}.g-sprawlopolis .sr-mates.n2{grid-template-columns:1fr 1fr}.g-sprawlopolis .sr-mates.n3{grid-template-columns:1fr 1fr 1fr}
.g-sprawlopolis .sr-mate{position:relative;background:linear-gradient(#ffffff14,#0000003a);border:1.5px solid #ffffff22;border-radius:11px;padding:4px 5px 5px;min-width:0;transition:box-shadow .3s,border-color .3s}
.g-sprawlopolis .sr-mate.turn{border-color:var(--acc);box-shadow:0 0 0 1px var(--acc),0 0 14px #e8a33d88}
.g-sprawlopolis .sr-mh{display:flex;align-items:center;gap:4px;margin-bottom:3px;min-width:0}
.g-sprawlopolis .sr-av{flex:none;width:22px;height:22px;border-radius:50%;overflow:hidden;box-shadow:0 0 0 2px var(--pc,#888),0 1px 3px #000a;display:block;background:#333}
.g-sprawlopolis .sr-av>*{width:100%!important;height:100%!important;display:grid;place-items:center;font-size:10px;border-radius:50%}
.g-sprawlopolis .sr-mn{font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1;min-width:0}
.g-sprawlopolis .sr-mate.turn .sr-mn:after{content:" …"}
.g-sprawlopolis .sr-mc{font:700 15px/1 var(--fd,Georgia);color:#ffe9a6}.g-sprawlopolis .sr-mc small{font-size:10px;opacity:.7}
.g-sprawlopolis .sr-mbacks{display:flex;height:26px;align-items:center;padding-left:2px;overflow:hidden}
.g-sprawlopolis .sr-mbacks em{font-size:11px;opacity:.55;font-style:normal}
.g-sprawlopolis .sr-mb{flex:none;width:34px;height:24px;border-radius:3.5px;margin-left:-16px;border:1px solid #e8a33d99;background:repeating-linear-gradient(45deg,#e8a33d33 0 2px,#0000 2px 5px),linear-gradient(160deg,#2b3f5c,#141f33);box-shadow:0 1px 3px #000a;transform:rotate(calc((var(--k) - 1) * 4deg))}
.g-sprawlopolis .sr-mb:first-child{margin-left:0}
.g-sprawlopolis .sr-say{position:absolute;left:6px;right:6px;top:100%;margin-top:3px;z-index:6;background:#f4f8ff;color:#14202e;border-radius:9px;padding:4px 8px;font-size:12px;line-height:1.3;box-shadow:0 3px 8px #0009;cursor:pointer}
.g-sprawlopolis .sr-say:before{content:"";position:absolute;left:14px;top:-5px;border:5px solid transparent;border-top:0;border-bottom-color:#f4f8ff}
.g-sprawlopolis .sr-say.pop{animation:srpop .25s ease-out}
@keyframes srpop{from{transform:scale(.7);opacity:0}to{transform:none;opacity:1}}
.g-sprawlopolis .sr-board{background:#0b1620aa;border:1.5px solid #9fc4e655;border-radius:12px;padding:4px;margin-bottom:5px;display:grid;place-items:center;min-height:150px}
.g-sprawlopolis .sr-bsvg{display:block;width:100%;height:auto;max-height:min(44dvh,340px);touch-action:manipulation}
.g-sprawlopolis .sr-hint{fill:#ffffff14;stroke:#fff;stroke-opacity:.35;stroke-width:1;stroke-dasharray:3 3}
.g-sprawlopolis .sr-meter{padding:4px 7px 6px;border-radius:10px;background:#0004;border:1px solid #ffffff1c;margin-bottom:5px;cursor:pointer}
.g-sprawlopolis .sr-mrow{display:flex;justify-content:space-between;align-items:baseline;gap:6px;font-size:13px}
.g-sprawlopolis .sr-mrow b{font:800 18px/1 var(--fd,Georgia);color:#ffe9a6}.g-sprawlopolis .sr-mrow b.ok{color:#9be39b}
.g-sprawlopolis .sr-mrow small{font-size:10px;opacity:.75}
.g-sprawlopolis .sr-bar{height:7px;border-radius:5px;background:#0006;margin-top:4px;overflow:hidden}.g-sprawlopolis .sr-bar i{display:block;height:100%;background:linear-gradient(#ffe08a,#e8a33d);transition:width .5s}.g-sprawlopolis .sr-bar.ok i{background:linear-gradient(#b6f0b6,#3fae5a)}
.g-sprawlopolis .sr-deckrow{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:0 4px;margin-bottom:5px;font-size:11px}
.g-sprawlopolis .sr-dk{display:flex;align-items:center;gap:7px}.g-sprawlopolis .sr-dkn b{font:800 15px/1 var(--fd,Georgia);color:#ffe9a6}.g-sprawlopolis .sr-dk small{opacity:.7}
.g-sprawlopolis .sr-modeinfo{opacity:.7;font-size:10.5px}
.g-sprawlopolis .sr-card{position:relative;width:var(--cw,64px);aspect-ratio:7/5;flex:none;filter:drop-shadow(0 2px 3px #000a)}
.g-sprawlopolis .sr-cardsvg{display:block;width:100%;height:100%;overflow:visible}
.g-sprawlopolis .sr-mini{--cw:48px}
.g-sprawlopolis .sr-empty{border:1.5px dashed #ffffff44;border-radius:4px;filter:none;display:inline-block}
.g-sprawlopolis .sr-dock{display:flex;flex-wrap:wrap;gap:6px;align-items:center;min-height:50px;padding:5px 7px;margin-bottom:5px;border-radius:12px;background:linear-gradient(#0000002a,#0000005a);border:1px solid #ffffff1a}
.g-sprawlopolis .sr-dock.mine{border-color:var(--acc);box-shadow:0 0 0 1px #e8a33d55,inset 0 0 14px #e8a33d22}
.g-sprawlopolis .sr-msg{flex:1;min-width:120px;display:flex;flex-direction:column;gap:1px;line-height:1.25}
.g-sprawlopolis .sr-msg b{font-size:13px}.g-sprawlopolis .sr-msg small{font-size:11px;opacity:.78}
.g-sprawlopolis .sr-msg em{font-style:normal;font-weight:800}.g-sprawlopolis .sr-msg em.up{color:#9be39b}.g-sprawlopolis .sr-msg em.down{color:#ff9aa4}
.g-sprawlopolis .sr-btn{border:1.5px solid #ffffff44;background:linear-gradient(#ffffff22,#00000033);border-radius:11px;padding:7px 14px;font-size:14px;font-weight:700;min-height:38px;display:inline-flex;align-items:center;gap:6px;justify-content:center}
.g-sprawlopolis .sr-btn.go{background:linear-gradient(#ffe08a,#d18f1c);color:#3a2300;border-color:#fff6;text-shadow:0 1px 0 #fff6}
.g-sprawlopolis .sr-btn.ghost{background:#0003}
.g-sprawlopolis .sr-btn:disabled{opacity:.4;cursor:default}
.g-sprawlopolis .sr-btn.wide{width:100%;margin-top:10px}
.g-sprawlopolis .sr-btn small{opacity:.7;font-weight:400;font-size:11px}
.g-sprawlopolis .sr-hand{display:flex;justify-content:center;align-items:flex-end;gap:8px;padding:14px 4px 4px;min-height:calc(var(--hw) * 0.714 + 26px)}
.g-sprawlopolis .sr-hand .sr-card{--cw:var(--hw);transition:transform .18s ease,filter .18s ease;transform-origin:50% 100%}
.g-sprawlopolis .sr-hand .sr-card.live{cursor:grab;touch-action:none}
.g-sprawlopolis .sr-hand .sr-card.sel{transform:translateY(-12px) scale(1.06);z-index:5;filter:drop-shadow(0 0 7px var(--acc)) drop-shadow(0 4px 5px #000b)}
.g-sprawlopolis .sr-hand .sr-card.lifted{opacity:.3}
.g-sprawlopolis .sr-hand.turn .sr-card:not(.sel){filter:drop-shadow(0 2px 4px #000b) drop-shadow(0 0 3px #e8a33d55)}
.g-sprawlopolis .sr-hand .sr-card.deal{animation:srdeal .38s cubic-bezier(.2,.9,.3,1.2) both;animation-delay:calc(var(--k) * 70ms)}
@keyframes srdeal{from{opacity:0;transform:translateY(-40px) scale(.7) rotate(-8deg)}to{opacity:1;transform:none}}
.g-sprawlopolis .sr-drag{position:absolute;left:0;top:0;z-index:60;pointer-events:none;aspect-ratio:7/5;opacity:.78;filter:drop-shadow(0 8px 10px #000c) drop-shadow(0 0 6px var(--acc));will-change:transform}
.g-sprawlopolis .sr-drag.over{opacity:.35}
.g-sprawlopolis .sr-drag svg{display:block;width:100%;height:100%}
.g-sprawlopolis .sr-nohand{opacity:.6;font-size:13px;padding:18px 0}
.g-sprawlopolis .sr-ov{position:absolute;inset:0;background:#000b;z-index:40;display:grid;place-items:center;padding:14px;backdrop-filter:blur(2px)}
.g-sprawlopolis .sr-sheet{width:100%;max-height:100%;overflow:auto;background:linear-gradient(#1c2a3b,#0f1824);border:2px solid #4d6580;border-radius:16px;padding:14px;box-shadow:0 12px 32px #000c}
.g-sprawlopolis .sr-ft{margin:0 0 8px;font:800 20px/1.2 var(--fd,Georgia);text-align:center;color:#ffe9a6}
.g-sprawlopolis .sr-ft.win{color:#ffd34d;text-shadow:0 0 14px #e8a33d}.g-sprawlopolis .sr-ft.lose{color:#ff9aa4}
.g-sprawlopolis .sr-fs{text-align:center;font-size:13px;opacity:.92;line-height:1.5}.g-sprawlopolis .sr-fs.ok{color:#9be39b;font-weight:700}.g-sprawlopolis .sr-fs.no{color:#ff9aa4;font-weight:700}
.g-sprawlopolis .sr-modes{display:grid;gap:6px;margin-top:8px}.g-sprawlopolis .sr-modes .sr-btn{flex-direction:column;gap:0;align-items:center}
.g-sprawlopolis .sr-chips{display:flex;gap:6px;justify-content:center;margin:6px 0}
.g-sprawlopolis .sr-chip{display:flex;flex-direction:column;align-items:center;padding:4px 10px;border-radius:9px;color:#fff;text-shadow:0 1px 2px #000a;min-width:58px}.g-sprawlopolis .sr-chip i{font-style:normal;font-size:10px}.g-sprawlopolis .sr-chip b{font:800 18px/1 var(--fd,Georgia)}
.g-sprawlopolis .sr-tbl{width:100%;border-collapse:collapse;font-size:12.5px}.g-sprawlopolis .sr-tbl td{padding:5px 3px;border-bottom:1px solid #ffffff14;vertical-align:top}.g-sprawlopolis .sr-tbl td:last-child{text-align:right;font:800 15px/1.2 var(--fd,Georgia);white-space:nowrap}
.g-sprawlopolis .sr-tbl small{opacity:.7;font-size:10.5px}.g-sprawlopolis .sr-tbl .tot td{color:#ffe9a6;font-size:14px}
.g-sprawlopolis .sr-rules{margin:0;padding-left:18px;font-size:12.5px;line-height:1.55}.g-sprawlopolis .sr-rules li{margin-bottom:6px}
.g-sprawlopolis .sr-log{font-size:12.5px;line-height:1.5;max-height:60vh;overflow:auto}.g-sprawlopolis .sr-log div{padding:2px 0;border-bottom:1px solid #ffffff12}
.g-sprawlopolis .sr-log .good{color:#ffe08a}.g-sprawlopolis .sr-log .bad{color:#ff9aa4}.g-sprawlopolis .sr-log .dim{opacity:.6}.g-sprawlopolis .sr-log .sp{color:#bfe3ff}
.g-sprawlopolis .sr-glist{display:grid;gap:10px;margin-top:8px}
.g-sprawlopolis .sr-gc{position:relative;background:linear-gradient(#f6f2e3,#ddd7c0);color:#1d2430;border-radius:12px;padding:9px 12px 10px;border:2px solid #8a8466;box-shadow:0 3px 8px #0007}
.g-sprawlopolis .sr-gc.on{border-color:#e8a33d;box-shadow:0 0 0 2px #e8a33d,0 3px 10px #000a}
.g-sprawlopolis .sr-gc .sr-gn{left:8px;right:auto;top:8px;width:28px;height:28px;font-size:15px;box-shadow:0 1px 3px #0006}
.g-sprawlopolis .sr-gc .sr-gen{display:block;margin-left:36px;font:800 13px/1.15 var(--fd,Georgia);letter-spacing:.4px;color:#38402e}
.g-sprawlopolis .sr-gc .sr-gko{display:block;margin-left:36px;font-size:15px;line-height:1.25;color:#1d2430}
.g-sprawlopolis .sr-gc p{margin:8px 0 4px;font-size:13px;line-height:1.5;color:#26303c}
.g-sprawlopolis .sr-gc .sr-dia{display:block;width:100%;max-width:240px;margin:6px auto 2px;background:#fffdf4;border-radius:8px;border:1px solid #c9c3a8}
.g-sprawlopolis .sr-gc small{display:block;text-align:center;font-size:12px;color:#4a4636;line-height:1.4}
.g-sprawlopolis .sr-gnow{position:absolute;right:10px;top:10px;font:800 13px/1 var(--fd,Georgia);color:#2c7a3f;background:#e2f5e4;border-radius:999px;padding:4px 8px}.g-sprawlopolis .sr-gnow.neg{color:#a12b3b;background:#fbe4e7}
.g-sprawlopolis .sr-toasts{position:absolute;left:0;right:0;top:46%;z-index:35;display:flex;flex-direction:column;align-items:center;gap:6px;pointer-events:none}
.g-sprawlopolis .sr-toast{background:#0b1620ee;border:1.5px solid #4d6580;border-radius:999px;padding:6px 16px;font-size:13px;font-weight:700;animation:srtoast 2.2s ease-out both;box-shadow:0 4px 14px #000a}
@keyframes srtoast{0%{opacity:0;transform:translateY(10px) scale(.9)}10%{opacity:1;transform:none}80%{opacity:1}100%{opacity:0;transform:translateY(-8px)}}
.g-sprawlopolis .sr-conf{position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:45}
.g-sprawlopolis .sr-conf i{position:absolute;top:-12px;width:8px;height:14px;border-radius:2px;animation:srfall linear forwards}
@keyframes srfall{to{transform:translateY(780px) rotate(720deg);opacity:.9}}
`;
