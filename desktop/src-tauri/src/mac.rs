//! Cowdrey One's Mac side: finds which of Bradley Cowdrey's apps are installed, and opens one.
//!
//! The Mac app from GitHub (.dmg) also installs or updates an app with a single click (mac/install.rs). The Mac App
//! Store version is built with the `appstore` feature, which leaves that out entirely: an app from the Mac App Store
//! may not download or install other apps (App Review guidelines 2.4.5 and 2.5.2), so it sends people to each
//! app's Mac App Store page, or its web version, instead.
//!
//! It compiles on every desktop system (so it can be checked anywhere) but only does anything on macOS.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MacApp {
    id: String,
    bundle_id: String,
    app_name: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Found {
    version: String,
    /// Installed from the Mac App Store, which keeps it up to date.
    app_store: bool,
    path: String,
}

fn app_dirs() -> Vec<PathBuf> {
    let mut dirs = vec![PathBuf::from("/Applications")];
    if let Some(home) = std::env::var_os("HOME") {
        dirs.push(PathBuf::from(home).join("Applications"));
    }
    dirs
}

fn plist(app: &Path, key: &str) -> Option<String> {
    let out = Command::new("/usr/bin/plutil")
        .args(["-extract", key, "raw", "-o", "-"])
        .arg(app.join("Contents/Info.plist"))
        .output()
        .ok()?;
    if !out.status.success() {
        return None;
    }
    let v = String::from_utf8_lossy(&out.stdout).trim().to_string();
    (!v.is_empty()).then_some(v)
}

fn found_at(path: &Path) -> Found {
    Found {
        version: plist(path, "CFBundleShortVersionString").unwrap_or_default(),
        app_store: path.join("Contents/_MASReceipt/receipt").exists(),
        path: path.display().to_string(),
    }
}

fn find(app: &MacApp) -> Option<PathBuf> {
    app_dirs()
        .into_iter()
        .map(|d| d.join(&app.app_name))
        .find(|p| p.exists() && plist(p, "CFBundleIdentifier").as_deref() == Some(app.bundle_id.as_str()))
}

/// Which of these apps are installed, with their versions.
#[tauri::command]
pub async fn installed_apps(apps: Vec<MacApp>) -> Result<HashMap<String, Found>, String> {
    if !cfg!(target_os = "macos") {
        return Ok(HashMap::new());
    }
    tauri::async_runtime::spawn_blocking(move || {
        apps.iter().filter_map(|a| find(a).map(|p| (a.id.clone(), found_at(&p)))).collect()
    })
    .await
    .map_err(|e| e.to_string())
}

fn run(program: &str, args: &[&std::ffi::OsStr]) -> Result<std::process::Output, String> {
    let out = Command::new(program).args(args).output().map_err(|e| format!("{program}: {e}"))?;
    if out.status.success() {
        Ok(out)
    } else {
        let err = String::from_utf8_lossy(&out.stderr).trim().to_string();
        Err(if err.is_empty() { format!("{program} failed") } else { err })
    }
}

macro_rules! os {
    ($($a:expr),* $(,)?) => { &[$(std::ffi::OsStr::new($a)),*] };
}


// Installing from a .dmg: only in the Mac app from GitHub, never in the Mac App Store version.
#[cfg(not(feature = "appstore"))]
pub mod install;

/// Opens an app that's installed.
#[tauri::command]
pub async fn open_app(bundle_id: String) -> Result<(), String> {
    if !cfg!(target_os = "macos") {
        return Err("Only in the Mac app".into());
    }
    if !bundle_id.starts_with("com.bradcowdrey.") {
        return Err("That isn't one of Bradley Cowdrey's apps".into());
    }
    run("/usr/bin/open", os!["-b", bundle_id.as_str()]).map(|_| ())
}
