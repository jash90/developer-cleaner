//! Build output and tool caches that live inside projects: Cargo `target`, CocoaPods `Pods`,
//! `.next`, `.nx`, `.turbo`, Android `.cxx`, `coverage` and `.expo`.
//!
//! Found by the same walk as `node_modules`, removed by their own command with their own,
//! stricter check. Several of these names are common — `coverage` can be a source folder,
//! `target` is Maven's too, some teams commit `Pods` — so a folder qualifies only when all of
//! these hold, and anything less fails closed (neither offered nor deleted):
//!
//! - its name is one of the kinds below, and it is a real directory, not a symlink;
//! - the files that kind's tool leaves beside it and inside it are there (see [`has_markers`]);
//! - Git tracks nothing inside it — committed content is somebody's work, whatever the name;
//! - it is not the folder this app is running from (`tauri dev` runs out of `target`).

use serde::{Deserialize, Serialize};
use std::fs;
use std::io::Read;
use std::path::Path;
use walkdir::WalkDir;

use crate::commands::{delete_checked, rejected, DeleteResult};
use crate::git_worktrees::git_command;

/// First line of every `CACHEDIR.TAG` (<https://bford.info/cachedir/>). Cargo writes it into
/// each target directory it creates.
const CACHEDIR_TAG_SIGNATURE: &[u8] = b"Signature: 8a477f597d28d172789f06886806bc55";

#[derive(Debug, Serialize, Deserialize, Clone, Copy, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum ArtifactKind {
    CargoTarget,
    #[serde(rename = "cocoapods")]
    CocoaPods,
    NextBuild,
    NxCache,
    TurboCache,
    AndroidCxx,
    Coverage,
    ExpoState,
}

