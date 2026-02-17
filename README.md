# AI Fresh Docs Monorepo

`AI Fresh Docs` — набор инструментов для синхронизации документации зависимостей
под точные версии из lock-файлов (Rust/NPM), чтобы AI-ассистенты работали с
актуальным контекстом.

## Что находится в этом репозитории

## Repository architecture map (source of truth)

The **main architecture map for this monorepo** lives in this root `README.md`.
If you need a top-level view of repository structure and boundaries between
Rust/NPM/VS Code parts, start here.

> Technical internals for the Rust and NPM standalone implementations are documented in
> [`cargo/docs/architecture/README.md`](./cargo/docs/architecture/README.md)
> and linked pages.

## Doc ownership

> [!NOTE]
> During repository reorganization, keep these docs aligned:
>
> - **Root `README.md` (this file)** — monorepo architecture map, product positioning,
>   and cross-edition boundaries. **Updated by:** repo maintainers/architects driving
>   monorepo structure changes.
> - **`Manifest.md`** — product intent, milestones, roadmap, and delivery plan.
>   **Updated by:** product/roadmap owners when scope or priorities change.
> - **`cargo/docs/architecture/README.md` + linked pages** — implementation-level
>   technical docs for the Rust and NPM implementations (modules, flows, operational behavior).
>   **Updated by:** Rust/NPM engineering owners whenever module structure or runtime
>   behavior changes.

## The Suite (3 Editions)

1. **Rust CLI (cargo plugin)** 🦀
   - Папка: [`cargo/`](./cargo)
   - Бинарь: `cargo-ai-fdocs` (команда: `cargo ai-fdocs ...`)
   - Назначение: базовый движок (резолв версий, скачивание, кэш, индексация)

2. **NPM CLI** 📦
   - Папка: [`npm/`](./npm)
   - Бинарь: `ai-fdocs`
   - Назначение: аналогичный CLI-контур для Node.js/TypeScript проектов

3. **VS Code Extension** 🆚
   - Папка: [`vscode/`](./vscode)
   - Назначение: UI-обертка над CLI-командами внутри редактора

## Текущее состояние

- Папки `cargo/`, `npm/`, `vscode/` подготовлены к дальнейшему выделению в
  отдельные репозитории.
- Контракты команд выровнены (`init`, `sync`, `status`, `check`) с поправками
  на экосистему.
- Документация в корне содержит общий контекст, а детальная документация живет
  внутри соответствующих подпроектов.

## Быстрая навигация

- Rust CLI: [`cargo/README` и docs](./cargo)
- Архитектура Rust/NPM: [`cargo/docs/architecture/README.md`](./cargo/docs/architecture/README.md)
- NPM CLI: [`npm/README.md`](./npm/README.md)
- VS Code extension: [`vscode/README.md`](./vscode/README.md)
- Общий roadmap: [`ROADMAP.md`](./ROADMAP.md)

## Почему это полезно

Проблема: AI часто использует устаревшие API из старых данных обучения.

Решение: `ai-fdocs` подтягивает README/CHANGELOG/гайды для **конкретных версий**
зависимостей, складывает их в локальную папку `fdocs`, и этот индекс используют
Cursor/Copilot/Windsurf и другие ассистенты.

## Why this exists

In practice, many AI coding failures happen not because the model cannot reason,
but because it references outdated APIs. This frequently causes trust loss:
compilation fails, developers stop relying on the assistant, and productivity
falls back to manual lookup.

We treat this as an engineering hygiene problem:

* lockfile version is the source of truth;
* docs are fetched for that exact version (or fallback branch with warning);
* local docs are refreshed after dependency updates.

## Safety and degraded-mode behavior

AI Fresh Docs is designed to be **non-blocking** for your development platform.
If external documentation sources (GitHub/registry) are unavailable, the tool must
behave safely:

* never mutate or delete project source code;
* keep already downloaded docs cache intact unless explicit prune rules apply;
* continue processing other dependencies (best-effort) instead of crashing whole run;
* return clear diagnostics in `status/check` so CI and users can see what failed;
* fail only the docs check contract (`check` exit code) rather than breaking runtime/application logic.

In short: network outages degrade docs freshness, but must not break the host project.

## Current alpha scope (this repository)

Implemented now:

* parse project config (`ai-fdocs.toml`);
* resolve crate versions from `Cargo.lock`;
* fetch docs from GitHub (including custom file lists);
* cache per crate/version with metadata and config fingerprint invalidation;
* prune outdated crate folders;
* generate global index (`_INDEX.md`);
* show status of synced docs;
* continue sync when one crate/file fails (best-effort), reporting errors in final summary statistics.
* run crate sync in parallel for faster lockfile processing.

