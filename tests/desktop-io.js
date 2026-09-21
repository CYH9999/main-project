/* ============================================================================
   تبارك جيم — اختبارات جسر سطح المكتب: الملفات والطباعة

   ما الذي يُختبر هنا بالضبط؟ **طرف الواجهة** من الجسر: هل تذهب كل ضغطة
   تصدير إلى فئتها الصحيحة؟ هل تُقال رسالة النجاح فقط حين يقع النجاح؟ هل
   تُنادى الطباعة الأصلية مرة واحدة لا مرتين؟ هل تُؤخذ نسخة الأمان قبل
   الاستعادة لا بعدها؟

   وكيف؟ بجسر مزيّف يُركَّب مكان `window.__TAURI_INTERNALS__` ويحاكي قواعد
   طرف الصدأ نفسها: الفئة تقرّر المجلّد، والاسم يُعقَّم، والاسم المكرَّر
   يأخذ لاحقاً، والتقليم يُبقي الأحدث. فما يُثبَت هنا هو أن الواجهة تستعمل
   الجسر استعمالاً صحيحاً.

   وما لا يُثبَت هنا — وهو مكتوب في تقرير المرحلة لا هنا — أن طرف الصدأ
   نفسه يعمل على ويندوز: أن `ShowPrintUI` تفتح حواراً، وأن الملف يقع فعلاً
   في «المستندات». قواعد المسار والتعقيم والتقليم في طرف الصدأ لها اختباراتها
   في `src-tauri/src/paths.rs` (‏`cargo test`).
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');

const ROOT = path.join(__dirname, '..');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const DIST = path.join(ROOT, 'app', 'index.html');
/* النسخة تُقرأ من مصدرها وتُمرَّر إلى الجسر المزيّف — لا رقم مكتوب في اختبار */
const PKG_VERSION = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;

