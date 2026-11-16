pub mod activity;
mod error;
pub mod files;

use chrono::{DateTime, FixedOffset};
pub use error::GitError;
use git2::{BranchType, Delta, DiffOptions, Repository, Sort, StashFlags, Status, StatusOptions};
use serde::Serialize;
use std::collections::{HashMap, HashSet};
use std::io::Read;
use std::io::Write;
use std::path::{Component, Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::{Duration, Instant};

static REPO_LOCKS: Mutex<Option<HashMap<String, Arc<Mutex<()>>>>> = Mutex::new(None);

pub fn with_repo<T>(path: &str, action: impl FnOnce() -> T) -> T {
    let key = std::fs::canonicalize(path)
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.trim().to_string());
    let mutex = {
        let mut slots = REPO_LOCKS.lock().expect("repo locks");
        let slots = slots.get_or_insert_with(HashMap::new);
        slots
            .entry(key)
            .or_insert_with(|| Arc::new(Mutex::new(())))
            .clone()
    };
    let _guard = mutex.lock().expect("repo lock");
    action()
}

pub struct WatchRoot {
    pub path: PathBuf,
    pub recursive: bool,
}

pub fn watch_roots(repo_path: &str) -> Result<Vec<WatchRoot>, GitError> {
    let repo = discover(repo_path)?;
    let gitdir = repo.path().to_path_buf();
    let common_raw = repo.commondir();
    let common = if common_raw.is_absolute() {
        common_raw.to_path_buf()
    } else {
        gitdir.join(common_raw)
    };
    let mut roots = vec![
        WatchRoot {
            path: gitdir.clone(),
            recursive: false,
        },
        WatchRoot {
            path: common.clone(),
            recursive: false,
        },
        WatchRoot {
            path: common.join("refs").join("heads"),
            recursive: true,
        },
        WatchRoot {
            path: common.join("refs").join("remotes"),
            recursive: true,
        },
    ];
    if gitdir != common {
        roots.push(WatchRoot {
            path: gitdir.join("refs").join("heads"),
            recursive: true,
        });
    }
    let mut seen = HashSet::new();
    roots.retain(|root| seen.insert((root.path.clone(), root.recursive)));
    Ok(roots)
}

pub fn ignored_git_event(path: &Path) -> bool {
    let name = path
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or("");
    name.ends_with(".lock")
        || name == "FETCH_HEAD"
        || name == "ORIG_HEAD"
        || name == "MERGE_HEAD"
        || name == "CHERRY_PICK_HEAD"
        || name == "REVERT_HEAD"
}

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
const PROMPT_FILE_CHARS: usize = 8_000;
const PROMPT_TOTAL_CHARS: usize = 24_000;
const RECENT_SUBJECT_LIMIT: usize = 15;

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitMessageDraft {
    pub summary: String,
    pub description: String,
}

#[derive(Debug)]
pub struct StagedCommitPrompt {
    pub root: String,
    pub prompt: String,
}

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

pub fn discard_paths(repo_path: &str, paths: &[String]) -> Result<(), GitError> {
    if paths.is_empty() {
        return Ok(());
    }
    let repo = discover(repo_path)?;
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let mut restore = Vec::new();
    let mut remove = Vec::new();
    for file in paths {
        let relative = repo_relative(file)?;
        let in_head = head_tree
            .as_ref()
            .and_then(|tree| tree.get_path(relative).ok())
            .is_some();
        if in_head {
            restore.push(relative.to_path_buf());
        } else {
            remove.push(relative.to_path_buf());
        }
    }
    if !restore.is_empty() {
        let mut checkout = git2::build::CheckoutBuilder::new();
        checkout.force().update_index(true);
        for path in &restore {
            checkout.path(path);
        }
        repo.checkout_head(Some(&mut checkout)).map_err(map_git)?;
    }
    if remove.is_empty() {
        return Ok(());
    }
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitError::Io("El repositorio no tiene directorio de trabajo".into()))?;
    let root = workdir
        .canonicalize()
        .map_err(|err| GitError::Io(err.to_string()))?;
    let mut index = repo.index().map_err(map_git)?;
    for relative in &remove {
        if let Err(err) = index.remove_path(relative)
            && err.code() != git2::ErrorCode::NotFound
        {
            return Err(map_git(err));
        }
        let full = workdir.join(relative);
        let Some(parent) = full.parent() else {
            continue;
        };
        let Ok(parent) = parent.canonicalize() else {
            continue;
        };
        if !parent.starts_with(&root) {
            return Err(GitError::Io(
                "La ruta tiene que quedar dentro del repositorio".into(),
            ));
        }
        let Ok(meta) = std::fs::symlink_metadata(&full) else {
            continue;
        };
        if meta.is_file() || meta.file_type().is_symlink() {
            std::fs::remove_file(&full).map_err(|err| GitError::Io(err.to_string()))?;
        }
    }
    index.write().map_err(map_git)
}

