"""Touch stick and hold buttons on a phone-sized page, and missile switching with every kind of mouse wheel.
Single-finger touches are real (CDP); the two-finger case uses synthetic TouchEvents, because the emulator does not
always release one finger of two. python3 test/inputtest.py"""
import asyncio, json
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]
URL = 'http://127.0.0.1:8765/test/game.html'
STATE = '''() => { const d = window.__df, S = d.Input.stick, me = d.Game.me;
  return { id: S.id, sx: Math.round(S.x), sy: Math.round(S.y), roll: +me.ctrl.roll.toFixed(2), pitch: +me.ctrl.pitch.toFixed(2),
    base: !document.getElementById('stickBase').hidden, gun: d.Input.tGun, ab: d.Input.tAB }; }'''
TWO_FINGERS = r'''async () => { const d = window.__df, S = d.Input.stick, area = document.getElementById('stickArea'), gunEl = document.getElementById('tGun');
  const wait = ms => new Promise(r => setTimeout(r, ms)), T = (id, el, x, y) => new Touch({ identifier: id, target: el, clientX: x, clientY: y });
  const fire = (el, type, changed, touches) => el.dispatchEvent(new TouchEvent(type, { changedTouches: changed, touches, targetTouches: touches.filter(t => t.target === el), bubbles: true, cancelable: true }));
  const r = gunEl.getBoundingClientRect(), gun = T(7, gunEl, r.x + r.width / 2, r.y + r.height / 2), out = [];
  fire(gunEl, 'touchstart', [gun], [gun]);
  let s = T(3, area, 200, 260); fire(area, 'touchstart', [s], [gun, s]); s = T(3, area, 200, 212); fire(area, 'touchmove', [s], [gun, s]);
  await wait(200); out.push([S.id === 3 && S.y === -48 && d.Game.me.ctrl.pitch !== 0 && d.Input.tGun, 'gun held + stick pushed up: firing and pitching']);
  fire(area, 'touchend', [s], [gun]);
  await wait(200); out.push([S.id === -1 && d.Input.tGun, 'stick finger lifted: stick released, gun still firing']);
  fire(gunEl, 'touchend', [gun], []);
  await wait(200); out.push([!d.Input.tGun && !gunEl.classList.contains('on'), 'gun finger lifted: gun off']);
  return out; }'''
fails = []


def check(name, ok, st=None):
    print(('PASS ' if ok else 'FAIL ') + name, json.dumps(st) if st is not None else '')
    if not ok: fails.append(name)


async def touch_tests(b):
    ctx = await b.new_context(viewport={'width': 932, 'height': 430}, device_scale_factor=2, has_touch=True, is_mobile=True)
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(1500)
    await pg.tap('#tabPractice'); await pg.tap('#goBtn'); await pg.wait_for_timeout(2500)
    await pg.evaluate("() => { window.__df.Game.me.invUntil = 1e15; }")
    cdp = await ctx.new_cdp_session(pg)
    touch = lambda typ, pts: cdp.send('Input.dispatchTouchEvent', {'type': typ, 'touchPoints': [{'x': x, 'y': y, 'id': i} for i, (x, y) in pts.items()]})
    st = lambda: pg.evaluate(STATE)
    # one finger: drag right, release
    await touch('touchStart', {1: (160, 300)}); await pg.wait_for_timeout(100)
    for i in range(1, 11): await touch('touchMove', {1: (160 + 6 * i, 300)}); await pg.wait_for_timeout(30)
    await pg.wait_for_timeout(200); s = await st(); check('stick dragged right: full right roll', s['sx'] == 60 and s['roll'] == 1 and s['base'], s)
    await touch('touchEnd', {}); await pg.wait_for_timeout(200); s = await st(); check('stick released: centred and hidden', s['id'] == -1 and not s['base'], s)
    # the finger slides far off the stick area and is lifted there
    await touch('touchStart', {1: (300, 330)}); await pg.wait_for_timeout(100)
    for i in range(1, 16): await touch('touchMove', {1: (300 + 30 * i, 330 - 10 * i)}); await pg.wait_for_timeout(20)
    s = await st(); check('dragged past the stick area: still steering', s['sx'] == 60 and s['sy'] == -60, s)
    await touch('touchEnd', {}); await pg.wait_for_timeout(200); s = await st(); check('lifted outside the area: stick released', s['id'] == -1 and not s['base'], s)
    # a stick left held by a release that never arrived: the next touch takes it over
    await pg.evaluate("() => { const S = window.__df.Input.stick; S.id = 987654; S.x = -60; document.getElementById('stickBase').hidden = false; }")
    await touch('touchStart', {1: (180, 300)}); await pg.wait_for_timeout(100)
    for i in range(1, 6): await touch('touchMove', {1: (180 + 6 * i, 300)}); await pg.wait_for_timeout(30)
    await pg.wait_for_timeout(150); s = await st(); check('stuck stick taken over by the next touch', s['id'] != 987654 and s['sx'] == 30, s)
    await touch('touchEnd', {}); await pg.wait_for_timeout(200)
    # stick + afterburner, cancelled by the system
    ab = await pg.evaluate("() => { const r = document.getElementById('tAB').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }")
    await touch('touchStart', {1: (180, 300)}); await touch('touchStart', {1: (180, 300), 2: tuple(ab)}); await pg.wait_for_timeout(150)
    s = await st(); check('stick + afterburner held together', s['id'] >= 0 and s['ab'], s)
    await touch('touchCancel', {}); await pg.wait_for_timeout(200); s = await st(); check('touchcancel releases everything', s['id'] == -1 and not s['ab'], s)
    # two fingers: gun held, stick moved, fingers lifted one at a time
    for ok, name in await pg.evaluate(TWO_FINGERS): check(name, ok)
    for e in errs[:5]: check('page error: ' + e, False)
    await ctx.close()


