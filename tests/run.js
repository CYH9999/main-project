/* ============================================================================
   مشغّل اختبارات تبارك جيم
   يرفع الملف على خادم محلي (IndexedDB لا تعمل على file://)، يفتحه في متصفح
   حقيقي، ثم يشغّل مجموعات الاختبار كلٌّ في سياق تخزين نظيف.
   ========================================================================== */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.join(__dirname, '..');
const APP_FILE = 'tabarak-gym 3.0.html';
const CHROME = process.env.TG_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const TESTS_JS = fs.readFileSync(path.join(__dirname, 'browser-tests.js'), 'utf8');

const only = process.argv.slice(2).filter(a => !a.startsWith('-'));
const groups = [];
const results = [];

function serve(){
  return new Promise(res => {
    const srv = http.createServer((req, r) => {
      const url = decodeURIComponent(req.url.split('?')[0]);
      const file = url === '/' ? APP_FILE : url.replace(/^\//, '');
      const full = path.join(ROOT, file);
      if (!full.startsWith(ROOT) || !fs.existsSync(full)){ r.writeHead(404); return r.end('not found'); }
      r.writeHead(200, { 'Content-Type': full.endsWith('.js') ? 'text/javascript; charset=utf-8' : 'text/html; charset=utf-8' });
      r.end(fs.readFileSync(full));
    });
    srv.listen(0, '127.0.0.1', () => res(srv));
  });
}

function group(name, fn){ groups.push({ name, fn }); }

async function openApp(browser, url, opts = {}){
  const ctx = await browser.newContext(opts.context || {});
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  /* طلب favicon المفقود ضجيج متصفح لا خطأ في النظام */
  const noise = t => /favicon|Failed to load resource: the server responded with a status of 404/i.test(t);
  page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 30000 });
  await page.evaluate(() => window.TG.ready);
  await page.addScriptTag({ content: TESTS_JS });
  return { ctx, page, errors };
}

/* تُعيد الصفحة نتائج مجموعة واحدة بعد تهيئة بيانات تجريبية */
async function runIn(page, body){
  const out = await page.evaluate(body);
  return out;
}

function record(groupName, rows, errors){
  rows.forEach(r => results.push({ group: groupName, ...r }));
  (errors || []).forEach(e => results.push({ group: groupName, name: 'أخطاء المتصفح', pass: false, detail: e }));
}

/* ------------------------------ المجموعات ------------------------------ */
group('ثوابت المال', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(25);
    window.TGTests.reset();
    await window.TGTests.money();
    return window.TGTests.results;
  });
  await ctx.close();
  record('ثوابت المال', rows, errors);
});

group('ثوابت المخزون', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(25);
    window.TGTests.reset();
    await window.TGTests.stock();
    return window.TGTests.results;
  });
  await ctx.close();
  record('ثوابت المخزون', rows, errors);
});

group('ثوابت الاشتراك', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.subscriptions();
    return window.TGTests.results;
  });
  await ctx.close();
  record('ثوابت الاشتراك', rows, errors);
});

group('الترقية v4 ⇐ v7', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(4);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v4 ⇐ v7', rows, errors);
});

group('الترقية v5 ⇐ v7', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(5);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v5 ⇐ v7', rows, errors);
});

group('الترقية v3 ⇐ v7', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(3);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v3 ⇐ v7', rows, errors);
});

group('الترقية v6 ⇐ v7', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(6);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v6 ⇐ v7', rows, errors);
});

/* ---------------------- مجموعات المرحلة الثانية ---------------------- */
group('طرق رأس المال', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.capitalMethods();
    return window.TGTests.results;
  });
  await ctx.close();
  record('طرق رأس المال', rows, errors);
});

group('دورة الشراء من المورّد', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.purchases();
    return window.TGTests.results;
  });
  await ctx.close();
  record('دورة الشراء من المورّد', rows, errors);
});

group('تفصيل توزيعات الشركاء', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.allocations();
    return window.TGTests.results;
  });
  await ctx.close();
  record('تفصيل توزيعات الشركاء', rows, errors);
});

group('الإقفال المُعان', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.periodClose();
    return window.TGTests.results;
  });
  await ctx.close();
  record('الإقفال المُعان', rows, errors);
});

group('نموذج الحصص', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.classes();
    return window.TGTests.results;
  });
  await ctx.close();
  record('نموذج الحصص', rows, errors);
});

group('العملة والجداول', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.guards();
    return window.TGTests.results;
  });
  await ctx.close();
  record('العملة والجداول', rows, errors);
});

group('البيانات التجريبية', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    window.TGTests.reset();
    await window.TGTests.demo();
    return window.TGTests.results;
  });
  await ctx.close();
  record('البيانات التجريبية', rows, errors);
});

group('الاستمرارية', async (browser, url) => {
  /* IndexedDB: الكتابة تنجو من إعادة التحميل */
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await page.evaluate(() => window.TG.ready);
  const kind = await page.evaluate(() => window.TG.DB.adapter.kind);
  const rows = [{ name:'المحرّك الافتراضي هو IndexedDB', pass: kind === 'indexeddb', detail: kind }];
  await page.addScriptTag({ content: TESTS_JS });
  const id = await page.evaluate(() => window.TGTests.writeProbe());
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await page.evaluate(() => window.TG.ready);
  await page.addScriptTag({ content: TESTS_JS });
  const after = await page.evaluate(pid => { window.TGTests.reset(); window.TGTests.probeExists(pid); return window.TGTests.results; }, id);
  await ctx.close();
  record('الاستمرارية', rows.concat(after), errors);

  /* التخزين الاحتياطي: منع IndexedDB يجب ألا يمنع الإقلاع */
  const ctx2 = await browser.newContext();
  await ctx2.addInitScript(() => { try { delete window.indexedDB; } catch(e){ window.indexedDB = undefined; } });
  const p2 = await ctx2.newPage();
  await p2.goto(url, { waitUntil:'domcontentloaded' });
  await p2.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await p2.evaluate(() => window.TG.ready);
  const kind2 = await p2.evaluate(() => window.TG.DB.adapter.kind);
  await ctx2.close();
  record('الاستمرارية', [{ name:'النظام يقلع على التخزين المحلي حين يُمنع IndexedDB',
    pass: kind2 === 'localstorage', detail: kind2 }], []);

  /* وضع الذاكرة: يقلع ويُظهر تحذيره */
  const ctx3 = await browser.newContext();
  await ctx3.addInitScript(() => {
    try { delete window.indexedDB; } catch(e){ window.indexedDB = undefined; }
    const blocked = () => { throw new Error('blocked'); };
    try { Object.defineProperty(window, 'localStorage', { get: blocked, configurable:true }); } catch(e){}
  });
  const p3 = await ctx3.newPage();
  await p3.goto(url, { waitUntil:'domcontentloaded' });
  await p3.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await p3.evaluate(() => window.TG.ready);
  const kind3 = await p3.evaluate(() => window.TG.DB.adapter.kind);
  const warned = await p3.evaluate(() => {
    const t = [...document.querySelectorAll('.toast, [class*="toast"]')].map(x => x.textContent).join(' ');
    return /لن تبقى|يمنع الحفظ/.test(t);
  });
  await ctx3.close();
  record('الاستمرارية', [
    { name:'النظام يقلع في الذاكرة حين يُمنع كل تخزين', pass: kind3 === 'memory', detail: kind3 },
    { name:'وضع الذاكرة يُظهر تحذيره للمستخدمة', pass: warned, detail: String(warned) }
  ], []);
});

