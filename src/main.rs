mod config;
mod error;
mod fetcher;
mod processor;
mod resolver;
mod storage;

use clap::{Parser, Subcommand};
use std::path::PathBuf;
use tracing::{error, info, warn};

use crate::config::{Config, Source};
use crate::fetcher::github::GitHubFetcher;
use crate::processor::changelog::trim_changelog;
use crate::storage::{Ecosystem, ResolvedCrate};

#[derive(Parser)]
#[command(
    name = "cargo-ai-docs",
    about = "Sync up-to-date library documentation for AI agents"
)]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Sync documentation for all configured dependencies
    Sync {
        #[arg(short, long, default_value = "ai-docs.toml")]
        config: PathBuf,
    },
    /// Show which docs are outdated vs lock files
    Status {
        #[arg(short, long, default_value = "ai-docs.toml")]
        config: PathBuf,
    },
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    // cargo subcommand передаёт "ai-docs" как первый аргумент — пропускаем
    let args: Vec<String> = std::env::args()
        .enumerate()
        .filter(|(i, arg)| !(*i == 1 && arg == "ai-docs"))
        .map(|(_, arg)| arg)
        .collect();

    let cli = Cli::parse_from(args);

    match cli.command {
        Commands::Sync { config } => {
            if let Err(e) = run_sync(&config).await {
                error!("Sync failed: {e}");
                std::process::exit(1);
            }
        }
        Commands::Status { config } => {
            if let Err(e) = run_status(&config).await {
                error!("Status check failed: {e}");
                std::process::exit(1);
            }
        }
    }
}

async fn run_sync(config_path: &PathBuf) -> error::Result<()> {
    let config = Config::load(config_path)?;
    info!("Loaded config from {}", config_path.display());

    // Резолвим версии из Cargo.lock
    let cargo_lock_path = PathBuf::from("Cargo.lock");
    let rust_versions = if cargo_lock_path.exists() {
        resolver::resolve_cargo_versions(&cargo_lock_path)?
    } else {
        warn!("Cargo.lock not found, skipping Rust dependencies");
        std::collections::HashMap::new()
    };

    let fetcher = GitHubFetcher::new();
    let mut resolved_crates = Vec::new();

    // Обрабатываем Rust-крейты
    for (crate_name, crate_doc) in &config.crates {
        let version = match rust_versions.get(crate_name.as_str()) {
            Some(v) => v.clone(),
            None => {
                warn!(
                    "Crate '{crate_name}' not found in Cargo.lock, skipping"
                );
                continue;
            }
        };

        info!("Syncing {crate_name}@{version}...");

        let mut all_files = Vec::new();

        for source in &crate_doc.sources {
            match source {
                Source::GitHub { repo, files } => {
                    let results = fetcher
                        .fetch_crate_files(repo, &version, files)
                        .await;

                    for result in results {
                        match result {
                            Ok(mut file) => {
                                // Обрезаем CHANGELOG
                                if file.filename.to_uppercase().contains("CHANGELOG") {
                                    file.content = trim_changelog(
                                        &file.content,
                                        &version,
                                    );
                                }
                                info!("  ✓ {}", file.filename);
                                all_files.push(file);
                            }
                            Err(e) => {
                                warn!("  ✗ {e}");
                            }
                        }
                    }
                }
                Source::DocsRs => {
                    info!("  ⏭ docs.rs source skipped (not implemented in MVP)");
                }
            }
        }

        resolved_crates.push(ResolvedCrate {
            name: crate_name.clone(),
            version,
            ai_notes: crate_doc.ai_notes.clone(),
            files: all_files,
            ecosystem: Ecosystem::Rust,
        });
    }

    // Записываем всё на диск
    storage::write_all(
        &config.settings.output_dir,
        &resolved_crates,
        config.settings.max_file_size_kb,
    )?;

    info!(
        "✅ Synced {} crates to {}",
        resolved_crates.len(),
        config.settings.output_dir.display()
    );

    Ok(())
}

async fn run_status(config_path: &PathBuf) -> error::Result<()> {
    let config = Config::load(config_path)?;

    let cargo_lock_path = PathBuf::from("Cargo.lock");
    let rust_versions = if cargo_lock_path.exists() {
        resolver::resolve_cargo_versions(&cargo_lock_path)?
    } else {
        std::collections::HashMap::new()
    };

    let output_dir = &config.settings.output_dir;

    println!("Dependency Status:");
    println!("{:-<60}", "");

    for (crate_name, _) in &config.crates {
        let lock_version = rust_versions
            .get(crate_name.as_str())
            .cloned()
            .unwrap_or_else(|| "???".to_string());

        // Проверяем, есть ли папка с этой версией
        let crate_dir = output_dir
            .join("rust")
            .join(format!("{crate_name}@{lock_version}"));

        let status = if crate_dir.exists() {
            "✅ OK"
        } else {
            // Может есть другая версия?
            let rust_dir = output_dir.join("rust");
            let existing = find_existing_version(&rust_dir, crate_name);
            match existing {
                Some(old_ver) => {
                    &format!("⚠️  OUTDATED ({old_ver} → {lock_version})")
                }
                None => "❌ MISSING",
            }
        };

        println!("  {crate_name:30} {lock_version:12} {status}");
    }

    Ok(())
}

fn find_existing_version(
    ecosystem_dir: &std::path::Path,
    crate_name: &str,
) -> Option<String> {
    let prefix = format!("{crate_name}@");
    if let Ok(entries) = std::fs::read_dir(ecosystem_dir) {
        for entry in entries.flatten() {
            let name = entry.file_name().to_string_lossy().to_string();
            if name.starts_with(&prefix) {
                return Some(name.trim_start_matches(&prefix).to_string());
            }
        }
    }
    None
}