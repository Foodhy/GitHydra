use super::GitError;
use serde::Serialize;
use std::io::Write;
use std::path::{Component, Path, PathBuf};

const FILE_BYTE_LIMIT: usize = 1024 * 1024;
const MEDIA_BYTE_LIMIT: u64 = 6 * 1024 * 1024;
const SEARCH_LIMIT: usize = 80;
const SEARCH_VISIT_LIMIT: usize = 20_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum WorkdirKind {
    File,
    Dir,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkdirEntry {
    pub name: String,
    pub path: String,
    pub kind: WorkdirKind,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkdirFile {
    pub path: String,
    pub text: String,
    pub binary: bool,
    pub truncated: bool,
    pub mime: Option<String>,
    pub media: Option<String>,
}

pub fn list_workdir(repo_path: &str, directory: &str) -> Result<Vec<WorkdirEntry>, GitError> {
    let root = workdir(repo_path)?;
    let full = resolve_dir(&root, directory)?;
    let mut entries = Vec::new();
    for item in std::fs::read_dir(&full).map_err(io_message)? {
        let item = item.map_err(io_message)?;
        let Some(name) = item.file_name().to_str().map(str::to_string) else {
            continue;
        };
        if name == ".git" {
            continue;
        }
        let child = item.path();
        let Some(relative) = child.strip_prefix(&root).ok() else {
            continue;
        };
        let path = posix(relative);
        if path.is_empty() || path == ".git" || path.starts_with(".git/") {
            continue;
        }
        let kind = if child.is_dir() {
            WorkdirKind::Dir
        } else {
            WorkdirKind::File
        };
        entries.push(WorkdirEntry { name, path, kind });
    }
    entries.sort_by(|left, right| {
        kind_rank(left.kind)
            .cmp(&kind_rank(right.kind))
            .then_with(|| left.name.to_lowercase().cmp(&right.name.to_lowercase()))
    });
    Ok(entries)
}

pub fn read_workdir_file(repo_path: &str, file: &str) -> Result<WorkdirFile, GitError> {
    let root = workdir(repo_path)?;
    let relative = normalize_relative(file)?;
    let full = contained(&root, &relative, false)?;
    reject_git(&root, &full)?;
    if full.is_dir() {
        return Err(GitError::Io("Eso es una carpeta".into()));
    }
    let meta = std::fs::metadata(&full).map_err(io_message)?;
    if let Some(mime) = media_mime(&relative) {
        if meta.len() > MEDIA_BYTE_LIMIT {
            return Ok(empty_file(&relative, false, true));
        }
        let bytes = std::fs::read(&full).map_err(io_message)?;
        return Ok(WorkdirFile {
            path: relative,
            text: String::new(),
            binary: true,
            truncated: false,
            mime: Some(mime.to_string()),
            media: Some(base64_encode(&bytes)),
        });
    }
    if meta.len() > FILE_BYTE_LIMIT as u64 {
        return Ok(empty_file(&relative, false, true));
    }
    let bytes = std::fs::read(&full).map_err(io_message)?;
    if bytes.contains(&0) {
        return Ok(empty_file(&relative, true, false));
    }
    Ok(WorkdirFile {
        path: relative,
        text: String::from_utf8_lossy(&bytes).into_owned(),
        binary: false,
        truncated: false,
        mime: None,
        media: None,
    })
}

fn empty_file(path: &str, binary: bool, truncated: bool) -> WorkdirFile {
    WorkdirFile {
        path: path.to_string(),
        text: String::new(),
        binary,
        truncated,
        mime: None,
        media: None,
    }
}

fn media_mime(relative: &str) -> Option<&'static str> {
    let name = Path::new(relative)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    let extension = name.rsplit_once('.').map(|(_, value)| value).unwrap_or("");
    match extension {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        "avif" => Some("image/avif"),
        "pdf" => Some("application/pdf"),
        _ => None,
    }
}

fn base64_encode(bytes: &[u8]) -> String {
    const TABLE: &[u8; 64] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut out = String::with_capacity(bytes.len().div_ceil(3) * 4);
    let mut index = 0;
    while index + 3 <= bytes.len() {
        let chunk = ((bytes[index] as u32) << 16)
            | ((bytes[index + 1] as u32) << 8)
            | (bytes[index + 2] as u32);
        out.push(TABLE[((chunk >> 18) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 6) & 63) as usize] as char);
        out.push(TABLE[(chunk & 63) as usize] as char);
        index += 3;
    }
    let rest = bytes.len() - index;
    if rest == 1 {
        let chunk = (bytes[index] as u32) << 16;
        out.push(TABLE[((chunk >> 18) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 63) as usize] as char);
        out.push('=');
        out.push('=');
    } else if rest == 2 {
        let chunk = ((bytes[index] as u32) << 16) | ((bytes[index + 1] as u32) << 8);
        out.push(TABLE[((chunk >> 18) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 12) & 63) as usize] as char);
        out.push(TABLE[((chunk >> 6) & 63) as usize] as char);
        out.push('=');
    }
    out
}

