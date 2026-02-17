# Check report contract (`check --format json`)

This document defines the unified machine-readable JSON format for `check` reports across implementations.

## Canonical shape

```json
{
  "summary": {
    "total": 0,
    "synced": 0,
    "missing": 0,
    "outdated": 0,
    "corrupted": 0
  },
  "statuses": [
    {
      "package_name": "lodash",
      "lock_version": "4.17.21",
      "docs_version": "4.17.21",
      "status": "Synced",
      "reason": "ok",
      "reason_code": "ok"
    }
  ]
}
```

## Field requirements

- `summary` is required.
- `statuses` is required (can be empty).
- `summary` counters are authoritative and should match `statuses` aggregation.

### `summary`

- `total`: total dependencies evaluated.
- `synced`: dependencies that are up-to-date.
- `missing`: dependencies without synced docs.
- `outdated`: dependencies that require refresh.
- `corrupted`: dependencies with invalid/broken artifacts.

### `statuses[]`

- `status` enum: `Synced | SyncedFallback | Missing | Outdated | Corrupted`.
- Identifier fields can be ecosystem-specific (`package_name` or `crate_name`).
- `reason` and `reason_code` are optional but recommended for diagnostics.

## Compatibility note

VS Code currently accepts both:

1. canonical `{ summary, statuses }`, and
2. legacy npm `{ ok, issues }`.

Legacy shape is normalized in extension runtime to canonical data before UI/metrics processing.
