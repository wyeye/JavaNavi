use std::env;
use std::fmt;
use std::fs::{self, OpenOptions};
use std::io::{Read, Write};
use std::net::{IpAddr, Ipv4Addr, SocketAddr, TcpListener, TcpStream};
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::thread;
use std::time::{Duration, Instant, SystemTime, UNIX_EPOCH};

use tauri::path::BaseDirectory;
use tauri::{AppHandle, Manager};

const HEALTH_PATH: &str = "/api/v1/health";
const HEALTH_TIMEOUT: Duration = Duration::from_secs(60);
const DEFAULT_JAVA_ARGS: &[&str] = &[
    "-Xms32m",
    "-Xmx768m",
    "-XX:TieredStopAtLevel=1",
    "-Djava.awt.headless=true",
    "-Dspring.jmx.enabled=false",
    "-Dspring.main.banner-mode=off",
];
const EXTRA_JAVA_ARGS_ENV: &str = "JAVANAVI_DESKTOP_JAVA_OPTS";
const DISABLE_DEFAULT_JAVA_ARGS_ENV: &str = "JAVANAVI_DESKTOP_DISABLE_DEFAULT_JAVA_OPTS";

#[derive(Debug, Clone)]
pub struct SidecarError {
    message: String,
    log_path: Option<PathBuf>,
}

impl SidecarError {
    pub fn new(message: impl Into<String>, log_path: Option<PathBuf>) -> Self {
        Self {
            message: message.into(),
            log_path,
        }
    }

    pub fn log_path(&self) -> Option<&Path> {
        self.log_path.as_deref()
    }
}

impl fmt::Display for SidecarError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{}", self.message)
    }
}

impl std::error::Error for SidecarError {}

#[derive(Debug, Clone)]
struct JavaCandidate {
    path: PathBuf,
    source: &'static str,
}

#[derive(Debug, Clone)]
pub struct JavaRuntime {
    path: PathBuf,
    major: u32,
    source: &'static str,
}

#[derive(Debug)]
pub struct JavaSidecar {
    child: Child,
    pub port: u16,
    pub log_path: PathBuf,
    pub data_dir: PathBuf,
    pub jar_path: PathBuf,
    pub java_path: PathBuf,
}

impl JavaSidecar {
    pub fn pid(&self) -> u32 {
        self.child.id()
    }

    pub fn shutdown(&mut self) {
        match self.child.try_wait() {
            Ok(Some(_)) => return,
            Ok(None) => {}
            Err(_) => {}
        }

        let _ = self.child.kill();
        let _ = self.child.wait();
    }
}

impl Drop for JavaSidecar {
    fn drop(&mut self) {
        self.shutdown();
    }
}

pub fn start(app: &AppHandle) -> Result<JavaSidecar, SidecarError> {
    let data_dir = app
        .path()
        .app_data_dir()
        .map_err(|err| SidecarError::new(format!("Unable to resolve app data directory: {err}"), None))?;
    fs::create_dir_all(&data_dir).map_err(|err| {
        SidecarError::new(
            format!("Unable to create app data directory {}: {err}", data_dir.display()),
            None,
        )
    })?;

    let logs_dir = data_dir.join("logs");
    fs::create_dir_all(&logs_dir).map_err(|err| {
        SidecarError::new(
            format!("Unable to create log directory {}: {err}", logs_dir.display()),
            None,
        )
    })?;
    let log_path = logs_dir.join("java-sidecar.log");
    let _ = fs::write(&log_path, "JavaNavi desktop Java sidecar log\n");

    let jar_path = resolve_jar_path(app).map_err(|err| err.with_log_path(log_path.clone()))?;
    let java = resolve_java_runtime(app).map_err(|err| err.with_log_path(log_path.clone()))?;
    append_log(
        &log_path,
        &format!(
            "Using Java {} from {} ({})\nUsing backend jar {}\n",
            java.major,
            java.path.display(),
            java.source,
            jar_path.display()
        ),
    );

    let mut last_error = None;
    for attempt in 1..=3 {
        let port = choose_loopback_port().map_err(|err| {
            SidecarError::new(format!("Unable to choose a loopback port: {err}"), Some(log_path.clone()))
        })?;
        append_log(
            &log_path,
            &format!("Starting Java sidecar attempt {attempt} on 127.0.0.1:{port}\n"),
        );

        match spawn_java(&java.path, &jar_path, &data_dir, &log_path, port) {
            Ok(mut sidecar) => match wait_for_health(&mut sidecar, &log_path) {
                Ok(()) => {
                    append_log(
                        &log_path,
                        &format!("Java sidecar is healthy at http://127.0.0.1:{port}/\n"),
                    );
                    return Ok(sidecar);
                }
                Err(err) => {
                    append_log(&log_path, &format!("Attempt {attempt} failed: {err}\n"));
                    sidecar.shutdown();
                    last_error = Some(err);
                    thread::sleep(Duration::from_millis(300));
                }
            },
            Err(err) => {
                append_log(&log_path, &format!("Attempt {attempt} failed to spawn Java: {err}\n"));
                last_error = Some(err);
            }
        }
    }

    Err(last_error.unwrap_or_else(|| {
        SidecarError::new("Java sidecar failed to start", Some(log_path.clone()))
    }))
}

