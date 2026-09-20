// نافذة واحدة تحمل واجهة تبارك جيم نفسها (ونافذة بدء لا تحمل شيئاً)، وجسر
// أصليّ ضيّق لما لا يستطيع محرّك العرض وحده أن يفعله في تطبيق مكتبي:
//
//   1. فتح واجهة طباعة ويندوز الحقيقية (ShowPrintUI) — `window.print()` في
//      WebView2 لا تفتح حواراً، فكانت الطباعة تسقط صامتة.
//   2. كتابة ملف إلى مجلّد معروف بدل «تنزيل» ينتهي في Downloads.
//   3. قراءة مجلّدات النظام وتقليم النسخ التلقائية.
//   4. فتح ملفٍّ أو مجلّدٍ من مجلّدات النظام ببرنامج ويندوز المعتاد.
//   5. إظهار النافذة الرئيسية حين تجهز الواجهة، وإغلاق نافذة البدء.
//
// وما لا يفعله هذا الجسر أهمّ ممّا يفعله: لا يقبل مساراً من الواجهة أبداً.
// الواجهة ترسل فئةً من قائمة مغلقة واسم ملف، والمسار يُبنى هنا. فلا سبيل
// إلى الكتابة خارج مجلّدَي «تبارك جيم» مهما أُرسل.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod paths;

use base64::Engine;
use paths::{
    assert_inside, category_dir, existing_category_dir, has_category_extension, plan_prune,
    resolve_existing, safe_file_name, unique_path, Category, ROOT_DIR,
};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::OnceLock;
use std::time::{Duration, Instant};
use tauri::Manager;

#[derive(Serialize)]
struct Saved {
    path: String,
    name: String,
    folder: String,
    bytes: usize,
}

#[derive(Serialize)]
struct BackupFile {
    kind: String,
    name: String,
    bytes: u64,
    modified: u64,
}

#[derive(Serialize)]
struct FileRow {
    category: String,
    kind: String,
    name: String,
    bytes: u64,
    modified: u64,
}

#[derive(Serialize)]
struct Env {
    platform: String,
    root: String,
    exports: String,
    backups: String,
    can_print: bool,
    can_open: bool,
    // هويّة البناء — مخبوزة وقت الترجمة في `build.rs`، لا تُحسب هنا ولا
    // تُكتب في الواجهة. فما تعرضه الشاشة هو ما في الملف التنفيذي فعلاً.
    version: String,
    git_sha: String,
    git_short: String,
    build_at: u64,
    build_id: String,
    frontend_sha: String,
}

fn documents(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    app.path()
        .document_dir()
        .map_err(|e| format!("تعذّر تحديد مجلّد المستندات: {e}"))
}

/// أين يحفظ النظام ملفاته — للعرض على المستخدمة لا لبناء مسار في الواجهة.
#[tauri::command]
fn tg_env(app: tauri::AppHandle) -> Result<Env, String> {
    let docs = documents(&app)?;
    let root = docs.join(ROOT_DIR);
    Ok(Env {
        platform: std::env::consts::OS.to_string(),
        root: root.display().to_string(),
        exports: root.join("Exports").display().to_string(),
        backups: root.join("Backups").display().to_string(),
        can_print: cfg!(windows),
        can_open: cfg!(windows),
        version: env!("CARGO_PKG_VERSION").to_string(),
        git_sha: env!("TG_GIT_SHA").to_string(),
        git_short: env!("TG_GIT_SHORT").to_string(),
        build_at: env!("TG_BUILD_AT").parse().unwrap_or(0),
        build_id: env!("TG_BUILD_ID").to_string(),
        frontend_sha: env!("TG_FRONTEND_SHA").to_string(),
    })
}

