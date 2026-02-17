# VS Code Extension Specification for `AI Fresh Docs`

## 1. Overview

The **VS Code Extension** is a standalone `AI Fresh Docs` module with its own source adapters for Rust and NPM documentation. It provides visibility into project dependencies and one-click administration of documentation syncing.

**Key Constraint**: The extension MUST own its source-resolution and fetching pipeline as an internal module, and provide unified behavior for Rust and NPM docs flows. External CLI execution can remain as a temporary compatibility fallback, but not as the primary architecture.

## 2. Technical Architecture

### 2.1 Source Module Management

- **Core requirement**: build internal adapters for both ecosystems:
  - `rust_latest_docs`: crates.io -> docs.rs -> GitHub fallback
  - `npm_release_docs`: npm registry -> npm tarball -> GitHub fallback
- **Optional fallback**: allow CLI bridge (`ai-fdocs.binaryPath`) for migration period only.
- **Observability**: keep per-dependency source kind and fallback reason in status model.

### 2.2 Project Detection

- Scan workspace folders for:
  - `Cargo.toml` -> Rust Project
  - `package.json` -> Node.js Project (if `dependencies` present)
  - `pyproject.toml` / `requirements.txt` -> Python Project (Future)
- Activate extension only when relevant files are found (`activationEvents`).

### 2.3 Data Flow

1. **Read Config**: Parse `ai-fdocs.toml` and extension settings.
2. **Resolve Source Strategy**: choose Rust/NPM adapter per workspace package.
3. **Fetch/Sync via internal module**: run internal `sync/status/check` pipeline.
4. **Update UI**:
    - Map unified status model to `TreeDataProvider`.
    - Items: `Package` -> `Version` -> `Status Icon` + `source_kind`.

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
  - Runs extension internal sync module for all detected dependencies. Shows progress notification.
- `AI-Docs: Force Sync` (ContextMenu on package)
  - Runs internal force refresh for selected dependency (with source adapter override if needed).
- `AI-Docs: Prune` (Button on view title)
  - Runs internal prune for stale artifacts.
- `AI-Docs: Initialize` (If config missing)
  - Creates baseline config and source settings for internal module.

### 3.3 Editor Integration

- **CodeLens**: In `Cargo.toml` / `package.json`.
  - Above dependency line: `$(book) Open Docs` -> Opens local `_SUMMARY.md`.
- **Hover Provider**:
  - Hovering over a dependency name shows a summary from `ai_notes` in `ai-fdocs.toml` if available.

## 4. Implementation Plan (Agent Instructions)

### Phase 1: Skeleton & Internal Source Module

1. Initialize extension with `yo code`.
2. Define unified source interfaces (`SourceResolver`, `SourceFetcher`, `ArtifactStore`).
3. Implement Rust/NPM adapter scaffolding and status model.

### Phase 2: Tree View & Status

1. Create `DependencyTreeProvider` implementing `vscode.TreeDataProvider`.
2. Implement `refresh()` method that calls internal status service (not external CLI by default).
3. Define `DependencyItem` class with source metadata.

### Phase 3: Commands & Interaction

1. Bind UI buttons to internal sync/status/check commands.
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
> "You are an expert VS Code Extension developer. Implement `DependencyTreeProvider` and an internal status service for ai-fdocs.
> The extension must use its internal Rust/NPM source adapters by default and expose source kind in UI.
> CLI spawning is allowed only as fallback compatibility mode.
> Render a TreeView where each package has status + source icon/label.
> Handle degraded upstream states gracefully (rate limit, fallback used, partial sync)."
