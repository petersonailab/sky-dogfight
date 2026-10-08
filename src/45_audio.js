// ===================== synthesized audio =====================
const AU = {
  ctx: null, master: null, noise: null, vol: 0.7, muted: false, eng: null, lock: null, lastBeep: 0, warnLevel: 0,
  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const C = window.AudioContext || window.webkitAudioContext; if (!C) return;
    try { this.ctx = new C(); } catch (e) { return; }
    const ctx = this.ctx;
    this.master = ctx.createGain(); this.master.gain.value = this.muted ? 0 : this.vol; this.master.connect(ctx.destination);
    const len = ctx.sampleRate * 2, buf = ctx.createBuffer(1, len, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noise = buf;
    this.buildEngine(); this.buildLock();
  },
  setVolume(v) { this.vol = v; if (this.master) this.master.gain.setTargetAtTime(this.muted ? 0 : v, this.ctx.currentTime, 0.05); },
  setMuted(m) { this.muted = m; this.setVolume(this.vol); },
  src() { const s = this.ctx.createBufferSource(); s.buffer = this.noise; s.loop = true; s.loopStart = Math.random(); return s; },
  buildEngine() {
    const ctx = this.ctx, g = ctx.createGain(); g.gain.value = 0; g.connect(this.master);
    const n = this.src(), bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 600; bp.Q.value = 0.7;
    const ng = ctx.createGain(); ng.gain.value = 0.5; n.connect(bp); bp.connect(ng); ng.connect(g);
    const o = ctx.createOscillator(); o.type = 'sawtooth'; o.frequency.value = 70;
    const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 420;
    const og = ctx.createGain(); og.gain.value = 0.22; o.connect(lp); lp.connect(og); og.connect(g);
    const ab = this.src(), abf = ctx.createBiquadFilter(); abf.type = 'lowpass'; abf.frequency.value = 380;
    const abg = ctx.createGain(); abg.gain.value = 0; ab.connect(abf); abf.connect(abg); abg.connect(g);
    const w = this.src(), wf = ctx.createBiquadFilter(); wf.type = 'highpass'; wf.frequency.value = 1400;
    const wg = ctx.createGain(); wg.gain.value = 0; w.connect(wf); wf.connect(wg); wg.connect(this.master);
    n.start(); o.start(); ab.start(); w.start();
    this.eng = { g, bp, ng, o, lp, og, abg, wg };
  },
  buildLock() {
    const ctx = this.ctx, o = ctx.createOscillator(), lfo = ctx.createOscillator(), lg = ctx.createGain(), g = ctx.createGain();
    o.type = 'sine'; o.frequency.value = 480; lfo.frequency.value = 11; lg.gain.value = 60; lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0; o.connect(g); g.connect(this.master); o.start(); lfo.start();
    this.lock = { o, lg, g, state: 0 };
  },
  // per frame: engine sound for the viewer's own aircraft
  engine(alive, thr, ab, speed, prop, vmax) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, E = this.eng, k = 0.12;
    const on = alive ? 1 : 0;
    E.g.gain.setTargetAtTime(on * 0.55, t, 0.3);
    if (prop) {
      E.o.type = 'square'; E.o.frequency.setTargetAtTime(48 + thr * 46 + (ab ? 10 : 0), t, k);
      E.lp.frequency.setTargetAtTime(520 + thr * 600, t, k); E.og.gain.setTargetAtTime(0.13, t, k);
      E.bp.frequency.setTargetAtTime(300 + thr * 300, t, k); E.ng.gain.setTargetAtTime(0.25, t, k); E.abg.gain.setTargetAtTime(0, t, k);
    } else {
      E.o.type = 'sawtooth'; E.o.frequency.setTargetAtTime(55 + thr * 50, t, k);
      E.lp.frequency.setTargetAtTime(300 + thr * 300, t, k); E.og.gain.setTargetAtTime(0.18, t, k);
      E.bp.frequency.setTargetAtTime(500 + thr * 1500, t, k); E.ng.gain.setTargetAtTime(0.25 + thr * 0.35, t, k);
      E.abg.gain.setTargetAtTime(ab ? 1.1 : 0, t, 0.15);
    }
    E.wg.gain.setTargetAtTime(on * clamp((speed / vmax) - 0.35, 0, 1) * 0.12, t, 0.2);
  },
  setLock(state) {
    if (!this.ctx || this.lock.state === state) return;
    const L = this.lock, t = this.ctx.currentTime; L.state = state;
    if (state === 0) L.g.gain.setTargetAtTime(0, t, 0.03);
    else if (state === 1) { L.o.frequency.setTargetAtTime(470, t, 0.02); L.lg.gain.setTargetAtTime(70, t, 0.02); L.g.gain.setTargetAtTime(0.05, t, 0.03); }
    else { L.o.frequency.setTargetAtTime(1080, t, 0.02); L.lg.gain.setTargetAtTime(0, t, 0.02); L.g.gain.setTargetAtTime(0.06, t, 0.03); }
  },
  // incoming-missile warning; level 0 = none, 1 = imminent
  warn(level) {
    if (!this.ctx || level <= 0) return;
    const t = this.ctx.currentTime, period = lerp(0.55, 0.11, level);
    if (t - this.lastBeep < period) return;
    this.lastBeep = t;
    this.tone(level > 0.6 ? 1250 : 980, 0.07, 0.07, 'square');
  },
  // radar warning: slow chirp while someone is locking, fast while locked
  rwr(level) {
    if (!this.ctx || level <= 0) return;
    const t = this.ctx.currentTime, period = level >= 2 ? 0.28 : 0.9;
    if (t - this.lastBeep < period) return;
    this.lastBeep = t;
    this.tone(level >= 2 ? 1500 : 820, 0.05, 0.045, 'triangle');
  },
  tone(f, dur, vol, type = 'sine', f2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, o = this.ctx.createOscillator(), g = this.ctx.createGain();
    o.type = type; o.frequency.setValueAtTime(f, t); if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dur + 0.02);
  },
  burst(dur, freq, vol, type = 'lowpass', q = 0.8, f2) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime, s = this.ctx.createBufferSource(); s.buffer = this.noise;
    const f = this.ctx.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
    if (f2) f.frequency.exponentialRampToValueAtTime(f2, t + dur);
    const g = this.ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0008, t + dur);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  },
  att(dist) { return clamp(1 - dist / 2600, 0, 1) ** 2; },
  gun(dist, heavy) { const a = this.att(dist); if (a < 0.02) return; this.burst(heavy ? 0.09 : 0.06, heavy ? 900 : 1500, 0.32 * a, 'bandpass', 0.9); },
  boom(dist, big) { const a = Math.max(this.att(dist * 0.6), big ? 0.04 : 0); if (a < 0.01) return; this.burst(big ? 1.6 : 0.8, big ? 900 : 1400, (big ? 0.9 : 0.5) * a, 'lowpass', 0.7, 60); this.tone(big ? 55 : 80, big ? 0.9 : 0.4, 0.5 * a, 'sine', 30); },
  hurt() { this.burst(0.12, 2600, 0.35, 'bandpass', 1.5); this.tone(170, 0.14, 0.22, 'triangle', 90); },
  confirm() { this.tone(2300, 0.035, 0.06, 'square'); },
  launch() { this.burst(0.9, 600, 0.4, 'bandpass', 0.6, 3200); },
  flare() { this.burst(0.06, 1800, 0.25, 'bandpass', 1); setTimeout(() => this.burst(0.06, 1700, 0.2, 'bandpass', 1), 90); },
  click() { this.tone(900, 0.04, 0.05, 'square'); },
  kill() { this.tone(660, 0.12, 0.09, 'triangle'); setTimeout(() => this.tone(990, 0.18, 0.09, 'triangle'), 110); },
  alarm() { this.tone(520, 0.12, 0.08, 'sawtooth'); },
};