group('مسار الاستقبال الكامل', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    const { Svc, Repos, D, U, Calc, Settings, DB } = window.TG;
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;

    /* 1) مشتركة جديدة */
    const { rec: member } = await Svc.members.create({ name:'سارة اختبار', phone:'07700000000', joinDate:D.today() });
    ok('مشتركة جديدة بالاسم وحده', !!member.id && !!member.code, member.code);

    /* 2) اشتراك بدفعة جزئية */
    const { rec: sub } = await Svc.subs.create({ memberId:member.id, startDate:D.today(),
      customDuration:{ value:1, unit:'month' }, price:120000, paidAmount:50000, paymentMethod:'cash' });
    let bal = Svc.subs.balance(sub);
    ok('الاشتراك يسجّل المستحق كاملاً والمقبوض جزئياً', bal.total === 120000 && bal.paid === 50000 && bal.due === 70000,
       JSON.stringify(bal));

    /* 3) وصل الدفعة الأولى */
    const p1 = Svc.payments.forRef('subscription', sub.id)[0];
    const rc1 = await Svc.receipts.ensure(p1.id);
    ok('الدفعة الأولى لها وصل مرقّم', !!rc1.no, rc1.no);

    /* 4) قبض الباقي */
    const p2 = await Svc.payments.add({ refType:'subscription', refId:sub.id, memberId:member.id,
      date:D.today(), amount:70000, method:'transfer' });
    bal = Svc.subs.balance(Repos.subs.get(sub.id));
    ok('قبض المتبقّي يُغلق المستند', bal.due === 0 && bal.paid === 120000, JSON.stringify(bal));
    const rc2 = await Svc.receipts.ensure(p2.id);
    ok('الدفعة الثانية لها وصل برقم مختلف', rc2.no !== rc1.no, `${rc1.no} / ${rc2.no}`);
    ok('«المدفوع سابقاً» في الوصل الثاني هو الدفعة الأولى وحدها',
       rc2.snapshot.payment.paidBefore === 50000, rc2.snapshot.payment.paidBefore);
    ok('«المدفوع سابقاً» في الوصل الأول صفر رغم اتحاد اليوم',
       rc1.snapshot.payment.paidBefore === 0, rc1.snapshot.payment.paidBefore);

    /* 5) إعادة الطباعة: العدّاد +1 والمال ثابت */
    const before = { rev: r2(U.sum(Repos.revenues.list(true), r => r.amount)),
                     pay: r2(U.sum(Repos.payments.list(true), p => p.amount)) };
    await Svc.receipts.markPrinted(rc2.id);
    const n1 = Repos.receipts.get(rc2.id).reprints;
    await Svc.receipts.markPrinted(rc2.id);
    const n2 = Repos.receipts.get(rc2.id).reprints;
    const after = { rev: r2(U.sum(Repos.revenues.list(true), r => r.amount)),
                    pay: r2(U.sum(Repos.payments.list(true), p => p.amount)) };
    ok('إعادة الطباعة تزيد العدّاد واحداً', n2 === n1 + 1, `${n1} → ${n2}`);
    ok('إعادة الطباعة لا تغيّر الإيراد ولا المقبوض',
       before.rev === after.rev && before.pay === after.pay, JSON.stringify({ before, after }));

    /* 6) تجميد */
    const soldEnd = Repos.subs.get(sub.id).endDate;
    await Svc.membership.freeze(sub.id, { from:D.addDays(D.today(), 1), to:D.addDays(D.today(), 4), reason:'سفر' });
    const frozen = Repos.subs.get(sub.id);
    ok('التجميد أربعة أيام يمدّ النهاية أربعة أيام', D.diffDays(soldEnd, frozen.endDate) === 4,
       `${soldEnd} → ${frozen.endDate}`);
    ok('التجميد لا يمسّ النهاية الأصلية', frozen.baseEndDate === soldEnd, frozen.baseEndDate);

    /* 7) تسجيل حضور */
    const att = await Svc.attendance.checkIn({ memberId:member.id, date:D.today(), method:'code' });
    ok('الحضور يُسجَّل بطريقة «كود المشتركة»', att.rec.method === 'code', att.rec.method);

    /* 8) بيع */
    const prod = Repos.products.list()[0] || (await window.TG.Svc.inventory.saveProduct(null,
      { name:'ماء', unit:'قنينة', price:1000, cost:500, minStock:1, openingQty:20 })).rec;
    const { rec: sale } = await Svc.sales.create({ date:D.today(), memberId:member.id,
      lines:[{ productId:prod.id, qty:2, unitPrice:1000, discount:0 }], discount:0,
      paidAmount:'', paymentMethod:'cash' });
    ok('الفاتورة تُسجَّل مدفوعة بالكامل', Svc.sales.balance(sale).due === 0, JSON.stringify(Svc.sales.balance(sale)));
    const salePay = Svc.payments.forRef('sale', sale.id)[0];
    const rc3 = await Svc.receipts.ensure(salePay.id);
    ok('فاتورة البيع تُطبع بوصل مرقّم مثل الاشتراك', !!rc3.no && rc3.refType === 'sale', rc3.no);

    /* 9) إقفال الصندوق */
    const pv = Svc.cashbook.preview(D.today());
    const closed = await Svc.cashbook.close({ date:D.today(), countedCash:pv.expected, openingCash:pv.opening });
    ok('الإقفال بلا فرق يُقبل', closed.difference === 0, String(closed.difference));
    ok('الإقفال يحفظ تفصيل الطرق', Array.isArray(closed.byMethod) && closed.byMethod.length,
       JSON.stringify((closed.byMethod || []).map(m => m.key)));
    let blocked = false;
    try { await Svc.cashbook.close({ date:D.today(), countedCash:pv.expected - 1000, openingCash:pv.opening, reopen:true }); }
    catch(e){ blocked = e.code === 'VALIDATION'; }
    ok('الفرق بلا تفسير يُمنع من الإقفال', blocked);

    return out;
  });
  await ctx.close();
  record('مسار الاستقبال الكامل', rows, errors);
});

group('النماذج والشاشات المنبثقة', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.modals();
    return window.TGTests.results;
  });
  await ctx.close();
  record('النماذج والشاشات المنبثقة', rows, errors);
});

const P1 = [
  ['حفظ وطباعة وصل', 'saveAndPrint', 25],
  ['الاستقبال السريع', 'desk', 25],
  ['ملاحظات الفريق', 'notes', 20],
  ['الفترات وتوزيعات الشركاء', 'distributions', 25],
  ['الحصص المشمولة', 'creditsOnArchive', 20],
  ['البحث العام', 'search', 25],
  ['الشاشة الافتتاحية', 'startScreen', 10]
];
P1.forEach(([name, fn, seed]) => group(name, async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await page.evaluate(async ([f, n]) => {
    await window.TG.Seed.loadDemo(n);
    window.TGTests.reset();
    await window.TGTests[f]();
    return window.TGTests.results;
  }, [fn, seed]);
  await ctx.close();
  record(name, rows, errors);
}));

