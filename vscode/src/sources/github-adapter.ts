import { ResolvedSource, SourceAttempt } from './source-types';

export interface GitHubFallbackInput {
    packageName: string;
    version: string;
    repositoryUrl?: string;
}

function normalizeGithubUrl(input?: string): string | undefined {
    if (!input) return undefined;

    const trimmed = input.trim().replace(/^git\+/, '').replace(/\.git$/, '');

    if (trimmed.startsWith('github:')) {
        return `https://github.com/${trimmed.slice('github:'.length)}`;
    }

    if (trimmed.startsWith('git@github.com:')) {
        return `https://github.com/${trimmed.slice('git@github.com:'.length)}`;
    }

    if (trimmed.includes('github.com/')) {
        const start = trimmed.indexOf('github.com/');
        return `https://github.com/${trimmed.slice(start + 'github.com/'.length)}`;
    }

    return undefined;
}

export function resolveGitHubFallback(input: GitHubFallbackInput): ResolvedSource {
    const attempts: SourceAttempt[] = [];
    const normalized = normalizeGithubUrl(input.repositoryUrl);

    if (normalized) {
        const treeUrl = `${normalized}/tree/HEAD`;
        attempts.push({ kind: 'github_fallback', url: treeUrl, ok: true });
        return {
            kind: 'github_fallback',
            url: treeUrl,
            version: input.version,
            attempts,
        };
    }

    const searchUrl = `https://github.com/search?q=${encodeURIComponent(input.packageName)}&type=repositories`;
    attempts.push({
        kind: 'github_fallback',
        url: searchUrl,
        ok: false,
        reason: 'No repository URL available; using GitHub search fallback.',
    });

    return {
        kind: 'github_fallback',
        url: searchUrl,
        version: input.version,
        attempts,
    };
}
