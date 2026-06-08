use once_cell::sync::Lazy;
use portable_pty::{native_pty_system, CommandBuilder, PtySize, PtySystem};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::fs;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicIsize, AtomicU32, Ordering};
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

// ── Main window HWND (Windows only) ─────────────────────────────────────────
static MAIN_HWND: AtomicIsize = AtomicIsize::new(0);

// ── Win32 bindings (Windows only) ────────────────────────────────────────────
#[cfg(target_os = "windows")]
mod win32 {
    use std::cell::{Cell, RefCell};

    pub const GWL_STYLE:     i32 = -16;
    pub const GWL_EXSTYLE:   i32 = -20;
    pub const WS_CHILD:      u32 = 0x4000_0000;
    pub const WS_VISIBLE:    u32 = 0x1000_0000;
    pub const WS_CAPTION:    u32 = 0x00C0_0000;
    pub const WS_THICKFRAME: u32 = 0x0004_0000;
    pub const WS_SYSMENU:    u32 = 0x0008_0000;
    pub const WS_MAXIMIZEBOX:u32 = 0x0001_0000;
    pub const WS_MINIMIZEBOX:u32 = 0x0002_0000;
    pub const WS_EX_DLGMODALFRAME: u32 = 0x0000_0001;
    pub const WS_EX_WINDOWEDGE:    u32 = 0x0000_0100;
    pub const WS_EX_CLIENTEDGE:    u32 = 0x0000_0200;
    pub const WS_EX_STATICEDGE:    u32 = 0x0002_0000;
    pub const SWP_SHOWWINDOW:   u32 = 0x0040;
    pub const SWP_FRAMECHANGED: u32 = 0x0020;
    pub const HWND_TOP: isize = 0;
    pub const SW_RESTORE: i32 = 9;
    pub const SW_HIDE:    i32 = 0;

    #[repr(C)]
    pub struct WinRect { pub left: i32, pub top: i32, pub right: i32, pub bottom: i32 }

    #[link(name = "user32")]
    extern "system" {
        pub fn SetParent(hWndChild: isize, hWndNewParent: isize) -> isize;
        pub fn GetWindowLongPtrW(hWnd: isize, nIndex: i32) -> isize;
        pub fn SetWindowLongPtrW(hWnd: isize, nIndex: i32, dwNewLong: isize) -> isize;
        pub fn SetWindowPos(hWnd: isize, hWndInsertAfter: isize, X: i32, Y: i32, cx: i32, cy: i32, uFlags: u32) -> i32;
        pub fn GetWindowThreadProcessId(hWnd: isize, lpdwProcessId: *mut u32) -> u32;
        pub fn IsWindowVisible(hWnd: isize) -> i32;
        pub fn GetWindowRect(hWnd: isize, lpRect: *mut WinRect) -> i32;
        pub fn EnumWindows(lpEnumFunc: unsafe extern "system" fn(isize, isize) -> i32, lParam: isize) -> i32;
        pub fn ShowWindow(hWnd: isize, nCmdShow: i32) -> i32;
        pub fn IsWindow(hWnd: isize) -> i32;
        pub fn GetWindowTextW(hWnd: isize, lpString: *mut u16, nMaxCount: i32) -> i32;
    }

    thread_local! {
        static SEARCH_PID:      Cell<u32>  = const { Cell::new(0) };
        static FOUND_HWND:      Cell<isize>= const { Cell::new(0) };
        static FOUND_BEST_AREA: Cell<i64>  = const { Cell::new(0) };

        static SEARCH_AVD:     RefCell<String> = RefCell::new(String::new());
        static FOUND_EMU_HWND: Cell<isize>     = const { Cell::new(0) };
        static FOUND_EMU_AREA: Cell<i64>       = const { Cell::new(0) };
    }

    pub unsafe extern "system" fn enum_find_pid(hwnd: isize, _: isize) -> i32 {
        let target = SEARCH_PID.with(|c| c.get());
        let mut pid: u32 = 0;
        GetWindowThreadProcessId(hwnd, &mut pid);
        if pid == target && IsWindowVisible(hwnd) != 0 {
            let mut r = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
            GetWindowRect(hwnd, &mut r);
            let area = (r.right - r.left) as i64 * (r.bottom - r.top) as i64;
            if area > 10_000 {
                FOUND_BEST_AREA.with(|ba| {
                    if area > ba.get() {
                        ba.set(area);
                        FOUND_HWND.with(|fh| fh.set(hwnd));
                    }
                });
            }
        }
        1
    }

