"""Web transport: host hands over when the host leaves (bots move to the new host), and a late joiner gets the room's rules."""
import asyncio, subprocess, time
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle",
        "--allow-loopback-in-peer-connection", "--disable-features=WebRtcHideLocalIpsWithMdns"]
URL = 'http://127.0.0.1:8765/test/web.html?mqtt=ws://127.0.0.1:9101/mqtt'
NOREN = "() => { const d = window.__df; d.Main.renderWorld = () => {}; d.HUD.draw = () => {}; }"
ST = '''() => { const d = window.__df, G = d.Game, N = d.Net; return { host: N.isHost(performance.now()), rules: G.rules, round: G.round,
  planes: G.planes.map(p => [p.name, p.local, p.def.era, p.alive]) }; }'''

async def main():
    br = subprocess.Popen(['node', 'test/mqtt_broker.js', '9101', '40'], stdout=subprocess.PIPE); br.stdout.readline()
    errs = []
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(args=ARGS)
            pages = []
            for nm in ('Alpha', 'Bravo'):
                ctx = await b.new_context(viewport={'width': 640, 'height': 400}); pg = await ctx.new_page()
                pg.on('pageerror', lambda e, n=nm: errs.append(n + ': ' + str(e)))
                await pg.goto(URL + '#HOST')
                await pg.wait_for_function("() => window.__df && window.__df.Net.status === 'ready'")
                await pg.fill('#nameIn', nm); await pg.evaluate(NOREN)
                pages.append(pg)
            A, B = pages
            await A.click('#goBtn'); await A.wait_for_timeout(3000)
            await A.evaluate("() => window.__df.Game.setRules({ bots: 2, era: 'prop', mode: 'tdm' }, performance.now())")
            await A.wait_for_timeout(1000)
            await B.click('#goBtn'); await B.wait_for_timeout(4000)
            print('A:', await A.evaluate(ST)); print('B:', await B.evaluate(ST))
            t = time.time()
            await A.evaluate("() => window.__df.UI.leave()")
            for i in range(40):
                await B.wait_for_timeout(250)
                s = await B.evaluate(ST)
                if s['host'] and sum(1 for p in s['planes'] if p[1] and p[0].startswith('AI')) == 2: break
            print(f'B after A left ({time.time() - t:.1f}s):', s)
            await b.close()
    finally:
        br.terminate()
        for e in errs[:10]: print('ERR', e)

asyncio.run(main())
