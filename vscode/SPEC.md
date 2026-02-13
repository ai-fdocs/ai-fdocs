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
