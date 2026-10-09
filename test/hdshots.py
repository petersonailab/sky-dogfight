"""Hangar screenshots of the hi-detail models from a few angles: python3 test/hdshots.py f16 su27 ..."""
import asyncio, sys, json
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
IDS = sys.argv[1:] or ['f16']
ANGLES = [(-0.7, 0.32), (2.3, 0.32), (3.9, 0.15), (0.9, -0.35)]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)).new_page()
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning', 'info') else None)
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html')
        await pg.wait_for_timeout(1200)
        # keep the camera still while we pose it
        await pg.evaluate("() => { const U = window.__df.UI; U.dragging = true; }")
        for id in IDS:
            await pg.evaluate("(id) => { const d = window.__df, U = d.UI, def = d.AC_DEFS.find(a => a.id === id);"
                              " if (def.era === 'jet') U.prefs.acJet = id; else U.prefs.acProp = id; U.setEra(def.era); U.ctrlOverride = [0, 0, 0, 140]; }", id)
            for i in range(80):
                st = await pg.evaluate("(id) => window.__df.HD.state[id]", id)
                if st in ('ready', 'failed'): break
                await pg.wait_for_timeout(100)
            info = await pg.evaluate("(id) => { const m = window.__df.HD.models[id]; return m ? { tris: m.tris, groups: m.groups.length, tex: m.tex.length, stores: !!m.stores } : null; }", id)
            print(id, st, json.dumps(info))
            for k, (yaw, pitch) in enumerate(ANGLES):
                await pg.evaluate("([y, p]) => { const U = window.__df.UI; U.yaw = y; U.pitchOverride = p; }", [yaw, pitch])
                await pg.wait_for_timeout(250)
                await pg.screenshot(path=f'/home/claude/dogfight/test/shots/hd_{id}_{k}.png', clip={'x': 400, 'y': 60, 'width': 700, 'height': 560})
        for l in logs[:20]: print(l)
        await b.close()

asyncio.run(main())
