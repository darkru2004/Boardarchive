// 시험용 게임 "스톱!" — 껍데기·규격이 실제로 맞물리는지 확인하기 위한 가장 작은 게임.
// 규칙: 내 차례에 주사위를 굴려 합계를 쌓고(굴리기), 원할 때 점수로 확정(멈추기). 1이 나오면 이번 차례 합계 소멸.
// 누가 30점에 도달하면 나머지 모두가 마지막 한 번씩 더 하고 끝. 최고점 승리.
// 규격: 무작위는 전달받은 rng만 사용 / 상태는 JSON 객체 / applyMove는 상태를 직접 수정.

const TARGET = 30;

export default {
  meta: {
    id: 'stop-test', name: '스톱! (시험용)', version: '0.1.0',
    players: { min: 3, max: 7 }, minutes: 5,
    campaign: null            // 캠페인형이면 { slots: 3, saveSchema: 1 } 처럼 선언
  },

  newGame({ players }) {
    return { n: players.length, scores: players.map(() => 0), turn: 0, turnTotal: 0, lastRoll: null,
      triggered: false, triggerSeat: null, over: false, target: TARGET, log: [] };
  },

  currentSeat: s => s.turn,
  isOver: s => s.over,
  legalMoves(s) { return s.over ? [] : (s.turnTotal > 0 ? ['roll', 'hold'] : ['roll']); },

  applyMove(s, move, rng) {
    if (s.over) throw new Error('이미 끝난 게임');
    if (!this.legalMoves(s).includes(move)) throw new Error('불법 수: ' + move);
    const seat = s.turn;
    let ended = false;
    if (move === 'roll') {
      const d = 1 + rng.int(6);
      s.lastRoll = d;
      if (d === 1) { s.log.push({ seat, ev: 'bust', lost: s.turnTotal }); s.turnTotal = 0; ended = true; }
      else s.turnTotal += d;
    } else {
      s.scores[seat] += s.turnTotal;
      s.log.push({ seat, ev: 'hold', gained: s.turnTotal });
      s.turnTotal = 0; ended = true;
      if (s.scores[seat] >= s.target && !s.triggered) { s.triggered = true; s.triggerSeat = seat; }
    }
    if (ended) {
      s.turn = (s.turn + 1) % s.n;
      s.lastRoll = move === 'roll' ? 1 : s.lastRoll;
      if (s.triggered && s.turn === s.triggerSeat) s.over = true;   // 목표 도달자를 뺀 모두가 마지막 한 번씩
    }
    return s;
  },

  // 봇: 합법 수 안에서 "굴릴지 멈출지"만 성향으로 정한다.
  botChoose(s, t, rng, info) {
    const moves = this.legalMoves(s);
    if (moves.length === 1) return { move: moves[0], reason: 'only' };
    const me = info.seat, best = Math.max(...s.scores.filter((_, i) => i !== me));
    let th = 14 + (t.risk - 5) * 1.5 - (t.patience - 5) * 0.4;
    if (best - s.scores[me] >= 10) th += t.aggression * 0.4;
    const noise = (10 - t.skill) * 0.8 * (rng.next() + rng.next() - 1);
    if (s.triggered) {                       // 마지막 바퀴: 선두를 넘을 때까지 굴린다
      const need = best - s.scores[me] + 1;
      return { move: s.turnTotal >= need + noise * 0.5 ? 'hold' : 'roll', reason: 'chase' };
    }
    return { move: s.turnTotal + noise >= th ? 'hold' : 'roll', reason: 'normal' };
  },

  result(s) {
    const order = s.scores.map((score, seat) => ({ seat, score })).sort((a, b) => b.score - a.score);
    let rank = 0, prev = null;
    const ranking = order.map((o, i) => { if (o.score !== prev) { rank = i + 1; prev = o.score; } return { seat: o.seat, rank, score: o.score }; });
    return { ranking, summary: `최고점 ${order[0].score}점` };
  },

  // ---- 화면 (게임이 자기 화면을 직접 소유). 껍데기의 게임 키트 클래스(hud/mini/note/diecard/acts/btn)를 사용 ----
  mount(container, ctx) {
    const rng = ctx.rng;
    const s = this.newGame({ players: ctx.players });
    let timer = null, dead = false, finished = false, speech = null;
    const self = this;
    container.innerHTML = `<div class="g-stop">
      <div class="hud"></div>
      <div class="g-mid"><div class="g-say"></div><div class="diecard"><div class="tt">ROLL</div><span class="g-die"></span><div class="tot">이번 차례 <b>0</b></div></div>
        <div class="g-goal">GOAL<br><b>${s.target}</b></div></div>
      <div class="g-sub"></div>
      <div class="acts"><button class="btn go" data-a="roll">굴리기<small>ROLL</small></button><button class="btn" data-a="hold">멈추기<small>HOLD</small></button></div>
      <div class="g-log"></div></div>`;
    const q = sel => container.querySelector(sel);
    const hud = q('.hud'), sayBox = q('.g-say'), dieBox = q('.g-die'), tot = q('.tot b'), sub = q('.g-sub'), mid = q('.g-mid');
    const bRoll = q('[data-a=roll]'), bHold = q('[data-a=hold]'), logBox = q('.g-log');
    if (ctx.kit) mid.append(ctx.kit.ornament(90, 'left:-6px;bottom:-14px'), ...ctx.kit.bubbles([['22%', '78%', 16], ['26%', '72%', 8], ['74%', '10%', 12]]));

    function say(seat, key) {
      const t = ctx.say(seat, key);
      if (!t) return;
      speech = { seat, t }; drawSay();
      setTimeout(() => { if (speech && speech.t === t) { speech = null; if (!dead) drawSay(); } }, ctx.readMs ? ctx.readMs(t) : 2600);
    }
    function drawSay() {
      sayBox.replaceChildren();
      if (!speech) return;
      const n = document.createElement('div'); n.className = 'note';
      const em = document.createElement('em'); em.textContent = ctx.players[speech.seat].name;
      n.append(em, document.createTextNode(speech.t)); sayBox.append(n);
    }
    function logLine(t) { const d = document.createElement('div'); d.textContent = t; logBox.appendChild(d); logBox.scrollTop = logBox.scrollHeight; }
    function draw() {
      hud.replaceChildren(...ctx.players.map((p, i) => {
        const m = document.createElement('div');
        m.className = 'mini' + (!s.over && s.turn === i ? ' turn' : '');
        m.append(ctx.avatar(i, 'css'));
        const b = document.createElement('b'); b.textContent = p.human ? '나' : p.name.split(' ').pop();
        const sc = document.createElement('div'); sc.className = 'sc'; sc.textContent = s.scores[i];
        if (!s.over && s.turn === i && s.turnTotal) { const sm = document.createElement('small'); sm.textContent = ` +${s.turnTotal}`; sc.append(sm); }
        const bar = document.createElement('div'); bar.className = 'bar';
        const fill = document.createElement('i'); fill.style.width = Math.min(100, s.scores[i] / s.target * 100) + '%'; bar.append(fill);
        m.append(b, sc, bar);
        return m;
      }));
      dieBox.replaceChildren(ctx.kit ? ctx.kit.dieSvg(s.lastRoll, 76) : document.createTextNode(s.lastRoll ?? '?'));
      tot.textContent = s.turnTotal;
      const mine = !s.over && ctx.players[s.turn].human;
      bRoll.disabled = !mine; bHold.disabled = !mine || !s.turnTotal;
      sub.textContent = s.over ? '게임 종료' : `${ctx.players[s.turn].human ? '나' : ctx.players[s.turn].name}의 차례 · 이번 차례 합계 ${s.turnTotal}${s.triggered ? ' · 마지막 바퀴!' : ''}`;
    }
    function step(seat, move) {
      const before = s.turnTotal;
      self.applyMove(s, move, rng);
      const name = ctx.players[seat].human ? '나' : ctx.players[seat].name;
      if (move === 'roll') {
        if (s.lastRoll === 1 && s.turn !== seat) { logLine(`${name}: 1! 이번 차례 합계 ${before} 소멸`); if (!ctx.players[seat].human) say(seat, 'bad'); }
        else logLine(`${name}: 굴림 ${s.lastRoll}`);
      } else {
        logLine(`${name}: 멈춤 (+${before}, 합계 ${s.scores[seat]})`);
        if (!ctx.players[seat].human && before >= 15) say(seat, 'good');
      }
      draw();
      if (s.over) return finish();
      loop();
    }
    function finish() {
      if (finished) return; finished = true;
      const res = self.result(s);
      const top = res.ranking.find(r => !ctx.players[r.seat].human);
      if (top) say(top.seat, top.rank === 1 ? 'win' : 'lose');
      timer = setTimeout(() => { if (!dead) ctx.finish(res); }, ctx.delay(ctx.readMs ? 3000 : 1200));
    }
    function loop() {
      if (dead || s.over) return;
      const p = ctx.players[s.turn];
      if (p.human) return;
      timer = setTimeout(() => {
        if (dead) return;
        const ch = self.botChoose(s, p.traits, rng, { seat: s.turn, rivalSeats: p.rivalSeats });
        step(s.turn, ch.move);
      }, ctx.delay(650));
    }
    bRoll.onclick = () => { if (ctx.players[s.turn].human && !s.over) step(s.turn, 'roll'); };
    bHold.onclick = () => { if (ctx.players[s.turn].human && !s.over && s.turnTotal) step(s.turn, 'hold'); };
    draw();
    const opener = ctx.players.findIndex(p => !p.human);
    if (opener >= 0) say(opener, 'start');
    loop();
    return { destroy() { dead = true; clearTimeout(timer); } };
  }
};
