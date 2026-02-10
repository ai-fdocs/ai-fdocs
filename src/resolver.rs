use std::collections::HashMap;
use std::path::Path;

use serde::Deserialize;

use crate::error::{AiDocsError, Result};

#[derive(Debug, Deserialize)]
struct CargoLock {
    package: Vec<PackageEntry>,
}

#[derive(Debug, Deserialize)]
struct PackageEntry {
    name: String,
    version: String,
    #[allow(dead_code)]
    source: Option<String>,
}

/// Parse Cargo.lock and return a map: crate_name -> version.
pub fn resolve_versions(project_root: &Path) -> Result<HashMap<String, String>> {
    let lock_path = project_root.join("Cargo.lock");

    if !lock_path.exists() {
        return Err(AiDocsError::CargoLockNotFound);
    }

    let content = std::fs::read_to_string(&lock_path)?;
    let lock: CargoLock =
        toml::from_str(&content).map_err(|e| AiDocsError::CargoLockParse(e.to_string()))?;

    let mut versions = HashMap::new();
    for pkg in lock.package {
        // If crate appears multiple times with different versions,
        // keep the last occurrence for now.
        versions.insert(pkg.name, pkg.version);
    }

    Ok(versions)
}
