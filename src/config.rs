use serde::Deserialize;
use std::collections::HashMap;
use std::path::{Path, PathBuf};

use crate::error::{AiDocsError, Result};

#[derive(Debug, Deserialize)]
pub struct Config {
    pub settings: Settings,
    #[serde(default)]
    pub crates: HashMap<String, CrateDoc>,
    #[serde(default)]
    pub npm: HashMap<String, NpmDoc>,
}

#[derive(Debug, Deserialize)]
pub struct Settings {
    #[serde(default = "default_output_dir")]
    pub output_dir: PathBuf,
    #[serde(default = "default_max_file_size_kb")]
    pub max_file_size_kb: usize,
    #[serde(default = "default_true")]
    pub include_changelog: bool,
    #[serde(default = "default_true")]
    pub include_readme: bool,
    #[serde(default)]
    pub include_migration_guide: bool,
}

fn default_output_dir() -> PathBuf {
    PathBuf::from("docs/ai/vendor-docs")
}

fn default_max_file_size_kb() -> usize {
    200
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Deserialize)]
pub struct CrateDoc {
    #[serde(default)]
    pub sources: Vec<Source>,
    #[serde(default)]
    pub ai_notes: String,
}

#[derive(Debug, Deserialize)]
pub struct NpmDoc {
    #[serde(default)]
    pub sources: Vec<Source>,
    #[serde(default)]
    pub ai_notes: String,
}

#[derive(Debug, Deserialize)]
#[serde(tag = "type")]
pub enum Source {
    #[serde(rename = "github")]
    GitHub {
        repo: String,
        #[serde(default)]
        files: Vec<String>,
    },
    #[serde(rename = "docs-rs")]
    DocsRs,
}

impl Config {
    pub fn load(path: &Path) -> Result<Self> {
        if !path.exists() {
            return Err(AiDocsError::ConfigNotFound(path.to_path_buf()));
        }
        let content = std::fs::read_to_string(path)?;
        let config: Config = toml::from_str(&content)?;
        Ok(config)
    }
}
