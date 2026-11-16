use std::io::Cursor;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Mutex, OnceLock, PoisonError};
use std::thread;
use std::time::Duration;

use tauri::AppHandle;

const ICON: &[u8] = include_bytes!("../icons/icon.png");
const FRAME_COUNT: usize = 8;
const SWEEP: f32 = std::f32::consts::FRAC_PI_2 * 1.15;

struct Activity {
    kind: Option<String>,
    generation: u64,
    spinning: bool,
}

static ACTIVITY: Mutex<Activity> = Mutex::new(Activity {
    kind: None,
    generation: 0,
    spinning: false,
});
static FRAME_QUEUED: AtomicBool = AtomicBool::new(false);

fn lock() -> std::sync::MutexGuard<'static, Activity> {
    ACTIVITY.lock().unwrap_or_else(PoisonError::into_inner)
}

pub fn dock_badge(kind: &str) -> &'static str {
    match kind {
        "checkout" => "→",
        "pull" | "fetch" | "clone" => "↓",
        "push" => "↑",
        _ => "…",
    }
}

fn ring(width: u32) -> (f32, f32) {
    (width as f32 * 0.46, (width as f32 * 0.035).max(2.0))
}

pub fn arc_covers(width: u32, height: u32, x: u32, y: u32, frame: usize) -> bool {
    let (radius, thickness) = ring(width);
    let dx = x as f32 - (width as f32 - 1.0) / 2.0;
    let dy = y as f32 - (height as f32 - 1.0) / 2.0;
    let distance = (dx * dx + dy * dy).sqrt();
    if (distance - radius).abs() > thickness / 2.0 {
        return false;
    }
    let mut angle = dy.atan2(dx);
    if angle < 0.0 {
        angle += std::f32::consts::TAU;
    }
    let start = frame as f32 * std::f32::consts::TAU / FRAME_COUNT as f32;
    let mut delta = angle - start;
    if delta < 0.0 {
        delta += std::f32::consts::TAU;
    }
    delta <= SWEEP
}

const DOCK_SIZE: u32 = 128;

fn dock_pixels(pixels: &[u8], width: u32, height: u32, frame: usize) -> Vec<u8> {
    let mut painted = vec![0; (DOCK_SIZE * DOCK_SIZE * 4) as usize];
    for y in 0..DOCK_SIZE {
        for x in 0..DOCK_SIZE {
            let source_x = (u64::from(x) * u64::from(width) / u64::from(DOCK_SIZE)) as u32;
            let source_y = (u64::from(y) * u64::from(height) / u64::from(DOCK_SIZE)) as u32;
            let source = ((source_y * width + source_x) * 4) as usize;
            let index = ((y * DOCK_SIZE + x) * 4) as usize;
            painted[index..index + 4].copy_from_slice(&pixels[source..source + 4]);
            if arc_covers(DOCK_SIZE, DOCK_SIZE, x, y, frame) {
                painted[index] = 0x3e;
                painted[index + 1] = 0xe0;
                painted[index + 2] = 0xb0;
                painted[index + 3] = 255;
            }
        }
    }
    painted
}

fn decode_rgba(bytes: &[u8]) -> Result<(u32, u32, Vec<u8>), String> {
    let mut decoder = png::Decoder::new(Cursor::new(bytes));
    decoder.set_transformations(png::Transformations::EXPAND);
    let mut reader = decoder.read_info().map_err(|err| err.to_string())?;
    let size = reader
        .output_buffer_size()
        .ok_or_else(|| "el png no cabe en memoria".to_string())?;
    let mut buffer = vec![0; size];
    let info = reader
        .next_frame(&mut buffer)
        .map_err(|err| err.to_string())?;
    buffer.truncate(info.buffer_size());
    let pixels = match info.color_type {
        png::ColorType::Rgba => buffer,
        png::ColorType::Rgb => {
            let mut rgba = Vec::with_capacity(buffer.len() / 3 * 4);
            for chunk in buffer.as_chunks::<3>().0 {
                rgba.extend_from_slice(&[chunk[0], chunk[1], chunk[2], 255]);
            }
            rgba
        }
        other => return Err(format!("color de icono no soportado: {other:?}")),
    };
    let expected = (info.width as usize)
        .saturating_mul(info.height as usize)
        .saturating_mul(4);
    if pixels.len() != expected {
        return Err(format!(
            "el icono no quedó en RGBA compacto ({} != {expected})",
            pixels.len()
        ));
    }
    Ok((info.width, info.height, pixels))
}

fn encode_rgba(width: u32, height: u32, pixels: &[u8]) -> Result<Vec<u8>, String> {
    let mut encoded = Vec::new();
    let mut encoder = png::Encoder::new(&mut encoded, width, height);
    encoder.set_color(png::ColorType::Rgba);
    encoder.set_depth(png::BitDepth::Eight);
    let mut writer = encoder.write_header().map_err(|err| err.to_string())?;
    writer
        .write_image_data(pixels)
        .map_err(|err| err.to_string())?;
    drop(writer);
    Ok(encoded)
}

