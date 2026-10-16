// Yagona vaqt manbasi: replikalar, pauzalar, kadrlar. Node va brauzer ikkalasi ham import qiladi.
export const FPS = 30;

// [cueId, takeId, src0, src1, silenceBefore, opts]   who = birinchi harf: d = talaba (dev), c = Claude
// opts.subMap: subtitrda so'zni almashtirish (raqamlar, tinish belgilari); '' bo'lsa so'z ko'rsatilmaydi
const RAW = [
  ['d1', 'd1a', 0.29, 3.30, 0.00, { subMap: { 'Yigirma': '20', 'bet.': 'bet!' } }],
  ['c1', 'c1a', 0.19, 1.50, 0.30, {}],
  ['d2', 'd2a', 0.61, 3.58, 0.25, { subMap: { 'PDFni': 'PDF’ni' } }],
  ['c2', 'c2a', 0.15, 0.90, 0.45, {}],
  ['d3', 'd3a', 0.27, 1.98, 0.35, { subMap: { 'Shunchaki': 'Shunchaki...' } }],
  ['c3', 'c3a', 0.15, 2.85, 0.25, { subMap: { 'Yigirma': '26', 'olti': '', 'bet': 'bet.', 'sxemalari': 'Sxemalari' } }],
  ['d4', 'd4a', 0.19, 2.50, 0.30, {}],
  ['c4', 'c4a', 0.27, 0.95, 0.25, {}],
  ['d5', 'd5a', 0.13, 3.62, 0.25, {}],
  ['c5', 'c5a', 0.27, 3.40, 1.10, { subMap: { 'Ya\'ni': 'Ya’ni...' } }],
  ['d6', 'd6a', 0.85, 1.40, 0.90, { subMap: { 'Ha.': '...Ha.' } }],
];

let cursor = 0;
export const CUES = RAW.map(([id, take, src0, src1, gap, opts]) => {
  const at = cursor + gap;
  cursor = at + (src1 - src0);
  return { id, take, src0, src1, at, end: cursor, who: id[0] === 'd' ? 'D' : 'C', ...opts };
});
const byId = Object.fromEntries(CUES.map((c) => [c.id, c]));
export const c0 = (id, off = 0) => byId[id].at + off;
export const c1 = (id, off = 0) => byId[id].end + off;

export const END_T = c1('d6') + 0.55;
export const TOTAL = END_T + 0.1;

// Muhim lahzalar (animatsiya, ovoz va kamera bitta raqamga tayanadi)
export const MARK = {
  docReady: c0('c2', 0.1),      // noutbuk ekranida hujjat paydo bo'ladi + "ding"
  leanBack: c0('d3'),
  proudHop: c0('c3', 1.62),     // "Sxemalari" so'zi
  gesture0: c0('d5'),
  gesture1: c1('d5'),
  deadpan: c0('c5', 0.2),
  slump: c0('d6', 0.25),
};

