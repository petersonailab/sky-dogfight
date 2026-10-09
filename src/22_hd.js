// ===================== hi-detail aircraft models =====================
// Textured models converted from third-party GLB files (credits in each file's header and the README).
// They are optional: they stream in after the game starts, and until one has arrived (or if the files are
// missing, e.g. inside the Claude artifact) the procedural model is drawn instead.
const HD_IDS = ['f16', 'f22', 'f14', 'su27', 'typhoon', 'm2000', 'mig21', 'p51', 'spit', 'bf109', 'missiles'];
const HD_CREDIT = {
  f16: ['F16-C Falcon', 'Carlos.Maciel', 'CC BY 4.0'],
  f22: ['F22 RAPTOR', 'sxnneh', 'Sketchfab Standard'],
  f14: ['F14', 'manilov.ap', 'CC BY 4.0'],
  su27: ['Sukhoi Su-27M (USSR)', '42manako', 'CC BY-NC 4.0'],
  typhoon: ['Eurofighter Typhoon - Fighter Jet - Free', 'bohmerang', 'CC BY-NC-SA 4.0'],
  m2000: ['Mirage 2000-5F', 'Jeyhun1985', 'CC BY 4.0'],
  mig21: ['1972 MiG-21bis', 'OUTPISTON', 'CC BY-NC-SA 4.0'],
  p51: ['P-51 Mustang', 'ACshibu', 'CC BY-NC 4.0'],
  spit: ["Isn'treal Spitfire Mk.IX (CW) (War Thunder)", 'KojfDiscord', 'CC BY 4.0'],
  bf109: ['BF 109 F-2 Messerschmitt', 'GRIP420', 'CC BY 4.0'],
};
const HD = {
  models: {}, state: {}, queue: [], busy: 0, base: 'models/', ready: false, ext32: null, aniso: null, maxAniso: 1, off: false,
  init() {
    const gl = R.gl;
    this.ext32 = gl.getExtension('OES_element_index_uint');
    this.aniso = gl.getExtension('EXT_texture_filter_anisotropic') || gl.getExtension('WEBKIT_EXT_texture_filter_anisotropic') || gl.getExtension('MOZ_EXT_texture_filter_anisotropic');
    if (this.aniso) this.maxAniso = Math.min(8, gl.getParameter(this.aniso.MAX_TEXTURE_MAX_ANISOTROPY_EXT) || 1);
    try { if (new URLSearchParams(location.search).has('lowpoly')) this.off = true; } catch (e) { /* ignore */ }
    if (typeof window.__HD_BASE__ === 'string') this.base = window.__HD_BASE__;
    this.ready = true;
  },
  // the '流暢' (smooth) quality setting keeps the light procedural models
  lite() { return this.off || (UI.prefs && UI.prefs.quality === 1); },
  get(id) { return this.lite() ? null : (this.models[id] || null); },
  // ask for a model; `first` puts it at the front of the queue
  want(id, first) {
    if (this.lite() || !this.ready || HD_IDS.indexOf(id) < 0 || this.state[id]) {
      if (first && this.state[id] === 'queued') { this.queue.splice(this.queue.indexOf(id), 1); this.queue.unshift(id); }
      return;
    }
    this.state[id] = 'queued';
    if (first) this.queue.unshift(id); else this.queue.push(id);
    this.pump();
  },
  wantAll(firstId) { if (firstId) this.want(firstId, true); this.want('missiles'); for (const id of HD_IDS) this.want(id); },
  pump() {
    while (this.busy < 2 && this.queue.length) {
      const id = this.queue.shift();
      this.state[id] = 'loading'; this.busy++;
      this.load(id).then(() => { this.state[id] = 'ready'; }, e => { this.state[id] = 'failed'; if (!this.warned) { this.warned = true; console.info('hi-detail models unavailable, using procedural ones', e && e.message); } })
        .finally(() => { this.busy--; this.pump(); });
    }
  },
  async load(id) {
    if (location.protocol === 'file:') throw new Error('file://');
    const res = await fetch(this.base + id + '.bin');
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const buf = await res.arrayBuffer();
    const dv = new DataView(buf);
    if (dv.getUint32(0, true) !== 0x314d4453) throw new Error('bad model file'); // 'SDM1'
    const hl = dv.getUint32(4, true);
    const H = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 8, hl)));
    const base = 8 + hl;
    if (H.idx32 && !this.ext32) throw new Error('32-bit indices unsupported');
    // textures first (decoding is async), then the GPU buffers in one go
    const imgs = await Promise.all(H.tex.map(t => decodeImage(new Blob([new Uint8Array(buf, base + t.off, t.len)], { type: t.mime || 'image/webp' }))));
    const gl = R.gl;
    const vb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, vb); gl.bufferData(gl.ARRAY_BUFFER, new Uint8Array(buf, base, H.vbytes), gl.STATIC_DRAW);
    const ib = gl.createBuffer(); gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ib);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, H.idx32 ? new Uint32Array(buf, base + H.ioff, H.ni) : new Uint16Array(buf, base + H.ioff, H.ni), gl.STATIC_DRAW);
    const tex = imgs.map((im, i) => {
      const t = gl.createTexture(), nearest = !!H.tex[i].nearest; gl.bindTexture(gl.TEXTURE_2D, t);
      gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, im);
      if (nearest) { // colour palette: every cell must keep its exact colour at any distance
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      } else {
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        if (this.aniso) gl.texParameterf(gl.TEXTURE_2D, this.aniso.TEXTURE_MAX_ANISOTROPY_EXT, this.maxAniso);
      }
      if (im.close) im.close();
      return t;
    });
    const M = H.meta;
    const mats = { f22: [0.12, 0.3], missiles: [0.1, 0.42] };
    const m = {
      id, vb, ib, tex, idx32: !!H.idx32, credit: H.credit, tris: H.ni / 3,
      pc: new Float32Array(H.pc), ph: new Float32Array(H.ph), uvo: new Float32Array(H.uvmin), uvs: new Float32Array(H.uvrange),
      groups: H.groups.map(g => ({ start: g.start, count: g.count, tex: g.tex, color: new Float32Array(g.color), mode: g.mode, double: !!g.double, cutoff: g.cutoff,
        mat: new Float32Array(g.mode === 2 ? [0, 0.95] : (mats[id] || [0.08, 0.34])) })),
      radius: M.radius || 3, accY: M.accY !== undefined ? M.accY : 99,
    };
    if (id === 'missiles') { m.missiles = M.missiles; this.msl = m; this.models[id] = m; return; }
    const st = buildStores(M.stores || []);
    Object.assign(m, {
      stores: st.data ? R.mesh(st.data, 'plane') : null, storeList: st.list,
      // hinged parts: [null, { kind: stab|canard|elevon|ail|rud|swing|prop, side, pivot, axis, rest? }, ...] (index = bone byte)
      bones: (M.bones || [null]).slice(0, 8),
      propBone: (M.bones || []).findIndex(b => b && b.kind === 'prop'),
      vm: {
        flames: (M.flames || []).map(f => ({ p: f.p, r: f.r })),
        props: (M.props || []).map(p => ({ z: p.z, y: p.y, r: p.r })),
        // wingtips (vortex trails) follow the swing-wing bone they belong to
        tips: M.tips.map(t => ({ p: [t[0], t[1], t[2]], bone: t[3] || 0 })),
        pylR: M.internal ? M.internal.rad : (M.launch && M.launch.rad.length ? M.launch.rad : st.pylR),
        pylI: M.internal ? M.internal.ir : (M.launch && M.launch.ir.length ? M.launch.ir : st.pylI),
      },
    });
    this.models[id] = m;
  },
  // hi-detail missile for a game missile id: { m, g0, g1, sc, tint, len, r } or null (not loaded / light mode)
  missile(id) {
    const m = this.lite() ? null : this.msl;
    if (!m) return null;
    let c = this.mslCache[id];
    if (c === undefined) {
      const spec = MSL_HD[id], e = spec && m.missiles[spec[0]];
      c = e ? { m, g0: e.g[0], g1: e.g[1], sc: spec[1] ? spec[1] / e.len : 1, tint: spec[2] ? new Float32Array([spec[2][0], spec[2][1], spec[2][2], 1]) : null, len: 0, r: 0 } : null;
      if (c) { c.len = e.len * c.sc; c.r = e.r * c.sc; }
      this.mslCache[id] = c;
    }
    return c;
  },
  mslCache: {},
};

