"""Usage: put the source files in tools/hd/src/<id>.glb, build msimp (see msimp.cpp), run python3 tools/hd/build_hd.py [ids]

Convert the source GLBs into the game's compact hi-detail model format (models/<id>.bin).

Per model: orient into the game frame, drop parts that should not be seen in flight (landing gear, cockpit
clutter, tanks), tag the missiles that are part of the model with launch slots, simplify heavy meshes with
meshoptimizer, shrink/re-encode textures to power-of-two WebP, and measure where procedural missiles hang,
where the afterburner flames start and where the wingtips are.
"""
import sys, os, io, json, re, struct, subprocess, tempfile
import numpy as np
from PIL import Image
from glb import image_bytes, material_info
from parts import to_game
from stores import comp_table

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', '..', 'models')
PROC = json.load(open(os.path.join(HERE, 'procmeta.json')))
MSL = {'big': (3.9, 0.19), 'rad': (3.65, 0.09), 'ir': (2.9, 0.065)}  # length, radius (matches the JS builder)


def S(k, x, z, **o):
    d = dict(k=k, x=x, z=z); d.update(o); return d


CFG = {
    'f16': dict(yaw=0, tex=2048, credit=dict(title='F16-C Falcon', author='Carlos.Maciel', license='CC BY 4.0',
                                             url='https://sketchfab.com/3d-models/f16-c-falcon-4bc2ff75dc584af2afd0aa6bd8b79015'),
                stores=[S('rad', -3.06, 2.0), S('rad', 3.06, 2.0), S('rad', -4.73, 2.03, rail=True), S('rad', 4.73, 2.03, rail=True),
                        S('ir', -4.03, 2.0), S('ir', 4.03, 2.0)],
                bones=[dict(kind='stab', side=-1, node=r'^ElevatorL01'), dict(kind='stab', side=1, node=r'^ElevatorR01'),
                       dict(kind='ail', side=-1, node=r'^AileronL01'), dict(kind='ail', side=1, node=r'^AileronR01'),
                       dict(kind='rud', side=0, node=r'^RudderL01')]),
    'f22': dict(yaw=-90, tex=2048, credit=dict(title='Lockheed Martin F-22 "Raptor"', author='andertan', license='CC BY 4.0',
                                               url='https://sketchfab.com/3d-models/lockheed-martin-f-22-raptor-7e7b3c372e374dda98e70208d09cfdcf'),
                internal=dict(rad=[[-0.34, -0.55, -0.9], [0.34, -0.55, -0.9]] * 3, ir=[[-1.12, -0.35, -1.1], [1.12, -0.35, -1.1]]),
                bones=[]),
    'f14': dict(yaw=244, tex=1024, credit=dict(title='F14', author='manilov.ap', license='CC BY 4.0',
                                               url='https://sketchfab.com/3d-models/f14-af915a32b088402f8b22e31f93af09af'),
                rm_node=r'^(Torus\d+|Cylinder(48|50|51|54|55|56|58|60|61|63|64|65|66|67)|Box(09|10|60|61|64|65|66|67|68)|Line03|Object09)-FACES',
                stores=[S('big', -0.48, -1.0), S('big', 0.48, -1.0), S('big', -0.48, 3.0), S('big', 0.48, 3.0),
                        S('ir', -2.9, 0.43), S('ir', 2.9, 0.43), S('ir', -2.43, 1.83), S('ir', 2.43, 1.83)],
                bones=[dict(kind='swing', side=-1, node=r'^kr_l-FACES', pivot=(-2.4, 0.12, 0.8), rest=68.0), dict(kind='swing', side=1, node=r'^kr_r-FACES', pivot=(2.4, 0.12, 0.8), rest=68.0),
                       dict(kind='stab', side=-1, node=r'^Cylinder03-FACES'), dict(kind='stab', side=1, node=r'^Cylinder69-FACES')]),
    'su27': dict(yaw=90, tex=1024, credit=dict(title='Sukhoi Su-27M (USSR)', author='42manako', license='CC BY-NC 4.0',
                                               url='https://sketchfab.com/3d-models/sukhoi-su-27m-ussr-af788ebfb576454ca5eaac2313a30e5b'),
                 rm_comp=[dict(x=(0, 0.4), z=(-5.4, -2.0), y=(-9, 0.1), smax=3.0),
                          dict(x=(1.35, 2.35), z=(2.2, 3.4), y=(-9, 0.3), smax=2.5),
                          dict(x=(2.3, 2.8), z=(0.3, 1.2), y=(-9, 1.0), sxmin=0.6)],
                 stores=[S('rad', -3.36, 3.32, rail=True), S('rad', 3.36, 3.32, rail=True), S('rad', -1.02, 1.55, rail=True), S('rad', 1.02, 1.55, rail=True),
                         S('ir', -4.55, 3.32, rail=True), S('ir', 4.55, 3.32, rail=True), S('ir', -6.18, 4.37, rail=True), S('ir', 6.18, 4.37, rail=True)],
                 bones=[dict(kind='stab', side=s, cbox=dict(x=(1.7, 4.9), z=(5.3, 9.0), y=(-0.7, 0.1), sx=2.0), xsign=s) for s in (-1, 1)]),
    'typhoon': dict(yaw=90, tex=1024, credit=dict(title='Eurofighter Typhoon - Fighter Jet - Free', author='bohmerang', license='CC BY-NC-SA 4.0',
                                                  url='https://sketchfab.com/3d-models/eurofighter-typhoon-fighter-jet-free-992bcc8987964ca09d55410330aa8579'),
                    rm_node=r'^(LandingOn|LandingLight)',
                    stores=[S('rad', -3.65, 1.6), S('rad', 3.65, 1.6), S('rad', -0.75, 1.0), S('rad', 0.75, 1.0),
                            S('ir', -4.45, 1.05), S('ir', 4.45, 1.05), S('ir', -2.7, 2.3, pylon=True), S('ir', 2.7, 2.3, pylon=True)],
                    bones=[dict(kind='canard', side=s, cbox=dict(x=(0.4, 2.2), z=(-6.3, -4.0), y=(-0.4, 0.45), sx=1.0), xsign=s) for s in (-1, 1)]),
    'm2000': dict(yaw=180, tex=1024, target=44000, err=0.01, opts=32, credit=dict(title='Mirage 2000-5F', author='Jeyhun1985', license='CC BY 4.0',
                                                               url='https://sketchfab.com/3d-models/mirage-2000-5f-3894c147f6474d5eb6308b8d2724a914'),
                  # the model's four MICAs make way for the game's Super 530D (hi-detail missile library); Magic IIs stay
                  glb_drop=[dict(c=(-0.74, -1.04, -1.36), L=3.13), dict(c=(0.74, -1.04, -1.36), L=3.13),
                            dict(c=(-0.95, -0.98, 2.8), L=3.11), dict(c=(0.95, -0.98, 2.8), L=3.11)],
                  stores=[S('rad', -0.74, -1.36, rail=True), S('rad', 0.74, -1.36, rail=True), S('rad', -0.95, 2.8, rail=True), S('rad', 0.95, 2.8, rail=True)],
                  glb_stores=[dict(k='ir', c=(-3.32, -1.0, 2.27), L=2.76), dict(k='ir', c=(3.32, -1.0, 2.27), L=2.76)],
                  bones=[dict(kind='elevon', side=s, cbox=dict(x=(0.8, 2.4), z=(3.7, 4.9), y=(-0.75, -0.3), sx=1.0, mintris=50), xsign=s) for s in (-1, 1)]),
    'mig21': dict(yaw=180, tex=1024, target=46000, credit=dict(title='1972 MiG-21bis', author='OUTPISTON', license='CC BY-NC-SA 4.0',
                                                               url='https://sketchfab.com/3d-models/1972-mig-21bis-0fdbda95ec1a4121863fff5065c2fc51'),
                  rm_comp=[dict(x=(2.2, 2.8), z=(-1.6, 3.8), y=(-0.8, -0.15), ymaxmax=-0.2)],
                  stores=[S('rad', -2.5, 1.0, rail=True), S('rad', 2.5, 1.0, rail=True), S('ir', -1.6, 1.2, pylon=True), S('ir', 1.6, 1.2, pylon=True)],
                  bones=[dict(kind='stab', side=s, cbox=dict(x=(0.4, 1.9), z=(3.8, 6.7), y=(0.05, 0.35), sx=1.0, mintris=50), xsign=s) for s in (-1, 1)]
                       + [dict(kind='ail', side=s, cbox=dict(x=(1.85, 3.1), z=(2.0, 2.8), y=(-0.15, 0.15), sx=0.9, mintris=50), xsign=s) for s in (-1, 1)]),
    'rafale': dict(yaw=-90, tex=2048, credit=dict(title='Dassault Rafale', author='andertan', license='CC BY 4.0',
                                                  url='https://sketchfab.com/3d-models/dassault-rafale-fabb8472bc2e413282c80406b13ff1a7'),
                   stores=[], bones=[]),

    'su30': dict(yaw=90, tex=2048, credit=dict(title='Sukhoi Su-30 flanker c', author='andertan', license='CC BY 4.0',
                                               url='https://sketchfab.com/3d-models/sukhoi-su-30-flanker-c-92ca062c90fd45ffb6ce8144dc46004a'),
                 stores=[], bones=[]),

    # CC BY-ND 4.0 (no derivatives): only format conversion — no simplification, no parts cut out of the file;
    # stores the game does not use are folded away when drawn ('hide' bones), not deleted
    'f15': dict(yaw=90, tex=2048, credit=dict(title='McDonnell Douglas F-15 Strike Eagle', author='andertan', license='CC BY-ND 4.0',
                                              url='https://sketchfab.com/3d-models/mcdonnell-douglas-f-15-strike-eagle-b7bf2e523aee40f9b048c9f7863fedc8'),
                stores=[], bones=[]),

    # ---- WWII ----
    'p51': dict(yaw=180, pitch=-12.5, tex=1024, credit=dict(title='P-51 Mustang', author='ACshibu', license='CC BY-NC 4.0',
                                               url='https://sketchfab.com/3d-models/p-51-mustang-4250635c2df54edc8c29f532bc5bac3b'),
                rm_node=r'^(Gear|Tank)',
                bones=[dict(kind='prop', side=0, node=r'^(Prop|Nose_)'),
                       dict(kind='elev', side=-1, node=r'^Elevators', xsign=-1), dict(kind='elev', side=1, node=r'^Elevators', xsign=1),
                       dict(kind='ail', side=-1, node=r'^LeftAileron'), dict(kind='ail', side=1, node=r'^RightAileron'),
                       dict(kind='rud', side=0, node=r'^Rudder')]),
    'spit': dict(yaw=180, tex=1024, target=46000, credit=dict(title="Isn'treal Spitfire Mk.IX (CW) (War Thunder)", author='KojfDiscord', license='CC BY 4.0',
                                                              url='https://sketchfab.com/3d-models/isntreal-spitfire-mkix-cw-war-thunder-eeb9f43ee3e243e4b1359ef544d45a53'),
                 rm_node=r'^Object_(4|5|6|9|10|11|12|13|14)$',          # rocket rails, rockets, bomb racks
                 rm_comp=[dict(x=(0, 0.2), z=(3.2, 4.0), y=(-0.95, -0.5))],  # tail wheel
                 bones=[dict(kind='prop', side=0, cbox=dict(x=(0, 1.0), z=(-5.0, -4.2), y=(-1.2, 0.8), mintris=100)),
                        dict(kind='rud', side=0, cbox=dict(x=(0, 0.1), z=(3.4, 4.6), y=(0.0, 1.0), mintris=300)),
                        dict(kind='elev', side=-1, cbox=dict(x=(0.3, 1.2), z=(3.4, 4.1), y=(-0.1, 0.1), sx=1.0, mintris=300), xsign=-1),
                        dict(kind='elev', side=1, cbox=dict(x=(0.3, 1.2), z=(3.4, 4.1), y=(-0.1, 0.1), sx=1.0, mintris=300), xsign=1),
                        dict(kind='ail', side=-1, cbox=dict(x=(3.3, 4.3), z=(-1.5, -0.6), y=(-0.9, -0.4), sx=1.5, mintris=100), xsign=-1),
                        dict(kind='ail', side=1, cbox=dict(x=(3.3, 4.3), z=(-1.5, -0.6), y=(-0.9, -0.4), sx=1.5, mintris=100), xsign=1)]),
    'bf109': dict(yaw=90, tex=2048, target=44000, credit=dict(title='BF 109 F-2 Messerschmitt', author='GRIP420', license='CC BY 4.0',
                                                              url='https://sketchfab.com/3d-models/bf-109-f-2-messerschmitt-e48914913f2140158bee87495916d64e'),
                  rm_mat=r'^Fake_Blades_Mat$',
                  bones=[dict(kind='prop', side=0, joint=r'^(Rotor_02|Blades_04)$')]),
}


