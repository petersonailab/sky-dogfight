import asyncio, sys
from playwright.async_api import async_playwright
import os as _os
HERE = _os.path.dirname(_os.path.abspath(__file__))
SHOTS = _os.path.join(HERE, 'shots'); _os.makedirs(SHOTS, exist_ok=True)  # screenshots go next to the tests
ARGS = ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--use-gl=angle"]
async def main():
    w = int(sys.argv[1]) if len(sys.argv) > 1 else 1440
    h = int(sys.argv[2]) if len(sys.argv) > 2 else 900
    out = sys.argv[3] if len(sys.argv) > 3 else 'menu'
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        ctx = await b.new_context(viewport={'width': w, 'height': h}, device_scale_factor=1, has_touch=(w < 700), is_mobile=(w < 700))
        pg = await ctx.new_page()
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error','warning') else None)
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html')
        await pg.wait_for_timeout(2500)
        await pg.screenshot(path=f'{SHOTS}/{out}.png')
        for l in logs[:30]: print(l)
        await b.close()
asyncio.run(main())
