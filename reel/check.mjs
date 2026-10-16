// Harakat tekshiruvi: ?norender bilan har kadrda anchorlarni yig'ib, sakrash/titrashni qidiradi; yerga tegish va qo'l-klaviatura masofasi
import { launch } from './cdp.mjs'; import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
import { FPS, TOTAL, SHOTS } from './timeline.mjs';
const ROOT = path.resolve('.');
const server = http.createServer((q, r) => { const f = path.join(ROOT, q.url.split('?')[0]); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) { r.writeHead(404); return r.end(); } r.writeHead(200, { 'content-type': f.endsWith('html') ? 'text/html' : f.endsWith('json') ? 'application/json' : 'text/javascript' }); fs.createReadStream(f).pipe(r); });
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const b = await launch(); await b.goto(`http://127.0.0.1:${server.address().port}/film.html?norender`); await b.waitFor('window.__ready === true', 90000);
const data = await b.eval(`(()=>{ const out=[]; for(let f=0; f<${Math.round(TOTAL * FPS)}; f++){ window.setT(f/${FPS}); const a=window.anchors(); const bd=window.bounds(); out.push({a, bd}); } return out; })()`);
const cuts = new Set(SHOTS.map((s) => Math.round(s.t0 * FPS)));
const keys = Object.keys(data[0].a); let issues = 0;
for (const k of keys) {
  const v = data.map((d, i) => (i ? Math.hypot(...d.a[k].map((x, j) => x - data[i - 1].a[k][j])) : 0));
  const sorted = [...v].sort((a, b) => a - b), med = sorted[Math.floor(v.length / 2)] || 1e-6, p95 = sorted[Math.floor(v.length * 0.95)];
  v.forEach((s, i) => { if (i > 1 && s > Math.max(3 * p95, 0.012)) { issues++; console.log(`sakrash ${k} kadr ${i} (${(i / FPS).toFixed(2)}s) ${s.toFixed(4)}`); } });
}
let worst = { cl: 0, dev: 0 }, minHand = 9;
for (const d of data) { worst.cl = Math.max(worst.cl, Math.abs(d.bd.clMinY - d.bd.deskY)); worst.dev = Math.max(worst.dev, Math.abs(d.bd.devMinY)); minHand = Math.min(minHand, d.bd.handRminY - d.bd.laptopMaxY, d.bd.handLminY - d.bd.laptopMaxY); }
console.log('Claude-stol xatosi', worst.cl.toFixed(4), '| talaba-pol xatosi', worst.dev.toFixed(4), '| qo\'l - noutbuk min oraliq', minHand.toFixed(4), '| sakrashlar', issues, '| NaN', data.some((d) => Object.values(d.a).flat().some((x) => !isFinite(x))));
await b.close(); server.close(); process.exit(0);
