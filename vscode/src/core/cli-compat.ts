import { CommandContext } from './command-types';
import { SyncMode } from '../sources/source-types';

function getBinaryType(context: CommandContext): 'npm' | 'rust' | 'unknown' {
    return context.binaryManager.getBinaryInfo()?.type ?? 'unknown';
}

export function supportsDocsSourceFlag(context: CommandContext): boolean {
    return getBinaryType(context) === 'rust';
}

export function toCompatibleCliSyncMode(context: CommandContext, mode: SyncMode): 'lockfile' | 'latest_docs' | 'hybrid' {
    const binaryType = getBinaryType(context);

    if (binaryType === 'rust' && mode === 'hybrid') {
        return 'lockfile';
    }

    if (mode === 'latest-docs') {
        return 'latest_docs';
    }

    return mode;
}

