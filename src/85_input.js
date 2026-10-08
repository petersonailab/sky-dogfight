// ===================== input + camera =====================
const Input = {
  keys: Object.create(null), mx: 0, my: 0, mouseIn: false, lmb: false, rmbEdge: false,
  locked: false, lockFailed: false, aimYaw: 0, aimPitch: 0, aimDir: new V3(0, 0, -1), aimInit: false,
  touch: false, stick: { id: -1, ox: 0, oy: 0, x: 0, y: 0 }, tGun: false, tAB: false, thrT: 0.85,
  edge: Object.create(null), scheme: 'mouse',
  init() {
    const cv = R.cv;
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'SELECT')) return;
      if (!Game.active) return;
      if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab'].includes(e.code)) e.preventDefault();
      if (!this.keys[e.code]) this.edge[e.code] = true;
      this.keys[e.code] = true;
      if (e.code === 'Escape' || e.code === 'KeyP') UI.togglePause();
      if (e.code === 'KeyM') UI.toggleMute();
      if (e.code === 'KeyV') CAM.toggle();
    });
    window.addEventListener('keyup', e => { this.keys[e.code] = false; });
    window.addEventListener('blur', () => { this.keys = Object.create(null); this.lmb = false; });
    cv.addEventListener('mousemove', e => {
      this.mouseIn = true;
      if (this.locked) {
        const s = UI.prefs.sens * 0.0021, inv = UI.prefs.invert ? -1 : 1;
        this.aimYaw -= e.movementX * s; this.aimPitch = clamp(this.aimPitch - e.movementY * s * inv, -1.48, 1.48);
      } else { this.mx = e.clientX; this.my = e.clientY; }
    });
    cv.addEventListener('mouseleave', () => { this.mouseIn = false; });
    cv.addEventListener('mousedown', e => {
      if (!Game.active || UI.paused) return;
      AU.init();
      if (e.button === 0) { this.lmb = true; if (!this.locked && this.scheme === 'mouse' && !this.lockFailed && !this.touch) this.requestLock(); }
      if (e.button === 2) this.rmbEdge = true;
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) this.lmb = false; });
    cv.addEventListener('contextmenu', e => e.preventDefault());
    // one switch per scroll gesture (trackpads send dozens of wheel events)
    cv.addEventListener('wheel', e => {
      if (!Game.active || UI.paused) return;
      e.preventDefault();
      const now = performance.now();
      if (Math.abs(e.deltaY) > 4 && now - (this.wheelT || 0) > 450) this.wheelEdge = true;
      this.wheelT = now;
    }, { passive: false });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === cv;
      if (this.locked) this.syncAim();
      if (was && !this.locked && Game.active && !UI.paused) UI.togglePause(true);
    });
    document.addEventListener('pointerlockerror', () => { this.lockFailed = true; });
    this.initTouch();
  },
  requestLock() {
    try {
      const r = R.cv.requestPointerLock && R.cv.requestPointerLock();
      if (r && r.catch) r.catch(() => { this.lockFailed = true; });
    } catch (e) { this.lockFailed = true; }
  },
  releaseLock() { if (document.pointerLockElement) { try { document.exitPointerLock(); } catch (e) { /* ignore */ } } },
  syncAim() {
    const pl = Game.me; if (!pl) return;
    const f = pl.fwd(_a);
    this.aimYaw = Math.atan2(-f.x, -f.z); this.aimPitch = Math.asin(clamp(f.y, -1, 1));
  },
  takeEdge(code) { const v = !!this.edge[code]; this.edge[code] = false; return v; },
  // fill the player's controls
  apply(pl, dt, now) {
    const c = pl.ctrl, K = this.keys, inv = UI.prefs.invert ? -1 : 1;
    let kp = 0, kr = 0, ky = 0;
    if (K.ArrowUp) kp -= 1 * inv; if (K.ArrowDown) kp += 1 * inv;
    if (K.ArrowLeft) kr -= 1; if (K.ArrowRight) kr += 1;
    if (K.KeyA) ky -= 1; if (K.KeyD) ky += 1;
    if (K.KeyW) c.thr = Math.min(1, c.thr + dt * 0.6);
    if (K.KeyS) c.thr = Math.max(0.15, c.thr - dt * 0.6);
    const keyStick = kp !== 0 || kr !== 0;
    const ts = this.stick;
    if (this.touch && ts.id >= 0) {
      const p = clamp(ts.y / 60, -1, 1) * inv, r = clamp(ts.x / 60, -1, 1);
      c.pitch = Math.sign(p) * p * p; c.roll = Math.sign(r) * Math.abs(r) ** 1.5; c.yaw = 0;
      this.syncAim();
    } else if (keyStick || this.scheme === 'keys' || this.touch) {
      c.pitch = kp; c.roll = kr; c.yaw = ky;
      if (!kr && !this.touch && Math.abs(c.roll) < 0.01) { const right = pl.right(_a); if (Math.abs(right.y) < 0.5) c.roll = clamp(right.y * 1.2, -0.35, 0.35); }
      if (this.touch && ts.id < 0) { const right = pl.right(_a); c.roll = clamp(right.y * 1.4, -0.5, 0.5); c.pitch = 0; }
      this.syncAim();
    } else {
      let dir = null;
      if (this.locked) {
        const cp = Math.cos(this.aimPitch);
        dir = this.aimDir.set(-Math.sin(this.aimYaw) * cp, Math.sin(this.aimPitch), -Math.cos(this.aimYaw) * cp);
      } else if (this.mouseIn) {
        dir = this.cursorRay(this.mx, this.my, this.aimDir);
      }
      if (dir) {
        const tgt = _b.copy(this.locked ? pl.pos : CAM.pos).addS(dir, 1800);
        steerTo(pl, tgt, c, 1);
        if (ky) c.yaw = ky;
      } else { c.pitch = 0; c.yaw = ky; const right = pl.right(_a); c.roll = clamp(right.y * 1.5, -0.5, 0.5); }
    }
    c.ab = !!(K.ShiftLeft || K.ShiftRight || this.tAB);
    if (this.touch) c.thr = this.thrT;
    c.gun = !!(K.Space || this.lmb || this.tGun);
    if (this.takeEdge('KeyF') || this.rmbEdge) c.msl = true;
    if (this.takeEdge('KeyE') || this.takeEdge('KeyX')) c.flare = true;
    if (this.takeEdge('KeyQ') || this.wheelEdge) c.swap = true;
    this.wheelEdge = false;
    this.rmbEdge = false;
  },
  // world direction through a screen point (CSS px)
  cursorRay(x, y, out) {
    const nx = (x / R.cssW) * 2 - 1, ny = 1 - (y / R.cssH) * 2;
    const m = R.cam.ivp;
    const px = m[0] * nx + m[4] * ny + m[8] + m[12], py = m[1] * nx + m[5] * ny + m[9] + m[13], pz = m[2] * nx + m[6] * ny + m[10] + m[14], pw = m[3] * nx + m[7] * ny + m[11] + m[15];
    const c = R.cam.pos;
    const dx = px / pw - c.x, dy = py / pw - c.y, dz = pz / pw - c.z, l = Math.hypot(dx, dy, dz) || 1;
    // dead zone near the screen centre keeps the aircraft flying straight
    const cx = R.cssW / 2, cy = R.cssH * 0.47, dist = Math.hypot(x - cx, y - cy);
    if (dist < 18) { const f = Game.me.fwd(_c); return out.copy(f); }
    return out.set(dx / l, dy / l, dz / l);
  },
  initTouch() {
    const coarse = matchMedia('(pointer: coarse)').matches;
    this.touch = coarse;
    if (coarse) this.scheme = 'touch';
    const area = $('stickArea'), knob = $('stickKnob'), base = $('stickBase');
    if (!area) return;
    const S = this.stick;
    area.addEventListener('pointerdown', e => {
      if (S.id >= 0) return; AU.init();
      S.id = e.pointerId; S.ox = e.clientX; S.oy = e.clientY; S.x = 0; S.y = 0;
      area.setPointerCapture(e.pointerId);
      base.style.left = (e.clientX - 60) + 'px'; base.style.top = (e.clientY - 60) + 'px'; base.hidden = false;
      knob.style.transform = 'translate(0px,0px)';
    });
    const move = e => { if (e.pointerId !== S.id) return; S.x = clamp(e.clientX - S.ox, -60, 60); S.y = clamp(e.clientY - S.oy, -60, 60); knob.style.transform = `translate(${S.x}px,${S.y}px)`; };
    const end = e => { if (e.pointerId !== S.id) return; S.id = -1; S.x = S.y = 0; base.hidden = true; };
    area.addEventListener('pointermove', move); area.addEventListener('pointerup', end); area.addEventListener('pointercancel', end);
    const hold = (id, on, off) => { const el = $(id); if (!el) return;
      el.addEventListener('pointerdown', e => { e.preventDefault(); AU.init(); el.setPointerCapture(e.pointerId); el.classList.add('on'); on(); });
      const up = () => { el.classList.remove('on'); if (off) off(); };
      el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); };
    hold('tGun', () => { this.tGun = true; }, () => { this.tGun = false; });
    hold('tMsl', () => { if (Game.me) Game.me.ctrl.msl = true; });
    hold('tFlare', () => { if (Game.me) Game.me.ctrl.flare = true; });
    hold('tSwap', () => { if (Game.me) Game.me.ctrl.swap = true; });
    hold('tAB', () => { this.tAB = true; }, () => { this.tAB = false; });
    const thr = $('tThr');
    if (thr) thr.addEventListener('input', () => { this.thrT = clamp(Number(thr.value) / 100, 0.15, 1); });
  },
};

