mod apps;
mod browser;
mod dock;
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
fn discard_paths(path: String, paths: Vec<String>) -> Result<(), git::GitError> {
    in_repo(&path, || git::discard_paths(&path, &paths))
}

#[tauri::command]
fn create_commit(
    path: String,
    summary: String,
    description: String,
    author_name: String,
    author_email: String,
) -> Result<(), git::GitError> {
    in_repo(&path, || {
        git::create_commit(&path, &summary, &description, &author_name, &author_email)
    })
}

#[tauri::command]
fn list_commit_authors(path: String) -> Result<Vec<git::CommitAuthor>, git::GitError> {
    in_repo(&path, || git::list_commit_authors(&path))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct CommitMessageCandidate {
    provider: String,
    summary: String,
    description: String,
    error: Option<String>,
}

struct TempReply(Option<std::path::PathBuf>);

impl Drop for TempReply {
    fn drop(&mut self) {
        if let Some(path) = self.0.take() {
            let _ = std::fs::remove_file(path);
        }
    }
}

#[tauri::command]
fn generate_commit_message(
    path: String,
    providers: Vec<String>,
) -> Result<Vec<CommitMessageCandidate>, git::GitError> {
    let providers = normalize_commit_providers(&providers)?;
    let staged = in_repo(&path, || git::staged_commit_prompt(&path))?;
    let prompt = staged.prompt;
    let root = staged.root;
    let results = std::thread::scope(|scope| {
        let mut handles = Vec::new();
        for provider in providers {
            let prompt = prompt.clone();
            let root = root.clone();
            handles.push((
                provider,
                scope.spawn(move || ask_commit_provider(provider, &root, &prompt)),
            ));
        }
        handles
            .into_iter()
            .map(|(provider, handle)| {
                handle
                    .join()
                    .unwrap_or_else(|_| failed_candidate(provider, "El proveedor se detuvo."))
            })
            .collect::<Vec<_>>()
    });
    if results.iter().all(|item| item.error.is_some()) {
        let detail = results
            .iter()
            .map(|item| {
                format!(
                    "{}: {}",
                    provider_label(&item.provider),
                    item.error.as_deref().unwrap_or("falló")
                )
            })
            .collect::<Vec<_>>()
            .join(" ");
        return Err(git::GitError::Io(detail));
    }
    Ok(results)
}

fn normalize_commit_providers(providers: &[String]) -> Result<Vec<&'static str>, git::GitError> {
    let mut chosen = Vec::new();
    for raw in providers {
        let id = match raw.trim() {
            "cursor" => "cursor",
            "claude" => "claude",
            "codex" => "codex",
            "" => continue,
            other => {
                return Err(git::GitError::Io(format!("Proveedor desconocido: {other}")));
            }
        };
        if !chosen.contains(&id) {
            chosen.push(id);
        }
    }
    if chosen.is_empty() {
        return Err(git::GitError::Io(
            "Elige un proveedor en Preferencias.".into(),
        ));
    }
    Ok(chosen)
}

fn provider_label(id: &str) -> &'static str {
    match id {
        "cursor" => "Cursor",
        "claude" => "Claude",
        "codex" => "Codex",
        _ => "Proveedor",
    }
}

fn failed_candidate(provider: &str, error: &str) -> CommitMessageCandidate {
    CommitMessageCandidate {
        provider: provider.to_string(),
        summary: String::new(),
        description: String::new(),
        error: Some(error.to_string()),
    }
}

fn ask_commit_provider(provider: &str, root: &str, prompt: &str) -> CommitMessageCandidate {
    match reply_from_provider(provider, root, prompt) {
        Ok(text) => match git::clean_commit_reply(&text) {
            Ok(draft) => CommitMessageCandidate {
                provider: provider.to_string(),
                summary: draft.summary,
                description: draft.description,
                error: None,
            },
            Err(err) => failed_candidate(provider, &git_detail(&err)),
        },
        Err(err) => failed_candidate(provider, &git_detail(&err)),
    }
}

