// Ovoz miksi: ikki ovoz shinasi + xona shovqini + sokin pad + noutbuk "ding"i -> mix.wav (-14 LUFS)
import { execFileSync, spawnSync } from 'node:child_process';
import { TOTAL, MARK } from './timeline.mjs';

const ff = (args) => execFileSync('ffmpeg', ['-nostdin', '-y', '-hide_banner', ...args], { stdio: ['ignore', 'pipe', 'pipe'] }).toString();
const ffErr = (args) => spawnSync('ffmpeg', ['-nostdin', '-hide_banner', ...args], { encoding: 'utf8', maxBuffer: 1 << 26 }).stderr; // tahlil filtrlari stderr ga yozadi
const meanVol = (f) => +/mean_volume: (-?[\d.]+)/.exec(ffErr(['-i', f, '-af', 'volumedetect', '-f', 'null', '-']))[1];
const T = TOTAL.toFixed(3);

// xona shovqini (jigarrang shovqin, past/baland filtr)
ff(['-f', 'lavfi', '-i', `anoisesrc=d=${T}:c=brown:a=0.5:seed=7`, '-af', 'highpass=f=55,lowpass=f=4500', '-ar', '44100', '-ac', '1', 'room.wav']);
// sokin pad: kam-minor akkord, sekin tremolo
const chord = [[110, 0.5], [164.81, 0.35], [220, 0.3], [261.63, 0.22], [329.63, 0.12]];
const expr = chord.map(([f, a], i) => `${a}*sin(2*PI*${f}*t)*(0.75+0.25*sin(2*PI*${0.07 + i * 0.03}*t+${i}))+${a * 0.5}*sin(2*PI*${(f * 1.004).toFixed(3)}*t)`).join('+');
ff(['-f', 'lavfi', '-i', `aevalsrc='${expr}':d=${T}:s=44100`, '-af', 'lowpass=f=900,afade=t=in:d=1.5', '-ac', '1', 'pad.wav']);
// "ding": noutbukdan keladigan ikki tonli qo'ng'iroqcha
ff(['-f', 'lavfi', '-i', `aevalsrc='0.5*sin(2*PI*1318.5*t)*exp(-7*t)+0.4*sin(2*PI*1975.5*max(t-0.09,0))*exp(-6*max(t-0.09,0))*gte(t,0.09)':d=0.9:s=44100`,
  '-af', `bandpass=f=1600:w=1400,adelay=${Math.round(MARK.docReady * 1000)}:all=1,apad=whole_dur=${T}`, '-ac', '1', 'ding.wav']);

// sathlarni o'lchab moslash
const gain = (f, target) => (target - meanVol(f)).toFixed(2);
const gRoom = gain('room.wav', -47), gPad = gain('pad.wav', -37), gDing = gain('ding.wav', -40);
const voice = 'highpass=f=85,lowpass=f=9500,acompressor=threshold=0.045:ratio=2.6:attack=8:release=140:makeup=2';
const room = 'aecho=0.8:0.5:41|79|133:0.26|0.18|0.1,lowpass=f=3400,volume=0.6';
ff(['-i', 'bus_D.wav', '-i', 'bus_C.wav', '-i', 'room.wav', '-i', 'pad.wav', '-i', 'ding.wav', '-filter_complex', [
  `[0:a]${voice},asplit[d0][d1];[d1]${room}[dr];[d0][dr]amix=inputs=2:weights=1 0.6:normalize=0,pan=stereo|c0=0.56*c0|c1=0.44*c0[D]`,
  `[1:a]${voice},asplit[c0][c1];[c1]${room}[cr];[c0][cr]amix=inputs=2:weights=1 0.6:normalize=0,pan=stereo|c0=0.44*c0|c1=0.56*c0[C]`,
  `[D][C]amix=inputs=2:normalize=0,asplit[V][SC]`,
  `[3:a]volume=${gPad}dB,pan=stereo|c0=c0|c1=c0[P0]`,
  `[P0][SC]sidechaincompress=threshold=0.015:ratio=5:attack=15:release=450[P]`,
  `[2:a]volume=${gRoom}dB,pan=stereo|c0=c0|c1=c0[R]`,
  `[4:a]volume=${gDing}dB,pan=stereo|c0=0.4*c0|c1=0.6*c0[G]`,
  `[V][P][R][G]amix=inputs=4:normalize=0:duration=longest,atrim=0:${T},afade=t=in:d=0.08,apad=whole_dur=${T}[out]`,
].join(';'), '-map', '[out]', '-ar', '44100', 'premix.wav']);

// sath: o'lchangan integral balandlikdan -14 LUFS ga chiziqli kuchaytirish, keyin -1.5 dBTP limiter
const lufs = (f) => { const e = ffErr(['-i', f, '-af', 'ebur128=peak=true', '-f', 'null', '-']); const sm = e.slice(e.lastIndexOf('Summary')); return { I: +/I:\s+(-?[\d.]+) LUFS/.exec(sm)[1], TP: +/Peak:\s+(-?[\d.]+) dBFS/.exec(sm)[1] }; };
const pre = lufs('premix.wav');
ff(['-i', 'premix.wav', '-af', `volume=${(-14 - pre.I).toFixed(2)}dB,alimiter=limit=0.82:attack=3:release=60:level=disabled`, '-ar', '44100', 'mix.wav']);
const fin = lufs('mix.wav');
console.log('premix', pre, '-> mix', fin);
