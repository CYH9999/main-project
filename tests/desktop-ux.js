/* ============================================================================
   تبارك جيم — اختبارات تجربة سطح المكتب (المرحلة 4.2)

   ما الذي يُقاس هنا؟ الأشياء التي شكت منها المستخدمة بعد المرحلة 4.1، ولكلّ
   منها قياسٌ لا وصف:

     · الإقلاع    — النافذة الرئيسية مخفيّة حتى تجهز، والجاهزية تُعلَن مرّة،
                    وتُعلَن حتى حين يفشل الإقلاع.
     · الشعار     — أبعاده المرسومة لا تتغيّر بتغيّر أبعاد الملف المرفوع.
                    تُقاس بالبكسل على أربعة مصادر ونسبتين متطرّفتين.
     · ملف الموظفة — يُقرأ كلّه بلا فتح «تعديل»، والصلاحيات تحكم ما يُقرأ.
     · مركز الملفات — يجد ما صُدِّر وما نُسخ، ويفتحه، ويقول أين هو بالعربية.
     · الطباعة    — لا طريق إلى معاينة متصفّح WebView2، ولا عدّاد يزيد على
                    طباعة لم تقع، والإلغاء لا يترك حالة عالقة.

   والجسر المزيّف هو نفسه المستعمَل في `desktop-io.js` — قاعدة محاكاة واحدة
   لا اثنتان.

   وما لا يُثبَت هنا (ومكتوب في تقرير المرحلة صراحةً): أن `ShowPrintUI` تفتح
   حوار ويندوز، وأن `explorer.exe` يفتح الملف ببرنامجه. ذلك يُختبر على ويندوز
   وحده — ولا يُدّعى من لينكس.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { tauriAsset } = require('./tauri-runtime.js');
const { installBridge } = require('./desktop-io.js');

const ROOT = path.join(__dirname, '..');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const DIST = path.join(ROOT, 'app', 'index.html');
/* النسخة تُقرأ من مصدرها لا تُكتب في الاختبار. المقيس هو **الاتّفاق** بين
   المواضع الأربعة، لا رقمٌ بعينه — ورقمٌ مكتوب هنا يسقط مع كل ترقية. */
const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