    pub unsafe extern "system" fn enum_find_emulator(hwnd: isize, _: isize) -> i32 {
        if IsWindowVisible(hwnd) == 0 { return 1; }
        let mut r = WinRect { left: 0, top: 0, right: 0, bottom: 0 };
        GetWindowRect(hwnd, &mut r);
        let area = (r.right - r.left) as i64 * (r.bottom - r.top) as i64;
        if area <= 50_000 { return 1; }
        let mut buf = [0u16; 512];
        let len = GetWindowTextW(hwnd, buf.as_mut_ptr(), 512);
        if len <= 0 { return 1; }
        let title = String::from_utf16_lossy(&buf[..len as usize]);
        SEARCH_AVD.with(|avd| {
            let avd = avd.borrow();
            if title.contains(avd.as_str()) {
                FOUND_EMU_AREA.with(|ba| {
                    if area > ba.get() {
                        ba.set(area);
                        FOUND_EMU_HWND.with(|fh| fh.set(hwnd));
                    }
                });
            }
        });
        1
    }

    pub fn find_largest_window_for_pid(pid: u32) -> Option<isize> {
        SEARCH_PID.with(|c| c.set(pid));
        FOUND_HWND.with(|c| c.set(0));
        FOUND_BEST_AREA.with(|c| c.set(0));
        unsafe { EnumWindows(enum_find_pid, 0); }
        let found = FOUND_HWND.with(|c| c.get());
        if found != 0 { Some(found) } else { None }
    }