group('المسار الحرج الكامل للمرحلة الأولى', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    const { Svc, Repos, D, U, Calc, Settings, Actions, Print, DB } = window.TG;
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const rev = () => r2(U.sum(Repos.revenues.list(true), x => x.amount));
    const pay = () => r2(U.sum(Repos.payments.list(true), x => x.amount));

    /* 1) مشتركة بأقل المعلومات: الاسم وحده */
    const { rec: m } = await Svc.members.create({ name:'نور الهدى' });
    ok('1. مشتركة تُنشأ بالاسم وحده', !!m.id && !!m.code && !m.phone, m.code);

    /* 2) فتح ملفها */
    window.TG.go('member', { id:m.id }); window.TG.renderRoute();
    const profileHtml = () => document.getElementById('viewRoot').innerHTML;
    ok('2. ملف المشتركة يفتح باسمها', profileHtml().includes(U.esc(m.name)));

    /* 3) اشتراك */
    const { rec: sub } = await Svc.subs.create({ memberId:m.id, startDate:D.today(),
      customDuration:{ value:1, unit:'month' }, price:120000, paidAmount:0 });
    ok('3. الاشتراك يُسجَّل بمستحقّه كاملاً', Svc.subs.balance(sub).total === 120000);

    /* 4) دفعة جزئية */
    const p1 = await Svc.payments.add({ refType:'subscription', refId:sub.id, memberId:m.id,
      date:D.today(), amount:50000, method:'cash' });
    let bal = Svc.subs.balance(Repos.subs.get(sub.id));
    ok('4. الدفعة الجزئية تُسجَّل والمتبقّي يُحسب', bal.paid === 50000 && bal.due === 70000, JSON.stringify(bal));

    /* 5) حفظ + طباعة وصل (مع منع النافذة لمحاكاة الواقع) */
    const realOpen = window.open; window.open = () => null;
    const rc1 = await Actions.saveAndPrintReceipt(p1.id, 'تم القبض');
    window.open = realOpen;
    ok('5. «حفظ وطباعة وصل» يصدر وصلاً مرقّماً', !!rc1 && !!rc1.no, rc1 && rc1.no);

    /* 6) الدفعة محفوظة فعلاً على القرص */
    const onDisk = (await DB.adapter.getAll('payments')).some(x => x.id === p1.id);
    ok('6. الدفعة محفوظة على القرص لا في الذاكرة فقط', onDisk);

    /* 7) الوصل موجود */
    ok('7. الوصل موجود ومربوط بالدفعة', !!Svc.receipts.forPayment(p1.id));

    /* 8) إعادة فتح الملف */
    window.TG.go('member', { id:m.id, tab:'money' }); window.TG.renderRoute();
    const money = profileHtml();
    ok('8. تبويب «المالية والوصولات» يفتح', money.includes('دفتر الحساب'));

    /* 9) الوصل مرئي مباشرة من تبويب المالية */
    ok('9. رقم الوصل ظاهر في تبويب المالية', money.includes(U.esc(rc1.no)));
    ok('9ب. زر طباعة الوصل متاح على صف الدفعة', money.includes('data-receipt='));

    /* 10) قبض المتبقّي */
    const p2 = await Svc.payments.add({ refType:'subscription', refId:sub.id, memberId:m.id,
      date:D.today(), amount:70000, method:'transfer' });
    bal = Svc.subs.balance(Repos.subs.get(sub.id));
    ok('10. قبض المتبقّي يُغلق المستند', bal.due === 0 && bal.paid === 120000, JSON.stringify(bal));

    /* 11) طباعة/إعادة طباعة الوصل الثاني */
    const revBefore = rev(), payBefore = pay();
    const rc2 = await Svc.receipts.ensure(p2.id);
    ok('11. الوصل الثاني برقم مختلف', rc2.no !== rc1.no, `${rc1.no} / ${rc2.no}`);
    await Svc.receipts.markPrinted(rc2.id);
    const n1 = Repos.receipts.get(rc2.id).reprints;
    await Svc.receipts.markPrinted(rc2.id);
    ok('11ب. إعادة الطباعة تزيد العدّاد', Repos.receipts.get(rc2.id).reprints === n1 + 1);

    /* 12) لا إيراد مكرّر */
    ok('12. الطباعة وإعادتها لا تُنشئان إيراداً', rev() === revBefore && pay() === payBefore,
       JSON.stringify({ revBefore, now:rev() }));
    const revLines = Repos.revenues.list(true).filter(x => x.paymentId === p2.id).length;
    ok('12ب. لكل دفعة سطر إيراد واحد', revLines === 1, revLines);

    /* 13) تجميد */
    const soldEnd = Repos.subs.get(sub.id).endDate;
    await Svc.membership.freeze(sub.id, { from:D.today(), to:D.addDays(D.today(), 6), reason:'سفر' });
    ok('13. التجميد يمدّ النهاية سبعة أيام', D.diffDays(soldEnd, Repos.subs.get(sub.id).endDate) === 7);

    /* 14) محاولة الحضور أثناء التجميد */
    ok('14. النظام يعرف أنها مجمّدة اليوم', !!Svc.membership.frozenOn(sub.id));
    ok('14ب. حالتها تُقرأ «مجمّد»', Svc.members.status(m.id).status.key === 'FROZEN',
       Svc.members.status(m.id).status.key);

    /* 15) إنهاء التجميد */
    const r = await Svc.membership.endFreezeToday(sub.id, 'دخلت النادي');
    ok('15. إنهاء التجميد اليوم يرفعه', !Svc.membership.frozenOn(sub.id));
    ok('15ب. تجميد بدأ اليوم يُلغى بلا احتساب', r.cancelled === true);
    ok('15ج. النهاية تعود كما بيعت', Repos.subs.get(sub.id).endDate === soldEnd,
       `${Repos.subs.get(sub.id).endDate} ≠ ${soldEnd}`);

    /* 16) الحضور بالكود + Enter */
    const att = await Actions.deskEnter(m.code);
    ok('16. كود + Enter يسجّل الحضور', !!att && att.memberId === m.id);

    /* 17) التحقّق من الحضور */
    ok('17. الحضور مسجَّل بتاريخ اليوم وبطريقة الكود',
       att.date === D.today() && att.method === 'code', `${att.date}/${att.method}`);
    ok('17ب. الحضور محفوظ على القرص', (await DB.adapter.getAll('attendance')).some(x => x.id === att.id));

    /* 18) التجديد */
    const def = Svc.members.renewalDefaults(m.id);
    const oldSnapshot = U.clone(Repos.subs.get(sub.id));
    const { rec: renew } = await Svc.subs.create({ memberId:m.id, startDate:def.startDate,
      customDuration:def.duration, price:def.price, paidAmount:def.price });
    ok('18. التجديد يُنشئ اشتراكاً جديداً', renew.id !== sub.id);

    /* 19) بداية التجديد صحيحة */
    ok('19. التجديد يبدأ في اليوم التالي للنهاية الحالية',
       renew.startDate === D.addDays(oldSnapshot.endDate, 1), `${renew.startDate} vs ${oldSnapshot.endDate}`);

    /* 20) السجل القديم لم يتغيّر */
    const after = Repos.subs.get(sub.id);
    ok('20. الاشتراك السابق لم يتغيّر',
       after.startDate === oldSnapshot.startDate && after.endDate === oldSnapshot.endDate
       && after.finalPrice === oldSnapshot.finalPrice && after.baseEndDate === oldSnapshot.baseEndDate);

    /* 21) البحث العام */
    const box = document.getElementById('globalSearchRes');
    Actions.globalSearch(m.name.slice(0, 3));
    ok('21. البحث يجدها والمشتركات أولاً',
       box.innerHTML.includes(U.esc(m.name)) && (box.querySelector('.gs-group') || {}).textContent.startsWith('مشتركات'));

    /* 22) فتحها مباشرة بالكود */
    Actions.globalSearch(m.code);
    ok('22. الكود الكامل يقفز إليها مباشرة', box.innerHTML.includes('مطابقة تامة للكود'));

    /* 23) الأفعال السياقية */
    ok('23. صف المشتركة يحمل حضور/تجديد/قبض',
       (() => { Actions.globalSearch(m.name.slice(0, 3));
         return ['حضور','تجديد','قبض'].every(t => box.innerHTML.includes(`>${t}<`)); })());

    /* 24) الصندوق اليومي */
    const cash = Svc.cashbook.preview(D.today());
    ok('24. المتوقّع = الافتتاحي + الداخل − الخارج',
       r2(cash.expected) === r2(cash.opening + cash.cashIn - cash.cashOut), JSON.stringify(cash));
    ok('24ب. جدول الطرق يفصل النقدي عن غيره',
       (cash.byMethod || []).some(x => x.key === 'cash') && (cash.byMethod || []).some(x => x.key === 'transfer'),
       JSON.stringify((cash.byMethod || []).map(x => x.key)));

    /* 25) فاتورة بيع */
    const prod = Repos.products.list()[0]
      || (await Svc.inventory.saveProduct(null, { name:'ماء', unit:'قنينة', price:1000, cost:500, minStock:1, openingQty:30 })).rec;
    const stockBefore = Svc.inventory.onHand(prod.id);
    const { rec: sale } = await Svc.sales.create({ date:D.today(), memberId:m.id,
      lines:[{ productId:prod.id, qty:2, unitPrice:1000, discount:0 }], discount:0,
      paidAmount:'', paymentMethod:'card' });
    ok('25. الفاتورة تُسجَّل وتخصم المخزون',
       Svc.sales.balance(sale).due === 0 && Svc.inventory.onHand(prod.id) === stockBefore - 2);

    /* 26) وصل الفاتورة */
    const salePay = Actions.lastPaymentOf('sale', sale.id);
    const rc3 = await Svc.receipts.ensure(salePay.id);
    ok('26. فاتورة البيع لها وصل مرقّم', !!rc3.no && rc3.refType === 'sale', rc3.no);

    /* 27) النقدي وغير النقدي */
    const mv = Svc.cashbook.movement(D.today());
    const cardPaid = r2(U.sum(Repos.payments.list().filter(x => x.date === D.today() && x.method === 'card'), x => x.amount));
    ok('27. البطاقة لا تدخل الدرج', cardPaid > 0 && mv.nonCash >= cardPaid, `nonCash=${mv.nonCash} card=${cardPaid}`);
    ok('27ب. النقدي وحده في cashIn',
       r2(mv.cashIn) === r2(U.sum(mv.rows.paymentsIn, x => x.amount) + U.sum(mv.rows.otherIn, x => x.amount)
                            + U.sum(mv.rows.capIn, x => x.amount)), mv.cashIn);

    /* 28) توزيع أرباح */
    const partner = Repos.partners.list()[0] || await Repos.partners.create({ name:'شريكة', sharePercent:50 });
    const key = D.monthsBack(5)[0];
    if (Svc.periods.isClosed(key)) await Svc.periods.reopen(key, 'تهيئة الاختبار');
    await Svc.periods.close(key);
    const profitBefore = Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(),
      D.startOfMonth(key), D.endOfMonth(key));
    const cashBefore = Svc.finance.summary().cash;
    const { rec: dist } = await Svc.distributions.create({ partnerId:partner.id,
      periodFrom:D.startOfMonth(key), periodTo:D.endOfMonth(key), amount:10000,
      date:D.today(), method:'cash' });
    ok('28. التوزيع يُسجَّل', !!dist.id);

    /* 29) السيولة تنقص */
    ok('29. التوزيع يقلّل السيولة', r2(Svc.finance.summary().cash) === r2(cashBefore - 10000),
       `${cashBefore} → ${Svc.finance.summary().cash}`);

    /* 30) الربح لا ينقص */
    ok('30. التوزيع لا يقلّل الربح',
       r2(Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), D.startOfMonth(key), D.endOfMonth(key))) === r2(profitBefore));
    ok('30ب. التوزيع لا يظهر مصروفاً', !Repos.expenses.list(true).some(e => e.amount === 10000 && e.refId === dist.id));

    /* 31) طباعة كشف الشريكة */
    const html = Print.partnerStatementHtml(partner.id);
    ok('31. كشف الشريكة يُطبع ويحوي الاستحقاق والتوزيع',
       html.includes('كشف حساب شريكة') && html.includes('استحقاق الأرباح') && html.includes('التوزيعات المدفوعة'));

    return out;
  });
  await ctx.close();
  record('المسار الحرج الكامل للمرحلة الأولى', rows, errors);
});

