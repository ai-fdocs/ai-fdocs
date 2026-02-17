import {
    existsSync,
    mkdirSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { readMeta, writeMeta } from './meta-store';
import { IndexEntry, writeIndex } from './index-builder';

export const SUMMARY_FILE_NAME = '_SUMMARY.md';

export interface DependencyArtifact {
    name: string;
    version: string;
    fingerprint: string;
    configHash: string;
    summary: string;
    files: Record<string, string>;
    sourceRef?: string;
    isFallback?: boolean;
}

export interface UpdateOptions {
    force?: boolean;
    ttlHours?: number;
}

export interface UpdateResult {
    refreshed: boolean;
    reason?: 'force' | 'missing' | 'ttl-expired' | 'version-drift' | 'fingerprint-drift' | 'config-drift';
}

export interface DeleteOptions {
    activeDependencies: Map<string, { version: string; fingerprint: string; configHash: string }>;
    forceClean?: boolean;
}

interface ParsedPackageDir {
    name: string;
    version: string;
    fullPath: string;
}

function nowIsoDate(): string {
    return new Date().toISOString();
}

function packageDirName(name: string, version: string): string {
    return `${name}@${version}`;
}

function parsePackageDir(rootDir: string, entry: string): ParsedPackageDir | null {
    const at = entry.lastIndexOf('@');
    if (at <= 0) {
        return null;
    }

    const fullPath = join(rootDir, entry);
    if (!statSync(fullPath).isDirectory()) {
        return null;
    }

    return {
        name: entry.slice(0, at),
        version: entry.slice(at + 1),
        fullPath,
    };
}

function shouldRefresh(
    rootDir: string,
    artifact: Pick<DependencyArtifact, 'name' | 'version' | 'fingerprint' | 'configHash'>,
    options: UpdateOptions = {}
): UpdateResult {
    if (options.force) {
        return { refreshed: true, reason: 'force' };
    }

    const pkgDir = join(rootDir, packageDirName(artifact.name, artifact.version));
    if (!existsSync(pkgDir)) {
        return { refreshed: true, reason: 'missing' };
    }

    const summaryPath = join(pkgDir, SUMMARY_FILE_NAME);
    if (!existsSync(summaryPath)) {
        return { refreshed: true, reason: 'missing' };
    }

    const meta = readMeta(pkgDir);
    if (!meta) {
        return { refreshed: true, reason: 'missing' };
    }

    if (meta.version !== artifact.version) {
        return { refreshed: true, reason: 'version-drift' };
    }
    if (meta.fingerprint !== artifact.fingerprint) {
        return { refreshed: true, reason: 'fingerprint-drift' };
    }
    if (meta.config_hash !== artifact.configHash) {
        return { refreshed: true, reason: 'config-drift' };
    }

    if (options.ttlHours && options.ttlHours > 0) {
        const fetchedAt = Date.parse(meta.fetched_at);
        const ttlMs = options.ttlHours * 60 * 60 * 1000;
        if (!Number.isNaN(fetchedAt) && Date.now() - fetchedAt >= ttlMs) {
            return { refreshed: true, reason: 'ttl-expired' };
        }
    }

    return { refreshed: false };
}

function writePackageArtifacts(rootDir: string, artifact: DependencyArtifact): void {
    const pkgDir = join(rootDir, packageDirName(artifact.name, artifact.version));
    rmSync(pkgDir, { recursive: true, force: true });
    mkdirSync(pkgDir, { recursive: true });

    for (const [relativePath, content] of Object.entries(artifact.files)) {
        const targetPath = join(pkgDir, relativePath);
        mkdirSync(dirname(targetPath), { recursive: true });
        writeFileSync(targetPath, content, 'utf-8');
    }

    writeFileSync(join(pkgDir, SUMMARY_FILE_NAME), artifact.summary, 'utf-8');
    writeMeta(pkgDir, {
        schema_version: 2,
        package_name: artifact.name,
        version: artifact.version,
        fetched_at: nowIsoDate(),
        fingerprint: artifact.fingerprint,
        config_hash: artifact.configHash,
        source_ref: artifact.sourceRef,
        is_fallback: artifact.isFallback ?? false,
    });
}

function collectIndexEntries(rootDir: string): IndexEntry[] {
    if (!existsSync(rootDir)) {
        return [];
    }

    const entries: IndexEntry[] = [];
    for (const dir of readdirSync(rootDir)) {
        const parsed = parsePackageDir(rootDir, dir);
        if (!parsed) {
            continue;
        }
        const meta = readMeta(parsed.fullPath);
        entries.push({
            name: parsed.name,
            version: parsed.version,
            isFallback: meta?.is_fallback,
        });
    }

    return entries;
}

export class ArtifactStore {
    constructor(private readonly rootDir: string) {}

    pull(artifact: DependencyArtifact): void {
        mkdirSync(this.rootDir, { recursive: true });
        writePackageArtifacts(this.rootDir, artifact);
        this.rebuildIndex();
    }

    update(artifact: DependencyArtifact, options: UpdateOptions = {}): UpdateResult {
        const decision = shouldRefresh(this.rootDir, artifact, options);
        if (decision.refreshed) {
            this.pull(artifact);
        }

        return decision;
    }

    delete(options: DeleteOptions): string[] {
        if (!existsSync(this.rootDir)) {
            return [];
        }

        const deleted: string[] = [];

        for (const dir of readdirSync(this.rootDir)) {
            const parsed = parsePackageDir(this.rootDir, dir);
            if (!parsed) {
                continue;
            }

            const active = options.activeDependencies.get(parsed.name);
            const meta = readMeta(parsed.fullPath);

            const remove = options.forceClean
                || !active
                || parsed.version !== active.version
                || !meta
                || meta.fingerprint !== active.fingerprint
                || meta.config_hash !== active.configHash;

            if (remove) {
                rmSync(parsed.fullPath, { recursive: true, force: true });
                deleted.push(dir);
            }
        }

        this.rebuildIndex();
        return deleted;
    }

    rebuildIndex(): void {
        writeIndex(this.rootDir, collectIndexEntries(this.rootDir));
    }

    readSummary(packageName: string, version: string): string | null {
        const summaryPath = join(this.rootDir, packageDirName(packageName, version), SUMMARY_FILE_NAME);
        if (!existsSync(summaryPath)) {
            return null;
        }

        return readFileSync(summaryPath, 'utf-8');
    }
}
