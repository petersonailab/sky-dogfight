"""Quick orthographic previews (painter's algorithm, centroid texture colour) of a GLB scene."""
import sys, io, os
import numpy as np
import cv2
from PIL import Image
from glb import load_scene, image_bytes, material_info

_tex_cache = {}


def tex_array(js, binc, img, path):
    key = (path, img)
    if key not in _tex_cache:
        data, mime = image_bytes(js, binc, img)
        im = Image.open(io.BytesIO(data)).convert('RGBA')
        im.thumbnail((256, 256))
        _tex_cache[key] = np.asarray(im).astype(np.float32) / 255.0
    return _tex_cache[key]


def tri_colors(js, binc, prims, path):
    cols = []
    for p in prims:
        mi = material_info(js, p['mat'])
        n = len(p['tri'])
        f = np.array(mi['factor'][:3], dtype=np.float32)
        if mi['image'] is not None and p['uv'] is not None:
            T = tex_array(js, binc, mi['image'], path)
            uv = p['uv'][p['tri']].mean(axis=1)
            u = np.mod(uv[:, 0], 1.0); v = np.mod(uv[:, 1], 1.0)
            h, w = T.shape[:2]
            c = T[(v * (h - 1)).astype(int), (u * (w - 1)).astype(int), :3] * f
        elif p['col'] is not None:
            c = p['col'][p['tri']].mean(axis=1)[:, :3] * f
        else:
            c = np.tile(f, (n, 1))
        a = mi['factor'][3] if len(mi['factor']) > 3 else 1.0
        if mi['alpha'] == 'BLEND' and a < 0.5:
            c = c * 0.3 + np.array([0.3, 0.45, 0.6]) * 0.7
        cols.append(c)
    return np.concatenate(cols) if cols else np.zeros((0, 3))


def render(V, F, C, axis_u, axis_v, axis_d, size, bounds):
    """project onto (u,v) with depth d (larger d = nearer)."""
    P = V[F]  # (n,3,3)
    u = P @ axis_u; v = P @ axis_v; d = (P @ axis_d).mean(axis=1)
    lo, hi = bounds
    scale = (size * 0.92) / (hi - lo)
    img = np.full((size, size, 3), 235, np.uint8)
    e1 = P[:, 1] - P[:, 0]; e2 = P[:, 2] - P[:, 0]
    nrm = np.cross(e1, e2); nrm /= np.maximum(np.linalg.norm(nrm, axis=1, keepdims=True), 1e-12)
    light = 0.6 * axis_d + 0.5 * axis_v + 0.3 * axis_u; light /= np.linalg.norm(light)
    shade = 0.35 + 0.65 * np.abs(nrm @ light)
    col = np.clip(C * shade[:, None], 0, 1)
    order = np.argsort(d)
    cx = size / 2 - (lo + hi) / 2 * scale
    for i in order:
        pts = np.stack([u[i] * scale + size / 2 - ((bounds[0] + bounds[1]) / 2) * scale * 0, -v[i] * scale + size / 2], axis=1)
        pts = np.round(pts * 4).astype(np.int32)
        c = col[i]
        cv2.fillPoly(img, [pts], (int(c[2] * 255), int(c[1] * 255), int(c[0] * 255)), lineType=cv2.LINE_AA, shift=2)
    return img


def preview(path, out, size=420, prims_filter=None):
    js, binc, prims = load_scene(path)
    if prims_filter:
        prims = [p for p in prims if prims_filter(p)]
    V = []; F = []; off = 0
    for p in prims:
        V.append(p['pos']); F.append(p['tri'] + off); off += len(p['pos'])
    V = np.concatenate(V); F = np.concatenate(F)
    C = tri_colors(js, binc, prims, path)
    c = (V.min(0) + V.max(0)) / 2
    V = V - c
    ext = np.abs(V).max()
    bounds = (-ext, ext)
    X, Y, Z = np.eye(3)
    views = [('top (-Y): x right, z down', X, -Z, Y), ('bottom (+Y)', X, Z, -Y), ('side +X: -z right?', -Z, Y, X),
             ('side -X', Z, Y, -X), ('front +Z', X, Y, Z), ('back -Z', -X, Y, -Z)]
    tiles = []
    for name, au, av, ad in views:
        im = render(V, F, C, au, av, ad, size, bounds)
        cv2.putText(im, name, (6, 18), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 0, 0), 1, cv2.LINE_AA)
        tiles.append(im)
    grid = np.vstack([np.hstack(tiles[:3]), np.hstack(tiles[3:])])
    cv2.imwrite(out, grid)
    mn, mx = V.min(0) + c, V.max(0) + c
    print(path, 'bbox min', np.round(mn, 3), 'max', np.round(mx, 3), 'size', np.round(mx - mn, 3), 'tris', len(F))


if __name__ == '__main__':
    for p in sys.argv[1:]:
        name = p.split('/')[-1].replace('.glb', '')
        preview(p, os.path.join(os.path.dirname(os.path.abspath(__file__)), f'prev_{name}.png'))
