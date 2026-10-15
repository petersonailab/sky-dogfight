// ===================== aircraft entity: physics, steering, visuals =====================
const TEAM_COL = ['#c9cdd0', '#3f86ea', '#e5484d'];
const TEAM_NAME = ['', '藍隊', '紅隊'];
const _a = new V3(), _b = new V3(), _c = new V3(), _d = new V3(), _e = new V3(), _q = new Q(), _q2 = new Q();
const LAT = 0.06; // assumed one-way latency for remote extrapolation (s)

class Plane {
  constructor(o) {
    this.key = o.key; this.owner = o.owner; this.idx = o.idx || 0;
    this.local = !!o.local; this.bot = !!o.bot; this.isMe = !!o.isMe;
    this.name = cleanName(o.name) || '無名'; this.color = okColor(o.color); this.team = o.team || 0;
    this.pos = new V3(0, 1500, 0); this.q = new Q(); this.vel = new V3(0, 0, -200); this.speed = 200;
    this.rate = new V3();
    this.ctrl = { pitch: 0, roll: 0, yaw: 0, thr: 0.85, ab: false, gun: false, msl: false, flare: false, swap: false };
    this.alive = false; this.hp = 100; this.kills = 0; this.deaths = 0;
    this.ammo = 0; this.gunT = 0; this.mslCd = 0; this.gunIdle = 0; this.heat = 0; this.gunLock = 0; this.spin = 0;
    this.mR = 0; this.mI = 0; this.reloadR = 0; this.reloadI = 0; this.wsel = 'rad';
    this.flareCdT = 0; this.flareT = 0; this.abFuel = 0; this.abLock = false; this.abOn = false;
    this.lock = { t: null, p: 0, locked: false, w: null };
    this.rLockKey = ''; this.rLockState = 0; // what a REMOTE aircraft reports it is locking (for warnings)
    this.lat = LAT;
    this.lastHitBy = null; this.lastHitT = -1e9; this.invUntil = 0; this.respawnAt = 0; this.g = 1; this.flash = 0;
    this.firing = false; this.gunSide = 0; this.slotNext = 0;
    this.sweep = 20; this.propA = 0;
    this.wreck = null;
    this.snapT = 0; this.snapPos = new V3(); this.snapVel = new V3(); this.snapQ = new Q(); this.angVel = new V3(); this.corr = new V3(); this.lastSeen = 0; this.hasSnap = false;
    this.modelM = M4.create(); this.bones = new Float32Array(128); this.bones.set(IDENT_BONES);
    this.hdBones = new Float32Array(128); this.hdBones.set(IDENT_BONES); this.cs = new V3();
    this.accent = new Float32Array(3); this.look = { paint: null, accent: this.accent, firedR: 0, firedI: 0, bones: this.bones, hdBones: this.hdBones, flash: 0 };
    this.mslLook = { accent: ONE3, firedR: 0, firedI: 0, hdBones: null, flash: 0 }; this.si = null; this.siKey = '';
    this.trailT = 0; this.smokeT = 0; this.hd = null; this.vm = null;
    this.setAircraft(o.ac || AC_DEFS[0]);
  }
  setAircraft(def) {
    this.def = def; this.st = def.st; this.perf = perfOf(def); this.model = acModel(def);
    this.bones.set(IDENT_BONES); this.hdBones.set(IDENT_BONES);
    if (this.wsel === 'rad' && !def.wR) this.wsel = 'ir';
    if (this.wsel === 'ir' && !def.wI) this.wsel = 'rad';
    this.hitR = clamp(this.model.length * 0.42, 4.5, 9.5);
    this.look.paint = this.model.paint; this.updateAccent();
  }
  updateAccent() { this.accent.set(hexRGB(this.team ? TEAM_COL[this.team] : this.color)); }
  fwd(o) { return o.set(0, 0, -1).rot(this.q); }
  up(o) { return o.set(0, 1, 0).rot(this.q); }
  right(o) { return o.set(1, 0, 0).rot(this.q); }
  invuln(now) { return now < this.invUntil; }
  spawn(pos, q, now) {
    const st = this.st, P = this.perf, d = this.def;
    this.pos.copy(pos); this.q.copy(q); this.speed = Math.min(P.vmax, P.vc);
    this.fwd(this.vel).scale(this.speed);
    this.hp = st.hp; this.alive = true; this.wreck = null; this.ammo = st.ammo || 0; this.heat = 0; this.gunLock = 0; this.spin = 0;
    this.mR = d.wR ? d.wR.n : 0; this.mI = d.wI ? d.wI.n : 0; this.reloadR = 0; this.reloadI = 0;
    if (!this.curW()) this.wsel = d.wR ? 'rad' : 'ir';
    this.flareCdT = 0; this.flareT = 0; this.abFuel = P.abFuel; this.abLock = false; this.abOn = false;
    this.lock.t = null; this.lock.p = 0; this.lock.locked = false; this.invUntil = now + 3000; this.rate.set(0, 0, 0);
    this.ctrl.thr = 0.85; this.ctrl.ab = false; this.lastHitBy = null; this.lastHitT = -1e9; this.g = 1; this.flash = 0;
    this.gunIdle = 0; this.firing = false;
    this.hasSnap = false; this.corr.set(0, 0, 0);
  }
  // selected missile type: { m: MISSILES entry, n: capacity } or null
  curW() { return this.wsel === 'ir' ? this.def.wI : this.def.wR; }
  mslLeft(type) { return type === 'ir' ? this.mI : this.mR; }
  // pitch-rate capability (rad/s) at speed v: best inside the corner band, falling to the high-speed rate at top speed
  turnRate(v) {
    const P = this.perf;
    if (v >= P.lo && v <= P.hi) return P.wb;
    if (v > P.hi) return lerp(P.wb, P.wh, clamp((v - P.hi) / Math.max(1, P.vab - P.hi), 0, 1));
    if (v >= P.vs) return lerp(P.wb * 0.45, P.wb, (v - P.vs) / Math.max(1, P.lo - P.vs));
    return P.wb * 0.45 * Math.max(0.3, v / P.vs);
  }
  // ---------- local flight model ----------
  // Arcade model driven by the aircraft table: the speed is pulled toward a target that depends on
  // throttle/afterburner, climb or dive angle and how hard the aircraft is turning.
  physics(dt) {
    const P = this.perf, c = this.ctrl;
    const v = this.speed;
    // afterburner fuel: burns while lit, refills when off; an empty tank locks it out until 25 % is back
    if (c.ab && !this.abLock && this.abFuel > 0) {
      this.abOn = true; this.abFuel = Math.max(0, this.abFuel - dt);
      if (this.abFuel <= 0) this.abLock = true;
    } else {
      this.abOn = false;
      this.abFuel = Math.min(P.abFuel, this.abFuel + dt * P.abFuel / P.abRegen);
      if (this.abLock && this.abFuel >= P.abFuel * 0.25) this.abLock = false;
    }
    // rotation
    const W = this.turnRate(v) * (this.gScale || 1);
    let rollEff = v < P.vs * 1.2 ? lerp(0.45, 1, clamp((v - P.vs * 0.6) / (P.vs * 0.6), 0, 1)) : 1;
    if (this.st.rollHi && v > P.vab * 0.72) rollEff *= lerp(1, this.st.rollHi, clamp((v - P.vab * 0.72) / (P.vab * 0.28), 0, 1));
    const tp = c.pitch >= 0 ? c.pitch * W : c.pitch * W * 0.7;
    const tr = c.roll * P.roll * rollEff, ty = c.yaw * P.yaw * clamp(v / P.vs, 0.35, 1);
    const k = 1 - Math.exp(-dt * P.resp * 1.05), kr = 1 - Math.exp(-dt * P.resp * 1.5);
    this.rate.x += (tp - this.rate.x) * k; this.rate.y += (ty - this.rate.y) * k; this.rate.z += (tr - this.rate.z) * kr;
    _q.fromRotVec(this.rate.x * dt, -this.rate.y * dt, -this.rate.z * dt);
    this.q.mul(_q).norm();
    const f = this.fwd(_a), up = this.up(_b);
    // speed target
    const sinT = clamp(f.y, -1, 1), thrN = clamp((c.thr - 0.15) / 0.85, 0, 1);
    let vt = this.abOn ? P.vab : lerp(P.vs * 1.2, P.vmax, thrN);
    if (sinT > 0) { const cap = this.abOn ? P.vcl : P.vcl * P.milClimb; vt = lerp(vt, Math.min(vt, cap), Math.pow(sinT, 0.85)); }
    else if (sinT < 0) vt = lerp(vt, Math.max(vt, P.vab * 1.08), Math.pow(-sinT, 1.2));
    const pull = W > 1e-3 ? clamp(Math.abs(this.rate.x) / W, 0, 1) : 0;
    if (pull > 0.02) { const cap = this.abOn ? P.vtab : P.vt; vt = lerp(vt, Math.min(vt, cap), Math.pow(pull, 1.4)); }
    if (this.pos.y > 5000) vt *= clamp(1 - (this.pos.y - 5000) / 6000, 0.55, 1);
    const ease = clamp(Math.abs(vt - v) / (0.06 * P.vab) + 0.12, 0, 1);
    let nv;
    if (v < vt) nv = Math.min(vt, v + ((this.abOn ? P.aab : P.acc * lerp(0.5, 1, thrN)) + 9.81 * Math.max(0, -sinT)) * ease * dt);
    else nv = Math.max(vt, v - (P.acc * 0.45 + 9.81 * Math.max(0, sinT) + P.acc * 0.85 * pull) * ease * dt);
    nv = Math.max(nv, 18);
    // flight path follows the nose; below stall speed gravity takes over
    const dir = _c.copy(this.vel); if (dir.lenSq() < 1) dir.copy(f); dir.norm();
    const align = clamp(nv / P.vs, 0.25, 1.8) * 2.5;
    dir.lerp(f, 1 - Math.exp(-align * dt)).norm();
    const lift = clamp(nv / (P.vs * 1.05), 0, 1) * Math.max(0, up.y);
    dir.y -= (9.81 / Math.max(nv, 30)) * (1 - lift) * dt;
    dir.norm();
    // weathervane: nose drifts toward the flight path (strong when stalled)
    const stall = 1 - clamp(nv / P.vs, 0, 1);
    const ax = _d.crossV(f, dir), s = ax.len();
    if (s > 1e-5) { const ang = Math.asin(Math.min(1, s)) * clamp((0.5 + stall * 2.5) * dt, 0, 1); _q2.axisAngle(ax.x / s, ax.y / s, ax.z / s, ang); this.q.premul(_q2).norm(); }
    this.vel.copy(dir).scale(nv); this.speed = nv;
    this.pos.addS(this.vel, dt);
    this.g = 1 + nv * this.rate.x / 9.81;
  }
  // ---------- remote extrapolation ----------
  applySnap(px, py, pz, qx, qy, qz, qw, vx, vy, vz, tLocal, tSend) {
    _q.set(qx, qy, qz, qw).norm();
    // turn rate from the sender's own timestamps (arrival times jitter on the internet)
    const dt = tSend !== undefined && this.snapSend !== undefined ? (tSend - this.snapSend) / 1000 : (tLocal - this.snapT) / 1000;
    this.snapSend = tSend;
    if (this.hasSnap && dt > 0.015 && dt < 1.2) {
      _q2.copy(this.snapQ).conj().premul(_q);
      if (_q2.w < 0) _q2.set(-_q2.x, -_q2.y, -_q2.z, -_q2.w);
      const sa = Math.hypot(_q2.x, _q2.y, _q2.z), ang = 2 * Math.atan2(sa, _q2.w);
      if (sa > 1e-6) this.angVel.set(_q2.x / sa * ang / dt, _q2.y / sa * ang / dt, _q2.z / sa * ang / dt);
      else this.angVel.set(0, 0, 0);
      if (this.angVel.len() > 6) this.angVel.scale(6 / this.angVel.len());
    } else this.angVel.set(0, 0, 0);
    const prev = _e.copy(this.pos), had = this.hasSnap;
    this.snapT = tLocal; this.snapPos.set(px, py, pz); this.snapVel.set(vx, vy, vz); this.snapQ.copy(_q); this.hasSnap = true;
    if (!had) { this.pos.set(px, py, pz); this.q.copy(_q); this.corr.set(0, 0, 0); }
    else {
      this.predict(tLocal, _d);
      this.corr.subV(prev, _d);
      if (this.corr.len() > 250) this.corr.set(0, 0, 0);
    }
    this.vel.set(vx, vy, vz); this.speed = this.vel.len();
  }
  predict(now, out) {
    const age = clamp((now - this.snapT) / 1000 + this.lat, 0, 0.8);
    return out.copy(this.snapPos).addS(this.snapVel, age);
  }
  remoteUpdate(now, dt) {
    if (!this.hasSnap) return;
    this.corr.scale(Math.exp(-dt * 5));
    this.predict(now, this.pos).add(this.corr);
    const age = clamp((now - this.snapT) / 1000 + this.lat, 0, 0.5);
    _q.fromRotVec(this.angVel.x * age, this.angVel.y * age, this.angVel.z * age).mul(this.snapQ);
    this.q.slerp(_q, 1 - Math.exp(-dt * 16));
    // local-frame rates for control-surface animation and G estimate
    const lw = _a.copy(this.angVel).irot(this.q);
    this.rate.set(lw.x, -lw.y, -lw.z);
    this.g = 1 + this.speed * this.rate.x / 9.81;
  }
  // ---------- visuals ----------
  visual(dt, now) {
    const st = this.st, P = this.perf, m = this.model;
    this.hd = HD.get(this.def.id); this.vm = this.hd ? this.hd.vm : m;
    if (this.def.id === 'f14') { const tgt = clamp(lerp(20, 68, (this.speed - 150) / 170), 20, 68); this.sweep += (tgt - this.sweep) * Math.min(1, dt * 1.4); }
    // control-surface deflection: stick input for our own aircraft, measured turn rates for everyone else;
    // eased like a real actuator so the surfaces don't snap
    const cs = this.cs, ke = 1 - Math.exp(-dt * 16);
    cs.x += ((this.local ? this.ctrl.pitch : clamp(this.rate.x / P.wb, -1, 1)) - cs.x) * ke;
    cs.y += ((this.local ? this.ctrl.yaw : clamp(this.rate.y / P.yaw, -1, 1)) - cs.y) * ke;
    cs.z += ((this.local ? this.ctrl.roll : clamp(this.rate.z / P.roll, -1, 1)) - cs.z) * ke;
    this.propA = (this.propA + dt * (32 + 55 * (this.local ? this.ctrl.thr : 0.8))) % TAU;
    this.poseBones(this.bones, m.bones);
    if (this.hd) this.poseBones(this.hdBones, this.hd.bones);
    M4.fromQP(this.modelM, this.q, this.pos);
    const d = this.def;
    this.look.firedR = d.wR ? Math.max(0, d.wR.n - this.mR) : 0;
    this.look.firedI = d.wI ? Math.max(0, d.wI.n - this.mI) : 0;
    this.flash = Math.max(0, this.flash - dt * 4); this.look.flash = this.flash;
    if (!this.alive) return;
    // wingtip vortices when pulling hard
    if (Math.abs(this.g) > 6 && this.speed > 90 && FX.budget > 0.4) {
      for (const t of this.vm.tips) {
        const p = this.tipWorld(t, _c);
        FX.emit(p.x, p.y, p.z, 0, 0, 0, 0.8, 0.5, 1.4, 0.95, 0.97, 1, 0.32, 0, 0, 0);
      }
    }
    // damage smoke
    const hpf = this.hp / st.hp;
    if (hpf < 0.6) {
      this.smokeT -= dt;
      if (this.smokeT <= 0) {
        this.smokeT = hpf < 0.3 ? 0.035 : 0.07;
        const p = _c.set(0, 0.3, m.length * 0.25).rot(this.q).add(this.pos);
        const dk = hpf < 0.3 ? 0.12 : 0.42;
        FX.emit(p.x, p.y, p.z, rnd(-2, 2), rnd(-1, 3), rnd(-2, 2), rnd(1.6, 2.6), 2.2, 9, dk, dk, dk, 0.7, 0.4, -2, 0);
        if (hpf < 0.3) FX.emit(p.x, p.y, p.z, 0, 0, 0, 0.3, 2.5, 1, 1, 0.55, 0.15, 0.9, 0, 0, 1);
      }
    }
  }
  // one matrix per hinged part (rotation about its hinge line). Signs: +x right, +y up, +z aft;
  // pitch up = elevator trailing edge up, roll right = right aileron up, yaw right = rudder trailing edge right
  poseBones(B, bones) {
    const pi = this.cs.x, yi = this.cs.y, ri = this.cs.z;
    for (let k = 1; k < bones.length && k < 8; k++) {
      const bn = bones[k]; if (!bn) continue;
      let ang = 0;
      switch (bn.kind) {
        case 'stab': ang = (-pi * 13 - bn.side * ri * 7) * DEG; break; // all-moving tail, also helps roll
        case 'canard': ang = pi * 13 * DEG; break;
        case 'elev': ang = -pi * 20 * DEG; break; // hinged elevator behind a fixed tailplane
        case 'elevon': ang = (-pi * 12 - bn.side * ri * 14) * DEG; break; // delta wing: elevator + aileron in one
        case 'ail': ang = -bn.side * ri * 18 * DEG; break;
        case 'rud': ang = yi * 18 * DEG; break;
        case 'swing': ang = -bn.side * (this.sweep - (bn.rest !== undefined ? bn.rest : 20)) * DEG; break; // F-14 wings
        case 'prop': ang = this.propA; break;
        case 'hide': { // parts of the source model the game does not use: folded to a point inside the airframe
          const o = B.subarray(k * 16, k * 16 + 16); o.fill(0);
          o[12] = bn.pivot[0]; o[13] = bn.pivot[1]; o[14] = bn.pivot[2]; o[15] = 1;
          continue;
        }
      }
      _q.axisAngle(bn.axis[0], bn.axis[1], bn.axis[2], ang);
      const p = bn.pivot, rp = _a.set(p[0], p[1], p[2]).rot(_q);
      M4.fromQP(B.subarray(k * 16, k * 16 + 16), _q, _b.set(p[0] - rp.x, p[1] - rp.y, p[2] - rp.z));
    }
  }
  tipWorld(t, out) {
    out.set(t.p[0], t.p[1], t.p[2]);
    if (t.bone) {
      const b = this.hd ? this.hdBones : this.bones, o = t.bone * 16, x = out.x, y = out.y, z = out.z;
      out.set(b[o] * x + b[o + 4] * y + b[o + 8] * z + b[o + 12], b[o + 1] * x + b[o + 5] * y + b[o + 9] * z + b[o + 13], b[o + 2] * x + b[o + 6] * y + b[o + 10] * z + b[o + 14]);
    }
    return out.rot(this.q).add(this.pos);
  }
  draw(now) {
    if (!this.alive && !this.wreck) return;
    if (this.wreck && this.wreck.done) return;
    if (!R.visible(this.pos, this.model.radius)) return;
    if (this.alive && this.invuln(now) && Math.floor(now / 110) % 2 === 0) return;
    this.drawBody(false);
  }
  // hi-detail textured model when it has loaded and the aircraft is more than a few pixels across;
  // close up, the missiles on the pylons are hi-detail models too (the simple ones are hidden then)
  drawBody(force) {
    const hd = this.hd, L = this.look;
    const si = force || this.bigOnScreen(this.model.radius, 60) ? this.storeInstances() : null;
    const fr = L.firedR, fi = L.firedI;
    if (hd && (force || this.bigOnScreen(hd.radius, 5))) {
      R.drawHD(hd, this.modelM, L);
      if (si) { L.firedR = 99; L.firedI = 99; }
      if (hd.stores) R.drawPlane(hd.stores, this.modelM, L);
    } else {
      if (si) { L.firedR = 99; L.firedI = 99; }
      R.drawPlane(this.model.mesh, this.modelM, L);
    }
    L.firedR = fr; L.firedI = fi;
    if (si) {
      const ml = this.mslLook; ml.flash = L.flash;
      for (const it of si) {
        if (it.ir ? it.slot - 20 <= fi : it.slot <= fr) continue;
        M4.mul(STORE_M, this.modelM, it.M);
        R.drawHD(it.hm.m, STORE_M, ml, it.hm.g0, it.hm.g1, it.hm.tint);
      }
    }
  }
  // where each hi-detail missile hangs (aircraft frame), cached per aircraft type and model; null until the
  // missile library has loaded. The missile keeps the nose where the simple one had it and its top at the rail.
  storeInstances() {
    const hd = this.hd, d = this.def, key = (hd ? 'h:' : 'p:') + d.id;
    if (this.siKey === key) return this.si;
    const list = hd ? hd.storeList : this.model.stores, out = [];
    for (const s of list || []) {
      const ir = s.slot > 20, w = ir ? d.wI : d.wR, hm = w && HD.missile(w.m.id);
      if (!hm) return null;
      const M = M4.create(), rp = (MSL_DIM[s.k] || MSL_DIM.rad)[1];
      M4.fromQP(M, IDENT_Q, _a.set(s.x, s.y + rp - hm.r, s.z + hm.len / 2), hm.sc);
      out.push({ slot: s.slot, ir, hm, M });
    }
    this.si = out; this.siKey = key;
    return out;
  }
  bigOnScreen(r, px) {
    const m = R.cam.vp, p = this.pos, w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    return w <= 1 || r * R.cam.px / w > px;
  }
  drawFlames(now) {
    if (!this.alive || !R.visible(this.pos, this.model.radius)) return;
    const st = this.st, m = this.vm || this.model;
    if (st.prop) {
      for (const p of m.props) {
        _a.set(0, p.y, p.z - 0.02).rot(this.q).add(this.pos);
        M4.fromQP(FLAME_M, this.q, _a);
        R.drawFlame(SHARED.disc, FLAME_M, p.r, p.r, 1, 0.9, 1);
      }
      return;
    }
    const thr = this.local ? this.ctrl.thr : 0.85, ab = this.abOn;
    const inten = ab ? 1 : clamp((thr - 0.55) * 0.9, 0, 0.4);
    if (inten <= 0.01) return;
    const pal = FLAME_PAL[this.def.flame] || FLAME_PAL.us;
    for (const f of m.flames) {
      _a.set(f.p[0], f.p[1], f.p[2]).rot(this.q).add(this.pos);
      M4.fromQP(FLAME_M, this.q, _a);
      // afterburner: long plume with shock diamonds ~1.3 plume diameters apart; dry: short, faint
      const r = Math.max(f.r, 0.3), L = r * (ab ? 12.5 + Math.sin(now * 0.05) * 0.8 : 4.0), w = r * (ab ? 1.08 : 0.8);
      R.drawFlame(SHARED.flame, FLAME_M, w, w, L, inten, 0, pal, L / (r * 2.6));
      // the glowing nozzle seen from behind
      _a.set(f.p[0], f.p[1], f.p[2] + 0.02).rot(this.q).add(this.pos);
      M4.fromQP(FLAME_M, this.q, _a);
      R.drawFlame(SHARED.disc, FLAME_M, f.r * 0.98, f.r * 0.98, 1, ab ? 0.85 : inten * 0.9, 2, pal);
    }
  }
}
const FLAME_M = M4.create(), STORE_M = M4.create(), IDENT_Q = new Q();

