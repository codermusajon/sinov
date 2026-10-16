// 3D sahna: talaba + Claude, yotoqxona stoli. window.setT(t) — vaqtning sof funksiyasi.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { SHOTS, MARK, CUES, c0, c1, END_T, TOTAL } from '/timeline.mjs';

const Q = new URLSearchParams(location.search);
const W = 1080, H = 1920;
const film = await (await fetch('/film.json', { cache: 'no-store' })).json();

// ---------- yordamchilar ----------
const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
const sstep = (x) => { x = clamp(x); return x * x * x * (x * (x * 6 - 15) + 10); };
const lerp = (a, b, k) => a + (b - a) * k;
const hash = (i) => { const s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); };
function key(t, ks) {
  if (t <= ks[0][0]) return ks[0][1];
  for (let i = 1; i < ks.length; i++) if (t <= ks[i][0]) return lerp(ks[i - 1][1], ks[i][1], sstep((t - ks[i - 1][0]) / (ks[i][0] - ks[i - 1][0])));
  return ks[ks.length - 1][1];
}
const pulse = (t, a, b, rin = 0.3, rout = 0.4) => sstep((t - a) / rin) * (1 - sstep((t - b) / rout));
function env(who, t) {
  for (const e of film.envs) if (e.who === who && t >= e.t0 && t <= e.t1) {
    const k = (t - e.t0) * 60, i = Math.floor(k), f = k - i;
    return lerp(e.env[i] ?? 0, e.env[i + 1] ?? 0, f);
  }
  return 0;
}
function envAvg(who, t, w) { let s = 0; const n = 7; for (let i = 0; i < n; i++) s += env(who, t - w / 2 + (w * i) / (n - 1)); return s / n; }
function blink(t, seed) {
  let b = 0;
  for (let i = 0; i < 12; i++) { const bt = 0.9 + i * 2.6 + hash(seed + i) * 1.4; b = Math.max(b, 1 - Math.abs((t - bt) / 0.075)); }
  return clamp(b);
}

// ---------- renderer + post ----------
const renderer = new THREE.WebGLRenderer({ antialias: false, preserveDrawingBuffer: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(1); renderer.setSize(W, H); renderer.toneMapping = THREE.NoToneMapping;
document.body.prepend(renderer.domElement);
const depthTex = new THREE.DepthTexture(W, H); depthTex.type = THREE.UnsignedIntType;
const rtScene = new THREE.WebGLRenderTarget(W, H, { type: THREE.HalfFloatType, samples: 4, depthTexture: depthTex, colorSpace: THREE.LinearSRGBColorSpace });
const rt = (w, h) => new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, colorSpace: THREE.LinearSRGBColorSpace });
const rtDof = rt(W, H), rtB1 = rt(W >> 2, H >> 2), rtB1b = rt(W >> 2, H >> 2), rtB2 = rt(W >> 3, H >> 3), rtB2b = rt(W >> 3, H >> 3);
const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); quad.frustumCulled = false;
const qScene = new THREE.Scene(); qScene.add(quad); const qCam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
const pass = (mat, target) => { quad.material = mat; renderer.setRenderTarget(target); renderer.render(qScene, qCam); };
const VERT = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
const NEAR = 0.05, FAR = 40;
const camera = new THREE.PerspectiveCamera(30, W / H, NEAR, FAR);

const dofMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: rtScene.texture }, tDepth: { value: depthTex }, uRes: { value: new THREE.Vector2(W, H) },
    uNear: { value: NEAR }, uFar: { value: FAR }, uFocus: { value: 1 }, uAperture: { value: 10 }, uMaxCoc: { value: 22 } },
  vertexShader: VERT, depthTest: false, depthWrite: false,
  fragmentShader: `
uniform sampler2D tColor,tDepth; uniform vec2 uRes; uniform float uNear,uFar,uFocus,uAperture,uMaxCoc; varying vec2 vUv;
float lin(float d){ float z = d*2.-1.; return 2.*uNear*uFar/(uFar+uNear - z*(uFar-uNear)); }
float cocOf(float z){ return min(uMaxCoc, uAperture*abs(1./uFocus - 1./z)); }
void main(){
  float z0 = lin(texture2D(tDepth,vUv).x); float c0 = cocOf(z0);
  vec3 acc = texture2D(tColor,vUv).rgb * (1.0/max(c0*c0,1.0)); float ws = 1.0/max(c0*c0,1.0);
  const int N = 40;
  for(int i=0;i<N;i++){
    float fi = float(i)+0.5; float r = sqrt(fi/float(N)); float a = fi*2.39996323;
    vec2 off = vec2(cos(a),sin(a))*r*uMaxCoc; float dist = length(off); vec2 uv = vUv + off/uRes;
    float zs = lin(texture2D(tDepth,uv).x); float cs = cocOf(zs);
    float eff = (zs > z0) ? min(cs, c0) : cs;
    float w = smoothstep(dist-1.0, dist+1.0, eff) / max(eff*eff, 1.0);
    vec3 s = texture2D(tColor,uv).rgb; float lum = dot(s, vec3(0.3,0.5,0.2));
    w *= 1.0 + 1.6*clamp(lum-0.8, 0.0, 6.0);
    acc += s*w; ws += w;
  }
  gl_FragColor = vec4(acc/ws, 1.0);
}` });
const brightMat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: null } }, vertexShader: VERT, depthTest: false,
  fragmentShader: `uniform sampler2D tColor; varying vec2 vUv; void main(){ vec3 c = texture2D(tColor,vUv).rgb; float m = max(max(c.r,c.g),c.b);
  gl_FragColor = vec4(c * clamp((m - 1.5)/max(m,1e-3), 0.0, 1.0), 1.0); }` });
