mod error;

use chrono::{DateTime, FixedOffset};
pub use error::GitError;
use git2::{BranchType, Delta, DiffOptions, Repository, Sort, Status, StatusOptions};
use serde::Serialize;
use std::io::Write;
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub path: String,
    pub name: String,
    pub current_branch: Option<String>,
    pub head_sha: Option<String>,
    pub is_detached: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchRef {
    pub name: String,
    pub remote: Option<String>,
    pub is_head: bool,
    pub tip_sha: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitSummary {
    pub sha: String,
    pub short_sha: String,
    pub message: String,
    pub author_name: String,
    pub author_email: String,
    pub authored_at: String,
    pub parent_shas: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitPage {
    pub commits: Vec<CommitSummary>,
    pub next_cursor: Option<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeEntry {
    pub path: String,
    pub kind: String,
    pub staged: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkingTreeStatus {
    pub entries: Vec<WorkingTreeEntry>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiffFile {
    pub path: String,
    pub old_path: Option<String>,
    pub kind: String,
    pub patch: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDiff {
    pub sha: String,
    pub files: Vec<CommitDiffFile>,
    pub truncated: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkDiff {
    pub path: String,
    pub staged: bool,
    pub kind: String,
    pub before: String,
    pub after: String,
    pub patch: String,
    pub binary: bool,
}

const PATCH_BYTE_LIMIT: usize = 200 * 1024;

pub fn open_repository(path: &str) -> Result<RepositoryInfo, GitError> {
    let repo = discover(path)?;
    let root = repo_root(&repo)?;
    let name = root
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("repository")
        .to_string();

    let head = match repo.head() {
        Ok(head) => Some(head),
        Err(err) if err.code() == git2::ErrorCode::UnbornBranch => None,
        Err(err) => return Err(map_git(err)),
    };

    let head_sha = head
        .as_ref()
        .and_then(|reference| reference.target().map(|oid| oid.to_string()));
    let is_detached = repo.head_detached().unwrap_or(false);
    let current_branch = if is_detached {
        None
    } else {
        head.as_ref()
            .and_then(|reference| reference.shorthand().map(ToOwned::to_owned))
    };

    Ok(RepositoryInfo {
        path: root.to_string_lossy().into_owned(),
        name,
        current_branch,
        head_sha,
        is_detached,
    })
}

pub fn list_branches(path: &str) -> Result<Vec<BranchRef>, GitError> {
    let repo = discover(path)?;
    let mut branches = Vec::new();
    for item in repo.branches(None).map_err(map_git)? {
        let (branch, kind) = item.map_err(map_git)?;
        let Some(name) = branch.name().map_err(map_git)? else {
            continue;
        };
        let remote = match kind {
            BranchType::Remote => name.split('/').next().map(ToOwned::to_owned),
            BranchType::Local => None,
        };
        let tip_sha = branch.get().target().map(|oid| oid.to_string());
        branches.push(BranchRef {
            name: name.to_string(),
            remote,
            is_head: branch.is_head(),
            tip_sha,
        });
    }

    branches.sort_by(|left, right| {
        left.remote
            .is_some()
            .cmp(&right.remote.is_some())
            .then_with(|| right.is_head.cmp(&left.is_head))
            .then_with(|| left.name.cmp(&right.name))
    });
    Ok(branches)
}

pub fn list_commits(
    path: &str,
    limit: u32,
    cursor: Option<String>,
) -> Result<CommitPage, GitError> {
    let limit = limit.clamp(1, 200) as usize;
    let repo = discover(path)?;
    let mut walk = repo.revwalk().map_err(map_git)?;
    if let Err(err) = walk.push_head() {
        if err.code() == git2::ErrorCode::UnbornBranch || err.code() == git2::ErrorCode::NotFound {
            return Ok(CommitPage {
                commits: Vec::new(),
                next_cursor: None,
            });
        }
        return Err(map_git(err));
    }
    walk.set_sorting(Sort::TIME).map_err(map_git)?;

    let mut skipping = cursor.is_some();
    let cursor_sha = cursor.unwrap_or_default();
    let mut commits: Vec<CommitSummary> = Vec::new();
    let mut next_cursor = None;

    for oid in walk {
        let oid = oid.map_err(map_git)?;
        let sha = oid.to_string();
        if skipping {
            if sha == cursor_sha {
                skipping = false;
            }
            continue;
        }
        if commits.len() == limit {
            next_cursor = Some(commits[commits.len() - 1].sha.clone());
            break;
        }
        let commit = repo.find_commit(oid).map_err(map_git)?;
        let message = commit.message().unwrap_or("").trim().to_string();
        let author = commit.author();
        commits.push(CommitSummary {
            short_sha: sha.chars().take(7).collect(),
            message,
            author_name: author.name().unwrap_or("").to_string(),
            author_email: author.email().unwrap_or("").to_string(),
            authored_at: format_time(author.when()),
            parent_shas: commit
                .parent_ids()
                .map(|parent| parent.to_string())
                .collect(),
            sha,
        });
    }

    Ok(CommitPage {
        commits,
        next_cursor,
    })
}

pub fn working_tree_status(path: &str) -> Result<WorkingTreeStatus, GitError> {
    let repo = discover(path)?;
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .include_ignored(false)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true);

    let statuses = repo.statuses(Some(&mut options)).map_err(map_git)?;
    let mut entries = Vec::new();
    for entry in statuses.iter() {
        let Some(file_path) = entry.path() else {
            continue;
        };
        let status = entry.status();
        if let Some(kind) = index_kind(status) {
            entries.push(WorkingTreeEntry {
                path: file_path.to_string(),
                kind: kind.to_string(),
                staged: true,
            });
        }
        if let Some(kind) = worktree_kind(status) {
            entries.push(WorkingTreeEntry {
                path: file_path.to_string(),
                kind: kind.to_string(),
                staged: false,
            });
        }
    }

    Ok(WorkingTreeStatus { entries })
}

pub fn stage_paths(repo_path: &str, paths: &[String]) -> Result<(), GitError> {
    if paths.is_empty() {
        return Ok(());
    }
    let repo = discover(repo_path)?;
    for file in paths {
        if path_is_conflicted(&repo, file)? {
            return Err(GitError::Io(format!(
                "Resuelve el conflicto antes de hacer stage: {file}"
            )));
        }
    }
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitError::Io("El repositorio no tiene directorio de trabajo".into()))?;
    let mut index = repo.index().map_err(map_git)?;
    for file in paths {
        let relative = Path::new(file);
        if workdir.join(relative).exists() {
            index.add_path(relative).map_err(map_git)?;
        } else {
            index.remove_path(relative).map_err(map_git)?;
        }
    }
    index.write().map_err(map_git)
}

pub fn unstage_paths(repo_path: &str, paths: &[String]) -> Result<(), GitError> {
    if paths.is_empty() {
        return Ok(());
    }
    let repo = discover(repo_path)?;
    match repo.head() {
        Ok(reference) => {
            let target = reference.peel(git2::ObjectType::Commit).map_err(map_git)?;
            repo.reset_default(Some(&target), paths.iter().map(String::as_str))
                .map_err(map_git)
        }
        Err(err) if err.code() == git2::ErrorCode::UnbornBranch => {
            let mut index = repo.index().map_err(map_git)?;
            for file in paths {
                index.remove_path(Path::new(file)).map_err(map_git)?;
            }
            index.write().map_err(map_git)
        }
        Err(err) => Err(map_git(err)),
    }
}

pub fn create_commit(repo_path: &str, summary: &str, description: &str) -> Result<(), GitError> {
    let summary = summary.trim();
    if summary.is_empty() {
        return Err(GitError::Io("El resumen del commit está vacío".into()));
    }
    let repo = discover(repo_path)?;
    if !index_has_changes(&repo)? {
        return Err(GitError::Io("No hay cambios en stage".into()));
    }
    let signature = repo.signature().map_err(|_| {
        GitError::Io("Falta user.name o user.email en la configuración de git".into())
    })?;
    let mut index = repo.index().map_err(map_git)?;
    let tree_id = index.write_tree().map_err(map_git)?;
    let tree = repo.find_tree(tree_id).map_err(map_git)?;
    let parent = head_commit(&repo)?;
    let parents: Vec<&git2::Commit> = parent.iter().collect();
    let description = description.trim();
    let message = if description.is_empty() {
        summary.to_string()
    } else {
        format!("{summary}\n\n{description}")
    };
    repo.commit(
        Some("HEAD"),
        &signature,
        &signature,
        &message,
        &tree,
        &parents,
    )
    .map_err(map_git)?;
    Ok(())
}

pub fn checkout_branch(repo_path: &str, name: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let branch_name = name.trim();
    let branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(|_| GitError::Io(format!("No existe la rama local: {branch_name}")))?;
    if branch.is_head() {
        return Ok(());
    }
    let object = branch
        .get()
        .peel(git2::ObjectType::Commit)
        .map_err(map_git)?;
    let refname = branch
        .get()
        .name()
        .ok_or_else(|| GitError::Io(format!("La rama no tiene nombre: {branch_name}")))?
        .to_string();
    repo.checkout_tree(&object, None).map_err(map_git)?;
    repo.set_head(&refname).map_err(map_git)
}

pub fn create_branch(repo_path: &str, name: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let branch_name = name.trim();
    let refname = format!("refs/heads/{branch_name}");
    if branch_name.is_empty() || !git2::Reference::is_valid_name(&refname) {
        return Err(GitError::Io(format!(
            "Nombre de rama inválido: {branch_name}"
        )));
    }
    let commit = head_commit(&repo)?
        .ok_or_else(|| GitError::Io("No hay commits para crear la rama".into()))?;
    repo.branch(branch_name, &commit, false).map_err(map_git)?;
    Ok(())
}

pub fn delete_branch(repo_path: &str, name: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let branch_name = name.trim();
    let mut branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(|_| GitError::Io(format!("No existe la rama local: {branch_name}")))?;
    if branch.is_head() {
        return Err(GitError::Io("No se puede borrar la rama actual".into()));
    }
    branch.delete().map_err(map_git)
}

const FILE_BYTE_LIMIT: usize = 1024 * 1024;

pub fn fetch(repo_path: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let remote_name = tracking_remote_name(&repo)?.unwrap_or_else(|| "origin".to_string());
    fetch_remote(&repo, &remote_name)
}

pub fn pull(repo_path: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let (local, remote_name, remote_branch) = upstream_parts(&repo)?;
    fetch_remote(&repo, &remote_name)?;
    let upstream = repo
        .find_branch(
            &format!("{remote_name}/{remote_branch}"),
            BranchType::Remote,
        )
        .map_err(|_| GitError::Io("La rama no tiene upstream".into()))?;
    let annotated = repo
        .reference_to_annotated_commit(upstream.get())
        .map_err(map_git)?;
    let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(map_git)?;
    if analysis.is_up_to_date() {
        return Ok(());
    }
    if !analysis.is_fast_forward() {
        return Err(GitError::Io(
            "Hace falta un merge. Esta versión solo avanza si es fast-forward.".into(),
        ));
    }
    let commit = repo.find_commit(annotated.id()).map_err(map_git)?;
    repo.checkout_tree(commit.as_object(), None)
        .map_err(map_git)?;
    let mut reference = repo
        .find_reference(&format!("refs/heads/{local}"))
        .map_err(map_git)?;
    reference
        .set_target(commit.id(), "GitHydra: fast-forward")
        .map_err(map_git)?;
    Ok(())
}

pub fn push(repo_path: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let (local, remote_name, remote_branch) = upstream_parts(&repo)?;
    let mut remote = repo
        .find_remote(&remote_name)
        .map_err(|_| GitError::Io(format!("No existe el remoto {remote_name}")))?;
    let refspec = format!("refs/heads/{local}:refs/heads/{remote_branch}");
    let mut options = git2::PushOptions::new();
    options.remote_callbacks(remote_callbacks());
    remote.push(&[refspec], Some(&mut options)).map_err(map_git)
}

pub fn clone_repository(url: &str, directory: &str) -> Result<RepositoryInfo, GitError> {
    let url = url.trim();
    if url.is_empty() {
        return Err(GitError::Io("La URL está vacía".into()));
    }
    let parent = Path::new(directory.trim());
    if !parent.is_dir() {
        return Err(GitError::Io("La carpeta de destino no existe".into()));
    }
    let name = repo_name_from_url(url)?;
    let dest = parent.join(&name);
    if dest.exists() {
        let mut entries = std::fs::read_dir(&dest).map_err(|err| GitError::Io(err.to_string()))?;
        if entries.next().is_some() {
            return Err(GitError::Io(format!(
                "La carpeta ya existe y no está vacía: {}",
                dest.display()
            )));
        }
        std::fs::remove_dir(&dest).map_err(|err| GitError::Io(err.to_string()))?;
    }
    let mut options = git2::FetchOptions::new();
    options.remote_callbacks(remote_callbacks());
    let mut builder = git2::build::RepoBuilder::new();
    builder.fetch_options(options);
    builder.clone(url, &dest).map_err(map_git)?;
    let dest_path = dest
        .to_str()
        .ok_or_else(|| GitError::Io("La ruta clonada no es UTF-8".into()))?;
    open_repository(dest_path)
}

pub fn read_commit_file(repo_path: &str, sha: &str, file: &str) -> Result<String, GitError> {
    let repo = discover(repo_path)?;
    let oid = git2::Oid::from_str(sha.trim()).map_err(map_git)?;
    let commit = repo.find_commit(oid).map_err(map_git)?;
    let tree = commit.tree().map_err(map_git)?;
    let entry = match tree.get_path(Path::new(file)) {
        Ok(entry) => entry,
        Err(_) => return Ok(format!("El commit no tiene {file}")),
    };
    let blob = match repo.find_blob(entry.id()) {
        Ok(blob) => blob,
        Err(_) => return Ok("No se puede mostrar este archivo.".into()),
    };
    if blob.is_binary() {
        return Ok("Archivo binario, sin vista de texto.".into());
    }
    if blob.size() > FILE_BYTE_LIMIT {
        return Ok("El archivo supera 1 MB y no se muestra.".into());
    }
    Ok(String::from_utf8_lossy(blob.content()).into_owned())
}

fn fetch_remote(repo: &Repository, remote_name: &str) -> Result<(), GitError> {
    let mut remote = repo
        .find_remote(remote_name)
        .map_err(|_| GitError::Io(format!("No existe el remoto {remote_name}")))?;
    let mut options = git2::FetchOptions::new();
    options.remote_callbacks(remote_callbacks());
    let specs: [&str; 0] = [];
    remote
        .fetch(&specs, Some(&mut options), None)
        .map_err(map_git)
}

fn tracking_remote_name(repo: &Repository) -> Result<Option<String>, GitError> {
    match upstream_parts(repo) {
        Ok((_, remote_name, _)) => Ok(Some(remote_name)),
        Err(_) => Ok(None),
    }
}

fn upstream_parts(repo: &Repository) -> Result<(String, String, String), GitError> {
    let head = match repo.head() {
        Ok(head) => head,
        Err(err) if err.code() == git2::ErrorCode::UnbornBranch => {
            return Err(GitError::Io("No hay commits".into()));
        }
        Err(err) => return Err(map_git(err)),
    };
    if !head.is_branch() {
        return Err(GitError::Io("HEAD no está en una rama".into()));
    }
    let local = head.shorthand().unwrap_or("").to_string();
    let branch = git2::Branch::wrap(head);
    let upstream = branch
        .upstream()
        .map_err(|_| GitError::Io("La rama no tiene upstream".into()))?;
    let full = upstream.name().map_err(map_git)?.unwrap_or("").to_string();
    let Some((remote_name, remote_branch)) = full.split_once('/') else {
        return Err(GitError::Io("La rama no tiene upstream".into()));
    };
    if remote_name.is_empty() || remote_branch.is_empty() {
        return Err(GitError::Io("La rama no tiene upstream".into()));
    }
    Ok((local, remote_name.to_string(), remote_branch.to_string()))
}

fn remote_callbacks() -> git2::RemoteCallbacks<'static> {
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|url, username_from_url, allowed| {
        if allowed.contains(git2::CredentialType::SSH_KEY) {
            let user = username_from_url.unwrap_or("git");
            if let Ok(cred) = git2::Cred::ssh_key_from_agent(user) {
                return Ok(cred);
            }
        }
        if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT)
            && let Some((user, password)) = git_credential_fill(url)
        {
            return git2::Cred::userpass_plaintext(&user, &password);
        }
        if allowed.contains(git2::CredentialType::DEFAULT) {
            return git2::Cred::default();
        }
        Err(git2::Error::from_str(
            "No hay credencial. Revisa el agente SSH o git credential.",
        ))
    });
    callbacks
}

fn git_credential_fill(url: &str) -> Option<(String, String)> {
    let (protocol, host) = https_host(url)?;
    let mut child = Command::new("git")
        .args(["credential", "fill"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    let mut stdin = child.stdin.take()?;
    stdin
        .write_all(format!("protocol={protocol}\nhost={host}\n\n").as_bytes())
        .ok()?;
    drop(stdin);
    let output = child.wait_with_output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8(output.stdout).ok()?;
    let mut username = None;
    let mut password = None;
    for line in text.lines() {
        if let Some(value) = line.strip_prefix("username=") {
            username = Some(value.to_string());
        }
        if let Some(value) = line.strip_prefix("password=") {
            password = Some(value.to_string());
        }
    }
    Some((username?, password?))
}

fn https_host(url: &str) -> Option<(String, String)> {
    let (protocol, rest) = if let Some(rest) = url.strip_prefix("https://") {
        ("https", rest)
    } else {
        let rest = url.strip_prefix("http://")?;
        ("http", rest)
    };
    let without_user = rest.split_once('@').map(|(_, host)| host).unwrap_or(rest);
    let host = without_user.split(['/', ':']).next()?.trim();
    if host.is_empty() {
        return None;
    }
    Some((protocol.to_string(), host.to_string()))
}

fn repo_name_from_url(url: &str) -> Result<String, GitError> {
    let trimmed = url.trim().trim_end_matches('/');
    let last = trimmed.rsplit(['/', ':']).next().unwrap_or("");
    let name = last.strip_suffix(".git").unwrap_or(last);
    if name.is_empty() || name == "." || name == ".." || name.contains("..") {
        return Err(GitError::Io(
            "No se pudo leer el nombre del repositorio".into(),
        ));
    }
    Ok(name.to_string())
}

fn head_commit(repo: &Repository) -> Result<Option<git2::Commit<'_>>, GitError> {
    match repo.head() {
        Ok(reference) => Ok(Some(reference.peel_to_commit().map_err(map_git)?)),
        Err(err) if err.code() == git2::ErrorCode::UnbornBranch => Ok(None),
        Err(err) => Err(map_git(err)),
    }
}

fn index_has_changes(repo: &Repository) -> Result<bool, GitError> {
    let head = head_commit(repo)?;
    let head_tree = match head {
        Some(commit) => Some(commit.tree().map_err(map_git)?),
        None => None,
    };
    let index = repo.index().map_err(map_git)?;
    let diff = repo
        .diff_tree_to_index(head_tree.as_ref(), Some(&index), None)
        .map_err(map_git)?;
    Ok(diff.deltas().len() > 0)
}

fn path_is_conflicted(repo: &Repository, file: &str) -> Result<bool, GitError> {
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .pathspec(file)
        .disable_pathspec_match(true);
    let statuses = repo.statuses(Some(&mut options)).map_err(map_git)?;
    Ok(statuses
        .iter()
        .any(|entry| entry.status().is_conflicted() && entry.path() == Some(file)))
}

pub fn working_tree_diff(repo_path: &str, file: &str, staged: bool) -> Result<WorkDiff, GitError> {
    let file = file.trim();
    if file.is_empty() {
        return Err(GitError::Io("Falta la ruta del archivo".into()));
    }
    let repo = discover(repo_path)?;
    let before = if staged {
        head_file_text(&repo, file)?
    } else {
        match index_file_text(&repo, file)? {
            Some(text) => text,
            None => head_file_text(&repo, file)?,
        }
    };
    let after = if staged {
        index_file_text(&repo, file)?.unwrap_or_else(missing_side)
    } else {
        workdir_file_text(&repo, file)?
    };
    let mut options = DiffOptions::new();
    options
        .pathspec(file)
        .disable_pathspec_match(true)
        .context_lines(3);
    let diff = if staged {
        let parent = head_commit(&repo)?;
        let tree = match &parent {
            Some(commit) => Some(commit.tree().map_err(map_git)?),
            None => None,
        };
        let index = repo.index().map_err(map_git)?;
        repo.diff_tree_to_index(tree.as_ref(), Some(&index), Some(&mut options))
            .map_err(map_git)?
    } else {
        options.include_untracked(true).show_untracked_content(true);
        repo.diff_index_to_workdir(None, Some(&mut options))
            .map_err(map_git)?
    };
    let mut kind = "modified".to_string();
    let mut binary = false;
    let mut patch = String::new();
    for index in 0..diff.deltas().len() {
        let (file_path, _, delta_kind, is_binary) = delta_meta(&diff, index)?;
        if file_path != file {
            continue;
        }
        kind = delta_kind;
        binary = is_binary;
        patch = if is_binary {
            "Archivo binario, sin parche de texto.\n".to_string()
        } else {
            let raw = patch_text(&diff, index);
            if raw.len() > PATCH_BYTE_LIMIT {
                let mut cut: String = raw.chars().take(PATCH_BYTE_LIMIT).collect();
                cut.push_str("\nParche truncado.\n");
                cut
            } else {
                raw
            }
        };
        break;
    }
    let binary =
        binary || before.starts_with("Archivo binario") || after.starts_with("Archivo binario");
    Ok(WorkDiff {
        path: file.to_string(),
        staged,
        kind,
        before,
        after,
        patch,
        binary,
    })
}

fn missing_side() -> String {
    "Este lado no tiene el archivo.\n".to_string()
}

fn head_file_text(repo: &Repository, file: &str) -> Result<String, GitError> {
    let Some(commit) = head_commit(repo)? else {
        return Ok(missing_side());
    };
    let tree = commit.tree().map_err(map_git)?;
    match tree.get_path(Path::new(file)) {
        Ok(entry) => blob_text(repo, entry.id()),
        Err(_) => Ok(missing_side()),
    }
}

fn index_file_text(repo: &Repository, file: &str) -> Result<Option<String>, GitError> {
    let index = repo.index().map_err(map_git)?;
    let Some(entry) = index.get_path(Path::new(file), 0) else {
        return Ok(None);
    };
    Ok(Some(blob_text(repo, entry.id)?))
}

fn workdir_file_text(repo: &Repository, file: &str) -> Result<String, GitError> {
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitError::Io("El repositorio no tiene directorio de trabajo".into()))?;
    let full = workdir.join(file);
    if !full.is_file() {
        return Ok(missing_side());
    }
    let bytes = std::fs::read(&full).map_err(|err| GitError::Io(err.to_string()))?;
    read_limited(&bytes)
}

fn blob_text(repo: &Repository, id: git2::Oid) -> Result<String, GitError> {
    let blob = repo.find_blob(id).map_err(map_git)?;
    if blob.is_binary() {
        return Ok("Archivo binario, sin vista de texto.\n".into());
    }
    read_limited(blob.content())
}

fn read_limited(bytes: &[u8]) -> Result<String, GitError> {
    if bytes.len() > FILE_BYTE_LIMIT {
        return Ok("El archivo supera 1 MB y no se muestra.\n".into());
    }
    if bytes.contains(&0) {
        return Ok("Archivo binario, sin vista de texto.\n".into());
    }
    Ok(String::from_utf8_lossy(bytes).into_owned())
}

pub fn commit_diff(path: &str, sha: &str) -> Result<CommitDiff, GitError> {
    let repo = discover(path)?;
    let oid = git2::Oid::from_str(sha.trim()).map_err(map_git)?;
    let commit = repo.find_commit(oid).map_err(map_git)?;
    let new_tree = commit.tree().map_err(map_git)?;
    let parent_tree = if commit.parent_count() == 0 {
        None
    } else {
        Some(commit.parent(0).map_err(map_git)?.tree().map_err(map_git)?)
    };
    let mut options = DiffOptions::new();
    options.context_lines(3);
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&new_tree), Some(&mut options))
        .map_err(map_git)?;

    let mut files = Vec::new();
    let mut truncated = false;
    let mut used = 0usize;
    for index in 0..diff.deltas().len() {
        let (file_path, old_path, kind, binary) = delta_meta(&diff, index)?;
        let raw = if binary {
            "Archivo binario, sin parche de texto.\n".to_string()
        } else {
            patch_text(&diff, index)
        };
        let patch = if used >= PATCH_BYTE_LIMIT {
            truncated = true;
            "Parche truncado.\n".to_string()
        } else if used + raw.len() > PATCH_BYTE_LIMIT {
            truncated = true;
            used = PATCH_BYTE_LIMIT;
            let mut cut: String = raw.chars().take(PATCH_BYTE_LIMIT).collect();
            cut.push_str("\nParche truncado.\n");
            cut
        } else {
            used += raw.len();
            raw
        };
        files.push(CommitDiffFile {
            path: file_path,
            old_path,
            kind,
            patch,
        });
    }

    Ok(CommitDiff {
        sha: oid.to_string(),
        files,
        truncated,
    })
}

