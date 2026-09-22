/* ============================================================================
   تحقّقٌ مستقلّ من ملفات Word: هل يفتحها معالج نصوص حقيقي؟

   مجموعة الاختبارات تفحص بنية الحزمة (zip، أجزاء XML سليمة، RTL، الشعار،
   الاتجاه، ولا خلية ساقطة). وهذا السكربت يضيف ما لا تستطيعه: أن **برنامجاً
   لم نكتبه** — LibreOffice Writer — يحمّل الملف ويُخرجه PDF، فتُعدّ صفحاته
   ويُقرأ نصّه العربي منه.

   ليس بديلاً عن فتح الملف في Microsoft Word على ويندوز (يُقال ذلك في التقرير)،
   لكنه دليلٌ من خارج الشيفرة على أن الملف مستندٌ حقيقي لا HTML بلاحقة docx.

     npm run test:docx            # يتخطّى بإعلان إن لم يوجد soffice
   ========================================================================== */
const http = require('http'), fs = require('fs'), os = require('os'), path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const APP = path.join(ROOT, 'tabarak-gym 3.0.html');
const PINNED = process.env.TG_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const which = b => { try { return execFileSync('which', [b]).toString().trim(); } catch (e) { return null; } };
const SOFFICE = which('soffice') || which('libreoffice');

let fails = 0;
const ok = (name, pass, detail) => { console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? '  ⟵ ' + detail : ''}`); if (!pass) fails++; };

(async () => {
  if (!SOFFICE) { console.log('⚠ LibreOffice غير مثبّت — تخطّي التحقّق بمعالج نصوص خارجي (البنية مفحوصة في npm test).'); process.exit(0); }
  const out = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-docx-'));
  const srv = http.createServer((q, r) => { r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' }); r.end(fs.readFileSync(APP)); });
  await new Promise(r => srv.listen(0, '127.0.0.1', r));
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, fs.existsSync(PINNED) ? { executablePath: PINNED } : {}));
  const page = await (await browser.newContext()).newPage();
  await page.goto(`http://127.0.0.1:${srv.address().port}/?intro=0`);
  await page.waitForFunction(() => window.TG && window.TG.ready);
  await page.evaluate(() => window.TG.ready);
  const docs = await page.evaluate(async () => {
    const TG = window.TG, out = [];
    await TG.Seed.loadDemo(30);
    const c = document.createElement('canvas'); c.width = c.height = 800;
    const x = c.getContext('2d'); x.fillStyle = '#D63384'; x.beginPath(); x.arc(400, 400, 360, 0, 7); x.fill();
    await TG.Brand.setMedia('logo', new File([await new Promise(r => c.toBlob(r, 'image/png'))], 'l.png', { type: 'image/png' }));
    const grab = async (name, fn, wantLandscape) => {
      let blob = null; const real = TG.UI.download;
      TG.UI.download = async b => { blob = b; return null; };
      try { await fn(); } finally { TG.UI.download = real; }
      const u = new Uint8Array(await blob.arrayBuffer()); let s = '';
      for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000));
      out.push({ name, b64: btoa(s), wantLandscape });
    };
    const m = TG.Repos.members.list().find(x => TG.Svc.payments.ofMember(x.id).length);
    const rc = await TG.Svc.receipts.ensure(TG.Svc.payments.ofMember(m.id)[0].id);
    const rows = TG.Repos.members.list().map(x => `<tr><td>${x.code}</td><td>${x.name}</td><td>${x.phone || ''}</td><td>فعّال</td><td>01/01/2026</td><td>1</td><td>30,000 د.ع</td><td>20,000 د.ع</td></tr>`).join('');
    await grab('وصل', () => TG.Word.fromPrint(`وصل ${rc.no}`, TG.Print.receiptHtml(rc, { format: 'a4' })), false);
    await grab('كشف-حساب', () => TG.Word.fromPrint(`كشف حساب ${m.name}`, TG.Print.statementHtml(m.id)), false);
    await grab('كشف-الصندوق', () => TG.Word.fromPrint('كشف الصندوق', TG.Print.cashDayHtml(TG.D.today())), false);
    await grab('قائمة-المشتركات', () => TG.Word.fromPrint('قائمة المشتركات',
      `<table class="tbl"><thead><tr><th>الكود</th><th>الاسم</th><th>الهاتف</th><th>الحالة</th><th>النهاية</th><th>الاشتراكات</th><th>المستحق</th><th>المدفوع</th></tr></thead><tbody>${rows}</tbody></table>`,
      { landscape: true }), true);
    await grab('التقرير-الإداري', () => TG.Reports.word(TG.Reports.build(TG.D.monthKey(TG.D.today()))), true);
    return out;
  });
  await browser.close(); srv.close();

  for (const d of docs) {
    const f = path.join(out, `${d.name}.docx`);
    fs.writeFileSync(f, Buffer.from(d.b64, 'base64'));
    console.log(`\n— ${d.name}.docx (${Math.round(fs.statSync(f).size / 1024)} ك.ب) —`);
    const home = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-lo-'));
    try {
      execFileSync(SOFFICE, ['--headless', '--norestore', '--convert-to', 'pdf', '--outdir', out, f],
                   { env: Object.assign({}, process.env, { HOME: home }), timeout: 120000, stdio: 'pipe' });
    } catch (e) { /* يُحكم بوجود الناتج لا برمز الخروج */ }
    const pdf = f.replace(/\.docx$/, '.pdf');
    const loaded = fs.existsSync(pdf) && fs.statSync(pdf).size > 1000;
    ok('LibreOffice Writer يحمّل الملف ويُخرجه PDF', loaded);
    if (!loaded) continue;
    const raw = fs.readFileSync(pdf).toString('latin1');
    const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
    const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
    const land = box ? Number(box[1]) > Number(box[2]) : null;
    ok(`عدد الصفحات ${pages}`, pages >= 1);
    ok(`الاتجاه ${d.wantLandscape ? 'أفقي' : 'عمودي'}`, land === d.wantLandscape, box ? `${box[1]}×${box[2]}` : 'لا MediaBox');
    const pt = which('pdftotext');
    if (pt) {
      const txt = execFileSync(pt, ['-layout', pdf, '-']).toString('utf8');
      ok('النصّ العربي في الناتج', (txt.match(/[؀-ۿ]/g) || []).length > 40, `${(txt.match(/[؀-ۿ]/g) || []).length} حرفاً`);
      ok('ولا شيفرة ولا وسوم HTML', !/<\/?(div|table|td|span)|function\s*\(|w:tbl/.test(txt));
    }
  }
  console.log(`\n${fails === 0 ? '✓ كل ملفات Word فُتحت في معالج نصوص خارجي.' : '✗ ' + fails + ' فحصاً سقط.'}  (${out})`);
  process.exit(fails ? 1 : 0);
})();
