// Test-only stand-in for the platform's `room` capability, built on BroadcastChannel so
// several tabs of the same origin behave like viewers of one artifact.
window.__DF_TEST__ = true;
(function () {
  const peerId = (window.__MOCK_PEER__ || ('p' + Math.random().toString(36).slice(2, 10)));
  const rooms = {};
  function makeRoom(name) {
    const ch = new BroadcastChannel('mockroom:' + name);
    const peers = new Map();
    let mine = {};
    const peerFns = new Set();
    let snapshot = Object.freeze([]);
    let closed = false;
    function rebuild() {
      const meP = Object.freeze({ peer: peerId, by: null, isMe: true, sameTab: true, kind: 'viewer', guest: false, presence: Object.freeze(JSON.parse(JSON.stringify(mine))), updatedAt: Date.now() });
      const others = [...peers.values()].map(p => p.frozen);
      snapshot = Object.freeze([meP, ...others]);
      const change = { peers: snapshot, joined: [], left: [], updated: [] };
      for (const fn of peerFns) { try { fn(change); } catch (e) { console.error('peer listener', e); } }
    }
    let pending = false;
    const schedule = () => { if (pending || closed) return; pending = true; setTimeout(() => { pending = false; rebuild(); }, 16); };
    ch.onmessage = ev => {
      const m = ev.data; if (closed) return;
      if (m.type === 'presence') {
        const p = peers.get(m.peer) || { peer: m.peer };
        p.frozen = Object.freeze({ peer: m.peer, by: null, isMe: false, sameTab: false, kind: 'viewer', guest: false, presence: Object.freeze(m.presence), updatedAt: Date.now() });
        p.beat = Date.now(); peers.set(m.peer, p); schedule();
      } else if (m.type === 'hello') ch.postMessage({ type: 'presence', peer: peerId, presence: mine });
      else if (m.type === 'bye') { peers.delete(m.peer); schedule(); }
    };
    let dirty = false;
    const t1 = setInterval(() => { if (dirty && !closed) { dirty = false; ch.postMessage({ type: 'presence', peer: peerId, presence: mine }); } }, 33);
    const t2 = setInterval(() => { if (closed) return; ch.postMessage({ type: 'presence', peer: peerId, presence: mine });
      const now = Date.now(); for (const [k, p] of peers) if (now - p.beat > 5000) { peers.delete(k); schedule(); } }, 1000);
    ch.postMessage({ type: 'hello', peer: peerId });
    window.addEventListener('beforeunload', () => { try { ch.postMessage({ type: 'bye', peer: peerId }); } catch (e) {} });
    const api = {
      name,
      presence(patch) {
        for (const k in patch) { if (patch[k] === null) delete mine[k]; else mine[k] = patch[k]; }
        const size = new TextEncoder().encode(JSON.stringify(mine)).length;
        if (size > 4096) return Promise.reject({ code: 'invalid_argument', message: 'presence over 4 KiB: ' + size });
        window.__mockMaxPresence = Math.max(window.__mockMaxPresence || 0, size);
        mine = JSON.parse(JSON.stringify(mine)); dirty = true; schedule(); return Promise.resolve();
      },
      onPeers(fn) { peerFns.add(fn); setTimeout(rebuild, 0); return () => peerFns.delete(fn); },
      peers() { return snapshot; },
      onConnection(fn) { setTimeout(() => fn(true), 0); return () => {}; },
      connected() { return true; },
      emit() { return Promise.resolve(); }, on() { return () => {}; },
      leave() { closed = true; clearInterval(t1); clearInterval(t2); try { ch.postMessage({ type: 'bye', peer: peerId }); } catch (e) {} ch.close(); peerFns.clear(); delete rooms[name]; return Promise.resolve(); },
    };
    return api;
  }
  const lobby = makeRoom('lobby');
  lobby.join = name => { if (window.__MOCK_NOJOIN__) return Promise.reject({ code: 'not_permitted', message: 'rooms off' }); if (!/^[a-z0-9][a-z0-9_.-]{0,47}$/.test(name)) return Promise.reject({ code: 'invalid_argument' }); if (!rooms[name]) rooms[name] = makeRoom(name); return Promise.resolve(rooms[name]); };
  window.claude = { use(name) { return new Promise(res => setTimeout(() => res(name === 'room' ? lobby : null), 60)); } };
  window.__mockPeer = peerId;
})();
