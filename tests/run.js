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
/* متصفّح الاختبار: المسار المثبّت في بيئة التطوير إن وُجد، وإلا متصفّح
   Playwright نفسه — فالمجموعة تعمل على أي جهاز بلا ضبط يدويّ. */
const PINNED = process.env.TG_CHROME || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
const CHROME = fs.existsSync(PINNED) ? PINNED : undefined;
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

group('الترقية v4 ⇐ v8', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(4);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v4 ⇐ v8', rows, errors);
});

group('الترقية v5 ⇐ v8', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(5);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v5 ⇐ v8', rows, errors);
});

group('الترقية v3 ⇐ v8', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(3);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v3 ⇐ v8', rows, errors);
});

group('الترقية v6 ⇐ v8', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(6);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v6 ⇐ v8', rows, errors);
});

group('الترقية v7 ⇐ v8', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.migrations(7);
    return window.TGTests.results;
  });
  await ctx.close();
  record('الترقية v7 ⇐ v8', rows, errors);
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

group('سلامة بيانات دورة الشراء', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.integrityP2();
    return window.TGTests.results;
  });
  await ctx.close();
  record('سلامة بيانات دورة الشراء', rows, errors);
});

/* ---------------------- مجموعات المرحلة الثالثة-ج ---------------------- */
group('تكلفة المتجر المعروفة والمجهولة', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.storeCosting();
    return window.TGTests.results;
  });
  await ctx.close();
  record('تكلفة المتجر المعروفة والمجهولة', rows, errors);
});

group('التصديرات المحاسبية', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.accountingExports();
    return window.TGTests.results;
  });
  await ctx.close();
  record('التصديرات المحاسبية', rows, errors);
});

/* ---------------------- مجموعات المرحلة الثالثة-د ---------------------- */
group('تدقيق الإصدار — الاستعادة الصادقة', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    window.TGTests.reset();
    await window.TGTests.releaseAudit();
    return window.TGTests.results;
  });
  await ctx.close();
  record('تدقيق الإصدار — الاستعادة الصادقة', rows, errors);
});

/* شاشة 360 بكسل: أضيق جهاز حديث شائع. الجدول العريض يُمرَّر داخل بطاقته،
   والصفحة نفسها لا تُجرّ أفقياً، ولا يسقط زرّ خارج الحافة. */
group('العرض الضيّق 360', async (browser, url) => {
  const ctx0 = await browser.newContext({ viewport:{ width:360, height:740 } });
  const page = await ctx0.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errors.push(m.text()); });
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await page.evaluate(() => window.TG.ready);
  await page.evaluate(() => window.TG.Seed.loadDemo(30));
  const rows = await page.evaluate(async () => {
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const screens = [['لوحة التحكم','dashboard'], ['الاستقبال','desk'], ['المشتركات','members'],
      ['الاشتراكات','subs'], ['المبيعات','pos'], ['المخزون','inventory'],
      ['الإيرادات','finance',{tab:'revenues'}], ['المصروفات','finance',{tab:'expenses'}],
      ['المستحقات','finance',{tab:'dues'}], ['الصندوق اليومي','finance',{tab:'cash'}],
      ['المشتريات','inventory',{tab:'purchases'}], ['التقارير','reports'], ['الإعدادات','settings']];
    for (const [name, r, p] of screens){
      if (p && p.tab && r === 'finance') window.TG.State.f.financeTab = p.tab;
      window.TG.go(r, p || undefined); window.TG.renderRoute();
      await new Promise(x => setTimeout(x, 130));
      const de = document.documentElement;
      ok(`${name}: لا تمرير أفقي للصفحة على 360 بكسل`, de.scrollWidth <= de.clientWidth + 2,
         `${de.scrollWidth} > ${de.clientWidth}`);
      const lost = [...document.querySelectorAll('#viewRoot button')].filter(b => {
        const x = b.getBoundingClientRect();
        if (!x.width) return false;
        let n = b.parentElement, scrolled = false;
        while (n && n !== document.body){ if (/auto|scroll/.test(getComputedStyle(n).overflowX)){ scrolled = true; break; } n = n.parentElement; }
        return !scrolled && (x.right > de.clientWidth + 2 || x.left < -2);
      });
      ok(`${name}: لا زرّ خارج الحافة`, lost.length === 0, lost.length + ' زر');
    }
    /* شريط الصفحات هو ما كان يجرّ الصفحة: يجب أن يلتفّ لا أن يمتدّ */
    window.TG.go('members'); window.TG.renderRoute();
    await new Promise(x => setTimeout(x, 130));
    const pager = document.querySelector('.pager');
    ok('شريط الصفحات يلتفّ على الشاشة الضيّقة', !!pager && getComputedStyle(pager).flexWrap === 'wrap',
       pager ? getComputedStyle(pager).flexWrap : 'لا يوجد');
    if (pager){
      const pb = pager.getBoundingClientRect();
      ok('وشريط الصفحات لا يتجاوز بطاقته', pb.width <= pager.parentElement.getBoundingClientRect().width + 2,
         `${Math.round(pb.width)} > ${Math.round(pager.parentElement.getBoundingClientRect().width)}`);
      const next = [...pager.querySelectorAll('button')].pop();
      ok('وزرّ «التالي» يبقى داخل الشاشة',
         !next || (next.getBoundingClientRect().right <= document.documentElement.clientWidth + 2
                && next.getBoundingClientRect().left >= -2));
    }
    return out;
  });
  await ctx0.close();
  record('العرض الضيّق 360', rows, errors);
});

/* ---------------------- مجموعات المرحلة الثالثة-أ ---------------------- */
group('الهوية البصرية المتحرّكة', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.branding();
    return window.TGTests.results;
  });
  await ctx.close();
  record('الهوية البصرية المتحرّكة', rows, errors);
});

group('التقييم الأولي عند التسجيل', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.onboarding();
    return window.TGTests.results;
  });
  await ctx.close();
  record('التقييم الأولي عند التسجيل', rows, errors);
});

/* الحركة قرار المتصفح لا قرار الورقة النمطية: تُختبر في سياقين حقيقيين،
   واحد يفضّل تقليل الحركة وآخر لا يفضّله. وحركة الـGIF لا توقفها CSS. */
group('تقليل الحركة', async (browser, url) => {
  const rows = [];
  const errors = [];
  const GIF = 'R0lGODlhAgACAPIAAP///wAAAP//AAAA/wAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh'
            + '+QQJCgAAACwAAAAAAgACAAADBAgEpQIAIfkECQoAAAAsAAAAAAIAAgAAAwQIhKUCADs=';
  const upload = async (page, g) => page.evaluate(async b64 => {
    const bin = atob(b64), arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    await window.TG.Brand.setMedia('logo', new File([arr], 'l.gif', { type:'image/gif' }));
    await window.TG.Brand.setMedia('banner', new File([arr], 'b.gif', { type:'image/gif' }));
  }, g);

  for (const [label, mode] of [['بلا تفضيل', 'no-preference'], ['تقليل الحركة', 'reduce']]){
    const ctx = await browser.newContext({ viewport:{ width:1280, height:900 }, reducedMotion:mode });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e.message)));
    await page.goto(url, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
    await page.evaluate(() => window.TG.ready);
    await upload(page, GIF);
    const r = await page.evaluate(() => {
      const { Brand } = window.TG;
      window.TG.go('desk'); window.TG.renderRoute();
      const banner = document.querySelector('.brand-banner');
      /* 7.10: `.brand-logo` صندوقٌ والصورة داخله — يُقرأ مصدر الصورة نفسها */
      const shellSlot = document.querySelector('.brand-logo');
      const shell = shellSlot && (shellSlot.tagName === 'IMG' ? shellSlot : shellSlot.querySelector('img'));
      /* اللافتة صارت <img> حقيقية: يُقرأ مصدرها من العنصر مباشرة بدل
         استخراجه من نصّ background-image — أوضح وأدقّ. */
      const bimg = banner ? banner.querySelector('img') : null;
      return { reduced:Brand.reducedMotion(),
               bannerMotion:banner ? banner.dataset.motion : null,
               bannerIsImg:!!bimg,
               bannerHasGif:bimg ? String(bimg.src).startsWith('data:image/gif') : null,
               shellHasGif:!!(shell && String(shell.src).startsWith('data:image/gif')),
               renderIsStill:Brand.renderUrl('logo') === Brand.stillUrl('logo'),
               printHasGif:Brand.printHeader('س','ص').includes('data:image/gif') };
    });
    const want = mode === 'reduce';
    rows.push({ name:`${label}: النظام يقرأ التفضيل صحيحاً`, pass:r.reduced === want, detail:String(r.reduced) });
    rows.push({ name:`${label}: اللافتة ${want ? 'ثابتة' : 'متحرّكة'}`,
                pass:r.bannerMotion === (want ? 'still' : 'live'), detail:String(r.bannerMotion) });
    rows.push({ name:`${label}: اللافتة عنصر صورة حقيقي لا خلفية CSS`,
                pass:r.bannerIsImg === true, detail:String(r.bannerIsImg) });
    rows.push({ name:`${label}: مصدر اللافتة ${want ? 'الإطار الثابت' : 'الملف المتحرّك'}`,
                pass:r.bannerHasGif === !want, detail:String(r.bannerHasGif) });
    rows.push({ name:`${label}: الشعار في الشريط ${want ? 'ثابت' : 'متحرّك'}`,
                pass:r.shellHasGif === !want, detail:String(r.shellHasGif) });
    rows.push({ name:`${label}: الطباعة ثابتة في الحالتين`, pass:r.printHasGif === false, detail:String(r.printHasGif) });
    await ctx.close();
  }
  record('تقليل الحركة', rows, errors);
});

/* الرفع من الشاشة نفسها بالنقر، ثم إعادة التحميل مرّتين: الحركة تبقى ولا
   يتضخّم شيء مع كل إقلاع. */
