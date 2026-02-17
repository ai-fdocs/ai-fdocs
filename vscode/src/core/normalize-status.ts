import { SourceKind } from '../sources/source-types';
import { DependencyStatus, StatusOutput, StatusSummary } from '../types';

type RawObject = Record<string, unknown>;

interface NpmPackageStatus {
    name?: unknown;
    lockVersion?: unknown;
    docsVersion?: unknown;
    status?: unknown;
    reason?: unknown;
    sourceKind?: unknown;
    sourceUrl?: unknown;
    provenanceUrl?: unknown;
    isFallback?: unknown;
    lastSyncAt?: unknown;
}

interface NpmSummaryProblems {
    missing?: unknown;
    outdated?: unknown;
    corrupted?: unknown;
    incomplete?: unknown;
    readError?: unknown;
    read_error?: unknown;
}

interface NpmSummary {
    total?: unknown;
    synced?: unknown;
    missing?: unknown;
    outdated?: unknown;
    corrupted?: unknown;
    problems?: unknown;
    by_source?: unknown;
}

interface NpmStatusOutput {
    summary?: NpmSummary;
    packages?: unknown;
}

const VALID_STATUSES = new Set<DependencyStatus['status']>([
    'Synced',
    'SyncedFallback',
    'Outdated',
    'Missing',
    'Corrupted',
    'Incomplete',
    'ReadError',
]);

function asObject(value: unknown): RawObject | undefined {
    return typeof value === 'object' && value !== null ? (value as RawObject) : undefined;
}

function toNumber(value: unknown): number | undefined {
    if (typeof value === 'number' && Number.isFinite(value)) {
        return value;
    }
    if (typeof value === 'string' && value.trim()) {
        const parsed = Number(value);
        return Number.isFinite(parsed) ? parsed : undefined;
    }
    return undefined;
}

function normalizeStatus(value: unknown): DependencyStatus['status'] {
    if (typeof value === 'string' && VALID_STATUSES.has(value as DependencyStatus['status'])) {
        return value as DependencyStatus['status'];
    }
    return 'Corrupted';
}

function normalizeProblems(problems: unknown): Required<Pick<StatusSummary, 'missing' | 'outdated' | 'corrupted'>> {
    const obj = asObject(problems) as NpmSummaryProblems | undefined;

    const missing = toNumber(obj?.missing) ?? 0;
    const outdated = toNumber(obj?.outdated) ?? 0;
    const baseCorrupted = toNumber(obj?.corrupted) ?? 0;
    const incomplete = toNumber(obj?.incomplete) ?? 0;
    const readError = toNumber(obj?.readError) ?? toNumber(obj?.read_error) ?? 0;

    return {
        missing,
        outdated,
        corrupted: baseCorrupted + incomplete + readError,
    };
}

function getBySource(summary: NpmSummary | undefined): Partial<Record<SourceKind, number>> | undefined {
    const bySource = asObject(summary?.by_source);
    if (!bySource) {
        return undefined;
    }

    const normalized: Partial<Record<SourceKind, number>> = {};
    for (const [key, value] of Object.entries(bySource)) {
        const numeric = toNumber(value);
        if (numeric !== undefined) {
            normalized[key as SourceKind] = numeric;
        }
    }

    return Object.keys(normalized).length > 0 ? normalized : undefined;
}

export function normalizeDependencyStatus(raw: DependencyStatus): DependencyItemStatus {
    if (raw.status === 'Synced' || raw.status === 'SyncedFallback') {
        return 'synced';
    }
    if (raw.status === 'Outdated') {
        return 'outdated';
    }
    if (raw.status === 'Missing') {
        return 'missing';
    }
    return 'corrupted';
}

export type DependencyItemStatus = 'synced' | 'outdated' | 'missing' | 'corrupted';

export function parseStatusOutput(jsonOutput: string): StatusOutput {
    try {
        const parsed = JSON.parse(jsonOutput) as unknown;
        const object = asObject(parsed);

        if (!object) {
            throw new Error('Unsupported status output shape: expected object.');
        }

        if (Array.isArray(object.statuses)) {
            return object as unknown as StatusOutput;
        }

        const npmOutput = object as NpmStatusOutput;
        if (!Array.isArray(npmOutput.packages)) {
            throw new Error('Unsupported status output shape.');
        }

        const statuses: DependencyStatus[] = npmOutput.packages.map(rawPackage => {
            const pkg = asObject(rawPackage) as NpmPackageStatus | undefined;
            return {
                package_name: typeof pkg?.name === 'string' ? pkg.name : undefined,
                lock_version: typeof pkg?.lockVersion === 'string' ? pkg.lockVersion : 'unknown',
                docs_version: typeof pkg?.docsVersion === 'string' ? pkg.docsVersion : undefined,
                status: normalizeStatus(pkg?.status),
                reason: typeof pkg?.reason === 'string' ? pkg.reason : undefined,
                source_kind: typeof pkg?.sourceKind === 'string' ? (pkg.sourceKind as SourceKind) : undefined,
                source_url: typeof pkg?.sourceUrl === 'string' ? pkg.sourceUrl : undefined,
                provenance_url: typeof pkg?.provenanceUrl === 'string' ? pkg.provenanceUrl : undefined,
                is_fallback: Boolean(pkg?.isFallback),
                last_sync_at: typeof pkg?.lastSyncAt === 'string' ? pkg.lastSyncAt : undefined,
            };
        });

        const problemSummary = normalizeProblems(npmOutput.summary?.problems);
        const missingFromSummary = toNumber(npmOutput.summary?.missing);
        const outdatedFromSummary = toNumber(npmOutput.summary?.outdated);
        const corruptedFromSummary = toNumber(npmOutput.summary?.corrupted);

        const summary: StatusSummary = {
            total: toNumber(npmOutput.summary?.total) ?? statuses.length,
            synced: toNumber(npmOutput.summary?.synced) ?? statuses.filter(item => item.status === 'Synced' || item.status === 'SyncedFallback').length,
            missing: missingFromSummary ?? problemSummary.missing ?? statuses.filter(item => item.status === 'Missing').length,
            outdated: outdatedFromSummary ?? problemSummary.outdated ?? statuses.filter(item => item.status === 'Outdated').length,
            corrupted:
                corruptedFromSummary ??
                problemSummary.corrupted ??
                statuses.filter(item => item.status === 'Corrupted' || item.status === 'Incomplete' || item.status === 'ReadError').length,
            by_source: getBySource(npmOutput.summary),
        };

        return { summary, statuses };
    } catch (error) {
        throw new Error(`Failed to parse status output: ${error}`);
    }
}