const blurMat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: null }, uDir: { value: new THREE.Vector2() } }, vertexShader: VERT, depthTest: false,
  fragmentShader: `uniform sampler2D tColor; uniform vec2 uDir; varying vec2 vUv;
  void main(){ float w[7]; w[0]=0.2270; w[1]=0.1946; w[2]=0.1216; w[3]=0.0540; w[4]=0.0162; w[5]=0.0054; w[6]=0.0016;
  vec3 c = texture2D(tColor,vUv).rgb*w[0]; for(int i=1;i<7;i++){ vec2 o = uDir*float(i)*1.6; c += (texture2D(tColor,vUv+o).rgb + texture2D(tColor,vUv-o).rgb)*w[i]; }
  gl_FragColor = vec4(c,1.0); }` });
const copyMat = new THREE.ShaderMaterial({ uniforms: { tColor: { value: null } }, vertexShader: VERT, depthTest: false,
  fragmentShader: `uniform sampler2D tColor; varying vec2 vUv; void main(){ gl_FragColor = vec4(texture2D(tColor,vUv).rgb,1.0); }` });
const compMat = new THREE.ShaderMaterial({
  uniforms: { tColor: { value: rtDof.texture }, tB1: { value: rtB1.texture }, tB2: { value: rtB2.texture }, uTime: { value: 0 }, uFade: { value: 1 }, uBloom: { value: 1 }, uBloomOnly: { value: 0 } },
  vertexShader: VERT, depthTest: false,
  fragmentShader: `uniform sampler2D tColor,tB1,tB2; uniform float uTime,uFade,uBloom,uBloomOnly; varying vec2 vUv;
  vec3 aces(vec3 x){ return clamp((x*(2.51*x+0.03))/(x*(2.43*x+0.59)+0.14),0.0,1.0); }
  float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)))*43758.5453); }
  void main(){
    vec2 d = vUv-0.5; float ca = 0.0018*dot(d,d)*4.0;
    vec3 c = vec3(texture2D(tColor,vUv+d*ca).r, texture2D(tColor,vUv).g, texture2D(tColor,vUv-d*ca).b);
    vec3 b = 0.36*texture2D(tB1,vUv).rgb + 0.55*texture2D(tB2,vUv).rgb;
    c = mix(c, vec3(0.0), uBloomOnly) + b*uBloom;
    c *= 1.05; c = aces(c);
    c = mix(c, c*vec3(1.03,1.0,0.96), 0.5);                 // biroz iliq grade
    c = pow(c, vec3(1.0/2.2));
    float v = smoothstep(0.95, 0.35, length(d*vec2(0.85,1.0))); c *= mix(0.72, 1.0, v);
    c += (h(vUv*vec2(1080.0,1920.0)+uTime*61.0)-0.5)*0.03;
    gl_FragColor = vec4(c*uFade, 1.0);
  }` });

// ---------- sahna ----------
const scene = new THREE.Scene();
scene.background = new THREE.Color('#0c1020');
const M = (color, o = {}) => new THREE.MeshStandardMaterial({ color, roughness: o.r ?? 0.75, metalness: o.m ?? 0, flatShading: o.flat ?? true, emissive: o.e ?? 0x000000, emissiveIntensity: o.ei ?? 1, transparent: !!o.op, opacity: o.op ?? 1 });
const box = (w, h, d, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); parent.add(m); return m; };
const rbox = (w, h, d, r, mat, x = 0, y = 0, z = 0, parent = scene) => { const m = new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, r), mat); m.position.set(x, y, z); parent.add(m); return m; };
const canvasTex = (w, h, draw) => { const c = document.createElement('canvas'); c.width = w; c.height = h; draw(c.getContext('2d'), w, h); const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4; return t; };

// xona
const floor = new THREE.Mesh(new THREE.PlaneGeometry(9, 9), M('#3b2a20', { r: 0.85 })); floor.rotation.x = -Math.PI / 2; scene.add(floor);
const backWall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), M('#2a3246')); backWall.position.set(0, 2, -1.3); scene.add(backWall);
const leftWall = new THREE.Mesh(new THREE.PlaneGeometry(9, 4), M('#232a3b')); leftWall.rotation.y = Math.PI / 2; leftWall.position.set(-2.1, 2, 0); scene.add(leftWall);
box(9, 0.08, 0.02, M('#1c2130'), 0, 0.04, -1.29);                                     // plintus

// deraza: Toshkentning tungi manzarasi
const cityTex = canvasTex(512, 420, (g, w, h) => {
  const grd = g.createLinearGradient(0, 0, 0, h); grd.addColorStop(0, '#0a1430'); grd.addColorStop(0.6, '#1d2a55'); grd.addColorStop(1, '#3a3157');
  g.fillStyle = grd; g.fillRect(0, 0, w, h);
  for (let i = 0; i < 26; i++) { g.fillStyle = `rgba(255,255,255,${0.3 + hash(i + 900) * 0.6})`; g.fillRect(hash(i + 50) * w, hash(i + 70) * h * 0.45, 2, 2); }
  g.fillStyle = '#f2e6c8'; g.beginPath(); g.arc(w * 0.78, h * 0.18, 18, 0, 7); g.fill();
  let x = 0, k = 0;
  while (x < w) { const bw = 30 + hash(k) * 60, bh = 60 + hash(k + 7) * 170; g.fillStyle = `rgb(${14 + hash(k + 3) * 14},${18 + hash(k + 4) * 14},${36 + hash(k + 5) * 20})`; g.fillRect(x, h - bh, bw, bh);
    for (let yy = h - bh + 8; yy < h - 6; yy += 13) for (let xx = x + 5; xx < x + bw - 6; xx += 10) if (hash(xx * 3.1 + yy * 7.7) > 0.55) { g.fillStyle = hash(xx + yy) > 0.5 ? '#ffd27a' : '#ffb35c'; g.fillRect(xx, yy, 5, 6); }
    x += bw + 2; k++; }
  // teleminora siluyeti
  g.fillStyle = '#121a33'; g.fillRect(w * 0.3, h * 0.12, 6, h * 0.88); g.fillRect(w * 0.3 - 10, h * 0.3, 26, 10); g.fillStyle = '#ff5050'; g.fillRect(w * 0.3 + 1, h * 0.11, 4, 4);
});
const win = new THREE.Mesh(new THREE.PlaneGeometry(1.15, 0.94), new THREE.MeshBasicMaterial({ map: cityTex, color: new THREE.Color(1.15, 1.15, 1.15) }));
win.position.set(0.55, 1.62, -1.285); scene.add(win);
const frameM = M('#d9d4cc');
box(1.25, 0.05, 0.05, frameM, 0.55, 2.12, -1.27); box(1.25, 0.05, 0.05, frameM, 0.55, 1.13, -1.27); box(0.05, 1.0, 0.05, frameM, -0.05, 1.62, -1.27); box(0.05, 1.0, 0.05, frameM, 1.15, 1.62, -1.27); box(0.03, 0.94, 0.04, frameM, 0.55, 1.62, -1.27);
box(1.35, 0.04, 0.16, frameM, 0.55, 1.1, -1.22);

