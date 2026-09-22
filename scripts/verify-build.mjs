/* ============================================================================
   بوّابات البناء — إثبات أن ما يُشحَن هو ما في المصدر.

   القصّة التي أوجدت هذا الملف: خرج مثبّتان يحملان الرقم «7.6.0» نفسه،
   أحدهما فيه ميزات المرحلة 4.2 والآخر ليس فيه. ولا شيء على القرص يفرّق
   بينهما. فاختُبر القديم ظنّاً أنه الجديد، وضاعت جولة اختبار كاملة على
   ويندوز — والبناء «نجح» في الحالتين.

   الدرس: **النجاح ليس دليلاً، والرقم ليس هويّة.** فصار البناء يُثبت ما
   يدّعيه أو يسقط:

     source     — الشيفرة المسحوبة تحمل فعلاً تطبيق كل ميزة، والأرقام متّفقة
     frontend   — المولَّد = المصدر بايتاً ببايت، وفيه العلامات نفسها
     binary     — الملف التنفيذي يحمل بصمة هذا الالتزام وبصمة هذه الواجهة
     installer  — ما خرج للمستخدمة يحمل النسخة، وهو من هذا البناء وحده

   ولا يُقاس شيء بوجود تعليق أو سطر في وثيقة: كل علامة أدناه جزءٌ من
   التطبيق نفسه، إن حُذف تعطّلت الميزة.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'tabarak-gym 3.0.html');
const INTRO_DIR = path.join(ROOT, 'intro');
const DIST = path.join(ROOT, 'app', 'index.html');
const DIST_INTRO = path.join(ROOT, 'app', 'intro');
const CONF = path.join(ROOT, 'src-tauri', 'tauri.conf.json');
const RUST_DIR = path.join(ROOT, 'src-tauri', 'src');
/* طرف الصدأ كلّه، بلا وحدات الاختبار: نصُّ اختبارٍ يُثبت أن شيئاً **مرفوض**
   ليس استعمالاً له، وقد سبق أن أسقط فحصاً بهذا الخلط. */
const rustSource = () => fs.readdirSync(RUST_DIR)
  .filter(f => f.endsWith('.rs'))
  .map(f => { const t = fs.readFileSync(path.join(RUST_DIR, f), 'utf8');
              const i = t.indexOf('#[cfg(test)]'); return i < 0 ? t : t.slice(0, i); })
  .join('\n');

const sha256 = buf => crypto.createHash('sha256').update(buf).digest('hex');
const read = p => fs.readFileSync(p, 'utf8');

let failed = 0;
const ok = (name, pass, detail) => {
  console.log(`${pass ? '  ✓' : '  ✗'} ${name}${detail ? `  ⟵ ${detail}` : ''}`);
  if (!pass) failed++;
};

/* ---------------------------------------------------------------------------
   علامات الميزات: لكل ميزة ما لا تعمل بدونه — لا اسمها ولا تعليقها.
   --------------------------------------------------------------------------- */