group('النسخ الاحتياطي والاستعادة', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    const { Backup, DB, STORE_NAMES, Repos, U, Svc, Settings } = window.TG;
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    await Svc.members.create({ name:'قبل النسخة' });
    await window.TG.Seed.loadDemo(15);
    const m = Repos.members.list()[0];
    await Svc.notes.add({ memberId:m.id, text:'ملاحظة قبل النسخة', author:'المالكة' });

    const before = Object.fromEntries(STORE_NAMES.map(s => [s, DB.count(s)]));
    const periodsBefore = Svc.periods.list().length;
    const b = Backup.build(false);
    ok('النسخة تشمل كل الجداول', STORE_NAMES.every(s => Array.isArray(b.data[s])),
       STORE_NAMES.filter(s => !Array.isArray(b.data[s])).join('، '));
    ok('النسخة تشمل جدول الملاحظات', (b.data.notes || []).length > 0, (b.data.notes || []).length);
    ok('النسخة تشمل جدول التوزيعات', Array.isArray(b.data.distributions));
    ok('النسخة تحمل رقم المخطط الحالي', b.schema === window.TG.APP.schema, b.schema);

    /* تخريب متعمّد ثم استعادة */
    await Svc.members.create({ name:'بعد النسخة' });
    await Backup.restore(b);
    const after = Object.fromEntries(STORE_NAMES.map(s => [s, DB.count(s)]));
    /* سجل الأحداث يُستثنى: الاستعادة نفسها حدث يُسجَّل، وهذا مقصود */
    const diff = STORE_NAMES.filter(s => s !== 'audit' && before[s] !== after[s]);
    ok('الاستعادة تُرجع عدد السجلات كما كان', !diff.length,
       diff.map(s => `${s}:${before[s]}→${after[s]}`).join('، '));
    ok('الاستعادة نفسها تُسجَّل في سجل الأحداث', after.audit > before.audit, `${before.audit}→${after.audit}`);
    ok('الاستعادة تُرجع الملاحظات', Repos.notes.list().some(n => n.text === 'ملاحظة قبل النسخة'));
    ok('الاستعادة تُرجع الفترات المقفلة', Svc.periods.list().length === periodsBefore,
       `${periodsBefore} → ${Svc.periods.list().length}`);
    ok('السجل المضاف بعد النسخة لم يعد', !Repos.members.list(true).some(x => x.name === 'بعد النسخة'));

    /* إعادة التهيئة تمسح الجداول الجديدة أيضاً */
    await window.TG.Seed.factoryReset();
    /* يبقى حدث واحد: «إعادة تهيئة كاملة» — الأثر الوحيد المقصود بقاؤه */
    const left = STORE_NAMES.filter(s => s !== 'meta' && s !== 'audit' && DB.count(s) > 0);
    ok('إعادة التهيئة تفرّغ كل الجداول ومنها الجديدة', !left.length, left.join('، '));
    ok('لا يبقى بعد إعادة التهيئة إلا حدث تسجيلها',
       DB.count('audit') <= 1 && DB.all('audit').every(a => a.action === 'factory-reset'),
       `audit=${DB.count('audit')}`);
    ok('إعادة التهيئة تمسح الفترات المقفلة', Svc.periods.list().length === 0, Svc.periods.list().length);
    return out;
  });
  await ctx.close();
  record('النسخ الاحتياطي والاستعادة', rows, errors);
});

group('التقارير والتصديرات', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    const { Reports, Exporter, D, U, Repos, Svc, Calc } = window.TG;
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    await window.TG.Seed.loadDemo(20);
    const key = D.monthKey(D.today());
    const r = Reports.build(key);
    ok('التقرير يُبنى بلا خطأ', !!r && !!r.fin, r && r.key);
    ok('التقرير يفصل قيمة الاشتراكات عن المقبوض منها',
       typeof r.members.subsValue === 'number' && typeof r.members.subsRevenue === 'number',
       JSON.stringify({ v:r.members.subsValue, p:r.members.subsRevenue }));
    const revSubs = U.round2(U.sum(Calc.inRange(Repos.revenues.list(), r.from, r.to)
      .filter(x => x.source === 'subscription'), x => x.amount));
    ok('«المقبوض من الاشتراكات» يطابق سطور الإيراد', U.round2(r.members.subsRevenue) === revSubs,
       `${r.members.subsRevenue} ≠ ${revSubs}`);
    /* التصديرات تُبنى بلا رمي */
    let threw = '';
    try {
      Exporter.subRows(Repos.subs.list().slice(0, 5).map(s => ({ s, member:Repos.members.get(s.memberId) })));
      Exporter.dueRows(Svc.payments.openDues().slice(0, 5));
    } catch(e){ threw = e.message; }
    ok('صفوف التصدير تُبنى بلا خطأ', !threw, threw);
    return out;
  });
  await ctx.close();
  record('التقارير والتصديرات', rows, errors);
});

