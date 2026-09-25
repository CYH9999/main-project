/* ============================================================================
   تبارك جيم 7.11 — بوّابة العمليات الخطرة، والهوية تحت سياسة WebView2 الفعلية

   كل مجموعة هنا تعمل على مجلّد البناء كما يقدّمه Tauri (tests/tauri-runtime.js)
   والجسر الأصليّ المزيّف مركَّب (tests/desktop-io.js) — أي كما يُفتح التطبيق
   المثبَّت على ويندوز، إلا أن المحرّك Chromium لا WebView2.
   ========================================================================== */
const fs = require('fs');
const path = require('path');
const http = require('http');
const { tauriAsset, allowsInline } = require('./tauri-runtime.js');
const { installBridge } = require('./desktop-io.js');
const { PAGE_HELPERS } = require('./hardening.js');

const ROOT = path.join(__dirname, '..');
const DIST = path.join(ROOT, 'app', 'index.html');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const VER = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')).version;
const ANIM_B64 = fs.readFileSync(path.join(__dirname, 'fixtures-anim.gif')).toString('base64');

const OWNER_PW = 'Owner#12345', MANAGER_PW = 'Manager#12345', RECEPTION_PW = 'Recep#12345', TRAINER_PW = 'Trainer#12345';
const PIN = '482913';

