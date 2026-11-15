use portable_pty::{CommandBuilder, NativePtySystem, PtySize, PtySystem};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::path::Path;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{LazyLock, Mutex};
use tauri::{AppHandle, Emitter};

struct Session {
    writer: Box<dyn Write + Send>,
    master: Box<dyn portable_pty::MasterPty + Send>,
    child: Box<dyn portable_pty::Child + Send + Sync>,
}

static NEXT_ID: AtomicU64 = AtomicU64::new(1);
static SESSIONS: LazyLock<Mutex<HashMap<u64, Session>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));

#[derive(Clone, serde::Serialize)]
struct PtyOutput {
    id: u64,
    data: String,
}

#[derive(Clone, serde::Serialize)]
struct PtyExit {
    id: u64,
}

pub fn open(app: AppHandle, path: &str) -> Result<u64, String> {
    let cwd = Path::new(path.trim());
    if !cwd.is_dir() {
        return Err(format!("La carpeta no existe: {}", cwd.display()));
    }
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let pty_system = NativePtySystem::default();
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| err.to_string())?;
    let mut command = CommandBuilder::new(shell);
    command.cwd(cwd);
    let child = pair
        .slave
        .spawn_command(command)
        .map_err(|err| err.to_string())?;
    let reader = pair
        .master
        .try_clone_reader()
        .map_err(|err| err.to_string())?;
    let writer = pair.master.take_writer().map_err(|err| err.to_string())?;
    let id = NEXT_ID.fetch_add(1, Ordering::Relaxed);
    SESSIONS.lock().map_err(|err| err.to_string())?.insert(
        id,
        Session {
            writer,
            master: pair.master,
            child,
        },
    );
    std::thread::spawn(move || read_output(app, id, reader));
    Ok(id)
}

pub fn write(id: u64, data: &str) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|err| err.to_string())?;
    let session = sessions
        .get_mut(&id)
        .ok_or_else(|| "La terminal ya se cerró".to_string())?;
    session
        .writer
        .write_all(data.as_bytes())
        .map_err(|err| err.to_string())?;
    session.writer.flush().map_err(|err| err.to_string())
}

pub fn resize(id: u64, rows: u16, cols: u16) -> Result<(), String> {
    let sessions = SESSIONS.lock().map_err(|err| err.to_string())?;
    let session = sessions
        .get(&id)
        .ok_or_else(|| "La terminal ya se cerró".to_string())?;
    session
        .master
        .resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|err| err.to_string())
}

pub fn close(id: u64) -> Result<(), String> {
    let mut sessions = SESSIONS.lock().map_err(|err| err.to_string())?;
    if let Some(mut session) = sessions.remove(&id) {
        let _ = session.child.kill();
    }
    Ok(())
}

fn read_output(app: AppHandle, id: u64, mut reader: Box<dyn Read + Send>) {
    let mut buffer = [0u8; 4096];
    loop {
        match reader.read(&mut buffer) {
            Ok(0) | Err(_) => break,
            Ok(count) => {
                let data = String::from_utf8_lossy(&buffer[..count]).into_owned();
                let _ = app.emit("pty-output", PtyOutput { id, data });
            }
        }
    }
    let _ = app.emit("pty-exit", PtyExit { id });
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn echo_reaches_the_pty() {
        let pty_system = NativePtySystem::default();
        let pair = pty_system
            .openpty(PtySize {
                rows: 24,
                cols: 80,
                pixel_width: 0,
                pixel_height: 0,
            })
            .expect("pty");
        let mut command = CommandBuilder::new("/bin/echo");
        command.arg("hydra");
        let mut child = pair.slave.spawn_command(command).expect("echo");
        let mut reader = pair.master.try_clone_reader().expect("reader");
        let mut text = String::new();
        let mut buffer = [0u8; 64];
        let start = Instant::now();
        while !text.contains("hydra") && start.elapsed() < Duration::from_secs(2) {
            match reader.read(&mut buffer) {
                Ok(0) => break,
                Ok(count) => text.push_str(&String::from_utf8_lossy(&buffer[..count])),
                Err(_) => break,
            }
        }
        let _ = child.wait();
        assert!(text.contains("hydra"), "{text}");
    }
}
