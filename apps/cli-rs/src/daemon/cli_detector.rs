/// CLI detector — detects installed agent CLIs and GitHub CLI.
/// Results are cached for 1 hour (configurable via env AGENT_CLI_DETECTION_CACHE_TTL_SECS).
use serde::{Deserialize, Serialize};
use std::process::Command;
use std::sync::Mutex;
use std::time::{Duration, Instant};
use tracing::debug;

const DEFAULT_CACHE_TTL_SECS: u64 = 3600; // 1 hour
#[allow(dead_code)]
const VERSION_TIMEOUT_SECS: u64 = 5;

// ── Shell PATH resolution ──────────────────────────────────────────────────

/// Resolved shell PATH, cached after the first load.
static SHELL_PATH: Mutex<Option<String>> = Mutex::new(None);

/// Returns the PATH from a login shell, falling back to the process PATH.
/// Spawns `$SHELL --login -c 'printenv PATH'` once and caches the result.
fn shell_path() -> String {
    let mut guard = SHELL_PATH.lock().unwrap();
    if let Some(ref p) = *guard {
        return p.clone();
    }

    let resolved = resolve_shell_path().unwrap_or_else(|| {
        std::env::var("PATH").unwrap_or_default()
    });
    *guard = Some(resolved.clone());
    resolved
}

fn resolve_shell_path() -> Option<String> {
    let shell = std::env::var("SHELL").ok()?;
    let output = Command::new(&shell)
        .args(["--login", "-c", "printenv PATH"])
        .output()
        .ok()?;
    if !output.status.success() {
        return None;
    }
    let path = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if path.is_empty() { None } else { Some(path) }
}

fn which_in_shell(cmd: &str) -> Option<std::path::PathBuf> {
    which::which_in(cmd, Some(shell_path()), std::env::current_dir().unwrap_or_default()).ok()
}

