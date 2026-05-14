mod menu;
mod sidecar;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{Manager, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use url::Url;

use sidecar::JavaSidecar;

#[derive(Default)]
pub struct DesktopState {
    runtime: Mutex<Option<DesktopRuntime>>,
}

struct DesktopRuntime {
    sidecar: JavaSidecar,
}

#[derive(Debug, Deserialize)]
struct DesktopFileSelectRequest {
    kind: Option<String>,
    #[serde(rename = "currentPath")]
    current_path: Option<String>,
}

#[derive(Debug, Serialize)]
struct DesktopFileSelectResult {
    selected: bool,
    path: String,
    name: String,
    kind: String,
}

#[tauri::command]
async fn select_local_file(
    request: DesktopFileSelectRequest,
) -> Result<DesktopFileSelectResult, String> {
    let kind = request.kind.as_deref().unwrap_or("file").trim();
    if let Some(path) =
        select_local_file_with_platform_dialog(kind, request.current_path.as_deref())?
    {
        let name = path
            .file_name()
            .and_then(|value| value.to_str())
            .unwrap_or_default()
            .to_string();
        Ok(DesktopFileSelectResult {
            selected: true,
            path: path.to_string_lossy().to_string(),
            name,
            kind: kind.to_string(),
        })
    } else {
        Ok(DesktopFileSelectResult {
            selected: false,
            path: String::new(),
            name: String::new(),
            kind: kind.to_string(),
        })
    }
}

#[cfg(target_os = "windows")]
fn select_local_file_with_platform_dialog(
    kind: &str,
    current_path: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    use windows_sys::core::{GUID, HRESULT, IUnknown_Vtbl, PCWSTR, PWSTR};
    use windows_sys::Win32::Foundation::{ERROR_CANCELLED, HWND};
    use windows_sys::Win32::System::Com::{
        CoCreateInstance, CoInitializeEx, CoTaskMemFree, CoUninitialize, CLSCTX_INPROC_SERVER,
        COINIT_APARTMENTTHREADED,
    };
    use windows_sys::Win32::UI::Shell::Common::COMDLG_FILTERSPEC;
    use windows_sys::Win32::UI::Shell::{
        FileOpenDialog, SHCreateItemFromParsingName, SIGDN, SIGDN_FILESYSPATH,
    };

    const IID_IFILE_OPEN_DIALOG: GUID =
        GUID::from_u128(0xd57c7288_d4ad_4768_be02_9d969532d960);
    const IID_ISHELL_ITEM: GUID = GUID::from_u128(0x43826d1e_e718_42ee_bc55_a1e261c37bfe);

    #[repr(C)]
    struct IModalWindowVtbl {
        base: IUnknown_Vtbl,
        show: unsafe extern "system" fn(*mut core::ffi::c_void, HWND) -> HRESULT,
    }

    #[repr(C)]
    struct IFileDialogVtbl {
        base: IModalWindowVtbl,
        set_file_types: unsafe extern "system" fn(
            *mut core::ffi::c_void,
            u32,
            *const COMDLG_FILTERSPEC,
        ) -> HRESULT,
        set_file_type_index: usize,
        get_file_type_index: usize,
        advise: usize,
        unadvise: usize,
        set_options: usize,
        get_options: usize,
        set_default_folder: usize,
        set_folder:
            unsafe extern "system" fn(*mut core::ffi::c_void, *mut core::ffi::c_void) -> HRESULT,
        get_folder: usize,
        get_current_selection: usize,
        set_file_name: usize,
        get_file_name: usize,
        set_title: unsafe extern "system" fn(*mut core::ffi::c_void, PCWSTR) -> HRESULT,
        set_ok_button_label: usize,
        set_file_name_label: usize,
        get_result: unsafe extern "system" fn(
            *mut core::ffi::c_void,
            *mut *mut core::ffi::c_void,
        ) -> HRESULT,
        add_place: usize,
        set_default_extension: unsafe extern "system" fn(*mut core::ffi::c_void, PCWSTR) -> HRESULT,
        close: usize,
        set_client_guid: usize,
        clear_client_data: usize,
        set_filter: usize,
    }

    #[repr(C)]
    struct IShellItemVtbl {
        base: IUnknown_Vtbl,
        bind_to_handler: unsafe extern "system" fn(
            *mut core::ffi::c_void,
            *mut core::ffi::c_void,
            *const GUID,
            *const GUID,
            *mut *mut core::ffi::c_void,
        ) -> HRESULT,
        get_parent: usize,
        get_display_name: unsafe extern "system" fn(
            *mut core::ffi::c_void,
            SIGDN,
            *mut PWSTR,
        ) -> HRESULT,
        get_attributes: usize,
        compare: usize,
    }

    struct ComGuard;
    impl Drop for ComGuard {
        fn drop(&mut self) {
            unsafe { CoUninitialize() };
        }
    }

    unsafe {
        let hr = CoInitializeEx(std::ptr::null(), COINIT_APARTMENTTHREADED as u32);
        if failed(hr) {
            return Err(format_hresult("Unable to initialize Windows file dialog", hr));
        }
        let _guard = ComGuard;
        let mut dialog: *mut core::ffi::c_void = std::ptr::null_mut();
        let hr = CoCreateInstance(
            &FileOpenDialog,
            std::ptr::null_mut(),
            CLSCTX_INPROC_SERVER,
            &IID_IFILE_OPEN_DIALOG,
            &mut dialog,
        );
        if failed(hr) || dialog.is_null() {
            return Err(format_hresult("Unable to create Windows file dialog", hr));
        }
        let dialog_vtbl = *(dialog as *mut *mut IFileDialogVtbl);
        let title = wide_null(match kind {
            "ssh-key" => "Select SSH private key",
            "sql" => "Open SQL file",
            _ => "Select file",
        });
        let hr = ((*dialog_vtbl).set_title)(dialog, title.as_ptr());
        if failed(hr) {
            release_unknown(dialog);
            return Err(format_hresult("Unable to configure Windows file dialog", hr));
        }

        if kind == "sql" {
            let sql_name = wide_null("SQL files");
            let sql_spec = wide_null("*.sql");
            let all_name = wide_null("All files");
            let all_spec = wide_null("*.*");
            let filters = [
                COMDLG_FILTERSPEC {
                    pszName: sql_name.as_ptr(),
                    pszSpec: sql_spec.as_ptr(),
                },
                COMDLG_FILTERSPEC {
                    pszName: all_name.as_ptr(),
                    pszSpec: all_spec.as_ptr(),
                },
            ];
            let hr = ((*dialog_vtbl).set_file_types)(dialog, filters.len() as u32, filters.as_ptr());
            if failed(hr) {
                release_unknown(dialog);
                return Err(format_hresult("Unable to configure Windows file filters", hr));
            }
            let extension = wide_null("sql");
            let hr = ((*dialog_vtbl).set_default_extension)(dialog, extension.as_ptr());
            if failed(hr) {
                release_unknown(dialog);
                return Err(format_hresult("Unable to configure Windows file filters", hr));
            }
        }

        if let Some(folder) = current_folder(current_path) {
            let folder_wide = wide_null(&folder.to_string_lossy());
            let mut shell_item: *mut core::ffi::c_void = std::ptr::null_mut();
            let hr = SHCreateItemFromParsingName(
                folder_wide.as_ptr(),
                std::ptr::null_mut(),
                &IID_ISHELL_ITEM,
                &mut shell_item,
            );
            if !failed(hr) && !shell_item.is_null() {
                let _ = ((*dialog_vtbl).set_folder)(dialog, shell_item);
                release_unknown(shell_item);
            }
        }

        let hr = ((*dialog_vtbl).base.show)(dialog, std::ptr::null_mut());
        if hr == hresult_from_win32(ERROR_CANCELLED) {
            release_unknown(dialog);
            return Ok(None);
        }
        if failed(hr) {
            release_unknown(dialog);
            return Err(format_hresult("Windows file dialog failed", hr));
        }
        let mut item: *mut core::ffi::c_void = std::ptr::null_mut();
        let hr = ((*dialog_vtbl).get_result)(dialog, &mut item);
        if failed(hr) || item.is_null() {
            release_unknown(dialog);
            return Err(format_hresult("Unable to read selected file", hr));
        }
        let item_vtbl = *(item as *mut *mut IShellItemVtbl);
        let mut raw_path: PWSTR = std::ptr::null_mut();
        let hr = ((*item_vtbl).get_display_name)(item, SIGDN_FILESYSPATH, &mut raw_path);
        if failed(hr) || raw_path.is_null() {
            release_unknown(item);
            release_unknown(dialog);
            return Err(format_hresult("Unable to read selected file path", hr));
        }
        let mut len = 0usize;
        while *raw_path.add(len) != 0 {
            len += 1;
        }
        let value = String::from_utf16_lossy(std::slice::from_raw_parts(raw_path, len));
        CoTaskMemFree(raw_path as *const core::ffi::c_void);
        release_unknown(item);
        release_unknown(dialog);
        Ok(Some(PathBuf::from(value)))
    }
}

#[cfg(target_os = "windows")]
fn failed(hr: windows_sys::core::HRESULT) -> bool {
    hr < 0
}

#[cfg(target_os = "windows")]
fn hresult_from_win32(
    error: windows_sys::Win32::Foundation::WIN32_ERROR,
) -> windows_sys::core::HRESULT {
    if error <= 0 {
        error as i32
    } else {
        ((error & 0x0000_ffff) | 0x8007_0000) as i32
    }
}

#[cfg(target_os = "windows")]
fn format_hresult(context: &str, hr: windows_sys::core::HRESULT) -> String {
    format!("{context}: 0x{:08x}", hr as u32)
}

#[cfg(target_os = "windows")]
unsafe fn release_unknown(value: *mut core::ffi::c_void) {
    if !value.is_null() {
        let vtbl = *(value as *mut *mut windows_sys::core::IUnknown_Vtbl);
        ((*vtbl).Release)(value);
    }
}

#[cfg(target_os = "windows")]
fn wide_null(value: &str) -> Vec<u16> {
    value.encode_utf16().chain(std::iter::once(0)).collect()
}

#[cfg(target_os = "macos")]
fn select_local_file_with_platform_dialog(
    kind: &str,
    current_path: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let mut script = String::from("set selectedFile to choose file");
    if kind == "sql" {
        script.push_str(" of type {\"sql\"}");
    }
    if let Some(folder) = current_folder(current_path) {
        script.push_str(" default location POSIX file ");
        script.push_str(&applescript_string(&folder.to_string_lossy()));
    }
    script.push_str("\nreturn POSIX path of selectedFile");
    let output = std::process::Command::new("osascript")
        .arg("-e")
        .arg(script)
        .output()
        .map_err(|error| format!("Unable to open macOS file dialog: {error}"))?;
    if output.status.success() {
        let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
        if path.is_empty() {
            return Ok(None);
        }
        return Ok(Some(PathBuf::from(path)));
    }
    let stderr = String::from_utf8_lossy(&output.stderr).to_string();
    if stderr.contains("User canceled") || stderr.contains("-128") {
        Ok(None)
    } else {
        Err(format!("macOS file dialog failed: {}", stderr.trim()))
    }
}

#[cfg(all(unix, not(target_os = "macos")))]
fn select_local_file_with_platform_dialog(
    kind: &str,
    current_path: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    let title = match kind {
        "ssh-key" => "Select SSH private key",
        "sql" => "Open SQL file",
        _ => "Select file",
    };
    let mut commands = Vec::new();
    let mut zenity = std::process::Command::new("zenity");
    zenity.arg("--file-selection").arg("--title").arg(title);
    if let Some(folder) = current_folder(current_path) {
        zenity.arg("--filename").arg(folder.to_string_lossy().to_string() + "/");
    }
    if kind == "sql" {
        zenity
            .arg("--file-filter=SQL files | *.sql")
            .arg("--file-filter=All files | *");
    }
    commands.push(zenity);

    let mut kdialog = std::process::Command::new("kdialog");
    kdialog.arg("--title").arg(title).arg("--getopenfilename");
    if let Some(folder) = current_folder(current_path) {
        kdialog.arg(folder);
    }
    if kind == "sql" {
        kdialog.arg("*.sql|SQL files");
    }
    commands.push(kdialog);

    let mut last_error = String::new();
    for mut command in commands {
        match command.output() {
            Ok(output) if output.status.success() => {
                let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if path.is_empty() {
                    return Ok(None);
                }
                return Ok(Some(PathBuf::from(path)));
            }
            Ok(output) => {
                if matches!(output.status.code(), Some(1)) {
                    return Ok(None);
                }
                last_error = String::from_utf8_lossy(&output.stderr).trim().to_string();
            }
            Err(error) => {
                last_error = error.to_string();
            }
        }
    }
    Err(if last_error.is_empty() {
        "No native Linux file dialog command is available.".to_string()
    } else {
        format!("Linux file dialog failed: {last_error}")
    })
}

#[cfg(target_os = "macos")]
fn applescript_string(value: &str) -> String {
    let escaped = value.replace('\\', "\\\\").replace('\"', "\\\"");
    format!("\"{escaped}\"")
}

#[cfg(not(any(target_os = "windows", target_os = "macos", unix)))]
fn select_local_file_with_platform_dialog(
    _kind: &str,
    _current_path: Option<&str>,
) -> Result<Option<PathBuf>, String> {
    Err("Native file selector is not available in this desktop build.".to_string())
}

#[cfg(any(
    target_os = "windows",
    target_os = "macos",
    all(unix, not(target_os = "macos"))
))]
fn current_folder(current_path: Option<&str>) -> Option<PathBuf> {
    let raw = current_path?.trim();
    if raw.is_empty() {
        return None;
    }
    let candidate = PathBuf::from(raw);
    if candidate.is_dir() {
        Some(candidate)
    } else {
        candidate.parent().map(Path::to_path_buf)
    }
}

