// 4-amaliy mashg'ulot hisobotini (.docx) yaratadi.
// Ishga tushirish: node diagrams.js && node hisobot.js
// Mundarijadagi sahifa raqamlari ikki bosqichda aniqlanadi: hujjat PDF ga aylantirilib,
// sarlavhalar qaysi sahifada turgani topiladi va hujjat qayta yoziladi.
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const {
  Document, Packer, Paragraph, TextRun, ImageRun, Table, TableRow, TableCell, Footer,
  AlignmentType, HeadingLevel, LevelFormat, WidthType, ShadingType, BorderStyle,
  PageNumber, PageOrientation, TabStopType, LeaderType, VerticalAlign, ExternalHyperlink,
} = require('docx');

const DIR = __dirname;
const OUT = path.join(DIR, '4-amaliy-mashgulot-hisobot.docx');
const SOFFICE = process.env.SOFFICE_PY; // skill dagi soffice.py (ixtiyoriy)

// o' / g' -> o‘ / g‘, qolgan ' -> ’ (tutuq belgisi)
const uz = (s) => s.replace(/([OoGg])'/g, '$1‘').replace(/'/g, '’');

const FONT = 'Times New Roman';
const W = 9355; // matn kengligi (A4, chap 30 mm, o'ng 15 mm), DXA

// ---------- yordamchi funksiyalar ----------
function runs(text, base = {}) {
  // **qalin** belgilashni qo'llab-quvvatlaydi
  return uz(text).split('**').map((part, i) => new TextRun({ text: part, bold: base.bold || i % 2 === 1, italics: base.italics, size: base.size }));
}

function P(text, o = {}) {
  return new Paragraph({
    alignment: o.align ?? AlignmentType.JUSTIFIED,
    indent: o.indent ?? (o.noIndent ? undefined : { firstLine: 709 }),
    spacing: { lineRule: 'auto', line: o.line ?? 360, before: o.before ?? 0, after: o.after ?? 0 },
    keepNext: o.keepNext,
    keepLines: o.keepLines,
    pageBreakBefore: o.pageBreakBefore,
    children: runs(text, { bold: o.bold, italics: o.italics, size: o.size }),
  });
}

const headings = []; // mundarija uchun
function H1(body, toc) {
  headings.push({ level: 1, body: uz(body), toc: uz(toc ?? body) });
  return new Paragraph({ heading: HeadingLevel.HEADING_1, pageBreakBefore: true, children: [new TextRun(uz(body))] });
}
function H2(body) {
  headings.push({ level: 2, body: uz(body), toc: uz(body) });
  return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(uz(body))] });
}

function UL(items) {
  return items.map((t) => new Paragraph({
    numbering: { reference: 'dash', level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { lineRule: 'auto', line: 360 },
    children: runs(t),
  }));
}
let olCount = 0;
const olRefs = [];
function OL(items) {
  const ref = `ol${++olCount}`;
  olRefs.push(ref);
  return items.map((t) => new Paragraph({
    numbering: { reference: ref, level: 0 },
    alignment: AlignmentType.JUSTIFIED,
    spacing: { lineRule: 'auto', line: 360 },
    children: runs(t),
  }));
}

const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' };
const borders = { top: border, bottom: border, left: border, right: border, insideHorizontal: border, insideVertical: border };

function cell(content, width, o = {}) {
  const text = typeof content === 'string' ? content : content.text;
  const span = typeof content === 'string' ? 1 : (content.span || 1);
  const fill = o.fill || (typeof content === 'object' ? content.fill : undefined);
  return new TableCell({
    width: { size: width, type: WidthType.DXA },
    columnSpan: span > 1 ? span : undefined,
    shading: fill ? { fill, type: ShadingType.CLEAR, color: 'auto' } : undefined,
    margins: { top: 40, bottom: 40, left: 90, right: 90 },
    verticalAlign: o.vAlign ?? VerticalAlign.TOP,
    children: text.split('\n').map((line) => new Paragraph({
      alignment: o.align ?? (typeof content === 'object' && content.align) ?? AlignmentType.LEFT,
      spacing: { lineRule: 'auto', line: 240 },
      children: runs(line, { size: 24, bold: o.bold || (typeof content === 'object' && content.bold) }),
    })),
  });
}

let tableNo = 0;
function TABLE(title, widths, header, rows, o = {}) {
  tableNo++;
  const sum = widths.reduce((a, b) => a + b, 0);
  if (sum !== W) throw new Error(`${tableNo}-jadval kengligi ${sum} != ${W}`);
  const center = o.centerCols || [];
  const trs = [
    new TableRow({
      tableHeader: true,
      children: header.map((h, i) => cell(h, widths[i], { fill: 'D9E2F3', bold: true, align: AlignmentType.CENTER, vAlign: VerticalAlign.CENTER })),
    }),
    ...rows.map((r) => {
      let col = 0;
      return new TableRow({
        cantSplit: true,
        children: r.map((c) => {
          const span = typeof c === 'string' ? 1 : (c.span || 1);
          const w = widths.slice(col, col + span).reduce((a, b) => a + b, 0);
          const al = center.includes(col) ? AlignmentType.CENTER : undefined;
          col += span;
          return cell(c, w, { align: al });
        }),
      });
    }),
  ];
  return [
    P(`${tableNo}-jadval`, { align: AlignmentType.RIGHT, italics: true, noIndent: true, before: 120, keepNext: true }),
    P(title, { align: AlignmentType.CENTER, bold: true, noIndent: true, after: 80, keepNext: true }),
    new Table({ width: { size: W, type: WidthType.DXA }, columnWidths: widths, borders, rows: trs }),
    P('', { noIndent: true, line: 240 }),
  ];
}

let figNo = 0;
function FIGURE(file, widthPx, caption) {
  figNo++;
  const buf = fs.readFileSync(path.join(DIR, file));
  // PNG o'lchamlarini o'qish (IHDR)
  const pw = buf.readUInt32BE(16), ph = buf.readUInt32BE(20);
  const h = Math.round(widthPx * ph / pw);
  return [
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { lineRule: 'auto', line: 240, before: 120 }, keepNext: true,
      children: [new ImageRun({ type: 'png', data: buf, transformation: { width: widthPx, height: h } })],
    }),
    P(`${figNo}-rasm. ${caption}`, { align: AlignmentType.CENTER, noIndent: true, before: 80, after: 120, bold: true }),
  ];
}

function QA(q, answerBlocks) {
  return [P(q, { bold: true, before: 160, keepNext: true }), ...answerBlocks];
}

function footer() {
  return {
    default: new Footer({
      children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ children: [PageNumber.CURRENT], size: 24 })] })],
    }),
  };
}

// ---------- titul varag'i ----------
function titlePage() {
  const c = (t, o = {}) => P(t, { align: AlignmentType.CENTER, noIndent: true, ...o });
  const r = (t, o = {}) => P(t, { align: AlignmentType.LEFT, indent: { left: 4800 }, ...o });
  return [
    c("O'ZBEKISTON RESPUBLIKASI", { bold: true }),
    c("OLIY TA'LIM, FAN VA INNOVATSIYALAR VAZIRLIGI", { bold: true }),
    c('_______________________________________________', { before: 360 }),
    c("(oliy ta'lim muassasasining nomi)", { size: 20, italics: true, line: 240 }),
    c('«________________________________» kafedrasi', { before: 240 }),
    c('«________________________________» fanidan', { before: 1400 }),
    c("4-AMALIY MASHG'ULOT", { bold: true, size: 32, before: 360 }),
    c("bo'yicha", { size: 28 }),
    c('HISOBOT', { bold: true, size: 40, before: 120 }),
    new Paragraph({
      alignment: AlignmentType.CENTER, spacing: { lineRule: 'auto', line: 360, before: 480 },
      indent: { left: 567, right: 567 },
      children: [new TextRun({ text: 'Mavzu: ', bold: true }), new TextRun({ text: uz('«Korxonada axborot oqimlarini boshqarish uchun CALS-texnologiyalaridan foydalanish»'), italics: true })],
    }),
    r('**Bajardi:** ________ guruh talabalari', { before: 1400 }),
    r('1. ______________________________'),
    r('2. ______________________________'),
    r('3. ______________________________'),
    r('**Tekshirdi:** ____________________', { before: 240 }),
  ];
}

// ---------- mundarija ----------
function tocPage(pages) {
  const out = [new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('MUNDARIJA')] })];
  headings.forEach((h, i) => {
    out.push(new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: W, leader: LeaderType.DOT }],
      indent: h.level === 2 ? { left: 567, hanging: 0 } : undefined,
      spacing: { lineRule: 'auto', line: 360 },
      children: [new TextRun({ text: h.toc }), new TextRun({ text: `\t${pages ? pages[i] : '00'}` })],
    }));
  });
  return out;
}