fn git_detail(err: &git::GitError) -> String {
    let text = err.to_string();
    text.split_once('|')
        .map(|(_, detail)| detail.to_string())
        .unwrap_or(text)
}

fn find_program(name: &str) -> Result<std::path::PathBuf, git::GitError> {
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let candidate = dir.join(name);
            if candidate.is_file() {
                return Ok(candidate);
            }
        }
    }
    if let Some(home) = std::env::var_os("HOME") {
        let candidate = std::path::PathBuf::from(home).join(".local/bin").join(name);
        if candidate.is_file() {
            return Ok(candidate);
        }
    }
    Err(git::GitError::Io(format!("No está `{name}` en PATH.")))
}

fn reply_from_provider(provider: &str, root: &str, prompt: &str) -> Result<String, git::GitError> {
    let (program, args, reply_file) = provider_launch(provider, root)?;
    let reply = TempReply(reply_file);
    let stdout = run_cli(&program, &args, root, prompt)?;
    if let Some(path) = reply.0.as_ref() {
        let text = std::fs::read_to_string(path).unwrap_or_default();
        if text.trim().is_empty() {
            return Err(git::GitError::Io(format!(
                "{} no devolvió un mensaje.",
                provider_label(provider)
            )));
        }
        return Ok(text);
    }
    Ok(stdout)
}

fn provider_launch(
    provider: &str,
    root: &str,
) -> Result<(std::path::PathBuf, Vec<String>, Option<std::path::PathBuf>), git::GitError> {
    match provider {
        "cursor" => Ok((
            find_program("agent")?,
            vec![
                "-p".into(),
                "--mode".into(),
                "ask".into(),
                "--trust".into(),
                "--output-format".into(),
                "text".into(),
                "--workspace".into(),
                root.to_string(),
            ],
            None,
        )),
        "claude" => Ok((
            find_program("claude")?,
            vec![
                "-p".into(),
                "--output-format".into(),
                "text".into(),
                "--tools".into(),
                String::new(),
                "--permission-mode".into(),
                "plan".into(),
                "--no-session-persistence".into(),
                "--strict-mcp-config".into(),
            ],
            None,
        )),
        "codex" => {
            let nanos = std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .map(|value| value.as_nanos())
                .unwrap_or(0);
            let file = std::env::temp_dir().join(format!(
                "githydra-commit-codex-{}-{nanos}.txt",
                std::process::id()
            ));
            Ok((
                find_program("codex")?,
                vec![
                    "exec".into(),
                    "-s".into(),
                    "read-only".into(),
                    "-C".into(),
                    root.to_string(),
                    "--ephemeral".into(),
                    "--color".into(),
                    "never".into(),
                    "--output-last-message".into(),
                    file.display().to_string(),
                ],
                Some(file),
            ))
        }
        _ => Err(git::GitError::Io(format!(
            "Proveedor desconocido: {provider}"
        ))),
    }
}

