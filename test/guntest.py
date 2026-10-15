"""Guns with overheating (Rafale, Su-30, F-15E) and the range-dependent MICA lock time, stepped in game time:
hold the trigger until the gun overheats, count the rounds and the damage per second, time the lock-out, then let a
half-hot barrel cool. An ammunition gun (F-16) is checked for comparison."""
import asyncio, json
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
JS = r'''(ids) => { const d = window.__df, G = d.Game, W = d.W; d.Main.frame = () => {};
  const out = {};
  for (const id of ids) {
    d.UI.prefs.acJet = id; d.UI.setEra('jet');
    G.start('practice', { mode: 'ffa', lim: 99, era: 'jet', bots: 0, diff: 1 });
    const me = G.me, st = me.st, dt = 1 / 60; let now = performance.now() + 9000, t = 0, shots = 0, tFull = null;
    const bl = W.bullet.bind(W); W.bullet = (pl, local) => { if (pl === me) shots++; return bl(pl, local); };
    me.ctrl.gun = true;
    const ammo0 = me.ammo;
    for (let i = 0; i < 60 * 20; i++) { t += dt; now += dt * 1000; W.guns(me, dt, now, false);
      if (st.spin && tFull === null && me.spin >= 1) tFull = t;
      if (st.heat ? me.gunLock > 0 : me.ammo < 1) break; }
    const r = { fired: shots, tFire: +t.toFixed(2), dps: +(shots * st.gunDmg * 1.35 / t).toFixed(0), spinUp: tFull && +tFull.toFixed(2), ammoStart: ammo0 };
    if (st.heat) {
      me.ctrl.gun = true; let lockT = 0, s0 = shots;
      while (me.gunLock > 0) { lockT += dt; now += dt * 1000; W.guns(me, dt, now, false); }
      r.lockFor = +lockT.toFixed(2); r.shotsWhileLocked = shots - s0;
      me.ctrl.gun = false; me.heat = 0.5; let coolT = 0;
      while (me.heat > 0 && coolT < 30) { coolT += dt; now += dt * 1000; W.guns(me, dt, now, false); }
      r.coolFromHalf = +coolT.toFixed(2);
    }
    W.bullet = bl; out[id] = r; d.UI.leave();
  }
  const M = d.MISSILES.micair; out.micaLock = [1, 2, 4.5, 7, 11.5].map(km => [km, +d.lockTime(M, km * 1000).toFixed(2)]);
  out.otherLock = d.lockTime(d.MISSILES.aim120, 9000);
  out.ranges = Object.fromEntries(Object.values(d.MISSILES).map(m => [m.id, m.lock]));
  out.radar = Object.fromEntries(d.AC_DEFS.map(a => [a.id, a.st.radar]));
  return out; }'''


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': 400, 'height': 300})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html?lowpoly'); await pg.wait_for_timeout(1500)
        r = await pg.evaluate(JS, ['rafale', 'su30', 'f15', 'f16'])
        for k, v in r.items():
            print(k, json.dumps(v, ensure_ascii=False))
        print(errs[:3])
        await b.close()

asyncio.run(main())
