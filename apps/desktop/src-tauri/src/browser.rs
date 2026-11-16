use std::sync::Mutex;

use tauri::webview::{NewWindowResponse, PageLoadEvent, Url};
use tauri::{
    AppHandle, Emitter, LogicalPosition, LogicalSize, Manager, Webview, WebviewBuilder, WebviewUrl,
    Window,
};

const WINDOW: &str = "main";
const NAVIGATED: &str = "browser-navigated";
const TITLED: &str = "browser-title";

static GATE: Mutex<()> = Mutex::new(());

struct Bounds {
    x: f64,
    y: f64,
    width: f64,
    height: f64,
}

#[derive(Clone, serde::Serialize)]
struct BrowserLocation {
    id: String,
    url: String,
}

#[derive(Clone, serde::Serialize)]
struct BrowserTitle {
    id: String,
    title: String,
}

fn parse_http(raw: &str) -> Result<Url, String> {
    let url = Url::parse(raw).map_err(|_| "La URL no es válida".to_string())?;
    if url.scheme() == "http" || url.scheme() == "https" {
        Ok(url)
    } else {
        Err("Solo se abren direcciones http y https".into())
    }
}

fn page_id(id: &str) -> Result<String, String> {
    let id = id.trim();
    if (1..=16).contains(&id.len()) && id.chars().all(|char| char.is_ascii_alphanumeric()) {
        Ok(id.to_string())
    } else {
        Err("La página no es válida".into())
    }
}

fn label_for(id: &str) -> String {
    format!("browser-{id}")
}

fn gate() -> Result<std::sync::MutexGuard<'static, ()>, String> {
    GATE.lock().map_err(|_| "El visor está ocupado".to_string())
}

fn webview(app: &AppHandle, id: &str) -> Option<Webview> {
    app.get_webview(&label_for(id))
}

fn place(view: &Webview, bounds: &Bounds) -> Result<(), String> {
    view.set_position(LogicalPosition::new(bounds.x, bounds.y))
        .map_err(|err| err.to_string())?;
    view.set_size(LogicalSize::new(bounds.width, bounds.height))
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn data_dir(app: &AppHandle, id: &str) -> Result<std::path::PathBuf, String> {
    let root = app.path().app_data_dir().map_err(|err| err.to_string())?;
    let dir = root.join("browser").join(id);
    std::fs::create_dir_all(&dir).map_err(|err| err.to_string())?;
    Ok(dir)
}

fn title_script(id: &str) -> String {
    format!(
        r#"(() => {{
  const send = () => {{
    const title = (document.title || "").replace(/\s+/g, " ").trim();
    const internals = window.__TAURI_INTERNALS__;
    if (!internals || !title) return;
    internals.invoke("browser_report_title", {{ id: "{id}", title }});
  }};
  const watch = () => {{
    send();
    const node = document.querySelector("title");
    if (!node) return;
    new MutationObserver(send).observe(node, {{ childList: true, characterData: true, subtree: true }});
  }};
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", watch);
  else watch();
}})()"#
    )
}

fn is_browser_label(label: &str) -> bool {
    label == "browser" || label.starts_with("browser-")
}

fn parent_window(app: &AppHandle, caller: &Window) -> Result<Window, String> {
    if !is_browser_label(caller.label()) {
        return Ok(caller.clone());
    }
    if let Some(window) = app.get_webview_window(WINDOW) {
        return Ok(window.as_ref().window());
    }
    app.webviews()
        .into_iter()
        .find(|(label, _)| !is_browser_label(label))
        .map(|(_, view)| view.window())
        .ok_or_else(|| "No está la ventana principal".to_string())
}