trait WithLogPath {
    fn with_log_path(self, log_path: PathBuf) -> SidecarError;
}

impl WithLogPath for SidecarError {
    fn with_log_path(self, log_path: PathBuf) -> SidecarError {
        if self.log_path.is_some() {
            self
        } else {
            SidecarError::new(self.message, Some(log_path))
        }
    }
}

fn resolve_jar_path(app: &AppHandle) -> Result<PathBuf, SidecarError> {
    if let Ok(path) = env::var("JAVANAVI_DESKTOP_JAR") {
        let path = PathBuf::from(path);
        if path.is_file() {
            return Ok(path);
        }
        return Err(SidecarError::new(
            format!("JAVANAVI_DESKTOP_JAR does not point to a readable jar: {}", path.display()),
            None,
        ));
    }

    let mut candidates = Vec::new();
    if let Ok(path) = app.path().resolve("resources/javanavi-backend.jar", BaseDirectory::Resource) {
        candidates.push(path);
    }
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(exe_dir.join("resources/javanavi-backend.jar"));
        }
    }
    if let Ok(manifest_dir) = env::var("CARGO_MANIFEST_DIR") {
        let manifest_dir = PathBuf::from(manifest_dir);
        candidates.push(manifest_dir.join("resources/javanavi-backend.jar"));
        candidates.extend(find_backend_jars(&manifest_dir.join("../backend/target")));
    }

    candidates
        .into_iter()
        .find(|candidate| candidate.is_file())
        .ok_or_else(|| {
            SidecarError::new(
                "Backend jar was not found. Run `npm run desktop:stage` or set JAVANAVI_DESKTOP_JAR.",
                None,
            )
        })
}

fn find_backend_jars(target_dir: &Path) -> Vec<PathBuf> {
    let mut jars = fs::read_dir(target_dir)
        .ok()
        .into_iter()
        .flat_map(|entries| entries.filter_map(Result::ok))
        .map(|entry| entry.path())
        .filter(|path| {
            path.file_name()
                .and_then(|name| name.to_str())
                .is_some_and(|name| {
                    name.starts_with("javanavi-backend-")
                        && name.ends_with(".jar")
                        && !name.ends_with(".jar.original")
                })
        })
        .collect::<Vec<_>>();
    jars.sort_by(|left, right| right.cmp(left));
    jars
}

fn spawn_java(
    java_path: &Path,
    jar_path: &Path,
    data_dir: &Path,
    log_path: &Path,
    port: u16,
) -> Result<JavaSidecar, SidecarError> {
    let stdout = OpenOptions::new()
        .create(true)
        .append(true)
        .open(log_path)
        .map_err(|err| SidecarError::new(format!("Unable to open log file {}: {err}", log_path.display()), Some(log_path.to_path_buf())))?;
    let stderr = stdout
        .try_clone()
        .map_err(|err| SidecarError::new(format!("Unable to clone log file handle: {err}"), Some(log_path.to_path_buf())))?;

    let java_args = desktop_java_args();
    append_log(
        log_path,
        &format!("Java sidecar optimization args: {}\n", java_args.join(" ")),
    );

    let mut command = Command::new(java_path);
    for arg in &java_args {
        command.arg(arg);
    }

    let child = command
        .arg("-jar")
        .arg(jar_path)
        .env("SERVER_ADDRESS", "127.0.0.1")
        .env("SERVER_PORT", port.to_string())
        .env("JAVANAVI_DATA_DIR", data_dir)
        .stdout(Stdio::from(stdout))
        .stderr(Stdio::from(stderr))
        .spawn()
        .map_err(|err| {
            SidecarError::new(
                format!("Unable to launch Java backend with {}: {err}", java_path.display()),
                Some(log_path.to_path_buf()),
            )
        })?;

    Ok(JavaSidecar {
        child,
        port,
        log_path: log_path.to_path_buf(),
        data_dir: data_dir.to_path_buf(),
        jar_path: jar_path.to_path_buf(),
        java_path: java_path.to_path_buf(),
    })
}

