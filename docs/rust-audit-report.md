# Rust audit report (cargo implementation)

## Scope
- Reviewed the Rust CLI/library implementation in `cargo/src`.
- Ran build/test checks to validate operational status.

## What was fixed during this pass
1. **Compilation blockers in orchestration flow**
   - Fixed undefined `max_file_size_kb` capture in `run_sync` closure.
   - Wired cache freshness helper import/use for latest-docs TTL checks.
   - Removed duplicated function definitions in `main.rs` (`is_readme_request`, `sync_one_crate_from_github`) that caused symbol redefinition errors.

2. **Config validation regression**
   - Restored definition for `require_github_repo` in config validation logic (required for lockfile/hybrid, optional for latest-docs).

3. **API/signature consistency for latest-docs persistence**
   - Updated `save_latest_api_markdown` to accept `max_file_size_kb` explicitly and use it for truncation marker metadata.
   - Updated call sites accordingly.

4. **Type/usage mismatches**
   - Fixed href parser reference typing in `fetcher/latest.rs` (`extract_href`).
   - Updated tests to align with current return types and config hash API.

## Current runtime status
- `cargo check` now passes (project compiles).
- `cargo test` still has failing tests (functional regressions remain).

## Remaining failing tests and recommendations
1. **Path assumption in config test**
   - `example_config_parses_with_config_load` fails because test expects `examples/ai-docs.toml` relative to `cargo/` crate root.
   - **Recommendation:** use repo-root aware path resolution in tests, or place fixture under `cargo/examples`.

2. **HTML-to-markdown conversion behavior drift**
   - `test_extract_main_content_simple` and `test_strip_html_tags_with_links_and_spacing` fail due to whitespace/link rendering differences.
   - **Recommendation:** define strict parser contract and normalize with deterministic golden tests (line breaks, inline links, entity unescaping).

3. **Status classification for fallback metadata**
   - `collect_status_latest_marks_github_fallback_as_synced_fallback` returns `Corrupted` instead of `SyncedFallback`.
   - **Recommendation:** review meta schema expectations in status evaluator (required fields and migration fallback behavior for `source_kind`).

4. **Legacy meta migration not applied**
   - `test_load_meta_migrates_legacy_schema` indicates schema version stays `0` instead of being upgraded.
   - **Recommendation:** implement actual on-read migration + rewrite for legacy metadata, not only tolerant parse.

## Suggested next hardening steps
- Add CI gate: `cargo check && cargo test` for `cargo/` on every PR.
- Add a focused `latest-docs` parser test matrix with realistic docs.rs HTML fixtures.
- Add migration invariants test suite for `.aifd-meta.toml` schema upgrades.
- Add a small integration test for each sync mode (`lockfile`, `latest-docs`, `hybrid`) against fixtures.