impl DesktopState {
    fn set_sidecar(&self, sidecar: JavaSidecar) {
        let mut runtime = self.runtime.lock().expect("desktop runtime lock poisoned");
        *runtime = Some(DesktopRuntime { sidecar });
    }

    pub fn shutdown_sidecar(&self) {
        let mut runtime = self.runtime.lock().expect("desktop runtime lock poisoned");
        if let Some(mut runtime) = runtime.take() {
            runtime.sidecar.shutdown();
        }
    }

    pub fn log_path(&self) -> Option<PathBuf> {
        self.runtime
            .lock()
            .expect("desktop runtime lock poisoned")
            .as_ref()
            .map(|runtime| runtime.sidecar.log_path.clone())
    }

    pub fn data_dir(&self) -> Option<PathBuf> {
        self.runtime
            .lock()
            .expect("desktop runtime lock poisoned")
            .as_ref()
            .map(|runtime| runtime.sidecar.data_dir.clone())
    }
}

pub fn run() {
    tauri::Builder::default()
        .manage(DesktopState::default())
        .invoke_handler(tauri::generate_handler![select_local_file])
        .setup(|app| {
            menu::install(app)?;
            let handle = app.handle().clone();
            match sidecar::start(&handle) {
                Ok(sidecar) => {
                    let port = sidecar.port;
                    let pid = sidecar.pid();
                    let log_path = sidecar.log_path.clone();
                    let data_dir = sidecar.data_dir.clone();
                    let jar_path = sidecar.jar_path.clone();
                    let java_path = sidecar.java_path.clone();
                    app.state::<DesktopState>().set_sidecar(sidecar);
                    create_main_window(&handle, port)?;
                    println!(
                        "JAVANAVI_DESKTOP_READY port={port} pid={pid} java={} jar={} data_dir={} log={}",
                        java_path.display(),
                        jar_path.display(),
                        data_dir.display(),
                        log_path.display()
                    );
                }
                Err(err) => {
                    create_error_window(&handle, &err.to_string(), err.log_path())?;
                    eprintln!("JAVANAVI_DESKTOP_STARTUP_FAILED: {err}");
                }
            }
            Ok(())
        })
        .on_menu_event(|app, event| menu::handle(app, event.id().as_ref()))
        .on_window_event(|window, event| {
            if matches!(event, WindowEvent::CloseRequested { .. }) {
                let handle = window.app_handle();
                handle.state::<DesktopState>().shutdown_sidecar();
                handle.exit(0);
            }
        })
        .run(tauri::generate_context!())
        .expect("error while running JavaNavi desktop app");
}

