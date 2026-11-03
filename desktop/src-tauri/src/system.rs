//! Vigilancia ligera del sistema: hover del cursor sobre el notch, batería,
//! auriculares Bluetooth, apps a pantalla completa e inactividad del usuario.

use crate::Shared;
use serde::Serialize;
use std::sync::Arc;
use std::time::Duration;
use tauri::{AppHandle, Emitter, Manager};

#[derive(Serialize, Clone, PartialEq, Debug)]
pub struct Power {
    pub has_battery: bool,
    pub charging: bool,
    pub percent: u8,
}

#[derive(Serialize, Clone, Debug)]
pub struct Fg {
    pub state: u8,
    pub class: String,
}

#[derive(Serialize, Clone, Debug)]
pub struct Bt {
    pub name: String,
    pub connected: bool,
}

/// Deja pasar los clics al escritorio salvo cuando el cursor está sobre el notch.
pub fn spawn_hover_watch(app: AppHandle, shared: Arc<Shared>) {
    std::thread::spawn(move || {
        let mut inside_prev: Option<bool> = None;
        let mut ignore_prev: Option<bool> = None;
        loop {
            let r = *shared.hit.lock().unwrap();
            if let Some((cx, cy)) = imp::cursor() {
                let m = 1.0;
                let inside = r.w > 0.0
                    && cx >= r.x - m && cx <= r.x + r.w + m
                    && cy >= r.y - m && cy <= r.y + r.h + m;
                if inside_prev != Some(inside) {
                    let _ = app.emit("hover", inside);
                    inside_prev = Some(inside);
                }
                let ignore = !inside && !r.hold;
                if ignore_prev != Some(ignore) {
                    if let Some(w) = app.get_webview_window("notch") {
                        let _ = w.set_ignore_cursor_events(ignore);
                    }
                    ignore_prev = Some(ignore);
                }
            }
            std::thread::sleep(Duration::from_millis(35));
        }
    });
}

pub fn spawn_system_watch(app: AppHandle, shared: Arc<Shared>) {
    std::thread::spawn(move || {
        imp::com_init();
        let mut tick: u64 = 0;
        let mut last_power: Option<Power> = None;
        let mut last_fg: Option<u8> = None;
        let mut last_class = String::new();
        let mut bt_known: Option<std::collections::HashMap<String, String>> = None;
        let mut class_cache = std::collections::HashMap::<String, bool>::new();
        loop {
            // Ventana en primer plano (cada 250 ms): 0 normal, 1 maximizada / tapa el notch, 2 pantalla completa
            let notch = app.get_webview_window("notch").and_then(|w| imp::raw_hwnd(&w));
            if let Some((fg, class)) = imp::foreground(notch) {
                if last_fg != Some(fg) || last_class != class {
                    let _ = app.emit("foreground", fg);
                    let _ = app.emit("fullscreen", fg == 2);
                    let _ = app.emit("foreground-info", Fg { state: fg, class: class.clone() });
                    *shared.fg.lock().unwrap() = (fg, class.clone());
                    last_fg = Some(fg);
                    last_class = class;
                }
            }
            // Inactividad (cada 1 s)
            if tick % 4 == 0 {
                let _ = app.emit("idle", imp::idle_secs());
            }
            // Batería (cada 2 s)
            if tick % 8 == 0 {
                if let Some(p) = imp::power() {
                    if last_power.as_ref() != Some(&p) {
                        let _ = app.emit("power", &p);
                        last_power = Some(p);
                    }
                }
            }
            // Auriculares Bluetooth (cada 4 s)
            if tick % 16 == 0 {
                if let Some(now) = imp::bt_audio(&mut class_cache) {
                    if let Some(prev) = &bt_known {
                        for (id, name) in &now {
                            if !prev.contains_key(id) {
                                let _ = app.emit("bluetooth", Bt { name: name.clone(), connected: true });
                            }
                        }
                        for (id, name) in prev {
                            if !now.contains_key(id) {
                                let _ = app.emit("bluetooth", Bt { name: name.clone(), connected: false });
                            }
                        }
                    }
                    bt_known = Some(now);
                }
            }
            tick += 1;
            std::thread::sleep(Duration::from_millis(250));
        }
    });
}

