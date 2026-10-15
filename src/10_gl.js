// ===================== WebGL renderer =====================
const GLSL_FRAG_HEAD = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
`;
const GLSL_ENV = `
uniform vec3 uSunDir; uniform vec3 uSunCol; uniform vec3 uZen; uniform vec3 uHor;
uniform vec3 uFogCol; uniform vec3 uFog; uniform vec3 uCam; uniform vec3 uSkyAmb; uniform vec3 uGndAmb;
vec3 skyCol(vec3 d){
  float h = d.y;
  vec3 c = mix(uHor, uZen, pow(clamp(h, 0.0, 1.0), 0.5));
  c = mix(c, uHor * vec3(0.58, 0.7, 0.78), clamp(-h * 3.0, 0.0, 1.0));
  float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (pow(s, 6.0) * 0.12 + pow(s, 60.0) * 0.22);
  return c;
}
vec3 applyFog(vec3 c, float dist){
  float f = 1.0 - exp(-pow(max(dist - uFog.x, 0.0) / uFog.y, 2.0));
  return mix(c, uFogCol, f * uFog.z);
}
`;

const SH = {
  lit: {
    vs: `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aCol;
uniform mat4 uModel; uniform mat4 uVP;
varying vec3 vW; varying vec3 vN; varying vec3 vC;
void main(){ vec4 w = uModel * vec4(aPos, 1.0); vW = w.xyz; vN = (uModel * vec4(aNor, 0.0)).xyz; vC = aCol; gl_Position = uVP * w; }`,
    fs: GLSL_FRAG_HEAD + GLSL_ENV + `
varying vec3 vW; varying vec3 vN; varying vec3 vC; uniform float uSpec; uniform float uWrap; uniform vec3 uTint; uniform float uEmis;
void main(){
  vec3 n = normalize(vN);
  float d = max((dot(n, uSunDir) + uWrap) / (1.0 + uWrap), 0.0);
  vec3 amb = mix(uGndAmb, uSkyAmb, n.y * 0.5 + 0.5);
  vec3 c = vC * uTint * (uSunCol * d * 0.92 + amb + uEmis);
  if (uSpec > 0.0) { vec3 v = normalize(uCam - vW); vec3 h = normalize(uSunDir + v); c += uSunCol * pow(max(dot(n, h), 0.0), 30.0) * uSpec; }
  gl_FragColor = vec4(applyFog(c, length(vW - uCam)), 1.0);
}`,
  },
  plane: {
    vs: `attribute vec3 aPos; attribute vec3 aNor; attribute vec3 aInfo;
uniform mat4 uModel; uniform mat4 uVP; uniform mat4 uBones[8]; uniform vec2 uFired;
varying vec3 vObj; varying vec3 vObjN; varying vec3 vW; varying vec3 vN; varying float vMat;
void main(){
  float sl = aInfo.z;
  if ((sl > 0.5 && sl < 20.5 && sl < uFired.x + 0.5) || (sl > 20.5 && sl - 20.0 < uFired.y + 0.5)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vObj = vec3(0.0); vObjN = vec3(0.0, 1.0, 0.0); vW = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); vMat = 0.0; return; }
  vec4 p = vec4(aPos, 1.0); vec4 n = vec4(aNor, 0.0);
  if (aInfo.y > 0.5) { int bi = int(aInfo.y + 0.5); mat4 B = uBones[bi]; p = B * p; n = B * n; }
  vObj = aPos; vObjN = aNor; vMat = aInfo.x;
  vec4 w = uModel * p; vW = w.xyz; vN = (uModel * n).xyz;
  gl_Position = uVP * w;
}`,
    fs: GLSL_FRAG_HEAD + GLSL_ENV + `