fn desktop_java_args() -> Vec<String> {
    let mut args = Vec::new();
    let disable_defaults = env::var(DISABLE_DEFAULT_JAVA_ARGS_ENV)
        .map(|value| is_truthy_env(&value))
        .unwrap_or(false);
    if !disable_defaults {
        args.extend(DEFAULT_JAVA_ARGS.iter().map(|arg| (*arg).to_string()));
    }
    if let Ok(extra_args) = env::var(EXTRA_JAVA_ARGS_ENV) {
        args.extend(split_java_opts(&extra_args));
    }
    args
}

fn split_java_opts(raw: &str) -> Vec<String> {
    raw.split_whitespace()
        .map(str::trim)
        .filter(|arg| !arg.is_empty())
        .map(ToString::to_string)
        .collect()
}

fn is_truthy_env(value: &str) -> bool {
    matches!(
        value.trim().to_ascii_lowercase().as_str(),
        "1" | "true" | "yes" | "on"
    )
}

fn wait_for_health(sidecar: &mut JavaSidecar, log_path: &Path) -> Result<(), SidecarError> {
    let started = Instant::now();
    loop {
        match sidecar.child.try_wait() {
            Ok(Some(status)) => {
                return Err(SidecarError::new(
                    format!("Java backend exited before becoming healthy: {status}"),
                    Some(log_path.to_path_buf()),
                ));
            }
            Ok(None) => {}
            Err(err) => {
                return Err(SidecarError::new(
                    format!("Unable to inspect Java backend process: {err}"),
                    Some(log_path.to_path_buf()),
                ));
            }
        }

        if let Ok(response) = http_get("127.0.0.1", sidecar.port, HEALTH_PATH) {
            if response.status == 200 && response.body.contains("ok") {
                return Ok(());
            }
        }

        if started.elapsed() > HEALTH_TIMEOUT {
            return Err(SidecarError::new(
                format!(
                    "Timed out waiting for Java backend health at http://127.0.0.1:{}/api/v1/health",
                    sidecar.port
                ),
                Some(log_path.to_path_buf()),
            ));
        }

        thread::sleep(Duration::from_millis(500));
    }
}

#[derive(Debug)]
struct HttpResponse {
    status: u16,
    body: String,
}

fn http_get(host: &str, port: u16, path: &str) -> std::io::Result<HttpResponse> {
    let addr = SocketAddr::new(IpAddr::V4(Ipv4Addr::LOCALHOST), port);
    let mut stream = TcpStream::connect_timeout(&addr, Duration::from_millis(500))?;
    stream.set_read_timeout(Some(Duration::from_secs(2)))?;
    stream.set_write_timeout(Some(Duration::from_secs(2)))?;

    let request = format!(
        "GET {path} HTTP/1.0\r\nHost: {host}:{port}\r\nConnection: close\r\nUser-Agent: JavaNavi-Desktop\r\n\r\n"
    );
    stream.write_all(request.as_bytes())?;

    let mut raw = String::new();
    stream.read_to_string(&mut raw)?;
    let status = raw
        .lines()
        .next()
        .and_then(|line| line.split_whitespace().nth(1))
        .and_then(|status| status.parse::<u16>().ok())
        .unwrap_or(0);
    let body = raw.split("\r\n\r\n").nth(1).unwrap_or("").to_string();
    Ok(HttpResponse { status, body })
}

fn choose_loopback_port() -> std::io::Result<u16> {
    let listener = TcpListener::bind((Ipv4Addr::LOCALHOST, 0))?;
    let port = listener.local_addr()?.port();
    drop(listener);
    Ok(port)
}

fn resolve_java_runtime(app: &AppHandle) -> Result<JavaRuntime, SidecarError> {
    let mut candidates = java_candidates(app);
    let mut attempts = Vec::new();

    for candidate in candidates.drain(..) {
        if !is_executable_candidate(&candidate.path) {
            attempts.push(format!("{} ({}) not found", candidate.path.display(), candidate.source));
            continue;
        }

        match java_major_version(&candidate.path) {
            Ok(major) if major >= 17 => {
                return Ok(JavaRuntime {
                    path: candidate.path,
                    major,
                    source: candidate.source,
                });
            }
            Ok(major) => attempts.push(format!(
                "{} ({}) is Java {major}, need Java 17+",
                candidate.path.display(),
                candidate.source
            )),
            Err(err) => attempts.push(format!(
                "{} ({}) could not be inspected: {err}",
                candidate.path.display(),
                candidate.source
            )),
        }
    }

    Err(SidecarError::new(
        format!(
            "JavaNavi could not find a bundled or system Java 17+ runtime. Reinstall the desktop package, or set JAVANAVI_DESKTOP_JAVA / JAVA_HOME. Checked: {}",
            attempts.join("; ")
        ),
        None,
    ))
}

