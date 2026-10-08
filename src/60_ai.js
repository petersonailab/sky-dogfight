// ===================== AI pilots =====================
const AI_SKILL = [
  { react: 0.55, err: 2.6, flare: 0.35, cone: 3.4, msl: [11, 17], aggr: 0.72, lead: 0.55, ab: 0.35, g: 0.8, name: '新手' },
  { react: 0.32, err: 1.1, flare: 0.65, cone: 2.5, msl: [7, 12], aggr: 0.88, lead: 0.85, ab: 0.7, g: 0.9, name: '普通' },
  { react: 0.17, err: 0.45, flare: 0.9, cone: 1.9, msl: [4, 7], aggr: 1.0, lead: 1.0, ab: 1.0, g: 0.97, name: '王牌' },
];
const BOT_NAMES = ['毒蛇', '獵鷹', '雷霆', '幽靈', '黑寡婦', '颶風', '鷂子', '鐵翼', '夜梟', '山貓', '海鵰', '赤狐'];

class Brain {
  constructor(pl, skill) {
    this.pl = pl; this.s = AI_SKILL[clamp(skill | 0, 0, 2)]; pl.gScale = this.s.g;
    this.target = null; this.think = rnd(0, 0.3); this.aimErr = new V3(); this.errT = 0;
    this.mslT = rnd(3, 8); this.evading = false; this.evadeSide = 1; this.goal = new V3(); this.mode = 'wander';
    this.wp = new V3(rnd(-0.5, 0.5) * WORLD.B, rnd(1500, 2600), rnd(-0.5, 0.5) * WORLD.B); this.flareT = 0;
    this.v1 = new V3(); this.v2 = new V3(); this.abRoll = 0;
  }
  setSkill(k) { this.s = AI_SKILL[clamp(k | 0, 0, 2)]; this.pl.gScale = this.s.g; }
  update(dt, now) {
    const pl = this.pl, c = pl.ctrl, s = this.s;
    c.gun = false; c.msl = false; c.flare = false;
    if (!pl.alive) return;
    this.think -= dt; this.errT -= dt; this.flareT -= dt; this.mslT -= dt;
    if (this.errT <= 0) { this.errT = rnd(0.6, 1.4); this.abRoll = Math.random(); const e = s.err * DEG; this.aimErr.set(rnd(-e, e), rnd(-e, e), rnd(-e, e)); }
    if (this.think <= 0) { this.think = s.react; this.decide(now); }
    const pos = pl.pos, fwd = pl.fwd(_a).clone();
    // --- safety: terrain / bounds / ceiling ---
    const g0 = WORLD.groundAt(pos.x, pos.z);
    let danger = false, gA = g0;
    for (const t of [1, 2.2, 3.5, 5]) {
      const ax = pos.x + pl.vel.x * t, ay = pos.y + pl.vel.y * t, az = pos.z + pl.vel.z * t, gh = WORLD.groundAt(ax, az);
      gA = Math.max(gA, gh); if (ay < gh + 150 + t * 40) danger = true;
    }
    let goal = null, thr = 1, ab = false, aggr = s.aggr;
    if (pos.y - g0 < 280 || danger) {
      goal = _c.set(pos.x + fwd.x * 800, Math.max(pos.y, gA) + 900, pos.z + fwd.z * 800); ab = true; aggr = 1;
    } else if (Math.abs(pos.x) > WORLD.B - 500 || Math.abs(pos.z) > WORLD.B - 500) {
      goal = _c.set(0, clamp(pos.y, 1400, 3000), 0); aggr = 1;
    } else if (pos.y > 4200 && !(this.target && this.target.alive && this.target.pos.y > pos.y + 300)) {
      goal = _c.set(pos.x + fwd.x * 1200, 2400, pos.z + fwd.z * 1200);
    }
    // --- threat: incoming missile ---
    if (!goal && this.evading) {
      const m = this.threat;
      if (m && m.alive) {
        const away = this.v1.subV(pos, m.pos); const d = away.len(); away.norm();
        const side = this.v2.crossV(m.vel, _e.set(0, 1, 0)).norm().scale(this.evadeSide);
        goal = _c.copy(pos).addS(side, 900).addS(away, 300); goal.y = pos.y - 250;
        ab = true; aggr = 1;
        // flares have a cooldown, so wait until the missile is about to arrive
        const closing = Math.max(50, -((pl.vel.x - m.vel.x) * away.x + (pl.vel.y - m.vel.y) * away.y + (pl.vel.z - m.vel.z) * away.z));
        if (d / closing < 1.5 && pl.flareCdT <= 0 && this.flareT <= 0) { this.flareT = 0.7; if (Math.random() < s.flare) c.flare = true; }
      } else this.evading = false;
    }
    // --- attack ---
    const T = this.target;
    if (!goal && T && T.alive) {
      const dist = pos.dist(T.pos);
      const bs = pl.st.bullet || 1000;
      let aim;
      if (dist < 1400) {
        const t = dist / bs * s.lead;
        aim = _c.copy(T.pos).addS(_d.subV(T.vel, pl.vel), t);
      } else aim = _c.copy(T.pos).addS(T.vel, 0.6);
      const to = _d.subV(aim, pos);
      const ang = Math.acos(clamp(to.dot(fwd) / (to.len() || 1), -1, 1));
      to.x += this.aimErr.x * dist; to.y += this.aimErr.y * dist; to.z += this.aimErr.z * dist;
      goal = _e.copy(pos).add(to);
      if (dist < 950 && ang < s.cone * DEG && Game.canFight()) c.gun = true;
      // pick the missile for the range: short-range IR up close, radar missiles further out
      const d = pl.def;
      const irOk = d.wI && pl.mI > 0 && dist < d.wI.m.range * 0.92, radOk = d.wR && pl.mR > 0 && dist < d.wR.m.range * 0.95;
      const want = irOk ? 'ir' : radOk ? 'rad' : (pl.mR > 0 ? 'rad' : 'ir');
      if (want !== pl.wsel && (want === 'ir' ? d.wI : d.wR)) pl.wsel = want;
      const w = pl.curW();
      if (w && pl.lock.locked && pl.lock.t === T && dist > 400 && dist < w.m.range * 0.92 && this.mslT <= 0) { c.msl = true; this.mslT = rnd(s.msl[0], s.msl[1]); }
      const rx = T.pos.x - pos.x, ry = T.pos.y - pos.y, rz = T.pos.z - pos.z, rl = Math.hypot(rx, ry, rz) || 1;
      const closing = ((T.vel.x - pl.vel.x) * rx + (T.vel.y - pl.vel.y) * ry + (T.vel.z - pl.vel.z) * rz) / rl < -20;
      if (dist < 380 && ang < 0.5 && closing) thr = 0.45;
      const closeRate = -((T.vel.x - pl.vel.x) * rx + (T.vel.y - pl.vel.y) * ry + (T.vel.z - pl.vel.z) * rz) / rl;
      if ((dist > 700 && closeRate < 70) || dist > 1800 || pl.speed < pl.perf.vc * 0.9) ab = this.abRoll < s.ab + 0.2;
    }
    if (!goal) {
      if (pos.dist(this.wp) < 500) this.wp.set(rnd(-0.6, 0.6) * WORLD.B, rnd(1400, 2800), rnd(-0.6, 0.6) * WORLD.B);
      goal = _c.copy(this.wp); thr = 0.85;
    }
    // avoid ramming
    for (const o of Game.planes) {
      if (o === pl || !o.alive) continue;
      const d = _d.subV(o.pos, pos), dl = d.len();
      if (dl < 70 && d.dot(fwd) > 0) { goal = _e.copy(pos).addS(fwd, 400).addS(pl.up(_b), dl < 40 ? -300 : 300); break; }
    }
    steerTo(pl, goal, c, aggr);
    c.thr = thr; c.ab = ab && !pl.st.prop ? ab : (ab && pl.st.prop);
    c.yaw *= 0.6;
  }
  decide(now) {
    const pl = this.pl;
    // threat assessment
    let worst = null, wd = 6500;
    for (const m of W.missiles) {
      if (!m.alive) continue;
      const tk = m.local ? (m.target && !m.target.flare ? m.target.key : '') : m.targetKey;
      if (tk !== pl.key) continue;
      const d = m.pos.dist(pl.pos);
      if (d < wd) { wd = d; worst = m; }
    }
    if (worst && !this.evading) { this.evadeSide = Math.random() < 0.5 ? 1 : -1; }
    this.evading = !!worst; this.threat = worst;
    // target choice
    let best = null, bs = 1e9;
    const f = pl.fwd(_a);
    for (const t of Game.planes) {
      if (t === pl || !t.alive || t.wreck || (pl.team && t.team === pl.team)) continue;
      const d = _b.subV(t.pos, pl.pos), dist = d.len();
      const ang = Math.acos(clamp(d.dot(f) / (dist || 1), -1, 1));
      let sc = dist * (1 + ang * 0.6);
      if (t.key === pl.lastHitBy && now - pl.lastHitT < 8000) sc *= 0.4;
      if (t === this.target) sc *= 0.75;
      if (sc < bs) { bs = sc; best = t; }
    }
    this.target = best;
  }
}
