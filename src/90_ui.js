// ===================== menus, hangar, overlays =====================
const SWATCHES = ['#d13b2e', '#f1b434', '#3f86ea', '#2fa36b', '#e07a2b', '#9b6ad6', '#e8e8e2', '#26b5b0'];
const UI = {
  prefs: null, paused: false, tab: 'online', era: 'jet', hangarPlane: null, yaw: -0.6, camPitch: 0.32, zoom: 1, dragging: false, dragX: 0, dragY: 0, idleT: 0,
  toastT: 0, bannerT: 0, lastInfo: 0, autoGo: true, boardHeld: false, boardOpen: false, overShown: false,
  init(hot) {
    const S = Store.read();
    const P = this.prefs = {
      name: cleanName(S.name) || ('飛官' + String(10 + Math.floor(Math.random() * 90))),
      color: SWATCHES.includes(S.color) ? S.color : pick(SWATCHES),
      acJet: AC_BY_ID[S.acJet] && AC_BY_ID[S.acJet].era === 'jet' ? S.acJet : 'f16',
      acProp: AC_BY_ID[S.acProp] && AC_BY_ID[S.acProp].era === 'prop' ? S.acProp : 'p51',
      era: S.era === 'prop' ? 'prop' : 'jet', tab: S.tab === 'practice' ? 'practice' : 'online',
      code: Net.cleanCode(S.code) || Net.newCode(),
      sens: clamp(num(S.sens, 1), 0.3, 2.5), vol: clamp(num(S.vol, 0.7), 0, 1), invert: !!S.invert, scheme: S.scheme === 'keys' ? 'keys' : 'mouse',
      quality: [1, 2, 3].includes(S.quality) ? S.quality : (matchMedia('(pointer: coarse)').matches ? 1 : 2), reduceMotion: !!S.reduceMotion || matchMedia('(prefers-reduced-motion: reduce)').matches,
      pMode: S.pMode === 'tdm' ? 'tdm' : 'ffa', pBots: clamp(num(S.pBots, 3) | 0, 0, 8), pDiff: clamp(num(S.pDiff, 1) | 0, 0, 2), pLim: [5, 10, 20].includes(S.pLim) ? S.pLim : 10,
    };
    if (hot && typeof hot === 'object') { if (hot.name) P.name = cleanName(hot.name) || P.name; if (hot.code) P.code = Net.cleanCode(hot.code) || P.code; }
    this.era = P.era; this.tab = P.tab;
    AU.vol = P.vol;
    // fields
    const nameIn = $('nameIn'); nameIn.value = P.name;
    nameIn.addEventListener('input', () => { P.name = cleanName(nameIn.value) || P.name; this.save(); });
    const sw = $('swatches');
    SWATCHES.forEach(c => { const b = document.createElement('button'); b.type = 'button'; b.className = 'swatch'; b.style.background = c; b.setAttribute('aria-label', '機尾顏色 ' + c); b.setAttribute('aria-pressed', String(c === P.color));
      b.addEventListener('click', () => { P.color = c; sw.querySelectorAll('.swatch').forEach(x => x.setAttribute('aria-pressed', String(x === b))); this.updateHangarPlane(); this.save(); }); sw.appendChild(b); });
    // an invite link carries the room code in the address (#CODE)
    let invited = '';
    try { invited = Net.cleanCode((location.hash || '').replace(/^#/, '')); } catch (e) { invited = ''; }
    if (invited.length >= 3) { P.code = invited; this.tab = P.tab = 'online'; this.invited = invited; }
    const codeIn = $('codeIn'); codeIn.value = P.code;
    codeIn.addEventListener('input', () => { const v = Net.cleanCode(codeIn.value); if (v !== codeIn.value) codeIn.value = v; P.code = v; this.save(); this.updateGo(); });
    $('newCode').addEventListener('click', () => { P.code = Net.newCode(); codeIn.value = P.code; this.invited = ''; this.save(); this.updateGo(); this.netStatus(); });
    $('inviteBtn').addEventListener('click', () => this.copyInvite(Net.cleanCode(codeIn.value) || P.code));
    $('inviteGame').addEventListener('click', () => this.copyInvite(Net.code));
    // tabs
    const setTab = t => { this.tab = P.tab = t; $('tabOnline').setAttribute('aria-selected', String(t === 'online')); $('tabPractice').setAttribute('aria-selected', String(t === 'practice'));
      $('panelOnline').hidden = t !== 'online'; $('panelPractice').hidden = t !== 'practice'; this.updateGo(); this.save(); };
    $('tabOnline').addEventListener('click', () => setTab('online')); $('tabPractice').addEventListener('click', () => setTab('practice'));
    setTab(this.tab);
    // practice options
    this.seg('pMode', P.pMode, v => { P.pMode = v; this.save(); });
    this.seg('pDiff', String(P.pDiff), v => { P.pDiff = +v; this.save(); });
    this.seg('pLim', String(P.pLim), v => { P.pLim = +v; this.save(); });
    const botOut = $('botOut'); botOut.textContent = P.pBots;
    $('botMinus').addEventListener('click', () => { P.pBots = Math.max(0, P.pBots - 1); botOut.textContent = P.pBots; this.save(); this.updateGo(); });
    $('botPlus').addEventListener('click', () => { P.pBots = Math.min(8, P.pBots + 1); botOut.textContent = P.pBots; this.save(); this.updateGo(); });
    // hangar
    $('eraJet').addEventListener('click', () => this.setEra('jet'));
    $('eraProp').addEventListener('click', () => this.setEra('prop'));
    $('prevAc').addEventListener('click', () => this.stepAc(-1));
    $('nextAc').addEventListener('click', () => this.stepAc(1));
    const stage = $('stage');
    stage.addEventListener('pointerdown', e => { if (e.target.closest('button')) return; this.dragging = true; this.dragX = e.clientX; this.dragY = e.clientY; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => { if (!this.dragging) return; this.yaw += (e.clientX - this.dragX) * 0.01; this.dragX = e.clientX; this.idleT = 0;
      this.camPitch = clamp(this.camPitch + (e.clientY - this.dragY) * 0.006, 0.03, 1.4); this.dragY = e.clientY; });
    // mouse wheel: zoom in for a closer look at the details
    // (only in the wide layout: in the narrow one the whole menu scrolls and the wheel must keep doing that)
    stage.addEventListener('wheel', e => { if (innerWidth <= 900) return; e.preventDefault(); this.zoom = clamp(this.zoom * Math.exp(e.deltaY * 0.0012), 0.5, 1.5); this.idleT = 0; }, { passive: false });
    const endDrag = () => { this.dragging = false; };
    stage.addEventListener('pointerup', endDrag); stage.addEventListener('pointercancel', endDrag);
    this.setEra(this.era);
    // go
    $('goBtn').addEventListener('click', () => this.go());
    // in-game
    $('pauseBtn').addEventListener('click', () => this.togglePause(true));
    $('resumeBtn').addEventListener('click', () => this.togglePause(false));
    // in flight, keys drive the aircraft: never leave a button holding keyboard focus (Space would "click" it)
    $('ingame').addEventListener('click', e => { const b = e.target.closest('button'); if (b && !this.paused) setTimeout(() => { if (document.activeElement === b) b.blur(); }, 0); });
    $('leaveBtn').addEventListener('click', () => this.leave());
    $('boardBtn').addEventListener('click', () => this.showBoard(!this.boardOpen));
    $('boardClose').addEventListener('click', () => this.showBoard(false));
    $('deathSwap').addEventListener('click', () => this.togglePause(true));
    $('deathGo').addEventListener('click', () => { const me = Game.me; if (me && !me.alive && performance.now() >= me.respawnAt) { this.autoGo = true; Game.spawnLocal(me, performance.now()); } });
    const sens = $('sensIn'); sens.value = P.sens; sens.addEventListener('input', () => { P.sens = +sens.value; this.save(); });
    const vol = $('volIn'); vol.value = P.vol; vol.addEventListener('input', () => { P.vol = +vol.value; AU.setVolume(P.vol); this.save(); });
    const inv = $('invIn'); inv.checked = P.invert; inv.addEventListener('change', () => { P.invert = inv.checked; this.save(); });
    const mot = $('motionIn'); mot.checked = P.reduceMotion; mot.addEventListener('change', () => { P.reduceMotion = mot.checked; this.save(); });
    this.seg('schemeSeg', P.scheme, v => { P.scheme = v; Input.scheme = Input.touch ? 'touch' : v; this.save(); });
    this.seg('qualSeg', String(P.quality), v => { P.quality = +v; FX.budget = P.quality === 1 ? 0.5 : 1; this.save(); if (P.quality > 1) HD.wantAll(Game.me ? Game.me.def.id : this.selectedFor(this.era).id); });
    this.seg('teamSeg', '1', v => { const me = Game.me; if (me && Game.rules.mode === 'tdm') { me.team = +v; me.updateAccent(); if (me.alive) Game.spawnLocal(me, performance.now()); this.refreshPause(); } });
    const hostSet = (k, v) => { if (!this.canEditRules()) return; const r = {}; r[k] = v; Game.setRules(r, performance.now()); };
    this.seg('rMode', 'ffa', v => hostSet('mode', v)); this.seg('rEra', 'jet', v => hostSet('era', v));
    this.seg('rLim', '10', v => hostSet('lim', +v)); this.seg('rDiff', '1', v => hostSet('diff', +v));
    $('rBotMinus').addEventListener('click', () => hostSet('bots', Math.max(0, Game.rules.bots - 1)));
    $('rBotPlus').addEventListener('click', () => hostSet('bots', Math.min(8, Game.rules.bots + 1)));
    window.addEventListener('keydown', e => { if (e.code === 'Tab' && Game.active) { e.preventDefault(); if (!this.boardHeld) { this.boardHeld = true; this.showBoard(true); } } });
    window.addEventListener('keyup', e => { if (e.code === 'Tab' && this.boardHeld) { this.boardHeld = false; if (!(Game.rstate === 'over')) this.showBoard(false); } });
    Input.scheme = Input.touch ? 'touch' : P.scheme;
    FX.budget = P.quality === 1 ? 0.5 : 1;
    this.renderRooms(); this.netStatus();
  },
  save() { const P = this.prefs; Store.write(Object.assign({}, P)); },
  seg(id, val, cb) {
    const el = $(id); if (!el) return;
    const set = v => el.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.v === String(v))));
    set(val);
    el.addEventListener('click', e => { const b = e.target.closest('button'); if (!b || b.disabled) return; set(b.dataset.v); cb(b.dataset.v); });
    el._set = set;
  },
  // ---------- hangar ----------
  list(era) { return AC_DEFS.filter(d => d.era === era); },
  selectedFor(era) { const id = era === 'prop' ? this.prefs.acProp : this.prefs.acJet; return AC_BY_ID[id] && AC_BY_ID[id].era === era ? AC_BY_ID[id] : this.list(era)[0]; },
  setEra(era) {
    this.era = this.prefs.era = era;
    $('eraJet').setAttribute('aria-pressed', String(era === 'jet')); $('eraProp').setAttribute('aria-pressed', String(era === 'prop'));
    this.renderChips($('chips'), era, false);
    this.updateHangarPlane(); this.renderSpec(); this.save();
  },
  renderChips(host, era, inGame) {
    host.textContent = '';
    const cur = this.selectedFor(era);
    for (const d of this.list(era)) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'chip'; b.textContent = d.name; b.setAttribute('aria-pressed', String(d === cur));
      b.addEventListener('click', () => {
        if (era === 'prop') this.prefs.acProp = d.id; else this.prefs.acJet = d.id;
        host.querySelectorAll('.chip').forEach(x => x.setAttribute('aria-pressed', String(x === b)));
        this.save();
        if (inGame) { Game.pendingAc = d; const me = Game.me; $('swapNote').textContent = me && me.alive ? `下次出擊時換上 ${d.name}` : `重生時換上 ${d.name}`; }
        else { this.updateHangarPlane(); this.renderSpec(); AU.click(); }
      });
      host.appendChild(b);
    }
  },
  stepAc(dir) {
    const L = this.list(this.era), cur = this.selectedFor(this.era), i = (L.indexOf(cur) + dir + L.length) % L.length;
    if (this.era === 'prop') this.prefs.acProp = L[i].id; else this.prefs.acJet = L[i].id;
    this.renderChips($('chips'), this.era, false); this.updateHangarPlane(); this.renderSpec(); this.save();
  },
  updateHangarPlane() {
    if (!R.ok) return;
    const def = this.selectedFor(this.era);
    if (!this.hangarPlane) this.hangarPlane = new Plane({ key: 'hangar', owner: 'hangar', local: true, name: 'hangar', color: this.prefs.color, ac: def });
    const p = this.hangarPlane; p.color = this.prefs.color; p.setAircraft(def); p.alive = true; p.hp = def.st.hp; p.ctrl.thr = 0.55;
    p.mR = def.wR ? def.wR.n : 0; p.mI = def.wI ? def.wI.n : 0; p.abFuel = def.perf.abFuel;
    HD.want(def.id, true);
  },
  renderSpec() {
    const d = this.selectedFor(this.era), el = $('spec'), L = this.list(this.era), st = d.st, jet = d.era === 'jet';
    const rng = f => { const v = L.map(f); return [Math.min(...v), Math.max(...v)]; };
    const bar = (v, [a, b]) => clamp(Math.round(4 + 6 * (b > a ? (v - a) / (b - a) : 1)), 1, 10);
    const kmh = v => Math.round(v).toLocaleString('en-US');
    const turn = x => x.st.wb + x.st.roll * 0.02;
    const rows = [['極速', bar(st.vab, rng(x => x.st.vab))], ['轉向', bar(turn(d), rng(turn))], ['加速', bar(st.aab, rng(x => x.st.aab))], ['耐久', bar(st.hp, rng(x => x.st.hp))]];
    if (jet) rows.push(['雷達', bar(st.radar, rng(x => x.st.radar))]);
    else rows.push(['火力', bar(st.gunRate * st.gunDmg, rng(x => x.st.gunRate * x.st.gunDmg))]);
    el.textContent = '';
    const lab = document.createElement('div'); lab.className = 'lab'; lab.innerHTML = '<span>Spec <small>規格</small></span>';
    const idx = document.createElement('small'); idx.textContent = `${L.indexOf(d) + 1} / ${L.length}`; lab.appendChild(idx);
    const h = document.createElement('h2'); h.textContent = d.name;
    const en = document.createElement('div'); en.className = 'en'; en.textContent = d.en;
    const dl = document.createElement('dl'); dl.className = 'facts';
    const facts = [['國家／首飛', `${d.country}／${d.first} 年`], ['生命值', String(st.hp)],
      ['極速', `${kmh(st.vab)} km/h（${jet ? '後燃' : 'WEP'}）／${kmh(st.vmax)} km/h`],
      ['最佳轉向', `${st.wb}°/秒（${kmh(st.vc)} km/h 附近）`], ['滾轉', `${st.roll}°/秒`], ['失速', `${kmh(st.vs)} km/h`],
      [jet ? '後燃器' : 'WEP', `${st.abFuel} 秒，${st.abRegen} 秒回滿`]];
    if (jet) facts.push(['雷達', `${st.radar} 公里，掃描 ±${st.scan}°`], ['熱焰彈', `冷卻 ${st.flareCd} 秒，持續 ${st.flareDur} 秒`]);
    facts.push(['機砲', d.gun]);
    if (jet) facts.push(['飛彈', d.loadText]);
    for (const [k, v] of facts) { const dt = document.createElement('dt'); dt.textContent = k; const dd = document.createElement('dd'); dd.textContent = v; dl.append(dt, dd); }
    const bars = document.createElement('div'); bars.className = 'bars';
    for (const [k, n] of rows) { const s = document.createElement('span'); s.textContent = k; const b = document.createElement('div'); b.className = 'bar'; b.setAttribute('aria-label', `${k} ${n}/10`);
      for (let i = 0; i < 10; i++) { const it = document.createElement('i'); if (i < n) it.className = 'on'; b.appendChild(it); } bars.append(s, b); }
    const note = document.createElement('p'); note.textContent = d.note + (d.est && !d.note.includes('估計') ? '（數值為估計值）' : '');
    el.append(lab, h, en, dl, bars, note);
    const cr = HD_CREDIT[d.id];
    if (cr) { const c = document.createElement('p'); c.className = 'credit'; c.textContent = `3D 模型：${cr[0]}，作者 ${cr[1]}（${cr[2]}，Sketchfab）`; el.append(c); }
  },
  renderHangar(now, dt) {
    const p = this.hangarPlane; if (!p) return;
    const stage = $('stage').getBoundingClientRect();
    if (!this.dragging) { this.idleT += dt; if (this.idleT > 1.5) this.yaw += dt * 0.32; }
    const m = p.model, C = R.cam;
    const fit = Math.max(120, Math.min(stage.width * 0.78, stage.height * 1.45));
    const fov = 30 * DEG, dist = m.radius / Math.tan(fov / 2) * (R.cssH / fit) * 0.92 * this.zoom;
    const pitch = this.pitchOverride !== undefined ? this.pitchOverride : this.camPitch;
    C.fov = fov; C.near = 0.5; C.far = 2000;
    C.pos.set(Math.sin(this.yaw) * Math.cos(pitch) * dist, Math.sin(pitch) * dist, Math.cos(this.yaw) * Math.cos(pitch) * dist);
    C.q.lookDir(_a.copy(C.pos).scale(-1).norm(), _b.set(0, 1, 0));
    C.ox = (stage.left + stage.width / 2) - R.cssW / 2; C.oy = (stage.top + stage.height / 2) - R.cssH / 2;
    p.pos.set(0, 0, 0); p.q.ident(); p.speed = 160;
    // pre-flight "control check" every 10 s (stick back/forward, roll right/left, rudder right/left);
    // the F-14 also folds its wings back and spreads them again
    const t = (now / 1000) % 10, o = this.ctrlOverride; // tests: [pitch, roll, yaw, speed]
    p.ctrl.pitch = o ? o[0] : t < 1.4 ? Math.sin(t / 1.4 * TAU) : 0;
    p.ctrl.roll = o ? o[1] : t >= 1.6 && t < 3 ? Math.sin((t - 1.6) / 1.4 * TAU) : 0;
    p.ctrl.yaw = o ? o[2] : t >= 3.2 && t < 4.6 ? Math.sin((t - 3.2) / 1.4 * TAU) : 0;
    if (p.def.id === 'f14') p.speed = o ? o[3] || 140 : (now / 1000) % 20 >= 10 ? 330 : 140;
    p.visual(dt, now);
    R.begin([0.105, 0.12, 0.135]);
    if (!this.floor) this.floor = buildFloor();
    M4.fromQP(FLOOR_M, new Q(), _a.set(0, -m.radius * 0.3, 0), m.radius * 1.02);
    R.drawLit(this.floor, FLOOR_M, { cull: false });
    p.drawBody(true);
    p.drawFlames(now);
  },
  // ---------- go / leave ----------
  updateGo() {
    const online = this.tab === 'online';
    const side = $('goSide'); side.textContent = '';
    const sm = document.createElement('small'); sm.textContent = online ? '加入房間' : '單人練習';
    side.append(sm, document.createTextNode(online ? (Net.cleanCode($('codeIn').value) || '—') : `AI × ${this.prefs.pBots}`));
    $('goBtn').disabled = online && Net.status !== 'ready';
  },
  async go() {
    AU.init(); AU.setVolume(this.prefs.vol);
    const P = this.prefs; P.name = cleanName($('nameIn').value) || P.name; this.save();
    if (this.tab === 'online') {
      if (Net.status !== 'ready') { this.netStatus(); return; }
      const code = Net.cleanCode($('codeIn').value) || Net.newCode();
      $('codeIn').value = code; P.code = code; this.save();
      const room = Net.rooms.find(r => r.code === code);
      if (room && room.era !== this.era) this.setEra(room.era);
      $('goBtn').disabled = true; $('netNote').textContent = '正在加入房間 ' + code + '…';
      const ok = await Net.join(code);
      $('goBtn').disabled = false;
      if (!ok) { $('netNote').textContent = '加入失敗，請再試一次。'; return; }
      Game.start('online', { era: this.era, bots: 0 });
      $('roomCode').textContent = code;
    } else {
      Game.start('practice', { mode: P.pMode, lim: P.pLim, era: this.era, bots: P.pBots, diff: P.pDiff });
      $('roomCode').textContent = '練習';
    }
    this.enterFlight();
  },
  enterFlight() {
    $('menu').hidden = true; $('ingame').hidden = false; document.body.classList.add('flying');
    this.paused = false; this.overShown = false; this.autoGo = true;
    $('touch').hidden = !Input.touch;
    this.netStatus(); this.refreshInfo(true);
    if (!Input.touch) this.toast(Input.scheme === 'mouse' ? '點一下畫面鎖定滑鼠，飛機會跟著準星轉向。Q 切換飛彈。' : '方向鍵操縱，空白鍵開火，F 發射飛彈，Q 切換飛彈。');
    if (Input.touch && innerHeight > innerWidth) $('rotateHint').hidden = false;
  },
  async leave() {
    Input.releaseLock();
    this.paused = false; $('pauseOv').hidden = true; this.showBoard(false); $('deathOv').hidden = true;
    const wasOnline = Game.kind === 'online';
    Game.stop();
    if (wasOnline) await Net.leave();
    $('ingame').hidden = true; $('menu').hidden = false; document.body.classList.remove('flying');
    AU.engine(false, 0, false, 0, false, 1); AU.setLock(0);
    this.updateHangarPlane(); this.netStatus(); this.renderRooms();
  },
  // ---------- in-flight overlays ----------
  togglePause(force) {
    if (!Game.active) return;
    const open = typeof force === 'boolean' ? force : !this.paused;
    this.paused = open;
    $('pauseOv').hidden = !open;
    if (!open && document.activeElement && document.activeElement.blur) document.activeElement.blur();
    if (open) { Input.releaseLock(); this.refreshPause(); this.renderChips($('pauseChips'), Game.rules.era, true); $('swapNote').textContent = '下次出擊時換上'; }
  },
  canEditRules() { return Game.kind === 'practice' || (Game.kind === 'online' && Net.isHost(performance.now())); },
  refreshPause() {
    if (!Game.active) return;
    const r = Game.rules, edit = this.canEditRules();
    const note = Game.kind === 'online' ? `房間 ${Net.code} · ${Net.playerCount()} 位飛行員 · 第 ${Game.round} 回合` : `單人練習 · 第 ${Game.round} 回合`;
    $('pauseNote').textContent = note + (Game.kind === 'online' ? '（聯機時遊戲不會暫停）' : '');
    $('hostNote').textContent = edit ? (Game.kind === 'online' ? '你是房主，可以調整' : '練習設定') : '只有房主能調整';
    for (const id of ['rMode', 'rEra', 'rLim', 'rDiff']) $(id).querySelectorAll('button').forEach(b => { b.disabled = !edit; });
    $('rBotMinus').disabled = !edit; $('rBotPlus').disabled = !edit;
    $('rMode')._set(r.mode); $('rEra')._set(r.era); $('rLim')._set(String(r.lim)); $('rDiff')._set(String(r.diff)); $('rBotOut').textContent = r.bots;
    const tdm = r.mode === 'tdm';
    $('teamField').hidden = !tdm;
    if (tdm && Game.me) $('teamSeg')._set(String(Game.me.team));
  },
  toast(msg) { const t = $('toast'); t.textContent = msg; t.hidden = false; this.toastT = performance.now() + 3600; },
  banner(main, sub) { $('bannerMain').textContent = main; $('bannerSub').textContent = sub || ''; $('banner').hidden = false; this.bannerT = performance.now() + 2200; },
  died(killer, weapon, now) {
    $('deathOv').hidden = false;
    $('deathLab').textContent = weapon >= 2 ? (weapon === 3 ? 'OUT OF AREA' : 'CRASHED') : 'SHOT DOWN';
    $('deathMain').textContent = killer && killer !== Game.me ? `被 ${killer.name} 用${WEAPON_NAME[weapon]}擊落` : (weapon === 3 ? '脫離戰區太久' : weapon === 2 ? '墜毀了' : '被擊落');
    this.autoGo = true;
  },
  spawned() { $('deathOv').hidden = true; },
  autoRespawn() { return this.autoGo && !this.paused; },
  roundOver() { this.overShown = true; this.showBoard(true, true); },
  roundStart(n) { if (this.overShown) { this.overShown = false; this.showBoard(false); } if (n > 1) this.banner(`第 ${n} 回合`, '擊落數歸零，重新出擊'); },
  showBoard(open, over) {
    this.boardOpen = open; $('boardOv').hidden = !open;
    if (open) this.renderBoard(over || Game.rstate === 'over');
  },
  renderBoard(over) {
    const body = $('boardBody'); body.textContent = '';
    const rows = Game.planes.filter(p => p.key !== 'hangar').slice().sort((a, b) => b.kills - a.kills || a.deaths - b.deaths);
    for (const p of rows) {
      const tr = document.createElement('tr'); if (p === Game.me) tr.className = 'me';
      const n = document.createElement('td'); const sw = document.createElement('span'); sw.className = 'sw'; sw.style.background = p.team ? TEAM_COL[p.team] : p.color; n.append(sw, document.createTextNode(p.name));
      const a = document.createElement('td'); a.textContent = p.def.name;
      const k = document.createElement('td'); k.className = 'num'; k.textContent = p.kills;
      const d = document.createElement('td'); d.className = 'num'; d.textContent = p.deaths;
      tr.append(n, a, k, d);
      if (Net.kind === 'web' && Game.kind === 'online') {
        const c = document.createElement('td'); c.className = 'num';
        const info = !p.local && p.idx === 0 ? Net.peerInfo(p.owner) : null;
        c.textContent = info ? (info.route === 'p2p' ? '直連' : '轉送') + (info.ms ? ` ${info.ms}ms` : '') : '—';
        tr.appendChild(c);
      }
      body.appendChild(tr);
    }
    $('pingHead').hidden = !(Net.kind === 'web' && Game.kind === 'online');
    const tdm = Game.rules.mode === 'tdm', ts = Game.teamScores();
    $('teamSum').hidden = !tdm; if (tdm) $('teamSum').innerHTML = `<span style="color:${TEAM_COL[1]}">藍隊 ${ts[1]}</span><span style="color:${TEAM_COL[2]}">紅隊 ${ts[2]}</span>`;
    $('boardTitle').textContent = over ? `${Game.winner} 獲勝` : '計分板';
    this.boardNoteTick();
  },
  boardNoteTick() {
    const el = $('boardNote');
    if (Game.rstate === 'over') el.textContent = `下一回合 ${Math.max(0, Math.ceil((Game.nextAt - performance.now()) / 1000))} 秒後開始`;
    else el.textContent = Game.rules.mode === 'tdm' ? `先擊落 ${Game.rules.lim} 架的隊伍獲勝` : `先擊落 ${Game.rules.lim} 架的飛行員獲勝`;
  },
  refreshRoster() { if (this.boardOpen) this.renderBoard(Game.rstate === 'over'); },
  refreshInfo(force) {
    const now = performance.now();
    if (!force && now - this.lastInfo < 250) return;
    this.lastInfo = now;
    const r = Game.rules;
    let s = `第 ${Game.round} 回合 · ${r.mode === 'tdm' ? '紅藍對抗' : '個人混戰'} · 先擊落 ${r.lim}`;
    if (Game.kind === 'online') { s += ` · ${Net.playerCount()} 人` + (Net.isHost(now) ? ' · 房主' : ''); const ls = Net.linkSummary(); if (ls) s += ' · ' + ls; }
    $('roundInfo').textContent = s;
  },
  tick(now) {
    if (this.toastT && now > this.toastT) { this.toastT = 0; $('toast').hidden = true; }
    if (this.bannerT && now > this.bannerT) { this.bannerT = 0; $('banner').hidden = true; }
    const me = Game.me;
    if (me && !me.alive) {
      const left = Math.max(0, me.respawnAt - now);
      $('deathCount').textContent = left > 0 ? `${(left / 1000).toFixed(1)} 秒後重新出擊` : '準備出擊';
      $('deathGo').disabled = left > 0;
    }
    if (this.boardOpen && Game.rstate === 'over') this.boardNoteTick();
    this.refreshInfo(false);
    if (Input.touch) $('rotateHint').hidden = !(innerHeight > innerWidth);
  },
  toggleMute() { AU.setMuted(!AU.muted); this.toast(AU.muted ? '已靜音（M 恢復）' : '已恢復聲音'); },
  async copyInvite(code) {
    const url = Net.inviteUrl(code);
    if (!url) { this.toast('房間代碼：' + code); return; }
    let ok = false;
    try { await navigator.clipboard.writeText(url); ok = true; } catch (e) {
      try { const t = document.createElement('textarea'); t.value = url; t.style.position = 'fixed'; t.style.opacity = '0'; document.body.appendChild(t); t.select(); ok = document.execCommand('copy'); t.remove(); } catch (e2) { ok = false; }
    }
    if (Game.active) this.toast(ok ? '邀請連結已複製，貼給同學就能加入 ' + code : '複製失敗，請把這個網址傳給同學：' + url);
    else { const n = $('netNote'); n.className = 'note ok'; n.textContent = ok ? `已複製邀請連結：${url}` : `複製失敗，請手動傳這個網址：${url}`; }
  },
  netStatus() {
    const note = $('netNote'), dot = $('netDot'), web = Net.kind === 'web';
    if (note) {
      const inv = this.invited ? `已帶入邀請的房間 ${this.invited}，選好戰機按起飛就會加入。` : '';
      if (Net.status === 'checking') { note.className = 'note'; note.textContent = inv + '正在連線到多人伺服器…'; }
      else if (Net.status === 'ready') {
        note.className = 'note ok';
        note.textContent = inv || (web ? '多人連線就緒。按「複製邀請連結」傳給同學，對方點開連結就會帶入同一組房間代碼。' : '多人連線就緒。把房間代碼告訴朋友，對方在這個頁面輸入同一組代碼就能一起飛。');
      } else if (Net.status === 'reconnecting') { note.className = 'note err'; note.textContent = '多人伺服器斷線了，正在重新連線…'; }
      else {
        note.className = 'note err';
        note.textContent = web ? '連不上多人伺服器（學校或公司網路有時會擋），換個網路或開手機熱點再試；單人練習照常可以玩。'
          : '這個畫面無法連上多人房間（需要在 Claude 裡用登入的帳號開啟，並由你分享邀請）。單人練習照常可以玩。';
      }
    }
    const ib = $('inviteBtn'); if (ib) ib.hidden = !web;
    const ig = $('inviteGame'); if (ig) ig.hidden = !(web && Game.kind === 'online');
    if (dot) dot.className = 'dot' + (Game.kind === 'online' && !Net.connected ? ' warn' : '');
    this.updateGo();
  },
  renderRooms() {
    const host = $('rooms'); if (!host) return;
    host.textContent = '';
    if (!Net.rooms.length) { const p = document.createElement('p'); p.className = 'note'; p.textContent = Net.status === 'ready' ? '目前沒有其他人開的房間，直接起飛就會開一間新的。' : '—'; host.appendChild(p); return; }
    for (const r of Net.rooms) {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'room';
      const code = document.createElement('b'); code.textContent = r.code;
      const info = document.createElement('span'); info.textContent = `${r.host ? r.host + ' 的房間' : '房間'} · ${r.era === 'prop' ? '二戰螺旋槳' : '噴射機'} · ${r.mode === 'tdm' ? '紅藍對抗' : '個人混戰'}`;
      const n = document.createElement('i'); n.textContent = r.n + ' 人';
      b.append(code, info, n);
      b.addEventListener('click', () => { $('codeIn').value = r.code; this.prefs.code = r.code; if (r.era !== this.era) this.setEra(r.era); this.save(); AU.click(); });
      host.appendChild(b);
    }
  },
};
const FLOOR_M = M4.create();
function buildFloor() {
  const mb = new MB(), seg = 96;
  const ring = (r0, r1, colFn) => {
    for (let i = 0; i < seg; i++) {
      const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU, c = colFn(i);
      mb.col = c;
      const p = (r, a) => [Math.cos(a) * r, 0, Math.sin(a) * r], n = [0, 1, 0];
      mb.tri(p(r0, a0), p(r1, a0), p(r1, a1), n, n, n); mb.tri(p(r0, a0), p(r1, a1), p(r0, a1), n, n, n);
    }
  };
  ring(0.0001, 0.6, () => [0.2, 0.215, 0.23]);
  ring(0.6, 0.88, () => [0.17, 0.185, 0.2]);
  ring(0.88, 0.9, () => [0.55, 0.57, 0.58]);
  ring(0.92, 1.0, i => (Math.floor(i / 3) % 2 ? [0.1, 0.1, 0.1] : [0.86, 0.64, 0.16]));
  mb.col = null;
  return R.mesh(mb.data(), 'lit');
}
