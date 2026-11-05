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
}
impl Default for VoiceConfig {
    fn default() -> Self {
        Self { enabled: false, model: "base".into(), hotkey: "Alt+Y".into() }
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
                if n.eq_ignore_ascii_case("whisper-cli.exe") || n.eq_ignore_ascii_case("main.exe") {
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

fn record(stop: Arc<AtomicBool>, level: Arc<AtomicU32>) -> Result<(Vec<f32>, u32), String> {
    use cpal::traits::{DeviceTrait, HostTrait, StreamTrait};
    let host = cpal::default_host();
    let dev = host.default_input_device().ok_or("No se encontró un micrófono")?;
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
    let handle = std::thread::spawn(move || record(s2, l2));
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
    let mut mf = model_file(&dir, &model);
    if !mf.exists() {
        // usa el otro modelo si es el único descargado
        let other = model_file(&dir, if model == "base" { "small" } else { "base" });
        if other.exists() { mf = other } else { return Err("Falta el modelo de voz. Descárgalo en Ajustes › Voz.".into()) }
    }
    let tmp = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("voz");
    std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
    let wav = tmp.join("frase.wav");
    let out = tmp.join("frase");
    {
        let spec = hound::WavSpec { channels: 1, sample_rate: 16000, bits_per_sample: 16, sample_format: hound::SampleFormat::Int };
        let mut w = hound::WavWriter::create(&wav, spec).map_err(|e| e.to_string())?;
        for s in audio {
            w.write_sample((s.clamp(-1.0, 1.0) * 32767.0) as i16).map_err(|e| e.to_string())?;
        }
        w.finalize().map_err(|e| e.to_string())?;
    }
    let _ = std::fs::remove_file(out.with_extension("txt"));
    let threads = std::thread::available_parallelism().map(|n| (n.get() / 2).clamp(1, 4)).unwrap_or(2);
    let threads = threads.to_string();
    let mut cmd = std::process::Command::new(&cli);
    cmd.current_dir(cli.parent().unwrap_or(&dir))
        .arg("-m").arg(&mf)
        .arg("-f").arg(&wav)
        .args(["-l", "es", "-nt", "-np", "-otxt", "-t", threads.as_str()])
        .arg("-of").arg(&out)
        .arg("--prompt").arg("Recordatorio, nota o tarea en español: mañana a las once llamar a cliente.");
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // sin ventana y con prioridad baja, para no molestar a Premiere o After Effects
        cmd.creation_flags(0x0800_0000 | 0x0000_4000);
    }
    let output = cmd.output().map_err(|e| format!("No se pudo iniciar la voz: {e}"))?;
    let text = std::fs::read_to_string(out.with_extension("txt")).unwrap_or_default();
    let _ = std::fs::remove_file(&wav);
    if text.trim().is_empty() && !output.status.success() {
        return Err(format!("La transcripción falló: {}", String::from_utf8_lossy(&output.stderr).lines().last().unwrap_or("")));
    }
    // whisper a veces añade marcas como [Música] o (risas)
    let clean: String = text
        .lines()
        .map(|l| l.trim())
        .filter(|l| !l.is_empty())
        .collect::<Vec<_>>()
        .join(" ");
    let clean = regex_lite_strip(&clean);
    Ok(clean)
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

pub fn on_shortcut(app: &AppHandle, pressed: bool) {
    let voice = app.state::<Arc<Voice>>().inner().clone();
    let enabled = voice.config.lock().unwrap().enabled;
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
    } else {
        let Some(t0) = voice.pressed_at.lock().unwrap().take() else { return };
        let held = t0.elapsed();
        if !enabled || held < Duration::from_millis(350) {
            // Toque corto: abre el notch para escribir
            if enabled {
                cancel(app);
            }
            let _ = app.emit("voice-tap", ());
        } else if enabled {
            stop(app);
        }
    }
}
