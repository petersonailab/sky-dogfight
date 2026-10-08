import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--use-gl=angle"]
async def main():
    w, h = 1280, 760
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1)
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html')
        await pg.wait_for_timeout(1500)
        await pg.click('#tabPractice')
        await pg.click('#goBtn')
        await pg.wait_for_timeout(500)
        await pg.mouse.move(w/2, h*0.47)
        for i in range(4):
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f'/home/claude/dogfight/test/shots/flight_{i}.png')
        info = await pg.evaluate('''() => { const d = window.__df, G = d.Game, me = G.me;
          return { planes: G.planes.length, me: [me.pos.x|0, me.pos.y|0, me.pos.z|0], spd: me.speed|0, alive: me.alive, hp: me.hp,
                   bots: G.planes.filter(p=>p.bot).map(p => [p.name, p.def.id, p.alive, p.pos.y|0, p.speed|0]), fx: d.FX.n, bullets: d.W.bullets.length, msl: d.W.missiles.length }; }''')
        print(json.dumps(info, ensure_ascii=False))
        for l in logs[:30]: print(l)
        await b.close()
asyncio.run(main())
