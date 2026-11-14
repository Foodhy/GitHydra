mod error;

use chrono::{DateTime, FixedOffset};
pub use error::GitError;
use git2::{BranchType, Delta, DiffOptions, Repository, Sort, Status, StatusOptions};
use serde::Serialize;
use std::path::{Path, PathBuf};

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

// Mutaciones (stage, commit, checkout) quedan fuera de esta fase.
// Cuando existan, deben devolver `GitError::NotImplemented` hasta tener
// una implementación real, en lugar de escribir el índice a medias.

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
}
