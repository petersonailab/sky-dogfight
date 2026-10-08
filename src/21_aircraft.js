// ===================== aircraft: data + procedural models =====================
// Design space: z runs from the nose (0) toward the tail (+), x to the right, y up.
// After building, everything is shifted so the model's local forward is -Z.

// ---------- missiles ----------
// speed km/h, lock range km, angles in degrees, times in seconds.
// fov0: the target has to be inside this cone (half-angle) to START a lock;
// fov1: while locking / locked the target has to stay inside this cone.
const MISSILES = {
  aim120: { name: 'AIM-120 AMRAAM', short: 'AIM-120', type: 'rad', cls: '中程', lock: 7.5, dmg: 140, spd: 4680, accT: 1.0, turn: 15, blast: 20, fov0: 6, fov1: 23, lockT: 1.5, shape: 'rad' },
  aim9m: { name: 'AIM-9M Sidewinder', short: 'AIM-9M', type: 'ir', cls: '近程', lock: 2.8, dmg: 132, spd: 3402, accT: 0.6, turn: 15, blast: 11, fov0: 7, fov1: 15, lockT: 1.3, shape: 'ir' },
  aim54: { name: 'AIM-54 Phoenix', short: 'AIM-54', type: 'rad', cls: '遠程', lock: 12.0, dmg: 180, spd: 6120, accT: 1.5, turn: 15, blast: 20, fov0: 5, fov1: 34, lockT: 1.5, shape: 'big' },
  meteor: { name: 'Meteor', short: 'METEOR', type: 'rad', cls: '遠程', lock: 12.0, dmg: 180, spd: 5400, accT: 1.0, turn: 15, blast: 20, fov0: 6, fov1: 35, lockT: 1.5, shape: 'rad' },
  irist: { name: 'IRIS-T', short: 'IRIS-T', type: 'ir', cls: '近程', lock: 2.8, dmg: 131, spd: 3402, accT: 0.6, turn: 15, blast: 11, fov0: 7, fov1: 15, lockT: 1.3, shape: 'ir' },
  r27r: { name: 'R-27R Alamo', short: 'R-27R', type: 'rad', cls: '中程', lock: 7.1, dmg: 149, spd: 4914, accT: 1.0, turn: 15, blast: 15, fov0: 5, fov1: 10, lockT: 1.0, shape: 'rad' },
  r73: { name: 'R-73 Archer', short: 'R-73', type: 'ir', cls: '近程', lock: 2.8, dmg: 132, spd: 3402, accT: 0.6, turn: 15, blast: 11, fov0: 7, fov1: 15, lockT: 1.3, shape: 'ir' },
  s530d: { name: 'Super 530D', short: 'S530D', type: 'rad', cls: '中程', lock: 6.6, dmg: 167, spd: 4914, accT: 1.0, turn: 15, blast: 15, fov0: 7, fov1: 7, lockT: 0.6, shape: 'rad' },
  magic: { name: 'R.550 Magic', short: 'MAGIC', type: 'ir', cls: '近程', lock: 2.5, dmg: 140, spd: 3402, accT: 0.6, turn: 15, blast: 11, fov0: 7, fov1: 15, lockT: 1.3, shape: 'ir' },
  // MiG-21 weapons: estimated in the same style (no figures were supplied for them)
  r3r: { name: 'R-3R', short: 'R-3R', type: 'rad', cls: '中程', lock: 5.0, dmg: 125, spd: 3960, accT: 1.0, turn: 15, blast: 12, fov0: 5, fov1: 9, lockT: 1.2, shape: 'rad', est: true },
  r60: { name: 'R-60', short: 'R-60', type: 'ir', cls: '近程', lock: 2.5, dmg: 118, spd: 3060, accT: 0.5, turn: 15, blast: 9, fov0: 7, fov1: 15, lockT: 1.2, shape: 'ir', est: true },
};
for (const id in MISSILES) {
  const m = MISSILES[id];
  m.id = id; m.v = m.spd / 3.6; m.range = m.lock * 1000; m.turnR = m.turn * DEG; m.fov0R = m.fov0 * DEG; m.fov1R = m.fov1 * DEG;
  m.life = m.range / m.v * 1.6 + m.accT + 2.5;
}

