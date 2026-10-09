"""Orthographic-ish views (long lens) of a procedural model in the hangar: top, side, front, 3/4.
python3 test/procshots.py idf zero ...  -> test/shots/proc_<id>.png"""
import asyncio, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
IDS = sys.argv[1:] or ['idf']
W, H = 1000, 700
VIEWS = [('top', [0, 30, 0.01]), ('side', [30, 0.3, 0]), ('front', [0.01, 0.6, -30]), ('3/4', [-14, 9, -18])]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': W, 'height': H})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html?lowpoly'); await pg.wait_for_timeout(1500)
        for id in IDS:
            await pg.evaluate('''(id) => { const d = window.__df, def = d.AC_DEFS.find(a => a.id === id);
              if (def.era === 'jet') d.UI.prefs.acJet = id; else d.UI.prefs.acProp = id; d.UI.setEra(def.era);
              d.Game.start('practice', { mode: 'ffa', lim: 99, era: def.era, bots: 0, diff: 1 }); d.UI.enterFlight();
              const me = d.Game.me; me.invUntil = 0; me.pos.set(0, 2500, 0); me.q.ident();
              me.physics = function () { this.speed = 140; this.vel.set(0, 0, -140); this.rate.set(0, 0, 0); };
              d.Input.apply = (pl) => { const c = pl.ctrl; c.pitch = 0; c.roll = 0; c.yaw = 0; c.thr = 0.5; c.ab = false; c.gun = false; };
              const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
              const C = d.CAM; C.update = function () { const me = d.Game.me, R = d.R, o = window.__o;
                const eye = new d.V3(o[0], o[1], o[2]).rot(me.q).add(me.pos);
                R.cam.pos.copy(eye); R.cam.fov = 26 * Math.PI / 180; R.cam.near = 1; R.cam.far = 70000; R.cam.ox = 0; R.cam.oy = 0;
                const up = Math.abs(o[1]) > 20 ? new d.V3(0, 0, -1) : new d.V3(0, 1, 0);
                R.cam.q.lookDir(new d.V3().subV(me.pos, eye).norm(), up.rot(me.q)); C.pos.copy(eye); C.q.copy(R.cam.q); }; }''', id)
            shots = []
            for name, o in VIEWS:
                await pg.evaluate("(o) => { window.__o = o; }", o)
                await pg.wait_for_timeout(500)
                f = f'/home/claude/dogfight/test/shots/_p_{id}_{len(shots)}.png'
                await pg.screenshot(path=f); shots.append((name, f))
            sheet = Image.new('RGB', (W, H), (0, 0, 0))
            for i, (n, f) in enumerate(shots):
                im = Image.open(f).resize((W // 2, H // 2)); ImageDraw.Draw(im).text((6, 6), f'{id} {n}', fill=(255, 255, 0))
                sheet.paste(im, ((i % 2) * W // 2, (i // 2) * H // 2))
            sheet.save(f'/home/claude/dogfight/test/shots/proc_{id}.png')
            await pg.evaluate("() => window.__df.UI.leave()")
        print(errs[:5])
        await b.close()
asyncio.run(main())
