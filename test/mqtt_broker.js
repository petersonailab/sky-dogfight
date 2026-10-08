// Tiny MQTT 3.1.1 (QoS 0) broker over WebSocket, for local tests of the web transport.
// usage: node mqtt_broker.js <port> [forwardDelayMs]
// control: GET /stats, GET /drop (close every client), GET /down?ms=N (refuse + drop for N ms), GET /delay?ms=N
const http = require('http'), crypto = require('crypto');
const port = +process.argv[2] || 9101;
let delay = +process.argv[3] || 0, downUntil = 0, nextId = 0;
const clients = new Set(), subs = new Map();
const stats = { connects: 0, pubs: 0, delivered: 0, bytesIn: 0, bytesOut: 0, topics: {} };

function frame(op, payload) {
  const len = payload.length; let hdr;
  if (len < 126) hdr = Buffer.from([0x80 | op, len]);
  else if (len < 65536) { hdr = Buffer.alloc(4); hdr[0] = 0x80 | op; hdr[1] = 126; hdr.writeUInt16BE(len, 2); }
  else { hdr = Buffer.alloc(10); hdr[0] = 0x80 | op; hdr[1] = 127; hdr.writeBigUInt64BE(BigInt(len), 2); }
  return Buffer.concat([hdr, payload]);
}
function send(cl, buf) { if (!cl.alive) return; stats.bytesOut += buf.length; try { cl.sock.write(frame(2, buf)); } catch (e) { drop(cl); } }
function drop(cl) {
  if (!cl.alive) return; cl.alive = false; clients.delete(cl);
  for (const t of cl.topics) { const s = subs.get(t); if (s) { s.delete(cl); if (!s.size) subs.delete(t); } }
  try { cl.sock.destroy(); } catch (e) { /* gone */ }
}
function onWs(cl, d) {
  cl.wb = Buffer.concat([cl.wb, d]);
  while (cl.wb.length >= 2) {
    const b0 = cl.wb[0], b1 = cl.wb[1], op = b0 & 15, masked = b1 & 128; let len = b1 & 127, off = 2;
    if (len === 126) { if (cl.wb.length < 4) return; len = cl.wb.readUInt16BE(2); off = 4; }
    else if (len === 127) { if (cl.wb.length < 10) return; len = Number(cl.wb.readBigUInt64BE(2)); off = 10; }
    const ml = masked ? 4 : 0;
    if (cl.wb.length < off + ml + len) return;
    const p = Buffer.from(cl.wb.subarray(off + ml, off + ml + len));
    if (masked) { const m = cl.wb.subarray(off, off + 4); for (let i = 0; i < p.length; i++) p[i] ^= m[i & 3]; }
    cl.wb = cl.wb.subarray(off + ml + len);
    if (op === 8) { drop(cl); return; }
    if (op === 9) { try { cl.sock.write(frame(10, p)); } catch (e) { /* ignore */ } continue; }
    if (op === 0 || op === 1 || op === 2) { stats.bytesIn += p.length; onMqtt(cl, p); }
  }
}
function onMqtt(cl, d) {
  cl.mb = Buffer.concat([cl.mb, d]);
  while (cl.mb.length >= 2) {
    let mul = 1, len = 0, i = 1, x;
    do { if (i >= cl.mb.length) return; x = cl.mb[i++]; len += (x & 127) * mul; mul *= 128; } while (x & 128);
    if (cl.mb.length < i + len) return;
    const type = cl.mb[0], body = cl.mb.subarray(i, i + len), raw = Buffer.from(cl.mb.subarray(0, i + len));
    cl.mb = cl.mb.subarray(i + len);
    packet(cl, type, body, raw);
  }
}
function topicsOf(body, withQos) {
  const out = []; let o = 2;
  while (o + 2 <= body.length) { const tl = body.readUInt16BE(o); out.push(body.subarray(o + 2, o + 2 + tl).toString()); o += 2 + tl + (withQos ? 1 : 0); }
  return out;
}
function packet(cl, type, body, raw) {
  const t = type >> 4;
  if (t === 1) { stats.connects++; send(cl, Buffer.from([0x20, 2, 0, 0])); }
  else if (t === 8) {
    const ts = topicsOf(body, true);
    for (const tp of ts) { cl.topics.add(tp); if (!subs.has(tp)) subs.set(tp, new Set()); subs.get(tp).add(cl); }
    send(cl, Buffer.concat([Buffer.from([0x90, 2 + ts.length]), body.subarray(0, 2), Buffer.alloc(ts.length)]));
  } else if (t === 10) {
    for (const tp of topicsOf(body, false)) { cl.topics.delete(tp); const s = subs.get(tp); if (s) { s.delete(cl); if (!s.size) subs.delete(tp); } }
    send(cl, Buffer.concat([Buffer.from([0xB0, 2]), body.subarray(0, 2)]));
  } else if (t === 3) {
    const tl = body.readUInt16BE(0), topic = body.subarray(2, 2 + tl).toString();
    stats.pubs++; stats.topics[topic] = (stats.topics[topic] || 0) + 1;
    const set = subs.get(topic); if (!set) return;
    const targets = [...set];
    const go = () => { for (const c of targets) { stats.delivered++; send(c, raw); } };
    if (delay > 0) setTimeout(go, delay); else go();
  } else if (t === 12) send(cl, Buffer.from([0xD0, 0]));
  else if (t === 14) drop(cl);
}
const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://x');
  if (u.pathname === '/stats') { res.end(JSON.stringify({ clients: clients.size, subs: [...subs].map(([k, v]) => [k, v.size]), ...stats })); return; }
  if (u.pathname === '/drop') { const n = clients.size; for (const c of [...clients]) drop(c); res.end(String(n)); return; }
  if (u.pathname === '/down') { downUntil = Date.now() + (+u.searchParams.get('ms') || 5000); for (const c of [...clients]) drop(c); res.end('down'); return; }
  if (u.pathname === '/delay') { delay = +u.searchParams.get('ms') || 0; res.end('delay ' + delay); return; }
  res.statusCode = 404; res.end();
});
server.on('upgrade', (req, sock) => {
  if (Date.now() < downUntil) { sock.destroy(); return; }
  const key = req.headers['sec-websocket-key'];
  const protos = String(req.headers['sec-websocket-protocol'] || '').split(',').map(s => s.trim());
  const accept = crypto.createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
  sock.write('HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ' + accept + '\r\n'
    + (protos.includes('mqtt') ? 'Sec-WebSocket-Protocol: mqtt\r\n' : '') + '\r\n');
  sock.setNoDelay(true);
  const cl = { id: ++nextId, sock, wb: Buffer.alloc(0), mb: Buffer.alloc(0), topics: new Set(), alive: true };
  clients.add(cl);
  sock.on('data', d => onWs(cl, d));
  sock.on('close', () => drop(cl)); sock.on('error', () => drop(cl));
});
server.listen(port, '127.0.0.1', () => console.log('mqtt-ws broker on', port, 'delay', delay));
