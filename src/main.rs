mod config;
mod error;
mod fetcher;
mod resolver;

use std::path::PathBuf;

use clap::{Parser, Subcommand};
use tracing::{error, info, warn};

use crate::config::Config;
use crate::error::Result;

#[derive(Parser)]
#[command(name = "cargo-ai-fdocs")]
#[command(bin_name = "cargo")]
enum CargoCli {
    AiFdocs(Cli),
}

#[derive(Parser)]
#[command(version, about = "Sync documentation from dependencies for AI context")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Sync documentation based on lockfile
    Sync {
        #[arg(short, long)]
        force: bool,
    },
    /// Show current documentation status
    Status,
}

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::from_default_env()
                .add_directive(tracing::Level::INFO.into()),
        )
        .init();

    if let Err(e) = run().await {
        error!("Fatal error: {e}");
        std::process::exit(1);
    }
}

async fn run() -> Result<()> {
    let CargoCli::AiFdocs(cli) = CargoCli::parse();
    let config_path = PathBuf::from("ai-fdocs.toml");
    let project_root = PathBuf::from(".");

    match cli.command {
        Commands::Sync { force } => {
            info!("Starting sync... (force={force})");

            let config = match Config::load(&config_path) {
                Ok(cfg) => cfg,
                Err(error::AiDocsError::ConfigNotFound(_)) => {
                    print_config_example();
                    return Ok(());
                }
                Err(e) => return Err(e),
            };
            info!("Config loaded: {} crates defined.", config.crates.len());

            let lock_versions = resolver::resolve_versions(&project_root)?;
            info!("Cargo.lock parsed: {} packages found.", lock_versions.len());

            let github = fetcher::GitHubClient::new()?;

            for (crate_name, crate_config) in &config.crates {
                let version = match lock_versions.get(crate_name.as_str()) {
                    Some(v) => v,
                    None => {
                        warn!("Crate '{crate_name}' not found in Cargo.lock. Skipping.");
                        continue;
                    }
                };

                info!(
                    "Processing {}@{} from {}...",
                    crate_name, version, crate_config.repo
                );

                let resolved = github
                    .resolve_ref(&crate_config.repo, crate_name, version)
                    .await?;

                if resolved.is_fallback {
                    warn!(
                        "⚠ {}@{}: No tag found. Using '{}' branch (docs may differ).",
                        crate_name, version, resolved.git_ref
                    );
                }

                let fetched_files = match &crate_config.files {
                    Some(explicit_files) => {
                        github
                            .fetch_explicit_files(
                                &crate_config.repo,
                                &resolved.git_ref,
                                explicit_files,
                            )
                            .await?
                    }
                    None => {
                        github
                            .fetch_default_files(
                                &crate_config.repo,
                                &resolved.git_ref,
                                crate_config.subpath.as_deref(),
                            )
                            .await?
                    }
                };

                info!(
                    "  ✓ {}@{}: {} files fetched (ref: {}{})",
                    crate_name,
                    version,
                    fetched_files.len(),
                    resolved.git_ref,
                    if resolved.is_fallback {
                        " ⚠ fallback"
                    } else {
                        ""
                    }
                );

                for f in &fetched_files {
                    info!("    - {} ({} bytes)", f.path, f.content.len());
                }
            }

            info!("Sync complete.");
        }
        Commands::Status => {
            println!("Crate            Lock Version    Docs Status");
            println!("─────────────────────────────────────────────");
            println!("(Not implemented yet — Stage 4)");
        }
    }

    Ok(())
}

fn print_config_example() {
    eprintln!("ai-fdocs.toml not found. Create one in your project root.");
    eprintln!();
    eprintln!("Example:");
    eprintln!(r#"[crates.axum]"#);
    eprintln!(r#"repo = \"tokio-rs/axum\""#);
    eprintln!();
    eprintln!(r#"[crates.serde]"#);
    eprintln!(r#"repo = \"serde-rs/serde\""#);
    eprintln!(r#"ai_notes = \"Use derive macros for serialization.\""#);
}