// Kadrlar. p/l = [anchor, [dx,dy,dz]] (anchor nuqtasiga nisbatan), fov = vertikal burchak
// shift: kadrni yuqori/pastga surish (setViewOffset), focus: o'tkir bo'lishi kerak bo'lgan anchor, ap: diafragma
export const SHOTS = [
  { id: 'hook', t0: 0, t1: c0('c1'), focus: 'Dhead', ap: 1300, shift: -0.17,
    from: { p: ['Pair', [0.55, 0.06, 2.05]], l: ['Pair', [0.0, -0.06, 0]], fov: 30 },
    to:   { p: ['Pair', [0.50, 0.05, 1.86]], l: ['Pair', [0.0, -0.06, 0]], fov: 30 } },
  { id: 'claude1', t0: c0('c1'), t1: c0('d2'), focus: 'Chead', ap: 1700, shift: -0.15,
    from: { p: ['Chead', [-0.48, 0.07, 0.86]], l: ['Chead', [0.0, -0.05, 0]], fov: 26 },
    to:   { p: ['Chead', [-0.44, 0.06, 0.79]], l: ['Chead', [0.0, -0.05, 0]], fov: 26 } },
  { id: 'dev1', t0: c0('d2'), t1: c0('c2'), focus: 'Dhead', ap: 1500, shift: -0.15,
    from: { p: ['Dhead', [0.95, -0.02, 1.32]], l: ['Dhead', [0.05, -0.2, 0]], fov: 28 },
    to:   { p: ['Dhead', [0.87, -0.02, 1.21]], l: ['Dhead', [0.05, -0.2, 0]], fov: 28 } },
  { id: 'claudeCU', t0: c0('c2'), t1: c0('d3'), focus: 'Chead', ap: 2100, shift: -0.15,
    from: { p: ['Chead', [-0.22, 0.04, 0.78]], l: ['Chead', [0.0, -0.03, 0]], fov: 24 },
    to:   { p: ['Chead', [-0.20, 0.04, 0.71]], l: ['Chead', [0.0, -0.03, 0]], fov: 24 } },
  { id: 'devCU', t0: c0('d3'), t1: c0('c3'), focus: 'Dhead', ap: 2000, shift: -0.15,
    from: { p: ['Dhead', [0.78, 0.03, 0.88]], l: ['Dhead', [0.0, -0.06, 0]], fov: 25 },
    to:   { p: ['Dhead', [0.71, 0.03, 0.80]], l: ['Dhead', [0.0, -0.06, 0]], fov: 25 } },
  { id: 'wide', t0: c0('c3'), t1: c0('d4'), focus: 'Chead', ap: 900, shift: -0.08,
    from: { p: ['Pair', [0.75, 0.55, 3.6]], l: ['Pair', [0.15, -0.18, 0]], fov: 31 },
    to:   { p: ['Pair', [0.68, 0.50, 3.3]], l: ['Pair', [0.15, -0.18, 0]], fov: 31 } },
  { id: 'dev2', t0: c0('d4'), t1: c0('c4'), focus: 'Dhead', ap: 1600, shift: -0.15,
    from: { p: ['Dhead', [1.30, 0.10, 0.48]], l: ['Dhead', [0.0, -0.14, 0]], fov: 27 },
    to:   { p: ['Dhead', [1.18, 0.09, 0.44]], l: ['Dhead', [0.0, -0.14, 0]], fov: 27 } },
  { id: 'claude2', t0: c0('c4'), t1: c0('d5'), focus: 'Chead', ap: 1900, shift: -0.15,
    from: { p: ['Chead', [-0.62, 0.05, 0.62]], l: ['Chead', [0.0, -0.04, 0]], fov: 25 },
    to:   { p: ['Chead', [-0.57, 0.05, 0.57]], l: ['Chead', [0.0, -0.04, 0]], fov: 25 } },
  { id: 'two2', t0: c0('d5'), t1: c1('d5'), focus: 'Dhead', ap: 1200, shift: -0.12,
    from: { p: ['Pair', [0.05, 0.20, 2.80]], l: ['Pair', [-0.07, -0.12, 0]], fov: 30 },
    to:   { p: ['Pair', [0.05, 0.19, 2.62]], l: ['Pair', [-0.07, -0.12, 0]], fov: 30 } },
  { id: 'far', t0: c1('d5'), t1: c0('c5'), focus: 'Pair', ap: 700, shift: -0.06,
    from: { p: ['Pair', [0.95, 0.85, 5.3]], l: ['Pair', [0.2, -0.12, 0]], fov: 30 },
    to:   { p: ['Pair', [0.93, 0.84, 5.2]], l: ['Pair', [0.2, -0.12, 0]], fov: 30 } },
  { id: 'punch', t0: c0('c5'), t1: c1('c5'), focus: 'Chead', ap: 2200, shift: -0.15,
    from: { p: ['Chead', [-0.16, 0.03, 0.86]], l: ['Chead', [0.0, -0.03, 0]], fov: 24 },
    to:   { p: ['Chead', [-0.12, 0.03, 0.66]], l: ['Chead', [0.0, -0.03, 0]], fov: 24 } },
  { id: 'react', t0: c1('c5'), t1: TOTAL, focus: 'Dhead', ap: 2100, shift: -0.15,
    from: { p: ['Dhead', [0.86, 0.05, 0.76]], l: ['Dhead', [0.0, -0.06, 0]], fov: 24 },
    to:   { p: ['Dhead', [0.78, 0.04, 0.68]], l: ['Dhead', [0.0, -0.06, 0]], fov: 24 } },
];
