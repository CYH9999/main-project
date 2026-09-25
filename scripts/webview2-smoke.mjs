/* ============================================================================
   فحصٌ حيّ في WebView2 الحقيقي — على المثبَّت لا على محاكاة

   كل مجموعات الاختبار تعمل على Chromium مع محاكاة لما يفعله Tauri بالصفحة
   (tests/tauri-runtime.js). وهذا ما كان ينقص قبل 7.11: الشعار «الضخم» واللافتة
   «الغائبة» لم يظهرا إلا في WebView2، لأن Tauri يُلحق nonce بـ`style-src` فيُحذف
   كل نمطٍ سطريّ هناك وحده.

   هنا يُشغَّل **الملف التنفيذي المثبَّت** على مشغّل ويندوز، ويُفتح منفذ تصحيح
   WebView2 بالطريقة الموثّقة (WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS)، ويتّصل
   Playwright بالصفحة الحقيقية عبر CDP، ثم يُقاس ما يُرسم:

     · نمطٌ سطريّ يُطبَّق فعلاً (السياسة المطبَّقة تسمح بالأنماط)
     · شعار 512×512 في الشريط الجانبي = 38×38، والشريط لا يتمدّد
     · لافتة على الاستقبال: مرئية، بنسبة 4:1
     · لا خرق لسياسة أمن المحتوى في الشاشات
     · بوّابة العمليات الخطرة والمظهر الداكن موجودان في المثبَّت

     node scripts/webview2-smoke.mjs "C:\\path\\to\\تبارك جيم.exe"

   ليس بديلاً عن تجربة المستخدمة على جهازها — يُقال ذلك في التقرير — لكنه أوّل
   قياسٍ لهذا التطبيق داخل WebView2 نفسه لا داخل ما يشبهه.
   ========================================================================== */
import { spawn } from 'node:child_process';
import { chromium } from 'playwright';

