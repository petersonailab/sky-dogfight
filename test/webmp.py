"""Two (or three) separate browsers playing over the web transport: local MQTT-over-WebSocket brokers + WebRTC.
usage: python3 test/webmp.py [p2p|relay] [third]
"""
import asyncio, json, subprocess, sys, time, urllib.request
from playwright.async_api import async_playwright

MODE = sys.argv[1] if len(sys.argv) > 1 else 'p2p'
THIRD = len(sys.argv) > 2 and sys.argv[2] == 'third'
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle",
        "--allow-loopback-in-peer-connection", "--disable-features=WebRtcHideLocalIpsWithMdns"]
Q = '?mqtt=ws://127.0.0.1:9101/mqtt,ws://127.0.0.1:9102/mqtt' + ('&nop2p' if MODE == 'relay' else '')
URL = 'http://127.0.0.1:8765/test/web.html' + Q

STATE = r'''() => { const d = window.__df, G = d.Game, N = d.Net, WN = d.WebNet;
  const base = { status: N.status, kind: N.kind, ready: WN.readyCount(), rooms: N.rooms.map(r => [r.code, r.n, r.host]) };
  if (!G.active) return base;
  return Object.assign(base, { peer: N.myPeer, host: N.isHost(performance.now()), code: N.code, round: G.round, rules: G.rules, link: N.linkSummary(),
    links: [...WN.links.values()].map(L => [L.peer, L.open, L.initiator]), peers: [...WN.peers.values()].map(p => [p.id, Math.round(p.rttR), Math.round(p.rttP)]),
    planes: G.planes.map(p => ({ key: p.key, local: p.local, name: p.name, alive: p.alive, hp: Math.round(p.hp), k: p.kills, dd: p.deaths, ac: p.def.id, snap: p.hasSnap, y: Math.round(p.pos.y) })),
    feed: G.feed.map(f => `${f.k}>${f.w}>${f.v}`), msl: d.W.missiles.filter(m => m.alive).map(m => [m.key, m.local]), info: document.getElementById('roundInfo').textContent }); }'''
HOOK = '''() => { const d = window.__df; d.Input.apply = (pl) => { const c = pl.ctrl; c.gun = !!window.__fire; c.pitch = 0; c.yaw = 0;
  c.roll = Math.max(-1, Math.min(1, pl.right(new d.V3()).y * 2)); c.thr = 0.8; c.ab = false;
  if (window.__msl) { c.msl = true; window.__msl = false; } if (window.__flare) { c.flare = true; window.__flare = false; } };
  d.Main.renderWorld = () => {}; d.HUD.draw = () => {}; }'''
POSE = '''() => { const m = window.__df.Game.me; return [m.pos.x, m.pos.y, m.pos.z, m.q.x, m.q.y, m.q.z, m.q.w, m.vel.x, m.vel.y, m.vel.z, m.alive]; }'''
PLACE = '''([a, dist]) => { const d = window.__df, m = d.Game.me; if (!m.alive) return false; m.q.set(a[3], a[4], a[5], a[6]); const f = m.fwd(new d.V3());
  m.pos.set(a[0] + f.x * dist, a[1] + f.y * dist, a[2] + f.z * dist); m.vel.set(a[7], a[8], a[9]); m.speed = m.vel.len(); m.invUntil = 0; m.hp = m.st.hp; return true; }'''

def broker_stats(port):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}/stats', timeout=3) as r:
        return json.loads(r.read())

def ctl(port, path):
    with urllib.request.urlopen(f'http://127.0.0.1:{port}{path}', timeout=3) as r:
        return r.read().decode()

def short(s):
    return [(x['name'], x['local'], x['snap'], x['hp'], x['alive'], x['k'], x['dd']) for x in s['planes']]

async def wait_for(pg, js, timeout=15000, step=200):
    t = 0
    while t < timeout:
        if await pg.evaluate(js): return True
        await pg.wait_for_timeout(step); t += step
    return False