// plakat
const posterTex = canvasTex(300, 420, (g, w, h) => {
  g.fillStyle = '#efe6d6'; g.fillRect(0, 0, w, h); g.fillStyle = '#d97757'; g.beginPath(); g.arc(w / 2, h * 0.42, 90, 0, 7); g.fill();
  g.fillStyle = '#2c3e66'; g.fillRect(0, h * 0.62, w, h * 0.38); g.fillStyle = '#efe6d6'; g.font = 'bold 40px Liberation Sans, sans-serif'; g.textAlign = 'center'; g.fillText('CODE', w / 2, h * 0.78); g.font = '24px Liberation Sans, sans-serif'; g.fillText('sleep · repeat', w / 2, h * 0.88);
});
const poster = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.59), M('#ffffff', { flat: false })); poster.material.map = posterTex; poster.position.set(-0.95, 1.65, -1.288); scene.add(poster);
// javon + kitoblar
box(0.8, 0.03, 0.2, M('#6b4c38'), -1.45, 1.3, -1.2);
for (let i = 0; i < 9; i++) { const hgt = 0.17 + hash(i + 30) * 0.08; box(0.045 + hash(i + 40) * 0.02, hgt, 0.15, M(['#b0413e', '#3e6fb0', '#e0b04a', '#4a8f6a', '#7a5ab0', '#d97757'][i % 6]), -1.78 + i * 0.075, 1.315 + hgt / 2, -1.2); }

// stol
const deskM = M('#8a6446', { r: 0.6 });
const desk = box(1.4, 0.04, 0.95, deskM, 0.5, 0.72, -0.025);
for (const [x, z] of [[-0.15, -0.45], [1.15, -0.45], [-0.15, 0.4], [1.15, 0.4]]) box(0.05, 0.7, 0.05, M('#5a4030'), x, 0.35, z);
const DESK_Y = 0.74;

// noutbuk
const laptop = new THREE.Group(); laptop.position.set(0.0, DESK_Y, 0); laptop.rotation.y = 0.12; scene.add(laptop);
const alu = M('#a7adb5', { r: 0.4, m: 0.3 });
box(0.24, 0.018, 0.34, alu, 0, 0.009, 0, laptop);
box(0.1, 0.002, 0.29, M('#22252b'), 0.035, 0.019, 0, laptop);                           // klaviatura (0.001 tepada, z-fighting yo'q)
const lid = new THREE.Group(); lid.position.set(0.12, 0.018, 0); lid.rotation.z = -0.22; laptop.add(lid);
box(0.012, 0.23, 0.34, alu, 0.006, 0.115, 0, lid);
const texCode = canvasTex(620, 400, (g, w, h) => {
  g.fillStyle = '#1b1e27'; g.fillRect(0, 0, w, h);
  const cols = ['#c792ea', '#82aaff', '#c3e88d', '#f78c6c', '#89ddff', '#a6accd'];
  for (let i = 0; i < 18; i++) { let x = 24 + (hash(i + 5) > 0.6 ? 30 : 0); for (let j = 0; j < 3; j++) { const ln = 30 + hash(i * 3 + j) * 110; g.fillStyle = cols[(i + j) % 6]; g.fillRect(x, 20 + i * 20, ln, 9); x += ln + 10; } }
});
const texDoc = canvasTex(620, 400, (g, w, h) => {
  g.fillStyle = '#dfe3ea'; g.fillRect(0, 0, w, h); g.fillStyle = '#ffffff'; g.fillRect(150, 10, 320, 390);
  g.fillStyle = '#20263a'; g.fillRect(200, 40, 220, 14); g.fillStyle = '#7d8597';
  for (let i = 0; i < 8; i++) g.fillRect(185, 75 + i * 14, 250 - (i % 3) * 30, 6);
  g.strokeStyle = '#3b5bdb'; g.lineWidth = 3; g.strokeRect(195, 200, 90, 40); g.strokeRect(335, 200, 90, 40); g.strokeRect(265, 275, 90, 40);
  g.beginPath(); g.moveTo(285, 220); g.lineTo(335, 220); g.moveTo(240, 240); g.lineTo(290, 275); g.moveTo(380, 240); g.lineTo(330, 275); g.stroke();
  g.fillStyle = '#7d8597'; for (let i = 0; i < 4; i++) g.fillRect(185, 335 + i * 14, 250 - (i % 2) * 40, 6);
  g.fillStyle = '#d97757'; g.fillRect(480, 360, 120, 26); g.fillStyle = '#fff'; g.font = 'bold 16px Liberation Sans'; g.fillText('26 / 26 bet', 492, 379);
});
const screenMat = new THREE.MeshBasicMaterial({ map: texCode, color: new THREE.Color(1, 1, 1), toneMapped: false });
const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.31, 0.2), screenMat); screen.rotation.y = -Math.PI / 2; screen.position.set(-0.0015, 0.12, 0); lid.add(screen);
const screenLight = new THREE.PointLight('#a9c8ff', 0.6, 2.2, 2); screenLight.position.set(-0.08, 0.14, 0); lid.add(screenLight);

