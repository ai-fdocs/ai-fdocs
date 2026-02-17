import { BinaryInfo } from '../binary-manager';
import { EngineName } from '../core/command-types';

const DOCS_SOURCE_COMMANDS = new Set(['sync', 'status', 'check']);

function normalizeSyncMode(args: string[]): string[] {
    const normalized = [...args];

    for (let i = 0; i < normalized.length - 1; i += 1) {
        if (normalized[i] === '--mode' && normalized[i + 1] === 'latest-docs') {
            normalized[i + 1] = 'latest_docs';
        }
    }

    return normalized;
}

export function normalizeCommandArgs(args: string[], engine: EngineName, binaryInfo: BinaryInfo | null): string[] {
    const normalized = normalizeSyncMode(args);

    if (!binaryInfo || binaryInfo.type !== 'npm') {
        return normalized;
    }

    const [command] = normalized;
    if (!command || !DOCS_SOURCE_COMMANDS.has(command)) {
        return normalized;
    }

    // NPM CLI gained --docs-source support later than Rust; keep normalization centralized per binary type.
    return normalized;
}
