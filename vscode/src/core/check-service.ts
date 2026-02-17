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
import { serializeReport } from './reporting';
import { toCliSyncMode } from './sync-mode';

interface LegacyCheckIssue {
    name: string;
    kind: 'missing' | 'config_changed' | 'not_in_lockfile';
}

interface LegacyCheckOutput {
    ok: boolean;
    issues: LegacyCheckIssue[];
}

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
    reason_code?: string;
}

interface CheckOutput {
    summary: CheckSummary;
    statuses: CheckStatusItem[];
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

function isObject(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null;
}

function normalizeCheckOutput(raw: unknown): CheckOutput {
    if (!isObject(raw)) {
        throw new Error('Unsupported check output shape: expected object.');
    }

    const hasSummary = 'summary' in raw && isObject(raw.summary);
    const hasStatuses = 'statuses' in raw && Array.isArray(raw.statuses);

    if (hasSummary && hasStatuses) {
        return raw as unknown as CheckOutput;
    }

    const hasOk = typeof raw.ok === 'boolean';
    const hasIssues = Array.isArray(raw.issues);

    if (!hasOk || !hasIssues) {
        throw new Error('Unsupported check output shape: expected {summary,statuses} or {ok,issues}.');
    }

    const issues = raw.issues as LegacyCheckIssue[];
    const statuses: CheckStatusItem[] = issues.map(issue => ({
        status: issue.kind === 'missing' || issue.kind === 'not_in_lockfile' ? 'Missing' : 'Outdated',
        reason_code: issue.kind,
    }));

    const summary: CheckSummary = {
        total: statuses.length,
        synced: 0,
        missing: statuses.filter(item => item.status === 'Missing').length,
        outdated: statuses.filter(item => item.status === 'Outdated').length,
        corrupted: statuses.filter(item => item.status === 'Corrupted').length,
    };

    return {
        summary,
        statuses,
    };
}

export async function runCheckCommand(context: CommandContext): Promise<CommandResult<CheckOutput>> {
    ensureNotCancelled(context);

    const args = ['check', '--format', 'json'];
    if (context.settings.syncMode) {
        args.push('--mode', toCliSyncMode(context.settings.syncMode));
    }
    if (context.settings.docsSource) {
        args.push('--docs-source', context.settings.docsSource);
    }

    const { stdout } = await context.executor.execute(args, context.workspaceRoot);
    ensureNotCancelled(context);

    const parsed = parseJsonOutput<unknown>(stdout);
    const output = normalizeCheckOutput(parsed);
    const metrics = createEmptyMetrics();

    metrics.synced = output.summary.synced;
    metrics.skipped = output.summary.missing;
    metrics.errors = output.summary.outdated + output.summary.corrupted;

    for (const item of output.statuses) {
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
        rawOutput: serializeReport(output),
    };
}
