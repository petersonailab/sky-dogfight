// ===================== boot + frame loop =====================
const Main = {
  last: 0, booted: false, hiddenTimer: 0,
  boot(hot) {
    if (this.booted) return; this.booted = true;
    const cv = $('gl');
    if (!R.init(cv)) {
      const m = $('menu'); const p = document.createElement('p'); p.className = 'note err'; p.style.padding = '16px';
      p.textContent = '這個瀏覽器沒有開啟 WebGL，無法顯示 3D 畫面。請換用最新版的 Chrome、Safari 或 Edge。';
      m.prepend(p); return;
    }
    HUD.init($('hud'));
    HD.init();
    buildSharedMeshes(); FX.init(); FXQ.init();
    UI.init(hot);
    WORLD.buildClouds(UI.prefs.quality >= 3 ? 140 : UI.prefs.quality === 1 ? 64 : 100);
    Input.init();
    UI.updateHangarPlane(); UI.yaw = 2.4;
    Net.init();
    HD.wantAll(UI.selectedFor(UI.era).id);
    this.last = performance.now();
    requestAnimationFrame(t => this.frame(t));
    // keep presence flowing while the tab is in the background (rAF stops there)
    this.hiddenTimer = setInterval(() => { if (document.hidden && Game.active && Game.kind === 'online') { const now = performance.now(); Net.tick(now); } }, 250);
    if (window.__DF_TEST__) window.__df = { Game, Net, W, R, CAM, Input, UI, AC_DEFS, AC_BY_ID, MISSILES, WORLD, FX, HUD, Main, V3, Q, AU, Plane, Brain, steerTo, WebNet, perfOf, HD, buildAircraftModel };
  },
  frame() {
    requestAnimationFrame(t => this.frame(t));
    const now = performance.now();
    let dt = (now - this.last) / 1000; this.last = now;
    dt = clamp(dt, 0, 0.1);
    R.time = now / 1000;
    const q = UI.prefs.quality;
    R.resize(q === 1 ? 1 : q === 2 ? 1.5 : 2); HUD.resize();
    try {
      if (Game.active) this.flight(dt, now);
      else { UI.renderHangar(now, dt); HUD.clear(); }
    } catch (e) { console.error(e); }
  },
  flight(dt, now) {
    const G = Game, me = G.me;
    const frozen = UI.paused && G.kind === 'practice';
    if (!frozen) {
      if (me && me.alive && !UI.paused) Input.apply(me, dt, now);
      else if (me) { me.ctrl.gun = false; if (UI.paused && me.alive) { me.ctrl.pitch *= 0.9; me.ctrl.roll = clamp(me.right(_a).y * 1.5, -0.6, 0.6); } }
      G.update(dt, now);
      FX.update(dt);
    }
    CAM.update(dt, now);
    this.renderWorld(now);
    HUD.draw(now, dt);
    if (me) AU.engine(me.alive && !frozen, me.ctrl.thr, me.abOn, me.speed, !!me.st.prop, me.perf.vab);
    UI.tick(now);
  },
  renderWorld(now) {
    R.begin(R.env.hor);
    R.drawSky();
    R.drawLit(WORLD.cloudMesh, IDENT, { wrap: 0.8, emis: 0.36 });
    const hideMe = CAM.mode === 1 && Game.me && Game.me.alive;
    for (const pl of Game.planes) if (!(hideMe && pl === Game.me)) pl.draw(now);
    W.drawMissiles();
    R.drawWater();
    FX.upload();
    R.drawPoints(FX.smoke, false);
    FXQ.begin(); W.drawTracers(); W.drawMissileGlow(); FXQ.end();
    R.drawFx(FXQ.mesh);
    for (const pl of Game.planes) if (!(hideMe && pl === Game.me)) pl.drawFlames(now);
    R.drawPoints(FX.fire, true);
  },
};

(function start() {
  const hot = window.claude && window.claude.hot;
  try { if (hot && typeof hot.snapshot === 'function') hot.snapshot(() => ({ name: UI.prefs ? UI.prefs.name : '', code: UI.prefs ? UI.prefs.code : '' })); } catch (e) { /* optional */ }
  const go = data => Main.boot(data && typeof data === 'object' ? data : {});
  if (hot && typeof hot.ready === 'function') { try { hot.ready(go); } catch (e) { go({}); } setTimeout(() => go({}), 1500); }
  else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => go(hot && hot.data));
  else go(hot && hot.data);
})();