fn delta_meta(
    diff: &git2::Diff,
    index: usize,
) -> Result<(String, Option<String>, String, bool), GitError> {
    let Some(delta) = diff.get_delta(index) else {
        return Err(GitError::Io("El delta del diff no existe".into()));
    };
    let new_path = path_to_string(delta.new_file().path());
    let old_path = path_to_string(delta.old_file().path());
    let file_path = if new_path.is_empty() {
        old_path.clone()
    } else {
        new_path
    };
    let previous = if old_path.is_empty() || old_path == file_path {
        None
    } else {
        Some(old_path)
    };
    let binary = delta.new_file().is_binary() || delta.old_file().is_binary();
    Ok((
        file_path,
        previous,
        delta_kind(delta.status()).to_string(),
        binary,
    ))
}

fn path_to_string(path: Option<&Path>) -> String {
    path.and_then(|value| value.to_str())
        .unwrap_or("")
        .to_string()
}

fn patch_text(diff: &git2::Diff, index: usize) -> String {
    let Ok(Some(mut patch)) = git2::Patch::from_diff(diff, index) else {
        return "Archivo binario, sin parche de texto.\n".to_string();
    };
    match patch.to_buf() {
        Ok(buf) => {
            let text = String::from_utf8_lossy(&buf).into_owned();
            if text.contains("Binary files") {
                "Archivo binario, sin parche de texto.\n".to_string()
            } else {
                text
            }
        }
        Err(_) => "Archivo binario, sin parche de texto.\n".to_string(),
    }
}