impl ArtifactKind {
    /// The folder name each kind lives under. Nothing else is ever considered.
    fn from_dir_name(name: &str) -> Option<Self> {
        Some(match name {
            "target" => Self::CargoTarget,
            "Pods" => Self::CocoaPods,
            ".next" => Self::NextBuild,
            ".nx" => Self::NxCache,
            ".turbo" => Self::TurboCache,
            ".cxx" => Self::AndroidCxx,
            "coverage" => Self::Coverage,
            ".expo" => Self::ExpoState,
            _ => return None,
        })
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BuildArtifact {
    pub path: String,
    pub kind: ArtifactKind,
    /// Nominal size — the sum of file lengths. See `NodeModulesFolder::size`.
    pub size: u64,
    pub allocated_size: u64,
    /// Blocks that come back on delete.
    pub reclaimable_size: u64,
    pub last_modified: Option<i64>,
    /// Name of the folder holding the artifact — the project it belongs to.
    pub parent_project: String,
}

fn any_file(dir: &Path, names: &[&str]) -> bool {
    names.iter().any(|name| dir.join(name).is_file())
}

fn any_entry(dir: &Path, names: &[&str]) -> bool {
    names.iter().any(|name| dir.join(name).exists())
}

/// What the tool that owns `kind` leaves beside and inside the folder. Cheap filesystem checks
/// only; the walk calls this for every folder with a matching name.
fn has_markers(kind: ArtifactKind, path: &Path, parent: &Path) -> bool {
    match kind {
        ArtifactKind::CargoTarget => parent.join("Cargo.toml").is_file() && has_cachedir_tag(path),
        // `pod install` writes `Manifest.lock` into every Pods folder it manages.
        ArtifactKind::CocoaPods => {
            parent.join("Podfile").is_file() && path.join("Manifest.lock").is_file()
        }
        ArtifactKind::NextBuild => {
            parent.join("package.json").is_file()
                && any_entry(
                    path,
                    &[
                        "BUILD_ID",
                        "build-manifest.json",
                        "trace",
                        "cache",
                        "server",
                    ],
                )
        }
        ArtifactKind::NxCache => parent.join("nx.json").is_file(),
        ArtifactKind::TurboCache => any_file(parent, &["package.json", "turbo.json"]),
        ArtifactKind::AndroidCxx => any_file(parent, &["build.gradle", "build.gradle.kts"]),
        // `coverage` is a plausible source folder name, so the report itself must be there.
        ArtifactKind::Coverage => {
            parent.join("package.json").is_file()
                && any_entry(
                    path,
                    &[
                        "lcov.info",
                        "coverage-final.json",
                        "coverage-summary.json",
                        "clover.xml",
                        "cobertura-coverage.xml",
                        "lcov-report",
                    ],
                )
        }
        // `~/.expo` is Expo CLI's own global folder, login session (`state.json`) included; a
        // project's `.expo` is what `expo start` writes. Only an Expo project beside it counts —
        // any `package.json` would let a stray one in the home folder through.
        ArtifactKind::ExpoState => {
            !path.join("state.json").exists()
                && (any_file(
                    parent,
                    &[
                        "app.json",
                        "app.config.js",
                        "app.config.ts",
                        "app.config.json",
                    ],
                ) || depends_on(&parent.join("package.json"), "expo"))
        }
    }
}

/// Whether a `package.json` lists `package` in `dependencies` or `devDependencies`.
fn depends_on(package_json: &Path, package: &str) -> bool {
    let Ok(content) = fs::read_to_string(package_json) else {
        return false;
    };
    let Ok(parsed) = serde_json::from_str::<serde_json::Value>(&content) else {
        return false;
    };
    ["dependencies", "devDependencies"]
        .iter()
        .any(|key| parsed.get(key).and_then(|deps| deps.get(package)).is_some())
}

/// The home folder holds tools' global state (`~/.expo`, `~/.turbo`, …), never a project's build
/// output, even when a stray `~/package.json` makes it look like a project.
fn is_home_folder(dir: &Path) -> bool {
    let home = std::env::var_os("HOME").or_else(|| std::env::var_os("USERPROFILE"));
    home.is_some_and(|home| is_same_dir(dir, Path::new(&home)))
}

fn is_same_dir(dir: &Path, home: &Path) -> bool {
    dir == home
        || fs::canonicalize(dir)
            .ok()
            .zip(fs::canonicalize(home).ok())
            .is_some_and(|(dir, home)| dir == home)
}

/// The kind `path` would be offered as, judged by name and markers only — no Git, no symlink
/// check. The walk uses it to decide whether to stop descending.
pub(crate) fn candidate_kind(path: &Path) -> Option<ArtifactKind> {
    let kind = ArtifactKind::from_dir_name(path.file_name()?.to_str()?)?;
    let parent = path.parent()?;
    has_markers(kind, path, parent).then_some(kind)
}

/// Why `path` must not be removed as a build artifact, or `None` when it may be.
///
/// Used by the scan (only folders that pass are offered) and again by the delete, because the
/// folder can change between the two and a wrong path here is an unrecoverable `rm -rf`.
/// A path that no longer exists passes: there is nothing left to remove.
pub(crate) fn artifact_rejection(path: &Path) -> Option<String> {
    if !path.is_absolute() {
        return Some("Refusing to delete a relative path".to_string());
    }
    let Some(kind) = path
        .file_name()
        .and_then(|name| name.to_str())
        .and_then(ArtifactKind::from_dir_name)
    else {
        return Some("Refusing to delete a folder that is not a known build artifact".to_string());
    };
    match fs::symlink_metadata(path) {
        Ok(metadata) if metadata.file_type().is_symlink() => return Some(
            "Refusing to delete a symlink; the folder it points at is not this tool's to remove"
                .to_string(),
        ),
        Ok(metadata) if !metadata.is_dir() => {
            return Some("Refusing to delete something that is not a directory".to_string())
        }
        Ok(_) => {}
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => return None,
        Err(error) => return Some(error.to_string()),
    }
    let Some(parent) = path.parent() else {
        return Some("Refusing to delete a filesystem root".to_string());
    };
    if is_home_folder(parent) {
        return Some(
            "Refusing to delete: folders directly in the home folder are tools' global state"
                .to_string(),
        );
    }
    if !has_markers(kind, path, parent) {
        return Some(missing_marker_reason(kind).to_string());
    }
    if holds_running_executable(path) {
        return Some("Refusing to delete the build folder this app is running from".to_string());
    }
    if contains_repository(path) {
        return Some("Refusing to delete: it contains a Git repository of its own".to_string());
    }
    match tracked_by_git(path) {
        Ok(false) => None,
        Ok(true) => Some("Refusing to delete: Git tracks files inside this folder".to_string()),
        Err(reason) => Some(format!("Refusing to delete: could not ask Git ({reason})")),
    }
}

fn missing_marker_reason(kind: ArtifactKind) -> &'static str {
    match kind {
        ArtifactKind::CargoTarget => {
            "Refusing to delete: no Cargo.toml beside it or no Cargo CACHEDIR.TAG inside"
        }
        ArtifactKind::CocoaPods => {
            "Refusing to delete: no Podfile beside it or no Manifest.lock inside"
        }
        ArtifactKind::NextBuild => "Refusing to delete: does not look like Next.js build output",
        ArtifactKind::NxCache => "Refusing to delete: no nx.json beside it",
        ArtifactKind::TurboCache => "Refusing to delete: no package.json or turbo.json beside it",
        ArtifactKind::AndroidCxx => "Refusing to delete: no build.gradle beside it",
        ArtifactKind::Coverage => "Refusing to delete: no coverage report inside",
        ArtifactKind::ExpoState => {
            "Refusing to delete: no Expo project beside it, or Expo CLI's global state inside"
        }
    }
}

fn has_cachedir_tag(target: &Path) -> bool {
    let Ok(file) = fs::File::open(target.join("CACHEDIR.TAG")) else {
        return false;
    };
    let mut head = Vec::with_capacity(CACHEDIR_TAG_SIGNATURE.len());
    file.take(CACHEDIR_TAG_SIGNATURE.len() as u64)
        .read_to_end(&mut head)
        .is_ok_and(|_| head == CACHEDIR_TAG_SIGNATURE)
}

/// Under `tauri dev` this app runs out of its own `src-tauri/target`, which sits inside the
/// projects folder a developer is most likely to scan.
fn holds_running_executable(dir: &Path) -> bool {
    let (Ok(exe), Ok(dir)) = (
        std::env::current_exe().and_then(fs::canonicalize),
        fs::canonicalize(dir),
    ) else {
        return false;
    };
    exe.starts_with(dir)
}

/// How deep a nested repository is looked for. None of 167 real build folders held one at any
/// depth up to 6; the limit keeps the check cheap inside multi-gigabyte `target` folders.
const NESTED_REPOSITORY_DEPTH: usize = 5;

/// Whether a repository of its own lives inside `path`. The parent's `git ls-files` reads only
/// the parent's index, so files tracked by a repository inside the folder would go unnoticed.
fn contains_repository(path: &Path) -> bool {
    WalkDir::new(path)
        .min_depth(1)
        .max_depth(NESTED_REPOSITORY_DEPTH)
        .into_iter()
        .filter_map(Result::ok)
        .any(|entry| entry.file_name() == ".git")
}

/// Whether Git tracks any file inside `path`. Outside a repository nothing is tracked; any other
/// failure to ask is an error, so the caller fails closed.
fn tracked_by_git(path: &Path) -> Result<bool, String> {
    let (Some(parent), Some(name)) = (path.parent(), path.file_name()) else {
        return Err("no parent folder".to_string());
    };
    // Git translates its messages, and the one matched below is read in English only: on a
    // Polish system it arrived as "to nie jest repozytorium gita" and every folder outside a
    // repository was refused. `LC_ALL=C` also overrides `LANGUAGE` in gettext.
    let output = git_command(parent)
        .env("LC_ALL", "C")
        .env_remove("LANGUAGE")
        .args(["ls-files", "-z", "--"])
        .arg(name)
        .output()
        .map_err(|error| error.to_string())?;
    if output.status.success() {
        return Ok(!output.stdout.is_empty());
    }
    let stderr = String::from_utf8_lossy(&output.stderr);
    if stderr.contains("not a git repository") {
        // The same message comes for a `.git` that points nowhere (a stale `gitdir`). Only
        // a folder with no `.git` above it is really outside a repository.
        if parent.ancestors().any(|dir| dir.join(".git").exists()) {
            return Err(format!(
                "a repository is there but unreadable: {}",
                stderr.trim()
            ));
        }
        return Ok(false);
    }
    Err(stderr.trim().to_string())
}

/// The full check the scan applies, for tests that build fixtures by hand.
#[cfg(test)]
pub(crate) fn is_offered(path: &Path) -> bool {
    candidate_kind(path).is_some() && artifact_rejection(path).is_none()
}

#[tauri::command]
pub async fn delete_build_artifacts(paths: Vec<String>) -> Vec<DeleteResult> {
    let requested = paths.clone();
    match tauri::async_runtime::spawn_blocking(move || delete_checked(paths, artifact_rejection))
        .await
    {
        Ok(results) => results,
        Err(error) => requested
            .into_iter()
            .map(|path| rejected(path, format!("Delete did not finish: {error}")))
            .collect(),
    }
}

#[cfg(test)]
mod tests {
    use super::{
        artifact_rejection, candidate_kind, delete_checked, is_offered, is_same_dir, ArtifactKind,
    };
    use std::fs;
    use std::path::{Path, PathBuf};
    use std::process::Command;
    use std::time::{SystemTime, UNIX_EPOCH};

