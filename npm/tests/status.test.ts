import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it, vi } from "vitest";
import { cmdStatus } from "../src/commands/status.js";

describe("status --verbose", () => {
  it("includes source and missing files diagnostics in json output", async () => {
    const root = mkdtempSync(join(tmpdir(), "aifd-status-"));

    writeFileSync(
      join(root, "ai-fdocs.toml"),
      [
        "[settings]",
        'output_dir = "fdocs/node"',
        'docs_source = "npm_tarball"',
        "",
        "[packages.lodash]",
        'files = ["README.md", "docs/guide.md"]',
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

    const pkgDir = join(root, "fdocs/node/lodash@4.17.21");
    mkdirSync(pkgDir, { recursive: true });
    writeFileSync(
      join(pkgDir, ".aifd-meta.toml"),
      ['schema_version = 2', 'version = "4.17.21"', 'git_ref = "npm-tarball"', 'fetched_at = "2026-04-01"', "is_fallback = false"].join("\n"),
      "utf-8"
    );
    writeFileSync(join(pkgDir, "README.md"), "# lodash", "utf-8");

    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);
    await cmdStatus(root, "json", undefined, undefined, true);

    expect(logSpy).toHaveBeenCalledTimes(1);
    const report = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(report.summary).toEqual({
      total: 1,
      synced: 0,
      problems: 1,
    });
    expect(report.packages[0]).toMatchObject({
      name: "lodash",
      lockVersion: "4.17.21",
      status: "Incomplete",
      source: "npm_tarball",
      missingFiles: ["docs__guide.md"],
    });
    expect(report.packages[0].expectedFiles).toEqual(["README.md", "docs__guide.md"]);
    expect(report.packages[0].presentFiles).toContain("README.md");
    expect(report.format_version).toBe(1);
    expect(typeof report.generated_at).toBe("string");
    expect(report.diagnostics).toBeDefined();
    expect(report.diagnostics.schema_version).toBe(1);
    expect(report.diagnostics.packages[0]).toEqual({
      name: "lodash",
      source: "npm_tarball",
      expected_files: ["README.md", "docs__guide.md"],
      present_files: ["README.md"],
      missing_files: ["docs__guide.md"],
    });
    logSpy.mockRestore();
  });
});
