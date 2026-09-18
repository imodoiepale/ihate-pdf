#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::Mutex;
use std::thread;
use tauri::{Manager, RunEvent};

struct EngineProcess(Mutex<Option<Child>>);

fn repo_dir() -> PathBuf {
    PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."))
}

fn bundled_node(resource_dir: &Path) -> PathBuf {
    if cfg!(windows) {
        resource_dir.join("node").join("node.exe")
    } else {
        resource_dir.join("node").join("node")
    }
}

fn engine_script(resource_dir: &Path, repo: &Path) -> PathBuf {
    let packed = resource_dir.join("engine").join("index.cjs");
    if packed.exists() {
        return packed;
    }
    let nested = resource_dir.join("resources").join("engine").join("index.cjs");
    if nested.exists() {
        return nested;
    }
    repo.join("out").join("engine").join("index.cjs")
}

fn pdf_tools_dir(resource_dir: &Path, repo: &Path) -> PathBuf {
    let packed = resource_dir.join("pdf-tools");
    if packed.join("worker.py").exists() {
        return packed;
    }
    let nested = resource_dir.join("resources").join("pdf-tools");
    if nested.join("worker.py").exists() {
        return nested;
    }
    repo.join("resources")
}

fn vendor_bin_dirs(resource_dir: &Path) -> Vec<PathBuf> {
    let mut dirs = Vec::new();
    let plat = if cfg!(windows) {
        if cfg!(target_arch = "aarch64") {
            "win-arm64"
        } else {
            "win-x64"
        }
    } else if cfg!(target_os = "macos") {
        if cfg!(target_arch = "aarch64") {
            "mac-arm64"
        } else {
            "mac-x64"
        }
    } else if cfg!(target_arch = "aarch64") {
        "linux-arm64"
    } else {
        "linux-x64"
    };
    for root in [
        resource_dir.join("pdf-tools").join("bin"),
        resource_dir.join("bin"),
    ] {
        dirs.push(root.join(plat).join("bin"));
        dirs.push(root.join(plat));
        dirs.push(root);
    }
    let home = std::env::var("HOME")
        .ok()
        .or_else(|| std::env::var("USERPROFILE").ok())
        .map(PathBuf::from);
    if let Some(home) = home {
        if cfg!(target_os = "macos") {
            dirs.push(
                home.join("Library")
                    .join("Application Support")
                    .join("ihate-pdf")
                    .join("bin"),
            );
        } else if cfg!(windows) {
            if let Ok(local) = std::env::var("LOCALAPPDATA") {
                dirs.push(PathBuf::from(local).join("ihate-pdf").join("bin"));
            }
        } else {
            dirs.push(home.join(".local").join("share").join("ihate-pdf").join("bin"));
        }
        dirs.push(home.join(".ihate-pdf").join("bin"));
        dirs.push(home.join(".local").join("bin"));
    }
    dirs
}

fn prepend_path(cmd: &mut Command, resource_dir: &Path) {
    let sep = if cfg!(windows) { ';' } else { ':' };
    let extra = vendor_bin_dirs(resource_dir);
    let mut parts: Vec<String> = extra
        .iter()
        .map(|p| p.to_string_lossy().into_owned())
        .collect();
    if let Ok(old) = std::env::var("PATH") {
        parts.push(old);
    }
    cmd.env("PATH", parts.join(&sep.to_string()));
    if !cfg!(windows) {
        let libs: Vec<String> = extra
            .iter()
            .filter_map(|bin| bin.parent().map(|p| p.join("lib")))
            .map(|p| p.to_string_lossy().into_owned())
            .collect();
        let key = if cfg!(target_os = "macos") {
            "DYLD_LIBRARY_PATH"
        } else {
            "LD_LIBRARY_PATH"
        };
        let mut lib_parts = libs;
        if let Ok(old) = std::env::var(key) {
            lib_parts.push(old);
        }
        cmd.env(key, lib_parts.join(&sep.to_string()));
    }
}

fn spawn_engine(app: &tauri::AppHandle) -> Result<(), String> {
    let repo = repo_dir();
    let resource_dir = app
        .path()
        .resource_dir()
        .unwrap_or_else(|_| repo.join("src-tauri").join("resources"));

    let script = engine_script(&resource_dir, &repo);
    if !script.exists() {
        return Err(format!("engine script missing: {}", script.display()));
    }

    let bundled = bundled_node(&resource_dir);
    let node = if bundled.exists() {
        bundled
    } else if cfg!(debug_assertions) {
        PathBuf::from("node")
    } else {
        bundled
    };

    let tools = pdf_tools_dir(&resource_dir, &repo);
    let cwd = if cfg!(debug_assertions) { repo.clone() } else { tools.clone() };

    let mut cmd = Command::new(&node);
    cmd.arg(&script)
        .env("IHATEPDF_RESOURCES", &tools)
        .env("IHATEPDF_SHELL", "tauri")
        .current_dir(&cwd)
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped());
    prepend_path(&mut cmd, &resource_dir);

    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let mut child = cmd
        .spawn()
        .map_err(|e| format!("spawn {} {}: {e}", node.display(), script.display()))?;

    if let Some(out) = child.stdout.take() {
        thread::spawn(move || {
            for line in BufReader::new(out).lines().map_while(Result::ok) {
                eprintln!("[engine] {line}");
            }
        });
    }
    if let Some(err) = child.stderr.take() {
        thread::spawn(move || {
            for line in BufReader::new(err).lines().map_while(Result::ok) {
                eprintln!("[engine] {line}");
            }
        });
    }

    *app.state::<EngineProcess>().0.lock().map_err(|e| e.to_string())? = Some(child);
    Ok(())
}

fn kill_engine(app: &tauri::AppHandle) {
    if let Ok(mut guard) = app.state::<EngineProcess>().0.lock() {
        if let Some(mut child) = guard.take() {
            let _ = child.kill();
            let _ = child.wait();
        }
    }
}

fn main() {
    let app = tauri::Builder::default()
        .manage(EngineProcess(Mutex::new(None)))
        .setup(|app| {
            if let Err(err) = spawn_engine(app.handle()) {
                eprintln!("i hate pdf engine: {err}");
            }
            Ok(())
        })
        .build(tauri::generate_context!())
        .expect("error while building i hate pdf (tauri)");

    app.run(|app_handle, event| {
        if matches!(event, RunEvent::Exit | RunEvent::ExitRequested { .. }) {
            kill_engine(app_handle);
        }
    });
}