fn delta_kind(status: Delta) -> &'static str {
    match status {
        Delta::Added | Delta::Copied => "added",
        Delta::Deleted => "deleted",
        Delta::Renamed => "renamed",
        Delta::Typechange => "typechange",
        Delta::Untracked => "untracked",
        Delta::Conflicted => "conflicted",
        Delta::Modified | Delta::Unmodified | Delta::Ignored | Delta::Unreadable => "modified",
    }
}

fn discover(path: &str) -> Result<Repository, GitError> {
    let trimmed = path.trim();
    if trimmed.is_empty() || !Path::new(trimmed).exists() {
        return Err(GitError::Io(format!("La ruta no existe: {trimmed}")));
    }
    Repository::discover(trimmed).map_err(|err| {
        if err.code() == git2::ErrorCode::NotFound {
            GitError::NotARepo(trimmed.to_string())
        } else {
            GitError::Io(err.to_string())
        }
    })
}

fn repo_root(repo: &Repository) -> Result<PathBuf, GitError> {
    let raw = if repo.is_bare() {
        repo.path().to_path_buf()
    } else {
        repo.workdir()
            .ok_or_else(|| GitError::Io("El repositorio no tiene directorio de trabajo".into()))?
            .to_path_buf()
    };
    raw.canonicalize()
        .map_err(|err| GitError::Io(err.to_string()))
}