group('الهوية المتحرّكة في الشاشة', async (browser, url) => {
  const ctx0 = await browser.newContext({ viewport:{ width:1440, height:960 } });
  const page = await ctx0.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  page.on('console', m => { if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errors.push(m.text()); });
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await page.evaluate(() => window.TG.ready);
  await page.evaluate(() => window.TG.Seed.loadDemo(15));
  const rows = [];

  /* الرفع عبر حقل الملف الحقيقي في شاشة الإعدادات */
  await page.evaluate(() => { window.TG.go('settings', { sec:'brand' }); window.TG.renderRoute(); });
  await page.waitForTimeout(200);
  const accepts = await page.evaluate(() => ({
    logo:(document.getElementById('bLogo') || {}).accept || '',
    banner:(document.getElementById('bBanner') || {}).accept || '' }));
  rows.push({ name:'حقل الشعار يقبل GIF', pass:/image\/gif/.test(accepts.logo), detail:accepts.logo });
  rows.push({ name:'حقل اللافتة يقبل GIF', pass:/image\/gif/.test(accepts.banner), detail:accepts.banner });

  const gifPath = require('path').join(require('os').tmpdir(), 'tg-brand.gif');
  require('fs').writeFileSync(gifPath, Buffer.from(
    'R0lGODlhAgACAPIAAP///wAAAP//AAAA/wAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh'
    + '+QQJCgAAACwAAAAAAgACAAADBAgEpQIAIfkECQoAAAAsAAAAAAIAAgAAAwQIhKUCADs=', 'base64'));
  await page.setInputFiles('#bLogo', gifPath);
  /* المتحرّك صار يفتح المحرّر كما يفتحه الساكن — وهو المطلوب: تُرى الحركة
     ويُختار ما يظهر منها. فالطريق الحقيقيّ للمستخدمة يمرّ بـ«حفظ». */
  await page.waitForSelector('#imApply', { timeout:15000 });
  rows.push({ name:'اختيار GIF يفتح محرّر الصورة لا يتجاوزه',
              pass:await page.evaluate(() => !!document.querySelector('#imStage img')), detail:'' });
  await page.click('#imApply');
  await page.waitForTimeout(700);
  await page.evaluate(() => { window.TG.go('settings', { sec:'brand' }); window.TG.renderRoute(); });
  await page.waitForTimeout(250);
  const preview = await page.evaluate(() => {
    const t = document.getElementById('viewRoot').textContent.replace(/\s+/g, ' ');
    return { animated:/صورة متحرّكة/.test(t), size:/ك\.ب|م\.ب/.test(t), dims:/\d+×\d+/.test(t),
             frame:/المطبوع يأخذ منها إطاراً ثابتاً/.test(t), canRemove:!!document.getElementById('bLogoDel') };
  });
  rows.push({ name:'المعاينة تقول إنها متحرّكة', pass:preview.animated, detail:'' });
  rows.push({ name:'المعاينة تعرض الحجم', pass:preview.size, detail:'' });
  rows.push({ name:'المعاينة تعرض الأبعاد', pass:preview.dims, detail:'' });
  rows.push({ name:'المعاينة تشرح سلوك الطباعة', pass:preview.frame, detail:'' });
  rows.push({ name:'زر الإزالة متاح', pass:preview.canRemove, detail:'' });

  /* إعادة تحميل مرّتين: الحركة تبقى، وعدد الوسائط لا ينمو */
  const counts = [];
  for (let i = 0; i < 2; i++){
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
    await page.evaluate(() => window.TG.ready);
    counts.push(await page.evaluate(() => ({
      media:window.TG.Repos.media.list(true).length,
      animated:window.TG.Brand.isAnimated('logo'),
      poster:window.TG.Brand.info('logo').hasPoster,
      orphans:window.TG.Svc.media.usage().orphans,
      backupBytes:JSON.stringify(window.TG.Backup.build(true)).length })));
  }
  rows.push({ name:'الحركة تنجو من إعادة التحميل', pass:counts.every(c => c.animated), detail:JSON.stringify(counts.map(c => c.animated)) });
  rows.push({ name:'الإطار الثابت ينجو من إعادة التحميل', pass:counts.every(c => c.poster), detail:'' });
  rows.push({ name:'عدد الوسائط لا ينمو مع كل إقلاع',
              pass:counts[0].media === counts[1].media, detail:counts.map(c => c.media).join('→') });
  rows.push({ name:'لا وسائط يتيمة بعد الإقلاع', pass:counts.every(c => c.orphans === 0),
              detail:counts.map(c => c.orphans).join(',') });
  rows.push({ name:'حجم النسخة لا ينمو مع كل إقلاع',
              pass:Math.abs(counts[0].backupBytes - counts[1].backupBytes) < 2048,
              detail:counts.map(c => c.backupBytes).join('→') });

  /* الإزالة من الشاشة */
  await page.evaluate(() => { window.TG.go('settings', { sec:'brand' }); window.TG.renderRoute(); });
  await page.waitForTimeout(200);
  await page.click('#bLogoDel');
  await page.waitForTimeout(500);
  const after = await page.evaluate(() => ({ exists:window.TG.Brand.info('logo').exists,
    orphans:window.TG.Svc.media.usage().orphans, drawn:window.TG.Brand.logoHtml(40).includes('<svg') }));
  rows.push({ name:'الإزالة من الشاشة تعمل', pass:!after.exists, detail:'' });
  rows.push({ name:'الإزالة لا تترك وسائط يتيمة', pass:after.orphans === 0, detail:String(after.orphans) });
  rows.push({ name:'بعد الإزالة تُرسم العلامة المدمجة', pass:after.drawn, detail:'' });

  try { require('fs').unlinkSync(gifPath); } catch(e){}
  await ctx0.close();
  record('الهوية المتحرّكة في الشاشة', rows, errors);
});

/* ============ تشغيل الحركة الحقيقي — بمقارنة الإطارات لا بالوصف ============
   اختبارٌ يقول `type === image/gif` لا يُثبت أن شيئاً يتحرّك. وكذلك
   `animated === true`. الإثبات الوحيد المقبول: التقاط العنصر نفسه مرّات
   متتابعة ومقارنة البكسلات — إن اختلفت فالمتصفح يرسم إطارات متتابعة فعلاً.

   ملف الاختبار `tests/fixtures-anim.gif`: أربعة إطارات 32×32 بألوان صريحة
   (أحمر/أخضر/أزرق/أبيض) بفاصل 100م.ث — اختلافها لا يحتمل اللبس. */
