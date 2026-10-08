"""Load the GitHub Pages build (index.html) the way a visitor would and check the menu, networking status and a practice flight."""
import asyncio, subprocess, sys
from playwright.async_api import async_playwright
ARGS = ["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist", "--use-gl=angle"]

async def main():
    broker = subprocess.Popen(['node', 'test/mqtt_broker.js', '9101'], stdout=subprocess.PIPE); broker.stdout.readline()
    try:
        async with async_playwright() as pw:
            b = await pw.chromium.launch(args=ARGS)
            for label, url in (('public brokers (unreachable here)', 'http://127.0.0.1:8765/'),
                               ('local broker', 'http://127.0.0.1:8765/?mqtt=ws://127.0.0.1:9101/mqtt#AB12')):
                ctx = await b.new_context(viewport={'width': 1366, 'height': 800})
                pg = await ctx.new_page(); errs = []
                pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
                pg.on('console', lambda m: errs.append(m.type + ' ' + m.text) if m.type == 'error' and 'ERR_TUNNEL' not in m.text and 'WebSocket' not in m.text else None)
                await pg.goto(url)
                await pg.wait_for_timeout(1500)
                print(f'[{label}] title:', await pg.title(), '| lang:', await pg.evaluate('document.documentElement.lang'))
                print('   note @1.5s:', await pg.text_content('#netNote'), '| go disabled:', await pg.is_disabled('#goBtn'), '| invite btn:', await pg.is_visible('#inviteBtn'))
                if 'public' in label:
                    await pg.wait_for_timeout(9000)
                    print('   note @10.5s:', await pg.text_content('#netNote'), '| go disabled:', await pg.is_disabled('#goBtn'))
                    await pg.click('#tabPractice'); await pg.click('#goBtn'); await pg.wait_for_timeout(2500)
                    await pg.screenshot(path='/home/claude/dogfight/test/shots/site_practice.png')
                    print('   practice running:', await pg.is_visible('#ingame'), '| info:', await pg.text_content('#roundInfo'))
                else:
                    print('   code field:', await pg.input_value('#codeIn'))
                    await pg.screenshot(path='/home/claude/dogfight/test/shots/site_menu.png')
                for e in errs[:10]: print('   ERR', e)
                await ctx.close()
            await b.close()
    finally:
        broker.terminate()

asyncio.run(main())
