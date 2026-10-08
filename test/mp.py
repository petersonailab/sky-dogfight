import asyncio, json, sys
NOJOIN = len(sys.argv) > 1 and sys.argv[1] == 'nojoin'
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--use-gl=angle"]
URL = 'http://127.0.0.1:8765/test/game.html'
STATE = r'''() => { const d = window.__df, G = d.Game; if (!G.active) return null;
  return { peer: d.Net.myPeer, host: d.Net.isHost(performance.now()), code: d.Net.code, round: G.round, rules: G.rules,
    planes: G.planes.map(p => ({ key: p.key, local: p.local, name: p.name, alive: p.alive, hp: Math.round(p.hp), k: p.kills, dd: p.deaths, ac: p.def.id, snap: p.hasSnap, y: Math.round(p.pos.y) })),
    feed: G.feed.map(f => `${f.k}>${f.w}>${f.v}`), msl: d.W.missiles.filter(m => m.alive).map(m => [m.key, m.local]), maxPres: window.__mockMaxPresence || 0 }; }'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 640, 'height': 400})
        if NOJOIN: await ctx.add_init_script('window.__MOCK_NOJOIN__ = true;')
        A = await ctx.new_page(); B = await ctx.new_page()
        errs = []
        for name, pg in (('A', A), ('B', B)):
            pg.on('pageerror', lambda e, n=name: errs.append(n + ': ' + str(e)))
            pg.on('console', lambda m, n=name: errs.append(n + ' console: ' + m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text else None)
        await A.goto(URL); await B.goto(URL)
        await A.wait_for_timeout(1200)
        for pg, nm in ((A, 'Alpha'), (B, 'Bravo')):
            await pg.fill('#nameIn', nm)
            await pg.fill('#codeIn', 'TEST')
        # freeze player input on both: scripted controls
        hook = '''() => { const d = window.__df; d.Input.apply = (pl) => { const c = pl.ctrl; c.gun = !!window.__fire; c.pitch = 0; c.yaw = 0; c.roll = Math.max(-1, Math.min(1, pl.right(new d.V3()).y * 2)); c.thr = 0.8; c.ab = false; if (window.__msl) { c.msl = true; window.__msl = false; } if (window.__flare) { c.flare = true; window.__flare = false; } }; }'''
        await A.evaluate(hook); await B.evaluate(hook)
        norender = "() => { const d = window.__df; d.Main.renderWorld = () => {}; d.HUD.draw = () => {}; }"
        await A.evaluate(norender); await B.evaluate(norender)
        await A.click('#goBtn'); await A.wait_for_timeout(2500)
        await B.click('#goBtn'); await B.wait_for_timeout(3500)
        sa = await A.evaluate(STATE); sb = await B.evaluate(STATE)
        print('A sees:', [(x['name'], x['local'], x['snap']) for x in sa['planes']], 'host', sa['host'], 'viaLobby', await A.evaluate('() => window.__df.Net.viaLobby'))
        print('B sees:', [(x['name'], x['local'], x['snap']) for x in sb['planes']], 'host', sb['host'])
        # put B 260 m in front of A, same heading/speed
        a = await A.evaluate('''() => { const m = window.__df.Game.me; return [m.pos.x, m.pos.y, m.pos.z, m.q.x, m.q.y, m.q.z, m.q.w, m.vel.x, m.vel.y, m.vel.z]; }''')
        await B.evaluate('''(a) => { const d = window.__df, m = d.Game.me; m.q.set(a[3], a[4], a[5], a[6]); const f = m.fwd(new d.V3());
            m.pos.set(a[0] + f.x * 260, a[1] + f.y * 260, a[2] + f.z * 260); m.vel.set(a[7], a[8], a[9]); m.speed = m.vel.len(); m.invUntil = 0; }''', a)
        await A.evaluate('() => { window.__df.Game.me.invUntil = 0; }')
        await A.wait_for_timeout(1500)
        await A.evaluate('() => { window.__fire = true; }')
        await A.wait_for_timeout(3500)
        await A.evaluate('() => { window.__fire = false; }')
        await A.wait_for_timeout(1500)
        sa = await A.evaluate(STATE); sb = await B.evaluate(STATE)
        print('after guns  A:', [(x['name'], x['hp'], x['alive'], x['k'], x['dd']) for x in sa['planes']], sa['feed'])
        print('after guns  B:', [(x['name'], x['hp'], x['alive'], x['k'], x['dd']) for x in sb['planes']], sb['feed'])
        # host adds bots
        await A.evaluate("() => window.__df.Game.setRules({ bots: 2 }, performance.now())")
        await A.wait_for_timeout(300)
        await A.evaluate("() => { for (const b of window.__df.Game.bots) { b.pos.y += 3000; } }")
        await A.wait_for_timeout(3000)
        sb = await B.evaluate(STATE)
        print('B after host bots:', [(x['name'], x['local']) for x in sb['planes']], 'rules', sb['rules'])
        print('max presence bytes A/B:', sa['maxPres'], (await B.evaluate(STATE))['maxPres'])
        # missile test: wait for B to respawn, place it 1500 m ahead, lock & fire from A
        await B.wait_for_timeout(5000)
        a = await A.evaluate('''() => { const m = window.__df.Game.me; return [m.pos.x, m.pos.y, m.pos.z, m.q.x, m.q.y, m.q.z, m.q.w, m.vel.x, m.vel.y, m.vel.z, m.alive]; }''')
        await B.evaluate('''(a) => { const d = window.__df, m = d.Game.me; if (!m.alive) return; m.q.set(a[3], a[4], a[5], a[6]); const f = m.fwd(new d.V3());
            m.pos.set(a[0] + f.x * 1500, a[1] + f.y * 1500, a[2] + f.z * 1500); m.vel.set(a[7], a[8], a[9]); m.speed = m.vel.len(); m.invUntil = 0; m.hp = m.st.hp; }''', a)
        lock = None
        for i in range(25):
            await A.wait_for_timeout(200)
            lock = await A.evaluate("() => { const d = window.__df, me = d.Game.me, L = me.lock; const B = d.Game.planes.find(p => p.name === 'Bravo'); const f = me.fwd(new d.V3()); const r = new d.V3().subV(B.pos, me.pos); return [L.t && L.t.name, +L.p.toFixed(2), L.locked, Math.round(r.len()), +(Math.acos(r.dot(f)/r.len())*57.3).toFixed(1), B.alive, me.mR, me.mI, me.alive]; }")
            if lock[2] and lock[0] == 'Bravo': break
        print('A lock:', lock)
        await A.evaluate('() => { window.__msl = true; }')
        await A.wait_for_timeout(600)
        sb1 = await B.evaluate(STATE)
        print('B sees missiles:', sb1['msl'])
        await A.wait_for_timeout(6000)
        sa = await A.evaluate(STATE); sb = await B.evaluate(STATE)
        print('after msl  A:', [(x['name'], x['hp'], x['alive'], x['k'], x['dd']) for x in sa['planes'] if not x['name'].startswith('AI')], sa['feed'][:3], 'missiles', sa['msl'])
        print('after msl  B:', [(x['name'], x['hp'], x['alive'], x['k'], x['dd']) for x in sb['planes'] if not x['name'].startswith('AI')], sb['feed'][:3])
        # B leaves
        await B.evaluate("() => window.__df.UI.leave()")
        await A.wait_for_timeout(2500)
        sa = await A.evaluate(STATE)
        print('A after B left:', [(x['name'], x['local']) for x in sa['planes']])
        await A.screenshot(path='/home/claude/dogfight/test/shots/mp_A.png')
        for e in errs[:12]: print('ERR', e)
        await b.close()
asyncio.run(main())
