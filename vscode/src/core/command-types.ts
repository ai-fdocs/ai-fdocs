import * as vscode from 'vscode';
import { BinaryManager } from '../binary-manager';
import { DocsSource, SyncMode } from '../sources/source-types';

export interface CommandLogger {
    info(message: string): void;
    warn(message: string): void;
    error(message: string): void;
    debug?(message: string): void;
}

export interface CommandSettings {
    syncMode?: SyncMode;
    reportFormat?: 'text' | 'json';
    docsSource?: DocsSource;
}

export interface CommandContext {
    workspaceRoot: string;
    settings: CommandSettings;
    logger: CommandLogger;
    cancellationToken: vscode.CancellationToken;
    binaryManager: BinaryManager;
}

export interface SourceMetrics {
    synced: number;
    cached: number;
    skipped: number;
    errors: number;
}

export interface CommandMetrics extends SourceMetrics {
    sourceBreakdown: Record<string, SourceMetrics>;
}

export interface CommandResult<TData = unknown> {
    command: 'init' | 'sync' | 'status' | 'check' | 'prune';
    ok: boolean;
    message: string;
    metrics: CommandMetrics;
    data?: TData;
    rawOutput?: string;
}

export function createEmptyMetrics(): CommandMetrics {
    return {
        synced: 0,
        cached: 0,
        skipped: 0,
        errors: 0,
        sourceBreakdown: {},
    };
}

export function ensureNotCancelled(context: CommandContext): void {
    if (context.cancellationToken.isCancellationRequested) {
        throw new vscode.CancellationError();
    }
}

export function parseJsonOutput<T>(stdout: string): T {
    return JSON.parse(stdout) as T;
}

export function normalizeSourceMetrics(partial?: Partial<SourceMetrics>): SourceMetrics {
    return {
        synced: partial?.synced ?? 0,
        cached: partial?.cached ?? 0,
        skipped: partial?.skipped ?? 0,
        errors: partial?.errors ?? 0,
    };
}
