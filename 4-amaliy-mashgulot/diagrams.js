// Hisobot uchun diagrammalarni SVG ko'rinishida chizib, Playwright orqali PNG ga aylantiradi.
// Ishga tushirish: node diagrams.js  ->  rasm-1-axborot-oqimlari.png, rasm-2-integratsiya.png
const path = require('path');
const { chromium } = require('playwright');

// o' / g' -> o‘ / g‘, qolgan ' -> ’ (tutuq belgisi)
const uz = (s) => s.replace(/([OoGg])'/g, '$1‘').replace(/'/g, '’');
const esc = (s) => uz(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

const C = {
  ink: '#1f2937', muted: '#475569', arrow: '#1d4ed8', label: '#1e3a8a',
  extFill: '#f1f5f9', extStroke: '#94a3b8',
  intFill: '#eff6ff', intStroke: '#3b82f6',
  coreFill: '#1e3a8a', coreStroke: '#1e3a8a',
};

function box(x, y, w, h, lines, kind = 'int', fs = 15) {
  const fill = kind === 'ext' ? C.extFill : kind === 'core' ? C.coreFill : C.intFill;
  const stroke = kind === 'ext' ? C.extStroke : kind === 'core' ? C.coreStroke : C.intStroke;
  const dash = kind === 'ext' ? ' stroke-dasharray="6 4"' : '';
  let out = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="10" fill="${fill}" stroke="${stroke}" stroke-width="2"${dash}/>`;
  const lh = fs + 4;
  const total = lines.length * lh;
  let ty = y + (h - total) / 2 + fs;
  for (const ln of lines) {
    const isSub = ln.startsWith('~');
    const text = isSub ? ln.slice(1) : ln;
    const color = kind === 'core' ? '#ffffff' : isSub ? C.muted : C.ink;
    const weight = isSub ? 400 : 700;
    const size = isSub ? fs - 2 : fs;
    out += `<text x="${x + w / 2}" y="${ty}" text-anchor="middle" font-size="${size}" font-weight="${weight}" fill="${color}">${esc(text)}</text>`;
    ty += lh;
  }
  return out;
}

function arrow(d, both = false) {
  return `<path d="${d}" fill="none" stroke="${C.arrow}" stroke-width="2.2" marker-end="url(#ah)"${both ? ' marker-start="url(#ahs)"' : ''}/>`;
}

function label(x, y, lines, anchor = 'start', fs = 13, rotate = 0) {
  return lines.map((t, i) => {
    const yy = y + i * (fs + 2);
    const tr = rotate ? ` transform="rotate(${rotate} ${x} ${yy})"` : '';
    return `<text x="${x}" y="${yy}" text-anchor="${anchor}" font-size="${fs}" fill="${C.label}"${tr}>${esc(t)}</text>`;
  }).join('');
}

const defs = `<defs>
  <marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" fill="${C.arrow}"/></marker>
  <marker id="ahs" viewBox="0 0 10 10" refX="1" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M10,0 L0,5 L10,10 z" fill="${C.arrow}"/></marker>
</defs>`;

function svg(w, h, body) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" font-family="Liberation Sans, Arial, sans-serif">${defs}<rect width="${w}" height="${h}" fill="#ffffff"/>${body}</svg>`;
}

// 1-rasm: UzAuto Motors AJ da axborot oqimlari sxemasi
function diagram1() {
  let b = '';
  // tashqi ishtirokchilar
  b += box(20, 20, 230, 70, ['General Motors', '~litsenziar'], 'ext');
  b += box(400, 20, 200, 70, ['Yetkazib beruvchilar', '~komponent va materiallar'], 'ext');
  b += box(750, 20, 230, 70, ['Mijozlar', '~jismoniy va yuridik shaxslar'], 'ext');
  // ichki bo'linmalar va tizimlar
  b += box(20, 140, 230, 80, ['Konstruktorlik-texnologik', 'tayyorlash', '~CAD / CAM / PDM']);
  b += box(750, 140, 230, 80, ['UzAutoSavdo', '~onlayn savdo platformasi', '~(CRM)']);
  b += box(20, 300, 230, 90, ['Sifat menejmenti', '~QMS']);
  b += box(760, 300, 160, 90, ['Rahbariyat', '~BI, hisobotlar']);
  b += box(400, 480, 200, 70, ['MES', '~sexlarni boshqarish']);
  b += box(750, 480, 230, 70, ['Tayyor mahsulot ombori', '~va logistika']);
  b += box(20, 600, 230, 90, ['Dilerlik va servis', 'markazlari', '~S&SM']);
  b += box(380, 600, 290, 90, ['Ishlab chiqarish sexlari', "~payvandlash · bo'yash · yig'ish", '~PLC / SCADA, robotlar, CNC']);
  // ERP yadrosi
  b += `<rect x="330" y="260" width="340" height="170" rx="12" fill="${C.coreFill}"/>`;
  b += `<text x="500" y="290" text-anchor="middle" font-size="17" font-weight="700" fill="#fff">SAP S/4HANA (ERP)</text>`;
  b += `<text x="500" y="312" text-anchor="middle" font-size="13" fill="#c7d2fe">${esc("yagona ma'lumotlar bazasi")}</text>`;
  const chips = ['Moliya', "Ta'minot", 'Rejalashtirish', 'Ombor', 'Savdo', 'Kadrlar'];
  chips.forEach((c, i) => {
    const cx = 345 + (i % 3) * 107, cy = 330 + Math.floor(i / 3) * 42;
    b += `<rect x="${cx}" y="${cy}" width="98" height="32" rx="6" fill="#ffffff" fill-opacity="0.14" stroke="#c7d2fe" stroke-width="1"/>`;
    b += `<text x="${cx + 49}" y="${cy + 21}" text-anchor="middle" font-size="13" fill="#fff">${esc(c)}</text>`;
  });
  // oqimlar
  b += arrow('M135,90 V140') + label(145, 120, ['chizmalar, 3D modellar']);
  b += arrow('M250,180 H400 V258') + label(258, 158, ['BOM, texnologik', 'marshrutlar']);
  b += arrow('M470,90 V258') + label(462, 116, ['hisob-faktura,', "jo'natma xabari"], 'end');
  b += arrow('M530,260 V92') + label(538, 116, ['buyurtmalar (PO)']);
  b += arrow('M865,92 V138', true) + label(873, 120, ["buyurtma, to'lov"]);
  b += arrow('M748,195 H620 V258', true) + label(685, 168, ['shartnomalar,', "to'lovlar, holat"], 'middle');
  b += arrow('M332,345 H252', true) + label(291, 322, ['sifat', "ma'lumotlari"], 'middle', 12);
  b += arrow('M670,345 H758') + label(715, 322, ['hisobotlar,', 'KPI'], 'middle');
  b += arrow('M470,430 V478') + label(462, 459, ['ishlab chiqarish rejasi'], 'end');
  b += arrow('M530,480 V432') + label(538, 459, ['bajarilish faktlari']);
  b += arrow('M470,550 V598') + label(462, 579, ['topshiriqlar'], 'end');
  b += arrow('M530,600 V552') + label(538, 579, ["datchik ma'lumotlari"]);
  b += arrow('M400,515 H200 V392') + label(345, 494, ['nazorat', 'natijalari'], 'middle');
  b += arrow('M135,300 V222') + label(143, 265, ["o'zgartirish so'rovlari"]);
  b += arrow('M70,600 V392') + label(78, 452, ['reklamatsiyalar,', 'kafolat holatlari']);
  b += arrow('M330,415 H290 V645 H252') + label(282, 572, ['VIN, kafolat', "ma'lumotlari"], 'end');
  b += arrow('M670,420 H840 V478') + label(832, 447, ["jo'natish", 'topshiriqlari'], 'end');
  b += arrow('M955,480 V222') + label(973, 350, ['avtomobil holati'], 'middle', 13, -90);
  b += arrow('M670,645 H865 V552') + label(680, 637, ['tayyor avtomobil (VIN)']);
  // shartli belgilar
  const ly = 725;
  b += `<path d="M20,${ly} H70" stroke="${C.arrow}" stroke-width="2.2" marker-end="url(#ah)"/>`;
  b += `<text x="80" y="${ly + 5}" font-size="13" fill="${C.ink}">axborot oqimi</text>`;
  b += `<rect x="200" y="${ly - 10}" width="34" height="20" rx="4" fill="${C.extFill}" stroke="${C.extStroke}" stroke-width="2" stroke-dasharray="5 3"/>`;
  b += `<text x="242" y="${ly + 5}" font-size="13" fill="${C.ink}">tashqi ishtirokchilar</text>`;
  b += `<rect x="400" y="${ly - 10}" width="34" height="20" rx="4" fill="${C.intFill}" stroke="${C.intStroke}" stroke-width="2"/>`;
  b += `<text x="442" y="${ly + 5}" font-size="13" fill="${C.ink}">${esc("korxona bo'linmalari va tizimlari")}</text>`;
  b += `<rect x="680" y="${ly - 10}" width="34" height="20" rx="4" fill="${C.coreFill}"/>`;
  b += `<text x="722" y="${ly + 5}" font-size="13" fill="${C.ink}">ERP – axborot yadrosi</text>`;
  return svg(1000, 745, b);
}

// 2-rasm: Teamcenter, SAP S/4HANA va Opcenter integratsiyasi
function diagram2() {
  const fs = 17;
  let b = '';
  b += box(150, 30, 270, 110, ['Siemens Teamcenter', '~PDM / PLM', "~mahsulot ma'lumotlari"], 'int', 19);
  b += box(660, 30, 270, 110, ['SAP S/4HANA', '~ERP', '~resurslar, moliya, savdo'], 'core', 19);
  b += box(405, 330, 270, 110, ['Siemens Opcenter', '~MES', '~ishlab chiqarish jarayoni'], 'int', 19);
  b += arrow('M420,68 H658') + label(540, 58, ['MBOM, marshrutlar'], 'middle', fs);
  b += arrow('M660,108 H422') + label(540, 132, ['material kodlari, tannarx'], 'middle', fs);
  b += arrow('M760,140 V365 H677') + label(752, 238, ['ishlab chiqarish', 'buyurtmalari'], 'end', fs);
  b += arrow('M675,410 H840 V142') + label(850, 238, ['bajarilish', 'faktlari,', 'material sarfi'], 'start', fs);
  b += arrow('M230,140 V410 H403') + label(222, 238, ["ish ko'rsatmalari,", '3D modellar'], 'end', fs);
  b += arrow('M405,365 H320 V142') + label(330, 238, ['sifat muammolari,', "o'zgartirish", "so'rovlari"], 'start', fs);
  return svg(1000, 470, b);
}

(async () => {
  const outDir = __dirname;
  const browser = await chromium.launch();
  const page = await browser.newPage({ deviceScaleFactor: 3 });
  const jobs = [
    ['rasm-1-axborot-oqimlari.png', diagram1()],
    ['rasm-2-integratsiya.png', diagram2()],
  ];
  for (const [name, s] of jobs) {
    await page.setContent(`<html><body style="margin:0">${s}</body></html>`);
    await page.locator('svg').screenshot({ path: path.join(outDir, name) });
    console.log('yozildi:', name);
  }
  await browser.close();
})();
