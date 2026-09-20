//! بناء المسارات وتعقيم أسماء الملفات.
//!
//! القاعدة الحاكمة: **الواجهة لا ترى مساراً ولا تبنيه.** تُرسل فئةً معروفة
//! («csv» أو «backup» …) واسم ملف، وهذا الملف وحده يقرّر أين يقع ذلك على
//! القرص. فما لا يُمرَّر لا يُساء استعماله، ولا يوجد وسيط يمكن حقن `..` فيه
//! ليخرج من المجلّد المقصود.

use std::path::{Component, Path, PathBuf};

/// اسم المجلّد الجذر داخل «المستندات» — اسم النظام كما تقرؤه المستخدمة.
pub const ROOT_DIR: &str = "تبارك جيم";

/// الفئات التي تقبلها الواجهة. أي قيمة أخرى تُرفض ولا تُترجم إلى مسار.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Category {
    Csv,
    Excel,
    Word,
    BackupManual,
    BackupAuto,
}

impl Category {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "csv" => Some(Self::Csv),
            "excel" => Some(Self::Excel),
            "word" => Some(Self::Word),
            "backup" | "backup-manual" => Some(Self::BackupManual),
            "backup-auto" | "backup-automatic" => Some(Self::BackupAuto),
            _ => None,
        }
    }

    /// المسار النسبي تحت مجلّد الجذر. ثابت في الشيفرة لا مبنيّ من مدخلات.
    pub fn relative(self) -> &'static [&'static str] {
        match self {
            Self::Csv => &["Exports", "CSV"],
            Self::Excel => &["Exports", "Excel"],
            Self::Word => &["Exports", "Word"],
            Self::BackupManual => &["Backups", "manual"],
            Self::BackupAuto => &["Backups", "automatic"],
        }
    }
}

/// أسماء أجهزة محجوزة في ويندوز: ملف بهذا الاسم لا يُنشأ مهما كانت اللاحقة.
const RESERVED: &[&str] = &[
    "CON", "PRN", "AUX", "NUL", "COM1", "COM2", "COM3", "COM4", "COM5", "COM6", "COM7", "COM8",
    "COM9", "LPT1", "LPT2", "LPT3", "LPT4", "LPT5", "LPT6", "LPT7", "LPT8", "LPT9",
];

/// أقصى طول للاسم قبل اللاحقة — يبقى المسار الكامل بعيداً عن حدّ ويندوز.
const MAX_STEM: usize = 110;

/// يحوّل اسماً تكتبه الواجهة إلى اسم ملف آمن على ويندوز.
///
/// العربية تمرّ كما هي. ويسقط كل ما قد يخرج من المجلّد أو يكسر نظام الملفات:
/// فواصل المسار، ومحارف ويندوز الممنوعة، ومحارف التحكّم، والنقاط والمسافات
/// في الطرفين، وأسماء الأجهزة المحجوزة.
pub fn safe_file_name(raw: &str) -> Result<String, String> {
    // اللاحقة تُفصل أولاً حتى لا يبتلعها التقصير
    let (stem_raw, ext_raw) = match raw.rfind('.') {
        Some(i) if i > 0 && i + 1 < raw.len() && raw.len() - i <= 8 => {
            (&raw[..i], Some(&raw[i + 1..]))
        }
        _ => (raw, None),
    };

    let clean = |s: &str| -> String {
        s.chars()
            .map(|c| match c {
                '<' | '>' | ':' | '"' | '/' | '\\' | '|' | '?' | '*' => '-',
                c if (c as u32) < 0x20 || c as u32 == 0x7f => '-',
                c => c,
            })
            .collect::<String>()
    };

    let mut stem = clean(stem_raw);
    // النقاط والمسافات في الطرفين: ويندوز يحذفها صامتاً فيتغيّر الاسم تحتنا
    stem = stem.trim_matches(|c: char| c == '.' || c == ' ').to_string();
    while stem.contains("..") {
        stem = stem.replace("..", ".");
    }
    if stem.chars().count() > MAX_STEM {
        stem = stem.chars().take(MAX_STEM).collect();
        stem = stem.trim_end_matches(|c: char| c == '.' || c == ' ').to_string();
    }
    if stem.is_empty() {
        return Err("اسم الملف فارغ بعد التنقية".into());
    }
    if RESERVED.iter().any(|r| r.eq_ignore_ascii_case(&stem)) {
        stem.push('_');
    }

    let ext = ext_raw
        .map(|e| {
            clean(e)
                .chars()
                .filter(|c| c.is_ascii_alphanumeric())
                .collect::<String>()
        })
        .filter(|e| !e.is_empty());

    let name = match ext {
        Some(e) => format!("{stem}.{e}"),
        None => stem,
    };

    // حارس أخير: ما خرج يجب أن يكون مكوّناً عادياً واحداً لا مساراً
    let p = Path::new(&name);
    let mut comps = p.components();
    match (comps.next(), comps.next()) {
        (Some(Component::Normal(_)), None) => Ok(name),
        _ => Err("اسم الملف غير صالح".into()),
    }
}

