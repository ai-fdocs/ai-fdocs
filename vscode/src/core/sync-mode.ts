import { SyncMode } from '../sources/source-types';

const MODE_ALIASES: Record<string, SyncMode> = {
    lockfile: 'lockfile',
    'latest-docs': 'latest-docs',
    latest_docs: 'latest-docs',
    hybrid: 'hybrid',
};

export function normalizeSyncMode(value: string | undefined, fallback: SyncMode = 'lockfile'): SyncMode {
    if (!value) {
        return fallback;
    }

    return MODE_ALIASES[value] ?? fallback;
}

export function toCliSyncMode(mode: SyncMode): 'lockfile' | 'latest_docs' | 'hybrid' {
    if (mode === 'latest-docs') {
        return 'latest_docs';
    }

    return mode;
}

export function toUiSyncMode(mode: string | undefined, fallback: SyncMode = 'lockfile'): SyncMode {
    return normalizeSyncMode(mode, fallback);
}
