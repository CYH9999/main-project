/* ============================================================================
   ما يفعله Tauri بالصفحة قبل أن يراها WebView2 — محاكاةٌ حرفيّة

   الدرس الذي كلّف ثلاث مراحل: كانت مجموعات سطح المكتب ترسل سياسة أمن المحتوى
   **كما هي مكتوبة** في tauri.conf.json. وTauri لا يرسلها كما هي. حين تُضبط
   `app.security.csp` يعدّل الصفحة والسياسة معاً (tauri-codegen 2.6 ·
   tauri-utils 2.9 · tauri 2.11 — مقروءة من مصدرها):

     وقت البناء (`tauri-codegen/src/context.rs` ⟵ `map_core_assets`):
       · يضع `nonce="__TAURI_STYLE_NONCE__"` على **كل** عنصر `<style>`
         (`tauri-utils/src/html2.rs` ⟵ `inject_nonce_token`) — ما لم يُستثنَ
         `style-src` في `dangerousDisableAssetCspModification`.
       · يحسب SHA-256 لكل `<script>` غير فارغ (`inject_script_hashes`) —
         ما لم يُستثنَ `script-src`.
     وقت التقديم (`tauri/src/manager/mod.rs` ⟵ `set_csp`/`replace_csp_nonce`):
       · يستبدل الرمز برقمٍ عشوائي، ويُلحق `'nonce-N'` بـ`style-src`
         والبصمات بـ`script-src` (ومعها `'self'` إن غابت).

   والنتيجة التي لم تُقَس قبل 7.11: وجود nonce أو بصمة في قائمةٍ يجعل
   المتصفح **يتجاهل `'unsafe-inline'`** فيها (CSP المستوى الثالث). فكل
   `style="…"` سطريّ في الواجهة كان يُحذف في WebView2 — ومعه هندسة الشعار
   كلّها (فيُرسم بمقاس ملفه) وارتفاع صندوق اللافتة (فينهار إلى صفر).

   هذا الملف يطبّق الخطوات نفسها على الصفحة نفسها، فتعمل مجموعات سطح المكتب
   تحت **السياسة التي يطبّقها WebView2 فعلاً** لا تحت نصّ ملف التهيئة.
   ========================================================================== */
const crypto = require('crypto');

const STYLE_TOKEN = '__TAURI_STYLE_NONCE__';
const SCRIPT_TOKEN = '__TAURI_SCRIPT_NONCE__';

/* `DisabledCspModificationKind::can_modify` */
function canModify(conf, directive){
  const d = conf && conf.app && conf.app.security && conf.app.security.dangerousDisableAssetCspModification;
  if (d === true) return false;
  if (Array.isArray(d)) return !d.includes(directive);
  return true;
}

function parseCsp(str){
  const out = new Map();
  String(str || '').split(';').map(s => s.trim()).filter(Boolean).forEach(part => {
    const [name, ...sources] = part.split(/\s+/);
    out.set(name, sources);
  });
  return out;
}
const serializeCsp = map => [...map.entries()].map(([k, v]) => [k, ...v].join(' ')).join('; ');

/* `normalize_script_for_csp`: CRLF وCR المفردة ⟵ LF */
const normalize = s => String(s).replace(/\r\n?/g, '\n');

/* تقطيع الصفحة إلى عناصر `<script>` (نصّ خام لا يُحلَّل) وما بينها. ما داخل
   السكربت لا يُعدّ عنصراً — `<style>` في نصّ قالبٍ داخل شيفرة ليس عنصر نمط،
   كما لا يراه محلّل html5ever الذي يستعمله Tauri. */
function splitScripts(html){
  const parts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script\s*>/gi;
  let last = 0, m;
  while ((m = re.exec(html))){
    if (m.index > last) parts.push({ kind:'html', text:html.slice(last, m.index) });
    parts.push({ kind:'script', attrs:m[1], body:m[2], text:m[0] });
    last = re.lastIndex;
  }
  if (last < html.length) parts.push({ kind:'html', text:html.slice(last) });
  return parts;
}

/* وقت البناء: الرموز في الصفحة، والبصمات جانباً */
function codegen(html, conf){
  const csp = conf && conf.app && conf.app.security && conf.app.security.csp;
  if (!csp) return { html, scriptHashes:[] };
  const parts = splitScripts(html);
  const scriptHashes = [];
  const out = parts.map(p => {
    if (p.kind === 'script'){
      if (canModify(conf, 'script-src')){
        if (/\bsrc\s*=\s*["']?http/i.test(p.attrs) && !/\bnonce\s*=/.test(p.attrs))
          return p.text.replace(/^<script\b/i, `<script nonce="${SCRIPT_TOKEN}"`);
        if (p.body.length)
          scriptHashes.push(`'sha256-${crypto.createHash('sha256').update(normalize(p.body), 'utf8').digest('base64')}'`);
      }
      return p.text;
    }
    if (!canModify(conf, 'style-src')) return p.text;
    return p.text.replace(/<style\b([^>]*)>/gi, (all, attrs) =>
      /\bnonce\s*=/.test(attrs) ? all : `<style${attrs} nonce="${STYLE_TOKEN}">`);
  }).join('');
  return { html:out, scriptHashes };
}

/* وقت التقديم: رقمٌ عشوائيّ لكل رمز، وإلحاقه بالسياسة */
function replaceNonce(state, token, directive, hashes){
  const nonces = [];
  state.html = state.html.split(token).reduce((acc, piece, i) => {
    if (i === 0) return piece;
    const n = crypto.randomBytes(8).readBigUInt64BE().toString();
    nonces.push(n);
    return acc + n + piece;
  }, '');
  if (!nonces.length && !hashes.length) return;
  const sources = state.csp.get(directive) || [];
  if (!sources.includes("'self'")) sources.push("'self'");
  nonces.forEach(n => sources.push(`'nonce-${n}'`));
  hashes.forEach(h => sources.push(h));
  state.csp.set(directive, sources);
}

/* الصفحة كما يقدّمها Tauri + ترويسة السياسة كما يرسلها (ويندوز وماك). */
function tauriAsset(html, conf){
  const csp = conf && conf.app && conf.app.security && conf.app.security.csp;
  if (!csp) return { body:html, csp:null };
  const built = codegen(String(html), conf);
  const state = { html:built.html, csp:parseCsp(csp) };
  if (canModify(conf, 'script-src')) replaceNonce(state, SCRIPT_TOKEN, 'script-src', built.scriptHashes);
  if (canModify(conf, 'style-src')) replaceNonce(state, STYLE_TOKEN, 'style-src', []);
  return { body:state.html, csp:serializeCsp(state.csp) };
}

/* هل تسمح السياسة **المطبَّقة** بالأنماط السطرية؟ (CSP3: ‹does a source list
   allow all inline behavior›) — وجود nonce أو بصمة يُلغي 'unsafe-inline'. */
function allowsInline(cspString, directive){
  const map = parseCsp(cspString);
  const list = map.get(directive) || map.get('default-src') || [];
  return list.includes("'unsafe-inline'") && !list.some(s => /^'(nonce-|sha256-|sha384-|sha512-)/.test(s));
}

module.exports = { tauriAsset, codegen, canModify, parseCsp, allowsInline, STYLE_TOKEN, SCRIPT_TOKEN };