Current commands:

```bash
cargo ai-fdocs sync
cargo ai-fdocs sync --force
cargo ai-fdocs status
cargo ai-fdocs status --format json
cargo ai-fdocs check
cargo ai-fdocs check --mode latest-docs
cargo ai-fdocs check --format json
cargo ai-fdocs status --mode latest-docs
cargo ai-fdocs init
```

> Note: the package name is `cargo-ai-fdocs`, while the current alpha command
> flow in this branch uses `cargo ai-fdocs ...`.

## Sync mode safety switch

`lockfile` remains the safe default mode in the first release stage.

* Source of truth for mode resolution: CLI `--mode` has priority over `settings.sync_mode`.
* Supported values: `lockfile` (stable default), `latest-docs` / `latest_docs` (beta only).
* If no CLI flag is provided, behavior is unchanged: sync follows lockfile flow.
* `latest-docs` is marked **beta** and is intentionally guarded behind explicit opt-in.

Examples:

```bash
# stable/default behavior
cargo ai-fdocs sync

# explicit beta opt-in (first stage)
cargo ai-fdocs sync --mode latest-docs
```

## Quick start

1. Install

```bash
cargo install cargo-ai-fdocs
```

1. Create `ai-fdocs.toml`

```toml
[settings]
output_dir = "fdocs"
max_file_size_kb = 200
prune = true
sync_concurrency = 8
docs_source = "github"
sync_mode = "lockfile"
latest_ttl_hours = 24
docsrs_single_page = true

[crates.axum]
repo = "tokio-rs/axum"
ai_notes = "Prefer extractor-based handlers and Router-first composition."

[crates.sqlx]
repo = "launchbadge/sqlx"
files = ["README.md", "CHANGELOG.md", "docs/migration-guide.md"]
ai_notes = "Prefer compile-time checked queries with sqlx::query!"
```

1. Sync docs

```bash
# one command (auto-init if ai-fdocs.toml is missing)
./scripts/fdocs-sync.sh

# direct command
cargo ai-fdocs sync
```

Cleanup generated docs when needed:

```bash
./scripts/fdocs-clean.sh        # removes ./fdocs
./scripts/fdocs-clean.sh fdocs  # custom dir
```

By default files are stored in:

```text
fdocs/rust/
├── _INDEX.md
├── axum@<version>/
│   ├── .aifd-meta.toml
│   ├── _SUMMARY.md
│   ├── README.md
│   └── CHANGELOG.md
└── sqlx@<version>/
    ├── .aifd-meta.toml
    ├── _SUMMARY.md
    ├── README.md
    └── docs__migration-guide.md
```

## Проверка ссылок

Для проверки локальных ссылок в Markdown-файлах (relative links) запустите:

```bash
python scripts/check_md_links.py
```

Скрипт проверяет все `*.md`, игнорирует `http(s)`, `mailto` и anchor-ссылки,
а при ошибках печатает список в формате `file -> broken link` и завершается с non-zero кодом.

## How it works

1. Read exact crate versions from `Cargo.lock`.
2. Resolve a matching Git ref for each configured crate.
3. Download default or explicit file list from GitHub.
4. Truncate oversized files and process CHANGELOG content.
5. Save docs in versioned folders and write crate metadata.
6. Regenerate `_INDEX.md` for AI navigation.

## Configuration reference

`ai-fdocs.toml` supports:

* `[settings]`
  * `output_dir` (default: `fdocs`)
  * `max_file_size_kb` (default: `200`)
  * `prune` (default: `true`)
  * `sync_concurrency` (default: `8`)
  * `docs_source` (default: `"github"`)
  * `sync_mode` (default: `"lockfile"`, also supports `"latest_docs"` / `"latest-docs"`)
  * `latest_ttl_hours` (default: `24`, used in `latest_docs` mode)
  * `docsrs_single_page` (default: `true`, latest-docs parser strategy flag; `false` is not supported yet in current stage)

* `[crates.<name>]`
  * `repo` (recommended, `owner/repo`)
  * `subpath` (optional monorepo prefix for default files)
  * `files` (optional explicit file list)
  * `ai_notes` (optional hints included in index)

Legacy `sources = [{ type = "github", repo = "..." }]` is still accepted for
backward compatibility, but new configs should use `repo`.

## Practical AI integration

In CI (`cargo ai-fdocs check`), failures include per-crate reasons; in GitHub Actions they are additionally emitted as `::error` annotations.

