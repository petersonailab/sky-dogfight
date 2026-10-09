"""Fire a radar and an IR missile and look at them in flight from close by (checks orientation and the hi-detail model).
python3 test/mslfly.py f16 su27 ...  -> test/shots/mslfly_<id>.png"""
import asyncio, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
IDS = sys.argv[1:] or ['f16']
W, H = 900, 560


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': W, 'height': H})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html'); await pg.wait_for_timeout(1500)
        for id in IDS:
            await pg.evaluate("(id) => { const U = window.__df.UI; U.prefs.acJet = id; U.setEra('jet'); }", id)
            for i in range(80):
                if await pg.evaluate("(id) => ['ready','failed'].includes(window.__df.HD.state[id]) && window.__df.HD.state.missiles === 'ready'", id): break
                await pg.wait_for_timeout(100)
            await pg.evaluate('''() => { const d = window.__df; d.Game.start('practice', { mode: 'ffa', lim: 99, era: 'jet', bots: 0, diff: 1 }); d.UI.enterFlight();
              d.Input.apply = (pl) => { const c = pl.ctrl; c.pitch = 0; c.yaw = 0; c.roll = 0; c.thr = 0.8; c.ab = false; };
              const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
              d.Game.me.invUntil = 0; window.__mk = null;
              const C = d.CAM; C.update = function () { const me = d.Game.me, R = d.R, m = d.W.missiles.find(x => x.key === window.__mk) || null;
                const tgt = m ? m.pos : me.pos, q = m ? m.q : me.q;
                const v = new d.V3(window.__off[0], window.__off[1], window.__off[2]).rot(q).add(tgt);
                R.cam.pos.copy(v); R.cam.fov = 40 * Math.PI / 180; R.cam.near = 0.2; R.cam.far = 70000; R.cam.ox = 0; R.cam.oy = 0;
                R.cam.q.lookDir(new d.V3().subV(tgt, v).norm(), new d.V3(0, 1, 0).rot(q)); C.pos.copy(v); C.q.copy(R.cam.q); }; }''')
            await pg.wait_for_timeout(600)
            shots = []
            for w in ('rad', 'ir'):
                k = await pg.evaluate("(w) => { const d = window.__df, me = d.Game.me; me.wsel = w; me.mslCd = 0; const m = d.W.fire(me, performance.now()); window.__mk = m ? m.key : null; return window.__mk; }", w)
                for t, off in ((450, [4.5, 1.2, 1.5]), (1300, [3.0, 0.8, 6.0])):
                    await pg.evaluate("(o) => { window.__off = o; }", off)
                    await pg.wait_for_timeout(t if t < 1000 else 500)
                    f = f'/home/claude/dogfight/test/shots/_mf_{id}_{len(shots)}.png'
                    await pg.screenshot(path=f); shots.append((f'{w} {t}ms', f))
            sheet = Image.new('RGB', (W, H), (0, 0, 0))
            for i, (n, f) in enumerate(shots):
                im = Image.open(f).resize((W // 2, H // 2)); ImageDraw.Draw(im).text((6, 6), f'{id} {n}', fill=(255, 255, 0))
                sheet.paste(im, ((i % 2) * W // 2, (i // 2) * H // 2))
            sheet.save(f'/home/claude/dogfight/test/shots/mslfly_{id}.png')
            print(id, 'ok')
            await pg.evaluate("() => { window.__df.UI.leave(); }")
        print(errs[:5])
        await b.close()
asyncio.run(main())