// lampa
const lampM = M('#2b2f3a', { r: 0.5, m: 0.4 });
const lamp = new THREE.Group(); lamp.position.set(0.95, DESK_Y, -0.32); scene.add(lamp);
const lb = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.025, 16), lampM); lb.position.y = 0.0125; lamp.add(lb);
const la = box(0.02, 0.42, 0.02, lampM, 0.0, 0.23, 0, lamp); la.rotation.z = 0.25;
const shade = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.13, 16, 1, true), M('#2b2f3a', { r: 0.5 })); shade.position.set(-0.08, 0.44, 0.02); shade.rotation.z = 0.9; lamp.add(shade);
const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.028, 12, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(5, 3.6, 2.2) })); bulb.position.set(-0.1, 0.415, 0.02); lamp.add(bulb);
// krujka, qog'ozlar
const mug = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.038, 0.1, 14), M('#e9e2d6', { r: 0.5, flat: false })); mug.position.set(0.55, DESK_Y + 0.05, 0.27); scene.add(mug);
const handle = new THREE.Mesh(new THREE.TorusGeometry(0.026, 0.008, 6, 12), M('#e9e2d6')); handle.position.set(0.6, DESK_Y + 0.055, 0.27); scene.add(handle);
for (let i = 0; i < 5; i++) { const p = box(0.21, 0.004, 0.29, M(i % 2 ? '#f2efe8' : '#e8e3d8'), 0.5 + hash(i + 80) * 0.02, DESK_Y + 0.002 + i * 0.005, -0.25 + hash(i + 90) * 0.02); p.rotation.y = 0.15 + hash(i) * 0.1; }
// stul
const chairM = M('#1f2430', { r: 0.6 });
const chair = new THREE.Group(); scene.add(chair);
box(0.46, 0.06, 0.46, chairM, 0, 0.43, 0, chair);
box(0.44, 0.5, 0.05, chairM, 0, 0.75, -0.24, chair);
box(0.05, 0.36, 0.05, M('#555b66', { m: 0.5 }), 0, 0.22, 0, chair);
for (let i = 0; i < 5; i++) { const a = (i / 5) * Math.PI * 2; const leg = box(0.26, 0.03, 0.04, M('#555b66', { m: 0.5 }), Math.cos(a) * 0.13, 0.045, Math.sin(a) * 0.13, chair); leg.rotation.y = -a; const wh = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), chairM); wh.position.set(Math.cos(a) * 0.25, 0.03, Math.sin(a) * 0.25); chair.add(wh); }

// kontakt soyalar
const shadowTex = canvasTex(128, 128, (g, w, h) => { const r = g.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2); r.addColorStop(0, 'rgba(0,0,0,0.75)'); r.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = r; g.fillRect(0, 0, w, h); });
const blob = (x, y, z, sx, sz, op = 1) => { const m = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), new THREE.MeshBasicMaterial({ map: shadowTex, transparent: true, opacity: op, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 })); m.rotation.x = -Math.PI / 2; m.position.set(x, y, z); m.scale.set(sx, sz, 1); scene.add(m); return m; };
blob(-0.62, 0.003, 0.0, 0.9, 0.9, 0.9); blob(0.5, 0.003, -0.02, 1.7, 1.2, 0.7); blob(0.0, DESK_Y + 0.001, 0.0, 0.42, 0.5, 0.6); blob(0.95, DESK_Y + 0.001, -0.32, 0.25, 0.25, 0.6);

