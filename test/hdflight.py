"""In-flight look at the hi-detail models: chase view with afterburner, plus fixed side/rear/below views.
python3 test/hdflight.py f16 su27 ..."""
import asyncio, sys
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
IDS = sys.argv[1:] or ['f16']
# camera offsets in the aircraft's own frame (x right, y up, z back), looking at the aircraft
VIEWS = [('chase', None), ('rear', (2.5, 1.2, 16)), ('side', (16, 1.0, 1.0)), ('below', (6, -9, 6))]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': 1200, 'height': 720}, device_scale_factor=1)).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append('PAGEERROR: ' + str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html')
        await pg.wait_for_timeout(1200)
        for id in IDS:
            await pg.evaluate("(id) => { const d = window.__df, U = d.UI; U.prefs.acJet = id; U.setEra('jet'); }", id)
            for i in range(60):
                if await pg.evaluate("(id) => ['ready', 'failed'].includes(window.__df.HD.state[id])", id): break
                await pg.wait_for_timeout(100)
            await pg.evaluate('''() => { const d = window.__df; d.Game.start('practice', { mode: 'ffa', lim: 99, era: 'jet', bots: 0, diff: 1 }); d.UI.enterFlight();
              d.Input.apply = (pl) => { const c = pl.ctrl; c.pitch = 0; c.yaw = 0; c.roll = Math.max(-1, Math.min(1, pl.right(new d.V3()).y * 2)); c.thr = 1; c.ab = true; c.gun = false; };
              d.Game.me.invUntil = 0; }''')
            await pg.wait_for_timeout(1500)
            for name, off in VIEWS:
                if off is None:
                    await pg.evaluate("() => { const d = window.__df; if (d.CAM._u) { d.CAM.update = d.CAM._u; } }")
                else:
                    await pg.evaluate('''(o) => { const d = window.__df, C = d.CAM; if (!C._u) C._u = C.update;
                      C.update = function () { const me = d.Game.me, R = d.R; const v = new d.V3(o[0], o[1], o[2]).rot(me.q).add(me.pos);
                        R.cam.pos.copy(v); R.cam.fov = 40 * Math.PI / 180; R.cam.near = 0.5; R.cam.far = 70000; R.cam.ox = 0; R.cam.oy = 0; R.cam.q.lookDir(new d.V3().subV(me.pos, v).norm(), new d.V3(0, 1, 0).rot(me.q)); C.pos.copy(v); C.q.copy(R.cam.q); }; }''', list(off))
                await pg.wait_for_timeout(400)
                await pg.screenshot(path=f'/home/claude/dogfight/test/shots/fl_{id}_{name}.png')
            await pg.evaluate("() => { const d = window.__df; if (d.CAM._u) d.CAM.update = d.CAM._u; d.UI.leave(); }")
            await pg.wait_for_timeout(300)
        for e in errs[:10]: print(e)
        await b.close()

asyncio.run(main())