const AC_DEFS = [
  {
    id: 'f16', era: 'jet', name: 'F-16V 毒蛇', en: 'F-16V VIPER', country: '美國', first: 1974, len: 15.06, span: 9.96,
    gun: 'M61A1 20 mm 機砲', note: '單發動機輕型戰機，腹部進氣口加無框泡型座艙罩。最佳轉向速率 41°/秒、滾轉 240°/秒，近距纏鬥最靈活。',
    paint: { pattern: 1, top: '#80888e', bot: '#a7aeb3', c2: '#8e969b', c3: '#757d83', scale: 0.26, rad: '#5f6569', radZ: 1.9, glass: '#2f3a44', metal: 0.06, gloss: 0.34 },
    st: { hp: 174, vab: 1388, vmax: 826, vtab: 679, vt: 528, vc: 738, vr: 144, vs: 234, vcl: 416, aab: 57, acc: 34, wb: 41, wh: 15, roll: 240, resp: 8,
      abFuel: 14.4, abRegen: 12.0, flareCd: 5.0, flareDur: 1.6, detect: 3.0, radar: 7.1, scan: 33, gunRate: 16, gunDmg: 10, ammo: 510 },
    loadout: [['aim120', 4], ['aim9m', 2]],
    build(a) {
      a.body([
        { z: 0, w: 0.03, h: 0.03, y: 0.02 }, { z: 0.5, w: 0.2, h: 0.2, y: 0.02 }, { z: 1.4, w: 0.38, h: 0.38, y: 0.03 },
        { z: 2.5, w: 0.5, h: 0.5, hb: 0.48, y: 0.05 }, { z: 3.6, w: 0.57, h: 0.57, hb: 0.55, y: 0.06 },
        { z: 5.0, w: 0.64, h: 0.6, hb: 0.6, y: 0.06, n: 2.2 }, { z: 6.8, w: 0.72, h: 0.6, hb: 0.62, y: 0.05, n: 2.5 },
        { z: 9.0, w: 0.76, h: 0.58, hb: 0.62, y: 0.05, n: 2.7 }, { z: 11.2, w: 0.72, h: 0.55, hb: 0.56, y: 0.08, n: 2.5 },
        { z: 13.2, w: 0.62, h: 0.52, y: 0.1 }, { z: 14.6, w: 0.56, h: 0.5, y: 0.1 },
      ], { cap1: false });
      a.loft([{ z: 4.6, w: 0.56, h: 0.38, hb: 0.34, y: -0.8, n: 2.3 }, { z: 5.6, w: 0.58, h: 0.42, hb: 0.36, y: -0.75, n: 2.5 },
        { z: 7.4, w: 0.6, h: 0.42, hb: 0.34, y: -0.58, n: 2.6 }, { z: 9.6, w: 0.5, h: 0.3, hb: 0.22, y: -0.38, n: 2.6 }], { cap0: false });
      a.face([0, -0.82, 4.7], 0.5, 0.31);
      a.wing([[0.5, 4.4, 12.3, 0.3], [1.1, 6.9, 12.3, 0.28], [1.55, 8.2, 12.3, 0.26], [4.7, 10.85, 12.05, 0.09]], { y: -0.02 });
      const sR = a.bone('stab', [1.3, 0, 13.7], [1, 0, 0], 1), sL = a.bone('stab', [-1.3, 0, 13.7], [1, 0, 0], -1);
      a.wing([[0.5, 12.2, 14.9, 0.16], [2.75, 14.15, 15.25, 0.05]], { y: 0, dih: -10, bones: [sR, sL] });
      a.fin([[0, 10.6, 14.7, 0.24], [1.0, 11.9, 14.75, 0.18], [2.45, 13.4, 14.85, 0.09]], { y: 0.5, accentFrom: 1.75 });
      a.fin([[0, 11.6, 13.4, 0.08], [-0.55, 12.4, 13.4, 0.05]], { x: 0.42, y: -0.42, cant: -28, twin: true });
      a.nozzle(0, 0.1, 14.5, 0.56, 0.5, 1.15);
      a.canopy(4.35, 0.5, 0.4, 0.52, 1.75);
      a.gun(-0.62, 0.25, 5.0);
      a.rail(4.8, -0.02, 9.6, 12.5); a.rail(-4.8, -0.02, 9.6, 12.5);
      a.missile(-2.65, -0.42, 9.1, 'rad', true); a.missile(2.65, -0.42, 9.1, 'rad', true);
      a.missile(-4.86, -0.02, 9.3, 'rad'); a.missile(4.86, -0.02, 9.3, 'rad');
      a.missile(-3.65, -0.36, 9.9, 'ir', true); a.missile(3.65, -0.36, 9.9, 'ir', true);
      a.tip(4.9, -0.02, 12.2); a.tip(-4.9, -0.02, 12.2);
    },
  },
  {
    id: 'f22', era: 'jet', name: 'F-22A 猛禽', en: 'F-22A RAPTOR', country: '美國', first: 1997, len: 18.92, span: 13.56,
    gun: 'M61A2 20 mm 機砲', note: '匿蹤戰機，飛彈收在內藏彈艙。不開後燃器也能飛到 1,361 km/h（超音速巡航），中程彈 6 枚全場最多。',
    paint: { pattern: 1, top: '#6c7177', bot: '#686d72', c2: '#7c8187', c3: '#63686e', scale: 0.2, glass: '#8a6a2c', metal: 0.12, gloss: 0.3 },
    st: { hp: 297, vab: 1510, vmax: 1361, vtab: 742, vt: 498, vc: 810, vr: 144, vs: 288, vcl: 603, aab: 47, acc: 28, wb: 40, wh: 16, roll: 180, resp: 6,
      abFuel: 18.0, abRegen: 14.4, flareCd: 5.0, flareDur: 1.6, detect: 3.0, radar: 11.9, scan: 33, gunRate: 16, gunDmg: 10, ammo: 480 },
    loadout: [['aim120', 6], ['aim9m', 2]],
    build(a) {
      a.body([
        { z: 0, w: 0.04, h: 0.03, y: 0 }, { z: 0.8, w: 0.3, h: 0.2, hb: 0.18, ch: 0.95 }, { z: 2.0, w: 0.62, h: 0.4, hb: 0.32, ch: 0.95 },
        { z: 3.4, w: 0.86, h: 0.55, hb: 0.42, ch: 0.9 }, { z: 5.0, w: 1.05, h: 0.62, hb: 0.5, ch: 0.85 },
        { z: 6.6, w: 1.62, h: 0.62, hb: 0.62, ch: 0.85, n: 2.2 }, { z: 8.6, w: 2.12, h: 0.62, hb: 0.66, ch: 0.8, n: 2.6 },
        { z: 11.5, w: 2.18, h: 0.62, hb: 0.6, ch: 0.8, n: 2.8 }, { z: 14.5, w: 1.98, h: 0.55, hb: 0.5, ch: 0.8, n: 3 },
        { z: 16.8, w: 1.62, h: 0.45, hb: 0.42, ch: 0.75, n: 3.2 }, { z: 18.2, w: 1.4, h: 0.38, hb: 0.36, n: 3.5 },
      ], { seg: 24 });
      for (const s of [1, -1]) {
        a.loft([{ z: 5.5, w: 0.46, h: 0.48, hb: 0.46, y: -0.18, n: 1.6 }, { z: 7.0, w: 0.56, h: 0.55, y: -0.15, n: 1.8 }, { z: 9.8, w: 0.5, h: 0.5, y: -0.1, n: 2 }], { x: 1.3 * s, cap0: false, seg: 12 });
        a.face([1.3 * s, -0.18, 5.58], 0.4, 0.4, 1.6);
      }
      a.wing([[1.9, 7.4, 15.2, 0.42], [6.78, 12.5, 13.4, 0.08]], { y: 0, dih: -3 });
      const sR = a.bone('stab', [2.6, 0.05, 17.4], [1, 0, 0], 1), sL = a.bone('stab', [-2.6, 0.05, 17.4], [1, 0, 0], -1);
      a.wing([[1.4, 15.3, 19.2, 0.16], [4.45, 17.7, 19.0, 0.06]], { y: 0.05, bones: [sR, sL] });
      a.fin([[0, 12.6, 16.9, 0.2], [2.75, 14.95, 16.3, 0.07]], { x: 1.55, y: 0.42, cant: 28, twin: true, accentFrom: 1.9 });
      for (const s of [1, -1]) { a.mat(MAT.DARK); a.b.box([0.62 * s, 0.05, 18.6], 0.5, 0.38, 0.9); a.mat(MAT.BLACK); a.b.disc([0.62 * s, 0.05, 19.06], 0.2, 0.14, [0, 0, 1]); a.mat(MAT.PAINT); a.flame(0.62 * s, 0.05, 19.06, 0.34); }
      a.canopy(4.0, 0.55, 0.5, 0.55, 2.0);
      a.gun(1.65, 0.25, 8.2);
      a.tip(6.8, -0.25, 13.3); a.tip(-6.8, -0.25, 13.3);
    },
  },
  {
    id: 'f14', era: 'jet', name: 'F-14A 雄貓', en: 'F-14A TOMCAT', country: '美國', first: 1970, len: 19.1, span: 19.55,
    gun: 'M61A1 20 mm 機砲', note: '可變後掠翼艦載戰機，機翼會隨速度自動後掠。雷達 17.8 公里看得最遠，AIM-54 鳳凰飛彈速度最快。',
    paint: { pattern: 0, top: '#b3b2a9', bot: '#e3e3dc', c2: '#b3b2a9', c3: '#b3b2a9', scale: 0.3, rad: '#c9c8bf', radZ: 1.8, glass: '#2e3944', metal: 0.05, gloss: 0.42 },
    st: { hp: 251, vab: 1240, vmax: 739, vtab: 580, vt: 431, vc: 666, vr: 180, vs: 288, vcl: 496, aab: 41, acc: 25, wb: 36, wh: 14, roll: 180, resp: 6,
      abFuel: 18.0, abRegen: 14.4, flareCd: 5.0, flareDur: 1.6, detect: 3.0, radar: 17.8, scan: 49, gunRate: 16, gunDmg: 10, ammo: 675 },
    loadout: [['aim54', 4], ['aim9m', 4]],
    build(a) {
      a.body([
        { z: 0, w: 0.03, h: 0.03, y: 0 }, { z: 0.8, w: 0.3, h: 0.32 }, { z: 2.2, w: 0.55, h: 0.58 },
        { z: 3.8, w: 0.68, h: 0.7, hb: 0.65, y: 0.05 }, { z: 6.0, w: 0.78, h: 0.72, hb: 0.72 }, { z: 8.0, w: 0.9, h: 0.66, hb: 0.72, n: 2.5 },
        { z: 10.0, w: 1.0, h: 0.5, hb: 0.6, n: 3 }, { z: 13.0, w: 0.95, h: 0.38, hb: 0.42, n: 3.5 }, { z: 17.0, w: 0.75, h: 0.28, hb: 0.3, n: 3.5 }, { z: 18.6, w: 0.5, h: 0.2, hb: 0.2 },
      ]);
      for (const s of [1, -1]) {
        a.loft([{ z: 7.6, w: 0.55, h: 0.62, y: -0.3, n: 4.5 }, { z: 9.0, w: 0.6, h: 0.63, y: -0.28, n: 3.5 }, { z: 13.0, w: 0.62, h: 0.6, y: -0.25, n: 2.6 },
          { z: 17.0, w: 0.58, h: 0.56, y: -0.25, n: 2.1 }, { z: 18.3, w: 0.53, h: 0.52, y: -0.25 }], { x: 1.68 * s, cap0: false, cap1: false, seg: 16 });
        a.face([1.68 * s, -0.3, 7.68], 0.5, 0.56, 4.5);
        a.nozzle(1.68 * s, -0.25, 18.25, 0.53, 0.48, 0.8);
      }
      a.wing([[0.5, 5.6, 16.5, 0.36], [1.6, 7.6, 15.6, 0.32], [2.95, 9.35, 12.7, 0.3]], { y: 0.12 });
      const wR = a.bone('swing', [2.9, 0.12, 10.7], [0, 1, 0], 1), wL = a.bone('swing', [-2.9, 0.12, 10.7], [0, 1, 0], -1);
      a.wing([[2.65, 9.55, 12.65, 0.28], [9.7, 11.45, 12.95, 0.08]], { y: 0.12, dih: 1, bones: [wR, wL] });
      const sR = a.bone('stab', [3.1, -0.05, 17.4], [1, 0, 0], 1), sL = a.bone('stab', [-3.1, -0.05, 17.4], [1, 0, 0], -1);
      a.wing([[1.9, 15.6, 18.7, 0.16], [5.1, 17.7, 18.95, 0.06]], { y: -0.05, dih: -3, bones: [sR, sL] });
      a.fin([[0, 13.6, 17.6, 0.2], [3.05, 16.25, 17.75, 0.07]], { x: 1.62, y: 0.32, cant: 5, twin: true, accentFrom: 1.95 });
      a.fin([[0, 14.4, 16.4, 0.07], [-0.62, 15.3, 16.4, 0.05]], { x: 1.75, y: -0.84, cant: -10, twin: true });
      a.canopy(5.5, 0.62, 0.5, 0.58, 2.4);
      a.gun(-0.6, -0.15, 4.2);
      a.missile(-0.55, -0.82, 9.6, 'big'); a.missile(0.55, -0.82, 9.6, 'big');
      a.missile(-0.55, -0.82, 13.8, 'big'); a.missile(0.55, -0.82, 13.8, 'big');
      a.missile(-2.25, -0.42, 8.9, 'ir', true); a.missile(2.25, -0.42, 8.9, 'ir', true);
      a.missile(-2.6, -0.3, 9.4, 'ir'); a.missile(2.6, -0.3, 9.4, 'ir');
      a.tip(9.7, 0.2, 12.9, wR); a.tip(-9.7, 0.2, 12.9, wL);
    },
  },
  {
    id: 'su27', era: 'jet', name: 'Su-27 側衛', en: 'SU-27 FLANKER', country: '蘇聯／俄羅斯', first: 1977, len: 21.9, span: 14.7,
    gun: 'GSh-30-1 30 mm 機砲', note: '大型雙發重戰機，發動機艙分開、尾部有長尾錐。生命值 297 和 F-22 並列最高，熱焰彈冷卻也最短。',
    paint: { pattern: 2, top: '#9fb3c4', bot: '#c2d0da', c2: '#7f9db7', c3: '#b6c6d1', scale: 0.36, rad: '#d3d8cf', radZ: 1.9, glass: '#2c3a48', metal: 0.05, gloss: 0.3, },
    st: { hp: 297, vab: 1496, vmax: 947, vtab: 780, vt: 506, vc: 846, vr: 180, vs: 288, vcl: 598, aab: 43, acc: 27, wb: 37, wh: 16, roll: 180, resp: 6,
      abFuel: 17.3, abRegen: 12.8, flareCd: 4.5, flareDur: 1.6, detect: 3.0, radar: 11.9, scan: 33, gunRate: 12, gunDmg: 15, ammo: 240 },
    loadout: [['r27r', 4], ['r73', 4]],
    build(a) {
      a.body([
        { z: 0, w: 0.03, h: 0.03, y: -0.18 }, { z: 1.0, w: 0.33, h: 0.33, y: -0.12 }, { z: 2.4, w: 0.55, h: 0.55, y: -0.03 },
        { z: 4.0, w: 0.66, h: 0.66, hb: 0.6, y: 0.04 }, { z: 6.0, w: 0.74, h: 0.66, hb: 0.62, y: 0.05 }, { z: 8.5, w: 0.88, h: 0.55, hb: 0.5, n: 2.4 },
        { z: 11.0, w: 0.92, h: 0.45, hb: 0.4, n: 2.8 }, { z: 15.0, w: 0.82, h: 0.38, hb: 0.35, n: 3 }, { z: 18.0, w: 0.5, h: 0.32, hb: 0.3 },
        { z: 20.5, w: 0.32, h: 0.26, hb: 0.24 }, { z: 22.0, w: 0.16, h: 0.16, y: 0.02 },
      ]);
      for (const s of [1, -1]) {
        a.loft([{ z: 7.4, w: 0.55, h: 0.58, y: -0.62, n: 5 }, { z: 9.0, w: 0.58, h: 0.62, y: -0.6, n: 4 }, { z: 13.0, w: 0.62, h: 0.6, y: -0.55, n: 2.6 },
          { z: 18.0, w: 0.6, h: 0.58, y: -0.55, n: 2.2 }, { z: 19.6, w: 0.56, h: 0.54, y: -0.55 }], { x: 1.18 * s, cap0: false, cap1: false, seg: 16 });
        a.face([1.18 * s, -0.62, 7.48], 0.5, 0.52, 5);
        a.nozzle(1.18 * s, -0.55, 19.5, 0.55, 0.5, 0.85);
      }
      a.wing([[0.6, 4.6, 17.6, 0.4], [1.6, 7.6, 17.4, 0.38], [2.4, 9.8, 17.2, 0.36], [2.9, 10.9, 17.0, 0.33], [7.3, 14.9, 16.45, 0.1]], { y: -0.05 });
      const sR = a.bone('stab', [3.0, -0.4, 19.6], [1, 0, 0], 1), sL = a.bone('stab', [-3.0, -0.4, 19.6], [1, 0, 0], -1);
      a.wing([[1.8, 17.6, 20.8, 0.14], [4.6, 20.0, 21.2, 0.05]], { y: -0.4, bones: [sR, sL] });
      a.fin([[0, 15.2, 19.4, 0.2], [3.3, 18.2, 19.75, 0.08]], { x: 2.05, y: 0.0, cant: 0, twin: true, accentFrom: 2.35 });
      a.fin([[0, 16.0, 18.4, 0.07], [-0.85, 17.3, 18.6, 0.05]], { x: 1.72, y: -1.0, cant: -6, twin: true });
      a.canopy(4.9, 0.62, 0.45, 0.6, 1.7);
      a.gun(1.0, 0.18, 7.0);
      a.rail(7.42, -0.05, 14.2, 17.0); a.rail(-7.42, -0.05, 14.2, 17.0);
      a.missile(-4.4, -0.42, 12.3, 'rad', true); a.missile(4.4, -0.42, 12.3, 'rad', true);
      a.missile(-1.18, -1.32, 10.0, 'rad'); a.missile(1.18, -1.32, 10.0, 'rad');
      a.missile(-5.7, -0.38, 13.4, 'ir', true); a.missile(5.7, -0.38, 13.4, 'ir', true);
      a.missile(-7.5, -0.05, 13.9, 'ir'); a.missile(7.5, -0.05, 13.9, 'ir');
      a.tip(7.5, -0.05, 16.5); a.tip(-7.5, -0.05, 16.5);
    },
  },
  {
    id: 'typhoon', era: 'jet', name: '颱風戰鬥機', en: 'EUROFIGHTER TYPHOON', country: '英國／德國／義大利／西班牙', first: 1994, len: 15.96, span: 10.95,
    gun: 'BK-27 27 mm 機砲', note: '鴨翼加三角翼的歐洲雙發戰機，腹下有張「笑臉」進氣口。不開後燃器就有 1,240 km/h，掛流星遠程飛彈。',
    paint: { pattern: 0, top: '#8d9399', bot: '#a9afb4', c2: '#979da2', c3: '#868c92', scale: 0.25, rad: '#6f757a', radZ: 1.7, glass: '#2f3943', metal: 0.06, gloss: 0.36 },
    st: { hp: 232, vab: 1510, vmax: 1240, vtab: 637, vt: 440, vc: 738, vr: 144, vs: 288, vcl: 623, aab: 47, acc: 26, wb: 40, wh: 15, roll: 190, resp: 6,
      abFuel: 16.8, abRegen: 14.4, flareCd: 5.0, flareDur: 1.6, detect: 3.0, radar: 11.9, scan: 39, gunRate: 14, gunDmg: 12, ammo: 210 },
    loadout: [['meteor', 4], ['irist', 4]],
    build(a) {
      a.body([
        { z: 0, w: 0.03, h: 0.03, y: 0.05 }, { z: 0.8, w: 0.3, h: 0.3, y: 0.05 }, { z: 2.0, w: 0.5, h: 0.5, y: 0.05 },
        { z: 3.4, w: 0.6, h: 0.62, hb: 0.55, y: 0.06 }, { z: 5.2, w: 0.66, h: 0.64, hb: 0.6, y: 0.06 }, { z: 7.5, w: 0.74, h: 0.58, hb: 0.62, n: 2.4 },
        { z: 10.0, w: 0.86, h: 0.55, hb: 0.58, n: 2.8 }, { z: 13.0, w: 0.96, h: 0.5, hb: 0.5, n: 3 }, { z: 15.3, w: 0.96, h: 0.45, hb: 0.45, n: 3 },
      ]);
      a.loft([{ z: 5.6, w: 0.62, h: 0.4, y: -0.9, n: 5 }, { z: 7.0, w: 0.66, h: 0.42, y: -0.82, n: 4 }, { z: 9.5, w: 0.7, h: 0.38, y: -0.64, n: 3.5 },
        { z: 11.8, w: 0.7, h: 0.3, y: -0.45, n: 3 }], { cap0: false, seg: 16 });
      a.face([0, -0.92, 5.68], 0.56, 0.34, 5);
      a.wing([[0.7, 6.4, 15.3, 0.4], [5.48, 12.75, 14.4, 0.07]], { y: -0.28 });
      const cR = a.bone('canard', [1.2, 0.02, 4.75], [1, 0, 0], 1), cL = a.bone('canard', [-1.2, 0.02, 4.75], [1, 0, 0], -1);
      a.wing([[0.5, 3.6, 5.5, 0.1], [2.25, 4.9, 5.6, 0.04]], { y: 0.02, dih: -2, bones: [cR, cL] });
      a.fin([[0, 10.4, 15.2, 0.24], [3.3, 13.6, 15.0, 0.08]], { y: 0.42, accentFrom: 2.3 });
      a.nozzle(0.48, 0.0, 15.2, 0.46, 0.42, 1.0); a.nozzle(-0.48, 0.0, 15.2, 0.46, 0.42, 1.0);
      a.canopy(4.3, 0.6, 0.42, 0.52, 1.6);
      a.gun(0.75, -0.1, 7.0);
      a.missile(-0.62, -1.02, 9.9, 'rad'); a.missile(0.62, -1.02, 9.9, 'rad');
      a.missile(-0.66, -0.96, 12.0, 'rad'); a.missile(0.66, -0.96, 12.0, 'rad');
      a.missile(-3.7, -0.62, 10.6, 'ir', true); a.missile(3.7, -0.62, 10.6, 'ir', true);
      a.missile(-4.65, -0.6, 11.6, 'ir', true); a.missile(4.65, -0.6, 11.6, 'ir', true);
      a.tip(5.5, -0.28, 14.3); a.tip(-5.5, -0.28, 14.3);
    },
  },
  {
    id: 'm2000', era: 'jet', name: '幻象 2000-5', en: 'MIRAGE 2000-5', country: '法國', first: 1978, len: 14.36, span: 9.13,
    gun: 'DEFA 554 30 mm 機砲 ×2', note: '沒有水平尾翼的純三角翼，中華民國空軍也有服役。加速和爬升最快，但急轉彎掉速很兇。',
    paint: { pattern: 1, top: '#8796a5', bot: '#a6b3be', c2: '#9eacb9', c3: '#7a8a99', scale: 0.24, rad: '#6a7176', radZ: 1.75, glass: '#2d3944', metal: 0.06, gloss: 0.34 },
    st: { hp: 223, vab: 1509, vmax: 907, vtab: 558, vt: 362, vc: 810, vr: 144, vs: 216, vcl: 653, aab: 57, acc: 34, wb: 40, wh: 15, roll: 175, resp: 6,
      abFuel: 14.4, abRegen: 14.4, flareCd: 5.0, flareDur: 1.6, detect: 3.0, radar: 9.5, scan: 33, gunRate: 18, gunDmg: 12, ammo: 270 },
    loadout: [['s530d', 4], ['magic', 4]],
    build(a) {
      a.body([
        { z: 0, w: 0.03, h: 0.03, y: 0.1 }, { z: 0.6, w: 0.22, h: 0.22, y: 0.1 }, { z: 2.0, w: 0.42, h: 0.42, y: 0.08 },
        { z: 3.4, w: 0.52, h: 0.56, hb: 0.5, y: 0.08 }, { z: 5.2, w: 0.58, h: 0.58, hb: 0.55 }, { z: 7.0, w: 0.62, h: 0.56, hb: 0.58, n: 2.2 },
        { z: 10.0, w: 0.62, h: 0.52, hb: 0.55 }, { z: 12.6, w: 0.56, h: 0.5 }, { z: 13.5, w: 0.53, h: 0.48 },
      ], { cap1: false });
      for (const s of [1, -1]) {
        a.loft([{ z: 5.4, w: 0.34, h: 0.48, y: -0.06 }, { z: 6.6, w: 0.4, h: 0.5, y: -0.06 }, { z: 9.6, w: 0.34, h: 0.44, y: -0.06 }], { x: 0.74 * s, cap0: false, seg: 14 });
        a.face([0.74 * s, -0.06, 5.48], 0.3, 0.42);
        a.mat(MAT.GRAY); a.b.cyl([0.62 * s, -0.06, 4.95], [0.62 * s, -0.06, 5.7], 0.005, 0.2, { seg: 10 }); a.mat(MAT.PAINT);
      }
      a.wing([[0.5, 6.0, 13.7, 0.36], [4.56, 12.6, 13.45, 0.06]], { y: -0.26 });
      a.wing([[0.9, 5.6, 7.0, 0.04], [1.28, 6.6, 7.0, 0.02]], { y: 0.16 });
      a.fin([[0, 8.6, 13.7, 0.26], [3.75, 12.4, 13.8, 0.08]], { y: 0.4, accentFrom: 2.6 });
      a.nozzle(0, 0.05, 13.4, 0.53, 0.5, 1.0);
      a.canopy(4.4, 0.55, 0.4, 0.5, 1.55);
      a.gun(0.5, -0.42, 6.6); a.gun(-0.5, -0.42, 6.6);
      a.missile(-2.25, -0.62, 9.8, 'rad', true); a.missile(2.25, -0.62, 9.8, 'rad', true);
      a.missile(-0.42, -0.74, 7.4, 'rad'); a.missile(0.42, -0.74, 7.4, 'rad');
      a.missile(-3.45, -0.6, 11.0, 'ir', true); a.missile(3.45, -0.6, 11.0, 'ir', true);
      a.missile(-4.1, -0.52, 11.4, 'ir', true); a.missile(4.1, -0.52, 11.4, 'ir', true);
      a.tip(4.6, -0.26, 13.4); a.tip(-4.6, -0.26, 13.4);
    },
  },
  {
    id: 'idf', era: 'jet', name: 'F-CK-1 經國號', en: 'F-CK-1 CHING-KUO', country: '中華民國', first: 1989, len: 14.21, span: 9.46,
    gun: 'M61A1 20 mm 機砲', note: '臺灣自製的雙發防禦戰機，兩側進氣口加翼端飛彈。轉向和 F-16 一樣利落，機體更耐打、加速更快。',
    paint: { pattern: 1, top: '#9aa2a8', bot: '#b4babe', c2: '#8b949a', c3: '#a8afb4', scale: 0.25, rad: '#7b8286', radZ: 1.6, glass: '#2e3a44', metal: 0.06, gloss: 0.34 },
    st: { hp: 200, vab: 1400, vmax: 826, vtab: 679, vt: 528, vc: 738, vr: 144, vs: 234, vcl: 416, aab: 57, acc: 38, wb: 41, wh: 15, roll: 240, resp: 8,
      abFuel: 14.4, abRegen: 12.0, flareCd: 5.0, flareDur: 1.6, detect: 3.0, radar: 7.1, scan: 33, gunRate: 16, gunDmg: 10, ammo: 500 },
    loadout: [['aim120', 4], ['aim9m', 2]],
    build(a) {
      a.body([
        { z: 0, w: 0.03, h: 0.03, y: 0.05 }, { z: 0.6, w: 0.22, h: 0.22, y: 0.05 }, { z: 1.6, w: 0.42, h: 0.42, y: 0.05 },
        { z: 2.8, w: 0.54, h: 0.54, hb: 0.5, y: 0.05 }, { z: 4.4, w: 0.6, h: 0.6, hb: 0.56, y: 0.05 }, { z: 6.4, w: 0.7, h: 0.6, hb: 0.58, n: 2.4 },
        { z: 9.0, w: 0.8, h: 0.56, hb: 0.55, n: 2.8 }, { z: 11.5, w: 0.82, h: 0.5, hb: 0.48, n: 3 }, { z: 13.3, w: 0.8, h: 0.46, hb: 0.44, n: 3 },
      ]);
      for (const s of [1, -1]) {
        a.loft([{ z: 5.0, w: 0.3, h: 0.46, hb: 0.4, y: -0.3, n: 2.2 }, { z: 6.2, w: 0.34, h: 0.5, y: -0.3 }, { z: 8.8, w: 0.3, h: 0.42, y: -0.25 }], { x: 0.86 * s, cap0: false, seg: 14 });
        a.face([0.86 * s, -0.32, 5.08], 0.26, 0.38);
      }
      a.wing([[0.6, 4.4, 11.6, 0.3], [1.05, 6.4, 11.6, 0.28], [1.45, 7.6, 11.6, 0.26], [4.25, 9.75, 11.0, 0.08]], { y: -0.05 });
      const sR = a.bone('stab', [1.6, 0.0, 12.6], [1, 0, 0], 1), sL = a.bone('stab', [-1.6, 0.0, 12.6], [1, 0, 0], -1);
      a.wing([[0.75, 11.0, 13.6, 0.15], [2.85, 12.9, 13.9, 0.05]], { y: 0.0, bones: [sR, sL] });
      a.fin([[0, 9.2, 13.3, 0.22], [2.55, 11.9, 13.4, 0.08]], { y: 0.45, accentFrom: 1.8 });
      a.nozzle(0.42, 0.05, 13.2, 0.4, 0.37, 0.95); a.nozzle(-0.42, 0.05, 13.2, 0.4, 0.37, 0.95);
      a.canopy(4.2, 0.54, 0.42, 0.52, 1.55);
      a.gun(-0.75, 0.12, 5.0);
      a.rail(4.36, -0.05, 9.0, 11.3); a.rail(-4.36, -0.05, 9.0, 11.3);
      a.missile(-0.48, -0.86, 8.6, 'rad'); a.missile(0.48, -0.86, 8.6, 'rad');
      a.missile(-2.55, -0.44, 8.2, 'rad', true); a.missile(2.55, -0.44, 8.2, 'rad', true);
      a.missile(-4.42, -0.05, 8.8, 'ir'); a.missile(4.42, -0.05, 8.8, 'ir');
      a.tip(4.45, -0.05, 11.0); a.tip(-4.45, -0.05, 11.0);
    },
  },
  {
    id: 'mig21', era: 'jet', name: 'MiG-21bis 魚床', en: 'MIG-21BIS FISHBED', country: '蘇聯', first: 1955, len: 14.5, span: 7.15,
    gun: 'GSh-23L 23 mm 機砲', est: true, note: '機頭進氣、中央有震波錐的經典三角翼，產量最多的超音速戰機。（這架的數值是估計值）',
    paint: { pattern: 3, top: '#b9bec2', bot: '#c5c9cc', c2: '#b9bec2', c3: '#b9bec2', scale: 0.3, glass: '#2f3b45', metal: 0.72, gloss: 0.6 },
    st: { hp: 165, vab: 1420, vmax: 790, vtab: 600, vt: 450, vc: 760, vr: 144, vs: 270, vcl: 580, aab: 52, acc: 28, wb: 34, wh: 14, roll: 200, resp: 6,
      abFuel: 12.0, abRegen: 14.4, flareCd: 5.0, flareDur: 1.6, detect: 3.0, radar: 6.0, scan: 30, gunRate: 16, gunDmg: 11, ammo: 260 },
    loadout: [['r3r', 2], ['r60', 2]],
    build(a) {
      a.body([
        { z: 0.0, w: 0.4, h: 0.4 }, { z: 0.5, w: 0.46, h: 0.46 }, { z: 2.0, w: 0.56, h: 0.58 }, { z: 4.0, w: 0.62, h: 0.64 },
        { z: 7.0, w: 0.64, h: 0.64 }, { z: 10.0, w: 0.6, h: 0.6 }, { z: 12.5, w: 0.52, h: 0.52 }, { z: 13.7, w: 0.47, h: 0.47 },
      ], { cap0: false, cap1: false });
      a.face([0, 0, 0.6], 0.42, 0.42);
      a.mat(MAT.GRAY); a.b.cyl([0, 0, -0.75], [0, 0, 0.25], 0.004, 0.27, { seg: 14 }); a.b.cyl([0, 0, 0.25], [0, 0, 0.7], 0.27, 0.3, { seg: 14 }); a.mat(MAT.PAINT);
      a.loft([{ z: 4.4, w: 0.16, h: 0.02, y: 0.58 }, { z: 5.4, w: 0.26, h: 0.28, hb: 0.05, y: 0.58 }, { z: 9.5, w: 0.24, h: 0.22, hb: 0.05, y: 0.58 }, { z: 12.4, w: 0.16, h: 0.02, y: 0.55 }], { seg: 12 });
      a.canopy(3.7, 0.5, 0.36, 0.44, 1.15);
      a.wing([[0.55, 6.0, 10.8, 0.28], [3.58, 10.45, 11.0, 0.05]], { y: -0.12 });
      const sR = a.bone('stab', [1.0, -0.2, 12.8], [1, 0, 0], 1), sL = a.bone('stab', [-1.0, -0.2, 12.8], [1, 0, 0], -1);
      a.wing([[0.45, 11.7, 13.5, 0.12], [1.95, 13.1, 13.9, 0.05]], { y: -0.2, bones: [sR, sL] });
      a.fin([[0, 9.0, 13.2, 0.22], [2.4, 12.3, 13.6, 0.07]], { y: 0.5, accentFrom: 1.6 });
      a.fin([[0, 11.4, 13.0, 0.08], [-0.55, 12.2, 13.0, 0.05]], { y: -0.5 });
      a.nozzle(0, 0, 13.6, 0.46, 0.43, 0.9);
      a.mat(MAT.DARK); a.b.cyl([0.1, 0.4, -1.2], [0.1, 0.4, 0.6], 0.03, 0.035, { seg: 6 }); a.mat(MAT.PAINT);
      a.gun(0, -0.62, 5.0);
      a.missile(-2.35, -0.46, 8.2, 'rad', true); a.missile(2.35, -0.46, 8.2, 'rad', true);
      a.missile(-1.55, -0.5, 7.4, 'ir', true); a.missile(1.55, -0.5, 7.4, 'ir', true);
      a.tip(3.6, -0.12, 10.9); a.tip(-3.6, -0.12, 10.9);
    },
  },
  {
    id: 'p51', era: 'prop', name: 'P-51D 野馬', en: 'P-51D MUSTANG', country: '美國', first: 1940, len: 9.83, span: 11.28,
    gun: 'M2 12.7 mm 機槍 ×6', est: true, note: '二戰長程護航戰鬥機，腹部散熱器進氣口與水滴座艙罩是招牌，塗著諾曼第登陸條紋。高速性能最好。',
    paint: { pattern: 3, top: '#b8bdc1', bot: '#c2c6c9', c2: '#b8bdc1', c3: '#b8bdc1', scale: 0.3, glass: '#34404a', metal: 0.7, gloss: 0.58, stripes: true, band: [7.0, 8.0] },
    st: { hp: 100, vab: 703, vmax: 655, vtab: 470, vt: 440, vc: 420, vr: 110, vs: 160, vcl: 330, aab: 11, acc: 8.5, wb: 30, wh: 15, roll: 150, resp: 6,
      abFuel: 20, abRegen: 15, flareCd: 0, flareDur: 0, detect: 4.0, radar: 0, scan: 0, gunRate: 22, gunDmg: 3.2, ammo: 1600, prop: true, bullet: 870 },
    loadout: [],
    build(a) {
      a.prop(-0.05, 0.05, 1.7, 4, 0.32, 0.55);
      a.body([
        { z: 0.3, w: 0.33, h: 0.37, y: 0.05 }, { z: 1.0, w: 0.42, h: 0.5, hb: 0.48, y: 0.05, n: 2.4 }, { z: 2.6, w: 0.44, h: 0.52, hb: 0.5, y: 0.05, n: 2.5 },
        { z: 3.8, w: 0.45, h: 0.6, hb: 0.55, y: 0.05, n: 2.3 }, { z: 5.2, w: 0.42, h: 0.6, hb: 0.55, y: 0.05 }, { z: 7.0, w: 0.3, h: 0.5, hb: 0.45, y: 0.1 },
        { z: 8.6, w: 0.18, h: 0.4, hb: 0.32, y: 0.18 }, { z: 9.8, w: 0.05, h: 0.25, hb: 0.14, y: 0.25 },
      ]);
      a.loft([{ z: 4.3, w: 0.26, h: 0.22, y: -0.64, n: 3 }, { z: 5.2, w: 0.3, h: 0.25, y: -0.64, n: 3 }, { z: 6.8, w: 0.24, h: 0.2, y: -0.6 }, { z: 7.7, w: 0.1, h: 0.06, y: -0.52 }], { cap0: false, seg: 12 });
      a.face([0, -0.64, 4.34], 0.23, 0.19);
      a.wing([[0.4, 2.8, 5.3, 0.36], [5.5, 3.72, 4.88, 0.1], [5.66, 3.95, 4.75, 0.06]], { y: -0.42, dih: 5 });
      a.wing([[0.15, 8.4, 9.75, 0.12], [2.05, 8.95, 9.6, 0.05]], { y: 0.22 });
      a.fin([[0, 7.5, 9.9, 0.16], [0.6, 8.55, 9.95, 0.13], [1.5, 9.12, 9.85, 0.08], [1.72, 9.35, 9.72, 0.04]], { y: 0.35, accentFrom: 1.15 });
      a.canopy(4.3, 0.55, 0.32, 0.44, 0.95);
      a.mat(MAT.DARK); for (const s of [1, -1]) for (let i = 0; i < 6; i++) a.b.box([0.43 * s, 0.24, 1.0 + i * 0.25], 0.08, 0.06, 0.14); a.mat(MAT.PAINT);
      for (const s of [1, -1]) for (const x of [2.0, 2.3, 2.6]) a.gun(x * s, -0.36, 3.1);
      a.tip(5.65, -0.0, 4.4); a.tip(-5.65, 0.0, 4.4);
    },
  },
  {
    id: 'spit', era: 'prop', name: '噴火 Mk IX', en: 'SPITFIRE MK IX', country: '英國', first: 1936, len: 9.47, span: 11.23,
    gun: '西斯帕諾 20 mm ×2 + 白朗寧 12.7 mm ×2', est: true, note: '經典橢圓形機翼，低速纏鬥性能極佳，不列顛空戰的象徵。',
    paint: { pattern: 4, top: '#4a5236', bot: '#a0a59f', c2: '#72776f', c3: '#4a5236', scale: 0.2, glass: '#34404a', metal: 0.04, gloss: 0.22, band: [7.55, 7.95], bandOn: true, bandCol: '#c3cdb2' },
    st: { hp: 95, vab: 657, vmax: 620, vtab: 420, vt: 400, vc: 380, vr: 120, vs: 145, vcl: 360, aab: 11.5, acc: 9, wb: 34, wh: 14, roll: 135, resp: 6,
      abFuel: 20, abRegen: 15, flareCd: 0, flareDur: 0, detect: 4.0, radar: 0, scan: 0, gunRate: 18, gunDmg: 3.6, ammo: 800, prop: true, bullet: 850 },
    loadout: [],
    build(a) {
      a.prop(-0.1, 0.0, 1.6, 4, 0.3, 0.6);
      a.body([
        { z: 0.35, w: 0.32, h: 0.36 }, { z: 1.2, w: 0.38, h: 0.46, hb: 0.44, n: 2.3 }, { z: 2.8, w: 0.4, h: 0.5, hb: 0.46, n: 2.2 }, { z: 4.0, w: 0.4, h: 0.56, hb: 0.48 },
        { z: 5.2, w: 0.36, h: 0.52, hb: 0.44 }, { z: 7.0, w: 0.24, h: 0.42, hb: 0.36, y: 0.08 }, { z: 8.6, w: 0.12, h: 0.3, hb: 0.22, y: 0.15 }, { z: 9.45, w: 0.04, h: 0.2, hb: 0.1, y: 0.18 },
      ]);
      const ell = (c0, b, zq, t0, xs) => xs.map(x => { const c = Math.max(0.12, c0 * Math.sqrt(Math.max(0, 1 - (x / b) * (x / b)))); return [x, zq - 0.25 * c, zq + 0.75 * c, t0 * c / c0]; });
      a.wing(ell(2.6, 5.62, 3.4, 0.33, [0.36, 1.2, 2.2, 3.1, 3.9, 4.6, 5.1, 5.42, 5.58]), { y: -0.38, dih: 6 });
      a.wing(ell(1.05, 1.62, 8.75, 0.12, [0.12, 0.6, 1.0, 1.35, 1.55]), { y: 0.12 });
      a.fin([[0, 7.9, 9.45, 0.14], [0.6, 8.25, 9.5, 0.12], [1.1, 8.6, 9.45, 0.09], [1.35, 8.95, 9.3, 0.05]], { y: 0.32, accentFrom: 0.95 });
      for (const s of [1, -1]) { a.b.box([1.75 * s, -0.62, 4.1], 0.36, 0.2, 1.0); a.face([1.75 * s, -0.62, 3.59], 0.16, 0.08); }
      a.canopy(4.3, 0.48, 0.3, 0.38, 0.85);
      a.mat(MAT.DARK); for (const s of [1, -1]) for (let i = 0; i < 6; i++) a.b.box([0.39 * s, 0.18, 0.95 + i * 0.24], 0.07, 0.06, 0.12); a.mat(MAT.PAINT);
      for (const s of [1, -1]) { a.gun(2.0 * s, -0.36, 2.8); a.gun(2.7 * s, -0.36, 2.9); }
      a.tip(5.6, 0.2, 3.6); a.tip(-5.6, 0.2, 3.6);
    },
  },
  {
    id: 'zero', era: 'prop', name: '零式艦戰 21 型', en: 'A6M2 ZERO', country: '日本', first: 1939, len: 9.06, span: 12.0,
    gun: '九九式 20 mm ×2 + 九七式 7.7 mm ×2', est: true, note: '極輕的艦載戰鬥機，迴轉半徑最小，但機身脆弱、高速時滾轉變鈍。',
    paint: { pattern: 0, top: '#3f4b36', bot: '#b9b9aa', c2: '#3f4b36', c3: '#3f4b36', scale: 0.3, rad: '#262624', radZ: 1.75, glass: '#34404a', metal: 0.04, gloss: 0.25 },
    st: { hp: 70, vab: 533, vmax: 510, vtab: 370, vt: 355, vc: 320, vr: 110, vs: 125, vcl: 320, aab: 10, acc: 8.5, wb: 38, wh: 11, roll: 120, rollHi: 0.5, resp: 7,
      abFuel: 20, abRegen: 15, flareCd: 0, flareDur: 0, detect: 4.0, radar: 0, scan: 0, gunRate: 18, gunDmg: 3.6, ammo: 700, prop: true, bullet: 820 },
    loadout: [],
    build(a) {
      a.prop(-0.15, 0.04, 1.45, 3, 0.22, 0.45);
      a.loft([{ z: 0.12, w: 0.5, h: 0.5, y: 0.04 }, { z: 0.5, w: 0.62, h: 0.62, y: 0.04 }, { z: 1.7, w: 0.6, h: 0.6, y: 0.04 }], { cap0: false, cap1: false, seg: 22 });
      a.face([0, 0.04, 0.2], 0.48, 0.48);
      a.body([
        { z: 1.6, w: 0.6, h: 0.6, y: 0.04 }, { z: 2.8, w: 0.56, h: 0.62, hb: 0.55, y: 0.04 }, { z: 4.5, w: 0.5, h: 0.6, hb: 0.5, y: 0.04 },
        { z: 6.5, w: 0.34, h: 0.45, hb: 0.38, y: 0.1 }, { z: 8.2, w: 0.16, h: 0.3, hb: 0.22, y: 0.16 }, { z: 9.06, w: 0.04, h: 0.18, hb: 0.1, y: 0.2 },
      ]);
      a.wing([[0.45, 1.9, 4.3, 0.34], [5.4, 3.0, 4.15, 0.12], [5.85, 3.25, 4.05, 0.08], [6.0, 3.5, 3.95, 0.05]], { y: -0.42, dih: 6 });
      a.wing([[0.15, 7.7, 8.95, 0.1], [1.9, 8.25, 8.9, 0.05], [2.05, 8.45, 8.85, 0.04]], { y: 0.18 });
      a.fin([[0, 7.4, 9.05, 0.12], [0.8, 8.1, 9.05, 0.1], [1.15, 8.5, 8.95, 0.06], [1.25, 8.7, 8.85, 0.04]], { y: 0.3, accentFrom: 0.8 });
      a.canopy(4.1, 0.5, 0.32, 0.4, 1.35);
      for (const s of [1, -1]) { a.gun(2.4 * s, -0.36, 2.4); a.gun(0.16 * s, 0.48, 1.0); }
      a.tip(6.0, 0.2, 3.7); a.tip(-6.0, 0.2, 3.7);
    },
  },
  {
    id: 'bf109', era: 'prop', name: 'Bf 109G', en: 'BF 109 G-6', country: '德國', first: 1935, len: 9.02, span: 9.92,
    gun: 'MG 151 20 mm + MG 131 13 mm ×2', est: true, note: '機身窄小、爬升快的德國主力戰鬥機，螺旋槳轂中央藏著一門機砲。',
    paint: { pattern: 2, top: '#5b6168', bot: '#a6b6bf', c2: '#717880', c3: '#4f555b', scale: 0.42, glass: '#34404a', metal: 0.04, gloss: 0.25 },
    st: { hp: 95, vab: 640, vmax: 600, vtab: 450, vt: 425, vc: 400, vr: 110, vs: 165, vcl: 390, aab: 12, acc: 9.5, wb: 30, wh: 15, roll: 150, resp: 6,
      abFuel: 20, abRegen: 15, flareCd: 0, flareDur: 0, detect: 4.0, radar: 0, scan: 0, gunRate: 16, gunDmg: 4.3, ammo: 600, prop: true, bullet: 880 },
    loadout: [],
    build(a) {
      a.prop(-0.1, 0.0, 1.5, 3, 0.3, 0.75);
      a.body([
        { z: 0.3, w: 0.32, h: 0.36 }, { z: 1.2, w: 0.38, h: 0.46, hb: 0.42, n: 2.6 }, { z: 2.8, w: 0.4, h: 0.5, hb: 0.45, n: 2.6 }, { z: 3.8, w: 0.4, h: 0.52, hb: 0.46, n: 2.5 },
        { z: 5.2, w: 0.34, h: 0.46, hb: 0.42, n: 2.8 }, { z: 7.0, w: 0.22, h: 0.38, hb: 0.34, y: 0.05, n: 3 }, { z: 8.5, w: 0.1, h: 0.3, hb: 0.24, y: 0.1 }, { z: 9.0, w: 0.04, h: 0.2, hb: 0.14, y: 0.12 },
      ]);
      a.wing([[0.38, 2.2, 4.15, 0.3], [4.6, 2.8, 3.75, 0.11], [4.9, 3.0, 3.7, 0.07], [4.96, 3.2, 3.6, 0.05]], { y: -0.4, dih: 6.5 });
      a.wing([[0.12, 7.8, 8.9, 0.1], [1.55, 8.25, 8.85, 0.05], [1.65, 8.4, 8.8, 0.04]], { y: 0.55 });
      a.fin([[0, 7.6, 9.0, 0.12], [0.8, 8.0, 9.05, 0.1], [1.05, 8.3, 9.0, 0.07], [1.15, 8.55, 8.85, 0.04]], { y: 0.28, accentFrom: 0.75 });
      a.mat(MAT.DARK); a.b.cyl([-0.42, 0.12, 1.5], [-0.42, 0.12, 2.3], 0.09, 0.08, { seg: 8, cap0: true }); a.mat(MAT.PAINT);
      a.canopy(3.55, 0.42, 0.3, 0.36, 0.85);
      a.mat(MAT.DARK); for (const s of [1, -1]) for (let i = 0; i < 6; i++) a.b.box([0.39 * s, 0.05, 0.95 + i * 0.22], 0.07, 0.05, 0.11); a.mat(MAT.PAINT);
      a.gun(0, 0, -0.6); a.gun(0.16, 0.42, 1.2); a.gun(-0.16, 0.42, 1.2);
      a.tip(4.95, 0.15, 3.5); a.tip(-4.95, 0.15, 3.5);
    },
  },
];

