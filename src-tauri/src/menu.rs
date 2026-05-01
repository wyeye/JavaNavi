use std::path::Path;
use std::process::Command;

use tauri::menu::{MenuBuilder, SubmenuBuilder};
use tauri::{App, AppHandle, Manager};

use crate::DesktopState;

pub fn install(app: &mut App) -> tauri::Result<()> {
    let app_menu = SubmenuBuilder::new(app, "JavaNavi")
        .text("about", "About JavaNavi")
        .separator()
        .text("quit", "Quit JavaNavi")
        .build()?;
    let view_menu = SubmenuBuilder::new(app, "View")
        .text("reload", "Reload")
        .build()?;
    let tools_menu = SubmenuBuilder::new(app, "Tools")
        .text("open_logs", "Open Logs")
        .text("open_data_dir", "Open Data Directory")
        .build()?;
    let menu = MenuBuilder::new(app)
        .item(&app_menu)
        .item(&view_menu)
        .item(&tools_menu)
        .build()?;
    app.set_menu(menu)?;
    Ok(())
}

pub fn handle(app: &AppHandle, menu_id: &str) {
    match menu_id {
        "about" => show_about(app),
        "reload" => reload_main_window(app),
        "open_logs" => open_logs(app),
        "open_data_dir" => open_data_dir(app),
        "quit" => quit(app),
        _ => {}
    }
}

fn show_about(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.set_title(
            "JavaNavi — Tauri shell + Java/Spring Boot sidecar on a dynamic loopback port",
        );
    }
}

fn reload_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.reload();
    }
}

fn open_logs(app: &AppHandle) {
    let state = app.state::<DesktopState>();
    if let Some(path) = state.log_path() {
        open_path(path.parent().unwrap_or(&path));
    }
}

fn open_data_dir(app: &AppHandle) {
    let state = app.state::<DesktopState>();
    if let Some(path) = state.data_dir() {
        open_path(&path);
    }
}

fn quit(app: &AppHandle) {
    let state = app.state::<DesktopState>();
    state.shutdown_sidecar();
    app.exit(0);
}

fn open_path(path: &Path) {
    #[cfg(target_os = "windows")]
    let mut command = {
        let mut cmd = Command::new("explorer");
        cmd.arg(path);
        cmd
    };

    #[cfg(target_os = "macos")]
    let mut command = {
        let mut cmd = Command::new("open");
        cmd.arg(path);
        cmd
    };

    #[cfg(all(unix, not(target_os = "macos")))]
    let mut command = {
        let mut cmd = Command::new("xdg-open");
        cmd.arg(path);
        cmd
    };

    let _ = command.spawn();
}