fn map_git(err: git2::Error) -> GitError {
    GitError::Io(err.to_string())
}

fn format_time(time: git2::Time) -> String {
    let Some(utc) = DateTime::from_timestamp(time.seconds(), 0) else {
        return String::new();
    };
    let Some(offset) = FixedOffset::east_opt(time.offset_minutes() * 60) else {
        return utc.to_rfc3339();
    };
    utc.with_timezone(&offset).to_rfc3339()
}

fn index_kind(status: Status) -> Option<&'static str> {
    if status.is_conflicted() {
        return None;
    }
    if status.is_index_new() {
        return Some("added");
    }
    if status.is_index_modified() {
        return Some("modified");
    }
    if status.is_index_deleted() {
        return Some("deleted");
    }
    if status.is_index_renamed() {
        return Some("renamed");
    }
    if status.is_index_typechange() {
        return Some("typechange");
    }
    None
}

fn worktree_kind(status: Status) -> Option<&'static str> {
    if status.is_conflicted() {
        return Some("conflicted");
    }
    if status.is_wt_new() {
        return Some("untracked");
    }
    if status.is_wt_modified() {
        return Some("modified");
    }
    if status.is_wt_deleted() {
        return Some("deleted");
    }
    if status.is_wt_renamed() {
        return Some("renamed");
    }
    if status.is_wt_typechange() {
        return Some("typechange");
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;
    use git2::{Repository as GitRepository, Signature};
    use std::fs;
    use std::sync::atomic::{AtomicU64, Ordering};
    use std::time::{SystemTime, UNIX_EPOCH};

    static NEXT_SCRATCH: AtomicU64 = AtomicU64::new(0);

    struct Scratch(PathBuf);

    impl Drop for Scratch {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn scratch_dir() -> Scratch {
        let id = NEXT_SCRATCH.fetch_add(1, Ordering::Relaxed);
        let nanos = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("reloj")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!("githydra-{nanos}-{id}"));
        fs::create_dir_all(&dir).expect("crear temporal");
        Scratch(dir)
    }

    fn commit_all(repo: &GitRepository, message: &str) {
        let mut index = repo.index().expect("index");
        index
            .add_all(["*"].iter(), git2::IndexAddOption::DEFAULT, None)
            .expect("add");
        index.write().expect("write index");
        let tree_id = index.write_tree().expect("tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let signature = Signature::now("Hydra", "hydra@example.com").expect("sig");
        let parent = repo.head().ok().and_then(|head| head.peel_to_commit().ok());
        let parents: Vec<&git2::Commit> = parent.iter().collect();
        repo.commit(
            Some("HEAD"),
            &signature,
            &signature,
            message,
            &tree,
            &parents,
        )
        .expect("commit");
    }

    #[test]
    fn rejects_a_folder_that_is_not_a_repository() {
        let dir = scratch_dir();
        let error = open_repository(dir.0.to_str().unwrap()).expect_err("debe fallar");
        assert_eq!(error.code(), "NOT_A_REPO");
    }

    #[test]
    fn reads_branch_history_and_status() {
        let dir = scratch_dir();
        let repo = GitRepository::init(&dir.0).expect("init");
        fs::write(dir.0.join("README.md"), "uno\n").expect("write");
        commit_all(&repo, "first");
        fs::write(dir.0.join("README.md"), "dos\n").expect("write");
        commit_all(&repo, "second");
        fs::write(dir.0.join("notes.txt"), "pendiente\n").expect("write");

        let info = open_repository(dir.0.to_str().unwrap()).expect("open");
        assert_eq!(info.name, dir.0.file_name().unwrap().to_string_lossy());
        assert!(!info.is_detached);
        assert!(info.head_sha.is_some());

        let branches = list_branches(&info.path).expect("branches");
        assert!(
            branches
                .iter()
                .any(|branch| branch.is_head && branch.remote.is_none())
        );

        let page = list_commits(&info.path, 1, None).expect("page");
        assert_eq!(page.commits.len(), 1);
        assert_eq!(page.commits[0].message, "second");
        assert!(page.next_cursor.is_some());

        let rest = list_commits(&info.path, 10, page.next_cursor).expect("rest");
        assert_eq!(rest.commits.len(), 1);
        assert_eq!(rest.commits[0].message, "first");
        assert!(rest.next_cursor.is_none());

        let status = working_tree_status(&info.path).expect("status");
        assert!(status.entries.iter().any(|entry| {
            entry.path == "notes.txt" && entry.kind == "untracked" && !entry.staged
        }));

        stage_paths(&info.path, &["notes.txt".to_string()]).expect("stage");
        let staged = working_tree_status(&info.path).expect("staged");
        assert!(
            staged.entries.iter().any(|entry| {
                entry.path == "notes.txt" && entry.staged && entry.kind == "added"
            })
        );

        unstage_paths(&info.path, &["notes.txt".to_string()]).expect("unstage");
        let unstaged = working_tree_status(&info.path).expect("unstaged");
        assert!(unstaged.entries.iter().any(|entry| {
            entry.path == "notes.txt" && !entry.staged && entry.kind == "untracked"
        }));

        let mut config = repo.config().expect("config");
        config.set_str("user.name", "Hydra").expect("name");
        config
            .set_str("user.email", "hydra@example.com")
            .expect("email");

        let before = open_repository(&info.path).expect("before").head_sha;
        let empty = create_commit(&info.path, "vacío", "").expect_err("sin stage");
        assert_eq!(empty.code(), "IO_ERROR");
        assert_eq!(open_repository(&info.path).expect("same").head_sha, before);

        stage_paths(&info.path, &["notes.txt".to_string()]).expect("stage notes");
        create_commit(&info.path, "Anota", "detalle").expect("commit");
        let committed = list_commits(&info.path, 1, None).expect("committed");
        assert_eq!(committed.commits[0].message, "Anota\n\ndetalle");
        let clean = working_tree_status(&info.path).expect("clean");
        assert!(!clean.entries.iter().any(|entry| entry.path == "notes.txt"));

        let current = open_repository(&info.path)
            .expect("current")
            .current_branch
            .expect("branch name");
        create_branch(&info.path, "side").expect("create side");
        checkout_branch(&info.path, "side").expect("checkout side");
        assert_eq!(
            open_repository(&info.path)
                .expect("on side")
                .current_branch
                .as_deref(),
            Some("side")
        );
        checkout_branch(&info.path, &current).expect("checkout back");
        delete_branch(&info.path, "side").expect("delete side");
        let after_delete = list_branches(&info.path).expect("after delete");
        assert!(!after_delete.iter().any(|branch| branch.name == "side"));
        let kept = delete_branch(&info.path, &current).expect_err("keep head");
        assert_eq!(kept.code(), "IO_ERROR");

        let sha = info.head_sha.expect("head");
        let diff = commit_diff(&info.path, &sha).expect("diff");
        let readme = diff
            .files
            .iter()
            .find(|file| file.path == "README.md")
            .expect("readme");
        assert_eq!(readme.kind, "modified");
        assert!(readme.patch.contains("@@"));
        assert!(!diff.truncated);
    }

    #[test]
    fn clones_pushes_fetches_and_fast_forwards() {
        let dir = scratch_dir();
        let origin = dir.0.join("origin.git");
        GitRepository::init_bare(&origin).expect("bare");

        let source_path = dir.0.join("source");
        let source = GitRepository::init(&source_path).expect("source");
        let mut config = source.config().expect("config");
        config.set_str("user.name", "Hydra").expect("name");
        config
            .set_str("user.email", "hydra@example.com")
            .expect("email");
        fs::write(source_path.join("README.md"), "uno\n").expect("write");
        commit_all(&source, "first");

        let info = open_repository(source_path.to_str().unwrap()).expect("open source");
        let branch = info.current_branch.expect("branch");
        source
            .remote("origin", origin.to_str().unwrap())
            .expect("remote");
        let mut remote = source.find_remote("origin").expect("find remote");
        remote
            .push(&[format!("refs/heads/{branch}:refs/heads/{branch}")], None)
            .expect("seed push");
        let mut local = source
            .find_branch(&branch, BranchType::Local)
            .expect("local");
        local
            .set_upstream(Some(&format!("origin/{branch}")))
            .expect("upstream");

        let parent = dir.0.join("clones");
        fs::create_dir_all(&parent).expect("clones");
        let cloned =
            clone_repository(origin.to_str().unwrap(), parent.to_str().unwrap()).expect("clone");
        assert_eq!(cloned.name, "origin");

        fs::write(source_path.join("README.md"), "dos\n").expect("update");
        commit_all(&source, "second");
        push(&info.path).expect("push");

        fetch(&cloned.path).expect("fetch");
        pull(&cloned.path).expect("pull");
        let pulled = open_repository(&cloned.path).expect("pulled");
        let text = read_commit_file(
            &cloned.path,
            pulled.head_sha.as_deref().expect("sha"),
            "README.md",
        )
        .expect("file");
        assert_eq!(text, "dos\n");
        pull(&cloned.path).expect("already up to date");
    }

    #[test]
    fn shows_before_and_after_for_a_changed_file() {
        let dir = scratch_dir();
        let repo = GitRepository::init(&dir.0).expect("init");
        let mut config = repo.config().expect("config");
        config.set_str("user.name", "Hydra").expect("name");
        config
            .set_str("user.email", "hydra@example.com")
            .expect("email");
        fs::write(dir.0.join("README.md"), "uno\n").expect("write");
        commit_all(&repo, "first");
        fs::write(dir.0.join("README.md"), "dos\n").expect("edit");
        fs::write(dir.0.join("notes.txt"), "pendiente\n").expect("notes");

        let path = dir.0.to_str().unwrap();
        let edited = working_tree_diff(path, "README.md", false).expect("edit diff");
        assert!(edited.before.contains("uno"));
        assert!(edited.after.contains("dos"));
        assert!(edited.patch.contains("@@"));

        stage_paths(path, &["README.md".to_string()]).expect("stage");
        let staged = working_tree_diff(path, "README.md", true).expect("staged diff");
        assert!(staged.before.contains("uno"));
        assert!(staged.after.contains("dos"));

        let added = working_tree_diff(path, "notes.txt", false).expect("new file");
        assert!(added.before.contains("no tiene el archivo"));
        assert!(added.after.contains("pendiente"));
    }
}