group('الطباعة الفعلية', async (browser, url) => {
  const ctx0 = await browser.newContext({ viewport:{ width:1440, height:960 } });
  const page = await ctx0.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await page.evaluate(() => window.TG.ready);

  /* بيانات قاسية عمداً: اسم طويل جداً ومبالغ بسبعة أرقام وفاتورة متعدّدة البنود */
  const ids = await page.evaluate(async () => {
    await window.TG.Seed.loadDemo(20);
    const { Svc, Repos, D, Actions } = window.TG;
    const { rec:m } = await Svc.members.create({ name:'فاطمة عبد الرحمن محمد الحسيني الجبوري العنزي', phone:'07901234567' });
    const { rec:sub } = await Svc.subs.create({ memberId:m.id, startDate:D.today(),
      customDuration:{ value:12, unit:'month' }, price:12750000, discount:250000, paidAmount:9500000, paymentMethod:'transfer' });
    const rc = await Svc.receipts.ensure(Actions.lastPaymentOf('subscription', sub.id).id);
    const idx = Svc.inventory.onHandIndex();
    const prods = Repos.products.list().filter(p => (idx[p.id] || 0) >= 3).slice(0, 4);
    let saleRcId = null;
    if (prods.length){
      const { rec:sale } = await Svc.sales.create({ date:D.today(), memberId:m.id,
        lines:prods.map(p => ({ productId:p.id, qty:3, unitPrice:p.price, discount:0 })),
        discount:5000, paidAmount:'', paymentMethod:'cash' });
      saleRcId = (await Svc.receipts.ensure(Actions.lastPaymentOf('sale', sale.id).id)).id;
    }
    const partner = Repos.partners.list()[0];
    const key = D.monthsBack(3)[0];
    if (partner && !Svc.periods.isClosed(key)) await Svc.periods.close(key);
    if (partner) await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(key),
      periodTo:D.endOfMonth(key), amount:120000, date:D.today(), method:'cash' }).catch(() => {});
    return { memberId:m.id, receiptId:rc.id, saleRcId, partnerId:partner && partner.id };
  });

  /* التقاط ما تكتبه نافذة الطباعة فعلاً بدل الاكتفاء بأن الدالة لم ترمِ */
  const capture = (code, a) => page.evaluate(([c, arg]) => {
    let out = '';
    const real = window.open;
    window.open = () => ({ document:{ write(h){ out += h; }, close(){} } });
    try { (new Function('a', 'return (' + c + ')(a)'))(arg); } finally { window.open = real; }
    return out;
  }, [code.toString(), a]);

  const docs = {
    'وصل A4':        await capture(a => TG.Print.open('و', TG.Print.receiptHtml(TG.Repos.receipts.get(a.receiptId), { format:'a4' }), {}), ids),
    'وصل شريط 80مم': await capture(a => TG.Print.open('و', TG.Print.receiptHtml(TG.Repos.receipts.get(a.receiptId), { format:'slip' }), { slip:true }), ids),
    'وصل فاتورة':    ids.saleRcId ? await capture(a => TG.Print.open('و', TG.Print.receiptHtml(TG.Repos.receipts.get(a.saleRcId), { format:'a4' }), {}), ids) : '',
    'كشف مشتركة':    await capture(a => TG.Print.open('ك', TG.Print.statementHtml(a.memberId), {}), ids),
    'كشف شريكة':     ids.partnerId ? await capture(a => TG.Print.open('ك', TG.Print.partnerStatementHtml(a.partnerId), {}), ids) : '',
    'كشف الصندوق':   await capture(() => TG.Print.open('ص', TG.Print.cashDayHtml(TG.D.today()), {}), ids),
    'التقرير الشهري': await capture(() => { const r = TG.Reports.build(TG.D.monthKey(TG.D.today()));
      return TG.UI.printSection('ت', TG.Reports.html(r, true), { plain:true }); }, ids),
    'قائمة المشتركات': await capture(() => { TG.go('members'); TG.renderRoute();
      const b = document.getElementById('mPrint'); if (b) b.click(); }, ids),
    'كشف المستحقات': await capture(() => { TG.State.f.financeTab = 'dues'; TG.go('finance'); TG.renderRoute();
      const b = document.getElementById('duPrint'); if (b) b.click(); }, ids)
  };

  const rows = [];
  for (const [name, html] of Object.entries(docs)){
    if (!html){ rows.push({ name:`${name}: يُولَّد`, pass:false, detail:'لم يُكتب أي HTML' }); continue; }
    rows.push({ name:`${name}: يُولَّد`, pass:true, detail:'' });
    const slip = name.includes('شريط');
    const p = await ctx0.newPage();
    await p.setContent(html, { waitUntil:'load' });
    await p.emulateMedia({ media:'print' });
    await p.setViewportSize({ width: slip ? 302 : 794, height:1123 });   /* عرض الورقة الحقيقي */
    await p.waitForTimeout(120);
    const m = await p.evaluate(() => {
      const de = document.documentElement;
      /* محاذاة الأعمدة: رأس الجدول وجسمه يجب أن يبدآ عند النقطة نفسها */
      const tables = [...document.querySelectorAll('table')].map(t => {
        const head = [...t.querySelectorAll('thead th')];
        const row = t.querySelector('tbody tr');
        if (!head.length || !row) return null;
        const body = [...row.children];
        if (head.length !== body.length) return { cells:`${head.length}/${body.length}`, bad:head.length };
        return { cells:head.length, bad:head.filter((h, i) =>
          Math.abs(h.getBoundingClientRect().left - body[i].getBoundingClientRect().left) > 3).length };
      }).filter(Boolean);
      /* القراءة بالأبيض والأسود: كل نصّ يجب أن يكون داكناً كفايةً على ورق أبيض */
      const lum = c => { const n = (c.match(/\d+/g) || []).slice(0, 3).map(Number);
        const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
        return 0.2126 * f(n[0]) + 0.7152 * f(n[1]) + 0.0722 * f(n[2]); };
      const faint = [];
      document.querySelectorAll('.doc *, .print-wrap *').forEach(el => {
        if (!el.textContent.trim() || el.children.length) return;
        const c = getComputedStyle(el).color;
        const ratio = (1.05) / (lum(c) + 0.05);
        if (ratio < 4.5) faint.push({ c, ratio:Math.round(ratio * 10) / 10, t:el.textContent.trim().slice(0, 25) });
      });
      return { overflow: de.scrollWidth > de.clientWidth + 1, tables,
               badTables: tables.filter(t => t.bad > 0).length, faint: faint.slice(0, 4), faintCount: faint.length,
               dir: de.getAttribute('dir'), hasText: document.body.innerText.trim().length > 40 };
    });
    await p.close();
    rows.push({ name:`${name}: بلا فيض أفقي على عرض الورقة`, pass:!m.overflow, detail:m.overflow ? 'النص يتجاوز عرض الورقة' : '' });
    rows.push({ name:`${name}: أعمدة الجداول تحت عناوينها`, pass:m.badTables === 0, detail:`جداول مختلّة=${m.badTables}` });
    rows.push({ name:`${name}: اتجاه الصفحة من اليمين`, pass:m.dir === 'rtl', detail:m.dir });
    rows.push({ name:`${name}: مقروء بالأبيض والأسود`, pass:m.faintCount === 0, detail:JSON.stringify(m.faint) });
  }

  /* الوصل يحمل ما يجعله وصلاً: رقم، مبلغ، طريقة، تاريخ */
  const rc = await page.evaluate(a => {
    const r = TG.Repos.receipts.get(a.receiptId);
    const h = TG.Print.receiptHtml(r, { format:'a4' });
    return { no:h.includes(r.no), amount:h.includes(TG.Money.fmt(r.amount)),
             method:h.includes(TG.PayMethods.label(r.snapshot.payment.method)),
             date:h.includes(TG.D.fmt(String(r.issuedAt).slice(0, 10))),
             member:h.includes(r.snapshot.member.name), gym:h.includes(TG.Settings.get('gymName')) };
  }, ids);
  Object.entries({ no:'رقم الوصل', amount:'المبلغ', method:'طريقة الدفع', date:'التاريخ',
                   member:'اسم المشتركة', gym:'اسم النادي' })
    .forEach(([k, label]) => rows.push({ name:`الوصل المطبوع يحمل ${label}`, pass:rc[k], detail:'' }));

  await ctx0.close();
  record('الطباعة الفعلية', rows, errors);
});

