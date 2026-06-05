use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};
use walkdir::WalkDir;

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

static PTY_SESSIONS: Lazy<Mutex<HashMap<u32, PtySession>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static NEXT_PTY_ID: AtomicU32 = AtomicU32::new(1);

#[tauri::command]
fn create_pty(app: AppHandle, cols: u16, rows: u16) -> Result<u32, String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    #[cfg(target_os = "windows")]
    let shell = std::env::var("COMSPEC").unwrap_or_else(|_| "powershell.exe".to_string());
    #[cfg(not(target_os = "windows"))]
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/bash".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");

    pair.slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    drop(pair.slave);

    let id = NEXT_PTY_ID.fetch_add(1, Ordering::SeqCst);

    let master = pair.master;
    let mut reader = master.try_clone_reader().map_err(|e| e.to_string())?;
    let writer = master.take_writer().map_err(|e| e.to_string())?;

    let app_clone = app.clone();
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) | Err(_) => break,
                Ok(n) => {
                    let data = String::from_utf8_lossy(&buf[..n]).to_string();
                    let _ = app_clone.emit(&format!("pty-output-{}", id), data);
                }
            }
        }
        let _ = app_clone.emit(&format!("pty-closed-{}", id), ());
    });

    PTY_SESSIONS
        .lock()
        .unwrap()
        .insert(id, PtySession { writer, master });

    Ok(id)
}

#[tauri::command]
fn write_to_pty(id: u32, data: String) -> Result<(), String> {
    let mut sessions = PTY_SESSIONS.lock().unwrap();
    if let Some(session) = sessions.get_mut(&id) {
        session
            .writer
            .write_all(data.as_bytes())
            .map_err(|e| e.to_string())?;
        session.writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn resize_pty(id: u32, cols: u16, rows: u16) -> Result<(), String> {
    let sessions = PTY_SESSIONS.lock().unwrap();
    if let Some(session) = sessions.get(&id) {
        session
            .master
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn kill_pty(id: u32) -> Result<(), String> {
    PTY_SESSIONS.lock().unwrap().remove(&id);
    Ok(())
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub children: Option<Vec<FileEntry>>,
    pub extension: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct FileContent {
    pub content: String,
    pub path: String,
}

#[tauri::command]
fn read_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&path);
    if !dir_path.exists() {
        return Err(format!("Path does not exist: {}", path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    let read_dir = fs::read_dir(dir_path).map_err(|e| e.to_string())?;

    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let file_name = entry.file_name().to_string_lossy().to_string();
        let file_path = entry.path().to_string_lossy().to_string();

        if file_name.starts_with('.') {
            continue;
        }

        let extension = if metadata.is_file() {
            Path::new(&file_name)
                .extension()
                .map(|e| e.to_string_lossy().to_string())
        } else {
            None
        };

        let children = if metadata.is_dir() {
            Some(Vec::new())
        } else {
            None
        };

        entries.push(FileEntry {
            name: file_name,
            path: file_path,
            is_dir: metadata.is_dir(),
            children,
            extension,
        });
    }

    entries.sort_by(|a, b| match (a.is_dir, b.is_dir) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()),
    });

    Ok(entries)
}

#[tauri::command]
fn read_file(path: String) -> Result<FileContent, String> {
    let content = fs::read_to_string(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    Ok(FileContent { content, path })
}

#[tauri::command]
fn write_file(path: String, content: String) -> Result<(), String> {
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, content).map_err(|e| format!("Failed to write file: {}", e))?;
    Ok(())
}

#[tauri::command]
fn create_file(path: String) -> Result<(), String> {
    if Path::new(&path).exists() {
        return Err("File already exists".to_string());
    }
    if let Some(parent) = Path::new(&path).parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&path, "").map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn create_directory(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn delete_path(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.is_dir() {
        fs::remove_dir_all(&path).map_err(|e| e.to_string())?;
    } else {
        fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn rename_path(old_path: String, new_path: String) -> Result<(), String> {
    fs::rename(&old_path, &new_path).map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
fn path_exists(path: String) -> bool {
    Path::new(&path).exists()
}

#[tauri::command]
fn get_file_info(path: String) -> Result<FileEntry, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err("Path does not exist".to_string());
    }
    let metadata = fs::metadata(&path).map_err(|e| e.to_string())?;
    let name = p
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let extension = if metadata.is_file() {
        p.extension().map(|e| e.to_string_lossy().to_string())
    } else {
        None
    };
    Ok(FileEntry {
        name,
        path,
        is_dir: metadata.is_dir(),
        children: if metadata.is_dir() { Some(vec![]) } else { None },
        extension,
    })
}

#[tauri::command]
fn search_files(root: String, query: String) -> Result<Vec<FileEntry>, String> {
    let mut results = Vec::new();
    let query_lower = query.to_lowercase();

    for entry in WalkDir::new(&root)
        .follow_links(false)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| {
            let name = e.file_name().to_string_lossy().to_lowercase();
            !name.starts_with('.') && name.contains(&query_lower)
        })
        .take(50)
    {
        let metadata = entry.metadata().map_err(|e| e.to_string())?;
        let name = entry.file_name().to_string_lossy().to_string();
        let path = entry.path().to_string_lossy().to_string();
        let extension = if metadata.is_file() {
            entry
                .path()
                .extension()
                .map(|e| e.to_string_lossy().to_string())
        } else {
            None
        };
        results.push(FileEntry {
            name,
            path,
            is_dir: metadata.is_dir(),
            children: None,
            extension,
        });
    }

    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .invoke_handler(tauri::generate_handler![
            read_directory,
            read_file,
            write_file,
            create_file,
            create_directory,
            delete_path,
            rename_path,
            path_exists,
            get_file_info,
            search_files,
            create_pty,
            write_to_pty,
            resize_pty,
            kill_pty,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
