"""Missile library -> models/missiles.bin (same SDM1 container as the aircraft).

Every missile is cut out of its source file, turned so the nose points to -Z, centred on its length, rolled so the
fins sit in an X (as on a rail launcher), scaled to its real length, simplified, and given its own texture
(solid-colour materials are baked into one shared palette texture). The header lists, per missile, the group range
to draw, the length, body radius and fin span.
usage: put the source files in tools/hd/msl/ (aim120.glb, nato_pack.glb, rus_pack.glb), then python3 tools/hd/build_msl.py [--preview]
"""
import sys, os, io, re, json, struct, subprocess, tempfile
import numpy as np
from PIL import Image
from glb import load_scene, image_bytes, material_info

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.environ.get('MSL_OUT', os.path.join(HERE, '..', '..', 'models'))
MSIMP = os.path.join(HERE, 'msimp')

CR_NATO = dict(title='Missiles', author='Civorsky', license='CC BY 4.0', url='https://sketchfab.com/3d-models/missiles-37899978144a45d0bd03c3538957b145')
CR_RUS = dict(title='Russian weapon pack', author='Rhine_Lab_Muelsyse', license='CC BY 4.0', url='https://sketchfab.com/3d-models/russian-weapon-pack-af00b7135a184ecfb2812a0e54458a8a')
SRC = {
    # key: file, how to pick the parts, which way the nose points, real length (m)
    'aim120c': dict(file='msl/aim120.glb', axis='z', L=3.66, tex=512,
                    credit=dict(title='AIM-120C AMRAAM', author='Jeyhun1985', license='CC BY 4.0', url='https://sketchfab.com/3d-models/aim-120c-amraam-838fa923340a4d108e05c99bf0146ff6')),
    'aim9': dict(file='msl/aim9.glb', axis='z', L=2.87, tex=512,
                 credit=dict(title='AIM-9 missile', author='RickSlash', license='CC BY 4.0', url='https://sketchfab.com/3d-models/aim-9-missile-caaf15b49bac4144b6c6be577c2b872a')),
    'aim54': dict(file='msl/aim54.glb', axis='x', L=3.96, tex=512,
                  credit=dict(title='AIM-54 Phoenix (Low Poly)', author='Mustafa Garip', license='CC BY 4.0', url='https://sketchfab.com/3d-models/aim-54-phoenix-low-poly-0f93756f393d498f95c4364244f8bda0')),
    'aim9l': dict(file='msl/nato_pack.glb', cx=-14.5, axis='z', L=2.85, credit=CR_NATO, opts=40),
    'aim54c': dict(file='msl/nato_pack.glb', cx=-6.23, axis='z', L=3.96, credit=CR_NATO, opts=40),
    's530d': dict(file='msl/nato_pack.glb', cx=2.55, axis='z', L=3.8, credit=CR_NATO),
    # blue inert-round paint -> light grey (stands in for Meteor)
    'aim120d': dict(file='msl/nato_pack.glb', cx=22.8, axis='z', L=3.65, credit=CR_NATO,
                    recolor={'Material.041': [0.83, 0.84, 0.83], 'Material.039': [0.6, 0.61, 0.62]}),
    'aim7f': dict(file='msl/nato_pack.glb', cx=30.81, axis='z', L=3.66, credit=CR_NATO),
    'r27r': dict(file='msl/rus_pack.glb', node=r'^ru_r-27r', axis='x', L=4.08, tex=512, credit=CR_RUS),
    'r73': dict(file='msl/rus_pack.glb', node=r'^ru_r-73', axis='x', L=2.9, tex=512, credit=CR_RUS),
    'r77': dict(file='msl/rus_pack.glb', node=r'^ru_r-77$|^ru_r-77_', axis='x', L=3.6, tex=512, credit=CR_RUS),
}
USE = sys.argv[1:] if len(sys.argv) > 1 and not sys.argv[1].startswith('--') else ['aim120c', 'aim9l', 'aim54c', 's530d', 'aim120d', 'r27r', 'r73']
TARGET = 2600   # triangles per missile at most

_scene = {}


def scene(path):
    if path not in _scene:
        _scene[path] = load_scene(os.path.join(HERE, path))
    return _scene[path]


