//! Cowdrey One's installer on iPhone, iPad and Android. The work is done natively:
//! - Android (android/src/main/java/InstallerPlugin.kt): downloads each app's APK and hands it to Android's
//!   package installer, which asks once per app; finds which apps are installed, and their versions.
//! - iPhone and iPad (ios/Sources/InstallerPlugin.swift): shows an app's App Store page inside Cowdrey One.
//! On the Mac, installing is done by the app itself (src/mac.rs), so this plugin does nothing there.

use tauri::{
    plugin::{Builder, TauriPlugin},
    Runtime,
};

#[cfg(mobile)]
use tauri::Manager;

#[cfg(target_os = "android")]
const PLUGIN_IDENTIFIER: &str = "com.bradcowdrey.installer";

#[cfg(target_os = "ios")]
tauri::ios_plugin_binding!(init_plugin_installer);

#[cfg(mobile)]
struct Native<R: Runtime>(tauri::plugin::PluginHandle<R>);

/// The native methods the web app may call, and nothing else.
const METHODS: &[&str] = &["installedVersions", "openApp", "canInstall", "openInstallSettings", "install", "showStore"];

#[tauri::command]
async fn native<R: Runtime>(
    app: tauri::AppHandle<R>,
    method: String,
    args: Option<serde_json::Value>,
) -> Result<serde_json::Value, String> {
    if !METHODS.contains(&method.as_str()) {
        return Err(format!("Unknown method {method}"));
    }
    #[cfg(mobile)]
    {
        let handle = app.state::<Native<R>>().0.clone();
        handle
            .run_mobile_plugin_async(&method, args.unwrap_or_else(|| serde_json::json!({})))
            .await
            .map_err(|e| e.to_string())
    }
    #[cfg(not(mobile))]
    {
        let _ = (app, args);
        Err("This only works in the iPhone, iPad and Android apps".into())
    }
}

/// Initializes the plugin.
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new("installer")
        .invoke_handler(tauri::generate_handler![native])
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                let handle = _api.register_android_plugin(PLUGIN_IDENTIFIER, "InstallerPlugin")?;
                _app.manage(Native(handle));
            }
            #[cfg(target_os = "ios")]
            {
                let handle = _api.register_ios_plugin(init_plugin_installer)?;
                _app.manage(Native(handle));
            }
            Ok(())
        })
        .build()
}
