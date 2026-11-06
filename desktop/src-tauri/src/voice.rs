//! Voz local: graba el micrófono mientras mantienes el atajo (Alt+Y por defecto) y
//! transcribe con whisper.cpp. Whisper corre como un proceso aparte que solo existe
//! durante la transcripción (prioridad baja, pocos hilos): al terminar, el sistema
//! recupera toda su memoria. El programa y el modelo se descargan solo si activas la voz.

use serde::Serialize;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, AtomicU32, Ordering};
use std::sync::{Arc, Mutex};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter, Manager};

const ASSETS: &str = "https://github.com/Applexby/idy-notch/releases/download/voice-v1";
const MAX_SECS: u64 = 30;

#[derive(Default)]
pub struct Voice {
    rec: Mutex<Option<Recording>>,
    pub busy: AtomicBool,
    pub config: Mutex<VoiceConfig>,
    pressed_at: Mutex<Option<Instant>>,
}

#[derive(Clone, Debug, serde::Deserialize)]
pub struct VoiceConfig {
    pub enabled: bool,
    pub model: String, // "base" | "small"
    pub hotkey: String,
    /// Nombre del micrófono; vacío = el predeterminado de Windows
    #[serde(default)]
    pub mic: String,
}
impl Default for VoiceConfig {
    fn default() -> Self {
        Self { enabled: false, model: "base".into(), hotkey: "Alt+Y".into(), mic: String::new() }
    }
}

struct Recording {
    stop: Arc<AtomicBool>,
    handle: std::thread::JoinHandle<Result<(Vec<f32>, u32), String>>,
}

#[derive(Serialize, Clone)]
pub struct VoiceEvent {
    pub state: String, // listening | processing | idle | error
    pub message: Option<String>,
}

#[derive(Serialize, Clone)]
pub struct VoiceStatus {
    pub bin: bool,
    pub base: bool,
    pub small: bool,
    pub dir: String,
}

#[derive(Serialize, Clone)]
struct Progress {
    what: String,
    received: u64,
    total: u64,
}

fn emit_state(app: &AppHandle, state: &str, message: Option<String>) {
    let _ = app.emit("voice-state", VoiceEvent { state: state.into(), message });
}

pub fn voice_dir(app: &AppHandle) -> Result<PathBuf, String> {
    Ok(app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("voz"))
}

fn model_file(dir: &Path, model: &str) -> PathBuf {
    dir.join("modelos").join(format!("ggml-{model}-q5_1.bin"))
}

fn find_cli(dir: &Path) -> Option<PathBuf> {
    fn walk(p: &Path, depth: u8) -> Option<PathBuf> {
        if depth > 4 {
            return None;
        }
        for e in std::fs::read_dir(p).ok()?.flatten() {
            let path = e.path();
            if path.is_dir() {
                if let Some(f) = walk(&path, depth + 1) {
                    return Some(f);
                }
            } else if let Some(n) = path.file_name().and_then(|n| n.to_str()) {
                if n.eq_ignore_ascii_case("whisper-cli.exe") {
                    return Some(path);
                }
            }
        }
        None
    }
    walk(&dir.join("bin"), 0)
}

pub fn status(app: &AppHandle) -> Result<VoiceStatus, String> {
    let dir = voice_dir(app)?;
    Ok(VoiceStatus {
        bin: find_cli(&dir).is_some(),
        base: model_file(&dir, "base").exists(),
        small: model_file(&dir, "small").exists(),
        dir: dir.to_string_lossy().into_owned(),
    })
}

// ───────── Descarga (solo cuando activas la voz) ─────────

async fn download(app: &AppHandle, url: &str, dest: &Path, what: &str) -> Result<(), String> {
    use futures_util::StreamExt;
    use std::io::Write;
    if let Some(p) = dest.parent() {
        std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
    }
    let resp = reqwest::get(url).await.map_err(|e| e.to_string())?.error_for_status().map_err(|e| e.to_string())?;
    let total = resp.content_length().unwrap_or(0);
    let tmp = dest.with_extension("descargando");
    let mut file = std::fs::File::create(&tmp).map_err(|e| e.to_string())?;
    let mut stream = resp.bytes_stream();
    let (mut received, mut last) = (0u64, Instant::now());
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| e.to_string())?;
        file.write_all(&chunk).map_err(|e| e.to_string())?;
        received += chunk.len() as u64;
        if last.elapsed() > Duration::from_millis(150) {
            last = Instant::now();
            let _ = app.emit("voice-download", Progress { what: what.into(), received, total });
        }
    }
    drop(file);
    std::fs::rename(&tmp, dest).map_err(|e| e.to_string())?;
    let _ = app.emit("voice-download", Progress { what: what.into(), received: total.max(received), total: total.max(received) });
    Ok(())
}