async def main():
    procs = [subprocess.Popen(['node', 'test/mqtt_broker.js', '9101', '45'], stdout=subprocess.PIPE),
             subprocess.Popen(['node', 'test/mqtt_broker.js', '9102', '70'], stdout=subprocess.PIPE)]
    for p in procs: p.stdout.readline()
    errs = []
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(args=ARGS)
            ca = await b.new_context(viewport={'width': 900, 'height': 600}); await ca.grant_permissions(['clipboard-read', 'clipboard-write'], origin='http://127.0.0.1:8765')
            cb = await b.new_context(viewport={'width': 900, 'height': 600})
            A = await ca.new_page(); B = await cb.new_page()
            for name, pg in (('A', A), ('B', B)):
                pg.on('pageerror', lambda e, n=name: errs.append(n + ': ' + str(e)))
                pg.on('console', lambda m, n=name: errs.append(n + ' console: ' + m.text) if m.type in ('error', 'warning') and 'ERR_TUNNEL' not in m.text else None)
            t0 = time.time()
            await A.goto(URL)
            ok = await wait_for(A, "() => window.__df && window.__df.Net.status === 'ready'")
            print(f'A ready={ok} in {time.time() - t0:.1f}s', await A.evaluate(STATE))
            print('A invite button visible:', await A.is_visible('#inviteBtn'), '| note:', await A.text_content('#netNote'))
            await A.fill('#nameIn', 'Alpha')
            await A.evaluate(HOOK)
            await A.click('#goBtn')
            await A.wait_for_timeout(800)
            print('A in-game invite visible:', await A.is_visible('#inviteGame'))
            await A.click('#inviteGame')
            await A.wait_for_timeout(300)
            invite = await A.evaluate('() => navigator.clipboard.readText()')
            print('invite url:', invite, '| toast:', await A.text_content('#toast'))
            # B opens the invite link
            await B.goto(invite)
            ok = await wait_for(B, "() => window.__df && window.__df.Net.status === 'ready'")
            await wait_for(B, "() => window.__df.Net.rooms.length > 0", 6000)
            sb = await B.evaluate(STATE)
            print(f'B ready={ok}; code field:', await B.input_value('#codeIn'), '| tab online:', await B.get_attribute('#tabOnline', 'aria-selected'), '| rooms:', sb['rooms'])
            print('B note:', await B.text_content('#netNote'))
            await B.fill('#nameIn', 'Bravo')
            await B.evaluate(HOOK)
            t1 = time.time()
            await B.click('#goBtn')
            ok = await wait_for(B, "() => window.__df.Game.planes.some(p => !p.local && p.hasSnap)", 10000, 100)
            print(f'B sees A after {time.time() - t1:.2f}s ({ok})')
            ok = await wait_for(A, "() => window.__df.Game.planes.some(p => !p.local && p.hasSnap)", 10000, 100)
            print(f'A sees B after {time.time() - t1:.2f}s ({ok})')
            if MODE == 'p2p':
                ok = await wait_for(A, "() => [...window.__df.WebNet.links.values()].some(L => L.open)", 15000, 200)
                print(f'direct link open after {time.time() - t1:.2f}s ({ok})')
            await A.wait_for_timeout(4500)
            sa = await A.evaluate(STATE); sb = await B.evaluate(STATE)
            for nm, s in (('A', sa), ('B', sb)):
                print(nm, 'host', s['host'], '| link', s['link'], '| links', s['links'], '| peers', s['peers'])
                print('   planes', short(s), '| info:', s['info'])
            # position-error check: compare B's own position with A's view of B
            for i in range(3):
                pa = await A.evaluate("() => { const p = window.__df.Game.planes.find(p => p.name === 'Bravo'); return [p.pos.x, p.pos.y, p.pos.z, performance.timeOrigin + performance.now()]; }")
                pb = await B.evaluate("() => { const p = window.__df.Game.me; return [p.pos.x, p.pos.y, p.pos.z, performance.timeOrigin + performance.now(), p.speed]; }")
                dt = (pb[3] - pa[3]) / 1000
                err = sum((pa[j] - pb[j]) ** 2 for j in range(3)) ** 0.5
                print(f'   remote-pos error {err:.1f} m (sample dt {dt*1000:.0f} ms, speed {pb[4]:.0f} m/s -> {pb[4]*abs(dt):.1f} m from sampling)')
                await A.wait_for_timeout(500)
            # guns: put B 260 m ahead of A
            a = await A.evaluate(POSE)
            await B.evaluate(PLACE, [a, 260]); await A.evaluate('() => { window.__df.Game.me.invUntil = 0; }')
            await A.wait_for_timeout(1500)
            await A.evaluate('() => { window.__fire = true; }'); await A.wait_for_timeout(3500); await A.evaluate('() => { window.__fire = false; }')
            await A.wait_for_timeout(1500)
            sa = await A.evaluate(STATE); sb = await B.evaluate(STATE)
            print('after guns A:', short(sa), sa['feed']); print('after guns B:', short(sb), sb['feed'])
            # host adds bots
            await A.evaluate("() => window.__df.Game.setRules({ bots: 2 }, performance.now())")
            await A.wait_for_timeout(300)
            await A.evaluate("() => { for (const b of window.__df.Game.bots) { b.pos.y += 3000; } }")
            await A.wait_for_timeout(3000)
            sb = await B.evaluate(STATE)
            print('B after host bots:', [(x['name'], x['local'], x['snap']) for x in sb['planes']], 'rules', sb['rules'])
            # missile: wait for B to respawn, put it 1500 m ahead, lock and fire
            await wait_for(B, "() => window.__df.Game.me.alive", 12000)
            a = await A.evaluate(POSE)
            await B.evaluate(PLACE, [a, 1500])
            lock = None
            for i in range(30):
                await A.wait_for_timeout(200)
                lock = await A.evaluate("() => { const d = window.__df, me = d.Game.me, L = me.lock; return [L.t && L.t.name, +L.p.toFixed(2), L.locked, me.mR, me.mI]; }")
                if lock[2] and lock[0] == 'Bravo': break
            print('A lock:', lock, '| B warned:', await B.evaluate("() => window.__df.HUD.lockedBy(window.__df.Game.me)"))
            await A.evaluate('() => { window.__msl = true; }')
            await A.wait_for_timeout(700)
            print('B sees missiles:', (await B.evaluate(STATE))['msl'], '| B incoming:', await B.evaluate("() => window.__df.HUD.incoming(window.__df.Game.me).n"))
            await A.wait_for_timeout(6000)
            sa = await A.evaluate(STATE); sb = await B.evaluate(STATE)
            print('after msl A:', [x for x in short(sa) if not x[0].startswith('AI')], sa['feed'][:3])
            print('after msl B:', [x for x in short(sb) if not x[0].startswith('AI')], sb['feed'][:3])
            # broker outage: take broker 1 down for 8 s
            print('broker1 down:', ctl(9101, '/down?ms=8000'))
            await A.wait_for_timeout(3000)
            sa = await A.evaluate(STATE)
            print('  during outage A ready brokers:', sa['ready'], '| status', sa['status'], '| B still there:', [x[:3] for x in short(sa) if x[0] == 'Bravo'], '| link', sa['link'])
            await A.wait_for_timeout(9000)
            sa = await A.evaluate(STATE); sb = await B.evaluate(STATE)
            print('  after outage A ready brokers:', sa['ready'], '| B ready:', sb['ready'], '| link', sa['link'])
            if THIRD:
                cc = await b.new_context(viewport={'width': 900, 'height': 600}); C = await cc.new_page()
                C.on('pageerror', lambda e: errs.append('C: ' + str(e)))
                await C.goto(invite)
                await wait_for(C, "() => window.__df && window.__df.Net.status === 'ready'")
                await C.fill('#nameIn', 'Charlie'); await C.evaluate(HOOK); await C.click('#goBtn')
                await C.wait_for_timeout(6000)
                sc = await C.evaluate(STATE); sa = await A.evaluate(STATE)
                print('C sees:', [(x['name'], x['local'], x['snap']) for x in sc['planes']], '| link', sc['link'], '| host', sc['host'])
                print('A sees:', [(x['name'], x['local'], x['snap']) for x in sa['planes']], '| link', sa['link'])
            # B leaves
            t2 = time.time()
            await B.evaluate("() => window.__df.UI.leave()")
            ok = await wait_for(A, "() => !window.__df.Game.planes.some(p => p.name === 'Bravo')", 9000, 100)
            print(f'A dropped Bravo after {time.time() - t2:.2f}s ({ok})')
            for port in (9101, 9102):
                s = broker_stats(port); print('broker', port, {k: s[k] for k in ('clients', 'connects', 'pubs', 'delivered', 'bytesIn', 'bytesOut')}, s['topics'])
            await A.screenshot(path='/home/claude/dogfight/test/shots/web_A.png')
            await b.close()
    finally:
        for p in procs: p.terminate()
        for e in errs[:20]: print('ERR', e)

asyncio.run(main())
