// ===================== guns, missiles, flares, radar & lock-on =====================
const MSL_DROP = 0.2;          // s of free fall after release before the motor lights
const MSL_GIMBAL = 70 * DEG;   // seeker loses the target beyond this angle off the missile's axis
const PN_N = 4;                // proportional-navigation constant
const _w1 = new V3(), _w2 = new V3(), _w3 = new V3(), _w4 = new V3(), _w5 = new V3(), _w6 = new V3();

const W = {
  bullets: [], pool: [], missiles: [], flares: [], mid: 0, fid: 0,
  dead: new Map(), // remote missile key -> when it blew up, so a late snapshot can't bring it back (and hit twice)
  clear() { this.pool.push(...this.bullets); this.bullets.length = 0; this.missiles.length = 0; this.flares.length = 0; },
  markDead(key) {
    const now = performance.now();
    this.dead.set(key, now);
    if (this.dead.size > 120) for (const [k, t] of this.dead) if (now - t > 8000) this.dead.delete(k);
  },
  // ---------- guns ----------
  guns(pl, dt, now, visualOnly) {
    const st = pl.st;
    const want = visualOnly ? pl.firing : (pl.ctrl.gun && pl.ammo >= 1 && pl.alive && Game.canFight());
    if (!visualOnly) pl.firing = want;
    if (!want || !pl.alive) {
      pl.gunT = 0;
      if (!visualOnly) { pl.gunIdle += dt; if (pl.gunIdle > 2.5) pl.ammo = Math.min(st.ammo, pl.ammo + st.ammo * 0.05 * dt); }
      return;
    }
    pl.gunIdle = 0; pl.gunT += dt;
    const iv = 1 / st.gunRate, heavy = st.gunDmg > 11 || (st.prop && st.gunDmg > 4);
    let shots = 0;
    while (pl.gunT >= iv && shots < 4) {
      pl.gunT -= iv; shots++;
      if (!visualOnly) { if (pl.ammo < 1) break; pl.ammo--; }
      this.bullet(pl, !visualOnly);
      if (pl === Game.me) AU.gun(0, heavy); else if (Game.view) AU.gun(pl.pos.dist(Game.view.pos), heavy);
    }
  },
  bullet(pl, local) {
    const g = pl.model.guns[pl.gunSide++ % pl.model.guns.length];
    const b = this.pool.pop() || {};
    const f = pl.fwd(_a), gp = _b.set(g[0], g[1], g[2]).rot(pl.q);
    const conv = 380, spd = pl.st.bullet || 1000;
    const dir = _c.copy(f).scale(conv).sub(Math.abs(g[0]) > 1 ? _d.set(gp.x, gp.y, gp.z) : _d.set(0, 0, 0)).norm();
    const sp = (pl.st.prop ? 0.5 : 0.35) * DEG;
    dir.x += rnd(-sp, sp); dir.y += rnd(-sp, sp); dir.z += rnd(-sp, sp); dir.norm();
    b.x = pl.pos.x + gp.x; b.y = pl.pos.y + gp.y; b.z = pl.pos.z + gp.z;
    b.vx = pl.vel.x + dir.x * spd; b.vy = pl.vel.y + dir.y * spd; b.vz = pl.vel.z + dir.z * spd;
    b.life = pl.st.prop ? 1.5 : 1.3; b.owner = pl; b.local = local; b.dmg = pl.st.gunDmg * 1.35; b.team = pl.team; b.age = 0;
    this.bullets.push(b);
  },
  updateBullets(dt, now) {
    const planes = Game.planes, B = this.bullets;
    for (let i = B.length - 1; i >= 0; i--) {
      const b = B[i];
      const x0 = b.x, y0 = b.y, z0 = b.z;
      b.vy -= 4 * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt; b.life -= dt; b.age += dt;
      let dead = b.life <= 0;
      if (!dead && b.local) {
        const dx = b.x - x0, dy = b.y - y0, dz = b.z - z0, dd = dx * dx + dy * dy + dz * dz;
        for (const t of planes) {
          if (t === b.owner || !t.alive || t.wreck || (b.team && t.team === b.team) || t.invuln(now)) continue;
          const cx = t.pos.x - x0, cy = t.pos.y - y0, cz = t.pos.z - z0;
          const s = clamp((cx * dx + cy * dy + cz * dz) / (dd || 1), 0, 1);
          const ex = x0 + dx * s - t.pos.x, ey = y0 + dy * s - t.pos.y, ez = z0 + dz * s - t.pos.z;
          if (ex * ex + ey * ey + ez * ez < t.hitR * t.hitR) {
            Game.bulletHit(b, t, _e.set(x0 + dx * s, y0 + dy * s, z0 + dz * s), now);
            dead = true; break;
          }
        }
      }
      if (!dead && b.y < 1400 && b.y < WORLD.groundAt(b.x, b.z)) {
        dead = true;
        if (Game.view && Game.view.pos.distSq(_e.set(b.x, b.y, b.z)) < 1.6e6) { if (b.y < 1) FX.splash(_e.set(b.x, 0, b.z), false); else FX.dust(_e); }
      }
      if (dead) { B[i] = B[B.length - 1]; B.pop(); this.pool.push(b); }
    }
  },
  drawTracers() {
    const cam = R.cam.pos, ppu = R.H / (2 * Math.tan(R.cam.fov / 2));
    for (const b of this.bullets) {
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1, len = Math.min(42, 10 + b.age * 90);
      const dist = Math.hypot(b.x - cam.x, b.y - cam.y, b.z - cam.z);
      const mine = b.owner === Game.view, w = Math.max(0.35, dist * (mine ? 4.2 : 3) / ppu);
      const a = mine ? 1 : 0.85;
      FXQ.quad(b.x - b.vx / sp * len, b.y - b.vy / sp * len, b.z - b.vz / sp * len, b.x, b.y, b.z, w, 1, 0.8, 0.4, a);
    }
  },
  // ---------- radar / detection ----------
  // seen when inside the all-round detection range, or inside radar range AND the radar's scan cone
  detects(pl, t) {
    const P = pl.perf, d = _w1.subV(t.pos, pl.pos), dist = d.len();
    if (dist <= P.detect) return true;
    if (!P.radar || dist > P.radar) return false;
    return Math.acos(clamp(d.dot(pl.fwd(_w2)) / (dist || 1), -1, 1)) <= P.scan;
  },
  offAngle(pl, t) {
    const d = _w1.subV(t.pos, pl.pos), dist = d.len();
    return Math.acos(clamp(d.dot(pl.fwd(_w2)) / (dist || 1), -1, 1));
  },
  // ---------- lock-on ----------
  updateLock(pl, dt, now) {
    const L = pl.lock, w = pl.curW();
    if (!pl.alive || !w || pl.mslLeft(w.m.type) <= 0) { L.t = null; L.p = 0; L.locked = false; L.w = w ? w.m : null; return; }
    const M = w.m;
    if (L.w !== M) { L.t = null; L.p = 0; L.locked = false; L.w = M; }
    if (L.t) {
      const t = L.t;
      let ok = t.alive && !t.wreck && !(pl.team && t.team === pl.team) && Game.byKey.get(t.key) === t;
      if (ok) { const dist = t.pos.dist(pl.pos); ok = dist <= M.range && dist > 150 && this.offAngle(pl, t) <= M.fov1R && this.detects(pl, t); }
      if (!ok) { L.t = null; L.p = 0; L.locked = false; }
    }
    if (!L.t) {
      let best = null, bs = 1e9;
      for (const t of Game.planes) {
        if (t === pl || !t.alive || t.wreck || (pl.team && t.team === pl.team)) continue;
        const dist = t.pos.dist(pl.pos);
        if (dist > M.range || dist < 150) continue;
        const ang = this.offAngle(pl, t);
        if (ang > M.fov0R || !this.detects(pl, t)) continue;
        const sc = ang + dist / M.range * 0.05;
        if (sc < bs) { bs = sc; best = t; }
      }
      if (best) { L.t = best; L.p = 0; L.locked = false; }
    }
    if (L.t) { L.p = Math.min(1, L.p + dt / M.lockT); L.locked = L.p >= 1; }
  },
  // ---------- missiles ----------
  fire(pl, now) {
    const w = pl.curW();
    if (!pl.alive || !w || pl.mslCd > 0 || !Game.canFight()) return null;
    const M = w.m, type = M.type, left = pl.mslLeft(type);
    if (left <= 0) return null;
    const firedBefore = Math.max(0, w.n - left);
    if (type === 'ir') { pl.mI--; pl.reloadI = 0; } else { pl.mR--; pl.reloadR = 0; }
    pl.mslCd = 0.5;
    const vm = pl.vm || pl.model;
    const pyl = (type === 'ir' ? vm.pylI : vm.pylR)[firedBefore] || [0, -1.2, 0];
    const pos = _a.set(pyl[0], pyl[1], pyl[2]).rot(pl.q).add(pl.pos).clone();
    const down = pl.up(_b).scale(-8);
    const tgt = pl.lock.locked && pl.lock.w === M ? pl.lock.t : null;
    const ms = { id: ++this.mid, key: Net.myPeer + ':' + this.mid, owner: pl, ownerKey: pl.key, ownerIdx: pl.idx, local: true, def: M,
      pos, prev: pos.clone(), vel: pl.vel.clone().add(down), v0: pl.speed, target: tgt, t: 0, alive: true, q: new Q().copy(pl.q), team: pl.team };
    this.missiles.push(ms);
    if (pl.mslLeft(type) <= 0) { const other = type === 'ir' ? 'rad' : 'ir'; if (pl.mslLeft(other) > 0) pl.wsel = other; }
    if (pl === Game.me) AU.launch(); else if (Game.view) AU.boom(pl.pos.dist(Game.view.pos) * 3, false);
    return ms;
  },
  updateMissiles(dt, now) {
    const M = this.missiles;
    for (let i = M.length - 1; i >= 0; i--) {
      const m = M[i];
      if (!m.alive) { M.splice(i, 1); continue; }
      m.prev.copy(m.pos);
      if (m.local) this.guide(m, dt, now);
      else { // remote: dead-reckon from the latest snapshot
        m.t += dt;
        const age = clamp((now - m.snapT) / 1000 + m.lat, 0, 0.6);
        m.pos.copy(m.snapPos).addS(m.snapVel, age);
        m.vel.copy(m.snapVel);
        if ((now - m.seen) > 1500) { m.alive = false; this.markDead(m.key); continue; }
      }
      if (m.vel.lenSq() > 1) m.q.lookDir(_a.copy(m.vel).norm(), Math.abs(m.vel.y) / m.vel.len() > 0.97 ? _b.set(1, 0, 0) : _b.set(0, 1, 0));
      // smoke trail while the motor burns, filled along this frame's path so it reads as one plume
      if (m.t > MSL_DROP && m.t < MSL_DROP + m.def.accT + 2.2) {
        const seg = m.prev.dist(m.pos), n = Math.min(9, Math.max(1, Math.round(seg / 7 * FX.budget)));
        for (let k = 0; k < n; k++) {
          const t = (k + Math.random()) / n;
          FX.emit(m.prev.x + (m.pos.x - m.prev.x) * t, m.prev.y + (m.pos.y - m.prev.y) * t, m.prev.z + (m.pos.z - m.prev.z) * t,
            rnd(-1.5, 1.5), rnd(-1, 1.5), rnd(-1.5, 1.5), rnd(2.2, 3.4), 1.6, 9, 0.92, 0.92, 0.9, 0.42, 0.4, -0.6, 0);
        }
      }
      this.fuseCheck(m, now);
      if (m.alive && m.pos.y < WORLD.groundAt(m.pos.x, m.pos.z)) {
        if (m.local) this.detonate(m, m.pos, true);
        else { m.alive = false; this.markDead(m.key); }
      }
    }
  },
  // proportional navigation, limited by the missile's turn rate (°/s from the table)
  guide(m, dt, now) {
    const D = m.def;
    m.t += dt;
    if (m.t > D.life) { this.detonate(m, m.pos, false); return; }
    if (m.t < MSL_DROP) { m.vel.y -= 9.81 * dt; m.pos.addS(m.vel, dt); return; }
    const ta = m.t - MSL_DROP;
    const ns = ta < D.accT ? lerp(m.v0, D.v, ta / D.accT) : D.v;
    const vdir = _w3.copy(m.vel).norm();
    const T = m.target;
    if (T && (T.flare ? T.life > 0 : (T.alive && !T.wreck))) {
      const r = _w4.subV(T.pos, m.pos), rl = r.len() || 1;
      if (Math.acos(clamp(r.dot(vdir) / rl, -1, 1)) > MSL_GIMBAL) m.target = null;
      else {
        const vr = _w5.subV(T.vel, m.vel);
        const los = _w6.crossV(r, vr).scale(1 / Math.max(rl * rl, 1));
        const acc = _w5.crossV(los, m.vel).scale(PN_N);
        // a little pure pursuit helps when the launch heading is well off the line of sight
        acc.addS(_w6.copy(r).scale(1 / rl).sub(vdir), ns * 0.8);
        acc.addS(vdir, -acc.dot(vdir));
        const al = acc.len();
        if (al > 1e-6) {
          const ang = Math.min(al / Math.max(ns, 50), D.turnR) * dt;
          acc.scale(1 / al);
          vdir.scale(Math.cos(ang)).addS(acc, Math.sin(ang)).norm();
        }
      }
    }
    m.vel.copy(vdir).scale(ns);
    m.pos.addS(m.vel, dt);
  },
  // proximity fuse (blast radius from the table) — evaluated by the side that owns the target
  fuseCheck(m, now) {
    if (!m.alive || (m.local && m.t < MSL_DROP + 0.15)) return;
    const T = m.target, blast = m.def.blast;
    if (m.local && T && T.flare) {
      if (m.pos.dist(T.pos) < blast) this.detonate(m, m.pos, true);
      return;
    }
    const tk = m.local ? (T && !T.flare ? T.key : '') : m.targetKey;
    if (!tk) return; // unguided or decoyed: harmless
    for (const pl of Game.planes) {
      if (!pl.local || pl.key !== tk || !pl.alive || pl.wreck || pl === m.owner || (m.team && pl.team === m.team)) continue;
      const d = segDist(m.prev, m.pos, pl.pos);
      if (d < blast) {
        const dmg = m.def.dmg; // inside the blast radius the listed damage applies
        const at = _a.copy(m.prev).lerp(m.pos, 0.5).clone();
        if (m.local) this.detonate(m, at, true);
        else { m.alive = false; this.markDead(m.key); FX.explosion(at, 0.7); Net.recordDet(m.key, at); if (Game.view) AU.boom(at.dist(Game.view.pos), true); }
        Game.damageLocal(pl, dmg, m.ownerKey, 1, at, now);
      }
      return;
    }
  },
  detonate(m, at, boom) {
    m.alive = false;
    if (boom) { FX.explosion(at, 0.7); if (Game.view) AU.boom(at.dist(Game.view.pos), true); }
    else FX.smallBoom(at, 0.5);
    Net.recordDet(m.key, at);
  },
  // remote missile bookkeeping
  remoteMissile(key, ownerKey, ownerIdx, x, y, z, vx, vy, vz, targetKey, now, team, wid, lat) {
    let m = this.missiles.find(q => q.key === key);
    if (!m) {
      const gone = this.dead.get(key);
      if (gone !== undefined && performance.now() - gone < 8000) return null;
      m = { key, ownerKey, ownerIdx, local: false, def: MISSILES[wid] || MISSILES.aim120, owner: Game.byKey.get(ownerKey) || null,
        pos: new V3(x, y, z), prev: new V3(x, y, z), vel: new V3(vx, vy, vz), snapPos: new V3(), snapVel: new V3(), snapT: now, seen: now,
        t: MSL_DROP, alive: true, q: new Q(), team, lat: LAT };
      this.missiles.push(m);
      if (Game.view) AU.boom(m.pos.dist(Game.view.pos) * 3, false);
    }
    m.snapPos.set(x, y, z); m.snapVel.set(vx, vy, vz); m.snapT = now; m.seen = now; m.targetKey = targetKey || ''; m.team = team;
    if (lat !== undefined) m.lat = lat;
    return m;
  },
  removeMissile(key, at, boom) {
    const m = this.missiles.find(q => q.key === key);
    if (!m || !m.local) this.markDead(key);
    if (m && m.alive) { m.alive = false; if (boom && at) { FX.explosion(at, 0.7); if (Game.view) AU.boom(at.dist(Game.view.pos), true); } }
    else if (!m && boom && at) FX.explosion(at, 0.7);
  },
  drawMissiles() {
    const look = { paint: SHARED.missilePaint, accent: null, firedR: 0, firedI: 0, bones: null, flash: 0 };
    for (const m of this.missiles) {
      if (!m.alive || !R.visible(m.pos, 4)) continue;
      const sc = m.def.shape === 'big' ? 1.35 : m.def.shape === 'ir' ? 0.82 : 1;
      M4.fromQP(MS_M, m.q, m.pos, sc);
      R.drawPlane(SHARED.missile, MS_M, look);
    }
  },
  drawMissileGlow() {
    const ppu = R.H / (2 * Math.tan(R.cam.fov / 2));
    for (const m of this.missiles) {
      if (!m.alive || m.t < MSL_DROP || m.t > MSL_DROP + m.def.accT + 2.2) continue;
      const v = _a.copy(m.vel).norm(), dist = m.pos.dist(R.cam.pos), w = Math.max(1.2, dist * 5 / ppu);
      FXQ.quad(m.pos.x + v.x * 1.4, m.pos.y + v.y * 1.4, m.pos.z + v.z * 1.4, m.pos.x - v.x * (4 + w * 2), m.pos.y - v.y * (4 + w * 2), m.pos.z - v.z * (4 + w * 2), w, 1, 0.78, 0.45, 1);
    }
  },
  // ---------- flares (cooldown + burn time from the table) ----------
  dropFlares(pl, now) {
    const P = pl.perf;
    if (!pl.alive || !(P.flareCd > 0) || pl.flareCdT > 0) return false;
    pl.flareCdT = P.flareCd; pl.flareT = P.flareDur;
    const ev = this.flareBurst(pl.pos, pl.vel, pl.key, pl.q, P.flareDur);
    Net.recordFlare(pl, pl.pos, pl.vel);
    if (pl === Game.me) AU.flare();
    return ev;
  },
  flareBurst(pos, vel, ownerKey, q, dur) {
    const made = [], life = dur || 1.6;
    const up = _b.set(0, 1, 0); if (q) up.rot(q);
    for (let i = 0; i < 4; i++) {
      const v = new V3(vel.x * 0.55 - up.x * 25 + rnd(-30, 30), vel.y * 0.55 - up.y * 25 + rnd(-30, 10), vel.z * 0.55 - up.z * 25 + rnd(-30, 30));
      const f = { flare: true, pos: pos.clone(), vel: v, life, ownerKey, alive: true, key: 'f' + (++this.fid) };
      this.flares.push(f); made.push(f);
    }
    // decoy MY missiles that are chasing that aircraft (IR seekers are fooled more often than radar)
    for (const m of this.missiles) {
      if (!m.local || !m.alive || !m.target || m.target.flare || m.target.key !== ownerKey) continue;
      const d = m.pos.dist(pos);
      if (d > 3500) continue;
      const chance = m.def.type === 'ir' ? 0.85 : 0.5;
      if (Math.random() < chance) m.target = pick(made);
    }
    return made;
  },
  updateFlares(dt) {
    const F = this.flares;
    for (let i = F.length - 1; i >= 0; i--) {
      const f = F[i];
      f.life -= dt;
      if (f.life <= 0) { F.splice(i, 1); continue; }
      f.vel.scale(Math.exp(-dt * 1.4)); f.vel.y -= 14 * dt;
      f.pos.addS(f.vel, dt);
      FX.emit(f.pos.x, f.pos.y, f.pos.z, 0, 0, 0, 0.18, 4.5, 2, 1, 0.92, 0.75, 1, 0, 0, 1);
      if (Math.random() < 0.6) FX.emit(f.pos.x, f.pos.y, f.pos.z, rnd(-1, 1), rnd(0, 2), rnd(-1, 1), rnd(1.2, 2), 1.4, 5, 0.85, 0.85, 0.85, 0.45, 0.6, -1, 0);
    }
  },
};
const MS_M = M4.create();
function segDist(a, b, c) {
  const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z, dd = dx * dx + dy * dy + dz * dz;
  const s = dd > 0 ? clamp(((c.x - a.x) * dx + (c.y - a.y) * dy + (c.z - a.z) * dz) / dd, 0, 1) : 0;
  return Math.hypot(a.x + dx * s - c.x, a.y + dy * s - c.y, a.z + dz * s - c.z);
}