// ---------- talaba (dev) ----------
const skin = M('#c58c64', { r: 0.7 }), hairM = M('#1b1411', { r: 0.9 }), hoodie = M('#2f6f73', { r: 0.85 }), pants = M('#262a36'), shoeM = M('#e6e6e6');
const dev = new THREE.Group(); scene.add(dev);
const DEV_POS = new THREE.Vector3(-0.62, 0, 0.02), DEV_YAW = Math.PI / 2 - 0.3;
dev.position.copy(DEV_POS); dev.rotation.y = DEV_YAW; chair.position.copy(DEV_POS); chair.rotation.y = DEV_YAW;
const SEAT_Y = 0.46;
const pelvis = new THREE.Group(); pelvis.position.y = SEAT_Y; dev.add(pelvis);
rbox(0.34, 0.12, 0.26, 0.04, pants, 0, 0.06, 0, pelvis);
for (const s of [-1, 1]) {   // oyoqlar: son gorizontal, boldir pastga, oyoq kiyim polda
  rbox(0.14, 0.13, 0.46, 0.04, pants, s * 0.09, 0.07, 0.2, pelvis);
  rbox(0.12, 0.42, 0.12, 0.035, pants, s * 0.09, -0.15, 0.41, pelvis);
  rbox(0.12, 0.08, 0.23, 0.03, shoeM, s * 0.09, -SEAT_Y + 0.04, 0.46, pelvis);
}
const torso = new THREE.Group(); torso.position.y = 0.1; pelvis.add(torso);
rbox(0.38, 0.5, 0.24, 0.07, hoodie, 0, 0.25, 0, torso);
rbox(0.3, 0.07, 0.07, 0.03, M('#285e62'), 0, 0.5, -0.06, torso);                      // kapyushon
const neck = new THREE.Group(); neck.position.set(0, 0.52, 0.01); torso.add(neck);
box(0.08, 0.08, 0.08, skin, 0, 0.03, 0, neck);
const head = new THREE.Group(); head.position.y = 0.07; head.rotation.order = 'YXZ'; neck.add(head);
const HEAD_C = 0.12;
rbox(0.2, 0.25, 0.22, 0.07, skin, 0, HEAD_C, 0, head);
rbox(0.215, 0.11, 0.235, 0.05, hairM, 0, HEAD_C + 0.1, -0.008, head);
rbox(0.215, 0.18, 0.08, 0.04, hairM, 0, HEAD_C + 0.04, -0.085, head);
const fringe = rbox(0.17, 0.045, 0.05, 0.02, hairM, 0.015, HEAD_C + 0.105, 0.095, head); fringe.rotation.z = -0.15;
for (const s of [-1, 1]) box(0.025, 0.05, 0.04, skin, s * 0.105, HEAD_C + 0.0, 0, head);
box(0.03, 0.045, 0.03, skin, 0, HEAD_C - 0.005, 0.118, head);                            // burun
const eyes = [], brows = [];
for (const s of [-1, 1]) {
  const eg = new THREE.Group(); eg.position.set(s * 0.047, HEAD_C + 0.025, 0.104); head.add(eg);
  const white = new THREE.Mesh(new THREE.SphereGeometry(0.021, 12, 8), M('#f4f1ec', { flat: false, r: 0.4 })); white.scale.set(1, 1, 0.55); eg.add(white);
  const pupil = new THREE.Mesh(new THREE.SphereGeometry(0.012, 10, 8), M('#1a1210', { flat: false, r: 0.3 })); pupil.position.z = 0.009; pupil.scale.set(1, 1, 0.5); eg.add(pupil);
  const lidM = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.03, 0.02), skin); lidM.position.set(0, 0.035, 0.006); eg.add(lidM);
  eyes.push({ g: eg, pupil, lid: lidM, s });
  const br = box(0.052, 0.012, 0.012, hairM, s * 0.048, HEAD_C + 0.065, 0.11, head); brows.push({ m: br, s });
}
const mouthG = new THREE.Group(); mouthG.position.set(0, HEAD_C - 0.06, 0.106); head.add(mouthG);
const mouth = box(0.06, 0.01, 0.012, M('#4a1e1a'), 0, 0, 0, mouthG);
const lip = box(0.066, 0.008, 0.012, M('#a5604a'), 0, 0.007, 0.002, mouthG);

function makeHand(parent, s) {   // kaft + 4 barmoq + bosh barmoq (lokal +z = oldinga)
  const hand = new THREE.Group(); parent.add(hand);
  rbox(0.075, 0.026, 0.085, 0.012, skin, 0, 0, 0.045, hand);
  for (let i = 0; i < 4; i++) { const f = rbox(0.016, 0.018, 0.055, 0.007, skin, -0.027 + i * 0.018, -0.004, 0.11, hand); f.rotation.x = 0.25; }
  const th = rbox(0.018, 0.018, 0.045, 0.007, skin, s * 0.043, -0.004, 0.05, hand); th.rotation.y = s * -0.5;
  return hand;
}
const arms = {};
for (const [name, s] of [['R', -1], ['L', 1]]) {
  const sh = new THREE.Group(); sh.position.set(s * 0.205, 0.44, 0.0); sh.rotation.order = 'YXZ'; torso.add(sh);
  rbox(0.1, 0.29, 0.1, 0.04, hoodie, 0, -0.13, 0, sh);
  const el = new THREE.Group(); el.position.y = -0.27; el.rotation.order = 'YXZ'; sh.add(el);
  rbox(0.09, 0.27, 0.09, 0.035, hoodie, 0, -0.12, 0, el);
  box(0.065, 0.03, 0.065, skin, 0, -0.245, 0, el);
  const wr = new THREE.Group(); wr.position.y = -0.255; wr.rotation.order = 'YXZ'; el.add(wr);
  const hand = makeHand(wr, s); hand.rotation.x = -Math.PI / 2; // kaft wr ning -y yo'nalishi bo'ylab
  arms[name] = { sh, el, wr, hand, s };
}
const L1 = 0.27, L2 = 0.255;
const _v = new THREE.Vector3();
function solveArm(a, targetWorld) {   // 2 bo'g'inli IK: yelka (yaw+pitch) + tirsak
  a.sh.rotation.set(0, 0, 0); a.el.rotation.set(0, 0, 0); a.wr.rotation.set(0, 0, 0);
  torso.updateMatrixWorld(true);
  const v = torso.worldToLocal(_v.copy(targetWorld)).sub(a.sh.position);
  let d = v.length(); d = Math.min(d, L1 + L2 - 0.005);
  const yaw = Math.atan2(v.x, v.z), hz = Math.hypot(v.x, v.z), aa = Math.atan2(hz, -v.y);
  const al = Math.acos(clamp((L1 * L1 + d * d - L2 * L2) / (2 * L1 * d), -1, 1));
  const be = Math.PI - Math.acos(clamp((L1 * L1 + L2 * L2 - d * d) / (2 * L1 * L2), -1, 1));
  a.sh.rotation.y = yaw; a.sh.rotation.x = -(aa - al); a.el.rotation.x = -be;
  a.wr.rotation.x = -(Math.PI / 2 - (aa - al + be)) + 0.08;
  a.sh.rotation.z = a.s * 0.04;
}

