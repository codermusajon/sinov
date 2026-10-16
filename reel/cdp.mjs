// Bog'liqliksiz Chrome DevTools Protocol drayveri (headless Chromium).
import { spawn } from 'node:child_process'; import fs from 'node:fs'; import os from 'node:os'; import path from 'node:path';
const CHROME = [process.env.CHROME, 'C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/opt/pw-browsers/chromium', '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean).find(p => fs.existsSync(p));
// Windows/macOS: haqiqiy GPU. Linux bulut konteyneri (GPU yo'q): SwiftShader, faqat REEL_CPU=1 bilan ruxsat etiladi.
const ANGLE = process.platform === 'win32' ? 'd3d11' : process.platform === 'darwin' ? 'metal' : (process.env.REEL_CPU ? 'swiftshader' : 'gl');
export async function launch({ width = 1080, height = 1920, port = 9450 } = {}) {
  try { os.setPriority(os.constants.priority.PRIORITY_LOW); } catch {}
  const udd = fs.mkdtempSync(path.join(process.env.TMPDIR || os.tmpdir(), 'reel-'));
  const proc = spawn(CHROME, [`--remote-debugging-port=${port}`, `--user-data-dir=${udd}`, '--headless=new', '--no-first-run', '--disable-extensions',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--mute-audio', `--window-size=${width},${height}`,
    '--use-gl=angle', `--use-angle=${ANGLE}`, ...(ANGLE === 'swiftshader' ? ['--enable-unsafe-swiftshader', '--no-sandbox'] : ['--enable-gpu']), '--ignore-gpu-blocklist', 'about:blank'], { stdio: ['ignore', 'ignore', process.env.REEL_DEBUG ? 'inherit' : 'ignore'], env: process.platform === 'linux' ? { ...process.env, TMPDIR: '/tmp' } : process.env });
  let exited = null; proc.on('exit', (c, s) => { exited = c ?? s; }); proc.on('error', e => { exited = e.message; });
  let list, lastErr; for (let i = 0; i < 100 && !list?.some(t => t.type === "page"); i++) { try { list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json(); } catch (e) { lastErr = e; } await new Promise(r => setTimeout(r, 150)); }
  if (!list?.some(t => t.type === "page")) throw new Error("Chromium did not start: " + (lastErr?.cause?.code || lastErr) + ' exit=' + exited + ' bin=' + CHROME);
  const ws = new WebSocket(list.find(t => t.type === 'page').webSocketDebuggerUrl); await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej; });
  let id = 0; const pending = new Map(), logs = [];
  ws.onmessage = ev => { const m = JSON.parse(ev.data);
    if (m.id && pending.has(m.id)) { const { res, rej } = pending.get(m.id); pending.delete(m.id); m.error ? rej(new Error(m.error.message)) : res(m.result); }
    else if (m.method === 'Runtime.exceptionThrown') logs.push({ type: 'exception', text: m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text });
    else if (m.method === 'Runtime.consoleAPICalled') logs.push({ type: m.params.type, text: m.params.args.map(a => a.value ?? a.description).join(' ') }); };
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
  await send('Runtime.enable'); await send('Page.enable'); await send('Log.enable');
  await send('Emulation.setDeviceMetricsOverride', { width, height, deviceScaleFactor: 1, mobile: false });
  const api = { send, logs, proc,
    async eval(expr) { const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true }); if (r.exceptionDetails) throw new Error('eval failed: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text)); return r.result.value; },
    async goto(url) { await send('Page.navigate', { url }); await api.waitFor('document.readyState === "complete"', 15000); },
    async waitFor(expr, ms = 10000) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await api.eval(expr)) return true; } catch {} await new Promise(r => setTimeout(r, 100)); } throw new Error('timeout: ' + expr); },
    async gpu() { return api.eval(`(()=>{const g=document.createElement('canvas').getContext('webgl2'); if(!g) return 'none'; const e=g.getExtension('WEBGL_debug_renderer_info'); return e? g.getParameter(e.UNMASKED_RENDERER_WEBGL) : 'unknown';})()`); },
    async close() { try { ws.close(); } catch {} try { proc.kill(); } catch {} setTimeout(() => fs.rmSync(udd, { recursive: true, force: true }), 500); } };
  return api;
}
