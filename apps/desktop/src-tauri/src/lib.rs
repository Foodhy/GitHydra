mod git;

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
            commit_diff,
            stage_paths,
            unstage_paths
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
