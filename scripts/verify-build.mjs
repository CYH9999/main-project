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
const SPLASH_SRC = path.join(ROOT, 'desktop', 'splash.html');
const DIST = path.join(ROOT, 'app', 'index.html');
const DIST_SPLASH = path.join(ROOT, 'app', 'splash.html');
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
  { key: 'splash', label: 'نافذة البدء',
    html: [/Desktop\.ready\(\)/g],
    htmlMin: { 'Desktop.ready()': 2 },          // النجاح والفشل معاً
    rust: [/fn tg_ready/, /fn reveal_main/, /SPLASH_WATCHDOG_MS/],
    conf: c => c.app.windows.some(w => w.label === 'splash' && w.visible === true)
            && c.app.windows.some(w => w.label === 'main' && w.visible === false),
    confWhy: 'نافذة splash ظاهرة و main مخفيّة' },

  { key: 'logo', label: 'صندوق الشعار الثابت',
    html: [/\.brand-prev\{[^}]*display:flex/, /max-width:\$\{size\}px;max-height:\$\{size\}px/,
           /\.media-drop \.brand-prev>img\{[^}]*object-fit:contain/, /class="brand-prev"/] },

  { key: 'files', label: 'مركز الملفات',
    html: [/const FileCentre = \{/, /Views\.files = \{/, /ملفات تبارك جيم/],
    rust: [/fn tg_list_files/] },

  { key: 'print', label: 'جسر الطباعة الأصليّ',
    html: [/Desktop\.call\('tg_print'\)/],
    rust: [/ShowPrintUI/, /COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM/] },

  { key: 'ctrlp', label: 'اعتراض Ctrl + P في سطح المكتب',
    html: [/if \(Desktop\.on\(\)\) document\.addEventListener\('keydown'/,
           /key !== 'p' \|\| !\(e\.ctrlKey \|\| e\.metaKey\)/] },

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

  // نافذة البدء ليست تطبيقاً ثانياً
  const sp = read(SPLASH_SRC);
  ok('نافذة البدء بلا سكربت ولا قاعدة بيانات',
     !/<script/i.test(sp) && !/indexedDB|__TAURI|localStorage/i.test(sp));
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
  const sp = fs.readFileSync(SPLASH_SRC), spd = fs.existsSync(DIST_SPLASH) ? fs.readFileSync(DIST_SPLASH) : null;
  ok('app/splash.html موجود ومطابق', !!spd && sha256(sp) === sha256(spd));
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
