"""Frame time with 8 AI aircraft, hi-detail models vs. procedural (?lowpoly). Software GL, so only the ratio matters."""
import asyncio
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]

JS = '''async () => { const d = window.__df;
  for (let i = 0; i < 80; i++) { if (d.HD_IDS_READY && d.HD_IDS_READY()) break; await new Promise(r => setTimeout(r, 100)); }
  d.Game.start('practice', { mode: 'ffa', lim: 99, era: 'jet', bots: 8, diff: 1 }); d.UI.enterFlight();
  // park every bot in a loose formation in front of the camera so they are all on screen and close
  await new Promise(r => setTimeout(r, 1500));
  const me = d.Game.me, f = me.fwd(new d.V3()), rt = me.right(new d.V3());
  d.Game.bots.forEach((b, i) => { b.pos.copy(me.pos).addS(f, 120 + 60 * (i % 4)).addS(rt, (i % 2 ? 1 : -1) * (20 + 25 * Math.floor(i / 2))); b.q.copy(me.q); b.vel.copy(me.vel); });
  const times = []; let last = performance.now();
  await new Promise(res => { const loop = t => { times.push(t - last); last = t; if (times.length < 120) requestAnimationFrame(loop); else res(); }; requestAnimationFrame(loop); });
  times.sort((a, b) => a - b);
  return { median: times[60].toFixed(1), p90: times[108].toFixed(1), hd: Object.keys(d.HD.models).length, drawnHD: d.Game.planes.filter(p => p.hd && p.bigOnScreen(p.hd.radius, 5)).length };
}'''


async def run(url):
    async with async_playwright() as p:
        b = await p.chromium.launch(args=ARGS)
        pg = await (await b.new_context(viewport={'width': 1280, 'height': 720})).new_page()
        await pg.goto(url); await pg.wait_for_timeout(1500)
        await pg.evaluate("() => { const d = window.__df; d.HD_IDS_READY = () => ['f16','f22','f14','su27','typhoon','m2000','mig21'].every(id => ['ready','failed'].includes(d.HD.state[id])); }")
        r = await pg.evaluate(JS)
        await b.close()
        return r


async def main():
    print('hi-detail ', await run('http://127.0.0.1:8765/test/game.html'))
    print('procedural', await run('http://127.0.0.1:8765/test/game.html?lowpoly'))

asyncio.run(main())
