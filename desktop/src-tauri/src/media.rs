//! Música del sistema vía Windows "Global System Media Transport Controls"
//! (lo mismo que usa el panel de volumen de Windows): Spotify, Apple Music,
//! navegadores con YouTube, etc.

use serde::Serialize;
use tauri::AppHandle;

#[derive(Serialize, Clone, PartialEq, Default, Debug)]
pub struct MediaState {
    pub has_session: bool,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub app: String,
    pub playing: bool,
    pub position_ms: u64,
    pub duration_ms: u64,
}

#[cfg(windows)]
mod imp {
    use super::MediaState;
    use base64::Engine;
    use std::time::{Duration, SystemTime, UNIX_EPOCH};
    use tauri::{AppHandle, Emitter};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session,
        GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::core::Interface;
    use windows::Storage::Streams::DataReader;
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};

    fn com_init() {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
        }
    }

    fn now_ticks() -> i64 {
        // 100 ns desde 1601-01-01 (FILETIME)
        let d = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default();
        (d.as_nanos() / 100) as i64 + 116_444_736_000_000_000
    }

    fn session() -> windows::core::Result<Session> {
        Manager::RequestAsync()?.get()?.GetCurrentSession()
    }

    fn read(s: &Session) -> windows::core::Result<MediaState> {
        let props = s.TryGetMediaPropertiesAsync()?.get()?;
        let info = s.GetPlaybackInfo()?;
        let playing = info.PlaybackStatus()? == Status::Playing;
        let tl = s.GetTimelineProperties()?;
        let mut pos = tl.Position()?.Duration;
        let end = tl.EndTime()?.Duration;
        if playing {
            let updated = tl.LastUpdatedTime()?.UniversalTime;
            if updated > 0 {
                pos += (now_ticks() - updated).max(0);
            }
        }
        if end > 0 {
            pos = pos.min(end);
        }
        Ok(MediaState {
            has_session: true,
            title: props.Title()?.to_string(),
            artist: props.Artist()?.to_string(),
            album: props.AlbumTitle()?.to_string(),
            app: s.SourceAppUserModelId()?.to_string(),
            playing,
            position_ms: (pos.max(0) / 10_000) as u64,
            duration_ms: (end.max(0) / 10_000) as u64,
        })
    }

    fn read_art(s: &Session) -> windows::core::Result<Option<String>> {
        let props = s.TryGetMediaPropertiesAsync()?.get()?;
        let Ok(thumb) = props.Thumbnail() else { return Ok(None) };
        let stream = thumb.OpenReadAsync()?.get()?;
        let size = stream.Size()? as u32;
        if size == 0 || size > 8_000_000 {
            return Ok(None);
        }
        let reader = DataReader::CreateDataReader(&stream.GetInputStreamAt(0)?)?;
        let op: windows::Foundation::IAsyncOperation<u32> = reader.LoadAsync(size)?.cast()?;
        op.get()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf)?;
        let mime = if buf.starts_with(&[0x89, b'P', b'N', b'G']) { "image/png" } else { "image/jpeg" };
        Ok(Some(format!(
            "data:{mime};base64,{}",
            base64::engine::general_purpose::STANDARD.encode(&buf)
        )))
    }

    pub fn spawn_watch(app: AppHandle) {
        std::thread::spawn(move || {
            com_init();
            let mut last = MediaState::default();
            let mut last_track = String::new();
            let mut tick: u32 = 0;
            loop {
                let state = session().and_then(|s| {
                    let st = read(&s)?;
                    let key = format!("{}|{}|{}", st.title, st.artist, st.album);
                    if key != last_track {
                        // El arte a veces llega tarde: reintenta en el siguiente ciclo si falla
                        if let Ok(art) = read_art(&s) {
                            last_track = key;
                            let _ = app.emit("media-art", art);
                        }
                    }
                    Ok(st)
                }).unwrap_or_default();

                // Emite si cambió algo relevante o cada 5 s para corregir la posición
                let changed = state.title != last.title || state.playing != last.playing
                    || state.has_session != last.has_session || state.duration_ms != last.duration_ms
                    || state.position_ms.abs_diff(last.position_ms) > 2500;
                if changed || tick % 5 == 0 {
                    let _ = app.emit("media", &state);
                }
                if !state.has_session {
                    last_track.clear();
                }
                last = state;
                tick = tick.wrapping_add(1);
                std::thread::sleep(Duration::from_millis(1000));
            }
        });
    }

    pub fn control(action: &str, position_ms: Option<u64>) -> windows::core::Result<()> {
        com_init();
        let s = session()?;
        match action {
            "toggle" => { s.TryTogglePlayPauseAsync()?.get()?; }
            "play" => { s.TryPlayAsync()?.get()?; }
            "pause" => { s.TryPauseAsync()?.get()?; }
            "next" => { s.TrySkipNextAsync()?.get()?; }
            "prev" => { s.TrySkipPreviousAsync()?.get()?; }
            "seek" => {
                let ms = position_ms.unwrap_or(0) as i64;
                s.TryChangePlaybackPositionAsync(ms * 10_000)?.get()?;
            }
            _ => {}
        }
        Ok(())
    }
}

#[cfg(windows)]
pub fn spawn_watch(app: AppHandle) {
    imp::spawn_watch(app)
}

#[cfg(windows)]
pub fn control(action: &str, position_ms: Option<u64>) -> Result<(), String> {
    imp::control(action, position_ms).map_err(|e| e.to_string())
}

#[cfg(not(windows))]
pub fn spawn_watch(_app: AppHandle) {}

#[cfg(not(windows))]
pub fn control(_action: &str, _position_ms: Option<u64>) -> Result<(), String> {
    Ok(())
}
