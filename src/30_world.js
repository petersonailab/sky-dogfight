// ===================== world: open sky over the sea, clouds, spawns =====================
// No islands or mountains: just sky, clouds and the sea surface (y = 0) underneath.
const WORLD = {
  B: 10000,          // combat boundary (square half size): the arena is 20 km × 20 km for every era
  CEIL: 7500,
  setEra() { this.B = 10000; },
  groundAt() { return 0; },
  buildClouds(count) {
    const rng = mulberry(4242), mb = new MB();
    const top = [1, 1, 1], bot = [0.78, 0.82, 0.88];
    const spread = (this.B + 1500) * 2;   // a little beyond the boundary so the edge of the arena isn't bare
    this.cloudList = [];
    for (let k = 0; k < count; k++) {
      const cx = (rng() - 0.5) * spread, cz = (rng() - 0.5) * spread, cy = 1350 + rng() * 1100;
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