// ---- builder context exposed to the definitions ----
function buildAircraftModel(def) {
  const b = new MB();
  const meta = { bones: [null], guns: [], flames: [], tips: [], nR: 0, nI: 0, pylR: [], pylI: [], props: [] };
  const a = {
    b, meta,
    mat(m) { b.mat = m; },
    body(st, o = {}) { b.mat = MAT.PAINT; b.loft(st, Object.assign({ seg: 22 }, o)); },
    loft(st, o = {}) { const m = b.mat; b.mat = o.mat === undefined ? MAT.PAINT : o.mat; b.loft(st, o); b.mat = m; },
    wing(secs, o = {}) { b.mat = MAT.PAINT; b.wing(secs, o); },
    fin(secs, o = {}) { b.mat = MAT.PAINT; b.fin(secs, o); },
    face(c, w, h, sq) { const m = b.mat; b.mat = MAT.BLACK; b.disc(c, w, h, [0, 0, -1], 16, sq || 2); b.mat = m; },
    bone(kind, pivot, axis, side) { meta.bones.push({ kind, pivot, axis, side }); return meta.bones.length - 1; },
    canopy(z, y, rx, ry, rz) { b.mat = MAT.GLASS; b.ellipsoid([0, y, z], rx, ry, rz, { lat0: -0.3, seg: 18, rings: 8 }); b.mat = MAT.PAINT; },
    nozzle(x, y, z0, r0, r1, len) {
      b.mat = MAT.DARK; b.cyl([x, y, z0], [x, y, z0 + len], r0, r1, { seg: 16 });
      b.mat = MAT.BLACK; b.disc([x, y, z0 + len - 0.08], r1 * 0.9, r1 * 0.9, [0, 0, 1]); b.mat = MAT.PAINT;
      meta.flames.push({ p: [x, y, z0 + len], r: r1 * 0.88 });
    },
    flame(x, y, z, r) { meta.flames.push({ p: [x, y, z], r }); },
    gun(x, y, z) { meta.guns.push([x, y, z]); },
    tip(x, y, z, bone) { meta.tips.push({ p: [x, y, z], bone: bone || 0 }); },
    rail(x, y, z0, z1) { b.mat = MAT.PAINT; b.box([x, y, (z0 + z1) / 2], 0.1, 0.12, z1 - z0); },
    // kind: 'ir' (short IR missile) / 'rad' / 'big' (radar). Radar slots are 1..20, IR slots 21..40 —
    // the shader hides the first N of each group once they have been fired.
    missile(x, y, z, kind, pylon) {
      const isIr = kind === 'ir', slot = isIr ? 20 + (++meta.nI) : ++meta.nR;
      const L = kind === 'big' ? 3.9 : kind === 'rad' ? 3.65 : 2.9, r = kind === 'big' ? 0.19 : kind === 'rad' ? 0.09 : 0.065;
      if (pylon) { b.mat = MAT.PAINT; b.slot = 0; b.box([x, y + r + 0.14, z + L * 0.48], 0.07, 0.3, L * 0.5); }
      b.slot = slot;
      b.mat = MAT.WHITE; b.cyl([x, y, z + r * 2.4], [x, y, z + L], r, r * 0.95, { seg: 8, cap1: true });
      b.mat = MAT.GRAY; b.cyl([x, y, z], [x, y, z + r * 2.4], 0.004, r, { seg: 8 });
      const fs = kind === 'big' ? 0.3 : 0.2, fc = kind === 'big' ? 0.5 : 0.32;
      b.box([x, y, z + L - fc * 0.6], fs * 2 + r * 2, 0.015, fc); b.box([x, y, z + L - fc * 0.6], 0.015, fs * 2 + r * 2, fc);
      if (kind === 'ir') { b.box([x, y, z + 0.45], 0.24, 0.012, 0.14); b.box([x, y, z + 0.45], 0.012, 0.24, 0.14); }
      b.slot = 0; b.mat = MAT.PAINT;
      (isIr ? meta.pylI : meta.pylR).push([x, y, z + L * 0.5]);
    },
    prop(z, y, r, blades, sr, slen) {
      const bi = a.bone('prop', [0, y, z], [0, 0, 1], 0);
      b.bone = bi;
      b.mat = MAT.ACCENT; b.cyl([0, y, z - slen], [0, y, z + 0.05], 0.004, sr, { seg: 14 }); b.cyl([0, y, z + 0.05], [0, y, z + 0.35], sr, sr * 1.02, { seg: 14 });
      b.mat = MAT.PROP;
      for (let i = 0; i < blades; i++) {
        const ang = (i / blades) * TAU, d = [Math.cos(ang), Math.sin(ang), 0], perp = [-Math.sin(ang), Math.cos(ang), 0];
        const secs = [];
        const N = 5;
        for (let k = 0; k <= N; k++) {
          const t = k / N, rho = lerp(sr * 0.7, r, t), chord = lerp(0.26, 0.16, t) * (k === N ? 0.6 : 1), beta = lerp(38, 12, t) * DEG, th = lerp(0.06, 0.025, t);
          const cd = vadd(vmul(perp, Math.cos(beta)), [0, 0, Math.sin(beta)]);
          const td = vnorm(vcross(d, cd));
          const c = [d[0] * rho, y + d[1] * rho, z + 0.02];
          secs.push([vadd(c, vmul(cd, chord / 2)), vadd(c, vmul(td, th / 2)), vsub(c, vmul(cd, chord / 2)), vsub(c, vmul(td, th / 2))]);
        }
        b.sweep(secs);
      }
      b.bone = 0; b.mat = MAT.PAINT;
      meta.props.push({ z, y, r });
    },
  };
  def.build(a);
  // ---- center the model ----
  const arr = b.a;
  let zmin = 1e9, zmax = -1e9;
  for (let i = 0; i < arr.length; i += 9) { if (arr[i + 2] < zmin) zmin = arr[i + 2]; if (arr[i + 2] > zmax) zmax = arr[i + 2]; }
  const shift = def.cg !== undefined ? def.cg : zmin + (zmax - zmin) * 0.52;
  let rad = 0;
  for (let i = 0; i < arr.length; i += 9) { arr[i + 2] -= shift; rad = Math.max(rad, Math.hypot(arr[i], arr[i + 1], arr[i + 2])); }
  const sh = p => [p[0], p[1], p[2] - shift];
  meta.bones = meta.bones.map(bn => bn && Object.assign({}, bn, { pivot: sh(bn.pivot) }));
  meta.guns = meta.guns.map(sh); meta.pylR = meta.pylR.map(sh); meta.pylI = meta.pylI.map(sh);
  meta.flames = meta.flames.map(f => ({ p: sh(f.p), r: f.r }));
  meta.tips = meta.tips.map(t => ({ p: sh(t.p), bone: t.bone }));
  meta.props = meta.props.map(p => ({ z: p.z - shift, y: p.y, r: p.r }));
  meta.shift = shift; meta.radius = rad; meta.length = zmax - zmin;
  meta.data = b.data();
  return meta;
}

