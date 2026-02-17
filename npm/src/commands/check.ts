import { join } from "node:path";
import { existsSync, readFileSync } from "node:fs";
import chalk from "chalk";
import { loadConfig, type DocsSource } from "../config.js";
import { resolveVersions } from "../resolver.js";
import { computeConfigHash } from "../config-hash.js";
import { isCachedV2 } from "../storage.js";
import { AiDocsError } from "../error.js";
import { NpmRegistryClient } from "../registry.js";

function resolveDocsSource(docsSourceOverride: string | undefined, defaultDocsSource: DocsSource): DocsSource {
  if (!docsSourceOverride) {
    return defaultDocsSource;
  }

  if (docsSourceOverride === "github" || docsSourceOverride === "npm_tarball") {
    return docsSourceOverride;
  }

  throw new AiDocsError("Unsupported --docs-source value. Use github or npm_tarball.", "INVALID_CONFIG");
}

interface CheckIssue {
  name: string;
  kind: "missing" | "config_changed" | "not_in_lockfile";
}

export interface CheckStatus {
  package_name: string;
  lock_version: string;
  docs_version?: string;
  status: "Synced" | "Outdated" | "Missing" | "Corrupted";
  reason?: string;
  reason_code?: CheckIssue["kind"] | "ok";
}

export interface CheckSummary {
  total: number;
  synced: number;
  missing: number;
  outdated: number;
  corrupted: number;
}

export interface CheckReport {
  summary: CheckSummary;
  statuses: CheckStatus[];
}

export type CheckFormat = "text" | "json";

export async function buildCheckReport(
  projectRoot: string,
  modeOverride?: string,
  docsSourceOverride?: string
): Promise<CheckReport> {
  const config = loadConfig(projectRoot);
  const syncMode = modeOverride || config.settings.sync_mode;
  resolveDocsSource(docsSourceOverride, config.settings.docs_source);
  const outputDir = join(projectRoot, config.settings.output_dir);

  const registry = new NpmRegistryClient();
  let targetVersions: Map<string, string>;

  if (syncMode === "latest_docs") {
    targetVersions = new Map();
    for (const name of Object.keys(config.packages)) {
      try {
        const ver = await registry.getLatestVersion(name);
        targetVersions.set(name, ver);
      } catch {
        // failed to resolve
      }
    }
  } else {
    targetVersions = resolveVersions(projectRoot);
  }

  const issues: CheckIssue[] = [];
  const statuses: CheckStatus[] = [];

  for (const [name, pkgConfig] of Object.entries(config.packages)) {
    const version = targetVersions.get(name);
    if (!version) {
      const issue: CheckIssue = { name, kind: syncMode === "latest_docs" ? "missing" : "not_in_lockfile" };
      issues.push(issue);
      statuses.push({
        package_name: name,
        lock_version: "unknown",
        status: "Missing",
        reason: formatIssue(issue),
        reason_code: issue.kind,
      });
      continue;
    }

    const pkgDir = join(outputDir, `${name}@${version}`);
    const metaPath = join(pkgDir, ".aifd-meta.toml");

    if (!existsSync(pkgDir) || !existsSync(metaPath)) {
      const issue: CheckIssue = { name, kind: "missing" };
      issues.push(issue);
      statuses.push({
        package_name: name,
        lock_version: version,
        status: "Missing",
        reason: formatIssue(issue),
        reason_code: issue.kind,
      });
      continue;
    }

    if (!isCachedV2(outputDir, name, version, computeConfigHash(pkgConfig))) {
      const issue: CheckIssue = { name, kind: "config_changed" };
      issues.push(issue);
      statuses.push({
        package_name: name,
        lock_version: version,
        docs_version: version,
        status: "Outdated",
        reason: formatIssue(issue),
        reason_code: issue.kind,
      });
      continue;
    }

    if (syncMode === "latest_docs") {
      try {
        const raw = readFileSync(metaPath, "utf-8");
        const fetchedAtMatch = raw.match(/fetched_at\s*=\s*"([^"]+)"/)?.[1];
        if (fetchedAtMatch) {
          const date = new Date(fetchedAtMatch);
          const now = new Date();
          const diffMs = now.getTime() - date.getTime();
          if (diffMs > config.settings.latest_ttl_hours * 60 * 60 * 1000) {
            const issue: CheckIssue = { name, kind: "config_changed" };
            issues.push(issue); // Treat expired TTL as needing update
            statuses.push({
              package_name: name,
              lock_version: version,
              docs_version: version,
              status: "Outdated",
              reason: formatIssue(issue),
              reason_code: issue.kind,
            });
            continue;
          }
        }
      } catch {
        const issue: CheckIssue = { name, kind: "missing" };
        issues.push(issue);
        statuses.push({
          package_name: name,
          lock_version: version,
          status: "Missing",
          reason: formatIssue(issue),
          reason_code: issue.kind,
        });
        continue;
      }
    }

    statuses.push({
      package_name: name,
      lock_version: version,
      docs_version: version,
      status: "Synced",
      reason: "ok",
      reason_code: "ok",
    });
  }

  const summary: CheckSummary = {
    total: statuses.length,
    synced: statuses.filter((status) => status.status === "Synced").length,
    missing: statuses.filter((status) => status.status === "Missing").length,
    outdated: statuses.filter((status) => status.status === "Outdated").length,
    corrupted: statuses.filter((status) => status.status === "Corrupted").length,
  };

  return {
    summary,
    statuses,
  };
}

function formatIssue(issue: CheckIssue): string {
  if (issue.kind === "missing") return `${issue.name}: docs missing`;
  if (issue.kind === "not_in_lockfile") return `${issue.name}: not in lockfile`;
  return `${issue.name}: outdated (config changed or TTL expired)`;
}

function renderTextReport(report: CheckReport): void {
  const hasIssues = report.summary.missing + report.summary.outdated + report.summary.corrupted > 0;

  if (!hasIssues) {
    console.log(chalk.green("✅ All documentation is up-to-date."));
    return;
  }

  console.error(chalk.red("❌ Documentation is outdated:"));
  for (const status of report.statuses.filter((item) => item.status !== "Synced")) {
    console.error(chalk.red(`  - ${status.reason ?? `${status.package_name}: ${status.status}`}`));
  }
  console.error(chalk.yellow("Run `ai-fdocs sync` to fix."));
}

export function renderJsonReport(report: CheckReport): string {
  return JSON.stringify(report, null, 2);
}

export async function cmdCheck(
  projectRoot: string,
  format: string = "text",
  modeOverride?: string,
  docsSourceOverride?: string
): Promise<void> {
  if (format !== "text" && format !== "json") {
    throw new AiDocsError(`Unsupported --format value: ${format}`, "INVALID_FORMAT");
  }

  const report = await buildCheckReport(projectRoot, modeOverride, docsSourceOverride);

  if (format === "json") {
    console.log(renderJsonReport(report));
  } else {
    renderTextReport(report);
  }

  const hasIssues = report.summary.missing + report.summary.outdated + report.summary.corrupted > 0;
  process.exit(hasIssues ? 1 : 0);
}
