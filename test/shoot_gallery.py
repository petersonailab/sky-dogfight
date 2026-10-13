import asyncio, sys, json
from playwright.async_api import async_playwright
import os
import os as _os
HERE = _os.path.dirname(_os.path.abspath(__file__))
SHOTS = _os.path.join(HERE, 'shots'); _os.makedirs(SHOTS, exist_ok=True)  # screenshots go next to the tests
ARGS = ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--use-gl=angle"]
async def main():
    which = [int(a) for a in sys.argv[1:]] if len(sys.argv) > 1 else None
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await b.new_page(viewport={'width': 1800, 'height': 900})
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text))
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        await pg.goto('file://' + os.path.join(HERE, 'gallery.html'))
        n = await pg.evaluate('window.__gallery ? window.__gallery.count : -1')
        print('count', n)
        for i in (which if which is not None else range(n)):
            info = await pg.evaluate(f'window.__gallery.render({i})')
            print(json.dumps(info, ensure_ascii=False))
            await pg.screenshot(path=f'{SHOTS}/ac_{i:02d}.png')
        for l in logs: print(l)
        await b.close()
asyncio.run(main())