    pub fn find_emulator_window_by_avd(avd_name: &str) -> Option<isize> {
        SEARCH_AVD.with(|t| *t.borrow_mut() = avd_name.to_string());
        FOUND_EMU_HWND.with(|c| c.set(0));
        FOUND_EMU_AREA.with(|c| c.set(0));
        unsafe { EnumWindows(enum_find_emulator, 0); }
        let found = FOUND_EMU_HWND.with(|c| c.get());
        if found != 0 { Some(found) } else { None }
    }
}
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
fn read_binary_file(path: String) -> Result<String, String> {
    let bytes = fs::read(&path).map_err(|e| format!("Failed to read file: {}", e))?;
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as usize;
        let b1 = if chunk.len() > 1 { chunk[1] as usize } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as usize } else { 0 };
        out.push(CHARS[b0 >> 2] as char);
        out.push(CHARS[((b0 & 3) << 4) | (b1 >> 4)] as char);
        out.push(if chunk.len() > 1 { CHARS[((b1 & 15) << 2) | (b2 >> 6)] as char } else { '=' });
        out.push(if chunk.len() > 2 { CHARS[b2 & 63] as char } else { '=' });
    }
    Ok(out)
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
pub struct AvdInfo {
    pub name: String,
    pub target: String,
    pub abi: String,
    pub device: String,
    pub path: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AdbDevice {
    pub serial: String,
    pub state: String,
    pub is_emulator: bool,
}

#[tauri::command]
fn detect_android_sdk() -> Result<String, String> {
    for var in &["ANDROID_HOME", "ANDROID_SDK_ROOT"] {
        if let Ok(path) = std::env::var(var) {
            if Path::new(&path).exists() {
                return Ok(path);
            }
        }
    }

    #[cfg(target_os = "windows")]
    if let Ok(local) = std::env::var("LOCALAPPDATA") {
        let sdk = Path::new(&local).join("Android").join("Sdk");
        if sdk.exists() {
            return Ok(sdk.to_string_lossy().to_string());
        }
    }

    #[cfg(not(target_os = "windows"))]
    {
        let candidates = [
            std::env::var("HOME").map(|h| format!("{}/Library/Android/sdk", h)).ok(),
            Some("/opt/android-sdk".to_string()),
            Some("/usr/local/android-sdk".to_string()),
        ];
        for candidate in candidates.iter().flatten() {
            if Path::new(candidate).exists() {
                return Ok(candidate.clone());
            }
        }
    }

    Err("Android SDK not found. Install Android Studio or set ANDROID_HOME.".to_string())
}

#[tauri::command]
fn list_avds() -> Result<Vec<AvdInfo>, String> {
    let home_key = if cfg!(windows) { "USERPROFILE" } else { "HOME" };
    let home = std::env::var(home_key).map_err(|_| "Cannot find home directory".to_string())?;
    let avd_dir = Path::new(&home).join(".android").join("avd");

    if !avd_dir.exists() {
        return Ok(vec![]);
    }

    let mut avds = Vec::new();

    for entry in fs::read_dir(&avd_dir).map_err(|e| e.to_string())? {
        let entry = entry.map_err(|e| e.to_string())?;
        let path = entry.path();

        if path.extension().and_then(|e| e.to_str()) != Some("ini") {
            continue;
        }

        let name = match path.file_stem().and_then(|s| s.to_str()) {
            Some(n) if !n.is_empty() => n.to_string(),
            _ => continue,
        };

        let ini = fs::read_to_string(&path).unwrap_or_default();
        let mut target = String::new();
        let mut avd_path = String::new();
        for line in ini.lines() {
            if let Some(v) = line.strip_prefix("target=") { target = v.to_string(); }
            if let Some(v) = line.strip_prefix("path=") { avd_path = v.to_string(); }
        }

        let mut abi = String::from("unknown");
        let mut device = String::from("generic");
        let config_path = Path::new(&avd_path).join("config.ini");
        if config_path.exists() {
            if let Ok(cfg) = fs::read_to_string(&config_path) {
                for line in cfg.lines() {
                    if let Some(v) = line.strip_prefix("abi.type=") { abi = v.to_string(); }
                    if let Some(v) = line.strip_prefix("hw.device.name=") { device = v.to_string(); }
                }
            }
        }

        avds.push(AvdInfo { name, target, abi, device, path: avd_path });
    }

    avds.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(avds)
}

#[tauri::command]
fn launch_emulator(sdk_path: String, avd_name: String) -> Result<u32, String> {
    let exe = if cfg!(windows) { "emulator.exe" } else { "emulator" };
    let emulator = Path::new(&sdk_path).join("emulator").join(exe);

    if !emulator.exists() {
        return Err(format!("Emulator not found: {}", emulator.display()));
    }

    let mut cmd = std::process::Command::new(&emulator);
    cmd.args(["-avd", &avd_name]);

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x00000008); // DETACHED_PROCESS
    }

    let child = cmd.spawn().map_err(|e| format!("Failed to launch emulator: {}", e))?;
    Ok(child.id())
}

#[tauri::command]
fn find_emulator_window(pid: u32, avd_name: String) -> Result<u64, String> {
    #[cfg(target_os = "windows")]
    {
        // Title-based search is the primary method: the emulator window title contains
        // the AVD name regardless of which child process owns the window handle.
        if let Some(hwnd) = win32::find_emulator_window_by_avd(&avd_name) {
            return Ok(hwnd as u64);
        }
        // Fallback: PID-based search for cases where the window title doesn't match.
        match win32::find_largest_window_for_pid(pid) {
            Some(hwnd) => Ok(hwnd as u64),
            None => Err("not found".to_string()),
        }
    }
    #[cfg(not(target_os = "windows"))]
    Err("Window embedding requires Windows".to_string())
}

