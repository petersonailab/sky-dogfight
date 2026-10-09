"""Fire some missiles and check that the matching ones disappear from the model."""
import asyncio, sys
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
IDS = sys.argv[1:] or ['m2000', 'f16']
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': 1000, 'height': 640})).new_page()
        await pg.goto('http://127.0.0.1:8765/test/game.html'); await pg.wait_for_timeout(1200)
        for id in IDS:
            await pg.evaluate("(id) => { const U = window.__df.UI; U.prefs.acJet = id; U.setEra('jet'); }", id)
            for i in range(60):
                if await pg.evaluate("(id) => window.__df.HD.state[id] === 'ready'", id): break
                await pg.wait_for_timeout(100)
            await pg.evaluate('''() => { const d = window.__df; d.Game.start('practice', { mode: 'ffa', lim: 99, era: 'jet', bots: 0, diff: 1 }); d.UI.enterFlight();
              d.Input.apply = (pl) => { const c = pl.ctrl; c.pitch = 0; c.yaw = 0; c.roll = Math.max(-1, Math.min(1, pl.right(new d.V3()).y * 2)); c.thr = 0.8; c.ab = false; };
              d.Game.me.invUntil = 0;
              const C = d.CAM; C._u = C.update; C.update = function () { const me = d.Game.me, R = d.R; const v = new d.V3(5, -8, 7).rot(me.q).add(me.pos);
                R.cam.pos.copy(v); R.cam.fov = 45 * Math.PI / 180; R.cam.near = 0.5; R.cam.far = 70000; R.cam.ox = 0; R.cam.oy = 0;
                R.cam.q.lookDir(new d.V3().subV(me.pos, v).norm(), new d.V3(0, 1, 0).rot(me.q)); C.pos.copy(v); C.q.copy(R.cam.q); }; }''')
            await pg.wait_for_timeout(800)
            await pg.screenshot(path=f'/home/claude/dogfight/test/shots/fire_{id}_0.png')
            # fire two radar and one IR missile (no target: they fly straight)
            r = await pg.evaluate('''() => { const d = window.__df, me = d.Game.me, out = [];
              me.wsel = 'rad'; for (let i = 0; i < 2; i++) { me.mslCd = 0; const m = d.W.fire(me, performance.now()); out.push(m && m.pos.toArray ? m.pos.toArray() : (m ? [m.pos.x, m.pos.y, m.pos.z] : null)); }
              me.wsel = 'ir'; me.mslCd = 0; const m = d.W.fire(me, performance.now()); out.push(m ? [m.pos.x, m.pos.y, m.pos.z] : null);
              const rel = out.map(p => p && new d.V3(p[0], p[1], p[2]).sub(me.pos).irot(me.q)).map(v => v && [v.x.toFixed(2), v.y.toFixed(2), v.z.toFixed(2)]);
              return { left: [me.mR, me.mI], launchRel: rel, look: [me.look.firedR, me.look.firedI] }; }''')
            print(id, r)
            await pg.wait_for_timeout(120)
            await pg.screenshot(path=f'/home/claude/dogfight/test/shots/fire_{id}_1.png')
            await pg.wait_for_timeout(1500)
            await pg.screenshot(path=f'/home/claude/dogfight/test/shots/fire_{id}_2.png')
            await pg.evaluate("() => { const d = window.__df; d.CAM.update = d.CAM._u; d.UI.leave(); }")
        await b.close()
asyncio.run(main())