group('تشغيل الحركة الفعلي', async (browser, url) => {
  const fsx = require('fs');
  const gifPath = require('path').join(__dirname, 'fixtures-anim.gif');
  const b64 = fsx.readFileSync(gifPath).toString('base64');
  const rows = [];
  const errors = [];

  /* عدد الإطارات المتمايزة خلال نافذة أطول من دورة الملف الكاملة */
  const distinctFrames = async (page, sel, n = 8, gap = 110) => {
    const seen = [];
    for (let i = 0; i < n; i++){
      const el = page.locator(sel).first();
      if (await el.count()) seen.push((await el.screenshot()).toString('base64'));
      await page.waitForTimeout(gap);
    }
    return new Set(seen).size;
  };

  for (const [sysMode, sysLabel] of [['no-preference', 'جهاز عادي'], ['reduce', 'جهاز يطلب تقليل الحركة']]){
    const ctx = await browser.newContext({ viewport:{ width:1400, height:900 }, reducedMotion:sysMode });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e.message)));
    page.on('console', m => { if (m.type() === 'error' && !/favicon|404/i.test(m.text())) errors.push(m.text()); });
    await page.goto(url, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
    await page.evaluate(() => window.TG.ready);
    await page.evaluate(() => window.TG.Seed.loadDemo(12));
    await page.evaluate(async g => {
      const bin = atob(g), arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      await window.TG.Brand.setMedia('logo', new File([arr], 'l.gif', { type:'image/gif' }));
      await window.TG.Brand.setMedia('banner', new File([arr], 'b.gif', { type:'image/gif' }));
    }, b64);

    /* الملف نفسه يتحرّك في هذا المتصفح — وإلا لم يكن للقياس معنى */
    if (sysMode === 'no-preference'){
      const probe = await page.evaluate(g => {
        const img = document.createElement('img');
        img.id = 'tgProbe'; img.src = 'data:image/gif;base64,' + g;
        img.style.cssText = 'position:fixed;left:0;top:0;width:48px;height:48px;z-index:99999';
        document.body.appendChild(img); return true;
      }, b64);
      const probeFrames = await distinctFrames(page, '#tgProbe');
      await page.evaluate(() => { const p = document.getElementById('tgProbe'); if (p) p.remove(); });
      rows.push({ name:'الملف الاختباري يتحرّك فعلاً في هذا المتصفح (ضبط مرجعي)',
                  pass:probe && probeFrames > 1, detail:`إطارات متمايزة=${probeFrames}` });
    }

    for (const [mode, modeLabel] of [['auto','تلقائي'], ['on','تشغيل'], ['off','إيقاف']]){
      await page.evaluate(m => window.TG.Brand.setMotionMode(m), mode);
      await page.evaluate(() => { window.TG.go('desk'); window.TG.renderRoute(); });
      await page.waitForTimeout(220);
      const st = await page.evaluate(() => window.TG.Brand.motionStatus());
      const wantLive = mode === 'on' || (mode === 'auto' && sysMode === 'no-preference');
      const logoFrames = await distinctFrames(page, '.brand-logo');
      const bannerFrames = await distinctFrames(page, '.brand-banner img');
      const tag = `${sysLabel} + ${modeLabel}`;

      rows.push({ name:`${tag}: الحالة المعلنة ${wantLive ? 'حيّة' : 'ثابتة'}`,
                  pass:st.allowed === wantLive && st.logo.rendering === (wantLive ? 'live' : 'still')
                       && st.banner.rendering === (wantLive ? 'live' : 'still'),
                  detail:JSON.stringify({ allowed:st.allowed, logo:st.logo.rendering, banner:st.banner.rendering }) });
      rows.push({ name:`${tag}: الشعار ${wantLive ? 'يعرض إطارات متتابعة فعلاً' : 'ساكن فعلاً'}`,
                  pass:wantLive ? logoFrames > 1 : logoFrames === 1, detail:`إطارات متمايزة=${logoFrames}` });
      rows.push({ name:`${tag}: اللافتة ${wantLive ? 'تعرض إطارات متتابعة فعلاً' : 'ساكنة فعلاً'}`,
                  pass:wantLive ? bannerFrames > 1 : bannerFrames === 1, detail:`إطارات متمايزة=${bannerFrames}` });
      /* الطباعة ثابتة في كل وضع بلا استثناء */
      const printHasGif = await page.evaluate(() => ({
        header:window.TG.Brand.printHeader('س','ص').includes('data:image/gif'),
        banner:window.TG.Brand.bannerHtml(true).includes('data:image/gif'),
        receipt:window.TG.Print.receiptHtml({ no:'و1', issuedAt:new Date().toISOString(), amount:1, reprints:0,
          snapshot:{ gym:{ name:'س' }, member:{ name:'م', code:'ت1' },
            doc:{ kind:'subscription', title:'ا', detail:'' },
            payment:{ amount:1, method:'cash', date:window.TG.D.today() } } }, { format:'a4' }).includes('data:image/gif') }));
      rows.push({ name:`${tag}: لا صورة متحرّكة في أي مطبوع`,
                  pass:!printHasGif.header && !printHasGif.banner && !printHasGif.receipt,
                  detail:JSON.stringify(printHasGif) });
    }

    /* السبب يُقال بلغة المستخدمة، ولا يُعرَض JSON في الشاشة */
    await page.evaluate(m => window.TG.Brand.setMotionMode(m), 'auto');
    const reason = await page.evaluate(() => window.TG.Brand.motionReason());
    rows.push({ name:`${sysLabel}: سبب الحالة مكتوب بالعربية`,
                pass:/الحركة (مفعّلة|متوقفة)/.test(reason)
                     && (sysMode === 'reduce' ? /تقليل الحركة/.test(reason) : true), detail:reason });

    /* شاشة الإعدادات تقول الحقيقة نفسها ولا تُظهر جملة حركة على صورة ثابتة */
    await page.evaluate(() => { window.TG.go('settings', { sec:'brand' }); window.TG.renderRoute(); });
    await page.waitForTimeout(250);
    const panel = await page.evaluate(() => {
      const t = document.getElementById('viewRoot').textContent.replace(/\s+/g, ' ');
      return { on:/الحركة مفعّلة/.test(t), off:/الحركة متوقفة/.test(t),
               hasSelect:!!document.querySelector('[name=brandMotion]'),
               hasTest:!!document.getElementById('bMotionTest'),
               prevSrcIsGif:String((document.querySelector('[data-brand-prev="logo"]') || {}).src || '').startsWith('data:image/gif') };
    });
    const allowNow = sysMode === 'no-preference';
    rows.push({ name:`${sysLabel}: شاشة الإعدادات تعلن ${allowNow ? 'تفعيل' : 'توقّف'} الحركة`,
                pass:allowNow ? (panel.on && !panel.off) : (panel.off && !panel.on), detail:JSON.stringify(panel) });
    rows.push({ name:`${sysLabel}: قائمة «حركة الهوية» موجودة`, pass:panel.hasSelect, detail:'' });
    rows.push({ name:`${sysLabel}: زر «اختبار الحركة» موجود عند وجود صورة متحرّكة`, pass:panel.hasTest, detail:'' });
    rows.push({ name:`${sysLabel}: معاينة الإعدادات تعرض ما يُعرض فعلاً`,
                pass:panel.prevSrcIsGif === allowNow, detail:String(panel.prevSrcIsGif) });

    /* المعاينة في نافذة «اختبار الحركة» تعرض الأصل دائماً وتتحرّك فعلاً */
    await page.evaluate(() => { const b = document.getElementById('bMotionTest'); if (b) b.click(); });
    await page.waitForTimeout(300);
    const diagFrames = await distinctFrames(page, '.ov img, .modal img, .overlay img');
    const diagSafe = await page.evaluate(() => {
      const ov = document.querySelector('.ov,.modal,.overlay');
      const txt = ov ? ov.textContent.replace(/\s+/g, ' ') : '';
      const mode = window.TG.Brand.motionMode();
      document.querySelectorAll('.ov,.modal,.overlay').forEach(o => o.remove());
      return { opened:!!ov, saysReason:/الحركة (مفعّلة|متوقفة)/.test(txt),
               noJson:!/\{|\}/.test(txt), modeUnchanged:mode === 'auto' };
    });
    rows.push({ name:`${sysLabel}: «اختبار الحركة» يشغّل الملف الأصلي فعلاً`,
                pass:diagSafe.opened && diagFrames > 1, detail:`إطارات متمايزة=${diagFrames}` });
    rows.push({ name:`${sysLabel}: «اختبار الحركة» يشرح السبب بلا JSON ولا يغيّر إعداداً`,
                pass:diagSafe.saysReason && diagSafe.noJson && diagSafe.modeUnchanged,
                detail:JSON.stringify(diagSafe) });
    await ctx.close();
  }

  /* الاستمرارية: الحركة تبقى بعد إعادة التحميل وبعد الاستعادة */
  {
    const ctx = await browser.newContext({ viewport:{ width:1400, height:900 }, reducedMotion:'no-preference' });
    const page = await ctx.newPage();
    page.on('pageerror', e => errors.push(String(e.message)));
    await page.goto(url, { waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
    await page.evaluate(() => window.TG.ready);
    const backup = await page.evaluate(async g => {
      const bin = atob(g), arr = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
      await window.TG.Brand.setMedia('logo', new File([arr], 'l.gif', { type:'image/gif' }));
      await window.TG.Brand.setMedia('banner', new File([arr], 'b.gif', { type:'image/gif' }));
      await window.TG.Brand.setMotionMode('on');
      return window.TG.Backup.build(true);
    }, b64);
    await page.reload({ waitUntil:'domcontentloaded' });
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
    await page.evaluate(() => window.TG.ready);
    await page.evaluate(() => { window.TG.go('desk'); window.TG.renderRoute(); });
    await page.waitForTimeout(250);
    const afterReload = await page.evaluate(() => window.TG.Brand.motionStatus());
    const rlLogo = await distinctFrames(page, '.brand-logo');
    const rlBanner = await distinctFrames(page, '.brand-banner img');
    rows.push({ name:'بعد إعادة التحميل: وضع الحركة محفوظ', pass:afterReload.mode === 'on', detail:afterReload.mode });
    rows.push({ name:'بعد إعادة التحميل: الشعار ما زال يتحرّك فعلاً', pass:rlLogo > 1, detail:`إطارات=${rlLogo}` });
    rows.push({ name:'بعد إعادة التحميل: اللافتة ما زالت تتحرّك فعلاً', pass:rlBanner > 1, detail:`إطارات=${rlBanner}` });

    await page.evaluate(async bk => {
      await window.TG.Brand.clearMedia('logo');
      await window.TG.Brand.clearMedia('banner');
      await window.TG.Brand.setMotionMode('auto');
      await window.TG.Backup.restore(bk);
    }, backup);
    await page.evaluate(() => { window.TG.go('desk'); window.TG.renderRoute(); });
    await page.waitForTimeout(250);
    const afterRestore = await page.evaluate(() => window.TG.Brand.motionStatus());
    const rsLogo = await distinctFrames(page, '.brand-logo');
    const rsBanner = await distinctFrames(page, '.brand-banner img');
    rows.push({ name:'بعد الاستعادة: وضع الحركة يعود مع النسخة', pass:afterRestore.mode === 'on', detail:afterRestore.mode });
    rows.push({ name:'بعد الاستعادة: الشعار يتحرّك فعلاً', pass:rsLogo > 1, detail:`إطارات=${rsLogo}` });
    rows.push({ name:'بعد الاستعادة: اللافتة تتحرّك فعلاً', pass:rsBanner > 1, detail:`إطارات=${rsBanner}` });
    await ctx.close();
  }
  record('تشغيل الحركة الفعلي', rows, errors);
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

/* =================== المسار الحرج الكامل للمرحلة الثانية ===================
   يومٌ حقيقي من أوّله: مشتركة تدفع وتتمرّن، وبضاعة تُشترى من مورّد وتُسدَّد
   جزئياً، ورأس مال يدخل نقداً ثم بتحويل، وفترة تُراجَع وتُقفَل، وأرباح تُوزَّع
   بتفصيل الأشهر. ثم نسخة احتياطية وإعادة تحميل حقيقية واستعادة وفحص سلامة.
   كل خطوة تُقاس بأثرها في الأرقام لا بنجاح استدعائها.
   ======================================================================== */
group('المسار الحرج الكامل للمرحلة الثانية', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);

  const state = await runIn(page, async () => {
    const { Svc, Repos, D, U, Calc, Actions, PayMethods } = window.TG;
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const eq = (name, got, want, note) => ok(name, U.round2(got) === U.round2(want),
      `got=${got} want=${want}${note ? ' — ' + note : ''}`);
    const today = D.today();

    /* 1-5) المشتركة: اشتراك ⇐ قبض ⇐ وصل */
    const { rec: m } = await Svc.members.create({ name:'سما الجبوري', phone:'07701239876' });
    ok('1. مشتركة تُنشأ بكودها', !!m.id && !!m.code, m.code);
    const { rec: sub } = await Svc.subs.create({ memberId:m.id, startDate:today,
      customDuration:{ value:3, unit:'month' }, price:300000, paidAmount:0 });
    ok('2. اشتراك ثلاثة أشهر بمستحقّه كاملاً', Svc.subs.balance(sub).total === 300000);
    const pm = await Svc.payments.add({ refType:'subscription', refId:sub.id, memberId:m.id,
      date:today, amount:180000, method:'cash' });
    const sbal = Svc.subs.balance(Repos.subs.get(sub.id));
    ok('3. قبض جزئي: المقبوض 180 والمتبقّي 120', sbal.paid === 180000 && sbal.due === 120000, JSON.stringify(sbal));
    const realOpen = window.open; window.open = () => null;
    const rc = await Actions.saveAndPrintReceipt(pm.id, 'تم القبض');
    window.open = realOpen;
    ok('4. وصل مرقّم يُصدَر للدفعة', !!rc && !!rc.no, rc && rc.no);
    const att = await Svc.attendance.checkIn({ memberId:m.id, method:'staff' });
    ok('5. حضور المشتركة يُسجَّل', !!(att.rec || att).id);

    /* 6-11) المورّد: مستند شراء بسطور ⇐ مخزون ⇐ تكلفة ⇐ تسديد جزئي ⇐ متبقٍّ */
    const sup = await Svc.suppliers.save(null, { name:'مورّد المسار الحرج', phone:'07811223344',
      contact:'أبو زينب', email:'m@example.com' });
    ok('6. المورّد يُنشأ ببياناته', !!sup.id, sup.name);
    const { rec: pa } = await Svc.inventory.saveProduct(null, { name:'بروتين المسار', price:40000, cost:20000, openingQty:5 });
    const { rec: pb } = await Svc.inventory.saveProduct(null, { name:'شيكر المسار', price:8000, cost:3000 });
    const qa0 = Svc.inventory.onHand(pa.id), qb0 = Svc.inventory.onHand(pb.id);
    const costA0 = Repos.products.get(pa.id).cost;
    const expBefore = Calc.expenses(Repos.expenses.list(), today, today);
    const drawerBefore = Svc.cashbook.expected(today).expected;
    const liqBefore = Svc.finance.liquidity();

    const pur = await Svc.purchases.save(null, { supplierId:sup.id, date:today, invoiceNo:'CR-7',
      lines:[{ productId:pa.id, qty:10, unitCost:22000 }, { productId:pb.id, qty:20, unitCost:3500 }] });
    eq('7. إجمالي مستند الشراء = مجموع سطوره', pur.rec.total, 290000);
    await Svc.purchases.post(pur.rec.id);
    eq('8. الترحيل يُدخل الصنف الأول للمخزن', Svc.inventory.onHand(pa.id), U.round2(qa0 + 10));
    eq('8ب. الترحيل يُدخل الصنف الثاني للمخزن', Svc.inventory.onHand(pb.id), U.round2(qb0 + 20));
    eq('9. رصيد المخزن = مجموع حركاته', Svc.inventory.onHand(pa.id),
       Calc.onHand(Repos.stockMoves.list().filter(x => x.productId === pa.id)));
    eq('10. التكلفة تُسجَّل مرة واحدة بكامل المستند',
       U.round2(Calc.expenses(Repos.expenses.list(), today, today) - expBefore), 290000);
    eq('10ب. متوسط التكلفة المرجّح يُحدَّث', Repos.products.get(pa.id).cost,
       U.round2((qa0 * costA0 + 10 * 22000) / (qa0 + 10)));
    eq('11. الترحيل وحده لا يخرج من الدرج', Svc.cashbook.expected(today).expected, drawerBefore);
    eq('11ب. ما لم يُدفع يعود إلى السيولة', Svc.finance.liquidity(), liqBefore);

    await Svc.purchases.addPayment({ purchaseId:pur.rec.id, date:today, amount:100000, method:'cash' });
    const pbal = Svc.purchases.balance(Repos.purchases.get(pur.rec.id));
    eq('12. التسديد الجزئي: المدفوع 100', pbal.paid, 100000);
    eq('12ب. المتبقّي للمورّد 190', pbal.due, 190000);
    eq('12ج. النقد يخرج من الدرج بالمدفوع فقط', Svc.cashbook.expected(today).expected,
       U.round2(drawerBefore - 100000));
    eq('12د. التسديد لا يُنشئ مصروفاً ثانياً',
       U.round2(Calc.expenses(Repos.expenses.list(), today, today) - expBefore), 290000);
    const sst = Svc.purchases.statement(sup.id);
    eq('13. كشف المورّد: المتبقّي يطابق المستند', sst.due, 190000);

    /* 14-17) رأس المال: نقد ثم تحويل، والدرج يفرّق بينهما */
    const d0 = Svc.cashbook.expected(today).expected, l0 = Svc.finance.liquidity();
    const rev0 = Calc.revenue(Repos.revenues.list(), today, today);
    await Svc.finance.addCapital({ date:today, amount:400000, type:'injection',
      method:'cash', description:'ضخّ نقدي — المسار الحرج' });
    eq('14. الضخّ النقدي يزيد الدرج', Svc.cashbook.expected(today).expected, U.round2(d0 + 400000));
    eq('14ب. الضخّ ليس إيراداً', Calc.revenue(Repos.revenues.list(), today, today), rev0);
    const d1 = Svc.cashbook.expected(today).expected;
    await Svc.finance.addCapital({ date:today, amount:600000, type:'injection',
      method:'transfer', description:'ضخّ بتحويل — المسار الحرج' });
    eq('15. الضخّ بتحويل لا يمسّ الدرج', Svc.cashbook.expected(today).expected, d1);
    eq('15ب. الضخّ بتحويل يزيد السيولة', Svc.finance.liquidity(), U.round2(l0 + 1000000));
    const prev = Svc.cashbook.preview(today);
    eq('16. المتوقّع = الافتتاحي + الداخل − الخارج', prev.expected,
       U.round2(prev.opening + prev.cashIn - prev.cashOut));
    ok('17. كشف اليوم المطبوع يُولَّد', (window.TG.Print.cashDayHtml(today) || '').includes('كشف الصندوق اليومي'));

    /* 18-21) الفترة: مراجعة ⇐ إقفال ⇐ تفصيل توزيع */
    const key = D.monthsBack(4)[0];
    const from = D.startOfMonth(key), to = D.endOfMonth(key);
    if (Svc.periods.isClosed(key)) await Svc.periods.reopen(key, 'تهيئة المسار').catch(() => {});
    const cat = Repos.expCats.list()[0];
    await Svc.finance.addRevenue({ date:from, amount:800000, source:'service',
      description:'إيراد المسار الحرج', method:'cash' });
    await Svc.finance.addExpense({ date:from, amount:300000, categoryId:cat.id,
      description:'مصروف المسار الحرج', method:'cash' });
    const ck = Svc.periods.checklist(key);
    ok('18. قائمة ما قبل الإقفال تُبنى بأقسامها الثلاثة',
       Array.isArray(ck.blocking) && Array.isArray(ck.warnings) && Array.isArray(ck.info));
    eq('18ب. الملخّص: صافي الربح = الإيراد − المصروف', ck.summary.net,
       U.round2(ck.summary.revenue - ck.summary.expense));
    const closed = await Svc.periods.close(key);
    ok('19. الفترة تُقفل ويُثبَّت ربحها', Svc.periods.isClosed(key) && typeof closed.net === 'number', closed.net);

    const partner = Repos.partners.list()[0] || await Repos.partners.create({ name:'شريكة المسار', sharePercent:50 });
    const ent = Svc.distributions.entitlement(partner.id, from, to);
    const cashB = Svc.finance.liquidity();
    const profitB = Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), from, to);
    const amount = Math.max(1000, U.round2(ent.share / 2));
    const dist = await Svc.distributions.create({ partnerId:partner.id, periodFrom:from, periodTo:to,
      amount, date:today, method:'cash' });
    const alloc = Svc.distributions.allocationsOf(dist.rec);
    eq('20. مجموع تفصيل التوزيع = مبلغه', U.round2(U.sum(alloc, a => a.amount)), amount);
    eq('20ب. التوزيع يقلّل السيولة بمقداره', Svc.finance.liquidity(), U.round2(cashB - amount));
    eq('21. التوزيع لا يقلّل الربح',
       Calc.netProfit(Repos.revenues.list(), Repos.expenses.list(), from, to), profitB);
    eq('21ب. الربح المثبَّت لم يتحرّك', Svc.periods.get(key).net, closed.net);
    ok('21ج. التوزيع ليس مصروفاً', !Repos.expenses.list(true).some(e => e.refId === dist.rec.id));

    /* 22-25) الكشوف تُقرأ وتُطبع */
    const pstmt = Svc.distributions.statement(partner.id);
    eq('22. كشف الشريكة: المقبوض = مجموع توزيعاتها', pstmt.paid,
       U.round2(U.sum(Svc.distributions.ofPartner(partner.id), x => x.amount)));
    eq('22ب. ما فُصِّل + ما بلا تفصيل = المقبوض',
       U.round2(pstmt.allocatedTotal + pstmt.unallocatedTotal), pstmt.paid);
    ok('23. كشف الشريكة يُطبع', (window.TG.Print.partnerStatementHtml(partner.id) || '').includes('كشف حساب شريكة'));
    ok('24. كشف المورّد يُطبع', (window.TG.Print.supplierStatementHtml(sup.id) || '').includes('كشف حساب مورّد'));
    const s2 = Svc.purchases.statement(sup.id);
    eq('25. سجل المورّد يحفظ الشراء والتسديد', s2.purchased, 290000);
    eq('25ب. سجل المورّد يحفظ المدفوع', s2.paid, 100000);
    ok('25ج. مستند الشراء يُطبع', (window.TG.Print.purchaseHtml(pur.rec.id) || '').includes(pur.rec.code));

    /* لقطة الأرقام قبل النسخة — تُقارَن بعد إعادة التحميل والاستعادة */
    const snapshot = {
      liquidity:Svc.finance.liquidity(), payables:Svc.purchases.payables().due,
      drawer:Svc.cashbook.expected(today).expected,
      periodNet:Svc.periods.get(key).net, partnerPaid:pstmt.paid,
      stockA:Svc.inventory.onHand(pa.id), costA:Repos.products.get(pa.id).cost,
      revenue:U.round2(U.sum(Repos.revenues.list(true), x => x.amount)),
      expense:U.round2(U.sum(Repos.expenses.list(true), x => x.amount)),
      counts:Object.fromEntries(window.TG.STORE_NAMES.map(x => [x, window.TG.DB.count(x)]))
    };
    const backup = window.TG.Backup.build(false);
    ok('26. النسخة الاحتياطية تُبنى وتشمل الجديد',
       Array.isArray(backup.data.purchases) && backup.data.purchases.length > 0);
    return { out, snapshot, backup, ids:{ member:m.id, sup:sup.id, pur:pur.rec.id,
      partner:partner.id, key, prodA:pa.id, dist:dist.rec.id } };
  });

  /* 27) إعادة تحميل حقيقية: هل نجا كل ذلك القرصَ فعلاً؟ */
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
  await page.evaluate(() => window.TG.ready);
  await page.addScriptTag({ content: TESTS_JS });

  const after = await page.evaluate(async ({ snapshot, backup, ids }) => {
    const { Svc, Repos, U, D, Integrity } = window.TG;
    const out = [];
    const ok = (name, pass, detail) => out.push({ name, pass: !!pass, detail: detail == null ? '' : String(detail) });
    const eq = (name, got, want) => ok(name, U.round2(got) === U.round2(want), `got=${got} want=${want}`);
    const today = D.today();

    ok('27. مستند الشراء نجا من إعادة التحميل', !!Repos.purchases.get(ids.pur));
    ok('27ب. دفعات المورّد نجت', Svc.purchases.paymentsOf(ids.pur).length > 0);
    eq('27ج. المتبقّي للمورّد كما كان', Svc.purchases.payables().due, snapshot.payables);
    eq('27د. السيولة كما كانت', Svc.finance.liquidity(), snapshot.liquidity);
    eq('27هـ. المتوقّع في الدرج كما كان', Svc.cashbook.expected(today).expected, snapshot.drawer);
    eq('27و. رصيد الصنف كما كان', Svc.inventory.onHand(ids.prodA), snapshot.stockA);
    eq('27ز. متوسط التكلفة كما كان', Repos.products.get(ids.prodA).cost, snapshot.costA);
    ok('27ح. الفترة المقفلة نجت', Svc.periods.isClosed(ids.key));
    eq('27ط. الربح المثبَّت كما كان', Svc.periods.get(ids.key).net, snapshot.periodNet);
    const dist = Repos.distributions.get(ids.dist);
    ok('27ي. تفصيل التوزيع نجا كما كُتب',
       U.round2(U.sum(Svc.distributions.allocationsOf(dist), a => a.amount)) === U.round2(dist.amount));

    /* 28) تخريب متعمّد ثم استعادة */
    await Svc.members.create({ name:'سجل بعد النسخة' });
    await Svc.purchases.save(null, { supplierId:ids.sup, date:today,
      lines:[{ productId:ids.prodA, qty:1, unitCost:1 }] });
    await window.TG.Backup.restore(backup);
    const counts = Object.fromEntries(window.TG.STORE_NAMES.map(x => [x, window.TG.DB.count(x)]));
    const diff = window.TG.STORE_NAMES.filter(x => x !== 'audit' && counts[x] !== snapshot.counts[x]);
    ok('28. الاستعادة تُرجع كل الجداول كما كانت', !diff.length,
       diff.map(x => `${x}:${snapshot.counts[x]}→${counts[x]}`).join('، '));
    ok('28ب. ما أُضيف بعد النسخة لم يعد', !Repos.members.list(true).some(x => x.name === 'سجل بعد النسخة'));
    eq('28ج. السيولة بعد الاستعادة', Svc.finance.liquidity(), snapshot.liquidity);
    eq('28د. المتبقّي للموردين بعد الاستعادة', Svc.purchases.payables().due, snapshot.payables);
    eq('28هـ. الإيرادات بعد الاستعادة',
       U.round2(U.sum(Repos.revenues.list(true), x => x.amount)), snapshot.revenue);
    eq('28و. المصروفات بعد الاستعادة',
       U.round2(U.sum(Repos.expenses.list(true), x => x.amount)), snapshot.expense);
    eq('28ز. الربح المثبَّت بعد الاستعادة', Svc.periods.get(ids.key).net, snapshot.periodNet);

    /* 29) فحص سلامة البيانات بعد كل ذلك */
    const issues = Integrity.scan();
    const financial = issues.filter(x => /شراء|مورّد|توزيع|دفعة|إيراد|مخزون/.test(x.type));
    ok('29. لا خلل مالي بعد المسار كاملاً', financial.length === 0,
       JSON.stringify(financial.slice(0, 5)));

    /* 30) الثوابت المالية الكبرى تبقى صحيحة على القاعدة كلها */
    const fromPayments = Repos.revenues.list(true).filter(r => r.paymentId);
    eq('30. Σ إيرادات الدفعات = Σ الدفعات',
       U.round2(U.sum(fromPayments, r => r.amount)),
       U.round2(U.sum(Repos.payments.list(true), p => p.amount)));
    const badStock = Repos.products.list(true).filter(p => p.stockTracked !== false
      && Svc.inventory.onHand(p.id) < -0.001);
    ok('30ب. لا رصيد سالب لصنف متتبَّع', badStock.length === 0, badStock.length);
    const drift = Repos.distributions.list(true).filter(d => {
      const a = Svc.distributions.allocationsOf(d);
      return a.length && Math.abs(U.round2(U.sum(a, x => x.amount) - d.amount)) > 0.009;
    });
    ok('30ج. مجموع تفصيل كل توزيع = مبلغه', drift.length === 0, drift.length);
    const doubleCount = Repos.expenses.list(true).filter(e => e.refType === 'purchase');
    const posted = Repos.purchases.list(true).filter(p => p.status === 'posted');
    ok('30د. لكل مستند مُرحَّل مصروف واحد لا أكثر',
       doubleCount.length === new Set(doubleCount.map(e => e.refId)).size
       && posted.every(p => doubleCount.some(e => e.refId === p.id)),
       `${doubleCount.length} مصروف / ${posted.length} مستند`);
    const p = Svc.cashbook.preview(today);
    eq('30هـ. المتوقّع = الافتتاحي + الداخل − الخارج', p.expected,
       U.round2(p.opening + p.cashIn - p.cashOut));
    return out;
  }, state);

  await ctx.close();
  record('المسار الحرج الكامل للمرحلة الثانية', [...state.out, ...after], errors);
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

    /* كيانات المرحلة الثانية تُبنى فعلاً قبل النسخة: لا يُختبر جدول فارغ */
    const sup = await Svc.suppliers.save(null, { name:'مورّد النسخة', phone:'07700001111' });
    const prod = Repos.products.list()[0];
    let purCode = null, purDue = 0;
    if (prod){
      const d = await Svc.purchases.save(null, { supplierId:sup.id, date:window.TG.D.today(),
        invoiceNo:'BK-1', lines:[{ productId:prod.id, qty:5, unitCost:3000 }] });
      await Svc.purchases.post(d.rec.id);
      await Svc.purchases.addPayment({ purchaseId:d.rec.id, date:window.TG.D.today(),
        amount:5000, method:'cash' });
      purCode = d.rec.code;
      purDue = Svc.purchases.balance(Repos.purchases.get(d.rec.id)).due;
    }
    await Svc.finance.addCapital({ date:window.TG.D.today(), amount:250000, type:'injection',
      method:'transfer', description:'ضخّ للنسخة' });

    const before = Object.fromEntries(STORE_NAMES.map(s => [s, DB.count(s)]));
    const periodsBefore = Svc.periods.list().length;
    const payablesBefore = Svc.purchases.payables().due;
    const liquidityBefore = Svc.finance.liquidity();
    const b = Backup.build(false);
    ok('النسخة تشمل كل الجداول', STORE_NAMES.every(s => Array.isArray(b.data[s])),
       STORE_NAMES.filter(s => !Array.isArray(b.data[s])).join('، '));
    ok('النسخة تشمل جدول الملاحظات', (b.data.notes || []).length > 0, (b.data.notes || []).length);
    ok('النسخة تشمل جدول التوزيعات', Array.isArray(b.data.distributions));
    ok('النسخة تشمل مستندات الشراء', (b.data.purchases || []).length > 0, (b.data.purchases || []).length);
    ok('النسخة تشمل دفعات الموردين', (b.data.purchasePayments || []).length > 0, (b.data.purchasePayments || []).length);
    ok('النسخة تحفظ طريقة حركة رأس المال',
       (b.data.capital || []).every(c => !!c.method), (b.data.capital || []).filter(c => !c.method).length);
    ok('النسخة تحفظ تفصيل التوزيعات',
       (b.data.distributions || []).every(d => Array.isArray(d.allocations) || d.allocationUnavailable),
       (b.data.distributions || []).length);
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
    ok('الاستعادة تُرجع مستندات الشراء',
       !purCode || Repos.purchases.list(true).some(p => p.code === purCode), purCode);
    ok('الاستعادة تُرجع المتبقّي للموردين كما كان',
       Svc.purchases.payables().due === payablesBefore,
       `${payablesBefore} → ${Svc.purchases.payables().due}`);
    ok('الاستعادة تُرجع السيولة كما كانت', Svc.finance.liquidity() === liquidityBefore,
       `${liquidityBefore} → ${Svc.finance.liquidity()}`);
    ok('كشف المورّد بعد الاستعادة يطابق نفسه',
       !purCode || Svc.purchases.statement(Repos.suppliers.list().find(x => x.name === 'مورّد النسخة').id).due === purDue,
       purDue);
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
    if (partner && !Svc.periods.isClosed(key)) await Svc.periods.close(key).catch(() => {});
    if (partner) await Svc.distributions.create({ partnerId:partner.id, periodFrom:D.startOfMonth(key),
      periodTo:D.endOfMonth(key), amount:120000, date:D.today(), method:'cash' }).catch(() => {});
    /* مستند شراء بسطور متعدّدة وأرقام كبيرة: أقسى ما يُطبع في دورة الشراء */
    const sup = await Svc.suppliers.save(null, { name:'شركة التجهيزات الرياضية المتكاملة المحدودة',
      phone:'07811112222', contact:'السيد أبو محمد', email:'sales@example.com', address:'بغداد — شارع فلسطين' });
    const buyables = Repos.products.list().slice(0, 4);
    let purId = null;
    if (buyables.length){
      const d = await Svc.purchases.save(null, { supplierId:sup.id, date:D.today(), invoiceNo:'INV-99881',
        notes:'طلبية كبيرة لاختبار الطباعة',
        lines:buyables.map((p, i) => ({ productId:p.id, qty:12 + i * 7, unitCost:1250000 + i * 137000 })) });
      await Svc.purchases.post(d.rec.id);
      await Svc.purchases.addPayment({ purchaseId:d.rec.id, date:D.today(),
        amount:Math.round(d.rec.total / 3), method:'transfer', notes:'دفعة أولى' });
      purId = d.rec.id;
    }
    const closedKey = (Svc.periods.list()[0] || {}).key || key;
    return { memberId:m.id, receiptId:rc.id, saleRcId, partnerId:partner && partner.id,
             supId:sup.id, purId, closedKey };
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
      const b = document.getElementById('duPrint'); if (b) b.click(); }, ids),
    'مستند شراء':    ids.purId ? await capture(a => TG.Print.open('ش', TG.Print.purchaseHtml(a.purId), {}), ids) : '',
    'كشف مورّد':     await capture(a => TG.Print.open('م', TG.Print.supplierStatementHtml(a.supId), {}), ids),
    'مستحقات الموردين': await capture(() => TG.Print.open('ذ', TG.Print.payablesHtml(), {}), ids),
    'ملخّص إقفال فترة': await capture(a => TG.Print.open('ف', TG.Print.periodCloseHtml(a.closedKey), {}), ids)
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
        /* صف «لا بيانات» خلية واحدة بـcolspan على كل الأعمدة — صحيح لا مختلّ */
        const spans = c => Number(c.getAttribute('colspan') || 1);
        const rows = [...t.querySelectorAll('tbody tr')].filter(tr =>
          !(tr.children.length === 1 && spans(tr.children[0]) >= head.length));
        const row = rows[0];
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

  /* مستند الشراء المطبوع يحمل ما يجعله مستنداً، ويفصل المستحق عن المدفوع */
  if (ids.purId){
    const pd = await page.evaluate(a => {
      const p = TG.Repos.purchases.get(a.purId);
      const st = TG.Svc.purchases.balance(p);
      const h = TG.Print.purchaseHtml(a.purId);
      return { code:h.includes(p.code), supplier:h.includes(TG.Repos.suppliers.get(p.supplierId).name),
               invoice:h.includes(p.invoiceNo), total:h.includes(TG.Money.fmt(p.total)),
               paid:h.includes(TG.Money.fmt(st.paid)), due:h.includes(TG.Money.fmt(st.due)),
               lines:(p.lines || []).every(l => h.includes(l.name)),
               noDouble:!h.includes('مصروف ثانٍ') };
    }, ids);
    Object.entries({ code:'رقم المستند', supplier:'اسم المورّد', invoice:'رقم فاتورة المورّد',
                     total:'الإجمالي', paid:'المدفوع', due:'المتبقّي', lines:'كل سطوره' })
      .forEach(([k, label]) => rows.push({ name:`مستند الشراء المطبوع يحمل ${label}`, pass:pd[k], detail:'' }));
  }
  /* كشف المورّد يجيب الأسئلة الثلاثة على الورق كما على الشاشة */
  const sd = await page.evaluate(a => {
    const st = TG.Svc.purchases.statement(a.supId);
    const h = TG.Print.supplierStatementHtml(a.supId);
    return { purchased:h.includes(TG.Money.fmt(st.purchased)), paid:h.includes(TG.Money.fmt(st.paid)),
             due:h.includes(TG.Money.fmt(st.due)), name:h.includes(st.supplier.name) };
  }, ids);
  Object.entries({ name:'اسم المورّد', purchased:'كم اشترينا', paid:'كم دفعنا', due:'كم بقي عليه' })
    .forEach(([k, label]) => rows.push({ name:`كشف المورّد المطبوع يحمل ${label}`, pass:sd[k], detail:'' }));
  /* ملخّص الإقفال يعرض ما يُقفَل عليه بالضبط */
  const cd = await page.evaluate(a => {
    const sm = TG.Svc.periods.summary(a.closedKey);
    const h = TG.Print.periodCloseHtml(a.closedKey);
    return { net:h.includes(TG.Money.fmt(sm.net)), rev:h.includes(TG.Money.fmt(sm.revenue)),
             exp:h.includes(TG.Money.fmt(sm.expense)), cash:h.includes(TG.Money.fmt(sm.endingExpectedCash)),
             capital:h.includes('ضخّ رأس مال'), dist:h.includes('توزيعات أرباح') };
  }, ids);
  Object.entries({ rev:'الإيرادات', exp:'المصروفات', net:'صافي الربح المثبَّت',
                   cash:'المتوقّع في الدرج', capital:'رأس المال', dist:'التوزيعات' })
    .forEach(([k, label]) => rows.push({ name:`ملخّص الإقفال المطبوع يحمل ${label}`, pass:cd[k], detail:'' }));

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

