/* ============================================================================
   تهيئة واجهة سطح المكتب.

   القاعدة: مصدر الواجهة واحد — «tabarak-gym 3.0.html» في جذر المستودع. هو ما
   يُفتح في المتصفح، وهو نفسه ما يُغلِّفه تطبيق سطح المكتب. لا نسخة ثانية تُصان
   على حدة ولا «index-desktop».

   وTauri يحتاج مجلّداً فيه «index.html». فهذا السكربت ينسخ الملف الواحد إلى
   app/index.html بلا تعديل حرف: مخرج بناء مُولَّد (مستثنى من git)، لا مصدر
   ثانٍ. واختبار «هوية المصدر» في مجموعة الاختبارات يقارن البايتات ويسقط إن
   تفرّق الملفان.

   ومعه ينسخ «desktop/splash.html» — نافذة البدء. وهي ليست واجهة ثانية: لا
   سكربت فيها ولا قاعدة بيانات ولا منطق عمل، صورةٌ واسمٌ ومؤشّر انتظار تُغلق
   حين تجهز الواجهة الحقيقية. تُنسخ هنا لأن Tauri لا يقدّم إلا ما في مجلّد
   البناء.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const SOURCE = path.join(ROOT, 'tabarak-gym 3.0.html');
export const SPLASH = path.join(ROOT, 'desktop', 'splash.html');
export const DIST   = path.join(ROOT, 'app');
export const TARGET = path.join(DIST, 'index.html');
export const SPLASH_TARGET = path.join(DIST, 'splash.html');

export function prepare(){
  if (!fs.existsSync(SOURCE)) throw new Error(`مصدر الواجهة غير موجود: ${SOURCE}`);
  const bytes = fs.readFileSync(SOURCE);
  fs.mkdirSync(DIST, { recursive: true });
  /* لا تُكتب إن لم تتغيّر: يبقى ختم الوقت ثابتاً فلا يُعاد البناء بلا سبب */
  if (!fs.existsSync(TARGET) || !fs.readFileSync(TARGET).equals(bytes))
    fs.writeFileSync(TARGET, bytes);

  if (!fs.existsSync(SPLASH)) throw new Error(`نافذة البدء غير موجودة: ${SPLASH}`);
  const splash = fs.readFileSync(SPLASH);
  if (!fs.existsSync(SPLASH_TARGET) || !fs.readFileSync(SPLASH_TARGET).equals(splash))
    fs.writeFileSync(SPLASH_TARGET, splash);

  return { bytes: bytes.length, splashBytes: splash.length,
           sha256: crypto.createHash('sha256').update(bytes).digest('hex') };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)){
  const r = prepare();
  console.log(`app/index.html ⇐ tabarak-gym 3.0.html  (${r.bytes} bytes, sha256 ${r.sha256.slice(0, 16)}…)`);
  console.log(`app/splash.html ⇐ desktop/splash.html   (${r.splashBytes} bytes)`);
}
