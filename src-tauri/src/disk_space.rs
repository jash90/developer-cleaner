//! Free and total space of the volume holding a folder, for the window's footer.
//!
//! Reuses the menu bar's volume readout (`sysinfo`'s `disk` feature), so the footer and the
//! tray agree on what "free" means. On macOS that is Finder's figure, which counts purgeable
//! space as available — see `tray::read_volumes`.

use crate::tray::{pick_volume, read_volumes, Volume};
use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, Manager};

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DiskSpace {
    pub available_bytes: u64,
    pub total_bytes: u64,
    pub mount_point: String,
    pub volume_name: String,
}

/// The folder itself, or its closest ancestor that still exists.
///
/// A scanned folder can vanish between the scan and the next refresh (it was the thing being
/// cleaned, or an agent removed it). Its parent almost always lives on the same volume.
fn nearest_existing(path: &Path) -> Option<&Path> {
    path.ancestors()
        .find(|candidate| !candidate.as_os_str().is_empty() && candidate.exists())
}

/// Space on the volume holding `path`, chosen from `volumes`.
///
/// The path is matched as given first and only then canonicalized: on Windows `canonicalize`
/// returns a verbatim `\\?\C:\…` path that no longer prefix-matches the `C:\` mount point, while
/// on Unix it resolves symlinks and relative paths that would otherwise match the wrong volume.
pub fn disk_space_for(path: &Path, volumes: &[Volume]) -> Result<DiskSpace, String> {
    let existing = nearest_existing(path)
        .ok_or_else(|| format!("No existing folder found for {}", path.display()))?;

    let mut candidates: Vec<PathBuf> = vec![existing.to_path_buf()];
    if let Ok(canonical) = existing.canonicalize() {
        candidates.push(canonical);
    }

    let volume = candidates
        .iter()
        .find_map(|candidate| pick_volume(volumes, candidate))
        .ok_or_else(|| format!("No mounted volume holds {}", path.display()))?;

    Ok(DiskSpace {
        // Some file systems report more free than total for a moment (quota, reserved blocks);
        // the window draws a usage bar, so keep the pair consistent.
        available_bytes: volume.available.min(volume.total),
        total_bytes: volume.total,
        mount_point: volume.mount_point.to_string_lossy().to_string(),
        volume_name: volume.name.clone(),
    })
}

/// Space on the volume holding `path` — the scanned folder — or the home folder when there is
/// no scan yet.
#[tauri::command]
pub async fn get_disk_space(app: AppHandle, path: Option<String>) -> Result<DiskSpace, String> {
    let target = match path.filter(|path| !path.trim().is_empty()) {
        Some(path) => PathBuf::from(path),
        None => app
            .path()
            .home_dir()
            .map_err(|err| format!("Could not find the home folder: {err}"))?,
    };

    tauri::async_runtime::spawn_blocking(move || disk_space_for(&target, &read_volumes()))
        .await
        .map_err(|err| format!("Reading disk space failed: {err}"))?
}

#[cfg(test)]
mod tests {
    use super::*;

    fn volume(mount_point: &str, available: u64, total: u64) -> Volume {
        Volume {
            name: format!("disk at {mount_point}"),
            mount_point: PathBuf::from(mount_point),
            available,
            total,
        }
    }

    #[test]
    fn the_temp_dir_lives_on_a_real_volume() {
        let space = disk_space_for(&std::env::temp_dir(), &read_volumes())
            .expect("the temp dir should be on a mounted volume");

        assert!(space.total_bytes > 0);
        assert!(space.available_bytes <= space.total_bytes);
        assert!(!space.mount_point.is_empty());
    }

    #[test]
    fn a_missing_folder_reports_the_volume_of_its_closest_existing_parent() {
        let volumes = read_volumes();
        let parent = std::env::temp_dir();
        let missing = parent.join(format!(
            "disk-space-missing-{}/deeper/still",
            std::process::id()
        ));
        assert!(!missing.exists());

        let for_missing = disk_space_for(&missing, &volumes).expect("falls back to the parent");
        let for_parent = disk_space_for(&parent, &volumes).unwrap();

        assert_eq!(for_missing.mount_point, for_parent.mount_point);
        assert_eq!(for_missing.total_bytes, for_parent.total_bytes);
    }

    #[test]
    fn no_matching_volume_is_an_error_not_a_panic() {
        let error = disk_space_for(&std::env::temp_dir(), &[]).unwrap_err();
        assert!(error.contains("No mounted volume"), "{error}");
    }

    #[test]
    fn an_empty_path_is_an_error() {
        let error = disk_space_for(Path::new(""), &read_volumes()).unwrap_err();
        assert!(error.contains("No existing folder"), "{error}");
    }

    #[test]
    fn the_innermost_volume_wins_and_free_never_exceeds_total() {
        let temp = std::env::temp_dir().canonicalize().unwrap();
        let root = temp
            .ancestors()
            .last()
            .unwrap()
            .to_string_lossy()
            .to_string();
        let inner = temp.to_string_lossy().to_string();
        let volumes = [volume(&root, 10, 100), volume(&inner, 500, 400)];

        let space = disk_space_for(&temp, &volumes).unwrap();

        assert_eq!(space.mount_point, inner);
        assert_eq!(space.total_bytes, 400);
        assert_eq!(space.available_bytes, 400);
    }
}
