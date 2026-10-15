"""Bring each source model into the game frame: nose toward -Z, up +Y, right wing +X, metres, centred like the game's models."""
import numpy as np
from glb import load_scene

# real-world lengths used by the game (AC_DEFS[].len)
LEN = {'f16': 15.06, 'f22': 18.92, 'f14': 19.1, 'su27': 21.9, 'typhoon': 15.96, 'm2000': 14.36, 'mig21': 14.5, 'p51': 9.83, 'spit': 9.47, 'bf109': 8.6,
       'rafale': 15.27, 'su30': 21.935, 'f15': 19.43}


def rot_y(deg):
    t = np.radians(deg)
    c, s = np.cos(t), np.sin(t)
    return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])


def rot_x(deg):
    t = np.radians(deg)
    c, s = np.cos(t), np.sin(t)
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


def sym_error(P, yaw):
    """mirror-symmetry error of a point cloud about the plane x=cx after rotating by yaw about Y"""
    from scipy.spatial import cKDTree
    Q = P @ rot_y(yaw).T
    cx = np.median(Q[:, 0])
    Q[:, 0] -= cx
    M = Q.copy(); M[:, 0] *= -1
    d, _ = cKDTree(Q).query(M, k=1)
    return float(np.mean(np.minimum(d, 1.0)))


def best_yaw(P, lo=-90, hi=90, step=2.0):
    rng = np.random.default_rng(1)
    S = P[rng.choice(len(P), size=min(len(P), 30000), replace=False)]
    best = None
    for yaw in np.arange(lo, hi + 1e-9, step):
        e = sym_error(S, yaw)
        if best is None or e < best[1]:
            best = (yaw, e)
    y0 = best[0]
    for yaw in np.arange(y0 - step, y0 + step + 1e-9, 0.1):
        e = sym_error(S, yaw)
        if e < best[1]:
            best = (yaw, e)
    return best
