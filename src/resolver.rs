use std::collections::HashMap;
use std::path::Path;

use toml::Value;

use crate::error::{AiDocsError, Result};

pub fn resolve_cargo_versions(path: &Path) -> Result<HashMap<String, String>> {
    if !path.exists() {
        return Err(AiDocsError::CargoLockNotFound);
    }

    let content = std::fs::read_to_string(path)?;
    let value: Value =
        toml::from_str(&content).map_err(|e| AiDocsError::CargoLockParse(e.to_string()))?;

    let mut versions = HashMap::new();
    let packages = value
        .get("package")
        .and_then(Value::as_array)
        .ok_or_else(|| AiDocsError::CargoLockParse("`package` array is missing".to_string()))?;

    for pkg in packages {
        if let (Some(name), Some(version)) = (
            pkg.get("name").and_then(Value::as_str),
            pkg.get("version").and_then(Value::as_str),
        ) {
            versions.insert(name.to_string(), version.to_string());
        }
    }

    Ok(versions)
}

#[cfg(test)]
mod tests {
    use super::resolve_cargo_versions;

    fn unique_temp_path(name: &str) -> std::path::PathBuf {
        std::env::temp_dir().join(format!(
            "ai-fdocs-{name}-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .expect("clock")
                .as_nanos()
        ))
    }

    #[test]
    fn resolves_versions_from_cargo_lock_packages() {
        let dir = unique_temp_path("lock-ok");
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let lock_path = dir.join("Cargo.lock");

        let content = r#"
[[package]]
name = "serde"
version = "1.0.217"

[[package]]
name = "tokio"
version = "1.43.0"
"#;
        std::fs::write(&lock_path, content).expect("write lockfile");

        let resolved = resolve_cargo_versions(&lock_path).expect("resolve lockfile");
        assert_eq!(resolved.get("serde"), Some(&"1.0.217".to_string()));
        assert_eq!(resolved.get("tokio"), Some(&"1.43.0".to_string()));

        let _ = std::fs::remove_dir_all(dir);
    }

    #[test]
    fn returns_parse_error_when_package_array_is_missing() {
        let dir = unique_temp_path("lock-missing-packages");
        std::fs::create_dir_all(&dir).expect("create temp dir");
        let lock_path = dir.join("Cargo.lock");
        std::fs::write(&lock_path, "version = 3\n").expect("write invalid lockfile");

        let err = resolve_cargo_versions(&lock_path).expect_err("must fail");
        assert!(err
            .to_string()
            .contains("Cargo.lock parsing error: `package` array is missing"));

        let _ = std::fs::remove_dir_all(dir);
    }
}