/// يكتب ملفاً في مجلّد الفئة. النصّ يُمرَّر نصّاً، والثنائيّ بترميز base64.
#[tauri::command]
fn tg_save(
    app: tauri::AppHandle,
    category: String,
    filename: String,
    text: Option<String>,
    b64: Option<String>,
) -> Result<Saved, String> {
    let cat = Category::parse(&category).ok_or("فئة حفظ غير معروفة")?;
    let name = safe_file_name(&filename)?;
    let dir = category_dir(&documents(&app)?, cat)?;
    let target = unique_path(&dir, &name)?;
    assert_inside(&dir, &target)?;

    let bytes: Vec<u8> = match (text, b64) {
        (Some(t), None) => t.into_bytes(),
        (None, Some(b)) => base64::engine::general_purpose::STANDARD
            .decode(b.as_bytes())
            .map_err(|e| format!("محتوى الملف غير صالح: {e}"))?,
        _ => return Err("لم يصل محتوى الملف".into()),
    };
    if bytes.is_empty() {
        return Err("الملف فارغ — لم يُحفظ".into());
    }

    // يُكتب إلى ملف مؤقّت ثم يُنقل: انقطاع في المنتصف لا يترك ملفاً ناقصاً
    // يبدو سليماً. والنقل داخل المجلّد نفسه ذرّيّ عملياً على ويندوز.
    let tmp = target.with_file_name(format!(
        "{}.tg-part",
        target.file_name().and_then(|s| s.to_str()).unwrap_or(&name)
    ));
    std::fs::write(&tmp, &bytes).map_err(|e| format!("تعذّرت الكتابة: {e}"))?;
    if let Err(e) = std::fs::rename(&tmp, &target) {
        let _ = std::fs::remove_file(&tmp);
        return Err(format!("تعذّر إتمام الحفظ: {e}"));
    }

    Ok(Saved {
        name: target
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&name)
            .to_string(),
        path: target.display().to_string(),
        folder: dir.display().to_string(),
        bytes: bytes.len(),
    })
}

