import { DocsSource, SourceKind, SyncMode } from './sources/source-types';

export interface StatusSummary {
    total: number;
    synced: number;
    missing: number;
    outdated: number;
    corrupted: number;
    by_source?: Partial<Record<SourceKind, number>>;
}

export interface DependencyStatus {
    crate_name?: string; // For Rust
    package_name?: string; // For Node.js
    lock_version: string;
    docs_version?: string;
    status: 'Synced' | 'SyncedFallback' | 'Outdated' | 'Missing' | 'Corrupted' | 'Incomplete' | 'ReadError';
    reason?: string;
    mode?: string;
    source_kind?: SourceKind;
    reason_code?: string;
    source_url?: string;
    provenance_url?: string;
    is_fallback?: boolean;
    last_sync_at?: string;
}

export interface StatusOutput {
    summary: StatusSummary;
    statuses: DependencyStatus[];
}

export type ReportFormat = 'text' | 'json';
export type TableFormat = 'table' | 'json';

export interface AiFdocsSettings {
    output_dir: string;
    max_file_size_kb: number;
    sync_concurrency: number;
    prune: boolean;
    docs_source: DocsSource;
    sync_mode: SyncMode;
    latest_ttl_hours: number;
    report_format: ReportFormat;
    format: TableFormat;
}

export function parseStatusOutput(jsonOutput: string): StatusOutput {
    try {
        const parsed = JSON.parse(jsonOutput);

        // Rust CLI shape: { summary, statuses }
        if (Array.isArray(parsed.statuses)) {
            return parsed as StatusOutput;
        }

        // NPM CLI shape: { summary, packages }
        if (Array.isArray(parsed.packages)) {
            const statuses: DependencyStatus[] = parsed.packages.map((pkg: any) => ({
                package_name: pkg.name,
                lock_version: pkg.lockVersion ?? 'unknown',
                status: pkg.status,
                reason: pkg.reason,
                is_fallback: pkg.isFallback,
            }));

            return {
                summary: {
                    total: parsed.summary?.total ?? statuses.length,
                    synced: parsed.summary?.synced ?? 0,
                    missing: statuses.filter(item => item.status === 'Missing').length,
                    outdated: statuses.filter(item => item.status === 'Outdated').length,
                    corrupted: statuses.filter(item => item.status === 'Corrupted').length,
                },
                statuses,
            };
        }

        throw new Error('Unsupported status output shape');
    } catch (error) {
        throw new Error(`Failed to parse status output: ${error}`);
    }
}

export function getPackageName(dep: DependencyStatus): string {
    return dep.crate_name || dep.package_name || 'unknown';
}
