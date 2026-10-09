"""Minimal glTF 2.0 / GLB reader + writer helpers (numpy). Bakes node transforms into world-space primitives."""
import json, struct
import numpy as np

CT = {5120: np.int8, 5121: np.uint8, 5122: np.int16, 5123: np.uint16, 5125: np.uint32, 5126: np.float32}
NC = {'SCALAR': 1, 'VEC2': 2, 'VEC3': 3, 'VEC4': 4, 'MAT4': 16}


def read_glb(path):
    b = open(path, 'rb').read()
    magic, ver, length = struct.unpack_from('<4sII', b, 0)
    assert magic == b'glTF', path
    off = 12
    js, binc = None, b''
    while off < len(b):
        clen, ctype = struct.unpack_from('<I4s', b, off)
        data = b[off + 8: off + 8 + clen]
        if ctype == b'JSON':
            js = json.loads(data)
        elif ctype == b'BIN\x00':
            binc = data
        off += 8 + clen
    return js, binc


def accessor(js, binc, idx):
    a = js['accessors'][idx]
    n, comps, dt = a['count'], NC[a['type']], CT[a['componentType']]
    if 'bufferView' not in a:
        return np.zeros((n, comps), dtype=np.float32)
    bv = js['bufferViews'][a['bufferView']]
    base = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
    item = np.dtype(dt).itemsize * comps
    stride = bv.get('byteStride', item)
    if stride == item:
        arr = np.frombuffer(binc, dtype=dt, count=n * comps, offset=base).reshape(n, comps)
    else:
        raw = np.frombuffer(binc, dtype=np.uint8, count=stride * (n - 1) + item, offset=base)
        arr = np.lib.stride_tricks.as_strided(raw, shape=(n, item), strides=(stride, 1)).copy().view(dt).reshape(n, comps)
    arr = arr.astype(np.float32) if dt != np.float32 or a.get('normalized') else arr.astype(np.float32)
    if a.get('normalized'):
        if dt == np.int8: arr = np.maximum(arr / 127.0, -1)
        elif dt == np.uint8: arr = arr / 255.0
        elif dt == np.int16: arr = np.maximum(arr / 32767.0, -1)
        elif dt == np.uint16: arr = arr / 65535.0
    return arr


def node_matrix(n):
    if 'matrix' in n:
        return np.array(n['matrix'], dtype=np.float64).reshape(4, 4).T
    t = np.array(n.get('translation', [0, 0, 0]), dtype=np.float64)
    q = np.array(n.get('rotation', [0, 0, 0, 1]), dtype=np.float64)
    s = np.array(n.get('scale', [1, 1, 1]), dtype=np.float64)
    x, y, z, w = q
    R = np.array([[1 - 2 * (y * y + z * z), 2 * (x * y - z * w), 2 * (x * z + y * w)],
                  [2 * (x * y + z * w), 1 - 2 * (x * x + z * z), 2 * (y * z - x * w)],
                  [2 * (x * z - y * w), 2 * (y * z + x * w), 1 - 2 * (x * x + y * y)]])
    M = np.eye(4)
    M[:3, :3] = R * s[None, :]
    M[:3, 3] = t
    return M


def load_scene(path):
    """Returns (js, binc, prims) where prims is a list of dicts with world-space pos/nor, uv, idx, material, node name path."""
    js, binc = read_glb(path)
    scene = js['scenes'][js.get('scene', 0)]
    prims = []

    def visit(ni, parentM, path):
        n = js['nodes'][ni]
        M = parentM @ node_matrix(n)
        name = n.get('name', '')
        p2 = path + [name]
        if 'mesh' in n:
            mesh = js['meshes'][n['mesh']]
            for pi, p in enumerate(mesh['primitives']):
                if p.get('mode', 4) != 4:
                    continue
                at = p['attributes']
                pos = accessor(js, binc, at['POSITION']).astype(np.float64)
                pos_w = (np.c_[pos, np.ones(len(pos))] @ M.T)[:, :3]
                if 'NORMAL' in at:
                    nor = accessor(js, binc, at['NORMAL']).astype(np.float64)
                    Nm = np.linalg.inv(M[:3, :3]).T
                    nor_w = nor @ Nm.T
                    nor_w /= np.maximum(np.linalg.norm(nor_w, axis=1, keepdims=True), 1e-12)
                else:
                    nor_w = None
                uv = accessor(js, binc, at['TEXCOORD_0']) if 'TEXCOORD_0' in at else None
                col = accessor(js, binc, at['COLOR_0']) if 'COLOR_0' in at else None
                idx = accessor(js, binc, p['indices']).astype(np.int64).ravel() if 'indices' in p else np.arange(len(pos))
                flip = np.linalg.det(M[:3, :3]) < 0
                tri = idx.reshape(-1, 3)
                if flip:
                    tri = tri[:, [0, 2, 1]]
                prims.append(dict(pos=pos_w, nor=nor_w, uv=uv, col=col, tri=tri, mat=p.get('material', -1),
                                  node=name, path='/'.join(p2), mesh=mesh.get('name', ''), meshIndex=n['mesh'], prim=pi))
        for c in n.get('children', []):
            visit(c, M, p2)

    for r in scene['nodes']:
        visit(r, np.eye(4), [])
    return js, binc, prims


def image_bytes(js, binc, img_index):
    im = js['images'][img_index]
    bv = js['bufferViews'][im['bufferView']]
    o = bv.get('byteOffset', 0)
    return binc[o: o + bv['byteLength']], im.get('mimeType', '')


def material_info(js, mi):
    """(baseColorFactor, baseColorTexture image index or None, alphaMode, texcoord transform)"""
    if mi is None or mi < 0:
        return dict(factor=[0.8, 0.8, 0.8, 1.0], image=None, alpha='OPAQUE', name='default', double=False)
    m = js['materials'][mi]
    pbr = m.get('pbrMetallicRoughness', {})
    f = pbr.get('baseColorFactor', [1, 1, 1, 1])
    tex = pbr.get('baseColorTexture')
    img = None
    if tex is not None:
        t = js['textures'][tex['index']]
        img = t.get('source')
        if img is None:
            for e in t.get('extensions', {}).values():
                if 'source' in e:
                    img = e['source']
    ext = pbr.get('extensions', {})
    return dict(factor=f, image=img, alpha=m.get('alphaMode', 'OPAQUE'), name=m.get('name', ''), double=m.get('doubleSided', False),
                metal=pbr.get('metallicFactor', 1.0), rough=pbr.get('roughnessFactor', 1.0),
                mrImage=(js['textures'][pbr['metallicRoughnessTexture']['index']].get('source') if 'metallicRoughnessTexture' in pbr else None),
                cutoff=m.get('alphaCutoff', 0.5))
