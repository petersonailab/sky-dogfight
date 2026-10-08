// ===================== mesh builder (CPU geometry) =====================
// vertex: px py pz nx ny nz  a b c   (a/b/c = material/bone/slot for planes, or rgb for lit meshes)
const MAT = { PAINT: 0, ACCENT: 1, GLASS: 2, DARK: 3, BLACK: 4, WHITE: 5, GRAY: 6, PROP: 7 };
const vsub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const vadd = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const vmul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
const vcross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const vdot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const vnorm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
const vavg = pts => { const s = [0, 0, 0]; for (const p of pts) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return vmul(s, 1 / pts.length); };

class MB {
  constructor() { this.a = []; this.mat = 0; this.bone = 0; this.slot = 0; this.col = null; }
  vert(p, n) {
    const a = this.a;
    a.push(p[0], p[1], p[2], n[0], n[1], n[2]);
    if (this.col) a.push(this.col[0], this.col[1], this.col[2]); else a.push(this.mat, this.bone, this.slot);
  }
  // triangle with per-vertex normals; winding auto-corrected to face along the normals
  tri(p0, p1, p2, n0, n1, n2) {
    const fn = vcross(vsub(p1, p0), vsub(p2, p0));
    if (fn[0] * fn[0] + fn[1] * fn[1] + fn[2] * fn[2] < 1e-14) return;
    const s = [n0[0] + n1[0] + n2[0], n0[1] + n1[1] + n2[1], n0[2] + n1[2] + n2[2]];
    if (vdot(fn, s) < 0) { this.vert(p0, n0); this.vert(p2, n2); this.vert(p1, n1); }
    else { this.vert(p0, n0); this.vert(p1, n1); this.vert(p2, n2); }
  }
  // flat triangle facing roughly along `hint`
  ftri(p0, p1, p2, hint) {
    let n = vnorm(vcross(vsub(p1, p0), vsub(p2, p0)));
    if (hint && vdot(n, hint) < 0) n = vmul(n, -1);
    this.tri(p0, p1, p2, n, n, n);
  }
  fquad(p0, p1, p2, p3, hint) { this.ftri(p0, p1, p2, hint); this.ftri(p0, p2, p3, hint); }

