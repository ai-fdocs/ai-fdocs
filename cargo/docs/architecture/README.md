# AI Fresh Docs — Rust/NPM Technical Architecture

> This section is **implementation-level technical documentation** for the
> Rust and NPM standalone libraries.
>
> It is **not** the global architecture map of the monorepository.
> For the repo-wide map and component boundaries, see root
> [`README.md`](../../../README.md).

This folder contains technical documentation for two implementation tracks:

- **Core module (Rust CLI `cargo-ai-fdocs`)**
- **NPM clone (Node.js/TypeScript CLI in `npm/`)**

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
