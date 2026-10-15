// Regenerate tools/hd/procmeta.json from the procedural models in src/21_aircraft.js:
// nozzle (flame) positions, wingtips, guns, pylons, length and centring of every aircraft, in the game frame.
// build_hd.py starts from these when it measures the hi-detail models.   usage: node tools/hd/procmeta.js
const fs = require('fs'), path = require('path'), vm = require('vm');
const ROOT = path.join(__dirname, '..', '..');
const src = ['00_core.js', '20_mesh.js', '21_aircraft.js'].map(f => fs.readFileSync(path.join(ROOT, 'src', f), 'utf8')).join('\n');
const ctx = { console, Math, JSON, Float32Array, Uint8Array, Uint16Array, Int16Array, Array, Object };
vm.createContext(ctx);
vm.runInContext(src + '\nthis.__out = { AC_DEFS, buildAircraftModel };', ctx);
const { AC_DEFS, buildAircraftModel } = ctx.__out;
const out = {};
for (const def of AC_DEFS) {
  const m = buildAircraftModel(def);
  out[def.id] = {
    flames: m.flames, tips: m.tips.map(t => t.p), guns: m.guns, pylR: m.pylR, pylI: m.pylI,
    length: m.length, radius: m.radius, shift: Math.round(m.shift * 1000) / 1000,
  };
}
fs.writeFileSync(path.join(__dirname, 'procmeta.json'), JSON.stringify(out, null, 1) + '\n');
console.log('procmeta.json:', Object.keys(out).join(' '));