function paintUniforms(def, shift) {
  const P = def.paint, f = h => new Float32Array(hexRGB(h));
  return {
    top: f(P.top), bot: f(P.bot), c2: f(P.c2 || P.top), c3: f(P.c3 || P.top), rad: f(P.rad || P.top),
    glass: f(P.glass || '#2f3a44'), bandCol: f(P.bandCol || '#ffffff'),
    pat: new Float32Array([P.pattern || 0, P.scale || 0.3, P.radZ !== undefined ? P.radZ - shift : -999, P.stripes ? 1 : 0]),
    band: new Float32Array([P.band ? P.band[0] - shift : -999, P.band ? P.band[1] - shift : -999, P.bandOn ? 1 : 0, 0]),
    metal: new Float32Array([P.metal || 0.06, P.gloss || 0.32]),
  };
}

// shared generic meshes (built once the GL context exists)
const SHARED = {};
function buildSharedMeshes() {
  // in-flight missile (nose toward -z)
  const mb = new MB();
  mb.mat = MAT.WHITE; mb.cyl([0, 0, -1.3], [0, 0, 1.45], 0.075, 0.07, { seg: 8, cap1: true });
  mb.mat = MAT.GRAY; mb.cyl([0, 0, -1.5], [0, 0, -1.3], 0.004, 0.075, { seg: 8 });
  mb.box([0, 0, 1.2], 0.5, 0.015, 0.36); mb.box([0, 0, 1.2], 0.015, 0.5, 0.36);
  mb.box([0, 0, -0.95], 0.26, 0.012, 0.14); mb.box([0, 0, -0.95], 0.012, 0.26, 0.14);
  SHARED.missile = R.mesh(mb.data(), 'plane');
  SHARED.missilePaint = paintUniforms({ paint: { top: '#d9dad6', bot: '#d9dad6' } }, 0);
  // afterburner cone along +z (unit)
  const fb = [];
  const seg = 14, rings = 6;
  const ring = (z) => { const r = Math.pow(1 - z, 0.65) * (1 - z * 0.15); const pts = []; for (let i = 0; i < seg; i++) { const t = i / seg * TAU; pts.push([Math.cos(t) * r, Math.sin(t) * r, z]); } return pts; };
  for (let k = 0; k < rings; k++) {
    const A = ring(k / rings), B = ring((k + 1) / rings);
    for (let i = 0; i < seg; i++) { const j = (i + 1) % seg; fb.push(...A[i], ...A[j], ...B[j], ...A[i], ...B[j], ...B[i]); }
  }
  SHARED.flame = R.mesh(new Float32Array(fb), 'p3');
  // prop blur disc (unit, in xy plane)
  const db = [];
  for (let i = 0; i < 24; i++) { const t0 = i / 24 * TAU, t1 = (i + 1) / 24 * TAU; db.push(0, 0, 0, Math.cos(t0), Math.sin(t0), 0, Math.cos(t1), Math.sin(t1), 0); }
  SHARED.disc = R.mesh(new Float32Array(db), 'p3');
}