fn run_cli(
    program: &std::path::Path,
    args: &[String],
    root: &str,
    prompt: &str,
) -> Result<String, git::GitError> {
    let name = program
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("agente");
    let mut child = std::process::Command::new(program)
        .args(args)
        .current_dir(root)
        .stdin(std::process::Stdio::piped())
        .stdout(std::process::Stdio::piped())
        .stderr(std::process::Stdio::piped())
        .spawn()
        .map_err(|err| git::GitError::Io(format!("No se pudo lanzar {name}: {err}")))?;

    let mut stdin = match child.stdin.take() {
        Some(stdin) => stdin,
        None => {
            stop_agent(&mut child);
            return Err(git::GitError::Io(format!("{name} no aceptó el prompt")));
        }
    };
    let prompt = prompt.to_string();
    let writer = std::thread::spawn(move || {
        use std::io::Write;
        let _ = stdin.write_all(prompt.as_bytes());
        let _ = stdin.flush();
    });

    let mut stdout = match child.stdout.take() {
        Some(stdout) => stdout,
        None => {
            stop_agent(&mut child);
            let _ = writer.join();
            return Err(git::GitError::Io(format!("{name} no devolvió salida")));
        }
    };
    let mut stderr = match child.stderr.take() {
        Some(stderr) => stderr,
        None => {
            stop_agent(&mut child);
            let _ = writer.join();
            return Err(git::GitError::Io(format!("{name} no devolvió errores")));
        }
    };
    let out_handle = std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = String::new();
        let _ = stdout.read_to_string(&mut buf);
        buf
    });
    let err_handle = std::thread::spawn(move || {
        use std::io::Read;
        let mut buf = String::new();
        let _ = stderr.read_to_string(&mut buf);
        buf
    });

    let started = std::time::Instant::now();
    let status = loop {
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) if started.elapsed() > std::time::Duration::from_secs(45) => {
                stop_agent(&mut child);
                let _ = writer.join();
                let _ = out_handle.join();
                let _ = err_handle.join();
                return Err(git::GitError::Io(format!(
                    "{name} tardó más de 45 s y se detuvo."
                )));
            }
            Ok(None) => std::thread::sleep(std::time::Duration::from_millis(50)),
            Err(err) => {
                stop_agent(&mut child);
                let _ = writer.join();
                let _ = out_handle.join();
                let _ = err_handle.join();
                return Err(git::GitError::Io(format!(
                    "No se pudo esperar a {name}: {err}"
                )));
            }
        }
    };
    let _ = writer.join();
    let output = out_handle.join().unwrap_or_default();
    let errors = err_handle.join().unwrap_or_default();
    if !status.success() {
        let detail = clip_agent_error(errors.trim());
        return Err(git::GitError::Io(if detail.is_empty() {
            format!("{name} terminó con código {}", status.code().unwrap_or(-1))
        } else {
            format!("{name} falló: {detail}")
        }));
    }
    Ok(output)
}

fn stop_agent(child: &mut std::process::Child) {
    let _ = child.kill();
    let _ = child.wait();
}

fn clip_agent_error(detail: &str) -> String {
    if detail.chars().count() <= 400 {
        return detail.to_string();
    }
    let mut cut: String = detail.chars().take(400).collect();
    cut.push('…');
    cut
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
fn list_stashes(path: String) -> Result<Vec<git::StashEntry>, git::GitError> {
    in_repo(&path, || git::list_stashes(&path))
}

#[tauri::command]
fn save_stash(path: String, message: String, include_untracked: bool) -> Result<(), git::GitError> {
    in_repo(&path, || {
        git::save_stash(&path, &message, include_untracked)
    })
}

#[tauri::command]
fn apply_stash(path: String, index: u32) -> Result<(), git::GitError> {
    in_repo(&path, || git::apply_stash(&path, index))
}

#[tauri::command]
fn pop_stash(path: String, index: u32) -> Result<(), git::GitError> {
    in_repo(&path, || git::pop_stash(&path, index))
}

#[tauri::command]
fn drop_stash(path: String, index: u32) -> Result<(), git::GitError> {
    in_repo(&path, || git::drop_stash(&path, index))
}

#[tauri::command]
fn read_commit_proposal(path: String) -> Result<Option<git::CommitProposal>, git::GitError> {
    in_repo(&path, || git::read_commit_proposal(&path))
}

#[tauri::command]
fn take_show_diff(path: String) -> Result<Option<git::ShowDiffRequest>, git::GitError> {
    in_repo(&path, || git::take_show_diff(&path))
}

#[tauri::command]
fn list_worktrees(path: String) -> Result<Vec<git::LinkedWorktree>, git::GitError> {
    in_repo(&path, || git::list_worktrees(&path))
}

#[tauri::command]
fn add_worktree(
    path: String,
    directory: String,
    branch: String,
    sha: Option<String>,
    create_branch: bool,
) -> Result<git::RepositoryInfo, git::GitError> {
    in_repo(&path, || {
        git::add_worktree(
            &path,
            &git::AddWorktreeRequest {
                directory,
                branch,
                sha,
                create_branch,
            },
        )
    })
}

#[tauri::command]
fn remove_worktree(path: String, worktree_path: String, force: bool) -> Result<(), git::GitError> {
    in_repo(&path, || git::remove_worktree(&path, &worktree_path, force))
}

#[tauri::command]
fn unlock_worktree(path: String, worktree_path: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::unlock_worktree(&path, &worktree_path))
}