/// مجلّد الفئة تحت جذر النظام، ويُنشأ إن لم يكن موجوداً.
pub fn category_dir(documents: &Path, cat: Category) -> Result<PathBuf, String> {
    let mut dir = documents.join(ROOT_DIR);
    for part in cat.relative() {
        dir.push(part);
    }
    std::fs::create_dir_all(&dir)
        .map_err(|e| format!("تعذّر إنشاء مجلّد الحفظ: {e}"))?;
    Ok(dir)
}

/// مسار غير مستعمَل داخل المجلّد: إن وُجد الاسم أُضيف لاحقٌ رقميّ محدَّد
/// بدل الكتابة فوق ملف قائم بصمت.
pub fn unique_path(dir: &Path, file_name: &str) -> Result<PathBuf, String> {
    let first = dir.join(file_name);
    if !first.exists() {
        return Ok(first);
    }
    let p = Path::new(file_name);
    let stem = p.file_stem().and_then(|s| s.to_str()).unwrap_or(file_name);
    let ext = p.extension().and_then(|s| s.to_str());
    for n in 2..=999u32 {
        let candidate = match ext {
            Some(e) => dir.join(format!("{stem}-{n}.{e}")),
            None => dir.join(format!("{stem}-{n}")),
        };
        if !candidate.exists() {
            return Ok(candidate);
        }
    }
    Err("تعذّر إيجاد اسم غير مستعمَل — المجلّد يحوي نسخاً كثيرة بالاسم نفسه".into())
}

/// تحقّق أخير قبل الكتابة: الملف تحت المجلّد المقصود فعلاً.
pub fn assert_inside(dir: &Path, file: &Path) -> Result<(), String> {
    let parent = file.parent().ok_or("مسار بلا مجلّد")?;
    if parent != dir {
        return Err("المسار خرج عن مجلّده المقصود".into());
    }
    Ok(())
}

/// أي النسخ تُحذف عند التقليم.
///
/// مفصولة عن نظام الملفات عمداً حتى تُختبر السياسة وحدها: تُعطى الأسماء
/// مرتّبةً من الأحدث إلى الأقدم فتُعيد ما يُحذف. وقاعدتان لا تُكسران —
/// الأحدث لا يُحذف أبداً، ولا يُحذف شيء إن لم يوجد ما هو أحدث منه.
pub fn plan_prune(newest_first: &[String], keep: usize) -> Vec<String> {
    let keep = keep.max(1);
    if newest_first.len() <= keep {
        return Vec::new();
    }
    newest_first[keep..].to_vec()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn keeps_arabic_and_strips_windows_specials() {
        assert_eq!(safe_file_name("تقرير-المدفوعات-2026-09-20.xlsx").unwrap(),
                   "تقرير-المدفوعات-2026-09-20.xlsx");
        assert_eq!(safe_file_name("a<b>c:d\"e/f\\g|h?i*j.csv").unwrap(),
                   "a-b-c-d-e-f-g-h-i-j.csv");
    }

    #[test]
    fn rejects_traversal_and_empties() {
        // النقاط تُقصّ من الطرفين فلا يبقى شيء
        assert!(safe_file_name("..").is_err());
        assert!(safe_file_name("../../etc/passwd").is_ok()); // صار اسماً واحداً
        let n = safe_file_name("../../etc/passwd").unwrap();
        assert!(!n.contains('/') && !n.contains('\\'), "{n}");
        assert!(safe_file_name("").is_err());
        assert!(safe_file_name("   ").is_err());
        assert!(safe_file_name("....").is_err());
    }

    #[test]
    fn handles_reserved_device_names() {
        assert_eq!(safe_file_name("CON.csv").unwrap(), "CON_.csv");
        assert_eq!(safe_file_name("nul").unwrap(), "nul_");
    }

    #[test]
    fn caps_length_without_losing_extension() {
        let long = "ط".repeat(400) + ".csv";
        let out = safe_file_name(&long).unwrap();
        assert!(out.ends_with(".csv"));
        assert!(out.chars().count() <= MAX_STEM + 4);
    }

    #[test]
    fn prune_keeps_newest_and_never_empties() {
        let f: Vec<String> = (1..=20).map(|i| format!("n{i}.json")).collect();
        let gone = plan_prune(&f, 14);
        assert_eq!(gone.len(), 6);
        assert_eq!(gone[0], "n15.json");
        assert!(!gone.contains(&"n1.json".to_string()), "الأحدث لا يُحذف");

        assert!(plan_prune(&f[..14], 14).is_empty(), "لا حذف عند الحدّ");
        assert!(plan_prune(&f[..3], 14).is_empty(), "لا حذف تحت الحدّ");
        assert!(plan_prune(&[], 14).is_empty());
        // keep=0 يُرفع إلى 1: النسخة الأحدث تبقى مهما طُلب
        let gone0 = plan_prune(&f, 0);
        assert_eq!(gone0.len(), 19);
        assert!(!gone0.contains(&"n1.json".to_string()));
    }

    #[test]
    fn category_paths_are_fixed() {
        assert_eq!(Category::parse("csv").unwrap().relative(), &["Exports", "CSV"]);
        assert_eq!(Category::parse("backup").unwrap().relative(), &["Backups", "manual"]);
        assert_eq!(Category::parse("backup-auto").unwrap().relative(), &["Backups", "automatic"]);
        assert!(Category::parse("../../windows").is_none());
        assert!(Category::parse("shell").is_none());
    }
}
