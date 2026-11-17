pub mod activity;
mod error;
pub mod files;

use chrono::{DateTime, FixedOffset};
pub use error::GitError;
use git2::{
    BranchType, Delta, DiffOptions, Repository, Sort, StashFlags, Status, StatusOptions,
    WorktreeAddOptions, WorktreeLockStatus, WorktreePruneOptions,
};
use serde::{Deserialize, Serialize};
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
    let key = lock_key(path);
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

fn lock_key(path: &str) -> String {
    if let Ok(repo) = discover(path)
        && let Ok(common) = canonical_common(&repo)
    {
        return common.to_string_lossy().into_owned();
    }
    std::fs::canonicalize(path)
        .map(|value| value.to_string_lossy().into_owned())
        .unwrap_or_else(|_| path.trim().to_string())
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
    let copies = collect_worktrees(&repo).unwrap_or_default();

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
    let name = disambiguated_name(&root, current_branch.as_deref(), is_detached, &copies);

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
                "Resolve the conflict before staging: {file}"
            )));
        }
    }
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitError::Io("The repository has no working directory".into()))?;
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
        .ok_or_else(|| GitError::Io("The repository has no working directory".into()))?;
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
                "The path must stay inside the repository".into(),
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
            "The path must stay inside the repository".into(),
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
        return Err(GitError::Io("The commit summary is empty".into()));
    }
    let repo = discover(repo_path)?;
    if !index_has_changes(&repo)? {
        return Err(GitError::Io("Nothing is staged".into()));
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
    let _ = std::fs::remove_file(repo.path().join("githydra-proposal.json"));
    Ok(())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitProposal {
    pub summary: String,
    pub description: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowDiffRequest {
    pub file: String,
    pub staged: bool,
    pub missing: bool,
}

#[derive(Debug, Deserialize)]
struct ShowDiffFile {
    file: String,
    #[serde(default)]
    staged: bool,
}

pub fn read_commit_proposal(repo_path: &str) -> Result<Option<CommitProposal>, GitError> {
    let repo = discover(repo_path)?;
    let path = repo.path().join("githydra-proposal.json");
    let text = match std::fs::read_to_string(path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(GitError::Io(error.to_string())),
    };
    let proposal = serde_json::from_str::<CommitProposal>(&text)
        .map_err(|error| GitError::Io(format!("The commit proposal is not valid: {error}")))?;
    Ok(Some(proposal))
}

pub fn take_show_diff(repo_path: &str) -> Result<Option<ShowDiffRequest>, GitError> {
    let repo = discover(repo_path)?;
    let path = repo.path().join("githydra-show.json");
    let text = match std::fs::read_to_string(&path) {
        Ok(text) => text,
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return Ok(None),
        Err(error) => return Err(GitError::Io(error.to_string())),
    };
    let _ = std::fs::remove_file(&path);
    let request = serde_json::from_str::<ShowDiffFile>(&text)
        .map_err(|error| GitError::Io(format!("The diff request is not valid: {error}")))?;
    let workdir = repo
        .workdir()
        .ok_or_else(|| GitError::Io("The repository has no working directory".into()))?;
    let full = workdir.join(&request.file);
    let inside = full.starts_with(workdir);
    Ok(Some(ShowDiffRequest {
        missing: !inside || !full.is_file(),
        file: request.file,
        staged: request.staged,
    }))
}

fn commit_signature(
    repo: &Repository,
    author_name: &str,
    author_email: &str,
) -> Result<git2::Signature<'static>, GitError> {
    if author_name.contains(['\n', '\r']) || author_email.contains(['\n', '\r']) {
        return Err(GitError::Io("The commit author is not valid".into()));
    }
    let name = author_name.trim();
    let email = author_email.trim();
    if name.is_empty() && email.is_empty() {
        return repo
            .signature()
            .map_err(|_| GitError::Io("Missing user.name or user.email in the git config".into()));
    }
    if name.is_empty() || email.is_empty() {
        return Err(GitError::Io("The commit author is not valid".into()));
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
    let signature = repo
        .signature()
        .map_err(|_| GitError::Io("Missing user.name or user.email in the git config".into()))?;
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
        .map_err(|_| GitError::Io(format!("No local branch: {branch_name}")))?;
    if branch.is_head() {
        return Ok(());
    }
    if let Some(holder) = branch_holder(&repo, branch_name)? {
        return Err(GitError::Io(occupied_message(branch_name, &holder)));
    }
    let object = branch
        .get()
        .peel(git2::ObjectType::Commit)
        .map_err(map_git)?;
    let refname = branch
        .get()
        .name()
        .ok_or_else(|| GitError::Io(format!("The branch has no name: {branch_name}")))?
        .to_string();
    repo.checkout_tree(&object, None).map_err(map_git)?;
    repo.set_head(&refname).map_err(map_git)
}

pub fn create_branch(repo_path: &str, name: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let commit = head_commit(&repo)?
        .ok_or_else(|| GitError::Io("No commits to create the branch".into()))?;
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
        return Err(GitError::Io(format!("Invalid branch name: {branch_name}")));
    }
    repo.branch(branch_name, commit, false).map_err(map_git)?;
    Ok(())
}

pub fn delete_branch(repo_path: &str, name: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let branch_name = name.trim();
    let mut branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(|_| GitError::Io(format!("No local branch: {branch_name}")))?;
    if branch.is_head() {
        return Err(GitError::Io("Cannot delete the current branch".into()));
    }
    if let Some(holder) = branch_holder(&repo, branch_name)? {
        return Err(GitError::Io(occupied_message(branch_name, &holder)));
    }
    branch.delete().map_err(map_git)
}

pub fn rename_branch(repo_path: &str, name: &str, next_name: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let current = name.trim();
    let next = next_name.trim();
    let refname = format!("refs/heads/{next}");
    if next.is_empty() || !git2::Reference::is_valid_name(&refname) {
        return Err(GitError::Io(format!("Invalid branch name: {next}")));
    }
    if repo.find_branch(next, BranchType::Local).is_ok() {
        return Err(GitError::Io(format!("Branch {next} already exists")));
    }
    let mut branch = repo
        .find_branch(current, BranchType::Local)
        .map_err(|_| GitError::Io(format!("No local branch: {current}")))?;
    branch.rename(next, false).map_err(map_git)?;
    Ok(())
}

pub fn set_upstream(repo_path: &str, name: &str, upstream: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let branch_name = name.trim();
    let upstream_name = upstream.trim();
    if !upstream_name.contains('/') {
        return Err(GitError::Io("Write the upstream as origin/branch".into()));
    }
    let mut branch = repo
        .find_branch(branch_name, BranchType::Local)
        .map_err(|_| GitError::Io(format!("No local branch: {branch_name}")))?;
    branch.set_upstream(Some(upstream_name)).map_err(map_git)?;
    Ok(())
}

pub fn create_tag(repo_path: &str, sha: &str, name: &str, message: &str) -> Result<(), GitError> {
    let repo = discover(repo_path)?;
    let tag_name = name.trim();
    let refname = format!("refs/tags/{tag_name}");
    if tag_name.is_empty() || !git2::Reference::is_valid_name(&refname) {
        return Err(GitError::Io(format!("Invalid tag name: {tag_name}")));
    }
    let oid = git2::Oid::from_str(sha.trim()).map_err(map_git)?;
    let commit = repo.find_commit(oid).map_err(map_git)?;
    let note = message.trim();
    if note.is_empty() {
        repo.tag_lightweight(tag_name, commit.as_object(), false)
            .map_err(map_git)?;
    } else {
        let signature = repo.signature().map_err(|_| {
            GitError::Io("Missing user.name or user.email in the git config".into())
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
        .map_err(|_| GitError::Io("The branch has no upstream".into()))?;
    let annotated = repo
        .reference_to_annotated_commit(upstream.get())
        .map_err(map_git)?;
    let (analysis, _) = repo.merge_analysis(&[&annotated]).map_err(map_git)?;
    if analysis.is_up_to_date() {
        return Ok(());
    }
    if !analysis.is_fast_forward() {
        return Err(GitError::Io(
            "A merge is required. This version only moves forward on a fast-forward.".into(),
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
        .map_err(|_| GitError::Io(format!("No remote {remote_name}")))?;
    let refspec = format!("refs/heads/{local}:refs/heads/{remote_branch}");
    let mut options = git2::PushOptions::new();
    options.remote_callbacks(remote_callbacks());
    finish_network(remote.push(&[refspec], Some(&mut options)).map_err(map_git))
}

pub fn clone_repository(url: &str, directory: &str) -> Result<RepositoryInfo, GitError> {
    let url = url.trim();
    if url.is_empty() {
        return Err(GitError::Io("The URL is empty".into()));
    }
    let parent = Path::new(directory.trim());
    if !parent.is_dir() {
        return Err(GitError::Io("The destination folder does not exist".into()));
    }
    let name = repo_name_from_url(url)?;
    let dest = parent.join(&name);
    if dest.exists() {
        let mut entries = std::fs::read_dir(&dest).map_err(|err| GitError::Io(err.to_string()))?;
        if entries.next().is_some() {
            return Err(GitError::Io(format!(
                "The folder already exists and is not empty: {}",
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
        .ok_or_else(|| GitError::Io("The cloned path is not UTF-8".into()))?;
    open_repository(dest_path)
}

pub fn init_repository(directory: &str) -> Result<RepositoryInfo, GitError> {
    let trimmed = directory.trim();
    let path = Path::new(trimmed);
    if !path.is_dir() {
        return Err(GitError::Io("The folder does not exist".into()));
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
        Err(_) => return Ok(format!("The commit has no {file}")),
    };
    let blob = match repo.find_blob(entry.id()) {
        Ok(blob) => blob,
        Err(_) => return Ok("This file cannot be shown.".into()),
    };
    if blob.is_binary() {
        return Ok("Binary file, no text view.".into());
    }
    if blob.size() > FILE_BYTE_LIMIT {
        return Ok("The file is over 1 MB and is not shown.".into());
    }
    Ok(String::from_utf8_lossy(blob.content()).into_owned())
}

fn fetch_remote(repo: &Repository, remote_name: &str) -> Result<(), GitError> {
    let mut remote = repo
        .find_remote(remote_name)
        .map_err(|_| GitError::Io(format!("No remote {remote_name}")))?;
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
            return Err(GitError::Io("No commits".into()));
        }
        Err(err) => return Err(map_git(err)),
    };
    if !head.is_branch() {
        return Err(GitError::Io("HEAD is not on a branch".into()));
    }
    let local = head.shorthand().unwrap_or("").to_string();
    let branch = git2::Branch::wrap(head);
    let upstream = branch
        .upstream()
        .map_err(|_| GitError::Io("The branch has no upstream".into()))?;
    let full = upstream.name().map_err(map_git)?.unwrap_or("").to_string();
    let Some((remote_name, remote_branch)) = full.split_once('/') else {
        return Err(GitError::Io("The branch has no upstream".into()));
    };
    if remote_name.is_empty() || remote_branch.is_empty() {
        return Err(GitError::Io("The branch has no upstream".into()));
    }
    Ok((local, remote_name.to_string(), remote_branch.to_string()))
}

fn remote_callbacks() -> git2::RemoteCallbacks<'static> {
    let mut callbacks = git2::RemoteCallbacks::new();
    callbacks.credentials(|url, username_from_url, allowed| {
        if activity::cancelled() {
            return Err(git2::Error::from_str("Cancelled"));
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
                Err(error) if error == "Cancelled" || error.contains("did not respond") => {
                    return Err(git2::Error::from_str(&error));
                }
                Err(_) => {}
            }
        }
        if activity::cancelled() {
            return Err(git2::Error::from_str("Cancelled"));
        }
        if allowed.contains(git2::CredentialType::DEFAULT) {
            return git2::Cred::default();
        }
        Err(git2::Error::from_str(
            "No credential. Check the SSH agent or git credential.",
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
                "resolving deltas {}/{}",
                progress.indexed_deltas(),
                progress.total_deltas()
            )
        } else {
            format!(
                "{}/{} objects",
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
            activity::report(&format!("{current}/{total} objects"));
        }
    });
    callbacks.push_update_reference(|_reference, _status| {
        if activity::cancelled() {
            return Err(git2::Error::from_str("Cancelled"));
        }
        Ok(())
    });
    callbacks
}

fn finish_network<T>(result: Result<T, GitError>) -> Result<T, GitError> {
    if activity::cancelled() {
        return Err(GitError::Io("Cancelled".into()));
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
        .ok_or_else(|| "git credential returned no output".to_string())?;
    {
        let mut stdin = child
            .stdin
            .take()
            .ok_or_else(|| "git credential accepts no input".to_string())?;
        stdin
            .write_all(format!("protocol={protocol}\nhost={host}\n\n").as_bytes())
            .map_err(|err| err.to_string())?;
    }
    let started = Instant::now();
    let status = loop {
        if activity::cancelled() {
            let _ = child.kill();
            return Err("Cancelled".into());
        }
        if started.elapsed() >= Duration::from_secs(20) {
            let _ = child.kill();
            return Err("git credential did not respond".into());
        }
        match child.try_wait() {
            Ok(Some(status)) => break status,
            Ok(None) => thread::sleep(Duration::from_millis(50)),
            Err(err) => return Err(err.to_string()),
        }
    };
    if !status.success() {
        return Err("No credential".into());
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
        _ => Err("No credential".into()),
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
        return Err(GitError::Io("Could not read the repository name".into()));
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
        return Err(GitError::Io("Missing file path".into()));
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
            "Binary file, no text patch.\n".to_string()
        } else {
            let raw = patch_text(&diff, index);
            if raw.len() > PATCH_BYTE_LIMIT {
                let mut cut: String = raw.chars().take(PATCH_BYTE_LIMIT).collect();
                cut.push_str("\nPatch truncated.\n");
                cut
            } else {
                raw
            }
        };
        break;
    }
    let binary = binary || before.starts_with("Binary file") || after.starts_with("Binary file");
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
        .ok_or_else(|| GitError::Io("The repository has no working directory".into()))?;
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
        return Ok("Binary file, no text view.\n".into());
    }
    read_limited(blob.content())
}

fn read_limited(bytes: &[u8]) -> Result<String, GitError> {
    if bytes.len() > FILE_BYTE_LIMIT {
        return Ok("The file is over 1 MB and is not shown.\n".into());
    }
    if bytes.contains(&0) {
        return Ok("Binary file, no text view.\n".into());
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
            "Binary file, no text patch.\n".to_string()
        } else {
            patch_text(&diff, index)
        };
        let patch = if used >= PATCH_BYTE_LIMIT {
            truncated = true;
            "Patch truncated.\n".to_string()
        } else if used + raw.len() > PATCH_BYTE_LIMIT {
            truncated = true;
            used = PATCH_BYTE_LIMIT;
            let mut cut: String = raw.chars().take(PATCH_BYTE_LIMIT).collect();
            cut.push_str("\nPatch truncated.\n");
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
        return Err(GitError::Io("The diff delta does not exist".into()));
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
        return "Binary file, no text patch.\n".to_string();
    };
    match patch.to_buf() {
        Ok(buf) => {
            let text = String::from_utf8_lossy(&buf).into_owned();
            if text.contains("Binary files") {
                "Binary file, no text patch.\n".to_string()
            } else {
                text
            }
        }
        Err(_) => "Binary file, no text patch.\n".to_string(),
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
        return Err(GitError::Io(format!("The path does not exist: {trimmed}")));
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
            .ok_or_else(|| GitError::Io("The repository has no working directory".into()))?
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
        return Err(GitError::Io("The agent returned no message.".into()));
    };
    let summary = strip_wrapping_quotes(strip_reply_label(first.trim()))
        .trim()
        .to_string();
    if summary.is_empty() {
        return Err(GitError::Io("The agent returned no message.".into()));
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
        "(no earlier commits)".to_string()
    } else {
        subjects
            .iter()
            .map(|subject| format!("- {subject}"))
            .collect::<Vec<_>>()
            .join("\n")
    };
    format!(
        "Write the git message for this staged diff.\n\
Copy the language and shape of the recent subjects.\n\
One subject line, under 72 characters.\n\
Add a short body, separated by a blank line, only when the why is not in the diff.\n\
Reply with the message only, no quotes, no fences, and no explanation.\n\
\n\
Recent subjects:\n\
{history}\n\
\n\
Staged diff:\n\
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
            "Nothing is staged. Stage files before generating a message.".into(),
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
        if is_prompt_noise(&file_path) || binary || raw.starts_with("Binary file") {
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
            cut.push_str("\n...[truncated]\n");
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
        included.push_str("\nFiles with no text patch:\n");
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

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LinkedWorktree {
    pub path: String,
    pub branch: Option<String>,
    pub head_sha: Option<String>,
    pub is_detached: bool,
    pub locked: bool,
    pub lock_reason: Option<String>,
    pub missing: bool,
    pub is_main: bool,
    pub is_current: bool,
    pub situation: String,
}

pub struct AddWorktreeRequest {
    pub directory: String,
    pub branch: String,
    pub sha: Option<String>,
    pub create_branch: bool,
}

pub fn list_worktrees(path: &str) -> Result<Vec<LinkedWorktree>, GitError> {
    let repo = discover(path)?;
    collect_worktrees(&repo)
}

pub fn add_worktree(path: &str, request: &AddWorktreeRequest) -> Result<RepositoryInfo, GitError> {
    let repo = discover(path)?;
    let branch_name = request.branch.trim();
    if branch_name.is_empty() {
        return Err(GitError::Io("Invalid branch name".into()));
    }
    let directory = canonical_dest(Path::new(request.directory.trim()));
    if directory.as_os_str().is_empty() {
        return Err(GitError::Io("Missing destination folder".into()));
    }
    let copies = collect_worktrees(&repo)?;
    reject_inside_workdir(&copies, &directory)?;
    if directory.exists() && !directory_is_empty(&directory)? {
        return Err(GitError::Io(format!(
            "The destination folder already exists: {}",
            directory.display()
        )));
    }
    let created = if request.create_branch {
        if repo.find_branch(branch_name, BranchType::Local).is_ok() {
            return Err(GitError::Io(format!("Branch {branch_name} already exists")));
        }
        let sha = request
            .sha
            .as_deref()
            .map(str::trim)
            .filter(|sha| !sha.is_empty());
        let commit = if let Some(sha) = sha {
            let oid = git2::Oid::from_str(sha).map_err(map_git)?;
            repo.find_commit(oid).map_err(map_git)?
        } else {
            head_commit(&repo)?
                .ok_or_else(|| GitError::Io("No commits to create the branch".into()))?
        };
        create_named_branch(&repo, branch_name, &commit)?;
        true
    } else {
        if repo.find_branch(branch_name, BranchType::Local).is_err() {
            return Err(GitError::Io(format!("No local branch: {branch_name}")));
        }
        if let Some(holder) = copies
            .iter()
            .find(|copy| copy.branch.as_deref() == Some(branch_name))
        {
            return Err(GitError::Io(occupied_message(branch_name, holder)));
        }
        false
    };

    let added = add_linked(&repo, &directory, branch_name);
    if let Err(error) = added {
        if created {
            let _ = delete_local_branch(&repo, branch_name);
        }
        return Err(error);
    }
    let created_path = added?;
    open_repository(&created_path.to_string_lossy())
}

pub fn remove_worktree(path: &str, worktree_path: &str, force: bool) -> Result<(), GitError> {
    let repo = discover(path)?;
    let main = open_main(&repo)?;
    let wanted = canonical_dest(Path::new(worktree_path.trim()));
    if let Some(workdir) = main.workdir()
        && same_path(workdir, &wanted)
    {
        return Err(GitError::Io("The main folder cannot be removed.".into()));
    }
    let worktree = find_linked(&main, &wanted)?;
    if matches!(
        worktree.is_locked().map_err(map_git)?,
        WorktreeLockStatus::Locked(_)
    ) {
        return Err(GitError::Io(
            "It is locked. Unlock it before removing.".into(),
        ));
    }
    let recorded = worktree.path().to_path_buf();
    let missing = worktree.validate().is_err() || !recorded.exists();
    if missing {
        return Err(GitError::Io(
            "The folder is gone. Prune it to free the branch.".into(),
        ));
    }
    if !force && worktree_is_dirty(&recorded)? {
        return Err(GitError::Io(format!(
            "There are uncommitted changes in {}. Confirm again to remove it.",
            recorded.display()
        )));
    }
    let mut options = WorktreePruneOptions::new();
    options.valid(true).working_tree(true);
    worktree.prune(Some(&mut options)).map_err(map_git)?;
    if recorded.exists() {
        remove_with_git(&main, &recorded)?;
    }
    Ok(())
}

pub fn unlock_worktree(path: &str, worktree_path: &str) -> Result<(), GitError> {
    let repo = discover(path)?;
    let main = open_main(&repo)?;
    let wanted = canonical_dest(Path::new(worktree_path.trim()));
    let worktree = find_linked(&main, &wanted)?;
    if matches!(
        worktree.is_locked().map_err(map_git)?,
        WorktreeLockStatus::Unlocked
    ) {
        return Ok(());
    }
    worktree.unlock().map_err(map_git)
}

pub fn prune_worktrees(path: &str) -> Result<(), GitError> {
    let repo = discover(path)?;
    let main = open_main(&repo)?;
    let names = main.worktrees().map_err(map_git)?;
    for name in names.iter().flatten() {
        let worktree = main.find_worktree(name).map_err(map_git)?;
        let mut probe = WorktreePruneOptions::new();
        if !worktree.is_prunable(Some(&mut probe)).unwrap_or(false) {
            continue;
        }
        let mut options = WorktreePruneOptions::new();
        worktree.prune(Some(&mut options)).map_err(map_git)?;
    }
    Ok(())
}

fn collect_worktrees(repo: &Repository) -> Result<Vec<LinkedWorktree>, GitError> {
    let current = repo_root(repo)?;
    let main = open_main(repo)?;
    let mut copies = Vec::new();
    if let Some(workdir) = main.workdir() {
        let root = workdir
            .canonicalize()
            .unwrap_or_else(|_| workdir.to_path_buf());
        let (branch, head_sha, is_detached) = read_repo_head(&main)?;
        let is_current = same_path(&root, &current);
        copies.push(described_worktree(CopyParts {
            path: root,
            branch,
            head_sha,
            is_detached,
            locked: false,
            lock_reason: None,
            missing: false,
            is_main: true,
            is_current,
        }));
    }
    let common = canonical_common(&main)?;
    let names = main.worktrees().map_err(map_git)?;
    for name in names.iter().flatten() {
        let worktree = main.find_worktree(name).map_err(map_git)?;
        let recorded = worktree.path().to_path_buf();
        let missing = worktree.validate().is_err() || !recorded.exists();
        let (locked, lock_reason) = match worktree.is_locked().map_err(map_git)? {
            WorktreeLockStatus::Unlocked => (false, None),
            WorktreeLockStatus::Locked(reason) => (true, reason.filter(|text| !text.is_empty())),
        };
        let path = if missing {
            recorded
        } else {
            recorded.canonicalize().unwrap_or(recorded)
        };
        let (branch, head_sha, is_detached) = if missing {
            read_worktree_head_file(&common, name, &main)?
        } else {
            match Repository::open(&path) {
                Ok(linked) => read_repo_head(&linked)?,
                Err(_) => read_worktree_head_file(&common, name, &main)?,
            }
        };
        let is_current = !missing && same_path(&path, &current);
        copies.push(described_worktree(CopyParts {
            path,
            branch,
            head_sha,
            is_detached,
            locked,
            lock_reason,
            missing,
            is_main: false,
            is_current,
        }));
    }
    Ok(copies)
}

struct CopyParts {
    path: PathBuf,
    branch: Option<String>,
    head_sha: Option<String>,
    is_detached: bool,
    locked: bool,
    lock_reason: Option<String>,
    missing: bool,
    is_main: bool,
    is_current: bool,
}

fn described_worktree(copy: CopyParts) -> LinkedWorktree {
    let situation = worktree_situation(
        copy.locked,
        copy.lock_reason.as_deref(),
        copy.missing,
        copy.is_detached,
        copy.is_main,
        copy.is_current,
        copy.head_sha.as_deref(),
    );
    LinkedWorktree {
        path: copy.path.to_string_lossy().into_owned(),
        branch: copy.branch,
        head_sha: copy.head_sha,
        is_detached: copy.is_detached,
        locked: copy.locked,
        lock_reason: copy.lock_reason,
        missing: copy.missing,
        is_main: copy.is_main,
        is_current: copy.is_current,
        situation,
    }
}

fn worktree_situation(
    locked: bool,
    lock_reason: Option<&str>,
    missing: bool,
    is_detached: bool,
    is_main: bool,
    is_current: bool,
    head_sha: Option<&str>,
) -> String {
    if locked && missing {
        return "Locked and the folder is gone. Prune skips it: unlock, then prune. If the disk is just unmounted, do not unlock.".into();
    }
    if locked {
        return match lock_reason.filter(|reason| !reason.is_empty()) {
            Some(reason) => format!("Locked: {reason}. Remove fails until you unlock."),
            None => "Locked. Remove fails until you unlock.".into(),
        };
    }
    if missing {
        return "The folder is gone. The branch is still checked out. Prune frees it.".into();
    }
    if is_current {
        return "This is the open folder.".into();
    }
    if is_detached {
        let sha = head_sha.unwrap_or("");
        let short: String = sha.chars().take(7).collect();
        return format!("Detached HEAD at {short}.");
    }
    if is_main {
        return "Main folder. It cannot be removed.".into();
    }
    "Another folder of the same history.".into()
}

fn occupied_message(branch: &str, holder: &LinkedWorktree) -> String {
    if holder.locked && holder.missing {
        return format!(
            "{branch} is still checked out by a locked copy whose folder is gone ({}). Unlock it, then prune.",
            holder.path
        );
    }
    if holder.missing {
        return format!(
            "{branch} is still checked out by a missing copy at {}. Prune it to free the branch.",
            holder.path
        );
    }
    format!("{branch} is checked out at {}", holder.path)
}

fn branch_holder(repo: &Repository, branch: &str) -> Result<Option<LinkedWorktree>, GitError> {
    let current = repo_root(repo)?;
    let copies = collect_worktrees(repo)?;
    Ok(copies.into_iter().find(|copy| {
        copy.branch.as_deref() == Some(branch) && !same_path(Path::new(&copy.path), &current)
    }))
}

fn add_linked(repo: &Repository, directory: &Path, branch_name: &str) -> Result<PathBuf, GitError> {
    let main = open_main(repo)?;
    if let Some(parent) = directory.parent() {
        std::fs::create_dir_all(parent).map_err(|err| GitError::Io(err.to_string()))?;
    }
    let names = main.worktrees().map_err(map_git)?;
    let existing: Vec<String> = names.iter().flatten().map(ToOwned::to_owned).collect();
    let admin = worktree_admin_name(directory, branch_name, &existing);
    let found = main
        .find_branch(branch_name, BranchType::Local)
        .map_err(|_| GitError::Io(format!("No local branch: {branch_name}")))?;
    let reference = found.into_reference();
    let mut options = WorktreeAddOptions::new();
    options.reference(Some(&reference));
    main.worktree(&admin, directory, Some(&options))
        .map_err(map_git)?;
    Ok(directory.to_path_buf())
}

fn worktree_admin_name(directory: &Path, branch: &str, existing: &[String]) -> String {
    let raw = directory
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or(branch);
    let mut name: String = raw
        .chars()
        .map(|char| {
            if char == '/' || char == '\\' {
                '-'
            } else {
                char
            }
        })
        .collect();
    if name.is_empty() || name == "." || name == ".." {
        name = branch.replace('/', "-");
    }
    let base = name.clone();
    let mut suffix = 2;
    while existing.iter().any(|item| item == &name) {
        name = format!("{base}-{suffix}");
        suffix += 1;
    }
    name
}

fn delete_local_branch(repo: &Repository, name: &str) -> Result<(), GitError> {
    let mut branch = repo.find_branch(name, BranchType::Local).map_err(map_git)?;
    branch.delete().map_err(map_git)
}

fn find_linked(main: &Repository, wanted: &Path) -> Result<git2::Worktree, GitError> {
    let names = main.worktrees().map_err(map_git)?;
    for name in names.iter().flatten() {
        let worktree = main.find_worktree(name).map_err(map_git)?;
        if same_path(worktree.path(), wanted) {
            return Ok(worktree);
        }
    }
    Err(GitError::Io(format!(
        "Not in the copy list: {}",
        wanted.display()
    )))
}

fn reject_inside_workdir(copies: &[LinkedWorktree], directory: &Path) -> Result<(), GitError> {
    for copy in copies {
        if copy.missing {
            continue;
        }
        let root = PathBuf::from(&copy.path);
        if !directory.starts_with(&root) || directory == root {
            continue;
        }
        let repo = Repository::open(&root).map_err(map_git)?;
        let relative = directory
            .strip_prefix(&root)
            .map_err(|err| GitError::Io(err.to_string()))?;
        let ignored = repo.is_path_ignored(relative).unwrap_or(false);
        if !ignored {
            return Err(GitError::Io(
                "The destination is inside the working tree. Choose a sibling folder, or an ignored path.".into(),
            ));
        }
    }
    Ok(())
}

fn directory_is_empty(path: &Path) -> Result<bool, GitError> {
    if !path.is_dir() {
        return Ok(false);
    }
    let mut entries = std::fs::read_dir(path).map_err(|err| GitError::Io(err.to_string()))?;
    Ok(entries.next().is_none())
}

fn worktree_is_dirty(path: &Path) -> Result<bool, GitError> {
    let repo = Repository::open(path).map_err(map_git)?;
    let mut options = StatusOptions::new();
    options
        .include_untracked(true)
        .include_ignored(false)
        .recurse_untracked_dirs(false);
    let statuses = repo.statuses(Some(&mut options)).map_err(map_git)?;
    Ok(!statuses.is_empty())
}

fn remove_with_git(main: &Repository, directory: &Path) -> Result<(), GitError> {
    let cwd = main.workdir().unwrap_or_else(|| main.path());
    let output = Command::new("git")
        .arg("-C")
        .arg(cwd)
        .args(["worktree", "remove", "--force"])
        .arg(directory)
        .output()
        .map_err(|err| GitError::Io(err.to_string()))?;
    if output.status.success() && !directory.exists() {
        return Ok(());
    }
    let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
    if stderr.is_empty() {
        Err(GitError::Io(format!(
            "Could not remove the folder {}",
            directory.display()
        )))
    } else {
        Err(GitError::Io(stderr))
    }
}

fn open_main(repo: &Repository) -> Result<Repository, GitError> {
    if repo.is_worktree() {
        Repository::open(canonical_common(repo)?).map_err(map_git)
    } else {
        let root = repo_root(repo)?;
        Repository::open(&root).map_err(map_git)
    }
}

fn canonical_common(repo: &Repository) -> Result<PathBuf, GitError> {
    let gitdir = repo.path().to_path_buf();
    let common_raw = repo.commondir();
    let common = if common_raw.is_absolute() {
        common_raw.to_path_buf()
    } else {
        gitdir.join(common_raw)
    };
    std::fs::canonicalize(&common).map_err(|err| GitError::Io(err.to_string()))
}

fn read_repo_head(repo: &Repository) -> Result<(Option<String>, Option<String>, bool), GitError> {
    let is_detached = repo.head_detached().unwrap_or(false);
    let head = match repo.head() {
        Ok(head) => Some(head),
        Err(err) if err.code() == git2::ErrorCode::UnbornBranch => None,
        Err(err) => return Err(map_git(err)),
    };
    let head_sha = head
        .as_ref()
        .and_then(|reference| reference.target().map(|oid| oid.to_string()));
    let branch = if is_detached {
        None
    } else {
        head.as_ref()
            .and_then(|reference| reference.shorthand().map(ToOwned::to_owned))
    };
    Ok((branch, head_sha, is_detached))
}

fn read_worktree_head_file(
    common: &Path,
    name: &str,
    main: &Repository,
) -> Result<(Option<String>, Option<String>, bool), GitError> {
    let text = std::fs::read_to_string(common.join("worktrees").join(name).join("HEAD"))
        .unwrap_or_default();
    let text = text.trim();
    if let Some(reference) = text.strip_prefix("ref: ") {
        let reference = reference.trim();
        let branch = reference
            .strip_prefix("refs/heads/")
            .unwrap_or(reference)
            .to_string();
        let sha = main
            .find_reference(reference)
            .ok()
            .and_then(|found| found.target())
            .map(|oid| oid.to_string());
        return Ok((Some(branch), sha, false));
    }
    if text.len() >= 7 {
        return Ok((None, Some(text.to_string()), true));
    }
    Ok((None, None, true))
}

fn disambiguated_name(
    root: &Path,
    branch: Option<&str>,
    detached: bool,
    copies: &[LinkedWorktree],
) -> String {
    let base = root
        .file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("repository")
        .to_string();
    let collision = copies.iter().any(|copy| {
        let other = Path::new(&copy.path);
        other != root && file_name(other) == base
    });
    if !collision {
        return base;
    }
    if !detached && let Some(branch) = branch {
        return format!("{base} · {branch}");
    }
    let parent = root
        .parent()
        .and_then(|path| path.file_name())
        .and_then(|name| name.to_str())
        .unwrap_or("");
    if parent.is_empty() {
        base
    } else {
        format!("{parent}/{base}")
    }
}

fn file_name(path: &Path) -> String {
    path.file_name()
        .and_then(|name| name.to_str())
        .unwrap_or("repository")
        .to_string()
}

fn same_path(left: &Path, right: &Path) -> bool {
    match (left.canonicalize(), right.canonicalize()) {
        (Ok(left), Ok(right)) => left == right,
        _ => normalize_lexical(left) == normalize_lexical(right),
    }
}

fn canonical_dest(path: &Path) -> PathBuf {
    let lexical = if path.is_absolute() {
        normalize_lexical(path)
    } else {
        normalize_lexical(&std::env::current_dir().unwrap_or_default().join(path))
    };
    let mut cursor = lexical.clone();
    let mut suffix = Vec::new();
    while !cursor.exists() {
        let Some(name) = cursor.file_name().map(ToOwned::to_owned) else {
            break;
        };
        suffix.push(name);
        if !cursor.pop() {
            break;
        }
    }
    let mut canon = std::fs::canonicalize(&cursor).unwrap_or(cursor);
    for name in suffix.iter().rev() {
        canon.push(name);
    }
    canon
}

fn normalize_lexical(path: &Path) -> PathBuf {
    let mut out = PathBuf::new();
    for component in path.components() {
        match component {
            Component::CurDir => {}
            Component::ParentDir => {
                out.pop();
            }
            other => out.push(other.as_os_str()),
        }
    }
    out
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
        assert!(staged.prompt.contains("no text patch"));
        assert!(!staged.prompt.contains("LOCKTOKEN-NO-DEBE-SALIR"));
        assert!(staged.prompt.contains("...[truncated]"));
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

    fn init_repo(scratch: &Scratch) -> PathBuf {
        let repo_dir = scratch.0.join("repo");
        fs::create_dir_all(&repo_dir).expect("repo");
        let repo = GitRepository::init(&repo_dir).expect("init");
        fs::write(repo_dir.join("README.md"), "uno\n").expect("write");
        commit_all(&repo, "first");
        repo_dir
    }

    #[test]
    fn worktree_add_lists_blocks_checkout_and_removes() {
        let scratch = scratch_dir();
        let repo_dir = init_repo(&scratch);
        let path = repo_dir.to_str().unwrap();
        let sibling = scratch.0.join("repo-prueba");
        let created = add_worktree(
            path,
            &AddWorktreeRequest {
                directory: sibling.to_string_lossy().into_owned(),
                branch: "prueba".into(),
                sha: None,
                create_branch: true,
            },
        )
        .expect("alta");
        assert_eq!(created.current_branch.as_deref(), Some("prueba"));
        assert!(sibling.exists());
        assert_ne!(created.path, path);

        let listed = list_worktrees(path).expect("lista");
        assert!(listed.iter().any(|copy| {
            copy.is_main && copy.is_current && copy.situation.contains("open folder")
        }));
        let prueba = listed
            .iter()
            .find(|copy| copy.branch.as_deref() == Some("prueba"))
            .expect("prueba");
        assert!(prueba.situation.contains("same history"));

        let checkout = checkout_branch(path, "prueba").expect_err("ocupada");
        let checkout_text = checkout.to_string();
        assert!(checkout_text.contains("prueba is checked out at"));
        assert!(checkout_text.contains(&prueba.path));
        let deleted = delete_branch(path, "prueba").expect_err("borrar ocupada");
        assert!(deleted.to_string().contains("prueba is checked out at"));

        fs::write(sibling.join("extra.txt"), "x\n").expect("dirty");
        let dirty = remove_worktree(path, &prueba.path, false).expect_err("sin force");
        assert!(dirty.to_string().contains("Confirm again"));
        assert!(sibling.exists());
        remove_worktree(path, &prueba.path, true).expect("quitar");
        assert!(!sibling.exists());
        delete_branch(path, "prueba").expect("rama libre");
    }

    #[test]
    fn pruning_a_deleted_folder_frees_the_branch() {
        let scratch = scratch_dir();
        let repo_dir = init_repo(&scratch);
        let path = repo_dir.to_str().unwrap();
        let sibling = scratch.0.join("repo-ausente");
        add_worktree(
            path,
            &AddWorktreeRequest {
                directory: sibling.to_string_lossy().into_owned(),
                branch: "ausente".into(),
                sha: None,
                create_branch: true,
            },
        )
        .expect("alta");
        fs::remove_dir_all(&sibling).expect("rm");
        let listed = list_worktrees(path).expect("lista");
        let gone = listed
            .iter()
            .find(|copy| copy.branch.as_deref() == Some("ausente"))
            .expect("ausente");
        assert!(gone.missing);
        assert!(gone.situation.contains("folder is gone"));
        let blocked = delete_branch(path, "ausente").expect_err("sigue ocupada");
        assert!(blocked.to_string().contains("missing copy"));
        prune_worktrees(path).expect("podar");
        delete_branch(path, "ausente").expect("libre");
        assert!(
            list_worktrees(path)
                .expect("después")
                .iter()
                .all(|copy| copy.branch.as_deref() != Some("ausente"))
        );
    }

    #[test]
    fn locked_worktree_stays_until_unlock_and_locked_missing_survives_prune() {
        let scratch = scratch_dir();
        let repo_dir = init_repo(&scratch);
        let path = repo_dir.to_str().unwrap();
        let sibling = scratch.0.join("repo-candado");
        add_worktree(
            path,
            &AddWorktreeRequest {
                directory: sibling.to_string_lossy().into_owned(),
                branch: "candado".into(),
                sha: None,
                create_branch: true,
            },
        )
        .expect("alta");
        let repo = GitRepository::open(&repo_dir).expect("abrir");
        let names = repo.worktrees().expect("nombres");
        let name = names.iter().flatten().next().expect("nombre");
        let worktree = repo.find_worktree(name).expect("worktree");
        worktree.lock(Some("agente")).expect("lock");

        let listed = list_worktrees(path).expect("lista");
        let locked = listed
            .iter()
            .find(|copy| copy.branch.as_deref() == Some("candado"))
            .expect("candado");
        assert!(locked.locked);
        assert_eq!(locked.lock_reason.as_deref(), Some("agente"));
        assert!(locked.situation.contains("Locked: agente"));
        let refused = remove_worktree(path, &locked.path, true).expect_err("bloqueada");
        assert!(refused.to_string().contains("Unlock it"));

        fs::remove_dir_all(&sibling).expect("rm");
        prune_worktrees(path).expect("podar no toca el candado");
        let still = list_worktrees(path).expect("sigue");
        let stuck = still
            .iter()
            .find(|copy| copy.branch.as_deref() == Some("candado"))
            .expect("sigue la fila");
        assert!(stuck.locked && stuck.missing);
        assert!(stuck.situation.contains("unlock, then prune"));
        let occupied = delete_branch(path, "candado").expect_err("ocupada");
        assert!(occupied.to_string().contains("locked copy"));
        unlock_worktree(path, &stuck.path).expect("unlock");
        prune_worktrees(path).expect("podar");
        delete_branch(path, "candado").expect("libre");
    }

    #[test]
    fn worktree_destination_inside_the_tree_needs_an_ignore_rule() {
        let scratch = scratch_dir();
        let repo_dir = init_repo(&scratch);
        let path = repo_dir.to_str().unwrap();
        let visible = repo_dir.join("visible").join("copy");
        let rejected = add_worktree(
            path,
            &AddWorktreeRequest {
                directory: visible.to_string_lossy().into_owned(),
                branch: "visible".into(),
                sha: None,
                create_branch: true,
            },
        )
        .expect_err("dentro");
        assert!(rejected.to_string().contains("inside the working tree"));
        assert!(
            GitRepository::open(&repo_dir)
                .unwrap()
                .find_branch("visible", git2::BranchType::Local)
                .is_err()
        );

        fs::write(repo_dir.join(".gitignore"), "nested/\n").expect("ignore");
        let nested = repo_dir.join("nested").join("copy");
        let created = add_worktree(
            path,
            &AddWorktreeRequest {
                directory: nested.to_string_lossy().into_owned(),
                branch: "nested".into(),
                sha: None,
                create_branch: true,
            },
        )
        .expect("ignorada");
        assert_eq!(created.current_branch.as_deref(), Some("nested"));
        remove_worktree(path, &created.path, false).expect("quitar");
    }

    #[test]
    fn matching_folder_names_are_disambiguated() {
        let scratch = scratch_dir();
        let repo_dir = init_repo(&scratch);
        let path = repo_dir.to_str().unwrap();
        let other = scratch.0.join("otra").join("repo");
        add_worktree(
            path,
            &AddWorktreeRequest {
                directory: other.to_string_lossy().into_owned(),
                branch: "lado".into(),
                sha: None,
                create_branch: true,
            },
        )
        .expect("alta");
        let main = open_repository(path).expect("main");
        let copy = open_repository(other.to_str().unwrap()).expect("copia");
        assert!(main.name.contains(" · "));
        assert!(copy.name.contains(" · "));
        assert_ne!(main.name, copy.name);
        assert!(copy.name.contains("lado"));
    }

    #[test]
    fn two_worktrees_of_one_repo_share_the_lock() {
        let scratch = scratch_dir();
        let repo_dir = init_repo(&scratch);
        let path = repo_dir.to_str().unwrap().to_string();
        let sibling = scratch.0.join("repo-lock");
        let created = add_worktree(
            &path,
            &AddWorktreeRequest {
                directory: sibling.to_string_lossy().into_owned(),
                branch: "lock".into(),
                sha: None,
                create_branch: true,
            },
        )
        .expect("alta");
        let linked = created.path.clone();
        let gate = std::sync::Arc::new(std::sync::Barrier::new(2));
        let entered = gate.clone();
        let main_path = path.clone();
        let worker = std::thread::spawn(move || {
            with_repo(&main_path, || {
                entered.wait();
                std::thread::sleep(std::time::Duration::from_millis(250));
            });
        });
        gate.wait();
        let started = std::time::Instant::now();
        with_repo(&linked, || {
            create_branch(&linked, "desde-copia").expect("rama");
        });
        assert!(started.elapsed() >= std::time::Duration::from_millis(180));
        worker.join().expect("hilo");
        assert!(
            list_branches(&path)
                .expect("ramas")
                .iter()
                .any(|branch| branch.name == "desde-copia")
        );
    }
}