const MSL_CREDIT = {
  aim120c: ['AIM-120C AMRAAM', 'Jeyhun1985'], aim9l: ['Missiles', 'Civorsky'], aim54c: ['Missiles', 'Civorsky'], s530d: ['Missiles', 'Civorsky'],
  aim120d: ['Missiles', 'Civorsky'], r27r: ['Russian weapon pack', 'Rhine_Lab_Muelsyse'], r73: ['Russian weapon pack', 'Rhine_Lab_Muelsyse'],
};
// which hi-detail missile model stands in for each game missile: [model, length (m) if rescaled, colour tint]
const MSL_HD = {
  aim120: ['aim120c'], aim9m: ['aim9l', 0, [0.8, 0.82, 0.84]], aim54: ['aim54c'], meteor: ['aim120d'], irist: ['aim9l'],
  r27r: ['r27r'], r73: ['r73'], s530d: ['s530d'], magic: ['aim9l', 2.75], r3r: ['aim9l', 3.1, [0.74, 0.76, 0.77]], r60: ['r73', 2.09],
};

function decodeImage(blob) {
  if (typeof createImageBitmap === 'function') return createImageBitmap(blob);
  return new Promise((res, rej) => { const url = URL.createObjectURL(blob); const im = new Image(); im.onload = () => { URL.revokeObjectURL(url); res(im); }; im.onerror = rej; im.src = url; });
}