async def wheel_tests(b):
    ctx = await b.new_context(viewport={'width': 1200, 'height': 700})
    pg = await ctx.new_page(); errs = []
    pg.on('pageerror', lambda e: errs.append(str(e)))
    await pg.goto(URL); await pg.wait_for_timeout(1500)
    await pg.evaluate("() => { const d = window.__df; d.UI.prefs.acJet = 'f15'; d.UI.setEra('jet'); }")
    await pg.click('#tabPractice'); await pg.click('#goBtn'); await pg.wait_for_timeout(2500)
    await pg.mouse.move(600, 330); await pg.wait_for_timeout(200)
    ws = lambda: pg.evaluate("() => window.__df.Game.me.wsel")

    async def wheel(events, gap=16):   # [deltaY, deltaMode] per event
        await pg.evaluate("""async ([evs, gap]) => { const cv = document.getElementById('gl');
          for (const [dy, mode] of evs) { cv.dispatchEvent(new WheelEvent('wheel', { deltaY: dy, deltaMode: mode, bubbles: true, cancelable: true })); await new Promise(r => setTimeout(r, gap)); } }""", [events, gap])
        await pg.wait_for_timeout(450)
    cases = [('mouse notch, pixel mode (Chrome, Edge)', None), ('mouse notch, line mode (Firefox)', [[3, 1]]),
             ('trackpad swipe starting with tiny deltas: one switch', [[d, 0] for d in (1, 2, 3, 6, 12, 18, 14, 9, 5, 3, 2, 1)]),
             ('small notch (macOS, 4 px)', [[4, 0]]), ('fast spin of 4 notches: one switch', [[100, 0]] * 4), ('scrolling up', [[-100, 0]])]
    for name, evs in cases:
        w0 = await ws()
        if evs is None: await pg.mouse.wheel(0, 100); await pg.wait_for_timeout(450)
        else: await wheel(evs, 40 if len(evs) == 4 else 16)
        w1 = await ws(); check(name, w1 != w0, {'from': w0, 'to': w1})
    w0 = await ws(); await pg.keyboard.press('KeyQ'); await pg.wait_for_timeout(300); w1 = await ws(); check('Q key', w1 != w0, {'from': w0, 'to': w1})
    for e in errs[:5]: check('page error: ' + e, False)
    await ctx.close()


async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        await touch_tests(b)
        await wheel_tests(b)
        await b.close()
    print('ALL PASS' if not fails else 'FAILED: ' + '; '.join(fails))

asyncio.run(main())
