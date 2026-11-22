//! Cowdrey One's app shell. The interface is the web app in ../web, bundled into the app. The shell adds what a
//! browser can't do:
//! - Mac (src/mac.rs): install or update every app with one click, and see which are installed.
//! - Android and iPhone (plugins/installer): install APKs through Android's installer, see which apps are
//!   installed, and show App Store pages inside the app.
//! Links (App Store pages, downloads, web apps) open with the system.

mod mac;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_installer::init())
        .invoke_handler(tauri::generate_handler![mac::installed_apps, mac::install_app, mac::open_app])
        .run(tauri::generate_context!())
        .expect("Cowdrey One could not start");
}
