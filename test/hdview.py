"""In-flight views of an aircraft with physics frozen and the camera bolted to it (contact sheet per aircraft).
python3 test/hdview.py <preset> id1 id2 ...   presets: stores | flames | prop | all
-> test/shots/view_<preset>_<id>.png"""
import asyncio, sys
from playwright.async_api import async_playwright
from PIL import Image, ImageDraw
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
PRESET = sys.argv[1] if len(sys.argv) > 1 else 'stores'
IDS = sys.argv[2:] or ['f16']
W, H = 1000, 640
# (name, target in aircraft frame, camera offset from target, throttle, afterburner, fov)
VIEWS = {
    'stores': [('below left', [0, -0.6, 0.5], [-7, -4.5, -6], 0.5, False, 40), ('below right rear', [0, -0.6, 0.5], [8, -4, 9], 0.5, False, 40),
               ('side low', [0, -0.5, 0], [14, -1.2, 0], 0.5, False, 40), ('front low', [0, -0.5, -2], [-5, -2.2, -13], 0.5, False, 40)],
    'flames': [('rear AB', [0, 0, 4], [3, 1.5, 16], 1, True, 40), ('side AB', [0, 0, 9], [16, 1.0, 0], 1, True, 40),
               ('top AB', [0, 0, 10], [0.01, 18, 0], 1, True, 40), ('rear mil', [0, 0, 4], [3, 1.5, 16], 0.9, False, 40)],
    'prop': [('front 3/4', [0, 0, -1], [-6, 2, -9], 0.8, False, 40), ('rear 3/4', [0, 0, 0], [7, 3, 10], 0.8, False, 40),
             ('side', [0, 0, 0], [14, 0.5, 0], 0.8, False, 40), ('below', [0, 0, 0], [3, -10, 2], 0.8, False, 40)],
}
VIEWS['all'] = VIEWS['stores'][:2] + VIEWS['flames'][:2]
# propeller seen from the front at a few moments: the blade roots must stay on the spinner
VIEWS['propfront'] = [('front t0', [0, 0, -3], [0.01, 0.3, -11], 0.8, False, 40), ('front t1', [0, 0, -3], [0.01, 0.3, -11], 0.8, False, 40),
                      ('front 3/4', [0, 0, -3], [-6, 1.5, -9], 0.8, False, 40), ('side', [0, 0, -2], [9, 0.3, -1], 0.8, False, 40)]
# close-ups of the first radar and the first IR store ('S0' / 'S1' targets are filled in from the aircraft)
VIEWS['close'] = [('radar missile side', 'R', [2.6, -0.5, 0.3], 0.5, False, 40), ('radar missile 3/4 front', 'R', [1.6, -1.0, -2.6], 0.5, False, 40),
                  ('IR missile side', 'I', [2.0, -0.4, 0.2], 0.5, False, 40), ('IR missile 3/4 rear', 'I', [1.4, -0.8, 2.2], 0.5, False, 40)]

SETUP = '''([thr, ab]) => { const d = window.__df;
  d.Game.start('practice', { mode: 'ffa', lim: 99, era: window.__era || 'jet', bots: 0, diff: 1 }); d.UI.enterFlight();
  const me = d.Game.me; me.invUntil = 0; me.pos.set(0, 2500, 0); me.q.ident();
  me.physics = function () { this.speed = 200; this.vel.set(0, 0, -200); this.rate.set(0, 0, 0); this.abOn = !!window.__ab; };
  d.Input.apply = (pl) => { const c = pl.ctrl; c.pitch = 0; c.roll = 0; c.yaw = 0; c.thr = window.__thr; c.ab = !!window.__ab; c.gun = false; };
  const hud = document.getElementById('hud'); if (hud) hud.style.display = 'none';
  const C = d.CAM; C.update = function () { const me = d.Game.me, R = d.R, v = window.__view;
    const tgt = new d.V3(v.t[0], v.t[1], v.t[2]).rot(me.q).add(me.pos);
    const eye = new d.V3(v.t[0] + v.o[0], v.t[1] + v.o[1], v.t[2] + v.o[2]).rot(me.q).add(me.pos);
    R.cam.pos.copy(eye); R.cam.fov = (v.fov || 40) * Math.PI / 180; R.cam.near = 0.2; R.cam.far = 70000; R.cam.ox = 0; R.cam.oy = 0;
    const up = Math.abs(v.o[1]) > 0.9 * Math.hypot(v.o[0], v.o[1], v.o[2]) ? new d.V3(0, 0, -1) : new d.V3(0, 1, 0);
    R.cam.q.lookDir(new d.V3().subV(tgt, eye).norm(), up.rot(me.q)); C.pos.copy(eye); C.q.copy(R.cam.q); };
}'''


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
            era = await pg.evaluate("(id) => { const d = window.__df, U = d.UI, def = d.AC_DEFS.find(a => a.id === id); window.__era = def.era;"
                                    " if (def.era === 'jet') U.prefs.acJet = id; else U.prefs.acProp = id; U.setEra(def.era); return def.era; }", id)
            for i in range(100):
                st = await pg.evaluate("(id) => [window.__df.HD.state[id], window.__df.HD.state.missiles]", id)
                if st[0] in ('ready', 'failed', None) and st[1] in ('ready', 'failed'): break
                await pg.wait_for_timeout(100)
            await pg.evaluate("() => { window.__view = { t: [0, 0, 0], o: [0, 3, 20] }; window.__thr = 0.5; window.__ab = false; }")
            await pg.evaluate(SETUP, [0.5, False])
            shots = []
            for name, t, o, thr, ab, fov in VIEWS[PRESET]:
                if isinstance(t, str):   # centre of the first radar / IR store (hi-detail placement)
                    t = await pg.evaluate("(w) => { const me = window.__df.Game.me, si = me.storeInstances() || [], it = si.find(s => s.ir === (w === 'I'));"
                                          " return it ? [it.M[12], it.M[13], it.M[14]] : [0, -0.6, 0]; }", t)
                await pg.evaluate("([t, o, thr, ab, fov]) => { window.__view = { t, o, fov }; window.__thr = thr; window.__ab = ab; }", [t, o, thr, ab, fov])
                await pg.wait_for_timeout(700)
                f = f'/home/claude/dogfight/test/shots/_v_{id}_{len(shots)}.png'
                await pg.screenshot(path=f)
                shots.append((name, f))
            cw, ch = W // 2, H // 2
            sheet = Image.new('RGB', (cw * 2, ch * ((len(shots) + 1) // 2)), (20, 20, 20))
            for i, (name, f) in enumerate(shots):
                im = Image.open(f).resize((cw, ch))
                ImageDraw.Draw(im).text((8, 6), f'{id} {name}', fill=(255, 255, 0))
                sheet.paste(im, ((i % 2) * cw, (i // 2) * ch))
            sheet.save(f'/home/claude/dogfight/test/shots/view_{PRESET}_{id}.png')
            print(id, st, len(shots), 'shots')
            await pg.evaluate("() => { window.__df.UI.leave(); }")
            await pg.wait_for_timeout(300)
        for l in logs[:20]: print(l)
        await b.close()

asyncio.run(main())
