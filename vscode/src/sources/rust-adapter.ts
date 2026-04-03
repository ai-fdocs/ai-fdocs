import { requestJsonWithRetry, requestWithRetry } from './net';
import { resolveGitHubFallback } from './github-adapter';
import { ResolvedSource, SourceAttempt, SyncMode } from './source-types';

interface CratesIoResponse {
    crate: {
        max_stable_version?: string;
        max_version?: string;
        repository?: string;
    };
}

interface LatestCacheEntry {
    version: string;
    repository?: string;
    expiresAt: number;
}

const latestCache = new Map<string, LatestCacheEntry>();

export interface RustAdapterOptions {
    syncMode: SyncMode;
    latestTtlHours?: number;
}

async function resolveCrateInfo(crateName: string): Promise<CratesIoResponse> {
    const url = `https://crates.io/api/v1/crates/${encodeURIComponent(crateName)}`;
    return requestJsonWithRetry<CratesIoResponse>(url);
}

async function docsrsAvailable(crateName: string, version: string): Promise<boolean> {
    const url = `https://docs.rs/crate/${encodeURIComponent(crateName)}/${encodeURIComponent(version)}`;
    const head = await requestWithRetry(url, 'HEAD');
    if (head.status >= 200 && head.status < 300) {
        return true;
    }

    if (head.status === 405 || head.status === 501) {
        const get = await requestWithRetry(url, 'GET');
        return get.status >= 200 && get.status < 300;
    }

    return false;
}

async function resolveLatestVersion(crateName: string, ttlHours: number): Promise<{ version: string; repository?: string }> {
    const now = Date.now();
    const cache = latestCache.get(crateName);

    if (cache && cache.expiresAt > now) {
        return { version: cache.version, repository: cache.repository };
    }

    const info = await resolveCrateInfo(crateName);
    const version = info.crate.max_stable_version || info.crate.max_version;
    if (!version) {
        throw new Error(`No latest version returned for crate ${crateName}`);
    }

    latestCache.set(crateName, {
        version,
        repository: info.crate.repository,
        expiresAt: now + ttlHours * 60 * 60 * 1000,
    });

    return { version, repository: info.crate.repository };
}

export async function resolveRustSource(
    crateName: string,
    lockVersion: string,
    options: RustAdapterOptions
): Promise<ResolvedSource> {
    const attempts: SourceAttempt[] = [];

    let targetVersion = lockVersion;
    let repositoryUrl: string | undefined;

    if (options.syncMode === 'latest-docs') {
        const latest = await resolveLatestVersion(crateName, options.latestTtlHours ?? 24);
        targetVersion = latest.version;
        repositoryUrl = latest.repository;
    }

    try {
        const docsrsOk = await docsrsAvailable(crateName, targetVersion);
        const docsrsUrl = `https://docs.rs/crate/${encodeURIComponent(crateName)}/${encodeURIComponent(targetVersion)}`;
        attempts.push({
            kind: 'docsrs',
            url: docsrsUrl,
            ok: docsrsOk,
            reason: docsrsOk ? undefined : 'docs.rs page is unavailable',
        });

        if (docsrsOk) {
            return {
                kind: 'docsrs',
                url: docsrsUrl,
                version: targetVersion,
                attempts,
            };
        }
    } catch (error: any) {
        attempts.push({
            kind: 'docsrs',
            url: `https://docs.rs/crate/${encodeURIComponent(crateName)}/${encodeURIComponent(targetVersion)}`,
            ok: false,
            reason: error.message,
        });
    }

    if (!repositoryUrl) {
        const info = await resolveCrateInfo(crateName);
        repositoryUrl = info.crate.repository;
    }

    const fallback = resolveGitHubFallback({
        packageName: crateName,
        version: targetVersion,
        repositoryUrl,
    });

    return {
        kind: attempts.length > 0 ? 'mixed' : fallback.kind,
        url: fallback.url,
        version: targetVersion,
        attempts: [...attempts, ...fallback.attempts],
    };
}