def in_rng(v, r):
    return r[0] <= v <= r[1]


def in_poly(px, pz, poly):
    """points (px, pz) inside the polygon [(x, z), ...] (even-odd rule)"""
    inside = np.zeros(len(px), bool)
    n = len(poly)
    for i in range(n):
        x0, z0 = poly[i]; x1, z1 = poly[(i + 1) % n]
        cross = (z0 > pz) != (z1 > pz)
        xi = x0 + (pz - z0) * (x1 - x0) / ((z1 - z0) if z1 != z0 else 1e-12)
        inside ^= cross & (px < xi)
    return inside


def build(name):
    cfg = CFG[name]
    js, binc, prims, info = to_game(name, yaw=cfg.get('yaw'), pitch=cfg.get('pitch', 0.0))
    nprim = len(prims)
    # ---------- part removal (triangle masks) ----------
    keep = [np.ones(len(p['tri']), bool) for p in prims]
    rmn = re.compile(cfg['rm_node']) if cfg.get('rm_node') else None
    rmm = re.compile(cfg['rm_mat']) if cfg.get('rm_mat') else None
    for i, p in enumerate(prims):
        names = p['path'].split('/')
        mi = material_info(js, p['mat'])
        if rmn and any(rmn.search(n or '') for n in names):
            keep[i][:] = False
        if rmm and rmm.search(mi['name'] or ''):
            keep[i][:] = False
        a = mi['factor'][3] if len(mi['factor']) > 3 else 1
        if mi['alpha'] == 'BLEND' and a < 0.05 and mi['image'] is None:
            keep[i][:] = False  # fully transparent helper geometry
    V, F, G, lab, mn, mx, cnt = comp_table(prims)
    offs = np.cumsum([0] + [len(p['tri']) for p in prims])
    # skinned models: the joint each triangle hangs on (for picking the propeller etc.)
    TJ = np.concatenate([p['joint'][p['tri'][:, 0]] if p.get('joint') is not None else np.full(len(p['tri']), '', dtype=object) for p in prims]).astype(str)

    tri_keep = np.concatenate(keep)
    if cfg.get('rm_joint'):
        rj = re.compile(cfg['rm_joint'])
        tri_keep &= ~np.array([bool(rj.search(j)) for j in TJ])
    ctr = (mn + mx) / 2; sz = mx - mn
    removed_comps = set()
    for rule in cfg.get('rm_comp', []):
        for c in range(len(cnt)):
            x, y, z = ctr[c]
            if not (in_rng(abs(x), rule['x']) and in_rng(z, rule['z']) and in_rng(y, rule['y'])):
                continue
            if 'smax' in rule and sz[c].max() > rule['smax']:
                continue
            if 'sxmin' in rule and sz[c][0] < rule['sxmin']:
                continue
            if 'ymaxmax' in rule and mx[c][1] > rule['ymaxmax']:
                continue
            removed_comps.add(c)
    # missiles that come with the model but are replaced by the game's own (same selection as glb_stores)
    for st in cfg.get('glb_drop', []):
        cx, cy, cz = st['c']; L = st['L']
        for c in range(len(cnt)):
            x, y, z = ctr[c]
            if abs(x - cx) < 0.3 and abs(z - cz) < L / 2 + 0.25 and cy - 0.32 < y < cy + 0.1 and mx[c][1] < cy + 0.2:
                removed_comps.add(c)
    if removed_comps:
        tri_keep &= ~np.isin(lab, list(removed_comps))
    # ---------- missiles that are part of the model: slots ----------
    tri_slot = np.zeros(len(F), np.int16)
    glb_launch = {'rad': [], 'ir': []}
    nR = nI = 0
    for st in cfg.get('glb_stores', []):
        cx, cy, cz = st['c']; L = st['L']
        sel = []
        for c in range(len(cnt)):
            x, y, z = ctr[c]
            if abs(x - cx) < 0.3 and abs(z - cz) < L / 2 + 0.25 and cy - 0.32 < y < cy + 0.1 and mx[c][1] < cy + 0.2:
                sel.append(c)
        slot = (++0)
        if st['k'] == 'ir':
            nI += 1; slot = 20 + nI; glb_launch['ir'].append([cx, cy, cz])
        else:
            nR += 1; slot = nR; glb_launch['rad'].append([cx, cy, cz])
        m = np.isin(lab, sel) & tri_keep
        tri_slot[m] = slot
        print(f'  glb store {st["k"]} at {st["c"]}: {len(sel)} parts, {m.sum()} tris -> slot {slot}')
    # ---------- control surfaces: bone per triangle, hinge pivot + axis ----------
    tri_bone = np.zeros(len(F), np.uint8)
    bone_meta = [None]; props = []
    cen = V[F].mean(axis=1)
    for bi, bc in enumerate(cfg.get('bones', []), start=1):
        m = np.zeros(len(F), bool)
        if 'node' in bc:
            rn = re.compile(bc['node']); rm = re.compile(bc['mesh']) if bc.get('mesh') else None
            for i, p in enumerate(prims):
                names = p['path'].split('/')
                if any(rn.search(n or '') for n in names) and (rm is None or rm.search(names[-1] or '')):
                    m[offs[i]:offs[i + 1]] = True
        if 'joint' in bc:
            rj = re.compile(bc['joint'])
            m |= np.array([bool(rj.search(j)) for j in TJ])
        if 'cbox' in bc:
            cb = bc['cbox']; sel = []
            for c in range(len(cnt)):
                x, y, z = ctr[c]
                xx = x if cb.get('signed') else abs(x)
                if in_rng(xx, cb['x']) and in_rng(z, cb['z']) and in_rng(y, cb['y']) and sz[c][0] >= cb.get('sx', 0) and cnt[c] >= cb.get('mintris', 8):
                    sel.append(c)
            m |= np.isin(lab, sel)
        if 'tbox' in bc:
            # single triangles by centroid, for surfaces that are not separate parts in the source model
            # (x is |x| unless signed; optional poly = outline in the (|x|, z) plane, e.g. along a hinge line)
            tb = bc['tbox']
            xx = cen[:, 0] if tb.get('signed') else np.abs(cen[:, 0])
            mm = np.ones(len(F), bool)
            for k, col in (('x', xx), ('y', cen[:, 1]), ('z', cen[:, 2])):
                if k in tb:
                    mm &= (col >= tb[k][0]) & (col <= tb[k][1])
            if 'poly' in tb:
                mm &= in_poly(xx, cen[:, 2], tb['poly'])
            m |= mm
        if bc.get('xsign'):
            m &= np.sign(cen[:, 0]) == bc['xsign']
        m &= tri_keep
        if not m.any():
            print('  !! no triangles for bone', bc); continue
        tri_bone[m] = bi
        P = V[np.unique(F[m])]
        ax_ = np.abs(P[:, 0]); x_in, x_out = ax_.min(), ax_.max(); span = max(x_out - x_in, 1e-3)
        kind = bc['kind']; extra = {}
        if kind in ('stab', 'canard'):
            root = P[ax_ <= x_in + 0.2 * span]
            zf, zb = root[:, 2].min(), root[:, 2].max()
            pivot = [float(np.sign(P[:, 0].mean()) * x_in), float(root[:, 1].mean()), float(zf + 0.35 * (zb - zf))]
            axis = [1.0, 0.0, 0.0]
        elif kind == 'prop':
            # spins about the fore-aft axis through the hub; also gives the blur disc (blade plane, radius).
            # The axis comes from the spinner cone just behind its tip (a cross-section there is a circle);
            # the bounding box of the blades is NOT centred on the hub for an odd number of blades.
            z0 = P[:, 2].min(); best = None
            for dz in (0.08, 0.12, 0.16, 0.2, 0.25):
                sl = P[(P[:, 2] > z0 + dz - 0.03) & (P[:, 2] < z0 + dz + 0.03)]
                if len(sl) >= 8 and (best is None or len(sl) > len(best)):
                    best = sl
            src = best if best is not None else P
            cxy = [(src[:, 0].min() + src[:, 0].max()) / 2, (src[:, 1].min() + src[:, 1].max()) / 2]
            rr = np.hypot(P[:, 0] - cxy[0], P[:, 1] - cxy[1]); rmax = float(rr.max())
            zb = float(np.median(P[rr > 0.5 * rmax, 2]))
            pivot = [0.0, float(cxy[1]), zb]; axis = [0.0, 0.0, 1.0]
            props.append(dict(z=round(zb, 3), y=round(float(cxy[1]), 3), r=round(rmax, 3)))
        elif kind in ('ail', 'elevon', 'flap', 'elev'):
            inner = P[ax_ <= x_in + 0.15 * span]; outer = P[ax_ >= x_out - 0.15 * span]
            A = inner[np.argmin(inner[:, 2])]; B = outer[np.argmin(outer[:, 2])]
            d = B - A; d /= np.linalg.norm(d)
            if d[0] < 0: d = -d
            pivot = [float(v) for v in A]; axis = [float(v) for v in d]
        elif kind == 'rud':
            y0, y1 = P[:, 1].min(), P[:, 1].max(); h = y1 - y0
            bot = P[P[:, 1] <= y0 + 0.15 * h]; top = P[P[:, 1] >= y1 - 0.15 * h]
            A = bot[np.argmin(bot[:, 2])]; B = top[np.argmin(top[:, 2])]
            d = B - A; d /= np.linalg.norm(d)
            if d[1] < 0: d = -d
            pivot = [float(v) for v in A]; axis = [float(v) for v in d]
        elif kind == 'hide':
            # kept in the file but folded to a point inside the airframe when drawn (stores the game does not carry)
            pivot = [float(v) for v in bc.get('pivot', (0.0, 0.0, 0.0))]; axis = [1.0, 0.0, 0.0]
        elif kind == 'swing':
            pivot = [float(v) for v in bc['pivot']]; axis = [0.0, 1.0, 0.0]
            # leading-edge sweep of the panel as modelled: front-most z per spanwise bin, outer 60 %
            xs = np.linspace(x_in + 0.45 * span, x_out - 0.15 * span, 10)
            pts = []
            for a0, a1 in zip(xs[:-1], xs[1:]):
                b_ = P[(ax_ >= a0) & (ax_ < a1)]
                if len(b_): pts.append([(a0 + a1) / 2, b_[:, 2].min()])
            pts = np.array(pts); slope = np.polyfit(pts[:, 0], pts[:, 1], 1)[0]
            extra['rest'] = float(bc['rest']) if 'rest' in bc else round(float(np.degrees(np.arctan(slope))), 2)
        bone_meta.append(dict(kind=kind, side=int(bc.get('side', 0)), pivot=[round(v, 4) for v in pivot], axis=[round(v, 4) for v in axis], **extra))
        print(f'  bone {bi} {kind} side {bc.get("side")}: {m.sum()} tris, pivot {np.round(pivot, 2)}, axis {np.round(axis, 2)} {extra}')
    Fk = F[tri_keep]; Gk = G[tri_keep]; Sk = tri_slot[tri_keep]; Bk = tri_bone[tri_keep]
    print(f'{name}: kept {len(Fk)} / {len(F)} tris, removed comps {len(removed_comps)}')
    # ---------- measurements on the kept geometry ----------
    used_v = np.unique(Fk)
    VK = V[used_v]

    TP = V[Fk]  # kept triangles (n,3,3)

    def surf_low(x, z):
        """lowest surface hit by a vertical ray at (x, z), or None"""
        a, b, c = TP[:, 0], TP[:, 1], TP[:, 2]
        v0x, v0z = b[:, 0] - a[:, 0], b[:, 2] - a[:, 2]
        v1x, v1z = c[:, 0] - a[:, 0], c[:, 2] - a[:, 2]
        px, pz = x - a[:, 0], z - a[:, 2]
        den = v0x * v1z - v1x * v0z
        ok = np.abs(den) > 1e-12
        u = np.where(ok, (px * v1z - v1x * pz) / np.where(ok, den, 1), -1)
        v = np.where(ok, (v0x * pz - px * v0z) / np.where(ok, den, 1), -1)
        hit = ok & (u >= -1e-6) & (v >= -1e-6) & (u + v <= 1 + 1e-6)
        if not hit.any():
            return None
        y = a[hit, 1] + u[hit] * (b[hit, 1] - a[hit, 1]) + v[hit] * (c[hit, 1] - a[hit, 1])
        return float(y.min())

    def mount_y(x, zc, half):
        ys = []
        for dz in np.linspace(-half, half, 9):
            for dx in (-0.03, 0.0, 0.03):
                y = surf_low(x + dx, zc + dz)
                if y is not None:
                    ys.append(y)
        return min(ys) if ys else 0.0

    stores = []
    for st in cfg.get('stores', []):
        L, r = MSL[st['k']]
        y_m = mount_y(st['x'], st['z'], L * 0.3)
        gap = 0.32 + 0.14 if st.get('pylon') else 0.015
        y = y_m - r - gap
        stores.append(dict(k=st['k'], x=round(st['x'], 3), y=round(y, 3), z=round(st['z'] - L / 2, 3), pylon=bool(st.get('pylon'))))
    # flames: refine the procedural nozzle positions on the real geometry
    flames = []
    for f in PROC[name]['flames']:
        fx, fy, fz = f['p']; fr = f['r']
        m = (np.hypot(VK[:, 0] - fx, VK[:, 1] - fy) < fr * 1.7) & (VK[:, 2] > fz - 3.5)
        if m.sum() < 5:
            flames.append(dict(p=[fx, fy, fz], r=fr)); continue
        ze = float(VK[m, 2].max())
        ring = m & (VK[:, 2] > ze - 0.35)
        x0, x1 = VK[ring, 0].min(), VK[ring, 0].max(); y0, y1 = VK[ring, 1].min(), VK[ring, 1].max()
        rr = 0.5 * min(x1 - x0, y1 - y0) * 0.86
        flames.append(dict(p=[round(float((x0 + x1) / 2), 3), round(float((y0 + y1) / 2), 3), round(ze - 0.05, 3)], r=round(float(min(max(rr, fr * 0.6), fr * 1.4)), 3)))
    # wingtips
    tips = []
    xm = VK[:, 0].max()
    for s in (1, -1):
        m = (VK[:, 0] * s > xm * 0.95)
        tb = 0
        for bi, bm in enumerate(bone_meta[1:], start=1):
            if bm['kind'] == 'swing' and bm['side'] == s: tb = bi
        tips.append([round(float(s * xm), 3), round(float(VK[m, 1].mean()), 3), round(float(VK[m, 2].max() - 0.2), 3), tb])
    radius = float(np.linalg.norm(VK, axis=1).max())
    acc_y = float(VK[:, 1].max()) - cfg.get('band', 0.5)  # fin-tip band painted in the player's / team colour
    return dict(js=js, binc=binc, prims=prims, V=V, F=Fk, G=Gk, S=Sk, B=Bk, meta=dict(bones=bone_meta, 
        flames=flames, tips=tips, stores=stores, launch=glb_launch, internal=cfg.get('internal'), radius=round(radius, 3), accY=round(acc_y, 3), props=props), info=info)


