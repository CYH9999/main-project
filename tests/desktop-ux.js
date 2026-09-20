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
const { installBridge } = require('./desktop-io.js');

const ROOT = path.join(__dirname, '..');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const DIST = path.join(ROOT, 'app', 'index.html');

module.exports = function register({ group, record, TESTS_JS }) {
  const conf = () => JSON.parse(fs.readFileSync(CONF, 'utf8'));

  function serveDesktop() {
    const csp = conf().app.security.csp;
    return new Promise(res => {
      const srv = http.createServer((req, r) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        /* يُقدَّم مجلّد البناء كما يقدّمه Tauri: الصفحة ونافذة البدء بجانبها */
        const file = u === '/' ? DIST
          : u === '/splash.html' ? path.join(ROOT, 'app', 'splash.html')
          : path.join(ROOT, u.replace(/^\//, ''));
        if (!fs.existsSync(file)) { r.writeHead(404); return r.end('nf'); }
        r.writeHead(200, {
          'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
          'Content-Security-Policy': csp,
        });
        r.end(fs.readFileSync(file));
      });
      srv.listen(0, '127.0.0.1', () => res(srv));
    });
  }

  /* يفتح التطبيق كما يُفتح في تطبيق ويندوز: الجسر مركَّب، ولا نوافذ منبثقة */
  async function openDesktop(browser, url, opts = {}) {
    const ctx = await browser.newContext(opts.context || {});
    await ctx.addInitScript(() => { window.open = function () { return null; }; });
    await ctx.addInitScript(installBridge, { fail: opts.fail || {} });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    const noise = t => /favicon|404/i.test(t) || (opts.expectLogged && /^\[TG\]/.test(t));
    page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);
    await page.addScriptTag({ content: TESTS_JS });
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
    await page.addScriptTag({ content: TESTS_JS });
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
    const url = `http://127.0.0.1:${srv.address().port}/`;
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
      await ctx.addInitScript(installBridge, { fail: {} });
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
   * 2) نافذة البدء وتقليل الحركة                                          *
   * ===================================================================== */
  group('سطح المكتب — نافذة البدء وتقليل الحركة', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/splash.html`;
    try {
      /* بلا تفضيل: الحركة تعمل — نُقاس بمقارنة إطارين لا بوصف */
      for (const reduce of [false, true]) {
        const ctx = await browser.newContext({ reducedMotion: reduce ? 'reduce' : 'no-preference' });
        const page = await ctx.newPage();
        await page.goto(url, { waitUntil: 'load' });
        const state = await page.evaluate(() => {
          const bar = document.querySelector('.bar i');
          const mark = document.querySelector('.mark');
          const cs = el => el ? getComputedStyle(el) : null;
          const barCs = cs(bar), markCs = cs(mark);
          return {
            hasMark: !!mark,
            barVisible: !!bar && barCs.display !== 'none',
            barAnim: bar ? barCs.animationName : 'none',
            markAnim: mark ? markCs.animationName : 'none',
            waitText: getComputedStyle(document.querySelector('.bar'), '::after').content,
          };
        });
        ok(`${reduce ? 'مع' : 'بلا'} تقليل الحركة: الشعار مرسوم`, state.hasMark);
        if (reduce) {
          ok('تقليل الحركة: لا شريط متحرّك', !state.barVisible, state.barAnim);
          ok('تقليل الحركة: لا حركة على الشعار', state.markAnim === 'none', state.markAnim);
          ok('تقليل الحركة: الانتظار يُقال بكلمة لا بحركة',
             /جارٍ التحميل/.test(state.waitText || ''), state.waitText);
        } else {
          ok('بلا تقليل الحركة: الشريط يتحرّك', state.barVisible && state.barAnim !== 'none', state.barAnim);
          ok('بلا تقليل الحركة: الشعار يظهر بحركة لطيفة', state.markAnim !== 'none', state.markAnim);
        }
        await ctx.close();
      }
      /* شاشة التطبيق نفسها: سياسة الحركة العامّة لم تُمسّ */
      const appUrl = `http://127.0.0.1:${srv.address().port}/`;
      const ctx2 = await browser.newContext({ reducedMotion: 'reduce' });
      const p = await ctx2.newPage();
      await p.goto(appUrl, { waitUntil: 'domcontentloaded' });
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
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('سطح المكتب — نافذة البدء وتقليل الحركة', rows, []);
  });

  /* ===================================================================== *
   * 2ب) الانتقال بين الشاشات والتركيز                                      *
   * ===================================================================== */
  group('سطح المكتب — انتقال الشاشات والتركيز', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
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
   * 3) الشعار: صندوق ثابت مهما كان المصدر                                 *
   * ===================================================================== */
  group('الهوية — صندوق الشعار ثابت', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
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
        /* شاشة الدخول تُركَّب مؤقّتاً لقياس شعارها ثم تُزال */
        const g = document.createElement('div');
        g.innerHTML = '<div class="gate-card">' + window.TG.Brand.logoHtml(52) + '</div>';
        document.body.appendChild(g);
        const gate = box(g.querySelector('.brand-logo, .brand-mark'));
        g.remove();
        const info = window.TG.Brand.info('logo');
        return {
          stored: info.width + '×' + info.height,
          sidebar: box(document.querySelector('.brand .brand-logo, .brand .brand-mark')),
          prevBox: box(document.querySelector('.media-drop .brand-prev')),
          prevImg: box(document.querySelector('[data-brand-prev="logo"]')),
          gate,
          print: box(document.querySelector('.doc-head-brand .brand-logo')),
        };
      }, [w, h, MAKE_IMAGE]);

      /* ---- مربّعات بأحجام متباعدة: كل الأبعاد المرسومة متطابقة ---- */
      const squares = {};
      for (const d of [128, 512, 1024, 2400]) squares[d] = await measure(d, d);
      const ref = squares[128];
      ok('المصادر المربّعة الأربعة رُفعت وسُجّلت بأبعادها',
         [128, 512, 1024, 2400].every(d => squares[d].stored === `${d}×${d}`),
         Object.values(squares).map(x => x.stored).join('، '));
      ['sidebar', 'prevBox', 'gate', 'print'].forEach(surface => {
        const all = [128, 512, 1024, 2400].map(d => squares[d][surface]);
        const same = all.every(x => x && x.w === all[0].w && x.h === all[0].h);
        ok(`${surface}: الحجم المرسوم واحد من 128 إلى 2400`, same,
           all.map(x => x ? `${x.w}×${x.h}` : '—').join(' / '));
      });
      ok('الشريط الجانبي 38×38 كما كان', ref.sidebar.w === 38 && ref.sidebar.h === 38,
         `${ref.sidebar.w}×${ref.sidebar.h}`);
      ok('معاينة الإعدادات صندوق 120×120', ref.prevBox.w === 120 && ref.prevBox.h === 120,
         `${ref.prevBox.w}×${ref.prevBox.h}`);
      ok('شاشة الدخول 52×52', ref.gate.w === 52 && ref.gate.h === 52, `${ref.gate.w}×${ref.gate.h}`);
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
      /* النسبة محفوظة داخل الصندوق: contain لا تمطّ الصورة */
      const ratio = wide.prevImg.w / Math.max(1, wide.prevImg.h);
      ok('ونسبة الصورة محفوظة داخله (لا تمطيط)', ratio > 3.4 && ratio < 4.6, ratio.toFixed(2));

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

      /* ---- الإرشاد المكتوب: مقاسات مقترحة لا شروط ---- */
      const guide = await a.page.evaluate(() => document.body.innerText);
      ok('الإعدادات تقترح 512 × 512 للشعار', /512\s*×\s*512/.test(guide));
      ok('وتقترح 1600 × 400 للّافتة', /1600\s*×\s*400/.test(guide));
      ok('وتقول إن المقاس اقتراح لا شرط', /اقتراح لا شرط/.test(guide));
      await a.ctx.close();
      srv.close();
    } catch (e) { srv.close(); throw e; }
    record('الهوية — صندوق الشعار ثابت', rows, errors);
  });

  /* ===================================================================== *
   * 4) ملف الموظفة يُقرأ بلا «تعديل»                                       *
   * ===================================================================== */
  group('الفريق — ملف الموظفة يُقرأ بلا تعديل', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
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
  group('مركز الملفات — يجد ما أُنتج ويفتحه', async (browser) => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
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
    const url = `http://127.0.0.1:${srv.address().port}/`;
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
    const url = `http://127.0.0.1:${srv.address().port}/`;
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
    const url = `http://127.0.0.1:${srv.address().port}/`;
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