fn activity_frames() -> &'static [Vec<u8>] {
    static FRAMES: OnceLock<Vec<Vec<u8>>> = OnceLock::new();
    FRAMES.get_or_init(|| {
        let (width, height, pixels) = decode_rgba(ICON).expect("icono de la app");
        (0..FRAME_COUNT)
            .map(|frame| {
                let painted = dock_pixels(&pixels, width, height, frame);
                encode_rgba(DOCK_SIZE, DOCK_SIZE, &painted).expect("fotograma del dock")
            })
            .collect()
    })
}

#[cfg(target_os = "macos")]
pub fn set_activity(app: AppHandle, kind: Option<String>) {
    let start = {
        let mut activity = lock();
        activity.generation = activity.generation.wrapping_add(1);
        activity.kind = kind;
        let start = activity.kind.is_some() && !activity.spinning;
        if start {
            activity.spinning = true;
        }
        start
    };
    if start {
        thread::spawn(move || spin(app));
    }
}

#[cfg(not(target_os = "macos"))]
pub fn set_activity(_app: AppHandle, _kind: Option<String>) {}

#[cfg(target_os = "macos")]
fn spin(app: AppHandle) {
    let mut index = 0usize;
    loop {
        let (kind, generation) = {
            let activity = lock();
            (activity.kind.clone(), activity.generation)
        };
        let Some(kind) = kind else {
            let clear_app = app.clone();
            if clear_app
                .run_on_main_thread(move || {
                    if lock().generation == generation {
                        clear_dock();
                    }
                })
                .is_err()
            {
                lock().spinning = false;
                break;
            }
            let mut activity = lock();
            if activity.kind.is_none() && activity.generation == generation {
                activity.spinning = false;
                break;
            }
            continue;
        };
        if FRAME_QUEUED.swap(true, Ordering::Relaxed) {
            thread::sleep(Duration::from_millis(100));
            continue;
        }
        let frame = activity_frames()[index].clone();
        index = (index + 1) % FRAME_COUNT;
        let badge = dock_badge(&kind).to_string();
        if app
            .run_on_main_thread(move || {
                if lock().generation == generation {
                    show_frame(&frame, &badge);
                }
                FRAME_QUEUED.store(false, Ordering::Relaxed);
            })
            .is_err()
        {
            FRAME_QUEUED.store(false, Ordering::Relaxed);
            lock().spinning = false;
            break;
        }
        thread::sleep(Duration::from_millis(100));
    }
}

#[cfg(target_os = "macos")]
fn show_frame(bytes: &[u8], badge: &str) {
    use objc2::AllocAnyThread;
    use objc2::MainThreadMarker;
    use objc2_app_kit::{NSApplication, NSImage};
    use objc2_foundation::{NSData, NSString};

    let Some(marker) = MainThreadMarker::new() else {
        return;
    };
    let data = unsafe { NSData::dataWithBytes_length(bytes.as_ptr().cast(), bytes.len()) };
    let Some(image) = NSImage::initWithData(NSImage::alloc(), &data) else {
        return;
    };
    let application = NSApplication::sharedApplication(marker);
    unsafe {
        application.setApplicationIconImage(Some(&image));
    }
    let label = NSString::from_str(badge);
    application.dockTile().setBadgeLabel(Some(&label));
}

#[cfg(target_os = "macos")]
fn clear_dock() {
    use objc2::MainThreadMarker;
    use objc2_app_kit::NSApplication;

    let Some(marker) = MainThreadMarker::new() else {
        return;
    };
    let application = NSApplication::sharedApplication(marker);
    unsafe {
        application.setApplicationIconImage(None);
    }
    application.dockTile().setBadgeLabel(None);
}

#[cfg(test)]
mod tests {
    use super::{FRAME_COUNT, activity_frames, arc_covers, decode_rgba, dock_badge};

    #[test]
    fn badge_marks_the_operation() {
        assert_eq!(dock_badge("checkout"), "→");
        assert_eq!(dock_badge("pull"), "↓");
        assert_eq!(dock_badge("fetch"), "↓");
        assert_eq!(dock_badge("push"), "↑");
        assert_eq!(dock_badge("other"), "…");
    }

    #[test]
    fn arc_moves_between_frames() {
        let width = 200;
        let (radius, _) = super::ring(width);
        let center = (width as f32 - 1.0) / 2.0;
        let x = (center + radius).round() as u32;
        let y = center.round() as u32;
        assert!(arc_covers(width, width, x, y, 0));
        assert!(!arc_covers(width, width, x, y, 4));
        assert!(!arc_covers(width, width, width / 2, width / 2, 0));
    }

    #[test]
    fn frames_are_distinct_pngs() {
        let frames = activity_frames();
        assert_eq!(frames.len(), FRAME_COUNT);
        let first = decode_rgba(&frames[0]).expect("frame 0");
        let later = decode_rgba(&frames[2]).expect("frame 2");
        assert_ne!(first.2, later.2);
    }
}
