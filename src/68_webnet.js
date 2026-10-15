// ===================== internet transport (used outside Claude, e.g. on GitHub Pages) =====================
// Every player publishes the same absolute-state messages the Claude room version uses.
//  * relay: two public MQTT brokers over secure WebSockets (works on almost any network)
//  * direct: WebRTC data channels between each pair of players, negotiated through the relay;
//    when a direct link is open, state goes over it (lower latency) and the relay drops to a 1 Hz heartbeat.
// Messages carry the sender id and a per-sender message number, so copies that arrive twice
// (two brokers, or relay + direct) are dropped.
const PAGE_PARAMS = (() => { try { return new URLSearchParams(location.search); } catch (e) { return new URLSearchParams(''); } })();
const WEB_BROKERS = (PAGE_PARAMS.get('mqtt') || 'wss://broker.emqx.io:8084/mqtt,wss://broker.hivemq.com:8884/mqtt').split(',').map(s => s.trim()).filter(Boolean);
const WEB_TOPIC = 'skydogfight/v5/';
const WEB_ICE = [{ urls: 'stun:stun.l.google.com:19302' }, { urls: 'stun:stun.cloudflare.com:3478' }];
const TXT_ENC = new TextEncoder(), TXT_DEC = new TextDecoder();

// ---------- minimal MQTT 3.1.1 client (QoS 0) over WebSocket ----------
class MqttConn {
  constructor(url, onMsg, onChange) {
    this.url = url; this.onMsg = onMsg; this.onChange = onChange;
    this.ready = false; this.subs = new Set(); this.ws = null; this.buf = new Uint8Array(0);
    this.pid = 0; this.backoff = 1500; this.closed = false; this.pingT = 0; this.everReady = false;
    this.cid = 'sdf_' + Math.random().toString(36).slice(2, 12);
    this.open();
  }
  open() {
    if (this.closed) return;
    let ws;
    try { ws = new WebSocket(this.url, ['mqtt']); } catch (e) { this.retry(); return; }
    this.ws = ws; ws.binaryType = 'arraybuffer';
    ws.onopen = () => { this.buf = new Uint8Array(0); try { ws.send(this.pkConnect()); } catch (e) { /* closes below */ } };
    ws.onmessage = ev => { if (ev.data instanceof ArrayBuffer) this.feed(new Uint8Array(ev.data)); };
    ws.onclose = () => {
      const was = this.ready;
      this.ready = false; if (this.ws === ws) this.ws = null; clearInterval(this.pingT);
      if (was) this.onChange();
      this.retry();
    };
    ws.onerror = () => { /* onclose follows */ };
  }
  retry() { if (this.closed) return; setTimeout(() => this.open(), this.backoff); this.backoff = Math.min(30000, this.backoff * 2); }
  static str(s) { const b = TXT_ENC.encode(s), o = new Uint8Array(b.length + 2); o[0] = b.length >> 8; o[1] = b.length & 255; o.set(b, 2); return o; }
  static pack(type, parts) {
    let len = 0; for (const p of parts) len += p.length;
    const hdr = [type]; let x = len;
    do { let d = x % 128; x = Math.floor(x / 128); if (x > 0) d |= 128; hdr.push(d); } while (x > 0);
    const out = new Uint8Array(hdr.length + len); out.set(hdr, 0);
    let o = hdr.length; for (const p of parts) { out.set(p, o); o += p.length; }
    return out;
  }
  nextPid() { this.pid = (this.pid % 65535) + 1; return new Uint8Array([this.pid >> 8, this.pid & 255]); }
  pkConnect() { return MqttConn.pack(0x10, [MqttConn.str('MQTT'), new Uint8Array([4, 0x02, 0, 60]), MqttConn.str(this.cid)]); }
  pkSub(topic) { return MqttConn.pack(0x82, [this.nextPid(), MqttConn.str(topic), new Uint8Array([0])]); }
  pkUnsub(topic) { return MqttConn.pack(0xA2, [this.nextPid(), MqttConn.str(topic)]); }
  feed(chunk) {
    const b = new Uint8Array(this.buf.length + chunk.length); b.set(this.buf); b.set(chunk, this.buf.length); this.buf = b;
    while (this.buf.length >= 2) {
      let mul = 1, len = 0, i = 1, d;
      do { if (i >= this.buf.length) return; d = this.buf[i++]; len += (d & 127) * mul; mul *= 128; } while ((d & 128) && i < 5);
      if (this.buf.length < i + len) return;
      const type = this.buf[0], body = this.buf.slice(i, i + len);
      this.buf = this.buf.slice(i + len);
      this.packet(type, body);
    }
  }
  packet(type, body) {
    const t = type >> 4;
    if (t === 2) { // CONNACK
      if (body.length >= 2 && body[1] === 0) {
        this.ready = true; this.everReady = true; this.backoff = 1500;
        for (const s of this.subs) { try { this.ws.send(this.pkSub(s)); } catch (e) { /* reconnect handles it */ } }
        clearInterval(this.pingT);
        this.pingT = setInterval(() => { if (this.ws && this.ready) { try { this.ws.send(new Uint8Array([0xC0, 0])); } catch (e) { /* ignore */ } } }, 25000);
        this.onChange();
      } else { try { this.ws.close(); } catch (e) { /* ignore */ } }
    } else if (t === 3 && body.length >= 2) { // PUBLISH
      const qos = (type >> 1) & 3, tl = (body[0] << 8) | body[1];
      const topic = TXT_DEC.decode(body.subarray(2, 2 + tl));
      let o = 2 + tl; if (qos > 0) o += 2;
      if (o > body.length) return;
      this.onMsg(topic, TXT_DEC.decode(body.subarray(o)));
    }
    // SUBACK, UNSUBACK and PINGRESP need no handling at QoS 0
  }
  subscribe(topic) { this.subs.add(topic); if (this.ready) { try { this.ws.send(this.pkSub(topic)); } catch (e) { /* ignore */ } } }
  unsubscribe(topic) { if (!this.subs.delete(topic)) return; if (this.ready) { try { this.ws.send(this.pkUnsub(topic)); } catch (e) { /* ignore */ } } }
  publish(topic, text) {
    if (!this.ready || !this.ws || this.ws.bufferedAmount > 256e3) return false;
    try { this.ws.send(MqttConn.pack(0x30, [MqttConn.str(topic), TXT_ENC.encode(text)])); return true; } catch (e) { return false; }
  }
  close() { this.closed = true; clearInterval(this.pingT); try { if (this.ws) this.ws.close(); } catch (e) { /* ignore */ } }
}

