import asyncio, json
from playwright.async_api import async_playwright
JS = r'''(cases) => { const d = window.__df, G = d.Game, V3 = d.V3, Q = d.Q; d.Main.frame = () => {};
  const res = [];
  for (const cs of cases) {
    G.start('practice', { mode: 'ffa', lim: 999, era: 'jet', bots: 0, diff: 1 });
    let now = performance.now() + 5000; const dt = 1 / 60;
    const me = G.me; me.setAircraft(d.AC_BY_ID[cs.shooter]); 
    const q0 = new Q().lookDir(new V3(0, 0, -1), new V3(0, 1, 0));
    me.spawn(new V3(0, 3000, cs.dist), q0, now); me.invUntil = 0; me.speed = 250; me.fwd(me.vel).scale(250);
    me.wsel = cs.type;
    const T = new d.Plane({ key: 'local.5', owner: 'local', idx: 5, local: true, bot: true, name: 'T', color: '#ffffff', ac: d.AC_BY_ID[cs.target || 'f16'] });
    G.addPlane(T); T.spawn(new V3(cs.off || 0, 3000, 0), q0, now); T.invUntil = 0; T.speed = 230; T.fwd(T.vel).scale(230);
    let lockAt = -1, fired = null, result = 'miss', hitAt = -1, minD = 1e9, flareDone = false;
    const hp0 = T.hp;
    for (let i = 0; i < 60 * 25; i++) {
      now += 1000 * dt;
      // shooter flies level straight at the target
      d.steerTo(me, new V3().copy(T.pos), me.ctrl, 1); me.ctrl.thr = 1; me.ctrl.ab = false; me.ctrl.gun = false;
      // target: straight, or hard turn after launch
      if (cs.evade && fired) { const right = T.right(new V3()), up = T.up(new V3()); const bank = Math.atan2(right.y, up.y);
        T.ctrl.roll = Math.max(-1, Math.min(1, (bank + 1.45) * 4)); T.ctrl.pitch = 1; T.ctrl.ab = true; }
      else { T.ctrl.pitch = 0; T.ctrl.roll = Math.max(-1, Math.min(1, T.right(new V3()).y * 2)); T.ctrl.thr = 0.9; }
      if (cs.flare && fired && fired.alive && !flareDone && fired.pos.dist(T.pos) < cs.flare) { T.ctrl.flare = true; flareDone = true; }
      if (me.lock.locked && lockAt < 0) lockAt = i * dt;
      if (me.lock.locked && !fired) { me.ctrl.msl = true; }
      G.update(dt, now);
      if (!fired) { fired = d.W.missiles.find(m => m.local && m.owner === me) || null; if (fired) fired.firedAt = i * dt; }
      if (fired && fired.alive) minD = Math.min(minD, fired.pos.dist(T.pos));
      if (T.hp < hp0 && hitAt < 0) { hitAt = i * dt; result = T.alive ? 'hit' : 'kill'; }
      if (fired && !fired.alive && i * dt > fired.firedAt + 0.5) break;
    }
    res.push({ ...cs, lockAt: +lockAt.toFixed(2), firedAt: fired ? +fired.firedAt.toFixed(2) : -1, result, flight: hitAt > 0 && fired ? +(hitAt - fired.firedAt).toFixed(2) : -1, dmg: Math.round(hp0 - T.hp), minD: Math.round(minD), decoyed: fired && fired.target && fired.target.flare ? 1 : 0 });
  }
  return res; }'''
CASES = [
  {"shooter": "f16", "type": "rad", "dist": 7000}, {"shooter": "f16", "type": "rad", "dist": 4000},
  {"shooter": "f16", "type": "ir", "dist": 2500}, {"shooter": "f14", "type": "rad", "dist": 11500},
  {"shooter": "su27", "type": "rad", "dist": 6800}, {"shooter": "m2000", "type": "rad", "dist": 6000},
  {"shooter": "typhoon", "type": "rad", "dist": 11000}, {"shooter": "f16", "type": "rad", "dist": 9000},
  {"shooter": "f16", "type": "rad", "dist": 5000, "evade": 1}, {"shooter": "f16", "type": "ir", "dist": 2400, "evade": 1},
  {"shooter": "f16", "type": "ir", "dist": 2500, "flare": 1200}, {"shooter": "f16", "type": "rad", "dist": 5000, "flare": 2000},
  {"shooter": "f16", "type": "rad", "dist": 5000, "off": 800},
]
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await (await b.new_context(viewport={'width': 400, 'height': 300})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html'); await pg.wait_for_timeout(900)
        for r in await pg.evaluate(JS, CASES): print(json.dumps(r))
        for e in errs[:5]: print('ERR', e)
        await b.close()
asyncio.run(main())
