// ===================== head-up display (2D canvas) =====================
const HUD = {
  cv: null, c: null, W: 0, H: 0, dpr: 1, hitT: -1e9, hurts: [], warnBlink: 0,
  col: '#8dffb0', foe: '#ff6a5c', ally: '#6fb3ff', warn: '#ffcf4a', font: '"B612 Mono", ui-monospace, Menlo, monospace',
  tmp: { x: 0, y: 0, w: 0, on: false }, tmp2: { x: 0, y: 0, w: 0, on: false },
  init(cv) { this.cv = cv; this.c = cv.getContext('2d'); },
  resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2), W = window.innerWidth, H = window.innerHeight;
    if (this.cv.width !== Math.round(W * dpr) || this.cv.height !== Math.round(H * dpr)) { this.cv.width = Math.round(W * dpr); this.cv.height = Math.round(H * dpr); }
    this.W = W; this.H = H; this.dpr = dpr;
  },
  hitMark(now) { this.hitT = now; },
  hurt(from, now) { if (from) this.hurts.push({ p: from.clone(), t: now }); if (this.hurts.length > 6) this.hurts.shift(); },
  clear() { this.c.setTransform(this.dpr, 0, 0, this.dpr, 0, 0); this.c.clearRect(0, 0, this.W, this.H); },
  text(s, x, y, size, color, align = 'left', base = 'middle') {
    const c = this.c; c.font = `${size}px ${this.font}`; c.textAlign = align; c.textBaseline = base;
    c.fillStyle = 'rgba(0,0,0,0.45)'; c.fillText(s, x + 1, y + 1); c.fillStyle = color; c.fillText(s, x, y);
  },
  draw(now, dt) {
    this.clear();
    const G = Game, me = G.me; if (!me || !G.active) return;
    const c = this.c, W = this.W, H = this.H, small = W < 700 || H < 500;
    c.lineWidth = 1.6; c.lineCap = 'round'; c.lineJoin = 'round';
    this.drawTargets(now, small);
    if (me.alive) this.drawSelf(now, small);
    this.drawRadar(now, small);
    this.drawFeed(now, small);
    this.drawHurts(now);
  },
  stroke(color, w = 1.6) { const c = this.c; c.strokeStyle = 'rgba(0,0,0,0.35)'; c.lineWidth = w + 2; c.stroke(); c.strokeStyle = color; c.lineWidth = w; c.stroke(); },
  drawSelf(now, small) {
    const c = this.c, me = Game.me, W = this.W, H = this.H, g = this.col, P = this.tmp;
    // boresight (gun cross)
    const f = me.fwd(_a);
    if (R.project(_b.copy(me.pos).addS(f, 1000), P) && P.on) {
      const x = P.x, y = P.y;
      c.beginPath(); c.moveTo(x - 16, y); c.lineTo(x - 6, y); c.moveTo(x + 6, y); c.lineTo(x + 16, y); c.moveTo(x, y - 16); c.lineTo(x, y - 6); c.moveTo(x, y + 6); c.lineTo(x, y + 10);
      this.stroke(g);
      this.bx = x; this.by = y;
      if (now - this.hitT < 140) { c.beginPath(); c.moveTo(x - 12, y - 12); c.lineTo(x - 5, y - 5); c.moveTo(x + 12, y - 12); c.lineTo(x + 5, y - 5); c.moveTo(x - 12, y + 12); c.lineTo(x - 5, y + 5); c.moveTo(x + 12, y + 12); c.lineTo(x + 5, y + 5); this.stroke('#ffffff', 2); }
      // seeker cones of the selected missile: dashed = target must be inside to start a lock, thin = keep it inside while locking
      const w = me.curW();
      if (w && me.mslLeft(w.m.type) > 0) {
        const ppx = (H / 2) / Math.tan(R.cam.fov / 2);
        const r0 = Math.tan(w.m.fov0R) * ppx, r1 = Math.tan(w.m.fov1R) * ppx;
        c.beginPath(); c.arc(x, y, r0, 0, TAU); c.setLineDash([3, 6]); this.stroke('rgba(141,255,176,0.55)', 1); c.setLineDash([]);
        if (me.lock.t && r1 > r0 + 2) { c.beginPath(); c.arc(x, y, r1, 0, TAU); this.stroke('rgba(255,207,74,0.4)', 1); }
      }
    } else { this.bx = W / 2; this.by = H / 2; }
    // flight path marker
    if (me.speed > 5 && R.project(_b.copy(me.pos).addS(_c.copy(me.vel).norm(), 1000), P) && P.on) {
      c.beginPath(); c.arc(P.x, P.y, 5, 0, TAU); c.moveTo(P.x - 5, P.y); c.lineTo(P.x - 13, P.y); c.moveTo(P.x + 5, P.y); c.lineTo(P.x + 13, P.y); c.moveTo(P.x, P.y - 5); c.lineTo(P.x, P.y - 10);
      this.stroke(g, 1.3);
    }
    // aim reticle (mouse)
    if (Input.locked) {
      if (R.project(_b.copy(me.pos).addS(Input.aimDir, 1000), P) && P.on) { c.beginPath(); c.arc(P.x, P.y, 9, 0, TAU); this.stroke('rgba(255,255,255,0.85)', 1.4); }
    } else if (!Input.touch && Input.mouseIn && Input.scheme === 'mouse' && !UI.paused) {
      c.beginPath(); c.arc(Input.mx, Input.my, 8, 0, TAU); c.moveTo(Input.mx - 3, Input.my); c.lineTo(Input.mx + 3, Input.my); this.stroke('rgba(255,255,255,0.85)', 1.4);
    }
    // gun lead pipper on the nearest foe in front
    const T = this.gunTarget(me);
    if (T) {
      const bs = me.st.bullet || 1000, dist = me.pos.dist(T.pos), t = dist / bs;
      const lead = _b.copy(T.pos).addS(_c.subV(T.vel, me.vel), t);
      if (R.project(lead, P) && P.on) {
        const d = Math.hypot(P.x - this.bx, P.y - this.by);
        const hot = d < 14 && dist < 900;
        c.beginPath(); c.arc(P.x, P.y, 7, 0, TAU); c.moveTo(P.x + 1.5, P.y); c.arc(P.x, P.y, 1.5, 0, TAU);
        this.stroke(hot ? '#ffffff' : g, hot ? 2 : 1.3);
        if (dist < 1300) { c.beginPath(); c.arc(P.x, P.y, 13, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(1 - dist / 1300, 0, 1)); this.stroke(g, 1); }
      }
    }
    // speed / altitude boxes, G, throttle
    {
      const kmh = Math.round(me.speed * 3.6), mach = me.speed / 340, cy = H * 0.5, bw = small ? 58 : 66, fs = small ? 15 : 17;
      const narrow = W < 700, gap = small ? 175 : 250;
      const lx = narrow ? 12 : W / 2 - gap - bw, rx = narrow ? W - 18 - bw : W / 2 + gap;
      const box = (x, y, w, h) => { c.beginPath(); c.rect(x, y, w, h); this.stroke(g, 1.2); };
      box(lx, cy - 15, bw, 30); this.text(String(kmh), lx + bw - 6, cy, fs, g, 'right');
      this.text('km/h', lx + bw - 6, cy + 26, 11, g, 'right'); this.text('M ' + mach.toFixed(2), lx + bw - 6, cy + 42, 12, g, 'right');
      this.text('G ' + me.g.toFixed(1), lx + bw - 6, cy - 30, 13, Math.abs(me.g) > 7 ? this.warn : g, 'right');
      box(rx, cy - 15, bw + 6, 30); this.text(String(Math.round(me.pos.y)), rx + bw, cy, fs, g, 'right');
      this.text('ALT m', rx + bw, cy + 26, 11, g, 'right');
      // throttle and afterburner fuel
      const Pf = me.perf, fuel = clamp(me.abFuel / Pf.abFuel, 0, 1), abCol = me.abLock ? this.foe : '#ffb347';
      if (!small) {
        const x = lx - 18, y0 = cy - 40, hgt = 80, thr = me.abOn ? 1 : me.ctrl.thr;
        c.beginPath(); c.rect(x, y0, 6, hgt); this.stroke(g, 1);
        c.fillStyle = me.abOn ? '#ffb347' : g; c.fillRect(x + 1, y0 + hgt * (1 - thr), 4, hgt * thr);
        const fx = x - 12;
        c.beginPath(); c.rect(fx, y0, 6, hgt); this.stroke('rgba(255,179,71,0.7)', 1);
        c.fillStyle = abCol; c.fillRect(fx + 1, y0 + hgt * (1 - fuel), 4, hgt * fuel);
        this.text(me.st.prop ? 'WEP' : 'AB', fx + 3, y0 + hgt + 12, 10, abCol, 'center');
      } else {
        this.text((me.st.prop ? 'WEP ' : 'AB ') + me.abFuel.toFixed(0) + 's', lx + bw - 6, cy + 58, 11, abCol, 'right');
      }
      if (me.abLock) this.text((me.st.prop ? 'WEP' : '後燃器') + '冷卻中', W / 2, H * 0.3 - 30, small ? 12 : 13, this.foe, 'center');
    }
    // heading tape
    {
      const hdg = ((Math.atan2(f.x, -f.z) * RAD) + 360) % 360, y = small ? 54 : 58, span = small ? 140 : 220, cx = W / 2;
      c.save(); c.beginPath(); c.rect(cx - span, y - 20, span * 2, 34); c.clip();
      for (let d = Math.floor((hdg - 40) / 5) * 5; d <= hdg + 40; d += 5) {
        const x = cx + (d - hdg) * (span / 40), dd = ((d % 360) + 360) % 360;
        c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - (dd % 10 === 0 ? 8 : 4)); this.stroke(g, 1);
        if (dd % 30 === 0) { const lab = dd === 0 ? 'N' : dd === 90 ? 'E' : dd === 180 ? 'S' : dd === 270 ? 'W' : String(dd / 10).padStart(2, '0'); this.text(lab, x, y - 15, 11, g, 'center'); }
      }
      c.restore();
      c.beginPath(); c.moveTo(cx, y + 3); c.lineTo(cx - 5, y + 10); c.lineTo(cx + 5, y + 10); c.closePath(); this.stroke(g, 1.2);
      this.text(String(Math.round(hdg)).padStart(3, '0'), cx, y + 22, 12, g, 'center');
    }
    // bank scale + horizon tick around the boresight
    {
      const right = me.right(_c), up = me.up(_d);
      const bank = Math.atan2(right.y, up.y);
      const x = this.bx, y = this.by, r = 54;
      c.beginPath();
      for (const a of [-60, -45, -30, -15, 0, 15, 30, 45, 60]) { const t = (a - 90) * DEG; const l = a % 30 === 0 ? 8 : 4; c.moveTo(x + Math.cos(t) * r, y + Math.sin(t) * r); c.lineTo(x + Math.cos(t) * (r + l), y + Math.sin(t) * (r + l)); }
      this.stroke('rgba(141,255,176,0.6)', 1);
      const t = -Math.PI / 2 - bank;
      c.beginPath(); c.moveTo(x + Math.cos(t) * (r - 2), y + Math.sin(t) * (r - 2)); c.lineTo(x + Math.cos(t + 0.06) * (r - 10), y + Math.sin(t + 0.06) * (r - 10)); c.lineTo(x + Math.cos(t - 0.06) * (r - 10), y + Math.sin(t - 0.06) * (r - 10)); c.closePath(); this.stroke(g, 1.2);
      if (CAM.mode === 1) this.ladder(me, f);
    }
    // weapons + hull
    {
      const y = H - (small ? 22 : 30), cx = W / 2, d = me.def;
      const hpf = clamp(me.hp / me.st.hp, 0, 1), bw = small ? 120 : 180;
      c.fillStyle = 'rgba(0,0,0,0.35)'; c.fillRect(cx - bw / 2, y - 22, bw, 6);
      c.fillStyle = hpf > 0.5 ? g : hpf > 0.25 ? this.warn : this.foe; c.fillRect(cx - bw / 2, y - 22, bw * hpf, 6);
      this.text('機體 ' + Math.max(0, Math.round(me.hp)) + ' / ' + me.st.hp, cx, y - 34, 12, g, 'center');
      // one line of segments: gun, radar missile, IR missile, flares (the selected missile is bright)
      const segs = [['GUN ' + Math.floor(me.ammo), g]];
      const dim = 'rgba(141,255,176,0.5)';
      if (d.wR) segs.push([(me.wsel === 'rad' ? '▶' : '') + d.wR.m.short + ' ×' + me.mR, me.wsel === 'rad' ? '#ffffff' : dim]);
      if (d.wI) segs.push([(me.wsel === 'ir' ? '▶' : '') + d.wI.m.short + ' ×' + me.mI, me.wsel === 'ir' ? '#ffffff' : dim]);
      if (me.perf.flareCd > 0) segs.push(me.flareCdT > 0 ? ['熱焰 ' + me.flareCdT.toFixed(1) + 's', this.warn] : ['熱焰 就緒', g]);
      const fs = small ? 11 : 13;
      c.font = `${fs}px ${this.font}`;
      const gap = small ? 14 : 22, widths = segs.map(sg => c.measureText(sg[0]).width);
      let x = cx - (widths.reduce((a, b) => a + b, 0) + gap * (segs.length - 1)) / 2;
      segs.forEach((sg, i) => { this.text(sg[0], x, y, fs, sg[1], 'left'); x += widths[i] + gap; });
      if ((d.wR && d.wI) && !small) this.text('Q 切換飛彈', cx, y + 18, 10, 'rgba(141,255,176,0.45)', 'center');
    }
    // warnings
    const warns = [];
    const ahead = _b.copy(me.pos).addS(me.vel, 3.2), gA = WORLD.groundAt(ahead.x, ahead.z), g0 = WORLD.groundAt(me.pos.x, me.pos.z);
    if (ahead.y < gA + 30 || me.pos.y - g0 < 120 && me.vel.y < -5) warns.push(['PULL UP 拉起', this.foe]);
    if (me.speed < me.perf.vs * 1.05) warns.push(['STALL 失速', this.warn]);
    if (me.outT > 0) warns.push(['返回戰區 ' + Math.ceil(6 - me.outT), this.warn]);
    const inc = this.incoming(me);
    const rwr = this.lockedBy(me);
    if (inc.n) { warns.unshift(['MISSILE 飛彈接近', this.foe]); AU.warn(clamp(1 - inc.d / 6000, 0.05, 1)); }
    else if (rwr === 2) { warns.unshift(['LOCKED 被鎖定', this.foe]); AU.rwr(2); }
    else if (rwr === 1) { warns.unshift(['RADAR 被瞄準', this.warn]); AU.rwr(1); }
    this.warnBlink += 1;
    if (warns.length && Math.floor(now / 260) % 2 === 0) warns.forEach((w, i) => this.text(w[0], W / 2, H * 0.3 + i * 26, small ? 16 : 20, w[1], 'center'));
    else if (warns.length) warns.forEach((w, i) => this.text(w[0], W / 2, H * 0.3 + i * 26, small ? 16 : 20, w[1] + '88', 'center'));
    for (const m of inc.list) this.edgeArrow(m.pos, this.foe, 14, now);
  },
  ladder(me, f) {
    const c = this.c, P = this.tmp, g = 'rgba(141,255,176,0.75)';
    const yaw = Math.atan2(-f.x, -f.z);
    for (let p = -80; p <= 80; p += 10) {
      if (p === 0) continue;
      const t = p * DEG, cp = Math.cos(t);
      const dir = _c.set(-Math.sin(yaw) * cp, Math.sin(t), -Math.cos(yaw) * cp);
      if (!R.project(_b.copy(R.cam.pos).addS(dir, 1000), P) || !P.on) continue;
      const side = _d.set(Math.cos(yaw), 0, -Math.sin(yaw));
      const P2 = this.tmp2; if (!R.project(_b.copy(R.cam.pos).addS(dir, 1000).addS(side, 40), P2)) continue;
      const dx = P2.x - P.x, dy = P2.y - P.y, l = Math.hypot(dx, dy) || 1, ux = dx / l, uy = dy / l;
      c.beginPath(); c.moveTo(P.x - ux * 70, P.y - uy * 70); c.lineTo(P.x - ux * 25, P.y - uy * 25); c.moveTo(P.x + ux * 25, P.y + uy * 25); c.lineTo(P.x + ux * 70, P.y + uy * 70);
      if (p < 0) c.setLineDash([6, 5]); this.stroke(g, 1); c.setLineDash([]);
      this.text(String(p), P.x + ux * 82, P.y + uy * 82, 10, g, 'center');
    }
  },
  gunTarget(me) {
    let best = null, bs = 1e9; const f = me.fwd(_c);
    for (const t of Game.planes) {
      if (t === me || !t.alive || t.wreck || (me.team && t.team === me.team)) continue;
      const d = _d.subV(t.pos, me.pos), dist = d.len(); if (dist > 1600) continue;
      const ang = Math.acos(clamp(d.dot(f) / (dist || 1), -1, 1)); if (ang > 30 * DEG) continue;
      const s = ang * 1000 + dist * 0.2; if (s < bs) { bs = s; best = t; }
    }
    return best;
  },
  // 0 = nobody, 1 = an enemy is locking me, 2 = an enemy has a lock on me
  lockedBy(me) {
    let s = 0;
    for (const p of Game.planes) {
      if (p === me || !p.alive || p.wreck || (me.team && p.team === me.team)) continue;
      if (p.local) { if (p.lock.t === me) s = Math.max(s, p.lock.locked ? 2 : 1); }
      else if (p.rLockKey === me.key) s = Math.max(s, p.rLockState);
    }
    return s;
  },
  incoming(me) {
    const out = { n: 0, d: 1e9, list: [] };
    for (const m of W.missiles) {
      if (!m.alive) continue;
      const tk = m.local ? (m.target && !m.target.flare ? m.target.key : '') : m.targetKey;
      if (tk !== me.key) continue;
      const d = m.pos.dist(me.pos); if (d > 9000) continue;
      out.n++; out.d = Math.min(out.d, d); out.list.push(m);
    }
    return out;
  },
  drawTargets(now, small) {
    const c = this.c, me = Game.me, P = this.tmp;
    const offs = [];
    for (const t of Game.planes) {
      if (t === me || !t.alive || t.wreck) continue;
      const ally = me.team && t.team === me.team;
      // enemies only get a box when my radar or eyes pick them up
      if (!ally && !(me.alive ? W.detects(me, t) : R.cam.pos.dist(t.pos) < 3000)) continue;
      const col = ally ? this.ally : this.foe;
      const dist = R.cam.pos.dist(t.pos);
      if (!R.project(t.pos, P) || !P.on) { if (!ally) offs.push([t, dist]); continue; }
      const ppu = R.cssH / (2 * Math.tan(R.cam.fov / 2));
      const px = Math.max(10, t.model.radius * 0.8 / Math.max(1, P.w) * ppu);
      const s = Math.min(px, 60), x = P.x, y = P.y;
      const lockT = me.lock.t === t;
      c.beginPath();
      if (ally) { c.moveTo(x, y - s); c.lineTo(x + s * 0.8, y); c.lineTo(x, y + s); c.lineTo(x - s * 0.8, y); c.closePath(); }
      else { const k = s * 0.45; c.moveTo(x - s, y - s + k); c.lineTo(x - s, y - s); c.lineTo(x - s + k, y - s); c.moveTo(x + s - k, y - s); c.lineTo(x + s, y - s); c.lineTo(x + s, y - s + k); c.moveTo(x + s, y + s - k); c.lineTo(x + s, y + s); c.lineTo(x + s - k, y + s); c.moveTo(x - s + k, y + s); c.lineTo(x - s, y + s); c.lineTo(x - s, y + s - k); }
      this.stroke(col, 1.4);
      if (dist < 20000) {
        const lab = (dist < 1000 ? Math.round(dist) + ' m' : (dist / 1000).toFixed(1) + ' km');
        this.text(t.name, x, y - s - 12, small ? 10 : 11, col, 'center');
        this.text(lab, x, y + s + 11, 10, col, 'center');
      }
      if (lockT && me.alive) {
        const L = me.lock;
        if (L.locked) {
          c.beginPath(); c.moveTo(x, y - s - 9); c.lineTo(x + s + 9, y); c.lineTo(x, y + s + 9); c.lineTo(x - s - 9, y); c.closePath(); this.stroke(this.foe, 2.4);
          this.text('LOCK ' + (L.w ? L.w.short : ''), x + s + 14, y - s - 4, 12, this.foe, 'left');
          AU.setLock(2);
        } else {
          const r = lerp(s + 60, s + 9, L.p);
          c.beginPath(); c.arc(x, y, r, 0, TAU); this.stroke('rgba(255,207,74,0.9)', 1.4);
          AU.setLock(1);
        }
      }
    }
    if (!me.lock.t || !me.alive) AU.setLock(0);
    offs.sort((a, b) => a[1] - b[1]);
    for (const [t] of offs.slice(0, 4)) this.edgeArrow(t.pos, this.foe, 9, now);
  },
  edgeArrow(p, color, size, now) {
    const c = this.c, W = this.W, H = this.H;
    const v = _b.subV(p, R.cam.pos).irot(R.cam.q);
    let ax = v.x, ay = -v.y; const l = Math.hypot(ax, ay) || 1; ax /= l; ay /= l;
    const m = 34, cx = W / 2, cy = H / 2;
    const k = Math.min((W / 2 - m) / Math.abs(ax || 1e-6), (H / 2 - m) / Math.abs(ay || 1e-6));
    const x = cx + ax * k, y = cy + ay * k, a = Math.atan2(ay, ax);
    c.beginPath(); c.moveTo(x + Math.cos(a) * size, y + Math.sin(a) * size);
    c.lineTo(x + Math.cos(a + 2.5) * size * 0.8, y + Math.sin(a + 2.5) * size * 0.8);
    c.lineTo(x + Math.cos(a - 2.5) * size * 0.8, y + Math.sin(a - 2.5) * size * 0.8); c.closePath();
    c.fillStyle = color; c.fill();
  },
  drawRadar(now, small) {
    const c = this.c, me = Game.me, H = this.H;
    const Pm = me.perf, range = Math.max(4000, Math.min(12000, Math.ceil((Pm.radar || Pm.detect) / 1000) * 1000));
    const R0 = small ? 46 : 70, x = 14 + R0, y = small ? 64 + R0 : H - 20 - R0;
    c.fillStyle = 'rgba(10,18,14,0.45)'; c.beginPath(); c.arc(x, y, R0, 0, TAU); c.fill();
    c.beginPath(); c.arc(x, y, R0, 0, TAU); c.moveTo(x + R0 / 2, y); c.arc(x, y, R0 / 2, 0, TAU); this.stroke('rgba(141,255,176,0.5)', 1);
    // radar scan cone and the all-round detection ring
    if (Pm.radar) {
      const rr = R0 * Math.min(1, Pm.radar / range);
      c.beginPath(); c.moveTo(x, y); c.arc(x, y, rr, -Math.PI / 2 - Pm.scan, -Math.PI / 2 + Pm.scan); c.closePath();
      c.fillStyle = 'rgba(141,255,176,0.08)'; c.fill(); this.stroke('rgba(141,255,176,0.35)', 1);
    }
    c.beginPath(); c.arc(x, y, R0 * Math.min(1, Pm.detect / range), 0, TAU); c.setLineDash([2, 4]); this.stroke('rgba(141,255,176,0.35)', 1); c.setLineDash([]);
    const f = Game.view.fwd(_a), yaw = Math.atan2(f.x, -f.z), cs = Math.cos(yaw), sn = Math.sin(yaw);
    const to = (px, pz) => { const dx = px - Game.view.pos.x, dz = pz - Game.view.pos.z; const rx = dx * cs + dz * sn, rz = -dx * sn + dz * cs; return [x + rx / range * R0, y + rz / range * R0]; };
    // combat-area boundary
    c.save(); c.beginPath(); c.arc(x, y, R0, 0, TAU); c.clip();
    c.beginPath(); const B = WORLD.B; const p0 = to(-B, -B), p1 = to(B, -B), p2 = to(B, B), p3 = to(-B, B);
    c.moveTo(p0[0], p0[1]); c.lineTo(p1[0], p1[1]); c.lineTo(p2[0], p2[1]); c.lineTo(p3[0], p3[1]); c.closePath(); c.setLineDash([4, 4]); this.stroke('rgba(255,207,74,0.6)', 1); c.setLineDash([]);
    for (const t of Game.planes) {
      if (t === Game.view || !t.alive || t.wreck) continue;
      const ally = me.team && t.team === me.team;
      if (!ally && me.alive && !W.detects(me, t)) continue;
      const [px, py] = to(t.pos.x, t.pos.z);
      c.fillStyle = ally ? this.ally : this.foe;
      const dy = t.pos.y - Game.view.pos.y;
      c.beginPath(); if (dy > 300) { c.moveTo(px, py - 4); c.lineTo(px + 4, py + 3); c.lineTo(px - 4, py + 3); } else if (dy < -300) { c.moveTo(px, py + 4); c.lineTo(px + 4, py - 3); c.lineTo(px - 4, py - 3); } else c.arc(px, py, 3, 0, TAU);
      c.fill();
    }
    for (const m of W.missiles) { if (!m.alive) continue; const [px, py] = to(m.pos.x, m.pos.z); c.fillStyle = '#ffffff'; c.fillRect(px - 1.5, py - 1.5, 3, 3); }
    c.restore();
    c.beginPath(); c.moveTo(x, y - 5); c.lineTo(x + 4, y + 4); c.lineTo(x - 4, y + 4); c.closePath(); c.fillStyle = this.col; c.fill();
    this.text((range / 1000) + ' km', x, y + R0 + 10, 9, 'rgba(141,255,176,0.7)', 'center');
  },
  drawFeed(now, small) {
    const W = this.W; let y = small ? 64 : 88;
    for (const f of Game.feed) {
      const age = now - f.t; if (age > 7000) continue;
      const a = age > 6000 ? 1 - (age - 6000) / 1000 : 1;
      this.c.globalAlpha = a;
      const x = W - 16;
      const parts = f.k ? [[f.v, f.vc], [`  ${f.w}  `, '#d8dcd9'], [f.k, f.kc]] : [[f.v, f.vc], [`  ${f.w}`, '#d8dcd9']];
      let xx = x; this.c.font = `${small ? 11 : 12}px ${this.font}`;
      for (const [s, col] of parts) { this.text(s, xx, y, small ? 11 : 12, col, 'right'); xx -= this.c.measureText(s).width; }
      this.c.globalAlpha = 1;
      y += small ? 16 : 19;
    }
  },
  drawHurts(now) {
    const c = this.c, W = this.W, H = this.H;
    this.hurts = this.hurts.filter(h => now - h.t < 1300);
    for (const h of this.hurts) {
      const v = _b.subV(h.p, R.cam.pos).irot(R.cam.q);
      const a = Math.atan2(v.x, -v.z);
      const t = -Math.PI / 2 + a, r = Math.min(W, H) * 0.22, al = 1 - (now - h.t) / 1300;
      c.beginPath(); c.arc(W / 2, H / 2, r, t - 0.32, t + 0.32); this.stroke(`rgba(255,80,60,${al.toFixed(2)})`, 5);
    }
  },
};
