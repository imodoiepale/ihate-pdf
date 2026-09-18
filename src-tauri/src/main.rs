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