/// Supported agent CLI definitions.
static AGENT_CLIS: &[(&str, &str)] = &[
    ("opencode", "opencode"),
    ("codex", "codex"),
    ("claude", "claude"),
    ("gemini", "gemini"),
    ("pi", "pi"),
    ("copilot", "copilot"),
    ("cursor-agent", "cursor"),
];

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CliStatus {
    pub tool_id: String,
    pub category: String,
    pub label: String,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    pub status_detail: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GhStatus {
    pub tool_id: String,
    pub category: String,
    pub label: String,
    pub installed: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub version: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub authenticated: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub account: Option<String>,
    pub status_detail: String,
}

struct CachedResult<T: Clone> {
    value: T,
    cached_at: Instant,
    ttl: Duration,
}

impl<T: Clone> CachedResult<T> {
    fn is_fresh(&self) -> bool {
        self.cached_at.elapsed() < self.ttl
    }
}

static AGENT_CACHE: Mutex<Option<CachedResult<Vec<CliStatus>>>> = Mutex::new(None);
static GH_CACHE: Mutex<Option<CachedResult<GhStatus>>> = Mutex::new(None);

fn cache_ttl() -> Duration {
    let secs = std::env::var("AGENT_CLI_DETECTION_CACHE_TTL_SECS")
        .ok()
        .and_then(|s| s.parse::<u64>().ok())
        .unwrap_or(DEFAULT_CACHE_TTL_SECS);
    Duration::from_secs(secs)
}

/// Detect all agent CLIs. Returns cached results unless `force_refresh` is true.
pub fn detect_agent_clis(force_refresh: bool) -> Vec<CliStatus> {
    {
        let guard = AGENT_CACHE.lock().unwrap();
        if let Some(ref cached) = *guard {
            if !force_refresh && cached.is_fresh() {
                return cached.value.clone();
            }
        }
    }

    let statuses: Vec<CliStatus> = AGENT_CLIS
        .iter()
        .map(|(kind, cmd)| detect_one_agent(kind, cmd))
        .collect();

    let ttl = cache_ttl();
    let mut guard = AGENT_CACHE.lock().unwrap();
    *guard = Some(CachedResult {
        value: statuses.clone(),
        cached_at: Instant::now(),
        ttl,
    });
    statuses
}

fn detect_one_agent(kind: &str, cmd: &str) -> CliStatus {
    let label = agent_label(kind);
    let (installed, version, detail) = match probe_agent(cmd) {
        None => (false, None, "not installed".to_string()),
        Some(ver) => {
            let detail = ver.as_deref().unwrap_or("installed").to_string();
            debug!(tool = kind, version = ?ver, "agent CLI detected");
            (true, ver, detail)
        }
    };
    CliStatus {
        tool_id: kind.to_string(),
        category: "agent".to_string(),
        label,
        installed,
        version,
        status_detail: detail,
    }
}

/// Detect GitHub CLI installation and authentication status.
pub fn detect_gh(force_refresh: bool) -> GhStatus {
    {
        let guard = GH_CACHE.lock().unwrap();
        if let Some(ref cached) = *guard {
            if !force_refresh && cached.is_fresh() {
                return cached.value.clone();
            }
        }
    }

    let status = detect_gh_inner();
    let ttl = cache_ttl();
    let mut guard = GH_CACHE.lock().unwrap();
    *guard = Some(CachedResult {
        value: status.clone(),
        cached_at: Instant::now(),
        ttl,
    });
    status
}

fn detect_gh_inner() -> GhStatus {
    let gh_path = match which_in_shell("gh") {
        Some(p) => p,
        None => {
            debug!("gh not found in shell PATH");
            return GhStatus {
                tool_id: "gh".to_string(),
                category: "vcs".to_string(),
                label: "GitHub CLI".to_string(),
                installed: false,
                version: None,
                authenticated: None,
                account: None,
                status_detail: "not installed".to_string(),
            };
        }
    };

    debug!(gh_path = %gh_path.display(), "gh binary found");
    let version = run_version_check_path(&gh_path);

    // Check auth status via structured JSON — avoids fragile text parsing.
    // `gh auth status --json hosts` exits 0 when at least one account is active.
    let auth_output = std::process::Command::new(&gh_path)
        .args(["auth", "status", "--json", "hosts"])
        .output()
        .ok();

    let (authenticated, account) = if let Some(out) = auth_output {
        let exit_code = out.status.code();
        let stdout = String::from_utf8_lossy(&out.stdout);
        let stderr = String::from_utf8_lossy(&out.stderr);
        debug!(exit_code = ?exit_code, stdout = %stdout, stderr = %stderr, "gh auth status output");
        if out.status.success() {
            let json: serde_json::Value =
                serde_json::from_slice(&out.stdout).unwrap_or_default();
            let hosts = json.get("hosts").and_then(|h| h.as_object());
            let acct = hosts.and_then(|map| {
                map.values()
                    .find_map(|entries| {
                        entries
                            .as_array()?
                            .iter()
                            .find(|e| e.get("active").and_then(|v| v.as_bool()).unwrap_or(false))
                            .and_then(|e| e.get("login"))
                            .and_then(|v| v.as_str())
                            .map(|s| s.to_string())
                    })
            });
            (Some(true), acct)
        } else {
            (Some(false), None)
        }
    } else {
        debug!("gh auth status command failed to spawn");
        (None, None)
    };

    let detail = match authenticated {
        Some(true) => account
            .as_deref()
            .map(|a| format!("authenticated as {a}"))
            .unwrap_or_else(|| "authenticated".into()),
        Some(false) => "not authenticated".into(),
        None => "installed".into(),
    };

    GhStatus {
        tool_id: "gh".to_string(),
        category: "vcs".to_string(),
        label: "GitHub CLI".to_string(),
        installed: true,
        version,
        authenticated,
        account,
        status_detail: detail,
    }
}

/// Detect all supported tools and return a unified list sorted by category + id.
pub fn detect_all(force_refresh: bool) -> Vec<serde_json::Value> {
    let mut results: Vec<serde_json::Value> = detect_agent_clis(force_refresh)
        .into_iter()
        .map(|s| serde_json::to_value(s).unwrap_or_default())
        .collect();
    results.push(serde_json::to_value(detect_gh(force_refresh)).unwrap_or_default());

    results.sort_by(|a, b| {
        let cat_a = a["category"].as_str().unwrap_or("");
        let cat_b = b["category"].as_str().unwrap_or("");
        cat_a.cmp(cat_b).then_with(|| {
            let id_a = a["toolId"].as_str().unwrap_or("");
            let id_b = b["toolId"].as_str().unwrap_or("");
            id_a.cmp(id_b)
        })
    });
    results
}

// ── helpers ────────────────────────────────────────────────────────────────

fn run_version_check(cmd: &str) -> Option<String> {
    let path = which_in_shell(cmd)?;
    run_version_check_path(&path)
}

fn run_version_check_path(path: &std::path::Path) -> Option<String> {
    let output = Command::new(path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None;
    }
    let text = String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr);
    extract_semver(&text)
}

/// Returns `None` if the binary is absent or its `--version` invocation fails
/// (e.g. a stub/wrapper that exits non-zero when the real tool is missing).
fn probe_agent(cmd: &str) -> Option<Option<String>> {
    let path = which_in_shell(cmd)?;
    let output = Command::new(&path).arg("--version").output().ok()?;
    if !output.status.success() {
        return None; // wrapper / shim with no real binary behind it
    }
    let text = String::from_utf8_lossy(&output.stdout).to_string()
        + &String::from_utf8_lossy(&output.stderr);
    Some(extract_semver(&text)) // Some(Some(ver)) or Some(None) if no semver found
}

static SEMVER_RE: std::sync::LazyLock<regex::Regex> = std::sync::LazyLock::new(|| {
    regex::Regex::new(r"\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.\-]+)?").unwrap()
});

fn extract_semver(text: &str) -> Option<String> {
    SEMVER_RE.find(text).map(|m| m.as_str().to_string())
}

fn agent_label(kind: &str) -> String {
    match kind {
        "opencode" => "OpenCode",
        "codex" => "Codex CLI",
        "claude" => "Claude Code",
        "gemini" => "Gemini CLI",
        "pi" => "Pi CLI",
        "copilot" => "GitHub Copilot",
        "cursor-agent" => "Cursor Agent",
        _ => kind,
    }
    .to_string()
}
