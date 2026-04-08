import { mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { describe, expect, it } from "vitest";
import { resolveVersions } from "../src/resolver.js";

describe("resolveVersions lockfile selection", () => {
  it("uses explicitly selected pnpm lockfile", () => {
    const root = mkdtempSync(join(tmpdir(), "aifd-resolver-"));

    writeFileSync(
      join(root, "pnpm-lock.yaml"),
      ["lockfileVersion: 9.0", "packages:", "  /lodash@4.17.21:", "    resolution: {integrity: sha512-abc}"].join("\n"),
      "utf-8"
    );

    const versions = resolveVersions(root, "pnpm");
    expect(versions.get("lodash")).toBe("4.17.21");
  });

  it("fails when explicit lockfile is requested but file is absent", () => {
    const root = mkdtempSync(join(tmpdir(), "aifd-resolver-missing-"));

    expect(() => resolveVersions(root, "yarn")).toThrow(/Requested --lockfile yarn/);
  });

  it("rejects unsupported lockfile value", () => {
    const root = mkdtempSync(join(tmpdir(), "aifd-resolver-invalid-"));

    expect(() => resolveVersions(root, "bun" as any)).toThrow(/Unsupported --lockfile value/);
  });
});