module.exports = function register({ group, record, TESTS_JS }) {
  const conf = () => JSON.parse(fs.readFileSync(CONF, 'utf8'));

  /* confPatch: تعديلٌ على التهيئة لهذا الخادم وحده — لقياس ما كان يقع في 7.10 */
  function serve(confPatch) {
    return new Promise(res => {
      const srv = http.createServer((req, r) => {
        const u = decodeURIComponent(req.url.split('?')[0]);
        if (u !== '/') { r.writeHead(404); return r.end('nf'); }
        const c = conf(); if (confPatch) confPatch(c);
        const a = tauriAsset(fs.readFileSync(DIST, 'utf8'), c);
        srv.lastCsp = a.csp;
        r.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': a.csp });
        r.end(a.body);
      });
      srv.listen(0, '127.0.0.1', () => res(srv));
    });
  }
  async function open(browser, srv, opts = {}) {
    const ctx = opts.ctx || await browser.newContext(Object.assign({ viewport: { width: 1440, height: 900 } }, opts.context || {}));
    if (!opts.ctx) {
      await ctx.addInitScript(() => { window.open = function () { return null; }; });
      if (opts.bridge !== false) await ctx.addInitScript(installBridge, { fail: opts.fail || {}, version: VER });
    }
    const page = await ctx.newPage();
    const errors = [], csp = [];
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('console', m => {
      const t = m.text();
      if (/Content Security Policy/i.test(t)) csp.push(t.slice(0, 160));
      if (m.type() === 'error' && !/favicon|404|^\[TG\]|Content Security Policy/i.test(t)) errors.push(t);
    });
    await page.goto(`http://127.0.0.1:${srv.address().port}/?intro=0`, { waitUntil: 'domcontentloaded' });
    await boot(page);
    return { ctx, page, errors, csp };
  }
  async function boot(page) {
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 60000 });
    await page.evaluate(() => window.TG.ready);
    await page.evaluate(TESTS_JS);
    await page.evaluate(`(${PAGE_HELPERS.toString()})()`);
    await page.evaluate(PAGE_711);
  }
  const collect = () => {
    const rows = [];
    return { rows, ok: (name, pass, detail) => rows.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) }) };
  };

  /* ===================================================================== *
   * 1) إعادة التهيئة: كل طبقة تمنع وحدها                                   *
   * ===================================================================== */
  group('بوّابة الخطر 7.11 — إعادة التهيئة بطبقاتها', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors;
      const r = await a.page.evaluate(async (P) => {
        const TG = window.TG, G = window.TG711, out = {};
        const { Security, Auth, Actions, DB, Repos } = TG;
        await G.club(P);
        out.members0 = DB.count('members');
        out.names0 = Repos.members.list(true).slice(0, 3).map(m => m.name);

        /* --- القدرة: المديرة والاستقبال والمدرّبة لا يصلن إلى البوّابة أصلاً --- */
        await Auth.login('manager1', P.MANAGER_PW);
        let code = null; const g0 = window.TGTests.autoGate({ password: P.MANAGER_PW });
        try { await Actions.wipe(); } catch (e) { code = e.code; }
        g0.stop();
        out.managerCode = code; out.managerSawGate = g0.log.length; out.afterManager = DB.count('members');
        out.forbiddenEvent = (Security.recent(3)[0] || {}).details || {};

        /* --- المالكة بلا رمز: يُطلب تعيينه أولاً --- */
        await Auth.login('owner1', P.OWNER_PW);
        out.noPin = !Security.hasPin();
        const d1 = G.drive(() => Actions.wipe());
        await G.until(() => document.querySelector('[data-pin-flow="setup"]'));
        out.pinFirst = !!document.querySelector('[data-pin-flow="setup"]');
        G.fill('#pinPw', P.OWNER_PW); G.fill('#pinNew', P.PIN); G.fill('#pinNew2', P.PIN);
        document.querySelector('[data-pin-ok]').click();
        await G.until(() => document.querySelector('[data-sec-gate="dangerous.resetData"]'));
        const gate = document.querySelector('[data-sec-gate="dangerous.resetData"]').closest('.modal');
        out.hasPass = !!gate.querySelector('#secPass'); out.hasPin = !!gate.querySelector('#secPin');
        out.hasPhrase = !!gate.querySelector('#secPhrase');
        const phrase = gate.querySelector('[data-sec-phrase]').textContent;
        out.phrase = phrase;
        out.phraseHasCode = /\d{4}$/.test(phrase);
        const okBtn = gate.querySelector('[data-sec-ok]');

        /* العبارة: الزرّ معطّل حتى تُكتب كما هي، واللصق ممنوع، وEnter لا يُنفّذ */
        G.fill('#secPass', P.OWNER_PW); G.fill('#secPin', P.PIN); G.fill('#secPhrase', phrase.replace(/\d+$/, '0000'));
        out.disabledOnWrongPhrase = okBtn.disabled;
        const pe = new Event('paste', { bubbles: true, cancelable: true });
        gate.querySelector('#secPhrase').dispatchEvent(pe);
        out.pasteBlocked = pe.defaultPrevented;
        const ke = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
        gate.querySelector('#secPhrase').dispatchEvent(ke);
        out.enterBlocked = ke.defaultPrevented;
        out.stillThere = DB.count('members') === out.members0;

        /* كلمة مرور خاطئة ⟵ رفض، ولا يُمسّ شيء */
        G.fill('#secPass', 'wrong-password'); G.fill('#secPhrase', phrase);
        okBtn.click();
        await G.until(() => !gate.querySelector('.sec-err').hidden);
        out.badPwMsg = gate.querySelector('.sec-err').textContent;
        out.afterBadPw = DB.count('members');
        /* رمز خاطئ ⟵ رفض */
        G.fill('#secPass', P.OWNER_PW); G.fill('#secPin', '999111');
        okBtn.click();
        await G.until(() => /رمز الأمان غير صحيح/.test(gate.querySelector('.sec-err').textContent));
        out.badPinMsg = gate.querySelector('.sec-err').textContent;
        out.afterBadPin = DB.count('members');
        out.denied = Security.recent(10).filter(e => e.details && e.details.result === 'denied').map(e => e.details.reason);

        /* كل شيء صحيح ⟵ نسخة أمان من القرص ثم الحذف */
        G.fill('#secPass', P.OWNER_PW); G.fill('#secPin', P.PIN); G.fill('#secPhrase', phrase);
        okBtn.click();
        await d1.done;
        out.members1 = DB.count('members');
        const FS = window.__TG_FS__;
        const safe = FS.files.filter(f => /^قبل-إعادة-التهيئة-/.test(f.name));
        out.safety = safe.map(f => ({ folder: f.folder, hasNames: out.names0.every(n => f.text.indexOf(n) !== -1) }));
        out.readBack = FS.calls.some(c => c.cmd === 'tg_read_backup' && safe[0] && c.args.name === safe[0].name);
        out.safeVerified = safe[0] ? (await TG.Backup.verify(JSON.parse(safe[0].text))).ok : false;
        out.event = (Security.recent(1)[0] || {});
        out.auditJson = JSON.stringify(Repos.audit.list(true)) + JSON.stringify(TG.Settings.get());
        return out;
      }, { MANAGER_PW, OWNER_PW, RECEPTION_PW, TRAINER_PW, PIN });

      ok('المديرة تُرفض عند حدّ الفعل (FORBIDDEN) ولا تصل إلى البوّابة', r.managerCode === 'FORBIDDEN' && r.managerSawGate === 0,
         `${r.managerCode} / ${r.managerSawGate}`);
      ok('ولا يُحذف شيء برفضها', r.afterManager === r.members0);
      ok('والرفض حدثٌ أمنيّ: القدرة والسبب', r.forbiddenEvent.capability === 'dangerous.resetData' && r.forbiddenEvent.reason === 'forbidden',
         JSON.stringify(r.forbiddenEvent));
      ok('المالكة بلا رمز أمان: يُطلب تعيينه قبل البوّابة', r.noPin && r.pinFirst);
      ok('البوّابة تطلب كلمة المرور الآن ورمز الأمان والعبارة', r.hasPass && r.hasPin && r.hasPhrase);
      ok('العبارة تولّدها البوّابة وفيها رقمٌ عشوائي', r.phraseHasCode && /^احذف كل البيانات \d{4}$/.test(r.phrase), r.phrase);
      ok('الزرّ معطّل ما دامت العبارة لا تطابق', r.disabledOnWrongPhrase);
      ok('اللصق في العبارة ممنوع', r.pasteBlocked);
      ok('وEnter لا يُنفّذ العملية', r.enterBlocked && r.stillThere);
      ok('كلمة مرور خاطئة تُرفض ولا يُحذف شيء', /كلمة المرور غير صحيحة/.test(r.badPwMsg) && r.afterBadPw === r.members0, r.badPwMsg);
      ok('رمز أمان خاطئ يُرفض ولا يُحذف شيء', /رمز الأمان غير صحيح/.test(r.badPinMsg) && r.afterBadPin === r.members0, r.badPinMsg);
      ok('وكل سقوطٍ حدثٌ أمنيّ بسببه', r.denied.includes('bad-password') && r.denied.includes('bad-pin'), r.denied.join(','));
      ok('بكل الطبقات صحيحة: حُذف كل شيء', r.members0 > 0 && r.members1 === 0, `${r.members0} ⟵ ${r.members1}`);
      ok('نسخة أمان واحدة قبل الحذف، في مجلّد اليدوية الذي لا يُقلَّم',
         r.safety.length === 1 && r.safety[0].folder === 'Backups\\manual', JSON.stringify(r.safety));
      ok('وتحمل البيانات التي حُذفت', r.safety[0] && r.safety[0].hasNames);
      ok('وقُرئت من القرص وتُحقِّق منها قبل الحذف', r.readBack && r.safeVerified);
      const d = r.event.details || {};
      ok('الحدث الأمني: الوقت والفاعلة والقدرة', !!r.event.ts && d.actor === 'المالكة' && d.capability === 'dangerous.resetData',
         `${r.event.ts} ${d.actor} ${d.capability}`);
      ok('والطبقات: الهويّة ✓ الرمز ✓ العبارة ✓', d.reauth === 'ok' && d.pin === 'ok' && d.phrase === 'ok', `${d.reauth}/${d.pin}/${d.phrase}`);
      ok('ونسخة الأمان باسمها، والنتيجة «نُفّذت»', d.backup && d.backup.ok && /^قبل-إعادة-التهيئة-/.test(d.backup.name) && d.result === 'done',
         JSON.stringify(d.backup));
      ok('ويحمل عدد المحاولات الفاشلة قبل النجاح', d.failures >= 2, d.failures);
      ok('لا كلمة مرور ولا رمز أمان في السجل ولا في الإعدادات',
         [OWNER_PW, MANAGER_PW, PIN].every(x => r.auditJson.indexOf(x) === -1));
      await a.ctx.close();
    } finally { srv.close(); }
    record('بوّابة الخطر 7.11 — إعادة التهيئة بطبقاتها', rows, errs);
  });

  /* ===================================================================== *
   * 2) التهدئة: محاولات متتالية تُبطئ ولا تُقفل إلى الأبد                   *
   * ===================================================================== */
  group('بوّابة الخطر 7.11 — التهدئة بلا إقفال دائم', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors;
      const r = await a.page.evaluate(async (P) => {
        const TG = window.TG, G = window.TG711, out = {};
        const { Security } = TG;
        await G.club(P);
        await TG.Auth.login('owner1', P.OWNER_PW);
        await Security.applyPin('setup', { password: P.OWNER_PW, pin: P.PIN, pin2: P.PIN });
        const def = Security.CAPS['dangerous.resetData'];
        const ev = () => ({ cap: 'dangerous.resetData', level: 'critical' });
        const phrase = Security.newPhrase(def);
        const tries = [];
        for (let i = 0; i < 3; i++) tries.push(await Security.verifyLayers({ def, ev: ev(), pw: 'bad' + i, pin: P.PIN, ph: phrase, phrase }));
        out.lockedAfter3 = Security.lockedFor();
        out.msg3 = tries[2].message;
        /* في فترة التهدئة: حتى الصحيح يُرفض */
        const locked = await Security.verifyLayers({ def, ev: ev(), pw: P.OWNER_PW, pin: P.PIN, ph: phrase, phrase });
        out.correctWhileLocked = locked.ok;
        out.lockedEvent = (Security.recent(1)[0].details || {}).reason;
        /* تتضاعف ولها سقف */
        out.c3 = Security.cooldownMs(3); out.c4 = Security.cooldownMs(4); out.c50 = Security.cooldownMs(50);
        out.maxMs = Security.LOCK.maxMs;
        /* انقضاء التهدئة ⟵ الصحيح يمرّ ويُصفّر العدّاد */
        await TG.Settings.set({ securityLock: Object.assign({}, Security.lockState(), { until: new Date(Date.now() - 1000).toISOString() }) });
        const later = await Security.verifyLayers({ def, ev: ev(), pw: P.OWNER_PW, pin: P.PIN, ph: phrase, phrase });
        out.afterCooldown = later.ok; out.failsReset = Security.lockState().fails;
        /* التهدئة تنجو من إعادة التحميل: على القرص لا في الذاكرة */
        for (let i = 0; i < 3; i++) await Security.verifyLayers({ def, ev: ev(), pw: 'x', pin: P.PIN, ph: phrase, phrase });
        out.persisted = !!TG.Settings.get('securityLock').until;
        return out;
      }, { MANAGER_PW, OWNER_PW, RECEPTION_PW, TRAINER_PW, PIN });
      ok('ثلاث محاولات فاشلة ⟵ تهدئة مؤقّتة', r.lockedAfter3 > 20000 && /مقفلة/.test(r.msg3), `${r.lockedAfter3}ms`);
      ok('وفي التهدئة يُرفض حتى الصحيح، ويُسجَّل السبب', r.correctWhileLocked === false && r.lockedEvent === 'locked', r.lockedEvent);
      ok('التهدئة تتضاعف (30 ثانية ⟵ 60)', r.c3 === 30000 && r.c4 === 60000, `${r.c3}/${r.c4}`);
      ok('ولها سقف 15 دقيقة — لا إقفال دائم', r.c50 === r.maxMs && r.maxMs === 15 * 60000, r.c50);
      ok('بعد انقضائها يمرّ الصحيح ويُصفَّر العدّاد', r.afterCooldown === true && r.failsReset === 0, `${r.afterCooldown}/${r.failsReset}`);
      ok('وحالتها على القرص (إعادة التحميل لا تُصفّرها)', r.persisted);
      await a.page.reload({ waitUntil: 'domcontentloaded' });
      await boot(a.page);
      const lockedAfterReload = await a.page.evaluate(() => window.TG.Security.lockedFor());
      ok('وبعد إعادة التشغيل ما زالت قائمة', lockedAfterReload > 0, lockedAfterReload);
      await a.ctx.close();
    } finally { srv.close(); }
    record('بوّابة الخطر 7.11 — التهدئة بلا إقفال دائم', rows, errs);
  });

  /* ===================================================================== *
   * 3) نسخة الأمان شرطٌ لا خيار                                            *
   * ===================================================================== */
  group('بوّابة الخطر 7.11 — نسخة الأمان تعذّرت ⟵ لا شيء يُحذف', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      const a = await open(browser, srv, { fail: { save: 'القرص ممتلئ' } });
      errs = a.errors;
      const r = await a.page.evaluate(async (P) => {
        const TG = window.TG, out = {};
        const { Security, Actions, DB, Seed } = TG;
        await Seed.loadDemo(10);
        out.m0 = DB.count('members');
        out.demo0 = TG.STORE_NAMES.reduce((n, s) => n + DB.all(s).filter(x => x.isDemo).length, 0);
        await window.TGTests.throughGate(() => Actions.wipe());
        out.m1 = DB.count('members');
        out.ev1 = (Security.recent(1)[0] || {}).details || {};
        await window.TGTests.throughGate(() => Actions.clearDemo());
        out.demo1 = TG.STORE_NAMES.reduce((n, s) => n + DB.all(s).filter(x => x.isDemo).length, 0);
        out.ev2 = (Security.recent(1)[0] || {}).details || {};
        return out;
      }, { PIN });
      ok('إعادة التهيئة لم تقع حين تعذّرت نسخة الأمان', r.m0 > 0 && r.m1 === r.m0, `${r.m0} ⟵ ${r.m1}`);
      ok('والسجل: رُفضت لأن نسخة الأمان تعذّرت، بعد اجتياز الرمز والعبارة',
         r.ev1.result === 'rejected' && r.ev1.reason === 'backup-failed' && r.ev1.pin === 'ok' && r.ev1.phrase === 'ok'
         && r.ev1.backup && r.ev1.backup.ok === false, JSON.stringify(r.ev1));
      ok('حذف البيانات التجريبية كذلك لم يقع', r.demo0 > 0 && r.demo1 === r.demo0, `${r.demo0} ⟵ ${r.demo1}`);
      ok('وسجلّه: رُفض لأن نسخة الأمان تعذّرت', r.ev2.capability === 'dangerous.clearDemo' && r.ev2.reason === 'backup-failed',
         JSON.stringify(r.ev2));
      await a.ctx.close();
    } finally { srv.close(); }
    record('بوّابة الخطر 7.11 — نسخة الأمان تعذّرت ⟵ لا شيء يُحذف', rows, errs);
  });

  /* ===================================================================== *
   * 4) الاستعادة: تحقّق قبل البوّابة، والبوّابة قبل الاستبدال               *
   * ===================================================================== */
  group('بوّابة الخطر 7.11 — الاستعادة', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors;
      const r = await a.page.evaluate(async (P) => {
        const TG = window.TG, H = window.TGH, out = {};
        const { Security, Actions, Backup, Svc, Repos } = TG;
        await H.representative(P.ANIM);
        const snap = (await Backup.serialize(true)).obj;
        const fp0 = H.fingerprint();
        const m = (await Svc.members.create({ name: 'أُضيفت بعد النسخة' })).rec;
        const file = o => new File([JSON.stringify(o)], 'n.json', { type: 'application/json' });

        /* نسخة عُبث بها: تُرفض قبل أن تُفتح البوّابة */
        const bad = JSON.parse(JSON.stringify(snap)); bad.data.payments[0].amount += 1;
        const g1 = window.TGTests.autoGate();
        await Actions.importBackup(file(bad));
        await new Promise(r => setTimeout(r, 200));
        g1.stop();
        out.badNoGate = g1.log.filter(x => /^gate:/.test(x)).length === 0;
        out.badKept = !!Repos.members.get(m.id);
        document.querySelectorAll('.overlay').forEach(o => o.remove()); TG.UI.stack.length = 0;

        /* الإلغاء عند البوّابة ⟵ لا شيء يتغيّر */
        await window.TGTests.throughGate(() => Actions.importBackup(file(snap)), { cancel: true });
        out.cancelKept = !!Repos.members.get(m.id);
        out.cancelEvent = ((Security.recent(1)[0] || {}).details || {}).result;

        /* الاستعادة كاملة */
        await window.TGTests.throughGate(() => Actions.importBackup(file(snap)));
        await new Promise(r => setTimeout(r, 300));
        out.restored = !Repos.members.get(m.id);
        out.diff = H.diff(fp0, H.fingerprint()).filter(s => s !== 'meta');
        const FS = window.__TG_FS__;
        const safe = FS.files.filter(f => /^قبل-الاستعادة-/.test(f.name));
        out.safetyHasLate = safe.length === 1 && /أُضيفت بعد النسخة/.test(safe[0].text);
        const ev = Security.recent(1)[0] || {};
        out.event = ev.details || {};
        out.eventInRestoredDb = !!Repos.audit.get(ev.id);
        return out;
      }, { PIN, ANIM: ANIM_B64 });
      ok('نسخةٌ عُبث بها تُرفض قبل أن تُفتح البوّابة', r.badNoGate && r.badKept);
      ok('الإلغاء عند البوّابة لا يغيّر شيئاً، ويُسجَّل «أُلغيت»', r.cancelKept && r.cancelEvent === 'cancelled', r.cancelEvent);
      ok('الاستعادة الكاملة تُرجع المحتوى جدولاً بجدول', r.restored && r.diff.length === 0, r.diff.join('،'));
      ok('ونسخة الأمان قبلها تحمل ما أُضيف بعد النسخة', r.safetyHasLate);
      ok('والحدث الأمني يُكتب **بعد** الاستبدال فيبقى في البيانات المستعادة',
         r.eventInRestoredDb && r.event.capability === 'dangerous.restore' && r.event.result === 'done'
         && r.event.pin === 'ok' && r.event.phrase === 'ok' && r.event.backup && r.event.backup.ok, JSON.stringify(r.event));
      await a.ctx.close();
    } finally { srv.close(); }
    record('بوّابة الخطر 7.11 — الاستعادة', rows, errs);
  });

  /* ===================================================================== *
   * 5) رمز الأمان: ملبَّد، وسياساته، وتغييره، واستعادته بطريقين             *
   * ===================================================================== */
  group('بوّابة الخطر 7.11 — رمز الأمان', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors;
      const r = await a.page.evaluate(async (P) => {
        const TG = window.TG, G = window.TG711, out = {};
        const { Security, Settings, Backup, Auth, Crypto } = TG;
        const rec0 = await G.club(P);
        await Auth.login('owner1', P.OWNER_PW);
        const bad = async (pin, pin2, pw) => (await Security.applyPin('setup', { password: pw || P.OWNER_PW, pin, pin2: pin2 === undefined ? pin : pin2 })).message || 'ok';
        out.short = await bad('12345'); out.repeated = await bad('111111'); out.seq = await bad('123456');
        out.mismatch = await bad('482913', '482914'); out.samePw = await bad(P.OWNER_PW);
        out.badPw = await bad(P.PIN, P.PIN, 'wrong');
        await Security.clearFailures();
        /* الأرقام العربية-الهندية = اللاتينية */
        out.set = (await Security.applyPin('setup', { password: P.OWNER_PW, pin: '٤٨٢٩١٣', pin2: '٤٨٢٩١٣' })).ok;
        out.verifyLatin = await Security.verifyPin(P.PIN);
        const rec = Settings.get('securityPin');
        out.hashed = /^[0-9a-f]{32}$/.test(rec.salt) && /^[0-9a-f]{64}$/.test(rec.hash) && rec.iterations >= 100000 && rec.algo === 'pbkdf2-sha256';
        const bk = JSON.stringify(Backup.build(true));
        out.noPlain = bk.indexOf(P.PIN) === -1 && JSON.stringify(Settings.get()).indexOf(P.PIN) === -1;
        out.inBackupHashed = bk.indexOf(rec.hash) !== -1;
        /* تغييره: الرمز الحالي + كلمة المرور */
        out.changeBadOld = (await Security.applyPin('change', { old: '000999', password: P.OWNER_PW, pin: '771155', pin2: '771155' })).ok;
        out.changeBadPw = (await Security.applyPin('change', { old: P.PIN, password: 'nope', pin: '771155', pin2: '771155' })).ok;
        await Security.clearFailures();
        out.change = (await Security.applyPin('change', { old: P.PIN, password: P.OWNER_PW, pin: '771155', pin2: '771155' })).ok;
        out.oldFails = !(await Security.verifyPin(P.PIN)) && await Security.verifyPin('771155');
        /* نسيتُه — برمز الاسترجاع: رمزٌ جديد، ورمز الاسترجاع يتجدّد */
        out.recBad = (await Security.applyPin('reset', { password: P.OWNER_PW, recovery: 'AAAA-BBBB-CCCC-DDDD', pin: '635241', pin2: '635241' })).ok;
        await Security.clearFailures();
        const rr = await Security.applyPin('reset', { password: P.OWNER_PW, recovery: rec0.recoveryCode, pin: '635241', pin2: '635241' });
        out.recOk = rr.ok && await Security.verifyPin('635241');
        out.rotated = !!rr.recoveryCode && rr.recoveryCode !== rec0.recoveryCode
          && !(await Crypto.verify(rec0.recoveryCode, Settings.get('authRecovery')))
          && await Crypto.verify(rr.recoveryCode, Settings.get('authRecovery'));
        /* نسيتُه — بلا رمز استرجاع: انتظار 24 ساعة ظاهر وقابل للإلغاء */
        out.reqBadPw = (await Security.requestDelayedReset('wrong')).ok;
        await Security.clearFailures();
        out.req = (await Security.requestDelayedReset(P.OWNER_PW)).ok;
        const pend = Security.pendingReset();
        out.delayH = Math.round((Date.parse(pend.effectiveAt) - Date.parse(pend.requestedAt)) / 3600000);
        out.notReady = !Security.resetReady();
        out.earlyComplete = (await Security.completeDelayedReset({ password: P.OWNER_PW, pin: '918273', pin2: '918273' })).ok;
        out.oldStillWorks = await Security.verifyPin('635241');
        await Security.cancelDelayedReset();
        out.cancelled = !Security.pendingReset();
        await Security.requestDelayedReset(P.OWNER_PW);
        await Settings.set({ securityPinReset: Object.assign({}, Security.pendingReset(), { effectiveAt: new Date(Date.now() - 1000).toISOString() }) });
        out.ready = Security.resetReady();
        out.done = (await Security.completeDelayedReset({ password: P.OWNER_PW, pin: '918273', pin2: '918273' })).ok;
        out.newWorks = await Security.verifyPin('918273') && !(await Security.verifyPin('635241')) && !Security.pendingReset();
        out.events = Security.recent(40).map(e => (e.details || {}).action).filter(Boolean);
        /* المدير لا يدير الرمز */
        await Auth.login('manager1', P.MANAGER_PW);
        out.managerPin = (await Security.applyPin('change', { old: '918273', password: P.MANAGER_PW, pin: '123789', pin2: '123789' })).ok;
        return out;
      }, { MANAGER_PW, OWNER_PW, RECEPTION_PW, TRAINER_PW, PIN });
      ok('رمز قصير/مكرّر/متسلسل/غير متطابق/مساوٍ لكلمة المرور يُرفض',
         [r.short, r.repeated, r.seq, r.mismatch, r.samePw].every(m => m !== 'ok'), [r.short, r.repeated, r.seq, r.mismatch, r.samePw].join(' | '));
      ok('وتعيينه يحتاج كلمة المرور الآن', /كلمة المرور غير صحيحة/.test(r.badPw), r.badPw);
      ok('الأرقام العربية-الهندية تُقرأ لاتينية', r.set && r.verifyLatin);
      ok('يُحفظ ملبَّداً: PBKDF2 بملح 16 بايت و100 ألف تكرار فأكثر', r.hashed);
      ok('ولا يوجد نصّاً في الإعدادات ولا في النسخة الاحتياطية (بصمته فقط)', r.noPlain && r.inBackupHashed);
      ok('تغييره يحتاج الرمز الحالي وكلمة المرور معاً', r.changeBadOld === false && r.changeBadPw === false && r.change && r.oldFails);
      ok('استعادته برمز الاسترجاع — وخاطئٌ يُرفض', r.recBad === false && r.recOk);
      ok('ورمز الاسترجاع المستعمَل يُستبدل برمزٍ جديد', r.rotated);
      ok('بلا رمز استرجاع: طلب انتظار 24 ساعة بكلمة المرور', r.reqBadPw === false && r.req && r.delayH === 24, r.delayH);
      ok('وقبل انقضائها لا يُعيَّن رمز، والقديم يعمل', r.notReady && r.earlyComplete === false && r.oldStillWorks);
      ok('والطلب يُلغى', r.cancelled);
      ok('وبعد انقضائها: رمزٌ جديد بكلمة المرور، والقديم لا يعمل', r.ready && r.done && r.newWorks);
      ok('وكل خطوة حدثٌ في السجل الأمني', ['setup', 'change', 'reset', 'reset-request', 'reset-cancel'].every(x => r.events.includes(x)),
         r.events.join(','));
      ok('المديرة لا تدير رمز الأمان', r.managerPin === false);
      await a.ctx.close();
    } finally { srv.close(); }
    record('بوّابة الخطر 7.11 — رمز الأمان', rows, errs);
  });

  /* ===================================================================== *
   * 6) الحسابات والدخول: ما يفتح الطريق إلى تجاوز كلمة المالكة               *
   * ===================================================================== */
  group('بوّابة الخطر 7.11 — الحسابات والدخول', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors;
      const r = await a.page.evaluate(async (P) => {
        const TG = window.TG, G = window.TG711, out = {};
        const { Security, Auth, Forms, Repos, go, renderRoute } = TG;
        await G.club(P);
        await Auth.login('owner1', P.OWNER_PW);
        /* إيقاف الدخول: كلمة خاطئة ⟵ يبقى مفعّلاً */
        go('settings', { sec: 'roles' }); await G.tick(300);
        const g1 = window.TGTests.autoGate({ password: 'wrong' });
        const box = document.querySelector('#authOn');
        box.checked = false; box.dispatchEvent(new Event('change'));
        await G.until(() => !!document.querySelector('.sec-err:not([hidden])'), 6000);
        await G.tick(200);
        g1.stop();
        out.gateShown = g1.log.includes('gate:security.disableAuth');
        out.stillOn = Auth.enabled();
        document.querySelectorAll('.overlay').forEach(o => o.remove()); TG.UI.stack.length = 0;
        /* الصحيحة ⟵ يُطفأ */
        go('settings', { sec: 'roles' }); await G.tick(300);
        const g2 = window.TGTests.autoGate({ password: P.OWNER_PW });
        const box2 = document.querySelector('#authOn');
        box2.checked = false; box2.dispatchEvent(new Event('change'));
        await G.until(() => !Auth.enabled(), 8000);
        g2.stop();
        out.off = !Auth.enabled();
        out.offEvent = ((Security.recent(1)[0] || {}).details || {});
        /* نعيده مفعّلاً للحالات التالية */
        await TG.Settings.set({ authEnabled: true }); await Auth.login('owner1', P.OWNER_PW);

        /* إنشاء حساب مالكة من النموذج ⟵ البوّابة؛ حساب استقبال ⟵ بلا بوّابة */
        const viaForm = async (role, uname, opts) => {
          const g = window.TGTests.autoGate(opts);
          Forms.user(); await G.tick(100);
          const m = document.querySelector('#usForm');
          const set = (n, v) => { const i = m.querySelector(`[name=${n}]`); i.value = v; i.dispatchEvent(new Event('change')); };
          set('name', 'حساب ' + uname); set('username', uname); set('roleKey', role); set('password', 'Pass#123456'); set('password2', 'Pass#123456');
          document.querySelector('#usSave').click();
          await G.until(() => !!Repos.users.list(true).find(u => u.username === uname) || g.log.length, 6000);
          await G.tick(900);
          g.stop();
          document.querySelectorAll('.overlay').forEach(o => o.remove()); TG.UI.stack.length = 0;
          return { gate: g.log.slice(), made: !!Repos.users.list(true).find(u => u.username === uname) };
        };
        out.ownerMade = await viaForm('owner', 'owner2', { password: P.OWNER_PW });
        out.receptionMade = await viaForm('reception', 'recep2', { password: P.OWNER_PW });
        out.ownerWrongPw = await viaForm('owner', 'owner3', { password: 'nope' });
        /* كلمة مرور مالكة أخرى ⟵ البوّابة؛ كلمة مرور استقبال ⟵ بلا بوّابة */
        const setPw = async (uname, opts) => {
          const u = Repos.users.list(true).find(x => x.username === uname);
          const h0 = u.pass.hash;
          const g = window.TGTests.autoGate(opts);
          Forms.userPassword(u.id); await G.tick(100);
          const f = document.querySelector('#upForm');
          f.querySelector('[name=password]').value = 'Changed#12345'; f.querySelector('[name=password2]').value = 'Changed#12345';
          document.querySelector('#upSave').click();
          await G.until(() => Repos.users.get(u.id).pass.hash !== h0 || g.log.length, 6000);
          await G.tick(900);
          g.stop();
          document.querySelectorAll('.overlay').forEach(o => o.remove()); TG.UI.stack.length = 0;
          return { gate: g.log.slice(), changed: Repos.users.get(u.id).pass.hash !== h0 };
        };
        out.pwOwner = await setPw('owner2', { password: P.OWNER_PW });
        out.pwRecep = await setPw('recep2', { password: P.OWNER_PW });
        /* الدخول نفسه لم يتغيّر */
        await Auth.logout();
        let bad = null; try { await Auth.login('owner1', 'wrong'); } catch (e) { bad = e.code; }
        out.badLogin = bad;
        await Auth.login('owner1', P.OWNER_PW);
        out.goodLogin = Auth.session.actorName;
        return out;
      }, { MANAGER_PW, OWNER_PW, RECEPTION_PW, TRAINER_PW, PIN });
      ok('إيقاف الدخول يفتح البوّابة', r.gateShown);
      ok('وبكلمة مرور خاطئة يبقى الدخول مفعّلاً', r.stillOn);
      ok('وبالصحيحة يُطفأ ويُسجَّل', r.off && r.offEvent.capability === 'security.disableAuth' && r.offEvent.reauth === 'ok',
         JSON.stringify(r.offEvent));
      ok('إنشاء حساب بصلاحية المالكة يمرّ بالبوّابة', r.ownerMade.made && r.ownerMade.gate.includes('gate:security.adminAccount'),
         JSON.stringify(r.ownerMade));
      ok('وحساب استقبال بلا بوّابة كما كان', r.receptionMade.made && r.receptionMade.gate.length === 0, JSON.stringify(r.receptionMade));
      ok('وبكلمة مرور خاطئة لا يُنشأ حساب المالكة', !r.ownerWrongPw.made, JSON.stringify(r.ownerWrongPw));
      ok('تعيين كلمة مرور مالكة أخرى يمرّ بالبوّابة', r.pwOwner.changed && r.pwOwner.gate.includes('gate:security.adminAccount'),
         JSON.stringify(r.pwOwner));
      ok('وكلمة مرور حساب استقبال بلا بوّابة كما كان', r.pwRecep.changed && r.pwRecep.gate.length === 0, JSON.stringify(r.pwRecep));
      ok('الدخول نفسه لم يتغيّر: الخاطئة تُرفض بالرسالة نفسها، والصحيحة تدخل', r.badLogin === 'BAD_LOGIN' && r.goodLogin === 'المالكة',
         `${r.badLogin} / ${r.goodLogin}`);
      await a.ctx.close();
    } finally { srv.close(); }
    record('بوّابة الخطر 7.11 — الحسابات والدخول', rows, errs);
  });

  /* ===================================================================== *
   * 7) حدّ القدرة — ما ستبني عليه مرحلة الأدوار                              *
   * ===================================================================== */
  group('بوّابة الخطر 7.11 — حدّ القدرة لمرحلة الأدوار', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors;
      const r = await a.page.evaluate(async (P) => {
        const TG = window.TG, G = window.TG711, out = {};
        const { Security, Auth, Actions } = TG;
        await G.club(P);
        const caps = Object.keys(Security.CAPS);
        const actor = role => ({ actorId: 'x', actorName: role, roleKey: role, authEnabled: true });
        out.matrix = {};
        ['owner', 'manager', 'reception', 'trainer'].forEach(role => {
          out.matrix[role] = caps.filter(k => Security.can(actor(role), k));
        });
        out.noSession = Security.can({ actorId: null, roleKey: null, authEnabled: true }, 'dangerous.resetData');
        out.authOff = caps.every(k => Security.can({ actorId: null, roleKey: null, authEnabled: false }, k));
        /* استبدال السياسة وحده يغيّر القرار — العملية نفسها لم تُمسّ */
        await Auth.login('owner1', P.OWNER_PW);
        await Security.applyPin('setup', { password: P.OWNER_PW, pin: P.PIN, pin2: P.PIN });
        await Auth.login('manager1', P.MANAGER_PW);
        Security.policy = (act, key) => act.roleKey === 'manager' && key === 'dangerous.resetData';
        const g = window.TGTests.autoGate({ cancel: true });
        let code = null; try { await Actions.wipe(); } catch (e) { code = e.code; }
        await G.tick(300);
        g.stop();
        out.policyGate = g.log.slice(); out.policyCode = code;
        Security.policy = null;
        /* كل نداءٍ مدمِّر في الشيفرة يقع داخل بوّابة */
        const src = [...document.querySelectorAll('script')].map(s => s.textContent || '')
          .filter(t => t.indexOf('window.TG = {') !== -1).sort((x, y) => y.length - x.length)[0] || '';
        const sites = [];
        ['Seed.factoryReset(', 'Backup.restore(', 'Seed.clearDemo('].forEach(needle => {
          let i = -1;
          while ((i = src.indexOf(needle, i + 1)) !== -1) {
            const before = src.slice(Math.max(0, i - 700), i);
            sites.push({ needle, guarded: /Security\.guard\(/.test(before) });
          }
        });
        out.sites = sites;
        out.policyMapHasCaps = !!(TG.Policy.CAPABILITIES && caps.every(k => TG.Policy.CAPABILITIES[k]));
        return out;
      }, { MANAGER_PW, OWNER_PW, RECEPTION_PW, TRAINER_PW, PIN });
      const m = r.matrix;
      ok('المالكة تملك كل القدرات الخطرة', m.owner.length === 6, m.owner.join(','));
      ok('المديرة: البيانات التجريبية فقط (لا إعادة تهيئة ولا استعادة ولا رمز ولا حسابات)',
         m.manager.join(',') === 'dangerous.clearDemo', m.manager.join(','));
      ok('الاستقبال والمدرّبة: لا شيء', !m.reception.length && !m.trainer.length, `${m.reception}/${m.trainer}`);
      ok('بلا جلسة والدخول مفعّل: لا شيء', r.noSession === false);
      ok('والدخول غير مفعّل: المالكة الضمنية (السلوك نفسه قبل 7.11)', r.authOff);
      ok('`Security.policy` نقطة الإدراج: استبدالها وحده يوصل المديرة إلى البوّابة',
         r.policyGate.includes('gate:dangerous.resetData') && r.policyCode === null, `${r.policyGate}/${r.policyCode}`);
      ok('كل نداءٍ لإعادة التهيئة والاستعادة وحذف التجريبية داخل `Security.guard`',
         r.sites.length >= 3 && r.sites.every(s => s.guarded), JSON.stringify(r.sites));
      ok('والقدرات مسجّلة في جدول Policy لمرحلة الأدوار', r.policyMapHasCaps);
      await a.ctx.close();
    } finally { srv.close(); }
    record('بوّابة الخطر 7.11 — حدّ القدرة لمرحلة الأدوار', rows, errs);
  });

  /* ===================================================================== *
   * 8) الشعار تحت سياسة WebView2 الفعلية — كل مصدر وكل سطح                  *
   * ===================================================================== */
  group('الهوية 7.11 — الشعار تحت سياسة WebView2 الفعلية', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [], csp = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors; csp = a.csp;
      ok('السياسة المطبَّقة تسمح بالأنماط السطرية (style-src بلا nonce)', allowsInline(srv.lastCsp, 'style-src'), srv.lastCsp.match(/style-src[^;]*/)[0]);
      ok('والسكربت ما زال محروساً ببصمته', !allowsInline(srv.lastCsp, 'script-src') && /sha256-/.test(srv.lastCsp));
      const r = await a.page.evaluate(async (ANIM) => {
        const TG = window.TG, H = window.TGH, G = window.TG711, out = [];
        const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
        const SRC = [
          ['PNG 128', { type: 'png', w: 128, h: 128 }], ['PNG 512', { type: 'png', w: 512, h: 512 }],
          ['PNG 1024', { type: 'png', w: 1024, h: 1024 }], ['PNG 3000', { type: 'png', w: 3000, h: 3000 }],
          ['عريض 3000×600', { type: 'png', w: 3000, h: 600 }], ['طويل 600×3000', { type: 'png', w: 600, h: 3000 }],
          ['PNG شفاف', { type: 'png', w: 800, h: 800, alpha: true }], ['SVG عريض 2400×540', { type: 'svg', w: 2400, h: 540 }],
          ['GIF متحرّك', 'gif']
        ];
        for (const [label, spec] of SRC) {
          const f = spec === 'gif' ? new File([b64(ANIM)], 'l.gif', { type: 'image/gif' }) : await H.makeFile(spec);
          /* الطريق الحقيقي: حقل الملف ⟵ المحرّر ⟵ «تطبيق» ⟵ الحفظ */
          const pr = TG.ImageEditor.prepareBrand(f, 'logo');
          /* المتّجه (SVG) يمرّ بلا محرّر — كما في الشاشة */
          if (f.type !== 'image/svg+xml') {
            await G.until(() => document.querySelector('#imApply'), 4000); await G.tick(300);
            document.querySelector('#imApply').click();
          }
          const got = await pr;
          await TG.Brand.setMedia('logo', got.file, got.crop);
          TG.go('settings', { sec: 'brand' }); await G.tick(250);
          await G.imgs();
          const side = H.logoOn(document.querySelector('.brand [data-brand-slot="logo"]'));
          const prev = H.logoOn(document.querySelector('[data-brand-prev="logo"]') ? document.querySelector('[data-brand-prev="logo"]').closest('[data-brand-slot="logo"]') : null);
          const shellH = Math.round(document.querySelector('.brand').getBoundingClientRect().height);
          const tmp = document.createElement('div'); tmp.className = 'doc'; tmp.innerHTML = TG.Brand.printHeader('اختبار') + TG.Print.receiptHtml({ no: 'R-1', issuedAt: new Date().toISOString(), snapshot: { gym: {}, member: {}, doc: {}, payment: {} } });
          document.body.appendChild(tmp); await G.imgs();
          const slots = [...tmp.querySelectorAll('[data-brand-slot="logo"]')].map(H.logoOn);
          tmp.remove();
          out.push({ label, side, prev, shellH, print: slots[0], receipt: slots[1] });
        }
        return out;
      }, ANIM_B64);
      for (const x of r) {
        const fit = (o, n) => !!o && o.slot.w === n && o.slot.h === n && o.contained && o.clips;
        ok(`${x.label}: الشريط الجانبي 38×38 والصورة داخله`, fit(x.side, 38), JSON.stringify(x.side));
        ok(`${x.label}: والشريط لا يتمدّد`, x.shellH < 110, x.shellH);
        ok(`${x.label}: معاينة الإعدادات 120×120`, fit(x.prev, 120), JSON.stringify(x.prev));
        ok(`${x.label}: ترويسة الطباعة 54×54 والوصل 56×56`, fit(x.print, 54) && fit(x.receipt, 56),
           `${JSON.stringify(x.print && x.print.slot)} ${JSON.stringify(x.receipt && x.receipt.slot)}`);
      }
      /* شاشة الدخول وطبقة التحقّق فوقها */
      const g = await a.page.evaluate(async (P) => {
        const TG = window.TG, H = window.TGH, G = window.TG711;
        await G.club(P);
        await TG.Auth.logout(); TG.Gate.login(); await G.tick(300); await G.imgs();
        const slot = document.querySelector('.gate [data-brand-slot="logo"]');
        const on = H.logoOn(slot);
        TG.Gate.working && TG.Gate.working('جارٍ التحقّق…'); await G.tick(100);
        const on2 = H.logoOn(document.querySelector('.gate [data-brand-slot="logo"]'));
        return { on, on2 };
      }, { MANAGER_PW, OWNER_PW, RECEPTION_PW, TRAINER_PW, PIN });
      ok('شاشة الدخول: 64×64 والصورة داخله', !!g.on && g.on.slot.w === 64 && g.on.slot.h === 64 && g.on.contained, JSON.stringify(g.on));
      ok('وأثناء التحقّق (طبقة التحميل) كما هو', !!g.on2 && g.on2.slot.w === 64, JSON.stringify(g.on2));
      await a.ctx.close();
    } finally { srv.close(); }
    rows.push({ name: 'لا خرق لسياسة أمن المحتوى في الشاشات كلّها', pass: csp.length === 0, detail: csp.slice(0, 2).join(' | ') });
    record('الهوية 7.11 — الشعار تحت سياسة WebView2 الفعلية', rows, errs);
  });

  /* ===================================================================== *
   * 9) الطبقة الثانية: لو سقطت الأنماط السطرية كما في 7.10                   *
   * ===================================================================== */
  group('الهوية 7.11 — الطبقة الثانية (تهيئة 7.10: الأنماط السطرية محذوفة)', async (browser) => {
    const srv = await serve(c => { delete c.app.security.dangerousDisableAssetCspModification; });
    const { rows, ok } = collect();
    try {
      const a = await open(browser, srv);
      ok('هذه التهيئة تحذف الأنماط السطرية فعلاً (الشرط الذي أنتج العيب)', !allowsInline(srv.lastCsp, 'style-src'));
      const r = await a.page.evaluate(async () => {
        const TG = window.TG, H = window.TGH, G = window.TG711;
        await TG.Brand.setMedia('logo', await H.makeFile({ type: 'png', w: 1024, h: 1024 }));
        await TG.Brand.setMedia('banner', await H.makeFile({ type: 'png', w: 1600, h: 400 }));
        TG.go('desk'); await G.tick(300); await G.imgs();
        const side = H.logoOn(document.querySelector('.brand [data-brand-slot="logo"]'));
        const bn = document.querySelector('.desk-hero .brand-banner').getBoundingClientRect();
        return { side, bw: Math.round(bn.width), bh: Math.round(bn.height), inlineW: document.querySelector('.brand [data-brand-slot="logo"]').style.width };
      });
      ok('الأنماط السطرية محذوفة في هذه التهيئة (لا عرض سطريّ مقروء)', r.inlineW === '', r.inlineW);
      ok('ومع ذلك: شعار 1024×1024 يبقى 38×38 في الشريط', !!r.side && r.side.slot.w === 38 && r.side.slot.h === 38 && r.side.clips,
         JSON.stringify(r.side));
      ok('واللافتة مرئية بنسبة 4:1 — لا ارتفاع صفر', r.bh > 100 && Math.abs(r.bw / r.bh - 4) < 0.05, `${r.bw}×${r.bh}`);
      await a.ctx.close();
    } finally { srv.close(); }
    record('الهوية 7.11 — الطبقة الثانية (تهيئة 7.10: الأنماط السطرية محذوفة)', rows, []);
  });

  /* ===================================================================== *
   * 10) اللافتة على الاستقبال — مصدرٌ واحد، تكوينٌ واحد                       *
   * ===================================================================== */
  group('الهوية 7.11 — اللافتة على الاستقبال', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [], csp = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors; csp = a.csp;
      const r = await a.page.evaluate(async (ANIM) => {
        const TG = window.TG, H = window.TGH, G = window.TG711, out = {};
        /* بلا لافتة: شريط هوية هادئ، لا صورة مكسورة ولا فراغ محجوز */
        TG.go('desk'); await G.tick(250);
        const empty = document.querySelector('[data-desk-hero="empty"]');
        out.empty = !!empty && !empty.querySelector('.brand-banner') && Math.round(empty.getBoundingClientRect().height) < 100;
        out.emptyH = empty ? Math.round(empty.getBoundingClientRect().height) : 0;
        const b = empty && empty.querySelector('[data-hero-banner]');
        if (b) { b.click(); await G.tick(200); }
        out.heroLink = TG.State.route === 'settings' && TG.State.params.sec === 'brand';
        const b64 = s => { const bin = atob(s); const u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };
        const cases = [
          ['JPG', async () => { const c = document.createElement('canvas'); c.width = 1600; c.height = 400; const x = c.getContext('2d');
            x.fillStyle = '#432C4C'; x.fillRect(0, 0, 1600, 400); x.fillStyle = '#C43E6B'; x.fillRect(200, 100, 400, 200);
            return new File([await new Promise(r => c.toBlob(r, 'image/jpeg', .9))], 'b.jpg', { type: 'image/jpeg' }); }, null],
          ['PNG', () => H.makeFile({ type: 'png', w: 2400, h: 600 }), null],
          ['PNG مقصوص', () => H.makeFile({ type: 'png', w: 1200, h: 1200 }), { w: 100, h: 400, x: 0, y: -150 }],
          ['GIF متحرّك مقصوص', () => new File([b64(ANIM)], 'b.gif', { type: 'image/gif' }), { w: 100, h: 400, x: 0, y: -150 }]
        ];
        out.cases = [];
        await TG.Brand.setMotionMode('on');
        for (const [label, mk, crop] of cases) {
          await TG.Brand.setMedia('banner', await mk(), crop);
          TG.go('settings', { sec: 'brand' }); await G.tick(250); await G.imgs();
          const set = H.bannerOn(document.querySelector('[data-brand-prev="banner"]').closest('[data-brand-slot="banner"]'));
          TG.go('desk'); await G.tick(250); await G.imgs();
          const deskEl = document.querySelector('[data-desk-hero="banner"] .brand-banner');
          const desk = H.bannerOn(deskEl);
          const deskImg = deskEl.querySelector('img');
          const deskH = Math.round(deskEl.getBoundingClientRect().height);
          const live = deskEl.getAttribute('data-motion'), gifSrc = /^data:image\/gif/.test(deskImg.src);
          TG.go('dashboard'); await G.tick(250); await G.imgs();
          const dash = H.bannerOn(document.querySelector('#viewRoot .brand-banner'));
          out.cases.push({ label, set, desk, dash, live, gifSrc, deskH, same: TG.Brand.get().bannerMediaId });
        }
        return out;
      }, ANIM_B64);
      ok('بلا لافتة: شريط هوية هادئ في الاستقبال — لا صورة مكسورة ولا فراغ', r.empty, r.emptyH);
      ok('وزرّ «إضافة لافتة» يفتح الهوية البصرية في الإعدادات', r.heroLink);
      const near = (p, q, e) => Math.abs(p - q) <= (e || 0.02);
      for (const c of r.cases) {
        ok(`${c.label}: اللافتة ظاهرة في الاستقبال (ارتفاعٌ حقيقي)`, c.deskH > 100, c.deskH);
        ok(`${c.label}: صندوق 4:1 في الإعدادات والاستقبال ولوحة التحكم`,
           near(c.set.slotRatio, 4, 0.05) && near(c.desk.slotRatio, 4, 0.05) && near(c.dash.slotRatio, 4, 0.05),
           `${c.set.slotRatio.toFixed(2)}/${c.desk.slotRatio.toFixed(2)}/${c.dash.slotRatio.toFixed(2)}`);
        ok(`${c.label}: التكوين نفسه في الإعدادات والاستقبال`,
           ['x', 'y', 'w', 'h'].every(k => near(c.set[k], c.desk[k], 0.02)) && near(c.set.imgRatio, c.desk.imgRatio, 0.02),
           `${JSON.stringify(c.set)} vs ${JSON.stringify(c.desk)}`);
      }
      const gif = r.cases.find(c => /GIF/.test(c.label));
      ok('GIF: المرسوم هو الملف المتحرّك نفسه (حيّ)', gif && gif.live === 'live' && gif.gifSrc, gif && gif.live);
      await a.page.reload({ waitUntil: 'domcontentloaded' });
      await boot(a.page);
      const after = await a.page.evaluate(async () => {
        const TG = window.TG, H = window.TGH, G = window.TG711;
        TG.go('desk'); await G.tick(300); await G.imgs();
        const el = document.querySelector('[data-desk-hero="banner"] .brand-banner');
        return el ? { h: Math.round(el.getBoundingClientRect().height), on: H.bannerOn(el), live: el.getAttribute('data-motion') } : null;
      });
      ok('بعد إعادة التشغيل: اللافتة المتحرّكة على الاستقبال كما هي', !!after && after.h > 100 && after.live === 'live'
         && ['x', 'y', 'w', 'h'].every(k => near(after.on[k], gif.desk[k], 0.02)), JSON.stringify(after));
      await a.ctx.close();
    } finally { srv.close(); }
    rows.push({ name: 'لا خرق لسياسة أمن المحتوى', pass: csp.length === 0, detail: csp.slice(0, 2).join(' | ') });
    record('الهوية 7.11 — اللافتة على الاستقبال', rows, errs);
  });

  /* ===================================================================== *
   * 11) معالجات سطرية كانت ميتة على ويندوز                                  *
   * ===================================================================== */
  group('تدقيق 7.11 — أزرار كانت لا تعمل في التطبيق المثبَّت', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [], csp = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors; csp = a.csp;
      const r = await a.page.evaluate(async () => {
        const TG = window.TG, G = window.TG711, out = {};
        TG.go('members'); await G.tick(250);
        const btn = document.querySelector('[data-new-member]');
        out.hasBtn = !!btn;
        if (btn) { btn.click(); await G.tick(200); }
        out.formOpen = !!document.querySelector('.modal') && TG.UI.stack.length > 0;
        TG.UI.stack.slice().forEach(h => h.close());
        TG.go('member', { id: 'غير-موجود' }); await G.tick(250);
        const back = document.querySelector('[data-go-members]');
        if (back) { back.click(); await G.tick(200); }
        out.backWorks = !!back && TG.State.route === 'members';
        return out;
      });
      ok('«إضافة مشتركة» في القائمة الفارغة يفتح النموذج', r.hasBtn && r.formOpen);
      ok('«قائمة المشتركات» من ملفٍ غير موجود يعود إلى القائمة', r.backWorks);
      await a.ctx.close();
    } finally { srv.close(); }
    rows.push({ name: 'ولا معالج سطريّ رفضته السياسة', pass: !csp.some(t => /inline event handler|script-src/.test(t)), detail: csp.slice(0, 2).join(' | ') });
    record('تدقيق 7.11 — أزرار كانت لا تعمل في التطبيق المثبَّت', rows, errs);
  });

  /* ===================================================================== *
   * 12) الوصل إلى Word — قالبه، ومصدره الواحد، وكل سطحٍ يطبع وصلاً          *
   * ===================================================================== */
  group('Word 7.11 — الوصل بقالبه الخاص', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      const a = await open(browser, srv);
      errs = a.errors;
      const r = await a.page.evaluate(async () => {
        const TG = window.TG, H = window.TGH, G = window.TG711, out = {};
        const { Svc, Repos, D, Money, Brand, Print, Actions, Word } = TG;
        await Brand.setMedia('logo', await H.makeFile({ type: 'png', w: 512, h: 512 }));
        /* دفعة حقيقية على اشتراك حقيقي — من الخدمات نفسها */
        const plan = Repos.plans.list()[0];
        const m = (await Svc.members.create({ name: 'رُقيّة الجبوري', phone: '07712345678' })).rec;
        const sub = await Svc.subs.create({ memberId: m.id, planId: plan.id, startDate: D.today(), price: 45000, discount: 5000,
          paidAmount: 25000, paymentMethod: 'cash' });
        const pay = Actions.lastPaymentOf('subscription', (sub.rec || sub).id);
        out.payAmount = pay.amount;
        const FS = window.__TG_FS__;
        const toasts = H.captureToasts();
        const words0 = FS.files.filter(f => f.category === 'word').length;
        const res = await Actions.receiptWordForPayment(pay.id);
        await G.tick(200);
        toasts.stop();
        const rc = Svc.receipts.forPayment(pay.id);
        out.no = rc.no; out.reprints = Number(rc.reprints) || 0; out.lastPrinted = rc.lastPrintedAt;
        const model = Print.receiptModel(rc, { format: 'a4' });
        out.model = { no: model.no, member: model.member.name, amount: model.amount, total: model.doc.total, method: model.methodLabel };
        out.meta = res && res.blob && res.blob.tgMeta;
        const f = FS.files.filter(x => x.category === 'word').slice(-1)[0];
        out.saved = FS.files.filter(x => x.category === 'word').length === words0 + 1;
        out.file = f && { name: f.name, folder: f.folder };
        out.toast = toasts.list.map(t => t.msg);
        /* الحزمة */
        const bin = atob(f.b64), u = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
        const dv = new DataView(u.buffer), z = {}; let p = 0;
        while (p + 30 <= u.length && dv.getUint32(p, true) === 0x04034b50) {
          const size = dv.getUint32(p + 18, true), nl = dv.getUint16(p + 26, true), xl = dv.getUint16(p + 28, true);
          z[new TextDecoder().decode(u.subarray(p + 30, p + 30 + nl))] = new TextDecoder().decode(u.subarray(p + 30 + nl + xl, p + 30 + nl + xl + size));
          p += 30 + nl + xl + size;
        }
        out.pk = bin.slice(0, 2) === 'PK';
        out.parts = Object.keys(z);
        const doc = z['word/document.xml'] || '', hdr = z['word/header1.xml'] || '';
        out.badXml = Object.keys(z).filter(n => /\.(xml|rels)$/.test(n) && new DOMParser().parseFromString(z[n], 'application/xml').getElementsByTagName('parsererror').length);
        const text = [...new DOMParser().parseFromString(doc, 'application/xml').getElementsByTagName('w:t')].map(t => t.textContent).join(' ');
        const htext = [...new DOMParser().parseFromString(hdr, 'application/xml').getElementsByTagName('w:t')].map(t => t.textContent).join(' ');
        out.hasNo = text.includes(rc.no) && htext.includes(rc.no);
        out.hasMember = text.includes('رُقيّة الجبوري');
        out.hasAmount = text.includes(Money.fmt(pay.amount));
        out.hasTotal = text.includes(Money.fmt(model.doc.total));
        out.hasMethod = text.includes(model.methodLabel);
        out.hasPeriod = text.includes(model.doc.detail);
        out.noPhone = !text.includes('07712345678');
        out.title = htext.includes('وصل قبض');
        out.brand = htext.includes(Brand.name());
        out.rtl = /<w:bidi\/>/.test(doc) && /<w:bidiVisual\/>/.test(doc) && /<w:rtl\/>/.test(doc);
        out.portrait = !/w:orient="landscape"/.test(doc);
        out.logo = /r:embed="rIdLogo"/.test(hdr) && out.parts.includes('word/media/logo.png');
        out.accent = out.meta && out.meta.accent;
        out.notReprint = !text.includes('مُعادة الطباعة');
        /* الورقة والملف من مصدر واحد: كل خلية في الوصل المطبوع موجودة في Word */
        const host = document.createElement('div'); host.innerHTML = Print.receiptHtml(rc, { format: 'a4' });
        const cells = [...host.querySelectorAll('td,dd')].map(c => c.textContent.replace(/\s+/g, ' ').trim()).filter(Boolean);
        out.lost = cells.filter(c => !text.replace(/\s+/g, ' ').includes(c));
        out.audit = Repos.audit.list(true).some(x => x.entity === 'receipt' && x.action === 'word' && x.entityId === rc.id);
        /* كل سطحٍ يطبع وصلاً فيه «Word» بجانبه */
        TG.go('desk'); await G.tick(300);
        out.deskBtn = !!document.querySelector(`[data-rcpw="${pay.id}"]`);
        TG.go('member', { id: m.id, tab: 'money' }); await G.tick(300);
        out.memberBtns = !!document.querySelector(`[data-rcpw="${pay.id}"]`) && !!document.querySelector(`[data-rcpword="${rc.id}"]`);
        TG.go('finance', { tab: 'cash' }); await G.tick(300);
        out.cashBtn = !!document.querySelector(`[data-rcpw="${pay.id}"]`) && !!document.querySelector('#cashWordAll');
        TG.Screens.paymentLedger('subscription', (sub.rec || sub).id); await G.tick(250);
        out.ledgerBtn = !!document.querySelector(`.modal [data-rcpw="${pay.id}"]`);
        const n1 = FS.files.filter(x => x.category === 'word').length;
        document.querySelector(`.modal [data-rcpw="${pay.id}"]`).click();
        await G.until(() => FS.files.filter(x => x.category === 'word').length > n1, 5000);
        out.ledgerSaved = FS.files.filter(x => x.category === 'word').length === n1 + 1;
        TG.UI.stack.slice().forEach(h => h.close());
        /* وصولات اليوم في ملفٍ واحد، كلٌّ بصفحته */
        const n2 = FS.files.filter(x => x.category === 'word').length;
        await Actions.wordDayReceipts(D.today());
        const day = FS.files.filter(x => x.category === 'word').slice(-1)[0];
        out.daySaved = FS.files.filter(x => x.category === 'word').length === n2 + 1 && /^وصولات-/.test(day.name);
        const todays = Repos.payments.list().filter(x => x.date === D.today()).length;
        const dbin = atob(day.b64);
        out.dayBreaks = (dbin.match(/w:type="page"/g) || []).length;
        out.todays = todays;
        out.reprintsAfter = Number(Svc.receipts.forPayment(pay.id).reprints) || 0;
        return out;
      });
      ok('Word من دفعة اشتراك حقيقية: ملف .docx حقيقي بأجزائه وXML سليم', r.pk && r.saved && !r.badXml.length
         && ['word/document.xml', 'word/styles.xml', 'word/header1.xml', 'word/footer1.xml', '[Content_Types].xml'].every(p => r.parts.includes(p)),
         `${r.file && r.file.name} ${r.badXml.join(',')}`);
      ok('في مجلّد Exports\\Word، واسمه يحمل رقم الوصل', r.file && /Word/.test(r.file.folder) && r.file.name.includes(r.no), JSON.stringify(r.file));
      ok('الرسالة: «تم تصدير الوصل إلى Word» — لا «طُبع»', r.toast.some(t => t === 'تم تصدير الوصل إلى Word') && !r.toast.some(t => /طُبع/.test(t)),
         r.toast.join(' | '));
      ok('رقم الوصل في الترويسة والمتن', r.hasNo, r.no);
      ok('المشتركة الصحيحة', r.hasMember);
      ok('المبلغ الصحيح = مبلغ الدفعة نفسها', r.hasAmount && r.model.amount === r.payAmount, `${r.model.amount} / ${r.payAmount}`);
      ok('والإجمالي المستحق وطريقة الدفع وفترة الاشتراك', r.hasTotal && r.hasMethod && r.hasPeriod);
      ok('ولا رقم هاتف (قاعدة الخصوصية نفسها في الورقة)', r.noPhone);
      ok('ترويسة الهوية: اسم النادي و«وصل قبض» والشعار', r.brand && r.title && r.logo);
      ok('عربيّ من اليمين: قسم وفقرات bidi وجداول bidiVisual', r.rtl);
      ok('عمودي (الوصل ليس جدولاً عريضاً)', r.portrait);
      ok('ولون الهوية مقروءٌ من الشعار أو اللوحة', /^[0-9A-F]{6}$/.test(r.accent || ''), r.accent);
      ok('كل خلية في الوصل المطبوع موجودة في Word — مصدرٌ واحد', r.lost.length === 0, r.lost.join(' | '));
      ok('Word ليس طباعة: لا يزيد عدّاد النسخ ولا يُكتب «مُعادة الطباعة»', r.reprints === 0 && !r.lastPrinted && r.notReprint && r.reprintsAfter === 0);
      ok('ويُسجَّل حدث «تصدير Word» للوصل', r.audit);
      ok('زرّ Word بجانب الوصل: في الاستقبال، وملف المشتركة، وكشف الصندوق، وسجل الدفعات',
         r.deskBtn && r.memberBtns && r.cashBtn && r.ledgerBtn, JSON.stringify([r.deskBtn, r.memberBtns, r.cashBtn, r.ledgerBtn]));
      ok('والزرّ في سجل الدفعات يحفظ ملفاً فعلاً', r.ledgerSaved);
      ok('وصولات اليوم في ملف واحد، كلّ وصلٍ في صفحته', r.daySaved && r.dayBreaks === r.todays - 1, `${r.dayBreaks} فاصل / ${r.todays} دفعة`);
      await a.ctx.close();
    } finally { srv.close(); }
    record('Word 7.11 — الوصل بقالبه الخاص', rows, errs);
  });

  /* ===================================================================== *
   * 13) المظهر: فاتح · داكن · حسب الجهاز — والورق وWord والمال لا يعرفونه     *
   * ===================================================================== */
  group('المظهر 7.11 — فاتح وداكن وحسب الجهاز', async (browser) => {
    const srv = await serve();
    const { rows, ok } = collect();
    let errs = [];
    try {
      /* الجهاز يفضّل الداكن */
      const a = await open(browser, srv, { context: { viewport: { width: 1440, height: 900 }, colorScheme: 'dark' } });
      errs = a.errors;
      const lum = `(c => { const m = String(c).match(/\\d+(\\.\\d+)?/g).map(Number); const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); };
        return .2126 * f(m[0]) + .7152 * f(m[1]) + .0722 * f(m[2]); })`;
      const r = await a.page.evaluate(async (LUM) => {
        const TG = window.TG, H = window.TGH, G = window.TG711, out = {};
        const L = eval(LUM);
        const ratio = (x, y) => { const a = L(x), b = L(y); return (Math.max(a, b) + .05) / (Math.min(a, b) + .05); };
        const cs = el => getComputedStyle(el);
        out.defaultMode = TG.Theme.mode();
        out.systemEff = document.documentElement.getAttribute('data-theme');
        await TG.Seed.loadDemo(10);
        await TG.Brand.setMedia('logo', await H.makeFile({ type: 'png', w: 600, h: 600, alpha: true }));
        const fp0 = H.fingerprint(), money0 = JSON.stringify(H.money());
        const wordLight = await (async () => { await TG.Theme.set('light'); const t = await TG.Word.theme(); return [t.ink, t.plum, t.line, t.muted].join(','); })();
        out.lightBg = cs(document.body).backgroundColor;
        TG.go('members'); await G.tick(250);
        /* داكن */
        await TG.Theme.set('dark');
        TG.go('members'); await G.tick(250);
        const body = cs(document.body);
        out.darkBg = body.backgroundColor; out.darkInk = body.color;
        out.bodyContrast = ratio(body.color, body.backgroundColor);
        const card = document.querySelector('.card');
        out.cardBg = cs(card).backgroundColor;
        const th = document.querySelector('table.tbl th');
        out.thContrast = th ? ratio(cs(th).color, cs(th).backgroundColor) : 0;
        const btn = document.querySelector('#btnQuickAdd');
        out.btnContrast = ratio(cs(btn).color, cs(btn).backgroundColor);
        const inp = document.querySelector('#globalSearch');
        out.inpContrast = ratio(cs(inp).color, cs(inp).backgroundColor);
        out.themeBtn = !!document.querySelector('#btnTheme svg');
        /* الهوية: الشعار الشفّاف مرئيّ على لوحه في المعاينة */
        TG.go('settings', { sec: 'brand' }); await G.tick(250);
        const prev = document.querySelector('.brand-prev[data-brand-slot="logo"]');
        out.plate = prev ? L(cs(prev).backgroundColor) : 0;
        out.sidebarLogo = !!document.querySelector('.brand [data-brand-slot="logo"] img');
        /* Word لا يعرف المظهر */
        const t = await TG.Word.theme();
        out.wordSame = [t.ink, t.plum, t.line, t.muted].join(',') === wordLight;
        out.wordDark = [t.ink, t.plum, t.line, t.muted].join(',');
        /* الطباعة لا تعرفه: وضع الطباعة يعيد لوحة الفاتح، والمستند ورق */
        const stub = TG.Desktop.call;
        let during = null;
        TG.Desktop.call = async (cmd, args) => {
          if (cmd === 'tg_print') {
            const root = document.getElementById('tgPrintRoot');
            during = { surface: getComputedStyle(document.documentElement).getPropertyValue('--surface').trim(),
                       docColor: root ? cs(root.querySelector('.doc') || root).color : '', rootTheme: root && root.getAttribute('data-theme'),
                       bodyBg: cs(document.body).backgroundColor };
            return true;
          }
          return stub.call(TG.Desktop, cmd, args);
        };
        const m = TG.Repos.members.list()[0];
        TG.Print.open('كشف', TG.Print.statementHtml(m.id));
        await G.until(() => during, 5000);
        TG.Desktop.call = stub;
        if (TG.UI._printUndo) TG.UI._printUndo();
        out.print = during;
        /* حسب الجهاز: يتبع تفضيل النظام */
        await TG.Theme.set('system');
        out.systemNow = document.documentElement.getAttribute('data-theme');
        /* المال والبيانات لم تتغيّر بتبديل المظهر */
        const fp1 = H.fingerprint();
        out.dataSame = H.diff(fp0, fp1).filter(x => x !== 'meta').length === 0 && JSON.stringify(H.money()) === money0;
        await TG.Theme.set('dark');
        out.stored = TG.Settings.get('theme'); out.ls = localStorage.getItem('tg_theme');
        return out;
      }, lum);
      ok('الافتراضي «حسب الجهاز»، والجهاز يفضّل الداكن ⟵ داكن', r.defaultMode === 'system' && r.systemEff === 'dark', `${r.defaultMode}/${r.systemEff}`);
      ok('الفاتح: خلفية فاتحة', /rgb\(246, 242, 245\)/.test(r.lightBg), r.lightBg);
      ok('الداكن: خلفية داكنة ونصّ فاتح بتباين ≥ 7:1', r.bodyContrast >= 7 && r.darkBg !== r.lightBg, `${r.bodyContrast.toFixed(2)} ${r.darkBg}/${r.darkInk}`);
      ok('والبطاقة سطحٌ داكن لا أبيض', r.cardBg !== 'rgb(255, 255, 255)', r.cardBg);
      ok('رؤوس الجداول مقروءة (≥ 4.5:1)', r.thContrast >= 4.5, r.thContrast.toFixed(2));
      ok('الزرّ الأساسي والحقول مقروءة (≥ 4.5:1)', r.btnContrast >= 4.5 && r.inpContrast >= 4.5, `${r.btnContrast.toFixed(2)}/${r.inpContrast.toFixed(2)}`);
      ok('زرّ المظهر في الشريط العلوي', r.themeBtn);
      ok('الشعار الشفّاف على لوحٍ فاتح في المعاينة الداكنة، ومرئيّ في الشريط', r.plate > 0.8 && r.sidebarLogo, r.plate);
      ok('Word بألوان الورق نفسها في الداكن', r.wordSame, r.wordDark);
      ok('الطباعة في الداكن: لوحة الفاتح والمستند أسود على أبيض',
         !!r.print && r.print.surface.toUpperCase() === '#FFFFFF' && r.print.rootTheme === 'light' && /rgb\(0, 0, 0\)/.test(r.print.docColor),
         JSON.stringify(r.print));
      ok('«حسب الجهاز» يتبع تفضيل النظام', r.systemNow === 'dark');
      ok('تبديل المظهر لا يمسّ بيانات ولا مالاً', r.dataSame);
      ok('التفضيل محفوظ على القرص ونسخته المحلية', r.stored === 'dark' && r.ls === 'dark');
      await a.page.reload({ waitUntil: 'domcontentloaded' });
      await boot(a.page);
      const after = await a.page.evaluate(() => ({ t: document.documentElement.getAttribute('data-theme'), m: window.TG.Theme.mode() }));
      ok('ويبقى بعد إعادة التشغيل', after.t === 'dark' && after.m === 'dark', JSON.stringify(after));
      await a.ctx.close();
      /* والجهاز يفضّل الفاتح */
      const b = await open(browser, srv, { context: { viewport: { width: 1280, height: 800 }, colorScheme: 'light' } });
      const lightSys = await b.page.evaluate(() => document.documentElement.getAttribute('data-theme'));
      ok('والجهاز يفضّل الفاتح ⟵ فاتح', lightSys === 'light', lightSys);
      await b.ctx.close();
    } finally { srv.close(); }
    record('المظهر 7.11 — فاتح وداكن وحسب الجهاز', rows, errs);
  });
};

