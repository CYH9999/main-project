// نافذة واحدة تحمل واجهة تبارك جيم نفسها، وجسر أصليّ ضيّق لثلاثة أشياء لا
// يستطيع محرّك العرض وحده أن يفعلها في تطبيق مكتبي:
//
//   1. فتح واجهة طباعة ويندوز الحقيقية (ShowPrintUI) — `window.print()` في
//      WebView2 لا تفتح حواراً، فكانت الطباعة تسقط صامتة.
//   2. كتابة ملف إلى مجلّد معروف بدل «تنزيل» ينتهي في Downloads.
//   3. قراءة مجلّد النسخ الاحتياطية وتقليمه.
//
// وما لا يفعله هذا الجسر أهمّ ممّا يفعله: لا يقبل مساراً من الواجهة أبداً.
// الواجهة ترسل فئةً من قائمة مغلقة واسم ملف، والمسار يُبنى هنا. فلا سبيل
// إلى الكتابة خارج مجلّدَي «تبارك جيم» مهما أُرسل.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod paths;

use base64::Engine;
use paths::{assert_inside, category_dir, plan_prune, safe_file_name, unique_path, Category, ROOT_DIR};
use serde::Serialize;
use std::path::PathBuf;
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
struct Env {
    platform: String,
    root: String,
    exports: String,
    backups: String,
    can_print: bool,
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
    let tmp = target.with_extension("tg-part");
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

fn list_kind(app: &tauri::AppHandle, cat: Category, kind: &str) -> Vec<BackupFile> {
    let Ok(docs) = documents(app) else {
        return Vec::new();
    };
    let Ok(dir) = category_dir(&docs, cat) else {
        return Vec::new();
    };
    let Ok(rd) = std::fs::read_dir(&dir) else {
        return Vec::new();
    };
    let mut out = Vec::new();
    for entry in rd.flatten() {
        let p = entry.path();
        if p.extension().and_then(|s| s.to_str()) != Some("json") {
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
        out.push(BackupFile {
            kind: kind.to_string(),
            name: entry.file_name().to_string_lossy().to_string(),
            bytes: meta.len(),
            modified,
        });
    }
    out.sort_by(|a, b| b.modified.cmp(&a.modified));
    out
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
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![
            tg_env,
            tg_save,
            tg_list_backups,
            tg_read_backup,
            tg_prune_backups,
            tg_print
        ])
        .run(tauri::generate_context!())
        .expect("تعذّر تشغيل تبارك جيم");
}