fn create_main_window(app: &tauri::AppHandle, port: u16) -> tauri::Result<()> {
    let url = Url::parse(&format!("http://127.0.0.1:{port}/"))
        .expect("generated JavaNavi loopback URL should be valid");
    WebviewWindowBuilder::new(app, "main", WebviewUrl::External(url))
        .title("JavaNavi")
        .inner_size(1280.0, 820.0)
        .min_inner_size(960.0, 640.0)
        .user_agent("JavaNaviDesktop/0.1.6")
        .visible(true)
        .build()?;
    Ok(())
}

fn create_error_window(
    app: &tauri::AppHandle,
    message: &str,
    log_path: Option<&Path>,
) -> tauri::Result<()> {
    let encoded_message = percent_encode(message);
    let encoded_log = percent_encode(
        &log_path
            .map(|path| path.display().to_string())
            .unwrap_or_else(|| "No log file was created".to_string()),
    );
    let app_url = format!("error.html?message={encoded_message}&log={encoded_log}");
    WebviewWindowBuilder::new(app, "startup-error", WebviewUrl::App(app_url.into()))
        .title("JavaNavi Startup Error")
        .inner_size(900.0, 620.0)
        .visible(true)
        .build()?;
    Ok(())
}

fn percent_encode(value: &str) -> String {
    url::form_urlencoded::byte_serialize(value.as_bytes()).collect::<String>()
}