def srgb(c):
    c = np.clip(np.asarray(c, dtype=np.float64), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


def single_colour(js, binc, img):
    data, mime = image_bytes(js, binc, img)
    im = np.asarray(Image.open(io.BytesIO(data)).convert('RGBA').resize((16, 16)))
    flat = im.reshape(-1, 4).astype(np.float32)
    if flat.std(axis=0).max() < 2.0:
        return flat.mean(axis=0) / 255.0
    return None


def extract(key):
    s = SRC[key]
    js, binc, prims = scene(s['file'])
    sel = []
    for p in prims:
        if 'node' in s and not any(re.search(s['node'], n or '') for n in p['path'].split('/')):
            continue
        if 'cx' in s:
            c = (p['pos'][:, 0].min() + p['pos'][:, 0].max()) / 2
            if abs(c - s['cx']) > 2.0:
                continue
        sel.append(p)
    V, N, UV, F, MT = [], [], [], [], []
    off = 0
    for p in sel:
        V.append(p['pos']); N.append(p['nor'] if p['nor'] is not None else np.tile([0, 1, 0], (len(p['pos']), 1)))
        UV.append(p['uv'][:, :2] if p['uv'] is not None else np.zeros((len(p['pos']), 2)))
        F.append(p['tri'] + off); MT.append(np.full(len(p['tri']), p['mat'])); off += len(p['pos'])
    V = np.concatenate(V); N = np.concatenate(N); UV = np.concatenate(UV).astype(np.float64); F = np.concatenate(F); MT = np.concatenate(MT)
    # nose to -Z
    if s['axis'] == 'x':      # nose at +x
        V = np.stack([V[:, 2], V[:, 1], -V[:, 0]], 1); N = np.stack([N[:, 2], N[:, 1], -N[:, 0]], 1)
    else:                     # nose at +z
        V = np.stack([-V[:, 0], V[:, 1], -V[:, 2]], 1); N = np.stack([-N[:, 0], N[:, 1], -N[:, 2]], 1)
    c = (V.min(0) + V.max(0)) / 2
    V = V - c
    L0 = V[:, 2].max() - V[:, 2].min()
    sc = s['L'] / L0 if s.get('L') else 1.0
    V = V * sc
    # body radius (median radius in the middle half) and fin roll: put the fins at 45 deg
    r = np.hypot(V[:, 0], V[:, 1]); zt = (V[:, 2] - V[:, 2].min()) / (V[:, 2].max() - V[:, 2].min())
    body = float(np.median(r[(zt > 0.3) & (zt < 0.7)]))
    fin = r > body * 1.8
    if fin.sum() > 8:
        ang = np.arctan2(V[fin, 1], V[fin, 0]) * 4.0    # 4-fold symmetry
        w = r[fin]
        a = np.arctan2((np.sin(ang) * w).sum(), (np.cos(ang) * w).sum()) / 4.0   # current fin angle (mod 90)
        rot = np.pi / 4 - a
        cr, sr = np.cos(rot), np.sin(rot)
        Rz = np.array([[cr, -sr, 0], [sr, cr, 0], [0, 0, 1]])
        V = V @ Rz.T; N = N @ Rz.T
        roll = float(np.degrees(rot))
    else:
        roll = 0.0
    N = N / np.maximum(np.linalg.norm(N, axis=1, keepdims=True), 1e-9)
    finspan = float(np.hypot(V[:, 0], V[:, 1]).max())
    return dict(js=js, binc=binc, V=V, N=N, UV=UV, F=F, MT=MT, L=float(V[:, 2].max() - V[:, 2].min()), r=body, fin=finspan, roll=roll)


def preview_sheet(keys, out):
    import cv2
    tiles = []
    for k in keys:
        d = extract(k)
        js, binc = d['js'], d['binc']
        V, F = d['V'], d['F']
        # flat colour per triangle (texture sample at centroid)
        cols = np.zeros((len(F), 3))
        cache = {}
        for m in np.unique(d['MT']):
            mi = material_info(js, int(m))
            sel = d['MT'] == m
            f = np.array(mi['factor'][:3])
            if mi['image'] is not None:
                if mi['image'] not in cache:
                    data, _ = image_bytes(js, binc, mi['image'])
                    cache[mi['image']] = np.asarray(Image.open(io.BytesIO(data)).convert('RGB').resize((256, 256))) / 255.0
                T = cache[mi['image']]
                uv = d['UV'][F[sel]].mean(axis=1)
                u = np.mod(uv[:, 0], 1); v = np.mod(uv[:, 1], 1)
                cols[sel] = T[(v * 255).astype(int), (u * 255).astype(int)] * f
            else:
                cols[sel] = f
        W, H = 900, 150
        for name, au, av, ad in [('side', np.array([0, 0, 1.0]), np.array([0, 1.0, 0]), np.array([1.0, 0, 0])),
                                 ('top', np.array([0, 0, 1.0]), np.array([1.0, 0, 0]), np.array([0, 1.0, 0]))]:
            img = np.full((H, W, 3), 235, np.uint8)
            P = V[F]
            u = P @ au; v = P @ av; dd = (P @ ad).mean(axis=1)
            scale = W * 0.9 / 4.4
            e1 = P[:, 1] - P[:, 0]; e2 = P[:, 2] - P[:, 0]
            nrm = np.cross(e1, e2); nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
            lt = ad * 0.7 + av * 0.5; lt /= np.linalg.norm(lt)
            col = np.clip(cols * (0.35 + 0.65 * np.abs(nrm @ lt))[:, None], 0, 1)
            for i in np.argsort(dd):
                pts = np.stack([u[i] * scale + W / 2, -v[i] * scale + H / 2], 1)
                cv2.fillPoly(img, [np.round(pts * 4).astype(np.int32)], (int(col[i, 2] * 255), int(col[i, 1] * 255), int(col[i, 0] * 255)), lineType=cv2.LINE_AA, shift=2)
            cv2.putText(img, f'{k} {name}  L={d["L"]:.2f} r={d["r"]:.3f} fin={d["fin"]:.2f} roll={d["roll"]:.0f} tris={len(F)}', (6, 16), cv2.FONT_HERSHEY_SIMPLEX, 0.45, (0, 0, 0), 1, cv2.LINE_AA)
            tiles.append(img)
    cv2.imwrite(out, np.vstack(tiles))


def simplify(pos, attrs, F, target, err=0.01, opts=0):
    nv = len(pos)
    w = np.ones(attrs.shape[1], np.float32)
    lock = np.zeros(nv, np.uint8)
    with tempfile.TemporaryDirectory() as td:
        fi = os.path.join(td, 'in.bin'); fo = os.path.join(td, 'out.bin')
        with open(fi, 'wb') as f:
            f.write(struct.pack('<IIIIfI', nv, len(F) * 3, attrs.shape[1], target * 3, err, opts))
            f.write(pos.astype(np.float32).tobytes()); f.write(attrs.astype(np.float32).tobytes()); f.write(w.tobytes()); f.write(lock.tobytes())
            f.write(F.astype(np.uint32).tobytes())
        subprocess.run([MSIMP, fi, fo], check=True, stdout=subprocess.DEVNULL)
        b = open(fo, 'rb').read()
        n, e = struct.unpack_from('<If', b, 0)
        return np.frombuffer(b, np.uint32, n, 8).reshape(-1, 3).astype(np.int64)


def build(keys):
    palette = []          # solid colours (rgb 0..1)
    pal_index = {}
    def pal(c):
        k = tuple(np.round(np.asarray(c[:3]) * 255).astype(int))
        if k not in pal_index:
            pal_index[k] = len(palette); palette.append(k)
        return pal_index[k]
    textures = []         # encoded images
    allV, allN, allUV, allF, groups, info = [], [], [], [], [], {}
    voff = 0; ioff = 0
    PAL_N = 16            # palette grid (16 x 16 cells of 4 px = 64 x 64 texture)
    pending_pal_groups = []
    for key in keys:
        d = extract(key)
        js, binc = d['js'], d['binc']
        V, N, UV, F, MT = d['V'], d['N'], d['UV'].copy(), d['F'], d['MT']
        # material -> texture or palette colour
        tri_tex = np.full(len(F), -1)      # -1 = palette
        vert_pal = np.full(len(V), -1)
        tex_of_img = {}
        for m in np.unique(MT):
            mi = material_info(js, int(m)) if m >= 0 else dict(factor=[0.8, 0.8, 0.8, 1], image=None, alpha='OPAQUE')
            f = np.array((list(mi['factor']) + [1.0])[:4], dtype=np.float64)
            f[:3] = np.clip(srgb(f[:3]), 0, 1)                 # glTF factors are linear; the game shades in display space
            rc = SRC[key].get('recolor', {}).get(mi.get('name'))
            if rc is not None:
                f[:3] = rc
            sel = MT == m
            img = mi['image']
            solid = None
            if img is None:
                solid = f
            else:
                c1 = single_colour(js, binc, img)
                if c1 is not None:
                    solid = np.concatenate([c1[:3] * f[:3], [1.0]])
            if mi.get('alpha') == 'BLEND':       # seeker glass: dark tinted, opaque
                solid = np.array([0.12, 0.16, 0.2, 1.0]) if solid is None else np.concatenate([solid[:3] * 0.35 + np.array([0.05, 0.08, 0.1]), [1]])
            if solid is not None:
                vert_pal[np.unique(F[sel])] = pal(solid)
            else:
                if img not in tex_of_img:
                    data, mime = image_bytes(js, binc, img)
                    im = Image.open(io.BytesIO(data)).convert('RGB')
                    lim = SRC[key].get('tex', 512)
                    w, h = im.size
                    tw = 1 << int(np.floor(np.log2(min(w, lim)))); th = 1 << int(np.floor(np.log2(min(h, lim))))
                    im = im.resize((tw, th), Image.LANCZOS)
                    if np.any(f[:3] < 0.995):
                        im = Image.fromarray(np.clip(np.asarray(im) * f[:3], 0, 255).astype(np.uint8))
                    bio = io.BytesIO(); im.save(bio, 'WEBP', quality=86, method=6)
                    tex_of_img[img] = len(textures)
                    textures.append(dict(data=bio.getvalue(), w=tw, h=th))
                tri_tex[sel] = tex_of_img[img]
        # vertices shared between palette and textured triangles: split them
        for t in np.unique(tri_tex):
            pass
        # dedupe + split per (vertex, texture-kind)
        keyv = []
        tk = np.repeat(tri_tex, 3)
        fv = F.ravel()
        key_arr = np.stack([fv, tk], 1)
        uk, inv = np.unique(key_arr, axis=0, return_inverse=True)
        inv = inv.ravel()
        src = uk[:, 0]; kind = uk[:, 1]
        Vn = V[src]; Nn = N[src]; UVn = UV[src].copy()
        palv = kind < 0
        # palette cell centre uv (v measured from the top of the image, as glTF)
        pi = np.array([vert_pal[s] if vert_pal[s] >= 0 else 0 for s in src])
        UVn[palv, 0] = ((pi[palv] % PAL_N) + 0.5) / PAL_N
        UVn[palv, 1] = ((pi[palv] // PAL_N) + 0.5) / PAL_N
        Fn = inv.reshape(-1, 3)
        # simplify
        if len(Fn) > TARGET:
            attrs = np.concatenate([Nn * 0.5, UVn * 2.0, kind[:, None] * 10.0], 1)
            Fs = simplify(Vn, attrs, Fn, TARGET, SRC[key].get('err', 0.006), SRC[key].get('opts', 8))   # 8 = prune tiny parts
            print(f'  {key}: simplified {len(Fn)} -> {len(Fs)} tris')
            Fn = Fs
        used = np.unique(Fn); rm = np.full(len(Vn), -1); rm[used] = np.arange(len(used))
        Fn = rm[Fn]; Vn = Vn[used]; Nn = Nn[used]; UVn = UVn[used]; kind = kind[used]
        tkind = kind[Fn[:, 0]]
        g0 = len(groups)
        for t in sorted(set(tkind.tolist())):
            tris = Fn[tkind == t] + voff
            groups.append(dict(start=ioff, count=int(tris.size), tex=(int(t) if t >= 0 else 'PAL'), color=[1, 1, 1, 1], mode=0, double=False, cutoff=0.5, name=key))
            allF.append(tris.ravel()); ioff += tris.size
        allV.append(Vn); allN.append(Nn); allUV.append(UVn); voff += len(Vn)
        info[key] = dict(g=[g0, len(groups)], len=round(d['L'], 3), r=round(d['r'], 4), fin=round(d['fin'], 3), tris=int(len(Fn)))
        print(f'  {key}: L {d["L"]:.2f} m, body r {d["r"]:.3f}, fin span r {d["fin"]:.3f}, roll {d["roll"]:.0f} deg, {len(Fn)} tris, {len(Vn)} verts')
    # palette texture
    S = PAL_N * 4
    pimg = np.zeros((S, S, 3), np.uint8)
    for i, c in enumerate(palette):
        y, x = (i // PAL_N) * 4, (i % PAL_N) * 4
        pimg[y:y + 4, x:x + 4] = c
    bio = io.BytesIO(); Image.fromarray(pimg).save(bio, 'PNG')
    pal_tex = len(textures)
    textures.append(dict(data=bio.getvalue(), w=S, h=S, png=True))
    for g in groups:
        if g['tex'] == 'PAL':
            g['tex'] = pal_tex
    print(f'  palette: {len(palette)} colours')
    V = np.concatenate(allV); N = np.concatenate(allN); UV = np.concatenate(allUV); idx = np.concatenate(allF)
    nv = len(V)
    pmin = V.min(0); pmax = V.max(0); pc = (pmin + pmax) / 2; ph = np.maximum((pmax - pmin) / 2, 1e-4)
    q = np.clip(np.round((V - pc) / ph * 32767), -32767, 32767).astype(np.int16)
    qn = np.clip(np.round(N * 127), -127, 127).astype(np.int8)
    umin = UV.min(0); umax = UV.max(0); ur = np.maximum(umax - umin, 1e-6)
    qu = np.clip(np.round((UV - umin) / ur * 65535), 0, 65535).astype(np.uint16)
    vb = np.zeros((nv, 16), np.uint8)
    vb[:, 0:6] = q.view(np.uint8).reshape(nv, 6)
    vb[:, 8:11] = qn.view(np.uint8).reshape(nv, 3)
    vb[:, 12:16] = qu.view(np.uint8).reshape(nv, 4)
    idx32 = nv > 65535
    ib = idx.astype(np.uint32 if idx32 else np.uint16).tobytes()
    ib += b'\0' * ((4 - len(ib) % 4) % 4)
    blobs = [vb.tobytes(), ib]
    off = len(blobs[0]) + len(blobs[1])
    tex_meta = []
    for t in textures:
        dd = t['data']; pad = (4 - len(dd) % 4) % 4
        tex_meta.append(dict(off=off, len=len(dd), w=t['w'], h=t['h'], alpha=False, mime='image/png' if t.get('png') else 'image/webp', nearest=bool(t.get('png'))))
        blobs.append(dd + b'\0' * pad); off += len(dd) + pad
    credits = {}
    for k in keys:
        c = SRC[k]['credit']; credits.setdefault(c['title'], c)
    header = dict(v=1, id='missiles', nv=int(nv), ni=int(idx.size), idx32=bool(idx32), vbytes=len(blobs[0]), ioff=len(blobs[0]),
                  pc=[round(float(x), 5) for x in pc], ph=[round(float(x), 5) for x in ph],
                  uvmin=[float(x) for x in umin], uvrange=[float(x) for x in ur], groups=groups, tex=tex_meta,
                  meta=dict(missiles=info), credit=list(credits.values()))
    hj = json.dumps(header, separators=(',', ':')).encode()
    hj += b' ' * ((4 - len(hj) % 4) % 4)
    path = os.path.join(OUT, 'missiles.bin')
    with open(path, 'wb') as f:
        f.write(b'SDM1'); f.write(struct.pack('<I', len(hj))); f.write(hj)
        for b in blobs:
            f.write(b)
    print(f'-> {path} {os.path.getsize(path) / 1e6:.2f} MB, {nv} verts, {idx.size // 3} tris, {len(groups)} groups, {len(textures)} textures')


if __name__ == '__main__':
    if '--preview' in sys.argv:
        preview_sheet([k for k in SRC], os.path.join(HERE, 'msl_preview.png'))
    else:
        build(USE)
