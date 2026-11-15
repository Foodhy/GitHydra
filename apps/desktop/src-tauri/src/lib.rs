mod git;
mod pty;
mod watch;

fn in_repo<T>(
    path: &str,
    action: impl FnOnce() -> Result<T, git::GitError>,
) -> Result<T, git::GitError> {
    git::with_repo(path, action)
}

fn networked<T>(
    app: tauri::AppHandle,
    path: &str,
    action: impl FnOnce() -> Result<T, git::GitError>,
) -> Result<T, git::GitError> {
    in_repo(path, || {
        let activity = git::activity::begin(app);
        let result = action();
        let result = if git::activity::cancelled() {
            Err(git::GitError::Io("Cancelado".into()))
        } else {
            result
        };
        drop(activity);
        result
    })
}

#[tauri::command]
fn open_repository(path: String) -> Result<git::RepositoryInfo, git::GitError> {
    in_repo(&path, || git::open_repository(&path))
}

#[tauri::command]
fn list_branches(path: String) -> Result<Vec<git::BranchRef>, git::GitError> {
    in_repo(&path, || git::list_branches(&path))
}

#[tauri::command]
fn list_commits(
    path: String,
    limit: u32,
    cursor: Option<String>,
) -> Result<git::CommitPage, git::GitError> {
    in_repo(&path, || git::list_commits(&path, limit, cursor))
}

#[tauri::command]
fn working_tree_status(path: String) -> Result<git::WorkingTreeStatus, git::GitError> {
    in_repo(&path, || git::working_tree_status(&path))
}

#[tauri::command]
fn working_tree_diff(
    path: String,
    file: String,
    staged: bool,
) -> Result<git::WorkDiff, git::GitError> {
    in_repo(&path, || git::working_tree_diff(&path, &file, staged))
}

#[tauri::command]
fn commit_diff(path: String, sha: String) -> Result<git::CommitDiff, git::GitError> {
    in_repo(&path, || git::commit_diff(&path, &sha))
}

#[tauri::command]
fn stage_paths(path: String, paths: Vec<String>) -> Result<(), git::GitError> {
    in_repo(&path, || git::stage_paths(&path, &paths))
}

#[tauri::command]
fn unstage_paths(path: String, paths: Vec<String>) -> Result<(), git::GitError> {
    in_repo(&path, || git::unstage_paths(&path, &paths))
}

#[tauri::command]
fn create_commit(path: String, summary: String, description: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::create_commit(&path, &summary, &description))
}

#[tauri::command]
fn checkout_branch(path: String, name: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::checkout_branch(&path, &name))
}

#[tauri::command]
fn create_branch(path: String, name: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::create_branch(&path, &name))
}

#[tauri::command]
fn create_branch_at(path: String, name: String, sha: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::create_branch_at(&path, &name, &sha))
}

#[tauri::command]
fn delete_branch(path: String, name: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::delete_branch(&path, &name))
}

#[tauri::command]
fn rename_branch(path: String, name: String, next_name: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::rename_branch(&path, &name, &next_name))
}

#[tauri::command]
fn set_upstream(path: String, name: String, upstream: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::set_upstream(&path, &name, &upstream))
}

#[tauri::command]
fn create_tag(
    path: String,
    sha: String,
    name: String,
    message: String,
) -> Result<(), git::GitError> {
    in_repo(&path, || git::create_tag(&path, &sha, &name, &message))
}

#[tauri::command]
fn checkout_commit(path: String, sha: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::checkout_commit(&path, &sha))
}

#[tauri::command]
fn fetch(app: tauri::AppHandle, path: String) -> Result<(), git::GitError> {
    networked(app, &path, || git::fetch(&path))
}

#[tauri::command]
fn pull(app: tauri::AppHandle, path: String) -> Result<(), git::GitError> {
    networked(app, &path, || git::pull(&path))
}

#[tauri::command]
fn push(app: tauri::AppHandle, path: String) -> Result<(), git::GitError> {
    networked(app, &path, || git::push(&path))
}

#[tauri::command]
fn clone_repository(
    app: tauri::AppHandle,
    url: String,
    directory: String,
) -> Result<git::RepositoryInfo, git::GitError> {
    networked(app, &directory, || git::clone_repository(&url, &directory))
}

#[tauri::command]
fn init_repository(directory: String) -> Result<git::RepositoryInfo, git::GitError> {
    in_repo(&directory, || git::init_repository(&directory))
}

#[tauri::command]
fn read_commit_file(path: String, sha: String, file: String) -> Result<String, git::GitError> {
    in_repo(&path, || git::read_commit_file(&path, &sha, &file))
}

#[tauri::command]
fn list_workdir(
    path: String,
    directory: String,
) -> Result<Vec<git::files::WorkdirEntry>, git::GitError> {
    in_repo(&path, || git::files::list_workdir(&path, &directory))
}

#[tauri::command]
fn read_workdir_file(path: String, file: String) -> Result<git::files::WorkdirFile, git::GitError> {
    in_repo(&path, || git::files::read_workdir_file(&path, &file))
}

#[tauri::command]
fn write_workdir_file(path: String, file: String, contents: String) -> Result<(), git::GitError> {
    in_repo(&path, || {
        git::files::write_workdir_file(&path, &file, &contents)
    })
}

#[tauri::command]
fn search_workdir(path: String, query: String) -> Result<Vec<String>, git::GitError> {
    in_repo(&path, || git::files::search_workdir(&path, &query))
}

#[tauri::command]
fn cancel_git_operation() {
    git::activity::cancel();
}

#[tauri::command]
fn watch_repository(app: tauri::AppHandle, path: String) -> Result<(), String> {
    let roots = in_repo(&path, || git::watch_roots(&path)).map_err(|err| err.to_string())?;
    watch::start(app, roots)
}

#[tauri::command]
fn pty_open(app: tauri::AppHandle, path: String) -> Result<u64, String> {
    pty::open(app, &path)
}

#[tauri::command]
fn pty_write(id: u64, data: String) -> Result<(), String> {
    pty::write(id, &data)
}

#[tauri::command]
fn pty_resize(id: u64, rows: u16, cols: u16) -> Result<(), String> {
    pty::resize(id, rows, cols)
}

#[tauri::command]
fn pty_close(id: u64) -> Result<(), String> {
    pty::close(id)
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct McpLaunch {
    root: String,
    command: String,
    args: Vec<String>,
}

#[tauri::command]
fn mcp_launch() -> McpLaunch {
    let manifest = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    let root = manifest
        .parent()
        .and_then(|path| path.parent())
        .unwrap_or(manifest.as_path());
    let root = root.display().to_string();
    McpLaunch {
        command: "pnpm".into(),
        args: vec!["--dir".into(), root.clone(), "mcp".into()],
        root,
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .invoke_handler(tauri::generate_handler![
            open_repository,
            list_branches,
            list_commits,
            working_tree_status,
            working_tree_diff,
            commit_diff,
            stage_paths,
            unstage_paths,
            create_commit,
            checkout_branch,
            create_branch,
            create_branch_at,
            delete_branch,
            rename_branch,
            set_upstream,
            create_tag,
            checkout_commit,
            fetch,
            pull,
            push,
            clone_repository,
            init_repository,
            read_commit_file,
            list_workdir,
            read_workdir_file,
            write_workdir_file,
            search_workdir,
            cancel_git_operation,
            watch_repository,
            pty_open,
            pty_write,
            pty_resize,
            pty_close,
            mcp_launch
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