// ---------- asosiy matn ----------
function body() {
  headings.length = 0; tableNo = 0; figNo = 0; olCount = 0; olRefs.length = 0;
  const A = []; // 1-bo'lim (portret)
  const B = []; // 1-rasm (albom)
  const C = []; // davomi (portret)

  // KIRISH
  A.push(H1('KIRISH', 'Kirish'));
  A.push(P("Bugungi kunda yuqori texnologiyali korxonalarning raqobatbardoshligi nafaqat zamonaviy ishlab chiqarish uskunalariga, balki axborot oqimlarini qanchalik samarali boshqarishiga ham bog'liq. Mahsulotni loyihalash, ishlab chiqarish, sotish va unga servis xizmati ko'rsatish jarayonlarida juda katta hajmdagi ma'lumotlar hosil bo'ladi. Agar bu ma'lumotlar turli bo'limlarda alohida, qog'ozda yoki bir-biri bilan bog'lanmagan dasturlarda saqlansa, ma'lumotlarni takroran kiritish, xatolar va kechikishlar muqarrar bo'ladi."));
  A.push(P("**CALS-texnologiyalari** (ingl. Continuous Acquisition and Life cycle Support – mahsulotning hayotiy siklini uzluksiz axborot bilan qo'llab-quvvatlash) aynan shu muammoni hal qilishga qaratilgan: mahsulotning butun hayotiy sikli davomida barcha ishtirokchilar yagona axborot makonida, standartlashtirilgan formatlarda ishlaydi."));
  A.push(P("**Darsning maqsadi:** yuqori texnologiyali korxonada axborot va ishlab chiqarish oqimlarini boshqarishni ta'minlash uchun zarur bo'lgan CALS-texnologiyalariga kiritilgan dasturiy mahsulotlarni o'rganish."));
  A.push(P('Hisobotda quyidagi vazifalar bajarildi:', { keepNext: true }));
  A.push(...UL([
    "4.1-topshiriq bo'yicha O'zbekistondagi eng yirik yengil avtomobil ishlab chiqaruvchi – «UzAuto Motors» AJ misolida korxonada qo'llaniladigan axborot tizimlari tahlil qilindi, topshiriqdagi savollarga javob berildi va korxonada axborot oqimlarining sxemasi ishlab chiqildi;",
    "4.2-topshiriq bo'yicha CALS-texnologiyalari bilan bog'liq dasturiy mahsulotlar ko'rib chiqildi va mahsulot hayotiy siklining turli bosqichlarida ishlab chiqarishni boshqarishni yaxshilaydigan uchta vosita – Siemens Teamcenter, SAP S/4HANA va Siemens Opcenter Execution tavsiflandi;",
    'nazorat savollariga javoblar tayyorlandi.',
  ]));

  // 1-BOB
  A.push(H1('1. CALS-TEXNOLOGIYALARI VA ULARNING DASTURIY MAHSULOTLARI', '1. CALS-texnologiyalari va ularning dasturiy mahsulotlari'));
  A.push(H2("1.1. CALS-texnologiyalarining mohiyati va maqsadi"));
  A.push(P("CALS g'oyasi 1980-yillarning o'rtalarida AQSh Mudofaa vazirligida harbiy texnikaning texnik hujjatlari va logistik ta'minotini qog'ozsiz, elektron shaklga o'tkazish dasturi sifatida paydo bo'lgan. Keyinchalik u sanoatning boshqa tarmoqlariga tarqalib, mahsulot hayotiy siklini axborot bilan ta'minlash tamoyillari va texnologiyalari to'plamiga aylandi. Rus tilidagi adabiyotlarda u ko'pincha «ИПИ-технологии» (информационная поддержка изделий) deb ataladi [1, 2]."));
  A.push(P("CALS predmeti – axborot integratsiyasi texnologiyalari, ya'ni mahsulot, uni ishlab chiqarish muhiti va hayotiy sikl jarayonlari haqidagi ma'lumotlarni yaratish, almashish va ulardan foydalanish. CALSni joriy etishdan asosiy maqsad mahsulotning hayotiy sikli davomida xarajatlarni kamaytirish, uning sifati va raqobatbardoshligini oshirishdir."));
  A.push(P('CALSning asosiy tamoyillari:', { keepNext: true }));
  A.push(...UL([
    "**yagona axborot makoni** – ma'lumot bir marta kiritiladi va barcha ishtirokchilar tomonidan ko'p marta ishlatiladi;",
    "**standartlashtirish** – ma'lumotlar xalqaro standartlar (ISO 10303 STEP, XML, S1000D va boshqalar) asosida tavsiflanadi va almashiladi [3];",
    "**parallel loyihalash** – konstruktorlik, texnologik tayyorgarlik va ta'minot ishlari ketma-ket emas, bir vaqtda olib boriladi;",
    "**qog'ozsiz texnologiya** – hujjatlar elektron shaklda yaratiladi va elektron raqamli imzo bilan tasdiqlanadi;",
    "**butun hayotiy siklni qamrab olish** – marketingdan utilizatsiyagacha bo'lgan barcha bosqichlar axborot bilan ta'minlanadi.",
  ]));
  A.push(P("Mahsulot hayotiy siklining asosiy bosqichlari va ularda qo'llaniladigan axborot tizimlari 1-jadvalda keltirilgan.", { keepNext: true }));
  A.push(...TABLE("Mahsulot hayotiy sikli bosqichlari va axborot tizimlari", [2500, 4155, 2700],
    ['Bosqich', 'Asosiy vazifalar', 'Axborot tizimlari'],
    [
      ["Marketing va talabni o'rganish", "bozor tahlili, mahsulotga talablarni shakllantirish", 'CRM, BI'],
      ['Loyihalash', "3D modellar, chizmalar, muhandislik hisob-kitoblari", 'CAD, CAE, PDM'],
      ['Texnologik tayyorlash', "texnologik jarayonlar, dastgohlar uchun dasturlar", 'CAM, PDM'],
      ["Ta'minot", "materiallar va komplektlovchi buyumlarni xarid qilish", 'ERP, SCM'],
      ['Ishlab chiqarish', "rejalashtirish, sexlarni boshqarish, sifat nazorati", 'MRP/ERP, MES, SCADA, CNC'],
      ['Sotish', "buyurtmalar, shartnomalar, yetkazib berish", 'CRM, ERP, S&SM'],
      ["Ekspluatatsiya va servis", "texnik xizmat, ehtiyot qismlar, texnik qo'llanmalar", 'S&SM, IETM, PDM'],
      ['Utilizatsiya', "qayta ishlash, hisobdan chiqarish", 'PDM, ERP'],
    ]));

  A.push(H2("1.2. CALS dasturiy mahsulotlarining tasnifi"));
  A.push(P("CALS-texnologiyalarining dasturiy mahsulotlarini ikki guruhga bo'lish mumkin (2-jadval). Birinchi guruhga korxonalarda an'anaviy ravishda qo'llaniladigan, foydalanilishi CALSni amalga oshirishga bog'liq bo'lmagan mahsulotlar kiradi. Ikkinchi guruh vositalaridan foydalanish esa CALS va tegishli standartlar talablari bilan bog'liq.", { keepNext: true }));
  const g = (t) => ({ text: t, span: 3, fill: 'F2F2F2', bold: true, align: AlignmentType.CENTER });
  A.push(...TABLE("CALS-texnologiyalari dasturiy mahsulotlarining guruhlari", [700, 2300, 6355],
    ['№', 'Tizim', 'Vazifasi'],
    [
      [g("Birinchi guruh (foydalanilishi CALSga bog'liq emas)")],
      ['1', 'Ofis tizimlari', "matnli va jadvalli hujjatlarni tayyorlash (matn muharrirlari, elektron jadvallar)"],
      ['2', 'CAE', "muhandislik hisob-kitoblarini avtomatlashtirish"],
      ['3', 'CAD', "loyihalash va ishchi loyiha hujjatlarini tayyorlash"],
      ['4', 'CAM', "ishlab chiqarishni texnologik tayyorlashni avtomatlashtirish"],
      ['5', 'SCM', "ta'minot zanjirini boshqarish, tovar aylanmasini nazorat qilish"],
      ['6', 'MRP', "ishlab chiqarish resurslarini (materiallar, uskunalar, xodimlar, energiya) rejalashtirish"],
      ['7', 'ERP', "butun korxona resurslarini rejalashtirish, ma'lumotlarning yagona ombori"],
      ['8', 'MES', "ustaxona (sex) darajasida ishlab chiqarishni boshqarish"],
      ['9', 'ERI vositalari', "axborotni identifikatsiya va autentifikatsiya qilish – elektron raqamli imzo"],
      [g("Ikkinchi guruh (CALS standartlari bilan bog'liq)")],
      ['10', 'PDM', "mahsulot va uning konfiguratsiyasi haqidagi ma'lumotlarni boshqarish"],
      ['11', 'PM', 'loyihalarni boshqarish'],
      ['12', 'WF (Work Flow)', "texnik hujjatlarni yaratish va o'zgartirishda ish oqimini boshqarish"],
      ['13', 'CRM', "mijozlar bilan munosabatlarni boshqarish"],
      ['14', 'SCADA', "ishlab chiqarish jarayonlarini dispetcherlik nazorati"],
      ['15', 'S&SM', "sotish va xizmat ko'rsatishni boshqarish (ishlab chiqarishdan keyingi bosqichlar)"],
      ['16', 'CNC', "dastgohlar va sanoat robotlarini raqamli boshqarish"],
      ['17', 'CPC', "hamkor korxonalar ishini Internet orqali muvofiqlashtiruvchi qo'shma elektron biznes"],
    ], { centerCols: [0] }));
  A.push(P("CALS to'laqonli ishlashi uchun barcha dasturiy mahsulotlarning o'zaro yaqin ta'siri, ya'ni integratsiyasi talab qilinadi. Bu mahsulotni ishlab chiqish uchun zarur bo'lgan vaqt va boshqa ishlab chiqarish resurslarini sezilarli darajada tejash imkonini beradi."));

  // 2-BOB
  A.push(H1("2. 4.1-TOPSHIRIQ. UZAUTO MOTORS AJ MISOLIDA KORXONA AXBOROT TIZIMLARINING TAHLILI", "2. 4.1-topshiriq. «UzAuto Motors» AJ misolida korxona axborot tizimlarining tahlili"));
  A.push(H2("2.1. Korxona haqida umumiy ma'lumot"));
  A.push(P("Tahlil uchun O'zbekistondagi eng yirik yengil avtomobil ishlab chiqaruvchi – «UzAuto Motors» aksiyadorlik jamiyati tanlandi. Korxona haqidagi ma'lumotlar ochiq manbalardan – korxona va «O'zavtosanoat» AJ rasmiy xabarlari hamda ommaviy axborot vositalaridan olingan. Avtomobil zavodi CALS-texnologiyalarini o'rganish uchun qulay misol: bitta avtomobil bir necha ming detaldan iborat, ular ko'plab yetkazib beruvchilardan keladi, ishlab chiqarish esa konveyer usulida, yuqori darajada avtomatlashtirilgan holda olib boriladi. Korxona haqidagi asosiy ma'lumotlar 3-jadvalda keltirilgan.", { keepNext: true }));
  A.push(...TABLE("«UzAuto Motors» AJ haqida qisqacha ma'lumot", [2800, 6555],
    ["Ko'rsatkich", "Ma'lumot"],
    [
      ['Nomi', "«UzAuto Motors» AJ («O'zavtosanoat» AJ tarkibidagi korxona) [13]"],
      ['Tarixi', "1992-yilda «O'zavtosanoat» va Janubiy Koreyaning Daewoo kompaniyasi qo'shma korxonasi «UzDaewooAuto» sifatida tashkil etilgan; 1996-yil 19-iyuldan Asaka zavodida avtomobillar ishlab chiqarila boshlangan. 2008-yildan General Motors bilan qo'shma korxona «GM Uzbekistan», 2019-yildan to'liq davlat ulushidagi «UzAuto Motors» [15, 16]"],
      ['Ishlab chiqarish maydonchalari', "Asaka (Andijon viloyati) va Pitnak (Xorazm viloyati) zavodlari [13, 16]"],
      ['Ishlab chiqarish quvvati', "korxona ma'lumotiga ko'ra Asaka zavodi – yiliga 300 mingdan ortiq, Pitnak zavodi – 90 ming avtomobil [13]; 2023-yil avgustida ikki zavodda bir oyda 41 100 dan ortiq avtomobil ishlab chiqarilgan [14]"],
      ['Mahsulotlar', "Chevrolet markali yengil avtomobillar (Cobalt, Damas, Onix, Tracker va boshqalar)"],
      ['Sotuv kanallari', "«UzAutoSavdo» onlayn platformasi (mobil ilova va savdo.uzavtosanoat.uz sayti), dilerlik markazlari [10, 11]"],
      ['ERP tizimi', "SAP S/4HANA – 2021-yildan bosqichma-bosqich joriy etilgan [5–7]"],
    ]));
  A.push(P("Avtomobil zavodlari uchun odatiy bo'lgan asosiy bo'linmalar: ishlab chiqarish sexlari (kuzovni payvandlash, bo'yash, yakuniy yig'ish), konstruktorlik-texnologik xizmat, sifat nazorati xizmati, ta'minot va logistika, omborlar, savdo va marketing, moliya va buxgalteriya, kadrlar bo'limi hamda axborot texnologiyalari xizmati."));

  A.push(H2("2.2. Korxonada qo'llaniladigan axborot tizimlari"));
  A.push(P("Ochiq manbalar va avtomobilsozlik korxonalari uchun odatiy amaliyot asosida korxonada qo'llaniladigan axborot tizimlari 4-jadvalda umumlashtirilgan.", { keepNext: true }));
  A.push(...TABLE("«UzAuto Motors» AJda qo'llaniladigan axborot tizimlari", [450, 1900, 2300, 3305, 1400],
    ['№', 'Tizim (sinfi)', 'Maqsadi', 'Bajaradigan asosiy vazifalari', 'Manba'],
    [
      ['1', 'SAP S/4HANA (ERP)', "korxonaning barcha resurslarini yagona tizimda rejalashtirish va hisobga olish", "moliya va buxgalteriya hisobi; ta'minot va xaridlar; ombor hisobi; ishlab chiqarishni rejalashtirish (MRP); savdo; kadrlar; hisobotlar", 'ochiq manbalar [5–8]'],
      ['2', 'UzAutoSavdo (CRM, S&SM vazifalari)', "avtomobillarni mijozlarga masofadan sotish", "model va komplektatsiyani tanlash, shartnoma tuzish, to'lovni qabul qilish, buyurtma holati haqida xabar berish, shartnomani QR-kod orqali tekshirish", 'ochiq manbalar [10–12]'],
      ['3', 'CAD / CAM / PDM', "konstruktorlik-texnologik hujjatlarni yuritish va mahalliylashtirilgan detallarni loyihalash", "litsenziar hujjatlarini qabul qilish, mahsulot tarkibini (BOM) yuritish, o'zgartirishlarni boshqarish, texnologik marshrutlar", 'taxminiy*'],
      ['4', 'MES', "sex darajasida ishlab chiqarishni boshqarish", "smenali topshiriqlar, avtomobillarni VIN bo'yicha kuzatish, bajarilish faktlarini ERPga uzatish", 'taxminiy*'],
      ['5', 'SCADA, PLC, robotlar va CNC', "texnologik jarayonlarni avtomatik boshqarish va dispetcherlik nazorati", "payvandlash robotlari va bo'yash liniyalarini boshqarish, harorat, bosim va boshqa parametrlarni kuzatish", 'taxminiy*'],
      ['6', 'Sifat menejmenti tizimi (QMS)', "sifatni nazorat qilish va nuqsonlarni hisobga olish", "nazorat natijalari, nuqsonlar statistikasi, reklamatsiyalar tahlili", 'taxminiy*'],
      ['7', "Elektron hujjat aylanishi va ERI", "ichki va tashqi hujjatlarni elektron shaklda yuritish", "buyruq va xatlar, elektron hisob-fakturalar, shartnomalarni elektron raqamli imzo bilan imzolash", 'taxminiy*'],
      ['8', "Ofis dasturlari, korporativ pochta", "hujjat va hisobotlar tayyorlash, kommunikatsiya", "matnli hujjatlar, elektron jadvallar, taqdimotlar, yozishmalar", 'taxminiy*'],
    ], { centerCols: [0] }));
  A.push(P("* Ochiq manbalarda tasdiqlanmagan; avtomobilsozlik korxonalari uchun odatiy amaliyot asosida keltirilgan.", { size: 24, italics: true, noIndent: true, line: 240, after: 120 }));

  A.push(H2("2.3. Topshiriq savollariga javoblar"));
  A.push(P("**1. Korxonada qanday axborot tizimlaridan foydalaniladi?**", { keepNext: true }));
  A.push(P("Korxona axborot tizimlarini uch darajaga ajratish mumkin:", { keepNext: true }));
  A.push(...UL([
    "**boshqaruv darajasi** – SAP S/4HANA ERP tizimi, elektron hujjat aylanishi, rahbariyat uchun hisobot va tahlil (BI) vositalari;",
    "**ishlab chiqarishni tayyorlash va boshqarish darajasi** – konstruktorlik-texnologik tizimlar (CAD/CAM/PDM), MES, sifat menejmenti tizimi;",
    "**texnologik jarayonlar darajasi** – PLC kontrollerlar, SCADA, payvandlash va bo'yash robotlari, CNC dastgohlar.",
  ]));
  A.push(P("Tashqi muhit bilan aloqa uchun «UzAutoSavdo» onlayn savdo platformasi hamda yetkazib beruvchilar bilan elektron hujjat almashinuvi qo'llaniladi."));

  A.push(P("**2. Tizimlarning har biri qanday maqsadda foydalaniladi?**", { before: 120, keepNext: true }));
  A.push(P("Har bir tizimning maqsadi 4-jadvalda keltirilgan. Ular orasida markaziy o'rinni ERP tizimi egallaydi: u korxonaning barcha bo'linmalari uchun yagona ma'lumotlar bazasi vazifasini bajaradi. Ochiq manbalarga ko'ra, SAP S/4HANA joriy etilishi natijasida ombor, savdo, moliya, ishlab chiqarish, tahlil va marketing bo'limlari yagona muhitga birlashtirilgan va qog'ozdagi jarayonlar raqamlashtirilgan [7]. «UzAutoSavdo» platformasi esa mijoz bilan barcha munosabatlarni – avtomobil tanlashdan to shartnoma va to'lovgacha – masofadan amalga oshirish uchun xizmat qiladi [11]."));

  A.push(P("**3. Axborot tizimlari qanday vazifalarni bajaradi?**", { before: 120, keepNext: true }));
  A.push(P("Umumiy holda axborot tizimlari ma'lumotlarni yig'ish, saqlash, qayta ishlash, uzatish va ular asosida boshqaruv qarorlarini qabul qilishni qo'llab-quvvatlash vazifalarini bajaradi. Avtomobil zavodida bu vazifalar quyidagi ketma-ketlikda bajariladi:"));
  A.push(...OL([
    "mijoz buyurtmasi «UzAutoSavdo» orqali qabul qilinadi va ERPga uzatiladi;",
    "ERP (MRP moduli) buyurtmalar va mahsulot tarkibi (BOM) asosida materiallar va komponentlarga ehtiyojni hisoblaydi, yetkazib beruvchilarga buyurtmalar shakllantiradi;",
    "ERP ishlab chiqarish rejasini tuzadi, MES uni sexlar va ish o'rinlari uchun smenali topshiriqlarga aylantiradi;",
    "sexlardagi PLC/SCADA tizimlari va robotlar texnologik jarayonni boshqaradi va uning parametrlarini qayd etadi;",
    "MES ishlab chiqarilgan avtomobillar (VIN), material sarfi va sifat nazorati natijalarini ERPga qaytaradi;",
    "tayyor avtomobil omborga kirim qilinadi, mijozga uning holati haqida xabar beriladi, moliyaviy hisob-kitoblar ERPda avtomatik aks etadi;",
    "rahbariyat ERP ma'lumotlari asosida hisobotlar va asosiy ko'rsatkichlarni (KPI) oladi.",
  ]));

  A.push(P("**4. Tizim imkoniyatlaridan to'liq quvvat bilan foydalanilmoqdami?**", { before: 120, keepNext: true }));
  A.push(P("Ochiq manbalar asosida xulosa qilish mumkinki, tizim imkoniyatlaridan **qisman** foydalanilmoqda."));
  A.push(P("Ijobiy tomonlari: SAP S/4HANA asosida asosiy biznes-jarayonlar yagona muhitga birlashtirilgan [7], korxona 2025-yil aprelida SAP nominatsiyasida g'olib bo'lgan [8]. Sotuv to'liq onlayn shaklga o'tkazilgan: 2025-yil oktabrida «UzAutoSavdo» platformasi orqali 100 ming dona Chevrolet Cobalt taxminan 2,5 soatda sotilgan [12]."));
  A.push(P("Shu bilan birga, quyidagi holatlar tizimlar integratsiyasida hali zaxiralar borligini ko'rsatadi:"));
  A.push(...UL([
    "ERPga o'tish davrida, 2021-yil fevral–mart oylarida yangi shartnomalar tuzish vaqtincha to'xtatilgan [5, 6]; 2023-yil yanvarida ham SAP hisob dasturi va inventarizatsiya ishlari sababli shartnoma tuzish, avtomobil topshirish va to'lovlar bir necha kunga to'xtatilgan [9];",
    "2023-yilda navbatlar va tizimdagi nosozliklar sababli korxona shartnomalarni faqat onlayn tuzishga o'tgan [10] – bu yuqori yuklamalarni rejalashtirish muhimligini ko'rsatadi;",
    "mahsulot konstruksiyasi asosan litsenziar tomonidan ishlab chiqilgani sababli konstruktorlik ma'lumotlarining (chizmalar, BOM, o'zgartirishlar) korxona ichidagi ERP va MES bilan avtomatik sinxronlashuvi zaif nuqta bo'lishi mumkin;",
    "sotuvdan keyingi bosqich – kafolat, ta'mir va ehtiyot qismlar bo'yicha interaktiv elektron texnik qo'llanmalar (IETM) va servis ma'lumotlarining yagona tizimi haqida ochiq ma'lumot yo'q.",
  ]));

  A.push(P("**5. Korxonaning axborot tuzilmasini qandaydir tarzda yaxshilash yoki soddalashtirish mumkinmi?**", { before: 120, keepNext: true }));
  A.push(P("Ha, mumkin. Quyidagi takliflar ishlab chiqildi:", { keepNext: true }));
  A.push(...OL([
    "**Yagona PDM/PLM tizimini joriy etish** (masalan, Siemens Teamcenter) va uni SAP S/4HANA bilan integratsiya qilish: mahsulot tarkibi (BOM) va texnologik marshrutlar ERPga avtomatik uzatiladi, ularni qo'lda kiritish bartaraf etiladi.",
    "**MES qatlamini kuchaytirish** va uni ISA-95 standarti asosida ERP bilan bog'lash [4]: har bir avtomobilni VIN bo'yicha real vaqtda kuzatish, nuqsonlarni darhol aniqlash.",
    "**Yetkazib beruvchilar portali (SCM/CPC):** mahalliy komponent ishlab chiqaruvchilar buyurtmalar, talab prognozi va to'lovlar haqidagi ma'lumotlarni onlayn ko'radi.",
    "**Servis bosqichini axborot bilan ta'minlash (S&SM, IETM):** kafolat da'volari va ehtiyot qismlar buyurtmalarini yagona tizimda yuritish, reklamatsiya ma'lumotlarini sifat va konstruktorlik bo'limlariga avtomatik qaytarish.",
    "**Yagona me'yoriy-ma'lumotnoma axboroti:** «UzAutoSavdo», ERP va servisdagi mijoz va avtomobil ma'lumotlarini yagona kalitlar (JShShIR, VIN) bo'yicha bog'lash.",
    "**Yuklamani boshqarish:** ommaviy sotuv kampaniyalaridan oldin platformani yuklama sinovidan o'tkazish va hisoblash quvvatlarini kengaytirish.",
  ]));
  A.push(P("Axborot tuzilmasini soddalashtirish uchun bo'limlarda elektron jadvallarda parallel yuritiladigan hisoblarni bekor qilib, ma'lumotlarni faqat bitta manbadan (ERP yoki PDM) olish tamoyiliga o'tish tavsiya etiladi."));

  A.push(H2("2.4. Korxonada axborot oqimlarining sxemasi"));
  A.push(P("Tahlil natijalari asosida korxonada axborot oqimlarining sxemasi ishlab chiqildi (1-rasm). Sxemada korxonaning tashqi ishtirokchilari (litsenziar, yetkazib beruvchilar va mijozlar), ichki bo'linmalari va axborot tizimlari hamda ular o'rtasidagi asosiy axborot oqimlari ko'rsatilgan."));
  A.push(P("Sxemaning markazida SAP S/4HANA ERP tizimi joylashgan: u barcha bo'linmalardan ma'lumot qabul qiladi va ularga topshiriqlar uzatadi. Asosiy aylanma quyidagicha: mijozning buyurtmasi «UzAutoSavdo» orqali ERPga tushadi → ERP materiallarga ehtiyojni hisoblab, yetkazib beruvchilarga buyurtma beradi va ishlab chiqarish rejasini tuzadi → MES rejani sexlar uchun topshiriqlarga aylantiradi → sex uskunalari ishlab chiqarish ma'lumotlarini MESga, MES esa bajarilish faktlarini ERPga qaytaradi → tayyor avtomobil VIN raqami bilan omborga tushadi va uning holati mijozga «UzAutoSavdo» orqali yetkaziladi."));
  A.push(P("Sxemada qayta aloqa oqimlari ham aks ettirilgan: sexlar va servis markazlaridan kelgan sifat ma'lumotlari hamda reklamatsiyalar sifat menejmenti xizmatida tahlil qilinib, o'zgartirish so'rovlari ko'rinishida konstruktorlik-texnologik bo'limga qaytariladi. Asosiy axborot oqimlarining tavsifi 5-jadvalda keltirilgan."));

  // 1-rasm alohida albom sahifada
  B.push(...FIGURE('rasm-1-axborot-oqimlari.png', 785, "«UzAuto Motors» AJda axborot oqimlarining sxemasi"));

  C.push(...TABLE('Korxonadagi asosiy axborot oqimlari', [450, 2100, 3000, 3805],
    ['№', 'Oqim', "Yo'nalishi", "Ma'lumot tarkibi"],
    [
      ['1', 'Mijoz buyurtmasi', "Mijoz → UzAutoSavdo → ERP", "model, komplektatsiya, shartnoma, to'lov"],
      ['2', "Konstruktorlik ma'lumotlari", "Litsenziar → konstruktorlik-texnologik bo'lim → ERP", "chizmalar, 3D modellar, BOM, texnologik marshrutlar"],
      ['3', 'Xarid buyurtmalari', "ERP → yetkazib beruvchilar", "komponentlar ro'yxati, miqdori va muddatlari"],
      ['4', "Yetkazib berish ma'lumotlari", "Yetkazib beruvchilar → ERP", "elektron hisob-faktura, jo'natma xabari"],
      ['5', 'Ishlab chiqarish rejasi', "ERP → MES → sexlar", "smenali topshiriqlar, avtomobillar ketma-ketligi"],
      ['6', 'Bajarilish faktlari', "Sexlar → MES → ERP", "ishlab chiqarilgan avtomobillar (VIN), material sarfi, to'xtab qolishlar"],
      ['7', "Sifat ma'lumotlari", "MES, servis → sifat xizmati → konstruktorlik bo'limi", "nazorat natijalari, nuqsonlar, reklamatsiyalar, o'zgartirish so'rovlari"],
      ['8', "Jo'natish", "ERP → ombor va logistika → UzAutoSavdo", "jo'natish topshiriqlari, avtomobil holati"],
      ['9', 'Boshqaruv hisobotlari', "ERP → rahbariyat", "moliyaviy va ishlab chiqarish ko'rsatkichlari, KPI"],
      ['10', "Servis ma'lumotlari", "ERP → dilerlik va servis markazlari", "VIN, kafolat shartlari"],
    ], { centerCols: [0] }));

  // 3-BOB
  C.push(H1("3. 4.2-TOPSHIRIQ. CALS BILAN BOG'LIQ DASTURIY VOSITALAR SHARHI", "3. 4.2-topshiriq. CALS bilan bog'liq dasturiy vositalar sharhi"));
  C.push(P("Topshiriq doirasida korxona sifatida yana «UzAuto Motors» AJ olindi. Internet manbalari asosida CALS-texnologiyalari bilan bog'liq dasturiy mahsulotlar ko'rib chiqildi va mahsulot hayotiy siklining uch muhim bosqichini – loyihalash va texnologik tayyorlash, ishlab chiqarish hamda rejalashtirish, ta'minot va sotishni qamrab oluvchi uchta vosita tanlandi. Tanlov mezonlari:"));
  C.push(...UL([
    "avtomobilsozlikda keng qo'llanilishi;",
    "CALS bilan bog'liq standartlarni (STEP, ISA-95, XML) qo'llab-quvvatlashi;",
    "o'zaro tayyor integratsiya vositalarining mavjudligi;",
    "korxonada joriy etilgan SAP S/4HANA bilan mosligi.",
  ]));

  C.push(H2('3.1. Siemens Teamcenter (PDM/PLM)'));
  C.push(P("**Teamcenter** – Siemens Digital Industries Software kompaniyasining mahsulot hayotiy siklini boshqarish (PLM) platformasi bo'lib, uning yadrosini PDM tizimi tashkil etadi [17]. U mahsulot haqidagi barcha ma'lumotlarni – 3D modellar, chizmalar, mahsulot tarkibi (BOM), texnik talablar va hujjatlarni yagona boshqariladigan omborda saqlaydi."));
  C.push(P('Asosiy imkoniyatlari:', { keepNext: true }));
  C.push(...UL([
    "turli CAD tizimlari (Siemens NX, CATIA, SOLIDWORKS, Creo va boshqalar) ma'lumotlarini boshqarish;",
    "mahsulot tarkibi va konfiguratsiyasini boshqarish – konstruktorlik (EBOM) va ishlab chiqarish (MBOM) tarkiblari;",
    "o'zgartirishlarni boshqarish (o'zgartirish so'rovi va xabarnomasi jarayonlari) va hujjatlarni tasdiqlash ish oqimlari (Workflow);",
    "versiyalar va kirish huquqlarini nazorat qilish, yetkazib beruvchilar bilan xavfsiz ma'lumot almashish;",
    "STEP (ISO 10303) va JT (ISO 14306) standart formatlari bilan ishlash;",
    "SAP tizimlari bilan tayyor integratsiya moduli (Teamcenter Gateway for SAP).",
  ]));
  C.push(P("**Hayotiy sikl bosqichlari:** loyihalash, texnologik tayyorlash, servis (texnik hujjatlar). **«UzAuto Motors» uchun foydasi:** litsenziardan keladigan va mahalliylashtirilgan detallar haqidagi ma'lumotlarni bitta manbada jamlash, BOMni SAP S/4HANAga avtomatik uzatish, konstruksiyadagi o'zgartirishlarni ishlab chiqarishga tez va nazorat ostida yetkazish."));

  C.push(H2('3.2. SAP S/4HANA (ERP)'));
  C.push(P("**SAP S/4HANA** – Germaniyaning SAP SE kompaniyasi tomonidan operativ xotirada ishlovchi SAP HANA ma'lumotlar bazasi asosida yaratilgan ERP tizimi [18]. Ochiq manbalarga ko'ra, «UzAuto Motors» 2021-yildan boshlab ushbu tizimga bosqichma-bosqich o'tgan [5–7]."));
  C.push(P('Asosiy modullari:', { keepNext: true }));
  C.push(...UL([
    "moliya va kontrolling (FI/CO) – buxgalteriya, xarajatlar va tannarx hisobi;",
    "materiallarni boshqarish (MM) – xaridlar, ta'minot, zaxiralar;",
    "ishlab chiqarishni rejalashtirish (PP, MRP) – ehtiyojlarni hisoblash va ishlab chiqarish buyurtmalari;",
    "ombor boshqaruvi (EWM) – ombor operatsiyalari va joylashuvlar;",
    "savdo va taqsimot (SD) – buyurtmalar, narxlar, jo'natish va hisob-kitoblar;",
    "sifatni boshqarish (QM) va uskunalarga texnik xizmat ko'rsatish (PM).",
  ]));
  C.push(P("**Afzalliklari:** ma'lumotlar real vaqtda tahlil qilinadi, barcha bo'limlar yagona ma'lumotlar bazasidan foydalanadi, SAP Fiori orqali qulay veb-interfeys taqdim etiladi. **Hayotiy sikl bosqichlari:** ta'minot, ishlab chiqarishni rejalashtirish, sotish, moliyaviy boshqaruv. **«UzAuto Motors» uchun:** tizim allaqachon joriy etilgan, shuning uchun asosiy vazifa – uni PDM va MES bilan integratsiya qilish orqali imkoniyatlaridan to'liq foydalanish."));

  C.push(H2('3.3. Siemens Opcenter Execution (MES)'));
  C.push(P("**Opcenter** – Siemens kompaniyasining ishlab chiqarish operatsiyalarini boshqarish (MOM) dasturlar to'plami bo'lib, uning Opcenter Execution moduli MES vazifalarini bajaradi [19]. MES ERPdagi rejani sexdagi real ishga aylantiradi va ishlab chiqarish faktlarini real vaqtda qaytaradi."));
  C.push(P('Asosiy imkoniyatlari:', { keepNext: true }));
  C.push(...UL([
    "ishlab chiqarish buyurtmalarini liniyalar va ish o'rinlari bo'yicha taqsimlash (dispetcherlash);",
    "operatorlarga elektron ish ko'rsatmalarini, shu jumladan 3D ko'rinishda yetkazish;",
    "har bir mahsulotni seriya yoki VIN raqami bo'yicha kuzatish (genealogiya);",
    "sifat ma'lumotlarini yig'ish va nuqsonlarni boshqarish;",
    "uskunalarning umumiy samaradorligini (OEE) hisoblash;",
    "SCADA/PLC bilan OPC UA orqali, ERP bilan esa ISA-95 (IEC 62264) standarti asosida integratsiya [4].",
  ]));
  C.push(P("**Hayotiy sikl bosqichi:** ishlab chiqarish. **«UzAuto Motors» uchun foydasi:** payvandlash, bo'yash va yig'ish sexlari faoliyatini real vaqtda kuzatish, nuqsonli avtomobillarni erta aniqlash, SAP S/4HANAdagi material sarfi hisobini aniqlashtirish."));

  C.push(H2('3.4. Tanlangan vositalarning qiyosiy tahlili va integratsiyasi'));
  C.push(P("Tanlangan dasturiy vositalarning qiyosiy tavsifi 6-jadvalda keltirilgan.", { keepNext: true }));
  C.push(...TABLE('Tanlangan dasturiy vositalarning qiyosiy tahlili', [2155, 2400, 2400, 2400],
    ['Mezon', 'Siemens Teamcenter', 'SAP S/4HANA', 'Siemens Opcenter Execution'],
    [
      ['Ishlab chiqaruvchi', 'Siemens (Germaniya)', 'SAP SE (Germaniya)', 'Siemens (Germaniya)'],
      ['Tizim sinfi', 'PDM / PLM', 'ERP', 'MES / MOM'],
      ['CALS guruhi', 'ikkinchi guruh', 'birinchi guruh', 'birinchi guruh'],
      ['Asosiy obyekt', "mahsulot haqidagi ma'lumotlar", 'resurslar, moliya, savdo', 'ishlab chiqarish jarayoni'],
      ['Hayotiy sikl bosqichlari', 'loyihalash, texnologik tayyorlash, servis', "ta'minot, rejalashtirish, sotish", 'ishlab chiqarish'],
      ['Asosiy standartlar', 'ISO 10303 (STEP), ISO 14306 (JT)', 'ISA-95, XML', 'ISA-95, OPC UA'],
      ['Asosiy foydalanuvchilar', 'konstruktorlar, texnologlar', "menejerlar, hisobchilar, ta'minotchilar", 'ustalar, operatorlar, sifat nazoratchilari'],
      ["«UzAuto Motors»dagi holati", 'joriy etish taklif etiladi', "2021-yildan joriy etilgan [5–7]", 'joriy etish taklif etiladi'],
    ]));
  C.push(P("Tanlangan vositalar bir-birini to'ldiradi: Teamcenter mahsulot **nima** ekanligini, SAP S/4HANA uni **qachon, qancha va qaysi resurslar bilan** ishlab chiqarish kerakligini, Opcenter esa sexda u **aynan qanday** ishlab chiqarilganini boshqaradi. Ularning integratsiya sxemasi 2-rasmda ko'rsatilgan."));
  C.push(...FIGURE('rasm-2-integratsiya.png', 620, "Teamcenter, SAP S/4HANA va Opcenter tizimlarining integratsiyasi"));
  C.push(P("Kutilayotgan natijalar:", { keepNext: true }));
  C.push(...UL([
    "BOM va texnologik marshrutlarni qo'lda takror kiritish bartaraf etiladi, xatolar kamayadi;",
    "konstruksiyadagi o'zgartirishlar ishlab chiqarishga tezroq va nazorat ostida yetkaziladi;",
    "har bir avtomobil VIN raqami bo'yicha komponentlardan to sotuvgacha to'liq kuzatiladi;",
    "nuqsonlar sababi tezroq aniqlanadi, servisdan kelgan ma'lumotlar mahsulotni takomillashtirishda ishlatiladi;",
    "rahbariyat ishlab chiqarish va moliyaviy ko'rsatkichlarni real vaqtda ko'radi.",
  ]));
  C.push(P("Joriy etishdagi xatarlar: litsenziyalar va joriy etish xarajatlarining yuqoriligi, malakali mutaxassislarga ehtiyoj, integratsiya loyihalarining murakkabligi. Shuning uchun joriy etishni pilot loyihadan – masalan, bitta model yoki bitta sex misolida boshlash maqsadga muvofiq."));

  // 4-BOB
  C.push(H1('4. NAZORAT SAVOLLARIGA JAVOBLAR', '4. Nazorat savollariga javoblar'));
  C.push(...QA("1. CALS texnologiyalarining paydo bo'lishi va rivojlanishiga sabab bo'lgan sabablarni ayting.", [
    P("CALS konsepsiyasi 1985-yilda AQSh Mudofaa vazirligida paydo bo'lgan [1]. Uning asosiy sabablari:", { keepNext: true }),
    ...UL([
      "murakkab texnika (samolyotlar, kemalar, qurol tizimlari) texnik hujjatlari hajmining keskin oshishi – ularni qog'ozda yuritish, nusxalash va yangilash juda qimmat va sekin bo'lgan;",
      "mahsulotni yaratishda yuzlab pudratchilar ishtirok etgan, ular o'rtasida ma'lumot almashish qiyin va xatolarga boy bo'lgan;",
      "mahsulotni ekspluatatsiya qilish va unga texnik xizmat ko'rsatish xarajatlari uni yaratish xarajatlaridan bir necha barobar oshib ketgan;",
      "kompyuter texnikasi, CAD/CAM tizimlari va tarmoq texnologiyalarining rivojlanishi ma'lumotlarni elektron shaklda yaratish va almashish imkonini bergan.",
    ]),
    P("Keyinchalik CALS fuqarolik sanoatiga (aviatsiya, avtomobilsozlik, kemasozlik) tarqalgan, uning nomi ham kengayib borgan: Computer-Aided Logistic Support → Continuous Acquisition and Life cycle Support → Commerce At Light Speed. Bu konsepsiyaning harbiy logistikadan butun elektron biznesgacha rivojlanganini ko'rsatadi."),
  ]));
  C.push(...QA("2. CALS texnologiyalari yordamida hal qilinadigan asosiy vazifalarni sanab o'ting.", UL([
    "mahsulot hayotiy siklining barcha bosqichlari uchun yagona axborot makonini yaratish;",
    "loyiha-texnologik va ekspluatatsiya hujjatlarini elektron shaklga o'tkazish, qog'ozsiz hujjat aylanishini tashkil etish;",
    "mahsulot, jarayonlar va resurslar haqidagi ma'lumotlarni taqdim etish va almashishni standartlashtirish;",
    "parallel loyihalashni tashkil etish va yangi mahsulotni bozorga chiqarish muddatini qisqartirish;",
    "ta'minot, ishlab chiqarish va sotishni integratsiyalashgan holda boshqarish;",
    "mahsulotni ekspluatatsiya qilishda logistik qo'llab-quvvatlash, interaktiv elektron texnik qo'llanmalar (IETM) yaratish;",
    "sifat menejmenti tizimlarini (ISO 9000) va axborot xavfsizligini ta'minlash;",
    "mahsulot hayotiy sikli xarajatlarini kamaytirish.",
  ])));
  C.push(...QA("3. Integratsiyalashgan axborot muhiti nima ekanligini shakllantiring.", [
    P("**Integratsiyalashgan axborot muhiti** (IAM) – mahsulot hayotiy siklining barcha ishtirokchilari (buyurtmachi, ishlab chiqaruvchi, yetkazib beruvchilar, ekspluatatsiya qiluvchi va servis tashkilotlari) foydalanadigan taqsimlangan ma'lumotlar bazalari, ularni boshqarish dasturiy-texnik vositalari, ma'lumot almashish standartlari va qoidalari majmuidir [1, 2]. IAMda har bir ma'lumot bir marta, standart shaklda yaratiladi, yagona manbada saqlanadi va ruxsat etilgan barcha foydalanuvchilar tomonidan qayta-qayta ishlatiladi. Shu tufayli turli bo'limlar va korxonalar bir xil, dolzarb ma'lumot bilan ishlaydi."),
  ]));
  C.push(...QA("4. Integratsiyalashgan axborot muhiti nechta ma'lumotlar bazasini o'z ichiga olishi kerak va nima uchun?", [
    P("Adabiyotlarda IAM odatda mantiqan to'rtta asosiy ma'lumotlar bazasidan iborat deb ko'rsatiladi [1, 2]:", { keepNext: true }),
    ...OL([
      "**mahsulot haqidagi ma'lumotlar bazasi** – konstruktorlik va texnologik hujjatlar, 3D modellar, mahsulot tarkibi, konfiguratsiya va o'zgartirishlar tarixi (PDM tizimi yuritadi);",
      "**jarayonlar haqidagi ma'lumotlar bazasi** – biznes va ishlab chiqarish jarayonlarining modellari, ish oqimlari, loyihalar va ularning bajarilishi;",
      "**resurslar haqidagi ma'lumotlar bazasi** – uskunalar, asboblar, materiallar, xodimlar va moliyaviy resurslar (ERP, MES);",
      "**me'yoriy-ma'lumotnoma axboroti bazasi** – standartlar, klassifikatorlar, kodlar va ma'lumotnomalar.",
    ]),
    P("Nima uchun: mahsulot hayotiy sikli davomida aynan shu to'rt turdagi ma'lumot kerak bo'ladi – nima ishlab chiqariladi (mahsulot), qanday ishlab chiqariladi (jarayonlar), nima bilan ishlab chiqariladi (resurslar) va qanday qoidalar asosida (me'yoriy baza). Ularni alohida, lekin o'zaro bog'langan holda yuritish ma'lumotlarning takrorlanishini oldini oladi, har bir bazani o'z mas'ul tizimi yuritadi, yagona standartlar esa ularning birgalikda ishlashini ta'minlaydi. Jismonan bu bazalar turli serverlarda joylashishi mumkin, lekin mantiqan ular yagona axborot makonini tashkil etadi."),
  ]));
  C.push(...QA("5. CALS-texnologiyalarining birinchi va ikkinchi guruhga tegishli dasturiy mahsulotlarini ayting. Ularning asosiy farqi nimada?", [
    P("**Birinchi guruh:** ofis tizimlari, CAE, CAD, CAM, SCM, MRP, ERP, MES va elektron raqamli imzo vositalari. **Ikkinchi guruh:** PDM, PM, WF, CRM, SCADA, S&SM, CNC va CPC tizimlari (2-jadval)."),
    P("**Asosiy farqi:** birinchi guruh vositalari korxonalarda an'anaviy qo'llaniladi va ulardan foydalanish CALS joriy etilganiga bog'liq emas – ular alohida vazifalarni avtomatlashtiradi. Ikkinchi guruh vositalaridan foydalanish esa CALS va tegishli standartlar talablari bilan bog'liq: ular yagona axborot makonida ma'lumotlarni integratsiya qilish, almashish va mahsulotni butun hayotiy sikli davomida kuzatib borish uchun mo'ljallangan."),
  ]));
  C.push(...QA("6. Yagona axborot makonidan foydalanish sohalarini ko'rsating.", UL([
    "aviatsiya va kosmik sanoat – samolyot va raketalarni loyihalash, ularga texnik xizmat ko'rsatish;",
    "mudofaa sanoati va harbiy logistika – CALSning dastlabki qo'llanish sohasi;",
    "avtomobilsozlik va mashinasozlik – avtomobil ishlab chiqaruvchi va yetkazib beruvchilar o'rtasidagi hamkorlik;",
    "kemasozlik va temir yo'l transporti;",
    "energetika, jumladan atom energetikasi – obyektlarning uzoq hayotiy siklini qo'llab-quvvatlash;",
    "neft-gaz va kimyo sanoati;",
    "qurilish va infratuzilma – binolarning axborot modeli (BIM);",
    "elektronika va asbobsozlik;",
    "davlat boshqaruvi – elektron hujjat aylanishi, davlat xaridlari, elektron raqamli imzo.",
  ])));
  C.push(...QA("7. Korxonada obyektlarning hayotiy siklini (CALS) axborot bilan ta'minlash texnologiyalarini joriy etishning asosiy bosqichlarini sanab o'ting.", OL([
    "korxonaning hozirgi holatini tahlil qilish – biznes-jarayonlar, axborot oqimlari va mavjud axborot tizimlarini o'rganish;",
    "CALS konsepsiyasi va joriy etish strategiyasini ishlab chiqish – maqsadlar, ustuvor yo'nalishlar va budjetni belgilash;",
    "biznes-jarayonlarni modellashtirish va qayta loyihalash (masalan, IDEF0 metodologiyasi asosida);",
    "standartlar va me'yoriy bazani tanlash, korxona ma'lumotnomalari va klassifikatorlarini yagonalashtirish;",
    "dasturiy-texnik vositalarni (PDM, ERP, MES va boshqalar) tanlash va IT-infratuzilmani tayyorlash;",
    "pilot loyihani amalga oshirish – tizimni bitta mahsulot yoki bo'linma misolida sinab ko'rish;",
    "xodimlarni o'qitish;",
    "tizimni bosqichma-bosqich butun korxonaga joriy etish va tizimlarni o'zaro integratsiya qilish;",
    "natijalarni baholash va tizimni doimiy takomillashtirish.",
  ])));

  // XULOSA
  C.push(H1('XULOSA', 'Xulosa'));
  C.push(P("Amaliy mashg'ulot davomida CALS-texnologiyalarining mohiyati, ularning dasturiy mahsulotlari va ulardan korxonada axborot oqimlarini boshqarishda foydalanish masalalari o'rganildi."));
  C.push(P("4.1-topshiriq bo'yicha «UzAuto Motors» AJ misolida korxona axborot tizimlari tahlil qilindi. Korxonada axborot yadrosi vazifasini SAP S/4HANA ERP tizimi bajaradi, sotuv esa «UzAutoSavdo» onlayn platformasi orqali to'liq raqamlashtirilgan. Shu bilan birga, ERPga o'tish davridagi sotuvlarning vaqtincha to'xtatilishi va onlayn savdodagi yuklama muammolari tizimlar integratsiyasida hali zaxiralar borligini ko'rsatadi. Korxonada axborot oqimlarining sxemasi ishlab chiqildi va axborot tuzilmasini yaxshilash bo'yicha takliflar berildi: PDM/PLM tizimini joriy etish, MES qatlamini kuchaytirish, yetkazib beruvchilar portalini yaratish hamda servis bosqichini axborot bilan ta'minlash."));
  C.push(P("4.2-topshiriq bo'yicha mahsulot hayotiy siklining turli bosqichlarini qamrab oluvchi uchta dasturiy vosita – Siemens Teamcenter (loyihalash va texnologik tayyorlash), SAP S/4HANA (rejalashtirish, ta'minot, sotish) va Siemens Opcenter Execution (ishlab chiqarish) ko'rib chiqildi. Ularning integratsiyasi mahsulot haqidagi ma'lumotlarning konstruktordan sex operatorigacha va aksincha uzluksiz harakatlanishini ta'minlaydi."));
  C.push(P("Xulosa qilib aytganda, CALS-texnologiyalarining samarasi alohida dasturlarning o'zidan emas, balki ularning yagona axborot makonida o'zaro integratsiyasidan kelib chiqadi. Aynan shu integratsiya mahsulot sifatini oshirish, ishlab chiqarish muddatlari va xarajatlarini kamaytirish hamda korxonaning raqobatbardoshligini oshirish imkonini beradi."));

  // ADABIYOTLAR
  C.push(H1('FOYDALANILGAN ADABIYOTLAR VA MANBALAR', 'Foydalanilgan adabiyotlar va manbalar'));
  const refs = [
    ['Норенков И.П., Кузьмик П.К. Информационная поддержка наукоёмких изделий. CALS-технологии. – М.: Изд-во МГТУ им. Н.Э. Баумана, 2002. – 320 с.'],
    ['Судов Е.В. Интегрированная информационная поддержка жизненного цикла машиностроительной продукции. Принципы. Технологии. Методы. Модели. – М.: МВМ, 2003. – 264 с.'],
    ['ISO 10303. Industrial automation systems and integration – Product data representation and exchange (STEP).'],
    ['IEC 62264 (ANSI/ISA-95). Enterprise-control system integration.'],
    ["Spot.uz. UzAuto Motors kompaniyasining SAP ERP tizimiga o'tishi haqida, 13.02.2021.", 'https://www.spot.uz/ru/2021/02/13/erp/'],
    ["Spot.uz. UzAuto Motors shartnomalar tuzishni qayta tiklashi haqida, 03.03.2021.", 'https://www.spot.uz/ru/2021/03/03/uzauto-sap/'],
    ['SAPinsider. How UzAuto Motors Leverages a Unified Environment to Manage All Business Operations.', 'https://sapinsider.org/case-studies/how-uzauto-motors-leverages-a-unified-environment-to-manage-all-business-operations'],
    ["O'zavtosanoat AJ. UzAuto Motors SAP nominatsiyasida g'olib bo'ldi, 2025.", 'https://uzavtosanoat.uz/en/news_show/uzauto_motors_sap_nominatsiyasida_golib_boldi1744881201'],
    ['Daryo.uz. UzAuto Motors stops making new sale agreements for all range of cars, 05.01.2023.', 'https://daryo.uz/en/2023/01/05/uzauto-motors-stops-making-new-sale-agreements-for-all-range-of-cars/'],
    ['Kun.uz. UzAuto Motors to switch to an online form for concluding contracts, 01.12.2023.', 'https://kun.uz/en/news/2023/12/01/uzauto-motors-to-switch-to-an-online-form-for-concluding-contracts'],
    ["O'zavtosanoat AJ. UzAuto Motors AJ UzAutoSavdo onlayn platformasining yangilangan versiyasini ishga tushirdi, 2025.", 'https://uzavtosanoat.uz/en/news_show/uzauto_motors_aj_uzautosavdo_onlayn_platformasining_yangilangan_versiyasini_ishga_tushirdi1752692091'],
    ['Tech.az. 100 000 new Chevrolet Cobalts sold in Uzbekistan in 2 hours and 30 minutes, 2025.', 'https://tech.az/en/posts/100-000-new-chevrolet-cobalts-sold-in-uzbekistan-in-2-hours-and-30-minutes-5982'],
    ["O'zavtosanoat AJ. «UzAuto Motors» AJ korxona sahifasi.", 'https://uzavtosanoat.uz/en/company/ao-uzauto-motors'],
    ["O'zavtosanoat AJ. UzAuto Motorsning navbatdagi rekordi: avgustda zavod konveyerlaridan 41 100 avtomobil chiqdi, 2023.", 'https://uzavtosanoat.uz/en/news_show/uzauto_motorsning_navbatdagi_rekordi_avgustda_zavod_konveyerlaridan_41_100_avtomobil_chiqdi1693806077'],
    ['GM Authority. GM Uzbekistan Now Wholly Owned By Uzbek Government, 2019.', 'https://gmauthority.com/blog/2019/07/gm-uzbekistan-now-wholly-owned-by-uzbek-government/'],
    ['Wikipedia. UzAuto Motors.', 'https://en.wikipedia.org/wiki/UzAuto_Motors'],
    ['Siemens Digital Industries Software. Teamcenter.', 'https://plm.sw.siemens.com/en-US/teamcenter/'],
    ['SAP SE. SAP S/4HANA.', 'https://www.sap.com/products/erp/s4hana.html'],
    ['Siemens Digital Industries Software. Opcenter.', 'https://plm.sw.siemens.com/en-US/opcenter/'],
  ];
  refs.forEach(([text, url]) => {
    const children = [new TextRun(uz(text))];
    if (url) {
      children.push(new TextRun(' URL: '));
      children.push(new ExternalHyperlink({ link: url, children: [new TextRun({ text: url, color: '1F4E9E', underline: {} })] }));
      children.push(new TextRun(uz(" (murojaat sanasi: 14.10.2026)")));
    }
    C.push(new Paragraph({ numbering: { reference: 'refs', level: 0 }, alignment: AlignmentType.LEFT, spacing: { lineRule: 'auto', line: 240, after: 80 }, children }));
  });

  return { A, B, C };
}

