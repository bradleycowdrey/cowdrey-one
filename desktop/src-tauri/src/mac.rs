//! Cowdrey One's installer on the Mac: finds which of Bradley Cowdrey's apps are installed, and installs or
//! updates one with a single click: it downloads the app's .dmg from its GitHub release, opens it, checks the app
//! inside, and copies it into Applications.
//!
//! Safety: only downloads from github.com/bradleycowdrey, only installs an app whose bundle ID is the one the
//! catalog names, and only skips macOS's first-open check (Gatekeeper) for apps signed by Bradley Cowdrey's Apple
//! team. Anything else keeps the quarantine flag a browser download would have, so macOS asks on first open.
//!
//! It compiles on every desktop system (so it can be checked anywhere) but only does anything on macOS.

use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::{AppHandle, Emitter, Runtime};

/// Bradley Cowdrey's Apple Developer team, which signs every app.
const TEAM_ID: &str = "2XV97FZ86G";
const DOWNLOADS_FROM: &str = "https://github.com/bradleycowdrey/";

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

#[derive(Clone, Serialize)]
struct Progress {
    id: String,
    stage: &'static str,
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

/// Installs (or updates) one app from its .dmg. Sends "install-progress" events: downloading, verifying,
/// installing, done.
#[tauri::command]
pub async fn install_app<R: Runtime>(
    app: AppHandle<R>,
    id: String,
    url: String,
    bundle_id: String,
    app_name: String,
) -> Result<Found, String> {
    if !cfg!(target_os = "macos") {
        return Err("Installing apps only works in the Mac app".into());
    }
    if !url.starts_with(DOWNLOADS_FROM) {
        return Err("That download isn't one of Bradley Cowdrey's apps".into());
    }
    if !app_name.ends_with(".app") || app_name.contains('/') {
        return Err("That isn't an app name".into());
    }
    tauri::async_runtime::spawn_blocking(move || install(&app, &id, &url, &bundle_id, &app_name))
        .await
        .map_err(|e| e.to_string())?
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

fn install<R: Runtime>(app: &AppHandle<R>, id: &str, url: &str, bundle_id: &str, app_name: &str) -> Result<Found, String> {
    let say = |stage: &'static str| {
        let _ = app.emit("install-progress", Progress { id: id.to_string(), stage });
    };
    let name = app_name.trim_end_matches(".app");
    let work = std::env::temp_dir().join(format!("cowdrey-one-{}-{}", id, std::process::id()));
    let _ = std::fs::remove_dir_all(&work);
    std::fs::create_dir_all(&work).map_err(|e| e.to_string())?;
    let dmg = work.join("app.dmg");
    let mount = work.join("volume");

    say("downloading");
    let result = run("/usr/bin/curl", os!["-fsSL", "--retry", "2", "-o", dmg.as_os_str(), url])
        .map_err(|e| format!("Couldn't download {name}: {e}"))
        .and_then(|_| {
            say("verifying");
            std::fs::create_dir_all(&mount).map_err(|e| e.to_string())?;
            run("/usr/bin/hdiutil", os!["attach", "-nobrowse", "-readonly", "-noautoopen", "-mountpoint", mount.as_os_str(), dmg.as_os_str()])
                .map_err(|e| format!("Couldn't open {name}'s disk image: {e}"))?;
            let installed = copy_in(&mount, bundle_id, app_name, name, &say);
            let _ = run("/usr/bin/hdiutil", os!["detach", mount.as_os_str(), "-force"]);
            installed
        });
    let _ = std::fs::remove_dir_all(&work);
    if result.is_ok() {
        say("done");
    }
    result
}

fn copy_in(mount: &Path, bundle_id: &str, app_name: &str, name: &str, say: &dyn Fn(&'static str)) -> Result<Found, String> {
    // The app in the disk image: by its name, or else the only .app there.
    let mut src = mount.join(app_name);
    if !src.exists() {
        src = std::fs::read_dir(mount)
            .map_err(|e| e.to_string())?
            .filter_map(|e| e.ok().map(|e| e.path()))
            .find(|p| p.extension().map_or(false, |x| x == "app"))
            .ok_or_else(|| format!("There's no app in {name}'s disk image"))?;
    }
    if plist(&src, "CFBundleIdentifier").as_deref() != Some(bundle_id) {
        return Err(format!("The app in the download isn't {name}"));
    }
    let signed = run("/usr/bin/codesign", os!["--verify", "--deep", "--strict", src.as_os_str()]).is_ok();
    let ours = signed
        && Command::new("/usr/bin/codesign")
            .args([std::ffi::OsStr::new("-dv"), std::ffi::OsStr::new("--verbose=2"), src.as_os_str()])
            .output()
            .map(|o| String::from_utf8_lossy(&o.stderr).lines().any(|l| l.trim() == format!("TeamIdentifier={TEAM_ID}")))
            .unwrap_or(false);

    say("installing");
    let dest_dir = writable_applications()?;
    let staged = dest_dir.join(format!(".{name}.cowdrey-one-new.app"));
    let _ = std::fs::remove_dir_all(&staged);
    run("/usr/bin/ditto", os![src.as_os_str(), staged.as_os_str()]).map_err(|e| format!("Couldn't copy {name}: {e}"))?;
    if !ours {
        // Not signed by Bradley Cowdrey's team: macOS checks it the first time it opens, as for any download.
        let stamp = format!("0081;{:x};Cowdrey One;", SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0));
        let _ = run("/usr/bin/xattr", os!["-w", "-r", "com.apple.quarantine", stamp.as_str(), staged.as_os_str()]);
    }
    // An earlier version goes to the Trash, so nothing is lost if the new one isn't wanted.
    let target = dest_dir.join(app_name);
    if target.exists() {
        let trash = std::env::var_os("HOME").map(|h| PathBuf::from(h).join(".Trash"));
        let stamp = SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0);
        let moved = trash
            .map(|t| std::fs::rename(&target, t.join(format!("{name} {stamp}.app"))).is_ok())
            .unwrap_or(false);
        if !moved {
            std::fs::remove_dir_all(&target).map_err(|e| format!("Couldn't replace the old {name}: {e}"))?;
        }
    }
    std::fs::rename(&staged, &target).map_err(|e| format!("Couldn't put {name} in Applications: {e}"))?;
    Ok(found_at(&target))
}

/// /Applications when this account can write there (an administrator), or else ~/Applications.
fn writable_applications() -> Result<PathBuf, String> {
    let system = PathBuf::from("/Applications");
    let probe = system.join(format!(".cowdrey-one-{}", std::process::id()));
    if std::fs::write(&probe, b"").is_ok() {
        let _ = std::fs::remove_file(&probe);
        return Ok(system);
    }
    let home = std::env::var_os("HOME").ok_or("No home folder")?;
    let mine = PathBuf::from(home).join("Applications");
    std::fs::create_dir_all(&mine).map_err(|e| e.to_string())?;
    Ok(mine)
}

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