// ---------- Claude personaji ----------
const CL = new THREE.Group(); scene.add(CL);
const CL_POS = new THREE.Vector3(0.06, DESK_Y, 0.36), CL_YAW = -Math.atan2(1, 0.75);
CL.position.copy(CL_POS); CL.rotation.y = CL_YAW;
const clBody = new THREE.Group(); CL.add(clBody);
const terra = M('#d97757', { r: 0.55, flat: false }), cream = M('#f3ebe1', { r: 0.6, flat: false });
const CL_FOOT = 0.03, CL_H = 0.27;
for (const s of [-1, 1]) rbox(0.06, CL_FOOT, 0.07, 0.012, M('#b85f42'), s * 0.05, CL_FOOT / 2, 0.005, CL);
const shell = rbox(0.21, CL_H, 0.17, 0.06, terra, 0, CL_H / 2, 0, clBody);
const face = rbox(0.165, 0.12, 0.02, 0.03, cream, 0, CL_H * 0.6, 0.083, clBody);
const clEyes = [];
for (const s of [-1, 1]) { const e = new THREE.Mesh(new THREE.CapsuleGeometry(0.0095, 0.02, 4, 10), M('#2a2420', { flat: false, r: 0.3 })); e.position.set(s * 0.036, CL_H * 0.6 + 0.008, 0.096); clBody.add(e); clEyes.push({ m: e, s }); }
const cheeks = []; for (const s of [-1, 1]) { const ch = new THREE.Mesh(new THREE.CircleGeometry(0.012, 12), new THREE.MeshBasicMaterial({ color: '#f0a48a', transparent: true, opacity: 0.0 })); ch.position.set(s * 0.06, CL_H * 0.6 - 0.025, 0.0945); clBody.add(ch); cheeks.push(ch); }
const nubs = []; for (const s of [-1, 1]) { const g = new THREE.Group(); g.position.set(s * 0.108, CL_H * 0.45, 0); clBody.add(g); rbox(0.035, 0.08, 0.05, 0.016, terra, s * 0.012, -0.03, 0, g); nubs.push({ g, s }); }
const ant = new THREE.Group(); ant.position.set(0, CL_H, 0); clBody.add(ant);
const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.004, 0.005, 0.05, 6), M('#b85f42')); stalk.position.y = 0.025; ant.add(stalk);
const tipMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.0, 0.6) });
const tip = new THREE.Mesh(new THREE.SphereGeometry(0.013, 12, 8), tipMat); tip.position.y = 0.055; ant.add(tip);
const clGlow = new THREE.PointLight('#ff9a6a', 0.06, 0.6, 2); clGlow.position.set(0, CL_H + 0.06, 0.05); clBody.add(clGlow);

// ---------- chiroqlar ----------
scene.add(new THREE.HemisphereLight('#4a5a86', '#1a120e', 0.55));
const lampLight = new THREE.SpotLight('#ffb46b', 7.5, 4, 1.0, 0.65, 2); lampLight.position.set(0.86, 1.15, -0.3); lampLight.target.position.set(0.15, DESK_Y, 0.15); scene.add(lampLight, lampLight.target);
const rim = new THREE.DirectionalLight('#7f98ff', 1.4); rim.position.set(0.4, 2.2, -2.5); scene.add(rim);
const fill = new THREE.DirectionalLight('#ffe2c8', 0.45); fill.position.set(1.5, 1.4, 3); scene.add(fill);
const faceKey = new THREE.SpotLight('#ffd2a8', 1.6, 3, 0.5, 0.8, 2); faceKey.position.set(0.5, 1.5, 1.2); scene.add(faceKey, faceKey.target);

// changlar (havo zarralari)
const dustScene = new THREE.Scene();
const dGeo = new THREE.BufferGeometry(); const dp = [];
for (let i = 0; i < 260; i++) dp.push(-1.2 + hash(i) * 2.6, 0.6 + hash(i + 300) * 1.6, -1.1 + hash(i + 600) * 2.0);
dGeo.setAttribute('position', new THREE.Float32BufferAttribute(dp, 3));
const dust = new THREE.Points(dGeo, new THREE.PointsMaterial({ color: new THREE.Color(1.6, 1.3, 1.0), size: 0.005, transparent: true, opacity: 0.35, depthWrite: false }));
dustScene.add(dust);

// ---------- anchorlar ----------
const ANCH = {};
const tmp = new THREE.Vector3();
function updateAnchors() {
  ANCH.Dhead = head.localToWorld(new THREE.Vector3(0, HEAD_C + 0.01, 0.02));
  ANCH.Chead = clBody.localToWorld(new THREE.Vector3(0, CL_H * 0.6, 0.05));
  ANCH.Pair = ANCH.Dhead.clone().add(ANCH.Chead).multiplyScalar(0.5);
  ANCH.screen = screen.localToWorld(new THREE.Vector3(0, 0, 0));
  ANCH.handR = arms.R.wr.localToWorld(new THREE.Vector3(0, 0, 0));
  ANCH.handL = arms.L.wr.localToWorld(new THREE.Vector3(0, 0, 0));
}
const A = (spec) => ANCH[spec[0]].clone().add(new THREE.Vector3(...spec[1]));

