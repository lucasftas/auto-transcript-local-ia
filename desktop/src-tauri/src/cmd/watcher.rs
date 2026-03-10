use eyre::Result;
use notify::{EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::path::Path;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc,
};
use std::time::Duration;
use tauri::{AppHandle, Emitter, State};
use tokio::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoDetectedPayload {
    pub watch_id: String,
    pub path: String,
    pub size: u64,
}

const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "m4v"];

pub struct WatcherHandle {
    pub stopped: Arc<AtomicBool>,
    pub paused: Arc<AtomicBool>,
}

pub struct WatcherRegistry {
    pub handles: HashMap<String, WatcherHandle>,
}

impl WatcherRegistry {
    pub fn new() -> Self {
        Self {
            handles: HashMap::new(),
        }
    }
}

async fn wait_file_stable(path: &Path) {
    let mut last_size = 0u64;
    let mut stable_count = 0u32;
    loop {
        let size = std::fs::metadata(path).map(|m| m.len()).unwrap_or(0);
        if size > 0 && size == last_size {
            stable_count += 1;
            if stable_count >= 3 {
                break;
            }
        } else {
            stable_count = 0;
        }
        last_size = size;
        tokio::time::sleep(Duration::from_millis(500)).await;
    }
}

#[tauri::command]
pub async fn start_watch_folder(
    app_handle: AppHandle,
    watch_id: String,
    folder: String,
    registry: State<'_, Mutex<WatcherRegistry>>,
) -> Result<(), String> {
    let stopped = Arc::new(AtomicBool::new(false));
    let paused = Arc::new(AtomicBool::new(false));

    let stopped_thread = stopped.clone();
    let paused_thread = paused.clone();
    let watch_id_inner = watch_id.clone();

    // Channel to bridge std thread → tokio task
    let (file_tx, mut file_rx) = tokio::sync::mpsc::channel::<String>(256);

    // Blocking std thread: runs the notify watcher
    let folder_clone = folder.clone();
    std::thread::spawn(move || {
        let (notify_tx, notify_rx) = std::sync::mpsc::channel();

        let mut watcher = match notify::recommended_watcher(notify_tx) {
            Ok(w) => w,
            Err(e) => {
                tracing::error!("Failed to create file watcher: {}", e);
                return;
            }
        };

        if let Err(e) = watcher.watch(Path::new(&folder_clone), RecursiveMode::Recursive) {
            tracing::error!("Failed to watch folder '{}': {}", folder_clone, e);
            return;
        }

        tracing::info!("Watching folder: {}", folder_clone);

        let mut seen: HashSet<String> = HashSet::new();

        while !stopped_thread.load(Ordering::Relaxed) {
            match notify_rx.recv_timeout(Duration::from_millis(300)) {
                Ok(Ok(event)) => {
                    if paused_thread.load(Ordering::Relaxed) {
                        continue;
                    }
                    match event.kind {
                        EventKind::Create(_)
                        | EventKind::Modify(notify::event::ModifyKind::Data(_)) => {
                            for path in event.paths {
                                let is_video = path
                                    .extension()
                                    .map(|e| {
                                        let ext = e.to_ascii_lowercase();
                                        VIDEO_EXTENSIONS.iter().any(|v| ext == *v)
                                    })
                                    .unwrap_or(false);
                                if is_video {
                                    let path_str = path.to_string_lossy().to_string();
                                    if !seen.contains(&path_str) {
                                        seen.insert(path_str.clone());
                                        let _ = file_tx.blocking_send(path_str);
                                    }
                                }
                            }
                        }
                        _ => {}
                    }
                }
                Err(std::sync::mpsc::RecvTimeoutError::Timeout) => {}
                Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => break,
                Ok(Err(e)) => tracing::warn!("Watcher error: {}", e),
            }
        }

        tracing::info!("Stopped watching folder: {}", folder_clone);
    });

    // Tokio task: wait for file stability, then emit event
    let stopped_tokio = stopped.clone();
    tokio::spawn(async move {
        while let Some(path) = file_rx.recv().await {
            if stopped_tokio.load(Ordering::Relaxed) {
                break;
            }
            wait_file_stable(Path::new(&path)).await;
            let file_size = std::fs::metadata(Path::new(&path)).map(|m| m.len()).unwrap_or(0);
            tracing::info!("Video detected: {} ({}B)", path, file_size);
            let _ = app_handle.emit(
                "video_detected",
                VideoDetectedPayload {
                    watch_id: watch_id_inner.clone(),
                    path,
                    size: file_size,
                },
            );
        }
    });

    let mut reg = registry.lock().await;
    // Stop any existing watcher for this id before replacing
    if let Some(existing) = reg.handles.get(&watch_id) {
        existing.stopped.store(true, Ordering::Relaxed);
    }
    reg.handles.insert(watch_id, WatcherHandle { stopped, paused });

    Ok(())
}

#[tauri::command]
pub async fn stop_watch_folder(
    watch_id: String,
    registry: State<'_, Mutex<WatcherRegistry>>,
) -> Result<(), String> {
    let mut reg = registry.lock().await;
    if let Some(handle) = reg.handles.remove(&watch_id) {
        handle.stopped.store(true, Ordering::Relaxed);
        tracing::info!("Stopped watcher: {}", watch_id);
    }
    Ok(())
}

#[tauri::command]
pub async fn pause_watch_folder(
    watch_id: String,
    registry: State<'_, Mutex<WatcherRegistry>>,
) -> Result<(), String> {
    let reg = registry.lock().await;
    if let Some(handle) = reg.handles.get(&watch_id) {
        handle.paused.store(true, Ordering::Relaxed);
        tracing::info!("Paused watcher: {}", watch_id);
    }
    Ok(())
}

#[tauri::command]
pub async fn resume_watch_folder(
    watch_id: String,
    registry: State<'_, Mutex<WatcherRegistry>>,
) -> Result<(), String> {
    let reg = registry.lock().await;
    if let Some(handle) = reg.handles.get(&watch_id) {
        handle.paused.store(false, Ordering::Relaxed);
        tracing::info!("Resumed watcher: {}", watch_id);
    }
    Ok(())
}

#[tauri::command]
pub async fn scan_folder_videos(folder: String) -> Result<Vec<String>, String> {
    let base = folder.trim_end_matches('/').trim_end_matches('\\');
    let mut files: Vec<String> = Vec::new();
    for ext in VIDEO_EXTENSIONS {
        let pattern = format!("{}/**/*.{}", base, ext);
        if let Ok(paths) = glob::glob(&pattern) {
            for entry in paths.filter_map(|e| e.ok()) {
                files.push(entry.to_string_lossy().to_string());
            }
        }
    }
    Ok(files)
}
