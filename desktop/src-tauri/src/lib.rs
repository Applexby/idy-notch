//! IDY Notch · núcleo nativo.
//! - Ventana "notch" transparente siempre arriba, que deja pasar los clics salvo sobre el notch.
//! - Hilos que vigilan música (SMTC), batería, auriculares, pantalla completa e inactividad.
//! - Bandeja del sistema y ventana de ajustes.

mod media;
mod system;
#[cfg(windows)]
mod droptarget;

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
    /// Último estado de la ventana activa (para el diagnóstico de Ajustes)
    pub fg: Mutex<(u8, String)>,
}

#[tauri::command]
fn get_foreground(state: tauri::State<Arc<Shared>>) -> system::Fg {
    let (s, c) = state.fg.lock().unwrap().clone();
    system::Fg { state: s, class: c }
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
async fn get_volume() -> Result<media::Volume, String> {
    media::get_volume()
}

#[tauri::command]
async fn set_volume(level: f32) -> Result<(), String> {
    media::set_volume(level)
}

/// Debe ser `async`: en Windows, crear una ventana desde un comando síncrono
/// bloquea el hilo principal y la ventana queda en blanco / "No responde".
#[tauri::command]
async fn open_settings(app: AppHandle, page: Option<String>) {
    show_settings(&app, page);
}

/// Guarda un texto del Estante como .txt (en la caché de la app) y devuelve su ruta,
/// para poder arrastrarlo fuera como archivo.
#[tauri::command]
async fn save_text_card(app: AppHandle, text: String) -> Result<String, String> {
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("estante");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let first: String = text
        .lines()
        .find(|l| !l.trim().is_empty())
        .unwrap_or("Texto")
        .chars()
        .filter(|c| c.is_alphanumeric() || *c == ' ' || *c == '-')
        .take(32)
        .collect();
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let name = format!("{} · {}.txt", first.trim().trim_end_matches(' '), stamp % 100_000);
    let path = dir.join(name);
    std::fs::write(&path, text.as_bytes()).map_err(|e| e.to_string())?;
    Ok(path.to_string_lossy().into_owned())
}

/// Archivos copiados en el Explorador, para pegarlos en el Estante
#[tauri::command]
fn clipboard_files() -> Vec<String> {
    system::clipboard_files()
}

/// Abre la web app de IDY dentro de una ventana propia
#[tauri::command]
async fn open_web(app: AppHandle, url: String) -> Result<(), String> {
    if let Some(w) = app.get_webview_window("web") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
        return Ok(());
    }
    let parsed: tauri::Url = url.parse().map_err(|e: url::ParseError| e.to_string())?;
    WebviewWindowBuilder::new(&app, "web", WebviewUrl::External(parsed))
        .title("IDY · Web")
        .inner_size(430.0, 860.0)
        .min_inner_size(360.0, 560.0)
        .background_color(tauri::window::Color(0, 0, 0, 255))
        .center()
        .build()
        .map(|_| ())
        .map_err(|e| e.to_string())
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
        .background_color(tauri::window::Color(28, 28, 30, 255))
        .resizable(true)
        .center()
        .build();
}

fn toggle_notch(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("notch") {
        let _ = w.emit("toggle-hidden", ());
    }
}

#[cfg(windows)]
thread_local! {
    static DROP_TARGET: std::cell::RefCell<Option<windows::Win32::System::Ole::IDropTarget>> = const { std::cell::RefCell::new(None) };
}

#[cfg(windows)]
fn notch_hwnd(app: &AppHandle) -> Option<isize> {
    app.get_webview_window("notch").and_then(|w| w.hwnd().ok()).map(|h| h.0 as isize)
}

#[cfg(windows)]
fn install_drop_target(app: &AppHandle) {
    let emitter = app.clone();
    let target = droptarget::new_target(Box::new(move |ev| {
        let _ = match ev {
            droptarget::DropEvent::Enter => emitter.emit("shelf-drag", true),
            droptarget::DropEvent::Leave => emitter.emit("shelf-drag", false),
            droptarget::DropEvent::Files(f) => emitter.emit("shelf-drop", f),
            droptarget::DropEvent::Text(t) => emitter.emit("shelf-text", t),
        };
    }));
    if let Some(h) = notch_hwnd(app) {
        droptarget::register_all(h, &target);
    }
    DROP_TARGET.with(|t| *t.borrow_mut() = Some(target));
    // WebView2 crea algunas ventanas internas tarde: vuelve a registrar unas veces al inicio
    let a = app.clone();
    std::thread::spawn(move || {
        for _ in 0..6 {
            std::thread::sleep(std::time::Duration::from_secs(2));
            reregister_drop(&a);
        }
    });
}

/// Vuelve a registrar el receptor (se llama cuando el cursor entra al notch)
#[cfg(windows)]
pub fn reregister_drop(app: &AppHandle) {
    let Some(h) = notch_hwnd(app) else { return };
    let _ = app.run_on_main_thread(move || {
        DROP_TARGET.with(|t| {
            if let Some(target) = t.borrow().as_ref() {
                droptarget::register_all(h, target);
            }
        });
    });
}
#[cfg(not(windows))]
pub fn reregister_drop(_app: &AppHandle) {}

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
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        // Soltar archivos en el notch: se captura aquí (nativo) y se reenvía al Estante
        .on_window_event(|window, event| {
            if window.label() != "notch" {
                return;
            }
            if let tauri::WindowEvent::DragDrop(dd) = event {
                match dd {
                    tauri::DragDropEvent::Enter { .. } => { let _ = window.emit("shelf-drag", true); }
                    tauri::DragDropEvent::Leave => { let _ = window.emit("shelf-drag", false); }
                    tauri::DragDropEvent::Drop { paths, .. } => {
                        let list: Vec<String> = paths.iter().map(|p| p.to_string_lossy().into_owned()).collect();
                        let _ = window.emit("shelf-drop", list);
                    }
                    _ => {}
                }
            }
        })
        .manage(shared.clone())
        .invoke_handler(tauri::generate_handler![
            set_hit_rect,
            media_command,
            open_settings,
            save_text_card,
            get_foreground,
            clipboard_files,
            get_volume,
            set_volume,
            open_web,
            quit_app
        ])
        .setup(move |app| {
            let handle = app.handle().clone();

            // ── Bandeja ──
            let settings = MenuItem::with_id(app, "settings", "Ajustes…", true, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "toggle", "Ocultar / mostrar notch", true, None::<&str>)?;
            let web = MenuItem::with_id(app, "web", "Abrir la web de IDY", true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let quit = MenuItem::with_id(app, "quit", "Salir", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&settings, &web, &toggle, &sep, &quit])?;
            TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().unwrap().clone())
                .tooltip("IDY Notch")
                .menu(&menu)
                .show_menu_on_left_click(false)
                .on_menu_event(|app, ev| match ev.id.as_ref() {
                    "settings" => show_settings(app, None),
                    "toggle" => toggle_notch(app),
                    "web" => { let _ = app.emit("open-web", ()); }
                    "quit" => app.exit(0),
                    _ => {}
                })
                .on_tray_icon_event(|tray, ev| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = ev {
                        show_settings(tray.app_handle(), None);
                    }
                })
                .build(app)?;

            // ── Soltar archivos/textos en el notch (receptor propio) ──
            #[cfg(windows)]
            install_drop_target(&handle);

            // ── Hilos nativos ──
            system::spawn_hover_watch(handle.clone(), shared.clone());
            system::spawn_system_watch(handle.clone(), shared.clone());
            media::spawn_watch(handle.clone());

            let _ = handle.emit("native-ready", ());
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error al iniciar IDY Notch");
}
