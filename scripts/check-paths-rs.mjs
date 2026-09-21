/* ============================================================================
   فحص قواعد طرف الصدأ الخالصة — على أي نظام، بلا شجرة نوافذ.

   قاعدتان في طرف الصدأ لا تعتمدان على Tauri ولا على GTK ولا على ويندوز،
   وكلتاهما سبق أن أخطأت فكلّفت جولة اختبار:

     · `src-tauri/src/paths.rs` — الخروج من المجلّد، وتعقيم الأسماء، ورفض
       اللواحق الغريبة، وتقليم النسخ.
     · `splash_rest_ms` في `src-tauri/src/main.rs` — كم تبقى نافذة البدء.
       هذه هي القاعدة التي كانت تقتل المقدّمة في منتصفها (350ms لمقدّمة
       تستغرق 900ms)، فما كانت المستخدمة ترى شاشة بدء أصلاً.

   لكن `cargo test` على حزمة التطبيق يبني الشجرة كلّها، وهي لا تُبنى على
   لينكس بلا حزم نظام كثيرة. فالبديل أن تُبنى كل قاعدة صندوقاً مستقلّاً
   وتُشغَّل اختباراتها — **من المصدر نفسه**، لا من نسخة ثانية تُصان على حدة.

   فائدته: تُفحص في كل دورة لا في دورة ويندوز وحدها. واختبارات ويندوز تبقى
   كما هي فوقها — هذا لا يُغني عنها بل يسبقها.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src-tauri', 'src', 'paths.rs');
const MAIN = path.join(ROOT, 'src-tauri', 'src', 'main.rs');

if (!fs.existsSync(SRC)) { console.error(`لا يوجد: ${SRC}`); process.exit(1); }

/* قاعدة نافذة البدء تُقتطع من `main.rs` نفسه بمطابقة نصّية على حدودها.
   ولا تُنسخ يدوياً: نسخةٌ ثانية تُصان على حدة تُصبح كذبةً أوّل مرّة يتغيّر
   الأصل. وإن لم تُوجد الحدود سقط الفحص — لا يُتجاوز بصمت. */
function splashRule(){
  const src = fs.readFileSync(MAIN, 'utf8');
  const grab = (re, what) => {
    const m = src.match(re);
    if (!m) { console.error(`✗ تعذّر اقتطاع ${what} من main.rs — تغيّرت حدوده؟`); process.exit(1); }
    return m[0];
  };
  return [
    grab(/const SPLASH_INTRO_MS[\s\S]*?const SPLASH_WATCHDOG_MS: u64 = [\d_]+;/, 'ثوابت البدء'),
    grab(/fn splash_rest_ms[\s\S]*?\n\}/, 'قاعدة الحدّ الأدنى'),
    /* وحدة الاختبار آخر ما في الملف، فتُؤخذ إلى نهايته — أبسط من مطاردة
       الأقواس، ولا يكسرها تغيّر مسافات البادئة. */
    grab(/#\[cfg\(test\)\]\nmod splash_tests \{[\s\S]*$/, 'اختبارات البدء'),
  ].join('\n\n');
}

/* صندوق واحد لكل قاعدة: مصدر، واسم، ورسالة عند السقوط */
const BOXES = [
  { name: 'قواعد المسارات', lib: () => fs.readFileSync(SRC, 'utf8') },
  { name: 'حدّ نافذة البدء', lib: splashRule },
];

let failed = 0;
for (const b of BOXES) {
  const box = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-rs-'));
  fs.mkdirSync(path.join(box, 'src'), { recursive: true });
  fs.writeFileSync(path.join(box, 'src', 'lib.rs'), b.lib());
  fs.writeFileSync(path.join(box, 'Cargo.toml'),
    '[package]\nname = "tg_rule_check"\nversion = "0.0.0"\nedition = "2021"\n\n[lib]\npath = "src/lib.rs"\n');
  try {
    const out = execFileSync('cargo', ['test', '--quiet'], { cwd: box, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
    process.stdout.write(out);
    console.log(`✓ ${b.name} — سليمة`);
  } catch (e) {
    process.stdout.write(String(e.stdout || ''));
    process.stderr.write(String(e.stderr || ''));
    console.error(`✗ سقطت اختبارات: ${b.name}`);
    failed++;
  } finally {
    fs.rmSync(box, { recursive: true, force: true });
  }
}
process.exit(failed ? 1 : 0);
