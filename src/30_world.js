// ===================== world: islands, clouds, spawns =====================
const WORLD = {
  N: 200, S: 14000, half: 7000, cell: 70, H: null,
  B: 9000,           // combat boundary (square half size) — jets get a bigger box than WWII props
  CEIL: 7500,
  setEra(era) { this.B = era === 'prop' ? 6200 : 9000; },
  ISL: [
    { x: 0, z: 200, r: 3000, h: 1.0 }, { x: -4300, z: 3100, r: 1500, h: 0.72 }, { x: 4100, z: -3400, r: 1750, h: 0.85 },
    { x: -3700, z: -3900, r: 1000, h: 0.5 }, { x: 4600, z: 3500, r: 1050, h: 0.55 }, { x: 1300, z: 4900, r: 650, h: 0.42 },
    { x: -5600, z: -500, r: 750, h: 0.45 }, { x: 2700, z: -900, r: 600, h: 0.35 },
  ],
  rawH(x, z) {
    const wx = x + (fbm(x * 0.00035, z * 0.00035, 3, 11) - 0.5) * 2200;
    const wz = z + (fbm(x * 0.00035 + 40, z * 0.00035 - 40, 3, 12) - 0.5) * 2200;
    let m = 0;
    for (const I of this.ISL) { const d = Math.hypot(wx - I.x, wz - I.z) / I.r; m = Math.max(m, I.h * smooth(1.0, 0.25, d)); }
    const ridge = 1 - Math.abs(2 * fbm(x * 0.0007, z * 0.0007, 4, 21) - 1);
    const hills = fbm(x * 0.0018, z * 0.0018, 3, 31);
    let h = m * (25 + 1050 * Math.pow(ridge, 2.4) * m + 260 * hills * m);
    h -= 70 * (1 - smooth(0.0, 0.18, m));
    return h;
  },
  gen() {
    const N = this.N, H = new Float32Array((N + 1) * (N + 1));
    this.cell = this.S / N;
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = this.rawH(-this.half + i * this.cell, -this.half + j * this.cell);
    this.H = H;
  },
  heightAt(x, z) {
    const N = this.N, fx = (x + this.half) / this.cell, fz = (z + this.half) / this.cell;
    if (fx < 0 || fz < 0 || fx >= N || fz >= N) return -70;
    const i = Math.floor(fx), j = Math.floor(fz), u = fx - i, v = fz - j, H = this.H, W = N + 1;
    const a = H[j * W + i], b = H[j * W + i + 1], c = H[(j + 1) * W + i], d = H[(j + 1) * W + i + 1];
    // match the triangulation used by the mesh (split along a-d diagonal)
    if (u + v < 1) return a + (b - a) * u + (c - a) * v;
    return d + (c - d) * (1 - u) + (b - d) * (1 - v);
  },
  groundAt(x, z) { return Math.max(0, this.heightAt(x, z)); },
  color(h, ny, n) {
    const hj = h + (n - 0.5) * 90;
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    let c;
    if (h < -1) c = mix([0.78, 0.74, 0.56], [0.16, 0.4, 0.44], clamp(-h / 45, 0, 1));
    else if (h < 12) c = [0.86, 0.8, 0.6];
    else if (ny < 0.74) c = mix([0.5, 0.47, 0.41], [0.4, 0.38, 0.34], n);
    else if (hj < 240) c = mix([0.38, 0.57, 0.26], [0.29, 0.47, 0.21], n);
    else if (hj < 640) c = mix([0.24, 0.4, 0.2], [0.31, 0.43, 0.24], n);
    else if (hj < 930) c = mix([0.47, 0.46, 0.38], [0.55, 0.53, 0.45], n);
    else c = ny > 0.8 ? [0.93, 0.95, 0.97] : [0.62, 0.62, 0.6];
    const k = 0.94 + n * 0.1;
    return [c[0] * k, c[1] * k, c[2] * k];
  },
  buildTerrain() {
    const N = this.N, W = N + 1, H = this.H, cs = this.cell, out = [];
    const P = (i, j) => [-this.half + i * cs, H[j * W + i], -this.half + j * cs];
    const face = (a, b, c) => {
      if (a[1] < -14 && b[1] < -14 && c[1] < -14) return;
      let n = vnorm(vcross(vsub(b, a), vsub(c, a)));
      if (n[1] < 0) { n = vmul(n, -1); const t = b; b = c; c = t; }
      const hc = (a[1] + b[1] + c[1]) / 3, cx = (a[0] + b[0] + c[0]) / 3, cz = (a[2] + b[2] + c[2]) / 3;
      const col = this.color(hc, n[1], hash2(Math.floor(cx), Math.floor(cz), 5));
      for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2], col[0], col[1], col[2]);
    };
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i, j + 1), d = P(i + 1, j + 1);
      face(a, b, c); face(d, c, b);
    }
    this.terrainMesh = R.mesh(new Float32Array(out), 'lit');
  },
  buildClouds(count) {
    const rng = mulberry(4242), mb = new MB();
    const top = [1, 1, 1], bot = [0.78, 0.82, 0.88];
    this.cloudList = [];
    for (let k = 0; k < count; k++) {
      const cx = (rng() - 0.5) * 17000, cz = (rng() - 0.5) * 17000, cy = 1350 + rng() * 1100;
      const big = 0.7 + rng() * 0.8, puffs = 4 + Math.floor(rng() * 6);
      for (let i = 0; i < puffs; i++) {
        const r = (70 + rng() * 120) * big;
        const c = [cx + (rng() - 0.5) * 420 * big, cy + (rng() - 0.3) * 60 * big, cz + (rng() - 0.5) * 260 * big];
        mb.icosphere(c, r, 0.62, 1, (n) => { const t = clamp(n[1] * 0.5 + 0.5, 0, 1); return [bot[0] + (top[0] - bot[0]) * t, bot[1] + (top[1] - bot[1]) * t, bot[2] + (top[2] - bot[2]) * t]; });
      }
      this.cloudList.push({ x: cx, y: cy, z: cz, r: 320 * big });
    }
    mb.col = null;
    this.cloudMesh = R.mesh(mb.data(), 'lit');
  },
  // spawn: position on the edge ring facing the middle, far from enemies
  spawn(team, foes) {
    let best = null, bestScore = -1;
    for (let k = 0; k < 12; k++) {
      let ang;
      if (team === 1) ang = Math.PI + rnd(-0.7, 0.7); else if (team === 2) ang = rnd(-0.7, 0.7); else ang = rnd(0, TAU);
      const r = rnd(0.63, 0.82) * this.B;
      const p = new V3(Math.cos(ang) * r, rnd(1500, 2500), Math.sin(ang) * r);
      let score = 1e9; for (const e of foes) score = Math.min(score, e.pos.dist(p));
      if (score > bestScore) { bestScore = score; best = p; }
    }
    const yawOff = rnd(-0.35, 0.35);
    const f = new V3(-best.x, 0, -best.z).norm();
    const c = Math.cos(yawOff), s = Math.sin(yawOff);
    const fr = new V3(f.x * c - f.z * s, 0, f.x * s + f.z * c);
    return { pos: best, q: new Q().lookDir(fr, new V3(0, 1, 0)) };
  },
};