group('قبول التشغيل — يوم عمل كامل', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    const { Svc, Repos, D, U, Calc, Settings, Actions, PayMethods } = window.TG;
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    await window.TG.Seed.loadDemo(15);
    const today = D.today();

    const c0 = Svc.cashbook.expected(today);
    const cat = Repos.expCats.list()[0];
    const m = Repos.members.list()[0];

    /* يوم يحتوي كل ما يحدث في نادٍ حقيقي */
    const { rec:sub } = await Svc.subs.create({ memberId:m.id, startDate:today,
      customDuration:{ value:1, unit:'month' }, price:90000, paidAmount:30000, paymentMethod:'cash' });
    await Svc.payments.add({ refType:'subscription', refId:sub.id, memberId:m.id, date:today, amount:30000, method:'transfer' });
    await Svc.payments.add({ refType:'subscription', refId:sub.id, memberId:m.id, date:today, amount:30000, method:'card' });
    const expCash = await Svc.finance.addExpense({ date:today, amount:7000, categoryId:cat && cat.id,
      description:'مصروف نقدي', method:'cash' });
    const expBank = await Svc.finance.addExpense({ date:today, amount:11000, categoryId:cat && cat.id,
      description:'مصروف بتحويل', method:'transfer' });
    const expUnknown = await Repos.expenses.create({ date:today, amount:13000, categoryId:cat && cat.id,
      description:'راتب قديم بلا طريقة', method:PayMethods.UNKNOWN_KEY, refType:'payroll', refId:'x' });
    const idx = Svc.inventory.onHandIndex();
    const prod = Repos.products.list().find(p => (idx[p.id] || 0) >= 2);
    let sale = null;
    if (prod) sale = (await Svc.sales.create({ date:today, memberId:m.id,
      lines:[{ productId:prod.id, qty:2, unitPrice:prod.price, discount:0 }], discount:0,
      paidAmount:'', paymentMethod:'cash' })).rec;
    const partner = Repos.partners.list()[0];
    const key = D.monthsBack(4)[0];
    if (partner && !Svc.periods.isClosed(key)) await Svc.periods.close(key);
    const profitBefore = Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), D.startOfMonth(key), D.endOfMonth(key));
    const cashBeforeDist = Svc.finance.summary().cash;
    if (partner) await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(key),
      periodTo:D.endOfMonth(key), amount:15000, date:today, method:'cash' });

    const cv = Svc.cashbook.expected(today);
    const saleCash = sale ? sale.total : 0;
    /* الدرج: النقد وحده يدخله ويخرج منه */
    ok('الدرج يستقبل النقد وحده',
       r2(cv.cashIn - c0.cashIn) === r2(30000 + saleCash), `${r2(cv.cashIn - c0.cashIn)} مقابل ${r2(30000 + saleCash)}`);
    ok('التحويل والبطاقة خارج الدرج',
       r2(cv.nonCash - c0.nonCash) === 60000, `${r2(cv.nonCash - c0.nonCash)}`);
    ok('المصروف النقدي وتوزيع الأرباح النقدي يخرجان من الدرج',
       r2(cv.cashOut - c0.cashOut) === r2(7000 + (partner ? 15000 : 0)), `${r2(cv.cashOut - c0.cashOut)}`);
    ok('المصروف بتحويل لا يخرج من الدرج',
       !Repos.expenses.list().filter(e => e.id === expBank.id).some(e => Svc.cashbook.isCash(e.method)));
    ok('المصروف مجهول الطريقة معزول ومعلَن',
       r2(cv.unknownOut) >= 13000 && cv.movement.counts.unknownOut >= 1, `${cv.unknownOut}`);
    ok('المتوقّع = الافتتاحي + الداخل − الخارج',
       r2(cv.expected) === r2(cv.opening + cv.cashIn - cv.cashOut), JSON.stringify(cv));
    const methods = (cv.byMethod || []).map(x => x.key);
    ok('جدول الطرق يفصل النقد والتحويل والبطاقة',
       ['cash','transfer','card'].every(k => methods.includes(k)), methods.join(','));
    /* الصندوق ليس ربحاً */
    ok('توزيع الأرباح يقلّل السيولة ولا يقلّل الربح',
       partner ? (r2(Svc.finance.summary().cash) === r2(cashBeforeDist - 15000)
         && r2(Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), D.startOfMonth(key), D.endOfMonth(key))) === r2(profitBefore)) : true);
    ok('المصروفات لا تحوي التوزيع', !Repos.expenses.list(true).some(e => e.amount === 15000 && e.refType === 'distribution'));

    /* وصولات اليوم وطباعتها جميعاً */
    const paysToday = Repos.payments.list().filter(p => p.date === today);
    ok('اليوم فيه مقبوضات بأكثر من طريقة', paysToday.length >= 3, paysToday.length);
    const realOpen = window.open;
    let printedHtml = '';
    window.open = () => ({ document:{ write(h){ printedHtml += h; }, close(){} } });
    await Actions.printDayReceipts(today);
    window.open = realOpen;
    const issued = paysToday.filter(p => Svc.receipts.forPayment(p.id)).length;
    ok('«طباعة الكل» تُصدر وصلاً لكل دفعة اليوم', issued === paysToday.length, `${issued}/${paysToday.length}`);
    ok('صفحة الطباعة الجماعية تفصل الوصولات بفواصل صفحات',
       (printedHtml.match(/page-break/g) || []).length >= paysToday.length - 1,
       (printedHtml.match(/page-break/g) || []).length);
    const dup = {};
    Repos.receipts.list(true).forEach(r => { dup[r.no] = (dup[r.no] || 0) + 1; });
    ok('لا رقم وصل مكرّر', !Object.values(dup).some(n => n > 1));

    /* كشف اليوم المطبوع يطابق الشاشة */
    const sheet = window.TG.Print.cashDayHtml(today);
    ok('كشف اليوم المطبوع يحمل المتوقّع نفسه', sheet.includes(window.TG.Money.fmt(cv.expected)));
    ok('كشف اليوم يذكر المصروف مجهول الطريقة', sheet.includes('لا تُعرف طريقة صرفها'));
    return out;
  });
  await ctx.close();
  record('قبول التشغيل — يوم عمل كامل', rows, errors);
});

group('قبول الواجهة والخصوصية', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    const { Svc, Repos, D, U } = window.TG;
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    await window.TG.Seed.loadDemo(20);

    /* الأسئلة التي تسألها الموظفة، من الملف وحده */
    const m = Svc.members.rows().find(r => r.st.endDate) || Svc.members.rows()[0];
    window.TG.go('member', { id:m.m.id }); window.TG.renderRoute();
    const root = document.getElementById('viewRoot');
    const side = root.querySelector('.prof-side').innerText.replace(/\s+/g, ' ');
    const pane = root.querySelector('#pPane').innerText.replace(/\s+/g, ' ');
    const tabs = [...root.querySelectorAll('#pTabs .tab')].map(t => t.textContent.trim());
    ok('الملف يجيب: من هي؟', side.includes(m.m.name) && side.includes(m.m.code));
    ok('الملف يجيب: متى ينتهي اشتراكها؟', /نهاية الاشتراك/.test(side));
    ok('الملف يجيب: كم باقٍ عليها؟', /المتبقّي عليها/.test(side));
    ok('الملف يجيب: متى آخر حضور؟', /آخر زيارة/.test(side));
    ok('الملف يجيب: هل عليها إجراء الآن؟', /ما يحتاج انتباهاً/.test(pane));
    ok('ترتيب التبويبات كما اعتُمد',
       tabs.join('|') === 'نظرة عامة|الاشتراكات|المالية والوصولات|الحضور|اللياقة|البيانات والمستندات|السجل', tabs.join('|'));
    const quick = [...root.querySelectorAll('.prof-quick button')].map(b => b.textContent.trim());
    ok('أفعال سريعة صالحة في رأس الملف', quick.includes('تجديد') && quick.includes('تسجيل حضور'), quick.join('،'));
    ok('تلميح اكتمال الملف ظاهر', /اكتمال الملف/.test(side));

    /* المعلومات الحسّاسة لا تتسرّب */
    const target = Repos.members.list()[0];
    await Svc.members.update(target.id, { name:target.name, phone:target.phone,
      idNumber:'ID-SECRET-99887', idType:'هوية',
      health:{ notes:'إصابة سرية', allergies:'حساسية سرية' },
      emergency:{ name:'جهة سرية', phone:'07800000000' } });
    const leaks = s => /ID-SECRET-99887|إصابة سرية|حساسية سرية|07800000000/.test(s);
    const grab = (r, p) => { window.TG.go(r, p || undefined); window.TG.renderRoute();
      return document.getElementById('viewRoot').innerHTML; };
    ok('لا تسرّب في قائمة المشتركات', !leaks(grab('members')));
    ok('لا تسرّب في سجل الاشتراكات', !leaks(grab('subs')));
    ok('لا تسرّب في المستحقات', !leaks((window.TG.State.f.financeTab = 'dues', grab('finance'))));
    ok('لا تسرّب في التقارير', !leaks(grab('reports')));
    window.TG.Actions.globalSearch(target.name.slice(0, 3));
    ok('لا تسرّب في البحث العام', !leaks(document.getElementById('globalSearchRes').innerHTML));
    const pay = Svc.payments.ofMember(target.id)[0];
    if (pay){ const rc = await Svc.receipts.ensure(pay.id);
      ok('لا تسرّب في الوصل المطبوع', !leaks(window.TG.Print.receiptHtml(rc, { format:'a4' }))); }
    ok('لا تسرّب في كشف الحساب', !leaks(window.TG.Print.statementHtml(target.id)));
    ok('لا تسرّب في التنبيهات', !leaks(JSON.stringify(Svc.notify.build())));
    ok('المعلومات الحسّاسة موجودة في تبويبها وحده',
       leaks(grab('member', { id:target.id, tab:'docs' })), 'يجب أن تظهر هنا');
    return out;
  });
  await ctx.close();
  record('قبول الواجهة والخصوصية', rows, errors);
});

