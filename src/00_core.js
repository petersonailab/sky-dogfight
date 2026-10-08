// ===================== core: math, noise, helpers =====================
const TAU = Math.PI * 2, DEG = Math.PI / 180, RAD = 180 / Math.PI;
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const rnd = (a = 0, b = 1) => a + Math.random() * (b - a);
const pick = arr => arr[(Math.random() * arr.length) | 0];
const $ = id => document.getElementById(id);
const wrapPi = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

class V3 {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  addS(v, s) { this.x += v.x * s; this.y += v.y * s; this.z += v.z * s; return this; }
  subV(a, b) { this.x = a.x - b.x; this.y = a.y - b.y; this.z = a.z - b.z; return this; }
  scale(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  dot(v) { return this.x * v.x + this.y * v.y + this.z * v.z; }
  crossV(a, b) { const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x; this.x = x; this.y = y; this.z = z; return this; }
  len() { return Math.hypot(this.x, this.y, this.z); }
  lenSq() { return this.x * this.x + this.y * this.y + this.z * this.z; }
  norm() { const l = Math.hypot(this.x, this.y, this.z) || 1; this.x /= l; this.y /= l; this.z /= l; return this; }
  dist(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  distSq(v) { const dx = this.x - v.x, dy = this.y - v.y, dz = this.z - v.z; return dx * dx + dy * dy + dz * dz; }
  lerp(v, t) { this.x += (v.x - this.x) * t; this.y += (v.y - this.y) * t; this.z += (v.z - this.z) * t; return this; }
  rot(q) {
    const x = this.x, y = this.y, z = this.z, qx = q.x, qy = q.y, qz = q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }
  irot(q) {
    const x = this.x, y = this.y, z = this.z, qx = -q.x, qy = -q.y, qz = -q.z, qw = q.w;
    const tx = 2 * (qy * z - qz * y), ty = 2 * (qz * x - qx * z), tz = 2 * (qx * y - qy * x);
    this.x = x + qw * tx + qy * tz - qz * ty;
    this.y = y + qw * ty + qz * tx - qx * tz;
    this.z = z + qw * tz + qx * ty - qy * tx;
    return this;
  }
}

class Q {
  constructor(x = 0, y = 0, z = 0, w = 1) { this.x = x; this.y = y; this.z = z; this.w = w; }
  set(x, y, z, w) { this.x = x; this.y = y; this.z = z; this.w = w; return this; }
  copy(q) { this.x = q.x; this.y = q.y; this.z = q.z; this.w = q.w; return this; }
  clone() { return new Q(this.x, this.y, this.z, this.w); }
  ident() { this.x = this.y = this.z = 0; this.w = 1; return this; }
  axisAngle(ax, ay, az, a) { const s = Math.sin(a / 2); this.x = ax * s; this.y = ay * s; this.z = az * s; this.w = Math.cos(a / 2); return this; }
  // rotation vector (axis * angle)
  fromRotVec(x, y, z) {
    const a = Math.hypot(x, y, z);
    if (a < 1e-9) return this.set(x / 2, y / 2, z / 2, 1).norm();
    return this.axisAngle(x / a, y / a, z / a, a);
  }
  mul(b) {
    const ax = this.x, ay = this.y, az = this.z, aw = this.w, bx = b.x, by = b.y, bz = b.z, bw = b.w;
    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  premul(a) {
    const ax = a.x, ay = a.y, az = a.z, aw = a.w, bx = this.x, by = this.y, bz = this.z, bw = this.w;
    this.x = aw * bx + ax * bw + ay * bz - az * by;
    this.y = aw * by - ax * bz + ay * bw + az * bx;
    this.z = aw * bz + ax * by - ay * bx + az * bw;
    this.w = aw * bw - ax * bx - ay * by - az * bz;
    return this;
  }
  norm() { const l = Math.hypot(this.x, this.y, this.z, this.w) || 1; this.x /= l; this.y /= l; this.z /= l; this.w /= l; return this; }
  conj() { this.x = -this.x; this.y = -this.y; this.z = -this.z; return this; }
  dot(q) { return this.x * q.x + this.y * q.y + this.z * q.z + this.w * q.w; }
  slerp(b, t) {
    let bx = b.x, by = b.y, bz = b.z, bw = b.w;
    let c = this.x * bx + this.y * by + this.z * bz + this.w * bw;
    if (c < 0) { c = -c; bx = -bx; by = -by; bz = -bz; bw = -bw; }
    let k0, k1;
    if (c > 0.9995) { k0 = 1 - t; k1 = t; }
    else { const o = Math.acos(c), s = Math.sin(o); k0 = Math.sin((1 - t) * o) / s; k1 = Math.sin(t * o) / s; }
    this.x = this.x * k0 + bx * k1; this.y = this.y * k0 + by * k1; this.z = this.z * k0 + bz * k1; this.w = this.w * k0 + bw * k1;
    return this.norm();
  }
  // rotation matrix columns X, Y, Z -> quaternion
  fromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz) {
    const m00 = xx, m10 = xy, m20 = xz, m01 = yx, m11 = yy, m21 = yz, m02 = zx, m12 = zy, m22 = zz;
    const tr = m00 + m11 + m22;
    if (tr > 0) { const s = 0.5 / Math.sqrt(tr + 1); this.w = 0.25 / s; this.x = (m21 - m12) * s; this.y = (m02 - m20) * s; this.z = (m10 - m01) * s; }
    else if (m00 > m11 && m00 > m22) { const s = 2 * Math.sqrt(1 + m00 - m11 - m22); this.w = (m21 - m12) / s; this.x = 0.25 * s; this.y = (m01 + m10) / s; this.z = (m02 + m20) / s; }
    else if (m11 > m22) { const s = 2 * Math.sqrt(1 + m11 - m00 - m22); this.w = (m02 - m20) / s; this.x = (m01 + m10) / s; this.y = 0.25 * s; this.z = (m12 + m21) / s; }
    else { const s = 2 * Math.sqrt(1 + m22 - m00 - m11); this.w = (m10 - m01) / s; this.x = (m02 + m20) / s; this.y = (m12 + m21) / s; this.z = 0.25 * s; }
    return this.norm();
  }
  // local forward is -Z, local up is +Y
  lookDir(f, up) {
    let zx = -f.x, zy = -f.y, zz = -f.z;
    const zl = Math.hypot(zx, zy, zz) || 1; zx /= zl; zy /= zl; zz /= zl;
    let xx = up.y * zz - up.z * zy, xy = up.z * zx - up.x * zz, xz = up.x * zy - up.y * zx;
    let xl = Math.hypot(xx, xy, xz);
    if (xl < 1e-6) { xx = 1; xy = 0; xz = 0; xl = 1; }
    xx /= xl; xy /= xl; xz /= xl;
    const yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return this.fromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz);
  }
}

// column-major 4x4 matrices
const M4 = {
  create() { const m = new Float32Array(16); m[0] = m[5] = m[10] = m[15] = 1; return m; },
  ident(o) { o.fill(0); o[0] = o[5] = o[10] = o[15] = 1; return o; },
  persp(o, fovy, aspect, near, far) {
    const f = 1 / Math.tan(fovy / 2), nf = 1 / (near - far);
    o.fill(0); o[0] = f / aspect; o[5] = f; o[10] = (far + near) * nf; o[11] = -1; o[14] = 2 * far * near * nf; return o;
  },
  fromQP(o, q, p, s = 1) {
    const x = q.x, y = q.y, z = q.z, w = q.w, x2 = x + x, y2 = y + y, z2 = z + z;
    const xx = x * x2, xy = x * y2, xz = x * z2, yy = y * y2, yz = y * z2, zz = z * z2, wx = w * x2, wy = w * y2, wz = w * z2;
    o[0] = (1 - (yy + zz)) * s; o[1] = (xy + wz) * s; o[2] = (xz - wy) * s; o[3] = 0;
    o[4] = (xy - wz) * s; o[5] = (1 - (xx + zz)) * s; o[6] = (yz + wx) * s; o[7] = 0;
    o[8] = (xz + wy) * s; o[9] = (yz - wx) * s; o[10] = (1 - (xx + yy)) * s; o[11] = 0;
    o[12] = p.x; o[13] = p.y; o[14] = p.z; o[15] = 1; return o;
  },
  // same but with non-uniform scale (sx, sy, sz)
  fromQPS(o, q, p, sx, sy, sz) {
    M4.fromQP(o, q, p, 1);
    o[0] *= sx; o[1] *= sx; o[2] *= sx; o[4] *= sy; o[5] *= sy; o[6] *= sy; o[8] *= sz; o[9] *= sz; o[10] *= sz; return o;
  },
  view(o, q, p) {
    const r = M4._t || (M4._t = new Float32Array(16));
    M4.fromQP(r, q, { x: 0, y: 0, z: 0 }, 1);
    o[0] = r[0]; o[1] = r[4]; o[2] = r[8]; o[3] = 0;
    o[4] = r[1]; o[5] = r[5]; o[6] = r[9]; o[7] = 0;
    o[8] = r[2]; o[9] = r[6]; o[10] = r[10]; o[11] = 0;
    o[12] = -(r[0] * p.x + r[1] * p.y + r[2] * p.z);
    o[13] = -(r[4] * p.x + r[5] * p.y + r[6] * p.z);
    o[14] = -(r[8] * p.x + r[9] * p.y + r[10] * p.z);
    o[15] = 1; return o;
  },
  mul(o, a, b) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    for (let i = 0; i < 4; i++) {
      const b0 = b[i * 4], b1 = b[i * 4 + 1], b2 = b[i * 4 + 2], b3 = b[i * 4 + 3];
      o[i * 4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
      o[i * 4 + 1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
      o[i * 4 + 2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
      o[i * 4 + 3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    }
    return o;
  },
  invert(o, a) {
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3], a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11], a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10, b03 = a01 * a12 - a02 * a11;
    const b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12, b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30;
    const b08 = a20 * a33 - a23 * a30, b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
    let det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
    if (!det) return null;
    det = 1 / det;
    o[0] = (a11 * b11 - a12 * b10 + a13 * b09) * det; o[1] = (a02 * b10 - a01 * b11 - a03 * b09) * det;
    o[2] = (a31 * b05 - a32 * b04 + a33 * b03) * det; o[3] = (a22 * b04 - a21 * b05 - a23 * b03) * det;
    o[4] = (a12 * b08 - a10 * b11 - a13 * b07) * det; o[5] = (a00 * b11 - a02 * b08 + a03 * b07) * det;
    o[6] = (a32 * b02 - a30 * b05 - a33 * b01) * det; o[7] = (a20 * b05 - a22 * b02 + a23 * b01) * det;
    o[8] = (a10 * b10 - a11 * b08 + a13 * b06) * det; o[9] = (a01 * b08 - a00 * b10 - a03 * b06) * det;
    o[10] = (a30 * b04 - a31 * b02 + a33 * b00) * det; o[11] = (a21 * b02 - a20 * b04 - a23 * b00) * det;
    o[12] = (a11 * b07 - a10 * b09 - a12 * b06) * det; o[13] = (a00 * b09 - a01 * b07 + a02 * b06) * det;
    o[14] = (a31 * b01 - a30 * b03 - a32 * b00) * det; o[15] = (a20 * b03 - a21 * b01 + a22 * b00) * det;
    return o;
  },
};

// ---- deterministic noise ----
function mulberry(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function hash2(ix, iy, seed) {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263) + Math.imul(seed, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
function vnoise(x, y, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const ux = fx * fx * (3 - 2 * fx), uy = fy * fy * (3 - 2 * fy);
  const a = hash2(ix, iy, seed), b = hash2(ix + 1, iy, seed), c = hash2(ix, iy + 1, seed), d = hash2(ix + 1, iy + 1, seed);
  return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}
function fbm(x, y, oct, seed) {
  let s = 0, a = 0.5, f = 1, n = 0;
  for (let i = 0; i < oct; i++) { s += a * vnoise(x * f, y * f, seed + i * 17); n += a; a *= 0.5; f *= 2.03; }
  return s / n;
}

// ---- per-viewer storage (never required) ----
const Store = {
  key: 'skydogfight.v1',
  read() { try { const s = localStorage.getItem(this.key); return s ? JSON.parse(s) : {}; } catch (e) { return {}; } },
  write(o) { try { localStorage.setItem(this.key, JSON.stringify(o)); } catch (e) { /* storage blocked */ } },
};

const cleanName = n => (typeof n === 'string' ? n : '').replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁠-⁯﻿]/g, '').trim().slice(0, 12);
const okColor = c => (typeof c === 'string' && /^#[0-9a-f]{6}$/i.test(c) ? c : '#9aa3a8');
const num = (v, d = 0) => (typeof v === 'number' && isFinite(v) ? v : d);
const hexRGB = h => { const n = parseInt(h.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const r1 = v => Math.round(v * 10) / 10;
const r3 = v => Math.round(v * 1000) / 1000;
