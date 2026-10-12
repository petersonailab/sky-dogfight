// ===================== match / session logic =====================
const WEAPON_NAME = ['機砲', '飛彈', '墜毀', '脫離戰區'];
const RESPAWN_MS = 4500;
const RELOAD_RAD = 7, RELOAD_IR = 7; // seconds to get one missile of each type back

const Game = {
  active: false, kind: '', planes: [], byKey: new Map(), me: null, view: null, brains: new Map(), bots: [],
  rules: { mode: 'ffa', lim: 10, era: 'jet', bots: 3, diff: 1 },
  round: 1, rstate: 'live', nextAt: 0, winner: '', feed: [], outT: 0, botT: 0, startedAt: 0,
  pendingAc: null,
  clear() {
    for (const pl of this.planes) pl.alive = false;
    this.planes = []; this.byKey.clear(); this.brains.clear(); this.bots = []; this.me = null; this.view = null;
    this.feed = []; W.clear(); FX.clear(); this.outT = 0;
  },
  start(kind, o = {}) {
    this.clear();
    const now = performance.now();
    this.kind = kind; this.active = true; this.startedAt = now;
    this.round = 1; this.rstate = 'live'; this.winner = '';
    if (kind === 'practice') this.rules = { mode: o.mode || 'ffa', lim: o.lim || 10, era: o.era || 'jet', bots: o.bots ?? 3, diff: o.diff ?? 1 };
    else this.rules = { mode: 'ffa', lim: 10, era: o.era || 'jet', bots: o.bots ?? 0, diff: 1 };
    WORLD.setEra(this.rules.era);
    const peer = kind === 'online' ? Net.myPeer : 'local';
    const me = new Plane({ key: peer + '.0', owner: peer, idx: 0, local: true, isMe: true, name: UI.prefs.name, color: UI.prefs.color, team: 0, ac: UI.selectedFor(this.rules.era) });
    this.me = me; this.view = me; this.addPlane(me);
    if (this.rules.mode === 'tdm') me.team = this.pickTeam(me); me.updateAccent();
    this.spawnLocal(me, now);
    if (kind === 'practice') this.syncBots(now, true);
  },
  stop() { this.clear(); this.active = false; this.kind = ''; },
  addPlane(pl) { if (this.byKey.has(pl.key)) this.removePlane(this.byKey.get(pl.key)); this.planes.push(pl); this.byKey.set(pl.key, pl); },
  removePlane(pl) {
    const i = this.planes.indexOf(pl); if (i >= 0) this.planes.splice(i, 1);
    if (this.byKey.get(pl.key) === pl) this.byKey.delete(pl.key);
    this.brains.delete(pl);
    for (const q of this.planes) if (q.lock.t === pl) { q.lock.t = null; q.lock.p = 0; q.lock.locked = false; }
    for (const m of W.missiles) if (m.target === pl) m.target = null;
  },
  rekey(oldPeer, newPeer) {
    for (const pl of this.planes) if (pl.local && pl.owner === oldPeer) {
      this.byKey.delete(pl.key); pl.owner = newPeer; pl.key = newPeer + '.' + pl.idx; this.byKey.set(pl.key, pl);
    }
  },
  localPlanes() { return this.planes.filter(p => p.local); },
  canFight() { return this.rstate === 'live'; },
  isAuthority(now) { return this.kind === 'practice' || (this.kind === 'online' && Net.settled(now) && Net.isHost(now)); },
  pickTeam(pl) {
    const n = [0, 0, 0], h = [0, 0, 0];
    for (const p of this.planes) if (p !== pl && p.team) { n[p.team]++; if (!p.bot) h[p.team]++; }
    if (!pl.bot && h[1] !== h[2]) return h[1] < h[2] ? 1 : 2;
    return n[1] < n[2] ? 1 : n[2] < n[1] ? 2 : (Math.random() < 0.5 ? 1 : 2);
  },
  // move one of my bots to the smaller team when the sides drift apart (players joining/leaving)
  balanceBots(now) {
    if (this.rules.mode !== 'tdm' || !this.bots.length) return;
    const n = [0, 0, 0]; for (const p of this.planes) if (p.team) n[p.team]++;
    if (Math.abs(n[1] - n[2]) < 2) return;
    const big = n[1] > n[2] ? 1 : 2, b = this.bots.find(x => x.team === big && !x.alive) || this.bots.find(x => x.team === big);
    if (!b) return;
    b.team = big === 1 ? 2 : 1; b.updateAccent();
    if (b.alive) this.spawnLocal(b, now);
  },
  teamScores() { const t = [0, 0, 0]; for (const p of this.planes) t[p.team] += p.kills; return t; },
  spawnLocal(pl, now) {
    const foes = this.planes.filter(p => p !== pl && p.alive && (!pl.team || p.team !== pl.team));
    if (pl === this.me) {
      const want = this.pendingAc || UI.selectedFor(this.rules.era);
      if (want && want !== pl.def) pl.setAircraft(want);
      this.pendingAc = null;
    } else if (pl.bot && pl.def.era !== this.rules.era) pl.setAircraft(randomAc(this.rules.era));
    const s = WORLD.spawn(this.rules.mode === 'tdm' ? pl.team : 0, foes);
    pl.spawn(s.pos, s.q, now);
    if (pl === this.me) { CAM.reset(); this.outT = 0; UI.spawned(); }
  },
  // ---------- bots (practice, or the online host) ----------
  syncBots(now, force) {
    if (!force && now - this.botT < 1000) return;
    this.botT = now;
    const auth = this.isAuthority(now);
    const want = auth ? clamp(this.rules.bots | 0, 0, 10) : 0;
    while (this.bots.length > want) { const b = this.bots.pop(); this.removePlane(b); }
    const peer = this.me ? this.me.owner : 'local';
    while (this.bots.length < want) {
      let idx = 1; while (this.bots.some(b => b.idx === idx)) idx++;
      const used = new Set(this.planes.map(p => p.name));
      const nm = BOT_NAMES.find(n => !used.has('AI ' + n)) || BOT_NAMES[idx % BOT_NAMES.length];
      const b = new Plane({ key: peer + '.' + idx, owner: peer, idx, local: true, bot: true, name: 'AI ' + nm, color: BOT_COLORS[idx % BOT_COLORS.length], ac: randomAc(this.rules.era) });
      if (this.rules.mode === 'tdm') b.team = this.pickTeam(b);
      b.updateAccent();
      this.bots.push(b); this.addPlane(b); this.brains.set(b, new Brain(b, this.rules.diff));
      this.spawnLocal(b, now);
    }
    for (const [, br] of this.brains) br.setSkill(this.rules.diff);
    if (auth) this.balanceBots(now);
  },
  // ---------- rules ----------
  setRules(r, now) { // local change by practice player or online host
    const reset = ('mode' in r && r.mode !== this.rules.mode) || ('era' in r && r.era !== this.rules.era);
    this.rules = Object.assign({}, this.rules, r);
    WORLD.setEra(this.rules.era);
    if (reset) {
      for (const p of this.localPlanes()) { p.team = this.rules.mode === 'tdm' ? this.pickTeam(p) : 0; p.updateAccent(); }
      this.beginRound(this.round + 1, now);
    }
    this.syncBots(now, true);
    UI.refreshPause();
  },
  matchPayload(now) {
    const R_ = this.rules;
    return [this.round, this.rstate === 'over' ? 1 : 0, R_.mode === 'tdm' ? 1 : 0, R_.lim, R_.era === 'prop' ? 1 : 0, R_.bots, R_.diff, Math.max(0, Math.round(this.nextAt - now)), this.winner];
  },
  applyMatch(m, now) {
    const mode = m[2] ? 'tdm' : 'ffa', era = m[4] ? 'prop' : 'jet';
    const changedMode = mode !== this.rules.mode, changedEra = era !== this.rules.era;
    this.rules = { mode, lim: clamp(num(m[3]) | 0, 1, 99), era, bots: clamp(num(m[5]) | 0, 0, 10), diff: clamp(num(m[6]) | 0, 0, 2) };
    WORLD.setEra(era);
    if (changedMode) for (const p of this.localPlanes()) { p.team = mode === 'tdm' ? this.pickTeam(p) : 0; p.updateAccent(); }
    if (changedEra && this.me) { UI.toast(era === 'prop' ? '房間是「二戰螺旋槳」時代，已換成螺旋槳戰機。' : '房間是「噴射機」時代，已換成噴射戰機。'); if (this.me.def.era !== era && this.me.alive) this.spawnLocal(this.me, now); }
    const rnd_ = num(m[0]) | 0;
    if (rnd_ !== this.round && rnd_ > 0) this.beginRound(rnd_, now);
    if (m[1] && this.rstate !== 'over') { this.rstate = 'over'; this.winner = cleanName(String(m[8] || '')) || '—'; this.nextAt = now + num(m[7]); UI.roundOver(); }
    else if (!m[1] && this.rstate === 'over') this.rstate = 'live';
    UI.refreshPause();
  },
  beginRound(n, now) {
    this.round = n; this.rstate = 'live'; this.winner = '';
    for (const p of this.localPlanes()) { p.kills = 0; p.deaths = 0; this.spawnLocal(p, now); }
    for (const m of W.missiles) if (m.local) m.alive = false;
    this.feed = [];
    UI.roundStart(n);
  },
  roundLogic(now) {
    if (!this.isAuthority(now)) return;
    if (this.rstate === 'live') {
      const lim = this.rules.lim; let win = '';
      if (this.rules.mode === 'tdm') { const t = this.teamScores(); if (t[1] >= lim) win = '藍隊'; else if (t[2] >= lim) win = '紅隊'; }
      else for (const p of this.planes) if (p.kills >= lim) { win = p.name; break; }
      if (win) { this.rstate = 'over'; this.winner = win; this.nextAt = now + 9000; UI.roundOver(); }
    } else if (now >= this.nextAt) this.beginRound(this.round + 1, now);
  },
  // ---------- damage ----------
  bulletHit(b, t, point, now) {
    FX.sparks(point, 5);
    const sh = b.owner;
    if (sh === this.me) { HUD.hitMark(now); AU.confirm(); }
    if (t.local) this.damageLocal(t, b.dmg, sh.key, 0, sh.pos, now);
    else { Net.recordHit(t, b.dmg, 0, sh); t.flash = 0.35; }
  },
  damageLocal(pl, dmg, attackerKey, weapon, fromPos, now) {
    if (!pl.alive || pl.wreck || pl.invuln(now) || !this.canFight()) return;
    const att = attackerKey ? this.byKey.get(attackerKey) : null;
    if (att && att !== pl && att.team && att.team === pl.team) return;
    pl.hp -= clamp(dmg, 0, 400); pl.flash = 0.6; pl.lastHitBy = attackerKey; pl.lastHitT = now;
    if (pl === this.me) { AU.hurt(); HUD.hurt(fromPos, now); CAM.shake(weapon === 1 ? 1 : 0.25); }
    if (pl.hp <= 0) this.killLocal(pl, attackerKey, weapon, now);
  },
  killLocal(pl, killerKey, weapon, now) {
    if (!pl.alive) return;
    pl.alive = false; pl.hp = 0; pl.deaths++; pl.respawnAt = now + RESPAWN_MS; pl.firing = false; pl.ctrl.gun = false;
    this.startWreck(pl, now, weapon < 2);
    const killer = killerKey ? this.byKey.get(killerKey) : null;
    if (killer && killer !== pl && killer.local && (!killer.team || killer.team !== pl.team)) { killer.kills++; if (killer === this.me) this.onMyKill(pl, weapon); }
    Net.recordDeath(pl, killerKey, weapon);
    this.pushFeed(killer, pl, weapon, killerKey);
    if (pl === this.me) UI.died(killer, weapon, now);
  },
  remoteDeath(victim, killerKey, weapon, pos, now) {
    if (victim && (victim.alive || !victim.wreck)) { if (pos && pos.lenSq() > 0) victim.pos.copy(pos); victim.alive = false; this.startWreck(victim, now, weapon < 2); }
    const killer = killerKey ? this.byKey.get(killerKey) : null;
    if (killer && victim && killer.local && killer !== victim && (!killer.team || killer.team !== victim.team)) { killer.kills++; if (killer === this.me) this.onMyKill(victim, weapon); }
    this.pushFeed(killer, victim, weapon, killerKey);
  },
  onMyKill(victim, weapon) { AU.kill(); UI.banner('擊落 ' + victim.name, WEAPON_NAME[weapon] || ''); },
  pushFeed(killer, victim, weapon, killerKey) {
    if (!victim) return;
    const col = p => (p.team ? TEAM_COL[p.team] : p.color);
    this.feed.unshift({ t: performance.now(), k: killer ? killer.name : '', kc: killer ? col(killer) : '#fff', v: victim.name, vc: col(victim), w: WEAPON_NAME[weapon] || '', me: (killer === this.me || victim === this.me) });
    if (this.feed.length > 6) this.feed.pop();
  },
  startWreck(pl, now, boom) {
    pl.wreck = { t: 0, vel: pl.vel.clone(), spin: new V3(rnd(-2.5, 2.5), rnd(-1, 1), rnd(-3.5, 3.5)), done: false };
    if (pl.wreck.vel.len() > 260) pl.wreck.vel.scale(260 / pl.wreck.vel.len());
    if (boom !== false) FX.explosion(pl.pos, 1, pl.vel);
    if (this.view) AU.boom(pl.pos.dist(this.view.pos), true);
  },
  updateWreck(pl, dt) {
    const w = pl.wreck; if (w.done) return;
    w.t += dt; w.vel.scale(Math.exp(-0.3 * dt)); w.vel.y -= 9.81 * dt;
    pl.pos.addS(w.vel, dt);
    _q.fromRotVec(w.spin.x * dt, w.spin.y * dt, w.spin.z * dt); pl.q.mul(_q).norm();
    if (Math.random() < 0.8) FX.emit(pl.pos.x, pl.pos.y, pl.pos.z, rnd(-3, 3), rnd(-2, 4), rnd(-3, 3), rnd(2.5, 4), 4, 16, 0.1, 0.1, 0.1, 0.7, 0.7, -3, 0);
    FX.emit(pl.pos.x, pl.pos.y, pl.pos.z, rnd(-4, 4), rnd(-4, 4), rnd(-4, 4), 0.35, 4, 2, 1, 0.55, 0.15, 0.95, 0.5, 0, 1);
    const g = WORLD.groundAt(pl.pos.x, pl.pos.z);
    if (pl.pos.y < g + 1.5 || w.t > 14) {
      w.done = true; pl.pos.y = Math.max(pl.pos.y, g);
      FX.explosion(pl.pos, 1.2); if (g <= 0.5) FX.splash(pl.pos, true);
      if (this.view) AU.boom(pl.pos.dist(this.view.pos), true);
    }
  },
  // ---------- per-frame ----------
  update(dt, now) {
    if (!this.active) return;
    for (const [, br] of this.brains) br.update(dt, now);
    for (const pl of this.planes) {
      if (pl.local) {
        if (pl.alive) this.stepLocal(pl, dt, now);
        else if ((!pl.wreck || pl.wreck.done || pl.wreck.t > 3) && now >= pl.respawnAt && (pl !== this.me || UI.autoRespawn())) this.spawnLocal(pl, now);
      } else if (pl.alive && !pl.wreck) {
        pl.remoteUpdate(now, dt);
        W.guns(pl, dt, now, true);
      }
      if (pl.wreck) this.updateWreck(pl, dt);
      pl.visual(dt, now);
    }
    W.updateBullets(dt, now); W.updateMissiles(dt, now); W.updateFlares(dt);
    this.roundLogic(now);
    if (this.kind === 'practice' || this.kind === 'online') this.syncBots(now, false);
    if (this.kind === 'online') Net.tick(now);
  },
  stepLocal(pl, dt, now) {
    const d = pl.def;
    pl.mslCd = Math.max(0, pl.mslCd - dt); pl.flareCdT = Math.max(0, pl.flareCdT - dt); pl.flareT = Math.max(0, pl.flareT - dt);
    // spent missiles come back one at a time (radar every 20 s, IR every 15 s)
    if (d.wR && pl.mR < d.wR.n) { pl.reloadR += dt; if (pl.reloadR >= RELOAD_RAD) { pl.mR++; pl.reloadR = 0; } }
    if (d.wI && pl.mI < d.wI.n) { pl.reloadI += dt; if (pl.reloadI >= RELOAD_IR) { pl.mI++; pl.reloadI = 0; } }
    if (pl.ctrl.swap) {
      pl.ctrl.swap = false;
      const other = pl.wsel === 'ir' ? 'rad' : 'ir';
      if (other === 'ir' ? d.wI : d.wR) { pl.wsel = other; if (pl === this.me) AU.click(); }
    }
    const n = Math.max(1, Math.ceil(dt / 0.02));
    for (let i = 0; i < n; i++) pl.physics(dt / n);
    W.updateLock(pl, dt, now);
    W.guns(pl, dt, now, false);
    if (pl.ctrl.msl) { pl.ctrl.msl = false; W.fire(pl, now); }
    if (pl.ctrl.flare) { pl.ctrl.flare = false; W.dropFlares(pl, now); }
    // terrain / sea
    const g = WORLD.groundAt(pl.pos.x, pl.pos.z);
    if (pl.pos.y < g + 2.5) {
      pl.pos.y = g + 2;
      if (g <= 0.5) FX.splash(pl.pos, true);
      const recent = now - pl.lastHitT < 12000 ? pl.lastHitBy : null;
      this.killLocal(pl, recent, 2, now);
      return;
    }
    // combat area
    const out = Math.abs(pl.pos.x) > WORLD.B || Math.abs(pl.pos.z) > WORLD.B;
    if (out) { pl.outT = (pl.outT || 0) + dt; if (pl.outT > 6) { pl.outT = 0; this.killLocal(pl, null, 3, now); } }
    else pl.outT = 0;
  },
};
const BOT_COLORS = ['#d9a441', '#7c9bd6', '#c46a6a', '#77b37e', '#b48fd0', '#d68a4c', '#5fb3b3', '#cfcf6a', '#a3a3a3', '#e07fa8', '#6d8fbf'];
function randomAc(era) { const list = AC_DEFS.filter(d => d.era === era); return pick(list); }
