/* ============================================================================
   تهيئة واجهة سطح المكتب.

   القاعدة: مصدر الواجهة واحد — «tabarak-gym 3.0.html» في جذر المستودع. هو ما
   يُفتح في المتصفح، وهو نفسه ما يُغلِّفه تطبيق سطح المكتب. لا نسخة ثانية تُصان
   على حدة ولا «index-desktop».

   وTauri يحتاج مجلّداً فيه «index.html». فهذا السكربت ينسخ الملف الواحد إلى
   app/index.html بلا تعديل حرف: مخرج بناء مُولَّد (مستثنى من git)، لا مصدر
   ثانٍ. واختبار «هوية المصدر» في مجموعة الاختبارات يقارن البايتات ويسقط إن
   تفرّق الملفان.

   ومعه ينسخ مجلّد «intro/» — أصول المقدّمة الافتتاحية (فيديو وإطار ثابت).
   تُنسخ هنا لأن Tauri لا يقدّم إلا ما في مجلّد البناء، ومسارها واحد في
   الحالتين: الواجهة تطلب «intro/intro.webm» سواء فُتحت من جذر المستودع أو
   من مجلّد البناء — فلا مسارٌ ثانٍ يُصان ولا فحصٌ عن البيئة.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = path.join(ROOT, 'tabarak-gym 3.0.html');
export const INTRO = path.join(ROOT, 'intro');
export const DIST   = path.join(ROOT, 'app');
export const TARGET = path.join(DIST, 'index.html');
export const INTRO_TARGET = path.join(DIST, 'intro');
export const INTRO_FILES = ['intro.webm', 'intro.mp4', 'intro-poster.jpg'];
/* بصمة الواجهة المولَّدة، تُكتب لتُخبز في الملف التنفيذي (انظري build.rs).
   بها يصير في الملف التنفيذي دليلٌ على **أي واجهة** يحملها، فلا يبقى
   «بُني بعد التهيئة» استنتاجاً من ترتيب الخطوات بل حقيقةً مقروءة منه. */
export const STAMP = path.join(DIST, 'frontend-sha256.txt');

export function prepare(){
  if (!fs.existsSync(SOURCE)) throw new Error(`مصدر الواجهة غير موجود: ${SOURCE}`);
  const bytes = fs.readFileSync(SOURCE);
  fs.mkdirSync(DIST, { recursive: true });
  /* لا تُكتب إن لم تتغيّر: يبقى ختم الوقت ثابتاً فلا يُعاد البناء بلا سبب */
  if (!fs.existsSync(TARGET) || !fs.readFileSync(TARGET).equals(bytes))
    fs.writeFileSync(TARGET, bytes);

  /* أصول المقدّمة. ناقصها يُسقط التهيئة ولا يُتجاوز: تطبيقٌ يُبنى بلا
     مقدّمة يعمل — لكنّه ليس ما قيل إنه بُني، والفرق لا يُكتشف إلا عند
     المستخدمة. */
  fs.mkdirSync(INTRO_TARGET, { recursive: true });
  let introBytes = 0;
  for (const name of INTRO_FILES){
    const from = path.join(INTRO, name), to = path.join(INTRO_TARGET, name);
    if (!fs.existsSync(from)) throw new Error(`أصل المقدّمة غير موجود: ${from}`);
    const buf = fs.readFileSync(from);
    introBytes += buf.length;
    if (!fs.existsSync(to) || !fs.readFileSync(to).equals(buf)) fs.writeFileSync(to, buf);
  }

  /* تنظيف ما لم يعد من المخرجات.

     الدرس الذي أوجد هذا: بعد حذف نافذة البدء بقي `app/splash.html` من بناءٍ
     سابق. و`app/` مستثنى من git فلا يظهر في أي فرق، ومع ذلك **يُغلَّف**:
     فكان المثبَّت سيحمل صفحةً لا يشير إليها شيء. وهو صنف العيوب الذي لا
     يُكتشف بالنظر — اكتشفه اختبار يسأل «هل بقي أثر؟».

     فالمجلّد يُملى ويُنظَّف معاً: ما ليس في هذه القائمة ليس من البناء. */
  const KEEP = new Set(['index.html', 'frontend-sha256.txt', 'intro']);
  const pruned = [];
  for (const name of fs.readdirSync(DIST)){
    if (KEEP.has(name)) continue;
    fs.rmSync(path.join(DIST, name), { recursive: true, force: true });
    pruned.push(name);
  }
  const keepIntro = new Set(INTRO_FILES);
  for (const name of fs.readdirSync(INTRO_TARGET)){
    if (keepIntro.has(name)) continue;
    fs.rmSync(path.join(INTRO_TARGET, name), { recursive: true, force: true });
    pruned.push(`intro/${name}`);
  }

  const sha256 = crypto.createHash('sha256').update(bytes).digest('hex');
  fs.writeFileSync(STAMP, sha256);

  return { bytes: bytes.length, introBytes, sha256, pruned };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const r = prepare();
  console.log(`app/index.html ⇐ tabarak-gym 3.0.html  (${r.bytes} bytes, sha256 ${r.sha256.slice(0, 16)}…)`);
  console.log(`app/intro/ ⇐ intro/               (${INTRO_FILES.length} ملفات، ${r.introBytes} bytes)`);
  if (r.pruned.length) console.log(`نُظّف من مجلّد البناء: ${r.pruned.join('، ')}`);
}
