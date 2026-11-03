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

pub fn spawn_system_watch(app: AppHandle) {
    std::thread::spawn(move || {
        imp::com_init();
        let mut tick: u64 = 0;
        let mut last_power: Option<Power> = None;
        let mut last_fs: Option<bool> = None;
        let mut bt_known: Option<std::collections::HashMap<String, String>> = None;
        let mut class_cache = std::collections::HashMap::<String, bool>::new();
        loop {
            // Pantalla completa (cada 1 s)
            let notch = app.get_webview_window("notch").and_then(|w| imp::raw_hwnd(&w));
            let fs = imp::fullscreen(notch);
            if last_fs != Some(fs) {
                let _ = app.emit("fullscreen", fs);
                last_fs = Some(fs);
            }
            // Batería (cada 2 s)
            if tick % 2 == 0 {
                if let Some(p) = imp::power() {
                    if last_power.as_ref() != Some(&p) {
                        let _ = app.emit("power", &p);
                        last_power = Some(p);
                    }
                }
                let _ = app.emit("idle", imp::idle_secs());
            }
            // Auriculares Bluetooth (cada 4 s)
            if tick % 4 == 0 {
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
            std::thread::sleep(Duration::from_millis(1000));
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
    use windows::Win32::UI::WindowsAndMessaging::{GetClassNameW, GetCursorPos, GetForegroundWindow, GetWindowRect};

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

    pub fn fullscreen(notch: Option<isize>) -> bool {
        unsafe {
            let fg = GetForegroundWindow();
            if fg.0.is_null() || Some(fg.0 as isize) == notch {
                return false;
            }
            let mut buf = [0u16; 64];
            let n = GetClassNameW(fg, &mut buf);
            let class = String::from_utf16_lossy(&buf[..n.max(0) as usize]);
            if matches!(class.as_str(), "Progman" | "WorkerW" | "Shell_TrayWnd" | "Shell_SecondaryTrayWnd") {
                return false;
            }
            let mut wr = RECT::default();
            if GetWindowRect(fg, &mut wr).is_err() {
                return false;
            }
            let mon = MonitorFromWindow(fg, MONITOR_DEFAULTTONEAREST);
            if let Some(nh) = notch {
                let notch_mon = MonitorFromWindow(HWND(nh as *mut c_void), MONITOR_DEFAULTTONEAREST);
                if notch_mon != mon {
                    return false;
                }
            }
            let mut mi = MONITORINFO { cbSize: std::mem::size_of::<MONITORINFO>() as u32, ..Default::default() };
            if !GetMonitorInfoW(mon, &mut mi).as_bool() {
                return false;
            }
            let m = mi.rcMonitor;
            wr.left <= m.left && wr.top <= m.top && wr.right >= m.right && wr.bottom >= m.bottom
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
    pub fn fullscreen(_n: Option<isize>) -> bool { false }
    pub fn power() -> Option<Power> { None }
    pub fn idle_secs() -> u64 { 0 }
    pub fn bt_audio(_c: &mut HashMap<String, bool>) -> Option<HashMap<String, String>> { None }
}