const exe = process.argv[2];
const PORT = Number(process.env.TG_CDP_PORT || 9333);
let failed = 0;
const ok = (name, pass, detail) => {
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? `  ⟵ ${detail}` : ''}`);
  if (!pass) failed++;
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!exe) { console.error('المسار إلى الملف التنفيذي المثبَّت مطلوب'); process.exit(2); }

const child = spawn(exe, [], {
  env: Object.assign({}, process.env, { WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS: `--remote-debugging-port=${PORT}` }),
  detached: false, stdio: 'ignore'
});
let browser = null;
try {
  /* المنفذ يُفتح حين تُنشأ بيئة WebView2 — ننتظره بحدٍّ أعلى */
  let up = false;
  for (let i = 0; i < 90 && !up; i++) {
    try { const r = await fetch(`http://127.0.0.1:${PORT}/json/version`); up = r.ok; } catch (e) { /* لم يُفتح بعد */ }
    if (!up) await sleep(1000);
  }
  ok('WebView2 فتح منفذ التصحيح للتطبيق المثبَّت', up);
  if (!up) throw new Error('no CDP');

  browser = await chromium.connectOverCDP(`http://127.0.0.1:${PORT}`);
  const pages = () => browser.contexts().flatMap(c => c.pages());
  let page = null;
  for (let i = 0; i < 60 && !page; i++) {
    page = pages().find(p => /tauri|localhost/i.test(p.url())) || null;
    if (!page) await sleep(1000);
  }
  ok('صفحة التطبيق موجودة', !!page, page && page.url());
  if (!page) throw new Error('no page');
  const csp = [];
  page.on('console', m => { if (/Content Security Policy/i.test(m.text())) csp.push(m.text().slice(0, 160)); });
  await page.waitForFunction(() => window.TG && window.TG.ready, null, { timeout: 120000 });
  await page.evaluate(() => window.TG.ready);

  const r = await page.evaluate(async () => {
    const TG = window.TG, out = {};
    const tick = ms => new Promise(res => setTimeout(res, ms));
    out.version = TG.APP.version;
    out.ua = navigator.userAgent;
    /* 1) النمط السطريّ يُطبَّق؟ */
    const probe = document.createElement('div');
    probe.innerHTML = '<div style="width:123px;height:7px;position:absolute;left:-9999px"></div>';
    document.body.appendChild(probe);
    out.inlineWidth = probe.firstChild.getBoundingClientRect().width;
    probe.remove();
    /* 2) شعار 512×512 من ملفٍ حقيقي */
    const mk = (w, h) => new Promise(res => { const c = document.createElement('canvas'); c.width = w; c.height = h;
      const x = c.getContext('2d'); x.fillStyle = '#C43E6B'; x.fillRect(0, 0, w, h);
      c.toBlob(b => res(new File([b], `l-${w}.png`, { type: 'image/png' })), 'image/png'); });
    await TG.Brand.setMedia('logo', await mk(512, 512));
    await TG.Brand.setMedia('banner', await mk(1600, 400));
    await tick(300);
    const rect = el => { if (!el) return null; const q = el.getBoundingClientRect(); return { w: Math.round(q.width), h: Math.round(q.height) }; };
    out.sidebarLogo = rect(document.querySelector('.brand [data-brand-slot="logo"]'));
    out.sidebarImg = rect(document.querySelector('.brand [data-brand-slot="logo"] img'));
    out.brandHeader = rect(document.querySelector('.brand'));
    TG.go('desk'); await tick(500);
    out.deskBanner = rect(document.querySelector('[data-desk-hero="banner"] .brand-banner'));
    TG.go('dashboard'); await tick(400);
    out.dashBanner = rect(document.querySelector('#viewRoot .brand-banner'));
    /* 3) ما جاءت به 7.11 موجود في المثبَّت */
    out.security = typeof TG.Security === 'object' && typeof TG.Security.guard === 'function';
    await TG.Theme.set('dark'); await tick(200);
    out.darkBg = getComputedStyle(document.body).backgroundColor;
    await TG.Theme.set('system');
    /* إعادة المثبَّت إلى حاله: لا شعار ولا لافتة من الفحص */
    await TG.Brand.clearMedia('logo'); await TG.Brand.clearMedia('banner');
    return out;
  });
  console.log(`  · ${r.version} — ${r.ua}`);
  ok('النمط السطريّ يُطبَّق في WebView2 (width:123px ⟵ 123)', Math.round(r.inlineWidth) === 123, r.inlineWidth);
  ok('شعار 512×512: صندوق الشريط الجانبي 38×38', !!r.sidebarLogo && r.sidebarLogo.w === 38 && r.sidebarLogo.h === 38, JSON.stringify(r.sidebarLogo));
  ok('والصورة داخله لا بمقاس ملفها', !!r.sidebarImg && r.sidebarImg.w <= 38 && r.sidebarImg.h <= 38, JSON.stringify(r.sidebarImg));
  ok('والشريط الجانبي لا يتمدّد', !!r.brandHeader && r.brandHeader.h < 120, JSON.stringify(r.brandHeader));
  ok('اللافتة ظاهرة على الاستقبال بنسبة 4:1', !!r.deskBanner && r.deskBanner.h > 100 && Math.abs(r.deskBanner.w / r.deskBanner.h - 4) < 0.05,
     JSON.stringify(r.deskBanner));
  ok('وعلى لوحة التحكم', !!r.dashBanner && r.dashBanner.h > 100, JSON.stringify(r.dashBanner));
  ok('بوّابة العمليات الخطرة في المثبَّت', r.security);
  ok('المظهر الداكن يُطبَّق', r.darkBg && r.darkBg !== 'rgb(246, 242, 245)', r.darkBg);
  ok('لا خرق لسياسة أمن المحتوى أثناء الفحص', csp.length === 0, csp.slice(0, 2).join(' | '));
} catch (e) {
  ok('الفحص الحيّ اكتمل', false, e && e.message);
} finally {
  try { if (browser) await browser.close(); } catch (e) {}
  try { child.kill(); } catch (e) {}
  /* WebView2 يُبقي عمليّاته أحياناً — تُنهى بالاسم حتى لا يعلق المشغّل */
  if (process.platform === 'win32') {
    try { spawn('taskkill', ['/F', '/T', '/PID', String(child.pid)], { stdio: 'ignore' }); } catch (e) {}
  }
}
console.log(failed ? `\n✗ ${failed} فحصاً سقط في WebView2 الحقيقي.` : '\n✓ الفحص الحيّ في WebView2 اجتاز.');
process.exit(failed ? 1 : 0);