#[tauri::command]
fn embed_emulator_window(emulator_hwnd: u64, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use win32::*;
        let child = emulator_hwnd as isize;
        let parent = MAIN_HWND.load(Ordering::SeqCst);
        if parent == 0 { return Err("Main window HWND not captured yet".to_string()); }
        unsafe {
            ShowWindow(child, SW_HIDE);

            let style = GetWindowLongPtrW(child, GWL_STYLE) as u32;
            let new_style = (style & !(WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MAXIMIZEBOX | WS_MINIMIZEBOX))
                | WS_CHILD | WS_VISIBLE;
            SetWindowLongPtrW(child, GWL_STYLE, new_style as isize);

            let ex = GetWindowLongPtrW(child, GWL_EXSTYLE) as u32;
            SetWindowLongPtrW(child, GWL_EXSTYLE,
                (ex & !(WS_EX_DLGMODALFRAME | WS_EX_WINDOWEDGE | WS_EX_CLIENTEDGE | WS_EX_STATICEDGE)) as isize);

            let prev = SetParent(child, parent);
            if prev == 0 {
                // Restore visibility before returning error so the user isn't left with a hidden emulator
                ShowWindow(child, SW_RESTORE);
                return Err("Não foi possível embutir o emulador (SetParent falhou). O emulador pode estar rodando com privilégios diferentes do editor.".to_string());
            }
            SetWindowPos(child, HWND_TOP, x, y, width, height, SWP_SHOWWINDOW | SWP_FRAMECHANGED);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Err("Window embedding requires Windows".to_string())
}

#[tauri::command]
fn move_emulator_window(emulator_hwnd: u64, x: i32, y: i32, width: i32, height: i32) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use win32::*;
        let hwnd = emulator_hwnd as isize;
        unsafe {
            if IsWindow(hwnd) != 0 {
                SetWindowPos(hwnd, HWND_TOP, x, y, width, height, SWP_SHOWWINDOW);
            }
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Ok(())
}

#[tauri::command]
fn detach_emulator_window(emulator_hwnd: u64) -> Result<(), String> {
    #[cfg(target_os = "windows")]
    {
        use win32::*;
        let hwnd = emulator_hwnd as isize;
        unsafe {
            if IsWindow(hwnd) == 0 { return Ok(()); }
            // Restore window decorations
            let style = GetWindowLongPtrW(hwnd, GWL_STYLE) as u32;
            let restored = (style & !WS_CHILD)
                | WS_CAPTION | WS_THICKFRAME | WS_SYSMENU | WS_MAXIMIZEBOX | WS_MINIMIZEBOX | WS_VISIBLE;
            SetWindowLongPtrW(hwnd, GWL_STYLE, restored as isize);
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, WS_EX_WINDOWEDGE as isize);
            SetParent(hwnd, 0);
            SetWindowPos(hwnd, HWND_TOP, 200, 200, 420, 820, SWP_SHOWWINDOW | SWP_FRAMECHANGED);
            ShowWindow(hwnd, SW_RESTORE);
        }
        Ok(())
    }
    #[cfg(not(target_os = "windows"))]
    Ok(())
}

#[tauri::command]
fn get_adb_devices(sdk_path: String) -> Result<Vec<AdbDevice>, String> {
    let exe = if cfg!(windows) { "adb.exe" } else { "adb" };
    let adb = Path::new(&sdk_path).join("platform-tools").join(exe);

    if !adb.exists() {
        return Err(format!("ADB not found: {}", adb.display()));
    }

    let mut cmd = std::process::Command::new(&adb);
    cmd.arg("devices")
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped());

    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000); // CREATE_NO_WINDOW
    }

    let output = cmd.output().map_err(|e| e.to_string())?;
    let stdout = String::from_utf8_lossy(&output.stdout).to_string();

    let mut devices = Vec::new();
    for line in stdout.lines().skip(1) {
        let line = line.trim();
        if line.is_empty() || line.starts_with("*") { continue; }
        let parts: Vec<&str> = line.splitn(2, '\t').collect();
        if parts.len() == 2 {
            let serial = parts[0].trim().to_string();
            let state = parts[1].trim().to_string();
            let is_emulator = serial.starts_with("emulator-");
            devices.push(AdbDevice { serial, state, is_emulator });
        }
    }

    Ok(devices)
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
            read_binary_file,
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
            detect_android_sdk,
            list_avds,
            launch_emulator,
            get_adb_devices,
            find_emulator_window,
            embed_emulator_window,
            move_emulator_window,
            detach_emulator_window,
        ])
        .setup(|app| {
            #[cfg(target_os = "windows")]
            {
                use raw_window_handle::{HasWindowHandle, RawWindowHandle};
                use tauri::Manager;
                let windows = app.webview_windows();
                if let Some(window) = windows.values().next() {
                    let handle: Result<raw_window_handle::WindowHandle<'_>, _> = window.window_handle();
                    if let Ok(h) = handle {
                        if let RawWindowHandle::Win32(w32) = h.as_raw() {
                            MAIN_HWND.store(w32.hwnd.get() as isize, Ordering::SeqCst);
                        }
                    }
                }
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
