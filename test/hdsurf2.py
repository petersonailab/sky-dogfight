"""Close-ups of the hi-detail control surfaces in flight (physics frozen, camera bolted to the aircraft).
For every hinged part: neutral vs. full deflection from the view that shows it best.
python3 test/hdsurf2.py f16 f22 ...  ->  test/shots/cs_<id>.png"""
import asyncio, sys, json
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
IDS = sys.argv[1:] or ['f16', 'f22', 'f14', 'su27', 'typhoon', 'm2000', 'mig21']
W, H = 1000, 640

SETUP = '''() => { const d = window.__df;
  d.Game.start('practice', { mode: 'ffa', lim: 99, era: window.__era || 'jet', bots: 0, diff: 1 }); d.UI.enterFlight();
  window.__pose = [0, 0, 0]; window.__spd = 140; window.__sweep = null;
  const me = d.Game.me; me.invUntil = 0; me.pos.set(0, 3000, 0); me.q.ident();
  me.physics = function () { this.speed = window.__spd; this.vel.set(0, 0, -this.speed); this.rate.set(0, 0, 0); };
  const vis = me.visual.bind(me);
  me.visual = (dt, now) => { if (window.__sweep !== null) me.sweep = window.__sweep; vis(dt, now); };
  d.Input.apply = (pl) => { const c = pl.ctrl, p = window.__pose; c.pitch = p[0]; c.roll = p[1]; c.yaw = p[2]; c.thr = 0.5; c.ab = false; c.gun = false; };
  const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
  const C = d.CAM; C.update = function () { const me = d.Game.me, R = d.R, v = window.__view;
    const tgt = new d.V3(v.t[0], v.t[1], v.t[2]).rot(me.q).add(me.pos);
    const eye = new d.V3(v.t[0] + v.o[0], v.t[1] + v.o[1], v.t[2] + v.o[2]).rot(me.q).add(me.pos);
    R.cam.pos.copy(eye); R.cam.fov = (v.fov || 34) * Math.PI / 180; R.cam.near = 0.2; R.cam.far = 70000; R.cam.ox = 0; R.cam.oy = 0;
    const up = Math.abs(v.o[1]) > 0.9 * Math.hypot(v.o[0], v.o[1], v.o[2]) ? new d.V3(0, 0, -1) : new d.V3(0, 1, 0);
    R.cam.q.lookDir(new d.V3().subV(tgt, eye).norm(), up.rot(me.q)); C.pos.copy(eye); C.q.copy(R.cam.q); };
}'''

# views built from the model's own hinge data: pick the right-hand (side >= 0) part of each kind
VIEWS = '''(id) => { const m = window.__df.HD.models[id], out = [], seen = {};
  if (!m) return out;
  m.bones.forEach((b, i) => { if (!b || b.side < 0 || seen[b.kind]) return; seen[b.kind] = 1; const p = b.pivot;
    if (b.kind === 'stab' || b.kind === 'canard' || b.kind === 'elev') { out.push({ name: b.kind + ' pitch up (side)', t: [p[0] + 0.8, p[1], p[2] + 0.6], o: [7, 0.6, 0], pose: [1, 0, 0] });
      out.push({ name: b.kind + ' roll right (rear)', t: [p[0] * 0.5, p[1], p[2] + 0.8], o: [0, 1.2, 9], pose: [0, 1, 0] }); }
    else if (b.kind === 'elevon') { out.push({ name: 'elevon pitch up (side)', t: [p[0] + 1.0, p[1], p[2] + 0.4], o: [7, 0.6, 0], pose: [1, 0, 0] });
      out.push({ name: 'elevon roll right (rear)', t: [0, p[1], p[2] + 0.6], o: [0, 1.2, 10], pose: [0, 1, 0] }); }
    else if (b.kind === 'ail') out.push({ name: 'aileron roll right (rear)', t: [p[0] + 0.9, p[1], p[2] + 0.5], o: [0.8, 0.9, 7], pose: [0, 1, 0] });
    else if (b.kind === 'rud') out.push({ name: 'rudder yaw right (top rear)', t: [p[0], p[1] + 0.9, p[2] + 0.6], o: [0, 5, 6], pose: [0, 0, 1] });
  });
  return out; }'''


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': W, 'height': H}, device_scale_factor=1)).new_page()
        logs = []
        pg.on('console', lambda m: logs.append(m.type + ': ' + m.text) if m.type in ('error', 'warning') else None)
        pg.on('pageerror', lambda e: logs.append('PAGEERROR: ' + str(e)))
        await pg.goto('http://127.0.0.1:8765/test/game.html')
        await pg.wait_for_timeout(1200)
        for id in IDS:
            await pg.evaluate("(id) => { const d = window.__df, U = d.UI, def = d.AC_DEFS.find(a => a.id === id); window.__era = def.era;"
                              " if (def.era === 'jet') U.prefs.acJet = id; else U.prefs.acProp = id; U.setEra(def.era); }", id)
            for i in range(80):
                st = await pg.evaluate("(id) => window.__df.HD.state[id]", id)
                if st in ('ready', 'failed'): break
                await pg.wait_for_timeout(100)
            await pg.evaluate("() => { window.__view = { t: [0, 0, 0], o: [0, 3, 20] }; }")
            await pg.evaluate(SETUP)
            views = await pg.evaluate(VIEWS, id)
            if id == 'f14':
                views += [{'name': 'wings 20 (top)', 't': [0, 0, 1], 'o': [0, 34, 0.01], 'pose': [0, 0, 0], 'sweep': 20},
                          {'name': 'wings 68 (top)', 't': [0, 0, 1], 'o': [0, 34, 0.01], 'pose': [0, 0, 0], 'sweep': 68},
                          {'name': 'wings 20 (front low)', 't': [0, 0, 0], 'o': [-9, 3, -16], 'pose': [0, 0, 0], 'sweep': 20},
                          {'name': 'wings 44 (rear high)', 't': [0, 0, 1], 'o': [6, 9, 18], 'pose': [0, 0, 0], 'sweep': 44}]
            shots = []
            for v in views:
                pairs = [('', v['pose'])] if 'sweep' in v else [('neutral', [0, 0, 0]), ('', v['pose'])]
                for tag, pose in pairs:
                    await pg.evaluate("([v, pose]) => { window.__view = v; window.__pose = pose; window.__sweep = v.sweep === undefined ? null : v.sweep; }", [v, pose])
                    await pg.wait_for_timeout(600)
                    f = f'/home/claude/dogfight/test/shots/_c_{id}_{len(shots)}.png'
                    await pg.screenshot(path=f)
                    shots.append((v['name'] if 'sweep' in v else v['name'] + (' [NEUTRAL]' if tag else ' [DEFLECTED]'), f))
            if not shots:
                print(id, st, 'no views'); continue
            cw, ch = W // 2, H // 2
            cols = 2; rows = (len(shots) + 1) // 2
            sheet = Image.new('RGB', (cw * cols, ch * rows), (20, 20, 20))
            for i, (name, f) in enumerate(shots):
                im = Image.open(f).resize((cw, ch))
                ImageDraw.Draw(im).text((8, 6), f'{id} {name}', fill=(255, 255, 0))
                sheet.paste(im, ((i % cols) * cw, (i // cols) * ch))
            sheet.save(f'/home/claude/dogfight/test/shots/cs_{id}.png')
            print(id, st, len(shots), 'shots')
            await pg.evaluate("() => { const d = window.__df; d.UI.leave(); }")
            await pg.wait_for_timeout(300)
        for l in logs[:20]: print(l)
        await b.close()

asyncio.run(main())
