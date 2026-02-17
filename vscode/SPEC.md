# VS Code Extension Specification for `AI Fresh Docs`

## 1. Overview

The **VS Code Extension** acts as the primary GUI for `AI Fresh Docs` (specifically wrapping the `cargo-ai-fdocs` Core binary). It provides visibility into project dependencies and "one-click" administration of documentation syncing.

**Key Constraint**: The extension MUST wrap the **AI Fresh Docs Core** (Rust binary). It should NOT reimplement core logic in TypeScript unless absolutely necessary for UI responsiveness.

## 2. Technical Architecture

### 2.1 Binary Management

- **Detection**: On startup, check for `ai-fdocs` in PATH.
- **Downloading**: If missing, prompt user to:
  - [Download Prebuilt Binary] (GitHub Release)
  - [Build from Source] (`cargo install cargo-ai-fdocs`)
  - [Use NPM Wrapper] (`npm install -g ai-fdocs` -> points to `npn/` CLI) - *Fallback option*
- **Configuration**: `ai-fdocs.binaryPath` setting to override location.

### 2.2 Project Detection

- Scan workspace folders for:
  - `Cargo.toml` -> Rust Project
  - `package.json` -> Node.js Project (if `dependencies` present)
  - `pyproject.toml` / `requirements.txt` -> Python Project (Future)
- Activate extension only when relevant files are found (`activationEvents`).

### 2.3 Data Flow

1. **Read Config**: Parse `ai-fdocs.toml` (or generate/init one via `ai-fdocs init` if missing).
2. **Fetch Status**: Run `ai-fdocs status --json` (or `check --json`).
3. **Update UI**:
    - Map JSON output to `TreeDataProvider`.
    - Items: `Crate Name` -> `Version` -> `Status Icon`.

### 2.4 Settings Resolution & Validation

The extension resolves runtime settings from multiple sources in this order (highest priority first):

1. **Command override** (per-command/explicit override)
2. **VS Code settings** (`ai-fdocs.*`)
3. **`ai-fdocs.toml` `[settings]` values**
4. **Built-in defaults**

Validation rules mirror CLI constraints for shared fields:

- `output_dir` must be a non-empty string.
- `max_file_size_kb` must be an integer `> 0`.
- `sync_concurrency` must be an integer between `1` and `50`.
- `latest_ttl_hours` must be an integer `> 0`.
- `docs_source`: `github | npm_tarball`.
- `sync_mode`: `lockfile | latest-docs` (with `latest_docs` normalized when loaded from TOML).
- `report_format`: `text | json`.
- `format`: `table | json`.

### 2.5 Config parity (Rust / NPM / VS Code)

| Meaning | Rust (`ai-fdocs.toml`) | NPM (`ai-fdocs.toml`) | VS Code setting |
| --- | --- | --- | --- |
| Output dir | `settings.output_dir` | `settings.output_dir` | `ai-fdocs.outputDir` |
| Max file size (KB) | `settings.max_file_size_kb` | `settings.max_file_size_kb` | `ai-fdocs.maxFileSizeKb` |
| Sync concurrency | `settings.sync_concurrency` | `settings.sync_concurrency` | `ai-fdocs.syncConcurrency` |
| Prune stale docs | `settings.prune` | `settings.prune` | `ai-fdocs.prune` |
| Docs source | `settings.docs_source` (`github`) | `settings.docs_source` (`github|npm_tarball`) | `ai-fdocs.docsSource` (`github|npm_tarball`) |
| Sync mode | `settings.sync_mode` (`lockfile|latest_docs|hybrid`) | `settings.sync_mode` (`lockfile|latest_docs|hybrid`) | `ai-fdocs.syncMode` (`lockfile|latest-docs`) |
| Latest TTL (hours) | `settings.latest_ttl_hours` | `settings.latest_ttl_hours` | `ai-fdocs.latestTtlHours` |
| Report format | CLI flag (`--report-format`) | CLI flag (`--report-format`) | `ai-fdocs.reportFormat` |
| Output format | CLI flag (`--format`) | CLI flag (`--format`) | `ai-fdocs.format` |

## 3. User Interface Features

### 3.1 Side Bar (Activity Bar)

- **View Container**: "AI Docs"
- **View**: "Dependencies"
  - **Tree Item Structure**:
    - 📦 **serde** `1.0.197`
      - 📄 `README.md` (Click to open preview)
      - 📝 `CHANGELOG.md` (Click to open preview)
      - ℹ️ *Synced 2 days ago*

### 3.2 Commands (Palette & Buttons)

- `AI-Docs: Sync All` (Button on view title)
  - Runs `ai-fdocs sync`. Shows progress notification.
- `AI-Docs: Force Sync` (ContextMenu on package)
  - Runs `ai-fdocs sync --force <package>`.
- `AI-Docs: Prune` (Button on view title)
  - Runs `ai-fdocs prune`.
- `AI-Docs: Initialize` (If config missing)
  - Runs `ai-fdocs init`.

### 3.3 Editor Integration

- **CodeLens**: In `Cargo.toml` / `package.json`.
  - Above dependency line: `$(book) Open Docs` -> Opens local `_SUMMARY.md`.
- **Hover Provider**:
  - Hovering over a dependency name shows a summary from `ai_notes` in `ai-fdocs.toml` if available.

## 4. Implementation Plan (Agent Instructions)

### Phase 1: Skeleton & Binary

1. Initialize extension with `yo code`.
2. Implement `BinaryManager` class to check/find `ai-fdocs`.
3. Register `ai-fdocs.version` command to test binary connection.

### Phase 2: Tree View & Status

1. Create `DependencyTreeProvider` implementing `vscode.TreeDataProvider`.
2. Implement `refresh()` method that calls `ai-fdocs status --json`.
3. Define `DependencyItem` class.

### Phase 3: Commands & Interaction

1. Bind UI buttons to commands executing `ai-fdocs sync`.
2. Implement `vscode.window.withProgress` for long-running syncs.
3. Add "Open Markdown Preview" command for documentation files.

### Phase 4: Polish

1. Add icons/logos.
2. Implement CodeLens.
3. Add configuration settings (color customization, auto-sync on save).

## 5. Future: Multi-Language "Smart" Features

- **Python**: Detect `pip`/`poetry`.
- **Go**: Detect `go.mod`.
- **Java/Kotlin**: Detect `pom.xml`/`build.gradle`.

## 6. Prompt for Agent
>
> "You are an expert VS Code Extension developer. Your task is to implement the `DependencyTreeProvider` for `ai-fdocs`.
> The extension must spawn the `ai-fdocs` binary with the `status --json` argument.
> Parse the output JSON which looks like `{ "crates": { "serde": { "status": "synced", ... } } }`.
> Render a TreeView where each crate is an item with an icon based on its status.
> Handle errors gracefully if the binary is not found."