// ---------- hujjat ----------
function build(pages) {
  const { A, B, C } = body();
  const portrait = { size: { width: 11906, height: 16838 }, margin: { top: 1134, bottom: 1134, left: 1701, right: 850 } };
  const landscape = { size: { width: 11906, height: 16838, orientation: PageOrientation.LANDSCAPE }, margin: { top: 1134, bottom: 1134, left: 1134, right: 1134 } };
  const listLevel = (format, text) => [{
    level: 0, format, text, alignment: AlignmentType.LEFT,
    style: { paragraph: { indent: { left: 1069, hanging: 360 } } },
  }];
  return new Document({
    creator: 'Talaba',
    title: uz("4-amaliy mashg'ulot: CALS-texnologiyalari"),
    styles: {
      default: { document: { run: { font: FONT, size: 28 }, paragraph: { spacing: { lineRule: 'auto', line: 360 } } } },
      paragraphStyles: [
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 28, bold: true, color: '000000' },
          paragraph: { alignment: AlignmentType.CENTER, spacing: { lineRule: 'auto', before: 0, after: 240, line: 360 }, keepNext: true, outlineLevel: 0 } },
        { id: 'Heading2', name: 'Heading 2', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { font: FONT, size: 28, bold: true, color: '000000' },
          paragraph: { alignment: AlignmentType.LEFT, indent: { firstLine: 709 }, spacing: { lineRule: 'auto', before: 240, after: 120, line: 360 }, keepNext: true, outlineLevel: 1 } },
      ],
    },
    numbering: {
      config: [
        { reference: 'dash', levels: listLevel(LevelFormat.BULLET, '–') },
        { reference: 'refs', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT, style: { paragraph: { indent: { left: 567, hanging: 567 } } } }] },
        ...olRefs.map((ref) => ({ reference: ref, levels: listLevel(LevelFormat.DECIMAL, '%1)') })),
      ],
    },
    sections: [
      { properties: { page: portrait }, footers: { default: new Footer({ children: [P('2026-yil', { align: AlignmentType.CENTER, noIndent: true })] }) }, children: titlePage() },
      { properties: { page: portrait }, footers: footer(), children: [...tocPage(pages), ...A] },
      { properties: { page: landscape }, footers: footer(), children: B },
      { properties: { page: portrait }, footers: footer(), children: C },
    ],
  });
}

