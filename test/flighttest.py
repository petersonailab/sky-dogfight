import asyncio, json
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader","--enable-unsafe-swiftshader","--ignore-gpu-blocklist","--use-gl=angle"]
JS = r'''() => { const d = window.__df, V3 = d.V3, Q = d.Q; d.Main.frame = () => {};
  const out = []; const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  for (const def of d.AC_DEFS) {
    const P = d.perfOf(def), st = def.st, dt = 1 / 120;
    const mk = () => { const p = new d.Plane({ key: 't.0', owner: 't', local: true, name: 'T', color: '#ffffff', ac: def }); p.spawn(new V3(0, 2500, 0), new Q().lookDir(new V3(0, 0, -1), new V3(0, 1, 0)), 0); p.invUntil = 0; return p; };
    const level = (p) => { const tgt = new V3().copy(p.pos).add(new V3().copy(p.fwd(new V3())).scale(3000)); tgt.y = 2500; d.steerTo(p, tgt, p.ctrl, 1); };
    // 1) level, afterburner
    let p = mk(); for (let i = 0; i < 120 * 45; i++) { level(p); p.ctrl.ab = true; p.ctrl.thr = 1; p.abFuel = P.abFuel; p.physics(dt); }
    const vAB = p.speed * 3.6;
    // 2) level, military power
    p = mk(); for (let i = 0; i < 120 * 45; i++) { level(p); p.ctrl.ab = false; p.ctrl.thr = 1; p.physics(dt); }
    const vMil = p.speed * 3.6;
    // 3) sustained level turn, full pull, with and without afterburner
    const turn = (ab) => { const p = mk(); let h0 = 0, t0 = 0, spdSum = 0, n = 0;
      for (let i = 0; i < 120 * 30; i++) {
        const right = p.right(new V3()), up = p.up(new V3()); const bank = Math.atan2(right.y, up.y);
        const want = -clamp(Math.acos(1 / 8) + p.vel.y * 0.004, 1.2, 1.62); p.ctrl.roll = Math.max(-1, Math.min(1, (bank - want) * 4)); p.ctrl.pitch = 1; p.ctrl.yaw = 0;
        p.ctrl.ab = ab; p.ctrl.thr = 1; if (ab) p.abFuel = P.abFuel; p.physics(dt);
        if (i === 120 * 20) { const f = p.fwd(new V3()); h0 = Math.atan2(f.x, -f.z); t0 = i; }
        if (i > 120 * 20) { spdSum += p.speed; n++; }
      }
      const f = p.fwd(new V3()); let dh = Math.atan2(f.x, -f.z) - h0; // unwrap using turn count estimate
      return { v: spdSum / n * 3.6, alt: Math.round(p.pos.y) };
    };
    const tAB = turn(true), tMil = turn(false);
    // turn rate available at the sustained speeds
    const pr = mk();
    const wAB = pr.turnRate(tAB.v / 3.6) * 180 / Math.PI, wMil = pr.turnRate(tMil.v / 3.6) * 180 / Math.PI;
    // 4) vertical climb, afterburner
    p = mk(); p.q.lookDir(new V3(0, 1, -0.0001).norm(), new V3(0, 0, 1)); p.fwd(p.vel).scale(p.speed);
    for (let i = 0; i < 120 * 25; i++) { const tgt = new V3().copy(p.pos).add(new V3(0, 3000, -1)); d.steerTo(p, tgt, p.ctrl, 1); p.ctrl.ab = true; p.ctrl.thr = 1; p.abFuel = P.abFuel; p.physics(dt); }
    const vClimb = p.speed * 3.6;
    // 5) 0 -> 90% top speed time with AB from corner speed
    out.push({ id: def.id, vAB: Math.round(vAB), want_vab: st.vab, vMil: Math.round(vMil), want_vmax: st.vmax,
      turnAB_v: Math.round(tAB.v), want_vtab: st.vtab, altAB: tAB.alt, altMil: tMil.alt, turnAB_rate: +wAB.toFixed(1), turnMil_v: Math.round(tMil.v), want_vt: st.vt, turnMil_rate: +wMil.toFixed(1),
      best: st.wb, climb: Math.round(vClimb), want_vcl: st.vcl });
  }
  return out; }'''
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': 400, 'height': 300})).new_page()
        errs = []
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html'); await pg.wait_for_timeout(900)
        r = await pg.evaluate(JS)
        for x in r: print(json.dumps(x))
        for e in errs[:5]: print('ERR', e)
        await b.close()
asyncio.run(main())
