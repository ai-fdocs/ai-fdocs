# npm-ai-fdocs migration notes (ADR-0001)

Migration guidance after adopting **`npm_tarball` as default docs source**.

## What changed

- Default docs source is now `docs_source = "npm_tarball"`.
- `github` mode remains supported as an explicit configuration.
- Legacy `experimental_npm_tarball` remains accepted for backward compatibility.

## Existing configs: what to do

### 1) Config already has `docs_source = "github"`

No migration is required.

Your behavior stays unchanged because source selection is explicit.

```toml
[settings]
docs_source = "github"
```

### 2) Config already has `docs_source = "npm_tarball"`

No migration is required.

```toml
[settings]
docs_source = "npm_tarball"
```

### 3) Config omits `docs_source`

Behavior now defaults to `npm_tarball`.

If this is desired, no change is needed. If you need GitHub semantics, pin it explicitly:

```toml
[settings]
docs_source = "github"
```

### 4) Config uses legacy `experimental_npm_tarball`

Legacy key is still accepted, but you should migrate to canonical `docs_source`.

Recommended migration:

```toml
[settings]
# before (legacy)
experimental_npm_tarball = true

# after (canonical)
docs_source = "npm_tarball"
```

If both keys are present, prefer keeping only `docs_source` to avoid ambiguity.

## CI implications

- For default tarball mode, GitHub token setup is optional.
- If any environment uses `docs_source = "github"`, keep `GITHUB_TOKEN` / `GH_TOKEN` configured.

## Validation checklist after migration

1. Run `ai-fdocs sync`.
2. Run `ai-fdocs status`.
3. Run `ai-fdocs check --format json` in CI.
4. Confirm expected source behavior:
   - no `docs_source` => tarball default;
   - explicit `github` => GitHub flow (including branch fallback where applicable).