def pot_floor(n):
    p = 1
    while p * 2 <= n:
        p *= 2
    return p


def encode_textures(js, binc, img_ids, cfg, alpha_imgs):
    out = {}
    for img in img_ids:
        data, mime = image_bytes(js, binc, img)
        im = Image.open(io.BytesIO(data))
        has_a = im.mode in ('RGBA', 'LA', 'P') and img in alpha_imgs
        im = im.convert('RGBA' if has_a else 'RGB')
        lim = cfg.get('tex', 1024)
        w, h = im.size
        tw, th = pot_floor(min(w, lim)), pot_floor(min(h, lim))
        if (tw, th) != (w, h):
            im = im.resize((tw, th), Image.LANCZOS)
        if has_a and np.asarray(im)[:, :, 3].min() > 250:
            im = im.convert('RGB'); has_a = False
        b = io.BytesIO()
        im.save(b, 'WEBP', quality=86 if not has_a else 90, method=6)
        out[img] = dict(data=b.getvalue(), w=tw, h=th, alpha=has_a)
    return out


def write_model(name, R):
    cfg = CFG[name]
    js, binc, prims = R['js'], R['binc'], R['prims']
    V = R['V']; F = R['F']; G = R['G']; Sl = R['S']; Bt = R['B']
    # per-vertex attributes (global vertex numbering = concatenated prims)
    NOR = np.concatenate([p['nor'] if p['nor'] is not None else np.tile([0, 1, 0], (len(p['pos']), 1)) for p in prims]).astype(np.float32)
    UV = np.concatenate([p['uv'][:, :2] if p['uv'] is not None else np.zeros((len(p['pos']), 2)) for p in prims]).astype(np.float32)
    GV = np.concatenate([np.full(len(p['pos']), gi) for gi, p in enumerate(prims)])
    # material per prim -> group key (same material => same group)
    mat_of_prim = [p['mat'] for p in prims]
    # one vertex per distinct (pos, nor, uv, slot, bone, material) triangle corner: a vertex shared by a hinged part
    # and the airframe (or by a missile and its pylon) is split, so every triangle moves with its own part
    mat_v = np.array([mat_of_prim[g] for g in GV])
    cv = F.ravel(); cs = np.repeat(Sl, 3).astype(np.int16); cb = np.repeat(Bt, 3).astype(np.uint8)
    key = np.concatenate([np.round(V[cv] * 2000), np.round(NOR[cv] * 100), np.round(UV[cv] * 8000), cs[:, None], cb[:, None], mat_v[cv][:, None]], axis=1)
    _, first, inv = np.unique(key, axis=0, return_index=True, return_inverse=True)
    Fn = inv.ravel().reshape(-1, 3).astype(np.int64)
    vsrc = cv[first]
    pos = V[vsrc].astype(np.float32); nor = NOR[vsrc]; uv = UV[vsrc]; slot = cs[first]; bone = cb[first]; vmat = mat_v[vsrc]
    nv = len(pos)
    print(f'  unique verts {nv}, tris {len(Fn)}')
    # simplify
    target = cfg.get('target')
    if target and len(Fn) > target:
        attrs = np.concatenate([nor * 0.5, uv * 1.0, (vmat[:, None] * 10.0), (bone[:, None] * 10.0)], axis=1).astype(np.float32)
        w = np.ones(attrs.shape[1], np.float32)
        lock = np.zeros(nv, np.uint8)
        with tempfile.TemporaryDirectory() as td:
            fi = os.path.join(td, 'in.bin'); fo = os.path.join(td, 'out.bin')
            with open(fi, 'wb') as f:
                f.write(struct.pack('<IIIIfI', nv, len(Fn) * 3, attrs.shape[1], target * 3, cfg.get('err', 0.008), cfg.get('opts', 0)))
                f.write(pos.tobytes()); f.write(attrs.tobytes()); f.write(w.tobytes()); f.write(lock.tobytes())
                f.write(Fn.astype(np.uint32).tobytes())
            subprocess.run([os.path.join(HERE, 'msimp'), fi, fo], check=True)
            b = open(fo, 'rb').read()
            n, err = struct.unpack_from('<If', b, 0)
            Fn = np.frombuffer(b, np.uint32, n, 8).reshape(-1, 3).astype(np.int64)
            print(f'  simplified to {len(Fn)} tris (error {err:.4f})')
        used2 = np.unique(Fn)
        remap = np.full(nv, -1, np.int64); remap[used2] = np.arange(len(used2))
        Fn = remap[Fn]; pos = pos[used2]; nor = nor[used2]; uv = uv[used2]; slot = slot[used2]; bone = bone[used2]; vmat = vmat[used2]
        nv = len(pos)
    # groups by material (triangle's material = its first vertex's material)
    tmat = vmat[Fn[:, 0]]
    mats = sorted(set(tmat.tolist()))
    groups = []; order = []
    alpha_imgs = set()
    minfo = {m: material_info(js, m) for m in mats}
    for m in mats:
        mi = minfo[m]
        if mi['alpha'] in ('BLEND', 'MASK') and mi['image'] is not None:
            alpha_imgs.add(mi['image'])
    def mode_of(mi):
        return 2 if mi['alpha'] == 'BLEND' else (1 if mi['alpha'] == 'MASK' else 0)
    mats.sort(key=lambda m: (mode_of(minfo[m]), m))
    idx_parts = []; start = 0
    img_ids = sorted(set(minfo[m]['image'] for m in mats if minfo[m]['image'] is not None))
    tex_index = {img: i for i, img in enumerate(img_ids)}
    for m in mats:
        tris = Fn[tmat == m]
        mi = minfo[m]
        f = list(mi['factor']) + [1.0] * (4 - len(mi['factor']))
        ext = (js['materials'][m].get('extensions', {}) if m >= 0 else {})
        if 'KHR_materials_transmission' in ext:
            mi['alpha'] = 'BLEND'; f[3] = min(f[3], 0.55)
        groups.append(dict(start=start, count=int(tris.size), tex=tex_index.get(mi['image'], -1), color=[round(float(c), 4) for c in f[:4]],
                           mode=mode_of(mi), double=bool(mi['double']), cutoff=mi.get('cutoff', 0.5), name=mi['name'][:24]))
        idx_parts.append(tris.ravel()); start += tris.size
    idx = np.concatenate(idx_parts)
    texs = encode_textures(js, binc, img_ids, cfg, alpha_imgs)
    # quantise vertices: pos int16 (normalised to bbox), slot int16, normal int8x3 (+pad), uv uint16x2 (normalised to uv bbox)
    pmin = pos.min(0); pmax = pos.max(0); pc = (pmin + pmax) / 2; ph = np.maximum((pmax - pmin) / 2, 1e-4)
    q = np.clip(np.round((pos - pc) / ph * 32767), -32767, 32767).astype(np.int16)
    nrm = nor / np.maximum(np.linalg.norm(nor, axis=1, keepdims=True), 1e-9)
    qn = np.clip(np.round(nrm * 127), -127, 127).astype(np.int8)
    umin = uv.min(0); umax = uv.max(0); ur = np.maximum(umax - umin, 1e-6)
    qu = np.clip(np.round((uv - umin) / ur * 65535), 0, 65535).astype(np.uint16)
    vb = np.zeros((nv, 16), np.uint8)
    vb[:, 0:6] = q.view(np.uint8).reshape(nv, 6)
    vb[:, 6:8] = slot.astype(np.int16).view(np.uint8).reshape(nv, 2)
    vb[:, 8:11] = qn.view(np.uint8).reshape(nv, 3)
    vb[:, 11] = bone
    vb[:, 12:16] = qu.view(np.uint8).reshape(nv, 4)
    idx32 = nv > 65535
    ib = idx.astype(np.uint32 if idx32 else np.uint16).tobytes()
    if len(ib) % 4:
        ib += b'\0' * (4 - len(ib) % 4)
    blobs = [vb.tobytes(), ib]
    off = len(blobs[0]) + len(blobs[1])
    tex_meta = []
    for img in img_ids:
        t = texs[img]
        d = t['data']; pad = (4 - len(d) % 4) % 4
        tex_meta.append(dict(off=off, len=len(d), w=t['w'], h=t['h'], alpha=t['alpha']))
        blobs.append(d + b'\0' * pad); off += len(d) + pad
    meta = R['meta']
    header = dict(v=1, id=name, nv=int(nv), ni=int(idx.size), idx32=bool(idx32), vbytes=len(blobs[0]), ioff=len(blobs[0]),
                  pc=[round(float(x), 5) for x in pc], ph=[round(float(x), 5) for x in ph],
                  uvmin=[float(x) for x in umin], uvrange=[float(x) for x in ur], groups=groups, tex=tex_meta, meta=meta, credit=cfg['credit'])
    hj = json.dumps(header, separators=(',', ':')).encode()
    hj += b' ' * ((4 - len(hj) % 4) % 4)
    os.makedirs(OUT, exist_ok=True)
    with open(os.path.join(OUT, f'{name}.bin'), 'wb') as f:
        f.write(b'SDM1'); f.write(struct.pack('<I', len(hj))); f.write(hj)
        for b in blobs:
            f.write(b)
    size = os.path.getsize(os.path.join(OUT, f'{name}.bin'))
    print(f'  -> {name}.bin {size / 1e6:.2f} MB: {nv} verts, {idx.size // 3} tris, {len(groups)} groups, {len(tex_meta)} textures '
          f'({sum(t["len"] for t in tex_meta) / 1e6:.2f} MB tex)')
    print('  meta', json.dumps(meta)[:600])
    return header


if __name__ == '__main__':
    names = sys.argv[1:] or list(CFG)
    for n in names:
        R = build(n)
        write_model(n, R)
