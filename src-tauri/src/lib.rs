mod menu;
mod sidecar;

use std::path::{Path, PathBuf};
use std::sync::Mutex;

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