    const CARGO_TAG: &str = "Signature: 8a477f597d28d172789f06886806bc55\n\
        # This file is a cache directory tag created by cargo.\n";

    struct TestDirectory(PathBuf);

    impl Drop for TestDirectory {
        fn drop(&mut self) {
            let _ = fs::remove_dir_all(&self.0);
        }
    }

    fn temp_root(label: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("system clock should be after Unix epoch")
            .as_nanos();
        let root = std::env::temp_dir().join(format!(
            "build-artifacts-{label}-{}-{unique}",
            std::process::id(),
        ));
        fs::create_dir_all(&root).expect("fixture root should be created");
        root
    }

    fn write(path: &Path, content: &str) {
        fs::create_dir_all(path.parent().expect("parent")).expect("fixture dir");
        fs::write(path, content).expect("fixture write");
    }

    /// A crate with a build directory the way Cargo leaves it.
    fn cargo_crate(dir: &Path) -> PathBuf {
        let target = dir.join("target");
        write(&dir.join("Cargo.toml"), "[package]\nname = \"x\"\n");
        write(&target.join("CACHEDIR.TAG"), CARGO_TAG);
        write(&target.join("debug/deps/libx.rlib"), &"x".repeat(16 * 1024));
        target
    }

    /// One project per kind, each with the markers its tool leaves.
    fn every_kind(root: &Path) -> Vec<(ArtifactKind, PathBuf)> {
        let web = root.join("web");
        write(
            &web.join("package.json"),
            r#"{"dependencies":{"expo":"~52.0.0"}}"#,
        );
        write(&web.join("nx.json"), "{}");
        write(&web.join(".next/BUILD_ID"), "abc");
        write(&web.join(".nx/cache/run.json"), "{}");
        write(&web.join(".turbo/turbo-build.log"), "log");
        write(&web.join("coverage/lcov.info"), "TN:");
        write(&web.join(".expo/devices.json"), "{}");
        let ios = root.join("app/ios");
        write(&ios.join("Podfile"), "platform :ios");
        write(&ios.join("Pods/Manifest.lock"), "PODS:");
        let android = root.join("app/android/app");
        write(&android.join("build.gradle"), "");
        write(&android.join(".cxx/Debug/x.o"), "obj");
        vec![
            (ArtifactKind::CargoTarget, cargo_crate(&root.join("crate"))),
            (ArtifactKind::CocoaPods, ios.join("Pods")),
            (ArtifactKind::NextBuild, web.join(".next")),
            (ArtifactKind::NxCache, web.join(".nx")),
            (ArtifactKind::TurboCache, web.join(".turbo")),
            (ArtifactKind::AndroidCxx, android.join(".cxx")),
            (ArtifactKind::Coverage, web.join("coverage")),
            (ArtifactKind::ExpoState, web.join(".expo")),
        ]
    }