fn repo_relative(file: &str) -> Result<&Path, GitError> {
    let file = file.trim();
    let path = Path::new(file);
    let inside = !file.is_empty()
        && !file.contains('\0')
        && !path.is_absolute()
        && path
            .components()
            .all(|component| matches!(component, Component::Normal(_)));
    if !inside {
        return Err(GitError::Io(
            "La ruta tiene que quedar dentro del repositorio".into(),
        ));
    }
    Ok(path)
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct CommitAuthor {
    pub name: String,
    pub email: String,
    pub detail: String,
    pub current: bool,
}

pub fn list_commit_authors(path: &str) -> Result<Vec<CommitAuthor>, GitError> {
    let repo = discover(path)?;
    let config = repo.config().map_err(map_git)?;
    let current_name = config.get_string("user.name").unwrap_or_default();
    let current_email = config.get_string("user.email").unwrap_or_default();
    let mut configs = Vec::new();
    let mut seen = HashSet::new();
    if let Ok(global) = git2::Config::find_global() {
        read_config_tree(&global, &mut configs, &mut seen, 0);
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let mut keys = Vec::new();
    if !home.is_empty() {
        let ssh = PathBuf::from(&home).join(".ssh");
        if let Ok(entries) = std::fs::read_dir(&ssh) {
            let mut pubs: Vec<_> = entries.filter_map(Result::ok).collect();
            pubs.sort_by_key(|entry| entry.file_name());
            for entry in pubs {
                let file = entry.path();
                if file.extension().and_then(|value| value.to_str()) != Some("pub") {
                    continue;
                }
                let Some(name) = file.file_name().and_then(|value| value.to_str()) else {
                    continue;
                };
                let Ok(text) = std::fs::read_to_string(&file) else {
                    continue;
                };
                let line = text.lines().next().unwrap_or("");
                keys.push((name.to_string(), line.to_string()));
            }
        }
    }
    let config_refs: Vec<(&str, &str)> = configs
        .iter()
        .map(|(detail, text)| (detail.as_str(), text.as_str()))
        .collect();
    let key_refs: Vec<(&str, &str)> = keys
        .iter()
        .map(|(name, line)| (name.as_str(), line.as_str()))
        .collect();
    Ok(collect_commit_authors(
        &current_name,
        &current_email,
        &config_refs,
        &key_refs,
    ))
}

pub fn collect_commit_authors(
    current_name: &str,
    current_email: &str,
    configs: &[(&str, &str)],
    keys: &[(&str, &str)],
) -> Vec<CommitAuthor> {
    let mut seen = HashSet::new();
    let mut authors = Vec::new();
    let current_name = current_name.trim();
    let current_email = current_email.trim();
    if !current_name.is_empty() && !current_email.is_empty() {
        seen.insert(current_email.to_ascii_lowercase());
        authors.push(CommitAuthor {
            name: current_name.to_string(),
            email: current_email.to_string(),
            detail: "este repo".into(),
            current: true,
        });
    }
    for (detail, text) in configs {
        for (name, email) in parse_gitconfig_users(text) {
            if !seen.insert(email.to_ascii_lowercase()) {
                continue;
            }
            authors.push(CommitAuthor {
                name,
                email,
                detail: (*detail).to_string(),
                current: false,
            });
        }
    }
    for (file, line) in keys {
        let Some((name, email)) = author_from_pubkey(line) else {
            continue;
        };
        if !seen.insert(email.to_ascii_lowercase()) {
            continue;
        }
        authors.push(CommitAuthor {
            name,
            email,
            detail: (*file).to_string(),
            current: false,
        });
    }
    authors
}

pub fn parse_gitconfig_includes(text: &str) -> Vec<String> {
    let mut section = String::new();
    let mut paths = Vec::new();
    for raw in text.lines() {
        let line = strip_config_comment(raw.trim());
        if line.is_empty() {
            continue;
        }
        if let Some(next) = section_name(line) {
            section = next;
            continue;
        }
        if section != "include" && section != "includeif" {
            continue;
        }
        if let Some((key, value)) = split_assign(line)
            && key == "path"
            && !value.is_empty()
        {
            paths.push(value);
        }
    }
    paths
}

fn parse_gitconfig_users(text: &str) -> Vec<(String, String)> {
    let mut section = String::new();
    let mut name = None;
    let mut email = None;
    let mut users = Vec::new();
    for raw in text.lines() {
        let line = strip_config_comment(raw.trim());
        if line.is_empty() {
            continue;
        }
        if let Some(next) = section_name(line) {
            push_user(&mut name, &mut email, &mut users);
            section = next;
            continue;
        }
        if section != "user" {
            continue;
        }
        if let Some((key, value)) = split_assign(line) {
            match key {
                "name" => name = Some(value),
                "email" => email = Some(value),
                _ => {}
            }
        }
    }
    push_user(&mut name, &mut email, &mut users);
    users
}

fn push_user(
    name: &mut Option<String>,
    email: &mut Option<String>,
    users: &mut Vec<(String, String)>,
) {
    match (name.take(), email.take()) {
        (Some(name), Some(email)) if !name.is_empty() && !email.is_empty() => {
            users.push((name, email));
        }
        _ => {}
    }
}

fn section_name(line: &str) -> Option<String> {
    let line = line.trim();
    if !line.starts_with('[') || !line.ends_with(']') {
        return None;
    }
    let inner = &line[1..line.len() - 1];
    let name = inner
        .split_whitespace()
        .next()
        .unwrap_or("")
        .trim_matches('"');
    Some(name.to_ascii_lowercase())
}

fn split_assign(line: &str) -> Option<(&str, String)> {
    let (key, value) = line.split_once('=')?;
    let key = key.trim();
    if key.is_empty() || key.contains(char::is_whitespace) {
        return None;
    }
    Some((key, unquote(value.trim())))
}

fn unquote(value: &str) -> String {
    let value = value.trim();
    if value.len() >= 2
        && ((value.starts_with('"') && value.ends_with('"'))
            || (value.starts_with('\'') && value.ends_with('\'')))
    {
        return value[1..value.len() - 1].to_string();
    }
    value.to_string()
}

fn strip_config_comment(line: &str) -> &str {
    if line.starts_with('#') || line.starts_with(';') {
        return "";
    }
    line
}

fn author_from_pubkey(line: &str) -> Option<(String, String)> {
    let comment = line.split_whitespace().last()?.trim();
    let (local, domain) = comment.split_once('@')?;
    if local.is_empty() || domain.is_empty() || domain.contains('@') {
        return None;
    }
    Some((local.to_string(), comment.to_string()))
}

fn read_config_tree(
    path: &Path,
    configs: &mut Vec<(String, String)>,
    seen: &mut HashSet<PathBuf>,
    depth: usize,
) {
    if depth > 4 {
        return;
    }
    let Ok(canonical) = path.canonicalize() else {
        return;
    };
    if !seen.insert(canonical.clone()) {
        return;
    }
    let Ok(text) = std::fs::read_to_string(&canonical) else {
        return;
    };
    configs.push((canonical.display().to_string(), text.clone()));
    let home = std::env::var("HOME").unwrap_or_default();
    let parent = canonical.parent().unwrap_or(Path::new(""));
    for include in parse_gitconfig_includes(&text) {
        let next = expand_config_path(&include, parent, &home);
        read_config_tree(&next, configs, seen, depth + 1);
    }
}

pub fn expand_config_path(raw: &str, base: &Path, home: &str) -> PathBuf {
    if raw == "~" {
        return PathBuf::from(home);
    }
    if let Some(rest) = raw.strip_prefix("~/") {
        return PathBuf::from(home).join(rest);
    }
    let path = PathBuf::from(raw);
    if path.is_absolute() {
        path
    } else {
        base.join(path)
    }
}

pub fn create_commit(
    repo_path: &str,
    summary: &str,
    description: &str,
    author_name: &str,
    author_email: &str,
) -> Result<(), GitError> {
    let summary = summary.trim();
    if summary.is_empty() {
        return Err(GitError::Io("El resumen del commit está vacío".into()));
    }
    let repo = discover(repo_path)?;
    if !index_has_changes(&repo)? {
        return Err(GitError::Io("No hay cambios en stage".into()));
    }
    let signature = commit_signature(&repo, author_name, author_email)?;
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

fn commit_signature(
    repo: &Repository,
    author_name: &str,
    author_email: &str,
) -> Result<git2::Signature<'static>, GitError> {
    if author_name.contains(['\n', '\r']) || author_email.contains(['\n', '\r']) {
        return Err(GitError::Io("El autor del commit no es válido".into()));
    }
    let name = author_name.trim();
    let email = author_email.trim();
    if name.is_empty() && email.is_empty() {
        return repo.signature().map_err(|_| {
            GitError::Io("Falta user.name o user.email en la configuración de git".into())
        });
    }
    if name.is_empty() || email.is_empty() {
        return Err(GitError::Io("El autor del commit no es válido".into()));
    }
    git2::Signature::now(name, email).map_err(map_git)
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StashEntry {
    pub index: u32,
    pub message: String,
    pub branch: Option<String>,
    pub stashed_at: String,
}

pub fn list_stashes(repo_path: &str) -> Result<Vec<StashEntry>, GitError> {
    let mut repo = discover(repo_path)?;
    let mut found = Vec::new();
    repo.stash_foreach(|index, message, oid| {
        found.push((index, message.to_string(), *oid));
        true
    })
    .map_err(map_git)?;
    let mut entries = Vec::with_capacity(found.len());
    for (index, message, oid) in found {
        let stashed_at = repo
            .find_commit(oid)
            .ok()
            .map(|commit| format_time(commit.time()))
            .unwrap_or_default();
        entries.push(StashEntry {
            index: index as u32,
            branch: stash_branch(&message),
            message,
            stashed_at,
        });
    }
    Ok(entries)
}

pub fn save_stash(repo_path: &str, message: &str, include_untracked: bool) -> Result<(), GitError> {
    let mut repo = discover(repo_path)?;
    let signature = repo.signature().map_err(|_| {
        GitError::Io("Falta user.name o user.email en la configuración de git".into())
    })?;
    let mut flags = StashFlags::empty();
    if include_untracked {
        flags.insert(StashFlags::INCLUDE_UNTRACKED);
    }
    let message = message.trim();
    let message = if message.is_empty() {
        None
    } else {
        Some(message)
    };
    repo.stash_save2(&signature, message, Some(flags))
        .map_err(map_git)?;
    Ok(())
}

pub fn apply_stash(repo_path: &str, index: u32) -> Result<(), GitError> {
    let mut repo = discover(repo_path)?;
    let mut options = git2::StashApplyOptions::new();
    repo.stash_apply(index as usize, Some(&mut options))
        .map_err(map_git)
}

pub fn pop_stash(repo_path: &str, index: u32) -> Result<(), GitError> {
    let mut repo = discover(repo_path)?;
    let mut options = git2::StashApplyOptions::new();
    repo.stash_pop(index as usize, Some(&mut options))
        .map_err(map_git)
}

pub fn drop_stash(repo_path: &str, index: u32) -> Result<(), GitError> {
    let mut repo = discover(repo_path)?;
    repo.stash_drop(index as usize).map_err(map_git)
}

fn stash_branch(message: &str) -> Option<String> {
    let rest = message
        .strip_prefix("WIP on ")
        .or_else(|| message.strip_prefix("On "))?;
    let branch = rest.split(':').next()?.trim();
    if branch.is_empty() {
        None
    } else {
        Some(branch.to_string())
    }
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
    let commit = head_commit(&repo)?
        .ok_or_else(|| GitError::Io("No hay commits para crear la rama".into()))?;
    create_named_branch(&repo, name, &commit)
}

pub fn create_branch_at(repo_path: &str, name: &str, sha: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let oid = git2::Oid::from_str(sha.trim()).map_err(map_git)?;
    let commit = repo.find_commit(oid).map_err(map_git)?;
    create_named_branch(&repo, name, &commit)
}

fn create_named_branch(
    repo: &Repository,
    name: &str,
    commit: &git2::Commit<'_>,
) -> Result<(), GitError> {
    let branch_name = name.trim();
    let refname = format!("refs/heads/{branch_name}");
    if branch_name.is_empty() || !git2::Reference::is_valid_name(&refname) {
        return Err(GitError::Io(format!(
            "Nombre de rama inválido: {branch_name}"
        )));
    }
    repo.branch(branch_name, commit, false).map_err(map_git)?;
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

pub fn rename_branch(repo_path: &str, name: &str, next_name: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let current = name.trim();
    let next = next_name.trim();
    let refname = format!("refs/heads/{next}");
    if next.is_empty() || !git2::Reference::is_valid_name(&refname) {
        return Err(GitError::Io(format!("Nombre de rama inválido: {next}")));
    }
    if repo.find_branch(next, BranchType::Local).is_ok() {
        return Err(GitError::Io(format!("Ya existe la rama {next}")));
    }
    let mut branch = repo
        .find_branch(current, BranchType::Local)
        .map_err(|_| GitError::Io(format!("No existe la rama local: {current}")))?;
    branch.rename(next, false).map_err(map_git)?;
    Ok(())
}

pub fn set_upstream(repo_path: &str, name: &str, upstream: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let branch_name = name.trim();
    let upstream_name = upstream.trim();
    if !upstream_name.contains('/') {
        return Err(GitError::Io(
            "El upstream se escribe como origen/rama".into(),
        ));
    }
    let mut branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(|_| GitError::Io(format!("No existe la rama local: {branch_name}")))?;
    branch.set_upstream(Some(upstream_name)).map_err(map_git)?;
    Ok(())
}

pub fn create_tag(repo_path: &str, sha: &str, name: &str, message: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let tag_name = name.trim();
    let refname = format!("refs/tags/{tag_name}");
    if tag_name.is_empty() || !git2::Reference::is_valid_name(&refname) {
        return Err(GitError::Io(format!("Nombre de tag inválido: {tag_name}")));
    }
    let oid = git2::Oid::from_str(sha.trim()).map_err(map_git)?;
    let commit = repo.find_commit(oid).map_err(map_git)?;
    let note = message.trim();
    if note.is_empty() {
        repo.tag_lightweight(tag_name, commit.as_object(), false)
            .map_err(map_git)?;
    } else {
        let signature = repo.signature().map_err(|_| {
            GitError::Io("Falta user.name o user.email en la configuración de git".into())
        })?;
        repo.tag(tag_name, commit.as_object(), &signature, note, false)
            .map_err(map_git)?;
    }
    Ok(())
}

pub fn checkout_commit(repo_path: &str, sha: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let oid = git2::Oid::from_str(sha.trim()).map_err(map_git)?;
    let commit = repo.find_commit(oid).map_err(map_git)?;
    repo.checkout_tree(commit.as_object(), None)
        .map_err(map_git)?;
    repo.set_head_detached(oid).map_err(map_git)?;
    Ok(())
}

const FILE_BYTE_LIMIT: usize = 1024 * 1024;

pub fn fetch(repo_path: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let remote_name = tracking_remote_name(&repo)?.unwrap_or_else(|| "origin".to_string());
    finish_network(fetch_remote(&repo, &remote_name))
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
    finish_network(Ok(()))
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
    finish_network(remote.push(&[refspec], Some(&mut options)).map_err(map_git))
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
    finish_network(builder.clone(url, &dest).map_err(map_git))?;
    let dest_path = dest
        .to_str()
        .ok_or_else(|| GitError::Io("La ruta clonada no es UTF-8".into()))?;
    open_repository(dest_path)
}

pub fn init_repository(directory: &str) -> Result<RepositoryInfo, GitError> {
    let trimmed = directory.trim();
    let path = Path::new(trimmed);
    if !path.is_dir() {
        return Err(GitError::Io("La carpeta no existe".into()));
    }
    if Repository::open(path).is_err() {
        Repository::init(path).map_err(map_git)?;
    }
    open_repository(trimmed)
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
        if activity::cancelled() {
            return Err(git2::Error::from_str("Cancelado"));
        }
        if allowed.contains(git2::CredentialType::SSH_KEY) {
            let user = username_from_url.unwrap_or("git");
            if let Ok(cred) = git2::Cred::ssh_key_from_agent(user) {
                return Ok(cred);
            }
        }
        if allowed.contains(git2::CredentialType::USER_PASS_PLAINTEXT)
            && let Some((protocol, host)) = https_host(url)
        {
            match git_credential_fill(&protocol, &host) {
                Ok((user, password)) => {
                    return git2::Cred::userpass_plaintext(&user, &password);
                }
                Err(error) if error == "Cancelado" || error.contains("no respondió") => {
                    return Err(git2::Error::from_str(&error));
                }
                Err(_) => {}
            }
        }
        if activity::cancelled() {
            return Err(git2::Error::from_str("Cancelado"));
        }
        if allowed.contains(git2::CredentialType::DEFAULT) {
            return git2::Cred::default();
        }
        Err(git2::Error::from_str(
            "No hay credencial. Revisa el agente SSH o git credential.",
        ))
    });
    callbacks.transfer_progress(|progress| {
        if activity::cancelled() {
            return false;
        }
        let message = if progress.total_objects() > 0
            && progress.received_objects() == progress.total_objects()
        {
            format!(
                "resolviendo deltas {}/{}",
                progress.indexed_deltas(),
                progress.total_deltas()
            )
        } else {
            format!(
                "{}/{} objetos",
                progress.received_objects(),
                progress.total_objects()
            )
        };
        activity::report(&message);
        true
    });
    callbacks.sideband_progress(|data| {
        if activity::cancelled() {
            return false;
        }
        if let Ok(text) = std::str::from_utf8(data) {
            activity::report(text);
        }
        true
    });
    callbacks.push_transfer_progress(|current, total, _bytes| {
        if !activity::cancelled() {
            activity::report(&format!("{current}/{total} objetos"));
        }
    });
    callbacks.push_update_reference(|_reference, _status| {
        if activity::cancelled() {
            return Err(git2::Error::from_str("Cancelado"));
        }
        Ok(())
    });
    callbacks
}

fn finish_network<T>(result: Result<T, GitError>) -> Result<T, GitError> {
    if activity::cancelled() {
        return Err(GitError::Io("Cancelado".into()));
    }
    result
}

fn git_credential_fill(protocol: &str, host: &str) -> Result<(String, String), String> {
    let mut child = Command::new("git")
        .args(["credential", "fill"])
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .map_err(|err| err.to_string())?;
    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "git credential no devolvió salida".to_string())?;
    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "git credential no acepta entrada".to_string())?;
        stdin
            .write_all(format!("protocol={protocol}\nhost={host}\n\n").as_bytes())
            .map_err(|err| err.to_string())?;
    }
    let started = Instant::now();
    let status = loop {
        if activity::cancelled() {
            let _ = child.kill();
            return Err("Cancelado".into());
        }
        if started.elapsed() >= Duration::from_secs(20) {
            let _ = child.kill();
            return Err("git credential no respondió".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(err) => return Err(err.to_string()),
        }
    };
    if !status.success() {
        return Err("No hay credencial".into());
    }
    let mut text = String::new();
    stdout
        .read_to_string(&mut text)
        .map_err(|err| err.to_string())?;
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
    match (username, password) {
        (Some(user), Some(password)) => Ok((user, password)),
        _ => Err("No hay credencial".into()),
    }
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
        options
            .include_untracked(true)
            .show_untracked_content(true)
            .recurse_untracked_dirs(true);
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

pub(crate) fn discover(path: &str) -> Result<Repository, GitError> {
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

pub fn staged_commit_prompt(path: &str) -> Result<StagedCommitPrompt, GitError> {
    let repo = discover(path)?;
    let root = repo_root(&repo)?;
    let diff = staged_prompt_diff(&repo)?;
    let subjects = recent_subjects(&repo, RECENT_SUBJECT_LIMIT)?;
    Ok(StagedCommitPrompt {
        root: root.to_string_lossy().into_owned(),
        prompt: commit_message_prompt(&subjects, &diff),
    })
}

pub fn clean_commit_reply(text: &str) -> Result<CommitMessageDraft, GitError> {
    let fenced = strip_fences(text.trim());
    let unquoted = strip_wrapping_quotes(&fenced);
    let mut lines: Vec<&str> = unquoted.lines().map(str::trim_end).collect();
    while lines.first().is_some_and(|line| line.trim().is_empty()) {
        lines.remove(0);
    }
    while lines.last().is_some_and(|line| line.trim().is_empty()) {
        lines.pop();
    }
    let Some(first) = lines.first() else {
        return Err(GitError::Io("El agente no devolvió un mensaje.".into()));
    };
    let summary = strip_wrapping_quotes(strip_reply_label(first.trim()))
        .trim()
        .to_string();
    if summary.is_empty() {
        return Err(GitError::Io("El agente no devolvió un mensaje.".into()));
    }
    let mut body = lines[1..].to_vec();
    while body.first().is_some_and(|line| line.trim().is_empty()) {
        body.remove(0);
    }
    Ok(CommitMessageDraft {
        summary,
        description: body.join("\n").trim().to_string(),
    })
}

fn commit_message_prompt(subjects: &[String], diff: &str) -> String {
    let history = if subjects.is_empty() {
        "(sin commits anteriores)".to_string()
    } else {
        subjects
            .iter()
            .map(|subject| format!("- {subject}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    format!(
        "Escribe el mensaje de git para este diff en stage.\n\
Copia el idioma y la forma de los asuntos recientes.\n\
Una sola línea de asunto, de menos de 72 caracteres.\n\
Añade un cuerpo corto, separado por una línea en blanco, solo si el porqué no se ve en el diff.\n\
Responde solo con el mensaje, sin comillas, sin fences y sin explicación.\n\
\n\
Asuntos recientes:\n\
{history}\n\
\n\
Diff en stage:\n\
{diff}"
    )
}

fn staged_prompt_diff(repo: &Repository) -> Result<String, GitError> {
    let parent = head_commit(repo)?;
    let tree = match &parent {
        Some(commit) => Some(commit.tree().map_err(map_git)?),
        None => None,
    };
    let index = repo.index().map_err(map_git)?;
    let mut options = DiffOptions::new();
    options.context_lines(3);
    let diff = repo
        .diff_tree_to_index(tree.as_ref(), Some(&index), Some(&mut options))
        .map_err(map_git)?;
    if diff.deltas().len() == 0 {
        return Err(GitError::Io(
            "No hay cambios en stage. Pasa archivos a stage antes de generar el mensaje.".into(),
        ));
    }

    let mut included = String::new();
    let mut used = 0usize;
    let mut skipped = Vec::new();
    for index in 0..diff.deltas().len() {
        let (file_path, old_path, kind, binary) = delta_meta(&diff, index)?;
        let label = match old_path {
            Some(old) => format!("{kind} {old} -> {file_path}"),
            None => format!("{kind} {file_path}"),
        };
        let raw = patch_text(&diff, index);
        if is_prompt_noise(&file_path) || binary || raw.starts_with("Archivo binario") {
            skipped.push(label);
            continue;
        }
        if used >= PROMPT_TOTAL_CHARS {
            skipped.push(label);
            continue;
        }
        let room = (PROMPT_TOTAL_CHARS - used).min(PROMPT_FILE_CHARS);
        let chars = raw.chars().count();
        if chars > room {
            let mut cut: String = raw.chars().take(room).collect();
            cut.push_str("\n...[truncado]\n");
            used += cut.chars().count();
            included.push_str(&cut);
        } else {
            included.push_str(&raw);
            if !raw.ends_with('\n') {
                included.push('\n');
            }
            used += chars;
        }
    }
    if !skipped.is_empty() {
        included.push_str("\nArchivos sin parche de texto:\n");
        for item in skipped {
            included.push_str("- ");
            included.push_str(&item);
            included.push('\n');
        }
    }
    Ok(included)
}

fn is_prompt_noise(path: &str) -> bool {
    let name = Path::new(path)
        .file_name()
        .and_then(|value| value.to_str())
        .unwrap_or(path);
    let lower = name.to_ascii_lowercase();
    lower == "pnpm-lock.yaml" || lower == "package-lock.json" || lower.ends_with(".lock")
}

fn recent_subjects(repo: &Repository, limit: usize) -> Result<Vec<String>, GitError> {
    let mut walk = repo.revwalk().map_err(map_git)?;
    if let Err(err) = walk.push_head() {
        if err.code() == git2::ErrorCode::UnbornBranch || err.code() == git2::ErrorCode::NotFound {
            return Ok(Vec::new());
        }
        return Err(map_git(err));
    }
    walk.set_sorting(Sort::TIME).map_err(map_git)?;
    let mut subjects = Vec::new();
    for oid in walk {
        if subjects.len() == limit {
            break;
        }
        let commit = repo.find_commit(oid.map_err(map_git)?).map_err(map_git)?;
        let subject = commit.summary().unwrap_or("").trim();
        if !subject.is_empty() {
            subjects.push(subject.to_string());
        }
    }
    Ok(subjects)
}

fn strip_fences(text: &str) -> String {
    let trimmed = text.trim();
    if !trimmed.starts_with("```") {
        return trimmed.to_string();
    }
    let mut lines: Vec<&str> = trimmed.lines().collect();
    if lines
        .first()
        .is_some_and(|line| line.trim_start().starts_with("```"))
    {
        lines.remove(0);
    }
    if lines
        .last()
        .is_some_and(|line| line.trim().starts_with("```"))
    {
        lines.pop();
    }
    lines.join("\n").trim().to_string()
}

fn strip_wrapping_quotes(text: &str) -> &str {
    let trimmed = text.trim();
    let mut chars = trimmed.chars();
    let Some(open) = chars.next() else {
        return trimmed;
    };
    let Some(close) = chars.next_back() else {
        return trimmed;
    };
    if (open == '"' && close == '"') || (open == '\'' && close == '\'') {
        return trimmed[open.len_utf8()..trimmed.len() - close.len_utf8()].trim();
    }
    trimmed
}

fn strip_reply_label(line: &str) -> &str {
    let trimmed = line.trim();
    for label in ["commit:", "mensaje:", "message:"] {
        if trimmed.len() >= label.len() && trimmed[..label.len()].eq_ignore_ascii_case(label) {
            return trimmed[label.len()..].trim();
        }
    }
    trimmed
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

        discard_paths(&info.path, &["../fuera.txt".to_string()]).expect_err("ruta fuera");
        fs::write(dir.0.join("README.md"), "cambiado\n").expect("edit");
        discard_paths(
            &info.path,
            &["README.md".to_string(), "notes.txt".to_string()],
        )
        .expect("discard");
        assert_eq!(
            fs::read_to_string(dir.0.join("README.md")).expect("readme"),
            "dos\n"
        );
        assert!(!dir.0.join("notes.txt").exists());
        fs::write(dir.0.join("notes.txt"), "pendiente\n").expect("write again");
        stage_paths(&info.path, &["notes.txt".to_string()]).expect("stage otra vez");

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
        let empty = create_commit(&info.path, "vacío", "", "", "").expect_err("sin stage");
        assert_eq!(empty.code(), "IO_ERROR");
        assert_eq!(open_repository(&info.path).expect("same").head_sha, before);

        stage_paths(&info.path, &["notes.txt".to_string()]).expect("stage notes");
        create_commit(&info.path, "Anota", "detalle", "", "").expect("commit");
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
        assert!(added.patch.contains("+pendiente"));

        fs::create_dir_all(dir.0.join("nested")).expect("dir");
        fs::write(dir.0.join("nested/new.txt"), "hola\n").expect("nested");
        let nested = working_tree_diff(path, "nested/new.txt", false).expect("nested diff");
        assert!(nested.patch.contains("+hola"));

        let sha = open_repository(path).expect("open").head_sha.expect("sha");
        create_branch_at(path, "from-sha", &sha).expect("branch at sha");
        let branches = list_branches(path).expect("branches");
        assert!(branches.iter().any(|branch| branch.name == "from-sha"));
    }

    #[test]
    fn saves_lists_and_pops_a_stash() {
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

        let path = dir.0.to_str().expect("utf8");
        save_stash(path, "pausa", false).expect("save");
        assert_eq!(
            fs::read_to_string(dir.0.join("README.md")).expect("read"),
            "uno\n"
        );

        let listed = list_stashes(path).expect("list");
        assert_eq!(listed.len(), 1);
        assert!(listed[0].message.contains("pausa"));
        assert!(listed[0].branch.is_some());
        assert!(!listed[0].stashed_at.is_empty());

        pop_stash(path, listed[0].index).expect("pop");
        assert_eq!(
            fs::read_to_string(dir.0.join("README.md")).expect("back"),
            "dos\n"
        );
        assert!(list_stashes(path).expect("empty").is_empty());
    }

    #[test]
    fn renames_sets_upstream_tags_and_checks_out_a_commit() {
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

        let path = source_path.to_str().unwrap();
        let info = open_repository(path).expect("open");
        let branch = info.current_branch.expect("branch");
        let sha = info.head_sha.expect("sha");

        create_branch(path, "side").expect("side");
        rename_branch(path, "side", "side-renamed").expect("rename");
        let names: Vec<String> = list_branches(path)
            .expect("branches")
            .into_iter()
            .map(|item| item.name)
            .collect();
        assert!(names.iter().any(|name| name == "side-renamed"));
        assert!(!names.iter().any(|name| name == "side"));

        rename_branch(path, &branch, "trunk").expect("rename head");
        let renamed = open_repository(path).expect("renamed");
        assert_eq!(renamed.current_branch.as_deref(), Some("trunk"));
        assert!(!renamed.is_detached);
        assert_eq!(renamed.head_sha.as_deref(), Some(sha.as_str()));

        source
            .remote("origin", origin.to_str().unwrap())
            .expect("remote");
        let mut remote = source.find_remote("origin").expect("find remote");
        remote
            .push(&["refs/heads/trunk:refs/heads/trunk"], None)
            .expect("push");
        set_upstream(path, "trunk", "origin/trunk").expect("upstream");
        let tracked = source
            .find_branch("trunk", BranchType::Local)
            .expect("trunk");
        let upstream = tracked.upstream().expect("has upstream");
        assert_eq!(
            upstream.name().expect("name").expect("text"),
            "origin/trunk"
        );

        create_tag(path, &sha, "v1", "").expect("light");
        create_tag(path, &sha, "v2", "anotado").expect("annotated");
        assert!(source.find_reference("refs/tags/v1").is_ok());
        let annotated = source.find_reference("refs/tags/v2").expect("v2");
        let tag = annotated.peel_to_tag().expect("tag object");
        assert!(tag.message().unwrap_or("").contains("anotado"));
        assert_eq!(
            open_repository(path).expect("still").head_sha.as_deref(),
            Some(sha.as_str())
        );

        checkout_commit(path, &sha).expect("detach");
        let detached = open_repository(path).expect("detached");
        assert!(detached.is_detached);
        assert_eq!(detached.head_sha.as_deref(), Some(sha.as_str()));
    }

    #[test]
    fn inits_a_folder_and_reopens_it() {
        let dir = scratch_dir();
        let path = dir.0.to_str().unwrap();
        let info = init_repository(path).expect("init");
        assert!(dir.0.join(".git").is_dir());
        assert_eq!(info.path, dir.0.canonicalize().unwrap().to_string_lossy());
        let again = init_repository(path).expect("already a repo");
        assert_eq!(again.path, info.path);
    }

    #[test]
    fn builds_a_prompt_from_the_staged_diff_and_cleans_the_reply() {
        let dir = scratch_dir();
        let repo = GitRepository::init(&dir.0).expect("init");
        fs::write(dir.0.join("README.md"), "uno\n").expect("write");
        commit_all(&repo, "Estilo previo");
        fs::write(dir.0.join("README.md"), "dos\n").expect("edit");
        fs::write(dir.0.join("Cargo.lock"), "LOCKTOKEN-NO-DEBE-SALIR\n").expect("lock");
        fs::write(
            dir.0.join("huge.txt"),
            format!("{}TAILTOKEN", "y".repeat(super::PROMPT_FILE_CHARS + 200)),
        )
        .expect("huge");
        let path = dir.0.to_str().unwrap();
        stage_paths(
            path,
            &[
                "README.md".to_string(),
                "Cargo.lock".to_string(),
                "huge.txt".to_string(),
            ],
        )
        .expect("stage");

        let staged = staged_commit_prompt(path).expect("prompt");
        assert!(staged.prompt.contains("Estilo previo"));
        assert!(staged.prompt.contains("README.md"));
        assert!(staged.prompt.contains("+dos"));
        assert!(staged.prompt.contains("Cargo.lock"));
        assert!(staged.prompt.contains("sin parche de texto"));
        assert!(!staged.prompt.contains("LOCKTOKEN-NO-DEBE-SALIR"));
        assert!(staged.prompt.contains("...[truncado]"));
        assert!(!staged.prompt.contains("TAILTOKEN"));

        let empty = scratch_dir();
        let empty_repo = GitRepository::init(&empty.0).expect("init");
        fs::write(empty.0.join("README.md"), "uno\n").expect("write");
        commit_all(&empty_repo, "solo");
        let missing = staged_commit_prompt(empty.0.to_str().unwrap()).expect_err("sin stage");
        assert!(missing.to_string().contains("stage"));

        let cleaned =
            clean_commit_reply("```text\nCommit: \"Anota el cambio\"\n\nEl porqué va aquí.\n```")
                .expect("clean");
        assert_eq!(cleaned.summary, "Anota el cambio");
        assert_eq!(cleaned.description, "El porqué va aquí.");

        let quoted = clean_commit_reply("\"solo asunto\"").expect("quoted");
        assert_eq!(quoted.summary, "solo asunto");
        assert!(quoted.description.is_empty());
        clean_commit_reply("   \n```\n```\n").expect_err("vacío");
    }

    #[test]
    fn lists_the_current_author_and_the_other_identities() {
        let global = "\
[user]
\tname = Global
\temail = global@example.com
[includeIf \"gitdir:/tmp/hina/\"]
\tpath = ~/.gitconfig-hina
";
        let included = "\
[user]
\tname = Hina
\temail = hina@example.com
";
        let authors = collect_commit_authors(
            "Global",
            "global@example.com",
            &[
                ("/home/me/.gitconfig", global),
                ("/home/me/.gitconfig-hina", included),
            ],
            &[("id_ed25519.pub", "ssh-ed25519 AAAA work@example.com")],
        );
        assert_eq!(authors.len(), 3);
        assert!(authors[0].current);
        assert_eq!(authors[0].email, "global@example.com");
        assert_eq!(authors[0].detail, "este repo");
        assert!(authors.iter().any(|author| {
            author.email == "hina@example.com" && author.detail.ends_with(".gitconfig-hina")
        }));
        assert!(authors.iter().any(|author| {
            author.email == "work@example.com"
                && author.name == "work"
                && author.detail == "id_ed25519.pub"
                && !author.current
        }));

        let includes = parse_gitconfig_includes(global);
        assert_eq!(includes, vec!["~/.gitconfig-hina".to_string()]);
        assert_eq!(
            expand_config_path("~/.gitconfig-hina", Path::new("/home/me"), "/home/me"),
            PathBuf::from("/home/me/.gitconfig-hina")
        );

        let duplicated = collect_commit_authors(
            "Global",
            "global@example.com",
            &[("/home/me/.gitconfig", global)],
            &[("id.pub", "ssh-ed25519 AAAA global@example.com")],
        );
        assert_eq!(
            duplicated
                .iter()
                .filter(|author| author.email.eq_ignore_ascii_case("global@example.com"))
                .count(),
            1
        );
    }

    #[test]
    fn commits_with_the_chosen_author() {
        let dir = scratch_dir();
        let repo = GitRepository::init(&dir.0).expect("init");
        let mut config = repo.config().expect("config");
        config.set_str("user.name", "Hydra").expect("name");
        config
            .set_str("user.email", "hydra@example.com")
            .expect("email");
        fs::write(dir.0.join("README.md"), "uno\n").expect("write");
        let path = dir.0.to_str().unwrap();
        stage_paths(path, &["README.md".to_string()]).expect("stage");
        create_commit(path, "Anota", "", "Otra", "otra@example.com").expect("commit");
        let page = list_commits(path, 1, None).expect("log");
        assert_eq!(page.commits[0].author_name, "Otra");
        assert_eq!(page.commits[0].author_email, "otra@example.com");
        assert_ne!(page.commits[0].author_email, "hydra@example.com");

        fs::write(dir.0.join("README.md"), "dos\n").expect("edit");
        stage_paths(path, &["README.md".to_string()]).expect("stage");
        let invalid = create_commit(path, "Malo", "", "linea\n", "a@b.c").expect_err("autor");
        assert_eq!(invalid.code(), "IO_ERROR");
    }
}
