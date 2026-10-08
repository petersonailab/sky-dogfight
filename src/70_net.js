// ===================== multiplayer core =====================
// Two transports carry the same messages:
//  * 'claude': the `room` capability when the page runs as a Claude artifact (state lives in presence)
//  * 'web':    WebNet (public MQTT relay + WebRTC direct links) everywhere else, e.g. GitHub Pages
// Each player sends absolute state ~20x/s; short-lived event rings (hits, deaths, flares,
// detonations) ride along with ids so receivers can de-duplicate.
const PROTO = 4;
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const RING_TTL = 3200;

const Net = {
  kind: 'none', api: null, game: null, viaLobby: false, status: 'checking', connected: true,
  code: '', myPeer: 'local', joinedAt: 0, inRoom: false,
  peers: new Map(), rooms: [], beacons: new Map(),
  sendT: 0, lobbyT: 0, lastLobbyJSON: '', roomsJSON: '',
  rings: { H: [], D: [], F: [], X: [] }, seq: 0,
  unsub: [],
  newCode() { let s = ''; for (let i = 0; i < 4; i++) s += CODE_CHARS[(Math.random() * CODE_CHARS.length) | 0]; return s; },
  cleanCode(c) { return String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6); },
  async init() {
    const C = window.claude;
    if (C && typeof C.use === 'function') {
      let api = null;
      try { api = await C.use('room'); } catch (e) { api = null; }
      if (api) {
        this.kind = 'claude'; this.api = api; this.status = 'ready';
        try {
          api.onPeers(ch => this.onLobby(ch), e => this.onErr(e));
          api.onConnection(c => { if (!this.viaLobby || !this.inRoom) { this.connected = c; UI.netStatus(); } }, e => this.onErr(e));
        } catch (e) { this.status = 'offline'; }
        UI.netStatus();
        return;
      }
    }
    if (typeof WebSocket === 'undefined') { this.status = 'offline'; UI.netStatus(); return; }
    this.kind = 'web'; this.status = 'checking'; this.myPeer = WebNet.id;
    WebNet.start(this);
    setTimeout(() => { if (this.kind === 'web' && !WebNet.readyCount()) { this.status = 'offline'; UI.netStatus(); } }, 9000);
    setInterval(() => { if (this.kind === 'web') this.rebuildRooms(performance.now()); }, 1500);
    UI.netStatus();
  },
  onErr(e) {
    const code = e && e.code;
    if (['revoked', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error'].includes(code)) {
      this.status = 'offline'; this.connected = false; UI.netStatus();
      if (Game.kind === 'online') UI.toast('多人連線已中斷，目前只能單人飛行。');
    }
  },
  setMyPeer(p) {
    if (!p || p === this.myPeer) return;
    const old = this.myPeer; this.myPeer = p;
    if (Game.active && Game.kind === 'online') Game.rekey(old, p);
  },
  meFrom(peers) { for (const p of peers) if (p.sameTab && p.kind !== 'agent') return p.peer; return null; },
  // ---------- web transport callbacks ----------
  webStatus() {
    const n = WebNet.readyCount();
    if (n) this.status = 'ready';
    else if (this.status === 'ready') this.status = WebNet.everReady() ? 'reconnecting' : 'checking';
    this.connected = n > 0 || [...WebNet.links.values()].some(L => L.open);
    UI.netStatus();
  },
  webState(peer, P, now, tLocal, lat) {
    if (!this.inRoom || !P || typeof P !== 'object' || P.v !== PROTO || !P.g || typeof P.g !== 'object') return;
    if (this.cleanCode(P.rc) !== this.code) return;
    let st = this.peers.get(peer);
    if (!st) { st = this.newPeer(peer, now, false); this.peers.set(peer, st); }
    try { this.ingest(st, P, now, tLocal, lat); } catch (e) { console.warn('bad state from peer', e); }
    UI.refreshRoster();
  },
  webGone(peer) {
    const st = this.peers.get(peer);
    if (st) { this.drop(peer, st); this.peers.delete(peer); UI.refreshRoster(); }
  },
  webBeacon(peer, B, now) {
    if (!B || typeof B !== 'object') return;
    const code = this.cleanCode(B.rc); if (!code) return;
    this.beacons.set(peer, { code, h: !!B.h, n: cleanName(B.n), era: B.era === 'prop' ? 'prop' : 'jet', mode: B.mo === 'tdm' ? 'tdm' : 'ffa', np: clamp(num(B.np) | 0, 1, 16), at: now });
    this.rebuildRooms(now);
  },
  rebuildRooms(now) {
    const rooms = new Map();
    for (const [peer, b] of this.beacons) {
      if (now - b.at > 6500) { this.beacons.delete(peer); continue; }
      let r = rooms.get(b.code);
      if (!r) rooms.set(b.code, r = { code: b.code, n: 0, host: '', era: b.era, mode: b.mode });
      r.n = Math.max(r.n + 1, b.np);
      if (b.h) { r.host = b.n; r.era = b.era; r.mode = b.mode; }
    }
    const list = [...rooms.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    const s = JSON.stringify(list);
    if (s !== this.roomsJSON) { this.roomsJSON = s; this.rooms = list; UI.renderRooms(); }
  },
  // ---------- Claude room: lobby list of open rooms ----------
  onLobby(ch) {
    this.setMyPeer(this.meFrom(ch.peers));
    const rooms = new Map();
    for (const p of ch.peers) {
      const P = p.presence;
      if (p.sameTab || p.kind === 'agent' || !P || P.v !== PROTO || typeof P.rc !== 'string' || !P.rc) continue;
      const code = this.cleanCode(P.rc); if (!code) continue;
      let r = rooms.get(code);
      if (!r) rooms.set(code, r = { code, n: 0, host: '', era: P.era === 'prop' ? 'prop' : 'jet', mode: P.mo === 'tdm' ? 'tdm' : 'ffa' });
      r.n++;
      if (P.h) { r.host = cleanName(P.n); r.era = P.era === 'prop' ? 'prop' : 'jet'; r.mode = P.mo === 'tdm' ? 'tdm' : 'ffa'; }
    }
    this.rooms = [...rooms.values()].sort((a, b) => b.n - a.n).slice(0, 8);
    UI.renderRooms();
    if (this.viaLobby && this.inRoom) this.onGame(ch);
  },
  async join(code) {
    if (this.kind === 'web') {
      if (!WebNet.readyCount()) return false;
      await this.leave();
      this.code = code; this.inRoom = true; this.joinedAt = performance.now();
      this.peers.clear(); this.rings = { H: [], D: [], F: [], X: [] };
      WebNet.joinRoom(code);
      return true;
    }
    if (!this.api) return false;
    await this.leave();
    this.code = code; this.inRoom = true; this.joinedAt = performance.now();
    this.peers.clear(); this.rings = { H: [], D: [], F: [], X: [] };
    let room = null;
    try { room = await this.api.join('df-' + code.toLowerCase()); } catch (e) { room = null; }
    if (!this.inRoom || this.code !== code) { if (room) room.leave().catch(() => {}); return false; }
    if (room) {
      this.game = room; this.viaLobby = false;
      try {
        this.unsub.push(room.onPeers(ch => this.onGame(ch), e => this.onRoomErr(e)));
        this.unsub.push(room.onConnection(c => { this.connected = c; UI.netStatus(); }, e => this.onRoomErr(e)));
      } catch (e) { this.game = null; }
    }
    if (!this.game) { this.game = this.api; this.viaLobby = true; }
    this.joinedAt = performance.now();
    this.pushLobby(performance.now(), true);
    return true;
  },
  onRoomErr(e) {
    if (e && e.code === 'not_permitted') { UI.toast('這個房間無法加入，請換一組代碼。'); return; }
    if (e && (e.code === 'upstream_error' || e.code === 'limit_reached') && this.inRoom) {
      UI.toast('房間連線中斷，正在重新加入…');
      const code = this.code; setTimeout(() => { if (this.inRoom && this.code === code) this.join(code); }, 1200);
      return;
    }
    this.onErr(e);
  },
  async leave() {
    if (this.kind === 'web') {
      WebNet.leaveRoom();
      for (const [peer, st] of this.peers) this.drop(peer, st);
      this.peers.clear(); this.inRoom = false; this.code = '';
      return;
    }
    for (const u of this.unsub) { try { u(); } catch (e) { /* already gone */ } }
    this.unsub = [];
    const g = this.game, via = this.viaLobby;
    this.game = null; this.inRoom = false; this.code = ''; this.viaLobby = false;
    for (const [peer, st] of this.peers) this.drop(peer, st);
    this.peers.clear();
    if (g && !via) { try { await g.leave(); } catch (e) { /* ignore */ } }
    if (via && this.api) { try { await this.api.presence({ g: null }); } catch (e) { /* ignore */ } }
    this.pushLobby(performance.now(), true);
  },
  newPeer(peer, now, guest) {
    return { peer, first: true, ents: new Map(), mis: new Set(), last: null, off: 0, recvAt: now, up: 0, h: 0, d: 0, f: 0, x: 0, name: '', color: '#9aa3a8', guest: !!guest };
  },
  // ---------- Claude room: game room ----------
  onGame(ch) {
    const now = performance.now();
    this.setMyPeer(this.meFrom(ch.peers));
    const present = new Set();
    for (const p of ch.peers) {
      if (p.sameTab || p.kind === 'agent') continue;
      const P = p.presence;
      if (!P || P.v !== PROTO || !P.g || typeof P.g !== 'object') continue;
      if (this.viaLobby && this.cleanCode(P.rc) !== this.code) continue;
      present.add(p.peer);
      let st = this.peers.get(p.peer);
      if (!st) { st = this.newPeer(p.peer, now, p.guest); this.peers.set(p.peer, st); }
      if (P === st.last) continue;
      st.last = P;
      // presence carries the sender's own clock: track the smallest offset seen as "now"
      const gt = num(P.g.t), sample = now - gt;
      st.off = st.first ? sample : Math.min(sample, st.off + (now - st.recvAt) * 0.002);
      try { this.ingest(st, P, now, gt + st.off, LAT); } catch (e) { console.warn('bad presence from peer', e); }
    }
    for (const [peer, st] of this.peers) if (!present.has(peer)) { this.drop(peer, st); this.peers.delete(peer); }
    UI.refreshRoster();
  },
  // ---------- shared: apply one peer's state ----------
  ingest(st, P, now, tLocal, lat) {
    const G = P.g;
    st.recvAt = now; st.up = num(G.up); st.name = cleanName(P.n) || '無名'; st.color = okColor(P.c);
    const arr = a => (Array.isArray(a) ? a : []);
    const H = arr(G.H), D = arr(G.D), F = arr(G.F), X = arr(G.X);
    const maxId = a => a.reduce((m, e) => Math.max(m, Array.isArray(e) ? num(e[0]) : 0), 0);
    if (st.first) { st.h = maxId(H); st.d = maxId(D); st.f = maxId(F); st.x = maxId(X); }
    else {
      for (const e of D.filter(e => Array.isArray(e) && num(e[0]) > st.d).sort((a, b) => a[0] - b[0])) {
        st.d = num(e[0]);
        const v = st.ents.get(num(e[1]) | 0);
        Game.remoteDeath(v, typeof e[2] === 'string' ? e[2] : '', num(e[3]) | 0, new V3(num(e[4]), num(e[5]), num(e[6])), now);
      }
      for (const e of H.filter(e => Array.isArray(e) && num(e[0]) > st.h).sort((a, b) => a[0] - b[0])) {
        st.h = num(e[0]);
        const victim = Game.byKey.get(String(e[1]));
        if (victim && victim.local) {
          const att = st.ents.get(num(e[4]) | 0);
          Game.damageLocal(victim, clamp(num(e[2]), 0, 30), st.peer + '.' + (num(e[4]) | 0), num(e[3]) | 0, att ? att.pos : null, now);
        }
      }
      for (const e of F.filter(e => Array.isArray(e) && num(e[0]) > st.f)) {
        st.f = Math.max(st.f, num(e[0]));
        const owner = st.ents.get(num(e[1]) | 0);
        W.flareBurst(new V3(num(e[2]), num(e[3]), num(e[4])), new V3(num(e[5]), num(e[6]), num(e[7])), st.peer + '.' + (num(e[1]) | 0), owner ? owner.q : null, owner ? owner.perf.flareDur : 1.6);
      }
      for (const e of X.filter(e => Array.isArray(e) && num(e[0]) > st.x)) {
        st.x = Math.max(st.x, num(e[0]));
        W.removeMissile(String(e[1]), new V3(num(e[2]), num(e[3]), num(e[4])), true);
      }
    }
    // aircraft
    const seen = new Set();
    for (const e of arr(G.e)) {
      if (!Array.isArray(e) || e.length < 22) continue;
      const idx = num(e[0]) | 0; if (idx < 0 || idx > 16) continue;
      seen.add(idx);
      const def = AC_DEFS[num(e[1]) | 0] || AC_DEFS[0];
      const team = clamp(num(e[2]) | 0, 0, 2);
      const name = idx === 0 ? st.name : ('AI ' + (cleanName(e[22]) || '僚機'));
      let pl = st.ents.get(idx);
      if (!pl) {
        pl = new Plane({ key: st.peer + '.' + idx, owner: st.peer, idx, local: false, bot: idx > 0, name, color: st.color, team, ac: def });
        st.ents.set(idx, pl); Game.addPlane(pl);
      }
      if (pl.def !== def) pl.setAircraft(def);
      pl.name = name; pl.lat = lat;
      if (pl.team !== team || pl.color !== st.color) { pl.team = team; pl.color = st.color; pl.updateAccent(); }
      const alive = !!e[3];
      if (alive && (!pl.alive || pl.wreck)) { pl.alive = true; pl.wreck = null; pl.hasSnap = false; pl.hp = pl.st.hp; }
      if (!alive && pl.alive) { pl.alive = false; if (!pl.wreck) Game.startWreck(pl, now, true); }
      pl.hp = clamp(num(e[4]), 0, 999);
      const fl = num(e[15]) | 0;
      pl.firing = !!(fl & 1); pl.abOn = !!(fl & 2); pl.invUntil = (fl & 4) ? now + 400 : 0; pl.wsel = (fl & 8) ? 'ir' : 'rad';
      pl.kills = num(e[16]) | 0; pl.deaths = num(e[17]) | 0;
      pl.mR = clamp(num(e[18]) | 0, 0, 12); pl.mI = clamp(num(e[19]) | 0, 0, 12);
      pl.rLockKey = typeof e[20] === 'string' ? e[20].slice(0, 40) : ''; pl.rLockState = clamp(num(e[21]) | 0, 0, 2);
      if (alive) pl.applySnap(num(e[5]), num(e[6]), num(e[7]), num(e[8]), num(e[9]), num(e[10]), num(e[11], 1), num(e[12]), num(e[13]), num(e[14]), tLocal, num(G.t));
      pl.lastSeen = now;
    }
    for (const [idx, pl] of st.ents) if (!seen.has(idx)) { Game.removePlane(pl); st.ents.delete(idx); }
    // missiles
    const live = new Set();
    for (const m of arr(G.M)) {
      if (!Array.isArray(m) || m.length < 11) continue;
      const key = st.peer + ':' + (num(m[0]) | 0); live.add(key);
      W.remoteMissile(key, st.peer + '.' + (num(m[1]) | 0), num(m[1]) | 0, num(m[2]), num(m[3]), num(m[4]), num(m[5]), num(m[6]), num(m[7]),
        typeof m[8] === 'string' ? m[8] : '', now, num(m[9]) | 0, typeof m[10] === 'string' ? m[10] : 'aim120', lat);
    }
    for (const key of st.mis) if (!live.has(key)) { const mm = W.missiles.find(q => q.key === key); if (mm) mm.alive = false; }
    st.mis = live;
    // match rules from the host
    if (Array.isArray(G.m) && this.hostPeer(now) === st.peer) Game.applyMatch(G.m, now);
    st.first = false;
  },
  drop(peer, st) {
    for (const pl of st.ents.values()) Game.removePlane(pl);
    st.ents.clear();
    for (const key of st.mis) { const mm = W.missiles.find(q => q.key === key); if (mm) mm.alive = false; }
  },
  settled(now) { return now - this.joinedAt > (this.kind === 'web' ? 2600 : 1800); },
  hostPeer(now) {
    let best = this.myPeer, bestUp = this.settled(now) || !this.peers.size ? now - this.joinedAt : -1;
    for (const st of this.peers.values()) {
      const up = st.up + (now - st.recvAt);
      if (up > bestUp || (up === bestUp && st.peer < best)) { best = st.peer; bestUp = up; }
    }
    return best;
  },
  isHost(now) { return this.inRoom && this.hostPeer(now) === this.myPeer; },
  playerCount() { let n = 1; for (const st of this.peers.values()) if (st.ents.has(0)) n++; return n; },
  // connection summary for the HUD tag and scoreboard
  peerInfo(peer) { return this.kind === 'web' ? WebNet.info(peer) : null; },
  linkSummary() {
    if (this.kind !== 'web' || !this.peers.size) return '';
    let direct = 0, ms = 0, n = 0;
    for (const [peer] of this.peers) { const i = WebNet.info(peer); if (!i) continue; n++; if (i.route === 'p2p') direct++; ms = Math.max(ms, i.ms); }
    if (!n) return '';
    return (direct === n ? '直連' : direct ? `直連 ${direct}/${n}` : '轉送') + (ms ? ` · ${ms} ms` : '');
  },
  inviteUrl(code) {
    if (this.kind !== 'web') return '';
    try { return location.href.split('#')[0] + '#' + code; } catch (e) { return ''; }
  },
  // ---------- outgoing ----------
  ring(name, entry) { if (!this.inRoom) return; this.rings[name].push({ at: performance.now(), e: entry }); if (this.rings[name].length > 14) this.rings[name].shift(); },
  recordHit(victim, dmg, weapon, attacker) { this.ring('H', [++this.seq, victim.key, Math.round(dmg * 10) / 10, weapon, attacker.idx]); },
  recordDeath(victim, killerKey, weapon) { this.ring('D', [++this.seq, victim.idx, killerKey || '', weapon, r1(victim.pos.x), r1(victim.pos.y), r1(victim.pos.z)]); },
  recordFlare(pl, p, v) { this.ring('F', [++this.seq, pl.idx, r1(p.x), r1(p.y), r1(p.z), Math.round(v.x), Math.round(v.y), Math.round(v.z)]); },
  recordDet(key, p) { this.ring('X', [++this.seq, key, r1(p.x), r1(p.y), r1(p.z)]); },
  encodeEnt(pl, now) {
    const q = pl.q, p = pl.pos, v = pl.vel, L = pl.lock;
    const fl = (pl.firing ? 1 : 0) | (pl.abOn ? 2 : 0) | (pl.invuln(now) ? 4 : 0) | (pl.wsel === 'ir' ? 8 : 0);
    const e = [pl.idx, pl.def.index, pl.team, pl.alive ? 1 : 0, Math.max(0, Math.round(pl.hp)), r1(p.x), r1(p.y), r1(p.z), r3(q.x), r3(q.y), r3(q.z), r3(q.w),
      Math.round(v.x), Math.round(v.y), Math.round(v.z), fl, pl.kills, pl.deaths, pl.mR, pl.mI,
      L.t ? L.t.key : '', L.t ? (L.locked ? 2 : 1) : 0];
    if (pl.idx > 0) e.push(pl.name.replace(/^AI /, ''));
    return e;
  },
  tick(now) {
    if (!this.inRoom) return;
    if (this.kind === 'claude' && !this.game) return;
    if (now - this.sendT >= 50) { this.sendT = now; this.send(now); }
    if (now - this.lobbyT > (this.kind === 'web' ? 2000 : 1500)) this.pushLobby(now, false);
  },
  send(now) {
    for (const k in this.rings) { const r = this.rings[k]; while (r.length && now - r[0].at > RING_TTL) r.shift(); }
    const G = { t: Math.round(now), up: Math.round(now - this.joinedAt), e: [], M: [] };
    for (const pl of Game.planes) if (pl.local) G.e.push(this.encodeEnt(pl, now));
    for (const m of W.missiles) if (m.local && m.alive) {
      const tk = m.target && !m.target.flare ? m.target.key : '';
      G.M.push([m.id, m.ownerIdx, r1(m.pos.x), r1(m.pos.y), r1(m.pos.z), Math.round(m.vel.x), Math.round(m.vel.y), Math.round(m.vel.z), tk, m.team, m.def.id]);
    }
    for (const k in this.rings) G[k] = this.rings[k].map(x => x.e);
    if (this.isHost(now) && this.settled(now)) G.m = Game.matchPayload(now);
    const me = Game.me;
    const P = { v: PROTO, n: me ? me.name : UI.prefs.name, c: me ? me.color : UI.prefs.color, rc: this.code, g: G };
    if (this.viaLobby) Object.assign(P, this.lobbyFields(now));
    // the Claude room keeps presence under 4 KiB; the web relay has more room
    const cap = this.kind === 'web' ? 12000 : 3300;
    let s = JSON.stringify(P), guard = 0;
    while (s.length > cap && guard++ < 40) {
      const r = ['H', 'X', 'F', 'D'].find(k => G[k] && G[k].length > 1);
      if (r) G[r].shift(); else if (G.M.length) G.M.pop(); else if (G.e.length > 1) G.e.pop(); else break;
      s = JSON.stringify(P);
    }
    if (this.kind === 'web') WebNet.sendState(P, now);
    else this.game.presence(P).catch(() => {});
  },
  lobbyFields(now) {
    const host = this.isHost(now);
    return { rc: this.inRoom ? this.code : null, h: host ? 1 : 0, era: Game.rules.era, mo: Game.rules.mode, np: this.playerCount() };
  },
  pushLobby(now, force) {
    this.lobbyT = now;
    if (this.kind === 'web') {
      if (this.inRoom) WebNet.beacon({ n: UI.prefs.name, ...this.lobbyFields(now) });
      return;
    }
    if (!this.api || this.viaLobby) return;
    const P = { v: PROTO, n: UI.prefs.name, c: UI.prefs.color, ...this.lobbyFields(now) };
    const s = JSON.stringify(P);
    if (!force && s === this.lastLobbyJSON) return;
    this.lastLobbyJSON = s;
    this.api.presence(P).catch(() => {});
  },
};
