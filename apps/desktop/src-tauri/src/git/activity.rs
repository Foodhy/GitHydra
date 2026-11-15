use std::cell::RefCell;
use std::sync::atomic::{AtomicBool, Ordering};
use std::time::{Duration, Instant};
use tauri::{AppHandle, Emitter};

pub const EVENT: &str = "git-progress";

thread_local! {
    static CURRENT: RefCell<Option<Session>> = const { RefCell::new(None) };
}

struct Session {
    app: AppHandle,
    last: Instant,
}

static CANCEL: AtomicBool = AtomicBool::new(false);

pub struct Guard;

impl Drop for Guard {
    fn drop(&mut self) {
        CURRENT.with(|slot| *slot.borrow_mut() = None);
        CANCEL.store(false, Ordering::Relaxed);
    }
}

pub fn begin(app: AppHandle) -> Guard {
    CANCEL.store(false, Ordering::Relaxed);
    CURRENT.with(|slot| {
        *slot.borrow_mut() = Some(Session {
            app,
            last: Instant::now() - Duration::from_secs(1),
        });
    });
    Guard
}

pub fn cancel() {
    CANCEL.store(true, Ordering::Relaxed);
}

pub fn cancelled() -> bool {
    CANCEL.load(Ordering::Relaxed)
}

pub fn report(message: &str) {
    let message = message.trim();
    if message.is_empty() || cancelled() {
        return;
    }
    CURRENT.with(|slot| {
        let mut session = slot.borrow_mut();
        let Some(session) = session.as_mut() else {
            return;
        };
        if session.last.elapsed() < Duration::from_millis(125) {
            return;
        }
        session.last = Instant::now();
        let _ = session.app.emit(EVENT, message.to_string());
    });
}
