import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { buildCheckReport, renderJsonReport } from "../src/commands/check.js";

describe("check report", () => {
  it("returns machine-readable report with missing docs issue", async () => {
    const root = mkdtempSync(join(tmpdir(), "aifd-check-"));

    writeFileSync(
      join(root, "ai-fdocs.toml"),
      [
        "[settings]",
        'output_dir = "fdocs/node"',
        "",
        "[packages.lodash]",
        'repo = "lodash/lodash"',
      ].join("\n"),
      "utf-8"
    );

    writeFileSync(
      join(root, "package-lock.json"),
      JSON.stringify({
        name: "fixture",
        lockfileVersion: 3,
        packages: {
          "": { name: "fixture", version: "1.0.0" },
          "node_modules/lodash": { version: "4.17.21" },
        },
      }),
      "utf-8"
    );

    mkdirSync(join(root, "fdocs/node"), { recursive: true });

    const report = await buildCheckReport(root);

    expect(report.summary).toEqual({
      total: 1,
      synced: 0,
      missing: 1,
      outdated: 0,
      corrupted: 0,
    });
    expect(report.statuses).toEqual([
      {
        package_name: "lodash",
        lock_version: "4.17.21",
        status: "Missing",
        reason: "lodash: docs missing",
        reason_code: "missing",
      },
    ]);

    const parsed = JSON.parse(renderJsonReport(report));
    expect(parsed).toEqual(report);
  });
});