/* شاشة لمس: المؤشّر خشن، فيجب أن تبلغ مساحات الضغط حدّها المريح.
   وخطأ الإصبع على زرٍّ صغير في صفٍّ مالي ليس ضغطة ضائعة — بل ضغطة على
   الزر المجاور: «حذف» بدل «تعديل». وفي الوقت نفسه: المكتب لا يتغيّر. */
group('مساحة اللمس', async (browser, url) => {
  const rows = [];
  const touchCtx = await browser.newContext({ viewport:{ width:820, height:1180 }, hasTouch:true });
  const tp = await touchCtx.newPage();
  const errors = [];
  tp.on('pageerror', e => errors.push(String(e.message)));
  await tp.goto(url, { waitUntil:'domcontentloaded' });
  await tp.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await tp.evaluate(() => window.TG.ready);
  await tp.evaluate(() => window.TG.Seed.loadDemo(20));
  const touch = await tp.evaluate(async () => {
    const small = [];
    const routes = [['الاستقبال','desk'], ['المشتركات','members'], ['المبيعات','pos'],
      ['المخزون','inventory'], ['المشتريات','inventory',{tab:'purchases'}],
      ['الموردون','inventory',{tab:'suppliers'}], ['الصندوق اليومي','finance',{tab:'cash'}],
      ['رأس المال','finance',{tab:'capital'}], ['الشركاء','finance',{tab:'partners'}],
      ['المستحقات','finance',{tab:'dues'}]];
    for (const [label, r, p] of routes){
      if (p && p.tab && r === 'finance') window.TG.State.f.financeTab = p.tab;
      window.TG.go(r, p || undefined); window.TG.renderRoute();
      await new Promise(x => setTimeout(x, 120));
      document.querySelectorAll('#viewRoot button, #viewRoot .btn, .topbar button, .side-foot button').forEach(b => {
        const rc = b.getBoundingClientRect();
        if (!rc.height || !rc.width) return;
        if (rc.height < 32) small.push({ label, t:b.textContent.trim().slice(0, 16), h:Math.round(rc.height) });
      });
    }
    /* نماذج المرحلة الثانية أيضاً: الحقول تُضغط بالإصبع قبل أن تُملأ */
    window.TG.Forms.capital();
    await new Promise(x => setTimeout(x, 200));
    const ov = document.querySelector('.ov,.modal,.overlay');
    const fields = [...ov.querySelectorAll('.inp')].filter(i => i.getBoundingClientRect().height < 34)
      .map(i => i.name || i.id);
    return { coarse:matchMedia('(pointer: coarse)').matches, small:small.slice(0, 10),
             count:small.length, fields:fields.slice(0, 6), fieldCount:fields.length };
  });
  rows.push({ name:'الشاشة اللمسية تُعرَّف مؤشّراً خشناً', pass:touch.coarse, detail:String(touch.coarse) });
  rows.push({ name:'لا زر تحت 32 بكسل على اللمس', pass:touch.count === 0,
              detail:JSON.stringify(touch.small) });
  rows.push({ name:'حقول النماذج تبلغ مساحة اللمس', pass:touch.fieldCount === 0,
              detail:JSON.stringify(touch.fields) });
  await touchCtx.close();

  /* المكتب لا يتغيّر: القاعدة كلها داخل (pointer: coarse) */
  const deskCtx = await browser.newContext({ viewport:{ width:1440, height:960 } });
  const dp = await deskCtx.newPage();
  await dp.goto(url, { waitUntil:'domcontentloaded' });
  await dp.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
  await dp.evaluate(() => window.TG.ready);
  await dp.evaluate(() => window.TG.Seed.loadDemo(15));
  const desk = await dp.evaluate(() => {
    window.TG.go('members'); window.TG.renderRoute();
    const b = document.querySelector('#viewRoot .btn.btn-sm');
    const cs = b ? getComputedStyle(b) : null;
    return { coarse:matchMedia('(pointer: coarse)').matches,
             h: b ? Math.round(b.getBoundingClientRect().height) : null,
             minHeight: cs ? cs.minHeight : null,
             padTop: cs ? cs.paddingTop : null,
             /* الارتفاع نفسه لو طُبّقت قاعدة اللمس — للمقارنة لا للتخمين */
             coarseMin: 34 };
  });
  rows.push({ name:'المكتب يبقى بمؤشّر دقيق', pass:desk.coarse === false, detail:String(desk.coarse) });
  /* «لم يتضخّم» تعني: قاعدة (pointer: coarse) لم تُطبَّق. وهذا يُقاس بما تغيّره
     القاعدة فعلاً — min-height والحشو — لا بارتفاع بالبكسل.

     الارتفاع بالبكسل كان قياساً بالوكالة، ويتغيّر بتغيّر الخطّ المثبَّت على
     الجهاز لا بتغيّر النظام: على جهاز فيه «Noto Sans Arabic» وليس فيه
     «Segoe UI» يصير الزرّ نفسه 36–38 بكسل بلا أن تُطبَّق قاعدة لمس واحدة،
     لأن line-height:normal يتبع مقاييس الخطّ الرأسية. فقيس السبب لا أثره. */
  rows.push({ name:'قاعدة اللمس لا تُطبَّق على المكتب: لا min-height مفروض',
              pass: desk.minHeight === 'auto' || desk.minHeight === '0px',
              detail:`min-height=${desk.minHeight}` });
  rows.push({ name:'قاعدة اللمس لا تُطبَّق على المكتب: الحشو هو حشو المكتب',
              pass: parseFloat(desk.padTop) < 7, detail:`padding-top=${desk.padTop}` });
  await deskCtx.close();
  record('مساحة اللمس', rows, errors);
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
      ['الشركاء والأرباح','finance',{tab:'partners'}], ['المستحقات','finance',{tab:'dues'}],
      ['رأس المال','finance',{tab:'capital'}], ['المشتريات','inventory',{tab:'purchases'}],
      ['الموردون','inventory',{tab:'suppliers'}], ['التقارير','reports'], ['الإعدادات','settings']];
    for (const [name, r, p] of screens){
      if (p && p.tab && r === 'finance') window.TG.State.f.financeTab = p.tab;
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
  /* الموردون والمشتريات مدخلان آخران لشاشة المخزون */
  for (const [tab, label] of [['suppliers','الموردون'], ['purchases','المشتريات']]){
    const mark = errors.length;
    const bad = await page.evaluate(t => {
      try { window.TG.go('inventory', { tab:t }); window.TG.renderRoute(); return ''; }
      catch(e){ return 'THROW: ' + (e && e.message); }
    }, tab);
    await page.waitForTimeout(80);
    rows.push({ name:`شاشة ${label} تُرسم بلا خطأ`, pass: !bad && errors.length === mark,
                detail: [bad, ...errors.slice(mark)].filter(Boolean).join(' | ') });
  }
  /* الشاشات المنبثقة الجديدة: مستند شراء، كشف مورّد، مراجعة إقفال، ونماذجها */
  {
    const prepared = await page.evaluate(async () => {
      const { Svc, Repos, D } = window.TG;
      const sup = Repos.suppliers.list()[0] || await Svc.suppliers.save(null, { name:'مورّد الرسم' });
      const prod = Repos.products.list()[0];
      let purId = (Repos.purchases.list()[0] || {}).id || null;
      if (!purId && prod){
        const d = await Svc.purchases.save(null, { supplierId:sup.id, date:D.today(),
          lines:[{ productId:prod.id, qty:2, unitCost:1000 }] });
        await Svc.purchases.post(d.rec.id);
        purId = d.rec.id;
      }
      /* نموذج التسديد لا يُفتح لمستند مسدَّد بالكامل — وهذا صواب، فيُختار
         مستند عليه متبقٍّ، أو يُنشأ واحد إن لم يوجد */
      let dueId = (Svc.purchases.payables().rows[0] || {}).p;
      dueId = dueId ? dueId.id : null;
      if (!dueId && prod){
        const d2 = await Svc.purchases.save(null, { supplierId:sup.id, date:D.today(),
          lines:[{ productId:prod.id, qty:3, unitCost:2500 }] });
        await Svc.purchases.post(d2.rec.id);
        dueId = d2.rec.id;
      }
      const open = Svc.periods.openMonths(12);
      return { supId:sup.id, purId, dueId, periodKey:open.length ? open[0].key : D.monthsBack(2)[0],
               partnerId:(Repos.partners.list()[0] || {}).id || null };
    });
    const overlays = [
      ['مستند شراء', a => window.TG.Screens.purchase(a.purId)],
      ['كشف المورّد', a => window.TG.Screens.supplierStatement(a.supId)],
      ['مراجعة الإقفال', a => window.TG.Screens.periodClose(a.periodKey)],
      ['نموذج مستند شراء', () => window.TG.Forms.purchase()],
      ['نموذج تسديد مورّد', a => window.TG.Forms.purchasePayment(a.dueId)],
      ['نموذج حركة رأس مال', () => window.TG.Forms.capital()],
      ['نموذج توزيع أرباح', a => window.TG.Forms.distribution(a.partnerId)]
    ];
    for (const [label, fn] of overlays){
      const mark = errors.length;
      const bad = await page.evaluate(([code, a]) => {
        try { (new Function('a', 'return (' + code + ')(a)'))(a); }
        catch(e){ return 'THROW: ' + (e && e.message); }
        const ov = document.querySelector('.overlay, .modal, [data-overlay]');
        return ov ? '' : 'لم تُفتح الشاشة';
      }, [fn.toString(), prepared]);
      await page.waitForTimeout(80);
      rows.push({ name:`${label} يُرسم بلا خطأ`, pass: !bad && errors.length === mark,
                  detail: [bad, ...errors.slice(mark)].filter(Boolean).join(' | ') });
      await page.evaluate(() => document.querySelectorAll('.overlay, .modal, [data-overlay]')
        .forEach(o => o.remove()));
    }
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

/* ============== أثر الهوية المتحرّكة على الأداء ==============
   الصورة المتحرّكة تُخزَّن data URL داخل القاعدة: تُحمَّل في الذاكرة عند كل
   إقلاع وتُنسخ في كل نسخة احتياطية. فالسؤال ليس «هل تعمل» بل «بكم». يُقاس
   الفرق قبلها وبعدها على القاعدة نفسها، ويُقارَن بالحدّ الذي فرضناه. */
group('أثر الهوية المتحرّكة على الأداء', async (browser, url) => {
  const ctx0 = await browser.newContext({ viewport:{ width:1440, height:960 } });
  const page = await ctx0.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:60000 });
  await page.evaluate(() => window.TG.ready);
  await page.evaluate(() => window.TG.Seed.loadDemo(60));

  const timeIt = code => page.evaluate(async c => {
    const f = new Function('return (' + c + ')()');
    await f();
    const runs = [];
    for (let i = 0; i < 3; i++){ const t = performance.now(); await f(); runs.push(performance.now() - t); }
    return Math.round(Math.min(...runs));
  }, code.toString());

  const rows = [];
  const before = {
    dash: await timeIt(() => { TG.go('dashboard'); TG.renderRoute(); }),
    desk: await timeIt(() => { TG.go('desk'); TG.renderRoute(); }),
    backup: await page.evaluate(() => JSON.stringify(window.TG.Backup.build(true)).length)
  };

  /* صورة متحرّكة بحجم واقعي قريب من الحدّ: نحو 1 ميغابايت */
  const added = await page.evaluate(async () => {
    const { Brand, Svc } = window.TG;
    /* GIF صالح صغير + حشو داخل كتلة تعليق فيكبر الملف بلا أن يفسد */
    const head = atob('R0lGODlhAgACAPIAAP///wAAAP//AAAA/wAAAAAAAAAAAAAAACH/C05FVFNDQVBFMi4wAwEAAAAh'
      + '+QQJCgAAACwAAAAAAgACAAADBAgEpQIAIfkECQoAAAAsAAAAAAIAAgAAAwQIhKUCADs=');
    const bytes = [];
    for (let i = 0; i < head.length; i++) bytes.push(head.charCodeAt(i));
    const arr = new Uint8Array(bytes);
    const pad = new Uint8Array(1024 * 1024);          /* حشو يرفع الحجم إلى نحو ميغابايت */
    const file = new File([arr, pad], 'big-brand.gif', { type:'image/gif' });
    const t0 = performance.now();
    const logo = await Brand.setMedia('logo', file);
    const upMs = Math.round(performance.now() - t0);
    await Brand.setMedia('banner', file);
    /* أبعاد الإطار المستخرج تُقاس فعلاً: الحدّ POSTER_DIM يجب أن يُحترم مهما
       كان الأصل. (الملف هنا ثقيل بالحشو لا بالأبعاد — فالقياس الصادق هو
       الأبعاد لا الكيلوبايتات، وحجم الإطار يتبع أبعاد الصورة لا وزن الملف.) */
    const dim = await Svc.media.measure(logo.posterUrl || '');
    return { upMs, size:logo.size, poster:!!logo.posterUrl,
             posterIsPng:String(logo.posterUrl || '').startsWith('data:image/png'),
             posterDim:dim, limit:Svc.media.POSTER_DIM, usage:Svc.media.usage() };
  });
  rows.push({ name:`رفع ملف متحرّك بوزن ${Math.round(added.size / 1024)} ك.ب — ${added.upMs}ms (الحد 4000ms)`,
              pass:added.upMs <= 4000, detail:added.upMs > 4000 ? 'أبطأ من الحد' : '' });
  rows.push({ name:'الإطار الثابت يُستخرج من ملف ثقيل', pass:added.poster && added.posterIsPng, detail:'' });
  rows.push({ name:`أبعاد الإطار الثابت ضمن الحدّ (${added.posterDim.width}×${added.posterDim.height} ≤ ${added.limit})`,
              pass:added.posterDim.width > 0 && added.posterDim.width <= added.limit
                   && added.posterDim.height <= added.limit,
              detail:JSON.stringify(added.posterDim) });

  const after = {
    dash: await timeIt(() => { TG.go('dashboard'); TG.renderRoute(); }),
    desk: await timeIt(() => { TG.go('desk'); TG.renderRoute(); }),
    backup: await page.evaluate(() => JSON.stringify(window.TG.Backup.build(true)).length)
  };
  /* إقلاع حقيقي على قاعدة فيها هويّة متحرّكة */
  const t0 = Date.now();
  await page.reload({ waitUntil:'domcontentloaded' });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:120000 });
  await page.evaluate(() => window.TG.ready);
  const bootMs = Date.now() - t0;

  rows.push({ name:`الإقلاع بهوية متحرّكة — ${bootMs}ms (الحد 6000ms)`, pass:bootMs <= 6000,
              detail:bootMs > 6000 ? 'أبطأ من الحد' : '' });
  rows.push({ name:`لوحة التحكم ${before.dash}ms ⇐ ${after.dash}ms (الحد 1500ms)`,
              pass:after.dash <= 1500, detail:'' });
  rows.push({ name:`الاستقبال ${before.desk}ms ⇐ ${after.desk}ms (الحد 1500ms)`,
              pass:after.desk <= 1500, detail:'' });
  /* النسخة تكبر بمقدار الأصل + إطاره الثابت — وهذا متوقّع ومقيس لا مفاجأة */
  const grewKb = Math.round((after.backup - before.backup) / 1024);
  rows.push({ name:`النسخة الاحتياطية كبرت ${grewKb} ك.ب بصورتين متحرّكتين`,
              pass:after.backup > before.backup && grewKb < 6000,
              detail:`${before.backup} → ${after.backup}` });
  rows.push({ name:'لا وسائط يتيمة بعد الاستبدال المتكرّر',
              pass:added.usage.orphans === 0, detail:String(added.usage.orphans) });
  const stable = await page.evaluate(() => ({ animated:window.TG.Brand.isAnimated('logo'),
    orphans:window.TG.Svc.media.usage().orphans, media:window.TG.Repos.media.list(true).length }));
  rows.push({ name:'الحركة والوسائط مستقرّة بعد الإقلاع', pass:stable.animated && stable.orphans === 0,
              detail:JSON.stringify(stable) });
  console.log(`   ⏱  رفع=${added.upMs}ms · إقلاع=${bootMs}ms · لوحة=${before.dash}→${after.dash}ms · `
    + `استقبال=${before.desk}→${after.desk}ms · النسخة +${grewKb}ك.ب`);
  await ctx0.close();
  record('أثر الهوية المتحرّكة على الأداء', rows, errors);
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
          sales = [], stock = [], products = [], audit = [], receipts = [], notes = [],
          suppliers = [], purchases = [], purchasePayments = [], expenses = [],
          partners = [], distributions = [], capital = [];
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
    /* ---- كيانات المرحلة الثانية بحجم واقعي: نادٍ يشتري من عشرين مورّداً ----
       800 مستند شراء بسطورها ودفعاتها، ومصروف واحد لكل مستند بطريقة «على
       الحساب» كما يفعل الترحيل تماماً — فالقياس على بنية حقيقية لا مصطنعة. */
    for (let i = 0; i < 20; i++)
      suppliers.push(base({ id:uid('sup'), name:`مورّد ${i}`, phone:'0781' + String(2000000 + i),
        contact:'المسؤول', email:'', address:'', notes:'' }));
    for (let i = 0; i < 800; i++){
      const sup = suppliers[i % suppliers.length];
      const date = D.addDays(today, -(i % 700));
      const lines = [];
      for (let k = 0; k < 3; k++){
        const p = products[(i * 3 + k) % products.length];
        const qty = 5 + (k * 2), unitCost = p.cost;
        lines.push({ productId:p.id, name:p.name, unit:'قطعة', qty, unitCost,
                     total: Math.round(qty * unitCost * 100) / 100 });
      }
      const subtotal = lines.reduce((a, l) => a + l.total, 0);
      const pid = uid('pur'), eid = uid('exp');
      purchases.push(base({ id:pid, code:'ش' + String(i + 1).padStart(5, '0'), supplierId:sup.id,
        date, invoiceNo:'INV' + i, lines, subtotal, discount:0, total:subtotal,
        items:lines.reduce((a, l) => a + l.qty, 0), status:'posted', expenseId:eid,
        postedAt:now, cancelledAt:null, cancelReason:'', notes:'' }));
      expenses.push(base({ id:eid, date, amount:subtotal, categoryId:null,
        description:`شراء ش${String(i + 1).padStart(5, '0')}`, payee:sup.name, notes:'',
        method:'credit', refType:'purchase', refId:pid }));
      lines.forEach(l => stock.push(base({ id:uid('stk'), productId:l.productId, date, type:'purchase',
        qty:l.qty, unitCost:l.unitCost, refType:'purchase', refId:pid, expenseId:null })));
      /* ثلثا المستندات مسدَّدة بالكامل والثلث الباقي جزئياً — كما يقع فعلاً */
      const pay = i % 3 === 0 ? Math.round(subtotal / 2) : subtotal;
      purchasePayments.push(base({ id:uid('ppm'), purchaseId:pid, supplierId:sup.id, date,
        amount:pay, method: i % 2 ? 'cash' : 'transfer', notes:'' }));
    }
    /* شريكتان وسنتان من التوزيعات المفصَّلة شهراً شهراً */
    for (let i = 0; i < 2; i++)
      partners.push(base({ id:uid('prt'), name:`شريكة ${i}`, sharePercent:50, notes:'' }));
    for (let i = 0; i < 240; i++){
      const prt = partners[i % partners.length];
      const k = D.monthsBack(24)[i % 24];
      distributions.push(base({ id:uid('dst'), partnerId:prt.id, periodFrom:D.startOfMonth(k),
        periodTo:D.endOfMonth(k), amount:100000, date:D.endOfMonth(k), method:'cash',
        allocations:[{ key:k, net:0, share:0, amount:100000 }], allocationSource:'migrated', notes:'' }));
    }
    for (let i = 0; i < 40; i++)
      capital.push(base({ id:uid('cap'), date:D.addDays(today, -(i * 17)), amount:500000,
        type: i % 4 === 3 ? 'withdrawal' : 'injection',
        kind: i % 4 === 3 ? 'capital_return' : 'capital_injection',
        method:['cash','transfer','card'][i % 3], partnerId:partners[i % partners.length].id,
        description:'حركة رأس مال', notes:'' }));
    for (let i = 0; i < 3000; i++)
      audit.push(base({ id:uid('aud'), ts:now, entity:'payment', action:'create', summary:'قبض', entityId:null }));
    for (let i = 0; i < 300; i++)
      notes.push(base({ id:uid('not'), memberId:members[i].id, text:'ملاحظة', kind:'general',
        date:today, author:'المالكة', pinned:false }));
    /* 24 فترة مقفلة: الإقفال والكشوف تُقاس على تاريخ حقيقي لا على جدول فارغ */
    const closedPeriods = D.monthsBack(25).slice(0, 24).map(k => ({ key:k,
      from:D.startOfMonth(k), to:D.endOfMonth(k), revenue:0, expense:0, net:0,
      closedAt:now, closedBy:'المالكة', acknowledged:[] }));
    for (const [st, rows] of [['members',members],['products',products],['subscriptions',subs],
      ['payments',payments],['revenues',revenues],['receipts',receipts],['attendance',attendance],
      ['sales',sales],['stockMoves',stock],['audit',audit],['notes',notes],
      ['suppliers',suppliers],['purchases',purchases],['purchasePayments',purchasePayments],
      ['expenses',expenses],['partners',partners],['distributions',distributions],
      ['capital',capital]]) await DB.putMany(st, rows);
    const stRec = DB.get('meta','settings') || { k:'settings', v:{} };
    await DB.put('meta', Object.assign({}, stRec, { k:'settings',
      v:Object.assign({}, stRec.v || {}, { closedPeriods, purchaseSeq:800 }) }));
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
  const supId = await page.evaluate(() => (window.TG.Repos.suppliers.list()[0] || {}).id || null);
  const prtId = await page.evaluate(() => (window.TG.Repos.partners.list()[0] || {}).id || null);
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
    ['قائمة الموردين', () => { TG.go('inventory', { tab:'suppliers' }); TG.renderRoute(); }, null, 2500],
    ['سجل 800 مستند شراء', () => { TG.go('inventory', { tab:'purchases' }); TG.renderRoute(); }, null, 2500],
    ['كشف حساب مورّد', a => { TG.Svc.purchases.statement(a); }, supId, 1500],
    ['كشف الشريكة بالتفصيل', a => { TG.Svc.distributions.statement(a); }, prtId, 1500],
    ['قائمة ما قبل الإقفال', () => { TG.Svc.periods.checklist(TG.D.monthsBack(2)[0]); }, null, 3000],
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

/* ---------------------- مجموعات المرحلة الثالثة/ب ----------------------
   الهوية والصلاحيات. الأصل هنا أن الصلاحية تُفحص في الخدمة نفسها، فالمجموعات
   تستدعي الخدمات مباشرة بلا واجهة. وتُختم بمرور حقيقي على شاشة الدخول في
   المتصفح: كتابةٌ في الحقول وضغطٌ على الأزرار كما تفعل المستخدمة. */
group('الدخول والجلسة والاسترجاع', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.auth();
    return window.TGTests.results;
  });
  await ctx.close();
  record('الدخول والجلسة والاسترجاع', rows, errors);
});