/* الجسر المزيّف — يُحقن قبل أي سطر من سطور التطبيق، كما يفعل Tauri */
function installBridge(opts) {
  /* النسخة تصل مع الخيارات: الجسر المزيّف يقول ما يقوله الحقيقيّ، ولا
     يُكتب فيه رقمٌ يتخلّف عن `package.json` عند أول ترقية. */
  const PKG_VERSION = (opts && opts.version) || '0.0.0';
  const R = 'C:\\Users\\gym\\Documents\\تبارك جيم';
  const FOLDER = {
    csv: 'Exports\\CSV', excel: 'Exports\\Excel', word: 'Exports\\Word',
    backup: 'Backups\\manual', 'backup-manual': 'Backups\\manual',
    'backup-auto': 'Backups\\automatic', 'backup-automatic': 'Backups\\automatic',
  };
  /* المفتاح القانوني للفئة — كما يُعيده `Category::key()` في طرف الصدأ */
  const CANON = {
    csv: 'csv', excel: 'excel', word: 'word',
    backup: 'backup-manual', 'backup-manual': 'backup-manual',
    'backup-auto': 'backup-auto', 'backup-automatic': 'backup-auto',
  };
  const CAT_FOLDER = {
    'backup-manual': 'Backups\\manual', 'backup-auto': 'Backups\\automatic',
    csv: 'Exports\\CSV', excel: 'Exports\\Excel', word: 'Exports\\Word',
  };
  const CAT_EXT = { csv: ['csv'], excel: ['xlsx', 'xls'], word: ['docx', 'doc'],
                    'backup-manual': ['json'], 'backup-auto': ['json'] };
  const extOk = (name, cat) => {
    const i = String(name).lastIndexOf('.');
    if (i < 0) return false;
    const e = String(name).slice(i + 1).toLowerCase();
    return (CAT_EXT[cat] || []).includes(e);
  };
  const FS = { files: [], calls: [], opened: [], openedFolders: [], revealed: false,
               fail: Object.assign({}, opts && opts.fail) };
  window.__TG_FS__ = FS;

  /* تعقيم مطابق لقواعد طرف الصدأ */
  const clean = (raw) => {
    const i = raw.lastIndexOf('.');
    let stem = raw, ext = null;
    if (i > 0 && i + 1 < raw.length && raw.length - i <= 8) { stem = raw.slice(0, i); ext = raw.slice(i + 1); }
    const strip = (t) => t.replace(/[<>:"/\\|?*]/g, '-').replace(/[\x00-\x1f\x7f]/g, '-');
    stem = strip(stem).replace(/^[. ]+|[. ]+$/g, '');
    while (stem.includes('..')) stem = stem.replace('..', '.');
    if ([...stem].length > 110) stem = [...stem].slice(0, 110).join('').replace(/[. ]+$/, '');
    if (!stem) throw 'اسم الملف فارغ بعد التنقية';
    if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/i.test(stem)) stem += '_';
    ext = ext ? ext.replace(/[^A-Za-z0-9]/g, '') : null;
    return ext ? stem + '.' + ext : stem;
  };
  const unique = (folder, name) => {
    if (!FS.files.some(f => f.folder === folder && f.name === name)) return name;
    const d = name.lastIndexOf('.');
    const stem = d > 0 ? name.slice(0, d) : name, ext = d > 0 ? name.slice(d) : '';
    for (let n = 2; n < 999; n++) {
      const c = `${stem}-${n}${ext}`;
      if (!FS.files.some(f => f.folder === folder && f.name === c)) return c;
    }
    throw 'تعذّر إيجاد اسم غير مستعمَل';
  };

  const handlers = {
    tg_env: () => ({
      platform: 'windows', root: R,
      exports: R + '\\Exports', backups: R + '\\Backups', can_print: true, can_open: true,
      /* هويّة البناء كما يخبزها `build.rs` — الواجهة تقرؤها ولا تخترعها */
      version: PKG_VERSION, git_sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678',
      git_short: 'a1b2c3d', build_at: 1789900000, build_id: 'a1b2c3d-ci42',
      frontend_sha: 'deadbeef',
    }),
    tg_save: (a) => {
      if (FS.fail.save) throw FS.fail.save;
      const folder = FOLDER[a.category];
      if (!folder) throw 'فئة حفظ غير معروفة';
      const name = unique(folder, clean(String(a.filename || '')));
      const body = a.text != null ? a.text : atob(a.b64 || '');
      if (!body.length) throw 'الملف فارغ — لم يُحفظ';
      FS.files.push({
        folder, name, category: a.category, text: a.text != null ? a.text : null,
        b64: a.b64 || null, bytes: body.length, modified: Date.now() + FS.files.length,
      });
      return { path: `${R}\\${folder}\\${name}`, name, folder: `${R}\\${folder}`, bytes: body.length };
    },
    tg_list_backups: () => FS.files
      .filter(f => f.folder.startsWith('Backups'))
      .map(f => ({ kind: f.folder.endsWith('automatic') ? 'automatic' : 'manual',
                   name: f.name, bytes: f.bytes, modified: f.modified }))
      .sort((x, y) => y.modified - x.modified),
    tg_read_backup: (a) => {
      const folder = a.kind === 'automatic' ? 'Backups\\automatic' : 'Backups\\manual';
      const f = FS.files.find(x => x.folder === folder && x.name === a.name);
      if (!f) throw 'النسخة غير موجودة';
      return f.text != null ? f.text : atob(f.b64);
    },
    tg_prune_backups: (a) => {
      if (FS.fail.prune) throw FS.fail.prune;
      const keep = Math.max(1, Number(a.keep) || 1);
      const auto = FS.files.filter(f => f.folder === 'Backups\\automatic')
        .sort((x, y) => y.modified - x.modified);
      const doomed = auto.slice(keep);
      FS.files = FS.files.filter(f => !doomed.includes(f));
      return doomed.map(f => f.name);
    },
    tg_print: () => { if (FS.fail.print) throw FS.fail.print; return null; },

    /* ---- جاهزية الواجهة: تُغلق نافذة البدء وتُظهر الرئيسية ---- */
    tg_ready: () => { if (FS.fail.ready) throw FS.fail.ready; FS.revealed = true; return null; },

    /* ---- مركز الملفات: يقرأ المجلّدات لا جدولاً ثانياً ----
       يحاكي قواعد طرف الصدأ: الفئة تُعطي المفتاح القانوني، واللاحقة تُصفّي
       ما ليس من إنتاج النظام، ولكلّ فئة حدٌّ من الأحدث. */
    tg_list_files: (a) => {
      if (FS.fail.list) throw FS.fail.list;
      const per = Math.min(300, Math.max(1, Number(a.perCategory) || 60));
      const out = [];
      Object.keys(CAT_FOLDER).forEach(cat => {
        const rows = FS.files
          .filter(f => CANON[f.category] === cat && extOk(f.name, cat))
          .sort((x, y) => y.modified - x.modified)
          .slice(0, per)
          .map(f => ({ category: cat,
                       kind: cat === 'backup-auto' ? 'automatic' : cat === 'backup-manual' ? 'manual' : cat,
                       name: f.name, bytes: f.bytes, modified: f.modified }));
        out.push(...rows);
      });
      return out.sort((x, y) => y.modified - x.modified);
    },
    tg_open_file: (a) => {
      if (FS.fail.open) throw FS.fail.open;
      const cat = CANON[a.category];
      if (!cat) throw 'فئة غير معروفة';
      const name = clean(String(a.name || ''));                  /* يُعقَّم كما عند الكتابة */
      if (!extOk(name, cat)) throw 'نوع الملف لا يخصّ هذا المجلّد';
      const hit = FS.files.find(f => CANON[f.category] === cat && f.name === name);
      if (!hit) throw 'الملف لم يعد موجوداً';
      FS.opened.push({ category: cat, name });
      return null;
    },
    tg_open_folder: (a) => {
      if (FS.fail.open) throw FS.fail.open;
      const c = a.category == null || a.category === '' ? 'root' : a.category;
      const cat = c === 'root' ? 'root' : CANON[c];
      if (!cat) throw 'فئة غير معروفة';
      FS.openedFolders.push(cat);
      return null;
    },
  };

  window.__TAURI_INTERNALS__ = {
    invoke(cmd, args) {
      FS.calls.push({ cmd, args: args || {} });
      return new Promise((res, rej) => {
        const h = handlers[cmd];
        if (!h) return rej(`أمر غير معروف: ${cmd}`);
        try { res(h(args || {})); } catch (e) { rej(e); }   /* Tauri يرفض بنصّ */
      });
    },
  };
}

/* يُصدَّر ليُعاد استعماله في `tests/desktop-ux.js`: جسرٌ مزيّف واحد لا
   اثنان، فلا تتفرّق قواعد المحاكاة عن قواعد طرف الصدأ في ملفين. */
module.exports = function register({ group, record, TESTS_JS }) {
  const conf = () => JSON.parse(fs.readFileSync(CONF, 'utf8'));

  function serveDesktop() {
    const csp = conf().app.security.csp;
    return new Promise(res => {
      const srv = http.createServer((req, r) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        const file = u === '/' ? DIST : path.join(ROOT, u.replace(/^\//, ''));
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

  /* يفتح التطبيق والجسر مركَّب — أي: كما يُفتح في تطبيق ويندوز */
  async function openBridged(browser, url, opts = {}) {
    const ctx = await browser.newContext();
    await ctx.addInitScript(() => { window.open = function () { return null; }; });
    await ctx.addInitScript(installBridge, { fail: opts.fail || {}, version: PKG_VERSION });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    /* `[TG]` هو سجلّ التطبيق نفسه. في مجموعات حقن الفشل هو **المتوقَّع**:
       النظام يُسجّل سبب الفشل بدل ابتلاعه. فالخطأ الحقيقي وحده يُعدّ. */
    const noise = t => /favicon|404/i.test(t) || (opts.expectLogged && /^\[TG\]/.test(t));
    page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);
    await page.addScriptTag({ content: TESTS_JS });
    return { ctx, page, errors };
  }

  /* ===================================================================== *
   * 1) الكشف والتوجيه: كل تصدير إلى فئته                                  *
   * ===================================================================== */
  group('جسر سطح المكتب — التصدير إلى مجلّداته', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openBridged(browser, url);
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name: n, pass: !!p, detail: d == null ? '' : String(d) });
      const { Desktop, DesktopFiles, Exporter, Repos, Svc, D, UI } = window.TG;
      const FS = window.__TG_FS__;

      ok('النظام يعرف أنه داخل تطبيق سطح المكتب', Desktop.on() === true);
      const env = await Desktop.env();
      ok('يقرأ مواضع الحفظ من النظام لا يخمّنها', /تبارك جيم/.test(env.root), env.root);
      ok('المسار يُعرض مقروءاً لا بفواصل ويندوز',
         Desktop.pretty(env.backups).indexOf('\\') === -1, Desktop.pretty(env.backups));

      await Svc.members.create({ name: 'زهراء الموسوي', phone: '07700000001' });
      const cols = [{ h: 'الاسم', key: 'name' }];
      const rowsData = Repos.members.list();

      Exporter.csv(`المشتركات-${D.today()}.csv`, cols, rowsData);
      await new Promise(r => setTimeout(r, 120));
      const csv = FS.files.find(f => f.category === 'csv');
      ok('CSV يذهب إلى مجلّد CSV', !!csv && csv.folder === 'Exports\\CSV', csv && csv.folder);
      ok('CSV يُرسَل نصّاً لا مُرمَّزاً', !!csv && csv.text != null && csv.b64 == null);
      ok('CSV يحمل علامة الترتيب والعربية', !!csv && csv.text.charCodeAt(0) === 0xfeff && /زهراء/.test(csv.text));
      ok('اسم ملف CSV عربيّ وسليم', !!csv && /^المشتركات-/.test(csv.name) && !/[<>:"/\\|?*]/.test(csv.name), csv && csv.name);

      Exporter.xlsx(`تقرير-${D.today()}.xlsx`, [{ name: 'المشتركات', cols, rows: rowsData }]);
      await new Promise(r => setTimeout(r, 200));
      const xls = FS.files.find(f => f.category === 'excel');
      ok('Excel يذهب إلى مجلّد Excel', !!xls && xls.folder === 'Exports\\Excel', xls && xls.folder);
      ok('Excel يُرسَل مُرمَّزاً لأنه ثنائيّ', !!xls && xls.b64 != null && xls.text == null);
      ok('Excel ليس فارغاً وهو حزمة zip', !!xls && xls.bytes > 200 && atob(xls.b64).slice(0, 2) === 'PK',
         xls && xls.bytes);

      Exporter.docx(`تقرير-إداري-${D.today()}.docx`, {
        title: 'التقرير الإداري', subtitle: 'تجربة',
        blocks: [{ type: 'h1', text: 'الملخّص' }, { type: 'p', text: 'نصّ عربيّ' },
                 { type: 'kv', rows: [['الإيرادات', '١٠٠'], ['المصروفات', '٥٠']] }],
      });
      await new Promise(r => setTimeout(r, 200));
      const doc = FS.files.find(f => f.category === 'word');
      ok('Word يذهب إلى مجلّد Word', !!doc && doc.folder === 'Exports\\Word', doc && doc.folder);
      ok('Word ليس فارغاً وهو حزمة zip', !!doc && doc.bytes > 200 && atob(doc.b64).slice(0, 2) === 'PK');

      ok('لم يُستعمل تنزيل المتصفح ولا مرة', !document.querySelector('a[download]'));

      /* الاسم المكرَّر لا يُكتب فوقه */
      Exporter.csv(`المشتركات-${D.today()}.csv`, cols, rowsData);
      await new Promise(r => setTimeout(r, 120));
      const sameName = FS.files.filter(f => f.category === 'csv');
      ok('ملف باسم موجود يأخذ لاحقاً بدل الكتابة فوقه',
         sameName.length === 2 && /-2\.csv$/.test(sameName[1].name), sameName.map(f => f.name).join('، '));

      /* المقارنة التي تهمّ فعلاً: هل الملف المحفوظ هو نفسه الملف المنزَّل؟
         تُبنى بايتات المتصفح من المولّد نفسه وتُقارن بما وصل إلى الجسر. */
      const enc = new TextEncoder();
      const desktopCsvBytes = enc.encode(csv.text);
      let browserCsvBytes = null;
      const realDownload = UI.download;
      UI.download = async (blob) => { browserCsvBytes = new Uint8Array(await blob.arrayBuffer()); };
      Exporter.csv('مقارنة.csv', cols, rowsData);
      await new Promise(r => setTimeout(r, 150));
      UI.download = realDownload;
      ok('بايتات CSV في سطح المكتب = بايتاتها في المتصفح',
         !!browserCsvBytes && browserCsvBytes.length === desktopCsvBytes.length
           && browserCsvBytes.every((b, i) => b === desktopCsvBytes[i]),
         `desktop=${desktopCsvBytes.length} browser=${browserCsvBytes && browserCsvBytes.length}`);
      ok('وتبدأ بعلامة ترتيب UTF-8 (EF BB BF) فيقرأ إكسل العربية',
         desktopCsvBytes[0] === 0xef && desktopCsvBytes[1] === 0xbb && desktopCsvBytes[2] === 0xbf,
         [...desktopCsvBytes.slice(0, 3)].map(b => b.toString(16)).join(' '));
      return out;
    });
    rows.push({ name: 'لا خطأ تشغيل في مسار التصدير', pass: errors.length === 0, detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('جسر سطح المكتب — التصدير إلى مجلّداته', rows, []);
  });

  /* ===================================================================== *
   * 2) الفشل يُقال فشلاً                                                   *
   * ===================================================================== */
  group('جسر سطح المكتب — الفشل لا يُخفى', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openBridged(browser, url, { fail: { save: 'القرص ممتلئ' }, expectLogged: true });
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name: n, pass: !!p, detail: d == null ? '' : String(d) });
      const { Exporter, Repos, Svc, D, Actions } = window.TG;
      const FS = window.__TG_FS__;
      const toasts = [];
      const realToast = window.TG.UI.toast;
      window.TG.UI.toast = (msg, kind, ms) => { toasts.push({ msg: String(msg), kind }); return realToast.call(window.TG.UI, msg, kind, ms); };

      await Svc.members.create({ name: 'فاطمة' });
      const rejections = [];
      const onRej = e => rejections.push(String((e.reason && e.reason.message) || e.reason));
      window.addEventListener('unhandledrejection', onRej);
      Exporter.csv(`ملف-${D.today()}.csv`, [{ h: 'الاسم', key: 'name' }], Repos.members.list());
      await new Promise(r => setTimeout(r, 400));
      /* الفشل يُقال مرة واحدة: رفضٌ غير ملتقَط يعني رسالة خطأ ثانية من
         الحارس العام فوق الرسالة الأولى. */
      ok('فشل الحفظ لا يترك وعداً مرفوضاً بلا التقاط', rejections.length === 0, rejections.join(' | '));
      window.removeEventListener('unhandledrejection', onRej);
      ok('لا ملف كُتب حين يفشل الحفظ', FS.files.length === 0, FS.files.length);
      ok('لا رسالة نجاح كاذبة', !toasts.some(t => /تم حفظ/.test(t.msg)), toasts.map(t => t.msg).join(' | '));
      ok('ورسالة الفشل تُقال مرة واحدة لا مرتين',
         toasts.filter(t => t.kind === 'err').length === 1, toasts.map(t => t.msg).join(' | '));
      ok('تُقال الرسالة الحقيقية من النظام',
         toasts.some(t => t.kind === 'err' && /القرص ممتلئ/.test(t.msg)), toasts.map(t => t.msg).join(' | '));

      /* النسخة الاحتياطية كذلك: لا تُعلَّم مأخوذةً إن لم تُكتب */
      const before = window.TG.Settings.get('lastBackupAt') || null;
      toasts.length = 0;
      await Actions.exportBackup(true);
      await new Promise(r => setTimeout(r, 200));
      ok('النسخة الفاشلة لا تُسجَّل كنسخة أُخذت',
         (window.TG.Settings.get('lastBackupAt') || null) === before);
      ok('ويُقال سبب تعذّرها', toasts.some(t => t.kind === 'err' && /تعذّر/.test(t.msg)),
         toasts.map(t => t.msg).join(' | '));
      window.TG.UI.toast = realToast;
      return out;
    });
    rows.push({ name: 'الفشل لم يكسر الصفحة', pass: errors.length === 0, detail: errors.slice(0, 2).join(' | ') });
    await ctx.close(); srv.close();
    record('جسر سطح المكتب — الفشل لا يُخفى', rows, []);
  });

  /* ===================================================================== *
   * 3) الطباعة الأصلية                                                     *
   * ===================================================================== */
  group('جسر سطح المكتب — الطباعة الأصلية', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openBridged(browser, url);
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name: n, pass: !!p, detail: d == null ? '' : String(d) });
      const { Print, UI, Svc, Repos, D, Reports, Actions } = window.TG;
      const FS = window.__TG_FS__;
      const printCalls = () => FS.calls.filter(c => c.cmd === 'tg_print').length;

      const m = await Svc.members.create({ name: 'سجى الطباعة', phone: '07700000002' });
      const mid = (m.rec || m).id;
      const sub = await Svc.subs.create({ memberId: mid, startDate: D.today(), planName: 'شهر',
        customDuration: { value: 1, unit: 'month' }, price: 90000, paidAmount: 90000, paymentMethod: 'cash' });
      const pay = Actions.lastPaymentOf('subscription', (sub.rec || sub).id);
      const rc = await Svc.receipts.ensure(pay.id);

      const fire = () => window.dispatchEvent(new Event('afterprint'));
      const settle = async () => { fire(); await new Promise(r => setTimeout(r, 800)); };

      /* --- مستند واحد بالتفصيل --- */
      const before = printCalls();
      await Print.open('وصل', Print.receiptHtml(rc, { format: 'a4' }), {});
      ok('لم تُفتح نافذة منبثقة ولا إطار', !document.querySelector('iframe'));
      ok('نُوديت الطباعة الأصلية مرة واحدة', printCalls() === before + 1, printCalls() - before);
      const root = document.getElementById('tgPrintRoot');
      ok('المستند وُضع محتوىً علويّاً في الصفحة', !!root && root.parentElement === document.body);
      ok('المستند يحمل نصّ الوصل', !!root && /سجى الطباعة/.test(root.innerHTML));
      ok('اتجاهه من اليمين', !!root && root.getAttribute('dir') === 'rtl');
      ok('لا يُرى على الشاشة', !!root && getComputedStyle(root).display === 'none');
      const st = document.getElementById('tgPrintStyle');
      ok('قاعدة الطباعة مُركَّبة', !!st && /@media print/.test(st.textContent));
      ok('القاعدة تُخفي كل ما عدا المستند عند الطباعة',
         !!st && /body>\*:not\(#tgPrintRoot\)\{display:none!important\}/.test(st.textContent.replace(/\s+/g, '')));
      ok('وتُظهر المستند', !!st && /#tgPrintRoot\{display:block!important/.test(st.textContent.replace(/\s+/g, '')));
      ok('قياس الورقة مضبوط', !!st && /@page/.test(st.textContent));
      await settle();
      ok('بعد انتهاء الطباعة تعود الصفحة كما كانت',
         !document.getElementById('tgPrintRoot') && !document.getElementById('tgPrintStyle'));

      /* --- كل مسارات الطباعة --- */
      const paths = {
        'وصل A4': () => Print.open('و', Print.receiptHtml(rc, { format: 'a4' }), {}),
        'وصل شريط': () => Print.open('و', Print.receiptHtml(rc, { format: 'slip' }), { slip: true }),
        'كشف مشتركة': () => Print.open('ك', Print.statementHtml(mid), {}),
        'كشف الصندوق': () => Print.open('ص', Print.cashDayHtml(D.today()), {}),
        'مستحقات الموردين': () => Print.open('ذ', Print.payablesHtml(), {}),
        'التقرير الإداري': () => UI.printSection('ت', Reports.html(Reports.build(D.monthKey(D.today())), true), { plain: true }),
      };
      for (const [name, fn] of Object.entries(paths)) {
        const n0 = printCalls();
        await fn();
        const r = document.getElementById('tgPrintRoot');
        ok(`${name}: واجهة ويندوز نُوديت`, printCalls() === n0 + 1);
        ok(`${name}: المستند غير فارغ`, !!r && r.innerHTML.length > 500, r && r.innerHTML.length);
        await settle();
        ok(`${name}: لا يبقى أثر بعدها`, !document.getElementById('tgPrintRoot'));
      }

      /* --- الترويسة لا تُطبع بلا شعار --- */
      const B64GIF = 'R0lGODlhAgACAPIAAP///wAAAP//AAAA/wAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh'
                   + '+QQJCgAAACwAAAAAAgACAAADBAgEpQIAIfkECQoAAAAsAAAAAAIAAgAAAwQIhKUCADs=';
      const bin = atob(B64GIF); const arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      await window.TG.Brand.setMedia('logo', new File([arr], 'شعار.gif', { type: 'image/gif' }));
      /* تُلتقط حالة الصور في اللحظة التي يُنادى فيها أمر الطباعة */
      let stateAtPrint = null;
      const realInvoke = window.__TAURI_INTERNALS__.invoke;
      window.__TAURI_INTERNALS__.invoke = function (cmd, args) {
        if (cmd === 'tg_print') {
          const imgs = [...document.querySelectorAll('#tgPrintRoot img')];
          stateAtPrint = { total: imgs.length, ready: imgs.filter(i => i.complete && i.naturalWidth > 0).length };
        }
        return realInvoke.call(this, cmd, args);
      };
      await Print.open('و', Print.receiptHtml(rc, { format: 'a4' }), {});
      window.__TAURI_INTERNALS__.invoke = realInvoke;
      ok('ترويسة الوصل تحمل صورة الهوية', !!stateAtPrint && stateAtPrint.total > 0,
         JSON.stringify(stateAtPrint));
      /* الصور تُحمَّل بعد إدراج الـHTML. فنداءٌ فوريّ يطبع ترويسةً فارغة. */
      ok('ولا تُنادى الطباعة قبل اكتمال صورها',
         !!stateAtPrint && stateAtPrint.ready === stateAtPrint.total, JSON.stringify(stateAtPrint));
      await settle();

      /* --- ضغطتان متتاليتان --- */
      const n1 = printCalls();
      Print.open('و', Print.receiptHtml(rc, { format: 'a4' }), {});
      Print.open('و', Print.receiptHtml(rc, { format: 'a4' }), {});
      Print.open('و', Print.receiptHtml(rc, { format: 'a4' }), {});
      await new Promise(r => setTimeout(r, 300));
      ok('ثلاث ضغطات سريعة = أمر طباعة واحد', printCalls() === n1 + 1, printCalls() - n1);
      ok('ولا يتكدّس أكثر من مستند واحد',
         document.querySelectorAll('#tgPrintRoot').length <= 1,
         document.querySelectorAll('#tgPrintRoot').length);
      await settle();

      /* --- الإلغاء ثم طباعة جديدة --- */
      const n2 = printCalls();
      await Print.open('و', Print.statementHtml(mid), {});
      fire();                                                   /* إلغاء = afterprint بلا طباعة */
      await new Promise(r => setTimeout(r, 700));
      ok('الإلغاء ينظّف الصفحة', !document.getElementById('tgPrintRoot'));
      await Print.open('و', Print.statementHtml(mid), {});
      ok('والطباعة بعده تعمل — لا وضع طباعة عالق', printCalls() === n2 + 2, printCalls() - n2);
      await settle();
      return out;
    });
    rows.push({ name: 'لا خطأ تشغيل في مسار الطباعة', pass: errors.length === 0, detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('جسر سطح المكتب — الطباعة الأصلية', rows, []);
  });

  /* ===================================================================== *
   * 4) تعذّر الطباعة                                                       *
   * ===================================================================== */
  group('جسر سطح المكتب — تعذّر الطباعة', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openBridged(browser, url, { fail: { print: 'لا طابعة' }, expectLogged: true });
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name: n, pass: !!p, detail: d == null ? '' : String(d) });
      const { Print } = window.TG;
      const toasts = [];
      const realToast = window.TG.UI.toast;
      window.TG.UI.toast = (msg, kind, ms) => { toasts.push({ msg: String(msg), kind }); return realToast.call(window.TG.UI, msg, kind, ms); };
      const m = await window.TG.Svc.members.create({ name: 'مشتركة' });
      const r = await Print.open('ك', Print.statementHtml((m.rec || m).id), {});
      await new Promise(x => setTimeout(x, 300));
      ok('الفشل يُعاد لا يُبتلع', r === null);
      ok('الرسالة بلغة المستخدمة لا بلغة المتصفّح',
         toasts.some(t => t.kind === 'err' && /تعذرت الطباعة/.test(t.msg)), toasts.map(t => t.msg).join(' | '));
      ok('ولا تذكر نافذة منبثقة ولا متصفّحاً ولا إطاراً',
         !toasts.some(t => /منبثقة|المتصفح منع|iframe|window\.open/i.test(t.msg)),
         toasts.map(t => t.msg).join(' | '));
      ok('والصفحة تعود كما كانت', !document.getElementById('tgPrintRoot') && !document.getElementById('tgPrintStyle'));

      /* أهمّ أثر للفشل: العدّاد. «أُعيدت طباعته» سجلّ عمل لا زينة، فلا
         يزيد على وصلٍ لم يخرج من الطابعة. وهذا كان يقع فعلاً: في سطح
         المكتب تُعيد `Print.open` وعداً، والوعد صادقٌ دائماً في `if (!w)`،
         فكان العدّاد يزيد ولو لم تُفتح واجهة الطباعة. */
      const { Svc, Repos, Actions, D } = window.TG;
      const mem = await Svc.members.create({ name: 'صاحبة الوصل' });
      const sub = await Svc.subs.create({ memberId: (mem.rec || mem).id, startDate: D.today(),
        planName: 'شهر', customDuration: { value: 1, unit: 'month' }, price: 90000,
        paidAmount: 90000, paymentMethod: 'cash' });
      const pm = Actions.lastPaymentOf('subscription', (sub.rec || sub).id);
      const rc = await Svc.receipts.ensure(pm.id);
      const before = Repos.receipts.get(rc.id).reprints || 0;
      toasts.length = 0;
      const res = await Actions.printReceipt(rc.id, 'a4');
      await new Promise(x => setTimeout(x, 400));
      ok('طباعة فاشلة لا تُعيد وصلاً', res === null, String(res));
      ok('ولا تزيد عدّاد إعادة الطباعة',
         (Repos.receipts.get(rc.id).reprints || 0) === before,
         `${before} → ${Repos.receipts.get(rc.id).reprints || 0}`);
      ok('ولا تقول إنها طُبعت', !toasts.some(t => /طُبع/.test(t.msg)), toasts.map(t => t.msg).join(' | '));
      window.TG.UI.toast = realToast;
      return out;
    });
    rows.push({ name: 'الفشل لم يكسر الصفحة', pass: errors.length === 0, detail: errors.slice(0, 2).join(' | ') });
    await ctx.close(); srv.close();
    record('جسر سطح المكتب — تعذّر الطباعة', rows, []);
  });

  /* ===================================================================== *
   * 5) النسخ: اليدوية والتلقائية والتقليم ونقطة الرجوع                     *
   * ===================================================================== */
  group('جسر سطح المكتب — النسخ الاحتياطية', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openBridged(browser, url);
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name: n, pass: !!p, detail: d == null ? '' : String(d) });
      const { Actions, Backup, Settings, Svc, Repos, D, STORE_NAMES } = window.TG;
      const FS = window.__TG_FS__;

      await Svc.members.create({ name: 'نور الهدى', phone: '07700000003' });

      /* --- يدوية --- */
      await Actions.exportBackup(true);
      await new Promise(r => setTimeout(r, 250));
      const man = FS.files.filter(f => f.category === 'backup');
      ok('النسخة اليدوية تُكتب في مجلّد النسخ اليدوية',
         man.length === 1 && man[0].folder === 'Backups\\manual', man[0] && man[0].folder);
      ok('ولا تمرّ بمجلّد التنزيلات', !document.querySelector('a[download]'));
      ok('اسمها مختوم بالوقت', !!man[0] && /نسخة-تبارك-جيم-\d{4}-\d{2}-\d{2}-\d{4}\.json$/.test(man[0].name), man[0] && man[0].name);
      const parsed = JSON.parse(man[0].text);
      ok('محتواها نسخة صالحة بكل الجداول',
         parsed.schema === window.TG.APP.schema && Object.keys(parsed.data).length === 40,
         `schema=${parsed.schema} tables=${Object.keys(parsed.data).length}`);
      ok('وتُسجَّل كنسخة أُخذت', !!Settings.get('lastBackupAt'));

      /* --- تلقائية: مرة في اليوم --- */
      await Settings.set({ autoBackup: {} });
      ok('مستحقّة حين لم تُؤخذ اليوم', Backup.autoDue() === true);
      await Backup.runAuto();
      await new Promise(r => setTimeout(r, 200));
      const auto1 = FS.files.filter(f => f.category === 'backup-auto');
      ok('النسخة التلقائية تُكتب في مجلّدها',
         auto1.length === 1 && auto1[0].folder === 'Backups\\automatic', auto1[0] && auto1[0].folder);
      ok('اسمها يقول إنها تلقائية', !!auto1[0] && /^نسخة-تلقائية-/.test(auto1[0].name), auto1[0] && auto1[0].name);
      ok('ويُختم اليوم', Settings.get('autoBackup').lastDay === D.today());
      ok('فلا تعود مستحقّة في التشغيل التالي من اليوم نفسه', Backup.autoDue() === false);
      await Backup.runAuto();
      await new Promise(r => setTimeout(r, 200));
      ok('ولو نُوديت ثانيةً لا تتضاعف النسخ بلا داعٍ',
         FS.files.filter(f => f.category === 'backup-auto').length <= 2,
         FS.files.filter(f => f.category === 'backup-auto').length);

      /* --- التقليم --- */
      FS.files = FS.files.filter(f => f.category !== 'backup-auto');
      for (let i = 0; i < 20; i++)
        FS.files.push({ folder: 'Backups\\automatic', name: `نسخة-تلقائية-قديمة-${i}.json`,
                        category: 'backup-auto', text: '{}', b64: null, bytes: 2, modified: 1000 + i });
      const removed = await window.TG.Desktop.call('tg_prune_backups', { keep: Backup.AUTO_KEEP });
      const left = FS.files.filter(f => f.category === 'backup-auto');
      ok('التقليم يُبقي أربع عشرة نسخة', left.length === 14, left.length);
      ok('ويحذف ما زاد', removed.length === 6, removed.length);
      ok('ولا يحذف الأحدث أبداً', left.some(f => f.name === 'نسخة-تلقائية-قديمة-19.json'));
      ok('ولا يمسّ النسخ اليدوية', FS.files.filter(f => f.category === 'backup').length === 1);

      /* --- نقطة الرجوع قبل الاستعادة --- */
      const snapshot = JSON.parse(man[0].text);
      await Svc.members.create({ name: 'أُضيفت بعد النسخة' });
      const beforeSafety = FS.files.filter(f => /^قبل-الاستعادة-/.test(f.name)).length;
      const realConfirm = window.TG.UI.confirm;
      window.TG.UI.confirm = async () => true;
      const file = new File([JSON.stringify(snapshot)], 'نسخة.json', { type: 'application/json' });
      await Actions.importBackup(file);
      await new Promise(r => setTimeout(r, 500));
      window.TG.UI.confirm = realConfirm;
      const safety = FS.files.filter(f => /^قبل-الاستعادة-/.test(f.name));
      ok('تُؤخذ نسخة أمان قبل الاستعادة', safety.length === beforeSafety + 1, safety.length);
      ok('وتُحفظ حيث لا يصلها التقليم', !!safety[0] && safety[0].folder === 'Backups\\manual', safety[0] && safety[0].folder);
      ok('وتحمل البيانات التي كانت قبل الاستبدال',
         !!safety[0] && /أُضيفت بعد النسخة/.test(safety[0].text));
      ok('والاستعادة وقعت فعلاً', !Repos.members.list(true).some(m => m.name === 'أُضيفت بعد النسخة'));
      ok('ولا نسخة تلقائية فورية بعدها', Backup.autoDue() === false);
      return out;
    });
    rows.push({ name: 'لا خطأ تشغيل في مسار النسخ', pass: errors.length === 0, detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('جسر سطح المكتب — النسخ الاحتياطية', rows, []);
  });

  /* ===================================================================== *
   * 6) فشل نسخة الأمان: تُسأل المستخدمة ولا تُستبدل بياناتها بصمت          *
   * ===================================================================== */
  group('جسر سطح المكتب — نقطة الرجوع حين تتعذّر', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    const { ctx, page, errors } = await openBridged(browser, url, { fail: { save: 'القرص ممتلئ' }, expectLogged: true });
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name: n, pass: !!p, detail: d == null ? '' : String(d) });
      const { Actions, Backup, Svc, Repos } = window.TG;
      await Svc.members.create({ name: 'بيانات ثمينة' });
      const backup = Backup.build(false);
      await Svc.members.create({ name: 'أحدث من النسخة' });

      const asked = [];
      const realConfirm = window.TG.UI.confirm;
      /* تُقبل الاستعادة نفسها، ويُرفض المضيّ بلا نقطة رجوع — وهذا هو السؤال
         الذي تختبره هذه المجموعة. */
      window.TG.UI.confirm = async (o) => { asked.push(o.title || ''); return !/نسخة الأمان/.test(o.title || ''); };
      const file = new File([JSON.stringify(backup)], 'نسخة.json', { type: 'application/json' });
      await Actions.importBackup(file);
      await new Promise(r => setTimeout(r, 400));
      ok('تُسأل المستخدمة حين تتعذّر نسخة الأمان',
         asked.some(t => /نسخة الأمان/.test(t)), asked.join(' | '));
      ok('ورفضها يوقف الاستعادة',
         Repos.members.list(true).some(m => m.name === 'أحدث من النسخة'));

      /* وقبولها يمضي — نفس المسار، قرار صريح */
      window.TG.UI.confirm = async () => true;
      await Actions.importBackup(file);
      await new Promise(r => setTimeout(r, 500));
      ok('وقبولها الصريح يُتمّ الاستعادة',
         !Repos.members.list(true).some(m => m.name === 'أحدث من النسخة'));
      window.TG.UI.confirm = realConfirm;
      return out;
    });
    rows.push({ name: 'لا خطأ تشغيل', pass: errors.length === 0, detail: errors.slice(0, 2).join(' | ') });
    await ctx.close(); srv.close();
    record('جسر سطح المكتب — نقطة الرجوع حين تتعذّر', rows, []);
  });

  /* ===================================================================== *
   * 7) المتصفح لم يتغيّر                                                   *
   * ===================================================================== */
  group('جسر سطح المكتب — المتصفح كما كان', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/`;
    /* بلا جسر: هذا هو وقت تشغيل المتصفح بالضبط */
    const ctx = await browser.newContext();
    /* النوافذ المنبثقة ممنوعة: فيُختبر وعاء المتصفح البديل (الإطار) لا
       النافذة — وهو ما يقع فعلاً في متصفّح يمنعها. */
    await ctx.addInitScript(() => { window.open = function () { return null; }; });
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);
    const rows = await page.evaluate(async () => {
      const out = [];
      const ok = (n, p, d) => out.push({ name: n, pass: !!p, detail: d == null ? '' : String(d) });
      const { Desktop, Exporter, Repos, Svc, D, Print, UI, Backup, Settings } = window.TG;
      ok('لا جسر سطح مكتب في المتصفح', Desktop.on() === false);
      ok('ولا نسخة تلقائية تُطلب فيه', Backup.autoDue() === false);

      let downloaded = null;
      const realCreate = URL.createObjectURL;
      URL.createObjectURL = (b) => { downloaded = b; return realCreate.call(URL, b); };
      await Svc.members.create({ name: 'زهراء' });
      Exporter.csv(`المشتركات-${D.today()}.csv`, [{ h: 'الاسم', key: 'name' }], Repos.members.list());
      await new Promise(r => setTimeout(r, 150));
      ok('التصدير ما زال تنزيلاً كما كان', !!downloaded && downloaded.size > 0, downloaded && downloaded.size);
      URL.createObjectURL = realCreate;

      /* الطباعة: نافذة/إطار كما كان، لا مستند علويّ */
      const m = Repos.members.list()[0];
      const before = document.querySelectorAll('iframe').length;
      Print.open('ك', Print.statementHtml(m.id), {});
      const frames = document.querySelectorAll('iframe');
      const fr = frames[frames.length - 1];
      if (fr && fr.contentWindow) fr.contentWindow.print = () => {};
      await new Promise(r => setTimeout(r, 600));
      ok('الطباعة في المتصفح تبقى في وعائها المستقلّ', frames.length === before + 1);
      ok('ولا يُحقن مستند في صفحة التطبيق', !document.getElementById('tgPrintRoot'));
      if (fr) fr.remove();

      /* الاستعادة في المتصفح بلا نسخة أمان ولا سؤال */
      const b = Backup.build(false);
      const asked = [];
      const realConfirm = UI.confirm;
      UI.confirm = async (o) => { asked.push(o.title || ''); return true; };
      await window.TG.Actions.importBackup(new File([JSON.stringify(b)], 'n.json', { type: 'application/json' }));
      await new Promise(r => setTimeout(r, 400));
      UI.confirm = realConfirm;
      ok('لا يُسأل المتصفح عن نسخة أمان لا يستطيعها',
         !asked.some(t => /نسخة الأمان/.test(t)), asked.join(' | '));
      return out;
    });
    rows.push({ name: 'لا خطأ تشغيل في المتصفح', pass: errors.length === 0, detail: errors.slice(0, 3).join(' | ') });
    await ctx.close(); srv.close();
    record('جسر سطح المكتب — المتصفح كما كان', rows, []);
  });
};

module.exports.installBridge = installBridge;