  // ---- loft: smooth tube along +z through cross-section stations ----
  // station: {z, w, h, hb, y, x, n (superellipse), ch (chine: 0.5 round .. 1 sharp)}
  loft(st, o = {}) {
    const seg = o.seg || 20, rings = [];
    for (const s of st) {
      const ring = [], n = s.n || 2, ex = 2 / n, ch = s.ch || 0.5, hb = s.hb === undefined ? s.h : s.hb;
      for (let i = 0; i < seg; i++) {
        const t = (i / seg) * TAU, c = Math.cos(t), sn = Math.sin(t);
        const x = s.w * Math.sign(c) * Math.pow(Math.abs(c), ex);
        let yy = Math.pow(Math.abs(sn), ex);
        if (ch !== 0.5) yy = Math.pow(yy, ch * 2);
        const y = (s.y || 0) + (sn >= 0 ? s.h : -hb) * yy;
        ring.push([x + (s.x || 0) + (o.x || 0), y + (o.y || 0), s.z]);
      }
      rings.push({ pts: ring, c: [(s.x || 0) + (o.x || 0), (s.y || 0) + (o.y || 0) + (s.h - hb) * 0.3, s.z] });
    }
    const R = rings.length, N = [];
    for (let k = 0; k < R; k++) {
      const nr = [];
      for (let i = 0; i < seg; i++) {
        const p = rings[k].pts[i];
        const ta = vsub(rings[k].pts[(i + 1) % seg], rings[k].pts[(i - 1 + seg) % seg]);
        const tb = vsub(rings[Math.min(R - 1, k + 1)].pts[i], rings[Math.max(0, k - 1)].pts[i]);
        let n = vnorm(vcross(ta, tb));
        const out = vsub(p, rings[k].c); out[2] = 0;
        if (vdot(n, out) < 0) n = vmul(n, -1);
        if (Math.hypot(out[0], out[1]) < 0.02) n = vnorm(vadd(n, [0, 0, k === 0 ? -1 : 1]));
        nr.push(n);
      }
      N.push(nr);
    }
    for (let k = 0; k < R - 1; k++) {
      for (let i = 0; i < seg; i++) {
        const j = (i + 1) % seg;
        const a = rings[k].pts[i], b = rings[k].pts[j], c = rings[k + 1].pts[j], d = rings[k + 1].pts[i];
        this.tri(a, b, c, N[k][i], N[k][j], N[k + 1][j]);
        this.tri(a, c, d, N[k][i], N[k + 1][j], N[k + 1][i]);
      }
    }
    if (o.cap0 !== false) this.cap(rings[0].pts, [0, 0, -1]);
    if (o.cap1 !== false) this.cap(rings[R - 1].pts, [0, 0, 1]);
    return rings;
  }
  cap(pts, n) {
    const c = vavg(pts);
    for (let i = 0; i < pts.length; i++) this.tri(c, pts[i], pts[(i + 1) % pts.length], n, n, n);
  }
  // ---- sweep: connect polygon sections with flat faces ----
  sweep(secs, o = {}) {
    const S = secs.length, P = secs[0].length, cents = secs.map(vavg);
    for (let k = 0; k < S - 1; k++) {
      const mid = vmul(vadd(cents[k], cents[k + 1]), 0.5);
      for (let j = 0; j < P; j++) {
        const j2 = (j + 1) % P;
        const a = secs[k][j], b = secs[k][j2], c = secs[k + 1][j2], d = secs[k + 1][j];
        const fc = vavg([a, b, c, d]);
        this.fquad(a, b, c, d, vsub(fc, mid));
      }
    }
    if (o.cap0 !== false) { const n = vsub(cents[0], cents[1]); for (let j = 0; j < P; j++) this.ftri(cents[0], secs[0][j], secs[0][(j + 1) % P], n); }
    if (o.cap1 !== false) { const n = vsub(cents[S - 1], cents[S - 2]); for (let j = 0; j < P; j++) this.ftri(cents[S - 1], secs[S - 1][j], secs[S - 1][(j + 1) % P], n); }
  }
  // airfoil polygon at spanwise position x (local), chord zLE..zTE, thickness t
  static foil(x, y, zLE, zTE, t) {
    const c = zTE - zLE;
    return [[x, y, zLE], [x, y + t * 0.36, zLE + c * 0.1], [x, y + t * 0.5, zLE + c * 0.38], [x, y + t * 0.12, zTE],
      [x, y - t * 0.08, zTE], [x, y - t * 0.42, zLE + c * 0.4], [x, y - t * 0.3, zLE + c * 0.1]];
  }
  // wing from span stations [x, zLE, zTE, t]; dihedral in degrees; mirrored by default
  wing(secs, o = {}) {
    const y0 = o.y || 0, dih = Math.tan((o.dih || 0) * DEG), x0 = secs[0][0];
    const side = (sgn) => {
      const S = secs.map(([x, zl, zt, t]) => MB.foil(x, y0 + (x - x0) * dih, zl, zt, t).map(p => [p[0] * sgn, p[1], p[2]]));
      this.sweep(S);
    };
    const bone0 = this.bone;
    if (o.bones) this.bone = o.bones[0];
    side(1);
    if (o.mirror !== false) { if (o.bones) this.bone = o.bones[1]; side(-1); }
    this.bone = bone0;
  }
  // vertical surface: sections [h, zLE, zTE, t] measured from root y0, at x, canted outward by `cant` deg
  fin(secs, o = {}) {
    const x0 = o.x || 0, y0 = o.y || 0, cant = (o.cant || 0) * DEG, cs = Math.cos(cant), sn = Math.sin(cant);
    const build = (sgn) => {
      const S = secs.map(([h, zl, zt, t]) => {
        const c = zt - zl;
        const prof = [[0, zl], [t * 0.36, zl + c * 0.1], [t * 0.5, zl + c * 0.4], [t * 0.1, zt], [-t * 0.1, zt], [-t * 0.5, zl + c * 0.4], [-t * 0.36, zl + c * 0.1]];
        return prof.map(([dx, z]) => { const px = dx * cs + h * sn, py = -dx * sn + h * cs; return [sgn * (x0 + px), y0 + py, z]; });
      });
      if (o.accentFrom !== undefined) {
        // split into lower (paint) and upper (accent) parts at height accentFrom
        const hs = secs.map(s => s[0]);
        const k = hs.findIndex(h => Math.abs(h) >= Math.abs(o.accentFrom));
        if (k > 0) {
          const a = secs[k - 1], b = secs[k], t = (o.accentFrom - a[0]) / (b[0] - a[0]);
          const mid = a.map((v, i) => v + (b[i] - v) * t);
          const lower = secs.slice(0, k).concat([mid]), upper = [mid].concat(secs.slice(k));
          const conv = arr => arr.map(([h, zl, zt, tt]) => { const c = zt - zl;
            const prof = [[0, zl], [tt * 0.36, zl + c * 0.1], [tt * 0.5, zl + c * 0.4], [tt * 0.1, zt], [-tt * 0.1, zt], [-tt * 0.5, zl + c * 0.4], [-tt * 0.36, zl + c * 0.1]];
            return prof.map(([dx, z]) => { const px = dx * cs + h * sn, py = -dx * sn + h * cs; return [sgn * (x0 + px), y0 + py, z]; }); });
          const m0 = this.mat; this.sweep(conv(lower), { cap1: false }); this.mat = MAT.ACCENT; this.sweep(conv(upper), { cap0: false }); this.mat = m0;
          return;
        }
      }
      this.sweep(S);
    };
    build(1);
    if (o.twin) build(-1);
  }
  // tube between two points with radii r0 -> r1
  cyl(p0, p1, r0, r1, o = {}) {
    const seg = o.seg || 12, ax = vnorm(vsub(p1, p0));
    const up = Math.abs(ax[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
    const u = vnorm(vcross(ax, up)), v = vcross(ax, u);
    const slope = (r0 - r1) / (Math.hypot(...vsub(p1, p0)) || 1);
    const ring = (p, r) => { const pts = [], ns = []; for (let i = 0; i < seg; i++) { const t = i / seg * TAU, c = Math.cos(t), s = Math.sin(t);
      const d = vadd(vmul(u, c), vmul(v, s)); pts.push(vadd(p, vmul(d, r))); ns.push(vnorm(vadd(d, vmul(ax, slope)))); } return [pts, ns]; };
    const [A, NA] = ring(p0, r0), [B, NB] = ring(p1, r1);
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; this.tri(A[i], A[j], B[j], NA[i], NA[j], NB[j]); this.tri(A[i], B[j], B[i], NA[i], NB[j], NB[i]); }
    if (o.cap0 && r0 > 0.001) this.cap(A, vmul(ax, -1));
    if (o.cap1 && r1 > 0.001) this.cap(B, ax);
  }
  // ellipsoid (optionally only the upper part: from latitude `lat0` in -1..1)
  ellipsoid(c, rx, ry, rz, o = {}) {
    const seg = o.seg || 16, rings = o.rings || 8, lat0 = o.lat0 === undefined ? -1 : o.lat0;
    const P = [], Nn = [];
    for (let r = 0; r <= rings; r++) {
      const v = lat0 + (1 - lat0) * (r / rings), phi = Math.asin(clamp(v, -1, 1)), cp = Math.cos(phi), sp = Math.sin(phi);
      const row = [], nrow = [];
      for (let i = 0; i <= seg; i++) {
        const t = i / seg * TAU, ct = Math.cos(t), st = Math.sin(t);
        const nx = cp * ct, ny = sp, nz = cp * st;
        row.push([c[0] + rx * nx, c[1] + ry * ny, c[2] + rz * nz]);
        nrow.push(vnorm([nx / rx, ny / ry, nz / rz]));
      }
      P.push(row); Nn.push(nrow);
    }
    for (let r = 0; r < rings; r++) for (let i = 0; i < seg; i++) {
      this.tri(P[r][i], P[r][i + 1], P[r + 1][i + 1], Nn[r][i], Nn[r][i + 1], Nn[r + 1][i + 1]);
      this.tri(P[r][i], P[r + 1][i + 1], P[r + 1][i], Nn[r][i], Nn[r + 1][i + 1], Nn[r + 1][i]);
    }
  }
  box(c, sx, sy, sz) {
    const x0 = c[0] - sx / 2, x1 = c[0] + sx / 2, y0 = c[1] - sy / 2, y1 = c[1] + sy / 2, z0 = c[2] - sz / 2, z1 = c[2] + sz / 2;
    const p = [[x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [x0, y0, z1], [x1, y0, z1], [x1, y1, z1], [x0, y1, z1]];
    const F = [[0, 1, 2, 3, [0, 0, -1]], [5, 4, 7, 6, [0, 0, 1]], [4, 0, 3, 7, [-1, 0, 0]], [1, 5, 6, 2, [1, 0, 0]], [3, 2, 6, 7, [0, 1, 0]], [4, 5, 1, 0, [0, -1, 0]]];
    for (const f of F) this.fquad(p[f[0]], p[f[1]], p[f[2]], p[f[3]], f[4]);
  }
  // flat ellipse disc facing -z (forward) at z
  disc(c, w, h, n = [0, 0, -1], seg = 16, sq = 2) {
    const pts = [], ex = 2 / sq;
    for (let i = 0; i < seg; i++) { const t = i / seg * TAU, ct = Math.cos(t), st = Math.sin(t);
      pts.push([c[0] + Math.sign(ct) * Math.pow(Math.abs(ct), ex) * w, c[1] + Math.sign(st) * Math.pow(Math.abs(st), ex) * h, c[2]]); }
    this.cap(pts, n);
  }
  icosphere(c, r, sy, detail, colFn) {
    const t = (1 + Math.sqrt(5)) / 2;
    let V = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(vnorm);
    let F = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
    for (let d = 0; d < detail; d++) {
      const F2 = [], cache = {};
      const mid = (a, b) => { const k = a < b ? a + '_' + b : b + '_' + a; if (cache[k] !== undefined) return cache[k]; V.push(vnorm(vmul(vadd(V[a], V[b]), 0.5))); return (cache[k] = V.length - 1); };
      for (const [a, b, c2] of F) { const ab = mid(a, b), bc = mid(b, c2), ca = mid(c2, a); F2.push([a, ab, ca], [b, bc, ab], [c2, ca, bc], [ab, bc, ca]); }
      F = F2;
    }
    for (const [a, b, c2] of F) {
      const P = [V[a], V[b], V[c2]].map(v => [c[0] + v[0] * r * (1 + (hash2(a * 7 + b, c2, 3) - 0.5) * 0.0), c[1] + v[1] * r * sy, c[2] + v[2] * r]);
      const n = vnorm(vcross(vsub(P[1], P[0]), vsub(P[2], P[0])));
      const out = vsub(vavg(P), c);
      const nn = vdot(n, out) < 0 ? vmul(n, -1) : n;
      if (colFn) this.col = colFn(nn, P);
      this.tri(P[0], P[1], P[2], nn, nn, nn);
    }
  }
  data() { return new Float32Array(this.a); }
}
