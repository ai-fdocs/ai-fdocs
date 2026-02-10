use std::collections::HashMap;
use std::fs;
use std::io::{self, Write};
use std::path::Path;

use crate::config::Config;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SyncStatus {
    Synced,
    Missing,
    Outdated,
    Corrupted,
}

impl SyncStatus {
    fn as_str(self) -> &'static str {
        match self {
            Self::Synced => "Synced",
            Self::Missing => "Missing",
            Self::Outdated => "Outdated",
            Self::Corrupted => "Corrupted",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct StatusRow {
    pub crate_name: String,
    pub lock_version: Option<String>,
    pub synced_version: Option<String>,
    pub status: SyncStatus,
}

#[derive(Debug, Default, Clone, Copy, PartialEq, Eq)]
struct StatusSummary {
    total: usize,
    synced: usize,
    missing: usize,
    outdated: usize,
    corrupted: usize,
}

impl StatusSummary {
    fn from_rows(rows: &[StatusRow]) -> Self {
        let mut summary = Self {
            total: rows.len(),
            ..Self::default()
        };

        for row in rows {
            match row.status {
                SyncStatus::Synced => summary.synced += 1,
                SyncStatus::Missing => summary.missing += 1,
                SyncStatus::Outdated => summary.outdated += 1,
                SyncStatus::Corrupted => summary.corrupted += 1,
            }
        }

        summary
    }

    fn has_sync_issues(self) -> bool {
        self.missing > 0 || self.outdated > 0 || self.corrupted > 0
    }
}

pub fn collect_status_rows(
    config: &Config,
    locked_versions: &HashMap<String, String>,
) -> Vec<StatusRow> {
    let mut crate_names: Vec<&String> = config.crates.keys().collect();
    crate_names.sort();

    let mut rows = Vec::with_capacity(crate_names.len());

    for crate_name in crate_names {
        let lock_version = locked_versions.get(crate_name).cloned();
        let (synced_version, status) = detect_status(
            &config.settings.output_dir,
            crate_name,
            lock_version.as_deref(),
        );

        rows.push(StatusRow {
            crate_name: crate_name.clone(),
            lock_version,
            synced_version,
            status,
        });
    }

    rows
}

pub fn print_status_table(rows: &[StatusRow]) {
    let mut stdout = io::stdout();
    let _ = print_status_table_to(rows, &mut stdout);
}

fn print_status_table_to(rows: &[StatusRow], out: &mut impl Write) -> io::Result<()> {
    const CRATE_COL: &str = "Crate";
    const LOCK_COL: &str = "Lock";
    const SYNCED_COL: &str = "Synced";
    const STATUS_COL: &str = "Status";

    let crate_width = rows
        .iter()
        .map(|r| r.crate_name.len())
        .max()
        .unwrap_or(CRATE_COL.len())
        .max(CRATE_COL.len());

    let lock_width = rows
        .iter()
        .map(|r| r.lock_version.as_deref().unwrap_or("-").len())
        .max()
        .unwrap_or(LOCK_COL.len())
        .max(LOCK_COL.len());

    let synced_width = rows
        .iter()
        .map(|r| r.synced_version.as_deref().unwrap_or("-").len())
        .max()
        .unwrap_or(SYNCED_COL.len())
        .max(SYNCED_COL.len());

    let status_width = rows
        .iter()
        .map(|r| r.status.as_str().len())
        .max()
        .unwrap_or(STATUS_COL.len())
        .max(STATUS_COL.len());

    writeln!(
        out,
        "{CRATE_COL:<crate_width$}  {LOCK_COL:<lock_width$}  {SYNCED_COL:<synced_width$}  {STATUS_COL:<status_width$}"
    )?;
    writeln!(
        out,
        "{}  {}  {}  {}",
        "-".repeat(crate_width),
        "-".repeat(lock_width),
        "-".repeat(synced_width),
        "-".repeat(status_width)
    )?;

    for row in rows {
        writeln!(
            out,
            "{:<crate_width$}  {:<lock_width$}  {:<synced_width$}  {:<status_width$}",
            row.crate_name,
            row.lock_version.as_deref().unwrap_or("-"),
            row.synced_version.as_deref().unwrap_or("-"),
            row.status.as_str()
        )?;
    }

    let summary = StatusSummary::from_rows(rows);
    writeln!(
        out,
        "Summary: total={}, synced={}, missing={}, outdated={}, corrupted={}",
        summary.total, summary.synced, summary.missing, summary.outdated, summary.corrupted
    )?;

    if summary.has_sync_issues() {
        writeln!(out, "Run cargo ai-docs sync --force")?;
    }

    Ok(())
}

fn detect_status(
    output_dir: &Path,
    crate_name: &str,
    lock_version: Option<&str>,
) -> (Option<String>, SyncStatus) {
    let Some(lock_version) = lock_version else {
        return (None, SyncStatus::Missing);
    };

    let expected_dir = output_dir.join(format!("{crate_name}@{lock_version}"));
    if expected_dir.exists() {
        return if has_docs_content(&expected_dir) {
            (Some(lock_version.to_string()), SyncStatus::Synced)
        } else {
            (Some(lock_version.to_string()), SyncStatus::Corrupted)
        };
    }

    if let Some(version) = find_any_synced_version(output_dir, crate_name) {
        return (Some(version), SyncStatus::Outdated);
    }

    (None, SyncStatus::Missing)
}

fn has_docs_content(dir: &Path) -> bool {
    fs::read_dir(dir)
        .ok()
        .into_iter()
        .flatten()
        .flatten()
        .map(|entry| entry.file_name())
        .map(|name| name.to_string_lossy().to_string())
        .any(|name| name.ends_with(".md") || name == ".aifd-meta.toml")
}

fn find_any_synced_version(output_dir: &Path, crate_name: &str) -> Option<String> {
    let prefix = format!("{crate_name}@");

    fs::read_dir(output_dir)
        .ok()?
        .flatten()
        .filter_map(|entry| {
            let file_type = entry.file_type().ok()?;
            if !file_type.is_dir() {
                return None;
            }
            let name = entry.file_name().to_string_lossy().to_string();
            if !name.starts_with(&prefix) {
                return None;
            }
            name.strip_prefix(&prefix).map(|v| v.to_string())
        })
        .next()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn prints_stable_output_for_empty_rows() {
        let mut out = Vec::new();
        print_status_table_to(&[], &mut out).expect("status table should print");

        let text = String::from_utf8(out).expect("utf8");
        assert!(text.contains("Crate"));
        assert!(text.contains("Summary: total=0, synced=0, missing=0, outdated=0, corrupted=0"));
        assert!(!text.contains("Run cargo ai-docs sync --force"));
    }

    #[test]
    fn handles_row_without_lock_version() {
        let rows = vec![StatusRow {
            crate_name: "serde".to_string(),
            lock_version: None,
            synced_version: None,
            status: SyncStatus::Missing,
        }];

        let mut out = Vec::new();
        print_status_table_to(&rows, &mut out).expect("status table should print");

        let text = String::from_utf8(out).expect("utf8");
        assert!(text.contains("serde"));
        assert!(text.contains("Missing"));
        assert!(text.contains("Summary: total=1, synced=0, missing=1, outdated=0, corrupted=0"));
        assert!(text.contains("Run cargo ai-docs sync --force"));
    }
}
