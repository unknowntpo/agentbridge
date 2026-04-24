use serde::Serialize;
use serde_json::Value;
use std::collections::BTreeSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

const MINISHOP_CONTAINER: &str = "/Users/unknowntpo/repo/unknowntpo/minishop";

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct AllowedProject {
  id: String,
  label: String,
  path: String,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ProjectScan {
  id: String,
  label: String,
  root_path: String,
  anchor_path: String,
  github: GithubState,
  worktrees: Vec<WorktreeScan>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct WorktreeScan {
  id: String,
  name: String,
  path: String,
  branch: Option<String>,
  upstream: Option<String>,
  head: String,
  status: String,
  ahead: u32,
  behind: u32,
  remote: GithubState,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct GithubState {
  provider: String,
  auth: String,
  pr: Option<String>,
  pr_url: Option<String>,
  checks: String,
  review: String,
  message: Option<String>,
  mocked: bool,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct CommandOutcome {
  ok: bool,
  message: String,
  stdout: String,
  stderr: String,
}

#[tauri::command]
fn allowed_projects() -> Result<Vec<AllowedProject>, String> {
  Ok(vec![
    AllowedProject {
      id: "agentbridge".to_string(),
      label: "agentbridge".to_string(),
      path: display_path(&current_repo_root()?),
    },
    AllowedProject {
      id: "minishop".to_string(),
      label: "minishop demo".to_string(),
      path: display_path(&canonical_or_existing(Path::new(MINISHOP_CONTAINER))?),
    },
  ])
}

#[tauri::command]
fn scan_project(path: String) -> Result<ProjectScan, String> {
  let requested = canonical_or_existing(Path::new(&path))?;
  ensure_allowed_project_path(&requested)?;

  let minishop = canonical_or_existing(Path::new(MINISHOP_CONTAINER))?;
  let is_minishop_project = requested == minishop || requested.starts_with(&minishop);
  let is_minishop_container = requested == minishop;
  let anchor = if is_minishop_container {
    find_git_child(&requested).ok_or_else(|| format!("No Git worktree found under {}", display_path(&requested)))?
  } else {
    requested.clone()
  };

  let root_path = if is_minishop_project {
    minishop
  } else {
    current_repo_root()?
  };
  let raw = run_git(&anchor, &["worktree", "list", "--porcelain"])?.stdout;
  let mut worktrees = parse_worktree_porcelain(&raw)
    .into_iter()
    .filter_map(|entry| scan_worktree_entry(entry).transpose())
    .collect::<Result<Vec<_>, _>>()?;

  if worktrees.is_empty() {
    worktrees.push(scan_single_worktree(&anchor)?);
  }

  worktrees.sort_by(|left, right| left.name.cmp(&right.name));

  Ok(ProjectScan {
    id: if is_minishop_container { "minishop" } else { "agentbridge" }.to_string(),
    label: if is_minishop_container { "minishop demo" } else { "agentbridge" }.to_string(),
    root_path: display_path(&root_path),
    anchor_path: display_path(&anchor),
    github: github_state_for_path(&anchor),
    worktrees,
  })
}

#[tauri::command]
fn scan_github(worktree_path: String) -> Result<GithubState, String> {
  let path = canonical_or_existing(Path::new(&worktree_path))?;
  ensure_allowed_worktree_path(&path)?;
  Ok(github_state_for_path(&path))
}

#[tauri::command]
fn create_worktree(project_root: String, branch_name: String, base_ref: String) -> Result<CommandOutcome, String> {
  let root = canonical_or_existing(Path::new(&project_root))?;
  let minishop = canonical_or_existing(Path::new(MINISHOP_CONTAINER))?;
  if root != minishop {
    return Err("Creating sibling worktrees is enabled only for the minishop demo container in this MVP.".to_string());
  }

  let branch = branch_name.trim();
  if branch.is_empty() || branch.contains("..") || branch.starts_with('-') {
    return Err("Branch name is empty or unsafe.".to_string());
  }
  let safe_dir = branch.replace('/', "-");
  let target = root.join(safe_dir);
  if target.exists() {
    return Err(format!("Target worktree already exists: {}", display_path(&target)));
  }

  let anchor = find_git_child(&root).ok_or_else(|| "No minishop anchor worktree found.".to_string())?;
  let base = if base_ref.trim().is_empty() { "HEAD" } else { base_ref.trim() };
  let outcome = run_git(&anchor, &["worktree", "add", "-b", branch, &display_path(&target), base])?;
  Ok(outcome)
}

#[tauri::command]
fn push_branch(worktree_path: String) -> Result<CommandOutcome, String> {
  let path = canonical_or_existing(Path::new(&worktree_path))?;
  ensure_allowed_worktree_path(&path)?;
  run_git(&path, &["push", "-u", "origin", "HEAD"])
}

#[tauri::command]
fn open_pr(worktree_path: String) -> Result<GithubState, String> {
  let path = canonical_or_existing(Path::new(&worktree_path))?;
  ensure_allowed_worktree_path(&path)?;

  let existing = github_state_for_path(&path);
  if existing.auth != "ok" {
    return Ok(existing);
  }

  let status = Command::new("gh")
    .args(["pr", "create", "--fill", "--json", "number,url,state,mergeStateStatus"])
    .current_dir(&path)
    .output()
    .map_err(|error| format!("failed to run gh pr create: {error}"))?;

  if !status.status.success() {
    return Ok(GithubState {
      provider: "GitHub".to_string(),
      auth: "ok".to_string(),
      pr: existing.pr,
      pr_url: existing.pr_url,
      checks: "unknown".to_string(),
      review: "unknown".to_string(),
      message: Some(String::from_utf8_lossy(&status.stderr).trim().to_string()),
      mocked: true,
    });
  }

  Ok(github_state_from_pr_json(&String::from_utf8_lossy(&status.stdout), "ok".to_string(), None))
}

fn scan_worktree_entry(entry: WorktreeEntry) -> Result<Option<WorktreeScan>, String> {
  let path = canonical_or_existing(Path::new(&entry.path))?;
  if !is_allowed_worktree_path(&path) {
    return Ok(None);
  }
  Ok(Some(scan_single_worktree_with_git(&path, entry.branch, entry.head)?))
}

fn scan_single_worktree(path: &Path) -> Result<WorktreeScan, String> {
  let branch = run_git(path, &["branch", "--show-current"])
    .ok()
    .map(|outcome| outcome.stdout.trim().to_string())
    .filter(|value| !value.is_empty());
  let head = run_git(path, &["rev-parse", "HEAD"])
    .map(|outcome| outcome.stdout.trim().to_string())
    .unwrap_or_else(|_| "unknown".to_string());
  scan_single_worktree_with_git(path, branch, head)
}

fn scan_single_worktree_with_git(path: &Path, branch: Option<String>, head: String) -> Result<WorktreeScan, String> {
  let status_output = run_git(path, &["status", "--porcelain"]).ok().map(|outcome| outcome.stdout).unwrap_or_default();
  let upstream = run_git(path, &["rev-parse", "--abbrev-ref", "--symbolic-full-name", "@{upstream}"])
    .ok()
    .map(|outcome| outcome.stdout.trim().to_string())
    .filter(|value| !value.is_empty());
  let (ahead, behind) = upstream
    .as_ref()
    .and_then(|_| run_git(path, &["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]).ok())
    .and_then(|outcome| {
      let mut parts = outcome.stdout.split_whitespace();
      let behind = parts.next()?.parse::<u32>().ok()?;
      let ahead = parts.next()?.parse::<u32>().ok()?;
      Some((ahead, behind))
    })
    .unwrap_or((0, 0));

  Ok(WorktreeScan {
    id: worktree_id(path),
    name: path.file_name().and_then(|name| name.to_str()).unwrap_or("worktree").to_string(),
    path: display_path(path),
    branch,
    upstream,
    head: if head.len() > 7 { head[..7].to_string() } else { head },
    status: if status_output.trim().is_empty() { "clean" } else { "dirty" }.to_string(),
    ahead,
    behind,
    remote: github_state_for_path(path),
  })
}

fn github_state_for_path(path: &Path) -> GithubState {
  let auth = Command::new("gh").args(["auth", "status"]).current_dir(path).output();
  let auth_output = match auth {
    Ok(output) if output.status.success() => output,
    Ok(output) => {
      return GithubState {
        provider: "GitHub".to_string(),
        auth: "unavailable".to_string(),
        pr: None,
        pr_url: None,
        checks: "mocked".to_string(),
        review: "mocked".to_string(),
        message: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
        mocked: true,
      };
    }
    Err(error) => {
      return GithubState {
        provider: "GitHub".to_string(),
        auth: "unavailable".to_string(),
        pr: None,
        pr_url: None,
        checks: "mocked".to_string(),
        review: "mocked".to_string(),
        message: Some(format!("failed to run gh auth status: {error}")),
        mocked: true,
      };
    }
  };

  let _ = auth_output;
  let pr = Command::new("gh")
    .args(["pr", "view", "--json", "number,url,state,mergeStateStatus,reviewDecision,statusCheckRollup"])
    .current_dir(path)
    .output();
  match pr {
    Ok(output) if output.status.success() => {
      github_state_from_pr_json(&String::from_utf8_lossy(&output.stdout), "ok".to_string(), None)
    }
    Ok(output) => GithubState {
      provider: "GitHub".to_string(),
      auth: "ok".to_string(),
      pr: None,
      pr_url: None,
      checks: "none".to_string(),
      review: "none".to_string(),
      message: Some(String::from_utf8_lossy(&output.stderr).trim().to_string()),
      mocked: false,
    },
    Err(error) => GithubState {
      provider: "GitHub".to_string(),
      auth: "ok".to_string(),
      pr: None,
      pr_url: None,
      checks: "unknown".to_string(),
      review: "unknown".to_string(),
      message: Some(format!("failed to run gh pr view: {error}")),
      mocked: true,
    },
  }
}

fn github_state_from_pr_json(raw: &str, auth: String, message: Option<String>) -> GithubState {
  let value = serde_json::from_str::<Value>(raw).unwrap_or(Value::Null);
  let number = value.get("number").and_then(Value::as_i64);
  let url = value.get("url").and_then(Value::as_str).map(str::to_string);
  let review = value
    .get("reviewDecision")
    .and_then(Value::as_str)
    .unwrap_or("unknown")
    .to_ascii_lowercase();
  let checks = value
    .get("mergeStateStatus")
    .and_then(Value::as_str)
    .unwrap_or("unknown")
    .to_ascii_lowercase();

  GithubState {
    provider: "GitHub".to_string(),
    auth,
    pr: number.map(|id| format!("#{id}")),
    pr_url: url,
    checks,
    review,
    message,
    mocked: false,
  }
}

#[derive(Debug)]
struct WorktreeEntry {
  path: String,
  head: String,
  branch: Option<String>,
}

fn parse_worktree_porcelain(raw: &str) -> Vec<WorktreeEntry> {
  let mut entries = Vec::new();
  let mut path: Option<String> = None;
  let mut head: Option<String> = None;
  let mut branch: Option<String> = None;
  let mut prunable = false;

  for line in raw.lines().chain([""].iter().copied()) {
    if line.trim().is_empty() {
      if let (Some(path), Some(head)) = (path.take(), head.take()) {
        if !prunable {
          entries.push(WorktreeEntry { path, head, branch: branch.take() });
        }
      }
      path = None;
      head = None;
      branch = None;
      prunable = false;
      continue;
    }

    if let Some(value) = line.strip_prefix("worktree ") {
      path = Some(value.to_string());
    } else if let Some(value) = line.strip_prefix("HEAD ") {
      head = Some(value.to_string());
    } else if let Some(value) = line.strip_prefix("branch refs/heads/") {
      branch = Some(value.to_string());
    } else if line.starts_with("prunable") {
      prunable = true;
    }
  }

  entries
}

fn run_git(path: &Path, args: &[&str]) -> Result<CommandOutcome, String> {
  let output = Command::new("git")
    .args(args)
    .current_dir(path)
    .output()
    .map_err(|error| format!("failed to run git {}: {error}", args.join(" ")))?;
  let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
  let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
  if !output.status.success() {
    return Err(CommandOutcome {
      ok: false,
      message: format!("git {} failed", args.join(" ")),
      stdout,
      stderr,
    }.message);
  }
  Ok(CommandOutcome {
    ok: true,
    message: format!("git {} succeeded", args.join(" ")),
    stdout,
    stderr,
  })
}

fn current_repo_root() -> Result<PathBuf, String> {
  let manifest = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
  manifest
    .parent()
    .map(Path::to_path_buf)
    .ok_or_else(|| "Cannot resolve current repo root.".to_string())
    .and_then(|path| canonical_or_existing(&path))
}

fn canonical_or_existing(path: &Path) -> Result<PathBuf, String> {
  fs::canonicalize(path).map_err(|error| format!("Cannot resolve {}: {error}", display_path(path)))
}

fn ensure_allowed_project_path(path: &Path) -> Result<(), String> {
  let current = current_repo_root()?;
  let minishop = canonical_or_existing(Path::new(MINISHOP_CONTAINER))?;
  if path == current || path == minishop || path.starts_with(&minishop) {
    return Ok(());
  }
  Err(format!("Path is outside AgentHub allowlist: {}", display_path(path)))
}

fn ensure_allowed_worktree_path(path: &Path) -> Result<(), String> {
  if is_allowed_worktree_path(path) {
    return Ok(());
  }
  Err(format!("Worktree is outside AgentHub allowlist: {}", display_path(path)))
}

fn is_allowed_worktree_path(path: &Path) -> bool {
  let Ok(current) = current_repo_root() else {
    return false;
  };
  let Ok(minishop) = canonical_or_existing(Path::new(MINISHOP_CONTAINER)) else {
    return false;
  };
  path == current || path.starts_with(minishop)
}

fn find_git_child(container: &Path) -> Option<PathBuf> {
  let mut candidates = BTreeSet::new();
  for entry in fs::read_dir(container).ok()?.flatten() {
    let path = entry.path();
    if path.join(".git").exists() {
      candidates.insert(path);
    }
  }
  candidates.into_iter().next()
}

fn worktree_id(path: &Path) -> String {
  path.to_string_lossy()
    .chars()
    .map(|ch| if ch.is_ascii_alphanumeric() { ch.to_ascii_lowercase() } else { '-' })
    .collect::<String>()
    .split('-')
    .filter(|part| !part.is_empty())
    .collect::<Vec<_>>()
    .join("-")
}

fn display_path(path: &Path) -> String {
  path.to_string_lossy().to_string()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  tauri::Builder::default()
    .plugin(tauri_plugin_opener::init())
    .invoke_handler(tauri::generate_handler![
      allowed_projects,
      scan_project,
      scan_github,
      create_worktree,
      push_branch,
      open_pr,
    ])
    .run(tauri::generate_context!())
    .expect("error while running AgentHub desktop app");
}