function toPdf(docx, outDir) {
  if (SOFFICE) execFileSync('python3', [SOFFICE, '--headless', '--convert-to', 'pdf', '--outdir', outDir, docx], { stdio: 'pipe' });
  else execFileSync('soffice', ['--headless', '--convert-to', 'pdf', '--outdir', outDir, docx], { stdio: 'pipe' });
  return path.join(outDir, path.basename(docx).replace(/\.docx$/, '.pdf'));
}

function findPages(pdf) {
  const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { encoding: 'utf8' });
  const pages = text.split('\f').map((t) => t.replace(/\s+/g, ''));
  const norm = (s) => s.replace(/\s+/g, '');
  let from = pages.findIndex((p) => p.includes('MUNDARIJA')) + 1;
  return headings.map((h) => {
    const idx = pages.findIndex((p, i) => i >= from && p.includes(norm(h.body)));
    if (idx < 0) throw new Error(`Sarlavha topilmadi: ${h.body}`);
    from = idx;
    return idx + 1;
  });
}

// docx kutubxonasi barcha rasmlarga bir xil docPr id beradi; Word buni buzilgan fayl deb hisoblashi mumkin.
function fixDocPrIds(file) {
  execFileSync('python3', ['-I', '-c', `
import re, sys, zipfile, shutil
src = sys.argv[1]; tmp = src + '.tmp'
with zipfile.ZipFile(src) as zin, zipfile.ZipFile(tmp, 'w', zipfile.ZIP_DEFLATED) as zout:
    for item in zin.infolist():
        data = zin.read(item.filename)
        if item.filename == 'word/document.xml':
            n = iter(range(1, 10**6))
            data = re.sub(rb'<wp:docPr id="\\d+"', lambda m: b'<wp:docPr id="%d"' % next(n), data)
        zout.writestr(item, data)
shutil.move(tmp, src)
`, file]);
}

async function write(doc, file) {
  fs.writeFileSync(file, await Packer.toBuffer(doc));
  fixDocPrIds(file);
}

(async () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hisobot-'));
  const draft = path.join(tmp, 'draft.docx');
  await write(build(null), draft);
  const pages = findPages(toPdf(draft, tmp));
  await write(build(pages), OUT);
  console.log('yozildi:', OUT);
  console.log(headings.map((h, i) => `${pages[i]}\t${h.toc}`).join('\n'));
})();
