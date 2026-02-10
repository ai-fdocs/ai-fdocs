use std::io::Write;
use std::path::Path;

use crate::error::Result;

#[derive(Debug, Clone, Copy)]
pub enum Ecosystem {
    Rust,
    Npm,
}

impl Ecosystem {
    fn as_dir(self) -> &'static str {
        match self {
            Ecosystem::Rust => "rust",
            Ecosystem::Npm => "npm",
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResolvedFile {
    pub filename: String,
    pub source_path: String,
    pub source_url: String,
    pub content: String,
}

#[derive(Debug, Clone)]
pub struct ResolvedCrate {
    pub name: String,
    pub version: String,
    pub ai_notes: String,
    pub files: Vec<ResolvedFile>,
    pub ecosystem: Ecosystem,
}

pub fn write_all(
    output_dir: &Path,
    crates: &[ResolvedCrate],
    max_file_size_kb: usize,
) -> Result<()> {
    std::fs::create_dir_all(output_dir)?;

    for item in crates {
        let crate_dir = output_dir
            .join(item.ecosystem.as_dir())
            .join(format!("{}@{}", item.name, item.version));
        std::fs::create_dir_all(&crate_dir)?;

        let summary = crate_dir.join("_SUMMARY.md");
        let mut summary_content = format!("# {}@{}\n\n", item.name, item.version);
        if !item.ai_notes.is_empty() {
            summary_content.push_str("## AI Notes\n");
            summary_content.push_str(&item.ai_notes);
            summary_content.push_str("\n\n");
        }
        summary_content.push_str("## Files\n");

        for file in &item.files {
            let mut content = file.content.clone();
            let limit = max_file_size_kb * 1024;
            if content.len() > limit {
                content.truncate(limit);
                content.push_str("\n\n<!-- truncated by cargo-ai-fdocs -->\n");
            }

            let with_header = format!(
                "<!-- source_path: {} -->\n<!-- source_url: {} -->\n\n{}",
                file.source_path, file.source_url, content
            );

            let target = crate_dir.join(&file.filename);
            std::fs::write(&target, with_header)?;
            summary_content.push_str(&format!("- {}\n", file.filename));
        }

        std::fs::write(summary, summary_content)?;
    }

    let mut index = std::fs::File::create(output_dir.join("_INDEX.md"))?;
    writeln!(index, "# AI Vendor Docs Index\n")?;
    for item in crates {
        writeln!(
            index,
            "- {}/{}/{}@{}",
            item.ecosystem.as_dir(),
            item.name,
            item.name,
            item.version
        )?;
    }

    Ok(())
}
