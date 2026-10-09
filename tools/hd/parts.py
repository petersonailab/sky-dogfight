"""Load a model into the game frame and break it into parts (nodes and/or connected components) for inspection."""
import sys, os, json
import numpy as np
import cv2
from glb import load_scene, material_info
from frame import LEN, rot_y, rot_x, best_yaw
from preview import tri_colors

YAW = {'f16': 0, 'f22': 0, 'f14': 64, 'su27': 90, 'typhoon': 90, 'mig21': 180, 'm2000': 180}


def to_game(name, path=None, yaw=None):
    path = path or os.path.join(os.path.dirname(os.path.abspath(__file__)), 'src', f'{name}.glb')
    js, binc, prims = load_scene(path)
    R = rot_y(YAW[name] if yaw is None else yaw)
    P = np.concatenate([p['pos'] for p in prims]) @ R.T
    # nose must be at -Z: the nose is the end where the fuselage is thinner and lower... use canopy heuristic:
    # the top-most points (canopy / fin) — fin is near the tail, so the z of the highest point tells us where the tail is.
    zmin, zmax = P[:, 2].min(), P[:, 2].max()
    s = LEN[name] / (zmax - zmin)
    cx = np.median(P[:, 0])
    out = []
    for p in prims:
        q = dict(p)
        v = (p['pos'] @ R.T)
        v[:, 0] -= cx
        q['pos'] = v * s
        if p['nor'] is not None:
            q['nor'] = p['nor'] @ R.T
        out.append(q)
    P = np.concatenate([p['pos'] for p in out])
    zmin, zmax = P[:, 2].min(), P[:, 2].max()
    shift = zmin + (zmax - zmin) * 0.52
    # vertical: put the fuselage axis (middle of the cross-section near the centre, on the centreline) at y = 0
    sel = (np.abs(P[:, 0]) < 0.35) & (np.abs(P[:, 2] - shift) < 1.0)
    yc = 0.5 * (P[sel, 1].min() + P[sel, 1].max()) if sel.sum() > 10 else 0.5 * (P[:, 1].min() + P[:, 1].max())
    for q in out:
        q['pos'][:, 2] -= shift
        q['pos'][:, 1] -= yc
    return js, binc, out, dict(scale=s, cx=cx, shift=shift, yc=yc, R=R)


def weld_components(pos, tri, eps=1e-4):
    """connected components of triangles, vertices welded by position"""
    key = np.round(pos / eps).astype(np.int64)
    _, inv = np.unique(key, axis=0, return_inverse=True)
    inv = inv.ravel()
    t = inv[tri]
    n = inv.max() + 1
    parent = np.arange(n)

    def find(a):
        while parent[a] != a:
            parent[a] = parent[parent[a]]
            a = parent[a]
        return a
    # union via edges (vectorised-ish)
    import scipy.sparse as sp
    import scipy.sparse.csgraph as cg
    rows = np.concatenate([t[:, 0], t[:, 1]]); cols = np.concatenate([t[:, 1], t[:, 2]])
    A = sp.coo_matrix((np.ones(len(rows)), (rows, cols)), shape=(n, n))
    ncomp, lab = cg.connected_components(A, directed=False)
    return ncomp, lab[t[:, 0]]


if __name__ == '__main__':
    name = sys.argv[1]
    js, binc, prims, info = to_game(name)
    print(name, 'scale', round(info['scale'], 4))
    P = np.concatenate([p['pos'] for p in prims])
    print('bbox', np.round(P.min(0), 2), np.round(P.max(0), 2))
    # highest point z (fin) tells whether the tail is at +z
    top = P[np.argmax(P[:, 1])]
    print('highest point', np.round(top, 2), '(tail should be at +z)')
    # node table
    rows = {}
    for p in prims:
        parts_ = p['path'].split('/'); k = (parts_[-2] if len(parts_) > 1 else '') + '/' + parts_[-1]
        r = rows.setdefault(k, dict(tris=0, mn=np.full(3, 1e9), mx=np.full(3, -1e9), mats=set()))
        r['tris'] += len(p['tri']); r['mn'] = np.minimum(r['mn'], p['pos'].min(0)); r['mx'] = np.maximum(r['mx'], p['pos'].max(0))
        r['mats'].add(material_info(js, p['mat'])['name'][:18])
    for k, r in rows.items():
        print(f"{k[:34]:34s} {r['tris']:7d}  min {np.round(r['mn'],2)} max {np.round(r['mx'],2)} {sorted(r['mats'])[:3]}")
