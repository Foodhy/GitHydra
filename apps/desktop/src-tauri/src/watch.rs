use crate::git::{WatchRoot, ignored_git_event};
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher};
use std::sync::Mutex;
use std::sync::atomic::{AtomicBool, Ordering};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

struct ActiveWatch {
    _watcher: RecommendedWatcher,
    stop: std::sync::Arc<AtomicBool>,
}

static ACTIVE: Mutex<Option<ActiveWatch>> = Mutex::new(None);

pub fn start(app: AppHandle, roots: Vec<WatchRoot>) -> Result<(), String> {
    let pending = std::sync::Arc::new(AtomicBool::new(false));
    let pending_events = pending.clone();
    let mut watcher = notify::recommended_watcher(move |result: Result<Event, notify::Error>| {
        let Ok(event) = result else {
            return;
        };
        if event.paths.is_empty() || event.paths.iter().any(|path| !ignored_git_event(path)) {
            pending_events.store(true, Ordering::Relaxed);
        }
    })
    .map_err(|err| err.to_string())?;

    for root in roots {
        if !root.path.exists() {
            continue;
        }
        let mode = if root.recursive {
            RecursiveMode::Recursive
        } else {
            RecursiveMode::NonRecursive
        };
        watcher
            .watch(&root.path, mode)
            .map_err(|err| err.to_string())?;
    }

    let stop = std::sync::Arc::new(AtomicBool::new(false));
    let stop_thread = stop.clone();
    thread::spawn(move || {
        while !stop_thread.load(Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(300));
            if pending.swap(false, Ordering::Relaxed) {
                let _ = app.emit("repo-changed", ());
            }
        }
    });

    let mut slot = ACTIVE.lock().map_err(|err| err.to_string())?;
    if let Some(previous) = slot.take() {
        previous.stop.store(true, Ordering::Relaxed);
    }
    *slot = Some(ActiveWatch {
        _watcher: watcher,
        stop,
    });
    Ok(())
}
