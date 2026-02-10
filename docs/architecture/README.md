# AI Fresh Docs — Architecture and Operations

This folder contains technical documentation for both project implementations:

- **Core module (Rust CLI `cargo-ai-fdocs`)**
- **NPM clone (Node.js/TypeScript CLI in `npn/`)**

## Navigation

1. [Core Rust module documentation](./rust-module.md)
2. [NPM clone documentation](./npm-clone.md)

## Coverage

The docs cover in detail:

- purpose and responsibility of each service/module;
- external integrations (where and how requests are made);
- intervals, timeouts, retries, and limits;
- exact behavior of all commands (`init`, `sync`, `status`, `check`);
- data formats and saved artifact structure;
- usage patterns (local, CI, degraded mode);
- hidden and non-obvious settings (`env`, fallback, cache invalidation, prune behavior).