module.exports = function register({ group, record, TESTS_JS }) {
  const conf = () => JSON.parse(fs.readFileSync(CONF, 'utf8'));

  function serveDesktop() {
    const csp = conf().app.security.csp;
    return new Promise(res => {
      /* الترميز يُعلن صحيحاً: محرّك العرض يرفض تشغيل فيديو يصله بنوع
         text/html مهما كان محتواه سليماً — وهذا يُخفي عيباً حقيقياً أو
         يخترع واحداً غير موجود. */
      const TYPES = { '.js':'text/javascript; charset=utf-8', '.html':'text/html; charset=utf-8',
                      '.webm':'video/webm', '.mp4':'video/mp4', '.jpg':'image/jpeg',
                      '.png':'image/png', '.txt':'text/plain; charset=utf-8' };
      const srv = http.createServer((req, r) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        /* يُقدَّم مجلّد البناء كما يقدّمه Tauri: الصفحة وأصول المقدّمة بجانبها */
        const file = u === '/' ? DIST
          : u.startsWith('/intro/') ? path.join(ROOT, 'app', u.replace(/^\//, ''))
          : path.join(ROOT, u.replace(/^\//, ''));
        if (!fs.existsSync(file)) { r.writeHead(404); return r.end('nf'); }
        const ext = path.extname(file).toLowerCase();
        /* الصفحة وسياستها كما يقدّمهما Tauri فعلاً (tests/tauri-runtime.js) */
        const served = file === DIST ? tauriAsset(fs.readFileSync(file, 'utf8'), conf()) : null;
        const body = served ? Buffer.from(served.body, 'utf8') : fs.readFileSync(file);
        r.writeHead(200, {
          'Content-Type': TYPES[ext] || 'application/octet-stream',
          'Content-Length': body.length,
          'Accept-Ranges': 'bytes',
          'Content-Security-Policy': (served && served.csp) || csp,
        });
        r.end(body);
      });
      srv.listen(0, '127.0.0.1', () => res(srv));
    });
  }

  /* يفتح التطبيق كما يُفتح في تطبيق ويندوز: الجسر مركَّب، ولا نوافذ منبثقة */
  async function openDesktop(browser, url, opts = {}) {
    const ctx = await browser.newContext(opts.context || {});
    await ctx.addInitScript(() => { window.open = function () { return null; }; });
    await ctx.addInitScript(installBridge, { fail: opts.fail || {}, version: VER });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    const noise = t => /favicon|404/i.test(t) || (opts.expectLogged && /^\[TG\]/.test(t));
    page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);
    await page.evaluate(TESTS_JS);
    return { ctx, page, errors };
  }

  /* المتصفّح العادي — بلا جسر. للتحقّق أن سلوك المتصفح لم يتغيّر. */
  async function openBrowser(browser, url, opts = {}) {
    const ctx = await browser.newContext(opts.context || {});
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);
    await page.evaluate(TESTS_JS);
    return { ctx, page, errors };
  }

  /* صورة مربّعة أو مستطيلة بالحجم المطلوب — تُرفع كما يُرفع ملفٌ حقيقي */
  const MAKE_IMAGE = `async (w, h, type) => {
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const x = c.getContext('2d');
    x.fillStyle = '#C43E6B'; x.fillRect(0, 0, w, h);
    x.fillStyle = '#FFFFFF'; x.fillRect(w * 0.2, h * 0.4, w * 0.6, h * 0.2);
    const blob = await new Promise(r => c.toBlob(r, type || 'image/png'));
    return new File([blob], 'logo-' + w + 'x' + h + '.png', { type: type || 'image/png' });
  }`;

  /* ===================================================================== *
   * 1) دورة حياة الإقلاع ونافذة البدء                                     *
   * ===================================================================== */
  group('سطح المكتب — الإقلاع ونافذة البدء', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errors = [];
    try {
      const a = await openDesktop(browser, url);
      errors = a.errors;

      const fs1 = await a.page.evaluate(() => ({
        revealed: window.__TG_FS__.revealed,
        readyCalls: window.__TG_FS__.calls.filter(c => c.cmd === 'tg_ready').length,
      }));
      ok('الواجهة أعلنت جاهزيتها للغلاف', fs1.revealed);
      ok('ونُوديت مرّة واحدة لا أكثر', fs1.readyCalls === 1, fs1.readyCalls);

      /* الجاهزية تُعلَن **بعد** أن يصير في الشاشة ما يُرى: كشفُ نافذة على
         هيكل فارغ هو نفس العيب الذي جاءت نافذة البدء لتمنعه. */
      const painted = await a.page.evaluate(() => {
        const v = document.getElementById('viewRoot');
        const gate = document.querySelector('.gate');
        return { html: (v && v.innerHTML.length) || 0, nav: document.querySelectorAll('.nav-item').length,
                 gate: !!gate };
      });
      ok('والشاشة مرسومة قبل الكشف — لا نافذة على فراغ', painted.html > 200, painted.html);
      ok('والتنقّل مبنيّ', painted.nav > 5, painted.nav);

      /* المدّة المقاسة: كم استغرق الإقلاع فعلاً حتى إعلان الجاهزية */
      const ms = await a.page.evaluate(() => {
        const t = performance.getEntriesByType('navigation')[0];
        return Math.round((t && t.domContentLoadedEventEnd) || 0);
      });
      ok('الإقلاع لا يُبطّأ بانتظار مفتعل في الواجهة', ms >= 0, `DOMContentLoaded=${ms}ms`);
      const src = fs.readFileSync(path.join(ROOT, 'tabarak-gym 3.0.html'), 'utf8');
      ok('ولا مهلة اصطناعية قبل إعلان الجاهزية',
         !/setTimeout\([^)]*Desktop\.ready/.test(src));

      /* مركز الملفات يظهر في التنقّل على سطح المكتب */
      const navHas = await a.page.evaluate(() =>
        [...document.querySelectorAll('.nav-item')].some(b => b.dataset.route === 'files'));
      ok('مدخل «ملفات تبارك جيم» ظاهر في تطبيق سطح المكتب', navHas);

      await a.ctx.close();

      /* ---- الإقلاع الفاشل: الجاهزية تُعلَن أيضاً ----
         وإلا بقيت المستخدمة أمام شعار لا ينتهي ولا تعرف أن شيئاً فشل. */
      const ctx = await browser.newContext();
      await ctx.addInitScript(installBridge, { fail: {}, version: VER });
      /* تُكسر قاعدة البيانات قبل أي سطر: IndexedDB والتخزين المحلي معاً */
      await ctx.addInitScript(() => {
        try { Object.defineProperty(window, 'indexedDB', { get(){ throw new Error('منع الاختبار'); } }); } catch (e) {}
        const boom = { getItem(){ throw new Error('منع الاختبار'); }, setItem(){ throw new Error('منع الاختبار'); },
                       removeItem(){ throw new Error('منع الاختبار'); }, key(){ return null; }, clear(){}, length: 0 };
        try { Object.defineProperty(window, 'localStorage', { get(){ return boom; } }); } catch (e) {}
      });
      const p2 = await ctx.newPage();
      await p2.goto(url, { waitUntil: 'domcontentloaded' });
      await p2.waitForFunction(() => window.__TG_FS__ &&
        window.__TG_FS__.calls.some(c => c.cmd === 'tg_ready'), null, { timeout: 60000 }).catch(() => {});
      const failState = await p2.evaluate(() => ({
        revealed: !!(window.__TG_FS__ && window.__TG_FS__.revealed),
        ready: !!(window.__TG_FS__ && window.__TG_FS__.calls.some(c => c.cmd === 'tg_ready')),
      }));
      ok('إقلاع متعثّر يُعلن الجاهزية كذلك — لا نافذة بدء عالقة', failState.ready && failState.revealed,
         JSON.stringify(failState));
      await ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('سطح المكتب — الإقلاع ونافذة البدء', rows, errors);
  });

  /* ===================================================================== *
   * 2) المقدّمة الافتتاحية وتقليل الحركة                                  *
   * ===================================================================== */
  group('سطح المكتب — المقدّمة الافتتاحية', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const port = srv.address().port;
    const open = async (opts, query) => {
      const ctx = await browser.newContext(opts || {});
      const page = await ctx.newPage();
      await page.goto(`http://127.0.0.1:${port}/${query == null ? '' : query}`,
                      { waitUntil: 'domcontentloaded' });
      return { ctx, page };
    };
    try {
      /* ---------- 1) الشكل: تملأ النافذة، لا مربّع في وسطها ---------- */
      {
        const { ctx, page } = await open({ viewport: { width: 1280, height: 800 } });
        /* تُقاس **قبل** أن تنتهي: هذا هو ما تراه المستخدمة أول ثانية */
        await page.waitForSelector('#introRoot.intro video', { timeout: 15000 });
        const box = await page.evaluate(() => {
          const el = document.getElementById('introRoot');
          const v = el.querySelector('video');
          const r = el.getBoundingClientRect();
          const c = getComputedStyle(el), cv = getComputedStyle(v);
          return { w: Math.round(r.width), h: Math.round(r.height),
                   vw: window.innerWidth, vh: window.innerHeight,
                   pos: c.position, z: Number(c.zIndex), fit: cv.objectFit,
                   muted: v.muted, autoplayAttr: v.hasAttribute('controls'),
                   sources: [...v.querySelectorAll('source')].map(x => x.getAttribute('src')) };
        });
        ok('المقدّمة تملأ النافذة كلّها — لا مربّع صغير',
           box.w === box.vw && box.h === box.vh, `${box.w}×${box.h} من ${box.vw}×${box.vh}`);
        ok('وهي فوق كل شيء', box.pos === 'fixed' && box.z >= 1000, `${box.pos} z=${box.z}`);
        ok('والفيديو يملأ الإطار بلا تمطيط', box.fit === 'cover', box.fit);
        ok('وهو مكتوم — شرط التشغيل التلقائي', box.muted === true);
        ok('ولا أزرار متصفّح عليه', box.autoplayAttr === false);
        ok('ومصادره WebM أولاً ثم MP4',
           box.sources[0] === 'intro/intro.webm' && box.sources[1] === 'intro/intro.mp4',
           box.sources.join(' · '));

        /* لا لوحة تحكّم ولا شاشة دخول تُرى تحتها */
        const behind = await page.evaluate(() => {
          const gate = document.querySelector('.gate');
          const el = document.getElementById('introRoot');
          const mid = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
          return { gateVisible: !!gate && getComputedStyle(gate).display !== 'none',
                   topmost: !!el && (mid === el || el.contains(mid)),
                   bg: getComputedStyle(el).backgroundColor };
        });
        ok('ولا شيء يُرى تحتها — هي ما يقع تحت المؤشّر في وسط الشاشة', behind.topmost);
        ok('وخلفيتها داكنة لا بيضاء',
           /rgb\(36, 24, 38\)|rgb\(36,24,38\)/.test(behind.bg), behind.bg);
        await ctx.close();
      }

      /* ---------- 2) الفيديو يعمل فعلاً في محرّك العرض ---------- */
      {
        const { ctx, page } = await open();
        const played = await page.evaluate(async () => {
          const v = document.querySelector('#introRoot video');
          if (!v) return { ok: false, why: 'لا فيديو' };
          await new Promise(r => {
            if (v.readyState >= 2) return r();
            v.addEventListener('loadeddata', r, { once: true });
            setTimeout(r, 12000);
          });
          const t0 = v.currentTime;
          await new Promise(r => setTimeout(r, 700));
          return { ok: true, w: v.videoWidth, h: v.videoHeight,
                   dur: Math.round(v.duration * 100) / 100,
                   advanced: v.currentTime > t0, src: v.currentSrc.split('/').pop(),
                   err: v.error ? v.error.code : null };
        });
        ok('الفيديو يُفكّ ترميزه ويُعرض', played.ok && !played.err && played.w > 0,
           `${played.w}×${played.h} خطأ=${played.err}`);
        ok('وهو 2K كما سُلّم (2560×1440)', played.w === 2560 && played.h === 1440,
           `${played.w}×${played.h}`);
        ok('ويعمل فعلاً — الزمن يتقدّم', played.advanced === true);
        ok('والمشغَّل هو WebM', played.src === 'intro.webm', played.src);
        await ctx.close();
      }

      /* ---------- 3) تنتهي إلى شاشة الدخول ولا تعلق ---------- */
      {
        const { ctx, page } = await open();
        /* التخطّي يُضغط **قبل** أن تنتهي المقدّمة وحدها — وإلا لما قِيس
           شيء: انتظارُ `TG.ready` أوّلاً ينتظر المقدّمة كلّها، فتكون قد
           انتهت قبل الضغطة ويمرّ الاختبار بلا أن يجرّب ما يدّعي تجربته. */
        await page.waitForSelector('#introSkip', { timeout: 15000 });
        const t0 = Date.now();
        await page.evaluate(() => document.getElementById('introSkip').click());
        await page.waitForFunction(() => !document.getElementById('introRoot'), null, { timeout: 8000 })
          .catch(() => {});
        const skipMs = Date.now() - t0;
        ok('التخطّي يُنهيها قبل نهايتها الطبيعية (5 ثوانٍ)', skipMs < 3000, `${skipMs}ms`);
        await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
        await page.evaluate(() => window.TG.ready);
        const after = await page.evaluate(() => ({
          gone: !document.getElementById('introRoot'),
          gate: !!document.querySelector('.gate') || !document.body.classList.contains('locked')
        }));
        ok('والمقدّمة مرفوعة من الصفحة بعدها', after.gone);
        ok('وما بعدها شاشة يمكن استعمالها', after.gate);
        await ctx.close();
      }

      /* ---------- 4) تقليل الحركة: إطار ثابت لا فيديو ---------- */
      {
        const { ctx, page } = await open({ reducedMotion: 'reduce' });
        const still = await page.evaluate(() => {
          const el = document.getElementById('introRoot');
          if (!el) return { absent: true };
          return { absent: false, video: !!el.querySelector('video'),
                   still: !!el.querySelector('.intro-still') };
        });
        ok('تقليل الحركة: لا فيديو يُحمَّل', still.absent || !still.video,
           JSON.stringify(still));
        await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
        await page.evaluate(() => window.TG.ready);
        await page.waitForFunction(() => !document.getElementById('introRoot'), null, { timeout: 8000 })
          .catch(() => {});
        ok('ولا تبقى على الشاشة',
           await page.evaluate(() => !document.getElementById('introRoot')));
        await ctx.close();
      }

      /* ---------- 5) `?intro=0` يُطفئها — وهو ما تستعمله المجموعة ---------- */
      {
        const { ctx, page } = await open({}, '?intro=0');
        await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
        await page.evaluate(() => window.TG.ready);
        ok('`?intro=0` يُطفئ المقدّمة تماماً',
           await page.evaluate(() => !document.getElementById('introRoot')));
        await ctx.close();
      }

      /* ---------- 6) القواعد المكتوبة: النافذة مكبّرة ومخفيّة ---------- */
      {
        const conf = JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'tauri.conf.json'), 'utf8'));
        const wins = conf.app.windows;
        ok('نافذة واحدة لا اثنتان — لا نافذة بدء صغيرة', wins.length === 1, wins.length);
        const w = wins[0];
        ok('وتُنشأ مكبّرة', w.maximized === true);
        ok('ومخفيّة حتى تصير المقدّمة على الشاشة', w.visible === false);
        ok('وبخلفية داكنة فلا ومضة بيضاء', w.backgroundColor === '#241826', w.backgroundColor);
        const rustMain = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'main.rs'), 'utf8');
        ok('والغلاف يُكبّرها قبل إظهارها', /let _ = main\.maximize\(\);[\s\S]{0,120}let _ = main\.show\(\);/
           .test(rustMain));
        ok('ولا أثر لنافذة البدء القديمة',
           !/splash/i.test(rustMain) && !fs.existsSync(path.join(ROOT, 'desktop', 'splash.html')));
        ok('والحارس الزمني باقٍ — لا نافذة تبقى مخفيّة',
           /REVEAL_WATCHDOG_MS/.test(rustMain));
        ok('والواجهة هي من تُبلّغ بتفضيل الحركة',
           /reducedMotion:this\.reducedMotion\(\)/.test(fs.readFileSync(DIST, 'utf8')));
      }

      /* ---------- 7) سياسة الحركة العامّة في التطبيق لم تُمسّ ---------- */
      {
        const ctx2 = await browser.newContext({ reducedMotion: 'reduce' });
        const p = await ctx2.newPage();
        await p.goto(`http://127.0.0.1:${port}/?intro=0`, { waitUntil: 'domcontentloaded' });
        await p.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
        await p.evaluate(() => window.TG.ready);
        const viewAnim = await p.evaluate(() => {
          const v = document.querySelector('.view');
          return v ? getComputedStyle(v).animationName : 'missing';
        });
        ok('تقليل الحركة يُوقف انتقال الشاشات كما كان', viewAnim === 'none', viewAnim);
        const headAnim = await p.evaluate(async () => {
          window.TG.go('members'); window.TG.renderRoute();
          await new Promise(r => setTimeout(r, 120));
          const h = document.getElementById('pageTitle');
          return { anim: getComputedStyle(h).animationName,
                   marked: h.parentElement.classList.contains('head-in') };
        });
        ok('وعنوان الصفحة كذلك لا يتحرّك', headAnim.anim === 'none', headAnim.anim);
        ok('ومع ذلك يُعلَّم تغيّر الشاشة (الحركة وحدها هي المعطّلة)', headAnim.marked);
        await ctx2.close();
      }
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('سطح المكتب — المقدّمة الافتتاحية', rows, []);
  });

  /* ===================================================================== *
   * 2ب) الانتقال بين الشاشات والتركيز                                      *
   * ===================================================================== */
  group('سطح المكتب — انتقال الشاشات والتركيز', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openDesktop(browser, url);
      errors = a.errors;
      const out = await a.page.evaluate(async () => {
        const TG = window.TG;
        const go = async (r, p) => { TG.go(r, p); TG.renderRoute(); await new Promise(x => setTimeout(x, 150)); };

        await go('members');
        const onMembers = {
          focus: document.activeElement && document.activeElement.id,
          title: document.getElementById('pageTitle').textContent,
          sub: document.getElementById('pageSub').textContent,
          active: [...document.querySelectorAll('.nav-item.active')].map(b => b.dataset.route),
          headMarked: document.getElementById('pageTitle').parentElement.classList.contains('head-in'),
          viewAnim: getComputedStyle(document.querySelector('.view')).animationName,
        };

        await go('staff');
        const onStaff = {
          focus: document.activeElement && document.activeElement.id,
          title: document.getElementById('pageTitle').textContent,
          active: [...document.querySelectorAll('.nav-item.active')].map(b => b.dataset.route),
        };

        /* إعادة رسم على الشاشة نفسها: التركيز لا يُنتزع ممّا في اليد */
        const inp = document.querySelector('#stQ');
        if (inp) inp.focus();
        const beforeId = document.activeElement && document.activeElement.id;
        TG.renderRoute();
        await new Promise(x => setTimeout(x, 120));
        const sameScreen = { before: beforeId,
                             after: document.activeElement && document.activeElement.id };

        /* نافذة مفتوحة: التركيز يبقى فيها لا تحتها */
        TG.UI.modal({ title: 'اختبار', body: '<input class="inp" id="tstIn">' });
        await new Promise(x => setTimeout(x, 150));
        await go('members');
        const withModal = { focus: document.activeElement && document.activeElement.id,
                            open: !!document.querySelector('.overlay') };
        /* Escape يغلقها */
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await new Promise(x => setTimeout(x, 120));
        const closed = !document.querySelector('.overlay');

        /* التوسيط: نافذة قصيرة في وسط الشاشة، وطويلة تبدأ من أعلاها
           ويبقى عنوانها مرئيّاً — لا مقصوصاً فوق الحافة. */
        const geom = () => { const o = document.querySelector('.overlay');
          const m = o && o.querySelector('.modal');
          if (!m) return null;
          const r = m.getBoundingClientRect();
          const body = m.querySelector('.modal-body');
          return { top: Math.round(r.top), bottom: Math.round(r.bottom),
                   h: Math.round(r.height), vh: window.innerHeight,
                   left: Math.round(r.left), right: Math.round(r.right), vw: window.innerWidth,
                   scrolls: !!body && body.scrollHeight > body.clientHeight + 2 };
        };
        /* يُنتظر انتهاء حركة الظهور (pop .16s) قبل القياس: القياس أثناءها
           يقرأ إزاحة ثمانية بكسلات فيبدو التوسيط مختلاً وهو سليم. */
        const settled = async () => {
          const m = document.querySelector('.overlay .modal');
          if (m && m.getAnimations) await Promise.all(m.getAnimations().map(an => an.finished.catch(() => {})));
          await new Promise(x => setTimeout(x, 60));
        };
        TG.UI.modal({ title: 'قصيرة', body: '<p>نص</p>' });
        await settled();
        const shortG = geom();
        document.querySelectorAll('.overlay').forEach(o => o.remove());
        TG.UI.stack.length = 0;

        TG.UI.modal({ title: 'طويلة', size: 'wide',
          body: '<p>سطر</p>'.repeat(400) });
        await settled();
        const tallG = geom();
        document.querySelectorAll('.overlay').forEach(o => o.remove());
        TG.UI.stack.length = 0;
        return { onMembers, onStaff, sameScreen, withModal, closed, shortG, tallG };
      });

      ok('عنوان الشاشة ظاهر دائماً', /المشتركات/.test(out.onMembers.title), out.onMembers.title);
      ok('ومعه سياقها تحته', (out.onMembers.sub || '').length > 0, out.onMembers.sub);
      ok('والقسم الحالي مُضاء في التنقّل',
         out.onMembers.active.length === 1 && out.onMembers.active[0] === 'members',
         out.onMembers.active.join('،'));
      ok('الانتقال مرئيّ: للمحتوى حركة قصيرة',
         out.onMembers.viewAnim && out.onMembers.viewAnim !== 'none', out.onMembers.viewAnim);
      ok('والعنوان يتحرّك معه لا بعده', out.onMembers.headMarked);
      ok('التركيز ينتقل إلى المحتوى الجديد', out.onMembers.focus === 'viewRoot', out.onMembers.focus);
      ok('وعند الانتقال الثاني كذلك', out.onStaff.focus === 'viewRoot', out.onStaff.focus);
      ok('وتغيّر العنوان مع الشاشة', /الفريق/.test(out.onStaff.title), out.onStaff.title);
      ok('وانتقل التمييز معه',
         out.onStaff.active.length === 1 && out.onStaff.active[0] === 'staff', out.onStaff.active.join('،'));
      /* إعادة الرسم على الشاشة نفسها تُعيد بناء محتواها، فالحقل الذي كان
         تحت الإصبع يزول — وهذا سلوك قديم لم تُحدثه هذه المرحلة. ما يخصّها
         هو ألّا تُضيف فوقه انتزاعاً ثانياً: لا تُنقل الشاشة التركيز إلى
         نفسها حين لم تتغيّر. */
      ok('إعادة الرسم على الشاشة نفسها لا تنقل التركيز إلى المحتوى',
         out.sameScreen.after !== 'viewRoot',
         `${out.sameScreen.before} ⇐ ${out.sameScreen.after || '(بلا)'}`);
      ok('ونافذة مفتوحة تحتفظ بتركيزها', out.withModal.focus !== 'viewRoot' && out.withModal.open,
         out.withModal.focus);
      ok('وEscape يغلقها', out.closed);
      /* توسيط أفقي في الحالتين، وتوسيط رأسيّ للقصيرة وحدها */
      const hCentre = g => g && Math.abs((g.left) - (g.vw - g.right)) <= 2;
      ok('النافذة القصيرة مُوسَّطة أفقياً', hCentre(out.shortG),
         out.shortG && `${out.shortG.left}/${out.shortG.vw - out.shortG.right}`);
      ok('ومُوسَّطة رأسياً',
         out.shortG && Math.abs(out.shortG.top - (out.shortG.vh - out.shortG.bottom)) <= 2,
         out.shortG && `${out.shortG.top}/${out.shortG.vh - out.shortG.bottom}`);
      ok('والنافذة الطويلة مُوسَّطة أفقياً كذلك', hCentre(out.tallG),
         out.tallG && `${out.tallG.left}/${out.tallG.vw - out.tallG.right}`);
      ok('وأعلاها يبقى مرئيّاً — لا يُقصّ فوق الحافة',
         out.tallG && out.tallG.top >= 0, out.tallG && out.tallG.top);
      /* والمحتوى الطويل يُمرَّر داخل جسم النافذة (max-height:70vh) لا بخروج
         النافذة عن الشاشة — فتبقى الترويسة والأزرار في المكان نفسه دائماً. */
      ok('وأسفلها كذلك داخل الشاشة',
         out.tallG && out.tallG.bottom <= out.tallG.vh + 1,
         out.tallG && `${out.tallG.bottom} ≤ ${out.tallG.vh}`);
      ok('والمحتوى الطويل يُمرَّر داخل جسم النافذة', out.tallG && out.tallG.scrolls);
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('سطح المكتب — انتقال الشاشات والتركيز', rows, errors);
  });

  /* ===================================================================== *
   * 2ج) هويّة البناء وسلسلة الإثبات                                        *
   * ===================================================================== */
  group('البناء — هويّة يُفرَّق بها بين نسختين', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      /* ---------- في التطبيق: الهويّة تُقرأ من الجسر وتُعرض ---------- */
      const a = await openDesktop(browser, url);
      errors = a.errors;
      const shown = await a.page.evaluate(async () => {
        await window.TG.Build.load();
        window.TG.go('settings'); window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 300));
        return { ver: document.getElementById('verLabel').textContent,
                 label: window.TG.Build.label(),
                 details: window.TG.Build.details(),
                 settings: document.getElementById('viewRoot').innerText,
                 info: window.TG.Build.info };
      });
      /* الرقم يُقرأ من `package.json` لا يُكتب هنا: رقمٌ مكتوب في الاختبار
         يسقط مع كل ترقية نسخة ولا يُثبت شيئاً عن الاتّفاق. والاتّفاق نفسه
         مقيس أدناه. */
      ok('الشريط الجانبي يعرض النسخة ومعرّف البناء',
         new RegExp('الإصدار ' + VER.replace(/\./g, '\\.')).test(shown.ver)
         && /Build a1b2c3d-ci42/.test(shown.ver), shown.ver);
      ok('والمعرّف هو الذي جاء من الجسر بالحرف',
         shown.label === 'Build a1b2c3d-ci42', shown.label);
      ok('والتفصيل يحمل البصمة المختصرة وتاريخ البناء',
         /a1b2c3d-ci42/.test(shown.details) && /a1b2c3d/.test(shown.details), shown.details);
      ok('والإعدادات تعرضه ليُذكر عند الإبلاغ',
         /a1b2c3d-ci42/.test(shown.settings) && /معرّف النسخة المثبَّتة/.test(shown.settings));
      ok('والبصمة الكاملة متاحة لا مقطوعة',
         shown.info.git_sha === 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', shown.info.git_sha);
      ok('ومعها بصمة الواجهة التي يحملها هذا البناء',
         shown.info.frontend_sha === 'deadbeef', shown.info.frontend_sha);

      /* الواجهة لا تخترع شيئاً: بلا جسر لا هويّة */
      const invented = await a.page.evaluate(() => {
        const src = document.documentElement.outerHTML;
        /* لا بصمة مكتوبة في الواجهة، ولا تاريخ بناء محسوب فيها */
        return { hardSha: /git_sha\s*[:=]\s*['"][0-9a-f]{40}['"]/.test(src),
                 selfDate: /build_at\s*[:=]\s*(Date\.now|new Date)/.test(src) };
      });
      ok('لا بصمة مكتوبة في شيفرة الواجهة', !invented.hardSha);
      ok('ولا تاريخ بناء تحسبه الواجهة لنفسها', !invented.selfDate);
      await a.ctx.close();

      /* ---------- في المتصفّح: لا هويّة، ولا قيمة بديلة مخترَعة ---------- */
      const b = await openBrowser(browser, url);
      const bare = await b.page.evaluate(async () => {
        await window.TG.Build.load();
        return { info: window.TG.Build.info, label: window.TG.Build.label(),
                 details: window.TG.Build.details(),
                 ver: document.getElementById('verLabel').textContent };
      });
      ok('المتصفح بلا هويّة بناء — ولا بديل مخترَع',
         bare.info === null && bare.label === '' && bare.details === '',
         JSON.stringify(bare.label));
      ok('ويكتفي برقم النسخة', bare.ver.trim() === `الإصدار ${VER}`, bare.ver);
      await b.ctx.close();

      /* ---------- سلسلة الإثبات في المستودع نفسه ---------- */
      const conf = JSON.parse(fs.readFileSync(CONF, 'utf8'));
      const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
      const cargo = fs.readFileSync(path.join(ROOT, 'src-tauri', 'Cargo.toml'), 'utf8');
      const appHtml = fs.readFileSync(path.join(ROOT, 'tabarak-gym 3.0.html'), 'utf8');
      const appVer = (appHtml.match(/const APP = \{[^}]*version:'([^']+)'/) || [])[1];
      ok('النسخة معلَنة ومرقَّمة لا فارغة', /^\d+\.\d+\.\d+$/.test(conf.version), conf.version);
      ok('ومتّفقة في المواضع الأربعة',
         pkg.version === conf.version
         && new RegExp('^version = "' + VER.replace(/\./g, '\\.') + '"', 'm').test(cargo)
         && appVer === conf.version,
         `pkg=${pkg.version} cargo=${(cargo.match(/^version = "([^"]+)"/m)||[])[1]} app=${appVer}`);
      ok('والمخطّط ما زال 8', /schema:8/.test(appHtml));

      const buildRs = fs.readFileSync(path.join(ROOT, 'src-tauri', 'build.rs'), 'utf8');
      ok('هويّة البناء تُخبز وقت الترجمة لا وقت التشغيل',
         /rustc-env=TG_GIT_SHA/.test(buildRs) && /rustc-env=TG_BUILD_ID/.test(buildRs)
         && /rustc-env=TG_FRONTEND_SHA/.test(buildRs));
      ok('وتُقرأ من بيئة CI أولاً ثم من git', /GITHUB_SHA/.test(buildRs) && /rev-parse/.test(buildRs));
      ok('وتُعاد قراءتها حين يتغيّر الالتزام',
         /rerun-if-env-changed=GITHUB_SHA/.test(buildRs) && /rerun-if-changed=\.\.\/\.git\/HEAD/.test(buildRs));

      /* نهايات الأسطر: بلا سياسة، يخرج المسحوب على ويندوز ببصمة أخرى */
      const attrs = fs.existsSync(path.join(ROOT, '.gitattributes'))
        ? fs.readFileSync(path.join(ROOT, '.gitattributes'), 'utf8') : '';
      ok('سياسة نهايات الأسطر مكتوبة — LF في كل نظام',
         /^\* text=auto eol=lf$/m.test(attrs));
      ok('والملف الواحد بلا CRLF أصلاً', !/\r\n/.test(appHtml));
      await srv.close();
    } catch (e) { srv.close(); throw e; }
    record('البناء — هويّة يُفرَّق بها بين نسختين', rows, errors);
  });

  /* ===================================================================== *
   * 2د) خطّ البناء: لا مخرَج قديم يعود، ولا مثبّت بلا إثبات                *
   * ===================================================================== */
  group('خطّ البناء — بوّابات قبل المثبّت', async () => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const wf = fs.readFileSync(path.join(ROOT, '.github', 'workflows', 'windows-desktop.yml'), 'utf8');
    const job = wf.slice(wf.indexOf('installer:'));

    /* الذاكرة المؤقّتة: اعتماديات نعم، ناتج بناء لا — هذا مصدر المثبّت القديم */
    const cachePaths = (job.match(/path:\s*\|([\s\S]*?)key:/) || [])[1] || '';
    ok('الذاكرة المؤقّتة لا تحمل مجلّد البناء',
       !/src-tauri\/target\s*$/m.test(cachePaths) && !/target\/release/.test(cachePaths),
       cachePaths.trim().replace(/\s+/g, ' '));
    ok('بل سجلّ الحزم وحده',
       /cargo\/registry/.test(cachePaths) && /cargo\/git/.test(cachePaths));
    ok('ومساحة العمل تُنظَّف من أي ناتج بناء قبل البدء',
       /Remove-Item -Recurse -Force \$p/.test(job) && /src-tauri\/target\/release/.test(job));

    /* البوّابات الأربع، بالترتيب، وكلّها قبل الرفع */
    const at = needle => job.indexOf(needle);
    const gSource = at('verify-build.mjs source');
    const gFront = at('verify-build.mjs frontend');
    const gBin = at('verify-build.mjs binary');
    const gInst = at('verify-build.mjs installer');
    const build = at('tauri build --bundles nsis');
    const upload = at('upload-artifact');
    ok('بوّابة المصدر موجودة وقبل البناء', gSource > 0 && gSource < build, `${gSource} < ${build}`);
    ok('وبوّابة الواجهة المولَّدة قبل البناء', gFront > 0 && gFront < build);
    ok('وبوّابة الملف التنفيذي بعد البناء', gBin > build);
    ok('وبوّابة المثبّت كذلك', gInst > build);
    ok('وكلّها قبل رفع الحزمة',
       Math.max(gSource, gFront, gBin, gInst) < upload,
       `آخر بوّابة=${Math.max(gSource, gFront, gBin, gInst)} رفع=${upload}`);

    /* أصدق بوّابة: يُثبَّت المثبّت ويُقرأ ما ثُبّت */
    ok('المثبّت يُثبَّت فعلاً في CI ويُفحص ما ثُبّت',
       /Start-Process .*\/S.*\/D=/.test(job) && /binary \$installed\.FullName/.test(job));
    ok('وفشل التثبيت يُسقط البناء لا يُتجاوز',
       /throw "التثبيت الصامت/.test(job));

    /* اسم الحزمة يفرّق بين بناء وبناء */
    ok('اسم الحزمة يحمل رقم التشغيل وبصمة الالتزام',
       /name: tabarak-gym-windows-setup-run\$\{\{ github\.run_number \}\}-\$\{\{ github\.sha \}\}/.test(job));
    ok('ولا تُرفع حزمة فارغة', /if-no-files-found: error/.test(job));
    /* حزمة واحدة لا اثنتان: مثبّتان في ملفّ واحد هو أصل الالتباس */
    ok('المرفوع مثبّت NSIS وحده — لا MSI يلتبس به',
       /path: src-tauri\/target\/release\/bundle\/nsis\/\*\.exe/.test(job) && !/bundles msi/.test(job));

    /* الفرع: بناءٌ لا يقع أصلاً لا يُنتج شيئاً يُختبر */
    ok('كل فرع عمل يبني', /branches: \['claude\/\*\*'\]/.test(wf));

    record('خطّ البناء — بوّابات قبل المثبّت', rows, []);
  });

  /* ===================================================================== *
   * 3) الشعار: صندوق ثابت مهما كان المصدر                                 *
   * ===================================================================== */
  group('الهوية — صندوق الشعار ثابت', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openBrowser(browser, url, { context: { viewport: { width: 1440, height: 900 } } });
      errors = a.errors;

      const measure = async (w, h) => a.page.evaluate(async ([W, H, mk]) => {
        const file = await eval('(' + mk + ')')(W, H);
        await window.TG.Brand.setMedia('logo', file);
        window.TG.go('settings', { sec: 'brand' });
        window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 250));
        const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) }; };
        const info = window.TG.Brand.info('logo');
        /* أسطح مساحة العمل تُقاس أوّلاً، فالبوّابة تُخفيها حين تُقفل */
        const surfaces = {
          stored: info.width + '×' + info.height,
          sidebar: box(document.querySelector('.brand .brand-logo, .brand .brand-mark')),
          prevBox: box(document.querySelector('.media-drop .brand-prev')),
          prevImg: box(document.querySelector('[data-brand-prev="logo"]')),
          print: box(document.querySelector('.doc-head-brand .brand-logo')),
        };
        /* ما يُرسم فعلاً من الصورة داخل عنصرها: `object-fit:contain` يحفظ النسبة
           فيرسم أصغر من العنصر في أحد البُعدين. يُقاس المرسوم لا العنصر. */
        const pi = document.querySelector('[data-brand-prev="logo"]');
        if (pi && pi.naturalWidth){
          const r = pi.getBoundingClientRect(), k = Math.min(r.width / pi.naturalWidth, r.height / pi.naturalHeight);
          surfaces.prevPaint = { w: Math.round(pi.naturalWidth * k), h: Math.round(pi.naturalHeight * k),
                                 fit: getComputedStyle(pi).objectFit };
        }
        /* ثم شاشة الدخول **الحقيقية** — لا نسخة يبنيها الاختبار: نسخةُ
           الاختبار تُثبت ما كتبه الاختبار لا ما تراه المستخدمة. */
        window.TG.Gate.login();
        await new Promise(r => setTimeout(r, 120));
        surfaces.gate = box(document.querySelector('.gate .gate-head .brand-logo, .gate .gate-head .brand-mark'));
        surfaces.gateWrap = box(document.querySelector('.gate .gate-head .brand-box'));
        window.TG.Gate.close(); window.TG.Gate.unlock();
        window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 150));
        return surfaces;
      }, [w, h, MAKE_IMAGE]);

      /* ---- مربّعات بأحجام متباعدة: كل الأبعاد المرسومة متطابقة ---- */
      const squares = {};
      for (const d of [128, 512, 1024, 2400]) squares[d] = await measure(d, d);
      const ref = squares[128];
      ok('المصادر المربّعة الأربعة رُفعت وسُجّلت بأبعادها',
         [128, 512, 1024, 2400].every(d => squares[d].stored === `${d}×${d}`),
         Object.values(squares).map(x => x.stored).join('، '));
      ['sidebar', 'prevBox', 'gate', 'gateWrap', 'print'].forEach(surface => {
        const all = [128, 512, 1024, 2400].map(d => squares[d][surface]);
        const same = all.every(x => x && x.w === all[0].w && x.h === all[0].h);
        ok(`${surface}: الحجم المرسوم واحد من 128 إلى 2400`, same,
           all.map(x => x ? `${x.w}×${x.h}` : '—').join(' / '));
      });
      ok('الشريط الجانبي 38×38 كما كان', ref.sidebar.w === 38 && ref.sidebar.h === 38,
         `${ref.sidebar.w}×${ref.sidebar.h}`);
      ok('معاينة الإعدادات صندوق 120×120', ref.prevBox.w === 120 && ref.prevBox.h === 120,
         `${ref.prevBox.w}×${ref.prevBox.h}`);
      ok('شاشة الدخول 64×64 — ومقاسها من Brand.BOX لا من رقم في مكانها',
         ref.gate.w === 64 && ref.gate.h === 64, `${ref.gate.w}×${ref.gate.h}`);
      ok('وغلافه صندوق بالمقاس نفسه — المكان محجوز ولو لم تُحمَّل الصورة',
         ref.gateWrap.w === 64 && ref.gateWrap.h === 64, `${ref.gateWrap.w}×${ref.gateWrap.h}`);
      ok('أبعاد الطباعة لم تُمسّ — 54×54', ref.print.w === 54 && ref.print.h === 54,
         `${ref.print.w}×${ref.print.h}`);

      /* ---- نسب متطرّفة: الصورة تُحتوى ولا تتجاوز صندوقها أبداً ---- */
      const wide = await measure(2400, 600);
      const tall = await measure(600, 2400);
      ok('شعار عريض جداً: الصندوق لم يتغيّر',
         wide.prevBox.w === 120 && wide.prevBox.h === 120, `${wide.prevBox.w}×${wide.prevBox.h}`);
      ok('شعار طويل جداً: الصندوق لم يتغيّر',
         tall.prevBox.w === 120 && tall.prevBox.h === 120, `${tall.prevBox.w}×${tall.prevBox.h}`);
      ok('والصورة داخل صندوقها لا تتجاوزه (عريض)',
         wide.prevImg.w <= 120 && wide.prevImg.h <= 120, `${wide.prevImg.w}×${wide.prevImg.h}`);
      ok('والصورة داخل صندوقها لا تتجاوزه (طويل)',
         tall.prevImg.w <= 120 && tall.prevImg.h <= 120, `${tall.prevImg.w}×${tall.prevImg.h}`);
      ok('الشريط الجانبي لا يتمدّد لشعار عريض',
         wide.sidebar.w === 38 && wide.sidebar.h === 38, `${wide.sidebar.w}×${wide.sidebar.h}`);
      ok('ولا لشعار طويل', tall.sidebar.w === 38 && tall.sidebar.h === 38,
         `${tall.sidebar.w}×${tall.sidebar.h}`);
      ok('وشاشة الدخول لا تتمدّد لشعار عريض ولا طويل',
         wide.gateWrap.w === 64 && wide.gateWrap.h === 64 &&
         tall.gateWrap.w === 64 && tall.gateWrap.h === 64,
         `عريض ${wide.gateWrap.w}×${wide.gateWrap.h} · طويل ${tall.gateWrap.w}×${tall.gateWrap.h}`);
      /* النسبة محفوظة داخل الصندوق: contain لا تمطّ الصورة */
      const ratio = wide.prevPaint.w / Math.max(1, wide.prevPaint.h);
      ok('ونسبة الصورة محفوظة داخله (لا تمطيط)',
         wide.prevPaint.fit === 'contain' && ratio > 3.4 && ratio < 4.6, `${ratio.toFixed(2)} ${wide.prevPaint.fit}`);
      ok('والمرسوم من الصورة داخل صندوقه بهامشه',
         wide.prevPaint.w <= 120 - 2 * 12 && tall.prevPaint.h <= 120 - 2 * 12,
         `عريض ${wide.prevPaint.w}×${wide.prevPaint.h} · طويل ${tall.prevPaint.w}×${tall.prevPaint.h}`);

      /* ---- صورة متحرّكة: تُعرض حيّة على الشاشة وثابتة في الطباعة ---- */
      const gifBytes = fs.readFileSync(path.join(__dirname, 'fixtures-anim.gif')).toString('base64');
      const gif = await a.page.evaluate(async (b64) => {
        const bin = atob(b64); const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        await window.TG.Brand.setMedia('logo', new File([arr], 'anim.gif', { type: 'image/gif' }));
        window.TG.go('settings', { sec: 'brand' });
        window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 250));
        const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) }; };
        const st = window.TG.Brand.motionStatus();
        return { animated: window.TG.Brand.isAnimated('logo'),
                 rendering: st.logo.rendering,
                 printStill: window.TG.Brand.renderUrl('logo', true) === window.TG.Brand.stillUrl('logo'),
                 prevBox: box(document.querySelector('.media-drop .brand-prev')),
                 sidebar: box(document.querySelector('.brand .brand-logo')) };
      }, gifBytes);
      ok('شعار متحرّك: النظام يعرفه متحرّكاً', gif.animated);
      ok('ويُرسم حيّاً على الشاشة', gif.rendering === 'live', gif.rendering);
      ok('والمطبوع يأخذ الإطار الثابت', gif.printStill);
      ok('وصندوقه هو الصندوق نفسه — 120×120',
         gif.prevBox.w === 120 && gif.prevBox.h === 120, `${gif.prevBox.w}×${gif.prevBox.h}`);
      ok('وفي الشريط الجانبي 38×38', gif.sidebar.w === 38 && gif.sidebar.h === 38,
         `${gif.sidebar.w}×${gif.sidebar.h}`);

      /* ---- آخر سطح كان بلا صندوق: نافذة «اختبار الحركة» ----
         §6 يطلب تدقيق **كل** سطح يعرض الشعار على حدة. وهذا كان يعرض الملف
         الأصلي بسقفٍ (`max-height`) لا بصندوق، فمصدر 2400×600 يُرسم بعرض
         النافذة كاملاً. يُقاس هنا كما تُقاس بقيّة الأسطح. */
      const diag = await a.page.evaluate(async ([W, H, b64]) => {
        /* الزرّ لا يظهر إلا مع أصلٍ متحرّك — فاللافتة متحرّكة والشعار
           مصدرٌ عملاق بنسبة متطرّفة: هو المقيس هنا. */
        const bin = atob(b64); const arr = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
        await window.TG.Brand.setMedia('banner', new File([arr], 'anim.gif', { type: 'image/gif' }));
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d');
        x.fillStyle = '#C43E6B'; x.fillRect(0, 0, W, H);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const file = new File([blob], `logo-${W}x${H}.png`, { type: 'image/png' });
        await window.TG.Brand.setMedia('logo', file);
        window.TG.go('settings', { sec: 'brand' });
        window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 250));
        const btn = document.getElementById('bMotionTest');
        if (!btn) return { missing: true };
        btn.click();
        await new Promise(r => setTimeout(r, 250));
        const ov = document.querySelector('.overlay');
        const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) }; };
        /* الشعار أوّل صندوق في النافذة (`shot('logo')` قبل `shot('banner')`) */
        const wrap = box(ov.querySelector('.brand-box'));
        const img = box(ov.querySelector('.brand-box img'));
        const boxes = ov.querySelectorAll('.brand-box').length;
        const h = window.TG.UI.stack[window.TG.UI.stack.length - 1];
        if (h) h.close();
        await window.TG.Brand.clearMedia('banner');
        return { wrap, img, boxes };
      }, [2400, 600, gifBytes]);
      ok('نافذة اختبار الحركة: الشعار في صندوق ثابت 150×150',
         diag.wrap && diag.wrap.w === 150 && diag.wrap.h === 150, JSON.stringify(diag.wrap));
      ok('والصورة داخله لا تتجاوزه مهما كان المصدر',
         diag.img && diag.img.w <= 150 && diag.img.h <= 150, JSON.stringify(diag.img));
      ok('والأصلان معاً في صندوقيهما', diag.boxes === 2, diag.boxes);

      /* ---- الإرشاد المكتوب: مقاسات مقترحة لا شروط ---- */
      const guide = await a.page.evaluate(async () => {
        window.TG.go('settings', { sec: 'brand' }); window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 200));
        return document.body.innerText;
      });
      ok('الإعدادات تقترح 512 × 512 للشعار', /512\s*×\s*512/.test(guide));
      ok('وتقترح 1600 × 400 للّافتة', /1600\s*×\s*400/.test(guide));
      ok('وتقول إن المقاس اقتراح لا شرط', /اقتراح لا شرط/.test(guide));
      ok('وتقولها صراحةً: «المقاسات مقترحة وليست إلزامية»',
         /المقاسات مقترحة وليست إلزامية/.test(guide));
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('الهوية — صندوق الشعار ثابت', rows, errors);
  });

  /* ===================================================================== *
   * 3ب) بوّابة الدخول — لا مساحة عمل قبل الدخول                            *
   * ===================================================================== *
   * هذه أهمّ مجموعة في المرحلة، ومعيارها من §16 حرفيّاً:
   *
   *     «لا ترى المستخدمة لوحة التحكّم ولا الشريط الجانبي ولا بيانات ولا
   *      اسم مشتركة قبل الدخول — ولا للحظة.»
   *
   * وهي لا تُقاس بالنظر إلى الشاشة بعد استقرارها: طبقةٌ تغطّي ما تحتها
   * تنجح في ذلك الفحص وهي تحمل لوحة التحكّم كاملةً في الـDOM. فالمقيس
   * هنا شيئان:
   *   · **ما بُني**: لا تنقّل ولا شاشة ولا اسم مشتركة في الصفحة أصلاً.
   *   · **ما مرّ**: مراقبٌ يُركَّب قبل أوّل سطر من الواجهة ويسجّل كل لحظة
   *     ظهرت فيها مساحة العمل. فالومضة تُلتقط ولو دامت إطاراً واحداً.
   * ===================================================================== */
  /* ===================================================================== *
   * الدخول — حالة تحقّق تُرى، بلا حشو وبلا كذب                             *
   * ===================================================================== */
  group('الدخول — حالة التحقّق ومدّتها', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    const CRED = { name: 'أم تبارك', username: 'omtabarak', password: 'كلمة-مرور-طويلة' };
    try {
      const a = await openDesktop(browser, url);
      errors = a.errors;
      const p = a.page;
      await p.evaluate(async (cred) => {
        const { Settings, Auth } = window.TG;
        await Settings.set({ authEnabled: true });
        await Auth.setupFirstAdmin(cred);
        await Auth.logout();
      }, CRED);
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
      await p.evaluate(() => window.TG.ready);
      await p.waitForSelector('.gate #gGo', { timeout: 10000 });

      /* ---- 1) الحدّ الأدنى ليس تأخيراً يُضاف: الخطأ لا ينتظره ---- */
      const bad = await p.evaluate(async (cred) => {
        const t0 = Date.now();
        document.getElementById('gUser').value = cred.username;
        document.getElementById('gPass').value = 'كلمة-خاطئة-تماماً';
        document.getElementById('gGo').click();
        await new Promise(res => {
          const iv = setInterval(() => {
            const e = document.querySelector('#gErr');
            if (e && e.style.display === 'block') { clearInterval(iv); res(); }
          }, 15);
          setTimeout(() => { clearInterval(iv); res(); }, 9000);
        });
        return { ms: Date.now() - t0,
                 msg: (document.querySelector('#gErr') || {}).textContent || '',
                 stillWorking: !!document.querySelector('.gate-load'),
                 gate: !!document.querySelector('.gate'),
                 app: getComputedStyle(document.querySelector('.app')).display,
                 btn: document.getElementById('gGo').disabled,
                 pwCleared: document.getElementById('gPass').value === '' };
      }, CRED);
      ok('بيانات خاطئة: لا انتظار — الخطأ فوراً', bad.ms < 1200, `${bad.ms}ms`);
      ok('وطبقة التحقّق تُرفع في اللحظة نفسها', bad.stillWorking === false);
      ok('ولا يُفرَّق بين اسم غير موجود وكلمة خاطئة',
         /اسم المستخدمة أو كلمة المرور/.test(bad.msg), bad.msg);
      ok('ولا لوحة تحكّم', bad.gate === true && bad.app === 'none', bad.app);
      ok('والزرّ يعود قابلاً للضغط', bad.btn === false);
      ok('وكلمة المرور تُمسح بعد الفشل', bad.pwCleared);

      /* ---- 2) النجاح: الطبقة تُرى، وبالهوية، ثم لوحة التحكّم ---- */
      const good = await p.evaluate(async (cred) => {
        const t0 = Date.now();
        document.getElementById('gUser').value = cred.username;
        document.getElementById('gPass').value = cred.password;
        document.getElementById('gGo').click();
        /* أوّل لقطة: هل ظهرت الطبقة أصلاً، وماذا فيها؟ */
        await new Promise(r => setTimeout(r, 120));
        const el = document.querySelector('.gate-load');
        const seen = el ? {
          text: (el.querySelector('p') || {}).textContent || '',
          spin: !!el.querySelector('.gate-spin'),
          role: el.getAttribute('role'),
          live: el.getAttribute('aria-live'),
          /* داخل البطاقة لا بملء الشاشة: الترويسة فوقها لا تتحرّك */
          insideCard: !!el.closest('.gate-card'),
          coversForm: (() => {
            const c = el.closest('.gate-card').getBoundingClientRect();
            const r = el.getBoundingClientRect();
            return Math.round(r.width) === Math.round(c.width);
          })(),
          headerStill: !!document.querySelector('.gate-head .brand-box')
        } : null;
        const btnLabel = (document.getElementById('gGo') || {}).textContent || '';
        const btnDisabled = (document.getElementById('gGo') || {}).disabled;
        await new Promise(res => {
          const iv = setInterval(() => {
            if (!document.querySelector('.gate')) { clearInterval(iv); res(); }
          }, 20);
          setTimeout(() => { clearInterval(iv); res(); }, 20000);
        });
        return { seen, btnLabel, btnDisabled, total: Date.now() - t0,
                 app: getComputedStyle(document.querySelector('.app')).display,
                 gate: !!document.querySelector('.gate'),
                 load: !!document.querySelector('.gate-load'),
                 locked: document.body.classList.contains('locked'),
                 who: (document.getElementById('whoami') || {}).textContent || '',
                 min: window.TG.Gate.MIN_VISUAL_MS };
      }, CRED);
      ok('الضغط يُظهر حالة تحقّق', !!good.seen);
      ok('وفيها عبارة عربية تقول ما يجري',
         !!good.seen && /جارٍ التحقّق|جاري التحقق/.test(good.seen.text), good.seen && good.seen.text);
      ok('ومؤشّر انتظار', !!good.seen && good.seen.spin);
      ok('وتُنطق لقارئ الشاشة',
         !!good.seen && good.seen.role === 'status' && good.seen.live === 'polite');
      /* الطبقة داخل البطاقة: الشعار في الترويسة لا يقفز مكانه */
      ok('وهي داخل البطاقة — الترويسة والشعار لا يتحرّكان',
         !!good.seen && good.seen.insideCard && good.seen.headerStill);
      ok('وتغطّي النموذج كلّه فلا تُقرأ فوقه', !!good.seen && good.seen.coversForm);
      ok('والزرّ نفسه يقول إنه يعمل ولا يُضغط ثانية',
         /جارٍ|جار/.test(good.btnLabel) && good.btnDisabled === true, good.btnLabel);
      /* المدّة: لا أقلّ من الحدّ البصريّ، ولا خمس ثوانٍ ثابتة */
      ok('المدّة لا تقلّ عن الحدّ البصريّ', good.total >= good.min - 120,
         `${good.total}ms ≥ ${good.min}ms`);
      ok('ولا تُطال بلا سبب (دون ضعف الحدّ)', good.total < good.min * 2.4,
         `${good.total}ms < ${Math.round(good.min * 2.4)}ms`);
      ok('ثم لوحة التحكّم', good.app !== 'none' && !good.gate && !good.locked, good.app);
      ok('ولا بقايا طبقة على الشاشة', good.load === false);
      ok('والجلسة مفتوحة باسم الداخلة', /أم تبارك/.test(good.who), good.who);
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('الدخول — حالة التحقّق ومدّتها', rows, errors);
  });

  group('البوّابة — لا مساحة عمل قبل الدخول', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    const CRED = { name: 'أم تبارك', username: 'owner', password: 'tabarak-2026' };
    try {
      /* ---- 1) تهيئة: تفعيل الدخول وإنشاء حساب المالكة ---- */
      const a = await openDesktop(browser, url);
      errors = a.errors;
      const state = await a.page.evaluate(async (cred) => {
        const { Settings, Auth, Svc, D } = window.TG;
        await window.TG.Seed.loadDemo(6).catch(() => {});
        const m = await Svc.members.create({ name: 'سارة الاختبار', phone: '07700001122' });
        await Settings.set({ authEnabled: true });
        await Auth.setupFirstAdmin(cred);
        /* حساب ثانٍ موقوف — لاختبار أن الإيقاف لا يُكشف بلا كلمة مرور */
        const u2 = await Svc.users.create({ username: 'reem', name: 'ريم', password: 'reem-12345',
                                            roleKey: 'reception' });
        await Svc.users.setDisabled((u2.rec || u2).id, true);
        /* التهيئة تفتح جلسة. وتشغيلُ الغد يبدأ بلا جلسة — وهذا ما يُقاس:
           `sessionStorage` تزول بإغلاق التطبيق، فتُزال هنا صراحةً. */
        await Auth.logout();
        return { member: (m.rec || m).name, today: D.today() };
      }, CRED);

      /* ---- 2) إقلاع جديد في **السياق نفسه**: البيانات على القرص هي هي ----
         سياقٌ جديد يعني تخزيناً جديداً، أي قاعدةً بلا حسابات — فلا بوّابة
         ولا شيء يُقاس. فيُعاد تحميل الصفحة نفسها بعد تركيب المراقب. */
      const ctx = a.ctx;
      const p = a.page;
      const perrs = [];
      p.on('pageerror', e => perrs.push(String(e.message)));
      /* المراقب يُركَّب قبل أي سطر من سطور الواجهة في التحميل القادم: يسجّل
         كل تغيّر في الصفحة، ويقول عند كل لقطة هل كانت مساحة العمل مرئيّة. */
      await p.addInitScript(() => {
        window.__FLASH__ = { samples: 0, workspaceSeen: 0, navSeen: 0, firstGateAt: null, start: Date.now() };
        const look = () => {
          const f = window.__FLASH__;
          const app = document.querySelector('.app');
          if (!app) return;
          f.samples++;
          const vis = getComputedStyle(app).display !== 'none' && app.getClientRects().length > 0;
          const nav = document.querySelectorAll('.nav-item').length;
          const view = (document.getElementById('viewRoot') || {}).innerHTML || '';
          /* «مساحة عمل مرئيّة» = هيكل ظاهر وفيه تنقّل أو شاشة مرسومة */
          if (vis && (nav > 0 || view.length > 200)) f.workspaceSeen++;
          if (vis && nav > 0) f.navSeen++;
          if (!f.firstGateAt && document.querySelector('.gate')) f.firstGateAt = Date.now() - f.start;
        };
        const start = () => {
          look();
          new MutationObserver(look).observe(document.documentElement,
            { childList: true, subtree: true, attributes: true, attributeFilter: ['class', 'style'] });
          const t = setInterval(look, 8);
          setTimeout(() => clearInterval(t), 15000);
        };
        if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
        else start();
      });
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
      await p.evaluate(() => window.TG.ready);
      await p.waitForSelector('.gate', { timeout: 10000 });

      const gated = await p.evaluate((memberName) => {
        const app = document.querySelector('.app');
        return {
          gate: !!document.querySelector('.gate'),
          locked: document.body.classList.contains('locked'),
          appDisplay: app ? getComputedStyle(app).display : 'missing',
          navItems: document.querySelectorAll('.nav-item').length,
          viewHtml: ((document.getElementById('viewRoot') || {}).innerHTML || '').length,
          whoami: (document.getElementById('whoami') || {}).innerHTML || '',
          bodyText: document.body.innerText,
          hasMember: document.body.innerHTML.includes(memberName),
          flash: window.__FLASH__,
          ready: !!(window.__TG_FS__ && window.__TG_FS__.revealed),
          readyCalls: (window.__TG_FS__.calls || []).filter(c => c.cmd === 'tg_ready'),
        };
      }, state.member);

      ok('بعد الإقلاع: شاشة الدخول معروضة', gated.gate);
      ok('والهيكل مقفل — `body.locked`', gated.locked);
      ok('ومساحة العمل خارج التخطيط أصلاً', gated.appDisplay === 'none', gated.appDisplay);
      ok('ولم يُبنَ تنقّل', gated.navItems === 0, gated.navItems);
      ok('ولم تُرسم شاشة', gated.viewHtml === 0, gated.viewHtml);
      ok('ولا هويّة مستخدمة في الشريط العلوي', gated.whoami === '', gated.whoami);
      ok('ولا اسم مشتركة في الصفحة كلّها', !gated.hasMember, state.member);
      ok('ولا لوحة تحكّم ولا تنبيهات',
         !/لوحة التحكم|الاستقبال اليوم|التنبيهات/.test(gated.bodyText), gated.bodyText.slice(0, 120));

      /* الومضة: لا لقطة واحدة من مئات اللقطات رأت مساحة العمل */
      ok('المراقب أخذ لقطات متتابعة أثناء الإقلاع', gated.flash.samples >= 8, gated.flash.samples);
      ok('ولم تُرَ مساحة العمل في أيّ منها — ولا إطاراً واحداً',
         gated.flash.workspaceSeen === 0, `${gated.flash.workspaceSeen} من ${gated.flash.samples}`);
      ok('ولا شريط تنقّل مبنيّ في أيّ منها', gated.flash.navSeen === 0, gated.flash.navSeen);

      /* الغلاف: الجاهزية تُعلَن مرّة واحدة، ومعها تفضيل الحركة */
      ok('والغلاف أُعلم بالجاهزية مرّة واحدة', gated.readyCalls.length === 1, gated.readyCalls.length);
      ok('ومعها تفضيل الحركة ليُقرّر طول نافذة البدء',
         gated.readyCalls[0] && typeof gated.readyCalls[0].args.reducedMotion === 'boolean',
         JSON.stringify(gated.readyCalls[0] && gated.readyCalls[0].args));
      ok('وما كُشف هو شاشة الدخول لا مساحة العمل',
         gated.ready && gated.flash.firstGateAt !== null, JSON.stringify(gated.flash.firstGateAt));

      /* ---- 3) شكل الشاشة وتفاعلها ---- */
      const form = await p.evaluate(async () => {
        const g = document.querySelector('.gate');
        /* التركيز يُوضع بعد التركيب بلحظة (انظري `Gate.mount`) — فيُنتظر
           استقراره بدل قياسه في منتصف التركيب. */
        for (let i = 0; i < 40 && document.activeElement !== g.querySelector('#gUser'); i++)
          await new Promise(r => setTimeout(r, 50));
        const focus = document.activeElement;
        const eye = g.querySelector('[data-eye="gPass"]');
        const pass = g.querySelector('#gPass');
        const before = pass.type;
        eye.click();
        const after = pass.type;
        const pressed = eye.getAttribute('aria-pressed');
        eye.click();
        return {
          focusId: focus ? focus.id : '',
          hasUser: !!g.querySelector('#gUser'), hasPass: !!pass,
          before, after, pressed, back: pass.type,
          eyeTab: eye.getAttribute('tabindex'),
          title: (g.querySelector('.gate-head h1') || {}).textContent || '',
          sub: (g.querySelector('.gate-head p') || {}).textContent || '',
          logo: !!g.querySelector('.gate-head .brand-box'),
          btn: (g.querySelector('#gGo') || {}).textContent || '',
          anim: getComputedStyle(g.querySelector('.gate-wrap')).animationDuration,
          role: g.getAttribute('role'),
          latin: /[A-Za-z]{3,}/.test(g.innerText),
        };
      });
      ok('التركيز يبدأ على اسم المستخدمة', form.focusId === 'gUser', form.focusId);
      ok('الحقلان موجودان', form.hasUser && form.hasPass);
      ok('زرّ إظهار كلمة المرور يكشفها ويعيدها',
         form.before === 'password' && form.after === 'text' && form.back === 'password',
         `${form.before} ⟵ ${form.after} ⟵ ${form.back}`);
      ok('ويقول حالته لقارئ الشاشة', form.pressed === 'true', form.pressed);
      ok('وهو خارج تسلسل Tab — بعد كلمة المرور يأتي زرّ الدخول',
         form.eyeTab === '-1', form.eyeTab);
      ok('الهوية على الشاشة: الشعار والاسم والوصف',
         form.logo && /تبارك جيم/.test(form.title) && form.sub.length > 3,
         `${form.title} / ${form.sub}`);
      ok('والشاشة عربية بلا مصطلح إنجليزي', !form.latin);
      ok('وانتقالها قصير (≤ 350ms)',
         Number(form.anim.replace('s', '')) * 1000 <= 350, form.anim);
      ok('ومعلَّمة كحوار لقارئ الشاشة', form.role === 'dialog', form.role);

      /* ---- 4) الأخطاء: عربية، ولا تكشف وجود الحساب ---- */
      const tryLogin = (u, pw) => p.evaluate(async ([user, pass]) => {
        const g = document.querySelector('.gate');
        g.querySelector('#gUser').value = user;
        g.querySelector('#gPass').value = pass;
        g.querySelector('#gGo').click();
        await new Promise(r => setTimeout(r, 700));
        const err = document.querySelector('#gErr');
        return { msg: err ? err.textContent : '', shown: err ? err.style.display : '',
                 still: !!document.querySelector('.gate'),
                 passCleared: (document.querySelector('#gPass') || {}).value === '' };
      }, [u, pw]);

      const empty = await p.evaluate(async () => {
        const g = document.querySelector('.gate');
        g.querySelector('#gUser').value = ''; g.querySelector('#gPass').value = '';
        g.querySelector('#gGo').click();
        await new Promise(r => setTimeout(r, 200));
        return (document.querySelector('#gErr') || {}).textContent || '';
      });
      ok('حقلان فارغان: رسالة عربية واضحة', /اكتبي اسم المستخدمة وكلمة المرور/.test(empty), empty);

      const unknown = await tryLogin('لا-أحد', 'أي-كلمة-مرور');
      const wrongPw = await tryLogin(CRED.username, 'كلمة-خاطئة-تماماً');
      ok('اسم غير موجود: رسالة عربية', /اسم المستخدمة أو كلمة المرور غير صحيحة/.test(unknown.msg), unknown.msg);
      ok('كلمة مرور خاطئة: **الرسالة نفسها حرفاً بحرف**',
         unknown.msg === wrongPw.msg, `${unknown.msg} ⟵ ${wrongPw.msg}`);
      ok('ولا تُذكر تفاصيل تقنية', !/(Error|undefined|null|BAD_|\bAuth\b)/.test(wrongPw.msg), wrongPw.msg);
      ok('وكلمة المرور تُمسح بعد الفشل', wrongPw.passCleared);
      ok('والبوّابة تبقى مقفلة بعد الفشل', wrongPw.still);

      /* الحساب الموقوف: لا يُكشف لمن لا يعرف كلمة المرور */
      const disabledWrong = await tryLogin('reem', 'كلمة-ليست-كلمتها');
      ok('حساب موقوف بكلمة مرور خاطئة: الرسالة العامّة — لا تعداد للأسماء',
         disabledWrong.msg === unknown.msg, disabledWrong.msg);
      const disabledRight = await tryLogin('reem', 'reem-12345');
      ok('وبكلمة المرور الصحيحة يُقال السبب كاملاً',
         /موقوف/.test(disabledRight.msg), disabledRight.msg);
      ok('ولا يدخل على كل حال', disabledRight.still);

      /* ---- 5) الدخول الناجح: Enter وحده يكفي ---- */
      const signed = await p.evaluate(async (cred) => {
        const g = document.querySelector('.gate');
        g.querySelector('#gUser').value = cred.username;
        g.querySelector('#gPass').value = cred.password;
        g.querySelector('#gPass').dispatchEvent(new KeyboardEvent('keydown',
          { key: 'Enter', bubbles: true, cancelable: true }));
        for (let i = 0; i < 60 && document.querySelector('.gate'); i++)
          await new Promise(r => setTimeout(r, 100));
        const app = document.querySelector('.app');
        return {
          gate: !!document.querySelector('.gate'),
          locked: document.body.classList.contains('locked'),
          appDisplay: app ? getComputedStyle(app).display : 'missing',
          nav: document.querySelectorAll('.nav-item').length,
          view: ((document.getElementById('viewRoot') || {}).innerHTML || '').length,
          who: (document.getElementById('whoami') || {}).innerText || '',
          actor: window.TG.Auth.session.actorName,
        };
      }, CRED);
      ok('Enter وحده يُسجّل الدخول — لا بحث عن الزر', !signed.gate);
      ok('والقفل يُفكّ', !signed.locked && signed.appDisplay !== 'none', signed.appDisplay);
      ok('والتنقّل يُبنى الآن لا قبل الدخول', signed.nav > 5, signed.nav);
      ok('والشاشة تُرسم', signed.view > 200, signed.view);
      ok('واسم الداخلة في الشريط العلوي', /أم تبارك/.test(signed.who), signed.who);

      /* ---- 6) الخروج: يعود القفل ولا تبقى بيانات مرسومة ---- */
      const out = await p.evaluate(async (memberName) => {
        await window.TG.Auth.logout();
        window.TG.Gate.login();
        await new Promise(r => setTimeout(r, 150));
        const app = document.querySelector('.app');
        return { gate: !!document.querySelector('.gate'),
                 locked: document.body.classList.contains('locked'),
                 appDisplay: app ? getComputedStyle(app).display : 'missing',
                 nav: document.querySelectorAll('.nav-item').length,
                 view: ((document.getElementById('viewRoot') || {}).innerHTML || '').length,
                 hasMember: document.body.innerHTML.includes(memberName) };
      }, state.member);
      ok('الخروج يعيد شاشة الدخول', out.gate);
      ok('ويقفل الهيكل من جديد', out.locked && out.appDisplay === 'none', out.appDisplay);
      ok('ويمسح ما كان مرسوماً — لا تبقى بيانات خلف البوّابة',
         out.nav === 0 && out.view === 0 && !out.hasMember,
         `nav=${out.nav} view=${out.view} member=${out.hasMember}`);

      /* ---- 7) إعادة التحميل بعد الخروج: بوّابة لا مساحة عمل ---- */
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
      await p.evaluate(() => window.TG.ready);
      const again = await p.evaluate(() => ({
        gate: !!document.querySelector('.gate'),
        nav: document.querySelectorAll('.nav-item').length,
        locked: document.body.classList.contains('locked'),
      }));
      ok('وبعد إعادة التحميل: بوّابة من جديد', again.gate && again.locked);
      ok('ولا تنقّل مبنيّ خلفها', again.nav === 0, again.nav);

      /* ---- 8) تقليل الحركة: الشاشة تظهر مكتملة بلا انتقال ----
         التفضيل يُبدَّل على الصفحة نفسها لا في سياق جديد: سياقٌ جديد يعني
         تخزيناً جديداً، أي قاعدةً بلا حسابات ولا بوّابة تُقاس أصلاً. */
      await p.emulateMedia({ reducedMotion: 'reduce' });
      await p.reload({ waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
      await p.evaluate(() => window.TG.ready);
      await p.waitForSelector('.gate', { timeout: 10000 });
      const red = await p.evaluate(() => ({
        wrap: getComputedStyle(document.querySelector('.gate-wrap')).animationName,
        gate: getComputedStyle(document.querySelector('.gate')).animationName,
        visible: getComputedStyle(document.querySelector('.gate-wrap')).opacity,
        readyArg: (window.__TG_FS__.calls.find(c => c.cmd === 'tg_ready') || { args: {} }).args.reducedMotion,
      }));
      ok('تقليل الحركة: لا انتقال على شاشة الدخول',
         red.wrap === 'none' && red.gate === 'none', `${red.wrap} / ${red.gate}`);
      ok('ومع ذلك الشاشة مكتملة الظهور', Number(red.visible) === 1, red.visible);
      ok('والغلاف أُبلغ بالتفضيل فلا ينتظر مقدّمةً لا تعمل',
         red.readyArg === true, String(red.readyArg));
      errors = errors.concat(perrs);
      await ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('البوّابة — لا مساحة عمل قبل الدخول', rows, errors);
  });

  /* ===================================================================== *
   * 4) ملف الموظفة يُقرأ بلا «تعديل»                                       *
   * ===================================================================== */
  group('الفريق — ملف الموظفة يُقرأ بلا تعديل', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openBrowser(browser, url);
      errors = a.errors;
      const out = await a.page.evaluate(async () => {
        const TG = window.TG;
        const st = await TG.Repos.staff.create({
          name: 'سارة الموظفة', role: 'مدربة لياقة', specialty: 'يوغا', code: 'E-77',
          contractType: 'دوام كامل', schedule: 'سبت–أربعاء 9–3', payMethod: 'cash',
          baseSalary: 450, status: 'active', hireDate: '2024-03-01', birthDate: '1996-07-14',
          phone: '0770000111', email: 'sara@example.com', address: 'بغداد — الكرادة',
          emergency: { name: 'أم سارة', relation: 'الوالدة', phone: '0770000222' },
          idType: 'هوية أحوال', idNumber: 'ID-9911', idExpiry: '2030-01-01',
          notes: 'تفضّل الحصص الصباحية.',
        });
        await TG.Audit.log('staff', 'update', 'تعديل موظفة: سارة الموظفة', st.id);
        TG.go('staff'); TG.renderRoute();
        await new Promise(r => setTimeout(r, 120));

        /* الاسم في الجدول نفسه يفتح الملف — لا أيقونة بين أيقونات */
        const nameBtn = [...document.querySelectorAll('#stTable .link-name')]
          .find(b => b.textContent.includes('سارة الموظفة'));
        const openedByName = !!nameBtn;
        if (nameBtn) nameBtn.click();
        await new Promise(r => setTimeout(r, 160));
        const modal = document.querySelector('.overlay .modal');
        const text = modal ? modal.innerText : '';
        const title = modal ? (modal.querySelector('.modal-head h3') || {}).textContent : '';
        const inputs = modal ? modal.querySelectorAll('input:not([type=hidden]),select,textarea').length : -1;
        const editBtn = modal ? !!modal.querySelector('#spEdit') : false;
        return { openedByName, title, text, inputs, editBtn, id: st.id };
      });

      ok('الضغط على الاسم يفتح الملف', out.openedByName && /ملف سارة الموظفة/.test(out.title || ''), out.title);
      ok('والملف وضع قراءة: لا حقل إدخال واحد فيه', out.inputs === 0, out.inputs);
      ok('و«تعديل البيانات» ما زال متاحاً', out.editBtn);

      const has = (label, t) => ok(`يُقرأ بلا تعديل: ${label}`, new RegExp(t).test(out.text), t);
      has('الاسم', 'سارة الموظفة');
      has('الهاتف', '0770000111');
      has('تاريخ الميلاد', '1996|١٩٩٦');
      has('الحالة الوظيفية', 'على رأس العمل');
      has('تاريخ التعيين', '2024|٢٠٢٤');
      has('البريد', 'sara@example\\.com');
      has('العنوان', 'الكرادة');
      has('جهة الطوارئ', 'أم سارة');
      has('صلة القرابة', 'الوالدة');
      has('هاتف الطوارئ', '0770000222');
      has('الوظيفة', 'مدربة لياقة');
      has('التخصّص', 'يوغا');
      has('الرقم الوظيفي', 'E-77');
      has('نوع العقد', 'دوام كامل');
      has('الدوام', 'سبت–أربعاء');
      has('وثيقة التعريف', 'هوية أحوال');
      has('رقم الوثيقة', 'ID-9911');
      has('الملاحظات', 'الحصص الصباحية');
      has('النشاط', 'تعديل موظفة');
      ok('والراتب يظهر لمن تملك صلاحيته', /450|٤٥٠/.test(out.text));

      /* ---- التعديل يعود فيُقرأ في وضع القراءة ---- */
      const after = await a.page.evaluate(async (id) => {
        const TG = window.TG;
        document.querySelectorAll('.overlay').forEach(o => o.remove());
        TG.UI.stack.length = 0;
        await TG.Repos.staff.update(id, { phone: '0781234567', notes: 'تغيّر الدوام.' });
        TG.Screens.staffProfile(id);
        await new Promise(r => setTimeout(r, 160));
        const m = document.querySelector('.overlay .modal');
        return m ? m.innerText : '';
      }, out.id);
      ok('بعد الحفظ يعكس وضع القراءة التغيير (الهاتف)', /0781234567/.test(after));
      ok('وبعده الملاحظة الجديدة', /تغيّر الدوام/.test(after));

      /* ---- الصلاحيات: ما لا يُسمح به لا يُعرض ----
         دورٌ يرى الفريق ولا يرى الرواتب ولا يعدّل الموظفات. */
      const gated = await a.page.evaluate(async (id) => {
        const TG = window.TG;
        document.querySelectorAll('.overlay').forEach(o => o.remove());
        TG.UI.stack.length = 0;
        const realEnabled = TG.Auth.enabled, realSession = TG.Auth.session, realRole = TG.Auth.role;
        TG.Auth.enabled = () => true;
        TG.Auth.session = { actorId: 'x', actorName: 'قارئة', roleKey: 'readonly' };
        TG.Auth.role = () => ({ key: 'readonly', perms: ['staff.view'] });
        TG.Screens.staffProfile(id);
        await new Promise(r => setTimeout(r, 160));
        const m = document.querySelector('.overlay .modal');
        const t = m ? m.innerText : '';
        const editBtn = m ? !!m.querySelector('#spEdit') : false;
        document.querySelectorAll('.overlay').forEach(o => o.remove());
        TG.UI.stack.length = 0;
        TG.Auth.enabled = realEnabled; TG.Auth.session = realSession; TG.Auth.role = realRole;
        return { t, editBtn };
      }, out.id);
      ok('دور بلا صلاحية رواتب: لا يرى الراتب', !/الراتب الأساسي/.test(gated.t));
      ok('ولا يرى كشوف الرواتب', !/سجل الرواتب/.test(gated.t));
      ok('دور بلا صلاحية تعديل: لا يرى وثيقة التعريف', !/ID-9911/.test(gated.t));
      ok('ولا زرّ تعديل', !gated.editBtn);
      ok('ومع ذلك يقرأ ما يُسمح له به', /سارة الموظفة/.test(gated.t) && /مدربة لياقة/.test(gated.t));
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('الفريق — ملف الموظفة يُقرأ بلا تعديل', rows, errors);
  });

  /* ===================================================================== *
   * 5) مركز الملفات: يجد، ويقول أين، ويفتح                                *
   * ===================================================================== */
  /* ===================================================================== *
   * محرّر الصورة — إطار واحد لثلاثة أسطح                                   *
   * ===================================================================== */
  group('محرّر الصورة — ما يُرى هو ما يُحفظ', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openBrowser(browser, url);
      errors = a.errors;
      const out = await a.page.evaluate(async () => {
        const IE = window.TG.ImageEditor;
        const settle = ms => new Promise(r => setTimeout(r, ms));
        /* صورة اختبار نصفها أحمر ونصفها أزرق: يُعرف من لون المُخرَج أيُّ
           جزء من الأصل حُفظ فعلاً — لا يكفي أن نقيس المقاس. */
        const src = (w, h) => new Promise(res => {
          const c = document.createElement('canvas'); c.width = w; c.height = h;
          const x = c.getContext('2d');
          x.fillStyle = '#ff0000'; x.fillRect(0, 0, w / 2, h);
          x.fillStyle = '#0000ff'; x.fillRect(w / 2, 0, w / 2, h);
          c.toBlob(b => res(new File([b], 'أصل.png', { type: 'image/png' })), 'image/png');
        });
        const read = file => new Promise(res => {
          const img = new Image(), u = URL.createObjectURL(file);
          img.onload = () => {
            const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
            const x = c.getContext('2d'); x.drawImage(img, 0, 0);
            const at = (fx, fy) => [...x.getImageData(Math.round(fx * img.width), Math.round(fy * img.height), 1, 1).data].slice(0, 3);
            URL.revokeObjectURL(u);
            res({ w: img.width, h: img.height, type: file.type, name: file.name,
                  left: at(.15, .5), right: at(.85, .5) });
          };
          img.src = u;
        });
        const red = p => p[0] > 200 && p[2] < 60;
        const blue = p => p[2] > 200 && p[0] < 60;
        const r = {};
        const big = await src(3000, 1200);

        /* 1) إلغاء = لا شيء */
        let pr = IE.open(big, 'photo'); await settle(260);
        document.querySelector('#imCancel').click();
        r.cancelled = await pr;

        /* 2) الإغلاق بالـ✕ إلغاء كذلك — لا يُحفظ بالخطأ */
        pr = IE.open(big, 'photo'); await settle(260);
        document.querySelector('.overlay [data-close]').click();
        r.closedIsCancel = await pr;

        /* 3) كل سطح ومقاسه — المُخرَج من الإعداد لا من الملف */
        for (const [k, preset] of [['logo', 'logo'], ['banner', 'banner'], ['photo', 'photo']]) {
          pr = IE.open(big, preset); await settle(300);
          document.querySelector('#imApply').click();
          r[k] = await read((await pr).file);
        }

        /* 4) التحريك يغيّر ما يُحفظ فعلاً */
        pr = IE.open(big, 'photo'); await settle(300);
        const st = document.querySelector('#imStage'), box = st.getBoundingClientRect();
        const ev = (t, dx) => st.dispatchEvent(new PointerEvent(t, {
          clientX: box.left + box.width / 2 + dx, clientY: box.top + box.height / 2,
          bubbles: true, pointerId: 1 }));
        ev('pointerdown', 0); ev('pointermove', 4000); ev('pointerup', 4000);
        await settle(90);
        document.querySelector('#imApply').click();
        r.panned = await read((await pr).file);

        /* 5) التكبير يُصغّر منطقة القص — والرقم معروض للمستخدمة */
        pr = IE.open(big, 'photo'); await settle(300);
        const before = document.querySelector('#imCrop').textContent;
        const z = document.querySelector('#imZoom');
        z.value = '650'; z.dispatchEvent(new Event('input', { bubbles: true }));
        await settle(60);
        const zoomed = document.querySelector('#imCrop').textContent;
        document.querySelector('#imReset').click(); await settle(60);
        const reset = document.querySelector('#imCrop').textContent;
        document.querySelector('#imCancel').click(); await pr;
        r.crop = { before, zoomed, reset };

        /* 6) طريق الصور العادية (المشتركة، الموظفة، المرفقات): المتحرّك
              والمتّجه يمرّان بلا محرّر — وهذه المسارات لا تقبل متحرّكاً أصلاً */
        r.pass = { gif: IE.passthrough({ type: 'image/gif' }),
                   svg: IE.passthrough({ type: 'image/svg+xml' }),
                   png: IE.passthrough({ type: 'image/png' }),
                   jpg: IE.passthrough({ type: 'image/jpeg' }) };
        r.stack = window.TG.UI.stack.length;
        r.red = { logo: red(r.logo.left), photoL: red(r.photo.left) };
        r.judge = { pannedBothRed: red(r.panned.left) && red(r.panned.right),
                    centredSplit: red(r.photo.left) && blue(r.photo.right) };
        return r;
      });

      ok('الإلغاء لا يُنتج ملفاً', out.cancelled === null);
      ok('والإغلاق بالـ✕ إلغاء كذلك', out.closedIsCancel === null);
      ok('الشعار يُحفظ 512×512', out.logo.w === 512 && out.logo.h === 512, `${out.logo.w}×${out.logo.h}`);
      ok('وبصيغة تحفظ الشفافية (PNG)', out.logo.type === 'image/png', out.logo.type);
      ok('اللافتة تُحفظ 1600×400 — نسبة 4:1', out.banner.w === 1600 && out.banner.h === 400,
         `${out.banner.w}×${out.banner.h}`);
      ok('الصورة الشخصية تُحفظ 512×512 مربّعة', out.photo.w === 512 && out.photo.h === 512,
         `${out.photo.w}×${out.photo.h}`);
      /* الأهمّ: **مقاس المُخرَج لا يتبع مقاس الملف**. هذا ما يُسقط عيب
         «الصورة تكسر مكانها» من جذره — أصلٌ 3000×1200 يخرج بمقاس السطح. */
      ok('ومقاس المحفوظ من السطح لا من الملف (أصل 3000×1200)',
         out.logo.w === 512 && out.banner.w === 1600 && out.photo.w === 512);
      ok('القصّ الافتراضي موسَّط — نصف أحمر ونصف أزرق', out.judge.centredSplit,
         `${out.photo.left} / ${out.photo.right}`);
      ok('والتحريك يغيّر ما يُحفظ فعلاً — طرفٌ واحد بلون واحد', out.judge.pannedBothRed,
         `${out.panned.left} / ${out.panned.right}`);
      ok('التكبير يُصغّر منطقة القص', out.crop.before !== out.crop.zoomed,
         `${out.crop.before} ⟵ ${out.crop.zoomed}`);
      ok('وإعادة الضبط تُرجعها كما كانت', out.crop.reset === out.crop.before,
         `${out.crop.reset} / ${out.crop.before}`);
      ok('في طريق الصور العادية المتحرّك يمرّ بلا محرّر', out.pass.gif === true);
      ok('ولا المتّجه — الترميز يُفقده تحجيمه', out.pass.svg === true);
      ok('أمّا الثابتة فتمرّ به', out.pass.png === false && out.pass.jpg === false);
      ok('ولا نافذة معلّقة بعد كل هذا', out.stack === 0, out.stack);
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('محرّر الصورة — ما يُرى هو ما يُحفظ', rows, errors);
  });

  /* ===================================================================== *
   * وثيقة التعريف — مصغّرة تُنقر، وأصلٌ يُرى كاملاً                         *
   * ===================================================================== */
  group('وثيقة التعريف — مصغّرة وعارض', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openBrowser(browser, url, { context: { viewport: { width: 1440, height: 900 } } });
      errors = a.errors;

      /* وثيقة عملاقة وعريضة: هي بالضبط الحالة التي كانت تبتلع الملف */
      const out = await a.page.evaluate(async ([W, H]) => {
        const TG = window.TG;
        const settle = ms => new Promise(r => setTimeout(r, ms));
        const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) }; };
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const x = c.getContext('2d');
        x.fillStyle = '#432C4C'; x.fillRect(0, 0, W, H);
        const blob = await new Promise(r => c.toBlob(r, 'image/png'));
        const med = await TG.Svc.media.saveFile(new File([blob], 'هوية.png', { type: 'image/png' }));
        const st = await TG.Repos.staff.create({ name: 'رهف الإدارية', role: 'إدارية',
          baseSalary: 300, status: 'active', hireDate: '2024-01-01',
          idType: 'بطاقة', idNumber: '199', idMediaId: med.id });

        TG.Screens.staffProfile(st.id);
        await settle(180);
        const modal = document.querySelector('.overlay .modal');
        const r = { routeBefore: TG.State.route };
        const thumb = modal.querySelector('[data-mediaview]');
        r.thumbExists = !!thumb;
        r.thumbIsButton = !!thumb && thumb.tagName === 'BUTTON';
        r.thumbBox = box(thumb);
        r.thumbLabelled = !!thumb && !!thumb.getAttribute('aria-label');
        /* لا صورة عارية بمقاس المصدر في الملف بعد الآن */
        const loose = [...modal.querySelectorAll('img')]
          .filter(i => { const b = i.getBoundingClientRect(); return b.width > 200 || b.height > 200; });
        r.looseBig = loose.length;
        r.profileBox = box(modal);

        /* --- النقر يفتح العارض --- */
        thumb.click();
        await settle(200);
        const ov = [...document.querySelectorAll('.overlay')].pop();
        r.lightbox = !!ov && ov.classList.contains('lightbox');
        const big = ov && ov.querySelector('.lb-media');
        r.viewerImg = box(big);
        r.viewerFits = !!big && big.getBoundingClientRect().height <= window.innerHeight
                            && big.getBoundingClientRect().width <= window.innerWidth;
        /* الأصل يُعرض كما حُفظ — لا نسخة مصغَّرة */
        r.viewerShowsOriginal = !!big && big.getAttribute('src') === TG.Repos.media.get(med.id).dataUrl;
        r.viewerNatural = big ? { w: big.naturalWidth, h: big.naturalHeight } : null;
        r.hasCloseBtn = !!ov && !!ov.querySelector('[data-close]');
        r.stackWithViewer = TG.UI.stack.length;

        /* --- Esc يُغلق العارض ويُبقي الملف --- */
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        await settle(160);
        r.stackAfterEsc = TG.UI.stack.length;
        r.profileStillOpen = !!document.querySelector('.overlay .modal [data-mediaview]');
        r.route = TG.State.route;

        /* --- وزر الإغلاق يعمل كذلك --- */
        document.querySelector('[data-mediaview]').click();
        await settle(180);
        const ov2 = [...document.querySelectorAll('.overlay')].pop();
        ov2.querySelector('[data-close]').click();
        await settle(160);
        r.stackAfterBtn = TG.UI.stack.length;
        /* --- الأصل لم يُمسّ --- */
        const after = TG.Repos.media.get(med.id);
        r.originalKept = after.width === W && after.height === H && after.dataUrl.length > 100;
        return r;
      }, [1800, 1200]);

      ok('الوثيقة تظهر مصغّرة قابلة للنقر', out.thumbExists && out.thumbIsButton);
      ok('ومقاسها محدود لا يتبع مقاس الوثيقة',
         out.thumbBox.w <= 120 && out.thumbBox.h <= 120, `${out.thumbBox.w}×${out.thumbBox.h}`);
      ok('ولها وصفٌ يقرؤه قارئ الشاشة', out.thumbLabelled);
      ok('ولا صورة في الملف بمقاس مصدرها', out.looseBig === 0, out.looseBig);
      ok('النقر يفتح عارضاً بخلفية داكنة', out.lightbox === true);
      ok('والوثيقة فيه أكبر بكثير من مصغّرتها',
         out.viewerImg.w > out.thumbBox.w * 3, `${out.viewerImg.w} مقابل ${out.thumbBox.w}`);
      ok('ولا تتجاوز الشاشة', out.viewerFits === true,
         `${out.viewerImg.w}×${out.viewerImg.h}`);
      ok('والمعروض هو الأصل لا نسخة مصغَّرة',
         out.viewerShowsOriginal === true
         && out.viewerNatural.w === 1800 && out.viewerNatural.h === 1200,
         JSON.stringify(out.viewerNatural));
      ok('وفيه زرّ إغلاق ظاهر', out.hasCloseBtn === true);
      ok('Escape يُغلق العارض', out.stackWithViewer === 2 && out.stackAfterEsc === 1,
         `${out.stackWithViewer} ⟵ ${out.stackAfterEsc}`);
      /* الملف نافذةٌ فوق الشاشة: فالمطلوب أن الإغلاق لا يُغادر شيئاً —
         الملف ما زال مفتوحاً والشاشة تحته لم تتبدّل. */
      ok('ويعود إلى ملف الموظفة بلا مغادرة الشاشة',
         out.profileStillOpen === true && out.route === out.routeBefore,
         `${out.routeBefore} ⟵ ${out.route}`);
      ok('وزرّ الإغلاق يفعل مثله', out.stackAfterBtn === 1, out.stackAfterBtn);
      ok('والأصل محفوظ كما هو — لم يُصغَّر ولم يُعَد ترميزه', out.originalKept === true);
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('وثيقة التعريف — مصغّرة وعارض', rows, errors);
  });

  /* ===================================================================== *
   * الهوية المتحرّكة — تُقصّ ولا تُجمَّد                                    *
   * ===================================================================== */
  group('الهوية المتحرّكة — تُقصّ ولا تُجمَّد', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openBrowser(browser, url, { context: { viewport: { width: 1440, height: 900 } } });
      errors = a.errors;
      const gifB64 = fs.readFileSync(path.join(__dirname, 'fixtures-anim.gif')).toString('base64');

      const out = await a.page.evaluate(async (b64) => {
        const TG = window.TG, IE = TG.ImageEditor;
        const settle = ms => new Promise(r => setTimeout(r, ms));
        const mkGif = () => {
          const bin = atob(b64); const arr = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
          return new File([arr], 'anim.gif', { type: 'image/gif' });
        };
        const box = el => { if (!el) return null; const r = el.getBoundingClientRect();
          return { w: Math.round(r.width), h: Math.round(r.height) }; };
        const r = {};

        /* --- 1) المتحرّك يفتح المحرّر في طريق الهوية --- */
        const gif = mkGif();
        let pr = IE.prepareBrand(gif, 'logo');
        await settle(340);
        r.editorOpened = !!document.querySelector('#imStage');
        r.stageIsGif = String((document.querySelector('#imImg') || {}).src || '').length > 0;
        r.hasFrame = !!document.querySelector('#imFrame');
        r.hasZoom = !!document.querySelector('#imZoom');
        r.hasPreview = !!document.querySelector('#imPrev');
        /* تحريك وتكبير قبل الحفظ — فالقصّ المحفوظ ليس القصّ الافتراضي */
        const z = document.querySelector('#imZoom');
        z.value = '420'; z.dispatchEvent(new Event('input', { bubbles: true }));
        await settle(80);
        document.querySelector('#imApply').click();
        const got = await pr;
        r.returnedOriginal = !!got && got.file === gif;      /* الملف نفسه لا نسخة مُعاد ترميزها */
        r.returnedType = got && got.file && got.file.type;
        r.crop = got && got.crop;

        /* --- 2) يُحفظ فيبقى متحرّكاً، ويُرسم مقصوصاً في صندوقه --- */
        await TG.Brand.setMedia('logo', got.file, got.crop);
        TG.go('settings', { sec: 'brand' });
        TG.renderRoute();
        await settle(260);
        r.storedAnimated = TG.Brand.isAnimated('logo');
        r.storedType = TG.Brand.media('logo').type;
        r.renderLive = TG.Brand.motionStatus().logo.rendering;   /* live = الملف المتحرّك */
        r.cropKept = TG.Brand.cropOf('logo');
        r.sidebar = box(document.querySelector('.brand .brand-logo'));
        r.prevBox = box(document.querySelector('.media-drop .brand-prev'));
        r.prevImgSrcIsGif = String((document.querySelector('[data-brand-prev="logo"]') || {}).src || '')
          .startsWith('data:image/gif');
        r.cropMarkup = /data-brand-crop/.test(TG.Brand.logoHtml(38));
        /* الصورة المقصوصة لا تخرج من صندوقها مهما كان القصّ */
        const slot = document.querySelector('.brand .brand-logo');
        const inner = slot && slot.querySelector('img');
        r.innerBox = box(inner);
        r.slotHidesOverflow = slot ? getComputedStyle(slot).overflow === 'hidden' : false;

        /* --- 3) اللافتة المتحرّكة كذلك --- */
        const gif2 = mkGif();
        pr = IE.prepareBrand(gif2, 'banner');
        await settle(340);
        r.bannerEditorOpened = !!document.querySelector('#imStage');
        document.querySelector('#imApply').click();
        const got2 = await pr;
        await TG.Brand.setMedia('banner', got2.file, got2.crop);
        TG.go('dashboard'); TG.renderRoute();
        await settle(220);
        const bimg = document.querySelector('.brand-banner img');
        r.bannerAnimated = TG.Brand.isAnimated('banner');
        r.bannerCrop = TG.Brand.cropOf('banner');
        r.bannerSrcIsGif = String((bimg || {}).src || '').startsWith('data:image/gif');
        r.bannerBox = box(document.querySelector('.brand-banner'));

        /* --- 3.5) القصّ ينجو من النسخة الاحتياطية والاستعادة ---
           §21: المحفوظ ووصفُ قصّه يجب أن يعبرا الحفظ وإعادة التشغيل
           والنسخة والاستعادة. والقصّ يعيش في `Settings.branding`، فهو
           داخل النسخة بحكم موضعه لا بترتيبٍ يُكتب له. */
        const logoCropBefore = JSON.stringify(TG.Brand.cropOf('logo'));
        const bannerCropBefore = JSON.stringify(TG.Brand.cropOf('banner'));
        const snap = TG.Backup.build(true);
        r.backupCarriesCrop = /logoCrop/.test(JSON.stringify(snap));
        await TG.Backup.restore(JSON.parse(JSON.stringify(snap)), { mode: 'replace' });
        await settle(300);
        r.cropSurvived = JSON.stringify(TG.Brand.cropOf('logo')) === logoCropBefore
                      && logoCropBefore !== 'null';
        r.bannerCropSurvived = JSON.stringify(TG.Brand.cropOf('banner')) === bannerCropBefore
                            && bannerCropBefore !== 'null';
        r.animatedAfterRestore = TG.Brand.isAnimated('logo')
                              && TG.Brand.media('logo').type === 'image/gif';
        TG.go('settings', { sec: 'brand' }); TG.renderRoute();
        await settle(260);
        r.sidebarAfterRestore = box(document.querySelector('.brand .brand-logo'));

        /* --- 4) الإلغاء لا يمسّ شيئاً --- */
        const before = TG.Brand.media('logo').id;
        pr = IE.prepareBrand(mkGif(), 'logo');
        await settle(320);
        document.querySelector('#imCancel').click();
        r.cancelled = await pr;
        r.unchangedAfterCancel = TG.Brand.media('logo').id === before;

        /* --- 5) المتّجه يبقى بلا محرّر --- */
        const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40"></svg>'],
                             's.svg', { type: 'image/svg+xml' });
        const sres = await IE.prepareBrand(svg, 'logo');
        r.svgNoEditor = !!sres && sres.file === svg && sres.crop === null
                        && !document.querySelector('#imStage');
        r.stack = TG.UI.stack.length;
        return r;
      }, gifB64);

      ok('المتحرّك يفتح المحرّر بدل أن يُمرَّر من فوقه', out.editorOpened);
      ok('وفيه إطار القصّ والتكبير والمعاينة',
         out.hasFrame && out.hasZoom && out.hasPreview && out.stageIsGif);
      ok('والخارج منه هو الملف الأصلي نفسه — لا إطارٌ مجمَّد ولا إعادة ترميز',
         out.returnedOriginal === true && out.returnedType === 'image/gif', out.returnedType);
      ok('ومعه وصف القصّ: أربعة أرقام',
         !!out.crop && ['w', 'h', 'x', 'y'].every(k => typeof out.crop[k] === 'number'),
         JSON.stringify(out.crop));
      ok('المحفوظ ما زال متحرّكاً', out.storedAnimated === true && out.storedType === 'image/gif');
      ok('ويُرسم من الملف المتحرّك لا من إطاره الثابت', out.renderLive === 'live', out.renderLive);
      ok('والقصّ نجا من الحفظ', !!out.cropKept && out.cropKept.w === out.crop.w,
         JSON.stringify(out.cropKept));
      ok('والرسم يحمل القصّ فعلاً', out.cropMarkup === true);
      ok('ومعاينة الإعدادات مصدرها GIF — لم تُستبدل بصورة ساكنة', out.prevImgSrcIsGif === true);
      /* الضمان الأول ما زال قائماً: القصّ لا يمنح الملف حقّ تقرير التخطيط */
      ok('الشريط الجانبي 38×38 رغم القصّ والتكبير',
         out.sidebar.w === 38 && out.sidebar.h === 38, `${out.sidebar.w}×${out.sidebar.h}`);
      ok('ومعاينة الإعدادات 120×120', out.prevBox.w === 120 && out.prevBox.h === 120,
         `${out.prevBox.w}×${out.prevBox.h}`);
      ok('والصندوق يقصّ ما خرج عنه', out.slotHidesOverflow === true);
      ok('اللافتة المتحرّكة تمرّ بالمحرّر كذلك', out.bannerEditorOpened === true);
      ok('وتبقى متحرّكة بعد الحفظ', out.bannerAnimated === true && out.bannerSrcIsGif === true);
      ok('ولها وصف قصّ محفوظ', !!out.bannerCrop, JSON.stringify(out.bannerCrop));
      /* 7.10: صندوق اللافتة بنسبة إطار المحرّر (4:1) في كل سطح — كان 132
         ارتفاعاً بأيّ عرض، فكان القصّ يُمطّ بحسب عرض الشاشة. */
      ok('وصندوق اللافتة بنسبة إطار المحرّر 4:1 وبسقفه',
         Math.abs(out.bannerBox.w / out.bannerBox.h - 4) < 0.05 && out.bannerBox.h <= 240,
         `${out.bannerBox.w}×${out.bannerBox.h}`);
      ok('النسخة الاحتياطية تحمل وصف القصّ', out.backupCarriesCrop === true);
      ok('والقصّ ينجو من الاستعادة — الشعار واللافتة',
         out.cropSurvived === true && out.bannerCropSurvived === true);
      ok('والصورة تبقى متحرّكة بعد الاستعادة', out.animatedAfterRestore === true);
      ok('وصندوقها بعد الاستعادة 38×38',
         out.sidebarAfterRestore.w === 38 && out.sidebarAfterRestore.h === 38,
         `${out.sidebarAfterRestore.w}×${out.sidebarAfterRestore.h}`);
      ok('الإلغاء لا يُنتج شيئاً ولا يمسّ المحفوظ',
         out.cancelled === null && out.unchangedAfterCancel === true);
      ok('والمتّجه يبقى بلا محرّر', out.svgNoEditor === true);
      ok('ولا نافذة معلّقة بعد كل هذا', out.stack === 0, out.stack);
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('الهوية المتحرّكة — تُقصّ ولا تُجمَّد', rows, errors);
  });

  /* ===================================================================== *
   * صورة الموظفة تُبدَّل من ملفها                                          *
   * ===================================================================== */
  group('الفريق — الصورة نفسها مدخل تعديلها', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openBrowser(browser, url);
      errors = a.errors;
      const out = await a.page.evaluate(async () => {
        const TG = window.TG;
        const st = await TG.Repos.staff.create({ name: 'هدى المدرّبة', role: 'مدرّبة',
          baseSalary: 300, status: 'active', hireDate: '2024-01-01' });
        TG.Screens.staffProfile(st.id);
        await new Promise(r => setTimeout(r, 140));
        const modal = document.querySelector('.overlay .modal');
        const holder = modal.querySelector('[data-photo-edit]');
        const btn = holder && holder.querySelector('[data-photo-btn]');
        /* الملف وضع قراءة: لا حقل إدخال واحد فيه — ولا منتقي ملفات مخبّأ */
        const inputs = modal.querySelectorAll('input:not([type=hidden]),select,textarea').length;
        const fileInputs = modal.querySelectorAll('input[type=file]').length;
        /* القلم يُخفى بالشفافية ويظهر عند المرور — فيُقاس أنه موجود ومخفيّ */
        const hidden = btn ? Number(getComputedStyle(btn).opacity) : -1;
        const label = btn ? btn.getAttribute('aria-label') : '';

        /* المسار الفعليّ: نفس الخدمة التي يناديها القلم */
        const png = () => new Promise(res => {
          const c = document.createElement('canvas'); c.width = 40; c.height = 40;
          const x = c.getContext('2d'); x.fillStyle = '#123456'; x.fillRect(0, 0, 40, 40);
          c.toBlob(b => res(new File([b], 'هدى.png', { type: 'image/png' })), 'image/png');
        });
        const before = TG.Repos.media.list(true).length;
        const rec = await TG.Svc.media.replaceOn({ repo: TG.Repos.staff, store: 'staff',
          id: st.id, field: 'photoMediaId', perm: 'staff.edit', file: await png() });
        const first = rec.photoMediaId;
        /* الاستبدال ثانيةً: القديمة تُنظَّف فلا تتراكم الوسائط اليتيمة */
        const rec2 = await TG.Svc.media.replaceOn({ repo: TG.Repos.staff, store: 'staff',
          id: st.id, field: 'photoMediaId', perm: 'staff.edit', file: await png() });
        const oldGone = !TG.Repos.media.get(first);
        const after = TG.Repos.media.list(true).length;
        /* النسخة الاحتياطية تلتقطها كأي وسائط — لا مخزن ثانٍ */
        const backup = TG.Backup.build(true);
        const inBackup = (backup.data.media || []).some(m => m.id === rec2.photoMediaId);
        return { hasHolder: !!holder, hasBtn: !!btn, inputs, fileInputs, hidden, label,
                 saved: !!rec2.photoMediaId, replaced: rec2.photoMediaId !== first,
                 oldGone, grew: after - before, inBackup };
      });

      ok('الصورة في الملف محاطة بمدخل تعديل', out.hasHolder && out.hasBtn);
      ok('وله وصف منطوق لقارئ الشاشة', /صورة/.test(out.label || ''), out.label);
      ok('والقلم مخفيّ حتى المرور فوق الصورة', out.hidden === 0, out.hidden);
      /* الثابت القديم يبقى: الملف يُقرأ ولا يُعدَّل فيه */
      ok('والملف يبقى وضع قراءة — لا حقل إدخال', out.inputs === 0, out.inputs);
      ok('ولا منتقي ملفات مخبّأ في صفحته', out.fileInputs === 0, out.fileInputs);
      ok('الحفظ يربط الصورة بالموظفة', out.saved);
      ok('والاستبدال يعطي وسائط جديدة', out.replaced);
      ok('والقديمة تُنظَّف فلا تتراكم', out.oldGone && out.grew === 1, `+${out.grew}`);
      ok('والنسخة الاحتياطية تلتقطها كأي وسائط', out.inBackup);
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('الفريق — الصورة نفسها مدخل تعديلها', rows, errors);
  });

  group('مركز الملفات — يجد ما أُنتج ويفتحه', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openDesktop(browser, url);
      errors = a.errors;

      /* ثلاثة تصديرات ونسخة يدوية ونسخة تلقائية — بالمسار الحقيقي للنظام */
      const made = await a.page.evaluate(async () => {
        const TG = window.TG;
        await TG.Seed.demo ? null : null;
        const csv = new Blob(['\ufeffالاسم,المبلغ\nسارة,100\n'], { type: 'text/csv' });
        await TG.UI.download(csv, 'تقرير-المقبوضات.csv');
        const xlsx = new Blob([new Uint8Array([80, 75, 3, 4, 1, 2, 3])], { type: 'application/octet-stream' });
        await TG.UI.download(xlsx, 'دفتر-الحسابات.xlsx');
        const docx = new Blob([new Uint8Array([80, 75, 3, 4, 9, 9])], { type: 'application/octet-stream' });
        await TG.UI.download(docx, 'كشف-حساب.docx');
        await TG.Actions.exportBackup(false);
        await TG.Backup.runAuto();
        return window.__TG_FS__.files.map(f => `${f.folder}\\${f.name}`);
      });
      ok('التصديرات والنسخ كُتبت في مجلّداتها', made.length >= 5, made.join(' | '));

      const listed = await a.page.evaluate(async () => {
        const rowsOut = await window.TG.FileCentre.list();
        return rowsOut.map(r => ({ c: r.category, n: r.name, b: r.bytes, m: r.modified }));
      });
      const byCat = c => listed.filter(x => x.c === c);
      ok('مركز الملفات يجد ملف CSV', byCat('csv').some(x => /\.csv$/.test(x.n)), JSON.stringify(byCat('csv')));
      ok('ويجد ملف Excel', byCat('excel').some(x => /\.xlsx$/.test(x.n)));
      ok('ويجد ملف Word', byCat('word').some(x => /\.docx$/.test(x.n)));
      ok('ويجد النسخة اليدوية', byCat('backup-manual').some(x => /\.json$/.test(x.n)));
      ok('ويجد النسخة التلقائية', byCat('backup-auto').some(x => /تلقائية/.test(x.n)));
      ok('وكل صفّ يحمل حجماً وتاريخاً', listed.every(x => x.b > 0 && x.m > 0));
      ok('الأحدث أولاً', listed.every((x, i) => i === 0 || listed[i - 1].m >= x.m));

      /* ---- الشاشة نفسها: تُرسم وتقول أين الملفات بالعربية ---- */
      const screen = await a.page.evaluate(async () => {
        window.TG.go('files'); window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 400));
        const root = document.getElementById('viewRoot');
        return { text: root.innerText,
                 openBtns: root.querySelectorAll('[data-open]').length,
                 folderBtns: root.querySelectorAll('[data-folder]').length,
                 restoreBtns: root.querySelectorAll('[data-restore]').length,
                 title: document.getElementById('pageTitle').textContent };
      });
      ok('عنوان الشاشة «ملفات تبارك جيم»', /ملفات تبارك جيم/.test(screen.title), screen.title);
      ok('وفيها قسم النسخ الاحتياطية', /النسخ الاحتياطية/.test(screen.text));
      ok('وقسم التقارير المصدّرة', /التقارير المصدّرة/.test(screen.text));
      ok('والموضع يُقال بالعربية لا بمسار تقني',
         /المستندات ‹ تبارك جيم ‹ التقارير/.test(screen.text), screen.text.slice(0, 180));
      ok('ولا يظهر مسار ويندوز الخام في الشاشة',
         !/%LOCALAPPDATA%|C:\\\\Users/.test(screen.text));
      ok('لكل تقرير زرّ «فتح الملف»', screen.openBtns >= 3, screen.openBtns);
      ok('ولكل صفّ زرّ «فتح المجلد»', screen.folderBtns >= 5, screen.folderBtns);
      ok('وللنسخ زرّ «استعادة» لا «فتح الملف»', screen.restoreBtns >= 2, screen.restoreBtns);

      /* ---- الفتح الفعلي: الفئة والاسم يصلان إلى الجسر ---- */
      const opened = await a.page.evaluate(async () => {
        const root = document.getElementById('viewRoot');
        const btn = [...root.querySelectorAll('[data-open]')].find(b => /\.csv$/.test(b.dataset.open));
        btn.click();
        await new Promise(r => setTimeout(r, 200));
        const f = [...root.querySelectorAll('[data-folder]')].find(b => b.dataset.folder === 'excel');
        f.click();
        await new Promise(r => setTimeout(r, 200));
        return { opened: window.__TG_FS__.opened, folders: window.__TG_FS__.openedFolders,
                 calls: window.__TG_FS__.calls.filter(c => /tg_open/.test(c.cmd)).map(c => c.args) };
      });
      ok('فتح الملف نادى الجسر بفئة واسم', opened.opened.length === 1
         && opened.opened[0].category === 'csv' && /\.csv$/.test(opened.opened[0].name),
         JSON.stringify(opened.opened));
      ok('فتح المجلد نادى الجسر بفئته', opened.folders.includes('excel'), JSON.stringify(opened.folders));
      ok('ولا مسار واحد مُرسَل من الواجهة',
         opened.calls.every(x => !('path' in x) && !('folder' in x) && !('dir' in x)),
         JSON.stringify(opened.calls));

      /* ---- ملفّ حُذف من خارج التطبيق ---- */
      const missing = await a.page.evaluate(async () => {
        /* يُحذف من «القرص» بلا علم التطبيق */
        window.__TG_FS__.files = window.__TG_FS__.files.filter(f => !/\.csv$/.test(f.name));
        const root = document.getElementById('viewRoot');
        const btn = [...root.querySelectorAll('[data-open]')].find(b => /\.csv$/.test(b.dataset.open));
        btn.click();
        await new Promise(r => setTimeout(r, 250));
        const tr = btn.closest('tr');
        return { label: btn.textContent, missing: tr.classList.contains('fc-missing'),
                 toast: (document.getElementById('toastRoot') || {}).innerText || '' };
      });
      ok('ملفّ حُذف من خارج التطبيق يُقال إنه غير موجود', /لم يعد موجود/.test(missing.toast), missing.toast);
      ok('ويُعلَّم صفّه ناقصاً بدل اختراع بيانات', missing.missing && /غير موجود/.test(missing.label));

      /* ---- الأداء: مجلّد ممتلئ لا يجمّد الشاشة ----
         القاعدة (المرحلة 33): لا مسح كامل. لكل فئة حدٌّ من الأحدث في طرف
         الصدأ وفي الواجهة معاً، فألفُ ملفٍّ على القرص لا تعني ألف صفّ. */
      const perf = await a.page.evaluate(async () => {
        const FS = window.__TG_FS__;
        const base = Date.now();
        for (let i = 0; i < 1000; i++)
          FS.files.push({ folder: 'Exports\\CSV', name: `قديم-${i}.csv`, category: 'csv',
                          text: 'x', b64: null, bytes: 120 + i, modified: base - i * 1000 });
        for (let i = 0; i < 400; i++)
          FS.files.push({ folder: 'Backups\\automatic', name: `تلقائية-${i}.json`, category: 'backup-auto',
                          text: '{}', b64: null, bytes: 900 + i, modified: base - i * 1000 });
        const t0 = performance.now();
        const listed = await window.TG.FileCentre.list();
        const tList = performance.now() - t0;
        const t1 = performance.now();
        window.TG.go('files'); window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 500));
        const tDraw = performance.now() - t1;
        const root = document.getElementById('viewRoot');
        return { rows: listed.length,
                 csv: listed.filter(x => x.category === 'csv').length,
                 auto: listed.filter(x => x.category === 'backup-auto').length,
                 domRows: root.querySelectorAll('tbody tr').length,
                 tList: Math.round(tList), tDraw: Math.round(tDraw),
                 responsive: !!document.getElementById('fcRefresh') };
      });
      ok('ألف تصدير على القرص: لا تُقرأ كلّها',
         perf.csv <= 60, `csv=${perf.csv}`);
      ok('وأربعمئة نسخة تلقائية كذلك', perf.auto <= 60, `auto=${perf.auto}`);
      ok('والقراءة سريعة', perf.tList < 1500, `${perf.tList}ms`);
      ok('والرسم سريع', perf.tDraw < 3000, `${perf.tDraw}ms`);
      ok('والصفوف المرسومة محدودة لا ألف صفّ', perf.domRows <= 300, perf.domRows);
      ok('والشاشة ما زالت مستجيبة', perf.responsive);

      /* ---- لا جدول ثانياً في قاعدة البيانات ---- */
      const stores = await a.page.evaluate(() => window.TG.STORE_NAMES.slice());
      ok('لا جدول جديد في قاعدة البيانات لتسجيل الملفات',
         !stores.some(s => /file|export|generated/i.test(s)), stores.join('،'));
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('مركز الملفات — يجد ما أُنتج ويفتحه', rows, errors);
  });

  /* ===================================================================== *
   * 6) رسائل الحفظ تحمل فعلها                                             *
   * ===================================================================== */
  group('سطح المكتب — رسالة الحفظ تحمل فعلها', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      /* هذه المجموعة تحقن فشلاً عمداً، وسجلّ التطبيق `[TG]` هو **المتوقَّع**:
         النظام يقول سبب الفشل بدل ابتلاعه. فالخطأ الحقيقي وحده يُعدّ. */
      const a = await openDesktop(browser, url, { expectLogged: true });
      errors = a.errors;
      const t = async (mk) => a.page.evaluate(async (code) => {
        document.getElementById('toastRoot').innerHTML = '';
        await eval('(' + code + ')')();
        await new Promise(r => setTimeout(r, 150));
        const el = document.querySelector('#toastRoot .toast');
        return { text: el ? el.innerText : '',
                 acts: el ? [...el.querySelectorAll('[data-act]')].map(b => b.textContent) : [] };
      }, mk);

      const xlsx = await t(`async () => { await window.TG.UI.download(
        new Blob([new Uint8Array([80,75,3,4])], { type:'application/octet-stream' }), 'دفتر.xlsx'); }`);
      ok('رسالة Excel تقول نوع الملف صراحةً', /تم حفظ ملف Excel/.test(xlsx.text), xlsx.text);
      ok('ولا تقول «تم الحفظ» وحدها', !/^تم الحفظ$/.test(xlsx.text.trim()));
      ok('وتعطي «فتح الملف»', xlsx.acts.includes('فتح الملف'), xlsx.acts.join('،'));
      ok('وتعطي «فتح المجلد»', xlsx.acts.includes('فتح المجلد'));
      ok('وتقول أين حُفظ بالعربية',
         /المستندات ‹ تبارك جيم ‹ التقارير ‹ Excel/.test(xlsx.text), xlsx.text);

      const csv = await t(`async () => { await window.TG.UI.download(
        new Blob(['\\ufeffأ,ب\\n1,2\\n'], { type:'text/csv' }), 'تقرير.csv'); }`);
      ok('رسالة CSV تقول CSV', /تم حفظ ملف CSV/.test(csv.text), csv.text);
      ok('ومعها الفعلان', csv.acts.includes('فتح الملف') && csv.acts.includes('فتح المجلد'));

      const word = await t(`async () => { await window.TG.UI.download(
        new Blob([new Uint8Array([80,75,3,4])], { type:'application/octet-stream' }), 'كشف.docx'); }`);
      ok('رسالة Word تقول Word', /تم حفظ ملف Word/.test(word.text), word.text);
      ok('ومعها الفعلان', word.acts.includes('فتح الملف') && word.acts.includes('فتح المجلد'));

      const bk = await t(`async () => { await window.TG.Actions.exportBackup(false); }`);
      ok('رسالة النسخة الاحتياطية واضحة', /تم حفظ النسخة الاحتياطية/.test(bk.text), bk.text);
      ok('ومعها «فتح المجلد»', bk.acts.includes('فتح المجلد'), bk.acts.join('،'));
      ok('ولا «فتح الملف» لنسخة تُستعاد لا تُفتح', !bk.acts.includes('فتح الملف'));
      ok('وتُسمّي الملف', /نسخة-تبارك-جيم-.*\.json/.test(bk.text), bk.text);

      /* الفعل يعمل فعلاً: الضغط عليه ينادي الجسر */
      const acted = await a.page.evaluate(async () => {
        document.getElementById('toastRoot').innerHTML = '';
        window.__TG_FS__.opened = []; window.__TG_FS__.openedFolders = [];
        await window.TG.UI.download(new Blob(['x'], { type: 'text/csv' }), 'فعل.csv');
        await new Promise(r => setTimeout(r, 120));
        const btns = [...document.querySelectorAll('#toastRoot [data-act]')];
        btns.find(b => b.textContent === 'فتح الملف').click();
        await new Promise(r => setTimeout(r, 200));
        return { opened: window.__TG_FS__.opened,
                 toastGone: !document.querySelector('#toastRoot .toast [data-act]') };
      });
      ok('الضغط على «فتح الملف» يفتح ما حُفظ بالضبط',
         acted.opened.length === 1 && acted.opened[0].name === 'فعل.csv' && acted.opened[0].category === 'csv',
         JSON.stringify(acted.opened));

      /* الفشل لا يُجمّل: لا فعل على رسالة فشل */
      const bad = await a.page.evaluate(async () => {
        document.getElementById('toastRoot').innerHTML = '';
        window.__TG_FS__.fail.save = 'القرص ممتلئ';
        await window.TG.UI.download(new Blob(['x'], { type: 'text/csv' }), 'فاشل.csv');
        await new Promise(r => setTimeout(r, 150));
        delete window.__TG_FS__.fail.save;
        const el = document.querySelector('#toastRoot .toast');
        return { text: el ? el.innerText : '', kind: el ? el.className : '',
                 acts: el ? el.querySelectorAll('[data-act]').length : -1 };
      });
      ok('حفظٌ فاشل يُقال فشلاً', /تعذّر حفظ الملف/.test(bad.text) && /err/.test(bad.kind), bad.text);
      ok('ولا يُعرض عليه «فتح الملف»', bad.acts === 0, bad.acts);
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('سطح المكتب — رسالة الحفظ تحمل فعلها', rows, errors);
  });

  /* ===================================================================== *
   * 7) الطباعة: لا طريق إلى معاينة المتصفّح                                *
   * ===================================================================== */
  group('الطباعة — لا معاينة متصفّح في تطبيق ويندوز', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      /* تُحقن طباعةٌ فاشلة عمداً في آخر المجموعة، وسجلّ التطبيق `[TG]` هو
         المتوقَّع حينها: النظام يقول سبب الفشل بدل ابتلاعه. */
      const a = await openDesktop(browser, url, { expectLogged: true });
      errors = a.errors;

      /* أي نداء إلى `window.print` أو `window.open` يُرصد ويُحسب */
      await a.page.evaluate(() => {
        window.__PRINT_CALLS__ = 0; window.__OPEN_CALLS__ = 0;
        window.print = () => { window.__PRINT_CALLS__++; };
        window.open = () => { window.__OPEN_CALLS__++; return null; };
      });

      /* ---- Ctrl+P: كان الطريق الوحيد الباقي إلى معاينة المتصفّح ---- */
      const ctrlP = await a.page.evaluate(async () => {
        window.TG.go('members'); window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 200));
        const before = window.__TG_FS__.calls.filter(c => c.cmd === 'tg_print').length;
        const ev = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
        document.dispatchEvent(ev);
        await new Promise(r => setTimeout(r, 400));
        return { prevented: ev.defaultPrevented,
                 printCalls: window.__PRINT_CALLS__, openCalls: window.__OPEN_CALLS__,
                 native: window.__TG_FS__.calls.filter(c => c.cmd === 'tg_print').length - before };
      });
      ok('Ctrl+P لا يصل إلى محرّك العرض', ctrlP.prevented);
      ok('ولا يُنادي window.print()', ctrlP.printCalls === 0, ctrlP.printCalls);
      ok('ولا يفتح نافذة متصفّح', ctrlP.openCalls === 0, ctrlP.openCalls);
      ok('بل يذهب إلى واجهة طباعة ويندوز', ctrlP.native === 1, ctrlP.native);

      /* ---- Ctrl+P على **لوحة مفاتيح عربية** ----
         هذا هو العيب الذي بقي بعد المرحلة 4.2، وهو سبب العبارة الإنجليزية
         التي كانت تظهر للمستخدمة: `e.key` يحمل الحرف الذي يُنتجه التخطيط،
         فعلى لوحة عربية يكون `'ح'` لا `'p'`. والمحرّك يفتح اختصار الطباعة
         مع ذلك، لأنه يقابل الاختصارات بمفاتيحها اللاتينية. فكان الشرط
         يسقط، وتمضي الضغطة إلى WebView2.

         ونادي تبارك جيم نادٍ عربيّ — فهذا ليس طرفاً نادراً بل الحالة
         الغالبة على جهازه. */
      const arabicLayout = await a.page.evaluate(async () => {
        window.TG.go('members'); window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 250));
        window.dispatchEvent(new Event('afterprint'));
        for (let i = 0; i < 40 && window.TG.UI._printing; i++) await new Promise(r => setTimeout(r, 100));
        const before = window.__TG_FS__.calls.filter(c => c.cmd === 'tg_print').length;
        /* ما يرسله كروميوم فعلاً على تخطيط عربي: الحرف عربيّ والمفتاح KeyP */
        const ev = new KeyboardEvent('keydown',
          { key: 'ح', code: 'KeyP', ctrlKey: true, bubbles: true, cancelable: true });
        document.dispatchEvent(ev);
        await new Promise(r => setTimeout(r, 400));
        return { prevented: ev.defaultPrevented,
                 printCalls: window.__PRINT_CALLS__,
                 native: window.__TG_FS__.calls.filter(c => c.cmd === 'tg_print').length - before };
      });
      ok('لوحة عربية: Ctrl+P يُعترض كذلك — المفتاح الماديّ لا الحرف',
         arabicLayout.prevented, arabicLayout.prevented);
      ok('ولا يصل إلى معاينة WebView2', arabicLayout.printCalls === 0, arabicLayout.printCalls);
      ok('بل إلى حوار ويندوز نفسه', arabicLayout.native === 1, arabicLayout.native);

      /* ---- ضغطة حقيقية من لوحة المفاتيح، لا حدثٌ مُركَّب ----
         الحدث المركَّب يُثبت أن المستمع يعمل؛ وهذا يُثبت أن **الاختصار
         نفسه** لا يصل إلى المحرّك. وهو الفرق بين اختبارٍ يمرّ وعيبٍ يُصلَح. */
      const realKey = await (async () => {
        await a.page.evaluate(async () => {
          window.TG.go('members'); window.TG.renderRoute();
          window.dispatchEvent(new Event('afterprint'));
          for (let i = 0; i < 40 && window.TG.UI._printing; i++) await new Promise(r => setTimeout(r, 100));
          await new Promise(r => setTimeout(r, 300));
          window.__BEFORE__ = window.__TG_FS__.calls.filter(c => c.cmd === 'tg_print').length;
        });
        await a.page.keyboard.press('Control+KeyP');
        await a.page.waitForTimeout(500);
        return a.page.evaluate(() => ({
          printCalls: window.__PRINT_CALLS__,
          openCalls: window.__OPEN_CALLS__,
          native: window.__TG_FS__.calls.filter(c => c.cmd === 'tg_print').length - window.__BEFORE__,
        }));
      })();
      ok('ضغطة Ctrl+P حقيقية: لا نداء إلى window.print()',
         realKey.printCalls === 0, realKey.printCalls);
      ok('ولا نافذة متصفّح', realKey.openCalls === 0, realKey.openCalls);
      ok('بل حوار ويندوز — مرّة واحدة', realKey.native === 1, realKey.native);

      /* ---- شاشة بلا مستند: يُقال ذلك بالعربية لا بصمت ---- */
      const empty = await a.page.evaluate(async () => {
        window.TG.go('settings'); window.TG.renderRoute();
        await new Promise(r => setTimeout(r, 250));
        document.getElementById('toastRoot').innerHTML = '';
        const before = window.__TG_FS__.calls.filter(c => c.cmd === 'tg_print').length;
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true }));
        await new Promise(r => setTimeout(r, 250));
        return { toast: (document.getElementById('toastRoot') || {}).innerText || '',
                 native: window.TG.Desktop.on() ? window.__TG_FS__.calls.filter(c => c.cmd === 'tg_print').length - before : -1 };
      });
      ok('شاشة بلا مستند: رسالة عربية مفهومة', /لا يوجد مستند للطباعة/.test(empty.toast), empty.toast);
      ok('ولا تُنادى الطباعة بلا مستند', empty.native === 0, empty.native);
      ok('ولا لفظ تقنيّ في الرسالة',
         !/(popup|window\.open|WebView|browser|preview|متصفّح|منبثق)/i.test(empty.toast), empty.toast);

      /* ---- وصل حقيقي: طباعة، إلغاء، إعادة، وعدّاد لا يكذب ----
         دلالة العدّاد في النظام: الطباعة الأولى تضع «آخر طباعة» ولا تزيد
         «إعادة الطباعة»؛ ما بعدها يزيدها. وهذا ما يُقاس — لا رقمٌ مخترَع. */
      const cycle = await a.page.evaluate(async () => {
        const { Svc, Repos, D, Actions, Settings, UI } = window.TG;
        const FS = window.__TG_FS__;
        const calls = () => FS.calls.filter(c => c.cmd === 'tg_print').length;
        await Settings.set({ receiptFormat: 'a4' });
        /* اختبار Ctrl+P أعلاه فتح حواراً لم يُغلق: يُغلق هنا ويُنتظر أن يسقط
           قفل الضغطة المزدوجة، وإلا قيس على هذه الدورة أثرُ الدورة السابقة. */
        window.dispatchEvent(new Event('afterprint'));
        for (let i = 0; i < 40 && UI._printing; i++) await new Promise(r => setTimeout(r, 100));
        await new Promise(r => setTimeout(r, 300));

        const m = await Svc.members.create({ name: 'مشتركة الطباعة', phone: '07700003344' });
        const mid = (m.rec || m).id;
        const sub = await Svc.subs.create({ memberId: mid, startDate: D.today(), planName: 'شهر',
          customDuration: { value: 1, unit: 'month' }, price: 90000, paidAmount: 90000, paymentMethod: 'cash' });
        const pay = Actions.lastPaymentOf('subscription', (sub.rec || sub).id);
        const rc = await Svc.receipts.ensure(pay.id);
        const state = () => { const r = Repos.receipts.get(rc.id);
          return { reprints: Number(r.reprints) || 0, printed: !!r.lastPrintedAt }; };
        const settle = async () => { window.dispatchEvent(new Event('afterprint'));
                                     await new Promise(r => setTimeout(r, 700)); };

        const fresh = state();

        /* (1) الطباعة الأولى */
        const c0 = calls();
        await Actions.printReceipt(rc.id, 'a4');
        await new Promise(r => setTimeout(r, 300));
        const first = { calls: calls() - c0, ...state(),
                        docInPage: !!document.getElementById('tgPrintRoot') };
        await settle();
        const cleaned = !document.getElementById('tgPrintRoot') && !document.getElementById('tgPrintStyle');

        /* (2) الإلغاء: يُفتح الحوار ثم يُغلق بلا ورق */
        const c1 = calls();
        await Actions.printReceipt(rc.id, 'a4');
        await new Promise(r => setTimeout(r, 300));
        const cancelOpened = calls() - c1;
        await settle();
        const afterCancel = { ...state(), stuck: !!document.getElementById('tgPrintRoot') };

        /* (3) إعادة بعد الإلغاء: يجب أن تعمل — لا وضع طباعة عالق */
        const c2 = calls();
        await Actions.printReceipt(rc.id, 'a4');
        await new Promise(r => setTimeout(r, 300));
        const retry = { calls: calls() - c2, ...state() };
        await settle();

        /* (4) طباعة فاشلة: لا عدّاد يتحرّك ولا ادّعاء نجاح */
        FS.fail.print = 'لا طابعة';
        document.getElementById('toastRoot').innerHTML = '';
        const beforeFail = state();
        const c3 = calls();
        await Actions.printReceipt(rc.id, 'a4');
        await new Promise(r => setTimeout(r, 400));
        const failed = { ...state(), before: beforeFail, tried: calls() - c3,
                         toast: document.getElementById('toastRoot').innerText,
                         leftover: !!document.getElementById('tgPrintRoot') };
        delete FS.fail.print;

        /* (5) وبعد عودة الطابعة تعمل الطباعة كما كانت */
        await new Promise(r => setTimeout(r, 2600));   /* يسقط قفل الضغطة المزدوجة */
        const c4 = calls();
        await Actions.printReceipt(rc.id, 'a4');
        await new Promise(r => setTimeout(r, 300));
        const recovered = { calls: calls() - c4, ...state() };
        await settle();

        return { fresh, first, cleaned, cancelOpened, afterCancel, retry, failed, recovered,
                 printCalls: window.__PRINT_CALLS__, openCalls: window.__OPEN_CALLS__ };
      });

      ok('وصل جديد: العدّاد صفر ولم يُطبع بعد',
         cycle.fresh.reprints === 0 && cycle.fresh.printed === false, JSON.stringify(cycle.fresh));
      ok('طباعة وصل: نُوديت واجهة ويندوز مرّة واحدة', cycle.first.calls === 1, cycle.first.calls);
      ok('والمستند وُضع في الصفحة نفسها لا في نافذة', cycle.first.docInPage);
      ok('ولم تُنادَ window.print() ولا مرة', cycle.printCalls === 0, cycle.printCalls);
      ok('ولم تُفتح نافذة متصفّح ولا مرة', cycle.openCalls === 0, cycle.openCalls);
      ok('الطباعة الأولى تُسجَّل ولا تُعدّ «إعادة»',
         cycle.first.printed === true && cycle.first.reprints === 0, JSON.stringify(cycle.first));
      ok('والصفحة تعود كما كانت بعدها', cycle.cleaned);

      ok('الإلغاء: فُتح الحوار مرّة', cycle.cancelOpened === 1, cycle.cancelOpened);
      ok('ولا يترك وضع طباعة عالقاً', !cycle.afterCancel.stuck);

      ok('الطباعة بعد الإلغاء تعمل', cycle.retry.calls === 1, cycle.retry.calls);
      /* دلالة العدّاد الحقيقية — وهي ما يستطيع النظام أن يعرفه:
         كل استدعاء **فُتح فيه حوار ويندوز** بعد الأولى يُعدّ نسخة ثانية.
         و`ShowPrintUI` لا تُبلّغ بما حدث داخل الحوار، فالضغط على «إلغاء»
         هناك يُعدّ نسخةً كذلك. هذا مقيس ومكتوب في حدود المرحلة، ولا يُدَّعى
         خلافه. والأهمّ أن العكس لا يقع أبداً: استدعاء **لم يُفتح** لا يزيد
         العدّاد — وهو ما تُثبته الحالة الفاشلة أدناه. */
      ok('كل حوار يُفتح بعد الأولى يُعدّ نسخة: بعد الإلغاء والإعادة ⇐ 2',
         cycle.retry.reprints === 2, cycle.retry.reprints);

      ok('طباعة فاشلة: نُوديت الواجهة ثم فشلت', cycle.failed.tried === 1, cycle.failed.tried);
      ok('ولا تزيد عدّاد إعادة الطباعة',
         cycle.failed.reprints === cycle.failed.before.reprints,
         `${cycle.failed.before.reprints} ⇐ ${cycle.failed.reprints}`);
      ok('ولا تقول إنها طُبعت', !/تمت الطباعة|طُبع الوصل/.test(cycle.failed.toast), cycle.failed.toast);
      ok('وتقول السبب بلغة المستخدمة', /تعذرت الطباعة/.test(cycle.failed.toast), cycle.failed.toast);
      ok('ولا تذكر متصفّحاً ولا نافذة منبثقة',
         !/(popup|window\.open|WebView|browser|preview|منبثق)/i.test(cycle.failed.toast));
      ok('ولا تترك مستنداً معلّقاً في الصفحة', !cycle.failed.leftover);

      ok('وبعد عودة الطابعة تعمل الطباعة', cycle.recovered.calls === 1, cycle.recovered.calls);
      ok('ويستأنف العدّاد من حيث توقّف — الفاشلة لم تُحسب',
         cycle.recovered.reprints === 3, cycle.recovered.reprints);
      ok('فمجموع ما زاده العدّاد = عدد الحوارات التي فُتحت فعلاً بعد الأولى',
         cycle.recovered.reprints === 3 && cycle.failed.reprints === 2,
         `فاشلة=${cycle.failed.reprints} بعدها=${cycle.recovered.reprints}`);

      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('الطباعة — لا معاينة متصفّح في تطبيق ويندوز', rows, errors);
  });

  /* ===================================================================== *
   * 8) المتصفّح كما كان                                                    *
   * ===================================================================== */
  group('المتصفح — لم يتغيّر شيء', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    let errors = [];
    try {
      const a = await openBrowser(browser, url);
      errors = a.errors;
      const out = await a.page.evaluate(async () => {
        const TG = window.TG;
        window.__PRINT_CALLS__ = 0;
        const realPrint = window.print;
        window.print = () => { window.__PRINT_CALLS__++; };

        const desktop = TG.Desktop.on();
        /* مدخل مركز الملفات لا يظهر في المتصفح */
        const navFiles = [...document.querySelectorAll('.nav-item')].some(b => b.dataset.route === 'files');
        /* وإن فُتحت الشاشة بالعنوان قالت لماذا لا تعمل هنا */
        TG.go('files'); TG.renderRoute();
        await new Promise(r => setTimeout(r, 200));
        const filesText = document.getElementById('viewRoot').innerText;

        /* Ctrl+P لا يُعترض في المتصفح: طباعة المتصفح تبقى كما هي */
        const ev = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, bubbles: true, cancelable: true });
        document.dispatchEvent(ev);
        await new Promise(r => setTimeout(r, 150));

        /* التصدير ما زال تنزيلاً */
        let downloaded = null;
        const realCreate = document.createElement.bind(document);
        document.createElement = (t) => { const el = realCreate(t);
          if (t === 'a') { const c = el.click.bind(el); el.click = () => { downloaded = el.download; }; }
          return el; };
        await TG.UI.download(new Blob(['x'], { type: 'text/csv' }), 'متصفح.csv');
        document.createElement = realCreate;
        window.print = realPrint;
        return { desktop, navFiles, filesText, prevented: ev.defaultPrevented,
                 printCalls: window.__PRINT_CALLS__, downloaded };
      });
      ok('لا جسر سطح مكتب في المتصفح', out.desktop === false);
      ok('ولا مدخل لمركز الملفات', out.navFiles === false);
      ok('وإن فُتحت شاشته قالت إنها لتطبيق سطح المكتب',
         /تطبيق سطح المكتب/.test(out.filesText), out.filesText.slice(0, 120));
      ok('Ctrl+P لا يُعترض في المتصفح — طباعته كما كانت', out.prevented === false);
      ok('ولم يُستبدل بنداء طباعة أصليّ', out.printCalls === 0, out.printCalls);
      ok('والتصدير ما زال تنزيلاً باسمه', out.downloaded === 'متصفح.csv', out.downloaded);

      /* الطباعة في المتصفح تبقى في وعائها المستقلّ ولا تُحقن في الصفحة.
         والوعاء أحدُ اثنين بحسب ما يسمح به المتصفّح: نافذة منبثقة إن سُمحت،
         وإلا إطار مخفيّ. فيُقاس أن الوعاء **مستقلّ** لا أيُّهما كان — وهذا
         ما يعد به `UI.printTarget`، ولم تمسّه هذه المرحلة. */
      const pr = await a.page.evaluate(async () => {
        const beforeFrames = document.querySelectorAll('iframe').length;
        let popups = 0;
        const realOpen = window.open;
        window.open = function (...args) { popups++; return realOpen.apply(window, args); };
        window.TG.UI.printSection('اختبار', '<p>مستند</p>');
        await new Promise(r => setTimeout(r, 300));
        window.open = realOpen;
        return { injected: !!document.getElementById('tgPrintRoot'), popups,
                 frames: document.querySelectorAll('iframe').length - beforeFrames };
      });
      ok('الطباعة في المتصفح لا تُحقن في صفحة التطبيق', !pr.injected);
      ok('بل تبقى في وعاء مستقلّ (نافذة أو إطار)', pr.popups + pr.frames >= 1,
         `نوافذ=${pr.popups} إطارات=${pr.frames}`);
      /* والجسر لا يُنادى أصلاً: لا أمر واحد ذهب إليه في هذه الجلسة */
      const bridgeCalls = await a.page.evaluate(() =>
        typeof window.__TG_FS__ === 'undefined' ? 'لا جسر' : window.__TG_FS__.calls.length);
      ok('ولا جسر أصليّ في المتصفح ليُنادى', bridgeCalls === 'لا جسر', bridgeCalls);
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('المتصفح — لم يتغيّر شيء', rows, errors);
  });
};
