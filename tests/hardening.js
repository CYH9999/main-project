/* ============================================================================
   تبارك جيم 7.10 — اختبارات التصليب: سلامة البيانات، وعقد الهوية الواحد.

   كل مجموعة هنا تعمل على **بيانات ممثّلة** لا على قاعدة فارغة: مشتركات
   واشتراكات ودفعات وإيرادات ومصروفات ومستحقات، ورأس مال وشركاء وتوزيعات
   وفترة مقفلة، ومورّد ومستند شراء مُرحَّل بدفعته، ومخزون ومبيعات، وحضور،
   وموظفة بصورة، وشعار ولافتة متحرّكان بقصّهما، وحسابات دخول ملبَّدة.

   والمقارنة **بالمحتوى** لا بالعدد: بصمة نصّية لكل جدول (السجلات مرتّبة
   بمفتاحها)، ومجاميع المال، وسلامة الروابط بين الجداول.

   ما لا يُثبَت هنا (ويُقال في التقرير): أن طرف الصدأ يكتب فعلاً إلى قرص
   ويندوز ويثبّت. ذلك في `cargo test` (`paths::write_atomic`) وفي ويندوز.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { tauriAsset } = require('./tauri-runtime.js');
const { installBridge } = require('./desktop-io.js');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'app', 'index.html');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const FADEIN_B64 = fs.readFileSync(path.join(__dirname, 'fixtures-fadein.gif')).toString('base64');
const ANIM_B64 = fs.readFileSync(path.join(__dirname, 'fixtures-anim.gif')).toString('base64');

module.exports = function register({ group, record, TESTS_JS }) {
  function serveDesktop() {
    const csp = JSON.parse(fs.readFileSync(CONF, 'utf8')).app.security.csp;
    return new Promise(res => {
      const srv = http.createServer((req, r) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        const file = u === '/' ? DIST : path.join(ROOT, u.replace(/^\//, ''));
        if (!fs.existsSync(file)) { r.writeHead(404); return r.end('nf'); }
        /* الصفحة وسياستها كما يقدّمهما Tauri فعلاً (tests/tauri-runtime.js) */
        const served = file === DIST ? tauriAsset(fs.readFileSync(file, 'utf8'), JSON.parse(fs.readFileSync(CONF, 'utf8')))
                                     : { body:fs.readFileSync(file), csp };
        r.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8',
                           'Content-Security-Policy': served.csp || csp });
        r.end(served.body);
      });
      srv.listen(0, '127.0.0.1', () => res(srv));
    });
  }
  async function boot(page) {
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);
    await page.evaluate(TESTS_JS);
    await page.evaluate(`(${PAGE_HELPERS.toString()})()`);
  }
  async function openBridged(browser, url, opts = {}) {
    const ctx = opts.ctx || await browser.newContext(opts.context || { viewport: { width: 1440, height: 900 } });
    if (!opts.ctx) {
      await ctx.addInitScript(() => { window.open = function () { return null; }; });
      await ctx.addInitScript(installBridge, { fail: opts.fail || {}, version: VER });
    }
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|404|^\[TG\]/.test(m.text())) errors.push(m.text()); });
    await page.goto(url, { waitUntil: 'domcontentloaded' });
    if (!opts.noBoot) await boot(page);
    return { ctx, page, errors };
  }

  /* ===================================================================== *
   * 1) النسخ والاستعادة — دورة كاملة على نادٍ ممثّل                        *
   * ===================================================================== */
  group('سلامة البيانات — نسخة واستعادة على نادٍ ممثّل', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url);
      errs = a.errors;
      const page = a.page;
      const r1 = await page.evaluate(async ([gifB64]) => {
        const H = window.TGH, TG = window.TG;
        const out = {};
        await H.representative(gifB64);
        out.coverage = H.coverage();
        out.fp0 = H.fingerprint();
        out.money0 = H.money();
        out.links0 = H.brokenLinks();

        /* --- نسخة يدوية من الطريق الحقيقي: زرّ ⟵ كتابة ⟵ قراءة ⟵ تحقّق --- */
        const FS = window.__TG_FS__;
        const toasts = H.captureToasts();
        await TG.Actions.exportBackup(true);
        const man = FS.files.filter(f => f.category === 'backup').slice(-1)[0];
        out.manualName = man && man.name;
        const parsed = man ? JSON.parse(man.text) : null;
        out.manualHasDigest = !!(parsed && parsed.integrity && /^[0-9a-f]{64}$/.test(parsed.integrity.hex));
        out.manualReadBack = FS.calls.some(c => c.cmd === 'tg_read_backup' && c.args.name === man.name);
        out.manualToast = toasts.list.some(t => /تحقّقنا من سلامتها/.test(t.msg));
        out.verify = await TG.Backup.verify(parsed);

        /* --- تغيير بعد النسخة: مال يُضاف ويُحذف، ومشتركة تُضاف --- */
        const m = (await TG.Svc.members.create({ name: 'أُضيفت بعد النسخة', phone: '07711112222' })).rec;
        out.addedExists = !!TG.Repos.members.get(m.id);
        const pay = TG.Repos.payments.list()[0];
        await TG.DB.remove('payments', pay.id);
        await TG.Repos.expenses.create({ date: TG.D.today(), amount: 777777, categoryId: null, notes: 'بعد النسخة', method: 'cash' });
        out.changed = JSON.stringify(H.fingerprint()) !== JSON.stringify(out.fp0);

        /* --- الاستعادة من القرص من الطريق الحقيقي — ببوّابتها (7.11) --- */
        const realConfirm = TG.UI.confirm;
        TG.UI.confirm = async () => true;
        await window.TGTests.throughGate(() => TG.Actions.restoreFromDisk('manual', man.name));
        await new Promise(r => setTimeout(r, 400));
        TG.UI.confirm = realConfirm;
        toasts.stop();
        out.safety = FS.files.filter(f => /^قبل-الاستعادة-/.test(f.name)).map(f => ({ n: f.name, has: /أُضيفت بعد النسخة/.test(f.text) }));
        out.fp1 = H.fingerprint();
        out.money1 = H.money();
        out.links1 = H.brokenLinks();
        out.diff = H.diff(out.fp0, out.fp1);
        out.memberGone = !TG.Repos.members.get(m.id);
        out.payBack = !!TG.Repos.payments.get(pay.id);
        return out;
      }, [ANIM_B64]);

      const cov = r1.coverage;
      ok('البيانات ممثّلة: كل الجداول المالية والتشغيلية فيها سجلات',
         Object.values(cov).every(n => n > 0), JSON.stringify(cov));
      ok('ولا رابط مكسور قبل النسخة', r1.links0.length === 0, r1.links0.slice(0, 3).join(' | '));
      ok('النسخة اليدوية تحمل بصمة SHA-256 لمحتواها', r1.manualHasDigest);
      ok('وتُقرأ من القرص بعد كتابتها', r1.manualReadBack);
      ok('ولا يُقال «حُفظت» إلا بعد التحقّق', r1.manualToast);
      ok('والملف المكتوب يجتاز التحقّق الكامل', r1.verify.ok && r1.verify.integrity === 'ok' && !r1.verify.warnings.length,
         JSON.stringify(r1.verify));
      ok('البيانات تغيّرت بعد النسخة (المقارنة لها معنى)', r1.changed);
      ok('نسخة الأمان قبل الاستعادة تحمل ما أُضيف بعد النسخة',
         r1.safety.length === 1 && r1.safety[0].has, JSON.stringify(r1.safety));
      ok('الاستعادة تُرجع **محتوى** كل جدول كما كان — سجلاً بسجل',
         r1.diff.length === 0, r1.diff.join('، '));
      ok('المال بعد الاستعادة = المال قبلها، رقماً برقم',
         JSON.stringify(r1.money1) === JSON.stringify(r1.money0), `${JSON.stringify(r1.money0)} ⟵ ${JSON.stringify(r1.money1)}`);
      ok('ولا رابط مكسور بعد الاستعادة', r1.links1.length === 0, r1.links1.slice(0, 3).join(' | '));
      ok('المُضاف بعد النسخة زال، والمحذوف بعدها عاد', r1.addedExists && r1.memberGone && r1.payBack,
         `added=${r1.addedExists} gone=${r1.memberGone} back=${r1.payBack}`);

      /* --- إعادة التشغيل: ما استُعيد هو ما على القرص --- */
      await page.reload({ waitUntil: 'domcontentloaded' });
      await boot(page);
      const r2 = await page.evaluate(([fp1]) => {
        const H = window.TGH;
        return { diff: H.diff(fp1, H.fingerprint()), crop: JSON.stringify(window.TG.Brand.cropOf('logo')),
                 anim: window.TG.Brand.isAnimated('logo') && window.TG.Brand.isAnimated('banner'),
                 staffPhoto: window.TG.Repos.staff.list(true).some(s => s.photoMediaId && window.TG.Repos.media.get(s.photoMediaId)) };
      }, [r1.fp1]);
      ok('بعد إعادة التشغيل: القرص يطابق ما استُعيد جدولاً بجدول', r2.diff.length === 0, r2.diff.join('، '));
      ok('والشعار واللافتة متحرّكان بقصّهما بعد إعادة التشغيل', r2.anim && r2.crop !== 'null', r2.crop);
      ok('وصورة الموظفة موجودة', r2.staffPhoto);
      await a.ctx.close();
    } finally { srv.close(); }
    record('سلامة البيانات — نسخة واستعادة على نادٍ ممثّل', rows, errs);
  });

  /* ===================================================================== *
   * 2) نسخة تالفة، واستعادة مقطوعة — لا شيء يتغيّر                        *
   * ===================================================================== */
  group('سلامة البيانات — التلف والانقطاع لا يمسّان البيانات', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url);
      errs = a.errors;
      const page = a.page;
      const r = await page.evaluate(async ([gifB64]) => {
        const H = window.TGH, TG = window.TG;
        const out = {};
        await H.representative(gifB64);
        const { text } = await TG.Backup.serialize(true);
        const good = JSON.parse(text);
        /* ما سيُستعاد لاحقاً: نسخة مختلفة عن الحالية (مشتركة إضافية) */
        await TG.Svc.members.create({ name: 'في الحاضر فقط' });
        out.fpNow = H.fingerprint();

        /* 1) بايتٌ واحد تغيّر داخل البيانات — JSON ما زال صالحاً */
        const tampered = JSON.parse(text);
        const p0 = tampered.data.payments[0];
        p0.amount = Number(p0.amount) + 1000;
        const vt = await TG.Backup.verify(tampered);
        out.tamperRejected = !vt.ok && vt.integrity === 'mismatch';
        let err1 = null;
        try { await TG.Backup.restore(tampered); } catch (e) { err1 = e.code; }
        out.tamperCode = err1;
        out.afterTamper = H.diff(out.fpNow, H.fingerprint());

        /* 2) ملف مقطوع — لا يُحلَّل أصلاً، والشاشة تقول ذلك */
        const toasts = H.captureToasts();
        const cut = text.slice(0, Math.floor(text.length * 0.6));
        await TG.Actions.importBackup(new File([cut], 'مقطوعة.json', { type: 'application/json' }));
        toasts.stop();
        out.truncToast = toasts.list.some(t => /ليس JSON صالحاً/.test(t.msg));
        out.afterTrunc = H.diff(out.fpNow, H.fingerprint());

        /* 3) ليست نسخة من النظام / أحدث من البرنامج / جدول تالف */
        const bad = [
          Object.assign({}, good, { format: 'something-else' }),
          Object.assign({}, good, { schema: 999 }),
          Object.assign({}, good, { data: Object.assign({}, good.data, { payments: 'x' }) }),
          Object.assign({}, good, { data: Object.assign({}, good.data, { hacked: [] }) }),
        ];
        out.badRejected = [];
        for (const b of bad) { delete b.integrity; out.badRejected.push(!(await TG.Backup.verify(b)).ok); }

        /* 4) معرّف مكرَّر: لا يسقط بصمت */
        const dup = JSON.parse(text); delete dup.integrity;
        dup.data.members.push(Object.assign({}, dup.data.members[0], { name: 'نسخة مكرّرة' }));
        const planned = TG.Backup.prepare(dup);
        out.dupCounted = planned.duplicates.members === 1;

        /* 5) انقطاعٌ في أسوأ لحظة: كل الكتابات مصفوفة ولم تُثبَّت بعد.
              هذا ما يحدث لمعاملة IndexedDB حين يُقتل التطبيق أو تنقطع
              الكهرباء: لا تُثبَّت، ويبقى القرص كما كان. */
        let err5 = null;
        try { await TG.Backup.restore(good, { onQueued: tx => tx.abort() }); } catch (e) { err5 = e.code; }
        out.abortCode = err5;
        out.afterAbort = H.diff(out.fpNow, H.fingerprint());
        out.money = H.money();
        return out;
      }, [ANIM_B64]);
      ok('نسخةٌ تغيّر فيها مبلغٌ واحد تُكشف ببصمتها', r.tamperRejected);
      ok('ولا تُستعاد', r.tamperCode === 'BACKUP_INVALID', r.tamperCode);
      ok('ولم يتغيّر شيء من البيانات', r.afterTamper.length === 0, r.afterTamper.join('، '));
      ok('ملفٌ مقطوع يُرفض برسالة مفهومة', r.truncToast);
      ok('ولم يتغيّر شيء', r.afterTrunc.length === 0, r.afterTrunc.join('، '));
      ok('ملف من نظام آخر / مخطط أحدث / جدول تالف / جدول غريب — كلّها تُرفض قبل أي مسّ',
         r.badRejected.every(Boolean), JSON.stringify(r.badRejected));
      ok('المعرّف المكرَّر يُعدّ ولا يسقط صامتاً', r.dupCounted);
      ok('استعادة انقطعت قبل التثبيت: تفشل صراحةً', r.abortCode === 'RESTORE_FAILED', r.abortCode);
      ok('والذاكرة لم تتغيّر', r.afterAbort.length === 0, r.afterAbort.join('، '));

      /* القرص نفسه: يُعاد التشغيل ويُقرأ من IndexedDB */
      await page.reload({ waitUntil: 'domcontentloaded' });
      await boot(page);
      const r2 = await page.evaluate(([fp, money]) => ({
        diff: window.TGH.diff(fp, window.TGH.fingerprint()),
        money: JSON.stringify(window.TGH.money()) === JSON.stringify(money),
      }), [r.fpNow, r.money]);
      ok('وبعد إعادة التشغيل: القرص كما كان قبل الاستعادة المقطوعة — لا جداول نصف فارغة',
         r2.diff.length === 0, r2.diff.join('، '));
      ok('والمال كما كان', r2.money);

      /* الكتابة تطلب التثبيت على القرص */
      const dur = await page.evaluate(async () => {
        const seen = [];
        const real = IDBDatabase.prototype.transaction;
        IDBDatabase.prototype.transaction = function (s, m, o) { if (m === 'readwrite') seen.push(o && o.durability); return real.apply(this, arguments); };
        await window.TG.Svc.members.create({ name: 'اختبار التثبيت' });
        IDBDatabase.prototype.transaction = real;
        return seen;
      });
      ok('كل كتابة تُطلب بتثبيت صارم على القرص (durability: strict)',
         dur.length > 0 && dur.every(d => d === 'strict'), JSON.stringify(dur));
      await a.ctx.close();
    } finally { srv.close(); }
    record('سلامة البيانات — التلف والانقطاع لا يمسّان البيانات', rows, errs);
  });

  /* ===================================================================== *
   * 3) النسخ التلقائي: لا تقليم ولا ختم قبل التحقّق                       *
   * ===================================================================== */
  group('سلامة البيانات — النسخ التلقائي يتحقّق قبل أن يقلّم', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url);
      errs = a.errors;
      const r = await a.page.evaluate(async () => {
        const TG = window.TG, FS = window.__TG_FS__, B = TG.Backup;
        const out = {};
        await TG.Seed.loadDemo(10);
        /* نسخ سابقة: 14 تلقائية سليمة ونسخة يدوية */
        const snap = (await B.serialize(false)).text;
        for (let i = 0; i < 14; i++)
          FS.files.push({ folder: 'Backups\\automatic', name: `نسخة-تلقائية-قديمة-${i}.json`, category: 'backup-auto',
                          text: snap, b64: null, bytes: snap.length, modified: 1000 + i });
        FS.files.push({ folder: 'Backups\\manual', name: 'يدوية.json', category: 'backup', text: snap, b64: null,
                        bytes: snap.length, modified: 500 });
        const autos = () => FS.files.filter(f => f.category === 'backup-auto').map(f => f.name);
        const before = autos();

        /* 1) القراءة من القرص تعيد ملفاً تالفاً: لا ختم، لا تقليم، لا حذف */
        await TG.Settings.set({ autoBackup: {} });
        const realInvoke = window.__TAURI_INTERNALS__.invoke;
        window.__TAURI_INTERNALS__.invoke = (cmd, args) => cmd === 'tg_read_backup' && /تلقائية-\d{4}/.test(args.name)
          ? Promise.resolve('{"format":"tabarak-gym-backup","data":{"members":[') : realInvoke(cmd, args);
        const n0 = FS.calls.length;
        out.r1 = await B.runAuto();
        window.__TAURI_INTERNALS__.invoke = realInvoke;
        out.stamped1 = (TG.Settings.get('autoBackup') || {}).lastDay === TG.D.today();
        out.pruned1 = FS.calls.slice(n0).some(c => c.cmd === 'tg_prune_backups');
        out.oldKept1 = before.every(n => autos().includes(n));
        out.stillDue1 = B.autoDue();
        out.failAudit = TG.Repos.audit.list(true).some(e => e.action === 'backup-failed');

        /* 2) الكتابة نفسها تفشل (القرص ممتلئ): كذلك */
        FS.fail.save = 'القرص ممتلئ';
        const n1 = FS.calls.length;
        out.r2 = await B.runAuto();
        delete FS.fail.save;
        out.stamped2 = (TG.Settings.get('autoBackup') || {}).lastDay === TG.D.today();
        out.pruned2 = FS.calls.slice(n1).some(c => c.cmd === 'tg_prune_backups');
        out.oldKept2 = before.every(n => autos().includes(n));

        /* 3) الطريق السليم: تُكتب وتُقرأ وتُتحقَّق ثم يُختم اليوم ويُقلَّم */
        const n2 = FS.calls.length;
        const ok3 = await B.runAuto();
        const calls = FS.calls.slice(n2).map(c => c.cmd);
        out.order = calls.filter(c => /tg_save|tg_read_backup|tg_prune_backups/.test(c));
        out.verified = !!(ok3 && ok3.verified && ok3.integrity === 'ok');
        out.stamped3 = (TG.Settings.get('autoBackup') || {}).lastDay === TG.D.today();
        out.count3 = autos().length;
        out.newestKept = autos().includes(ok3 && ok3.name);
        out.manualKept = FS.files.some(f => f.name === 'يدوية.json');
        /* 4) مرة واحدة في اليوم */
        const n3 = FS.files.length;
        out.r4 = await B.runAuto();
        out.noDuplicate = FS.files.length === n3 && out.r4 === null;
        /* 5) لا نسخة تلقائية من غير قاعدة البيانات الحقيقية */
        const realKind = TG.DB.adapter.kind;
        await TG.Settings.set({ autoBackup: {} });
        TG.DB.adapter.kind = 'localstorage';
        out.dueOnFallback = B.autoDue();
        TG.DB.adapter.kind = realKind;
        return out;
      });
      ok('نسخةٌ لا تُقرأ سليمة من القرص: لا تُعدّ نسخة اليوم', r.r1 === null && !r.stamped1);
      ok('ولا يُقلَّم لأجلها شيء', !r.pruned1);
      ok('ولا تُحذف النسخ السليمة الأقدم', r.oldKept1);
      ok('وتبقى مستحقّة فتُعاد المحاولة', r.stillDue1);
      ok('ويُسجَّل الفشل في سجل الأحداث', r.failAudit);
      ok('كتابةٌ فشلت: لا ختم ولا تقليم ولا حذف', r.r2 === null && !r.stamped2 && !r.pruned2 && r.oldKept2);
      ok('الطريق السليم بترتيبه: كتابة ⟵ قراءة ⟵ تقليم',
         JSON.stringify(r.order) === JSON.stringify(['tg_save', 'tg_read_backup', 'tg_prune_backups']), r.order.join(' ⟵ '));
      ok('والنسخة مُتحقَّق منها ببصمتها', r.verified);
      ok('ويُختم اليوم بعد التحقّق', r.stamped3);
      ok('والتقليم يُبقي أربع عشرة وفيها الأحدث', r.count3 === 14 && r.newestKept, r.count3);
      ok('والنسخ اليدوية لا يمسّها التقليم', r.manualKept);
      ok('ولا نسخة ثانية في اليوم نفسه', r.noDuplicate);
      ok('ولا نسخة تلقائية من تخزين احتياطي (قاعدة ليست الحقيقية)', r.dueOnFallback === false);
      await a.ctx.close();
    } finally { srv.close(); }
    record('سلامة البيانات — النسخ التلقائي يتحقّق قبل أن يقلّم', rows, errs);
  });

  /* ===================================================================== *
   * 4) الإقلاع: لا قاعدة فارغة مكان قاعدة تعذّر فتحها، ولا نسختين          *
   * ===================================================================== */
  group('سلامة البيانات — الإقلاع لا يفتح قاعدة فارغة ولا نافذتين', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    try {
      /* --- 1) IndexedDB يتعذّر فتحها، والتخزين المحلي سليم --- */
      const ctx = await browser.newContext();
      await ctx.addInitScript(installBridge, { fail: {}, version: VER });
      await ctx.addInitScript(() => {
        try { Object.defineProperty(window, 'indexedDB', { get() { throw new Error('قاعدة تالفة'); } }); } catch (e) {}
      });
      const p = await ctx.newPage();
      await p.goto(url, { waitUntil: 'domcontentloaded' });
      await p.waitForFunction(() => window.__TG_FS__ && window.__TG_FS__.calls.some(c => c.cmd === 'tg_ready'), null, { timeout: 60000 });
      await p.waitForTimeout(300);
      const s1 = await p.evaluate(async () => {
        let rejected = false; try { await window.TG.ready; } catch (e) { rejected = e.code; }
        const ls = Object.keys(localStorage).filter(k => /^tabarak_gym:/.test(k));
        return { rejected, loaded: window.TG.DB.loaded, ls, text: document.getElementById('viewRoot').textContent };
      });
      ok('سطح المكتب: تعذّر فتح القاعدة ⟵ لا إقلاع على قاعدة فارغة', s1.rejected === 'IDB_OPEN' && s1.loaded === false,
         `${s1.rejected} loaded=${s1.loaded}`);
      ok('ولا يُكتب شيءٌ في التخزين المحلي بديلاً', s1.ls.length === 0, s1.ls.join(','));
      ok('والشاشة تقول لماذا، مع طريق الرجوع', /حمايةً لبياناتك/.test(s1.text) && /إعادة المحاولة/.test(s1.text));
      await ctx.close();

      /* --- 2) نافذتان على القاعدة نفسها --- */
      const ctx2 = await browser.newContext();
      await ctx2.addInitScript(() => { window.open = function () { return null; }; });
      await ctx2.addInitScript(installBridge, { fail: {}, version: VER });
      const first = await ctx2.newPage();
      await first.goto(url, { waitUntil: 'domcontentloaded' });
      await first.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
      await first.evaluate(() => window.TG.ready);
      const second = await ctx2.newPage();
      await second.goto(url, { waitUntil: 'domcontentloaded' });
      await second.waitForFunction(() => window.__TG_FS__ && window.__TG_FS__.calls.some(c => c.cmd === 'tg_ready'), null, { timeout: 60000 });
      await second.waitForTimeout(6600);
      const s2 = await second.evaluate(async () => {
        let code = null; try { await window.TG.ready; } catch (e) { code = e.code; }
        return { code, loaded: window.TG.DB.loaded, text: document.getElementById('viewRoot').textContent };
      });
      ok('النافذة الثانية لا تفتح القاعدة', s2.code === 'SECOND_INSTANCE' && s2.loaded === false, `${s2.code} ${s2.loaded}`);
      ok('وتقول بالعربية إن النظام مفتوح في نافذة أخرى', /مفتوح في نافذة أخرى/.test(s2.text));
      const stillWorks = await first.evaluate(async () => {
        try { return !!(await window.TG.Svc.members.create({ name: 'الأولى تعمل', phone: '07712345678' })).rec.id; }
        catch (e) { return String(e.code || '') + ' ' + String(e.message || e) + ' ' + JSON.stringify(e.details || ''); } });
      ok('والنافذة الأولى تعمل كما كانت', stillWorks === true, stillWorks);
      await first.close();
      await second.reload({ waitUntil: 'domcontentloaded' });
      await second.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
      const s3 = await second.evaluate(async () => { await window.TG.ready;
        return window.TG.Repos.members.list(true).some(m => m.name === 'الأولى تعمل'); });
      ok('وحين تُغلق الأولى تفتح الثانية على البيانات نفسها', s3);
      await ctx2.close();
    } finally { srv.close(); }
    record('سلامة البيانات — الإقلاع لا يفتح قاعدة فارغة ولا نافذتين', rows, []);
  });

  /* ===================================================================== *
   * 5) الجلسة بعد الاستعادة                                               *
   * ===================================================================== */
  group('سلامة البيانات — الجلسة تُطابَق بعد الاستعادة', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url);
      errs = a.errors;
      const r = await a.page.evaluate(async () => {
        const TG = window.TG, out = {};
        await TG.Settings.set({ authEnabled: true });
        TG.Auth.restoreSession();
        await TG.Auth.setupFirstAdmin({ name: 'المالكة', username: 'owner1', password: 'Owner#12345' });
        const snap = (await TG.Backup.serialize(false)).obj;
        /* حسابٌ جديد بعد النسخة، ودخولٌ به */
        await TG.Svc.users.create({ username: 'late', name: 'متأخرة', roleKey: 'owner', password: 'Late#123456' });
        await TG.Auth.logout(); await TG.Auth.login('late', 'Late#123456');
        out.before = TG.Auth.session.actorName;
        const realConfirm = TG.UI.confirm; TG.UI.confirm = async () => true;
        /* البوّابة تطلب كلمة مرور الداخلة الآن (7.11) — ثم الاستعادة كما كانت */
        await window.TGTests.throughGate(() =>
          TG.Actions.importBackup(new File([JSON.stringify(snap)], 'n.json', { type: 'application/json' })),
          { password: 'Late#123456' });
        await new Promise(r => setTimeout(r, 300));
        TG.UI.confirm = realConfirm;
        out.after = TG.Auth.session.actorId;
        out.gate = !!document.querySelector('.gate');
        out.canMoney = TG.Auth.can('finance.money');
        /* ومن ما زالت موجودة تبقى داخلة */
        await TG.Auth.login('owner1', 'Owner#12345');
        await TG.Backup.restore(snap);
        out.stays = TG.Auth.session.actorName === 'المالكة' && TG.Auth.can('settings.users');
        return out;
      });
      ok('قبل الاستعادة: داخلةٌ بحسابٍ أُنشئ بعد النسخة', r.before === 'متأخرة');
      ok('بعدها: حسابٌ لم يعد موجوداً لا تبقى له جلسة', r.after === null);
      ok('ولا صلاحية بلا جلسة', r.canMoney === false);
      ok('وتُعرض البوّابة لا مساحة العمل', r.gate);
      ok('والحساب الموجود في النسخة تبقى جلسته وصلاحياته', r.stays);
      await a.ctx.close();
    } finally { srv.close(); }
    record('سلامة البيانات — الجلسة تُطابَق بعد الاستعادة', rows, errs);
  });

  /* ===================================================================== *
   * 6) الشعار — عقد العرض الواحد على كل سطح                               *
   * ===================================================================== */
  group('الهوية 7.10 — الشعار يملكه صندوقه على كل سطح', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url, { context: { viewport: { width: 1536, height: 864 }, deviceScaleFactor: 1.25 } });
      errs = a.errors;
      const page = a.page;
      /* الطريق الحقيقي: حقل الملف ⟵ المحرّر ⟵ «حفظ» */
      const viaUi = async (kind, spec) => {
        await page.evaluate(() => { window.TG.go('settings', { sec: 'brand' }); window.TG.renderRoute(); });
        await page.waitForTimeout(200);
        await page.evaluate(async ([kind, spec]) => {
          const file = await window.TGH.makeFile(spec);
          const input = document.getElementById(kind === 'banner' ? 'bBanner' : 'bLogo');
          const dt = new DataTransfer(); dt.items.add(file);
          input.files = dt.files; input.dispatchEvent(new Event('change', { bubbles: true }));
        }, [kind, spec]);
        await page.waitForTimeout(600);
        const apply = await page.$('#imApply');
        if (apply) { await apply.click(); await page.waitForTimeout(800); }
        return !!apply;
      };
      const surfaces = () => page.evaluate(async () => {
        const H = window.TGH, TG = window.TG, out = {};
        TG.go('settings', { sec: 'brand' }); TG.renderRoute();
        await new Promise(r => setTimeout(r, 250));
        out.settings = H.logoOn(document.querySelector('.media-drop .brand-prev'));
        out.sidebar = H.logoOn(document.querySelector('.brand .brand-logo, .brand .brand-mark'));
        out.print = H.logoOn(document.querySelector('.doc-head-brand .brand-logo, .doc-head-brand .brand-mark'));
        TG.go('desk'); TG.renderRoute(); await new Promise(r => setTimeout(r, 150));
        out.deskSidebar = H.logoOn(document.querySelector('.brand .brand-logo, .brand .brand-mark'));
        TG.Gate.login(); await new Promise(r => setTimeout(r, 120));
        out.gate = H.logoOn(document.querySelector('.gate .gate-head .brand-logo, .gate .gate-head .brand-mark'));
        TG.Gate.close(); TG.Gate.unlock(); TG.renderRoute();
        out.receipt = (() => {
          const d = document.createElement('div'); d.className = 'doc'; d.style.cssText = 'position:fixed;left:0;top:0';
          d.innerHTML = TG.Brand.logoHtml(TG.Brand.BOX.receipt, true); document.body.appendChild(d);
          const m = H.logoOn(d.firstElementChild); d.remove(); return m; })();
        out.scrollW = document.documentElement.scrollWidth - window.innerWidth;
        return out;
      });
      const want = { settings: 120, sidebar: 38, deskSidebar: 38, print: 54, gate: 64, receipt: 56 };
      const judge = (label, s) => {
        const bad = Object.keys(want).filter(k => !s[k] || s[k].slot.w !== want[k] || s[k].slot.h !== want[k]
          || !s[k].contained || !s[k].clips);
        ok(`${label}: كل سطح بمقاسه، والمرسوم داخل صندوقه، والصندوق يقصّ`, bad.length === 0,
           bad.map(k => `${k}=${JSON.stringify(s[k])}`).join(' | ') || Object.keys(want).map(k => `${k} ${s[k].slot.w}`).join(' '));
        ok(`${label}: المعاينة تترك هامشاً — الشعار لا يلامس حافّة صندوقه`,
           s.settings.paint.w <= 96 && s.settings.paint.h <= 96, JSON.stringify(s.settings.paint));
        ok(`${label}: لا تمرير أفقي بسبب الشعار`, s.scrollW <= 0, s.scrollW);
      };
      const cases = [
        ['PNG كبير 3000×3000', { type: 'png', w: 3000, h: 3000 }],
        ['PNG صغير 128×128', { type: 'png', w: 128, h: 128 }],
        ['PNG عريض 3000×600', { type: 'png', w: 3000, h: 600 }],
        ['PNG طويل 600×3000', { type: 'png', w: 600, h: 3000 }],
        ['PNG شفاف 1024', { type: 'png', w: 1024, h: 1024, alpha: true }],
        ['SVG بأبعاد 4000×900', { type: 'svg', w: 4000, h: 900 }],
        ['GIF متحرّك', { type: 'gif', b64: ANIM_B64 }],
      ];
      for (const [label, spec] of cases) {
        const opened = await viaUi('logo', spec);
        if (spec.type !== 'svg') ok(`${label}: المحرّر فُتح وحُفظ منه`, opened);
        judge(label, await surfaces());
      }
      /* إعادة التشغيل مع آخر شعار (GIF) ثم PNG كبير */
      await viaUi('logo', { type: 'png', w: 3000, h: 3000 });
      await page.reload({ waitUntil: 'domcontentloaded' }); await boot(page);
      judge('PNG كبير بعد إعادة التشغيل', await surfaces());
      /* الاستعادة */
      const restored = await page.evaluate(async () => {
        const snap = (await window.TG.Backup.serialize(true)).obj;
        await window.TG.Brand.clearMedia('logo');
        await window.TG.Backup.restore(snap);
        return window.TG.Brand.has('logo');
      });
      ok('الاستعادة تُرجع الشعار', restored);
      judge('PNG كبير بعد الاستعادة', await surfaces());
      await a.ctx.close();
    } finally { srv.close(); }
    record('الهوية 7.10 — الشعار يملكه صندوقه على كل سطح', rows, errs);
  });

  /* ===================================================================== *
   * 7) الشعار المتحرّك لا يختفي                                           *
   * ===================================================================== */
  group('الهوية 7.10 — الشعار المتحرّك لا يختفي', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      /* ويندوز بـ«تأثيرات الحركة» مطفأة = تقليل الحركة */
      const a = await openBridged(browser, url, { context: { viewport: { width: 1440, height: 900 }, reducedMotion: 'reduce' } });
      errs = a.errors;
      const r = await a.page.evaluate(async ([b64]) => {
        const TG = window.TG, H = window.TGH, out = {};
        const file = await H.makeFile({ type: 'gif', b64 });
        /* المحرّر يفتح والصورة فيه */
        const pr = TG.ImageEditor.prepareBrand(file, 'logo');
        await new Promise(r => setTimeout(r, 400));
        const stageImg = document.querySelector('#imStage img');
        out.editorVisible = !!stageImg && stageImg.naturalWidth > 0;
        document.querySelector('#imApply').click();
        const got = await pr;
        out.keptGif = got && got.file.type === 'image/gif' && !!got.crop;
        await TG.Brand.setMedia('logo', got.file, got.crop);
        const m = TG.Brand.media('logo');
        out.firstFrameBlank = await (async () => {
          const img = new Image(); img.src = m.dataUrl; await img.decode();
          return TG.Svc.media._alphaMass(img, img.naturalWidth, img.naturalHeight) < TG.Svc.media.BLANK; })();
        out.posterMass = await H.massOf(m.posterUrl);
        out.stillUsed = TG.Brand.renderUrl('logo') === m.posterUrl;
        TG.go('settings', { sec: 'brand' }); TG.renderRoute();
        await new Promise(r => setTimeout(r, 250));
        out.settingsMass = await H.massOf(document.querySelector('[data-brand-prev="logo"]').src);
        out.sidebarMass = await H.massOf(document.querySelector('.brand .brand-logo img').src);
        out.printMass = await H.massOf((TG.Brand.logoHtml(54, true).match(/src="([^"]+)"/) || [])[1]);
        /* بيانات 7.9: إطارٌ ثابت فارغ محفوظ — يُصلَح */
        const blankPoster = (() => { const c = document.createElement('canvas'); c.width = c.height = 48; return c.toDataURL('image/png'); })();
        await TG.Repos.media.update(m.id, { posterUrl: blankPoster });
        out.blankBefore = await H.massOf(TG.Brand.renderUrl('logo'));
        out.fixed = await TG.Brand.repairPosters();
        out.afterRepair = await H.massOf(TG.Brand.renderUrl('logo'));
        out.repairAudit = TG.Repos.audit.list(true).some(e => /إصلاح الإطار الثابت/.test(e.summary));
        /* الوضع «تشغيل» يُحرّكه رغم تفضيل الجهاز */
        await TG.Brand.setMotionMode('on');
        out.liveOn = TG.Brand.renderUrl('logo') === TG.Brand.media('logo').dataUrl;
        await TG.Brand.setMotionMode('auto');
        /* النسخة والاستعادة تُبقيانه متحرّكاً ومرئياً */
        const snap = (await TG.Backup.serialize(true)).obj;
        await TG.Brand.clearMedia('logo');
        await TG.Backup.restore(snap);
        out.afterRestore = TG.Brand.isAnimated('logo') && (await H.massOf(TG.Brand.renderUrl('logo'))) > 0.05;
        return out;
      }, [FADEIN_B64]);
      ok('GIF الشعار يظهر في المحرّر فور اختياره', r.editorVisible);
      ok('ويُحفظ GIF نفسه (لا PNG) ومعه قصّه', r.keptGif);
      ok('الملف المختبَر أول إطار فيه فارغ (حالة المستخدمة)', r.firstFrameBlank);
      ok('الإطار الثابت المحفوظ ممتلئ لا فارغ', r.posterMass > 0.05, r.posterMass.toFixed(3));
      ok('ومع تقليل الحركة يُرسم الإطار الثابت', r.stillUsed);
      ok('والشعار مرئيّ في الإعدادات', r.settingsMass > 0.05, r.settingsMass.toFixed(3));
      ok('ومرئيّ في الشريط الجانبي', r.sidebarMass > 0.05, r.sidebarMass.toFixed(3));
      ok('ومرئيّ في الطباعة', r.printMass > 0.05, r.printMass.toFixed(3));
      ok('إطارٌ ثابت فارغ من بيانات 7.9 يُكتشف', r.blankBefore < 0.01, r.blankBefore.toFixed(3));
      ok('ويُصلَح من الأصل', r.fixed.includes('logo') && r.afterRepair > 0.05, r.afterRepair.toFixed(3));
      ok('ويُسجَّل الإصلاح', r.repairAudit);
      ok('وضع «تشغيل» يعرض الملف المتحرّك رغم تفضيل الجهاز', r.liveOn);
      ok('والنسخة والاستعادة تُبقيانه متحرّكاً ومرئياً', r.afterRestore);
      await a.ctx.close();
    } finally { srv.close(); }
    record('الهوية 7.10 — الشعار المتحرّك لا يختفي', rows, errs);
  });

  /* ===================================================================== *
   * 8) اللافتة — تكوينٌ واحد على كل سطح                                    *
   * ===================================================================== */
  group('الهوية 7.10 — اللافتة بتكوينٍ واحد في الإعدادات والاستقبال', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      for (const vp of [{ width: 1536, height: 864 }, { width: 1024, height: 600 }, { width: 1920, height: 1080 }]) {
        const a = await openBridged(browser, url, { context: { viewport: vp } });
        errs = errs.concat(a.errors);
        const tag = `${vp.width}×${vp.height}`;
        const measureAll = () => a.page.evaluate(async () => {
          const TG = window.TG, H = window.TGH, out = {};
          TG.go('settings', { sec: 'brand' }); TG.renderRoute(); await new Promise(r => setTimeout(r, 250));
          out.settings = H.bannerOn(document.querySelector('.media-drop.wide .brand-prev'));
          TG.go('desk'); TG.renderRoute(); await new Promise(r => setTimeout(r, 200));
          out.desk = H.bannerOn(document.querySelector('.brand-banner'));
          TG.go('dashboard'); TG.renderRoute(); await new Promise(r => setTimeout(r, 200));
          out.dashboard = H.bannerOn(document.querySelector('.brand-banner'));
          return out;
        });
        const judge = (label, m, natural) => {
          const S = ['settings', 'desk', 'dashboard'];
          ok(`${tag} ${label}: كل صندوق لافتة بنسبة إطار المحرّر 4:1`,
             S.every(k => m[k] && Math.abs(m[k].slotRatio - 4) < 0.06), S.map(k => m[k] && m[k].slotRatio.toFixed(2)).join(' / '));
          ok(`${tag} ${label}: الصورة بنسبتها الحقيقية على كل سطح — لا مطّ ولا مربّع مخترَع`,
             S.every(k => Math.abs(m[k].imgRatio - natural) / natural < 0.03), S.map(k => m[k].imgRatio.toFixed(2)).join(' / '));
          const same = (f) => S.every(k => Math.abs(m[k][f] - m.settings[f]) < 0.012);
          ok(`${tag} ${label}: الاستقبال ولوحة التحكم تُظهران تكوين الإعدادات نفسه`,
             same('x') && same('y') && same('w') && same('h'),
             S.map(k => `${k}:${['x', 'y', 'w', 'h'].map(f => m[k][f].toFixed(3)).join(',')}`).join(' | '));
          ok(`${tag} ${label}: لا شيء خارج صندوقه`, S.every(k => m[k].clips));
        };
        /* GIF مربّع 1000×1000 من المحرّر (الإطار 4:1 يقصّ وسطه) */
        const setBanner = (spec) => a.page.evaluate(async (spec) => {
          const TG = window.TG;
          const file = await window.TGH.makeFile(spec);
          const pr = TG.ImageEditor.prepareBrand(file, 'banner');
          await new Promise(r => setTimeout(r, 450));
          /* تكبيرٌ وتحريك — قصٌّ غير الافتراضي */
          document.querySelector('#imIn').click(); document.querySelector('#imIn').click();
          const st = document.querySelector('#imStage');
          st.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
          await new Promise(r => setTimeout(r, 100));
          document.querySelector('#imApply').click();
          const got = await pr;
          await TG.Brand.setMedia('banner', got.file, got.crop);
          return { crop: got.crop, type: got.file.type };
        }, spec);
        const g = await setBanner({ type: 'gif-square', w: 1000, h: 1000 });
        ok(`${tag} GIF اللافتة يبقى GIF ومعه قصّه`, g.type === 'image/gif' && !!g.crop, JSON.stringify(g.crop));
        judge('GIF مربّع', await measureAll(), 1);
        await a.page.reload({ waitUntil: 'domcontentloaded' }); await boot(a.page);
        judge('GIF بعد إعادة التشغيل', await measureAll(), 1);
        await a.page.evaluate(async () => {
          const snap = (await window.TG.Backup.serialize(true)).obj;
          await window.TG.Brand.clearMedia('banner');
          await window.TG.Backup.restore(snap);
        });
        judge('GIF بعد الاستعادة', await measureAll(), 1);
        /* PNG من المحرّر: ملفٌ 4:1 فعليّ */
        await setBanner({ type: 'png', w: 2400, h: 900 });
        judge('PNG', await measureAll(), 4);
        await a.ctx.close();
      }
    } finally { srv.close(); }
    record('الهوية 7.10 — اللافتة بتكوينٍ واحد في الإعدادات والاستقبال', rows, errs);
  });

  /* ===================================================================== *
   * 9) Word — كل مستند يُطبع له Word حقيقي من المستند نفسه                *
   * ===================================================================== */
  group('Word — كل مستند يُطبع يُصدَّر .docx حقيقياً', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url, { context: { viewport: { width: 1440, height: 900 } } });
      errs = a.errors;
      const r = await a.page.evaluate(async ([gifB64]) => {
        const TG = window.TG, H = window.TGH, FS = window.__TG_FS__;
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        await H.representative(gifB64);
        await TG.Brand.setMedia('logo', await H.makeFile({ type: 'png', w: 1200, h: 1200 }));
        const k = TG.D.monthsBack(1)[0];
        if (!TG.Svc.periods.isClosed(k)) await TG.Svc.periods.close(k).catch(() => {});
        try { await TG.Svc.payroll.generate(TG.D.monthKey(TG.D.today())); } catch (e) {}
        /* ما يُمرَّر إلى المحوِّل: العنوان وHTML المستند المطبوع نفسه */
        const seen = [];
        const realFP = TG.Word.fromPrint;
        TG.Word.fromPrint = function (t, h, o) { seen.push({ t, h, o }); return realFP.apply(this, arguments); };
        const words = () => FS.files.filter(f => f.category === 'word');
        const unzip = (b64) => {
          const bin = atob(b64), u = new Uint8Array(bin.length);
          for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
          const dv = new DataView(u.buffer), out = {}; let p = 0;
          while (p + 30 <= u.length && dv.getUint32(p, true) === 0x04034b50) {
            const method = dv.getUint16(p + 8, true), size = dv.getUint32(p + 18, true);
            const nl = dv.getUint16(p + 26, true), xl = dv.getUint16(p + 28, true);
            const name = new TextDecoder().decode(u.subarray(p + 30, p + 30 + nl));
            if (method !== 0) return { error: 'compressed ' + name };
            out[name] = u.subarray(p + 30 + nl + xl, p + 30 + nl + xl + size);
            p += 30 + nl + xl + size;
          }
          return out;
        };
        const inspect = (file, want) => {
          const z = unzip(file.b64);
          if (z.error) return { error: z.error };
          const txt = n => z[n] ? new TextDecoder().decode(z[n]) : null;
          const need = ['[Content_Types].xml', '_rels/.rels', 'word/document.xml', 'word/styles.xml', 'word/settings.xml',
                        'word/header1.xml', 'word/footer1.xml', 'word/_rels/document.xml.rels', 'docProps/core.xml'];
          const missing = need.filter(n => !z[n]);
          const badXml = Object.keys(z).filter(n => /\.(xml|rels)$/.test(n)).filter(n =>
            new DOMParser().parseFromString(txt(n), 'application/xml').getElementsByTagName('parsererror').length);
          const doc = txt('word/document.xml') || '';
          const dom = new DOMParser().parseFromString(doc, 'application/xml');
          const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
          const text = [...dom.getElementsByTagNameNS(W, 't')].map(t => t.textContent).join('\n');
          /* كل خلية وكل بند في المستند المطبوع موجودٌ في الـWord */
          const host = document.createElement('div'); host.innerHTML = want.h;
          const expected = [...host.querySelectorAll('td,th,dt,dd')].flatMap(c => String(c.textContent).replace(/\s+/g, ' ').trim() ? [String(c.textContent).replace(/\s+/g, ' ').trim()] : []);
          const lost = expected.filter(e => !text.replace(/\s+/g, ' ').includes(e) && !e.split(' ').every(w => text.includes(w)));
          const sect = /<w:sectPr>[\s\S]*<\/w:sectPr>/.exec(doc);
          const png = z['word/media/logo.png'];
          return {
            name: file.name, folder: file.folder, bytes: file.b64.length,
            pk: atob(file.b64).slice(0, 2) === 'PK', missing, badXml,
            arabic: /[؀-ۿ]/.test(text), tables: (doc.match(/<w:tbl>/g) || []).length,
            bidiVisual: (doc.match(/<w:bidiVisual\/>/g) || []).length, rtlSection: !!sect && /<w:bidi\/>/.test(sect[0]),
            landscape: /w:orient="landscape"/.test(doc),
            logo: !!png && png[1] === 0x50 && png[2] === 0x4E && /r:embed="rIdLogo"/.test(txt('word/header1.xml') || ''),
            pageNumbers: /PAGE/.test(txt('word/footer1.xml') || '') && /NUMPAGES/.test(txt('word/footer1.xml') || ''),
            expected: expected.length, lost: lost.slice(0, 4),
          };
        };
        const results = {};
        const run = async (label, open, sel, wantLandscape) => {
          const n0 = words().length, s0 = seen.length;
          await open();
          await sleep(250);
          const scope = TG.UI.stack.length ? TG.UI.stack[TG.UI.stack.length - 1].el : document;
          const btn = scope.querySelector(sel) || document.querySelector(sel);
          if (!btn) { results[label] = { error: 'زرّ Word غير موجود: ' + sel }; return; }
          btn.click();
          for (let i = 0; i < 80 && words().length === n0; i++) await sleep(100);
          const f = words().slice(-1)[0];
          if (words().length === n0 || !seen[s0]) { results[label] = { error: 'لم يُحفظ ملف' }; }
          else results[label] = Object.assign(inspect(f, seen[s0]), { wantLandscape });
          while (TG.UI.stack.length) TG.UI.stack[TG.UI.stack.length - 1].close();
        };
        const go = async (route, params) => { TG.go(route, params); TG.renderRoute(); await sleep(200); };
        const m = TG.Repos.members.list().find(x => TG.Svc.payments.ofMember(x.id).length) || TG.Repos.members.list()[0];
        await TG.Svc.receipts.ensure(TG.Svc.payments.ofMember(m.id)[0].id);
        const rcp = TG.Repos.receipts.list(true).find(x => x.memberId === m.id) || TG.Repos.receipts.list(true)[0];
        const reprintsBefore = rcp ? Number(rcp.reprints) || 0 : null;
        const pur = TG.Repos.purchases.list(true).find(x => x.status === 'posted');
        const partner = TG.Repos.partners.list()[0];

        await run('قائمة المشتركات', () => go('members'), '#mWord', true);
        await run('كشف حساب مشتركة', () => go('member', { id: m.id, tab: 'money' }), '[data-a="statementWord"]', false);
        await run('وصل قبض', () => go('member', { id: m.id, tab: 'money' }), `[data-rcpword="${rcp.id}"]`, false);
        await run('الجدول الأسبوعي', () => go('trainings'), '#tWord', true);
        await run('كشف الرواتب', () => go('payroll'), '#pWord', true);
        await run('كشف الصندوق اليومي', () => go('finance', { tab: 'cash' }), '#cashDayWord', false);
        await run('سجل إقفال الصندوق', () => go('finance', { tab: 'cash' }), '#cashWord', true);
        await run('كشف المستحقات', () => go('finance', { tab: 'dues' }), '#duWord', false);
        await run('ملخّص إقفال (القائمة)', () => go('finance', { tab: 'partners' }), '[data-sum-w]', false);
        await run('ملخّص إقفال (النافذة)', () => TG.Screens.periodClose(TG.D.monthKey(TG.D.today())), '#pcWord', false);
        await run('كشف حساب شريكة', () => TG.Screens.partnerStatement(partner.id), '#psWord', false);
        await run('مستحقات الموردين', () => go('inventory', { tab: 'purchases' }), '#puPayWord', false);
        await run('مستند شراء', () => TG.Screens.purchase(pur.id), '#puWord', false);
        await run('كشف حساب مورّد', () => TG.Screens.supplierStatement(pur.supplierId), '#ssWord', false);
        await run('سجل الحضور', () => go('attendance'), '#attWord', false);
        TG.Word.fromPrint = realFP;

        /* التقرير الإداري: كتلٌ منسّقة بالقالب نفسه */
        const n0 = words().length;
        await go('reports');
        document.getElementById('rpWord').click();
        for (let i = 0; i < 80 && words().length === n0; i++) await sleep(100);
        const rep = words().slice(-1)[0];
        results['التقرير الإداري'] = words().length > n0 ? Object.assign(inspect(rep, { h: '' }), { wantLandscape: null }) : { error: 'لم يُحفظ' };

        /* ترتيب الأزرار: طباعة ⟵ Word ⟵ Excel ⟵ CSV */
        await go('members');
        const ids = [...document.querySelectorAll('#mPrint,#mWord,#mXls,#mCsv')].map(b => b.id);
        const rcpAfter = rcp ? Number(TG.Repos.receipts.get(rcp.id).reprints) || 0 : null;
        /* مركز الملفات يجد ملفات Word */
        await go('files'); await sleep(500);
        const fc = document.getElementById('viewRoot').textContent;
        const listed = words().filter(f => fc.includes(f.name)).length;
        return { results, ids, reprintsBefore, rcpAfter, listed, total: words().length, folders: [...new Set(words().map(f => f.folder))] };
      }, [ANIM_B64]);

      for (const [label, d] of Object.entries(r.results)) {
        if (d.error) { ok(`${label}: Word`, false, d.error); continue; }
        ok(`${label}: ملف .docx حقيقي (حزمة zip بأجزاء Word كاملة)`, d.pk && /\.docx$/.test(d.name) && !d.missing.length && d.bytes > 2000,
           `${d.name} ${d.missing.join(',')}`);
        ok(`${label}: كل أجزاء XML سليمة البنية`, d.badXml.length === 0, d.badXml.join(','));
        ok(`${label}: عربيّ من اليمين — قسم RTL وجداول bidiVisual`, d.arabic && d.rtlSection && (d.tables === 0 || d.bidiVisual >= d.tables),
           `tables=${d.tables} bidiVisual=${d.bidiVisual}`);
        ok(`${label}: الشعار في الترويسة وترقيم «صفحة س من ص»`, d.logo && d.pageNumbers);
        if (d.wantLandscape !== null)
          ok(`${label}: الاتجاه ${d.wantLandscape ? 'أفقي للجدول العريض' : 'عمودي'}`, d.landscape === d.wantLandscape, `landscape=${d.landscape}`);
        if (d.expected)
          ok(`${label}: كل خلية وبند في المستند المطبوع موجودٌ في Word (${d.expected})`, d.lost.length === 0, d.lost.join(' | '));
      }
      ok('ترتيب الأزرار: طباعة ⟵ Word ⟵ Excel ⟵ CSV', JSON.stringify(r.ids) === JSON.stringify(['mPrint', 'mWord', 'mXls', 'mCsv']), r.ids.join(','));
      ok('نسخة Word من الوصل لا تُعدّ إعادة طباعة', r.reprintsBefore === r.rcpAfter, `${r.reprintsBefore} ⟵ ${r.rcpAfter}`);
      ok('كل ملفات Word في «Exports\\Word» وحده', r.folders.length === 1 && r.folders[0] === 'Exports\\Word', r.folders.join(','));
      ok('ومركز الملفات يعرضها', r.listed > 0, `${r.listed}/${r.total}`);
      await a.ctx.close();
    } finally { srv.close(); }
    record('Word — كل مستند يُطبع يُصدَّر .docx حقيقياً', rows, errs);
  });

  /* ===================================================================== *
   * 10) الطباعة — الورقة هي المستند، مرتّباً                              *
   * ===================================================================== */
  group('الطباعة 7.10 — ورقة مرتّبة: ترويسة بالشعار، صفوف مضغوطة، ترقيم', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url, { context: { viewport: { width: 1440, height: 900 } } });
      errs = a.errors;
      const page = a.page;
      await page.evaluate(async ([b64]) => {
        const TG = window.TG, H = window.TGH;
        await H.representative(b64);
        await TG.Brand.setMedia('logo', await H.makeFile({ type: 'png', w: 1200, h: 1200 }));
        try { await TG.Svc.payroll.generate(TG.D.monthKey(TG.D.today())); } catch (e) {}
      }, [ANIM_B64]);
      const jobs = [
        ['قائمة المشتركات', `(TG.go('members'),TG.renderRoute(),new Promise(r=>setTimeout(r,300)).then(()=>document.getElementById('mPrint').click()))`, true],
        ['كشف الرواتب', `(TG.go('payroll'),TG.renderRoute(),new Promise(r=>setTimeout(r,300)).then(()=>document.getElementById('pPrint').click()))`, true],
        ['وصل قبض', `(async()=>{const m=TG.Repos.members.list().find(x=>TG.Svc.payments.ofMember(x.id).length);const r=await TG.Svc.receipts.ensure(TG.Svc.payments.ofMember(m.id)[0].id);return TG.Actions.printReceipt(r.id,'a4');})()`, false],
        ['التقرير الإداري', `(TG.go('reports'),TG.renderRoute(),new Promise(r=>setTimeout(r,300)).then(()=>document.getElementById('rpPrint').click()))`, false],
        ['كشف الصندوق', `TG.Print.open('كشف', TG.Print.cashDayHtml(TG.D.today()))`, false],
      ];
      for (const [label, js, landscape] of jobs) {
        await page.evaluate(js);
        await page.waitForFunction(() => ['native', 'done'].includes(window.TG.UI._printState), null, { timeout: 15000 });
        const dom = await page.evaluate(() => {
          const root = document.getElementById('tgPrintRoot');
          const shown = [...document.body.children].filter(e => getComputedStyle(e).display !== 'none').map(e => e.id || e.tagName);
          const td = root.querySelector('table.tbl td, table.doc-tbl td, table.rep-tbl td');
          const numCells = [...root.querySelectorAll('td')].filter(c => /^[\d,.\s]+\s*د\.ع$/.test(c.textContent.trim()));
          const wrapped = numCells.filter(c => getComputedStyle(c).whiteSpace !== 'nowrap').length;
          const logo = root.querySelector('.brand-logo img');
          const lb = logo && logo.closest('.brand-logo').getBoundingClientRect();
          return { shown, pad: td ? parseFloat(getComputedStyle(td).paddingTop) : null,
                   logo: !!logo, logoBox: lb ? `${Math.round(lb.width)}×${Math.round(lb.height)}` : null,
                   numCells: numCells.length, wrapped,
                   css: [...document.querySelectorAll('#tgPrintStyle')].map(x => x.textContent).join('') };
        });
        await page.emulateMedia({ media: 'print' });
        const pdf = await page.pdf({ preferCSSPageSize: true, printBackground: true });
        await page.emulateMedia({ media: 'screen' });
        await page.evaluate(() => { if (window.TG.UI._printUndo) window.TG.UI._printUndo(); });
        const raw = pdf.toString('latin1');
        const pages = (raw.match(/\/Type\s*\/Page[^s]/g) || []).length;
        const box = /\/MediaBox\s*\[\s*0\s+0\s+([\d.]+)\s+([\d.]+)\s*\]/.exec(raw);
        const land = box ? Number(box[1]) > Number(box[2]) : null;
        ok(`${label}: لا شيء في العرض غير المستند (لا هيكل ولا شيفرة)`, dom.shown.length === 1 && dom.shown[0] === 'tgPrintRoot', dom.shown.join(','));
        const want = label === 'وصل قبض' ? '56×56' : '54×54';     /* Brand.BOX.receipt / Brand.BOX.print */
        ok(`${label}: ترويسةٌ بالشعار في صندوقه ${want}`, dom.logo && dom.logoBox === want, dom.logoBox);
        if (dom.pad != null) ok(`${label}: صفوف جداول مضغوطة للورق (حشوة ≤ 6 بكسل)`, dom.pad <= 6, dom.pad);
        ok(`${label}: المبالغ لا تنكسر على سطرين`, dom.wrapped === 0, `${dom.wrapped}/${dom.numCells}`);
        ok(`${label}: ترقيم «صفحة س من ص» في هامش الورقة`, /@bottom-center/.test(dom.css) && /counter\(pages\)/.test(dom.css));
        ok(`${label}: الورقة ${landscape ? 'أفقية' : 'عمودية'} A4`, land === landscape && box && Math.round(Math.max(box[1], box[2])) === 842,
           box ? `${box[1]}×${box[2]}` : '');
        ok(`${label}: عدد صفحات معقول`, pages >= 1 && pages <= 6, pages);
      }
      await a.ctx.close();
    } finally { srv.close(); }
    record('الطباعة 7.10 — ورقة مرتّبة: ترويسة بالشعار، صفوف مضغوطة، ترقيم', rows, errs);
  });

  /* ===================================================================== *
   * 11) التنقّل المالي — طريقٌ واحد لكل وجهة                              *
   * ===================================================================== */
  group('التنقّل المالي — الشريط والتبويبات يتّفقان على كل وجهة', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url);
      errs = a.errors;
      const r = await a.page.evaluate(async () => {
        const TG = window.TG, sleep = ms => new Promise(r => setTimeout(r, ms));
        await TG.Seed.loadDemo(10);
        TG.buildNav();
        /* علامة لا تظهر إلا في محتوى التبويب نفسه */
        const MARK = { revenues:'#rTable', expenses:'#eTable', dues:'#duPrint', capital:'#cTable', partners:'#prTable', cash:'#cashDayPrint' };
        const LABEL = Object.fromEntries(TG.FIN.TABS.map(x => [x.key, x.t]));
        const OWNER = { revenues:'fin-acc', expenses:'fin-acc', dues:'fin-acc', capital:'fin-acc', partners:'fin-partners', cash:'fin-cash' };
        const SECTION = { 'fin-acc':'الحسابات', 'fin-partners':'الشركاء والأرباح', 'fin-cash':'الصندوق اليومي' };
        const state = () => {
          const shown = Object.keys(MARK).filter(k => document.querySelector(MARK[k]));
          const active = [...document.querySelectorAll('.nav-item.active')].map(b => b.dataset.nav);
          const tabBtn = document.querySelector('.fin-tabs .tab.active');
          return { hash: location.hash, shown, active, tab: tabBtn && tabBtn.dataset.tab,
                   title: document.getElementById('pageTitle').textContent, sub: document.getElementById('pageSub').textContent };
        };
        const out = [];
        for (const entry of ['fin-acc', 'fin-partners', 'fin-cash']) {
          document.querySelector(`.nav-item[data-nav="${entry}"]`).click();
          await sleep(200);
          const s0 = state();
          out.push({ how: `الشريط: ${SECTION[entry]}`, want: TG.NAV.find(n => n.id === entry).p.tab, s: s0 });
          /* من هنا، كل تبويب في أعلى الصفحة */
          for (const t of Object.keys(MARK)) {
            document.querySelector(`.fin-tabs [data-tab="${t}"]`).click();
            await sleep(200);
            out.push({ how: `${SECTION[entry]} ⟵ تبويب ${LABEL[t]}`, want: t, s: state() });
          }
        }
        /* المداخل الأخرى: لوحة التحكم، التنبيه، فتح المالية بلا تبويب، والضغط على المفتوح نفسه */
        TG.FIN.open('dues'); await sleep(200);
        out.push({ how: 'FIN.open(dues)', want: 'dues', s: state() });
        TG.FIN.open('dues'); await sleep(200);
        out.push({ how: 'الضغط على الوجهة المفتوحة نفسها', want: 'dues', s: state() });
        TG.State.f.financeTab = 'capital'; location.hash = '#/finance'; await sleep(250);
        out.push({ how: 'المالية بلا تبويب ⟵ آخر تبويب', want: 'capital', s: state() });
        location.hash = '#/finance?tab=nonsense'; await sleep(250);
        out.push({ how: 'تبويب غير معروف في الرابط', want: 'capital', s: state() });
        return { out, OWNER, SECTION, LABEL, MARK: Object.keys(MARK) };
      });
      for (const c of r.out) {
        const s = c.s, owner = r.OWNER[c.want];
        const good = s.shown.length === 1 && s.shown[0] === c.want && s.tab === c.want
          && new RegExp(`tab=${c.want}(&|$)`).test(s.hash)
          && s.active.length === 1 && s.active[0] === owner
          && s.title === r.SECTION[owner]
          && s.sub.includes(r.LABEL[c.want]) && s.sub.includes('المالية');
        ok(`${c.how}: يفتح «${r.LABEL[c.want]}» — المحتوى والتبويب والرابط والشريط والعنوان متّفقة`, good,
           `shown=${s.shown} tab=${s.tab} hash=${s.hash} active=${s.active} title=${s.title} sub=${s.sub}`);
      }
      await a.ctx.close();
    } finally { srv.close(); }
    record('التنقّل المالي — الشريط والتبويبات يتّفقان على كل وجهة', rows, errs);
  });

  /* ===================================================================== *
   * 12) الجاهزية للأدوار — جدولٌ واحد، ولا تغيير في السلوك                *
   * ===================================================================== */
  group('الجاهزية للأدوار — كل كتابة لها مفتاح، ولا شيء يُمنع بعد', async (browser) => {
    const srv = await serveDesktop();
    const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
    const rows = [];
    const ok = (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    let errs = [];
    try {
      const a = await openBridged(browser, url);
      errs = a.errors;
      const r = await a.page.evaluate(async () => {
        const TG = window.TG, out = {};
        const { Svc, Policy, PERM_KEYS, Auth, Settings } = TG;
        /* كل دالّة خدمة تكتب — تُكتشف من مصدرها لا من قائمة يكتبها الاختبار */
        const WRITES = /Repos\.\w+\.(create|update|archive|hardDelete)|DB\.(put|putMany|remove|replaceAll)|Settings\.set|Svc\.\w+\.\w+\(/;
        const writers = [];
        Object.keys(Svc).forEach(mod => Object.keys(Svc[mod]).forEach(fn => {
          const f = Svc[mod][fn];
          if (typeof f !== 'function') return;
          const src = String(f.__policy ? '' : f);
          const real = f.__policy ? true : (/^async\b/.test(src) && WRITES.test(src));
          if (real) writers.push(`${mod}.${fn}`);
        }));
        out.writers = writers.length;
        out.unmapped = writers.filter(k => !(k in Policy.MAP));
        out.badKeys = Object.keys(Policy.MAP).filter(k => {
          const v = Policy.MAP[k]; if (v === null) return false;
          const keys = typeof v === 'function' ? [v([null]), v([{ refType: 'sale' }]), v(['x'])] : [v];
          return keys.some(x => !PERM_KEYS.includes(x));
        });
        out.unwrapped = Object.keys(Policy.MAP).filter(k => { const [m, f] = k.split('.');
          return Policy.MAP[k] !== null && !(Svc[m] && Svc[m][f] && Svc[m][f].__policy === k); });
        out.mode = Policy.MODE;
        /* بلا دخول مفعّل: كل شيء مسموح، ولا شيء «كان سيُمنع» */
        await TG.Seed.loadDemo(6);
        out.denyWhenOff = Policy.report().length;
        /* بدخول مفعّل ودور الاستقبال */
        await Settings.set({ authEnabled: true }); Auth.restoreSession();
        await Auth.setupFirstAdmin({ name: 'المالكة', username: 'own', password: 'Own#123456' });
        await Svc.users.create({ username: 'rec', name: 'زهراء الاستقبال', roleKey: 'reception', password: 'Rec#123456' });
        await Auth.logout(); await Auth.login('rec', 'Rec#123456');
        const before = TG.Repos.expenses.list(true).length;
        let threw = null;
        try { await Svc.finance.addExpense({ date: TG.D.today(), amount: 5000, categoryId: TG.Repos.expCats.list()[0].id, description: 'اختبار', method: 'cash' }); }
        catch (e) { threw = e.code; }
        out.unguardedStillWorks = threw === null && TG.Repos.expenses.list(true).length === before + 1;
        out.threw = threw;
        const rep = Policy.report().find(x => x.action === 'finance.addExpense');
        out.recorded = !!rep && rep.key === 'finance.create' && rep.actors['زهراء الاستقبال'] === 1;
        /* ما كان محروساً في الخدمة يبقى محروساً كما كان */
        let guarded = null;
        try { await Svc.periods.close(TG.D.monthsBack(5)[0]); } catch (e) { guarded = e.code; }
        out.existingGuard = guarded === 'FORBIDDEN';
        /* المسموح لدورها لا يُسجَّل منعاً */
        const m = (await Svc.members.create({ name: 'مشتركة من الاستقبال', phone: '07712340000' })).rec;
        out.allowedNotRecorded = !Policy.report().some(x => x.action === 'members.create');
        /* نسبة الفعل إلى فاعلته لم تتغيّر */
        const ev = TG.Repos.audit.list(true).find(e => e.entityId === m.id);
        out.actor = ev && ev.actor;
        await Auth.logout(); await Auth.login('own', 'Own#123456');
        out.ownerDenies = Policy.report().filter(x => x.actors['المالكة']).length;
        return out;
      });
      ok(`كل دالّة خدمة تكتب بيانات (${r.writers}) لها قرار صلاحية في جدول واحد`, r.unmapped.length === 0, r.unmapped.join('، '));
      ok('ومفاتيح الجدول كلّها من PERMISSIONS نفسها — لا مفتاح مخترَع', r.badKeys.length === 0, r.badKeys.join('، '));
      ok('ونقطة الإدراج مركّبة على كل دالّة لها مفتاح', r.unwrapped.length === 0, r.unwrapped.join('، '));
      ok('الوضع «مراقبة» لا «منع» — لا أدوار مزيّفة', r.mode === 'observe');
      ok('بلا دخول مفعّل: لا شيء يُسجَّل منعاً', r.denyWhenOff === 0, r.denyWhenOff);
      ok('فعلٌ غير محروس اليوم يبقى يعمل لدور الاستقبال (السلوك لم يتغيّر)', r.unguardedStillWorks, r.threw);
      ok('لكنه يُسجَّل: «كان سيُمنع بمفتاح finance.create» ومن فاعلته', r.recorded);
      ok('وما كان محروساً في الخدمة يبقى محروساً', r.existingGuard);
      ok('والمسموح لدورها لا يُسجَّل منعاً', r.allowedNotRecorded);
      ok('ونسبة الفعل إلى فاعلته كما كانت', r.actor === 'زهراء الاستقبال', r.actor);
      ok('والمالكة لا يُسجَّل عليها منعٌ', r.ownerDenies === 0, r.ownerDenies);
      await a.ctx.close();
    } finally { srv.close(); }
    record('الجاهزية للأدوار — كل كتابة لها مفتاح، ولا شيء يُمنع بعد', rows, errs);
  });
};

/* ---------------------------------------------------------------------------
   مساعدات تُحقن في الصفحة (window.TGH). تُكتب هنا مرة واحدة وتُستعمل في كل
   مجموعة — فلا تُكتب البصمة أو البيانات الممثّلة بطريقتين.
   ------------------------------------------------------------------------- */
function PAGE_HELPERS() {
  const TG = window.TG;
  const H = window.TGH = {};
  const b64bytes = b64 => { const bin = atob(b64); const a = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) a[i] = bin.charCodeAt(i); return a; };
  H.makeFile = async (spec) => {
    if (spec.type === 'gif') return new File([b64bytes(spec.b64)], 'anim.gif', { type: 'image/gif' });
    if (spec.type === 'svg') return new File([`<svg xmlns="http://www.w3.org/2000/svg" width="${spec.w}" height="${spec.h}"><rect width="${spec.w}" height="${spec.h}" fill="#C43E6B"/></svg>`],
      'l.svg', { type: 'image/svg+xml' });
    if (spec.type === 'gif-square') {
      /* GIF متحرّك حقيقيّ بالأبعاد المطلوبة: يُبنى من ملف الاختبار المتحرّك
         (32×32) بتكبيرٍ في ترويسة الشاشة المنطقية؟ لا — يُرسم إطاره على
         canvas ويُعاد ترميزه GIF بمرمّز صغير (إطاران، لونان). */
      return new File([H.encodeGif(spec.w, spec.h)], 'banner.gif', { type: 'image/gif' });
    }
    const c = document.createElement('canvas'); c.width = spec.w; c.height = spec.h;
    const x = c.getContext('2d');
    if (!spec.alpha) { x.fillStyle = '#241826'; x.fillRect(0, 0, spec.w, spec.h); }
    x.fillStyle = spec.alpha ? 'rgba(196,62,107,.7)' : '#C43E6B';
    x.beginPath(); x.arc(spec.w / 2, spec.h / 2, Math.min(spec.w, spec.h) * .4, 0, 7); x.fill();
    const b = await new Promise(r => c.toBlob(r, 'image/png'));
    return new File([b], `l-${spec.w}x${spec.h}.png`, { type: 'image/png' });
  };
  /* مرمّز GIF صغير: لوحة لونين، إطاران، دوائر مرسومة — تكفي لقياس التشويه */
  H.encodeGif = (w, h) => {
    const bytes = [];
    const p16 = n => bytes.push(n & 255, (n >> 8) & 255);
    const str = s => { for (const ch of s) bytes.push(ch.charCodeAt(0)); };
    str('GIF89a'); p16(w); p16(h); bytes.push(0xF0, 0, 0);            /* لوحة عامّة بلونين */
    bytes.push(0x24, 0x18, 0x26, 0xC4, 0x3E, 0x6B);
    str('!'); bytes.push(0xFF, 11); str('NETSCAPE2.0'); bytes.push(3, 1, 0, 0, 0);
    const frame = (phase) => {
      bytes.push(0x21, 0xF9, 4, 0, 10, 0, 0, 0);
      bytes.push(0x2C); p16(0); p16(0); p16(w); p16(h); bytes.push(0);
      /* LZW بحجم رمز أدنى 2 وبلا ضغط فعلي: رمز مسح كل 3 بكسلات يُبقي الجدول صغيراً */
      const minCode = 2, clear = 4, end = 5;
      bytes.push(minCode);
      let bitBuf = 0, bitLen = 0; const out = [];
      const put = (code) => { bitBuf |= code << bitLen; bitLen += 3;
        while (bitLen >= 8) { out.push(bitBuf & 255); bitBuf >>= 8; bitLen -= 8; } };
      const r = Math.min(w, h) / 4;
      put(clear);
      let n = 0;
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const cx = (Math.floor(x / (2 * r)) * 2 + 1) * r, cy = (Math.floor(y / (2 * r)) * 2 + 1) * r;
        const d = Math.hypot(x - cx, y - cy);
        const on = (Math.abs(d - r * 0.8) < r * 0.08) || (phase && x < w * 0.1 && Math.abs(y - h / 2) < h * 0.05);
        put(on ? 1 : 0);
        if (++n === 2) { put(clear); n = 0; }
      }
      put(end);
      if (bitLen > 0) out.push(bitBuf & 255);
      for (let i = 0; i < out.length; i += 255) { const blk = out.slice(i, i + 255); bytes.push(blk.length, ...blk); }
      bytes.push(0);
    };
    frame(0); frame(1);
    bytes.push(0x3B);
    return new Uint8Array(bytes);
  };
  /* شفافية صورة: 0 فارغة … 1 معتمة */
  H.massOf = async (url) => {
    if (!url) return 0;
    const img = new Image(); img.src = url;
    try { await img.decode(); } catch (e) { return 0; }
    return TG.Svc.media._alphaMass(img, img.naturalWidth, img.naturalHeight);
  };
  const rect = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
  /* الشعار على سطح: الصندوق، والمرسوم فعلاً من الصورة (contain)، وهل هو داخله */
  H.logoOn = (slot) => {
    if (!slot) return null;
    const S = rect(slot), cs = getComputedStyle(slot);
    const img = slot.querySelector('img, svg');
    let paint = { w: 0, h: 0 }, contained = true;
    if (img) {
      const R = rect(img);
      if (img.tagName === 'IMG' && img.naturalWidth && !img.hasAttribute('data-brand-crop')) {
        const k = Math.min(R.w / img.naturalWidth, R.h / img.naturalHeight);
        paint = { w: Math.round(img.naturalWidth * k), h: Math.round(img.naturalHeight * k) };
        contained = R.x >= S.x - 0.5 && R.y >= S.y - 0.5 && R.x + R.w <= S.x + S.w + 0.5 && R.y + R.h <= S.y + S.h + 0.5
                 && getComputedStyle(img).objectFit === 'contain';
      } else {
        /* المقصوص: قد يتجاوز الإطار عمداً (تكبير) — الضمان أن الإطار يقصّه */
        const fr = img.closest('[data-brand-frame]');
        paint = fr ? { w: Math.round(rect(fr).w), h: Math.round(rect(fr).h) } : { w: Math.round(R.w), h: Math.round(R.h) };
        contained = !!fr && getComputedStyle(fr).overflow === 'hidden';
      }
    }
    return { slot: { w: Math.round(S.w), h: Math.round(S.h) }, paint, contained, clips: cs.overflow === 'hidden' };
  };
  /* اللافتة على سطح: نسبة الصندوق، ونسبة الصورة المرسومة، وموضعها منه نسبياً */
  H.bannerOn = (slot) => {
    if (!slot) return null;
    const S = rect(slot), img = slot.querySelector('img');
    const bl = parseFloat(getComputedStyle(slot).borderLeftWidth) || 0, bt = parseFloat(getComputedStyle(slot).borderTopWidth) || 0;
    const iw = S.w - 2 * bl, ih = S.h - 2 * bt;
    const R = rect(img);
    let pw = R.w, ph = R.h;
    if (!img.hasAttribute('data-brand-crop') && img.naturalWidth) {       /* cover */
      const k = Math.max(R.w / img.naturalWidth, R.h / img.naturalHeight);
      pw = img.naturalWidth * k; ph = img.naturalHeight * k;
      return { slotRatio: S.w / S.h, imgRatio: pw / ph, x: ((R.w - pw) / 2) / iw, y: ((R.h - ph) / 2) / ih,
               w: pw / iw, h: ph / ih, clips: getComputedStyle(slot).overflow === 'hidden' };
    }
    return { slotRatio: S.w / S.h, imgRatio: pw / ph, x: (R.x - S.x - bl) / iw, y: (R.y - S.y - bt) / ih,
             w: pw / iw, h: ph / ih, clips: getComputedStyle(slot).overflow === 'hidden' };
  };
  H.captureToasts = () => {
    const list = [], real = TG.UI.toast;
    TG.UI.toast = function (msg, kind) { list.push({ msg: String(msg), kind }); return real.apply(TG.UI, arguments); };
    return { list, stop() { TG.UI.toast = real; } };
  };
  /* نادٍ ممثّل: كل ما يمكن أن يضيع في نسخة أو استعادة */
  H.representative = async (gifB64) => {
    const { Seed, Svc, Repos, D, Brand, Settings, Auth } = TG;
    await Seed.loadDemo(18);
    const sup = await Svc.suppliers.save(null, { name: 'مورّد الاختبار', phone: '07700000009' });
    const { rec: prod } = await Svc.inventory.saveProduct(null, { name: 'مشروب بروتين', price: 3500, cost: 2000 });
    const pu = await Svc.purchases.save(null, { supplierId: sup.id, date: D.today(), invoiceNo: 'INV-77',
      lines: [{ productId: prod.id, qty: 12, unitCost: 2000 }] });
    await Svc.purchases.post(pu.rec.id);
    await Svc.purchases.addPayment({ purchaseId: pu.rec.id, date: D.today(), amount: 10000, method: 'cash' });
    if (!Repos.capital.list(true).length)
      await Repos.capital.create({ date: D.today(), amount: 500000, kind: 'in', method: 'cash', notes: 'رأس مال' });
    if (!Repos.partners.list(true).length) await Repos.partners.create({ name: 'شريكة', sharePercent: 50 });
    const partner = Repos.partners.list()[0];
    if (!Repos.distributions.list(true).length) {
      const k = D.monthsBack(3)[0];
      if (!Svc.periods.isClosed(k)) await Svc.periods.close(k);
      await Svc.distributions.create({ partnerId: partner.id, periodFrom: D.startOfMonth(k), periodTo: D.endOfMonth(k),
        amount: 1000, date: D.today(), method: 'cash' });
    }
    const staff = Repos.staff.list()[0];
    const photo = await H.makeFile({ type: 'png', w: 400, h: 400 });
    await Svc.media.replaceOn({ repo: Repos.staff, store: 'staff', id: staff.id, field: 'photoMediaId', file: photo });
    const gif = new File([b64bytes(gifB64)], 'logo.gif', { type: 'image/gif' });
    await Brand.setMedia('logo', gif, { w: 120, h: 120, x: -10, y: -10 });
    await Brand.setMedia('banner', new File([b64bytes(gifB64)], 'banner.gif', { type: 'image/gif' }), { w: 100, h: 400, x: 0, y: -150 });
    await Brand.saveDetails({ subtitle: 'نادٍ نسائي', phone: '07700000000', address: 'بغداد', instagram: 'tabarak', footer: 'شكراً' });
    await Svc.users.create({ username: 'reception1', name: 'استقبال', roleKey: 'reception', password: 'Recep#12345' }, { bootstrap: true });
    await Settings.set({ gymName: 'تبارك جيم' });
    return true;
  };
  H.coverage = () => {
    const S = ['members', 'subscriptions', 'payments', 'revenues', 'expenses', 'staff', 'attendance', 'capital', 'partners',
               'distributions', 'purchases', 'purchasePayments', 'suppliers', 'products', 'stockMoves', 'sales', 'media',
               'receipts', 'users', 'roles'];
    return Object.fromEntries(S.map(s => [s, TG.DB.count(s)]));
  };
  /* بصمة المحتوى: كل جدول سجلاته مرتّبة بمفتاحها. سجل الأحداث خارجها (الاستعادة
     نفسها حدث)، ومن الإعدادات يُستبعد ما تكتبه النسخة والاستعادة عن نفسيهما. */
  H.fingerprint = () => {
    const out = {};
    TG.STORE_NAMES.forEach(s => {
      if (s === 'audit') return;
      const k = TG.SCHEMA[s].key;
      let rows = TG.DB.all(s).slice().sort((a, b) => String(a[k]) < String(b[k]) ? -1 : String(a[k]) > String(b[k]) ? 1 : 0);
      if (s === 'meta') rows = rows.map(r => {
        if (r.k !== 'settings') return r;
        const v = Object.assign({}, r.v); delete v.lastBackupAt; delete v.autoBackup; return { k: r.k, v };
      });
      out[s] = JSON.stringify(rows);
    });
    return out;
  };
  H.diff = (a, b) => Object.keys(Object.assign({}, a, b)).filter(s => a[s] !== b[s]);
  H.money = () => {
    const U = TG.U, R = TG.Repos, sum = (list, f) => U.round2(U.sum(list, f));
    return { payments: sum(R.payments.list(true), p => p.amount), revenues: sum(R.revenues.list(true), r => r.amount),
             expenses: sum(R.expenses.list(true), e => e.amount), capital: sum(R.capital.list(true), c => c.amount),
             distributions: sum(R.distributions.list(true), d => d.amount),
             supplierPayments: sum(R.purchasePayments.list(true), p => p.amount),
             purchases: sum(R.purchases.list(true), p => p.total), sales: sum(R.sales.list(true), s => s.total),
             cash: TG.Svc.finance.summary().cash };
  };
  /* روابط لا يجوز أن تنكسر: الدفعة ⟵ مستندها، الاشتراك ⟵ مشتركته، الوصل ⟵ دفعته،
     دفعة المورّد ⟵ مستندها، التوزيع ⟵ شريكته، الوسائط المشار إليها ⟵ موجودة */
  H.brokenLinks = () => {
    const R = TG.Repos, bad = [];
    R.payments.list(true).forEach(p => { const d = p.refType === 'sale' ? R.sales.get(p.refId) : R.subs.get(p.refId);
      if (!d) bad.push(`دفعة ${p.id}`); });
    R.subs.list(true).forEach(s => { if (!R.members.get(s.memberId)) bad.push(`اشتراك ${s.id}`); });
    R.receipts.list(true).forEach(r => { if (r.paymentId && !R.payments.get(r.paymentId) && !r.voided) bad.push(`وصل ${r.id}`); });
    R.purchasePayments.list(true).forEach(p => { if (!R.purchases.get(p.purchaseId)) bad.push(`دفعة مورّد ${p.id}`); });
    R.distributions.list(true).forEach(d => { if (!R.partners.get(d.partnerId)) bad.push(`توزيع ${d.id}`); });
    R.staff.list(true).forEach(s => { if (s.photoMediaId && !R.media.get(s.photoMediaId)) bad.push(`صورة ${s.id}`); });
    ['logo', 'banner'].forEach(k => { const id = TG.Brand.get()[k + 'MediaId']; if (id && !R.media.get(id)) bad.push(`هوية ${k}`); });
    return bad;
  };
}
