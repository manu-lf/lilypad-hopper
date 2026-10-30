/* Lilypad Hopper — sound effects.
   Everything is synthesized with the Web Audio API (no audio files): a "boing" for
   the hop, a soft thud for landing, a filtered-noise splash, blips for a fly, a croak
   for a streak bonus. Master volume is deliberately low (0.14). Muted state persists. */
(function (root) {
  var ctx = null, master = null, muted = false, VOL = 0.14;
  try { muted = root.localStorage && root.localStorage.getItem('hopper_muted') === '1'; } catch (e) {}

  function ensure() {
    if (ctx) { if (ctx.state === 'suspended') { try { ctx.resume(); } catch (e) {} } return true; }
    var AC = root.AudioContext || root.webkitAudioContext;
    if (!AC) return false;
    try {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = muted ? 0 : VOL;
      master.connect(ctx.destination);
    } catch (e) { ctx = null; return false; }
    return true;
  }
  function ready() { return ensure() && !muted; }
  function now() { return ctx.currentTime; }

  function env(g, t0, peak, attack, decay) {
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(peak, t0 + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay);
  }
  // A single oscillator sweep f0 -> f1 over dur seconds.
  function tone(type, f0, f1, dur, peak, t0, filterHz) {
    var o = ctx.createOscillator(), g = ctx.createGain(), dest = master;
    o.type = type;
    o.frequency.setValueAtTime(f0, t0);
    if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t0 + dur);
    env(g, t0, peak, Math.min(0.012, dur * 0.2), dur);
    if (filterHz) { var f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = filterHz; o.connect(f); f.connect(g); }
    else o.connect(g);
    g.connect(dest);
    o.start(t0); o.stop(t0 + dur + 0.06);
  }
  // White noise through a sweeping low-pass: water.
  function noise(dur, fStart, fEnd, peak, t0) {
    var n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    var src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    src.buffer = buf; f.type = 'lowpass'; f.Q.value = 0.8;
    f.frequency.setValueAtTime(fStart, t0); f.frequency.exponentialRampToValueAtTime(fEnd, t0 + dur);
    env(g, t0, peak, 0.01, dur - 0.01);
    src.connect(f); f.connect(g); g.connect(master);
    src.start(t0); src.stop(t0 + dur + 0.05);
  }

  var api = {
    get muted() { return muted; },
    init: function () { ensure(); },
    setMuted: function (m) {
      muted = !!m;
      try { root.localStorage && root.localStorage.setItem('hopper_muted', muted ? '1' : '0'); } catch (e) {}
      if (master) master.gain.setTargetAtTime(muted ? 0 : VOL, ctx.currentTime, 0.02);
      return muted;
    },
    toggle: function () { return api.setMuted(!muted); },
    // --- effects ---
    hop: function () { if (!ready()) return; var t = now();
      tone('sine', 320, 780, 0.14, 0.55, t); tone('triangle', 160, 390, 0.14, 0.22, t); },
    land: function () { if (!ready()) return; var t = now();
      tone('triangle', 210, 90, 0.09, 0.35, t); },
    splash: function () { if (!ready()) return; var t = now();
      noise(0.55, 2400, 200, 0.7, t); tone('sine', 240, 55, 0.35, 0.3, t); },
    fly: function () { if (!ready()) return; var t = now();
      tone('sine', 880, 880, 0.06, 0.35, t); tone('sine', 1320, 1320, 0.06, 0.35, t + 0.07);
      tone('sine', 420, 170, 0.13, 0.3, t + 0.16); },
    // A little croak: sawtooth with pulsing gain through a low-pass.
    ribbit: function () { if (!ready()) return; var t = now();
      var o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(88, t); o.frequency.linearRampToValueAtTime(140, t + 0.12); o.frequency.linearRampToValueAtTime(92, t + 0.3);
      f.type = 'lowpass'; f.frequency.value = 620; f.Q.value = 2.5;
      var N = 64, curve = new Float32Array(N);
      for (var i = 0; i < N; i++) { var p = i / N; curve[i] = 0.5 * Math.pow(Math.abs(Math.sin(p * Math.PI * 9)), 0.6) * (1 - p * 0.7); }
      g.gain.setValueCurveAtTime(curve, t, 0.32);
      o.connect(f); f.connect(g); g.connect(master); o.start(t); o.stop(t + 0.36); },
    lose: function () { if (!ready()) return; var t = now();
      tone('triangle', 420, 180, 0.25, 0.3, t); tone('triangle', 300, 120, 0.3, 0.2, t + 0.12); },
    gameover: function () { if (!ready()) return; var t = now();
      tone('triangle', 300, 48, 0.6, 0.35, t, 1200); tone('triangle', 150, 40, 0.6, 0.2, t + 0.05, 900); },
    best: function () { if (!ready()) return; var t = now();
      [523, 659, 784, 1046].forEach(function (f, i) { tone('sine', f, f, 0.11, 0.3, t + i * 0.09); }); },
    start: function () { if (!ready()) return; var t = now();
      tone('sine', 440, 660, 0.12, 0.3, t); tone('sine', 660, 880, 0.12, 0.3, t + 0.1); }
  };
  root.HopperAudio = api;
})(typeof window !== 'undefined' ? window : (typeof globalThis !== 'undefined' ? globalThis : this));