/* أدوات الصفحة لهذه المجموعات */
const PAGE_711 = `window.TG711 = (() => {
  const TG = window.TG;
  const tick = ms => new Promise(r => setTimeout(r, ms || 0));
  const until = async (fn, ms) => { const t0 = Date.now(); while (!fn()) { if (Date.now() - t0 > (ms || 5000)) return false; await tick(30); } return true; };
  const fill = (sel, v) => { const i = document.querySelector(sel); if (!i) return; i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); };
  const drive = fn => { const p = Promise.resolve().then(fn); return { done: p.catch(e => e) }; };
  const imgs = () => Promise.all([...document.querySelectorAll('img')].filter(i => !i.complete)
    .map(i => new Promise(r => { i.onload = i.onerror = r; setTimeout(r, 1500); })));
  /* نادٍ بحسابات: مالكة ومديرة واستقبال ومدرّبة، وبيانات تجريبية */
  const club = async (P) => {
    const { Settings, Auth, Svc, Seed } = TG;
    if (!TG.DB.count('members')) await Seed.loadDemo(12);
    if (!Auth.enabled()) { await Settings.set({ authEnabled: true }); Auth.restoreSession(); }
    let rec = { recoveryCode: null };
    if (!TG.Repos.users.list(true).length) {
      rec = await Auth.setupFirstAdmin({ name: 'المالكة', username: 'owner1', password: P.OWNER_PW });
      await Svc.users.create({ username: 'manager1', name: 'المديرة', roleKey: 'manager', password: P.MANAGER_PW });
      await Svc.users.create({ username: 'reception1', name: 'الاستقبال', roleKey: 'reception', password: P.RECEPTION_PW });
      await Svc.users.create({ username: 'trainer1', name: 'المدرّبة', roleKey: 'trainer', password: P.TRAINER_PW });
    }
    return rec;
  };
  return { tick, until, fill, drive, imgs, club };
})();`;