// ---------- poza ----------
const DEV_HAND = { R: new THREE.Vector3(-0.085, DESK_Y + 0.038, 0.09), L: new THREE.Vector3(-0.1, DESK_Y + 0.038, -0.07) };
function poseDev(t) {
  const breathe = Math.sin(t * 2 * Math.PI * 0.25) * 0.006;
  const lean = key(t, [[0, 0.2], [c0('d3') - 0.05, 0.2], [c0('d3') + 0.5, 0.04], [c0('d4') - 0.2, 0.06], [c0('d4') + 0.4, 0.24], [MARK.slump, 0.24], [MARK.slump + 0.9, 0.3]]);
  const shrug = pulse(t, c0('d2', 0.0), c0('d2', 1.2), 0.35, 0.45) * 0.035;
  pelvis.position.y = SEAT_Y;
  torso.rotation.x = lean + breathe;
  torso.position.y = 0.1;
  for (const a of Object.values(arms)) a.sh.position.y = 0.44 + shrug;
  // qo'llar: klaviaturada; d5 da o'ng qo'l sanaydi (ko'tariladi)
  const g = pulse(t, MARK.gesture0 - 0.3, MARK.gesture1 - 0.1, 0.7, 0.7);
  const tR = DEV_HAND.R.clone().add(new THREE.Vector3(-0.1 * g, 0.2 * g, 0.06 * g));
  const backOff = (0.2 - lean) * 0.35;  // orqaga suyanganda qo'llar ham biroz orqaga
  tR.x -= backOff; const tL = DEV_HAND.L.clone(); tL.x -= backOff;
  dev.updateMatrixWorld(true);
  solveArm(arms.R, tR); solveArm(arms.L, tL);
  arms.R.wr.rotation.z = g * 0.6; arms.R.wr.rotation.x += g * 0.9;
  // bosh: Claude ga qaraydi; "Tayyor" da ekranga; oxirida pastga
  const lookScreen = pulse(t, MARK.docReady + 0.15, c0('d3', 0.1), 0.35, 0.35);
  const down = sstep((t - MARK.slump) / 0.8);
  dev.updateMatrixWorld(true); updateAnchors();
  const neckW = neck.getWorldPosition(new THREE.Vector3()).add(new THREE.Vector3(0, 0.15, 0));
  const tgt = ANCH.Chead.clone().lerp(ANCH.screen, lookScreen);
  const dir = tgt.sub(neckW);
  const yawW = Math.atan2(dir.x, dir.z), pitch = Math.atan2(-dir.y, Math.hypot(dir.x, dir.z));
  head.rotation.y = clamp(yawW - DEV_YAW, -0.9, 0.9) + Math.sin(t * 0.7) * 0.02;
  head.rotation.x = pitch - lean * 0.9 + down * 0.38 + envAvg('D', t, 0.3) * 0.03;
  head.rotation.z = Math.sin(t * 0.5 + 1) * 0.02 - down * 0.04;
  // yuz ifodasi
  const surprised = pulse(t, c0('d3') - 0.05, c0('c3', 0.4), 0.2, 0.5);
  const nervous = pulse(t, -1, c0('c2'), 0.1, 0.5);
  const happy = pulse(t, c0('d4'), c1('d5', 0.3), 0.25, 0.6);
  const sad = sstep((t - MARK.slump) / 0.6);
  for (const b of brows) {
    b.m.position.y = HEAD_C + 0.065 + surprised * 0.014 + nervous * 0.004 + happy * 0.006 - sad * 0.002;
    b.m.rotation.z = b.s * (nervous * 0.22 + sad * 0.3 - happy * 0.05);
  }
  const bl = blink(t, 3);
  for (const e of eyes) {
    const open = clamp(1 - bl + surprised * 0.25 - sad * 0.35, 0.05, 1.25);
    e.lid.position.y = 0.012 + open * 0.023;
    e.g.scale.setScalar(1 + surprised * 0.12);
    e.pupil.position.y = -down * 0.006 - lookScreen * 0.003;
    e.pupil.position.x = -lookScreen * 0.004;
  }
  const m = clamp(envAvg('D', t, 0.08) * 1.15, 0, 1);
  mouth.scale.y = 0.8 + m * 2.6 + surprised * 0.6;
  mouthG.scale.x = 1 + happy * 0.22 - sad * 0.15;
  mouth.position.y = -m * 0.008; lip.position.y = 0.007 + happy * 0.002;
}

function poseClaude(t) {
  const talk = envAvg('C', t, 0.3);
  const breathe = Math.sin(t * 2 * Math.PI * 0.22 + 1) * 0.008;
  const proud = pulse(t, MARK.proudHop - 0.1, MARK.proudHop + 0.9, 0.25, 0.5);
  const tilt = pulse(t, c0('c4') - 0.1, c0('d5') + 0.6, 0.3, 0.6);
  const dead = sstep((t - MARK.deadpan) / 0.7);
  const sy = 1 + breathe + talk * 0.015 + proud * 0.05;
  clBody.scale.set(1 + talk * 0.005 - proud * 0.015, sy, 1);
  clBody.position.y = CL_FOOT;
  clBody.rotation.z = Math.sin(t * 0.6) * 0.015 + tilt * 0.17 + talk * 0.02;
  clBody.rotation.x = -talk * 0.03;
  // so'nggi zarba: kameraga sekin o'giriladi
  CL.rotation.y = CL_YAW + dead * 0.55 + pulse(t, c0('c1'), c0('d2', 1), 0.4, 0.6) * 0.06;
  const bl = blink(t, 11);
  for (const e of clEyes) {
    const open = clamp(1 - bl, 0.08, 1) * (1 - dead * 0.55) * (1 + proud * 0.1);
    e.m.scale.y = open;
    e.m.position.y = CL_H * 0.6 + 0.008 + talk * 0.004 - dead * 0.006;
  }
  for (const c of cheeks) c.material.opacity = proud * 0.8;
  for (const n of nubs) n.g.rotation.z = n.s * (0.15 + proud * 0.5 + talk * 0.05 + Math.sin(t * 0.8 + n.s) * 0.03);
  const ping = pulse(t, MARK.docReady - 0.05, MARK.docReady + 0.5, 0.08, 0.6);
  tipMat.color.setRGB(1.9 + ping * 1.0, 0.9 + ping * 0.45, 0.55 + ping * 0.25);
  clGlow.intensity = 0.06 + ping * 0.12;
  ant.rotation.z = Math.sin(t * 1.3) * 0.06 + talk * 0.04;
}

function poseWorld(t) {
  const doc = sstep((t - MARK.docReady) / 0.15);
  screenMat.map = doc > 0.5 ? texDoc : texCode;
  const bright = doc > 0.5 ? 1.25 : 1.0;
  screenMat.color.setScalar(bright + pulse(t, MARK.docReady, MARK.docReady + 0.6, 0.05, 0.5) * 0.6);
  screenLight.intensity = 0.55 + doc * 0.45;
  faceKey.target.position.copy(ANCH.Dhead || new THREE.Vector3(-0.5, 1.2, 0));
}

