# AI Fresh Docs for VS Code

This directory contains the source code for the VS Code extension of `ai-fdocs`.

## Vision

The VS Code extension aims to be the "Swiss Army Knife" for documentation management directly within your editor.

### Features (Planned)

- **Dependency Dashboard**: View status of documentation for all project dependencies.
- **One-Click Sync**: Fetch documentation without leaving the editor.
- **Integrated Viewer**: Read `_SUMMARY.md` and API docs in a dedicated panel.
- **AI RAG Support**: Chat with your documentation using local LLMs or API providers.

## Architecture

This extension acts as a frontend for the `cargo-ai-fdocs` core (Rust). It delegates heavy lifting (fetching, parsing, caching) to the Rust binary, ensuring high performance and consistent behavior across CLI and GUI.
