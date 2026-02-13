# AI Fresh Docs: The Grand Strategy & Roadmap

This document outlines the long-term vision for `AI Fresh Docs` as the "Swiss Army Knife" of documentation management for AI coding assistants.

## Core Philosophy: The "Source of Truth" Engine

We bridge the gap between AI training data and the actual code you are writing.
**Lockfile -> Repository -> Processed Documentation -> RAG Context**

---

## 🏗️ Architecture: The Hub & Spoke Model

### 1. The Core (Hub) - Rust 🦀

- **Name**: AI Fresh Docs Core
- **Responsibility**: Heavy lifting. Fetching, parsing, caching, semantic search indexing.
- **Interface**: CLI commands (`sync`, `gen-index`) + JSON Output.
- **Status**: Stable. Needs pagination strategy (see below).

### 2. The Spokes (Adapters) - Language Specific 🔌

| Language | Adapter Name | Status | Manifest Source |
| :--- | :--- | :--- | :--- |
| **Rust** | `cargo-ai-fdocs` | ✅ Beta | `Cargo.lock` |
| **Node.js** | `npm-ai-fdocs` | ✅ Beta | `package-lock.json` |
| **Python** | `py-ai-fdocs` | 🗓️ Planned | `poetry.lock` / `requirements.txt` |
| **Go** | `go-ai-fdocs` | 🗓️ Planned | `go.mod` / `go.sum` |
| **General** | `vscode-ai-fdocs` | 🚧 In Progress | Auto-detects project type |

---

## 🗡️ VS Code Extension: The "Control Center"

**Strategy**: "Path 1" - The extension is a GUI wrapper around the Rust Core binary.

### User Interface & Experience

1. **Auto-Detection 🕵️**:
    - On launch, scans for `Cargo.toml`, `package.json`, `pyproject.toml`.
    - **Status Bar**: Shows "🦀 Rust Detected" or "📦 NPM Detected".
    - **Activity Bar Icon**: "📚 AI-Docs".

2. **Dashboard Panel (TreeView)**:
    - **Section**: "Dependencies"
        - 🟢 `serde` (Synced)
        - 🟡 `tokio` (Update Available / Cache Stale)
        - 🔴 `express` (Error / Not Found)
    - **Action Buttons (Toolbar)**:
        - ⬇️ **Load/Sync**: Run `ai-fdocs sync` for the active project.
        - 🔄 **Update**: Force refresh (`--force`).
        - 🧹 **Clean**: Prune unused docs (`prune`).
    - **Context Menu**:
        - "Open Docs": Opens `_SUMMARY.md` in preview.
        - "Re-index": For RAG.

3. **Smart Assistant (Hover/CodeLens)**:
    - **CodeLens** in `Cargo.toml`: "📑 View AI Docs" above dependencies.
    - **Hover** in code: "Show documentation for `json!` macro" (pulls from local `API.md`).

### "Agentic" Prompt for Implementation

*(To be used by future AI agents implementing the extension)*

> **Context**: You are building a VS Code extension for `ai-fdocs`.
> **Goal**: Create a GUI that wraps the `ai-fdocs` binary.
> **Requirements**:
>
> 1. **Binary Management**: Check if `ai-fdocs` is in PATH. If not, prompt to install/download.
> 2. **Project Detection**: Use `vscode.workspace.findFiles` to detect `Cargo.lock` or `package-lock.json`.
> 3. **Command Wrapper**: Spawn the binary with `child_process`. Parse JSON output (`--format json`) to update the UI tree.
> 4. **UI**: Use `vscode.window.createTreeView`. Implement "Load", "Update", "Prune" commands bound to buttons.
> 5. **Multi-Root Support**: Handle workspaces with mixed languages (e.g., Rust backend + React frontend).

---

## 📜 Documentation Parsing Strategy (The "Pagination" Problem)

**Challenge**: API docs often span hundreds of pages (e.g., `tokio` docs). Fetching 1000 HTML pages is slow and abusive to hosters.

### Solution: "The Semantic Harvester" 🚜

1. **Level 1: The "Lite" Sync (Default)**
    - Fetches **only** `README.md`, `CHANGELOG.md`, and (for Rust) the *main* library page `lib.rs` / `index.html`.
    - **Cost**: Cheap, fast. Covers 80% of "What is this?" questions.

2. **Level 2: The "Smart" Crawl (On Demand)**
    - When user asks a specific question about a module (e.g., "tokio net"), we:
        - Check `ai-fdocs.toml` for `[crawl_depth = 1]`.
        - Fetch the top-level module page.
        - Parse the HTML to extract *signatures* and *doc comments* only (strip navigation/boilerplates).
        - Save as `modules/net.md`.

3. **Level 3: "The Firehose" (Enterprise/Local LLM)**
    - Uses `rustdoc-json` output (requires nightly) or similar structured dumps.
    - Converts the entire JSON graph into a vector database (LanceDB/Chroma) locally.
    - **Usage**: "How do I use X with Y?" -> RAG retrieves exact definitions.

**Action Item**: Start with **Level 1** polish, implement **Level 2** for `docs.rs` via their raw source download if possible, or targeted scraping.

---

## 🚀 Parity & Feature Matrix

| Feature | Rust Core | NPM Wrapper | VS Code Ext |
| :--- | :---: | :---: | :---: |
| **Parsing `lock` files** | ✅ | ✅ | (Calls Core) |
| **Fetching GitHub** | ✅ | ✅ | (Calls Core) |
| **Config Hash / Cache** | ✅ | ✅ | (Calls Core) |
| **Hybrid Mode (Docs.rs)** | ✅ | ✅ | (Calls Core) |
| **"Smart" Pruning** | ✅ | ✅ | (Calls Core) |
| **JSON Output** | ✅ | ✅ | (Parses Core) |
| **Interactive UI** | ❌ | ❌ | 🗓️ Planned |
| **Multi-Language View**| ❌ | ❌ | 🗓️ Planned |

---

## Next Steps

1. **Refactor Node.js wrapper** to fully delegate to Rust binary (instead of duplicating logic) OR finalize pure-JS implementation if Rust binary distribution is too hard (Decision: Rust Core is preferred).
2. **Initialize VS Code Extension**: `yo code`.
3. **Implement Python Adapter**: A simple Python script that converts `poetry.lock` -> `ai-fdocs.toml` format for the Core to digest.
