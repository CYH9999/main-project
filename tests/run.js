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

group('الترقية v4 ⇐ v5', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(4);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v4 ⇐ v5', rows, errors);
});

group('الترقية v3 ⇐ v5', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(3);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v3 ⇐ v5', rows, errors);
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
  for (const sec of ['general','brand','money','ops','fields','data']){
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
