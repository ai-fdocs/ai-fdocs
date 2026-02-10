use reqwest::StatusCode;

use crate::error::{AiDocsError, Result};
use crate::storage::ResolvedFile;

pub struct GitHubFetcher {
    client: reqwest::Client,
}

impl GitHubFetcher {
    pub fn new() -> Self {
        let mut headers = reqwest::header::HeaderMap::new();
        headers.insert(
            reqwest::header::USER_AGENT,
            reqwest::header::HeaderValue::from_static("cargo-ai-fdocs/0.1"),
        );

        if let Ok(token) = std::env::var("GITHUB_TOKEN").or_else(|_| std::env::var("GH_TOKEN")) {
            if let Ok(mut value) =
                reqwest::header::HeaderValue::from_str(&format!("Bearer {token}"))
            {
                value.set_sensitive(true);
                headers.insert(reqwest::header::AUTHORIZATION, value);
            }
        }

        let client = reqwest::Client::builder()
            .default_headers(headers)
            .build()
            .expect("reqwest client");

        Self { client }
    }

    pub async fn fetch_crate_files(
        &self,
        repo: &str,
        version: &str,
        files: &[String],
    ) -> Vec<Result<ResolvedFile>> {
        let file_list: Vec<String> = if files.is_empty() {
            vec!["README.md".to_string(), "CHANGELOG.md".to_string()]
        } else {
            files.to_vec()
        };

        let mut out = Vec::with_capacity(file_list.len());
        for path in file_list {
            out.push(self.fetch_file(repo, version, &path).await);
        }
        out
    }

    async fn fetch_file(&self, repo: &str, version: &str, path: &str) -> Result<ResolvedFile> {
        let repo_name = repo.rsplit('/').next().unwrap_or(repo);
        let tags = vec![
            format!("v{version}"),
            version.to_string(),
            format!("{repo_name}-v{version}"),
            format!("{repo_name}-{version}"),
            "main".to_string(),
            "master".to_string(),
        ];

        let mut tried = Vec::new();

        for tag in tags {
            let url = format!("https://raw.githubusercontent.com/{repo}/{tag}/{path}");
            tried.push(tag.clone());

            let response =
                self.client
                    .get(&url)
                    .send()
                    .await
                    .map_err(|source| AiDocsError::Fetch {
                        url: url.clone(),
                        source,
                    })?;

            if response.status() == StatusCode::NOT_FOUND {
                continue;
            }

            if !response.status().is_success() {
                return Err(AiDocsError::Other(format!(
                    "Unexpected status {} for {}",
                    response.status(),
                    url
                )));
            }

            let content = response.text().await.map_err(|source| AiDocsError::Fetch {
                url: url.clone(),
                source,
            })?;

            return Ok(ResolvedFile {
                filename: path.replace('/', "__"),
                source_path: path.to_string(),
                source_url: url,
                content,
            });
        }

        Err(AiDocsError::GitHubFileNotFound {
            repo: repo.to_string(),
            path: path.to_string(),
            tried_tags: tried,
        })
    }
}
