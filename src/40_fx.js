// ===================== particles + streaks =====================
const FX = {
  MAX: 4000, ST: 16, n: 0, P: null, smoke: null, fire: null, sd: null, fd: null, order: null, depth: null, budget: 1,
  init() {
    this.P = new Float32Array(this.MAX * this.ST);
    this.sd = new Float32Array(this.MAX * 8); this.fd = new Float32Array(this.MAX * 8);
    this.smoke = R.mesh(this.sd, 'part', true); this.fire = R.mesh(this.fd, 'part', true);
    this.smoke.n = 0; this.fire.n = 0;
    this.order = new Uint32Array(this.MAX); this.depth = new Float32Array(this.MAX);
  },
  clear() { this.n = 0; },
  // p: position, v: velocity, life seconds, s0->s1 size (m), rgb, alpha, drag (1/s), grav (m/s^2, negative rises), add (1 additive)
  emit(px, py, pz, vx, vy, vz, life, s0, s1, r, g, b, a, drag, grav, add) {
    if (this.n >= this.MAX) return;
    const P = this.P, o = this.n++ * this.ST;
    P[o] = px; P[o + 1] = py; P[o + 2] = pz; P[o + 3] = vx; P[o + 4] = vy; P[o + 5] = vz;
    P[o + 6] = life; P[o + 7] = life; P[o + 8] = s0; P[o + 9] = s1; P[o + 10] = r; P[o + 11] = g; P[o + 12] = b; P[o + 13] = a; P[o + 14] = drag; P[o + 15] = grav + (add ? 1000 : 0);
  },
  update(dt) {
    const P = this.P, ST = this.ST;
    let i = 0;
    while (i < this.n) {
      const o = i * ST;
      P[o + 6] -= dt;
      if (P[o + 6] <= 0) { // swap-remove
        const last = (--this.n) * ST;
        if (last !== o) for (let k = 0; k < ST; k++) P[o + k] = P[last + k];
        continue;
      }
      const drag = Math.exp(-P[o + 14] * dt), gv = P[o + 15] >= 500 ? P[o + 15] - 1000 : P[o + 15];
      P[o + 3] *= drag; P[o + 4] = P[o + 4] * drag - gv * dt; P[o + 5] *= drag;
      P[o] += P[o + 3] * dt; P[o + 1] += P[o + 4] * dt; P[o + 2] += P[o + 5] * dt;
      i++;
    }
  },
  upload() {
    const P = this.P, ST = this.ST, cam = R.cam.pos;
    let ns = 0, nf = 0;
    const sd = this.sd, fd = this.fd, order = this.order, depth = this.depth;
    for (let i = 0; i < this.n; i++) {
      const o = i * ST;
      if (P[o + 15] >= 500) {
        const t = 1 - P[o + 6] / P[o + 7], k = nf * 8, fade = Math.min(1, P[o + 6] / (P[o + 7] * 0.6 + 0.001));
        fd[k] = P[o]; fd[k + 1] = P[o + 1]; fd[k + 2] = P[o + 2];
        fd[k + 3] = P[o + 10]; fd[k + 4] = P[o + 11]; fd[k + 5] = P[o + 12]; fd[k + 6] = P[o + 13] * fade; fd[k + 7] = P[o + 8] + (P[o + 9] - P[o + 8]) * t;
        nf++;
      } else {
        const dx = P[o] - cam.x, dy = P[o + 1] - cam.y, dz = P[o + 2] - cam.z;
        depth[ns] = dx * dx + dy * dy + dz * dz; order[ns] = i; ns++;
      }
    }
    // sort far -> near
    const pairs = new Array(ns);
    for (let k = 0; k < ns; k++) pairs[k] = k;
    pairs.sort((a, b) => depth[b] - depth[a]);
    for (let k = 0; k < ns; k++) {
      const o = order[pairs[k]] * ST, t = 1 - P[o + 6] / P[o + 7], q = k * 8;
      const fadeIn = Math.min(1, t * 6), fadeOut = Math.min(1, P[o + 6] / (P[o + 7] * 0.5 + 0.001));
      sd[q] = P[o]; sd[q + 1] = P[o + 1]; sd[q + 2] = P[o + 2];
      sd[q + 3] = P[o + 10]; sd[q + 4] = P[o + 11]; sd[q + 5] = P[o + 12]; sd[q + 6] = P[o + 13] * fadeIn * fadeOut; sd[q + 7] = P[o + 8] + (P[o + 9] - P[o + 8]) * t;
    }
    R.update(this.smoke, sd, ns * 8); R.update(this.fire, fd, nf * 8);
  },
  // ---------- presets ----------
  explosion(p, scale = 1, vel) {
    const vx = vel ? vel.x * 0.3 : 0, vy = vel ? vel.y * 0.3 : 0, vz = vel ? vel.z * 0.3 : 0;
    const q = this.budget;
    for (let i = 0; i < 14 * q; i++) { const d = rv(); this.emit(p.x, p.y, p.z, vx + d[0] * 40 * scale, vy + d[1] * 40 * scale, vz + d[2] * 40 * scale, rnd(0.5, 1.1), 6 * scale, rnd(24, 38) * scale, 1, rnd(0.45, 0.7), 0.15, 0.9, 2.2, -6, 1); }
    for (let i = 0; i < 4; i++) this.emit(p.x, p.y, p.z, vx, vy, vz, 0.25, 40 * scale, 70 * scale, 1, 0.85, 0.6, 1, 0, 0, 1);
    for (let i = 0; i < 16 * q; i++) { const d = rv(); this.emit(p.x, p.y, p.z, vx + d[0] * 26 * scale, vy + d[1] * 26 * scale + 6, vz + d[2] * 26 * scale, rnd(2.5, 4.5), 10 * scale, rnd(38, 60) * scale, 0.16, 0.15, 0.14, 0.75, 1.1, -3, 0); }
    for (let i = 0; i < 18 * q; i++) { const d = rv(); this.emit(p.x, p.y, p.z, vx + d[0] * 140, vy + d[1] * 140, vz + d[2] * 140, rnd(0.4, 1.0), 1.4, 0.6, 1, 0.75, 0.35, 1, 0.8, 40, 1); }
    for (let i = 0; i < 8 * q; i++) { const d = rv(); this.emit(p.x, p.y, p.z, vx + d[0] * 70, vy + d[1] * 70 + 30, vz + d[2] * 70, rnd(1.5, 3), 1.6, 1.2, 0.08, 0.08, 0.08, 1, 0.3, 30, 0); }
  },
  smallBoom(p, scale = 1) {
    for (let i = 0; i < 8; i++) { const d = rv(); this.emit(p.x, p.y, p.z, d[0] * 25 * scale, d[1] * 25 * scale, d[2] * 25 * scale, rnd(0.35, 0.7), 4 * scale, 16 * scale, 1, 0.62, 0.22, 0.95, 2.5, -4, 1); }
    for (let i = 0; i < 6; i++) { const d = rv(); this.emit(p.x, p.y, p.z, d[0] * 14, d[1] * 14, d[2] * 14, rnd(1.6, 2.6), 6 * scale, 22 * scale, 0.3, 0.29, 0.27, 0.6, 1.2, -2, 0); }
  },
  sparks(p, n = 6) {
    for (let i = 0; i < n; i++) { const d = rv(); this.emit(p.x, p.y, p.z, d[0] * 60, d[1] * 60, d[2] * 60, rnd(0.15, 0.35), 0.9, 0.3, 1, 0.85, 0.45, 1, 1, 20, 1); }
    this.emit(p.x, p.y, p.z, 0, 0, 0, 0.6, 2, 6, 0.35, 0.34, 0.32, 0.5, 0, -1, 0);
  },
  splash(p, big) {
    const k = big ? 2.2 : 1;
    for (let i = 0; i < 10 * k; i++) { const a = rnd(0, TAU), s = rnd(4, 18) * k; this.emit(p.x, 0.5, p.z, Math.cos(a) * s, rnd(20, 55) * k, Math.sin(a) * s, rnd(1.2, 2.4), 3 * k, 12 * k, 0.9, 0.94, 0.97, 0.7, 0.6, 30, 0); }
  },
  dust(p) { for (let i = 0; i < 3; i++) this.emit(p.x, p.y + 1, p.z, rnd(-4, 4), rnd(3, 10), rnd(-4, 4), rnd(1, 2), 2, 8, 0.55, 0.5, 0.42, 0.55, 1, 2, 0); },
};
function rv() { // random unit-ish vector
  let x, y, z, l;
  do { x = Math.random() * 2 - 1; y = Math.random() * 2 - 1; z = Math.random() * 2 - 1; l = x * x + y * y + z * z; } while (l > 1 || l < 0.01);
  return [x, y, z];
}