group('مصفوفة الصلاحيات', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TG.go('dashboard'); window.TG.renderRoute();
    window.TGTests.reset();
    await window.TGTests.permMatrix();
    return window.TGTests.results;
  });
  await ctx.close();
  record('مصفوفة الصلاحيات', rows, errors);
});

group('إدارة المستخدمات وحمايتها', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.usersAdmin();
    return window.TGTests.results;
  });
  await ctx.close();
  record('إدارة المستخدمات وحمايتها', rows, errors);
});

group('نسبة الأفعال إلى فاعلها', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(20);
    window.TGTests.reset();
    await window.TGTests.accountability();
    return window.TGTests.results;
  });
  await ctx.close();
  record('نسبة الأفعال إلى فاعلها', rows, errors);
});

group('الحسابات في النسخة الاحتياطية', async (browser, url) => {
  const { ctx, page, errors } = await openApp(browser, url);
  const rows = await runIn(page, async () => {
    await window.TG.Seed.loadDemo(15);
    window.TGTests.reset();
    await window.TGTests.authBackup();
    return window.TGTests.results;
  });
  await ctx.close();
  record('الحسابات في النسخة الاحتياطية', rows, errors);
});

/* مرور حقيقي بالمتصفح: لا استدعاء لخدمة هنا — كتابة في الحقول وضغط أزرار،
   وإعادة تحميل فعلية، وقياس ما تراه العين في الشريط والقائمة. */