pub fn write_workdir_file(repo_path: &str, file: &str, contents: &str) -> Result<(), GitError> {
    if contents.len() > FILE_BYTE_LIMIT {
        return Err(GitError::Io(
            "El archivo supera 1 MB y no se guarda.".into(),
        ));
    }
    let root = workdir(repo_path)?;
    let relative = normalize_relative(file)?;
    let full = contained(&root, &relative, true)?;
    reject_git(&root, &full)?;
    if full.is_dir() {
        return Err(GitError::Io("Eso es una carpeta".into()));
    }
    let mut handle = std::fs::OpenOptions::new()
        .write(true)
        .create(true)
        .truncate(true)
        .open(&full)
        .map_err(io_message)?;
    handle.write_all(contents.as_bytes()).map_err(io_message)?;
    Ok(())
}

pub fn search_workdir(repo_path: &str, query: &str) -> Result<Vec<String>, GitError> {
    let query = query.trim().to_lowercase();
    if query.is_empty() {
        return Ok(Vec::new());
    }
    if query.len() > 200 {
        return Err(GitError::Io("La búsqueda es demasiado larga".into()));
    }
    let root = workdir(repo_path)?;
    let mut found = Vec::new();
    let mut seen = 0usize;
    visit(&root, &root, &query, 0, &mut seen, &mut found);
    found.sort();
    Ok(found)
}

fn visit(
    root: &Path,
    dir: &Path,
    query: &str,
    depth: usize,
    seen: &mut usize,
    found: &mut Vec<String>,
) {
    if depth > 24 || *seen > SEARCH_VISIT_LIMIT || found.len() >= SEARCH_LIMIT {
        return;
    }
    let Ok(entries) = std::fs::read_dir(dir) else {
        return;
    };
    let mut items: Vec<_> = entries.filter_map(|item| item.ok()).collect();
    items.sort_by_key(|item| item.file_name());
    for item in items {
        if *seen > SEARCH_VISIT_LIMIT || found.len() >= SEARCH_LIMIT {
            return;
        }
        *seen += 1;
        let file_name = item.file_name();
        let Some(name) = file_name.to_str() else {
            continue;
        };
        let Ok(kind) = item.file_type() else {
            continue;
        };
        if kind.is_symlink() {
            continue;
        }
        let child = item.path();
        if kind.is_dir() {
            if skipped_dir(name) {
                continue;
            }
            visit(root, &child, query, depth + 1, seen, found);
            continue;
        }
        let Some(relative) = child.strip_prefix(root).ok() else {
            continue;
        };
        let path = posix(relative);
        if path.to_lowercase().contains(query) {
            found.push(path);
        }
    }
}

fn skipped_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "target" | "dist" | ".next" | ".turbo" | "vendor" | "coverage"
    )
}

fn workdir(repo_path: &str) -> Result<PathBuf, GitError> {
    let repo = super::discover(repo_path)?;
    if repo.is_bare() {
        return Err(GitError::Io(
            "El repositorio no tiene directorio de trabajo".into(),
        ));
    }
    let raw = repo
        .workdir()
        .ok_or_else(|| GitError::Io("El repositorio no tiene directorio de trabajo".into()))?;
    raw.canonicalize().map_err(io_message)
}