varying vec3 vObj; varying vec3 vObjN; varying vec3 vW; varying vec3 vN; varying float vMat;
uniform vec3 uTop; uniform vec3 uBot; uniform vec3 uC2; uniform vec3 uC3; uniform vec3 uRad; uniform vec3 uAccent; uniform vec3 uGlass; uniform vec3 uBandCol;
uniform vec4 uPat; uniform vec4 uBand; uniform vec2 uMetal; uniform float uFlash;
uniform vec4 uMk[4]; uniform float uMkStyle; uniform vec3 uMkC0; uniform vec3 uMkC1;
// national insignia painted straight onto the surface: kind 1 = wing (top and bottom, both wings, centre x,z),
// kind 2 = fuselage side (both sides, centre z,y); style 0 = plain disc (hinomaru), 1 = ROC blue sky / white sun
vec3 marks(vec3 c, vec3 p, vec3 n){
  for (int i = 0; i < 4; i++) {
    vec4 m = uMk[i];
    if (m.w < 0.5) continue;
    vec2 d;
    if (m.w < 1.5) { if (abs(n.y) < 0.3) continue; d = vec2(abs(p.x) - m.x, p.z - m.y); }
    else { if (abs(n.x) < 0.3) continue; d = vec2(p.z - m.x, p.y - m.y); }
    float r = length(d) / m.z;
    if (r > 1.0) continue;
    if (uMkStyle < 0.5) { c = uMkC0; continue; }
    float k = abs(fract(atan(d.y, d.x) * 1.9098593 + 0.5) - 0.5) * 2.0;    // 12 sun rays: 0 on a ray's axis
    vec3 col = uMkC0;
    if (r > 0.42 && r < 0.76 && k < (0.76 - r) / 0.34) col = uMkC1;
    if (r < 0.37) col = uMkC1;
    c = col;
  }
  return c;
}
float h21(vec2 p){ p = fract(p * vec2(234.34, 435.345)); p += dot(p, p + 34.23); return fract(p.x * p.y); }
float vn(vec2 p){ vec2 i = floor(p), f = fract(p); vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(mix(h21(i), h21(i + vec2(1.0, 0.0)), u.x), mix(h21(i + vec2(0.0, 1.0)), h21(i + vec2(1.0, 1.0)), u.x), u.y); }
float fb(vec2 p){ return vn(p) * 0.55 + vn(p * 2.1 + 3.1) * 0.3 + vn(p * 4.3 + 7.7) * 0.15; }
vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c * p.x - s * p.y, s * p.x + c * p.y); }
vec3 paintCol(){
  vec3 p = vObj; vec3 n = normalize(vObjN);
  float topw = smoothstep(0.25, 0.65, abs(n.y));
  vec2 uv = mix(vec2(p.z, p.y + abs(p.x) * 0.3), vec2(p.x, p.z), topw) * uPat.y;
  vec3 c = uTop; float pat = uPat.x;
  if (pat > 0.5 && pat < 1.5) { float v = fb(uv); c = v > 0.58 ? uC2 : (v < 0.4 ? uC3 : uTop); }
  else if (pat > 1.5 && pat < 2.5) {
    vec2 a = rot2(uv, 0.62); vec2 b = rot2(uv, -0.95);
    float h = fract(h21(floor(a * vec2(1.0, 0.55))) + h21(floor(b * vec2(0.7, 1.0)) + 5.0));
    c = h < 0.36 ? uTop : (h < 0.7 ? uC2 : uC3);
  } else if (pat > 3.5) { float v = fb(uv * 0.8 + 1.7); c = v > 0.5 ? uC2 : uTop; }
  else if (pat > 2.5) { float h = h21(floor(vec2(p.z * 1.1, abs(p.x) * 0.9 + p.y * 0.9))); c = uTop * (0.92 + 0.13 * h); }
  float under = smoothstep(0.12, -0.3, n.y);
  c = mix(c, uBot, (pat > 2.5 && pat < 3.5) ? under * 0.5 : under);
  if (p.z < uPat.z) c = uRad;
  float ax = abs(p.x);
  if (uBand.z > 0.5 && p.z > uBand.x && p.z < uBand.y && ax < 0.75) c = uBandCol;
  if (uPat.w > 0.5) {
    if (ax > 2.0 && ax < 3.25) c = mod(floor((ax - 2.0) / 0.25), 2.0) < 0.5 ? vec3(0.9, 0.9, 0.86) : vec3(0.07);
    if (p.z > uBand.x && p.z < uBand.y && ax < 0.75) c = mod(floor((p.z - uBand.x) / 0.25), 2.0) < 0.5 ? vec3(0.9, 0.9, 0.86) : vec3(0.07);
  }
  c = marks(c, p, n);
  float pl = smoothstep(0.965, 1.0, fract(p.z * 0.72 + 0.5));
  return c * (1.0 - 0.07 * pl);
}
void main(){
  vec3 base; float metal = 0.0; float gloss = 0.35; float m = vMat;
  if (m < 0.5) { base = paintCol(); metal = uMetal.x; gloss = uMetal.y; }
  else if (m < 1.5) { base = uAccent; gloss = 0.45; }
  else if (m < 2.5) { base = uGlass; gloss = 0.95; }
  else if (m < 3.5) { base = vec3(0.17, 0.175, 0.18); metal = 0.6; gloss = 0.55; }
  else if (m < 4.5) { base = vec3(0.02, 0.02, 0.025); gloss = 0.08; }
  else if (m < 5.5) { base = vec3(0.86, 0.87, 0.85); gloss = 0.5; }
  else if (m < 6.5) { base = vec3(0.4, 0.41, 0.42); gloss = 0.4; }
  else { base = vec3(0.07, 0.07, 0.07); metal = 0.3; gloss = 0.35; }
  vec3 N = normalize(vN); vec3 V = normalize(uCam - vW);
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 amb = mix(uGndAmb, uSkyAmb, N.y * 0.5 + 0.5);
  vec3 H = normalize(uSunDir + V);
  float sp = pow(max(dot(N, H), 0.0), mix(8.0, 140.0, gloss)) * gloss * 1.2;
  vec3 env = skyCol(reflect(-V, N)); vec3 envM = mix(vec3(dot(env, vec3(0.3, 0.5, 0.2))), env, 0.3);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 diff = base * (uSunCol * ndl * 0.95 + amb);
  vec3 c = mix(diff, base * envM * 1.1 + diff * 0.35, metal);
  c += env * (0.03 + 0.45 * fres) * gloss;
  c += uSunCol * sp * mix(0.35, 1.0, metal);
  if (m > 1.5 && m < 2.5) c = base * 0.3 + env * (0.16 + 0.6 * fres) * mix(vec3(1.0), uGlass * 2.2, 0.35) + uSunCol * sp * 1.5;
  c = mix(c, vec3(1.0, 0.78, 0.5), uFlash);
  gl_FragColor = vec4(applyFog(c, length(vW - uCam)), 1.0);
}`,
  },
  // hi-detail textured aircraft (quantised vertices: int16 position, int16 missile slot, int8 normal, uint8 bone, uint16 uv)
  // bone 0 = rigid airframe; 1..7 = control surfaces / swing wings, moved by uBones like the procedural models
  hd: {
    vs: `attribute vec3 aPos; attribute float aSlot; attribute vec3 aNor; attribute float aBone; attribute vec2 aUV;
uniform mat4 uModel; uniform mat4 uVP; uniform mat4 uBones[8]; uniform vec3 uPC; uniform vec3 uPH; uniform vec2 uUVO; uniform vec2 uUVS; uniform vec2 uFired; uniform float uPropBone;
varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying float vOY;
void main(){
  float sl = aSlot;
  if ((sl > 0.5 && sl < 20.5 && sl < uFired.x + 0.5) || (sl > 20.5 && sl - 20.0 < uFired.y + 0.5)) { gl_Position = vec4(0.0, 0.0, 2.0, 1.0); vW = vec3(0.0); vN = vec3(0.0, 1.0, 0.0); vUV = vec2(0.0); vOY = -99.0; return; }
  vec3 lp = uPC + aPos * uPH; vOY = abs(aBone - uPropBone) < 0.5 ? -99.0 : lp.y; // propeller blades never get the fin-tip colour
  vec4 p = vec4(lp, 1.0); vec4 n = vec4(aNor, 0.0);
  if (aBone > 0.5) { mat4 B = uBones[int(aBone + 0.5)]; p = B * p; n = B * n; }
  vec4 w = uModel * p; vW = w.xyz; vN = (uModel * n).xyz; vUV = uUVO + aUV * uUVS;
  gl_Position = uVP * w;
}`,
    fs: GLSL_FRAG_HEAD + GLSL_ENV + `
