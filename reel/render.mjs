// node render.mjs stills 0.2,2.0,...      -> stills/t<vaqt>.png
// node render.mjs full [from] [to]         -> frames/f0000.jpg ... (davom ettiriladigan, bo'laklab)
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path'; import os from 'node:os'; import { fileURLToPath } from 'node:url';
import { launch } from './cdp.mjs';
import { FPS, TOTAL } from './timeline.mjs';
try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch {}

const ROOT = path.dirname(fileURLToPath(import.meta.url));   // Windows'da ham to'g'ri (C:\...)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json' };
const server = http.createServer((req, res) => {
  const f = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (path.relative(ROOT, f).startsWith('..') || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream', 'cache-control': 'no-store' });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/film.html${process.env.REEL_Q ? '?' + process.env.REEL_Q : ''}`;

const [mode = 'stills', a1, a2] = process.argv.slice(2);
let b;
async function open() {
  b = await launch();
  console.log('renderer:', await b.gpu());
  await b.goto(url);
  try { await b.waitFor('window.__ready === true', 90000); } catch (e) { console.log(b.logs.slice(-20)); throw e; }
}
async function shot(t, file, fmt) {
  await b.eval(`window.setT(${t.toFixed(4)})`);
  const r = await b.send('Page.captureScreenshot', fmt === 'png' ? { format: 'png' } : { format: 'jpeg', quality: 92 });
  fs.writeFileSync(file, Buffer.from(r.data, 'base64'));
  return fs.statSync(file).size;
}
await open();
const t0 = Date.now();
if (mode === 'stills') {
  fs.mkdirSync(path.join(ROOT, 'stills'), { recursive: true });
  for (const t of (a1 || '0').split(',').map(Number)) { await shot(t, path.join(ROOT, 'stills', `t${t.toFixed(2).padStart(5, '0')}.png`), 'png'); }
} else {
  fs.mkdirSync(path.join(ROOT, 'frames'), { recursive: true });
  const N = Math.round(TOTAL * FPS), from = +(a1 ?? 0), to = Math.min(N, +(a2 ?? N));
  let done = 0;
  for (let f = from; f < to; f++) {
    const file = path.join(ROOT, 'frames', `f${String(f).padStart(4, '0')}.jpg`);
    if (fs.existsSync(file) && fs.statSync(file).size > 8000) continue;
    for (let attempt = 0; ; attempt++) {
      const size = await shot(f / FPS, file, 'jpg');
      if (size > 20000 || attempt >= 2) break;
      console.log('kichik kadr, qayta urinish', f); await b.close(); await open();
    }
    if (++done % 25 === 0) console.log(`${f + 1}/${N}  ${((Date.now() - t0) / done / 1000).toFixed(2)} s/kadr`);
  }
}
console.log('tayyor', ((Date.now() - t0) / 1000).toFixed(1), 's', b.logs.filter((l) => l.type === 'exception' || l.type === 'error').slice(0, 5));
await b.close(); server.close(); process.exit(0);
