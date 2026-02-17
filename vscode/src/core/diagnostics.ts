import * as vscode from 'vscode';
import { CommandDiagnostics } from './command-types';

interface FailureDetails {
    engine: 'internal' | 'external-cli';
    reason: 'validation' | 'exception';
    message: string;
    errorCount?: number;
}

export class ExtensionDiagnostics implements CommandDiagnostics {
    constructor(private readonly outputChannel: vscode.OutputChannel) {}

    emitFailure(command: 'sync' | 'check', details: FailureDetails): void {
        const event = {
            event: 'ai-fdocs.command.failure',
            timestamp: new Date().toISOString(),
            command,
            engine: details.engine,
            reason: details.reason,
            message: details.message,
            errorCount: details.errorCount ?? 0,
        };

        this.outputChannel.appendLine(`[diagnostics] ${JSON.stringify(event)}`);
    }
}
