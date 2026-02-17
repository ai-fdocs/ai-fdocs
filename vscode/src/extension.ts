import * as vscode from 'vscode';
import { BinaryManager } from './binary-manager';
import { ProjectDetector, ProjectInfo } from './project-detector';
import { DependencyItem, DependencyTreeProvider } from './dependency-tree-provider';
import { runUnifiedCommand } from './commands';
import { CommandContext, CommandExecutor, EngineName } from './core/command-types';
import { DocsSource, SyncMode } from './sources/source-types';
import { createEngineExecutor, resolveEngine } from './engine';
import { ExtensionDiagnostics } from './core/diagnostics';

let outputChannel: vscode.OutputChannel;
let binaryManager: BinaryManager;
let projectDetector: ProjectDetector;
let treeDataProvider: DependencyTreeProvider;
let statusBarItem: vscode.StatusBarItem;
let currentProject: ProjectInfo | null = null;
let commandExecutor: CommandExecutor;
let diagnostics: ExtensionDiagnostics;
let activeEngine: EngineName = 'external-cli';

function getActiveEngine(context?: vscode.ExtensionContext): EngineName {
    const config = vscode.workspace.getConfiguration('ai-fdocs');
    if (context) {
        return resolveEngine(config, context);
    }
    const configured = config.get<EngineName>('engine');
    return configured ?? activeEngine;
}

function getActiveSyncMode(): SyncMode {
    const config = vscode.workspace.getConfiguration('ai-fdocs');
    return config.get<SyncMode>('syncMode') ?? 'lockfile';
}


function createCommandContext(cancellationToken: vscode.CancellationToken): CommandContext {
    const config = vscode.workspace.getConfiguration('ai-fdocs');

    return {
        workspaceRoot: currentProject?.rootPath ?? vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ?? process.cwd(),
        settings: {
            syncMode: (config.get<SyncMode>('syncMode') ?? 'lockfile'),
            reportFormat: 'json',
            docsSource: config.get<DocsSource>('docsSource') ?? 'npm_tarball',
        },
        logger: {
            info: message => outputChannel.appendLine(message),
            warn: message => outputChannel.appendLine(`[warn] ${message}`),
            error: message => outputChannel.appendLine(`[error] ${message}`),
            debug: message => outputChannel.appendLine(`[debug] ${message}`),
        },
        cancellationToken,
        binaryManager,
        executor: commandExecutor,
        diagnostics,
    };
}