varying vec3 vW; varying vec3 vN; varying vec2 vUV; varying float vOY;
uniform sampler2D uTex; uniform float uHasTex; uniform vec4 uColor; uniform float uMode; uniform float uCut; uniform float uFlash; uniform vec2 uMat;
uniform float uAccY; uniform vec3 uAccent;
void main(){
  vec4 base = uColor;
  if (uHasTex > 0.5) base *= texture2D(uTex, vUV);
  if (uMode > 0.5 && uMode < 1.5 && base.a < uCut) discard;
  if (uMode < 1.5) { float k = smoothstep(uAccY, uAccY + 0.03, vOY); base.rgb = mix(base.rgb, uAccent * (0.7 + 0.45 * dot(base.rgb, vec3(0.3, 0.5, 0.2))), k * 0.92); }
  vec3 N = normalize(vN); if (!gl_FrontFacing) N = -N;
  vec3 V = normalize(uCam - vW);
  float gloss = uMat.y, metal = uMat.x;
  float ndl = max(dot(N, uSunDir), 0.0);
  vec3 amb = mix(uGndAmb, uSkyAmb, N.y * 0.5 + 0.5);
  vec3 H = normalize(uSunDir + V);
  float sp = pow(max(dot(N, H), 0.0), mix(8.0, 140.0, gloss)) * gloss * 1.2;
  vec3 env = skyCol(reflect(-V, N)); vec3 envM = mix(vec3(dot(env, vec3(0.3, 0.5, 0.2))), env, 0.3);
  float fres = pow(1.0 - max(dot(N, V), 0.0), 4.0);
  vec3 diff = base.rgb * (uSunCol * ndl * 0.95 + amb);
  vec3 c = mix(diff, base.rgb * envM * 1.1 + diff * 0.35, metal);
  c += env * (0.03 + 0.45 * fres) * gloss;
  c += uSunCol * sp * mix(0.35, 1.0, metal);
  float a = 1.0;
  if (uMode > 1.5) { a = clamp(base.a + fres * 0.5, 0.18, 0.96); c = base.rgb * 0.35 + env * (0.14 + 0.62 * fres) + uSunCol * sp * 1.6; }
  c = mix(c, vec3(1.0, 0.78, 0.5), uFlash);
  c = applyFog(c, length(vW - uCam));
  gl_FragColor = vec4(c * a, a);
}`,
  },
  sky: {
    vs: `attribute vec2 aPos; uniform mat4 uIVP; uniform vec3 uCam; varying vec3 vDir;
void main(){ vec4 p = uIVP * vec4(aPos, 1.0, 1.0); vDir = p.xyz / p.w - uCam; gl_Position = vec4(aPos, 0.99999, 1.0); }`,
    fs: GLSL_FRAG_HEAD + GLSL_ENV + `varying vec3 vDir;
void main(){ vec3 d = normalize(vDir); vec3 c = skyCol(d); float s = max(dot(d, uSunDir), 0.0);
  c += uSunCol * (smoothstep(0.99945, 0.99975, s) * 3.0 + pow(s, 400.0) * 0.6);
  gl_FragColor = vec4(c, 1.0); }`,
  },
  water: {
    // the camera has its own name here: a uniform shared with a mediump fragment shader would not link on such GPUs
    vs: `attribute vec2 aPos; uniform mat4 uVP; uniform vec3 uCamV; varying vec3 vW;
void main(){ vec3 w = vec3(aPos.x + uCamV.x, 0.0, aPos.y + uCamV.z); vW = w; gl_Position = uVP * vec4(w, 1.0); }`,
    fs: GLSL_FRAG_HEAD + GLSL_ENV + `varying vec3 vW; uniform float uTime; uniform vec3 uDeep;
void main(){
  vec3 p = vW; float dist = length(p - uCam); vec2 q = p.xz;
  float fade = 1.0 - smoothstep(600.0, 9000.0, dist);
  vec2 g = vec2(0.8, 0.6) * cos(dot(q, vec2(0.8, 0.6)) * 0.035 + uTime * 1.1) * 0.07;
  g += vec2(-0.5, 0.86) * cos(dot(q, vec2(-0.5, 0.86)) * 0.061 + uTime * 1.7) * 0.05;
  g += vec2(0.2, -0.98) * cos(dot(q, vec2(0.2, -0.98)) * 0.13 + uTime * 2.3) * 0.035;
  g += vec2(-0.9, -0.43) * cos(dot(q, vec2(-0.9, -0.43)) * 0.27 + uTime * 3.1) * 0.022;
  vec3 n = normalize(vec3(-g.x * fade, 1.0, -g.y * fade));
  vec3 v = normalize(uCam - p);
  float fres = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  vec3 r = reflect(-v, n);
  vec3 c = mix(uDeep, skyCol(r), 0.1 + 0.72 * fres);
  c += uSunCol * pow(max(dot(r, uSunDir), 0.0), 240.0) * 2.4;
  gl_FragColor = vec4(applyFog(c, dist), 0.84 + 0.16 * fres);
}`,
  },
  part: {
    vs: `attribute vec3 aPos; attribute vec4 aCol; attribute float aSize;
