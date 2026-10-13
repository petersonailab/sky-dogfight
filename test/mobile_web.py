import asyncio, subprocess
from playwright.async_api import async_playwright
import os as _os
HERE = _os.path.dirname(_os.path.abspath(__file__))
SHOTS = _os.path.join(HERE, 'shots'); _os.makedirs(SHOTS, exist_ok=True)  # screenshots go next to the tests
ARGS = ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--use-gl=angle"]
async def main():
    broker = subprocess.Popen(['node', 'test/mqtt_broker.js', '9101'], stdout=subprocess.PIPE); broker.stdout.readline()
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/test/web.html?mqtt=ws://127.0.0.1:9101/mqtt'); await pg.wait_for_timeout(1500)
        await pg.screenshot(path=f'{SHOTS}/m_menu_top.png')
        await pg.evaluate("() => document.getElementById('menu').scrollTo(0, 99999)")
        await pg.wait_for_timeout(400)
        await pg.screenshot(path=f'{SHOTS}/m_menu_bottom.png')
        await pg.tap('#tabPractice')
        await pg.tap('#goBtn'); await pg.wait_for_timeout(500)
        await pg.set_viewport_size({'width': 844, 'height': 390})
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f'{SHOTS}/m_flight.png')
        print(await pg.evaluate("() => [window.__df.Input.touch, document.getElementById('touch').hidden, window.__df.Game.me.alive]"))
        for e in errs[:5]: print('ERR', e)
        await b.close()
    broker.terminate()
asyncio.run(main())