const CAM = {
  mode: 0, pos: new V3(0, 300, 0), q: new Q(), shakeA: 0, upS: new V3(0, 1, 0), fov: 66, deadT: 0,
  toggle() { this.mode = (this.mode + 1) % 2; UI.toast(this.mode ? '座艙視角' : '追蹤視角'); },
  shake(a) { if (!UI.prefs.reduceMotion) this.shakeA = Math.min(1.5, this.shakeA + a); },
  reset() { const pl = Game.view; if (!pl) return; this.q.copy(pl.q); this.upS.set(0, 1, 0); this.place(pl, 1, 1 / 60); },
  place(pl, k, dt) {
    const rad = pl.model.radius, D = rad * 1.9 + 9, H = rad * 0.42 + 2.2;
    const back = Input.keys.KeyC;
    if (this.mode === 1 && pl.alive && pl === Game.me) {
      this.q.copy(pl.q); if (back) this.q.mul(_q.axisAngle(0, 1, 0, Math.PI));
      this.pos.set(0, pl.model.length > 12 ? 0.95 : 0.7, -pl.model.length * 0.24).rot(pl.q).add(pl.pos);
      return;
    }
    if (Input.locked && pl === Game.me && pl.alive && !back) {
      const d = Input.aimDir;
      const cp = Math.cos(Input.aimPitch);
      d.set(-Math.sin(Input.aimYaw) * cp, Math.sin(Input.aimPitch), -Math.cos(Input.aimYaw) * cp);
      this.upS.set(0, 1, 0);
      const target = _a.copy(pl.pos).addS(d, -D).addS(this.upS, H * 1.1);
      this.pos.lerp(target, k);
      this.q.lookDir(_b.copy(pl.pos).addS(d, 120).sub(this.pos).norm(), this.upS);
      return;
    }
    _q2.copy(pl.q); if (back) _q2.mul(_q.axisAngle(0, 1, 0, Math.PI));
    this.q.slerp(_q2, clamp(dt * 6.5, 0, 1));
    const off = _a.set(0, H, D).rot(this.q);
    this.pos.copy(pl.pos).add(off);
    if (back) this.q.copy(_q2);
  },
  update(dt, now) {
    const G = Game, pl = G.view;
    if (!pl) return;
    if (G.me && !G.me.alive) {
      this.deadT += dt;
      const p = G.me.wreck && !G.me.wreck.done ? G.me.pos : G.me.pos;
      const a = now * 0.00012, r = 60 + Math.min(this.deadT, 4) * 25;
      const target = _a.set(p.x + Math.cos(a) * r, p.y + 25 + this.deadT * 6, p.z + Math.sin(a) * r);
      this.pos.lerp(target, clamp(dt * 2, 0, 1));
      this.q.lookDir(_b.copy(p).sub(this.pos).norm(), _c.set(0, 1, 0));
    } else {
      this.deadT = 0;
      this.place(pl, clamp(dt * 14, 0, 1), dt);
    }
    // ground clamp
    const g = WORLD.groundAt(this.pos.x, this.pos.z) + 3;
    if (this.pos.y < g) this.pos.y = g;
    if (this.shakeA > 0.001) {
      const s = this.shakeA * 0.6;
      this.pos.x += rnd(-s, s); this.pos.y += rnd(-s, s); this.pos.z += rnd(-s, s);
      this.shakeA *= Math.exp(-dt * 5);
    }
    const sp = pl.alive ? clamp((pl.speed - pl.perf.vc) / (pl.perf.vab - pl.perf.vc), 0, 1) : 0;
    const wantFov = 64 + sp * 8 + (pl.alive && pl.abOn ? 3 : 0);
    this.fov += (wantFov - this.fov) * clamp(dt * 2, 0, 1);
    const C = R.cam; C.pos.copy(this.pos); C.q.copy(this.q); C.fov = this.fov * DEG; C.near = this.mode === 1 ? 0.3 : 1.2; C.far = 70000; C.ox = 0; C.oy = 0;
  },
};
