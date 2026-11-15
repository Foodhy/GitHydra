mod git;
mod pty;

#[tauri::command]
fn open_repository(path: String) -> Result<git::RepositoryInfo, git::GitError> {
    git::open_repository(&path)
}

#[tauri::command]
fn list_branches(path: String) -> Result<Vec<git::BranchRef>, git::GitError> {
    git::list_branches(&path)
}

#[tauri::command]
fn list_commits(
    path: String,
    limit: u32,
    cursor: Option<String>,
) -> Result<git::CommitPage, git::GitError> {
    git::list_commits(&path, limit, cursor)
}

#[tauri::command]
fn working_tree_status(path: String) -> Result<git::WorkingTreeStatus, git::GitError> {
    git::working_tree_status(&path)
}

#[tauri::command]
fn working_tree_diff(
    path: String,
    file: String,
    staged: bool,
) -> Result<git::WorkDiff, git::GitError> {
    git::working_tree_diff(&path, &file, staged)
}

#[tauri::command]
fn commit_diff(path: String, sha: String) -> Result<git::CommitDiff, git::GitError> {
    git::commit_diff(&path, &sha)
}

#[tauri::command]
fn stage_paths(path: String, paths: Vec<String>) -> Result<(), git::GitError> {
    git::stage_paths(&path, &paths)
}

#[tauri::command]
fn unstage_paths(path: String, paths: Vec<String>) -> Result<(), git::GitError> {
    git::unstage_paths(&path, &paths)
}

#[tauri::command]
fn create_commit(path: String, summary: String, description: String) -> Result<(), git::GitError> {
    git::create_commit(&path, &summary, &description)
}

#[tauri::command]
fn checkout_branch(path: String, name: String) -> Result<(), git::GitError> {
    git::checkout_branch(&path, &name)
}

#[tauri::command]
fn create_branch(path: String, name: String) -> Result<(), git::GitError> {
    git::create_branch(&path, &name)
}

#[tauri::command]
fn create_branch_at(path: String, name: String, sha: String) -> Result<(), git::GitError> {
    git::create_branch_at(&path, &name, &sha)
}

#[tauri::command]
fn delete_branch(path: String, name: String) -> Result<(), git::GitError> {
    git::delete_branch(&path, &name)
}

#[tauri::command]
fn fetch(path: String) -> Result<(), git::GitError> {
    git::fetch(&path)
}

#[tauri::command]
fn pull(path: String) -> Result<(), git::GitError> {
    git::pull(&path)
}

#[tauri::command]
fn push(path: String) -> Result<(), git::GitError> {
    git::push(&path)
}

#[tauri::command]
fn clone_repository(url: String, directory: String) -> Result<git::RepositoryInfo, git::GitError> {
    git::clone_repository(&url, &directory)
}

#[tauri::command]
fn read_commit_file(path: String, sha: String, file: String) -> Result<String, git::GitError> {
    git::read_commit_file(&path, &sha, &file)
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
            fetch,
            pull,
            push,
            clone_repository,
            read_commit_file,
            pty_open,
            pty_write,
            pty_resize,
            pty_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
