/* ============================================================================
   Final real-world verification (§29).
   Drives the ACTUAL user path — file input -> ImageEditor -> Apply — and
   measures what the browser really renders. Then prints a real report through
   the desktop path and extracts the PDF text to prove no source code reaches
   the page.
   ========================================================================== */
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const { installBridge } = require('./desktop-io.js');

/* الجذر من موضع هذا الملف لا مسارٌ مكتوب: كان هنا مسار جهاز التطوير، فلم
   تكن البوّابة تعمل إلا عليه — وعلى مشغّل CI لم تجد حتى ملفّ الاختبار. */
const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'app', 'index.html');
const P = process.env.TG_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = fs.existsSync(P) ? P : undefined;

function serve() {
  return new Promise(res => {
    const T = { '.js': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8',
                '.webm': 'video/webm', '.mp4': 'video/mp4', '.jpg': 'image/jpeg', '.png': 'image/png',
                '.gif': 'image/gif' };
    const s = http.createServer((q, r) => {
      const u = decodeURIComponent(q.url.split('?')[0]);
      const f = u === '/' ? DIST
        : u.startsWith('/intro/') ? path.join(ROOT, 'app', u.replace(/^\//, ''))
        : path.join(ROOT, u.replace(/^\//, ''));
      if (!fs.existsSync(f)) { r.writeHead(404); return r.end('nf'); }
      const b = fs.readFileSync(f);
      r.writeHead(200, { 'Content-Type': T[path.extname(f).toLowerCase()] || 'application/octet-stream',
                         'Content-Length': b.length });
      r.end(b);
    });
    s.listen(0, '127.0.0.1', () => res(s));
  });
}

const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const GIF_B64 = fs.readFileSync(path.join(ROOT, 'tests', 'fixtures-anim.gif')).toString('base64');

let fails = 0;
const ok = (name, pass, detail) => {
  console.log(`  ${pass ? '✓' : '✗'} ${name}${detail ? '  ⟵ ' + detail : ''}`);
  if (!pass) fails++;
};

(async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
  const browser = await chromium.launch({ executablePath: CHROME });

  // ======================================================= LOGO, real path
  for (const vp of [{ width: 1024, height: 600 }, { width: 1440, height: 900 }]) {
    const ctx = await browser.newContext({ viewport: vp });
    await ctx.addInitScript(() => { window.open = () => null; });
    await ctx.addInitScript(installBridge, { fail: {}, version: VER });
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push(e.message));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);

    console.log(`\n— الشعار عبر الطريق الحقيقي (${vp.width}×${vp.height}) —`);
    const rows = await page.evaluate(async (gifB64) => {
      const TG = window.TG;
      const settle = ms => new Promise(r => setTimeout(r, ms));
      const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
        return { w: Math.round(r.width), h: Math.round(r.height) }; };
      const png = async (w, h, alpha) => {
        const c = document.createElement('canvas'); c.width = w; c.height = h;
        const x = c.getContext('2d');
        if (!alpha) { x.fillStyle = '#C43E6B'; x.fillRect(0, 0, w, h); }
        else { x.fillStyle = 'rgba(196,62,107,.6)'; x.fillRect(w * .1, h * .1, w * .8, h * .8); }
        const b = await new Promise(r => c.toBlob(r, 'image/png'));
        return new File([b], `l-${w}x${h}.png`, { type: 'image/png' });
      };
      const gif = () => { const bin = atob(gifB64); const a = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i);
        return new File([a], 'anim.gif', { type: 'image/gif' }); };
      const svg = () => new File(['<svg xmlns="http://www.w3.org/2000/svg" width="4000" height="900"><rect width="4000" height="900" fill="#C43E6B"/></svg>'], 'l.svg', { type: 'image/svg+xml' });

      /* الطريق الحقيقي: حقل الملف في الشاشة، ثم المحرّر، ثم «حفظ» */
      const viaUi = async (file) => {
        TG.go('settings', { sec: 'brand' }); TG.renderRoute();
        await settle(180);
        const input = document.getElementById('bLogo');
        const dt = new DataTransfer(); dt.items.add(file);
        input.files = dt.files;
        input.dispatchEvent(new Event('change', { bubbles: true }));
        await settle(420);
        const apply = document.querySelector('#imApply');
        if (apply) { apply.click(); await settle(500); }
        TG.go('settings', { sec: 'brand' }); TG.renderRoute();
        await settle(300);
        const info = TG.Brand.info('logo');
        const sidebarEl = document.querySelector('.brand .brand-logo, .brand .brand-mark');
        const out = {
          editorOpened: !!apply,
          stored: `${info.width}×${info.height}`,
          sidebar: box(sidebarEl),
          prevBox: box(document.querySelector('.media-drop .brand-prev')),
          prevImg: box(document.querySelector('[data-brand-prev="logo"]')),
          print: box(document.querySelector('.doc-head-brand .brand-logo')),
          scrollW: document.documentElement.scrollWidth,
          innerW: window.innerWidth,
        };
        TG.Gate.login(); await settle(140);
        out.gate = box(document.querySelector('.gate .gate-head .brand-logo, .gate .gate-head .brand-mark'));
        TG.Gate.close(); TG.Gate.unlock(); TG.renderRoute(); await settle(150);
        return out;
      };

      const r = {};
      r['512×512']       = await viaUi(await png(512, 512));
      r['1024×1024']     = await viaUi(await png(1024, 1024));
      r['3000×3000']     = await viaUi(await png(3000, 3000));
      r['عريض 3000×400'] = await viaUi(await png(3000, 400));
      r['طويل 400×3000'] = await viaUi(await png(400, 3000));
      r['PNG شفاف']      = await viaUi(await png(1200, 1200, true));
      r['GIF متحرّك']     = await viaUi(gif());
      r['SVG 4000×900']  = await viaUi(svg());

      /* بعد استعادة نسخة احتياطية: الشعار يعود ويُرسم بصندوقه */
      const backup = TG.Backup.build(true);
      await TG.Backup.restore(JSON.parse(JSON.stringify(backup)), { mode: 'replace' });
      TG.go('settings', { sec: 'brand' }); TG.renderRoute();
      await settle(320);
      r['بعد الاستعادة'] = {
        editorOpened: true, stored: '—',
        sidebar: box(document.querySelector('.brand .brand-logo, .brand .brand-mark')),
        prevBox: box(document.querySelector('.media-drop .brand-prev')),
        prevImg: box(document.querySelector('[data-brand-prev="logo"]')),
        print: box(document.querySelector('.doc-head-brand .brand-logo')),
        scrollW: document.documentElement.scrollWidth, innerW: window.innerWidth,
        gate: null,
      };
      return r;
    }, GIF_B64);

    for (const [label, m] of Object.entries(rows)) {
      const good = m.sidebar && m.sidebar.w === 38 && m.sidebar.h === 38
        && m.prevBox && m.prevBox.w === 120 && m.prevBox.h === 120
        && m.print && m.print.w === 54 && m.print.h === 54
        && (!m.gate || (m.gate.w === 64 && m.gate.h === 64))
        && (!m.prevImg || (m.prevImg.w <= 120 && m.prevImg.h <= 120));
      ok(`${label}: كل سطح بصندوقه`, good,
         `جانبي ${m.sidebar && m.sidebar.w}×${m.sidebar && m.sidebar.h} · `
         + `معاينة ${m.prevBox && m.prevBox.w}×${m.prevBox && m.prevBox.h} · `
         + `داخلها ${m.prevImg && m.prevImg.w}×${m.prevImg && m.prevImg.h} · `
         + `طباعة ${m.print && m.print.w}×${m.print && m.print.h}`
         + (m.gate ? ` · دخول ${m.gate.w}×${m.gate.h}` : ''));
    }
    /* المقياس الصحيح هنا ليس «صفر تمدّد» — ففي 1024 تمدّدٌ قائمٌ في الأساس
       قبل أي تغيير (قيس على 46bb74a: 1138 كذلك) وسببه تخطيط الإعدادات لا
       الشعار. المقياس أن **الشعار لا يغيّره**: رقمٌ واحد لكل المصادر. */
    const widths = [...new Set(Object.values(rows).map(m => m.scrollW))];
    ok('عرض الصفحة لا يتغيّر بتغيّر الشعار', widths.length === 1, widths.join(','));
    ok('لا خطأ تشغيل', errs.length === 0, errs.slice(0, 2).join(' | '));
    await ctx.close();
  }

  // ======================================================= PRINT -> real PDF
  console.log('\n— الطباعة: ما يصل إلى الورقة فعلاً —');
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    await ctx.addInitScript(() => { window.open = () => null; });
    await ctx.addInitScript(installBridge, { fail: {}, version: VER });
    const page = await ctx.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);

    const st = await page.evaluate(async () => {
      const TG = window.TG;
      const c = document.createElement('canvas'); c.width = 1024; c.height = 1024;
      const x = c.getContext('2d'); x.fillStyle = '#C43E6B'; x.fillRect(0, 0, 1024, 1024);
      const b = await new Promise(r => c.toBlob(r, 'image/png'));
      await TG.Brand.setMedia('logo', new File([b], 'l.png', { type: 'image/png' }));
      TG.Seed.loadDemo(10);
      /* مستندٌ يحمل ترويسة الهوية فعلاً: `printSection` العادية ترويستها
         نصّية بلا شعار، أمّا كشف الحساب فيبني `Brand.printHeader`. */
      TG.UI.printSection('تقرير الإيرادات',
        TG.Brand.printHeader('تقرير الإيرادات', 'نموذج')
        + '<table><thead><tr><th>المشتركة</th><th>المبلغ</th></tr></thead><tbody>'
        + '<tr><td>سارة العبدالله</td><td class="num">120000</td></tr>'
        + '<tr><td>نور الحسن</td><td class="num">90000</td></tr></tbody></table>',
        { plain: true });
      await new Promise(r => setTimeout(r, 1400));
      return { state: TG.UI._printState,
               rootImgs: document.querySelectorAll('#tgPrintRoot img').length,
               attr: document.documentElement.getAttribute('data-tg-print') };
    });
    ok('حالة الطباعة بلغت النداء الأصليّ', st.state === 'native' || st.state === 'done', st.state);
    ok('وترويسة المستند تحمل الشعار', st.rootImgs > 0, st.rootImgs);

    await page.pdf({ path: '/tmp/tg-verify.pdf', format: 'A4', printBackground: true });
    const d = fs.readFileSync('/tmp/tg-verify.pdf');
    const zlib = require('zlib');
    let raw = Buffer.alloc(0);
    for (const m of d.toString('latin1').matchAll(/stream\r?\n/g)) { /* noop */ }
    const re = /stream\r?\n([\s\S]*?)endstream/g; let mm;
    const s2 = d.toString('latin1');
    while ((mm = re.exec(s2))) {
      try { raw = Buffer.concat([raw, zlib.inflateSync(Buffer.from(mm[1], 'latin1'))]); } catch (e) {}
    }
    const content = raw.toString('latin1');
    let chars = [...content.matchAll(/ActualText <FEFF([0-9A-Fa-f]+)>/g)]
      .map(m => { const h = m[1]; let o = '';
        for (let i = 0; i < h.length; i += 4) o += String.fromCharCode(parseInt(h.slice(i, i + 4), 16));
        return o; }).join('');
    /* النصّ يُستخرج بطريقتين: `ActualText` (ما تكتبه Skia حين لا يطابق الحرفُ
       الرسمَ واحداً بواحد) — وبـ`pdftotext` إن وُجد، لأن الخطّ العربي المثبّت
       يقرّر أيّ الطريقتين يُكتب بها النصّ: بخطّ Noto Kufi Arabic يُكتب النصّ
       بجداول ToUnicode المعتادة فلا يظهر في ActualText أصلاً (قيس على 7.9.0
       نفسه). فالمستخرَج هو اتحاد الاثنين، وفحوص الشيفرة تقع عليه كلّه. */
    try {
      const { execFileSync } = require('child_process');
      const extra = execFileSync('pdftotext', ['/tmp/tg-verify.pdf', '-'], { stdio: ['ignore', 'pipe', 'ignore'] })
        .toString('utf8').replace(/[\u200e\u200f\u202a-\u202e]/g, '');
      chars += '\n' + extra;
    } catch (e) { /* لا pdftotext — يبقى ActualText وحده كما كان */ }
    const pages = (s2.match(/\/Type\s*\/Page[^s]/g) || []).length;
    // Latin text (JS/CSS source) would show up as plain glyph runs
    const latin = (chars.match(/[A-Za-z]{6,}/g) || []);
    const codey = /function |var |const |=>|\{|\}|display:none|<script|\.js/.test(chars);
    ok('لا شيفرة ولا HTML في نصّ الورقة', !codey, codey ? chars.slice(0, 120) : '');
    ok('ولا كتل لاتينية طويلة (شيفرة)', latin.length === 0, latin.slice(0, 4).join(','));
    /* الـPDF يخزّن الحروف بالترتيب البصريّ، فالعربية تخرج معكوسة —
       يُفحص الاتجاهان حتى لا يسقط فحصٌ على تفصيل ترميز. */
    const rev = [...chars].reverse().join('');
    const found = t => chars.includes(t) || rev.includes(t);
    /* تُفحص جذور الكلمات لا الكلمات كاملةً: تشكيل العربية في الـPDF يدمج
       «ال» أحياناً، فمطابقةٌ حرفيّة تسقط على تفصيل ترميز لا على عيب. */
    const arabic = (chars.match(/[\u0600-\u06FF]/g) || []).length;
    ok('ونصّ التقرير موجود',
       found('تقرير') && found('مشتركة') && found('مبلغ') && arabic > 30,
       `${arabic} حرفاً · ${rev.slice(0, 50)}`);
    ok('وعدد الصفحات معقول (≤2)', pages <= 2, String(pages));
    console.log(`     نصّ الورقة: «${chars.slice(0, 90)}»`);
    await ctx.close();
  }

  await browser.close(); srv.close();
  console.log(`\n${fails === 0 ? '✓ كل فحوص التحقّق اجتازت.' : '✗ ' + fails + ' فحصاً سقط.'}`);
  process.exit(fails === 0 ? 0 : 1);
})();