group('شاشة الدخول في المتصفح', async (browser, url) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  const noise = t => /favicon|Failed to load resource: the server responded with a status of 404/i.test(t);
  page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
  const boot = async () => {
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
    await page.evaluate(() => window.TG.ready);
  };
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await boot();
  const rows = [];
  const say = (name, pass, detail) => rows.push({ name, pass:!!pass, detail:detail == null ? '' : String(detail) });
  /* رسالة الخطأ تُكتب بعد انتهاء معالج غير متزامن (تلبيد كلمة المرور يأخذ
     وقتاً): تُنتظر حتى تتغيّر فعلاً بدل قراءتها في اللحظة نفسها. */
  const waitErr = async prev => {
    await page.waitForFunction(p => {
      const e = document.querySelector('#gErr');
      return !!e && e.style.display !== 'none' && e.textContent.trim().length > 0
             && e.textContent.trim() !== p;
    }, prev || '', { timeout:10000 });
    return (await page.textContent('#gErr') || '').trim();
  };
  /* الخروج كما تفعله المستخدمة: شارة الحساب ⇐ «حسابي» ⇐ خروج ⇐ تأكيد */
  const CONFIRM = '.overlay .modal[aria-label="تسجيل الخروج"] [data-ok]';
  const logout = async () => {
    await page.click('#whoChip');
    await page.waitForSelector('#acOut', { timeout:10000 });
    await page.click('#acOut');
    await page.waitForSelector(CONFIRM, { timeout:10000 });
    await page.click(CONFIRM);
    await page.waitForSelector('#gUser', { timeout:10000 });
  };

  /* بيانات حقيقية ثم تفعيل الدخول كما يفعله زرّ الإعدادات */
  await page.evaluate(async () => {
    await window.TG.Seed.loadDemo(15);
    await window.TG.Settings.set({ authEnabled:true });
  });

  /* ---------- 1) إعادة التحميل تُظهر شاشة التهيئة لا شاشة دخول فارغة ---------- */
  await page.reload({ waitUntil:'domcontentloaded' });
  await boot();
  await page.waitForSelector('.gate-card', { timeout:10000 });
  const setupTitle = await page.textContent('.gate-card h2');
  say('أول تشغيل بعد التفعيل يفتح شاشة تهيئة الحساب الأول',
      /تهيئة الحساب الأول/.test(setupTitle || ''), setupTitle);
  say('الشاشة تحجب النظام خلفها حتى الدخول',
      await page.isVisible('.gate'), '');

  /* ---------- 2) التهيئة بالكتابة الفعلية ---------- */
  await page.fill('#sName', 'أم تبارك');
  await page.fill('#sUser', 'omtabarak');
  await page.fill('#sPass', '12345');
  await page.fill('#sPass2', '12345');
  await page.click('#sGo');
  const shortErr = await waitErr();
  say('كلمة مرور قصيرة تُرفض برسالة مفهومة في الشاشة', /٦|6/.test(shortErr), shortErr);
  await page.fill('#sPass', 'AmTabarak#2026');
  await page.fill('#sPass2', 'AmTabarak#2027');
  await page.click('#sGo');
  const mismatch = await waitErr(shortErr);
  say('عدم تطابق كلمتي المرور يُرفض في الشاشة', /غير متطابقتين/.test(mismatch), mismatch);
  await page.fill('#sPass2', 'AmTabarak#2026');
  await page.click('#sGo');
  await page.waitForSelector('.gate-code', { timeout:10000 });
  const code = (await page.textContent('.gate-code') || '').trim();
  say('رمز الاسترجاع يُعرَض مرة واحدة بعد التهيئة', /^[A-Z0-9-]{19}$/.test(code), code);
  say('المتابعة موقوفة حتى تُقرّ كتابة الرمز',
      await page.isDisabled('#rGo'), '');
  await page.check('#rAck');
  await page.click('#rGo');
  await page.waitForSelector('.gate', { state:'detached', timeout:10000 });
  const chip = (await page.textContent('#whoami') || '').trim();
  say('بعد التهيئة يظهر اسم المستخدمة ودورها في الشريط',
      /أم تبارك/.test(chip) && /المالكة/.test(chip), chip);

  /* ---------- 3) حسابان آخران بدورين مختلفين ---------- */
  await page.evaluate(async () => {
    await window.TG.Svc.users.create({ username:'istiqbal', name:'زهراء الاستقبال',
      roleKey:'reception', password:'Istiqbal#2026' });
    await window.TG.Svc.users.create({ username:'mudarriba', name:'هدى المدربة',
      roleKey:'trainer', password:'Mudarriba#2026' });
  });
  const ownerNav = await page.$$eval('.nav-item', a => a.length);

  /* ---------- 4) شاشة «حسابي» ثم الخروج ثم دخول الاستقبال بالكتابة ---------- */
  await page.click('#whoChip');
  await page.waitForSelector('#acOut', { timeout:10000 });
  const acct = await page.textContent('.overlay');
  say('شاشة «حسابي» تقول من أنا وماذا أستطيع',
      /أم تبارك/.test(acct) && /المالكة/.test(acct) && /omtabarak/.test(acct), '');
  await page.click('#acOut');
  await page.waitForSelector(CONFIRM, { timeout:10000 });
  say('الخروج يسأل قبل أن يُقفل النظام', await page.isVisible(CONFIRM), '');
  await page.click(CONFIRM);
  await page.waitForSelector('#gUser', { timeout:10000 });
  say('الخروج يعيد شاشة الدخول فوراً', await page.isVisible('.gate'), '');
  await page.fill('#gUser', 'istiqbal');
  await page.fill('#gPass', 'كلمة خاطئة');
  await page.click('#gGo');
  const badMsg = await waitErr();
  say('كلمة مرور خاطئة تُرفض برسالة واحدة لا تكشف وجود الحساب',
      /غير صحيحة/.test(badMsg), badMsg);
  say('حقل كلمة المرور يُفرَّغ بعد المحاولة الفاشلة',
      (await page.inputValue('#gPass')) === '', '');
  await page.fill('#gPass', 'Istiqbal#2026');
  await page.click('#gGo');
  await page.waitForSelector('.gate', { state:'detached', timeout:10000 });
  const recNav = await page.$$eval('.nav-item', a => a.length);
  const recChip = (await page.textContent('#whoami') || '').trim();
  say('دخول الاستقبال ينجح ويظهر اسمها ودورها',
      /زهراء الاستقبال/.test(recChip) && /الاستقبال/.test(recChip), recChip);
  say(`القائمة تضيق بدور الاستقبال (${recNav} مدخلاً ⇐ ${ownerNav} للمالكة)`,
      recNav > 0 && recNav < ownerNav, `${recNav}/${ownerNav}`);
  const hidden = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-item')].map(b => b.dataset.route));
  say('شاشات المال والإعدادات مخفيّة عن الاستقبال',
      !hidden.includes('finance') && !hidden.includes('settings') && !hidden.includes('payroll'),
      hidden.join(','));

  /* ---------- 5) عمل يومي حقيقي بدور الاستقبال ---------- */
  await page.click('.nav-item[data-route="members"]');
  await page.waitForTimeout(150);
  const daily = await page.evaluate(async () => {
    const { Svc, D, Repos, Auth } = window.TG;
    const m = await Svc.members.create({ name:'مشتركة من الاستقبال', phone:'07701234567',
                                         joinDate:D.today() });
    await Svc.attendance.checkIn({ memberId:m.rec.id, date:D.today() });
    const log = window.TG.U.sortBy(Repos.audit.list(true), a => a.ts, -1)
      .filter(a => a.actorId === Auth.session.actorId).slice(0, 4).map(a => [a.entity, a.actor]);
    return { member:!!Repos.members.get(m.rec.id), log };
  });
  say('الاستقبال تُنشئ مشتركة وتسجّل حضوراً بلا عائق', daily.member, '');
  /* الزرّ الممنوع لا يُعرض أصلاً — راحةٌ للعين فوق المنع الحقيقي تحتها */
  await page.evaluate(() => { window.TG.go('members'); window.TG.renderRoute(); });
  await page.waitForTimeout(150);
  const recBtns = await page.evaluate(() => ({
    arch: document.querySelectorAll('#mTable [data-arch]').length,
    rows: document.querySelectorAll('#mTable tbody tr').length
  }));
  say('زرّ أرشفة المشتركة مخفيّ عن الاستقبال في كل سطور الجدول',
      recBtns.rows > 0 && recBtns.arch === 0, JSON.stringify(recBtns));
  say('الأحداث تُنسب إلى الاستقبال باسمها الحقيقي',
      daily.log.length > 0 && daily.log.every(([, who]) => who === 'زهراء الاستقبال'),
      JSON.stringify(daily.log));

  /* ---------- 6) الممنوع ممنوع من الشاشة ومن تحتها ---------- */
  const blocked = await page.evaluate(async () => {
    const { Svc, D, Backup } = window.TG;
    const out = {};
    const t = async (k, fn) => { try { await fn(); out[k] = 'نُفِّذ!'; }
                                 catch(e){ out[k] = e.code || e.message; } };
    await t('إقفال فترة', () => Svc.periods.close(D.monthsBack(20)[0]));
    await t('حركة رأس مال', () => Svc.finance.addCapital({ date:D.today(), amount:1,
      type:'injection', method:'cash' }));
    await t('إنشاء مستخدمة', () => Svc.users.create({ username:'dass', name:'دسّ',
      roleKey:'owner', password:'Dass#12345' }));
    await t('استعادة نسخة', () => Backup.restore(Backup.build(false)));
    return out;
  });
  say('الأفعال الحسّاسة مرفوضة عند حدّها لا في الأزرار فقط',
      Object.values(blocked).every(v => v === 'FORBIDDEN'), JSON.stringify(blocked));
  /* الرفض من طبقة الأفعال نفسها — لا من نداء خدمة مباشر: الزرّ مخفيّ عن
     الاستقبال، ولو وصلت إليه بأي طريق يُرفض الفعل برسالة مفهومة ولا يتغيّر شيء. */
  const deny = await page.evaluate(async () => {
    const m = window.TG.Repos.members.list().find(x => !x.archived);
    let msg = '', code = '';
    try { await window.TG.Actions.archiveMember(m.id); }
    catch(e){ msg = e.message || ''; code = e.code || ''; }
    return { msg, code, archived: !!window.TG.Repos.members.get(m.id).archived };
  });
  say('فعل ممنوع من طبقة الأفعال يُرفض برسالة عربية مفهومة ولا يغيّر شيئاً',
      /ليس لديك صلاحية/.test(deny.msg) && deny.code === 'FORBIDDEN' && !deny.archived,
      JSON.stringify(deny));

  /* ---------- 7) إعادة التحميل: الجلسة تبقى في اللسان نفسه ---------- */
  await page.reload({ waitUntil:'domcontentloaded' });
  await boot();
  await page.waitForTimeout(200);
  const afterReload = await page.evaluate(() => ({
    gate: !!document.querySelector('.gate'),
    chip: (document.getElementById('whoami') || {}).textContent || '',
    route: window.TG.currentRoute().route
  }));
  say('إعادة التحميل لا تُخرج المستخدمة من جلستها',
      !afterReload.gate && /زهراء الاستقبال/.test(afterReload.chip), JSON.stringify(afterReload));
  say('الشاشة المفتوحة بعد إعادة التحميل مسموحة لدورها',
      await page.evaluate(() => window.TG.Auth.can(window.TG.currentRoute().route + '.view')),
      afterReload.route);

  /* ---------- 8) دور ثالث: المدربة ---------- */
  await logout();
  await page.fill('#gUser', 'mudarriba');
  await page.fill('#gPass', 'Mudarriba#2026');
  await page.click('#gGo');
  await page.waitForSelector('.gate', { state:'detached', timeout:10000 });
  const trNav = await page.evaluate(() =>
    [...document.querySelectorAll('.nav-item')].map(b => b.dataset.route));
  say('المدربة ترى التدريبات والتمارين ولا ترى المال',
      trNav.includes('trainings') && trNav.includes('exercises')
      && !trNav.includes('finance') && !trNav.includes('pos'), trNav.join(','));

  /* ---------- 9) الخروج ثم إعادة التحميل: البوابة تعود ---------- */
  await logout();
  await page.reload({ waitUntil:'domcontentloaded' });
  await boot();
  await page.waitForSelector('.gate-card', { timeout:10000 });
  say('بعد الخروج وإعادة التحميل يُطلب الدخول من جديد',
      await page.isVisible('#gUser'), '');
  const stored = await page.evaluate(() => {
    try { return sessionStorage.getItem('tg_session'); } catch(e){ return 'ERR'; }
  });
  say('لا يبقى أثر للجلسة في تخزين اللسان بعد الخروج', stored === null, String(stored));

  /* ---------- 10) الاسترجاع بالرمز من الشاشة ---------- */
  await page.click('#gForgot');
  await page.waitForSelector('#rCode', { timeout:10000 });
  await page.fill('#rCode', 'AAAA-BBBB-CCCC-DDDD');
  await page.fill('#rUser', 'omtabarak');
  await page.fill('#rPass', 'JadidaPass#2026');
  await page.click('#rGo2');
  const recErr = await waitErr();
  say('رمز استرجاع خاطئ يُرفض في الشاشة', /غير صحيح/.test(recErr), recErr);
  await page.fill('#rCode', code);
  await page.click('#rGo2');
  await page.waitForSelector('.gate-code', { timeout:10000 });
  const newCode = (await page.textContent('.gate-code') || '').trim();
  say('الاسترجاع بالرمز الصحيح ينجح ويُصدر رمزاً جديداً',
      /^[A-Z0-9-]{19}$/.test(newCode) && newCode !== code, `${code} ⇐ ${newCode}`);
  await page.check('#rAck');
  await page.click('#rGo');
  await page.waitForSelector('#gUser', { timeout:10000 });
  say('الاسترجاع لا يفتح جلسة من تلقائه — تُطلب كلمة المرور الجديدة',
      await page.isVisible('#gPass'), '');
  await page.fill('#gUser', 'omtabarak');
  await page.fill('#gPass', 'AmTabarak#2026');
  await page.click('#gGo');
  const oldPwErr = await waitErr();
  say('كلمة مرور المالكة القديمة سقطت بالاسترجاع', /غير صحيحة/.test(oldPwErr), oldPwErr);
  await page.fill('#gPass', 'JadidaPass#2026');
  await page.click('#gGo');
  await page.waitForSelector('.gate', { state:'detached', timeout:10000 });
  const backIn = (await page.textContent('#whoami') || '').trim();
  say('المالكة تدخل بكلمة المرور الجديدة وتستعيد صلاحيتها كاملة',
      /أم تبارك/.test(backIn) && await page.evaluate(() => window.TG.Auth.can('settings.danger')),
      backIn);
  await page.evaluate(() => { window.TG.go('members'); window.TG.renderRoute(); });
  await page.waitForTimeout(150);
  const ownBtns = await page.evaluate(() => ({
    arch: document.querySelectorAll('#mTable [data-arch]').length,
    rows: document.querySelectorAll('#mTable tbody tr').length
  }));
  say('الزرّ نفسه يظهر للمالكة على كل سطر',
      ownBtns.rows > 0 && ownBtns.arch === ownBtns.rows, JSON.stringify(ownBtns));
  await page.evaluate(() => { window.TG.go('settings', { sec:'danger' }); window.TG.renderRoute(); });
  await page.waitForTimeout(150);
  say('زرّ إعادة التهيئة يظهر للمالكة وحدها',
      await page.evaluate(() => !!document.querySelector('#wipe')), '');

  await ctx.close();
  record('شاشة الدخول في المتصفح', rows, errors);
});