// camera-facing streak quads (tracers, missile flames)
const FXQ = {
  MAX: 1400, d: null, n: 0, mesh: null,
  init() { this.d = new Float32Array(this.MAX * 6 * 9); this.mesh = R.mesh(this.d, 'fx', true); this.mesh.n = 0; },
  begin() { this.n = 0; },
  quad(ax, ay, az, bx, by, bz, w, r, g, b, a) {
    if (this.n >= this.MAX) return;
    const c = R.cam.pos, dx = bx - ax, dy = by - ay, dz = bz - az;
    const vx = c.x - (ax + bx) * 0.5, vy = c.y - (ay + by) * 0.5, vz = c.z - (az + bz) * 0.5;
    let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
    const sl = Math.hypot(sx, sy, sz) || 1; const h = w / 2 / sl; sx *= h; sy *= h; sz *= h;
    const d = this.d; let o = this.n * 54;
    const V = (x, y, z, u, v) => { d[o++] = x; d[o++] = y; d[o++] = z; d[o++] = r; d[o++] = g; d[o++] = b; d[o++] = a; d[o++] = u; d[o++] = v; };
    V(ax - sx, ay - sy, az - sz, 0, -1); V(ax + sx, ay + sy, az + sz, 0, 1); V(bx + sx, by + sy, bz + sz, 1, 1);
    V(ax - sx, ay - sy, az - sz, 0, -1); V(bx + sx, by + sy, bz + sz, 1, 1); V(bx - sx, by - sy, bz - sz, 1, -1);
    this.n++;
  },
  end() { R.update(this.mesh, this.d, this.n * 54); },
};
