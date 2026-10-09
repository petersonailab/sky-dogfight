"""Control surfaces on the hi-detail models: hangar shots with the stick held in fixed positions, one contact sheet per model.
python3 test/hdsurf.py f16 f14 ...   ->  test/shots/surf_<id>.png
F-14 also gets a top view with the wings spread (20 deg) and swept (68 deg)."""
import asyncio, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
IDS = sys.argv[1:] or ['f16', 'f22', 'f14', 'su27', 'typhoon', 'm2000', 'mig21']
POSES = [('neutral', [0, 0, 0, 140]), ('pitch up', [1, 0, 0, 140]), ('roll right', [0, 1, 0, 140]), ('yaw right', [0, 0, 1, 140])]
VIEW = (0.55, 0.38)        # rear three-quarter, from above
CLIP = {'x': 330, 'y': 90, 'width': 840, 'height': 520}


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': 1280, 'height': 800}, device_scale_factor=1)).new_page()
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html')
        await pg.wait_for_timeout(1200)
        await pg.evaluate("() => { const U = window.__df.UI; U.dragging = true; U.ctrlOverride = [0, 0, 0, 140]; U.zoom = 0.62; }")
        for id in IDS:
            await pg.evaluate("(id) => { const d = window.__df, U = d.UI; U.prefs.acJet = id; U.setEra('jet'); }", id)
            for i in range(80):
                st = await pg.evaluate("(id) => window.__df.HD.state[id]", id)
                if st in ('ready', 'failed'): break
                await pg.wait_for_timeout(100)
            shots = []
            SIDE, REAR, TOP = (1.5708, 0.05), (0.0, 0.12), (0.0, 0.95)
            views = [('neutral (side)', [0, 0, 0, 140], SIDE), ('pitch up (side)', [1, 0, 0, 140], SIDE),
                     ('neutral (rear)', [0, 0, 0, 140], REAR), ('roll right (rear)', [0, 1, 0, 140], REAR),
                     ('neutral (top rear)', [0, 0, 0, 140], TOP), ('yaw right (top rear)', [0, 0, 1, 140], TOP)]
            if id == 'f14':
                views += [('wings 20', [0, 0, 0, 140], (0.0, 1.45)), ('wings 68', [0, 0, 0, 340], (0.0, 1.45)),
                          ('wings 20 side', [0, 0, 0, 140], (1.0, 0.25)), ('wings 44 rear', [0, 0, 0, 245], (0.4, 0.3))]
            for name, o, (yaw, pitch) in views:
                await pg.evaluate("([o, y, pt]) => { const U = window.__df.UI; U.ctrlOverride = o; U.yaw = y; U.pitchOverride = pt;"
                                  " const hp = U.hangarPlane; if (hp && hp.def.id === 'f14') hp.sweep = Math.max(20, Math.min(68, 20 + 48 * (o[3] - 150) / 170)); }",
                                  [o, yaw, pitch])
                await pg.wait_for_timeout(700)
                f = f'/home/claude/dogfight/test/shots/_s_{id}_{len(shots)}.png'
                await pg.screenshot(path=f, clip=CLIP)
                shots.append((name, f))
            cols = 2
            rows = (len(shots) + 1) // 2
            CROP = (30, 40, 670, 480)
            W, H = CROP[2] - CROP[0], CROP[3] - CROP[1]
            sheet = Image.new('RGB', (W * cols, H * rows), (20, 20, 20))
            for i, (name, f) in enumerate(shots):
                im = Image.open(f).crop(CROP)
                ImageDraw.Draw(im).text((8, 6), f'{id} {name}', fill=(255, 255, 0))
                sheet.paste(im, ((i % cols) * W, (i // cols) * H))
            sheet.save(f'/home/claude/dogfight/test/shots/surf_{id}.png')
            print(id, st, len(shots), 'shots')
        for l in logs[:20]: print(l)
        await b.close()

asyncio.run(main())
