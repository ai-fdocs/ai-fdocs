import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const META_FILE_NAME = '.aifd-meta.toml';

export interface ArtifactMeta {
    schema_version: number;
    package_name: string;
    version: string;
    fetched_at: string;
    fingerprint: string;
    config_hash: string;
    source_ref?: string;
    is_fallback: boolean;
}

function escapeToml(value: string): string {
    return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function parseString(raw: string, key: string): string | undefined {
    return raw.match(new RegExp(`${key}\\s*=\\s*"([^"]*)"`))?.[1];
}

function parseBool(raw: string, key: string): boolean {
    return raw.match(new RegExp(`${key}\\s*=\\s*(true|false)`))?.[1] === 'true';
}

export function serializeMetaToml(meta: ArtifactMeta): string {
    const lines = [
        `schema_version = ${meta.schema_version}`,
        `package_name = "${escapeToml(meta.package_name)}"`,
        `version = "${escapeToml(meta.version)}"`,
        `fetched_at = "${escapeToml(meta.fetched_at)}"`,
        `fingerprint = "${escapeToml(meta.fingerprint)}"`,
        `config_hash = "${escapeToml(meta.config_hash)}"`,
        `is_fallback = ${meta.is_fallback}`,
    ];

    if (meta.source_ref) {
        lines.push(`source_ref = "${escapeToml(meta.source_ref)}"`);
    }

    return `${lines.join('\n')}\n`;
}

export function parseMetaToml(raw: string): ArtifactMeta {
    const schema = Number(raw.match(/schema_version\s*=\s*(\d+)/)?.[1] ?? 2);

    return {
        schema_version: Number.isFinite(schema) ? schema : 2,
        package_name: parseString(raw, 'package_name') ?? '',
        version: parseString(raw, 'version') ?? '',
        fetched_at: parseString(raw, 'fetched_at') ?? '',
        fingerprint: parseString(raw, 'fingerprint') ?? '',
        config_hash: parseString(raw, 'config_hash') ?? '',
        source_ref: parseString(raw, 'source_ref'),
        is_fallback: parseBool(raw, 'is_fallback'),
    };
}

export function readMeta(packageDir: string): ArtifactMeta | null {
    const metaPath = join(packageDir, META_FILE_NAME);
    if (!existsSync(metaPath)) {
        return null;
    }

    try {
        return parseMetaToml(readFileSync(metaPath, 'utf-8'));
    } catch {
        return null;
    }
}

export function writeMeta(packageDir: string, meta: ArtifactMeta): void {
    writeFileSync(join(packageDir, META_FILE_NAME), serializeMetaToml(meta), 'utf-8');
}
