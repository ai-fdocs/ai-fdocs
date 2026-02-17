import * as vscode from 'vscode';
import { CommandContext, CommandResult } from './core/command-types';
import { runCheckCommand } from './core/check-service';
import { runInitCommand } from './core/init-service';
import { runPruneCommand } from './core/prune-service';
import { runStatusCommand } from './core/status-service';
import { runSyncCommand } from './core/sync-service';

export type UnifiedCommandName = 'init' | 'sync' | 'syncForce' | 'status' | 'check' | 'prune';

interface UnifiedCommandDefinition {
    progressTitle: string;
    startMessage: string;
    successMessage: string;
    run: (context: CommandContext) => Promise<CommandResult>;
    confirm?: () => Promise<boolean>;
}

const COMMAND_DEFINITIONS: Record<UnifiedCommandName, UnifiedCommandDefinition> = {
    init: {
        progressTitle: 'AI-Docs: Initializing configuration...',
        startMessage: 'Running init...',
        successMessage: 'ai-fdocs.toml created successfully!',
        run: context => runInitCommand(context),
    },
    sync: {
        progressTitle: 'AI-Docs: Syncing documentation...',
        startMessage: 'Running sync...',
        successMessage: 'Documentation synced successfully!',
        run: context => runSyncCommand(context, { force: false }),
    },
    syncForce: {
        progressTitle: 'AI-Docs: Force syncing documentation...',
        startMessage: 'Running force sync...',
        successMessage: 'Documentation force synced successfully!',
        run: context => runSyncCommand(context, { force: true }),
    },
    status: {
        progressTitle: 'AI-Docs: Checking status...',
        startMessage: 'Running status...',
        successMessage: 'Status check completed.',
        run: context => runStatusCommand(context),
    },
    check: {
        progressTitle: 'AI-Docs: Running consistency check...',
        startMessage: 'Running check...',
        successMessage: 'Documentation check completed.',
        run: context => runCheckCommand(context),
    },
    prune: {
        progressTitle: 'AI-Docs: Pruning documentation...',
        startMessage: 'Running prune...',
        successMessage: 'Documentation pruned successfully!',
        run: context => runPruneCommand(context),
        confirm: async () => {
            const confirm = await vscode.window.showWarningMessage(
                'This will remove outdated documentation. Continue?',
                { modal: true },
                'Yes'
            );
            return confirm === 'Yes';
        },
    },
};

function appendCommandOutput(outputChannel: vscode.OutputChannel, command: string, rawOutput?: string): void {
    outputChannel.appendLine(`=== ${command.toUpperCase()} Output ===`);
    if (rawOutput?.trim()) {
        outputChannel.appendLine(rawOutput);
    } else {
        outputChannel.appendLine('(no output)');
    }
}

function showCommandResult(commandName: UnifiedCommandName, result: CommandResult): void {
    if (commandName === 'check' && result.data && typeof result.data === 'object') {
        const summary = (result.data as { summary?: { missing?: number; outdated?: number; corrupted?: number } }).summary;
        if (summary) {
            const missing = summary.missing ?? 0;
            const outdated = summary.outdated ?? 0;
            const corrupted = summary.corrupted ?? 0;

            if (missing > 0 || outdated > 0 || corrupted > 0) {
                vscode.window.showWarningMessage(
                    `Documentation check: ${missing} missing, ${outdated} outdated, ${corrupted} corrupted`
                );
                return;
            }
            vscode.window.showInformationMessage('All documentation is up to date!');
            return;
        }
    }

    if (result.ok) {
        vscode.window.showInformationMessage(COMMAND_DEFINITIONS[commandName].successMessage);
    } else {
        vscode.window.showWarningMessage(result.message);
    }
}

function handleCommandError(
    commandName: UnifiedCommandName,
    outputChannel: vscode.OutputChannel,
    error: unknown,
    context?: CommandContext
): void {
    if (error instanceof vscode.CancellationError) {
        outputChannel.appendLine(`${commandName} cancelled by user.`);
        vscode.window.showInformationMessage(`AI-Docs: ${commandName} cancelled.`);
        return;
    }

    const message = error instanceof Error ? error.message : String(error);

    if ((commandName === 'sync' || commandName === 'check') && context) {
        context.diagnostics?.emitFailure(commandName, {
            engine: context.executor.engine,
            reason: 'exception',
            message,
        });
    }

    outputChannel.appendLine(`${commandName} failed: ${message}`);
    vscode.window.showErrorMessage(`AI-Docs ${commandName} failed: ${message}`);
}

export async function runUnifiedCommand(
    commandName: UnifiedCommandName,
    outputChannel: vscode.OutputChannel,
    createContext: (token: vscode.CancellationToken) => CommandContext,
    onSuccess?: () => Promise<void>
): Promise<void> {
    const definition = COMMAND_DEFINITIONS[commandName];

    if (definition.confirm) {
        const approved = await definition.confirm();
        if (!approved) {
            return;
        }
    }

    let activeContext: CommandContext | undefined;

    try {
        await vscode.window.withProgress(
            {
                location: vscode.ProgressLocation.Notification,
                title: definition.progressTitle,
                cancellable: true,
            },
            async (progress, token) => {
                progress.report({ message: definition.startMessage });

                activeContext = createContext(token);
                const result = await definition.run(activeContext);

                if ((commandName === 'sync' || commandName === 'check') && !result.ok) {
                    activeContext.diagnostics?.emitFailure(commandName, {
                        engine: activeContext.executor.engine,
                        reason: 'validation',
                        message: result.message,
                        errorCount: result.metrics.errors,
                    });
                }

                appendCommandOutput(outputChannel, result.command, result.rawOutput);
                showCommandResult(commandName, result);

                if (onSuccess) {
                    await onSuccess();
                }
            }
        );
    } catch (error) {
        handleCommandError(commandName, outputChannel, error, activeContext);
    }
}
