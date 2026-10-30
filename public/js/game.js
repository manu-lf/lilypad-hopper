/* Lilypad Hopper — the game.
   Frogger meets the Chrome dino: hop a frog up an endless pond, row by row, landing on
   lily pads that drift sideways. The pond scrolls down and speeds up, so you can't sit
   still. Catch flies for bonus points; keep a quick-hop streak for a ribbit bonus.

   Everything on screen is SVG built as bitwrench TACO objects. The scene is mounted once;
   each frame updates geometry in place with bw.patch (attributes) and bw.syncChildren
   (keyed lists of pads / flies / effects). HUD and overlays live in app.js and listen on
   bw.pub topics: 'hopper:hud' {score,best,streak} and 'hopper:state' {state,...}. */
(function (root) {
  var bw = root.bw;
  var A = root.HopperAudio || { hop: function () {}, land: function () {}, splash: function () {}, fly: function () {}, ribbit: function () {}, gameover: function () {}, best: function () {}, start: function () {}, init: function () {} };

  // ---- geometry (SVG user units) ----
  var W = 420, H = 640, CW = 60, RH = 72, R0 = 24;
  var HOP_DUR = 0.22, STREAK_WINDOW = 1.1, LIVES = 3;   // seconds between landings on NEW rows to keep a streak

  // ---- Leapfrog palette (see public/assets/brand.md) ----
  var C = {
    water: '#102B7B', waterDeep: '#0C183A', waterLight: '#1D3F9E', caustic: '#B4FFD6',
    pad: '#038E43', padDark: '#05572B', padLight: '#179B53', padVein: '#00DF66',
    frog: '#179B53', frogDark: '#05572B', frogBelly: '#D4F479', eye: '#F7F8FB', pupil: '#0C183A', tongue: '#EA4C89',
    bank: '#05572B', bankTop: '#038E43', reed: '#00DF66', pebble: '#224C55',
    fly: '#0C183A', wing: '#F7F8FB', ripple: '#B4FFD6', text: '#F7F8FB', bonus: '#D4F479'
  };

  var G = null, els = {}, rafId = 0, listeners = [], pointer = null;

  function rnd() { return Math.random(); }
  function pick(a) { return a[Math.floor(rnd() * a.length)]; }
  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
  function lerp(a, b, p) { return a + (b - a) * p; }
  function nowS() { return (root.performance ? root.performance.now() : Date.now()) / 1000; }
  function fmt(n) { return Math.round(n * 100) / 100; }
  function loadBest() { try { return parseInt(root.localStorage.getItem('hopper_best'), 10) || 0; } catch (e) { return 0; } }
  function saveBest(b) { try { root.localStorage.setItem('hopper_best', String(b)); } catch (e) {} }

  // ---------------------------------------------------------------- world
  function freshState() {
    return {
      state: 'title', started: false, paused: false, t: 0, lastFrame: 0,
      camBottom: H * 0.18, auto: 0,
      score: 0, best: loadBest(), streak: 0, maxRow: 0, newBest: false, lives: LIVES,
      rows: {}, fx: [], fxId: 0, bob: {}, nextHop: null,
      deathT: 0, cause: '', overlayShown: false,
      frog: { row: 0, x: W / 2, y: 0, pad: null, hop: null, face: 0, landT: -9, progressT: -9, lift: 0, tongue: 0, alpha: 1, scale: 1 }
    };
  }

  // Rows are generated lazily and cached. Row 0/1 are the bank; every 12th row up to 48 is a
  // resting bank; everything else is a row of drifting pads that gets sparser and faster.
  function rowAt(r) {
    var row = G.rows[r];
    if (row) return row;
    if (r > 0 && !G.rows[r - 1]) rowAt(r - 1);
    var d = Math.min(1, r / 70);
    if (r <= 1 || (r % 12 === 0 && r <= 48)) {
      row = { r: r, kind: 'bank', y: -r * RH, reeds: [], pebbles: [] };
      for (var k = 0; k < 7; k++) row.reeds.push({ x: 12 + rnd() * (W - 24), h: 10 + rnd() * 14, lean: (rnd() - 0.5) * 8 });
      for (k = 0; k < 5; k++) row.pebbles.push({ x: rnd() * W, y: (rnd() - 0.5) * 30, r: 2 + rnd() * 2.5 });
    } else {
      var prev = G.rows[r - 1];
      var still = rnd() < (0.26 - 0.2 * d);
      var dir = (prev && prev.kind === 'pads' && prev.speed) ? -prev.dir : (rnd() < 0.5 ? -1 : 1);
      var n = d < 0.3 ? pick([4, 4, 3]) : d < 0.65 ? pick([3, 3, 4, 2]) : pick([3, 2, 2]);
      var speed = still ? 0 : (22 + 68 * d + rnd() * 26);
      var pr = R0 - 5 * d, P = W + 2 * pr, phase = rnd() * P, pads = [];
      for (var i = 0; i < n; i++) { var q = rnd(); pads.push({ i: i, base: phase + i * P / n + (rnd() - 0.5) * (P / n) * 0.22, rot: rnd() * 360, notch: q < 0.6 ? 0 : q < 0.9 ? 1 : 2 }); }
      var fly = rnd() < 0.32 ? { pad: Math.floor(rnd() * n), eaten: false, seed: rnd() * 10 } : null;
      row = { r: r, kind: 'pads', y: -r * RH, n: n, speed: speed, dir: dir, pr: pr, P: P, pads: pads, fly: fly,
        caustics: [{ x: rnd() * W, w: 26 + rnd() * 40 }, { x: rnd() * W, w: 20 + rnd() * 30 }] };
    }
    G.rows[r] = row;
    return row;
  }
  function padX(row, pad, t) {
    var x = (pad.base + row.dir * row.speed * t) % row.P;
    if (x < 0) x += row.P;
    return x - row.pr;
  }
  function visibleRows() {
    var lo = Math.max(0, Math.floor(-(G.camBottom + RH) / RH)), hi = Math.ceil((H + RH - G.camBottom) / RH), out = [];
    for (var r = lo; r <= hi; r++) out.push(rowAt(r));
    return out;
  }

  // ---------------------------------------------------------------- effects
  function addFx(fx) { fx.id = 'fx' + (++G.fxId); fx.t0 = nowS(); G.fx.push(fx); }
  function ripple(x, y, big) { addFx({ kind: 'ripple', x: x, y: y, dur: big ? 0.9 : 0.6, r0: big ? 10 : 5, r1: big ? 70 : 34 }); }
  function splashFx(x, y) {
    var drops = [];
    for (var i = 0; i < 9; i++) drops.push({ vx: (rnd() - 0.5) * 110, vy: 70 + rnd() * 110, r: 2 + rnd() * 2.5 });
    addFx({ kind: 'splash', x: x, y: y, dur: 0.75, drops: drops });
    ripple(x, y, true); ripple(x, y, false);
  }
  function pop(x, y, text, color) { addFx({ kind: 'pop', x: x, y: y, dur: 0.95, text: text, color: color || C.text }); }

  // ---------------------------------------------------------------- rules
  function pubHud() { bw.pub('hopper:hud', { score: G.score, best: G.best, streak: G.streak, lives: G.lives }); }
  function pubState(extra) {
    var d = { state: G.state, score: G.score, best: G.best, newBest: G.newBest, cause: G.cause, paused: G.paused, lives: G.lives };
    for (var k in extra) d[k] = extra[k];
    bw.pub('hopper:state', d);
  }

  function start() {
    var best = G ? G.best : loadBest();
    G = freshState(); G.best = best; G.state = 'playing';
    rowAt(0); A.init(); A.start(); pubHud(); pubState();
  }

  function die(cause) {
    var f = G.frog, last = G.lives <= 1;
    G.lives = Math.max(0, G.lives - 1);
    G.state = last ? 'dead' : 'lost'; G.cause = cause; G.deathT = nowS(); G.overlayShown = false; f.hop = null; G.nextHop = null; G.streak = 0;
    if (cause === 'splash') { A.splash(); splashFx(f.x, f.y); }
    else if (cause === 'swept') { A.splash(); ripple(f.x, f.y, true); }
    setTimeout(function () { if (last) A.gameover(); else A.lose(); }, cause === 'splash' ? 350 : 150);
    if (last && G.score > G.best) { G.best = G.score; G.newBest = true; saveBest(G.best); setTimeout(function () { A.best(); }, 1100); }
    pubHud();
  }

  // After a lost life: put the frog back on a pad (or the bank) in the row it died in, camera reset,
  // auto-scroll waits for the next hop. Score and best are kept.
  function continueLife() {
    var f = G.frog, row = rowAt(Math.max(0, f.row));
    f.hop = null; f.lift = 0; f.alpha = 1; f.scale = 1; f.face = 0; f.row = row.r; f.y = row.y; f.landT = -9; f.progressT = -9;
    if (row.kind === 'bank') { f.pad = null; f.x = W / 2; }
    else {
      var best = 0, bd = 1e9;
      for (var i = 0; i < row.pads.length; i++) { var d = Math.abs(padX(row, row.pads[i], G.t) - W / 2); if (d < bd) { bd = d; best = i; } }
      f.pad = best; f.x = padX(row, row.pads[best], G.t);
    }
    G.camBottom = f.y + H * 0.18; G.started = false; G.state = 'playing'; G.cause = '';
    ripple(f.x, f.y + 6, false); A.start(); pubHud(); pubState();
  }

  function hop(dr, dx) {
    if (G.state !== 'playing' || G.paused) return;
    var f = G.frog;
    if (f.hop) { G.nextHop = { dr: dr, dx: dx }; return; }   // buffer one input
    if (dr < 0 && f.row === 0) return;
    var toRow = f.row + dr, toX = f.x + dx * CW;
    if (toX < 8 || toX > W - 8) return;
    f.hop = { t0: nowS(), dur: HOP_DUR, fromX: f.x, fromY: f.y, toX: toX, toY: -toRow * RH, row: toRow };
    f.face = dx > 0 ? 90 : dx < 0 ? -90 : dr < 0 ? 180 : 0;
    var from = rowAt(f.row);
    if (from.kind === 'pads' && f.pad != null) G.bob['' + f.row + ':' + f.pad] = nowS();
    f.pad = null; G.started = true;
    A.hop();
  }

  function land() {
    var f = G.frog, h = f.hop, t = nowS();
    f.hop = null; f.row = h.row; f.x = h.toX; f.y = h.toY; f.lift = 0;
    var row = rowAt(f.row);
    if (row.kind === 'bank') {
      f.pad = null; f.x = clamp(f.x, CW / 2, W - CW / 2);
    } else {
      var hit = -1, bestD = 1e9;
      for (var i = 0; i < row.pads.length; i++) {
        var d = Math.abs(padX(row, row.pads[i], G.t) - f.x);
        if (d < bestD) { bestD = d; hit = i; }
      }
      if (hit < 0 || bestD > row.pr + 5) { die('splash'); return; }
      f.pad = hit; f.x = padX(row, row.pads[hit], G.t);
      G.bob['' + f.row + ':' + hit] = t;
      if (row.fly && !row.fly.eaten && row.fly.pad === hit) {
        row.fly.eaten = true; G.score += 5; f.tongue = t; A.fly(); pop(f.x, f.y - 34, '+5', C.bonus);
      }
    }
    // streak: only hops that gain a new row count (no farming by sidestepping); keep landing on
    // new rows within the window and every fifth one croaks a bonus
    f.landT = t;
    var bonus = false;
    if (f.row > G.maxRow) {
      G.score += f.row - G.maxRow; G.maxRow = f.row;
      G.streak = (t - f.progressT) < STREAK_WINDOW ? G.streak + 1 : 1; f.progressT = t;
      if (G.streak % 5 === 0) { bonus = true; G.score += 3; A.ribbit(); pop(f.x, f.y - 30, 'ribbit! +3', C.bonus); }
    } else if ((t - f.progressT) >= STREAK_WINDOW) G.streak = 0;
    if (!bonus) A.land();
    ripple(f.x, f.y + 6, false);
    pubHud();
    if (G.nextHop) { var nh = G.nextHop; G.nextHop = null; hop(nh.dr, nh.dx); }
  }

  // ---------------------------------------------------------------- simulation
  function update(dt) {
    var f = G.frog, t = nowS();
    if (G.state === 'dead' || G.state === 'lost') {
      var age = t - G.deathT;
      if (G.cause === 'splash') { f.scale = Math.max(0, 1 - age * 2.2); f.alpha = Math.max(0, 1 - age * 1.8); }
      else if (G.cause === 'swept') { var row = rowAt(f.row); f.x += row.dir * row.speed * dt * 1.6; f.alpha = Math.max(0, 1 - age * 1.2); }
      else { f.y += 260 * dt; f.alpha = Math.max(0, 1 - age * 1.5); }
      if (age > 0.85 && !G.overlayShown) { G.overlayShown = true; pubState(); }
      G.t += dt; return;
    }
    if (G.paused) return;
    G.t += dt;
    if (G.state !== 'playing') return;

    // camera: auto-scroll (speeds up with score and time) plus a catch-up when the frog is ahead
    if (G.started) {
      G.auto = Math.min(100, 16 + G.score * 0.7 + G.t * 0.35);
      var target = f.y + H * 0.38;
      var eased = G.camBottom + (target - G.camBottom) * Math.min(1, 5 * dt);
      G.camBottom = Math.min(G.camBottom - G.auto * dt, eased);
    }
    if (f.hop) {
      var p = (t - f.hop.t0) / f.hop.dur;
      if (p >= 1) land();
      else { f.x = lerp(f.hop.fromX, f.hop.toX, p); f.y = lerp(f.hop.fromY, f.hop.toY, p); f.lift = Math.sin(p * Math.PI) * 30; }
    }
    if (!f.hop && f.pad != null) {
      var r = rowAt(f.row);
      f.x = padX(r, r.pads[f.pad], G.t);
      if (f.x < -2 || f.x > W + 2) { die('swept'); return; }
    }
    if (!f.hop && f.y > G.camBottom + 14) { die('behind'); return; }
  }

  // ---------------------------------------------------------------- SVG scene (TACO)
  // bw.create() only picks the SVG namespace when the TACO root is <svg> (bitwrench 2.1.11), and
  // bw.syncChildren() creates each item detached. So every synced item is rooted in a nested
  // <svg overflow="visible"> (plain SVG 1.1), positioned with x/y; inner <g>s carry scale/rotate.
  function svgItem(cls, children, x, y) { return { t: 'svg', a: { class: cls, overflow: 'visible', x: fmt(x || 0), y: fmt(y || 0) }, c: children }; }
  // notch: 1 = a thin slit, 2 = a small wedge (most pads have none)
  function notchPath(r, kind) {
    var half = kind === 2 ? 9 : 2.2, a1 = -half * Math.PI / 180, a2 = half * Math.PI / 180;
    return 'M0,0 L' + fmt(r * Math.cos(a1)) + ',' + fmt(r * Math.sin(a1)) + ' A' + r + ',' + r + ' 0 0 1 ' + fmt(r * Math.cos(a2)) + ',' + fmt(r * Math.sin(a2)) + ' Z';
  }
  function veinsPath(r) {
    var d = '', k = r * 0.8;
    [100, 160, 220, 290].forEach(function (deg) { var a = deg * Math.PI / 180; d += 'M0,0 L' + fmt(k * Math.cos(a)) + ',' + fmt(k * Math.sin(a)) + ' '; });
    return d;
  }
  function padTaco(item) {
    var r = item.row.pr;
    return svgItem('hop_pad', [{ t: 'g', c: [
      { t: 'ellipse', a: { cx: 2, cy: 4, rx: r, ry: r * 0.92, fill: C.waterDeep, opacity: 0.45 } },
      { t: 'g', a: { transform: 'rotate(' + fmt(item.pad.rot) + ')' }, c: [
        { t: 'circle', a: { r: r, fill: 'url(#hop_padGrad)' } },
        { t: 'path', a: { d: veinsPath(r), stroke: C.padVein, 'stroke-width': 1.3, fill: 'none', opacity: 0.5, 'stroke-linecap': 'round' } },
        item.pad.notch ? { t: 'path', a: { d: notchPath(r + 0.6, item.pad.notch), fill: C.water, 'stroke-linejoin': 'round' } } : null,
        { t: 'circle', a: { r: r, fill: 'none', stroke: C.padDark, 'stroke-width': 1.2, opacity: 0.8 } }
      ] }
    ] }]);
  }
  function bankTaco(row) {
    var y0 = row.y - RH / 2;
    return svgItem('hop_bank', [
      { t: 'rect', a: { x: -10, y: y0 + 4, width: W + 20, height: RH - 4, fill: C.bank } },
      { t: 'rect', a: { x: -10, y: y0 - 2, width: W + 20, height: 9, rx: 4, fill: C.bankTop } },
      { t: 'g', c: row.pebbles.map(function (p) { return { t: 'circle', a: { cx: fmt(p.x), cy: fmt(row.y + 10 + p.y), r: fmt(p.r), fill: C.pebble, opacity: 0.8 } }; }) },
      { t: 'g', a: { stroke: C.reed, 'stroke-width': 2, 'stroke-linecap': 'round', opacity: 0.9 }, c: row.reeds.map(function (q) {
        return { t: 'path', a: { d: 'M' + fmt(q.x) + ',' + fmt(y0 + 6) + ' q' + fmt(q.lean) + ',' + fmt(-q.h / 2) + ' ' + fmt(q.lean * 1.4) + ',' + fmt(-q.h) } };
      }) }
    ]);
  }
  function causticTaco(row) {
    return svgItem('hop_caustic', row.caustics.map(function (c) {
      return { t: 'ellipse', a: { cx: fmt(c.x), cy: fmt(row.y + 18), rx: fmt(c.w), ry: 2.2, fill: C.caustic, opacity: 0.08 } };
    }));
  }
  function flyTaco() {
    return svgItem('hop_fly', [
      { t: 'g', a: { class: 'hop_wings' }, c: [
        { t: 'ellipse', a: { cx: -4.8, cy: -3, rx: 4.8, ry: 2.6, fill: C.wing, opacity: 0.85 } },
        { t: 'ellipse', a: { cx: 4.8, cy: -3, rx: 4.8, ry: 2.6, fill: C.wing, opacity: 0.85 } }
      ] },
      { t: 'ellipse', a: { rx: 3.6, ry: 2.8, fill: C.fly } },
      { t: 'circle', a: { cx: 3, cy: -0.8, r: 1.4, fill: C.tongue } }
    ]);
  }
  function frogTaco() {
    return { t: 'g', a: { id: 'hop_frog' }, c: [
      { t: 'g', a: { id: 'hop_legs' }, c: [
        { t: 'ellipse', a: { cx: -14, cy: 9, rx: 8.5, ry: 5, fill: C.frogDark } },
        { t: 'ellipse', a: { cx: 14, cy: 9, rx: 8.5, ry: 5, fill: C.frogDark } },
        { t: 'circle', a: { cx: -20, cy: 12, r: 3.6, fill: C.frogDark } },
        { t: 'circle', a: { cx: 20, cy: 12, r: 3.6, fill: C.frogDark } },
        { t: 'ellipse', a: { cx: -11, cy: -5, rx: 4.5, ry: 7.5, fill: C.frogDark } },
        { t: 'ellipse', a: { cx: 11, cy: -5, rx: 4.5, ry: 7.5, fill: C.frogDark } }
      ] },
      { t: 'ellipse', a: { rx: 15.5, ry: 14, fill: 'url(#hop_frogGrad)' } },
      { t: 'ellipse', a: { cy: 5, rx: 9.5, ry: 7, fill: C.frogBelly, opacity: 0.95 } },
      { t: 'path', a: { d: 'M-6,-3 Q0,1 6,-3', stroke: C.frogDark, 'stroke-width': 1.5, fill: 'none', 'stroke-linecap': 'round' } },
      { t: 'path', a: { id: 'hop_tongue', d: 'M0,-2 L0,-40', stroke: C.tongue, 'stroke-width': 3.2, 'stroke-linecap': 'round', opacity: 0 } },
      { t: 'circle', a: { cx: -8, cy: -10, r: 5.6, fill: C.eye } },
      { t: 'circle', a: { cx: 8, cy: -10, r: 5.6, fill: C.eye } },
      { t: 'circle', a: { cx: -8, cy: -11, r: 2.9, fill: C.pupil } },
      { t: 'circle', a: { cx: 8, cy: -11, r: 2.9, fill: C.pupil } },
      { t: 'circle', a: { cx: -9, cy: -12.5, r: 1, fill: '#ffffff' } },
      { t: 'circle', a: { cx: 7, cy: -12.5, r: 1, fill: '#ffffff' } }
    ] };
  }
  function fxTaco(fx) {
    if (fx.kind === 'ripple') return svgItem('hop_fx_ripple', [{ t: 'circle', a: { r: fx.r0, fill: 'none', stroke: C.ripple, 'stroke-width': 2, opacity: 0.8 } }], fx.x, fx.y);
    if (fx.kind === 'splash') return svgItem('hop_fx_splash', fx.drops.map(function (d) { return { t: 'circle', a: { cx: fmt(fx.x), cy: fmt(fx.y), r: fmt(d.r), fill: C.ripple, opacity: 0.9 } }; }));
    return svgItem('hop_fx_pop', [{ t: 'text', a: { fill: fx.color, 'font-size': 17, 'font-weight': 700, 'text-anchor': 'middle', 'paint-order': 'stroke', stroke: C.waterDeep, 'stroke-width': 3, 'font-family': 'inherit' }, c: fx.text }], fx.x, fx.y);
  }

  function sceneTaco() {
    return { t: 'svg', a: { id: 'hop_svg', viewBox: '0 0 ' + W + ' ' + H, preserveAspectRatio: 'xMidYMid meet', role: 'img', 'aria-label': 'Lilypad Hopper game board' }, c: [
      { t: 'defs', c: [
        // everything that scrolls is clipped to the board, so pads drifting off the edge vanish there
        { t: 'clipPath', a: { id: 'hop_clip' }, c: { t: 'rect', a: { x: 0, y: 0, width: W, height: H } } },
        { t: 'linearGradient', a: { id: 'hop_waterGrad', x1: 0, y1: 0, x2: 0, y2: 1 }, c: [
          { t: 'stop', a: { offset: '0%', 'stop-color': C.waterDeep } },
          { t: 'stop', a: { offset: '100%', 'stop-color': C.waterLight } }
        ] },
        { t: 'radialGradient', a: { id: 'hop_padGrad', cx: '38%', cy: '36%', r: '70%' }, c: [
          { t: 'stop', a: { offset: '0%', 'stop-color': C.padLight } },
          { t: 'stop', a: { offset: '60%', 'stop-color': C.pad } },
          { t: 'stop', a: { offset: '100%', 'stop-color': C.padDark } }
        ] },
        { t: 'radialGradient', a: { id: 'hop_frogGrad', cx: '40%', cy: '35%', r: '75%' }, c: [
          { t: 'stop', a: { offset: '0%', 'stop-color': '#2DBA6E' } },
          { t: 'stop', a: { offset: '65%', 'stop-color': C.frog } },
          { t: 'stop', a: { offset: '100%', 'stop-color': C.frogDark } }
        ] }
      ] },
      { t: 'rect', a: { width: W, height: H, fill: 'url(#hop_waterGrad)' } },
      { t: 'g', a: { 'clip-path': 'url(#hop_clip)' }, c: { t: 'g', a: { id: 'hop_world' }, c: [
        { t: 'g', a: { id: 'hop_caustics' } },
        { t: 'g', a: { id: 'hop_banks' } },
        { t: 'g', a: { id: 'hop_pads' } },
        { t: 'ellipse', a: { id: 'hop_shadow', rx: 16, ry: 7, fill: C.waterDeep, opacity: 0.4 } },
        { t: 'g', a: { id: 'hop_flies' } },
        frogTaco(),
        { t: 'g', a: { id: 'hop_fx' } }
      ] } },
      // vignette edges so the board reads as a pond, not a flat rectangle
      { t: 'rect', a: { width: W, height: 70, fill: 'url(#hop_waterGrad)', opacity: 0.55, 'pointer-events': 'none' } },
      hudTaco()
    ] };
  }
  function lifeIcon(i) {
    return { t: 'g', a: { class: 'hop_life', transform: 'translate(' + (26 + i * 30) + ',30)' }, c: [
      { t: 'circle', a: { r: 10, fill: C.frog, stroke: C.frogDark, 'stroke-width': 1.5 } },
      { t: 'circle', a: { cx: -4, cy: -4, r: 3.2, fill: C.eye } }, { t: 'circle', a: { cx: 4, cy: -4, r: 3.2, fill: C.eye } },
      { t: 'circle', a: { cx: -4, cy: -4.5, r: 1.6, fill: C.pupil } }, { t: 'circle', a: { cx: 4, cy: -4.5, r: 1.6, fill: C.pupil } },
      { t: 'path', a: { d: 'M-4,3 Q0,6 4,3', stroke: C.frogDark, 'stroke-width': 1.2, fill: 'none' } }
    ] };
  }
  function hudTaco() {
    var lives = []; for (var i = 0; i < LIVES; i++) lives.push(lifeIcon(i));
    var T = { fill: C.text, 'text-anchor': 'end', 'paint-order': 'stroke', stroke: C.waterDeep, 'stroke-width': 4, 'font-family': 'inherit', 'font-weight': 700 };
    return { t: 'g', a: { id: 'hop_hud', 'pointer-events': 'none' }, c: [
      { t: 'g', a: { id: 'hop_lives' }, c: lives },
      { t: 'text', a: Object.assign({ id: 'hop_hud_score', x: W - 16, y: 38, 'font-size': 26 }, T), c: '0' },
      { t: 'text', a: Object.assign({ id: 'hop_hud_best', x: W - 16, y: 56, 'font-size': 12, opacity: 0.85 }, T), c: 'best 0' }
    ] };
  }

  // ---------------------------------------------------------------- per-frame render
  var hudLast = {};
  function renderHud() {
    if (hudLast.score !== G.score) { hudLast.score = G.score; bw.patch(els.hudScore, String(G.score)); }
    if (hudLast.best !== G.best) { hudLast.best = G.best; bw.patch(els.hudBest, 'best ' + G.best); }
    if (hudLast.lives !== G.lives) { hudLast.lives = G.lives; var kids = els.lives.childNodes; for (var i = 0; i < kids.length; i++) bw.patch(kids[i], { opacity: i < G.lives ? 1 : 0.22 }); }
  }
  function render() {
    var f = G.frog, t = nowS(), rows = visibleRows();
    renderHud();
    bw.patch(els.world, { transform: 'translate(0,' + fmt(H - G.camBottom) + ')' });

    var banks = [], pads = [], flies = [], padsRows = [];
    rows.forEach(function (row) {
      if (row.kind === 'bank') { banks.push(row); return; }
      padsRows.push(row);
      row.pads.forEach(function (p) { pads.push({ key: row.r + ':' + p.i, row: row, pad: p }); });
      if (row.fly && !row.fly.eaten) flies.push(row);
    });
    bw.syncChildren(els.caustics, padsRows, { key: function (r) { return r.r; }, create: causticTaco });
    bw.syncChildren(els.banks, banks, { key: function (r) { return r.r; }, create: bankTaco });
    bw.syncChildren(els.pads, pads, { key: function (i) { return i.key; }, create: padTaco, update: function (el, i) {
      var x = padX(i.row, i.pad, G.t), b = G.bob[i.key], s = 1;
      if (b != null) { var a = t - b; s = a < 0.5 ? 1 + 0.1 * Math.sin(a * 18) * Math.exp(-a * 7) : 1; if (a > 0.6) delete G.bob[i.key]; }
      bw.patch(el, { x: fmt(x), y: fmt(i.row.y) }); bw.patch(el.firstChild, { transform: 'scale(' + fmt(s) + ')' });
    } });
    bw.syncChildren(els.flies, flies, { key: function (r) { return 'f' + r.r; }, create: flyTaco, update: function (el, r) {
      var x = padX(r, r.pads[r.fly.pad], G.t) + Math.sin(G.t * 2.1 + r.fly.seed) * 6, y = r.y - 26 + Math.sin(G.t * 5 + r.fly.seed) * 4;
      bw.patch(el, { x: fmt(x), y: fmt(y) });
      bw.patch(el.firstChild, { transform: 'scale(1,' + fmt(0.35 + 0.65 * Math.abs(Math.sin(G.t * 42 + r.fly.seed))) + ')' });
    } });

    // effects
    G.fx = G.fx.filter(function (fx) { return (t - fx.t0) < fx.dur; });
    bw.syncChildren(els.fx, G.fx, { key: function (fx) { return fx.id; }, create: fxTaco, update: function (el, fx) {
      var p = (t - fx.t0) / fx.dur;
      if (fx.kind === 'ripple') bw.patch(el.firstChild, { r: fmt(lerp(fx.r0, fx.r1, Math.sqrt(p))), opacity: fmt(0.8 * (1 - p)), 'stroke-width': fmt(2.2 * (1 - p) + 0.4) });
      else if (fx.kind === 'splash') {
        var tt = p * fx.dur, kids = el.childNodes;  // the drop circles
        for (var i = 0; i < kids.length; i++) { var d = fx.drops[i]; bw.patch(kids[i], { cx: fmt(fx.x + d.vx * tt), cy: fmt(fx.y - d.vy * tt + 190 * tt * tt), opacity: fmt(1 - p) }); }
      } else bw.patch(el.firstChild, { transform: 'translate(0,' + fmt(-34 * p) + ')', opacity: fmt(p < 0.7 ? 1 : (1 - p) / 0.3) });
    } });

    // frog
    var dl = t - f.landT, sq = Math.exp(-dl * 11), sx, sy;
    if (f.hop) { var hp = (t - f.hop.t0) / f.hop.dur, grow = 1 + 0.28 * Math.sin(hp * Math.PI); sx = grow * 0.92; sy = grow * 1.1; }
    else { sx = 1 + 0.22 * sq; sy = 1 - 0.18 * sq; }
    sx *= f.scale; sy *= f.scale;
    bw.patch(els.frog, { transform: 'translate(' + fmt(f.x) + ',' + fmt(f.y - f.lift) + ') rotate(' + f.face + ') scale(' + fmt(sx) + ',' + fmt(sy) + ')', opacity: fmt(f.alpha) });
    bw.patch(els.legs, { transform: f.hop ? 'scale(1,' + fmt(1 + 0.35 * Math.sin(((t - f.hop.t0) / f.hop.dur) * Math.PI)) + ')' : '' });
    var sh = Math.max(0.25, 1 - f.lift / 50);
    bw.patch(els.shadow, { cx: fmt(f.x), cy: fmt(f.y + 7), rx: fmt(16 * sh * f.scale), ry: fmt(7 * sh * f.scale), opacity: fmt(0.4 * f.alpha) });
    var ta = t - f.tongue, tl = ta < 0.22 ? Math.sin(ta / 0.22 * Math.PI) : 0;
    bw.patch(els.tongue, { opacity: tl > 0 ? 1 : 0, transform: 'translate(0,-2) scale(1,' + fmt(Math.max(0.01, tl)) + ') translate(0,2)' });
  }

  function frame() {
    rafId = root.requestAnimationFrame(frame);
    var t = nowS(), dt = G.lastFrame ? Math.min(0.05, t - G.lastFrame) : 0;
    G.lastFrame = t;
    update(dt);
    render();
  }

  // ---------------------------------------------------------------- input
  var KEYS = { ArrowUp: 'up', KeyW: 'up', Space: 'up', ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', ArrowDown: 'down', KeyS: 'down', Enter: 'start', KeyM: 'mute', KeyP: 'pause', Escape: 'pause' };
  function input(action) {
    if (action === 'mute') { bw.pub('hopper:mute'); return; }
    if (G.state !== 'playing') {
      if ((G.state === 'dead' || G.state === 'lost') && !G.overlayShown) return;    // let the splash play out
      if (action === 'start' || action === 'up' || action === 'tap') { if (G.state === 'lost') continueLife(); else start(); }
      return;
    }
    if (action === 'pause') { G.paused = !G.paused; pubState(); return; }
    if (G.paused) { if (action !== 'mute') { G.paused = false; pubState(); } return; }
    if (action === 'up' || action === 'tap') hop(1, 0);
    else if (action === 'left') hop(0, -1);
    else if (action === 'right') hop(0, 1);
    else if (action === 'down') hop(-1, 0);
  }
  function onKey(e) {
    var a = KEYS[e.code];
    if (!a) return;
    if (e.target && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    e.preventDefault();
    if (e.repeat) return;
    A.init(); input(a);
  }
  function onPointerDown(e) { pointer = { x: e.clientX, y: e.clientY, t: nowS() }; A.init(); if (e.pointerId != null && e.target.setPointerCapture) { try { e.target.setPointerCapture(e.pointerId); } catch (err) {} } e.preventDefault(); }
  function onPointerUp(e) {
    if (!pointer) return;
    var dx = e.clientX - pointer.x, dy = e.clientY - pointer.y, dist = Math.sqrt(dx * dx + dy * dy); pointer = null;
    if (dist < 18) { input('tap'); return; }
    if (Math.abs(dx) > Math.abs(dy)) input(dx > 0 ? 'right' : 'left'); else input(dy < 0 ? 'up' : 'down');
  }
  function onVisibility() { if (root.document.hidden && G.state === 'playing' && !G.paused) { G.paused = true; pubState(); } }
  function listen(target, ev, fn, opts) { target.addEventListener(ev, fn, opts); listeners.push([target, ev, fn, opts]); }

  // ---------------------------------------------------------------- public api
  var api = {
    W: W, H: H, LIVES: LIVES, colors: C,
    sceneTaco: sceneTaco,
    /* Mount the SVG board into `host` (id/selector/element) and start the loop in the title state. */
    mount: function (host) {
      api.destroy();
      G = freshState(); rowAt(0);
      var svg = bw.mount(bw.el(host) || host, sceneTaco());
      els = { svg: svg, world: bw.el('hop_world'), caustics: bw.el('hop_caustics'), banks: bw.el('hop_banks'), pads: bw.el('hop_pads'), flies: bw.el('hop_flies'),
        fx: bw.el('hop_fx'), frog: bw.el('hop_frog'), legs: bw.el('hop_legs'), shadow: bw.el('hop_shadow'), tongue: bw.el('hop_tongue'),
        hudScore: bw.el('hop_hud_score'), hudBest: bw.el('hop_hud_best'), lives: bw.el('hop_lives') };
      hudLast = {};
      listen(root, 'keydown', onKey);
      listen(svg, 'pointerdown', onPointerDown);
      listen(svg, 'pointerup', onPointerUp);
      listen(svg, 'pointercancel', function () { pointer = null; });
      listen(root.document, 'visibilitychange', onVisibility);
      pubHud(); pubState();
      frame();
      return svg;
    },
    destroy: function () {
      if (rafId) root.cancelAnimationFrame(rafId); rafId = 0;
      listeners.forEach(function (l) { l[0].removeEventListener(l[1], l[2], l[3]); }); listeners = [];
    },
    start: start,
    input: input,
    state: function () { return G; }
  };
  root.HopperGame = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