fn java_candidates(app: &AppHandle) -> Vec<JavaCandidate> {
    let mut candidates = Vec::new();
    if let Ok(path) = env::var("JAVANAVI_DESKTOP_JAVA") {
        candidates.push(JavaCandidate {
            path: PathBuf::from(path),
            source: "JAVANAVI_DESKTOP_JAVA",
        });
    }

    let bundled_java = PathBuf::from("resources")
        .join("java-runtime")
        .join("bin")
        .join(java_binary_name());
    if let Ok(path) = app.path().resolve(&bundled_java, BaseDirectory::Resource) {
        candidates.push(JavaCandidate {
            path,
            source: "bundled-runtime",
        });
    }
    if let Ok(exe_path) = env::current_exe() {
        if let Some(exe_dir) = exe_path.parent() {
            candidates.push(JavaCandidate {
                path: exe_dir.join(&bundled_java),
                source: "portable-bundled-runtime",
            });
        }
    }

    if let Ok(java_home) = env::var("JAVA_HOME") {
        candidates.push(JavaCandidate {
            path: PathBuf::from(java_home).join("bin").join(java_binary_name()),
            source: "JAVA_HOME",
        });
    }

    candidates.push(JavaCandidate {
        path: PathBuf::from(java_binary_name()),
        source: "PATH",
    });

    #[cfg(target_os = "linux")]
    {
        for home in [
            "/usr/lib/jvm/java-17-openjdk-amd64",
            "/usr/lib/jvm/java-21-openjdk-amd64",
            "/usr/lib/jvm/openjdk-17",
            "/usr/lib/jvm/openjdk-21",
        ] {
            candidates.push(JavaCandidate {
                path: PathBuf::from(home).join("bin").join(java_binary_name()),
                source: "common-linux-jdk",
            });
        }
    }

    candidates.dedup_by(|a, b| a.path == b.path);
    candidates
}

fn java_binary_name() -> &'static str {
    if cfg!(target_os = "windows") {
        "java.exe"
    } else {
        "java"
    }
}

fn is_executable_candidate(path: &Path) -> bool {
    if path.components().count() == 1 {
        return true;
    }
    path.is_file()
}

fn java_major_version(java_path: &Path) -> Result<u32, String> {
    let output = Command::new(java_path)
        .arg("-version")
        .output()
        .map_err(|err| err.to_string())?;
    let text = format!(
        "{}{}",
        String::from_utf8_lossy(&output.stdout),
        String::from_utf8_lossy(&output.stderr)
    );
    parse_java_major(&text).ok_or_else(|| format!("Unable to parse Java version from: {text}"))
}

pub fn parse_java_major(version_output: &str) -> Option<u32> {
    let token = version_output
        .split('"')
        .nth(1)
        .or_else(|| {
            version_output
                .split_whitespace()
                .find(|part| part.chars().next().map(|ch| ch.is_ascii_digit()).unwrap_or(false))
        })?;
    parse_java_version_token(token)
}

fn parse_java_version_token(token: &str) -> Option<u32> {
    let numeric = token
        .chars()
        .take_while(|ch| ch.is_ascii_digit() || *ch == '.')
        .collect::<String>();
    let mut parts = numeric.split('.');
    let first = parts.next()?.parse::<u32>().ok()?;
    if first == 1 {
        parts.next()?.parse::<u32>().ok()
    } else {
        Some(first)
    }
}

fn append_log(path: &Path, message: &str) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(path) {
        let timestamp = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|duration| duration.as_secs().to_string())
            .unwrap_or_else(|_| "0".to_string());
        let _ = write!(file, "[{timestamp}] {message}");
    }
}

#[cfg(test)]
mod tests {
    use super::{is_truthy_env, parse_java_major, split_java_opts};

    #[test]
    fn parses_legacy_java_version() {
        assert_eq!(parse_java_major("openjdk version \"1.8.0_482\""), Some(8));
    }

    #[test]
    fn parses_modern_java_version() {
        assert_eq!(parse_java_major("openjdk version \"17.0.15\" 2025-04-15"), Some(17));
        assert_eq!(parse_java_major("java version \"21.0.3\""), Some(21));
    }

    #[test]
    fn splits_extra_java_options() {
        assert_eq!(
            split_java_opts("  -Xmx1g   -Ddemo=true\t-XX:+UseStringDeduplication "),
            vec![
                "-Xmx1g".to_string(),
                "-Ddemo=true".to_string(),
                "-XX:+UseStringDeduplication".to_string()
            ]
        );
    }

    #[test]
    fn parses_truthy_env_values() {
        assert!(is_truthy_env("1"));
        assert!(is_truthy_env(" TRUE "));
        assert!(is_truthy_env("yes"));
        assert!(!is_truthy_env("0"));
        assert!(!is_truthy_env("false"));
    }
}