group('أثر الصلاحيات على الأداء', async (browser, url) => {
  /* السؤال: هل أبطأت الحساباتُ ما كان سريعاً؟ القياس على الشاشة نفسها
     مرّتين — بلا حسابات ثم بحساب داخل — وعلى الدخول نفسه. */
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e.message)));
  const noise = t => /favicon|Failed to load resource: the server responded with a status of 404/i.test(t);
  page.on('console', m => { if (m.type() === 'error' && !noise(m.text())) errors.push(m.text()); });
  const boot = async () => {
    await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout:30000 });
    await page.evaluate(() => window.TG.ready);
  };
  await page.goto(url, { waitUntil:'domcontentloaded' });
  await boot();
  await page.addScriptTag({ content: TESTS_JS });
  await page.evaluate(() => window.TG.Seed.loadDemo(120));

  const screen = route => page.evaluate(r => {
    const runs = [];
    for (let i = 0; i < 3; i++){
      const t = performance.now();
      window.TG.go(r); window.TG.renderRoute();
      runs.push(performance.now() - t);
    }
    return Math.round(Math.min(...runs));
  }, route);

  const rows = [];
  const beforeDesk = await screen('desk');
  const beforeDash = await screen('dashboard');
  const beforeMembers = await screen('members');
  const t0 = Date.now();
  await page.reload({ waitUntil:'domcontentloaded' });
  await boot();
  const bootOff = Date.now() - t0;

  /* تفعيل الحسابات ثم القياس نفسه بحساب استقبال داخل */
  await page.addScriptTag({ content: TESTS_JS });
  const setup = await page.evaluate(async () => {
    const { Settings, Auth, Svc } = window.TG;
    await Settings.set({ authEnabled:true });
    Auth.restoreSession();
    const t0 = performance.now();
    const first = await Auth.setupFirstAdmin({ name:'أم تبارك', username:'omtabarak',
                                               password:'AmTabarak#2026' });
    const setupMs = Math.round(performance.now() - t0);
    await Svc.users.create({ username:'istiqbal', name:'زهراء الاستقبال', roleKey:'reception',
                             password:'Istiqbal#2026' });
    await Auth.logout();
    const t1 = performance.now();
    await Auth.login('istiqbal', 'Istiqbal#2026');
    const loginMs = Math.round(performance.now() - t1);
    const t2 = performance.now();
    try { await Auth.login('istiqbal', 'كلمة خاطئة'); } catch(e){}
    const failMs = Math.round(performance.now() - t2);
    window.TG.buildNav();
    return { setupMs, loginMs, failMs };
  });
  const afterDesk = await screen('desk');
  const afterDash = await screen('dashboard');
  const afterMembers = await screen('members');
  const t1 = Date.now();
  await page.reload({ waitUntil:'domcontentloaded' });
  await boot();
  const bootOn = Date.now() - t1;

  const cmp = (name, before, after, limit) => rows.push({
    name:`${name} ${after}ms ⇐ ${before}ms (الحد ${limit}ms)`,
    pass: after <= limit, detail: after > limit ? 'أبطأ من الحد' : '' });
  cmp('الاستقبال', beforeDesk, afterDesk, 1500);
  cmp('لوحة التحكم', beforeDash, afterDash, 1500);
  cmp('قائمة المشتركات', beforeMembers, afterMembers, 1500);
  cmp('الإقلاع', bootOff, bootOn, 6000);
  rows.push({ name:`الدخول فوريّ — ${setup.loginMs}ms (الحد 1500ms)`,
              pass: setup.loginMs <= 1500, detail:'' });
  rows.push({ name:`الدخول الفاشل لا يُميَّز بزمنه — ${setup.failMs}ms مقابل ${setup.loginMs}ms`,
              pass: setup.failMs >= Math.round(setup.loginMs * 0.25),
              detail:`ناجح=${setup.loginMs} فاشل=${setup.failMs}` });
  rows.push({ name:`تهيئة أول حساب — ${setup.setupMs}ms (الحد 3000ms)`,
              pass: setup.setupMs <= 3000, detail:'' });
  const slower = [['الاستقبال', beforeDesk, afterDesk], ['لوحة التحكم', beforeDash, afterDash],
                  ['المشتركات', beforeMembers, afterMembers]]
    .filter(([, b, a]) => a > b + 120 && a > b * 1.6);
  rows.push({ name:'لم تُبطئ الصلاحيات أي شاشة يومية إبطاءً محسوساً',
              pass: !slower.length, detail: slower.map(([n, b, a]) => `${n}: ${b}⇐${a}`).join(' · ') });
  console.log(`   ⏱  دخول=${setup.loginMs}ms تهيئة=${setup.setupMs}ms إقلاع=${bootOff}⇐${bootOn}ms`);
  await ctx.close();
  record('أثر الصلاحيات على الأداء', rows, errors);
});

