/* ============================================================================
   فحص قواعد المسارات في طرف الصدأ — على أي نظام، بلا شجرة نوافذ.

   `src-tauri/src/paths.rs` لا يعتمد على Tauri ولا على GTK ولا على ويندوز:
   نصّ وقواعد ملفات لا أكثر. لكن `cargo test` على حزمة التطبيق يبني الشجرة
   كلّها، وهي لا تُبنى على لينكس بلا حزم نظام كثيرة. فالبديل أن يُبنى هذا
   الملف وحده صندوقاً مستقلّاً وتُشغَّل اختباراته.

   فائدته: قواعد الخروج من المجلّد وتعقيم الأسماء ورفض اللواحق الغريبة
   تُفحص في كل دورة، لا في دورة ويندوز وحدها. واختبارات ويندوز تبقى كما هي
   فوقها — هذا لا يُغني عنها بل يسبقها.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src-tauri', 'src', 'paths.rs');

if (!fs.existsSync(SRC)) { console.error(`لا يوجد: ${SRC}`); process.exit(1); }

const box = fs.mkdtempSync(path.join(os.tmpdir(), 'tg-paths-'));
fs.mkdirSync(path.join(box, 'src'), { recursive: true });
fs.copyFileSync(SRC, path.join(box, 'src', 'lib.rs'));
fs.writeFileSync(path.join(box, 'Cargo.toml'),
  '[package]\nname = "tg_paths_check"\nversion = "0.0.0"\nedition = "2021"\n\n[lib]\npath = "src/lib.rs"\n');

try {
  const out = execFileSync('cargo', ['test', '--quiet'], { cwd: box, encoding: 'utf8', stdio: ['ignore','pipe','pipe'] });
  process.stdout.write(out);
  console.log('✓ قواعد المسارات في طرف الصدأ سليمة');
} catch (e) {
  process.stdout.write(String(e.stdout || ''));
  process.stderr.write(String(e.stderr || ''));
  console.error('✗ سقطت اختبارات قواعد المسارات');
  process.exit(1);
} finally {
  fs.rmSync(box, { recursive: true, force: true });
}