// lazily built GPU models per aircraft type
const AC_MODELS = {};
function acModel(def) {
  let m = AC_MODELS[def.id];
  if (m) return m;
  m = buildAircraftModel(def);
  m.mesh = R.mesh(m.data, 'plane');
  m.paint = paintUniforms(def, m.shift);
  m.data = null;
  AC_MODELS[def.id] = m;
  return m;
}
const AC_BY_ID = {}; AC_DEFS.forEach((d, i) => { d.index = i; AC_BY_ID[d.id] = d; });

// flight figures in SI units (m/s, rad/s) derived from the km/h / °/s table above
function perfOf(def) {
  if (def.perf) return def.perf;
  const s = def.st, k = 1 / 3.6;
  const P = {
    vab: s.vab * k, vmax: s.vmax * k, vtab: s.vtab * k, vt: s.vt * k, vc: s.vc * k, vr: s.vr * k, vs: s.vs * k, vcl: s.vcl * k,
    aab: s.aab, acc: s.acc, wb: s.wb * DEG, wh: s.wh * DEG, roll: s.roll * DEG, resp: s.resp, yaw: s.wb * 0.45 * DEG,
    abFuel: s.abFuel, abRegen: s.abRegen, flareCd: s.flareCd, flareDur: s.flareDur,
    detect: s.detect * 1000, radar: s.radar * 1000, scan: s.scan * DEG,
  };
  P.lo = Math.max(P.vs * 1.15, P.vc - P.vr / 2); P.hi = P.vc + P.vr / 2;
  P.milClimb = clamp(s.acc / s.aab, 0.45, 0.9);
  def.perf = P;
  return P;
}
for (const d of AC_DEFS) {
  perfOf(d);
  d.wR = null; d.wI = null;
  for (const [id, n] of d.loadout || []) {
    const m = MISSILES[id]; if (!m) continue;
    if (m.type === 'ir') d.wI = { m, n }; else d.wR = { m, n };
  }
  d.loadText = (d.loadout || []).map(([id, n]) => `${n}× ${MISSILES[id].name}`).join('、') || '—';
}
