"""Missile replenish time and flare cooldown, measured in game time (sum of the physics steps):
fire one radar and one IR missile, drop flares, and record when each comes back."""
import asyncio
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': 640, 'height': 480})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html?lowpoly'); await pg.wait_for_timeout(1500)
        r = await pg.evaluate('''async () => { const d = window.__df; d.UI.prefs.acJet = 'su27'; d.UI.setEra('jet');
          d.Game.start('practice', { mode: 'ffa', lim: 99, era: 'jet', bots: 0, diff: 1 }); d.UI.enterFlight();
          d.Input.apply = (pl) => { const c = pl.ctrl; c.pitch = 0; c.roll = 0; c.yaw = 0; c.thr = 0.8; c.ab = false; c.gun = false; c.flare = false; };
          const me = d.Game.me; me.invUntil = 0; await new Promise(r => setTimeout(r, 300));
          let gt = 0; const ph = me.physics.bind(me); me.physics = (dt) => { gt += dt; ph(dt); };
          const full = [me.mR, me.mI];
          me.wsel = 'rad'; me.mslCd = 0; d.W.fire(me, performance.now()); me.wsel = 'ir'; me.mslCd = 0; d.W.fire(me, performance.now());
          d.W.dropFlares(me, performance.now());
          const after = [me.mR, me.mI], cd0 = me.flareCdT, g0 = gt, w0 = performance.now();
          let tR = null, tI = null, tF = null;
          while (performance.now() - w0 < 60000 && (tR === null || tI === null || tF === null)) {
            await new Promise(r => setTimeout(r, 20));
            const t = gt - g0;
            if (tR === null && me.mR === full[0]) tR = t; if (tI === null && me.mI === full[1]) tI = t; if (tF === null && me.flareCdT <= 0) tF = t; }
          const again = d.W.dropFlares(me, performance.now());
          return { full, after, cd0, radarBack: tR && tR.toFixed(2), irBack: tI && tI.toFixed(2), flareReady: tF && tF.toFixed(2), flaresAgain: !!again }; }''')
        print(r)
        print(errs[:3])
        await b.close()

asyncio.run(main())