fn unzip(zip_path: &Path, dest: &Path) -> Result<(), String> {
    let f = std::fs::File::open(zip_path).map_err(|e| e.to_string())?;
    let mut archive = zip::ZipArchive::new(f).map_err(|e| e.to_string())?;
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else { continue };
        let out = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
        } else {
            if let Some(p) = out.parent() {
                std::fs::create_dir_all(p).map_err(|e| e.to_string())?;
            }
            let mut w = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut w).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

pub async fn install(app: AppHandle, model: String) -> Result<VoiceStatus, String> {
    if model != "base" && model != "small" {
        return Err("Modelo no válido".into());
    }
    let dir = voice_dir(&app)?;
    if find_cli(&dir).is_none() {
        let zip_path = dir.join("whisper-bin-x64.zip");
        download(&app, &format!("{ASSETS}/whisper-bin-x64.zip"), &zip_path, "programa").await?;
        unzip(&zip_path, &dir.join("bin"))?;
        let _ = std::fs::remove_file(&zip_path);
        if find_cli(&dir).is_none() {
            return Err("No se encontró whisper-cli.exe en la descarga".into());
        }
    }
    let mf = model_file(&dir, &model);
    if !mf.exists() {
        download(&app, &format!("{ASSETS}/ggml-{model}-q5_1.bin"), &mf, "modelo").await?;
    }
    status(&app)
}

