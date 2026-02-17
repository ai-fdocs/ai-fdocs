export type SourceKind = 'docsrs' | 'npm_tarball' | 'github' | 'github_fallback' | 'mixed';

export type SyncMode = 'lockfile' | 'latest-docs' | 'hybrid';
export type DocsSource = 'github' | 'npm_tarball';

export type RequestErrorKind =
    | 'auth'
    | 'rate_limit'
    | 'not_found'
    | 'network'
    | 'parse'
    | 'server'
    | 'unknown';

export interface SourceAttempt {
    kind: SourceKind;
    url: string;
    ok: boolean;
    reason?: string;
}

export interface ResolvedSource {
    kind: SourceKind;
    url: string;
    version?: string;
    attempts: SourceAttempt[];
}

export interface AdapterResolutionInput {
    name: string;
    lockVersion: string;
}
