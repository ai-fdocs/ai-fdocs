import { DocsSource, SourceKind, SyncMode } from './sources/source-types';
import { parseStatusOutput as parseStatusOutputCore } from './core/normalize-status';

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


export interface CheckStatus {
    package_name?: string;
    crate_name?: string;
    lock_version?: string;
    docs_version?: string;
    status: 'Synced' | 'SyncedFallback' | 'Outdated' | 'Missing' | 'Corrupted';
    reason?: string;
    reason_code?: string;
    source_kind?: SourceKind;
}

export interface CheckOutput {
    summary: StatusSummary;
    statuses: CheckStatus[];
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

export const parseStatusOutput = parseStatusOutputCore;

export function getPackageName(dep: DependencyStatus): string {
    return dep.crate_name || dep.package_name || 'unknown';
}