pub fn uninstall(app: &AppHandle) -> Result<(), String> {
    let dir = voice_dir(app)?;
    if dir.exists() {
        std::fs::remove_dir_all(&dir).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ───────── Grabación ─────────

pub fn list_mics() -> Vec<String> {
    use cpal::traits::{DeviceTrait, HostTrait};
    let host = cpal::default_host();
    let mut v: Vec<String> = host
        .input_devices()
        .map(|it| it.filter_map(|d| d.name().ok()).collect())
        .unwrap_or_default();
    v.dedup();
    v
}

fn record(stop: Arc<AtomicBool>, level: Arc<AtomicU32>, mic: String) -> Result<(Vec<f32>, u32), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let host = cpal::default_host();
    let chosen = if mic.is_empty() {
        None
    } else {
        host.input_devices().ok().and_then(|mut it| it.find(|d| d.name().map(|n| n == mic).unwrap_or(false)))
    };
    // si el elegido ya no está conectado, usa el predeterminado
    let dev = match chosen {
        Some(d) => d,
        None => host.default_input_device().ok_or("No se encontró un micrófono")?,
    };
    let cfg = dev.default_input_config().map_err(|e| format!("Micrófono no disponible: {e}"))?;
    let rate = cfg.sample_rate().0;
    let channels = cfg.channels() as usize;
    let buf: Arc<Mutex<Vec<f32>>> = Arc::new(Mutex::new(Vec::with_capacity(rate as usize * 10)));
    let sc: cpal::StreamConfig = cfg.config();

    // Mezcla a mono y mide el nivel para la animación
    let push = {
        let buf = buf.clone();
        let level = level.clone();
        move |frames: &mut dyn Iterator<Item = f32>| {
            let mut b = buf.lock().unwrap();
            let (mut acc, mut n, mut sum_sq, mut count) = (0.0f32, 0usize, 0.0f32, 0usize);
            for s in frames {
                acc += s;
                n += 1;
                if n == channels {
                    let v = acc / channels as f32;
                    b.push(v);
                    sum_sq += v * v;
                    count += 1;
                    acc = 0.0;
                    n = 0;
                }
            }
            if count > 0 {
                level.store((sum_sq / count as f32).sqrt().to_bits(), Ordering::Relaxed);
            }
        }
    };
    let err = |e: cpal::StreamError| eprintln!("micrófono: {e}");
    let stream = match cfg.sample_format() {
        cpal::SampleFormat::F32 => {
            let p = push.clone();
            dev.build_input_stream(&sc, move |d: &[f32], _: &cpal::InputCallbackInfo| p(&mut d.iter().copied()), err, None)
        }
        cpal::SampleFormat::I16 => {
            let p = push.clone();
            dev.build_input_stream(&sc, move |d: &[i16], _: &cpal::InputCallbackInfo| p(&mut d.iter().map(|&s| s as f32 / 32768.0)), err, None)
        }
        cpal::SampleFormat::U16 => {
            let p = push.clone();
            dev.build_input_stream(&sc, move |d: &[u16], _: &cpal::InputCallbackInfo| p(&mut d.iter().map(|&s| (s as f32 - 32768.0) / 32768.0)), err, None)
        }
        other => return Err(format!("Formato de micrófono no soportado: {other:?}")),
    }
    .map_err(|e| format!("No se pudo abrir el micrófono: {e}"))?;
    stream.play().map_err(|e| format!("No se pudo abrir el micrófono: {e}"))?;

    let started = Instant::now();
    while !stop.load(Ordering::Relaxed) && started.elapsed() < Duration::from_secs(MAX_SECS) {
        std::thread::sleep(Duration::from_millis(20));
    }
    drop(stream);
    let samples = std::mem::take(&mut *buf.lock().unwrap());
    Ok((samples, rate))
}

fn resample_16k(input: &[f32], rate: u32) -> Vec<f32> {
    if rate == 16000 || input.is_empty() {
        return input.to_vec();
    }
    let ratio = rate as f64 / 16000.0;
    let len = (input.len() as f64 / ratio) as usize;
    (0..len)
        .map(|i| {
            let pos = i as f64 * ratio;
            let i0 = pos.floor() as usize;
            let i1 = (i0 + 1).min(input.len() - 1);
            let t = (pos - i0 as f64) as f32;
            input[i0] * (1.0 - t) + input[i1] * t
        })
        .collect()
}

pub fn start(app: &AppHandle) -> Result<(), String> {
    let voice = app.state::<Arc<Voice>>();
    if voice.busy.load(Ordering::Relaxed) {
        return Ok(());
    }
    let mut slot = voice.rec.lock().unwrap();
    if slot.is_some() {
        return Ok(());
    }
    let stop = Arc::new(AtomicBool::new(false));
    let level = Arc::new(AtomicU32::new(0));
    let (s2, l2) = (stop.clone(), level.clone());
    let mic = voice.config.lock().unwrap().mic.clone();
    let handle = std::thread::spawn(move || record(s2, l2, mic));
    *slot = Some(Recording { stop: stop.clone(), handle });
    drop(slot);
    emit_state(app, "listening", None);
    // Nivel del micrófono para la animación del notch
    let a = app.clone();
    std::thread::spawn(move || {
        let t0 = Instant::now();
        while !stop.load(Ordering::Relaxed) {
            if t0.elapsed() >= Duration::from_secs(MAX_SECS) {
                // límite de tiempo: transcribe lo grabado
                self::stop(&a);
                break;
            }
            let v = f32::from_bits(level.load(Ordering::Relaxed));
            let _ = a.emit("voice-level", (v * 6.0).min(1.0));
            std::thread::sleep(Duration::from_millis(70));
        }
    });
    Ok(())
}

pub fn cancel(app: &AppHandle) {
    let voice = app.state::<Arc<Voice>>();
    if let Some(r) = voice.rec.lock().unwrap().take() {
        r.stop.store(true, Ordering::Relaxed);
        let _ = r.handle.join();
    }
    emit_state(app, "idle", None);
}

/// Detiene la grabación y transcribe en segundo plano; el texto llega como evento "voice-text".
pub fn stop(app: &AppHandle) {
    let voice = app.state::<Arc<Voice>>().inner().clone();
    let Some(r) = voice.rec.lock().unwrap().take() else { return };
    r.stop.store(true, Ordering::Relaxed);
    voice.busy.store(true, Ordering::Relaxed);
    emit_state(app, "processing", None);
    let app = app.clone();
    std::thread::spawn(move || {
        let result = (|| -> Result<String, String> {
            let (samples, rate) = r.handle.join().map_err(|_| "La grabación falló".to_string())??;
            let audio = resample_16k(&samples, rate);
            if audio.len() < 16000 / 3 {
                return Err("No te escuché. Mantén pulsado el atajo mientras hablas.".into());
            }
            transcribe(&app, &audio)
        })();
        voice.busy.store(false, Ordering::Relaxed);
        match result {
            Ok(text) if !text.trim().is_empty() => {
                let _ = app.emit("voice-text", text.trim().to_string());
                emit_state(&app, "idle", None);
            }
            Ok(_) => emit_state(&app, "error", Some("No entendí nada. Prueba de nuevo, más cerca del micrófono.".into())),
            Err(e) => emit_state(&app, "error", Some(e)),
        }
    });
}

fn transcribe(app: &AppHandle, audio: &[f32]) -> Result<String, String> {
    let dir = voice_dir(app)?;
    let cli = find_cli(&dir).ok_or("La voz no está instalada. Actívala en Ajustes › Voz.")?;
    let model = app.state::<Arc<Voice>>().config.lock().unwrap().model.clone();
    let mut model = model;
    if !model_file(&dir, &model).exists() {
        // usa el otro modelo si es el único descargado
        let other = if model == "base" { "small" } else { "base" };
        if model_file(&dir, other).exists() { model = other.into() } else { return Err("Falta el modelo de voz. Descárgalo en Ajustes › Voz.".into()) }
    }
    // Se trabaja con rutas relativas dentro de la carpeta de voz: whisper.cpp falla con
    // rutas que tienen tildes o caracteres especiales (p. ej. en el nombre de usuario).
    let tmp = dir.join("tmp");
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let wav = tmp.join("frase.wav");
    let txt = tmp.join("frase.txt");
    {
        let spec = hound::WavSpec { channels: 1, sample_rate: 16000, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let mut w = hound::WavWriter::create(&wav, spec).map_err(|e| e.to_string())?;
        for s in audio {
            w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?;
        }
        w.finalize().map_err(|e| e.to_string())?;
    }
    let _ = std::fs::remove_file(&txt);
    let threads = std::thread::available_parallelism().map(|n| (n.get() / 2).clamp(1, 4)).unwrap_or(2).to_string();
    let model_rel = format!("modelos/ggml-{model}-q5_1.bin");
    let mut cmd = std::process::Command::new(&cli);
    cmd.current_dir(&dir)
        .args(["-m", model_rel.as_str(), "-f", "tmp/frase.wav", "-of", "tmp/frase"])
        .args(["-l", "es", "-nt", "-np", "-otxt", "-t", threads.as_str()])
        .args(["--prompt", "Recordatorio, nota o tarea: mañana a las once llamar a cliente."]);
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // sin ventana y con prioridad baja, para no molestar a Premiere o After Effects
        cmd.creation_flags(0x0800_0000 | 0x0000_4000);
    }
    let output = cmd.output().map_err(|e| format!("No se pudo iniciar whisper: {e}"))?;
    let text = std::fs::read_to_string(&txt).unwrap_or_default();
    let _ = std::fs::remove_file(&wav);
    if text.trim().is_empty() && !output.status.success() {
        let code = output.status.code().unwrap_or(0) as u32;
        // Guarda el detalle para diagnosticar
        let log = format!("código {code:#x}\n--- stderr ---\n{}\n--- stdout ---\n{}", String::from_utf8_lossy(&output.stderr), String::from_utf8_lossy(&output.stdout));
        let _ = std::fs::write(tmp.join("ultimo-error.txt"), &log);
        if code == 0xC000_0135 || code == 0xC000_007B {
            return Err("Falta «Microsoft Visual C++ Redistributable (x64)». Instálalo desde la web de Microsoft y vuelve a probar.".into());
        }
        if code == 0xC000_001D {
            return Err("Tu procesador no es compatible con esta versión de whisper.".into());
        }
        let last = String::from_utf8_lossy(&output.stderr)
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty())
            .last()
            .unwrap_or("")
            .chars()
            .take(140)
            .collect::<String>();
        return Err(format!("La transcripción falló ({code:#x}) {last}"));
    }
    // whisper a veces añade marcas como [Música] o (risas)
    let clean: String = text.lines().map(|l| l.trim()).filter(|l| !l.is_empty()).collect::<Vec<_>>().join(" ");
    Ok(regex_lite_strip(&clean))
}