fn resolve_dir(root: &Path, directory: &str) -> Result<PathBuf, GitError> {
    let directory = directory.trim();
    if directory.is_empty() {
        return Ok(root.to_path_buf());
    }
    let relative = normalize_relative(directory)?;
    let full = contained(root, &relative, false)?;
    reject_git(root, &full)?;
    if !full.is_dir() {
        return Err(GitError::Io("No es una carpeta".into()));
    }
    Ok(full)
}

fn normalize_relative(relative: &str) -> Result<String, GitError> {
    let relative = relative.trim();
    if relative.is_empty() || relative.contains('\0') || Path::new(relative).is_absolute() {
        return Err(GitError::Io(
            "La ruta tiene que quedar dentro del repositorio".into(),
        ));
    }
    let mut parts = Vec::new();
    for component in Path::new(relative).components() {
        match component {
            Component::Normal(part) => parts.push(part.to_string_lossy().into_owned()),
            _ => {
                return Err(GitError::Io(
                    "La ruta tiene que quedar dentro del repositorio".into(),
                ));
            }
        }
    }
    if parts.is_empty() {
        return Err(GitError::Io(
            "La ruta tiene que quedar dentro del repositorio".into(),
        ));
    }
    Ok(parts.join("/"))
}

fn contained(root: &Path, relative: &str, allow_missing: bool) -> Result<PathBuf, GitError> {
    let joined = root.join(relative);
    if joined.exists() {
        let full = joined.canonicalize().map_err(io_message)?;
        ensure_inside(root, &full)?;
        return Ok(full);
    }
    if !allow_missing {
        return Err(GitError::Io(
            "El archivo no está en el directorio de trabajo".into(),
        ));
    }
    let parent = joined.parent().unwrap_or(root);
    let parent_full = parent.canonicalize().map_err(io_message)?;
    ensure_inside(root, &parent_full)?;
    let name = joined
        .file_name()
        .ok_or_else(|| GitError::Io("La ruta tiene que quedar dentro del repositorio".into()))?;
    let full = parent_full.join(name);
    ensure_inside(root, &full)?;
    Ok(full)
}

fn ensure_inside(root: &Path, full: &Path) -> Result<(), GitError> {
    if full.starts_with(root) {
        Ok(())
    } else {
        Err(GitError::Io(
            "La ruta tiene que quedar dentro del repositorio".into(),
        ))
    }
}

fn reject_git(root: &Path, full: &Path) -> Result<(), GitError> {
    let git = root.join(".git");
    if full == git || full.starts_with(&git) {
        return Err(GitError::Io("No se puede editar el directorio .git".into()));
    }
    Ok(())
}

fn posix(path: &Path) -> String {
    path.components()
        .filter_map(|component| match component {
            Component::Normal(part) => Some(part.to_string_lossy().into_owned()),
            _ => None,
        })
        .collect::<Vec<_>>()
        .join("/")
}

fn kind_rank(kind: WorkdirKind) -> u8 {
    match kind {
        WorkdirKind::Dir => 0,
        WorkdirKind::File => 1,
    }
}

