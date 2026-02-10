use reqwest::header::{HeaderMap, HeaderValue, ACCEPT, AUTHORIZATION, USER_AGENT};
use tracing::{debug, info, warn};

use crate::error::{AiDocsError, Result};

pub struct ResolvedRef {
    pub git_ref: String,
    pub is_fallback: bool,
}

pub struct FetchedFile {
    pub path: String,
    pub content: String,
}

pub struct GitHubClient {
    client: reqwest::Client,
    #[allow(dead_code)]
    has_token: bool,
}

impl GitHubClient {
    /// Create HTTP client. Checks GITHUB_TOKEN -> GH_TOKEN -> unauthenticated.
    pub fn new() -> Result<Self> {
        let mut headers = HeaderMap::new();
        headers.insert(USER_AGENT, HeaderValue::from_static("cargo-ai-fdocs/0.1"));
        headers.insert(
            ACCEPT,
            HeaderValue::from_static("application/vnd.github.v3+json"),
        );

        let token = std::env::var("GITHUB_TOKEN")
            .or_else(|_| std::env::var("GH_TOKEN"))
            .ok();

        let has_token = token.is_some();

        if let Some(ref t) = token {
            let val = HeaderValue::from_str(&format!("Bearer {t}"))
                .map_err(|e| AiDocsError::Unknown(format!("Invalid token header: {e}")))?;
            headers.insert(AUTHORIZATION, val);
            info!("GitHub token found. Rate limit: 5000 req/hr.");
        } else {
            warn!(
                "⚠ No GITHUB_TOKEN found. Rate limit: 60 req/hr. Set GITHUB_TOKEN for 5000 req/hr."
            );
        }

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .timeout(std::time::Duration::from_secs(30))
            .build()?;

        Ok(Self { client, has_token })
    }

    /// Resolve a git tag for version.
    /// Tries: v{ver}, {ver}, {name}-v{ver}, {name}-{ver}. Falls back to default branch.
    pub async fn resolve_ref(
        &self,
        owner_repo: &str,
        crate_name: &str,
        version: &str,
    ) -> Result<ResolvedRef> {
        let tag_candidates = vec![
            format!("v{version}"),
            version.to_string(),
            format!("{crate_name}-v{version}"),
            format!("{crate_name}-{version}"),
        ];

        for tag in &tag_candidates {
            let url = format!("https://api.github.com/repos/{owner_repo}/git/ref/tags/{tag}");
            debug!("Trying tag: {tag}");

            let resp = self.client.get(&url).send().await?;

            match resp.status().as_u16() {
                200 => {
                    info!("Found tag '{tag}' for {crate_name}@{version}");
                    return Ok(ResolvedRef {
                        git_ref: tag.clone(),
                        is_fallback: false,
                    });
                }
                404 => continue,
                429 => {
                    return Err(AiDocsError::Unknown(
                        "GitHub API rate limit exceeded. Set GITHUB_TOKEN to increase limit."
                            .to_string(),
                    ));
                }
                status => {
                    warn!("Unexpected status {status} for tag '{tag}', skipping");
                    continue;
                }
            }
        }

        info!("No tag found for {crate_name}@{version}. Falling back to default branch.");
        let default_branch = self.get_default_branch(owner_repo).await?;

        Ok(ResolvedRef {
            git_ref: default_branch,
            is_fallback: true,
        })
    }

    async fn get_default_branch(&self, owner_repo: &str) -> Result<String> {
        let url = format!("https://api.github.com/repos/{owner_repo}");
        let resp = self.client.get(&url).send().await?;

        if !resp.status().is_success() {
            return Err(AiDocsError::Unknown(format!(
                "Failed to get repo info for {owner_repo}: {}",
                resp.status()
            )));
        }

        let body: serde_json::Value = resp
            .json()
            .await
            .map_err(|e| AiDocsError::Unknown(format!("Failed to parse repo info: {e}")))?;

        let branch = body["default_branch"]
            .as_str()
            .unwrap_or("main")
            .to_string();

        info!("Default branch for {owner_repo}: {branch}");
        Ok(branch)
    }

    /// Fetch a file via raw.githubusercontent.com.
    /// Ok(Some(content)) on success, Ok(None) for 404, Err for transport/rate-limit cases.
    pub async fn fetch_file(
        &self,
        owner_repo: &str,
        git_ref: &str,
        file_path: &str,
    ) -> Result<Option<String>> {
        let url = format!("https://raw.githubusercontent.com/{owner_repo}/{git_ref}/{file_path}");
        debug!("Fetching: {url}");

        let resp = self.client.get(&url).send().await?;

        match resp.status().as_u16() {
            200 => {
                let content = resp.text().await?;
                Ok(Some(content))
            }
            404 => {
                debug!("File not found: {file_path}");
                Ok(None)
            }
            429 => Err(AiDocsError::Unknown(
                "GitHub API rate limit exceeded. Set GITHUB_TOKEN to increase limit.".to_string(),
            )),
            status => {
                if status >= 500 {
                    warn!("Server error {status} for {file_path}. Retrying in 2s...");
                    tokio::time::sleep(std::time::Duration::from_secs(2)).await;

                    let retry_resp = self.client.get(&url).send().await?;
                    if retry_resp.status().is_success() {
                        let content = retry_resp.text().await?;
                        return Ok(Some(content));
                    }
                    warn!("Retry failed for {file_path}. Skipping.");
                    Ok(None)
                } else {
                    warn!("Unexpected status {status} fetching {file_path}. Skipping.");
                    Ok(None)
                }
            }
        }
    }

    /// Fetch default docs (README + CHANGELOG) with case variants.
    pub async fn fetch_default_files(
        &self,
        owner_repo: &str,
        git_ref: &str,
        subpath: Option<&str>,
    ) -> Result<Vec<FetchedFile>> {
        let mut files = Vec::new();

        let prefix = match subpath {
            Some(sp) => format!("{sp}/"),
            None => String::new(),
        };

        let readme_variants = vec!["README.md", "readme.md", "Readme.md"];
        for variant in &readme_variants {
            let path = format!("{prefix}{variant}");
            if let Some(content) = self.fetch_file(owner_repo, git_ref, &path).await? {
                files.push(FetchedFile {
                    path: path.clone(),
                    content,
                });
                break;
            }
        }

        let changelog_variants = vec!["CHANGELOG.md", "Changelog.md", "changelog.md"];
        for variant in &changelog_variants {
            let path = format!("{prefix}{variant}");
            if let Some(content) = self.fetch_file(owner_repo, git_ref, &path).await? {
                files.push(FetchedFile {
                    path: path.clone(),
                    content,
                });
                break;
            }
        }

        Ok(files)
    }

    /// Fetch explicitly configured files. Returns error when any explicit file is missing.
    pub async fn fetch_explicit_files(
        &self,
        owner_repo: &str,
        git_ref: &str,
        file_paths: &[String],
    ) -> Result<Vec<FetchedFile>> {
        let mut files = Vec::new();

        for path in file_paths {
            match self.fetch_file(owner_repo, git_ref, path).await? {
                Some(content) => files.push(FetchedFile {
                    path: path.clone(),
                    content,
                }),
                None => {
                    return Err(AiDocsError::Unknown(format!(
                        "Explicit file not found: '{path}' in {owner_repo} at ref '{git_ref}'. Check your ai-fdocs.toml."
                    )));
                }
            }
        }

        Ok(files)
    }
}
