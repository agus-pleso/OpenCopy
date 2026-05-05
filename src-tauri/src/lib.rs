mod secrets;

use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;

#[derive(Default)]
struct ServerState {
    child: Mutex<Option<CommandChild>>,
    url: Mutex<Option<String>>,
}

const FALLBACK_URL: &str = "http://localhost:3000";

fn find_free_port() -> u16 {
    TcpListener::bind("127.0.0.1:0")
        .ok()
        .and_then(|l| l.local_addr().ok())
        .map(|a| a.port())
        .unwrap_or(0)
}

fn current_url(app: &AppHandle) -> String {
    app.state::<ServerState>()
        .url
        .lock()
        .ok()
        .and_then(|g| g.clone())
        .unwrap_or_else(|| FALLBACK_URL.to_string())
}

/// Bring the main window forward. The webview has already been navigated
/// to the live URL once the server became ready, so this is purely focus.
fn focus_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    } else {
        log::warn!("main window not available");
    }
}

/// Navigate the main window's webview to the running Next.js server.
/// Called once `wait_for_server` resolves. The window starts on the splash
/// HTML bundled into the Tauri binary, so the user sees a smooth handoff.
fn navigate_to_app(app: &AppHandle, url_str: &str) {
    let Some(window) = app.get_webview_window("main") else {
        log::warn!("main window not available for navigation");
        return;
    };
    match tauri::Url::parse(url_str) {
        Ok(url) => {
            if let Err(e) = window.navigate(url) {
                log::error!("failed to navigate main window to {url_str}: {e}");
                return;
            }
            let _ = window.show();
            let _ = window.set_focus();
        }
        Err(e) => log::error!("invalid url {url_str}: {e}"),
    }
}

/// Fallback exposed via the tray menu in case the in-window webview
/// can't load (corporate proxies, weird WebView2 state, etc.).
fn open_in_browser(app: &AppHandle) {
    let url = current_url(app);
    if let Err(e) = app.opener().open_url(&url, None::<&str>) {
        log::error!("failed to open {url} in browser: {e}");
    }
}

async fn wait_for_server(addr: String) {
    use std::net::ToSocketAddrs;
    let connect_timeout = Duration::from_millis(150);
    let deadline = Instant::now() + Duration::from_secs(60);

    while Instant::now() < deadline {
        if let Ok(mut iter) = addr.to_socket_addrs() {
            if let Some(sock) = iter.next() {
                if std::net::TcpStream::connect_timeout(&sock, connect_timeout).is_ok() {
                    return;
                }
            }
        }
        tokio::time::sleep(Duration::from_millis(200)).await;
    }
    log::warn!("server did not become ready within deadline");
}

