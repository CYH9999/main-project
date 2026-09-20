// ============================================================================
// هويّة البناء تُخبز في الملف التنفيذي هنا — لا تُكتب في الواجهة ولا تُخمَّن.
//
// السبب: نسختان من التطبيق تحملان الرقم 7.6.0 نفسه لا يفرّق بينهما شيء
// يراه أحد. فلا المستخدمة تعرف أيّهما ثبّتت، ولا نحن نستطيع إثبات أن ما
// اختُبر هو ما بُني. الرقم وحده ليس هويّة.
//
// فكل بناء يحمل الآن: النسخة، وبصمة الالتزام كاملةً ومختصرة، ووقت البناء،
// ومعرّف البناء. تُقرأ من بيئة CI إن وُجدت، وإلا من git مباشرةً، وإلا
// تُقال «غير معروفة» صراحةً — ولا تُخترع قيمة أبداً.
// ============================================================================
use std::process::Command;

fn git(args: &[&str]) -> Option<String> {
    let out = Command::new("git").args(args).output().ok()?;
    if !out.status.success() {
        return None;
    }
    let s = String::from_utf8(out.stdout).ok()?.trim().to_string();
    if s.is_empty() { None } else { Some(s) }
}

fn main() {
    // بصمة الالتزام: من CI أولاً (هي المصدر الموثوق هناك)، ثم من git.
    let sha = std::env::var("GITHUB_SHA")
        .ok()
        .filter(|s| !s.trim().is_empty())
        .or_else(|| git(&["rev-parse", "HEAD"]))
        .unwrap_or_else(|| "unknown".into());
    let short: String = sha.chars().take(7).collect();

    // هل في الشجرة تعديل غير ملتزَم؟ بناءٌ من شجرة متّسخة يُقال عنه ذلك.
    let dirty = git(&["status", "--porcelain"])
        .map(|s| !s.is_empty())
        .unwrap_or(false);

    // وقت البناء بتوقيت UTC، بلا اعتمادية إضافية.
    let at = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);

    // معرّف البناء: ما يُقرأ ويُقارن بالعين — البصمة المختصرة، ومعها علامة
    // الشجرة المتّسخة إن وُجدت، ورقم تشغيل CI إن كان.
    let run = std::env::var("GITHUB_RUN_NUMBER").unwrap_or_default();
    let build_id = format!(
        "{short}{}{}",
        if dirty { "-dirty" } else { "" },
        if run.is_empty() { String::new() } else { format!("-ci{run}") }
    );

    // بصمة الواجهة المولَّدة التي يغلّفها هذا البناء — يكتبها
    // `scripts/prepare-frontend.mjs` قبل الترجمة. فيحمل الملف التنفيذي
    // دليلاً على أي واجهة بداخله، لا ترتيبَ خطواتٍ نستنتج منه.
    let frontend = std::fs::read_to_string("../app/frontend-sha256.txt")
        .ok()
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
        .unwrap_or_else(|| "unknown".into());

    println!("cargo:rustc-env=TG_FRONTEND_SHA={frontend}");
    println!("cargo:rerun-if-changed=../app/frontend-sha256.txt");
    println!("cargo:rustc-env=TG_GIT_SHA={sha}");
    println!("cargo:rustc-env=TG_GIT_SHORT={short}");
    println!("cargo:rustc-env=TG_BUILD_AT={at}");
    println!("cargo:rustc-env=TG_BUILD_ID={build_id}");

    // تُعاد القراءة حين يتغيّر الالتزام أو بيئة CI — لا تُجمَّد قيمة قديمة.
    println!("cargo:rerun-if-env-changed=GITHUB_SHA");
    println!("cargo:rerun-if-env-changed=GITHUB_RUN_NUMBER");
    println!("cargo:rerun-if-changed=../.git/HEAD");

    tauri_build::build()
}
