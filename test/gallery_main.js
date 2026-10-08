// gallery harness: renders each aircraft from four angles
window.__gallery = (() => {
  const cv = document.getElementById('c');
  if (!R.init(cv)) { document.body.textContent = 'no webgl'; return; }
  buildSharedMeshes();
  const gl = R.gl;
  const views = [
    { yaw: -35, pitch: 18 }, { yaw: 0, pitch: 89 }, { yaw: -90, pitch: 0 }, { yaw: 145, pitch: 14 }, { yaw: 0, pitch: 0 }, { yaw: 180, pitch: -60 },
  ];
  function render(idx, opts = {}) {
    const def = AC_DEFS[idx];
    const m = acModel(def);
    const W = cv.width, H = cv.height, cols = 3, cw = Math.floor(W / cols), ch = Math.floor(H / 2);
    gl.enable(gl.SCISSOR_TEST);
    for (let v = 0; v < views.length; v++) {
      const V = views[v];
      const vx = (v % cols) * cw, vy = (1 - Math.floor(v / cols)) * ch; gl.viewport(vx, vy, cw, ch); gl.scissor(vx, vy, cw, ch);
      gl.clearColor(0.55, 0.66, 0.74, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      const C = R.cam; C.fov = 30 * DEG; C.near = 0.5; C.far = 500;
      const d = m.radius * (opts.zoom || 2.75);
      const yaw = V.yaw * DEG, pitch = V.pitch * DEG;
      // camera position: forward of the plane is -Z; yaw 0 = looking at the nose from the front
      C.pos.set(Math.sin(yaw) * Math.cos(pitch) * d * -1, Math.sin(pitch) * d, -Math.cos(yaw) * Math.cos(pitch) * d);
      const f = new V3(-C.pos.x, -C.pos.y, -C.pos.z).norm();
      C.q.lookDir(f, Math.abs(f.y) > 0.95 ? new V3(0, 0, -1) : new V3(0, 1, 0));
      R.frame++;
      const aspect = cw / ch;
      M4.persp(C.proj, C.fov, aspect, C.near, C.far); M4.view(C.view, C.q, C.pos); M4.mul(C.vp, C.proj, C.view); M4.invert(C.ivp, C.vp);
      const bones = new Float32Array(128); bones.set(IDENT_BONES);
      const look = { paint: m.paint, accent: new Float32Array(hexRGB(opts.accent || '#d13b2e')), fired: opts.fired || 0, bones };
      const model = M4.create();
      R.drawPlane(m.mesh, model, look);
    }
    gl.disable(gl.SCISSOR_TEST);
    return { name: def.name, radius: m.radius, len: m.length, verts: m.mesh.n, slots: m.slots, guns: m.guns.length };
  }
  return { render, count: AC_DEFS.length };
})();