// ---------- steering assistant (mouse aim and AI) ----------
// writes pitch/roll/yaw into ctrl so the aircraft turns toward `target` (world point)
function steerTo(pl, target, ctrl, aggr = 1) {
  const d = _a.subV(target, pl.pos).irot(pl.q).norm();
  const off = Math.acos(clamp(-d.z, -1, 1));
  const right = pl.right(_b);
  const fine = 1 - smooth(2.5 * DEG, 12 * DEG, off);
  let pitch, roll, yaw = clamp(d.x * 5, -1, 1);
  const angPull = Math.atan2(d.x, d.y), angPush = Math.atan2(-d.x, -d.y);
  if (fine > 0.98) { // nearly on target: wings level, fine pitch + rudder
    pitch = clamp(d.y * 9, -1, 1); roll = clamp(right.y * 2.5, -1, 1);
  } else if (Math.abs(angPull) < 1.75 || off > 32 * DEG) {
    const want = clamp(angPull * 2.2, -1, 1);
    roll = lerp(want, clamp(right.y * 2.5, -1, 1), fine);
    const aligned = Math.max(0, Math.cos(angPull));
    pitch = clamp((d.z > 0 ? 1 : off * 3.2) * (0.25 + 0.75 * aligned), 0, 1);
    pitch = lerp(pitch, clamp(d.y * 9, -1, 1), fine);
  } else {
    roll = clamp(angPush * 2.2, -1, 1);
    pitch = -clamp(off * 3.0 * Math.max(0, Math.cos(angPush)), 0, 0.55);
  }
  ctrl.pitch = clamp(pitch * aggr, -1, 1); ctrl.roll = roll; ctrl.yaw = yaw * (0.4 + 0.6 * fine);
  return off;
}