/* ------------------------- مجموعات سطح المكتب -------------------------
   تُسجَّل هنا لأنها تحتاج خادمها الخاص: مجلّد البناء + ترويسة CSP المشحونة.
   انظري tests/desktop.js — فيها شرح ما الذي يختلف فعلاً عن المتصفح. */
require('./desktop.js')({ group, record, chromium, CHROME, TESTS_JS });
require('./desktop-io.js')({ group, record, TESTS_JS });
/* المرحلة 4.2: تجربة سطح المكتب — الإقلاع، ونافذة البدء، وصندوق الشعار،
   وملف الموظفة، ومركز الملفات، ورسائل الحفظ، وطريق الطباعة الوحيد. */
require('./desktop-ux.js')({ group, record, TESTS_JS });
/* 7.10: سلامة البيانات على نادٍ ممثّل، وعقد الهوية الواحد، وتصدير Word،
   والطباعة، والتنقّل المالي — انظري docs/QA-phase-4.6.md. */
require('./hardening.js')({ group, record, TESTS_JS });


/* -------------------------------- التشغيل -------------------------------- */
(async () => {
  (await import('../scripts/prepare-frontend.mjs')).prepare();   /* app/index.html قبل أي اختبار */
  const srv = await serve();
  const url = `http://127.0.0.1:${srv.address().port}/?intro=0`;
  const browser = await chromium.launch(Object.assign({ args: ['--no-sandbox'] }, CHROME ? { executablePath: CHROME } : {}));
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