group('العرض الضيّق', async (browser, url) => {
  const ctx0 = await browser.newContext({ viewport:{ width:390, height:844 } });
  const page = await ctx0.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await page.evaluate(() => window.TG.ready);
  await page.evaluate(() => window.TG.Seed.loadDemo(20));
  const rows = await page.evaluate(async () => {
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const screens = [['الاستقبال','desk'], ['المشتركات','members'], ['لوحة التحكم','dashboard'],
      ['الحسابات','finance',{tab:'revenues'}], ['الصندوق اليومي','finance',{tab:'cash'}],
      ['الشركاء والأرباح','finance',{tab:'partners'}], ['التقارير','reports'], ['الإعدادات','settings']];
    for (const [name, r, p] of screens){
      window.TG.go(r, p || undefined); window.TG.renderRoute();
      await new Promise(x => setTimeout(x, 140));
      const de = document.documentElement;
      /* الصفحة نفسها يجب ألا تُجرّ أفقياً — الجدول العريض يُمرَّر داخل بطاقته */
      ok(`${name}: لا تمرير أفقي للصفحة`, de.scrollWidth <= de.clientWidth + 2,
         `${de.scrollWidth} > ${de.clientWidth}`);
      /* ولا زر يسقط خارج الحافة فلا يُضغط */
      const lost = [...document.querySelectorAll('#viewRoot button, .card-head button')].filter(b => {
        const x = b.getBoundingClientRect();
        if (!x.width) return false;
        let n = b.parentElement, scrolled = false;
        while (n && n !== document.body){ const o = getComputedStyle(n).overflowX;
          if (o === 'auto' || o === 'scroll'){ scrolled = true; break; } n = n.parentElement; }
        return !scrolled && (x.left < -2 || x.right > de.clientWidth + 2);
      }).map(b => b.textContent.trim().slice(0, 18));
      ok(`${name}: كل الأزرار داخل الشاشة`, !lost.length, lost.join('، '));
    }
    const m = window.TG.Repos.members.list()[0];
    window.TG.go('member', { id:m.id }); window.TG.renderRoute();
    await new Promise(x => setTimeout(x, 140));
    ok('ملف المشتركة: لا تمرير أفقي',
       document.documentElement.scrollWidth <= document.documentElement.clientWidth + 2);
    window.TG.Forms.member();
    await new Promise(x => setTimeout(x, 200));
    const ov = document.querySelector('.ov,.modal,.overlay');
    ok('النافذة المنبثقة تسع الشاشة', ov.getBoundingClientRect().width <= window.innerWidth + 2);
    ok('زر الحفظ في النافذة قابل للوصول',
       !![...ov.querySelectorAll('button')].find(b => /إضافة المشتركة/.test(b.textContent)));
    return out;
  });
  await ctx0.close();
  record('العرض الضيّق', rows, errors);
});

group('رسم كل الشاشات', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  await page.evaluate(() => window.TG.Seed.loadDemo(20));
  const rows = [];
  const routes = await page.evaluate(() => window.TG.buildNav() ||
    ['desk','dashboard','members','subs','crm','tasks','offers','pos','inventory',
     'attendance','classes','trainings','exercises','staff','payroll','finance','reports','settings']);
  const list = Array.isArray(routes) ? routes
    : ['desk','dashboard','members','subs','crm','tasks','offers','pos','inventory',
       'attendance','classes','trainings','exercises','staff','payroll','finance','reports','settings'];
  for (const r of list){
    const mark = errors.length;
    const drawn = await page.evaluate(route => {
      try { window.TG.go(route); window.TG.renderRoute(); }
      catch(e){ return 'THROW: ' + (e && e.message); }
      const root = document.getElementById('viewRoot');
      return root && root.children.length ? '' : 'شاشة فارغة';
    }, r);
    await page.waitForTimeout(80);
    const fresh = errors.slice(mark);
    rows.push({ name: `شاشة ${r} تُرسم بلا خطأ`, pass: !drawn && !fresh.length,
                detail: [drawn, ...fresh].filter(Boolean).join(' | ') });
  }
  /* الموردون مدخل ثانٍ لشاشة المخزون */
  {
    const mark = errors.length;
    const bad = await page.evaluate(() => {
      try { window.TG.go('inventory', { tab:'suppliers' }); window.TG.renderRoute(); return ''; }
      catch(e){ return 'THROW: ' + (e && e.message); }
    });
    await page.waitForTimeout(80);
    rows.push({ name:'شاشة الموردون تُرسم بلا خطأ', pass: !bad && errors.length === mark,
                detail: [bad, ...errors.slice(mark)].filter(Boolean).join(' | ') });
  }
  /* تبويبات المالية والإعدادات: أكثر ما تغيّر في هذه المرحلة */
  for (const tab of ['revenues','expenses','dues','capital','partners','cash']){
    const mark = errors.length;
    const bad = await page.evaluate(t => {
      try { window.TG.State.f.financeTab = t; window.TG.go('finance'); window.TG.renderRoute(); return ''; }
      catch(e){ return 'THROW: ' + (e && e.message); }
    }, tab);
    await page.waitForTimeout(60);
    rows.push({ name: `تبويب المالية «${tab}» يُرسم بلا خطأ`, pass: !bad && errors.length === mark,
                detail: [bad, ...errors.slice(mark)].filter(Boolean).join(' | ') });
  }
  for (const sec of ['general','brand','membership','fields','money','ops','backup','data','roles','audit','danger']){
    const mark = errors.length;
    const bad = await page.evaluate(s => {
      try { window.TG.go('settings', { sec:s }); window.TG.renderRoute(); return ''; }
      catch(e){ return 'THROW: ' + (e && e.message); }
    }, sec);
    await page.waitForTimeout(60);
    rows.push({ name: `قسم الإعدادات «${sec}» يُرسم بلا خطأ`, pass: !bad && errors.length === mark,
                detail: [bad, ...errors.slice(mark)].filter(Boolean).join(' | ') });
  }
  await ctx.close();
  record('رسم كل الشاشات', rows, []);
});