uniform mat4 uVP; uniform float uPx; uniform vec3 uCam; uniform vec3 uFog; uniform float uMaxPt;
varying vec4 vC; varying float vF;
void main(){ vec4 p = uVP * vec4(aPos, 1.0); gl_Position = p;
  gl_PointSize = clamp(aSize * uPx / max(p.w, 0.5), 1.0, uMaxPt); vC = aCol;
  float d = length(aPos - uCam); vF = (1.0 - exp(-pow(max(d - uFog.x, 0.0) / uFog.y, 2.0))) * uFog.z; }`,
    fs: GLSL_FRAG_HEAD + `varying vec4 vC; varying float vF; uniform vec3 uFogCol; uniform float uAdd;
void main(){ vec2 c = gl_PointCoord * 2.0 - 1.0; float r2 = dot(c, c); if (r2 > 1.0) discard;
  float a = vC.a * (1.0 - r2) * (1.0 - r2);
  if (uAdd > 0.5) { gl_FragColor = vec4(vC.rgb * a * (1.0 - vF), a); }
  else { gl_FragColor = vec4(mix(vC.rgb, uFogCol, vF) * a, a); } }`,
  },
  fx: {
    vs: `attribute vec3 aPos; attribute vec4 aCol; attribute vec2 aUV; uniform mat4 uVP;
varying vec4 vC; varying vec2 vUV; void main(){ vC = aCol; vUV = aUV; gl_Position = uVP * vec4(aPos, 1.0); }`,
    fs: GLSL_FRAG_HEAD + `varying vec4 vC; varying vec2 vUV;
void main(){ float e = abs(vUV.y); float a = vC.a * (1.0 - smoothstep(0.2, 1.0, e)) * mix(0.2, 1.0, vUV.x); vec3 c = mix(vC.rgb, vec3(1.0, 0.97, 0.9), 1.0 - smoothstep(0.0, 0.45, e)); gl_FragColor = vec4(c * a, a * 0.55); }`,
  },
  // afterburner plume, prop blur disc (mode 1) and glowing nozzle disc (mode 2).
  // The plume mesh is only a hull a little wider than the flame (unit length along +z, unit nozzle radius): each pixel
  // marches its view ray through the glowing gas inside (uSteps <= 6 steps, nozzle frame), so the edges are soft and no
  // facets show from any side. Layers: envelope (c1, turning c2 downstream), shorter white-hot core (c0) and the shock
  // diamonds, which are solid bicones lit by their exact chord along the ray (crisp from the side, no stepping artefacts
  // when seen along the plume). uAB 0..1 = dry heat glow .. full afterburner. c3 = nozzle ring.
  // The vertex shader works out the view ray (uEye = camera in nozzle radii) and hands it on divided by a per-draw
  // constant, so a mediump fragment shader only sees small numbers; no uniform is shared between the two shaders.
  flame: {
    vs: `attribute vec3 aPos; uniform mat4 uModel; uniform mat4 uVP; uniform vec3 uScl; uniform vec3 uEye; varying vec3 vL; varying vec4 vR;
void main(){ vL = aPos; gl_Position = uVP * (uModel * vec4(aPos * uScl, 1.0));
  float Ln = uScl.z / uScl.x, s = length(uEye - vec3(0.0, 0.0, 0.5 * Ln)) + 1.0;
  vR = vec4((aPos * vec3(1.0, 1.0, Ln) - uEye) / s, s); }`,
    fs: GLSL_FRAG_HEAD + `varying vec3 vL; varying vec4 vR; uniform float uInt; uniform float uMode; uniform float uLn; uniform float uSteps; uniform float uIn;