#[tauri::command]
fn prune_worktrees(path: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::prune_worktrees(&path))
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
fn index_workdir(path: String) -> Result<git::files::WorkdirIndex, git::GitError> {
    in_repo(&path, || git::files::index_workdir(&path))
}

#[tauri::command]
fn create_workdir_file(
    path: String,
    directory: String,
    name: String,
) -> Result<String, git::GitError> {
    in_repo(&path, || {
        git::files::create_workdir_file(&path, &directory, &name)
    })
}

#[tauri::command]
fn create_workdir_dir(
    path: String,
    directory: String,
    name: String,
) -> Result<String, git::GitError> {
    in_repo(&path, || {
        git::files::create_workdir_dir(&path, &directory, &name)
    })
}

#[tauri::command]
fn rename_workdir(path: String, file: String, name: String) -> Result<String, git::GitError> {
    in_repo(&path, || git::files::rename_workdir(&path, &file, &name))
}

#[tauri::command]
fn move_workdir(path: String, file: String, directory: String) -> Result<String, git::GitError> {
    in_repo(&path, || git::files::move_workdir(&path, &file, &directory))
}

#[tauri::command]
fn remove_workdir(path: String, file: String) -> Result<(), git::GitError> {
    in_repo(&path, || git::files::remove_workdir(&path, &file))
}

#[tauri::command]
fn cancel_git_operation() {
    git::activity::cancel();
}

#[tauri::command]
fn set_dock_activity(app: tauri::AppHandle, kind: Option<String>) {
    let kind = kind.filter(|value| !value.is_empty());
    dock::set_activity(app, kind);
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
            discard_paths,
            create_commit,
            list_commit_authors,
            generate_commit_message,
            checkout_branch,
            create_branch,
            create_branch_at,
            delete_branch,
            rename_branch,
            set_upstream,
            create_tag,
            checkout_commit,
            list_stashes,
            save_stash,
            apply_stash,
            pop_stash,
            drop_stash,
            read_commit_proposal,
            take_show_diff,
            list_worktrees,
            add_worktree,
            remove_worktree,
            unlock_worktree,
            prune_worktrees,
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
            index_workdir,
            create_workdir_file,
            create_workdir_dir,
            rename_workdir,
            move_workdir,
            remove_workdir,
            cancel_git_operation,
            set_dock_activity,
            watch_repository,
            pty_open,
            pty_write,
            pty_resize,
            pty_close,
            mcp_launch,
            apps::installed_apps,
            browser::browser_navigate,
            browser::browser_set_bounds,
            browser::browser_set_visible,
            browser::browser_back,
            browser::browser_forward,
            browser::browser_reload,
            browser::browser_close,
            browser::browser_close_all,
            browser::browser_report_title
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod commit_provider_tests {
    use super::normalize_commit_providers;

    #[test]
    fn keeps_order_and_drops_duplicates() {
        let chosen = normalize_commit_providers(&[
            "claude".into(),
            "cursor".into(),
            "claude".into(),
            "  ".into(),
        ])
        .expect("proveedores");
        assert_eq!(chosen, vec!["claude", "cursor"]);
    }

    #[test]
    fn rejects_unknown_and_empty() {
        assert!(normalize_commit_providers(&["cursor".into(), "gpt".into()]).is_err());
        assert!(normalize_commit_providers(&[]).is_err());
    }
}