/// أحدث ما في مجلّد فئةٍ من ملفات النظام.
///
/// ثلاث قواعد تحكم القراءة:
///   · لا تُنشئ مجلّداً — فتحُ شاشةٍ ليس سبباً لخلق مجلّدات فارغة.
///   · لا تُعيد إلا ما ينتجه النظام (اللاحقة من لواحق الفئة). ما تضعه
///     المستخدمة في المجلّد بيدها ليس ملفّ تطبيق فلا يُعرض ولا يُفتح.
///   · تتوقّف عند حدٍّ أعلى. مجلّد فيه آلاف التصديرات لا يجوز أن يُجمَّد
///     الشاشة، وما يهمّ هو الأحدث لا الكلّ.
fn read_category(app: &tauri::AppHandle, cat: Category, limit: usize) -> Vec<FileRow> {
    let Ok(docs) = documents(app) else {
        return Vec::new();
    };
    let Some(dir) = existing_category_dir(&docs, cat) else {
        return Vec::new();
    };
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let kind = if cat == Category::BackupAuto { "automatic" } else { "manual" };
    let mut out = Vec::new();
    // حارس القراءة: لا يُفحص أكثر من هذا العدد من المدخلات مهما كبر المجلّد
    for entry in rd.flatten().take(4000) {
        let name = entry.file_name().to_string_lossy().to_string();
        if !has_category_extension(&name, cat) {
            continue;
        }
        let Ok(meta) = entry.metadata() else { continue };
        if !meta.is_file() {
            continue;
        }
        let modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64)
            .unwrap_or(0);
        out.push(FileRow {
            category: cat.key().to_string(),
            kind: if cat.is_backup() { kind.to_string() } else { cat.key().to_string() },
            name,
            bytes: meta.len(),
            modified,
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out.truncate(limit);
    out
}

fn list_kind(app: &tauri::AppHandle, cat: Category, kind: &str) -> Vec<BackupFile> {
    read_category(app, cat, 500)
        .into_iter()
        .map(|f| BackupFile {
            kind: kind.to_string(),
            name: f.name,
            bytes: f.bytes,
            modified: f.modified,
        })
        .collect()
}

/// النسخ الموجودة على القرص — اليدوية والتلقائية، الأحدث أولاً.
#[tauri::command]
fn tg_list_backups(app: tauri::AppHandle) -> Result<Vec<BackupFile>, String> {
    let mut all = list_kind(&app, Category::BackupManual, "manual");
    all.extend(list_kind(&app, Category::BackupAuto, "automatic"));
    all.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(all)
}

/// قراءة نسخة بالاسم من مجلّدها. الاسم يُعقَّم كما يُعقَّم عند الكتابة.
#[tauri::command]
fn tg_read_backup(app: tauri::AppHandle, kind: String, name: String) -> Result<String, String> {
    let cat = match kind.as_str() {
        "manual" => Category::BackupManual,
        "automatic" => Category::BackupAuto,
        _ => return Err("نوع نسخة غير معروف".into()),
    };
    let safe = safe_file_name(&name)?;
    let dir = category_dir(&documents(&app)?, cat)?;
    let file = dir.join(&safe);
    assert_inside(&dir, &file)?;
    let meta = std::fs::metadata(&file).map_err(|_| "النسخة غير موجودة".to_string())?;
    if meta.len() > 1_073_741_824 {
        return Err("النسخة أكبر من الحدّ الآمن للقراءة".into());
    }
    std::fs::read_to_string(&file).map_err(|e| format!("تعذّرت قراءة النسخة: {e}"))
}

/// تقليم النسخ التلقائية: يُبقي أحدث `keep` ويحذف ما دونها.
/// لا يمسّ النسخ اليدوية، ولا يحذف الأحدث مهما كانت القيمة.
#[tauri::command]
fn tg_prune_backups(app: tauri::AppHandle, keep: usize) -> Result<Vec<String>, String> {
    let keep = keep.max(1);
    let files = list_kind(&app, Category::BackupAuto, "automatic");
    let names: Vec<String> = files.iter().map(|f| f.name.clone()).collect();
    let doomed = plan_prune(&names, keep);
    if doomed.is_empty() {
        return Ok(Vec::new());
    }
    let dir = category_dir(&documents(&app)?, Category::BackupAuto)?;
    let mut removed = Vec::new();
    for name in doomed {
        let target = dir.join(&name);
        if assert_inside(&dir, &target).is_ok() && std::fs::remove_file(&target).is_ok() {
            removed.push(name);
        }
    }
    Ok(removed)
}

/// كل ما أنتجه النظام على القرص — نسخاً وتصديرات، الأحدث أولاً.
///
/// لا جدول ثانياً في قاعدة البيانات يسجّل «ما صُدِّر»: سجلٌّ كهذا يكذب أول
/// مرّة يُحذف فيها ملف من خارج التطبيق. المصدر هو المجلّد نفسه.
#[tauri::command]
fn tg_list_files(app: tauri::AppHandle, per_category: Option<usize>) -> Result<Vec<FileRow>, String> {
    // حدٌّ لكل فئة: الشاشة تعرض الأحدث، والقرص قد يحوي آلافاً
    let limit = per_category.unwrap_or(60).clamp(1, 300);
    let mut all = Vec::new();
    for cat in Category::ALL {
        all.extend(read_category(&app, cat, limit));
    }
    all.sort_by(|a, b| b.modified.cmp(&a.modified));
    Ok(all)
}

/// يفتح ملفاً من ملفات النظام ببرنامج ويندوز المعتاد له.
///
/// **لا يقبل مساراً.** فئةٌ من قائمة مغلقة واسمُ ملف، ثم `resolve_existing`
/// تعقّم الاسم وتبني المسار وتتحقّق أنه تحت مجلّده وأن لاحقته من لواحق
/// الفئة وأنه ملف قائم. فلا يصل إلى نظام التشغيل شيء اختارته الواجهة.
///
/// والتنفيذ بـ`explorer.exe` لا بصدفة: الوسيط يُمرَّر عنصراً واحداً في
/// `argv` بلا تفسير، فلا اقتباس يُكسر ولا أمر يُحقن. ولهذا أيضاً لا تُضاف
/// إضافة `shell` إلى Tauri: ما لا يُمنح لا يُساء استعماله.
#[tauri::command]
fn tg_open_file(app: tauri::AppHandle, category: String, name: String) -> Result<(), String> {
    let cat = Category::parse(&category).ok_or("فئة غير معروفة")?;
    let file = resolve_existing(&documents(&app)?, cat, &name)?;
    open_with_shell(&file)
}

/// يفتح مجلّد فئةٍ في مستكشف ويندوز. يُنشأ إن لم يكن موجوداً حتى لا تُقال
/// للمستخدمة «افتحي مجلّداً» ثم لا يُفتح شيء.
#[tauri::command]
fn tg_open_folder(app: tauri::AppHandle, category: Option<String>) -> Result<(), String> {
    let docs = documents(&app)?;
    let dir = match category.as_deref() {
        None | Some("") | Some("root") => {
            let root = docs.join(ROOT_DIR);
            std::fs::create_dir_all(&root).map_err(|e| format!("تعذّر إنشاء المجلّد: {e}"))?;
            root
        }
        Some(c) => {
            let cat = Category::parse(c).ok_or("فئة غير معروفة")?;
            category_dir(&docs, cat)?
        }
    };
    open_with_shell(&dir)
}

/// النداء الوحيد الذي يخرج إلى نظام التشغيل — وكل ما يصله بُني هنا لا هناك.
fn open_with_shell(target: &Path) -> Result<(), String> {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        // `explorer.exe <path>` يفتح الملف ببرنامجه المعتاد والمجلّد في
        // المستكشف. ورمز خروجه لا يدلّ على النجاح (يُعيد 1 كثيراً وهو ناجح)،
        // فالمقيس هو أن الإطلاق نفسه وقع.
        std::process::Command::new("explorer.exe")
            .arg(target)
            .creation_flags(CREATE_NO_WINDOW)
            .spawn()
            .map(|_| ())
            .map_err(|e| format!("تعذّر فتح الملف: {e}"))
    }
    #[cfg(not(windows))]
    {
        let _ = target;
        Err("فتح الملفات متاح في تطبيق ويندوز".into())
    }
}

/* ============================ بدء التشغيل ============================
   نافذة البدء ليست زينة: النافذة الرئيسية تبقى مخفيّة حتى تجهز الواجهة،
   فلا ترى المستخدمة هيكلاً فارغاً يُملأ أمامها. وثلاث قواعد تحكمها:

     · لا تبقى أبداً. الواجهة تنادي `tg_ready` عند الجاهزية **وعند فشل
       الإقلاع أيضاً**؛ ومن فوقهما حارسٌ زمنيّ في هذا الملف يكشف النافذة
       الرئيسية مهما حدث. فشاشةُ بدءٍ عالقة أسوأ من غياب شاشة بدء.
     · لا تُبطئ. لا انتظار مفتعل: ما يُنتظر هو زمن الإقلاع الحقيقي وحده،
       وتحته حدّ أدنى قصير يكفي لإتمام التلاشي فلا تومض النافذة وميضاً.
     · تُكشف مرّة واحدة. `REVEALED` يمنع تكرار الإظهار والإغلاق.
*/
static STARTED: OnceLock<Instant> = OnceLock::new();
static REVEALED: AtomicBool = AtomicBool::new(false);
/// أقصر زمن تبقى فيه نافذة البدء — مهلة انتقال لا حشوٌ لبلوغ رقم.
const MIN_SPLASH_MS: u128 = 350;
/// الحارس: بعده تُكشف النافذة الرئيسية ولو لم تنطق الواجهة.
const SPLASH_WATCHDOG_MS: u64 = 12_000;

fn reveal_main(app: &tauri::AppHandle) {
    if REVEALED.swap(true, Ordering::SeqCst) {
        return;
    }
    if let Some(main) = app.get_webview_window("main") {
        let _ = main.show();
        let _ = main.set_focus();
    }
    if let Some(splash) = app.get_webview_window("splash") {
        let _ = splash.close();
    }
}

/// تُناديها الواجهة حين تنتهي من الإقلاع — بنجاحه أو بفشله.
#[tauri::command]
fn tg_ready(app: tauri::AppHandle) {
    let elapsed = STARTED.get().map(|t| t.elapsed().as_millis()).unwrap_or(u128::MAX);
    let rest = MIN_SPLASH_MS.saturating_sub(elapsed) as u64;
    if rest == 0 {
        return reveal_main(&app);
    }
    // لا يُحجب الخيط: الانتظار في خيط جانبي والنافذة تُكشف بعده
    std::thread::spawn(move || {
        std::thread::sleep(Duration::from_millis(rest));
        reveal_main(&app);
    });
}

/// واجهة طباعة ويندوز الحقيقية.
///
/// `window.print()` داخل WebView2 لا تفتح حواراً — لا حوار متصفّح ولا حوار
/// نظام — فكانت الطباعة في التطبيق المكتبي تسقط بلا أثر. الطريق الرسميّ هو
/// `ICoreWebView2_16::ShowPrintUI`، وهو ما يُستدعى هنا بحوار النظام حتى ترى
/// المستخدمة قائمة الطابعات المعتادة.
///
/// ويُطبع ما في العرض كلّه، فالواجهة تضع المستند المطلوب محتوىً علويّاً قبل
/// النداء وتعيد الشاشة بعده — انظري `UI.printNative` في الواجهة.
#[tauri::command]
fn tg_print(app: tauri::AppHandle) -> Result<(), String> {
    #[cfg(windows)]
    {
        use webview2_com::Microsoft::Web::WebView2::Win32::{
            ICoreWebView2_16, COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM,
        };
        use windows_core::Interface;

        let window = app
            .get_webview_window("main")
            .ok_or("نافذة التطبيق غير متاحة")?;
        let (tx, rx) = std::sync::mpsc::sync_channel::<Result<(), String>>(1);
        window
            .with_webview(move |webview| {
                let result = (|| -> Result<(), String> {
                    let controller = webview.controller();
                    let core = unsafe { controller.CoreWebView2() }
                        .map_err(|e| format!("تعذّر الوصول إلى محرّك العرض: {e}"))?;
                    let v16: ICoreWebView2_16 = core
                        .cast()
                        .map_err(|_| "نسخة WebView2 على هذا الجهاز أقدم من أن تفتح حوار الطباعة".to_string())?;
                    unsafe { v16.ShowPrintUI(COREWEBVIEW2_PRINT_DIALOG_KIND_SYSTEM) }
                        .map_err(|e| format!("تعذّر فتح حوار الطباعة: {e}"))
                })();
                let _ = tx.send(result);
            })
            .map_err(|e| format!("تعذّر تهيئة الطباعة: {e}"))?;

        // الاستدعاء يُنفَّذ على الخيط الرئيسي؛ المهلة تمنع تعليقاً صامتاً
        match rx.recv_timeout(std::time::Duration::from_secs(10)) {
            Ok(r) => r,
            Err(_) => Err("لم تستجب واجهة الطباعة".into()),
        }
    }
    #[cfg(not(windows))]
    {
        let _ = app;
        Err("الطباعة الأصلية متاحة على ويندوز".into())
    }
}

fn main() {
    STARTED.get_or_init(Instant::now);
    tauri::Builder::default()
        .setup(|app| {
            // حارس نافذة البدء: يعمل حتى لو لم تُقلع الواجهة أصلاً
            let handle = app.handle().clone();
            std::thread::spawn(move || {
                std::thread::sleep(Duration::from_millis(SPLASH_WATCHDOG_MS));
                reveal_main(&handle);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            tg_env,
            tg_save,
            tg_list_files,
            tg_list_backups,
            tg_read_backup,
            tg_prune_backups,
            tg_open_file,
            tg_open_folder,
            tg_ready,
            tg_print
        ])
        .run(tauri::generate_context!())
        .expect("تعذّر تشغيل تبارك جيم");
}
