import test from 'node:test';
import assert from 'node:assert/strict';

import * as net from '../sources/net';
import { resolveGitHubFallback } from '../sources/github-adapter';
import { resolveNpmSource } from '../sources/npm-adapter';
import { resolveRustSource } from '../sources/rust-adapter';

test('resolveGitHubFallback normalizes SSH and git+ URLs', () => {
    const ssh = resolveGitHubFallback({
        packageName: 'serde',
        version: '1.0.0',
        repositoryUrl: 'git@github.com:serde-rs/serde.git',
    });

    const gitPlus = resolveGitHubFallback({
        packageName: 'serde',
        version: '1.0.0',
        repositoryUrl: 'git+https://github.com/serde-rs/serde.git',
    });

    assert.equal(ssh.url, 'https://github.com/serde-rs/serde/tree/HEAD');
    assert.equal(gitPlus.url, 'https://github.com/serde-rs/serde/tree/HEAD');
});

test('resolveNpmSource falls back to GitHub when tarball is missing', async () => {
    const originalRequestJson = (net as any).requestJsonWithRetry;
    (net as any).requestJsonWithRetry = async () => ({
        'dist-tags': { latest: '2.0.0' },
        versions: {
            '2.0.0': {
                repository: { url: 'https://github.com/acme/pkg' },
            },
        },
    });

    try {
        const resolved = await resolveNpmSource('acme-pkg', '1.0.0', {
            docsSource: 'npm_tarball',
        });

        assert.equal(resolved.kind, 'mixed');
        assert.equal(resolved.version, '2.0.0');
        assert.equal(resolved.url, 'https://github.com/acme/pkg/tree/HEAD');
        assert.equal(resolved.attempts.some(a => a.kind === 'npm_tarball' && a.ok === false), true);
        assert.equal(resolved.attempts.some(a => a.kind === 'github_fallback' && a.ok === true), true);
    } finally {
        (net as any).requestJsonWithRetry = originalRequestJson;
    }
});

test('resolveRustSource uses docs.rs fallback and preserves repository from latest cache', async () => {
    const originalRequestJson = (net as any).requestJsonWithRetry;
    const originalRequestWithRetry = (net as any).requestWithRetry;
    let cratesIoCalls = 0;

    (net as any).requestJsonWithRetry = async () => {
        cratesIoCalls += 1;
        return {
            crate: {
                max_stable_version: '1.2.3',
                repository: 'https://github.com/serde-rs/serde',
            },
        };
    };

    (net as any).requestWithRetry = async (_url: string, method: 'GET' | 'HEAD') => {
        if (method === 'HEAD') {
            return { status: 405, headers: {}, body: '', url: 'mock' };
        }

        return { status: 404, headers: {}, body: '', url: 'mock' };
    };

    try {
        const first = await resolveRustSource('serde', '1.0.0', {
            syncMode: 'latest-docs',
            latestTtlHours: 24,
        });
        const second = await resolveRustSource('serde', '1.0.0', {
            syncMode: 'latest-docs',
            latestTtlHours: 24,
        });

        assert.equal(first.kind, 'mixed');
        assert.equal(first.version, '1.2.3');
        assert.equal(first.url, 'https://github.com/serde-rs/serde/tree/HEAD');
        assert.equal(second.url, 'https://github.com/serde-rs/serde/tree/HEAD');
        assert.equal(cratesIoCalls, 1);
    } finally {
        (net as any).requestJsonWithRetry = originalRequestJson;
        (net as any).requestWithRetry = originalRequestWithRetry;
    }
});