`status/check --format json` now includes mode/source diagnostics per crate (`mode`, `source_kind`, `reason_code`) for machine-readable CI handling.

`_SUMMARY.md` now includes explicit source provenance for latest-docs artifacts (docs.rs vs GitHub fallback) and truncation marker state.

## Architecture & Components

`ai-fdocs` is designed as a modular platform with a high-performance core and multiple interfaces:

* **Core (`src/`)**: The Rust-based engine handling fetching, parsing, caching, and AI summarization.
* **NPM CLI (`npm/`)**: A Node.js implementation providing a native experience for JavaScript/TypeScript developers.
* **VS Code Extension (`vscode/`)**: A planned graphical interface for managing documentation directly in the editor.

Future plans include adapters for Python (PyPI), Go, and other ecosystems.

### CI recipes (GitHub Actions)

#### 1) `check` gate (PR/merge safety)

```yaml
name: ai-fdocs-check
on:
  pull_request:
  push:
    branches: [main]

jobs:
  check-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2

      - name: Check ai-fdocs status (JSON)
        run: cargo ai-fdocs check --format json
```

#### 2) `sync` updater (scheduled + manual)

```yaml
name: ai-fdocs-sync
on:
  workflow_dispatch:
  schedule:
    - cron: "0 6 * * 1" # weekly, Mondays 06:00 UTC

jobs:
  sync-docs:
    runs-on: ubuntu-latest
    permissions:
      contents: write
    steps:
      - uses: actions/checkout@v4

      - name: Install Rust
        uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo
        uses: Swatinem/rust-cache@v2

      - name: Sync docs
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        run: cargo ai-fdocs sync

      - name: Commit updated docs
        run: |
          git config user.name "github-actions[bot]"
          git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
          git add fdocs ai-fdocs.toml
          git diff --cached --quiet || git commit -m "chore: refresh ai-fdocs"

      - name: Push changes
        run: git push
```

#### 3) `cache`-aware variant (explicit Cargo cache keys)

```yaml
name: ai-fdocs-check-cache
on:
  pull_request:

jobs:
  check-docs:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: dtolnay/rust-toolchain@stable

      - name: Cache cargo registry + target
        uses: actions/cache@v4
        with:
          path: |
            ~/.cargo/registry
            ~/.cargo/git
            target
          key: ${{ runner.os }}-cargo-${{ hashFiles('**/Cargo.lock') }}
          restore-keys: |
            ${{ runner.os }}-cargo-

      - name: Run check
        run: cargo ai-fdocs check --format json
```

### JSON output contract (`status/check --format json`)

Top-level object:

* `summary`: counters for current run
  * `total`, `synced`, `missing`, `outdated`, `corrupted`
* `statuses`: per-crate entries
  * `crate_name`, `lock_version`, `docs_version`, `status`, `reason`

`status` enum values:

* `Synced`
* `SyncedFallback`
* `Outdated`
* `Missing`
* `Corrupted`

For Cursor-like tools, point instructions to:

* `fdocs/rust/_INDEX.md` first,
* then the crate folder matching the current lockfile version.

This reduces stale API suggestions and makes generated code more consistent
with your project’s real dependency graph.

## Roadmap to stable release

### 1) Reliability hardening (near-term)

* [x] Improve retry/backoff behavior for GitHub API and raw-content downloads.
* [x] Add clearer error classification (auth/rate-limit/not-found/network) in `sync` summary.
* [x] Expand integration tests for lockfile parsing, fallback-to-branch, and partial failure scenarios.

### 2) CI and team workflows

* [x] Stabilize `cargo ai-fdocs check` exit codes for predictable CI gating.
* [x] Add machine-readable check output mode (JSON) for CI/report tooling.
* [x] Provide ready-to-copy GitHub Actions recipes in docs.

### 3) Output and cache stability

* `.aifd-meta.toml` now carries an explicit schema version (`schema_version = 1`) as a stable baseline.
* Legacy cache metadata without schema version is auto-migrated on read; newer unknown schema versions are treated as incompatible.
* [x] Improve index ergonomics (`_INDEX.md`) for large dependency graphs.

### 4) Release readiness (v1.0)

* [x] Finalize CLI UX and help text consistency across all subcommands.
* [x] Complete cross-platform smoke checks (Linux/macOS/Windows).
* [x] Publish a compatibility/support policy and semantic-versioning guarantees.

### 5) Tooling technical debt (next refactor candidate)

* [x] Refactor `storage::save_crate_files` API to remove the `too_many_arguments` clippy warning.

## License

MIT