const FEATURES = [
  { key: 'intro', label: 'المقدّمة الافتتاحية في نافذة مكبّرة',
    html: [/Desktop\.ready\(\)/g, /reducedMotion:this\.reducedMotion\(\)/,
           /const Intro = \{/, /Intro\.mount\(\);/, /await Intro\.settle\(\);/g,
           /id="introRoot"/, /intro\/intro\.webm/, /intro\/intro\.mp4/,
           /intro\/intro-poster\.jpg/],
    htmlMin: { 'Desktop.ready()': 2, 'await Intro.settle();': 2 },  // البوّابة والشاشة معاً
    rust: [/fn tg_ready/, /fn reveal_main/, /REVEAL_WATCHDOG_MS/, /let _ = main\.maximize\(\);/],
    /* النافذة الوحيدة تُنشأ مكبّرة ومخفيّة — هذا هو الإصلاح كلّه في سطر:
       ما يُظهَر يكون بمقاسه النهائي، ولا نافذة صغيرة تسبقه. */
    conf: c => c.app.windows.length === 1
            && c.app.windows[0].label === 'main'
            && c.app.windows[0].visible === false
            && c.app.windows[0].maximized === true
            && /^#/.test(String(c.app.windows[0].backgroundColor || '')),
    confWhy: 'نافذة واحدة: main مخفيّة ومكبّرة وبخلفية داكنة' },

  { key: 'gate', label: 'بوّابة الدخول قبل مساحة العمل',
    html: [/body\.locked \.app\{display:none\}/,
           /const gated = Auth\.enabled\(\) && !Auth\.session\.actorId/,
           /if \(!gated\)\{ buildNav\(\); paintWhoAmI\(\); \}/,
           /unlock\(\)\{ document\.body\.classList\.remove\('locked'\); \}/,
           /data-eye=/, /passField\(id, label, autocomplete\)/] },

  { key: 'logo', label: 'صندوق الشعار الثابت',
    html: [/\.brand-prev\{[^}]*display:flex/, /max-width:\$\{size\}px;max-height:\$\{size\}px/,
           /\.media-drop \.brand-prev>img\{[^}]*object-fit:contain/,
           /boxStyle\(size\)\{/, /logoBox\(size\)\{/,
           /* 7.10: الصندوق يملك الهندسة كلّها سطريّاً — الإطار والصورة بإحداثيات صريحة */
           /slotStyle\(size\)\{/, /frameStyle\(pad\)\{/, /contain:strict/, /data-brand-frame/,
           /cls:'brand-prev'/, /PAD: \{ settings:12 \}/,
           /BOX: \{[\s\S]{0,400}?sidebar: 38,[\s\S]{0,400}?print:   54,/,
           /* الحاجز الأخير: سمةٌ على كل صورة هوية، وصندوقٌ يقصّ ما خرج عنه.
              بلا هذه لا يبقى إلا سقفٌ مكتوب في كل سطح على حدة — وهو ما فشل. */
           /\[data-brand-img\]\{/, /\[data-brand-slot\]\{/,
           /data-brand-img="logo"/, /previewHtml\(kind\)\{/,
           /const shell = document\.querySelector\('\.brand'\) \|\| document;/] },

  /* ------------------------------ 7.10 ------------------------------ */
  { key: 'banner', label: 'اللافتة بتكوينٍ واحد (4:1) على كل سطح',
    html: [/BANNER_ASPECT: 4,/, /bannerStageStyle\(\)\{/, /bannerBoxStyle\(\)\{/, /data-brand-stage/,
           /container-type:size/, /bannerInner\(url, crop, alt, prev\)\{/] },

  { key: 'poster', label: 'إطار ثابت ممتلئ للصورة المتحرّكة',
    html: [/async _bestFrame\(dataUrl, lim\)\{/, /new ImageDecoder\(/, /posterIsBlank\(posterUrl\)\{/,
           /async repairPosters\(\)\{/, /Brand\.repairPosters\(\)/g],
    htmlMin: { 'Brand.repairPosters()': 2 } },

  { key: 'datasafety', label: 'استعادة ذرّية ونسخ مُتحقَّق منها',
    html: [/replaceAll\(data, hooks\)\{/, /durability:'strict'/g, /async replaceAll\(data, hooks\)\{/,
           /async saveVerified\(category, filename, includeMedia=true\)\{/, /async verify\(obj\)\{/,
           /prepare\(obj\)\{/, /await DB\.replaceAll\(plan\.rows, hooks\)/, /const InstanceLock = \{/,
           /'SECOND_INSTANCE'/, /reconcile\(\)\{/],
    rust: [/pub fn write_atomic/, /f\.sync_all\(\)/, /pub fn sweep_stale_parts/, /write_atomic\(&target, &bytes\)\?;/] },

  { key: 'word', label: 'Word حقيقي لكل مستند يُطبع',
    html: [/const Word = \(\(\) => \{/, /<w:bidiVisual\/>/, /NUMPAGES/, /w:orient="landscape"/,
           /async function fromPrint\(title, html, opts\)\{/, /UI\.wordButton\(/g, /UI\.bindWord\(/g],
    htmlMin: { 'UI.wordButton(': 13 },
    rust: [/Self::Word => &\["Exports", "Word"\]/] },

  { key: 'printlayout', label: 'ورقة مرتّبة وترقيم صفحات',
    html: [/pageCss\(o\)\{/, /@bottom-center/, /counter\(pages\)/, /docCss\(R\)\{/, /printPrepare\(html\)\{/] },

  { key: 'finnav', label: 'مسار واحد لكل وجهة مالية',
    html: [/const FIN = \{/, /canonical\(params\)\{ return Object\.assign/, /data-tabs=/, /FIN\.open\(/g] },

  { key: 'policy', label: 'جدول الصلاحيات للأدوار (مراقبة)',
    html: [/const Policy = \{/, /MODE: 'observe'/, /^Policy\.install\(\);$/m] },

  { key: 'gifcrop', label: 'قصّ الصور المتحرّكة بلا تجميد',
    html: [/cropOf\(kind\)\{/, /cropStyle\(c\)\{/, /_crop\(st, iw, ih\)\{/,
           /async prepareBrand\(file, kind\)\{/, /data-brand-crop/,
           /ImageEditor\.prepareBrand\(f, kind\)/,
           /Brand\.setMedia\(kind, ready\.file, ready\.crop\)/,
           /\{ file, crop:ImageEditor\._crop\(st, iw, ih\) \}/] },

  { key: 'docview', label: 'مصغّرة وثيقة التعريف وعارضها',
    html: [/UI\.docThumb = function/, /\.doc-thumb\{/, /data-mediaview=/,
           /\.overlay\.lightbox\{/, /size:'light'/, /class="lb-media"/,
           /ov\.querySelectorAll\('\[data-mediaview\]'\)/] },

  { key: 'files', label: 'مركز الملفات',
    html: [/const FileCentre = \{/, /Views\.files = \{/, /ملفات تبارك جيم/],
    rust: [/fn tg_list_files/] },

  { key: 'print', label: 'جسر الطباعة الأصليّ',
    /* حالة الطباعة تقع على العرض لا في @media print وحدها: `ShowPrintUI`
       تطبع ما في العرض، فما في العرض يجب أن يكون المستند. وبلا هذا يعود
       احتمالُ خروج صفحة التطبيق — بشيفرتها — إلى الورق. */
    html: [/Desktop\.call\('tg_print'\)/,
           /html\[data-tg-print="on"\] body>\*:not\(#tgPrintRoot\)\{display:none!important\}/,
           /document\.documentElement\.setAttribute\('data-tg-print', 'on'\)/,
           /document\.documentElement\.removeAttribute\('data-tg-print'\)/,
           /PRINT_STATES:/, /if \(!nativeDone\) return;/, /id="tgPrintExit"|tgPrintExit/],
    rust: [/ShowPrintUI/, /COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM/] },

  { key: 'ctrlp', label: 'اعتراض Ctrl + P في سطح المكتب',
    html: [/if \(Desktop\.on\(\)\) document\.addEventListener\('keydown'/,
           /const physical = e\.code === 'KeyP';/,
           /if \(!\(physical \|\| logical\) \|\| !\(e\.ctrlKey \|\| e\.metaKey\) \|\| e\.altKey\) return;/] },

  { key: 'open', label: 'فتح الملف والمجلّد',
    html: [/async openFile\(category, name\)/, /async openFolder\(category\)/],
    rust: [/fn tg_open_file/, /fn tg_open_folder/, /fn resolve_existing/] },

  { key: 'build', label: 'هويّة البناء',
    html: [/const Build = \{/, /Build\.details\(\)/],
    rust: [/env!\("TG_GIT_SHA"\)/, /env!\("TG_BUILD_ID"\)/, /env!\("TG_FRONTEND_SHA"\)/] },
];

function scanFeatures(html, rust, conf, where) {
  for (const f of FEATURES) {
    const misses = [];
    for (const re of f.html || []) if (!re.test(html)) misses.push(`html:${re.source.slice(0, 40)}`);
    for (const [needle, min] of Object.entries(f.htmlMin || {})) {
      const n = html.split(needle).length - 1;
      if (n < min) misses.push(`${needle}×${n}<${min}`);
    }
    if (rust) for (const re of f.rust || []) if (!re.test(rust)) misses.push(`rust:${re.source.slice(0, 30)}`);
    if (conf && f.conf && !f.conf(conf)) misses.push(f.confWhy);
    ok(`${where}: ${f.label}`, misses.length === 0, misses.join('، '));
  }
}

/* --------------------------------- المراحل -------------------------------- */
function verifySource() {
  console.log('\n— الشيفرة المسحوبة —');
  const html = read(SRC), rust = rustSource(), conf = JSON.parse(read(CONF));
  scanFeatures(html, rust, conf, 'المصدر');

  // الأرقام متّفقة: رقمٌ واحد في أربعة مواضع، لا أربعة أرقام
  const pkg = JSON.parse(read(path.join(ROOT, 'package.json')));
  const cargo = read(path.join(ROOT, 'src-tauri', 'Cargo.toml'));
  const cargoVer = (cargo.match(/^version = "([^"]+)"/m) || [])[1];
  const appVer = (html.match(/const APP = \{[^}]*version:'([^']+)'/) || [])[1];
  const appSchema = Number((html.match(/const APP = \{[^}]*schema:(\d+)/) || [])[1]);
  ok('النسخة واحدة في package.json وtauri.conf.json وCargo.toml والواجهة',
     pkg.version === conf.version && conf.version === cargoVer && cargoVer === appVer,
     `pkg=${pkg.version} conf=${conf.version} cargo=${cargoVer} app=${appVer}`);
  ok('مخطّط البيانات 8 — التغليف لا يُرقّي قاعدة', appSchema === 8, appSchema);

  /* أصول المقدّمة: ما لا تعمل المقدّمة بدونه. والترميز يُفحص بالبايتات لا
     باللاحقة — ملفٌّ باسم .webm وداخله HEVC لا يشغّله محرّك العرض، وهذا
     بالضبط ما كان عليه الملف الأصليّ قبل التحويل. */
  const need = ['intro.webm', 'intro.mp4', 'intro-poster.jpg'];
  for (const f of need)
    ok(`أصل المقدّمة موجود: ${f}`, fs.existsSync(path.join(INTRO_DIR, f)));
  const webm = path.join(INTRO_DIR, 'intro.webm');
  if (fs.existsSync(webm)) {
    const head = fs.readFileSync(webm).subarray(0, 4);
    // EBML: 1A 45 DF A3 — مِلفّ Matroska/WebM حقيقي
    ok('وintro.webm ملفّ WebM فعلاً (EBML)',
       head[0] === 0x1a && head[1] === 0x45 && head[2] === 0xdf && head[3] === 0xa3,
       [...head].map(b => b.toString(16)).join(' '));
    const mb = fs.statSync(webm).size / 1048576;
    ok('وحجمه لا يُثقل التثبيت (≤ 8 م.ب)', mb <= 8, `${mb.toFixed(2)} م.ب`);
  }
  return conf.version;
}

function verifyFrontend() {
  console.log('\n— الواجهة المولَّدة —');
  const src = fs.readFileSync(SRC), dist = fs.existsSync(DIST) ? fs.readFileSync(DIST) : null;
  ok('app/index.html موجود', !!dist);
  if (!dist) return;
  const a = sha256(src), b = sha256(dist);
  ok('SHA256(المصدر) = SHA256(المولَّد)', a === b, `${a.slice(0, 16)}… / ${b.slice(0, 16)}…`);
  ok('الحجم نفسه — لا تحويل نهايات أسطر', src.length === dist.length,
     `${src.length} / ${dist.length}`);
  /* أصول المقدّمة تُنسخ إلى مجلّد البناء: Tauri لا يقدّم إلا ما فيه.
     وتُقارن بالبصمة لا بالوجود — ملفٌّ نُسخ ناقصاً يشتغل حتى يُفتح. */
  for (const f of ['intro.webm', 'intro.mp4', 'intro-poster.jpg']) {
    const a = path.join(INTRO_DIR, f), b = path.join(DIST_INTRO, f);
    const has = fs.existsSync(b);
    ok(`app/intro/${f} موجود ومطابق`,
       has && sha256(fs.readFileSync(a)) === sha256(fs.readFileSync(b)));
  }
  // العلامات تُفحص في المولَّد نفسه لا في المصدر وحده
  scanFeatures(dist.toString('utf8'), null, null, 'المولَّد');
  const stamp = path.join(ROOT, 'app', 'frontend-sha256.txt');
  ok('بصمة الواجهة مكتوبة للملف التنفيذي', fs.existsSync(stamp) && read(stamp).trim() === b,
     fs.existsSync(stamp) ? read(stamp).trim().slice(0, 16) + '…' : 'غير موجودة');
}

/* الملف التنفيذي: نبحث عن النصوص المخبوزة فيه — البصمتان تُخزَّنان نصّاً
   في قسم البيانات، ولا يحذفهما `strip` لأن الأمر `tg_env` يقرؤهما. */
function verifyBinary(exePath) {
  console.log('\n— الملف التنفيذي —');
  ok(`الملف موجود: ${path.basename(exePath)}`, fs.existsSync(exePath), exePath);
  if (!fs.existsSync(exePath)) return;
  const buf = fs.readFileSync(exePath);
  const hay = buf.toString('latin1');
  const frontend = read(path.join(ROOT, 'app', 'frontend-sha256.txt')).trim();
  const sha = (process.env.GITHUB_SHA || '').trim();
  ok('يحمل بصمة الواجهة المولَّدة الآن', hay.includes(frontend), frontend.slice(0, 16) + '…');
  if (sha) ok('ويحمل بصمة هذا الالتزام', hay.includes(sha), sha.slice(0, 12) + '…');
  else console.log('  · GITHUB_SHA غير مضبوط — فحص بصمة الالتزام يُترك لـCI');
  /* رقم النسخة يقع في الملف التنفيذي بترميزين: نصّاً عاديّاً في بيانات
     البرنامج، و**UTF-16LE** في مورد النسخة الذي يعرضه ويندوز في خصائص
     الملف. فيُبحث عن الاثنين — والبحث عن ASCII وحده كان يسقط على ملفّ
     سليم لأن مورد PE لا يخزّن ASCII أصلاً. */
  const ver = JSON.parse(read(CONF)).version;
  const utf16 = Buffer.from(ver, 'utf16le').toString('latin1');
  const asAscii = hay.includes(ver), asUtf16 = hay.includes(utf16);
  ok('ويحمل رقم النسخة', asAscii || asUtf16,
     `${ver} (${[asAscii && 'نصّ', asUtf16 && 'مورد ويندوز'].filter(Boolean).join(' + ') || 'غير موجود'})`);
}

function verifyInstaller(dir, version) {
  console.log('\n— المثبّت —');
  const all = fs.existsSync(dir) ? fs.readdirSync(dir).filter(f => f.endsWith('.exe')) : [];
  ok('مجلّد المثبّت فيه ملف واحد لا أكثر', all.length === 1, all.join('، ') || 'فارغ');
  if (all.length !== 1) return;
  ok(`اسم المثبّت يحمل النسخة ${version}`, all[0].includes(version), all[0]);
  const st = fs.statSync(path.join(dir, all[0]));
  ok('حجمه معقول (> 20 م.ب)', st.size > 20 * 1024 * 1024, `${(st.size / 1048576).toFixed(1)} م.ب`);
  console.log(`  · ${all[0]}`);
  console.log(`  · SHA256 ${sha256(fs.readFileSync(path.join(dir, all[0])))}`);
}

/* ---------------------------------- تشغيل --------------------------------- */
const [stage, arg] = process.argv.slice(2);
const version = JSON.parse(read(CONF)).version;
console.log(`بوّابة البناء — تبارك جيم ${version}${stage ? ` · ${stage}` : ''}`);
switch (stage) {
  case 'source':    verifySource(); break;
  case 'frontend':  verifyFrontend(); break;
  case 'binary':    verifyBinary(arg); break;
  case 'installer': verifyInstaller(arg, version); break;
  default:          verifySource(); verifyFrontend(); break;
}
if (failed) { console.error(`\n✗ سقطت ${failed} بوّابة — لا يُنتَج مثبّت من هذا البناء.`); process.exit(1); }
console.log('\n✓ كل البوّابات اجتازت.');
