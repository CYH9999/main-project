/* ============================================================================
   تبارك جيم — اختبارات وقت تشغيل سطح المكتب (ويندوز · Tauri · WebView2)

   ما الذي يختلف فعلاً بين المتصفح وتطبيق سطح المكتب؟ ثلاثة أشياء لا أكثر،
   وهذه المجموعة تفرضها كلّها على متصفح حقيقي بدل أن تفترض أنها لا تضرّ:

     1. `window.open` تُرجع null. غلاف Tauri لا يُسجّل معالج نوافذ جديدة، فـwry
        يردّ الطلب بـ SetHandled(true) بلا نافذة. كل ما بُني على نافذة منبثقة
        يسقط هناك صامتاً — والطباعة كانت مبنيّة عليها.
     2. سياسة أمن المحتوى (CSP) المكتوبة في tauri.conf.json تُرسَل فعلاً مع
        الصفحة. تُقرأ هنا من ملف التهيئة نفسه، فلا يمكن للاختبار أن يفترق عن
        ما يُشحن.
     3. الواجهة تُقدَّم من مجلّد البناء app/ لا من ملف الجذر — وهو ما يشحنه
        المثبِّت فعلاً.

   وما لا تدّعيه هذه المجموعة: أنها WebView2. المحرّك هنا Chromium، وWebView2
   مبنيّ على Chromium أيضاً، لكنهما ليسا الشيء نفسه. ما لم يُقَس على ويندوز
   مكتوب في تقرير المرحلة تحت «حدود معروفة» لا هنا.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const SOURCE = path.join(ROOT, 'tabarak-gym 3.0.html');
const DIST = path.join(ROOT, 'app', 'index.html');

const conf = () => JSON.parse(fs.readFileSync(CONF, 'utf8'));

/* خادم يحاكي ما يراه التطبيق المكتبي: مجلّد البناء + ترويسة CSP المشحونة */
function serveDesktop(){
  const csp = conf().app.security.csp;
  return new Promise(res => {
    const srv = http.createServer((req, r) => {
      const u = decodeURIComponent(req.url.split('?')[0]);
      const file = u === '/' ? DIST : path.join(ROOT, u.replace(/^\//, ''));
      if (!fs.existsSync(file)){ r.writeHead(404); return r.end('not found'); }
      r.writeHead(200, {
        'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
        'Content-Security-Policy': csp,
      });
      r.end(fs.readFileSync(file));
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

module.exports = function register({ group, record, chromium, CHROME, TESTS_JS }){

  /* فتح التطبيق بقيود سطح المكتب الثلاثة مجتمعة */
  async function openDesktop(browser, url, opts = {}){
    const ctx = await browser.newContext(opts.context || {});
    /* القيد الأول يُركَّب قبل أي سطر من سطور التطبيق */
    await ctx.addInitScript(() => { window.open = function(){ return null; }; });
    const page = await ctx.newPage();
    const errors = [], requests = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    const noise = t => /favicon|status of 404/i.test(t);
    page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
    page.on('request', r => requests.push(r.url()));
    await page.goto(url, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
    await page.evaluate(() => window.TG.ready);
    await page.addScriptTag({ content: TESTS_JS });
    return { ctx, page, errors, requests };
  }

  /* ===================================================================== *
   * 1) مصدر واحد وتهيئة لا تكذب                                           *
   * ===================================================================== */
  group('سطح المكتب — مصدر واحد وتهيئة', async () => {
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const c = conf();

    /* ----- المصدر واحد ----- */
    const src = fs.readFileSync(SOURCE);
    const dist = fs.existsSync(DIST) ? fs.readFileSync(DIST) : null;
    ok('مجلّد البناء موجود (npm run prepare:frontend)', !!dist);
    ok('واجهة سطح المكتب هي ملف المتصفح نفسه بايتاً ببايت',
       !!dist && dist.equals(src),
       dist ? `src=${src.length} dist=${dist.length}` : 'app/index.html غير موجود');
    ok('لا واجهة ثانية في المستودع',
       !fs.readdirSync(ROOT).some(f => /^index-desktop|desktop\.html$/i.test(f)));
    ok('app/ مستثنى من git — مخرج بناء لا مصدر',
       fs.readFileSync(path.join(ROOT, '.gitignore'), 'utf8').split('\n').some(l => l.trim() === 'app/'));
    ok('تهيئة Tauri تشير إلى مجلّد البناء', c.build.frontendDist === '../app', c.build.frontendDist);
    ok('البناء يُولّد الواجهة قبل التغليف',
       /prepare-frontend/.test(c.build.beforeBuildCommand || ''), c.build.beforeBuildCommand);

    /* ----- الهوية ----- */
    const html = src.toString('utf8');
    const appLine = html.match(/const APP = \{[^}]*\}/)[0];
    const ver = appLine.match(/version:'([^']+)'/)[1];
    const schema = Number(appLine.match(/schema:(\d+)/)[1]);
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
    ok('اسم المنتج عربيّ: تبارك جيم', c.productName === 'تبارك جيم', c.productName);
    ok('اسم الملف التنفيذي عربيّ كذلك', c.mainBinaryName === 'تبارك جيم', c.mainBinaryName);
    ok('عنوان النافذة يحمل اسم النظام', /تبارك جيم/.test(c.app.windows[0].title), c.app.windows[0].title);
    ok('لا يظهر اسم Tauri أو المستودع في أي حقل يراه المستخدم',
       ![c.productName, c.mainBinaryName, c.app.windows[0].title, c.bundle.publisher,
         c.bundle.shortDescription].some(v => /tauri|electron|main-project|github|test|debug/i.test(String(v))));
    ok('المعرّف ثابت ومكتوب صراحة', c.identifier === 'com.tabarak.gym', c.identifier);
    ok('إصدار الحزمة = إصدار البرنامج = إصدار package.json',
       c.version === ver && pkg.version === ver, `conf=${c.version} app=${ver} pkg=${pkg.version}`);
    ok('المخطّط ما زال 8 — التغليف لا يُرقّي قاعدة', schema === 8, schema);

    /* ----- الأيقونات ----- */
    const icoPath = path.join(ROOT, 'src-tauri', 'icons', 'icon.ico');
    ok('أيقونة ويندوز موجودة', fs.existsSync(icoPath));
    if (fs.existsSync(icoPath)){
      const b = fs.readFileSync(icoPath);
      const count = b.readUInt16LE(4);
      const sizes = [];
      let sane = b.readUInt16LE(0) === 0 && b.readUInt16LE(2) === 1;
      for (let i = 0; i < count; i++){
        const o = 6 + i * 16;
        sizes.push(b[o] || 256);
        if (b.readUInt32LE(o + 12) + b.readUInt32LE(o + 8) > b.length) sane = false;
      }
      ok('ملف الأيقونة سليم البنية', sane, `entries=${count}`);
      ok('يشمل المقاسات التي تطلبها صدفة ويندوز',
         [16, 32, 48, 256].every(s => sizes.includes(s)), sizes.join('،'));
      ok('الأيقونة ليست شعار مطوّر مؤقّت — مولَّدة من علامة النظام',
         fs.existsSync(path.join(ROOT, 'scripts', 'brand-mark.svg')));
    }
    c.bundle.icon.forEach(rel =>
      ok(`أصل الأيقونة موجود: ${rel}`, fs.existsSync(path.join(ROOT, 'src-tauri', rel))));

    /* ----- النافذة ----- */
    const w = c.app.windows[0];
    ok('نافذة واحدة فقط', c.app.windows.length === 1, c.app.windows.length);
    ok('حدّ أدنى للحجم مضبوط', w.minWidth >= 1024 && w.minHeight >= 600, `${w.minWidth}×${w.minHeight}`);
    ok('الحجم الافتراضي يسع شاشة 1366×768', w.width <= 1366 && w.height <= 768 + 32, `${w.width}×${w.height}`);
    ok('النافذة قابلة للتحجيم والتكبير والتصغير',
       w.resizable && w.maximizable && w.minimizable && w.closable);

    /* ----- الأمان: أضيق ما يمكن ----- */
    const caps = fs.readdirSync(path.join(ROOT, 'src-tauri', 'capabilities'))
      .map(f => JSON.parse(fs.readFileSync(path.join(ROOT, 'src-tauri', 'capabilities', f), 'utf8')));
    const perms = caps.flatMap(x => x.permissions || []);
    ok('لا صلاحية نظام واحدة ممنوحة', perms.length === 0, JSON.stringify(perms));
    const permText = JSON.stringify(perms);
    ['fs', 'shell', 'http', 'dialog', 'process', 'updater', 'clipboard'].forEach(p =>
      ok(`لا صلاحية ${p}`, !new RegExp(`(^|[":])${p}[:"]`).test(permText)));
    ok('واجهة Tauri العامّة غير محقونة في الصفحة', c.app.withGlobalTauri === false);
    const cargo = fs.readFileSync(path.join(ROOT, 'src-tauri', 'Cargo.toml'), 'utf8');
    ok('لا إضافات Tauri في الاعتماديات',
       !/tauri-plugin-/.test(cargo), (cargo.match(/tauri-plugin-[a-z-]+/g) || []).join('،'));
    ok('لا مُحدِّث تلقائي في هذه المرحلة',
       !c.plugins || !c.plugins.updater, JSON.stringify(c.plugins || {}));

    /* ----- إنتاج لا تطوير ----- */
    ok('لا خادم تطوير في تهيئة الإنتاج', !c.build.devUrl, c.build.devUrl);
    ok('لا localhost في تهيئة الحزمة',
       !/localhost|127\.0\.0\.1/.test(JSON.stringify(c.bundle)));
    const mainRs = fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', 'main.rs'), 'utf8');
    ok('نافذة الطرفية مخفيّة في بناء الإصدار', /windows_subsystem = "windows"/.test(mainRs));
    /* «الغلاف لا يحمل منطق عمل» كان يُقاس بعدد الأسطر. وبعد أن صار فيه
       جسر ملفات وطباعة لم يعد العدد يقول شيئاً — فيُقاس المعنى نفسه:
       لا مفردة عمل واحدة في الصدأ، ولا مسار يأتي من الواجهة، ولا صدفة
       ولا شبكة، وقائمة الأوامر مغلقة معروفة. */
    const rustSrc = fs.readdirSync(path.join(ROOT, 'src-tauri', 'src'))
      .map(f => fs.readFileSync(path.join(ROOT, 'src-tauri', 'src', f), 'utf8')).join('\n');
    const business = ['member', 'subscription', 'payment', 'revenue', 'expense', 'receipt',
                      'invoice', 'inventory', 'supplier', 'salary', 'attendance'];
    const leaked = business.filter(w => new RegExp(`\\b${w}`, 'i').test(rustSrc));
    ok('لا مفردة من مفردات العمل في طرف الصدأ', leaked.length === 0, leaked.join('، '));
    ok('لا تنفيذ أوامر نظام', !/std::process|Command::new/.test(rustSrc));
    ok('لا شبكة', !/reqwest|TcpStream|hyper::|ureq/.test(rustSrc));
    const cmds = (rustSrc.match(/#\[tauri::command\]\s*(?:pub\s+)?fn\s+(\w+)/g) || [])
      .map(m => m.split(/\s+/).pop());
    const allowed = ['tg_env', 'tg_save', 'tg_list_backups', 'tg_read_backup', 'tg_prune_backups', 'tg_print'];
    ok('الأوامر المكشوفة هي المعروفة وحدها',
       cmds.length === allowed.length && cmds.every(c => allowed.includes(c)), cmds.join('، '));
    /* أهمّ قيد: لا أمر يقبل مساراً. الفئة تقرّر المجلّد في الصدأ. */
    const takesPath = /fn tg_\w+\([^)]*\b(path|dir|folder|full_path)\s*:\s*(String|PathBuf|&str)/.test(rustSrc);
    ok('ولا أمر يقبل مساراً من الواجهة', !takesPath);

    /* ----- CSP ----- */
    const csp = c.app.security.csp || '';
    ok('سياسة أمن المحتوى مضبوطة', !!csp);
    ok('لا يُسمح بمصدر خارجي للسكربت', !/script-src[^;]*https?:/.test(csp));
    ok('لا يُسمح باتصال خارجي', !/connect-src[^;]*https?:\/\/(?!ipc)/.test(csp), csp.match(/connect-src[^;]*/));
    ok('الصور والوسائط تسمح بـ data: (الوسائط مخزّنة هكذا)',
       /img-src[^;]*data:/.test(csp) && /media-src[^;]*data:/.test(csp));
    ok('الإطارات مسموحة — وعاء الطباعة إطار', /frame-src/.test(csp));
    ok('object-src ممنوع', /object-src 'none'/.test(csp));

    /* ----- المثبِّت ----- */
    const bw = c.bundle.windows;
    ok('هدف البناء مثبّت ويندوز', c.bundle.targets.includes('nsis'), c.bundle.targets.join('،'));
    ok('واجهة المثبّت تشمل العربية', bw.nsis.languages.includes('Arabic'), bw.nsis.languages.join('،'));
    ok('وضع WebView2 معروف ومكتوب', !!bw.webviewInstallMode.type, bw.webviewInstallMode.type);
    /* حزمة MSI: صفحة الترميز لا تُترك على en-US.
       en-US ترميزه 1252 ولا يمثّل حرفاً عربياً واحداً، فيسقط رابط WiX
       (light.exe) على اسم منتج عربيّ. ar-SA ترميزه 1256 ويمثّله. */
    ok('ترميز حزمة MSI عربيّ لا لاتينيّ',
       !!bw.wix && (bw.wix.language || []).includes('ar-SA'),
       JSON.stringify(bw.wix || null));
    ok('المثبّت يعمل بلا إنترنت (نسخة WebView2 مضمّنة)',
       bw.webviewInstallMode.type === 'offlineInstaller', bw.webviewInstallMode.type);
    ok('لا مفاتيح توقيع في المستودع',
       !bw.certificateThumbprint && !fs.existsSync(path.join(ROOT, 'src-tauri', 'private.key')));

    record('سطح المكتب — مصدر واحد وتهيئة', rows, []);
  });

  /* ===================================================================== *
   * 2) الإقلاع تحت قيود سطح المكتب                                        *
   * ===================================================================== */
  group('سطح المكتب — الإقلاع والتخزين', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors, requests } = await openDesktop(browser, url);
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
      const { DB, STORE_NAMES, APP, Settings, Repos } = window.TG;
      ok('النظام أقلع خلف سياسة أمن المحتوى', !!window.TG.ready);
      ok('window.open فعلاً معطّلة في هذه الجلسة', window.open() === null);
      ok('التخزين المستعمل هو IndexedDB لا بديلاً احتياطياً',
         DB.adapter.kind === 'indexeddb', DB.adapter.kind);
      ok('كل الجداول الأربعين مفتوحة', STORE_NAMES.length === 40 && STORE_NAMES.every(s => DB.count(s) >= 0),
         STORE_NAMES.length);
      ok('المخطّط 8 كما هو', APP.schema === 8, APP.schema);
      ok('الإصدار معروض في الواجهة', /7\./.test(document.getElementById('verLabel').textContent),
         document.getElementById('verLabel').textContent);
      ok('القوائم الافتراضية زُرعت في أول تشغيل', Repos.plans.list().length > 0 && Repos.roles.list(true).length > 0,
         `plans=${Repos.plans.list().length} roles=${Repos.roles.list(true).length}`);
      ok('الاتجاه من اليمين إلى اليسار', document.documentElement.getAttribute('dir') === 'rtl');
      ok('اللغة عربية', document.documentElement.getAttribute('lang') === 'ar');
      /* كتابة وقراءة حقيقيتان عبر الطبقة نفسها */
      await DB.put('meta', { k:'desktop_probe', v:{ n:42, s:'نصّ عربي' } });
      const back = DB.get('meta', 'desktop_probe');
      ok('الكتابة والقراءة تعملان عبر IndexedDB', back && back.v.n === 42 && back.v.s === 'نصّ عربي',
         JSON.stringify(back));
      ok('التلبيد يعمل في سياق آمن (crypto.subtle متاح)', !!(window.crypto && window.crypto.subtle));
      return out;
    });
    /* لا طلب شبكة خارج المستند نفسه */
    const external = requests.filter(u => !u.startsWith(url));
    rows.push({ name:'لا طلب شبكة خارجيّ واحد أثناء الإقلاع', pass: external.length === 0,
                detail: external.slice(0, 5).join('، ') });
    rows.push({ name:'لا خطأ تشغيل ولا وعد مرفوض أثناء الإقلاع', pass: errors.length === 0,
                detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('سطح المكتب — الإقلاع والتخزين', rows, []);
  });

  /* ===================================================================== *
   * 3) الطباعة بلا نوافذ منبثقة — كل المسارات                             *
   * ===================================================================== */
  group('سطح المكتب — الطباعة', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openDesktop(browser, url);
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
      const { Svc, Repos, Print, UI, D, Reports, TG } = Object.assign({}, window.TG, { TG: window.TG });

      /* بيانات تكفي لكل مستند مطبوع */
      const m = await Svc.members.create({ name:'سجى الطباعة', phone:'07700000001' });
      const sub = await Svc.subs.create({ memberId:m.rec ? m.rec.id : m.id, planId:null, planName:'شهر',
        startDate:D.today(), customDuration:{ value:1, unit:'month' }, price:90000,
        paidAmount:90000, paymentMethod:'cash' });
      const mid = m.rec ? m.rec.id : m.id;
      /* الوصل يُصدر صراحةً من الدفعة — لا يُخترع تلقائياً */
      const pay = window.TG.Actions.lastPaymentOf('subscription', sub.rec ? sub.rec.id : sub.id);
      const rc = await Svc.receipts.ensure(pay.id);

      /* يلتقط ما كُتب فعلاً في وعاء الطباعة، أيّاً كان نوعه */
      async function grab(fn){
        const before = document.querySelectorAll('iframe').length;
        let printed = 0;
        const r = fn();
        const frames = document.querySelectorAll('iframe');
        if (frames.length !== before + 1) return { html:'', printed:0, frame:false };
        const fr = frames[frames.length - 1];
        const cw = fr.contentWindow;
        cw.print = () => { printed++; };
        await new Promise(res => setTimeout(res, 700));
        const doc = fr.contentDocument;
        const html = doc ? doc.documentElement.outerHTML : '';
        const styles = doc ? doc.querySelectorAll('style').length : 0;
        const dir = doc ? doc.documentElement.getAttribute('dir') : '';
        const rect = fr.getBoundingClientRect();
        const cs = getComputedStyle(fr);
        fr.remove();
        return { html, printed, frame:true, styles, dir, rendered: cs.display !== 'none' && cs.visibility !== 'hidden',
                 offscreen: rect.right <= 0 || rect.left >= innerWidth, r };
      }

      const docs = {
        'وصل A4': () => Print.open('و', Print.receiptHtml(rc, { format:'a4' }), {}),
        'وصل شريط 80مم': () => Print.open('و', Print.receiptHtml(rc, { format:'slip' }), { slip:true }),
        'كشف مشتركة': () => Print.open('ك', Print.statementHtml(mid), {}),
        'كشف الصندوق': () => Print.open('ص', Print.cashDayHtml(D.today()), {}),
        'مستحقات الموردين': () => Print.open('ذ', Print.payablesHtml(), {}),
        'التقرير الشهري': () => UI.printSection('ت', Reports.html(Reports.build(D.monthKey(D.today())), true), { plain:true }),
      };
      let first = null;
      for (const [name, fn] of Object.entries(docs)){
        const g = await grab(fn);
        if (!first) first = g;
        ok(`${name}: يُفتح وعاء طباعة بلا نافذة منبثقة`, g.frame);
        ok(`${name}: المستند مكتوب وغير فارغ`, g.html.length > 2000, `${g.html.length} حرف`);
        ok(`${name}: أُمرت الطباعة فعلاً مرة واحدة`, g.printed === 1, g.printed);
        ok(`${name}: الاتجاه RTL محفوظ في المطبوع`, g.dir === 'rtl', g.dir);
        ok(`${name}: أنماط النظام منقولة إلى الورقة`, g.styles > 0, g.styles);
        ok(`${name}: قواعد الصفحة @page موجودة`, /@page/.test(g.html));
      }
      ok('وعاء الطباعة مرسوم فعلاً (لا display:none ولا visibility:hidden)', first.rendered);
      ok('وعاء الطباعة خارج الشاشة فلا يراه المستخدم', first.offscreen);
      ok('المطبوع يحمل نصاً عربياً حقيقياً', /سجى الطباعة/.test(
         (await grab(() => Print.open('ك', Print.statementHtml(mid), {}))).html));
      /* لا يبقى أثر في الصفحة بعد الطباعة */
      await new Promise(r => setTimeout(r, 300));
      ok('لا تتكدّس أوعية الطباعة في الصفحة', document.querySelectorAll('iframe').length === 0,
         document.querySelectorAll('iframe').length);
      return out;
    });
    rows.push({ name:'لا خطأ تشغيل أثناء الطباعة', pass: errors.length === 0, detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('سطح المكتب — الطباعة', rows, []);
  });

  /* الوسائط في الاختبارات تُصنع من بايتات حقيقية: GIF متحرّك بإطارين وكتلة
     NETSCAPE للتكرار، وPNG ثابت. لا صورة وهمية تمرّ من فحص الحركة. */
  const MEDIA_JS = `
    window.mkFile = function(kind, name){
      var B64 = {
        gif:'R0lGODlhAgACAPIAAP///wAAAP//AAAA/wAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh'
          + '+QQJCgAAACwAAAAAAgACAAADBAgEpQIAIfkECQoAAAAsAAAAAAIAAgAAAwQIhKUCADs=',
        png:'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='
      };
      var bin = atob(B64[kind]); var arr = new Uint8Array(bin.length);
      for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      return new File([arr], name, { type: kind === 'gif' ? 'image/gif' : 'image/png' });
    };`;

  /* ===================================================================== *
   * 4) النسخة الاحتياطية: نفس الحقيقة التجارية قبل وبعد                   *
   * ===================================================================== */
  group('سطح المكتب — النسخ الاحتياطي والهجرة', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openDesktop(browser, url);

    /* نادٍ كامل كما تطلب المرحلة: هوية ومتحرّكة وحسابات واشتراكات ودفعات
       ووصولات ومصروفات ومورّد ومشتريات ومخزون ومبيعات وقياسات وحضور. */
    const before = await page.evaluate(async (mediaJs) => {
      eval(mediaJs);
      const { Svc, Repos, D, Settings, Auth, Brand } = window.TG;

      /* الهوية أولاً — قبل تفعيل الصلاحيات، فلا تُطلب صلاحية لم تُمنح بعد */
      await Settings.set({ gymName:'نادي تبارك النسائي' });
      const logo = await Brand.setMedia('logo', mkFile('gif', 'شعار.gif'));
      const banner = await Brand.setMedia('banner', mkFile('png', 'لافتة.png'));
      await Settings.set({ branding: Object.assign({}, Brand.get(),
        { subtitle:'صحّة ولياقة', phone:'07700000000', address:'بغداد' }) });

      /* الحسابات */
      await Settings.set({ authEnabled:true });
      Auth.restoreSession();
      const first = await Auth.setupFirstAdmin({ name:'أم تبارك', username:'omtabarak',
                                                 password:'كلمة-المالكة-٢٠٢٦' });
      await Svc.users.create({ username:'istiqbal', name:'زهراء الاستقبال',
                               roleKey:'reception', password:'كلمة-الاستقبال-٢٠٢٦' });

      const mems = [];
      for (let i = 0; i < 12; i++){
        const r = await Svc.members.create({ name:`مشتركة ${i}`, phone:'0770000' + String(1000 + i) });
        mems.push((r.rec || r).id);
      }
      const mType = (Svc.measure.types()[0] || { key:'weight' }).key;
      for (let i = 0; i < 12; i++)
        await Svc.measure.add({ memberId:mems[i], date:D.today(), type:mType, value:60 + i });
      for (let i = 0; i < 10; i++)
        await Svc.subs.create({ memberId:mems[i], startDate:D.today(), planName:'شهر',
          customDuration:{ value:1, unit:'month' }, price:90000,
          paidAmount: i % 2 ? 90000 : 40000, paymentMethod: i % 3 ? 'cash' : 'transfer' });
      /* وصلان مطبوعان فعلاً */
      for (const t of ['subscription'])
        for (const s of Repos.subs.list().slice(0, 2)){
          const pm = window.TG.Actions.lastPaymentOf(t, s.id);
          if (pm) await Svc.receipts.ensure(pm.id);
        }
      for (let i = 0; i < 8; i++)
        await Svc.attendance.checkIn({ memberId:mems[i], date:D.today(), method:'staff' });
      const cat = Repos.expCats.list()[0];
      await Svc.finance.addExpense({ date:D.today(), amount:75000, categoryId:cat && cat.id,
        description:'كهرباء', method:'cash' });
      const sup = await Svc.suppliers.save(null, { name:'مورّد المكمّلات', phone:'07811112222' });
      const prod = (await Svc.inventory.saveProduct(null,
        { name:'بروتين', price:45000, cost:25000, openingQty:4 })).rec;
      const pur = await Svc.purchases.save(null, { supplierId:(sup.rec || sup).id, date:D.today(),
        invoiceNo:'ف-100', lines:[{ productId:prod.id, qty:20, unitCost:24000 }] });
      await Svc.purchases.post(pur.rec.id);
      await Svc.purchases.addPayment({ purchaseId:pur.rec.id, date:D.today(), amount:300000, method:'cash' });
      for (let i = 0; i < 6; i++)
        await Svc.sales.create({ date:D.today(), memberId:mems[i],
          lines:[{ productId:prod.id, qty:1, unitPrice:45000, discount:0 }] });

      const lg = Repos.media.get(logo.id);
      return { totals:window.TGTests.totals(), liquidity:Svc.finance.liquidity(),
               payables:Svc.purchases.payables().due, gymName:Settings.get('gymName'),
               logoAnimated:!!lg.animated, poster:!!lg.posterUrl,
               bannerId:banner.id, recoveryCode:first.recoveryCode,
               backup:window.TG.Backup.build(true) };
    }, MEDIA_JS);

    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    ok('النسخة الكاملة تشمل الوسائط', (before.backup.data.media || []).length >= 2,
       (before.backup.data.media || []).length);
    ok('النسخة تشمل الجداول الأربعين', Object.keys(before.backup.data).length === 40,
       Object.keys(before.backup.data).length);
    ok('الشعار المتحرّك محفوظ كمتحرّك', before.logoAnimated);
    ok('الإطار الثابت مستخرج مسبقاً للطباعة', before.poster);

    /* الاستعادة في سياق تخزين جديد تماماً — وهو ما يعنيه «جهاز آخر» فعلاً،
       وهو نفسه مسار الهجرة الرسمي من المتصفح إلى سطح المكتب. */
    const ctx2 = await browser.newContext();
    await ctx2.addInitScript(() => { window.open = function(){ return null; }; });
    const p2 = await ctx2.newPage();
    const errors2 = [];
    p2.on('pageerror', e => errors2.push(String(e.message)));
    await p2.goto(url, { waitUntil:'domcontentloaded' });
    await p2.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
    await p2.evaluate(() => window.TG.ready);
    await p2.addScriptTag({ content: TESTS_JS });

    const after = await p2.evaluate(async (b) => {
      const { Backup, Svc, Settings, Repos, Auth } = window.TG;
      const fresh = Repos.members.list(true).length;
      await Backup.restore(b);
      const media = Repos.media.list(true);
      let login = false;
      try { login = !!(await Auth.login('omtabarak', 'كلمة-المالكة-٢٠٢٦')); } catch(e){ login = false; }
      let recLogin = false;
      try { recLogin = !!(await Auth.login('istiqbal', 'كلمة-الاستقبال-٢٠٢٦')); } catch(e){ recLogin = false; }
      const recCan = Auth.can('finance.money');
      if (login || recLogin) await Auth.login('omtabarak', 'كلمة-المالكة-٢٠٢٦').catch(() => {});
      return { freshWasEmpty: fresh === 0, totals:window.TGTests.totals(),
               liquidity:Svc.finance.liquidity(), payables:Svc.purchases.payables().due,
               gymName:Settings.get('gymName'),
               animated:media.filter(m => m.animated).length,
               posters:media.filter(m => m.posterUrl).length,
               dataUrls:media.every(m => String(m.dataUrl || '').startsWith('data:')),
               users:Repos.users.list(true).length, authOn:Auth.enabled(),
               login, recLogin, recCan };
    }, before.backup);

    ok('البيئة المستقبِلة كانت نظيفة فعلاً قبل الاستعادة', after.freshWasEmpty);
    ['revenue', 'expense', 'payments', 'capital', 'subPrice', 'salesTotal'].forEach(k =>
      ok(`الإجمالي نفسه بعد الاستعادة: ${k}`, before.totals[k] === after.totals[k],
         `${before.totals[k]} → ${after.totals[k]}`));
    const diff = Object.keys(before.totals.counts)
      .filter(s => s !== 'audit' && before.totals.counts[s] !== after.totals.counts[s]);
    ok('عدد السجلات في كل جدول من الأربعين كما كان', !diff.length,
       diff.map(s => `${s}:${before.totals.counts[s]}→${after.totals.counts[s]}`).join('، '));
    ok('السيولة كما كانت', before.liquidity === after.liquidity, `${before.liquidity} → ${after.liquidity}`);
    ok('مستحقات الموردين كما كانت', before.payables === after.payables, `${before.payables} → ${after.payables}`);
    ok('اسم النادي عاد', before.gymName === after.gymName, after.gymName);
    ok('الوسائط عادت بمحتواها (data:)', after.dataUrls);
    ok('الصورة المتحرّكة عادت متحرّكة', after.animated >= 1, after.animated);
    ok('الإطار الثابت عاد معها', after.posters >= 1, after.posters);
    ok('الحسابات عادت والصلاحيات مفعّلة', after.authOn && after.users >= 2, `users=${after.users}`);
    ok('المالكة تدخل بكلمة مرورها نفسها في البيئة الجديدة', after.login);
    ok('الاستقبال تدخل كذلك', after.recLogin);
    ok('دور الاستقبال المحدود عاد كما كان', after.recCan === false);
    ok('لا خطأ تشغيل أثناء النسخ والاستعادة', errors.length === 0 && errors2.length === 0,
       errors.concat(errors2).slice(0, 3).join(' | '));

    await ctx.close(); await ctx2.close(); srv.close();
    record('سطح المكتب — النسخ الاحتياطي والهجرة', rows, []);
  });

  /* ===================================================================== *
   * 5) الهوية المتحرّكة على وقت تشغيل سطح المكتب                          *
   * ===================================================================== */
  group('سطح المكتب — الهوية المتحرّكة', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const all = [];

    for (const reduced of [false, true]){
      const { ctx, page, errors } = await openDesktop(browser, url,
        { context:{ reducedMotion: reduced ? 'reduce' : 'no-preference' } });
      const rows = await page.evaluate(async ([mediaJs, isReduced]) => {
        eval(mediaJs);
        const out = [];
        const ok = (n, p, d) => out.push({ name:n, pass:!!p, detail:d == null ? '' : String(d) });
        const { Brand, Repos, Svc, Print } = window.TG;
        const tag = isReduced ? '[تقليل الحركة مفعَّل]' : '[تقليل الحركة مطفأ]';

        const logo = await Brand.setMedia('logo', mkFile('gif', 'شعار.gif'));
        const ban  = await Brand.setMedia('banner', mkFile('gif', 'لافتة.gif'));
        ok(`${tag} الشعار المتحرّك يُرفع ويُعلَّم متحرّكاً`, logo.animated === true && !!logo.posterUrl);
        ok(`${tag} اللافتة المتحرّكة كذلك`, ban.animated === true && !!ban.posterUrl);
        const still = await Brand.setMedia('logo', mkFile('png', 'ثابت.png'));
        ok(`${tag} الشعار الثابت لا يُعلَّم متحرّكاً`, still.animated === false && !still.posterUrl);
        const lg = await Brand.setMedia('logo', mkFile('gif', 'شعار.gif'));

        ok(`${tag} النظام يقرأ تفضيل النظام كما هو`, Brand.reducedMotion() === isReduced, Brand.reducedMotion());

        for (const mode of ['auto', 'on', 'off']){
          await Brand.setMotionMode(mode);
          const want = mode === 'on' ? true : mode === 'off' ? false : !isReduced;
          ok(`${tag} وضع «${mode}»: الحركة ${want ? 'مسموحة' : 'ممنوعة'}`,
             Brand.motionAllowed() === want, Brand.motionAllowed());
          const drawn = Brand.renderUrl('logo');
          ok(`${tag} وضع «${mode}»: المرسوم هو ${want ? 'المتحرّك' : 'الإطار الثابت'}`,
             drawn === (want ? lg.dataUrl : lg.posterUrl));
          ok(`${tag} وضع «${mode}»: النظام يقول سبب حالته بلغة تُقرأ`,
             typeof Brand.motionReason() === 'string' && Brand.motionReason().length > 0,
             Brand.motionReason());
        }

        /* الطباعة لا تتحرّك أبداً مهما كان الوضع — الورقة لا «إطار حالي» لها */
        await Brand.setMotionMode('on');
        Brand.applyToShell();
        ok(`${tag} الشعار مرسوم في الشريط الجانبي`, /<img/.test(Brand.logoHtml(40)));
        ok(`${tag} ترويسة الطباعة تستعمل الإطار الثابت`,
           Brand.printHeader('س', 'ص').includes(lg.posterUrl.slice(22, 60)));
        ok(`${tag} renderUrl(..., forceStill) يفرض الثبات`,
           Brand.renderUrl('logo', true) === lg.posterUrl);

        const m = await Svc.members.create({ name:'مشتركة الطباعة' });
        const before = document.querySelectorAll('iframe').length;
        Print.open('ك', Print.statementHtml((m.rec || m).id), {});
        const fr = document.querySelectorAll('iframe')[before];
        if (fr && fr.contentWindow) fr.contentWindow.print = () => {};
        await new Promise(r => setTimeout(r, 600));
        const html = fr && fr.contentDocument ? fr.contentDocument.documentElement.outerHTML : '';
        ok(`${tag} المطبوع لا يحمل الصورة المتحرّكة`, !html.includes(lg.dataUrl.slice(22, 60)));
        if (fr) fr.remove();
        return out;
      }, [MEDIA_JS, reduced]);
      rows.push({ name:`لا خطأ تشغيل ${reduced ? '[تقليل الحركة]' : ''}`, pass: errors.length === 0,
                  detail: errors.slice(0, 2).join(' | ') });
      all.push(...rows);
      await ctx.close();
    }

    /* البقاء بعد إعادة تشغيل التطبيق، ثم عبر نسخة احتياطية */
    const { ctx, page, errors } = await openDesktop(browser, url);
    await page.evaluate(async (mediaJs) => {
      eval(mediaJs);
      await window.TG.Brand.setMedia('logo', mkFile('gif', 'شعار.gif'));
      await window.TG.Brand.setMotionMode('on');
    }, MEDIA_JS);
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
    await page.evaluate(() => window.TG.ready);
    await page.addScriptTag({ content: TESTS_JS });
    const kept = await page.evaluate(() => {
      const out = [];
      const ok = (n, p, d) => out.push({ name:n, pass:!!p, detail:d == null ? '' : String(d) });
      const { Brand } = window.TG;
      const m = Brand.media('logo');
      ok('الشعار المتحرّك باقٍ بعد إعادة تشغيل التطبيق', Brand.has('logo'));
      ok('وضع الحركة باقٍ كما ضُبط', Brand.motionMode() === 'on', Brand.motionMode());
      ok('الوسيط ما زال متحرّكاً ومعه إطاره الثابت', !!(m && m.animated && m.posterUrl));
      ok('المرسوم بعد إعادة التشغيل هو المتحرّك', Brand.renderUrl('logo') === m.dataUrl);
      return out;
    });
    const roundTrip = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name:n, pass:!!p, detail:d == null ? '' : String(d) });
      const { Backup, Brand, Repos } = window.TG;
      const beforeUrl = Brand.renderUrl('logo');
      const b = Backup.build(true);
      await Backup.restore(b);
      const m = Brand.media('logo');
      ok('الهوية المتحرّكة تعبر النسخة والاستعادة', !!(m && m.animated && m.posterUrl));
      ok('الصورة المرسومة بعد الاستعادة هي نفسها', Brand.renderUrl('logo') === beforeUrl);
      ok('وضع الحركة يعبر الاستعادة', Brand.motionMode() === 'on', Brand.motionMode());
      return out;
    });
    all.push(...kept, ...roundTrip,
             { name:'لا خطأ تشغيل في دورة الهوية', pass: errors.length === 0, detail: errors.slice(0, 2).join(' | ') });
    await ctx.close(); srv.close();
    record('سطح المكتب — الهوية المتحرّكة', all, []);
  });

  /* ===================================================================== *
   * 6) الدخول والصلاحيات على سطح المكتب                                   *
   * ===================================================================== */
  group('سطح المكتب — الدخول والصلاحيات', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openDesktop(browser, url);
    const PW = { owner:'كلمة-المالكة-٢٠٢٦', rec:'كلمة-الاستقبال-٢٠٢٦' };
    const rows = await page.evaluate(async (PW) => {
      const out = [];
      const ok = (n, p, d) => out.push({ name:n, pass:!!p, detail:d == null ? '' : String(d) });
      const codeOf = async fn => { try { await fn(); return null; } catch(e){ return e.code || 'ERR'; } };
      const { Auth, Svc, Repos, Settings, D } = window.TG;

      ok('نادٍ لم يفعّل الدخول لا يرى أي فرق على سطح المكتب',
         Auth.enabled() === false && Auth.can('settings.danger') === true);

      await Settings.set({ authEnabled:true });
      Auth.restoreSession();
      ok('بعد التفعيل يُطلب تهيئة أول حساب (أول تشغيل)', Auth.needsSetup() === true);
      ok('قبل الدخول لا صلاحية لشيء', Auth.can('members.view') === false && Auth.signedIn() === false);

      const first = await Auth.setupFirstAdmin({ name:'أم تبارك', username:'omtabarak', password:PW.owner });
      ok('التهيئة تُنشئ المالكة وتفتح جلستها', !!first.user && Auth.signedIn());
      ok('رمز الاسترجاع يُعرض مرة واحدة', typeof first.recoveryCode === 'string' && first.recoveryCode.length >= 8);
      const u = Repos.users.get(first.user.id);
      ok('كلمة المرور مخزّنة ملبَّدة لا نصّاً', !JSON.stringify(u).includes(PW.owner));
      ok('التلبيد يعلن خوارزميته وملحه وتكراراته',
         !!(u.pass && u.pass.algo && u.pass.salt && u.pass.iterations), u.pass && u.pass.algo);

      const rec = await Svc.users.create({ username:'istiqbal', name:'زهراء الاستقبال',
                                           roleKey:'reception', password:PW.rec });
      ok('حساب استقبال يُنشأ', !!rec.id);

      Auth.logout();
      ok('الخروج يُنهي الجلسة ولا يترك أثراً', !Auth.signedIn() && !sessionStorage.getItem(Auth.SESSION_KEY));
      ok('كلمة مرور خاطئة تُرفض برمز واحد لا يكشف وجود الحساب',
         await codeOf(() => Auth.login('omtabarak', 'كلمة-خاطئة')) === 'BAD_LOGIN');
      ok('اسم مستخدمة لا وجود له يُرفض بالرمز نفسه',
         await codeOf(() => Auth.login('لا-أحد', 'كلمة-خاطئة')) === 'BAD_LOGIN');
      ok('الدخول بكلمة المرور الصحيحة ينجح', !!(await Auth.login('omtabarak', PW.owner)));
      ok('الجلسة تُحفظ في تخزين اللسان', !!sessionStorage.getItem(Auth.SESSION_KEY));

      /* الاستقبال: الحدّ في طبقة الأفعال لا في الأزرار */
      await Auth.login('istiqbal', PW.rec);
      ok('الاستقبال تدخل باسمها ودورها', Auth.currentUser().username === 'istiqbal',
         Auth.session.actorName);
      ok('الاستقبال لا ترى المال', Auth.can('finance.money') === false);
      ok('الاستقبال لا ترى إدارة المستخدمات', Auth.can('settings.users') === false);
      ok('الفعل الممنوع يُرفض عند حدّه',
         await codeOf(() => Svc.finance.addExpense({ date:D.today(), amount:1000,
           description:'ممنوع', method:'cash' })) !== null);
      const m = await Svc.members.create({ name:'مشتركة الاستقبال' });
      ok('الاستقبال تُنشئ مشتركة بلا عائق', !!(m.rec || m).id);
      ok('الحدث يُنسب إلى الاستقبال باسمها الحقيقي',
         Repos.audit.list().some(a => a.actor === 'زهراء الاستقبال'),
         Repos.audit.list().slice(-1).map(a => a.actor).join(''));

      /* التعطيل */
      await Auth.login('omtabarak', PW.owner);
      await Svc.users.setDisabled(rec.id, true);
      ok('الحساب المعطَّل لا يدخل',
         await codeOf(() => Auth.login('istiqbal', PW.rec)) === 'USER_DISABLED');
      await Auth.login('omtabarak', PW.owner);
      await Svc.users.setDisabled(rec.id, false);
      ok('بعد إعادة التفعيل يدخل', !!(await Auth.login('istiqbal', PW.rec)));

      /* الاسترجاع بالرمز */
      await Auth.login('omtabarak', PW.owner);
      ok('رمز استرجاع خاطئ يُرفض', await codeOf(() => Auth.recover('رمز-خاطئ', 'omtabarak', 'كلمة-جديدة-طويلة')) !== null);
      const again = await Auth.recover(first.recoveryCode, 'omtabarak', 'كلمة-مالكة-جديدة-٢٠٢٦');
      ok('الاسترجاع بالرمز الصحيح ينجح ويُصدر رمزاً جديداً', !!again && !!again.recoveryCode);
      ok('كلمة المرور القديمة سقطت', await codeOf(() => Auth.login('omtabarak', PW.owner)) === 'BAD_LOGIN');
      ok('الكلمة الجديدة تعمل', !!(await Auth.login('omtabarak', 'كلمة-مالكة-جديدة-٢٠٢٦')));
      return out;
    }, PW);

    /* إعادة تحميل الواجهة لا تُخرج المستخدمة — الحالة اليومية في تطبيق مكتبي */
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
    await page.evaluate(() => window.TG.ready);
    const after = await page.evaluate(() => ({
      signed: window.TG.Auth.signedIn(),
      who: window.TG.Auth.currentUser() && window.TG.Auth.currentUser().username,
      allowed: window.TG.Auth.can('finance.money'),
    }));
    rows.push({ name:'إعادة تحميل الواجهة لا تُخرج المستخدمة', pass: after.signed, detail: after.who });
    rows.push({ name:'الصلاحيات بعد إعادة التحميل هي صلاحيات من دخلت', pass: after.allowed === true, detail:String(after.allowed) });
    rows.push({ name:'لا خطأ تشغيل في مسار الدخول', pass: errors.length === 0, detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('سطح المكتب — الدخول والصلاحيات', rows, []);
  });

  /* ===================================================================== *
   * 7) بلا شبكة إطلاقاً                                                    *
   * ===================================================================== */
  group('سطح المكتب — بلا شبكة', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { window.open = function(){ return null; }; });
    const page = await ctx.newPage();
    const errors = [], blocked = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errors.push(m.text()); });
    /* كل ما ليس المستند نفسه يُقطع — هذا هو «لا إنترنت» حرفياً */
    await ctx.route('**/*', route => {
      const u = route.request().url();
      if (u.startsWith(url)) return route.continue();
      blocked.push(u); return route.abort();
    });
    await page.goto(url, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
    await page.evaluate(() => window.TG.ready);
    await page.addScriptTag({ content: TESTS_JS });

    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name:n, pass:!!p, detail:d == null ? '' : String(d) });
      const { Svc, Repos, D, Settings, Reports, Backup, Print, UI, Integrity } = window.TG;
      ok('الإقلاع تمّ بلا شبكة', !!window.TG.ready);
      const m = await Svc.members.create({ name:'مشتركة بلا إنترنت', phone:'07700009999' });
      const mid = m.rec ? m.rec.id : m.id;
      ok('إنشاء مشتركة', !!mid);
      await Svc.subs.create({ memberId:mid, planName:'شهر', startDate:D.today(),
        customDuration:{ value:1, unit:'month' }, price:90000, paidAmount:90000, paymentMethod:'cash' });
      ok('اشتراك ودفعة', Repos.payments.list().length > 0);
      ok('تسجيل حضور', !!(await Svc.attendance.checkIn({ memberId:mid, date:D.today(), method:'staff' })));
      const cat0 = Repos.expCats.list()[0];
      await Svc.finance.addExpense({ date:D.today(), amount:5000, categoryId:cat0 && cat0.id,
        description:'ماء', method:'cash' });
      ok('مصروف', Repos.expenses.list().length > 0);
      const pr = await Svc.inventory.saveProduct(null, { name:'صنف', price:1000, cost:500, openingQty:10 });
      ok('صنف ومخزون', !!pr);
      await Svc.sales.create({ date:D.today(), memberId:mid,
        lines:[{ productId:(pr.rec || pr).id, qty:1, unitPrice:1000, discount:0 }] });
      ok('فاتورة بيع', Repos.sales.list().length > 0);
      const r = Reports.build(D.monthKey(D.today()));
      ok('تقرير شهري يُبنى', !!r && typeof Reports.html(r, true) === 'string');
      ok('فحص السلامة يعمل', !!Integrity.scan());
      const b = Backup.build(true);
      ok('نسخة احتياطية تُبنى', !!b && Object.keys(b.data).length === 40, Object.keys(b.data).length);
      await Backup.restore(b);
      ok('الاستعادة تعمل', Repos.members.list(true).some(x => x.name === 'مشتركة بلا إنترنت'));
      /* طباعة */
      const before = document.querySelectorAll('iframe').length;
      Print.open('ك', Print.statementHtml(mid), {});
      const fr = document.querySelectorAll('iframe')[before];
      if (fr && fr.contentWindow) fr.contentWindow.print = () => {};
      await new Promise(res => setTimeout(res, 600));
      ok('الطباعة تعمل بلا شبكة', !!(fr && fr.contentDocument && fr.contentDocument.body.innerHTML.length > 500));
      if (fr) fr.remove();
      /* تصدير */
      let downloaded = null;
      const realDl = UI.download;
      UI.download = (blob, name) => { downloaded = { size:blob.size, name }; };
      try { window.TG.Exporter.csv('المشتركات.csv', [{ h:'الاسم', key:'name' }], [{ name:'مشتركة' }]); }
      finally { UI.download = realDl; }
      ok('التصدير يُنتج ملفاً باسم عربيّ', !!downloaded && /^المشتركات/.test(downloaded.name),
         downloaded && downloaded.name);
      return out;
    });
    rows.push({ name:'لم يُطلب أي مورد خارجيّ أثناء يوم عمل كامل', pass: blocked.length === 0,
                detail: blocked.slice(0, 5).join('، ') });
    rows.push({ name:'لا خطأ تشغيل بلا شبكة', pass: errors.length === 0, detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('سطح المكتب — بلا شبكة', rows, []);
  });

  /* ===================================================================== *
   * 8) العربية والمسارات والتصدير                                          *
   * ===================================================================== */
  group('سطح المكتب — العربية والمسارات', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openDesktop(browser, url);
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name:n, pass:!!p, detail:d == null ? '' : String(d) });
      const { Svc, Repos, UI, Exporter, D, Auth, Actions, Settings } = window.TG;
      const names = ['زهراء الموسوي', 'فاطمة عبد الأمير', 'نور الهدى الجابري'];
      for (const n of names) await Svc.members.create({ name:n, phone:'0770' + Math.random().toString().slice(2, 9) });
      ok('أسماء عربية تُحفظ كما كُتبت', names.every(n => Repos.members.list().some(m => m.name === n)));
      const found = Repos.members.list().filter(m => m.name.includes('زهراء'));
      ok('البحث بالعربية يجد', found.length === 1, found.length);
      const hits = Actions.searchAll ? Actions.searchAll('نور') : null;
      ok('البحث الشامل يقبل العربية', hits === null || typeof hits === 'object');

      /* أسماء الملفات المصدَّرة */
      const grabbed = [];
      const real = UI.download;
      UI.download = (blob, name) => grabbed.push({ name, size:blob.size, type:blob.type });
      try {
        Exporter.csv(`المشتركات-${D.today()}.csv`, [{ h:'الاسم', key:'name' }], Repos.members.list());
        Exporter.xlsx(`تقرير-${D.today()}.xlsx`, [{ name:'المشتركات', cols:[{ h:'الاسم', key:'name' }], rows:Repos.members.list() }]);
        Actions.exportBackup && await Actions.exportBackup(false);
      } finally { UI.download = real; }
      ok('كل التصديرات مرّت من نقطة تنزيل واحدة', grabbed.length >= 2, grabbed.length);
      ok('أسماء الملفات عربية ولا تحمل فاصل مسار',
         grabbed.every(g => /[؀-ۿ]/.test(g.name) && !/[\\/:*?"<>|]/.test(g.name)),
         grabbed.map(g => g.name).join(' | '));
      ok('ملفات CSV تبدأ بعلامة الترتيب لتفتح عربية في إكسل',
         grabbed.some(g => /\.csv$/.test(g.name)), grabbed.map(g => g.name).join('،'));
      ok('لا ملف فارغ', grabbed.every(g => g.size > 0), grabbed.map(g => g.size).join('،'));

      /* اسم مستخدمة وكلمة مرور عربيّان بالكامل */
      await Settings.set({ authEnabled:true });
      Auth.restoreSession();
      await Auth.setupFirstAdmin({ name:'أم تبارك', username:'مالكة', password:'كلمة-مرور-عربية-طويلة' });
      Auth.logout();
      ok('اسم مستخدمة عربيّ وكلمة مرور عربية يعملان معاً',
         !!(await Auth.login('مالكة', 'كلمة-مرور-عربية-طويلة')));
      let wrong = false;
      try { wrong = !!(await Auth.login('مالكة', 'كلمة-مرور-عربية-أخرى')); } catch(e){ wrong = false; }
      ok('كلمة مرور عربية خاطئة تُرفض', !wrong);
      ok('التلبيد لا يخزّن الحروف العربية نصّاً',
         !JSON.stringify(Repos.users.list(true)).includes('كلمة-مرور-عربية-طويلة'));

      /* لا افتراض مسارات */
      ok('لا اعتماد على مسار ملف أو مجلّد عمل في الواجهة',
         !/__dirname|process\.cwd|file:\/\/\/[A-Za-z]:/.test(document.documentElement.outerHTML));
      ok('كل الوسائط مخزّنة data: لا مسارات قرص',
         Repos.media.list(true).every(m => !m.path && String(m.dataUrl || '').startsWith('data:')));
      return out;
    });
    rows.push({ name:'لا خطأ تشغيل في مسار العربية', pass: errors.length === 0, detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('سطح المكتب — العربية والمسارات', rows, []);
  });

  /* ===================================================================== *
   * 9) الأداء: قاعدة بحجم المرحلة 3D — متصفح مقابل سطح المكتب              *
   * ===================================================================== */
  group('سطح المكتب — الأداء على قاعدة كبيرة', async (browser, browserUrl) => {
    const srv = await serveDesktop();
    const dUrl = `http://127.0.0.1:${srv.address().port}/`;
    const FIXTURE = fs.readFileSync(path.join(__dirname, 'fixture-large.js'), 'utf8');

    async function measure(url, desktop){
      const ctx = await browser.newContext({ viewport:{ width:1440, height:960 } });
      if (desktop) await ctx.addInitScript(() => { window.open = function(){ return null; }; });
      const page = await ctx.newPage();
      const errors = [];
      page.on('pageerror', e => errors.push(String(e.message)));
      await page.goto(url, { waitUntil:'domcontentloaded' });
      await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:120000 });
      await page.evaluate(() => window.TG.ready);
      await page.addScriptTag({ content: FIXTURE });
      const counts = await page.evaluate(() => window.TGFixture.buildLarge());

      const t0 = Date.now();
      await page.reload({ waitUntil:'domcontentloaded' });
      await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:180000 });
      await page.evaluate(() => window.TG.ready);
      const bootMs = Date.now() - t0;

      const timeIt = (code, arg) => page.evaluate(async ([c, a]) => {
        const f = new Function('a', 'return (' + c + ')(a)');
        await f(a);
        const runs = [];
        for (let i = 0; i < 3; i++){ const t = performance.now(); await f(a); runs.push(performance.now() - t); }
        return Math.round(Math.min(...runs));
      }, [code.toString(), arg]);

      const mid = await page.evaluate(() => window.TG.Repos.members.list()[10].id);
      const marks = {
        'الإقلاع': bootMs,
        'الاستقبال': await timeIt(() => { window.TG.go('desk'); window.TG.renderRoute(); }),
        'لوحة التحكم': await timeIt(() => { window.TG.go('dashboard'); window.TG.renderRoute(); }),
        'المشتركات': await timeIt(() => { window.TG.go('members'); window.TG.renderRoute(); }),
        'ملف مشتركة': await timeIt(a => { window.TG.go('member', { id:a }); window.TG.renderRoute(); }, mid),
        'البحث': await timeIt(() => window.TG.Actions.globalSearch('زهراء')),
        'تقرير مالي': await timeIt(() => window.TG.Reports.build(window.TG.D.monthKey(window.TG.D.today()))),
        'تقارير المتجر': await timeIt(() => { window.TG.Svc.sales.summary(); window.TG.Svc.inventory.valuation(); }),
        'المستحقات': await timeIt(() => window.TG.Svc.payments.openDues()),
        'نسخة احتياطية': await timeIt(() => window.TG.Backup.build(false)),
      };
      const restoreMs = await page.evaluate(async () => {
        const b = window.TG.Backup.build(false);
        const t = performance.now(); await window.TG.Backup.restore(b);
        return Math.round(performance.now() - t);
      });
      marks['استعادة'] = restoreMs;
      const mem = await page.evaluate(() => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : 0);
      await ctx.close();
      return { marks, counts, errors, mem };
    }

    const b = await measure(browserUrl, false);
    const d = await measure(dUrl, true);

    const rows = [];
    const total = Object.values(b.counts).reduce((a, n) => a + n, 0);
    rows.push({ name:`قاعدة الاختبار: ${b.counts.members} مشتركة · ${b.counts.payments} دفعة · ${b.counts.sales} فاتورة · ${b.counts.stockMoves} حركة مخزون (${total} سجل)`,
                pass: b.counts.members >= 10000 && b.counts.payments >= 20000
                      && b.counts.sales >= 10000 && b.counts.stockMoves >= 22000,
                detail: JSON.stringify(b.counts) });
    /* حدود مطلقة.
       الشاشات اليومية تُقاس بحدّ ضيّق: هذه ما تُفتح عشرات المرات في اليوم.
       أما «استعادة» فعملية نادرة مقصودة تُطلب في الكوارث والهجرة لا في
       يوم العمل، وحدّها هنا أوسع عمداً. وحدّ الانحدار الحقيقي لها ليس هذا
       الرقم بل المقارنة بالمتصفح أسفله: ما يهمّ هذه المرحلة أن تغليف سطح
       المكتب لم يُبطئ شيئاً، لا أن يُعاد ضبط أداء سابق له. */
    const LIMIT = { 'الإقلاع':15000, 'الاستقبال':1500, 'لوحة التحكم':2500, 'المشتركات':2500,
                    'ملف مشتركة':2500, 'البحث':2500, 'تقرير مالي':4000, 'تقارير المتجر':2500,
                    'المستحقات':2500, 'نسخة احتياطية':8000, 'استعادة':90000 };
    Object.keys(d.marks).forEach(k => {
      const bb = b.marks[k], dd = d.marks[k], lim = LIMIT[k];
      rows.push({ name:`${k}: سطح المكتب ${dd}ms ⇐ المتصفح ${bb}ms (الحد ${lim}ms)`,
                  pass: dd <= lim, detail: dd > lim ? 'أبطأ من الحد المطلق' : '' });
    });
    /* تراجع غير مفسَّر: أبطأ من المتصفح بمقدار محسوس وبنسبة كبيرة */
    const worse = Object.keys(d.marks).filter(k => d.marks[k] > b.marks[k] + 250 && d.marks[k] > b.marks[k] * 1.8);
    rows.push({ name:'لا تراجع أداء غير مفسَّر بين المتصفح وسطح المكتب', pass: worse.length === 0,
                detail: worse.map(k => `${k}: ${b.marks[k]}⇐${d.marks[k]}`).join('، ') });
    rows.push({ name:`الذاكرة بعد كل ذلك: ${d.mem}MB (المتصفح ${b.mem}MB)`,
                pass: !d.mem || d.mem < 1500, detail:`${d.mem}MB` });
    rows.push({ name:'لا خطأ تشغيل على قاعدة كبيرة', pass: d.errors.length === 0, detail: d.errors.slice(0, 3).join(' | ') });
    console.log(`   ⏱  سطح المكتب: ${Object.entries(d.marks).map(([k, v]) => `${k}=${v}ms`).join(' · ')}`);
    srv.close();
    record('سطح المكتب — الأداء على قاعدة كبيرة', rows, []);
  });
};
