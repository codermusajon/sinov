// timeline + vo/*.wav + vo/words.json  ->  bus_D.wav, bus_C.wav, film.json (og'iz konvertlari, subtitrlar)
import fs from 'node:fs';
import { CUES, TOTAL } from './timeline.mjs';

const SR = 44100;
const words = JSON.parse(fs.readFileSync('vo/words.json', 'utf8'));

function readWav(file) {
  const b = fs.readFileSync(file);
  let p = 12, fmt, data;
  while (p < b.length) {
    const id = b.toString('ascii', p, p + 4), size = b.readUInt32LE(p + 4);
    if (id === 'fmt ') fmt = { ch: b.readUInt16LE(p + 10), sr: b.readUInt32LE(p + 12), bits: b.readUInt16LE(p + 22) };
    if (id === 'data') data = b.subarray(p + 8, p + 8 + size);
    p += 8 + size + (size & 1);
  }
  if (fmt.bits !== 16 || fmt.ch !== 1 || fmt.sr !== SR) throw new Error(`${file}: kutilmagan format`);
  const out = new Float32Array(data.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = data.readInt16LE(i * 2) / 32768;
  return out;
}

function writeWav(file, f32) {
  const b = Buffer.alloc(44 + f32.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + f32.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(SR, 24);
  b.writeUInt32LE(SR * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34); b.write('data', 36); b.writeUInt32LE(f32.length * 2, 40);
  for (let i = 0; i < f32.length; i++) b.writeInt16LE(Math.max(-32767, Math.min(32767, Math.round(f32[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}

const N = Math.ceil(TOTAL * SR);
const bus = { D: new Float32Array(N), C: new Float32Array(N) };
const target = { D: -23, C: -21 };
const envs = [];

for (const c of CUES) {
  const src = readWav(`vo/${c.take}.wav`);
  const seg = src.subarray(Math.round(c.src0 * SR), Math.round(c.src1 * SR));
  let ss = 0, n = 0;
  for (const x of seg) if (Math.abs(x) > 0.02) { ss += x * x; n++; }
  const rmsDb = 10 * Math.log10(ss / Math.max(n, 1));
  const gain = Math.pow(10, (target[c.who] - rmsDb + (c.gain || 0)) / 20);
  const fi = Math.round(0.008 * SR), fo = Math.round(0.03 * SR), at = Math.round(c.at * SR);
  for (let i = 0; i < seg.length; i++) {
    const g = gain * Math.min(1, i / fi) * Math.min(1, (seg.length - 1 - i) / fo);
    if (at + i < N) bus[c.who][at + i] += seg[i] * g;
  }
  // og'iz/harakat konverti: soniyasiga 60 qiymat, 30 ms oyna
  const env = [], win = Math.round(0.015 * SR);
  for (let k = 0; k * (1 / 60) <= seg.length / SR; k++) {
    const ctr = Math.round((k / 60) * SR); let s2 = 0, m = 0;
    for (let j = Math.max(0, ctr - win); j < Math.min(seg.length, ctr + win); j++) { s2 += seg[j] * seg[j]; m++; }
    env.push(Math.sqrt(s2 / Math.max(m, 1)) * gain);
  }
  envs.push({ id: c.id, who: c.who, t0: c.at, t1: c.end, env });
}

for (const who of ['D', 'C']) {
  const all = envs.filter((e) => e.who === who).flatMap((e) => e.env).filter((v) => v > 1e-4).sort((a, b) => a - b);
  const p95 = all[Math.floor(all.length * 0.95)] || 1;
  for (const e of envs.filter((x) => x.who === who)) e.env = e.env.map((v) => +Math.min(1, Math.pow(v / p95, 0.8)).toFixed(3));
  writeWav(`bus_${who}.wav`, bus[who]);
}

// subtitrlar: so'zlarni bo'laklarga ajratish (<= 2 qator)
const subs = [];
for (const c of CUES) {
  const ws = (words[c.take] || [])
    .filter((w) => w.s >= c.src0 - 0.05 && w.e <= c.src1 + 0.05)
    .map((w) => ({ text: c.subMap && w.w in c.subMap ? c.subMap[w.w] : w.w, s: c.at + (w.s - c.src0), e: c.at + (w.e - c.src0) }))
    .filter((w) => w.text !== '')
    .map((w) => ({ ...w, text: w.text.replace(/([OoGg])'/g, '$1\u2018').replace(/'/g, '\u2019') }));
  let chunk = [];
  const flush = (last) => {
    if (!chunk.length) return;
    subs.push({ who: c.who, text: chunk.map((w) => w.text).join(' '), t0: chunk[0].s - 0.03, t1: chunk[chunk.length - 1].e + (last ? 0.42 : 0.32) });
    chunk = [];
  };
  ws.forEach((w, i) => {
    chunk.push(w);
    const next = ws[i + 1];
    if (!next) return flush(true);
    const text = chunk.map((x) => x.text).join(' ');
    const gap = next.s - w.e;
    const sentenceEnd = /[.!?]$/.test(w.text);
    if ((sentenceEnd && (text.length > 14 || gap > 0.35)) || gap > 0.5 || (text + ' ' + next.text).length > 48) flush(false);
  });
}
subs.sort((a, b) => a.t0 - b.t0);
subs[0].t0 = 0;
for (let i = 0; i < subs.length; i++) {
  const nx = subs[i + 1];
  if (subs[i].t1 - subs[i].t0 < 0.7) subs[i].t1 = subs[i].t0 + 0.7;
  if (nx && subs[i].t1 > nx.t0 - 0.03) subs[i].t1 = nx.t0 - 0.03;
  subs[i].t0 = +subs[i].t0.toFixed(3); subs[i].t1 = +subs[i].t1.toFixed(3);
}

fs.writeFileSync('film.json', JSON.stringify({ total: TOTAL, envs, subs }));
for (const s of subs) console.log(`${s.t0.toFixed(2)}-${s.t1.toFixed(2)} ${s.who}: ${s.text}`);
console.log('TOTAL', TOTAL.toFixed(2));
