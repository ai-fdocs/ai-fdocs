import {
    CommandContext,
    CommandResult,
    SourceMetrics,
    createEmptyMetrics,
    ensureNotCancelled,
    normalizeSourceMetrics,
    parseJsonOutput,
} from './command-types';

interface SyncJsonReport {
    totals?: Partial<SourceMetrics>;
    sourceStats?: Record<string, Partial<SourceMetrics>>;
}

export interface SyncOptions {
    force?: boolean;
}

export async function runSyncCommand(
    context: CommandContext,
    options: SyncOptions = {}
): Promise<CommandResult<SyncJsonReport>> {
    ensureNotCancelled(context);

    const args = ['sync', '--report-format', 'json'];
    if (options.force) {
        args.push('--force');
    }
    if (context.settings.syncMode) {
        args.push('--mode', context.settings.syncMode);
    }

    const { stdout } = await context.binaryManager.execute(args, context.workspaceRoot);
    ensureNotCancelled(context);

    const report = parseJsonOutput<SyncJsonReport>(stdout);
    const totals = normalizeSourceMetrics(report.totals);
    const sourceBreakdown: Record<string, SourceMetrics> = {};

    for (const [source, stats] of Object.entries(report.sourceStats ?? {})) {
        sourceBreakdown[source] = normalizeSourceMetrics(stats);
    }

    return {
        command: 'sync',
        ok: totals.errors === 0,
        message: 'Documentation sync completed.',
        metrics: {
            ...totals,
            sourceBreakdown,
        },
        data: report,
        rawOutput: stdout,
    };
}