/// Prueba desde Ajustes: graba unos segundos y devuelve el texto sin crear nada.
pub fn test(app: &AppHandle, secs: u64) -> Result<String, String> {
    let voice = app.state::<Arc<Voice>>().inner().clone();
    if voice.busy.swap(true, Ordering::Relaxed) {
        return Err("La voz está ocupada; prueba en un momento.".into());
    }
    let result = (|| -> Result<String, String> {
        let stop = Arc::new(AtomicBool::new(false));
        let level = Arc::new(AtomicU32::new(0));
        let mic = voice.config.lock().unwrap().mic.clone();
        let (s2, l2) = (stop.clone(), level.clone());
        let h = std::thread::spawn(move || record(s2, l2, mic));
        let t0 = Instant::now();
        while t0.elapsed() < Duration::from_secs(secs) {
            let v = f32::from_bits(level.load(Ordering::Relaxed));
            let _ = app.emit("voice-test-level", (v * 6.0).min(1.0));
            std::thread::sleep(Duration::from_millis(70));
        }
        stop.store(true, Ordering::Relaxed);
        let _ = app.emit("voice-test-level", 0.0f32);
        let _ = app.emit("voice-test-phase", "processing");
        let (samples, rate) = h.join().map_err(|_| "La grabación falló".to_string())??;
        let peak = samples.iter().fold(0f32, |m, s| m.max(s.abs()));
        if peak < 0.003 {
            return Err("El micrófono no captó sonido. Revisa que esté conectado y no silenciado.".into());
        }
        transcribe(app, &resample_16k(&samples, rate))
    })();
    voice.busy.store(false, Ordering::Relaxed);
    result
}

