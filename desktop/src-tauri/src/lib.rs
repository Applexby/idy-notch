//! IDY Notch · núcleo nativo.
//! - Ventana "notch" transparente siempre arriba, que deja pasar los clics salvo sobre el notch.
//! - Hilos que vigilan música (SMTC), batería, auriculares, pantalla completa e inactividad.
//! - Bandeja del sistema y ventana de ajustes.

mod media;
mod system;

use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder,
};

/// Rectángulo interactivo del notch, en píxeles físicos de pantalla.
#[derive(Default, Clone, Copy, Debug, serde::Deserialize)]
pub struct HitRect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
    /// Mantener interactivo aunque el cursor salga (p. ej. escribiendo una nota)
    pub hold: bool,
}

#[derive(Default)]
pub struct Shared {
    pub hit: Mutex<HitRect>,
}

#[tauri::command]
fn set_hit_rect(state: tauri::State<Arc<Shared>>, rect: HitRect) {
    *state.hit.lock().unwrap() = rect;
}

#[tauri::command]
fn media_command(action: String, position_ms: Option<u64>) -> Result<(), String> {
    media::control(&action, position_ms).map_err(|e| e.to_string())
}

#[tauri::command]
fn open_settings(app: AppHandle, page: Option<String>) {
    show_settings(&app, page);
}

#[tauri::command]
fn quit_app(app: AppHandle) {
    app.exit(0);
}

fn show_settings(app: &AppHandle, page: Option<String>) {
    if let Some(w) = app.get_webview_window("settings") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        if let Some(p) = page {
            let _ = w.emit("settings-page", p);
        }
        return;
    }
    let url = match page {
        Some(p) => format!("settings.html#{p}"),
        None => "settings.html".into(),
    };
    let _ = WebviewWindowBuilder::new(app, "settings", WebviewUrl::App(url.into()))
        .title("IDY · Ajustes")
        .inner_size(780.0, 560.0)
        .min_inner_size(680.0, 480.0)
        .decorations(false)
        .shadow(true)
        .resizable(true)
        .center()
        .build();
}

fn toggle_notch(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("notch") {
        let _ = w.emit("toggle-hidden", ());
    }
}

pub fn run() {
    let shared = Arc::new(Shared::default());

    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _args, _cwd| {
            show_settings(app, None);
        }))
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            Some(vec!["--autostart"]),
        ))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_drag::init())
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![
            set_hit_rect,
            media_command,
            open_settings,
            quit_app
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // ── Bandeja ──
            let settings = MenuItem::with_id(app, "settings", "Ajustes…", true, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "toggle", "Ocultar / mostrar notch", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings, &toggle, &sep, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("IDY Notch")
                .menu(&menu)
                .menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "settings" => show_settings(app, None),
                    "toggle" => toggle_notch(app),
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show_settings(tray.app_handle(), None);
                    }
                })
                .build(app)?;

            // ── Hilos nativos ──
            system::spawn_hover_watch(handle.clone(), shared.clone());
            system::spawn_system_watch(handle.clone());
            media::spawn_watch(handle.clone());

            let _ = handle.emit("native-ready", ());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar IDY Notch");
}
