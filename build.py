#!/usr/bin/env python3
"""Concatenate src/*.js into the artifact page and test harnesses."""
import glob, os, sys

ROOT = os.path.dirname(os.path.abspath(__file__))

def read(p):
    with open(os.path.join(ROOT, p), encoding='utf-8') as f:
        return f.read()

def js_bundle(files):
    parts = []
    for p in files:
        parts.append(f'// ---- {os.path.basename(p)} ----\n' + read(p))
    return '\n'.join(parts)

def src_files(upto=None):
    files = sorted(glob.glob(os.path.join(ROOT, 'src', '*.js')))
    files = [os.path.relpath(f, ROOT) for f in files]
    if upto:
        files = [f for f in files if os.path.basename(f) <= upto]
    return files

SKELETON_HEAD = ('<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">'
                 '<style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}'
                 'html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#faf9f5;color:#141413}'
                 'img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>')

def build_gallery():
    js = js_bundle(src_files('21_aircraft.js'))
    html = (SKELETON_HEAD + '<canvas id="c" width="1800" height="900" style="display:block"></canvas>'
            '<script>\n"use strict";\n' + js + '\n' + read('test/gallery_main.js') + '\n</script></body></html>')
    with open(os.path.join(ROOT, 'test', 'gallery.html'), 'w', encoding='utf-8') as f:
        f.write(html)

def build_game():
    page = read('src/page.html')
    js = js_bundle(src_files())
    script = '<script>\n(() => {\n"use strict";\n' + js + '\n})();\n</script>'
    out = page.replace('<!--SCRIPT-->', script)
    os.makedirs(os.path.join(ROOT, 'dist'), exist_ok=True)
    with open(os.path.join(ROOT, 'dist', 'skydogfight.html'), 'w', encoding='utf-8') as f:
        f.write(out)
    # test document: skeleton + mock platform + page
    mock = read('test/mock_claude.js')
    test = SKELETON_HEAD + '<script>window.__HD_BASE__ = "../models/";\n' + mock + '\n</script>' + out + '</body></html>'
    with open(os.path.join(ROOT, 'test', 'game.html'), 'w', encoding='utf-8') as f:
        f.write(test)
    # web test document: no platform mock, so the page takes the internet (MQTT + WebRTC) path
    web = SKELETON_HEAD + '<script>window.__DF_TEST__ = true; window.__HD_BASE__ = "../models/";</script>' + out + '</body></html>'
    with open(os.path.join(ROOT, 'test', 'web.html'), 'w', encoding='utf-8') as f:
        f.write(web)
    # bare js for syntax checking
    with open(os.path.join(ROOT, 'test', 'bundle_check.js'), 'w', encoding='utf-8') as f:
        f.write('(() => {\n"use strict";\n' + js + '\n})();\n')
    build_site(page, script)
    print('built', len(out), 'bytes')

SITE_HEAD = '''<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="description" content="蒼穹纏鬥 Sky Dogfight：瀏覽器裡的多人空戰遊戲。F-16、F-22、F-14、Su-27、颱風、幻象 2000、經國號與二戰螺旋槳機，複製邀請連結就能和同學連機。">
<meta name="theme-color" content="#1b1f22">
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E%3Crect width='64' height='64' rx='12' fill='%231b1f22'/%3E%3Cpath d='M32 6l5 20 21 10v6l-21-5-2 13 7 5v4l-10-3-10 3v-4l7-5-2-13-21 5v-6l21-10z' fill='%23f1b434'/%3E%3C/svg%3E">
<style>body{margin:0;padding:0}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style>
'''

def build_site(page, script):
    """Stand-alone document for GitHub Pages (index.html at the repo root): title/fonts/styles go in <head>."""
    cut = page.index('</style>') + len('</style>')
    head, body = page[:cut], page[cut:]
    html = SITE_HEAD + head + '\n</head>\n<body>' + body.replace('<!--SCRIPT-->', script) + '\n</body>\n</html>\n'
    with open(os.path.join(ROOT, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)

if __name__ == '__main__':
    what = sys.argv[1] if len(sys.argv) > 1 else 'game'
    if what == 'gallery':
        build_gallery(); print('gallery built')
    else:
        build_game()
