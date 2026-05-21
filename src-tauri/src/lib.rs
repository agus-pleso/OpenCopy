mod secrets;

use std::net::TcpListener;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};
use tauri_plugin_dialog::{DialogExt, MessageDialogButtons, MessageDialogKind};
use tauri_plugin_opener::OpenerExt;
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tauri_plugin_updater::UpdaterExt;

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

/// Open the running OpenCopy server in the user's default browser.
/// This is the primary "open the app" action — the Tauri shell stays
/// tray-only, the actual UI lives in whichever browser the user prefers.
fn open_app(app: &AppHandle) {
    let url = current_url(app);
    if let Err(e) = app.opener().open_url(&url, None::<&str>) {
        log::error!("failed to open {url} in browser: {e}");
    }
}

/// Check the configured updater endpoint for a newer signed bundle and,
/// if one exists, prompt the user to install + restart.
///
/// Runs once on launch (`silent = true`) and from the tray menu's
/// "Check for updates…" item (`silent = false`). When silent, the
/// "already up to date" and check-failure outcomes stay quiet — only an
/// actual available update surfaces a dialog — so the launch check never
/// nags. The manual tray check reports every outcome so the user always
/// gets feedback.
async fn check_for_updates(app: AppHandle, silent: bool) {
    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            log::error!("updater plugin unavailable: {e}");
            if !silent {
                app.dialog()
                    .message(format!("Update check failed: {e}"))
                    .kind(MessageDialogKind::Error)
                    .title("OpenCopy update")
                    .blocking_show();
            }
            return;
        }
    };

    let update = match updater.check().await {
        Ok(Some(u)) => u,
        Ok(None) => {
            log::info!("update check: already on the latest version");
            if !silent {
                app.dialog()
                    .message("OpenCopy is up to date.")
                    .kind(MessageDialogKind::Info)
                    .title("No updates")
                    .blocking_show();
            }
            return;
        }
        Err(e) => {
            log::error!("update check failed: {e}");
            if !silent {
                app.dialog()
                    .message(format!(
                        "Couldn't check for updates: {e}\n\nSee the logs for details."
                    ))
                    .kind(MessageDialogKind::Error)
                    .title("OpenCopy update")
                    .blocking_show();
            }
            return;
        }
    };

    let confirm = app
        .dialog()
        .message(format!(
            "A new version is available.\n\nCurrent: {}\nNew: {}\n\nOpenCopy will download and restart automatically.",
            update.current_version, update.version,
        ))
        .kind(MessageDialogKind::Info)
        .title("Update OpenCopy")
        .buttons(MessageDialogButtons::OkCancelCustom(
            "Install".into(),
            "Later".into(),
        ))
        .blocking_show();

    if !confirm {
        return;
    }

    log::info!(
        "installing update {} → {}",
        update.current_version,
        update.version
    );

    let install_result = update
        .download_and_install(
            |chunk_length, _content_length| {
                log::debug!("update: downloaded {chunk_length} bytes");
            },
            || log::info!("update: download finished, applying"),
        )
        .await;

    if let Err(e) = install_result {
        log::error!("update install failed: {e}");
        app.dialog()
            .message(format!("Update install failed: {e}"))
            .kind(MessageDialogKind::Error)
            .title("OpenCopy update")
            .blocking_show();
        return;
    }

    log::info!("update installed; restarting");
    // Kill the bundled Node sidecar before the platform-specific restart
    // takes over. Otherwise on Windows the new install can fail to extract
    // because the old node.exe still holds a file lock — the same issue
    // the NSIS pre-install hook covers for the manual-installer path.
    shutdown(&app);
    app.restart();
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

    // Debug builds always take the dev path so a stale prepared-server
    // bundle in the resource dir (left over from a previous `pnpm tauri
    // build`) doesn't get spawned and run migrate.mjs against the wrong
    // store. Release builds use the bundled server.
    let use_dev_path = cfg!(debug_assertions) || !server_js.exists();
    if use_dev_path {
        if !server_js.exists() {
            log::info!(
                "no bundled server at {:?}; expecting external dev server on {FALLBACK_URL}",
                server_js
            );
        } else {
            log::info!(
                "debug build — ignoring bundled server at {:?}, using dev URL {FALLBACK_URL}",
                server_js
            );
        }
        if let Ok(mut g) = app.state::<ServerState>().url.lock() {
            *g = Some(FALLBACK_URL.to_string());
        }
        let app_handle = app.clone();
        tauri::async_runtime::spawn(async move {
            wait_for_server("127.0.0.1:3000".to_string()).await;
            open_app(&app_handle);
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
    tauri::async_runtime::spawn(async move {
        wait_for_server(probe).await;
        open_app(&app_handle);
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
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            let check_update_item = MenuItem::with_id(
                app,
                "check_update",
                "Check for updates…",
                true,
                None::<&str>,
            )?;
            let restart_item = MenuItem::with_id(app, "restart", "Restart", true, None::<&str>)?;
            let separator = PredefinedMenuItem::separator(app)?;
            let separator_2 = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;

            let menu = Menu::with_items(
                app,
                &[
                    &open_item,
                    &separator,
                    &check_update_item,
                    &restart_item,
                    &separator_2,
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
                    "open" => open_app(app),
                    "check_update" => {
                        let app = app.clone();
                        tauri::async_runtime::spawn(async move {
                            check_for_updates(app, false).await;
                        });
                    }
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
                        open_app(tray.app_handle());
                    }
                })
                .build(app)?;

            // macOS: keep OpenCopy out of the Dock — it's a tray-resident
            // utility that opens the actual UI in the user's default browser.
            #[cfg(target_os = "macos")]
            {
                use tauri::ActivationPolicy;
                app.set_activation_policy(ActivationPolicy::Accessory);
            }

            spawn_server(app.handle());

            // Auto-check for updates a few seconds after launch. The tray's
            // "Check for updates…" item is easy to miss when the app itself
            // opens in the browser, so without this the install prompt never
            // reaches the user. Silent unless an update is actually found.
            {
                let update_handle = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    tokio::time::sleep(Duration::from_secs(5)).await;
                    check_for_updates(update_handle, true).await;
                });
            }

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