    fn git(dir: &Path, args: &[&str]) {
        let status = Command::new("git")
            .args([
                "-c",
                "user.name=Developer Cleaner Tests",
                "-c",
                "user.email=t@example.com",
            ])
            .args(args)
            .current_dir(dir)
            .status()
            .expect("git");
        assert!(status.success(), "git {args:?}");
    }

    fn delete_one(path: &Path) -> crate::commands::DeleteResult {
        delete_checked(vec![path.to_string_lossy().to_string()], artifact_rejection)
            .pop()
            .expect("one path in, one result out")
    }

    #[test]
    fn every_kind_is_recognised_and_offered() {
        let root = temp_root("kinds");
        let _cleanup = TestDirectory(root.clone());

        for (kind, path) in every_kind(&root) {
            assert_eq!(candidate_kind(&path), Some(kind), "{}", path.display());
            assert_eq!(artifact_rejection(&path), None, "{}", path.display());
        }
    }

    #[test]
    fn every_kind_is_refused_without_its_markers() {
        let root = temp_root("no-markers");
        let _cleanup = TestDirectory(root.clone());
        for (_, path) in every_kind(&root) {
            // The project files beside it go: a bare folder with the right name is not enough.
            for marker in [
                "Cargo.toml",
                "Podfile",
                "package.json",
                "nx.json",
                "turbo.json",
                "build.gradle",
            ] {
                let _ = fs::remove_file(path.parent().expect("parent").join(marker));
            }
            assert!(!is_offered(&path), "{}", path.display());
            let result = delete_one(&path);
            assert!(!result.success, "{}", path.display());
            assert!(
                path.exists(),
                "rejected folder must survive: {}",
                path.display()
            );
        }
    }

