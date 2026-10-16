// Butun quvur: subtitr/ovoz shinalari -> miks -> (ixtiyoriy) render -> mp4
// node make.mjs            (audio + mux, kadrlar allaqachon bo'lsa)
// node make.mjs render     (kadrlarni ham render qiladi; Windows'da GPU ishlatiladi)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import { FPS, TOTAL } from './timeline.mjs';
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit' });
run('node', ['build-film.mjs']);
run('node', ['mix.mjs']);
if (process.argv[2] === 'render') run('node', ['render.mjs', 'full']);
const N = Math.round(TOTAL * FPS);
const missing = Array.from({ length: N }, (_, i) => `frames/f${String(i).padStart(4, '0')}.jpg`).filter((f) => !fs.existsSync(f) || fs.statSync(f).size < 8000);
if (missing.length) { console.log(`${missing.length} ta kadr yetishmaydi — avval: node render.mjs full`); process.exit(1); }
const out = process.argv[3] || 'Claude-topshiriq.mp4';
run('ffmpeg', ['-nostdin', '-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', 'frames/f%04d.jpg', '-i', 'mix.wav', '-c:v', 'libx264', '-crf', '20', '-preset', 'medium',
  '-maxrate', '14M', '-bufsize', '28M', '-pix_fmt', 'yuv420p', '-profile:v', 'high', '-c:a', 'aac', '-b:a', '192k', '-shortest', '-movflags', '+faststart', out]);
console.log('tayyor:', out);