group('الأداء على قاعدة كبيرة', async (browser, url) => {
  const ctx0 = await browser.newContext({ viewport:{ width:1440, height:960 } });
  const page = await ctx0.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
  await page.evaluate(() => window.TG.ready);

  /* قاعدة بحجم نادٍ عامل سنتين: تُكتب دفعةً واحدة لأن المقيس هو القراءة والرسم */
  const built = await page.evaluate(async () => {
    const { DB, D } = window.TG;
    const now = new Date().toISOString(), today = D.today();
    let seq = 0; const uid = p => `${p}_${(seq++).toString(36)}_b`;
    const base = o => Object.assign({ createdAt:now, updatedAt:now, archived:false }, o);
    const pick = a => a[Math.floor(Math.random() * a.length)];
    const F = ['زهراء','فاطمة','نور','سجى','رقية','مريم','آية','هبة','دعاء','لينا'];
    const L = ['الموسوي','الحسيني','الزبيدي','الجابري','العبادي','الساعدي','الربيعي','التميمي'];
    const members = [], subs = [], payments = [], revenues = [], attendance = [],
          sales = [], stock = [], products = [], audit = [], receipts = [], notes = [];
    for (let i = 0; i < 500; i++)
      members.push(base({ id:uid('mem'), name:`${pick(F)} ${pick(L)}`, code:'ت' + String(i + 1).padStart(4, '0'),
        phone:'0770' + String(1000000 + i), joinDate:D.addDays(today, -(i % 900)), suspended:false, custom:{} }));
    for (let i = 0; i < 300; i++)
      products.push(base({ id:uid('prd'), name:`صنف ${i}`, sku:'S' + i, category:'مكمّلات', unit:'قطعة',
        price:1000 + i * 10, cost:500 + i * 5, minStock:3, active:true, stockTracked:true }));
    products.forEach(p => stock.push(base({ id:uid('stk'), productId:p.id, date:D.addDays(today, -400),
      type:'purchase', qty:500, unitCost:p.cost, refType:null, refId:null, expenseId:null })));
    for (let i = 0; i < 2000; i++){
      const m = members[i % members.length];
      const start = D.addDays(today, -(i % 800));
      const price = [45000, 60000, 90000, 120000][i % 4];
      subs.push(base({ id:uid('sub'), memberId:m.id, planId:null, planName:'شهر', durationValue:1,
        durationUnit:'month', durationLabel:'شهر', startDate:start, endDate:D.addDays(start, 29),
        baseEndDate:D.addDays(start, 29), price, discount:0, finalPrice:price, paymentMethod:'cash',
        sessionCredits:0, ptCredits:0 }));
    }
    for (let i = 0; i < 5000; i++){
      const s = subs[i % subs.length], amt = Math.round(s.finalPrice / 3);
      const pid = uid('pmt'), rid = uid('rev'), meth = i % 5 === 0 ? 'transfer' : 'cash';
      payments.push(base({ id:pid, refType:'subscription', refId:s.id, memberId:s.memberId, date:s.startDate,
        amount:amt, method:meth, notes:'', revenueId:rid }));
      revenues.push(base({ id:rid, date:s.startDate, amount:amt, source:'subscription', refId:s.id,
        paymentId:pid, description:'اشتراك', method:meth, notes:'' }));
      if (i % 4 === 0) receipts.push(base({ id:uid('rcp'), no:'و' + String(i).padStart(5, '0'),
        refType:'subscription', refId:s.id, paymentId:pid, memberId:s.memberId, amount:amt, issuedAt:now,
        issuedBy:'', format:'a4', reprints:0, lastPrintedAt:null, voided:false,
        snapshot:{ member:{ name:'', code:'' }, doc:{}, payment:{} } }));
    }
    for (let i = 0; i < 5000; i++)
      attendance.push(base({ id:uid('att'), memberId:members[i % members.length].id,
        date:D.addDays(today, -(i % 200)), time:'10:00', trainingId:null, sessionId:null,
        method:'staff', status:'in', checkOut:null, notes:'' }));
    for (let i = 0; i < 1000; i++){
      const p = products[i % products.length], sid = uid('sal');
      sales.push(base({ id:sid, code:'ف' + String(i).padStart(5, '0'), date:D.addDays(today, -(i % 300)),
        memberId:members[i % members.length].id, customerName:'',
        lines:[{ productId:p.id, name:p.name, qty:1, unitPrice:p.price, discount:0, unitCost:p.cost, total:p.price }],
        subtotal:p.price, discount:0, total:p.price, items:1, notes:'' }));
      stock.push(base({ id:uid('stk'), productId:p.id, date:D.addDays(today, -(i % 300)), type:'sale',
        qty:-1, unitCost:p.cost, refType:'sale', refId:sid, expenseId:null }));
    }
    for (let i = 0; i < 3000; i++)
      audit.push(base({ id:uid('aud'), ts:now, entity:'payment', action:'create', summary:'قبض', entityId:null }));
    for (let i = 0; i < 300; i++)
      notes.push(base({ id:uid('not'), memberId:members[i].id, text:'ملاحظة', kind:'general',
        date:today, author:'المالكة', pinned:false }));
    for (const [st, rows] of [['members',members],['products',products],['subscriptions',subs],
      ['payments',payments],['revenues',revenues],['receipts',receipts],['attendance',attendance],
      ['sales',sales],['stockMoves',stock],['audit',audit],['notes',notes]]) await DB.putMany(st, rows);
    return Object.fromEntries(window.TG.STORE_NAMES.map(s => [s, DB.count(s)]).filter(([, n]) => n));
  });

  /* إعادة التحميل: الإقلاع الحقيقي على قاعدة ممتلئة */
  const t0 = Date.now();
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:120000 });
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
  const rows = [];
  /* العتبات فضفاضة عمداً: الغرض كشف انهيار في التوسّع لا قياس دقيق يتذبذب */
  const cases = [
    ['الإقلاع الكامل', null, null, 6000, bootMs],
    ['لوحة التحكم', () => { TG.go('dashboard'); TG.renderRoute(); }, null, 1500],
    ['الاستقبال', () => { TG.go('desk'); TG.renderRoute(); }, null, 1500],
    ['قائمة 500 مشتركة', () => { TG.go('members'); TG.renderRoute(); }, null, 1500],
    ['Svc.members.rows()', () => { TG.Svc.members.rows(); }, null, 800],
    ['البحث العام', () => { TG.Actions.globalSearch('زهراء'); }, null, 1200],
    ['ملف مشتركة', a => { TG.go('member', { id:a }); TG.renderRoute(); }, mid, 1500],
    ['ملف مشتركة — المالية', a => { TG.go('member', { id:a, tab:'money' }); TG.renderRoute(); }, mid, 1500],
    ['سجل 2000 اشتراك', () => { TG.go('subs'); TG.renderRoute(); }, null, 1500],
    ['المستحقات', () => { TG.State.f.financeTab='dues'; TG.go('finance'); TG.renderRoute(); }, null, 2000],
    ['الصندوق اليومي', () => { TG.State.f.financeTab='cash'; TG.go('finance'); TG.renderRoute(); }, null, 1500],
    ['الشركاء والأرباح', () => { TG.State.f.financeTab='partners'; TG.go('finance'); TG.renderRoute(); }, null, 1500],
    ['بناء التقرير الشهري', () => { TG.Reports.build(TG.D.monthKey(TG.D.today())); }, null, 2000],
    ['سجل 5000 حضور', () => { TG.go('attendance'); TG.renderRoute(); }, null, 1500],
    ['بناء نسخة احتياطية', () => { TG.Backup.build(false); }, null, 2000],
    ['فحص سلامة البيانات', () => { TG.Integrity.scan(); }, null, 2000]
  ];
  const timings = {};
  for (const [name, code, arg, limit, preset] of cases){
    const ms = preset != null ? preset : await timeIt(code, arg);
    timings[name] = ms;
    rows.push({ name:`${name} — ${ms}ms (الحد ${limit}ms)`, pass: ms <= limit, detail: ms > limit ? 'أبطأ من الحد' : '' });
  }
  rows.push({ name:`حجم القاعدة: ${Object.values(built).reduce((a, b) => a + b, 0)} سجلاً`, pass:true,
              detail:JSON.stringify(built) });
  console.log('   ⏱  ' + Object.entries(timings).map(([k, v]) => `${k}=${v}ms`).join(' · '));
  await ctx0.close();
  record('الأداء على قاعدة كبيرة', rows, errors);
});

/* -------------------------------- التشغيل -------------------------------- */
(async () => {
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/`;
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--no-sandbox'] });
  const picked = only.length ? groups.filter(g => only.some(o => g.name.includes(o))) : groups;
  for (const g of picked){
    process.stdout.write(`▶ ${g.name}\n`);
    try { await g.fn(browser, url); }
    catch(e){ record(g.name, [{ name:'تعذّر تشغيل المجموعة', pass:false, detail:String(e && e.message || e) }], []); }
  }
  await browser.close();
  srv.close();

  let fails = 0, byGroup = {};
  results.forEach(r => {
    byGroup[r.group] = byGroup[r.group] || [];
    byGroup[r.group].push(r);
    if (!r.pass) fails++;
  });
  console.log('\n' + '='.repeat(78));
  Object.keys(byGroup).forEach(g => {
    const rows = byGroup[g];
    const bad = rows.filter(r => !r.pass).length;
    console.log(`\n${bad ? '✗' : '✓'} ${g}  (${rows.length - bad}/${rows.length})`);
    rows.forEach(r => console.log(`   ${r.pass ? '✓' : '✗'} ${r.name}${r.pass ? '' : '  ⟵ ' + r.detail}`));
  });
  console.log('\n' + '='.repeat(78));
  console.log(`المجموع: ${results.length - fails}/${results.length} اختباراً ناجحاً`);
  if (process.env.TG_JSON) fs.writeFileSync(process.env.TG_JSON, JSON.stringify(results, null, 2));
  process.exit(fails ? 1 : 0);
})();