fn spawn_server(app: &AppHandle) {
    let resource_dir = match app.path().resource_dir() {
        Ok(d) => d,
        Err(e) => {
            log::error!("resource_dir lookup failed: {e}");
            return;
        }
    };
    let server_dir = resource_dir.join("server");
    let server_js = server_dir.join("server.js");

    if !server_js.exists() {
        log::info!(
            "no bundled server at {:?}; expecting external dev server on {FALLBACK_URL}",
            server_js
        );
        if let Ok(mut g) = app.state::<ServerState>().url.lock() {
            *g = Some(FALLBACK_URL.to_string());
        }
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            wait_for_server("127.0.0.1:3000".to_string()).await;
            navigate_to_app(&app_handle, FALLBACK_URL);
        });
        return;
    }

    let port = find_free_port();
    if port == 0 {
        log::error!("could not allocate a free local port");
        return;
    }
    let url = format!("http://127.0.0.1:{port}");

    // Per-install data dir (Postgres data, secrets, logs).
    let data_root = match app.path().app_data_dir() {
        Ok(d) => d,
        Err(e) => {
            log::error!("app_data_dir lookup failed: {e}");
            return;
        }
    };
    let pg_data = data_root.join("pgdata");
    if let Err(e) = std::fs::create_dir_all(&pg_data) {
        log::error!("failed to create {pg_data:?}: {e}");
        return;
    }

    let sidecar = match app.shell().sidecar("node") {
        Ok(c) => c,
        Err(e) => {
            log::error!("sidecar lookup failed: {e}");
            return;
        }
    };

    let secret_env = secrets::load_or_generate(&data_root);

    // Apply pending migrations against the embedded PGlite store before
    // starting the long-lived server. Spawned via std::process::Command so
    // we can wait for it synchronously inside setup().
    let migrate_js = server_dir.join("migrate.mjs");
    if migrate_js.exists() {
        let exe_dir = std::env::current_exe()
            .ok()
            .and_then(|p| p.parent().map(|d| d.to_path_buf()))
            .unwrap_or_else(|| server_dir.clone());
        let node_bin = if cfg!(windows) {
            exe_dir.join("node.exe")
        } else {
            exe_dir.join("node")
        };
        if node_bin.exists() {
            log::info!(
                "running migrations: {} {}",
                node_bin.display(),
                migrate_js.display()
            );
            match std::process::Command::new(&node_bin)
                .arg(&migrate_js)
                .current_dir(&server_dir)
                .env("OPENCOPY_DATA_DIR", pg_data.to_string_lossy().to_string())
                .output()
            {
                Ok(out) => {
                    for line in String::from_utf8_lossy(&out.stdout).lines() {
                        let t = line.trim();
                        if !t.is_empty() {
                            log::info!("migrate: {t}");
                        }
                    }
                    for line in String::from_utf8_lossy(&out.stderr).lines() {
                        let t = line.trim();
                        if !t.is_empty() {
                            log::warn!("migrate: {t}");
                        }
                    }
                    if !out.status.success() {
                        log::error!(
                            "migrations failed (exit {:?}); aborting server boot",
                            out.status.code()
                        );
                        return;
                    }
                }
                Err(e) => {
                    log::error!("failed to spawn migration runner: {e}");
                    return;
                }
            }
        } else {
            log::warn!(
                "node binary not found at {}; skipping migrations",
                node_bin.display()
            );
        }
    }

    let mut cmd = sidecar
        .args([server_js.to_string_lossy().to_string()])
        .current_dir(server_dir)
        .env("PORT", port.to_string())
        .env("HOSTNAME", "127.0.0.1")
        .env("NODE_ENV", "production")
        .env("OPENCOPY_EMBEDDED_DB", "1")
        .env("OPENCOPY_DATA_DIR", pg_data.to_string_lossy().to_string())
        .env("AUTH_TRUST_HOST", "true")
        .env("DEV_AUTH_ENABLED", "true")
        .env("NEXT_PUBLIC_APP_URL", &url);

    for (k, v) in &secret_env {
        cmd = cmd.env(k, v);
    }

    let (mut rx, child) = match cmd.spawn() {
        Ok(p) => p,
        Err(e) => {
            log::error!("failed to spawn next server: {e}");
            return;
        }
    };

    if let Ok(mut g) = app.state::<ServerState>().child.lock() {
        *g = Some(child);
    }
    if let Ok(mut g) = app.state::<ServerState>().url.lock() {
        *g = Some(url.clone());
    }

    let app_handle = app.clone();
    let probe = format!("127.0.0.1:{port}");
    let nav_url = url.clone();
    tauri::async_runtime::spawn(async move {
        wait_for_server(probe).await;
        navigate_to_app(&app_handle, &nav_url);
    });

    tauri::async_runtime::spawn(async move {
        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(b) => {
                    log::info!("server: {}", String::from_utf8_lossy(&b).trim_end())
                }
                CommandEvent::Stderr(b) => {
                    log::warn!("server: {}", String::from_utf8_lossy(&b).trim_end())
                }
                CommandEvent::Error(err) => log::error!("server error: {err}"),
                CommandEvent::Terminated(payload) => {
                    log::warn!("server exited: {:?}", payload.code)
                }
                _ => {}
            }
        }
    });
}

fn shutdown(app: &AppHandle) {
    if let Ok(mut guard) = app.state::<ServerState>().child.lock() {
        if let Some(child) = guard.take() {
            let _ = child.kill();
        }
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(if cfg!(debug_assertions) {
                    log::LevelFilter::Info
                } else {
                    log::LevelFilter::Warn
                })
                .build(),
        )
        .manage(ServerState::default())
        .setup(|app| {
            let open_item = MenuItem::with_id(app, "open", "Open OpenCopy", true, None::<&str>)?;
            let browser_item =
                MenuItem::with_id(app, "browser", "Open in browser", true, None::<&str>)?;
            let restart_item = MenuItem::with_id(app, "restart", "Restart", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &browser_item,
                    &separator,
                    &restart_item,
                    &quit_item,
                ],
            )?;

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .icon_as_template(true)
                .tooltip("OpenCopy")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "open" => focus_main_window(app),
                    "browser" => open_in_browser(app),
                    "restart" => app.restart(),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click {
                        button: MouseButton::Left,
                        button_state: MouseButtonState::Up,
                        ..
                    } = event
                    {
                        focus_main_window(tray.app_handle());
                    }
                })
                .build(app)?;

            spawn_server(app.handle());

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .build(tauri::generate_context!())
        .expect("error while building tauri application")
        .run(|app_handle, event| {
            if matches!(event, tauri::RunEvent::ExitRequested { .. }) {
                shutdown(app_handle);
            }
        });
}