    /// A `target` beside a `Cargo.toml` without Cargo's tag — e.g. a Maven project that also
    /// carries a crate — and a `coverage` that is source code, not a report.
    #[test]
    fn refuses_lookalikes_with_the_right_neighbours() {
        let root = temp_root("lookalikes");
        let _cleanup = TestDirectory(root.clone());
        let target = cargo_crate(&root.join("crate"));
        fs::remove_file(target.join("CACHEDIR.TAG")).expect("fixture remove");
        let source = root.join("lib/coverage");
        write(&root.join("lib/package.json"), "{}");
        write(&source.join("index.js"), "module.exports = {}");
        let pods = root.join("ios/Pods");
        write(&root.join("ios/Podfile"), "");
        write(&pods.join("Some/file.h"), "");

        for path in [&target, &source, &pods] {
            assert!(!is_offered(path), "{}", path.display());
            assert!(!delete_one(path).success);
            assert!(path.exists());
        }
    }

    #[test]
    fn refuses_expo_global_state_and_non_expo_projects() {
        let root = temp_root("expo-lookalikes");
        let _cleanup = TestDirectory(root.clone());
        // `~/.expo` with a stray `~/package.json` beside it: Expo CLI's login lives here.
        let home = root.join("home");
        write(
            &home.join("package.json"),
            r#"{"dependencies":{"expo":"~52.0.0"}}"#,
        );
        write(&home.join(".expo/state.json"), r#"{"auth":{}}"#);
        assert_eq!(candidate_kind(&home.join(".expo")), None);
        // A `.expo` beside a package that does not use Expo.
        let plain = root.join("plain");
        write(
            &plain.join("package.json"),
            r#"{"dependencies":{"react":"19"}}"#,
        );
        write(&plain.join(".expo/devices.json"), "{}");
        assert_eq!(candidate_kind(&plain.join(".expo")), None);
        // An Expo project with no dependency entry still counts through its app config.
        let configured = root.join("configured");
        write(&configured.join("app.json"), r#"{"expo":{}}"#);
        write(&configured.join(".expo/devices.json"), "{}");
        assert_eq!(
            candidate_kind(&configured.join(".expo")),
            Some(ArtifactKind::ExpoState)
        );
    }

    #[test]
    fn refuses_a_folder_holding_a_repository_of_its_own() {
        let root = temp_root("nested-repo");
        let _cleanup = TestDirectory(root.clone());
        let web = root.join("web");
        write(&web.join("package.json"), "{}");
        write(&web.join("coverage/lcov.info"), "TN:");
        assert!(is_offered(&web.join("coverage")));
        git(&web.join("coverage"), &["init", "-q"]);
        assert_eq!(
            candidate_kind(&web.join("coverage")),
            Some(ArtifactKind::Coverage)
        );
        assert!(!is_offered(&web.join("coverage")));
    }

    #[test]
    fn refuses_when_the_repository_around_it_cannot_be_read() {
        let root = temp_root("broken-gitdir");
        let _cleanup = TestDirectory(root.clone());
        let web = root.join("web");
        write(&web.join("package.json"), "{}");
        write(&web.join("coverage/lcov.info"), "TN:");
        assert!(is_offered(&web.join("coverage")));
        // A linked worktree whose main repository was deleted: `.git` points nowhere.
        write(
            &web.join(".git"),
            "gitdir: /nonexistent/.git/worktrees/web\n",
        );
        let reason = artifact_rejection(&web.join("coverage")).expect("must refuse");
        assert!(reason.contains("could not ask Git"), "{reason}");
    }

    #[test]
    fn the_home_folder_is_never_a_project() {
        let root = temp_root("home-folder");
        let _cleanup = TestDirectory(root.clone());
        let home = root.join("home");
        write(&home.join("package.json"), "{}");
        write(&home.join(".turbo/daemon/x.log"), "log");
        assert!(is_same_dir(&home, &home));
        assert!(is_same_dir(&home, &home.join("..").join("home")));
        assert!(!is_same_dir(&root, &home));
    }

    #[test]
    fn refuses_a_tag_with_the_wrong_signature() {
        let root = temp_root("bad-tag");
        let _cleanup = TestDirectory(root.clone());
        let target = cargo_crate(&root.join("crate"));
        write(
            &target.join("CACHEDIR.TAG"),
            "Signature: not-the-right-one\n",
        );

        assert!(artifact_rejection(&target).is_some());
    }

    /// Some teams commit `Pods`; anything Git tracks is somebody's work, whatever the name.
    #[test]
    fn refuses_a_folder_with_files_tracked_by_git() {
        let root = temp_root("tracked");
        let _cleanup = TestDirectory(root.clone());
        let kinds = every_kind(&root);
        git(&root, &["init", "-q"]);
        let pods = root.join("app/ios/Pods");
        git(&root, &["add", "app/ios/Pods/Manifest.lock"]);
        git(&root, &["commit", "-q", "-m", "commit Pods"]);

        let result = delete_one(&pods);

        assert!(!result.success);
        assert!(result
            .error
            .as_deref()
            .is_some_and(|e| e.contains("Git tracks")));
        assert!(pods.join("Manifest.lock").exists());
        // Untracked siblings in the same repository are still offered.
        let next = kinds
            .iter()
            .find(|(kind, _)| *kind == ArtifactKind::NextBuild)
            .map(|(_, path)| path)
            .expect("next");
        assert_eq!(artifact_rejection(next), None);
    }

    #[test]
    fn deletes_and_reports_freed_bytes() {
        let root = temp_root("delete");
        let _cleanup = TestDirectory(root.clone());
        let target = cargo_crate(&root.join("crate"));

        let result = delete_one(&target);

        assert!(result.success, "{:?}", result.error);
        assert!(result.removed_bytes >= 16 * 1024);
        assert!(!target.exists());
        assert!(
            root.join("crate/Cargo.toml").exists(),
            "the project itself stays"
        );
    }

    #[test]
    fn refuses_unknown_names_and_relative_paths() {
        let root = temp_root("names");
        let _cleanup = TestDirectory(root.clone());
        let build = root.join("app/build");
        write(&build.join("x"), "");

        assert!(!delete_one(&build).success);
        assert!(build.exists());
        let relative = delete_checked(vec!["target".to_string()], artifact_rejection);
        assert!(!relative[0].success);
    }

    #[cfg(unix)]
    #[test]
    fn refuses_a_symlink() {
        let root = temp_root("symlink");
        let _cleanup = TestDirectory(root.clone());
        let real = cargo_crate(&root.join("real"));
        write(&root.join("other/Cargo.toml"), "[package]");
        let link = root.join("other/target");
        std::os::unix::fs::symlink(&real, &link).expect("symlink");

        assert!(!delete_one(&link).success);
        assert!(
            real.join("CACHEDIR.TAG").exists(),
            "symlink target must survive"
        );
    }

    #[test]
    fn a_missing_folder_is_already_done() {
        let root = temp_root("missing");
        let _cleanup = TestDirectory(root.clone());

        let result = delete_one(&root.join("target"));

        assert!(result.success, "{:?}", result.error);
        assert_eq!(result.removed_bytes, 0);
    }

    /// The test binary itself runs out of this crate's `target`, standing in for `tauri dev`.
    #[test]
    fn refuses_the_target_this_process_runs_from() {
        let exe = std::env::current_exe().expect("current exe");
        let Some(own_target) = exe.ancestors().find(|dir| dir.ends_with("target")) else {
            return; // A custom CARGO_TARGET_DIR not named `target`; nothing to check.
        };
        if !own_target.join("CACHEDIR.TAG").exists() {
            return;
        }

        assert_eq!(
            artifact_rejection(own_target).as_deref(),
            Some("Refusing to delete the build folder this app is running from"),
        );
    }

    /// End-to-end proof that a deleted target costs only a rebuild: `cargo new`, build, delete
    /// through the real check, build again.
    /// `cargo test rebuilds_after_delete -- --ignored --nocapture`
    #[test]
    #[ignore = "runs cargo; slow"]
    fn rebuilds_after_delete() {
        let root = temp_root("rebuild");
        let _cleanup = TestDirectory(root.clone());
        let status = Command::new("cargo")
            .args(["new", "--vcs", "none", "demo"])
            .current_dir(&root)
            .status()
            .expect("cargo new");
        assert!(status.success());
        let crate_dir = root.join("demo");
        let build = || {
            Command::new("cargo")
                .arg("build")
                .current_dir(&crate_dir)
                .env_remove("CARGO_TARGET_DIR")
                .status()
                .expect("cargo build")
                .success()
        };

        assert!(build());
        let target = crate_dir.join("target");
        assert!(is_offered(&target), "a fresh cargo build must qualify");

        let result = delete_one(&target);
        assert!(result.success, "{:?}", result.error);
        assert!(!target.exists());
        println!("freed {} bytes", result.removed_bytes);

        assert!(
            build(),
            "the crate must build again after its target is removed"
        );
    }
}
