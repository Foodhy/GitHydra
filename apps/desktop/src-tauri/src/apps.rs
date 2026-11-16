use std::path::Path;

use serde::Serialize;

const EDITORS: &[&str] = &[
    "Cursor",
    "Visual Studio Code",
    "VSCodium",
    "Zed",
    "Sublime Text",
    "Nova",
    "Windsurf",
    "BBEdit",
    "CotEditor",
    "TextEdit",
    "Xcode",
];

const TERMINALS: &[&str] = &[
    "Terminal",
    "iTerm",
    "Warp",
    "Ghostty",
    "Alacritty",
    "kitty",
    "WezTerm",
    "Hyper",
    "Tabby",
];

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApp {
    pub name: String,
    pub path: String,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledApps {
    pub editors: Vec<InstalledApp>,
    pub terminals: Vec<InstalledApp>,
}

#[tauri::command]
pub fn installed_apps() -> InstalledApps {
    let mut roots = vec![
        Path::new("/Applications").to_path_buf(),
        Path::new("/System/Applications").to_path_buf(),
    ];
    if let Some(home) = std::env::var_os("HOME") {
        roots.push(Path::new(&home).join("Applications"));
    }
    let mut found = Vec::new();
    for root in &roots {
        scan(root, &mut found, 1);
    }
    InstalledApps {
        editors: pick(&found, EDITORS),
        terminals: pick(&found, TERMINALS),
    }
}

fn scan(dir: &Path, found: &mut Vec<(String, String)>, depth: u8) {
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        let Some(name) = path.file_name().and_then(|value| value.to_str()) else {
            continue;
        };
        if let Some(stem) = name.strip_suffix(".app") {
            if !stem.is_empty()
                && !found
                    .iter()
                    .any(|(seen, _)| seen.eq_ignore_ascii_case(stem))
            {
                found.push((stem.to_string(), path.display().to_string()));
            }
            continue;
        }
        if depth > 0 && !name.starts_with('.') && path.is_dir() {
            scan(&path, found, depth - 1);
        }
    }
}

fn pick(found: &[(String, String)], catalog: &[&str]) -> Vec<InstalledApp> {
    catalog
        .iter()
        .filter_map(|name| {
            found.iter().find_map(|(stem, path)| {
                stem.eq_ignore_ascii_case(name).then(|| InstalledApp {
                    name: (*name).to_string(),
                    path: path.clone(),
                })
            })
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::pick;

    #[test]
    fn keeps_catalog_order_and_skips_unknown() {
        let found = vec![
            ("Zed".into(), "/Applications/Zed.app".into()),
            ("cursor".into(), "/Applications/Cursor.app".into()),
            ("Notes".into(), "/System/Applications/Notes.app".into()),
        ];
        let editors = pick(&found, &["Cursor", "Zed", "Nova"]);
        assert_eq!(editors.len(), 2);
        assert_eq!(editors[0].name, "Cursor");
        assert_eq!(editors[0].path, "/Applications/Cursor.app");
        assert_eq!(editors[1].name, "Zed");
    }

    #[cfg(target_os = "macos")]
    #[test]
    fn finds_system_terminal() {
        let apps = super::installed_apps();
        assert!(
            apps.terminals.iter().any(|app| app.name == "Terminal"),
            "no apareció Terminal: {:?}",
            apps.terminals
                .iter()
                .map(|app| app.name.as_str())
                .collect::<Vec<_>>()
        );
    }
}
