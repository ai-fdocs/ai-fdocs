import { requestJsonWithRetry } from './net';
import { resolveGitHubFallback } from './github-adapter';
import { DocsSource, ResolvedSource, SourceAttempt } from './source-types';

interface NpmRegistryVersion {
    dist?: { tarball?: string };
    repository?: string | { url?: string };
}

interface NpmRegistryResponse {
    'dist-tags'?: { latest?: string };
    versions?: Record<string, NpmRegistryVersion>;
    repository?: string | { url?: string };
}

export interface NpmAdapterOptions {
    docsSource?: DocsSource;
}

function readRepositoryUrl(repo?: string | { url?: string }): string | undefined {
    if (!repo) return undefined;
    if (typeof repo === 'string') return repo;
    return repo.url;
}

export async function resolveNpmSource(
    packageName: string,
    lockVersion: string,
    options: NpmAdapterOptions = {}
): Promise<ResolvedSource> {
    const docsSource = options.docsSource ?? 'npm_tarball';
    const attempts: SourceAttempt[] = [];

    const registryUrl = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;
    const metadata = await requestJsonWithRetry<NpmRegistryResponse>(registryUrl);

    const selectedVersion = metadata.versions?.[lockVersion]
        ? lockVersion
        : metadata['dist-tags']?.latest || lockVersion;

    const versionEntry = metadata.versions?.[selectedVersion];
    const tarballUrl = versionEntry?.dist?.tarball;
    const repositoryUrl = readRepositoryUrl(versionEntry?.repository) || readRepositoryUrl(metadata.repository);

    attempts.push({ kind: 'mixed', url: registryUrl, ok: true });

    if (docsSource === 'npm_tarball' && tarballUrl) {
        attempts.push({ kind: 'npm_tarball', url: tarballUrl, ok: true });
        return {
            kind: 'npm_tarball',
            url: tarballUrl,
            version: selectedVersion,
            attempts,
        };
    }

    if (docsSource === 'npm_tarball' && !tarballUrl) {
        attempts.push({
            kind: 'npm_tarball',
            url: registryUrl,
            ok: false,
            reason: `Tarball URL is missing for ${packageName}@${selectedVersion}`,
        });
    }

    const fallback = resolveGitHubFallback({
        packageName,
        version: selectedVersion,
        repositoryUrl,
    });

    attempts.push(...fallback.attempts);

    return {
        kind: docsSource === 'github' ? 'github' : 'mixed',
        url: fallback.url,
        version: selectedVersion,
        attempts,
    };
}
