//! Cowdrey One's app shell. The whole interface is the web app in ../web, bundled into the app; this only
//! opens a window for it and lets it hand links (App Store, downloads, web apps) to the system.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("Cowdrey One could not start");
}
