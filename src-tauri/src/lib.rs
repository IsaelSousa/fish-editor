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

fn run_git(args: &[&str], dir: &Path) -> Result<String, String> {
    let mut cmd = std::process::Command::new("git");
    cmd.args(args)
        .current_dir(dir)
        .stdin(std::process::Stdio::null())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| e.to_string())?;

    if !output.status.success() {
        return Err(String::from_utf8_lossy(&output.stderr).to_string());
    }

    Ok(String::from_utf8_lossy(&output.stdout).to_string())
}

struct PtySession {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
}

static PTY_SESSIONS: Lazy<Mutex<HashMap<u32, PtySession>>> =
    Lazy::new(|| Mutex::new(HashMap::new()));

static NEXT_PTY_ID: AtomicU32 = AtomicU32::new(1);

#[tauri::command]
fn create_pty(app: AppHandle, cols: u16, rows: u16, cwd: Option<String>) -> Result<u32, String> {
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
    if let Some(dir) = cwd {
        if Path::new(&dir).exists() {
            cmd.cwd(dir);
        }
    }

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

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitCommit {
    pub hash: String,
    pub short_hash: String,
    pub message: String,
    pub author: String,
    pub time: String,
    pub refs: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GitLogEntry {
    pub graph_line: String,
    pub commit: Option<GitCommit>,
}

#[tauri::command]
fn get_git_log(path: String) -> Result<Vec<GitLogEntry>, String> {
    let git_dir = Path::new(&path).join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    let sep = "|||";
    let format_str = format!(
        "GITCOMMIT{}%H{}%h{}%s{}%an{}%ar{}%D",
        sep, sep, sep, sep, sep, sep
    );
    let pretty_arg = format!("--pretty=format:{}", format_str);

    let raw = run_git(
        &["log", "--graph", &pretty_arg, "--all", "--color=never", "-60"],
        Path::new(&path),
    )?;

    let log_output = raw;
    let marker = "GITCOMMIT|||";
    let mut entries = Vec::new();

    for line in log_output.as_str().lines() {
        if let Some(commit_pos) = line.find(marker) {
            let graph_part = line[..commit_pos].to_string();
            let data_part = &line[commit_pos + marker.len()..];
            let parts: Vec<&str> = data_part.splitn(6, "|||").collect();

            if parts.len() >= 6 {
                let refs: Vec<String> = parts[5]
                    .split(", ")
                    .filter(|r| !r.is_empty())
                    .map(|r| r.trim().to_string())
                    .collect();

                entries.push(GitLogEntry {
                    graph_line: graph_part,
                    commit: Some(GitCommit {
                        hash: parts[0].to_string(),
                        short_hash: parts[1].to_string(),
                        message: parts[2].to_string(),
                        author: parts[3].to_string(),
                        time: parts[4].to_string(),
                        refs,
                    }),
                });
            }
        } else {
            entries.push(GitLogEntry {
                graph_line: line.to_string(),
                commit: None,
            });
        }
    }

    Ok(entries)
}

#[tauri::command]
fn get_git_branch(path: String) -> Result<String, String> {
    let git_dir = Path::new(&path).join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    let output = run_git(&["branch", "--show-current"], Path::new(&path))?;
    Ok(output.trim().to_string())
}

#[tauri::command]
fn get_git_status(path: String) -> Result<Vec<String>, String> {
    let git_dir = Path::new(&path).join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    let output = run_git(&["status", "--short"], Path::new(&path))?;
    let lines: Vec<String> = output.lines().map(|l| l.to_string()).collect();
    Ok(lines)
}

#[tauri::command]
fn get_git_diff(path: String, file: String, status: String) -> Result<String, String> {
    let git_dir = Path::new(&path).join(".git");
    if !git_dir.exists() {
        return Err("Not a git repository".to_string());
    }

    let xy = status.trim();

    if xy == "??" {
        let file_path = Path::new(&path).join(&file);
        let content = std::fs::read_to_string(&file_path).map_err(|e| e.to_string())?;
        let line_count = content.lines().count();
        let body: String = content
            .lines()
            .map(|l| format!("+{}", l))
            .collect::<Vec<_>>()
            .join("\n");
        return Ok(format!(
            "--- /dev/null\n+++ b/{}\n@@ -0,0 +1,{} @@\n{}",
            file, line_count, body
        ));
    }

    // Working tree (unstaged) diff
    let diff = run_git(&["diff", "--no-color", "--", &file], Path::new(&path))?;
    if !diff.is_empty() {
        return Ok(diff);
    }

    // Staged diff
    run_git(
        &["diff", "--cached", "--no-color", "--", &file],
        Path::new(&path),
    )
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
            get_git_log,
            get_git_branch,
            get_git_status,
            get_git_diff,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
