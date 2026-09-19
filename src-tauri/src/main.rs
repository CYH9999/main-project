// نافذة واحدة تحمل واجهة تبارك جيم نفسها. لا منطق عمل هنا ولا جسر أصليّ:
// كل ما يفعله هذا الملف أن يفتح النافذة الموصوفة في tauri.conf.json.
//
// `windows_subsystem = "windows"` يمنع ظهور نافذة طرفية سوداء خلف التطبيق
// في بناء الإصدار على ويندوز — وتبقى في بناء التطوير لتُقرأ فيها الرسائل.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("تعذّر تشغيل تبارك جيم");
}