// ---------- kamera ----------
function placeCamera(t) {
  let shot = SHOTS[SHOTS.length - 1];
  for (const s of SHOTS) if (t >= s.t0 && t < s.t1) { shot = s; break; }
  const k = sstep((t - shot.t0) / Math.max(0.01, shot.t1 - shot.t0));
  const p = A(shot.from.p).lerp(A(shot.to.p), k), l = A(shot.from.l).lerp(A(shot.to.l), k);
  const fov = lerp(shot.from.fov, shot.to.fov, k);
  const dist = p.distanceTo(l);
  p.x += (Math.sin(t * 0.83) * 0.6 + Math.sin(t * 1.71 + 2) * 0.4) * 0.006 * dist;
  p.y += (Math.sin(t * 0.67 + 1) * 0.6 + Math.sin(t * 1.37) * 0.4) * 0.004 * dist;
  camera.position.copy(p); camera.up.set(0, 1, 0); camera.lookAt(l);
  camera.rotateZ(Math.sin(t * 0.53) * 0.006);
  camera.fov = fov;
  camera.setViewOffset(W, H, 0, (shot.shift || 0) * H, W, H);
  camera.updateProjectionMatrix();
  // fokus: fokus nuqtasigacha ko'rish yo'nalishi bo'ylab masofa
  const fdir = new THREE.Vector3(); camera.getWorldDirection(fdir);
  dofMat.uniforms.uFocus.value = Math.max(0.1, ANCH[shot.focus].clone().sub(camera.position).dot(fdir));
  dofMat.uniforms.uAperture.value = (shot.ap || 1200) / 100;
  return shot;
}

// ---------- subtitr ----------
const subEl = document.getElementById('sub');
function subtitle(t) {
  const s = Q.has('nosub') ? null : film.subs.find((x) => t >= x.t0 && t < x.t1);
  if (!s) { subEl.style.opacity = 0; return; }
  if (subEl.textContent !== s.text) subEl.textContent = s.text;
  subEl.className = s.who;
  subEl.style.opacity = Math.min(s.t0 === 0 ? 1 : clamp((t - s.t0) / 0.1), clamp((s.t1 - t) / 0.12));
}

// ---------- setT ----------
let lastShot = null;
window.setT = (t) => {
  poseDev(t); poseClaude(t);
  scene.updateMatrixWorld(true);
  updateAnchors(); poseWorld(t);
  scene.updateMatrixWorld(true); updateAnchors();
  lastShot = placeCamera(t);
  subtitle(t);
  if (Q.has('norender')) return true;
  renderer.setRenderTarget(rtScene); renderer.render(scene, camera);
  if (Q.has('nodof')) { copyMat.uniforms.tColor.value = rtScene.texture; pass(copyMat, rtDof); } else pass(dofMat, rtDof);
  renderer.autoClear = false; renderer.setRenderTarget(rtDof); renderer.render(dustScene, camera); renderer.autoClear = true;
  brightMat.uniforms.tColor.value = rtDof.texture; pass(brightMat, rtB1);
  blurMat.uniforms.tColor.value = rtB1.texture; blurMat.uniforms.uDir.value.set(1 / (W >> 2), 0); pass(blurMat, rtB1b);
  blurMat.uniforms.tColor.value = rtB1b.texture; blurMat.uniforms.uDir.value.set(0, 1 / (H >> 2)); pass(blurMat, rtB1);
  copyMat.uniforms.tColor.value = rtB1.texture; pass(copyMat, rtB2);
  for (let i = 0; i < 2; i++) {
    blurMat.uniforms.tColor.value = rtB2.texture; blurMat.uniforms.uDir.value.set(1 / (W >> 3), 0); pass(blurMat, rtB2b);
    blurMat.uniforms.tColor.value = rtB2b.texture; blurMat.uniforms.uDir.value.set(0, 1 / (H >> 3)); pass(blurMat, rtB2);
  }
  compMat.uniforms.uTime.value = t; compMat.uniforms.uBloom.value = Q.has('nobloom') ? 0 : 1; compMat.uniforms.uBloomOnly.value = Q.has('bloomonly') ? 1 : 0;
  compMat.uniforms.uFade.value = 1;
  pass(compMat, null);
  return true;
};

window.dbg = () => ({ cam: camera.position.toArray(), shot: lastShot?.id, focus: dofMat.uniforms.uFocus.value, anchors: Object.fromEntries(Object.entries(ANCH).map(([k, v]) => [k, v.toArray().map((x) => +x.toFixed(3))])) });
window.anchors = () => Object.fromEntries(Object.entries(ANCH).map(([k, v]) => [k, v.toArray()]));
window.bounds = () => {   // yerga tegish va kesishishni tekshirish uchun
  scene.updateMatrixWorld(true);
  const bb = (o) => new THREE.Box3().setFromObject(o);
  const c = bb(CL), handR = bb(arms.R.hand), handL = bb(arms.L.hand), kb = bb(laptop), dk = desk.geometry.boundingBox || (desk.geometry.computeBoundingBox(), desk.geometry.boundingBox);
  const hr = new THREE.Box3(); arms.R.hand.traverse((o) => o.isMesh && hr.expandByObject(o)); const hl = new THREE.Box3(); arms.L.hand.traverse((o) => o.isMesh && hl.expandByObject(o));
  return { kbTop: DESK_Y + 0.0205, hRmin: hr.min.y, hLmin: hl.min.y, clMinY: c.min.y, devMinY: bb(dev).min.y, handRminY: handR.min.y, handLminY: handL.min.y, laptopMaxY: kb.max.y, laptopMinX: kb.min.x, deskY: DESK_Y };
};
window.END_T = END_T; window.TOTAL = TOTAL;
await document.fonts.ready;
window.setT(Q.has('t') ? +Q.get('t') : 0);
window.__ready = true;
