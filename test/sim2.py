import asyncio, json, sys
from playwright.async_api import async_playwright
SECS = int(sys.argv[1]) if len(sys.argv) > 1 else 180
ERA = sys.argv[2] if len(sys.argv) > 2 else 'jet'
BOTS = int(sys.argv[3]) if len(sys.argv) > 3 else 5
SKILL = int(sys.argv[4]) if len(sys.argv) > 4 else 1
JS = r'''([SECS, ERA, BOTS, SKILL]) => { const d = window.__df, G = d.Game; d.Main.frame = () => {};
  G.start('practice', { mode: 'ffa', lim: 999, era: ERA, bots: BOTS, diff: SKILL });
  G.brains.set(G.me, new d.Brain(G.me, SKILL));
  const ev = { weapons: [0,0,0,0], launches: { rad: 0, ir: 0 }, flares: 0, gunHits: 0, mslHits: 0, decoys: 0, minAlt: 1e9, nan: 0, abUse: 0, maxG: 0 };
  const kl = G.killLocal.bind(G); G.killLocal = (pl, k, w, now) => { if (pl.alive) ev.weapons[w]++; return kl(pl, k, w, now); };
  const fire = d.W.fire.bind(d.W); d.W.fire = (pl, now) => { const m = fire(pl, now); if (m) ev.launches[m.def.type]++; return m; };
  const fl = d.W.dropFlares.bind(d.W); d.W.dropFlares = (pl, now) => { const r = fl(pl, now); if (r) ev.flares++; return r; };
  const bh = G.bulletHit.bind(G); G.bulletHit = (...a) => { ev.gunHits++; return bh(...a); };
  const dl = G.damageLocal.bind(G); G.damageLocal = (pl, dmg, k, w, at, now) => { if (w === 1) ev.mslHits++; return dl(pl, dmg, k, w, at, now); };
  let now = performance.now() + 5000; const dt = 1/60;
  for (let i = 0; i < SECS * 60; i++) { now += 1000 * dt; G.update(dt, now); d.FX.update(dt);
    for (const p of G.planes) { if (!p.alive) continue; if (!isFinite(p.pos.x + p.pos.y + p.pos.z + p.q.w)) ev.nan++; if (p.abOn) ev.abUse++;
      ev.minAlt = Math.min(ev.minAlt, p.pos.y - d.WORLD.groundAt(p.pos.x, p.pos.z)); ev.maxG = Math.max(ev.maxG, p.g); } }
  ev.abUse = +(ev.abUse / (SECS * 60 * G.planes.length)).toFixed(2); ev.maxG = +ev.maxG.toFixed(1); ev.minAlt = Math.round(ev.minAlt);
  return { ev, planes: G.planes.map(p => [p.name, p.def.id, p.kills, p.deaths, Math.round(p.hp), p.mR, p.mI]) }; }'''
async def main():
    async with async_playwright() as pw:
        b = await pw.chromium.launch()
        pg = await (await b.new_context(viewport={'width': 400, 'height': 300})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html'); await pg.wait_for_timeout(900)
        r = await pg.evaluate(JS, [SECS, ERA, BOTS, SKILL])
        print(json.dumps(r['ev']))
        for p in r['planes']: print(p)
        for e in errs[:5]: print('ERR', e)
        await b.close()
asyncio.run(main())
