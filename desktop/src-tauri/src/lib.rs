//! Cowdrey One's app shell. The interface is the web app in ../web, bundled into the app. The shell adds what a
//! browser can't do:
//! - Mac (src/mac.rs): see which apps are installed and open them; the Mac app from GitHub (.dmg) also installs or
//!   updates every app with one click (src/mac/install.rs).
//! - Android and iPhone (plugins/installer): install APKs through Android's installer, see which apps are
//!   installed, and show App Store pages inside the app.
//! Links (App Store pages, downloads, web apps) open with the system.
//!
//! The Mac App Store version is built with `--features appstore` (with tauri.appstore.conf.json): it has no installer
//! at all, neither the .dmg installer nor the installer plugin, because an app from the Mac App Store may not
//! download or install other apps (App Review guidelines 2.4.5 and 2.5.2). It opens each app's Mac App Store page,
//! or its web version, with the system instead.

mod mac;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default().plugin(tauri_plugin_opener::init());
    #[cfg(not(feature = "appstore"))]
    let builder = builder
        .plugin(tauri_plugin_installer::init())
        .invoke_handler(tauri::generate_handler![mac::installed_apps, mac::install::install_app, mac::open_app]);
    #[cfg(feature = "appstore")]
    let builder = builder.invoke_handler(tauri::generate_handler![mac::installed_apps, mac::open_app]);
    builder
        .run(tauri::generate_context!())
        .expect("Cowdrey One could not start");
}