export async function activate(context: vscode.ExtensionContext) {
    console.log('AI Fresh Docs extension is now active');

    // Create output channel
    outputChannel = vscode.window.createOutputChannel('AI Fresh Docs');
    context.subscriptions.push(outputChannel);

    // Initialize binary manager
    binaryManager = new BinaryManager(outputChannel);
    diagnostics = new ExtensionDiagnostics(outputChannel);

    // Check if binary is available
    const isAvailable = await binaryManager.isAvailable();
    if (!isAvailable) {
        outputChannel.appendLine('ai-fdocs binary not found');
        await binaryManager.showInstallationInstructions();
        return; // Don't activate further if binary not found
    }

    activeEngine = getActiveEngine(context);
    commandExecutor = createEngineExecutor(activeEngine, binaryManager);

    const binaryInfo = binaryManager.getBinaryInfo();
    outputChannel.appendLine(
        `Using ai-fdocs binary: ${binaryInfo?.path} (${binaryInfo?.type}) v${binaryInfo?.version}`
    );
    outputChannel.appendLine(`Engine selected: ${activeEngine}`);

    // Initialize project detector
    projectDetector = new ProjectDetector();
    const projects = await projectDetector.detectProjects();

    if (projects.length === 0) {
        outputChannel.appendLine('No supported projects found in workspace');
        vscode.window.showInformationMessage(
            'No Rust or Node.js projects detected. AI Fresh Docs extension will remain inactive.'
        );
        return;
    }

    // Use first project for now (multi-project support can be added later)
    currentProject = projects[0];
    outputChannel.appendLine(
        `Detected ${ProjectDetector.getProjectTypeName(currentProject.type)} project at ${currentProject.rootPath}`
    );
    // Initialize tree data provider
    treeDataProvider = new DependencyTreeProvider(binaryManager, outputChannel);
    treeDataProvider.setProjectRoot(currentProject.rootPath);

    // Register tree view
    const treeView = vscode.window.createTreeView('ai-fdocs-dependencies', {
        treeDataProvider: treeDataProvider,
    });
    context.subscriptions.push(treeView);

    // Initial refresh
    await treeDataProvider.refresh();

    // Register commands
    const registerUnifiedCommand = (
        commandId: string,
        commandName: 'init' | 'sync' | 'syncForce' | 'status' | 'check' | 'prune'
    ) => {
        context.subscriptions.push(
            vscode.commands.registerCommand(commandId, async () => {
                await runUnifiedCommand(commandName, outputChannel, createCommandContext, async () => {
                    await treeDataProvider.refresh();
                    updateStatusBar();
                    outputChannel.show(true);
                });
            })
        );
    };

    registerUnifiedCommand('ai-fdocs.init', 'init');
    registerUnifiedCommand('ai-fdocs.sync', 'sync');
    registerUnifiedCommand('ai-fdocs.syncForce', 'syncForce');
    registerUnifiedCommand('ai-fdocs.status', 'status');
    registerUnifiedCommand('ai-fdocs.check', 'check');
    registerUnifiedCommand('ai-fdocs.prune', 'prune');

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.forceRefreshPackage', async (item?: DependencyItem) => {
            const pkgName = item ? item.label : 'selected package';
            outputChannel.appendLine(`Force refresh package requested: ${pkgName}`);
            await runUnifiedCommand('syncForce', outputChannel, createCommandContext, async () => {
                await treeDataProvider.refresh();
                updateStatusBar();
            });
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.openSummary', async (item?: DependencyItem) => {
            if (!item) {
                vscode.window.showWarningMessage('No package selected.');
                return;
            }

            const summaryPath = item.getSummaryPath();
            if (!summaryPath) {
                vscode.window.showWarningMessage(`_SUMMARY.md not found for ${item.label}.`);
                return;
            }

            await vscode.commands.executeCommand('vscode.open', vscode.Uri.file(summaryPath));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.openProvenanceUrl', async (item?: DependencyItem) => {
            if (!item) {
                vscode.window.showWarningMessage('No package selected.');
                return;
            }

            const url = item.getProvenanceUrl();
            if (!url) {
                vscode.window.showWarningMessage(`Source provenance URL not available for ${item.label}.`);
                return;
            }

            await vscode.env.openExternal(vscode.Uri.parse(url));
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.refresh', async () => {
            await treeDataProvider.refresh();
            updateStatusBar();
        })
    );

    // Create status bar item
    statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
    statusBarItem.command = 'ai-fdocs.refresh';
    context.subscriptions.push(statusBarItem);
    updateStatusBar();
    statusBarItem.show();

    // Setup file watchers
    const config = vscode.workspace.getConfiguration('ai-fdocs');
    const autoSync = config.get<boolean>('autoSync');

    if (autoSync) {
        projectDetector.setupWatchers(async () => {
            outputChannel.appendLine('Lockfile or config changed, auto-syncing...');
            await runUnifiedCommand('sync', outputChannel, createCommandContext, async () => {
                await treeDataProvider.refresh();
                updateStatusBar();
            });
        });
    }

    // Watch for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ai-fdocs')) {
                outputChannel.appendLine('Configuration changed, refreshing...');
                const nextEngine = getActiveEngine(context);
                if (nextEngine !== activeEngine) {
                    activeEngine = nextEngine;
                    commandExecutor = createEngineExecutor(activeEngine, binaryManager);
                    outputChannel.appendLine(`Engine switched to: ${activeEngine}`);
                }
                treeDataProvider.refresh();
                updateStatusBar();
            }
        })
    );

    vscode.window.showInformationMessage('AI Fresh Docs extension activated!');
}

function updateStatusBar() {
    if (!currentProject || !statusBarItem) {
        return;
    }

    const emoji = ProjectDetector.getProjectEmoji(currentProject.type);
    const mode = getActiveSyncMode();
    const health = treeDataProvider.getHealthSummary();

    statusBarItem.text = `${emoji} AI Docs: ${health.synced} synced / ${health.outdated} outdated / ${health.errors} errors · ${mode} · ${activeEngine}`;
    statusBarItem.tooltip = `Mode: ${mode}. Engine: ${activeEngine}. Click to refresh documentation status`;
}

export function deactivate() {
    if (projectDetector) {
        projectDetector.disposeWatchers();
    }
    outputChannel.appendLine('AI Fresh Docs extension deactivated');
}
