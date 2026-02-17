import {
    CommandContext,
    CommandResult,
    SourceMetrics,
    createEmptyMetrics,
    ensureNotCancelled,
    normalizeSourceMetrics,
    parseJsonOutput,
} from './command-types';
import { SourceKind } from '../sources/source-types';

interface CheckSummary {
    total: number;
    synced: number;
    missing: number;
    outdated: number;
    corrupted: number;
}

interface CheckStatusItem {
    status: 'Synced' | 'SyncedFallback' | 'Outdated' | 'Missing' | 'Corrupted';
    source_kind?: SourceKind;
}

interface CheckOutput {
    summary: CheckSummary;
    statuses?: CheckStatusItem[];
}

function statusToMetrics(status: CheckStatusItem['status']): SourceMetrics {
    if (status === 'Synced' || status === 'SyncedFallback') {
        return { synced: 1, cached: 0, skipped: 0, errors: 0 };
    }
    if (status === 'Missing') {
        return { synced: 0, cached: 0, skipped: 1, errors: 0 };
    }
    return { synced: 0, cached: 0, skipped: 0, errors: 1 };
}

export async function runCheckCommand(context: CommandContext): Promise<CommandResult<CheckOutput>> {
    ensureNotCancelled(context);

    const args = ['check', '--format', 'json'];
    if (context.settings.syncMode) {
        args.push('--mode', context.settings.syncMode);
    }
    if (context.settings.docsSource) {
        args.push('--docs-source', context.settings.docsSource);
    }

    const { stdout } = await context.binaryManager.execute(args, context.workspaceRoot);
    ensureNotCancelled(context);

    const output = parseJsonOutput<CheckOutput>(stdout);
    const metrics = createEmptyMetrics();

    metrics.synced = output.summary.synced;
    metrics.skipped = output.summary.missing;
    metrics.errors = output.summary.outdated + output.summary.corrupted;

    for (const item of output.statuses ?? []) {
        const source = (item.source_kind ?? 'mixed') as string;
        const state = statusToMetrics(item.status);
        const existing = metrics.sourceBreakdown[source] ?? normalizeSourceMetrics();

        metrics.sourceBreakdown[source] = {
            synced: existing.synced + state.synced,
            cached: existing.cached + state.cached,
            skipped: existing.skipped + state.skipped,
            errors: existing.errors + state.errors,
        };
    }

    const hasFailures = output.summary.missing > 0 || output.summary.outdated > 0 || output.summary.corrupted > 0;

    return {
        command: 'check',
        ok: !hasFailures,
        message: hasFailures ? 'Documentation check failed.' : 'Documentation check passed.',
        metrics,
        data: output,
        rawOutput: stdout,
    };
}