fn open(
    app: &AppHandle,
    window: &Window,
    id: &str,
    url: Url,
    bounds: &Bounds,
) -> Result<(), String> {
    let window = parent_window(app, window)?;
    let directory = data_dir(app, id)?;
    let handle = app.clone();
    let page = id.to_string();
    let report_id = page.clone();
    let label = label_for(id);
    let window_label = label.clone();
    let builder = WebviewBuilder::new(&label, WebviewUrl::External(url))
        .accept_first_mouse(true)
        .focused(true)
        .data_directory(directory)
        .initialization_script(title_script(id))
        .background_throttling(tauri::utils::config::BackgroundThrottlingPolicy::Disabled)
        .on_navigation(|next| next.scheme() == "http" || next.scheme() == "https")
        .on_page_load(move |view, payload| {
            if payload.event() != PageLoadEvent::Finished {
                return;
            }
            let _ = view.emit(
                NAVIGATED,
                BrowserLocation {
                    id: page.clone(),
                    url: payload.url().to_string(),
                },
            );
            let _ = view.eval(format!(
                r#"(() => {{ const internals = window.__TAURI_INTERNALS__; if (internals) internals.invoke("browser_report_title", {{ id: "{report_id}", title: (document.title || "").trim() }}); }})()"#
            ));
        })
        .on_new_window(move |next, _features| {
            if (next.scheme() == "http" || next.scheme() == "https")
                && let Some(view) = handle.get_webview(&window_label)
            {
                let _ = view.navigate(next);
            }
            NewWindowResponse::Deny
        });
    let view = window
        .add_child(
            builder,
            LogicalPosition::new(bounds.x, bounds.y),
            LogicalSize::new(bounds.width, bounds.height),
        )
        .map_err(|err| err.to_string())?;
    view.show().map_err(|err| err.to_string())?;
    Ok(())
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn browser_navigate(
    window: Window,
    app: AppHandle,
    id: String,
    url: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let id = page_id(&id)?;
    let target = parse_http(&url)?;
    let bounds = Bounds {
        x,
        y,
        width,
        height,
    };
    if bounds.width <= 0.0 || bounds.height <= 0.0 {
        return Err("El visor todavía no tiene tamaño".into());
    }
    let _guard = gate()?;
    if let Some(view) = webview(&app, &id) {
        place(&view, &bounds)?;
        view.navigate(target).map_err(|err| err.to_string())?;
        view.show().map_err(|err| err.to_string())?;
        let _ = view.set_focus();
        return Ok(());
    }
    open(&app, &window, &id, target, &bounds)
}

#[tauri::command]
pub fn browser_set_bounds(
    app: AppHandle,
    id: String,
    x: f64,
    y: f64,
    width: f64,
    height: f64,
) -> Result<(), String> {
    let id = page_id(&id)?;
    let bounds = Bounds {
        x,
        y,
        width,
        height,
    };
    if bounds.width <= 0.0 || bounds.height <= 0.0 {
        return Ok(());
    }
    let _guard = gate()?;
    let Some(view) = webview(&app, &id) else {
        return Ok(());
    };
    place(&view, &bounds)
}

#[tauri::command]
pub fn browser_set_visible(app: AppHandle, id: String, visible: bool) -> Result<(), String> {
    let id = page_id(&id)?;
    let _guard = gate()?;
    let Some(view) = webview(&app, &id) else {
        return Ok(());
    };
    if visible {
        view.show().map_err(|err| err.to_string())
    } else {
        view.hide().map_err(|err| err.to_string())
    }
}

#[tauri::command]
pub fn browser_back(app: AppHandle, id: String) -> Result<(), String> {
    eval(&app, &page_id(&id)?, "history.back()")
}

#[tauri::command]
pub fn browser_forward(app: AppHandle, id: String) -> Result<(), String> {
    eval(&app, &page_id(&id)?, "history.forward()")
}

#[tauri::command]
pub fn browser_reload(app: AppHandle, id: String) -> Result<(), String> {
    eval(&app, &page_id(&id)?, "location.reload()")
}

#[tauri::command]
pub fn browser_close(app: AppHandle, id: String) -> Result<(), String> {
    let id = page_id(&id)?;
    let _guard = gate()?;
    let Some(view) = webview(&app, &id) else {
        return Ok(());
    };
    view.close().map_err(|err| err.to_string())
}

#[tauri::command]
pub fn browser_close_all(app: AppHandle) -> Result<(), String> {
    let _guard = gate()?;
    let labels: Vec<String> = app
        .webviews()
        .keys()
        .filter(|label| *label == "browser" || label.starts_with("browser-"))
        .cloned()
        .collect();
    for label in labels {
        if let Some(view) = app.get_webview(&label) {
            view.close().map_err(|err| err.to_string())?;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn browser_report_title(app: AppHandle, id: String, title: String) -> Result<(), String> {
    let id = page_id(&id)?;
    let title = title.split_whitespace().collect::<Vec<_>>().join(" ");
    if title.is_empty() {
        return Ok(());
    }
    app.emit(TITLED, BrowserTitle { id, title })
        .map_err(|err| err.to_string())
}

fn eval(app: &AppHandle, id: &str, script: &str) -> Result<(), String> {
    let _guard = gate()?;
    let Some(view) = webview(app, id) else {
        return Ok(());
    };
    view.eval(script).map_err(|err| err.to_string())
}

#[cfg(test)]
mod tests {
    use super::{page_id, parse_http};

    #[test]
    fn only_http_and_https() {
        assert!(parse_http("").is_err());
        assert!(parse_http("javascript:alert(1)").is_err());
        assert!(parse_http("file:///tmp").is_err());
        assert!(parse_http("https://example.com").is_ok());
        assert!(parse_http("http://localhost:3000").is_ok());
    }

    #[test]
    fn page_ids_stay_inside_the_data_folder() {
        assert!(page_id("1").is_ok());
        assert!(page_id("page12").is_ok());
        assert!(page_id("").is_err());
        assert!(page_id("../secret").is_err());
        assert!(page_id("a/b").is_err());
    }
}
