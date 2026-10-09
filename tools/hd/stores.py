"""Find missile/tank bodies (long round components) hanging under the airframe, and the small parts that belong to them."""
import sys
import numpy as np
from parts import to_game, weld_components


def comp_table(prims, eps=2e-3):
    V = []; F = []; off = 0; G = []
    for gi, p in enumerate(prims):
        V.append(p['pos']); F.append(p['tri'] + off); G.append(np.full(len(p['tri']), gi)); off += len(p['pos'])
    V = np.concatenate(V); F = np.concatenate(F); G = np.concatenate(G)
    n, lab = weld_components(V, F, eps=eps)
    P = V[F]
    mn = np.full((n, 3), 1e9); mx = np.full((n, 3), -1e9)
    np.minimum.at(mn, lab, P.min(axis=1)); np.maximum.at(mx, lab, P.max(axis=1))
    cnt = np.bincount(lab, minlength=n)
    return V, F, G, lab, mn, mx, cnt


def find_bodies(mn, mx, cnt, minlen=1.8, maxdia=0.62):
    out = []
    for c in range(len(cnt)):
        s = mx[c] - mn[c]
        if s[2] >= minlen and s[0] <= maxdia and s[1] <= maxdia and abs(s[0] - s[1]) < 0.12 and s[0] > 0.08:
            out.append(c)
    return out


if __name__ == '__main__':
    name = sys.argv[1]; yaw = float(sys.argv[2]) if len(sys.argv) > 2 else None
    js, binc, prims, info = to_game(name, yaw=yaw)
    V, F, G, lab, mn, mx, cnt = comp_table(prims)
    for c in find_bodies(mn, mx, cnt):
        ctr = (mn[c] + mx[c]) / 2; s = mx[c] - mn[c]
        print(f'body c{c:<5d} tris {cnt[c]:6d} ctr {np.round(ctr, 2)} size {np.round(s, 2)}')