// ---------- transport ----------
const WebNet = {
  id: 'w' + Math.random().toString(36).slice(2, 11),
  conns: [], net: null, room: '', peers: new Map(), links: new Map(), pendingCands: new Map(),
  msgN: 0, stateSeq: 0, lastRelay: 0, lastPing: 0, started: false,
  p2p: typeof RTCPeerConnection !== 'undefined' && !PAGE_PARAMS.has('nop2p'),
  get lobbyTopic() { return WEB_TOPIC + 'lobby'; },
  roomTopic(code) { return WEB_TOPIC + 'r/' + code; },
  start(net) {
    if (this.started) return; this.started = true;
    this.net = net;
    for (const url of WEB_BROKERS) {
      const c = new MqttConn(url, (topic, text) => this.onRelay(topic, text), () => this.net.webStatus());
      c.subscribe(this.lobbyTopic);
      this.conns.push(c);
    }
    setInterval(() => this.housekeep(performance.now()), 500);
    const bye = () => this.bye();
    window.addEventListener('pagehide', bye); window.addEventListener('beforeunload', bye);
  },
  readyCount() { let n = 0; for (const c of this.conns) if (c.ready) n++; return n; },
  everReady() { return this.conns.some(c => c.everReady); },
  publish(topic, text) { let ok = false; for (const c of this.conns) ok = c.publish(topic, text) || ok; return ok; },
  // ---------- room ----------
  joinRoom(code) {
    this.leaveRoom();
    this.room = code;
    for (const c of this.conns) { c.unsubscribe(this.lobbyTopic); c.subscribe(this.roomTopic(code)); }
    this.lastRelay = 0;
    this.sendRelay({ k: 'hi' });
  },
  leaveRoom() {
    if (!this.room) return;
    this.sendRelay({ k: 'bye' });
    for (const c of this.conns) { c.unsubscribe(this.roomTopic(this.room)); c.subscribe(this.lobbyTopic); }
    for (const peer of [...this.links.keys()]) this.closeLink(peer, false);
    this.peers.clear(); this.pendingCands.clear();
    this.room = '';
  },
  bye() { if (this.room) this.sendRelay({ k: 'bye' }); },
  beacon(B) { const o = { k: 'b', f: this.id, n: ++this.msgN, B }; this.publish(this.lobbyTopic, JSON.stringify(o)); },
  sendRelay(o) { if (!this.room) return false; o.f = this.id; o.n = ++this.msgN; return this.publish(this.roomTopic(this.room), JSON.stringify(o)); },
  sendDirect(peer, o) {
    const L = this.links.get(peer);
    if (!L || !L.open || !L.dc || L.dc.readyState !== 'open' || L.dc.bufferedAmount > 256e3) return false;
    o.f = this.id; o.n = ++this.msgN;
    try { L.dc.send(JSON.stringify(o)); return true; } catch (e) { return false; }
  },
  // absolute state: straight to every direct link; through the relay at ~15 Hz while someone still needs it,
  // else a 1 Hz heartbeat (also while alone in the room: a newcomer's "hi" switches us back to full rate)
  sendState(P, now) {
    if (!this.room) return;
    const msg = { k: 's', f: this.id, n: ++this.msgN, s: ++this.stateSeq, P };
    const text = JSON.stringify(msg);
    let needRelay = false;
    for (const [peer] of this.peers) {
      const L = this.links.get(peer);
      if (L && L.open && L.dc && L.dc.readyState === 'open' && L.dc.bufferedAmount < 256e3) { try { L.dc.send(text); } catch (e) { needRelay = true; } }
      else needRelay = true;
    }
    if (now - this.lastRelay >= (needRelay ? 66 : 1000)) { this.publish(this.roomTopic(this.room), text); this.lastRelay = now; }
  },
  // ---------- receiving ----------
  onRelay(topic, text) {
    if (topic === this.lobbyTopic) { this.handle(text, 'relay', true); return; }
    if (this.room && topic === this.roomTopic(this.room)) this.handle(text, 'relay', false);
  },
  handle(text, via, lobby) {
    if (typeof text !== 'string' || text.length > 60000) return;
    let o; try { o = JSON.parse(text); } catch (e) { return; }
    if (!o || typeof o !== 'object' || typeof o.f !== 'string' || o.f === this.id || o.f.length > 24 || typeof o.n !== 'number') return;
    const now = performance.now();
    if (lobby) { if (o.k === 'b') this.net.webBeacon(o.f, o.B, now); return; }
    if (!this.room) return;
    if (o.k === 'bye') { this.dropPeer(o.f); return; }
    let ps = this.peers.get(o.f);
    if (!ps) {
      ps = { id: o.f, seen: new Set(), order: [], heard: now, lastS: 0, rttR: 0, rttP: 0, tries: 0, nextTry: 0 };
      this.peers.set(o.f, ps);
      if (this.p2p && this.id < o.f) ps.nextTry = now + 300; // the lower id makes the offer
    }
    if (ps.seen.has(o.n)) return;
    ps.seen.add(o.n); ps.order.push(o.n);
    if (ps.order.length > 400) ps.seen.delete(ps.order.shift());
    ps.heard = now;
    switch (o.k) {
      case 's': {
        if (typeof o.s !== 'number' || o.s <= ps.lastS) return;
        ps.lastS = o.s;
        // one-way delay of the path this copy came over; the receiver extrapolates by it
        const lat = (via === 'p2p' ? (ps.rttP || 60) : (ps.rttR || 260)) / 2000;
        this.net.webState(o.f, o.P, now, now, Math.min(lat, 0.4));
        break;
      }
      case 'pi': {
        const reply = { k: 'po', to: o.f, t: o.t, p: o.p };
        if (o.p === 'p') this.sendDirect(o.f, reply); else this.sendRelay(reply);
        break;
      }
      case 'po': {
        if (o.to !== this.id || typeof o.t !== 'number') return;
        const rtt = clamp(now - o.t, 1, 5000);
        if (o.p === 'p') ps.rttP = ps.rttP ? ps.rttP * 0.7 + rtt * 0.3 : rtt;
        else ps.rttR = ps.rttR ? ps.rttR * 0.7 + rtt * 0.3 : rtt;
        break;
      }
      case 'sig': if (o.to === this.id && o.d && typeof o.d === 'object') this.onSignal(o.f, o.d, now); break;
      default: break;
    }
  },
  dropPeer(peer) {
    if (!this.peers.has(peer)) return;
    this.peers.delete(peer); this.closeLink(peer, false); this.pendingCands.delete(peer);
    this.net.webGone(peer);
  },
  housekeep(now) {
    if (!this.room) return;
    for (const [peer, ps] of [...this.peers]) {
      if (now - ps.heard > 6000) { this.dropPeer(peer); continue; }
      const L = this.links.get(peer);
      if (L && !L.open && now - L.created > 15000) this.closeLink(peer, true);
      if (this.p2p && this.id < peer && !this.links.has(peer) && ps.nextTry && now >= ps.nextTry && ps.tries < 4) { ps.tries++; this.connectLink(peer); }
    }
    if (now - this.lastPing > 2000) {
      this.lastPing = now;
      if (this.peers.size) this.sendRelay({ k: 'pi', t: now, p: 'r' });
      for (const [peer, L] of this.links) if (L.open) this.sendDirect(peer, { k: 'pi', t: now, p: 'p' });
    }
  },
  // ---------- WebRTC direct links ----------
  signal(peer, d) { this.sendRelay({ k: 'sig', to: peer, d }); },
  newLink(peer, sid, initiator) {
    const pc = new RTCPeerConnection({ iceServers: WEB_ICE });
    const L = { peer, sid, pc, dc: null, open: false, initiator, created: performance.now(), remoteSet: false, queue: [] };
    this.links.set(peer, L);
    pc.onicecandidate = e => { if (e.candidate && this.links.get(peer) === L) this.signal(peer, { t: 'c', sid, c: e.candidate.toJSON() }); };
    pc.onconnectionstatechange = () => { if (pc.connectionState === 'failed' && this.links.get(peer) === L) this.closeLink(peer, true); };
    pc.ondatachannel = e => this.setupChannel(L, e.channel);
    return L;
  },
  setupChannel(L, dc) {
    L.dc = dc;
    dc.onopen = () => {
      if (this.links.get(L.peer) !== L) return;
      L.open = true; const ps = this.peers.get(L.peer); if (ps) ps.tries = 0;
      this.sendDirect(L.peer, { k: 'pi', t: performance.now(), p: 'p' });
      this.net.webStatus();
    };
    dc.onclose = () => { if (this.links.get(L.peer) === L) this.closeLink(L.peer, true); };
    dc.onmessage = ev => { if (typeof ev.data === 'string') this.handle(ev.data, 'p2p', false); };
  },
  async connectLink(peer) {
    if (!this.p2p) return;
    let L;
    try {
      L = this.newLink(peer, Math.random().toString(36).slice(2, 10), true);
      this.setupChannel(L, L.pc.createDataChannel('g', { ordered: false, maxRetransmits: 0 }));
      const offer = await L.pc.createOffer();
      await L.pc.setLocalDescription(offer);
      if (this.links.get(peer) === L) this.signal(peer, { t: 'o', sid: L.sid, sdp: offer.sdp });
    } catch (e) { if (L && this.links.get(peer) === L) this.closeLink(peer, true); }
  },
  async onSignal(peer, d, now) {
    if (!this.p2p || typeof d.sid !== 'string' || d.sid.length > 16) return;
    try {
      if (d.t === 'o' && typeof d.sdp === 'string') {
        const old = this.links.get(peer);
        if (old && old.sid === d.sid) return;
        if (old) this.closeLink(peer, false);
        const L = this.newLink(peer, d.sid, false);
        await L.pc.setRemoteDescription({ type: 'offer', sdp: d.sdp });
        L.remoteSet = true; this.flushCands(L);
        const answer = await L.pc.createAnswer();
        await L.pc.setLocalDescription(answer);
        if (this.links.get(peer) === L) this.signal(peer, { t: 'a', sid: L.sid, sdp: answer.sdp });
      } else if (d.t === 'a' && typeof d.sdp === 'string') {
        const L = this.links.get(peer);
        if (!L || !L.initiator || L.sid !== d.sid || L.remoteSet) return;
        await L.pc.setRemoteDescription({ type: 'answer', sdp: d.sdp });
        L.remoteSet = true; this.flushCands(L);
      } else if (d.t === 'c' && d.c && typeof d.c === 'object') {
        const L = this.links.get(peer);
        if (L && L.sid === d.sid) {
          if (L.remoteSet) await L.pc.addIceCandidate(d.c).catch(() => {});
          else L.queue.push(d.c);
        } else {
          // the candidate overtook its offer: keep it for a moment
          const q = this.pendingCands.get(peer) || []; q.push({ sid: d.sid, c: d.c, at: now }); this.pendingCands.set(peer, q.filter(x => now - x.at < 10000).slice(-40));
        }
      }
    } catch (e) { const L = this.links.get(peer); if (L) this.closeLink(peer, true); }
  },
  flushCands(L) {
    const early = (this.pendingCands.get(L.peer) || []).filter(x => x.sid === L.sid).map(x => x.c);
    this.pendingCands.delete(L.peer);
    for (const c of early.concat(L.queue)) L.pc.addIceCandidate(c).catch(() => {});
    L.queue = [];
  },
  closeLink(peer, retry) {
    const L = this.links.get(peer);
    if (!L) return;
    this.links.delete(peer);
    try { if (L.dc) L.dc.close(); } catch (e) { /* ignore */ }
    try { L.pc.close(); } catch (e) { /* ignore */ }
    const ps = this.peers.get(peer);
    if (ps && retry && L.initiator) ps.nextTry = performance.now() + [4000, 15000, 45000, 90000][Math.min(3, ps.tries)];
    if (L.open) this.net.webStatus();
  },
  // ---------- info for the HUD / scoreboard ----------
  linkOpen(peer) { const L = this.links.get(peer); return !!(L && L.open); },
  info(peer) {
    const ps = this.peers.get(peer); if (!ps) return null;
    const direct = this.linkOpen(peer);
    const rtt = direct ? ps.rttP : ps.rttR;
    return { route: direct ? 'p2p' : 'relay', ms: rtt ? Math.round(rtt / 2) : 0 };
  },
};