fn io_message(err: std::io::Error) -> GitError {
    if err.kind() == std::io::ErrorKind::NotFound {
        GitError::Io("El archivo no está en el directorio de trabajo".into())
    } else {
        GitError::Io(err.to_string())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::Repository;
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    struct Scratch(PathBuf);

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn scratch() -> Scratch {
        static NEXT: AtomicU64 = AtomicU64::new(0);
        let id = NEXT.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("reloj")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("githydra-files-{nanos}-{id}"));
        fs::create_dir_all(&dir).expect("crear temporal");
        Scratch(dir)
    }

    fn repo_path(dir: &Scratch) -> String {
        Repository::init(&dir.0).expect("init");
        dir.0.to_str().expect("utf8").to_string()
    }

    #[test]
    fn lists_reads_and_writes_files_inside_the_repository() {
        let dir = scratch();
        let path = repo_path(&dir);
        fs::create_dir(dir.0.join("src")).expect("src");
        fs::write(dir.0.join("src").join("main.ts"), "export const n = 1;\n").expect("file");
        fs::write(dir.0.join("b.txt"), "b\n").expect("b");

        let root = list_workdir(&path, "").expect("root");
        assert!(root.iter().all(|entry| entry.name != ".git"));
        assert_eq!(root[0].name, "src");
        assert_eq!(root[0].kind, WorkdirKind::Dir);
        assert_eq!(root[1].name, "b.txt");
        assert!(!root.iter().any(|entry| entry.path.starts_with('/')));

        let nested = list_workdir(&path, "src").expect("src");
        assert_eq!(nested.len(), 1);
        assert_eq!(nested[0].path, "src/main.ts");

        let file = read_workdir_file(&path, "src/main.ts").expect("read");
        assert_eq!(file.text, "export const n = 1;\n");
        assert!(!file.binary);
        write_workdir_file(&path, "src/main.ts", "export const n = 2;\n").expect("write");
        let updated = read_workdir_file(&path, "src/main.ts").expect("reread");
        assert_eq!(updated.text, "export const n = 2;\n");
    }

    #[test]
    fn rejects_paths_that_leave_the_repository() {
        let dir = scratch();
        let path = repo_path(&dir);
        let outside = scratch();
        fs::write(outside.0.join("secret.txt"), "no\n").expect("secret");

        for relative in [
            "../secret.txt",
            "/etc/passwd",
            ".git/HEAD",
            "src/../../secret.txt",
        ] {
            let error = read_workdir_file(&path, relative).expect_err(relative);
            assert_eq!(error.code(), "IO_ERROR");
            let write_error = write_workdir_file(&path, relative, "x").expect_err(relative);
            assert_eq!(write_error.code(), "IO_ERROR");
        }

        #[cfg(unix)]
        {
            std::os::unix::fs::symlink(outside.0.join("secret.txt"), dir.0.join("link.txt"))
                .expect("symlink");
            let error = read_workdir_file(&path, "link.txt").expect_err("symlink");
            assert!(error.to_string().contains("dentro del repositorio"));
        }
    }

    #[test]
    fn search_finds_files_and_skips_heavy_directories() {
        let dir = scratch();
        let path = repo_path(&dir);
        fs::create_dir_all(dir.0.join("src")).expect("src");
        fs::write(dir.0.join("src").join("app.ts"), "app\n").expect("app");
        fs::create_dir_all(dir.0.join("node_modules").join("left-pad")).expect("modules");
        fs::write(
            dir.0.join("node_modules").join("left-pad").join("index.js"),
            "pad\n",
        )
        .expect("pad");

        let found = search_workdir(&path, "app").expect("search");
        assert_eq!(found, vec!["src/app.ts".to_string()]);
        let hidden = search_workdir(&path, "left-pad").expect("hidden");
        assert!(hidden.is_empty());
    }

    #[test]
    fn reads_an_image_as_media_instead_of_empty_text() {
        let dir = scratch();
        let path = repo_path(&dir);
        let png = [
            0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D, 0x49, 0x48,
            0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00,
            0x00, 0x1F, 0x15, 0xC4, 0x89, 0x00, 0x00, 0x00, 0x0A, 0x49, 0x44, 0x41, 0x54, 0x78,
            0x9C, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0D, 0x0A, 0x2D, 0xB4, 0x00,
            0x00, 0x00, 0x00, 0x49, 0x45, 0x4E, 0x44, 0xAE, 0x42, 0x60, 0x82,
        ];
        fs::write(dir.0.join("pixel.png"), png).expect("png");
        let file = read_workdir_file(&path, "pixel.png").expect("image");
        assert!(file.binary);
        assert_eq!(file.mime.as_deref(), Some("image/png"));
        assert_eq!(
            file.media.as_deref().unwrap_or("").get(..11),
            Some("iVBORw0KGgo")
        );
        assert!(file.text.is_empty());
    }
}