fn regex_lite_strip(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    let mut depth = 0i32;
    for ch in s.chars() {
        match ch {
            '[' | '(' => depth += 1,
            ']' | ')' => depth = (depth - 1).max(0),
            _ if depth == 0 => out.push(ch),
            _ => {}
        }
    }
    out.split_whitespace().collect::<Vec<_>>().join(" ")
}

// ───────── Atajo global (mantener pulsado = hablar, toque corto = escribir) ─────────

/// Código de tecla virtual de Windows de la tecla principal del atajo ("Alt+Y" → 'Y').
#[cfg(windows)]
fn main_vk(hotkey: &str) -> Option<i32> {
    let k = hotkey.rsplit('+').next()?.trim().to_ascii_uppercase();
    let k = k.strip_prefix("KEY").unwrap_or(&k).to_string();
    let k = k.strip_prefix("DIGIT").unwrap_or(&k).to_string();
    if k.len() == 1 {
        let c = k.chars().next()?;
        if c.is_ascii_alphanumeric() {
            return Some(c as i32);
        }
    }
    if let Some(n) = k.strip_prefix('F').and_then(|n| n.parse::<i32>().ok()) {
        if (1..=24).contains(&n) {
            return Some(0x70 + n - 1);
        }
    }
    match k.as_str() {
        "SPACE" => Some(0x20),
        "ENTER" => Some(0x0D),
        "BACKQUOTE" => Some(0xC0),
        "PERIOD" => Some(0xBE),
        "COMMA" => Some(0xBC),
        "SLASH" => Some(0xBF),
        "SEMICOLON" => Some(0xBA),
        _ => None,
    }
}

fn released(app: &AppHandle) {
    let voice = app.state::<Arc<Voice>>().inner().clone();
    let enabled = voice.config.lock().unwrap().enabled;
    let Some(t0) = voice.pressed_at.lock().unwrap().take() else { return };
    let held = t0.elapsed();
    if !enabled || held < Duration::from_millis(280) {
        // Toque corto: abre el notch para escribir
        if enabled {
            cancel(app);
        }
        let _ = app.emit("voice-tap", ());
    } else {
        stop(app);
    }
}

pub fn on_shortcut(app: &AppHandle, pressed: bool) {
    let voice = app.state::<Arc<Voice>>().inner().clone();
    let (enabled, hotkey) = {
        let c = voice.config.lock().unwrap();
        (c.enabled, c.hotkey.clone())
    };
    #[cfg(windows)]
    let vk = main_vk(&hotkey);
    #[cfg(not(windows))]
    let vk: Option<i32> = { let _ = &hotkey; None };

    if pressed {
        {
            let mut p = voice.pressed_at.lock().unwrap();
            if p.is_some_and(|t| t.elapsed() < Duration::from_secs(MAX_SECS + 5)) {
                return; // repetición de tecla mientras se mantiene
            }
            *p = Some(Instant::now());
        }
        if enabled {
            let _ = start(app);
        }
        // En Windows, el aviso de "soltar" del atajo a veces llega antes de tiempo
        // (y IDY lo tomaba por un toque corto). Por eso vigilamos la tecla nosotros mismos.
        #[cfg(windows)]
        if let Some(vk) = vk {
            let a = app.clone();
            std::thread::spawn(move || {
                use windows::Win32::UI::Input::KeyboardAndMouse::GetAsyncKeyState;
                let down = || unsafe { (GetAsyncKeyState(vk) as u16 & 0x8000) != 0 };
                let t0 = Instant::now();
                let mut up_count = 0;
                loop {
                    std::thread::sleep(Duration::from_millis(15));
                    if down() {
                        up_count = 0;
                    } else {
                        up_count += 1;
                        if up_count >= 3 {
                            break; // ~45 ms seguidos sin la tecla: se soltó de verdad
                        }
                    }
                    if t0.elapsed() > Duration::from_secs(MAX_SECS + 2) {
                        break;
                    }
                }
                released(&a);
            });
        }
    } else if vk.is_none() {
        // sin vigilancia propia: usa el aviso del sistema
        released(app);
    }
}