#[cfg(windows)]
mod imp {
    use super::Power;
    use std::collections::HashMap;
    use std::ffi::c_void;
    use windows::Devices::Bluetooth::{BluetoothConnectionStatus, BluetoothDevice, BluetoothMajorClass};
    use windows::Devices::Enumeration::DeviceInformation;
    use windows::Win32::Foundation::{HWND, POINT, RECT};
    use windows::Win32::Graphics::Gdi::{GetMonitorInfoW, MonitorFromWindow, MONITORINFO, MONITOR_DEFAULTTONEAREST};
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    use windows::Win32::System::Power::{GetSystemPowerStatus, SYSTEM_POWER_STATUS};
    use windows::Win32::System::SystemInformation::GetTickCount;
    use windows::Win32::UI::Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO};
    use windows::Win32::UI::WindowsAndMessaging::{
        GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowLongW, GetWindowRect, IsIconic, IsWindowVisible, IsZoomed,
        GWL_STYLE, WS_CAPTION,
    };
    use windows::Win32::Graphics::Dwm::{DwmGetWindowAttribute, DWMWA_CLOAKED};

    pub fn com_init() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    pub fn cursor() -> Option<(f64, f64)> {
        let mut p = POINT::default();
        unsafe { GetCursorPos(&mut p).ok()? };
        Some((p.x as f64, p.y as f64))
    }

    /// HWND como puntero crudo (evita choques entre versiones del crate `windows`).
    pub fn raw_hwnd(w: &tauri::WebviewWindow) -> Option<isize> {
        w.hwnd().ok().map(|h| h.0 as isize)
    }

    /// 0 = normal, 1 = maximizada o tapa la zona del notch, 2 = pantalla completa real.
    /// None = el foco está en el propio notch (no cambiar nada).
    /// (estado, clase de la ventana). Estado: 0 normal, 1 maximizada o tapa la zona
    /// del notch, 2 pantalla completa real. None = el foco está en el propio notch.
    pub fn foreground(notch: Option<isize>) -> Option<(u8, String)> {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() {
                return Some((0, String::new()));
            }
            if Some(fg.0 as isize) == notch {
                return None;
            }
            let mut buf = [0u16; 128];
            let n = GetClassNameW(fg, &mut buf);
            let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
            let normal = |c: &str| Some((0u8, c.to_string()));
            // Escritorio, barra de tareas, menú Inicio, búsqueda, vista de tareas…
            if matches!(class.as_str(),
                "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd" | "Windows.UI.Core.CoreWindow"
                | "XamlExplorerHostIslandWindow" | "MultitaskingViewFrame" | "ForegroundStaging" | "TopLevelWindowForOverflowXamlIsland"
                | "NotifyIconOverflowWindow" | "#32768" | "tooltips_class32")
            {
                return normal(&class);
            }
            // Minimizada, invisible u oculta por Windows (cloaked) → no cuenta
            if IsIconic(fg).as_bool() || !IsWindowVisible(fg).as_bool() {
                return normal(&class);
            }
            let mut cloaked: u32 = 0;
            let _ = DwmGetWindowAttribute(fg, DWMWA_CLOAKED, &mut cloaked as *mut u32 as *mut c_void, std::mem::size_of::<u32>() as u32);
            if cloaked != 0 {
                return normal(&class);
            }
            let mut wr = RECT::default();
            if GetWindowRect(fg, &mut wr).is_err() {
                return normal(&class);
            }
            let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            if let Some(nh) = notch {
                let notch_mon = MonitorFromWindow(HWND(nh as *mut c_void), MONITOR_DEFAULTTONEAREST);
                if notch_mon != mon {
                    return normal(&class);
                }
            }
            let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(mon, &mut mi).as_bool() {
                return normal(&class);
            }
            let m = mi.rcMonitor;
            let zoomed = IsZoomed(fg).as_bool();
            let style = GetWindowLongW(fg, GWL_STYLE) as u32;
            let has_caption = style & WS_CAPTION.0 == WS_CAPTION.0;
            let covers = wr.left <= m.left && wr.top <= m.top && wr.right >= m.right && wr.bottom >= m.bottom;
            if covers && !zoomed && !has_caption {
                return Some((2, class));
            }
            if zoomed || covers {
                return Some((1, class));
            }
            // Ventana pegada arriba que pasa por el centro (donde está el notch)
            let cx = (m.left + m.right) / 2;
            if wr.top <= m.top + 6 && wr.bottom > m.top + 40 && wr.left < cx + 150 && wr.right > cx - 150 {
                return Some((1, class));
            }
            Some((0, class))
        }
    }

    pub fn power() -> Option<Power> {
        let mut s = SYSTEM_POWER_STATUS::default();
        unsafe { GetSystemPowerStatus(&mut s).ok()? };
        let has_battery = s.BatteryFlag != 128 && s.BatteryFlag != 255;
        Some(Power {
            has_battery,
            charging: s.ACLineStatus == 1,
            percent: if s.BatteryLifePercent > 100 { 100 } else { s.BatteryLifePercent },
        })
    }

    pub fn idle_secs() -> u64 {
        let mut li = LASTINPUTINFO { cbSize: std::mem::size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        unsafe {
            if !GetLastInputInfo(&mut li).as_bool() {
                return 0;
            }
            (GetTickCount().wrapping_sub(li.dwTime) / 1000) as u64
        }
    }

    fn looks_like_audio(name: &str) -> bool {
        let n = name.to_lowercase();
        ["buds", "airpods", "headphone", "headset", "auricular", "earbud", "wh-", "wf-", "jbl", "beats", "sony", "bose", "soundcore", "freebuds"]
            .iter()
            .any(|k| n.contains(k))
    }

    /// Dispositivos Bluetooth de audio conectados: id -> nombre
    pub fn bt_audio(cache: &mut HashMap<String, bool>) -> Option<HashMap<String, String>> {
        let sel = BluetoothDevice::GetDeviceSelectorFromConnectionStatus(BluetoothConnectionStatus::Connected).ok()?;
        let list = DeviceInformation::FindAllAsyncAqsFilter(&sel).ok()?.get().ok()?;
        let mut out = HashMap::new();
        for i in 0..list.Size().ok()? {
            let Ok(d) = list.GetAt(i) else { continue };
            let (Ok(id), Ok(name)) = (d.Id(), d.Name()) else { continue };
            let key = id.to_string();
            let is_audio = *cache.entry(key.clone()).or_insert_with(|| {
                BluetoothDevice::FromIdAsync(&id)
                    .and_then(|op| op.get())
                    .and_then(|dev| dev.ClassOfDevice())
                    .and_then(|c| c.MajorClass())
                    .map(|m| m == BluetoothMajorClass::AudioVideo)
                    .unwrap_or(false)
                    || looks_like_audio(&name.to_string())
            });
            if is_audio {
                out.insert(key, name.to_string());
            }
        }
        Some(out)
    }
}

#[cfg(not(windows))]
mod imp {
    use super::Power;
    use std::collections::HashMap;
    pub fn com_init() {}
    pub fn cursor() -> Option<(f64, f64)> { None }
    pub fn raw_hwnd(_w: &tauri::WebviewWindow) -> Option<isize> { None }
    pub fn foreground(_n: Option<isize>) -> Option<(u8, String)> { Some((0, String::new())) }
    pub fn power() -> Option<Power> { None }
    pub fn idle_secs() -> u64 { 0 }
    pub fn bt_audio(_c: &mut HashMap<String, bool>) -> Option<HashMap<String, String>> { None }
}