uniform vec3 uC0; uniform vec3 uC1; uniform vec3 uC2; uniform vec3 uC3; uniform float uDia; uniform float uAB; uniform float uPh;
// one half of a shock diamond (knot units: radius / 0.62 and (z - middle) / half a cell, so the knot is |r| + |z| <= 1):
// where the line o + v s crosses the cone |r| = 1 - sg z with 0 <= sg z <= 1, folded into the chord iv
vec2 knotHalf(vec3 o, vec3 v, float sg, vec2 iv) {
  float m = 1.0 - sg * o.z, n = sg * v.z;
  float A = dot(v.xy, v.xy) - n * n, B = dot(o.xy, v.xy) + m * n, C = dot(o.xy, o.xy) - m * m, D = B * B - A * C;
  if (D < -1e-4) return iv;
  float q = sqrt(max(D, 0.0));
  vec2 s = abs(A) > 1e-4 ? vec2(-B - q, -B + q) / A : vec2(-0.5 * C / B), w = m - n * s;
  if (w.x >= 0.0 && w.x <= 1.0) iv = vec2(min(iv.x, s.x), max(iv.y, s.x));
  if (w.y >= 0.0 && w.y <= 1.0) iv = vec2(min(iv.x, s.y), max(iv.y, s.y));
  return iv;
}
void main(){
  if (uMode > 1.5) { // nozzle glow seen from behind: white-hot centre, coloured ring
    float r = length(vL.xy); float a = uInt * smoothstep(1.0, 0.55, r);
    vec3 col = mix(uC0, uC3, smoothstep(0.05, 0.85, r));
    gl_FragColor = vec4(col * a, a); return; }
  if (uMode > 0.5) { float r = length(vL.xy); float a = uInt * smoothstep(1.0, 0.75, r) * smoothstep(0.12, 0.35, r) * (0.75 + 0.25 * sin(r * 40.0));
    gl_FragColor = vec4(vec3(0.32) * a * 0.22, a * 0.22); return; }
  // in nozzle radii from here on: e = where the ray meets the hull (or the eye, uIn), d = its direction
  float Ln = uLn;
  vec3 e = vL * vec3(1.0, 1.0, Ln), d = normalize(vR.xyz);
  if (uIn > 0.5) e -= vR.xyz * vR.w;
  // the ray leaves the gas through the bounding cylinder or the nozzle / tail planes
  float a = dot(d.xy, d.xy), b = dot(e.xy, d.xy), c = dot(e.xy, e.xy) - 1.5;
  float t = a > 1e-6 ? (sqrt(max(b * b - a * c, 0.0)) - b) / a : 1e4;
  if (d.z > 1e-4) t = min(t, (Ln - e.z) / d.z); else if (d.z < -1e-4) t = min(t, -e.z / d.z);
  t = max(t, 0.0);
  float k = t / uSteps;
  vec3 st = d * k, p = e + st * 0.5;
  float zc = mix(0.1, 0.4, uAB), hot = mix(0.6, 1.2, uAB), cool = 0.4 - 0.4 * uAB;
  vec3 E = vec3(0.0); float tau = 0.0;
  for (int i = 0; i < 6; i++) {
    if (float(i) >= uSteps) break;
    float z = clamp(p.z / Ln, 0.0, 1.0), y = 1.0 - z, q2 = dot(p.xy, p.xy);
    // envelope: bulges a little after the exit, then a long taper; turbulence carried downstream, stronger toward the tail
    float bz = 1.0 + 0.6 * z * y * y * y;
    float env = max(1.0 - q2 / (y * (1.0 + 0.8 * z) * bz * bz + 1e-4), 0.0) * y * (1.0 + 0.3 * z * sin(p.z * 1.3 + p.x * 1.7 - uPh));
    // white-hot core, shorter and narrower
    float cz = max(1.0 - z / zc, 0.0), cr = max(1.0 - q2 / (0.15 * cz + 0.01), 0.0);
    float core = cz * cz * cr * cr;
    E += mix(uC1, uC2, smoothstep(0.1, 0.95, z + cool)) * (env * 1.5) + uC0 * (core * hot);
    tau += env + core * 0.5;
    p += st;
  }
  E *= k;
  // shock diamonds (afterburner only): one knot per cell, the first shock 0.1 cell behind the exit; each knot is a
  // bicone 0.62 nozzle radii wide in the middle and as long as the cell, fading downstream. Short chords (rim, tips)
  // count less, which keeps the edges soft. Only rays that pass that close to the axis can meet a knot.
  float dd = dot(d.xy, d.xy), ed = dot(e.xy, d.xy);
  if (uAB > 0.0 && dot(e.xy, e.xy) - (dd > 1e-6 ? ed * ed / dd : 0.0) < 0.385) {
    float h = 0.5 * Ln / uDia, g = uAB * uAB * 3.4, z0 = min(e.z, e.z + d.z * t), z1 = max(e.z, e.z + d.z * t);
    vec3 v = vec3(d.xy / 0.62, d.z / h), dc = mix(uC0, uC1, 0.4);
    for (int j = 0; j < 3; j++) {   // a fourth knot would be too faint to see
      float zj = (float(j) + 0.6) / uDia, f = 1.0 - zj / 0.72;
      if (f <= 0.0) break;
      if (zj * Ln + h < z0 || zj * Ln - h > z1) continue;   // the ray never gets level with this knot
      vec3 o = vec3(e.xy / 0.62, (e.z - zj * Ln) / h);
      vec2 iv = knotHalf(o, v, -1.0, knotHalf(o, v, 1.0, vec2(1e4, -1e4)));
      float ch = max(min(iv.y, t) - max(iv.x, 0.0), 0.0);
      E += dc * (ch * ch / (ch + 0.5) * f * f * g);
    }
  }
  // soft saturation: the hottest parts turn white, thin parts keep their colour;
  // partly 'over' so the plume still reads against a bright sky
  gl_FragColor = vec4(1.0 - exp(-E * uInt), (1.0 - exp(-tau * (k * uInt * 0.9))) * 0.7);
}`,
  },
};

const R = {
  cv: null, gl: null, ok: false, dpr: 1, W: 1, H: 1, cssW: 1, cssH: 1, frame: 0, time: 0, quality: 2,
  P: {},
  enabled: [],
  maxPt: 256,
  cam: { pos: new V3(0, 100, 0), q: new Q(), fov: 66 * DEG, near: 1.5, far: 70000, view: M4.create(), proj: M4.create(), vp: M4.create(), ivp: M4.create(), px: 1, aspect: 1, ox: 0, oy: 0 },
  env: {
    sun: new V3(0.42, 0.6, 0.38).norm(), sunCol: [1.0, 0.95, 0.85], zen: [0.22, 0.44, 0.76], hor: [0.72, 0.82, 0.9],
    skyAmb: [0.42, 0.5, 0.6], gndAmb: [0.37, 0.36, 0.32], fog: [1500, 15000, 1], deep: [0.05, 0.22, 0.32],
  },
  init(cv) {
    this.cv = cv;
    const o = { antialias: true, alpha: false, depth: true, stencil: false, premultipliedAlpha: true, powerPreference: 'high-performance' };
    const gl = cv.getContext('webgl', o) || cv.getContext('experimental-webgl', o);
    if (!gl) return false;
    this.gl = gl;
    try {
      for (const k in SH) this.P[k] = this.program(SH[k].vs, SH[k].fs);
    } catch (e) { console.error(e); return false; }
    const pr = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
    this.maxPt = Math.min(600, (pr && pr[1]) || 64);
    this.fsTri = this.mesh(new Float32Array([-1, -1, 3, -1, -1, 3]), 'p2');
    const S = 45000;
    this.waterQuad = this.mesh(new Float32Array([-S, -S, S, -S, S, S, -S, -S, S, S, -S, S]), 'p2');
    gl.enable(gl.DEPTH_TEST); gl.depthFunc(gl.LEQUAL);
    this.ok = true;
    return true;
  },
  program(vsSrc, fsSrc) {
    const gl = this.gl;
    const sh = (type, src) => { const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s) + '\n' + src.slice(0, 400)); return s; };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vsSrc)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link: ' + gl.getProgramInfoLog(p));
    const prog = { p, a: {}, u: {}, frame: -1 };
    const na = gl.getProgramParameter(p, gl.ACTIVE_ATTRIBUTES);
    for (let i = 0; i < na; i++) { const info = gl.getActiveAttrib(p, i); prog.a[info.name] = gl.getAttribLocation(p, info.name); }
    const nu = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < nu; i++) { const info = gl.getActiveUniform(p, i); const name = info.name.replace(/\[0\]$/, ''); prog.u[name] = gl.getUniformLocation(p, info.name); }
    return prog;
  },
  // layouts: [name, size] pairs
  LAY: {
    lit: [['aPos', 3], ['aNor', 3], ['aCol', 3]],
    plane: [['aPos', 3], ['aNor', 3], ['aInfo', 3]],
    p2: [['aPos', 2]],
    p3: [['aPos', 3]],
    part: [['aPos', 3], ['aCol', 4], ['aSize', 1]],
    fx: [['aPos', 3], ['aCol', 4], ['aUV', 2]],
  },
  mesh(data, lay, dynamic) {
    const gl = this.gl, L = this.LAY[lay];
    const stride = L.reduce((s, a) => s + a[1], 0);
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, dynamic ? gl.DYNAMIC_DRAW : gl.STATIC_DRAW);
    return { buf, n: data.length / stride, lay: L, stride, cap: data.length };
  },
  update(mesh, data, count) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, count < data.length ? data.subarray(0, count) : data);
    mesh.n = count / mesh.stride;
  },
  bind(prog, mesh) {
    const gl = this.gl;
    gl.bindBuffer(gl.ARRAY_BUFFER, mesh.buf);
    const used = [];
    let off = 0;
    for (const [name, size] of mesh.lay) {
      const loc = prog.a[name];
      if (loc !== undefined && loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, size, gl.FLOAT, false, mesh.stride * 4, off * 4);
        used.push(loc);
      }
      off += size;
    }
    for (const l of this.enabled) if (used.indexOf(l) < 0) gl.disableVertexAttribArray(l);
    this.enabled = used;
  },
  use(prog) {
    const gl = this.gl, u = prog.u, E = this.env, C = this.cam;
    gl.useProgram(prog.p);
    if (prog.frame === this.frame) return prog;
    prog.frame = this.frame;
    if (u.uVP) gl.uniformMatrix4fv(u.uVP, false, C.vp);
    if (u.uIVP) gl.uniformMatrix4fv(u.uIVP, false, C.ivp);
    if (u.uCam) gl.uniform3f(u.uCam, C.pos.x, C.pos.y, C.pos.z);
    if (u.uCamV) gl.uniform3f(u.uCamV, C.pos.x, C.pos.y, C.pos.z);
    if (u.uSunDir) gl.uniform3f(u.uSunDir, E.sun.x, E.sun.y, E.sun.z);
    if (u.uSunCol) gl.uniform3fv(u.uSunCol, E.sunCol);
    if (u.uZen) gl.uniform3fv(u.uZen, E.zen);
    if (u.uHor) gl.uniform3fv(u.uHor, E.hor);
    if (u.uFogCol) gl.uniform3fv(u.uFogCol, E.hor);
    if (u.uFog) gl.uniform3fv(u.uFog, E.fog);
    if (u.uSkyAmb) gl.uniform3fv(u.uSkyAmb, E.skyAmb);
    if (u.uGndAmb) gl.uniform3fv(u.uGndAmb, E.gndAmb);
    if (u.uTime) gl.uniform1f(u.uTime, this.time);
    if (u.uPx) gl.uniform1f(u.uPx, C.px);
    if (u.uMaxPt) gl.uniform1f(u.uMaxPt, this.maxPt);
    if (u.uDeep) gl.uniform3fv(u.uDeep, E.deep);
    return prog;
  },
  resize(scale) {
    const cssW = Math.max(1, window.innerWidth), cssH = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, scale);
    const W = Math.round(cssW * dpr), H = Math.round(cssH * dpr);
    this.cssW = cssW; this.cssH = cssH; this.dpr = dpr;
    if (this.cv.width !== W || this.cv.height !== H) { this.cv.width = W; this.cv.height = H; }
    this.W = W; this.H = H;
  },
  setCamera() {
    const C = this.cam;
    C.aspect = this.W / this.H;
    M4.persp(C.proj, C.fov, C.aspect, C.near, C.far);
    if (C.ox || C.oy) { C.proj[8] = -C.ox * 2 / this.cssW; C.proj[9] = C.oy * 2 / this.cssH; }
    M4.view(C.view, C.q, C.pos);
    M4.mul(C.vp, C.proj, C.view);
    M4.invert(C.ivp, C.vp);
    C.px = this.H / (2 * Math.tan(C.fov / 2));
  },
  begin(clear) {
    const gl = this.gl; this.frame++;
    gl.viewport(0, 0, this.W, this.H);
    gl.depthMask(true);
    gl.clearColor(clear[0], clear[1], clear[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    this.setCamera();
  },
  // world -> CSS pixel coords; returns null if behind the camera
  project(p, out) {
    const m = this.cam.vp;
    const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12];
    const y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
    const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    out.w = w;
    if (w <= 0.01) { out.on = false; out.x = x; out.y = y; return false; }
    out.x = (x / w * 0.5 + 0.5) * this.cssW; out.y = (1 - (y / w * 0.5 + 0.5)) * this.cssH;
    out.on = out.x > -40 && out.x < this.cssW + 40 && out.y > -40 && out.y < this.cssH + 40;
    return true;
  },
  // on-screen size (CSS px) of something r metres across at p; large when the camera is right next to it
  pxSize(p, r) {
    const m = this.cam.vp, w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    return w <= 1 ? 1e4 : r * this.cam.px / w;
  },
  // sphere visibility test
  visible(p, r) {
    const m = this.cam.vp;
    const w = m[3] * p.x + m[7] * p.y + m[11] * p.z + m[15];
    if (w < -r) return false;
    const x = m[0] * p.x + m[4] * p.y + m[8] * p.z + m[12], y = m[1] * p.x + m[5] * p.y + m[9] * p.z + m[13];
    const k = r * 2.2 + Math.max(w, 0) * 0.08;
    return Math.abs(x) < w + k && Math.abs(y) < w + k;
  },
  drawSky() {
    const gl = this.gl, p = this.use(this.P.sky);
    gl.disable(gl.DEPTH_TEST); gl.depthMask(false); gl.disable(gl.BLEND); gl.disable(gl.CULL_FACE);
    this.bind(p, this.fsTri); gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.enable(gl.DEPTH_TEST); gl.depthMask(true);
  },
  drawLit(mesh, model, o = {}) {
    const gl = this.gl, p = this.use(this.P.lit), u = p.u;
    gl.disable(gl.BLEND);
    if (o.cull === false) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
    gl.uniformMatrix4fv(u.uModel, false, model || IDENT);
    gl.uniform1f(u.uSpec, o.spec || 0); gl.uniform1f(u.uWrap, o.wrap || 0); gl.uniform1f(u.uEmis, o.emis || 0);
    gl.uniform3fv(u.uTint, o.tint || ONE3);
    this.bind(p, mesh); gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  },
  drawPlane(mesh, model, look) {
    const gl = this.gl, p = this.use(this.P.plane), u = p.u;
    gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniformMatrix4fv(u.uBones, false, look.bones || IDENT_BONES);
    gl.uniform2f(u.uFired, look.firedR || 0, look.firedI || 0);
    const pt = look.paint;
    gl.uniform3fv(u.uTop, pt.top); gl.uniform3fv(u.uBot, pt.bot); gl.uniform3fv(u.uC2, pt.c2); gl.uniform3fv(u.uC3, pt.c3);
    gl.uniform3fv(u.uRad, pt.rad); gl.uniform3fv(u.uGlass, pt.glass); gl.uniform3fv(u.uBandCol, pt.bandCol);
    gl.uniform4fv(u.uPat, pt.pat); gl.uniform4fv(u.uBand, pt.band); gl.uniform2fv(u.uMetal, pt.metal);
    gl.uniform4fv(u.uMk, pt.mk || NO_MARKS); gl.uniform1f(u.uMkStyle, pt.mkStyle || 0);
    if (pt.mk) { gl.uniform3fv(u.uMkC0, pt.mkC0); gl.uniform3fv(u.uMkC1, pt.mkC1); }
    gl.uniform3fv(u.uAccent, look.accent || pt.top);
    gl.uniform1f(u.uFlash, look.flash || 0);
    this.bind(p, mesh); gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
  },
  // textured hi-detail model: opaque groups first, glass last (premultiplied blending, no depth writes).
  // g0..g1 picks a range of groups (one missile out of the missile library); tint multiplies the colour.
  drawHD(m, model, look, g0, g1, tint) {
    const gl = this.gl, p = this.use(this.P.hd), u = p.u, a = p.a;
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniformMatrix4fv(u.uBones, false, look.hdBones || IDENT_BONES);
    gl.uniform1f(u.uPropBone, m.propBone === undefined ? -1 : m.propBone);
    gl.uniform3fv(u.uPC, m.pc); gl.uniform3fv(u.uPH, m.ph);
    gl.uniform2fv(u.uUVO, m.uvo); gl.uniform2fv(u.uUVS, m.uvs);
    gl.uniform2f(u.uFired, look.firedR || 0, look.firedI || 0);
    gl.uniform1f(u.uFlash, look.flash || 0);
    gl.uniform1i(u.uTex, 0);
    gl.uniform1f(u.uAccY, m.accY); gl.uniform3fv(u.uAccent, look.accent || ONE3);
    gl.bindBuffer(gl.ARRAY_BUFFER, m.vb);
    const used = [];
    const at = (name, n, type, norm, off) => { const l = a[name]; if (l === undefined || l < 0) return; gl.enableVertexAttribArray(l); gl.vertexAttribPointer(l, n, type, norm, 16, off); used.push(l); };
    at('aPos', 3, gl.SHORT, true, 0); at('aSlot', 1, gl.SHORT, false, 6); at('aNor', 3, gl.BYTE, true, 8); at('aBone', 1, gl.UNSIGNED_BYTE, false, 11);
    at('aUV', 2, gl.UNSIGNED_SHORT, true, 12);
    for (const l of this.enabled) if (used.indexOf(l) < 0) gl.disableVertexAttribArray(l);
    this.enabled = used;
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, m.ib);
    gl.activeTexture(gl.TEXTURE0);
    const it = m.idx32 ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT, isz = m.idx32 ? 4 : 2;
    let blend = false;
    gl.disable(gl.BLEND); gl.depthMask(true);
    const a0 = g0 || 0, a1 = g1 === undefined ? m.groups.length : g1;
    for (let gi = a0; gi < a1; gi++) {
      const g = m.groups[gi];
      if (g.mode === 2 && !blend) { blend = true; gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.depthMask(false); }
      if (g.double) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
      const t = g.tex >= 0 ? m.tex[g.tex] : null;
      gl.uniform1f(u.uHasTex, t ? 1 : 0);
      if (t) gl.bindTexture(gl.TEXTURE_2D, t);
      if (tint) { const c = TINT4; c[0] = g.color[0] * tint[0]; c[1] = g.color[1] * tint[1]; c[2] = g.color[2] * tint[2]; c[3] = g.color[3]; gl.uniform4fv(u.uColor, c); }
      else gl.uniform4fv(u.uColor, g.color);
      gl.uniform1f(u.uMode, g.mode); gl.uniform1f(u.uCut, g.cutoff || 0.5);
      gl.uniform2fv(u.uMat, g.mat);
      gl.drawElements(gl.TRIANGLES, g.count, it, g.start * isz);
    }
    if (blend) { gl.disable(gl.BLEND); gl.depthMask(true); }
    gl.enable(gl.CULL_FACE);
  },
  drawWater() {
    const gl = this.gl, p = this.use(this.P.water);
    gl.enable(gl.BLEND); gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA); gl.disable(gl.CULL_FACE);
    this.bind(p, this.waterQuad); gl.drawArrays(gl.TRIANGLES, 0, 6);
    gl.disable(gl.BLEND);
  },
  drawPoints(mesh, additive) {
    if (!mesh.n) return;
    const gl = this.gl, p = this.use(this.P.part);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE);
    if (additive) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniform1f(p.u.uAdd, additive ? 1 : 0);
    this.bind(p, mesh); gl.drawArrays(gl.POINTS, 0, mesh.n);
    gl.depthMask(true); gl.disable(gl.BLEND);
  },
  drawFx(mesh) {
    if (!mesh.n) return;
    const gl = this.gl, p = this.use(this.P.fx);
    gl.enable(gl.BLEND); gl.depthMask(false); gl.disable(gl.CULL_FACE); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    this.bind(p, mesh); gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
    gl.depthMask(true); gl.disable(gl.BLEND);
  },
  // mode 0: plume, 1: prop disc, 2: nozzle glow (additive); pal = { c0, c1, c2, c3 }. Plume only: dia = shock diamonds
  // per plume length, ab = afterburner 0..1, cam = camera position in the model frame (metres), ph = flicker phase.
  // Front faces only, so every pixel marches through the plume once; when the camera is inside the hull, or so close
  // that the near plane would cut it, a quad just past the near plane takes its place and the march starts at the eye.
  // Fewer steps when the plume is small on screen.
  drawFlame(mesh, model, sx, sy, sz, intensity, mode, pal, dia, ab, cam, ph) {
    const gl = this.gl, p = this.use(this.P.flame), u = p.u;
    let inside = false;
    gl.enable(gl.BLEND); gl.depthMask(false);
    if (mode === 2) gl.blendFunc(gl.ONE, gl.ONE); else gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.uniformMatrix4fv(u.uModel, false, model);
    gl.uniform3f(u.uScl, sx, sy, sz); gl.uniform1f(u.uInt, intensity); gl.uniform1f(u.uMode, mode || 0);
    const P = pal || FLAME_PAL.us;
    gl.uniform3fv(u.uC0, P.c0); gl.uniform3fv(u.uC1, P.c1); gl.uniform3fv(u.uC2, P.c2); gl.uniform3fv(u.uC3, P.c3);
    if (!mode) {
      const ex = cam.x / sx, ey = cam.y / sx, ez = cam.z / sx, Ln = sz / sx;
      inside = ez > 0 && ez < Ln && Math.hypot(ex, ey) < 1.25 + this.cam.near * 1.5 / sx;
      if (inside) mesh = this.nearQuad(model, sx, sy, sz);
      // pixels per nozzle radius: 6 steps from ~8 px up, 4 below ~3 px
      const rp = this.cam.px / Math.max(Math.hypot(ex, ey, ez - Ln / 2), 1);
      gl.uniform3f(u.uEye, ex, ey, ez); gl.uniform1f(u.uLn, Ln); gl.uniform1f(u.uIn, inside ? 1 : 0);
      gl.uniform1f(u.uSteps, clamp(Math.round(rp * 0.4 + 2.8), 4, 6));
      gl.uniform1f(u.uDia, dia || 3); gl.uniform1f(u.uAB, ab || 0); gl.uniform1f(u.uPh, ph || 0);
    }
    if (mode === 1 || inside) gl.disable(gl.CULL_FACE); else gl.enable(gl.CULL_FACE);
    this.bind(p, mesh); gl.drawArrays(gl.TRIANGLES, 0, mesh.n);
    gl.depthMask(true); gl.disable(gl.BLEND); gl.enable(gl.CULL_FACE);
  },
  // two triangles just past the near plane that cover the screen, in the unit frame of a flame drawn with model / scale
  nearQuad(model, sx, sy, sz) {
    const nq = this.nq || (this.nq = { mesh: this.mesh(new Float32Array(18), 'p3', true), d: new Float32Array(18) });
    const m = this.cam.ivp, d = nq.d, C = [-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1];
    for (let i = 0; i < 6; i++) {
      const x = C[i * 2], y = C[i * 2 + 1], z = -0.9, w = m[3] * x + m[7] * y + m[11] * z + m[15];
      const px = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w - model[12], py = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w - model[13],
        pz = (m[2] * x + m[6] * y + m[10] * z + m[14]) / w - model[14];
      d[i * 3] = (px * model[0] + py * model[1] + pz * model[2]) / sx;
      d[i * 3 + 1] = (px * model[4] + py * model[5] + pz * model[6]) / sy;
      d[i * 3 + 2] = (px * model[8] + py * model[9] + pz * model[10]) / sz;
    }
    this.update(nq.mesh, d, 18);
    return nq.mesh;
  },
};
const IDENT = M4.create();
const ONE3 = new Float32Array([1, 1, 1]);
const TINT4 = new Float32Array(4);
const NO_MARKS = new Float32Array(16);
// afterburner colours: Western engines burn orange-red, Soviet/Russian ones blue (with the white-hot core and a reddish nozzle ring)
const FLAME_PAL = {
  us: { c0: new Float32Array([1.0, 0.94, 0.78]), c1: new Float32Array([1.0, 0.52, 0.14]), c2: new Float32Array([0.85, 0.16, 0.04]), c3: new Float32Array([1.0, 0.42, 0.2]) },
  ru: { c0: new Float32Array([0.86, 0.93, 1.0]), c1: new Float32Array([0.32, 0.55, 1.0]), c2: new Float32Array([0.38, 0.24, 0.9]), c3: new Float32Array([1.0, 0.36, 0.42]) },
};
const IDENT_BONES = (() => { const a = new Float32Array(128); for (let i = 0; i < 8; i++) { a[i * 16] = a[i * 16 + 5] = a[i * 16 + 10] = a[i * 16 + 15] = 1; } return a; })();
