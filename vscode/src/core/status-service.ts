import {
    CommandContext,
    CommandResult,
    SourceMetrics,
    createEmptyMetrics,
    ensureNotCancelled,
    normalizeSourceMetrics,
    parseJsonOutput,
} from './command-types';
import { DependencyStatus, StatusOutput } from '../types';
import { serializeReport } from './reporting';

function accumulateByStatus(dependencyStatus: DependencyStatus): SourceMetrics {
    if (dependencyStatus.status === 'Synced' || dependencyStatus.status === 'SyncedFallback') {
        return { synced: 1, cached: 0, skipped: 0, errors: 0 };
    }
    if (dependencyStatus.status === 'Missing') {
        return { synced: 0, cached: 0, skipped: 1, errors: 0 };
    }
    return { synced: 0, cached: 0, skipped: 0, errors: 1 };
}

export async function runStatusCommand(context: CommandContext): Promise<CommandResult<StatusOutput>> {
    ensureNotCancelled(context);

    const args = ['status', '--format', 'json'];
    if (context.settings.syncMode) {
        args.push('--mode', context.settings.syncMode);
    }
    if (context.settings.docsSource) {
        args.push('--docs-source', context.settings.docsSource);
    }

    const { stdout } = await context.binaryManager.execute(args, context.workspaceRoot);
    ensureNotCancelled(context);

    const output = parseJsonOutput<StatusOutput>(stdout);

    const metrics = createEmptyMetrics();

    for (const item of output.statuses) {
        const source = (item.source_kind ?? 'mixed') as string;
        const state = accumulateByStatus(item);

        metrics.synced += state.synced;
        metrics.cached += state.cached;
        metrics.skipped += state.skipped;
        metrics.errors += state.errors;

        const existing = metrics.sourceBreakdown[source] ?? normalizeSourceMetrics();
        metrics.sourceBreakdown[source] = {
            synced: existing.synced + state.synced,
            cached: existing.cached + state.cached,
            skipped: existing.skipped + state.skipped,
            errors: existing.errors + state.errors,
        };
    }

    return {
        command: 'status',
        ok: metrics.errors === 0,
        message: 'Status diagnostics completed.',
        metrics,
        data: output,
        rawOutput: serializeReport(output),
    };
}
