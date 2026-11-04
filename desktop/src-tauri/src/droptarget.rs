//! Receptor propio de "soltar" (OLE) para el notch.
//! El de WebView2/wry a veces queda registrado sobre ventanas internas que se crean
//! tarde y rechaza el archivo (cursor 🚫). Aquí registramos el nuestro en la ventana
//! y en todas sus hijas, y lo volvemos a aplicar cada vez que el cursor entra.

use std::ffi::c_void;
use windows::core::implement;
use windows::Win32::Foundation::{BOOL, HWND, LPARAM, POINTL, S_OK};
use windows::Win32::System::Com::{IDataObject, DVASPECT_CONTENT, FORMATETC, TYMED_HGLOBAL};
use windows::Win32::System::Memory::{GlobalLock, GlobalUnlock};
use windows::Win32::System::Ole::{
    IDropTarget, IDropTarget_Impl, RegisterDragDrop, ReleaseStgMedium, RevokeDragDrop, DROPEFFECT, DROPEFFECT_COPY,
    DROPEFFECT_LINK, DROPEFFECT_NONE,
};
use windows::Win32::System::SystemServices::MODIFIERKEYS_FLAGS;
use windows::Win32::UI::Shell::{DragQueryFileW, HDROP};
use windows::Win32::UI::WindowsAndMessaging::EnumChildWindows;

const CF_UNICODETEXT: u16 = 13;
const CF_HDROP: u16 = 15;

pub enum DropEvent {
    Enter,
    Leave,
    Files(Vec<String>),
    Text(String),
}

type Cb = Box<dyn Fn(DropEvent) + Send + Sync + 'static>;

#[implement(IDropTarget)]
pub struct Target {
    cb: Cb,
    accepts: std::sync::atomic::AtomicBool,
}

fn fmt(cf: u16) -> FORMATETC {
    FORMATETC { cfFormat: cf, ptd: std::ptr::null_mut(), dwAspect: DVASPECT_CONTENT.0, lindex: -1, tymed: TYMED_HGLOBAL.0 as u32 }
}

unsafe fn has(data: &IDataObject, cf: u16) -> bool {
    data.QueryGetData(&fmt(cf)) == S_OK
}

unsafe fn read_files(data: &IDataObject) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(mut m) = data.GetData(&fmt(CF_HDROP)) {
        let drop = HDROP(m.u.hGlobal.0);
        let n = DragQueryFileW(drop, 0xFFFF_FFFF, None);
        for i in 0..n {
            let len = DragQueryFileW(drop, i, None) as usize;
            let mut buf = vec![0u16; len + 1];
            let got = DragQueryFileW(drop, i, Some(&mut buf)) as usize;
            out.push(String::from_utf16_lossy(&buf[..got]));
        }
        ReleaseStgMedium(&mut m);
    }
    out
}

unsafe fn read_text(data: &IDataObject) -> Option<String> {
    let mut m = data.GetData(&fmt(CF_UNICODETEXT)).ok()?;
    let h = m.u.hGlobal;
    let p = GlobalLock(h) as *const u16;
    let mut s = None;
    if !p.is_null() {
        let mut len = 0usize;
        while *p.add(len) != 0 && len < 2_000_000 { len += 1; }
        s = Some(String::from_utf16_lossy(std::slice::from_raw_parts(p, len)));
        let _ = GlobalUnlock(h);
    }
    ReleaseStgMedium(&mut m);
    s
}

impl IDropTarget_Impl for Target_Impl {
    fn DragEnter(&self, pdataobj: Option<&IDataObject>, _k: MODIFIERKEYS_FLAGS, _pt: &POINTL, pdweffect: *mut DROPEFFECT) -> windows::core::Result<()> {
        let ok = pdataobj.map(|d| unsafe { has(d, CF_HDROP) || has(d, CF_UNICODETEXT) }).unwrap_or(false);
        self.accepts.store(ok, std::sync::atomic::Ordering::Relaxed);
        unsafe { *pdweffect = if ok { pick(*pdweffect) } else { DROPEFFECT_NONE }; }
        if ok { (self.cb)(DropEvent::Enter); }
        Ok(())
    }
    fn DragOver(&self, _k: MODIFIERKEYS_FLAGS, _pt: &POINTL, pdweffect: *mut DROPEFFECT) -> windows::core::Result<()> {
        let ok = self.accepts.load(std::sync::atomic::Ordering::Relaxed);
        unsafe { *pdweffect = if ok { pick(*pdweffect) } else { DROPEFFECT_NONE }; }
        Ok(())
    }
    fn DragLeave(&self) -> windows::core::Result<()> {
        (self.cb)(DropEvent::Leave);
        Ok(())
    }
    fn Drop(&self, pdataobj: Option<&IDataObject>, _k: MODIFIERKEYS_FLAGS, _pt: &POINTL, pdweffect: *mut DROPEFFECT) -> windows::core::Result<()> {
        unsafe {
            *pdweffect = DROPEFFECT_NONE;
            if let Some(d) = pdataobj {
                let files = if has(d, CF_HDROP) { read_files(d) } else { Vec::new() };
                if !files.is_empty() {
                    (self.cb)(DropEvent::Files(files));
                    *pdweffect = DROPEFFECT_LINK;
                } else if let Some(t) = read_text(d) {
                    (self.cb)(DropEvent::Text(t));
                    *pdweffect = DROPEFFECT_COPY;
                }
            }
        }
        (self.cb)(DropEvent::Leave);
        Ok(())
    }
}

/// "Vincular" (no mueve ni copia el original); si el origen no lo permite, copiar.
fn pick(allowed: DROPEFFECT) -> DROPEFFECT {
    if allowed.0 & DROPEFFECT_LINK.0 != 0 { DROPEFFECT_LINK } else if allowed.0 & DROPEFFECT_COPY.0 != 0 { DROPEFFECT_COPY } else { DROPEFFECT_NONE }
}

pub fn new_target(cb: Cb) -> IDropTarget {
    Target { cb, accepts: std::sync::atomic::AtomicBool::new(false) }.into()
}

unsafe extern "system" fn collect(h: HWND, l: LPARAM) -> BOOL {
    let v = &mut *(l.0 as *mut Vec<isize>);
    v.push(h.0 as isize);
    BOOL(1)
}

/// Registra el receptor en la ventana y en todas sus hijas. Llamar en el hilo principal (STA).
pub fn register_all(hwnd: isize, target: &IDropTarget) {
    unsafe {
        let mut all: Vec<isize> = vec![hwnd];
        let _ = EnumChildWindows(HWND(hwnd as *mut c_void), Some(collect), LPARAM(&mut all as *mut Vec<isize> as isize));
        for h in all {
            let h = HWND(h as *mut c_void);
            let _ = RevokeDragDrop(h);
            let _ = RegisterDragDrop(h, target);
        }
    }
}
