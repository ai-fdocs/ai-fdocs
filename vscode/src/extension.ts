import * as vscode from 'vscode';
import { BinaryManager } from './binary-manager';
import { ProjectDetector, ProjectInfo } from './project-detector';
import { DependencyTreeProvider, TreeItemType } from './dependency-tree-provider';
import { syncAll } from './commands';
import { AiFdocsSettings, DocsSource, SyncMode, ReportFormat, TableFormat } from './types';

let outputChannel: vscode.OutputChannel;
let binaryManager: BinaryManager;
let projectDetector: ProjectDetector;
let treeDataProvider: DependencyTreeProvider;
let statusBarItem: vscode.StatusBarItem;
let currentProject: ProjectInfo | null = null;

const DEFAULT_SETTINGS: AiFdocsSettings = {
    output_dir: 'fdocs',
    max_file_size_kb: 512,
    sync_concurrency: 8,
    prune: true,
    docs_source: 'npm_tarball',
    sync_mode: 'lockfile',
    latest_ttl_hours: 24,
    report_format: 'text',
    format: 'table',
};

interface RawFileSettings {
    output_dir?: unknown;
    max_file_size_kb?: unknown;
    sync_concurrency?: unknown;
    prune?: unknown;
    docs_source?: unknown;
    sync_mode?: unknown;
    latest_ttl_hours?: unknown;
    report_format?: unknown;
    format?: unknown;
}

function parseTomlValue(value: string): unknown {
    const normalized = value.trim();

    if (normalized === 'true') {
        return true;
    }

    if (normalized === 'false') {
        return false;
    }

    if (/^-?\d+$/.test(normalized)) {
        return Number(normalized);
    }

    if (
        (normalized.startsWith('"') && normalized.endsWith('"')) ||
        (normalized.startsWith("'") && normalized.endsWith("'"))
    ) {
        return normalized.slice(1, -1);
    }

    return normalized;
}

async function loadSettingsFromFile(projectRoot: string): Promise<Partial<AiFdocsSettings>> {
    const configPath = vscode.Uri.joinPath(vscode.Uri.file(projectRoot), 'ai-fdocs.toml');

    try {
        const fileContent = await vscode.workspace.fs.readFile(configPath);
        const content = Buffer.from(fileContent).toString('utf8');
        const lines = content.split(/\r?\n/);

        let inSettings = false;
        const rawSettings: RawFileSettings = {};

        for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || trimmed.startsWith('#')) {
                continue;
            }

            if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
                inSettings = trimmed === '[settings]';
                continue;
            }

            if (!inSettings) {
                continue;
            }

            const keyValueMatch = trimmed.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.+)$/);
            if (!keyValueMatch) {
                continue;
            }

            const [, key, rawValue] = keyValueMatch;
            if (key in rawSettings) {
                (rawSettings as Record<string, unknown>)[key] = parseTomlValue(rawValue);
            }
        }

        const parsed: Partial<AiFdocsSettings> = {};

        if (typeof rawSettings.output_dir === 'string') {
            parsed.output_dir = rawSettings.output_dir;
        }
        if (typeof rawSettings.max_file_size_kb === 'number') {
            parsed.max_file_size_kb = rawSettings.max_file_size_kb;
        }
        if (typeof rawSettings.sync_concurrency === 'number') {
            parsed.sync_concurrency = rawSettings.sync_concurrency;
        }
        if (typeof rawSettings.prune === 'boolean') {
            parsed.prune = rawSettings.prune;
        }
        if (typeof rawSettings.docs_source === 'string') {
            parsed.docs_source = rawSettings.docs_source as DocsSource;
        }
        if (typeof rawSettings.sync_mode === 'string') {
            const normalized = rawSettings.sync_mode === 'latest_docs' ? 'latest-docs' : rawSettings.sync_mode;
            parsed.sync_mode = normalized as SyncMode;
        }
        if (typeof rawSettings.latest_ttl_hours === 'number') {
            parsed.latest_ttl_hours = rawSettings.latest_ttl_hours;
        }
        if (typeof rawSettings.report_format === 'string') {
            parsed.report_format = rawSettings.report_format as ReportFormat;
        }
        if (typeof rawSettings.format === 'string') {
            parsed.format = rawSettings.format as TableFormat;
        }

        return parsed;
    } catch {
        return {};
    }
}

function loadSettingsFromVsCode(): Partial<AiFdocsSettings> {
    const config = vscode.workspace.getConfiguration('ai-fdocs');

    return {
        output_dir: config.get<string>('outputDir'),
        max_file_size_kb: config.get<number>('maxFileSizeKb'),
        sync_concurrency: config.get<number>('syncConcurrency'),
        prune: config.get<boolean>('prune'),
        docs_source: config.get<DocsSource>('docsSource'),
        sync_mode: config.get<SyncMode>('syncMode'),
        latest_ttl_hours: config.get<number>('latestTtlHours'),
        report_format: config.get<ReportFormat>('reportFormat'),
        format: config.get<TableFormat>('format'),
    };
}

function validateConfig(settings: AiFdocsSettings): void {
    if (!settings.output_dir || settings.output_dir.trim().length === 0) {
        throw new Error('Invalid config: output_dir must be a non-empty string');
    }

    if (!Number.isInteger(settings.max_file_size_kb) || settings.max_file_size_kb <= 0) {
        throw new Error('Invalid config: max_file_size_kb must be greater than 0');
    }

    if (!Number.isInteger(settings.sync_concurrency) || settings.sync_concurrency <= 0 || settings.sync_concurrency > 50) {
        throw new Error('Invalid config: sync_concurrency must be between 1 and 50');
    }

    if (!Number.isInteger(settings.latest_ttl_hours) || settings.latest_ttl_hours <= 0) {
        throw new Error('Invalid config: latest_ttl_hours must be greater than 0');
    }

    if (!['github', 'npm_tarball'].includes(settings.docs_source)) {
        throw new Error('Invalid config: docs_source must be "github" or "npm_tarball"');
    }

    if (!['lockfile', 'latest-docs'].includes(settings.sync_mode)) {
        throw new Error('Invalid config: sync_mode must be "lockfile" or "latest-docs"');
    }

    if (!['text', 'json'].includes(settings.report_format)) {
        throw new Error('Invalid config: report_format must be "text" or "json"');
    }

    if (!['table', 'json'].includes(settings.format)) {
        throw new Error('Invalid config: format must be "table" or "json"');
    }
}

async function resolveSettings(projectRoot: string, commandOverride: Partial<AiFdocsSettings> = {}): Promise<AiFdocsSettings> {
    const fileConfig = await loadSettingsFromFile(projectRoot);
    const effectiveCommandOverride: Partial<AiFdocsSettings> = {
        ...loadSettingsFromVsCode(),
        ...commandOverride,
    };

    const merged: AiFdocsSettings = {
        ...DEFAULT_SETTINGS,
        ...fileConfig,
        ...effectiveCommandOverride,
    };

    validateConfig(merged);
    return merged;
}

export async function activate(context: vscode.ExtensionContext) {
    console.log('AI Fresh Docs extension is now active');

    // Create output channel
    outputChannel = vscode.window.createOutputChannel('AI Fresh Docs');
    context.subscriptions.push(outputChannel);

    // Initialize binary manager
    binaryManager = new BinaryManager(outputChannel);

    // Check if binary is available
    const isAvailable = await binaryManager.isAvailable();
    if (!isAvailable) {
        outputChannel.appendLine('ai-fdocs binary not found');
        await binaryManager.showInstallationInstructions();
        return; // Don't activate further if binary not found
    }

    const binaryInfo = binaryManager.getBinaryInfo();
    outputChannel.appendLine(
        `Using ai-fdocs binary: ${binaryInfo?.path} (${binaryInfo?.type}) v${binaryInfo?.version}`
    );

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

    try {
        const settings = await resolveSettings(currentProject.rootPath);
        outputChannel.appendLine(`Loaded settings: ${JSON.stringify(settings)}`);
    } catch (error: any) {
        outputChannel.appendLine(`Configuration error: ${error.message}`);
        vscode.window.showErrorMessage(`ai-fdocs config is invalid: ${error.message}`);
    }

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
    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.sync', async () => {
            await syncAll(binaryManager, outputChannel, false);
            await treeDataProvider.refresh();
            updateStatusBar();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.forceSync', async () => {
            await syncAll(binaryManager, outputChannel, true);
            await treeDataProvider.refresh();
            updateStatusBar();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.refresh', async () => {
            await treeDataProvider.refresh();
            updateStatusBar();
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.init', async () => {
            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'AI-Docs: Initializing configuration...',
                    cancellable: false,
                },
                async () => {
                    try {
                        await binaryManager.execute(['init']);
                        vscode.window.showInformationMessage('ai-fdocs.toml created successfully!');
                        await treeDataProvider.refresh();
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Init failed: ${error.message}`);
                    }
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.prune', async () => {
            const confirm = await vscode.window.showWarningMessage(
                'This will remove outdated documentation. Continue?',
                'Yes',
                'No'
            );

            if (confirm !== 'Yes') {
                return;
            }

            await vscode.window.withProgress(
                {
                    location: vscode.ProgressLocation.Notification,
                    title: 'AI-Docs: Pruning documentation...',
                    cancellable: false,
                },
                async () => {
                    try {
                        await binaryManager.execute(['prune']);
                        vscode.window.showInformationMessage('Documentation pruned successfully!');
                        await treeDataProvider.refresh();
                    } catch (error: any) {
                        vscode.window.showErrorMessage(`Prune failed: ${error.message}`);
                    }
                }
            );
        })
    );

    context.subscriptions.push(
        vscode.commands.registerCommand('ai-fdocs.check', async () => {
            try {
                const { stdout } = await binaryManager.execute(['check', '--format', 'json']);
                outputChannel.appendLine('=== Check Output ===');
                outputChannel.appendLine(stdout);
                outputChannel.show();

                const result = JSON.parse(stdout);
                const summary = result.summary;

                if (summary.missing > 0 || summary.outdated > 0 || summary.corrupted > 0) {
                    vscode.window.showWarningMessage(
                        `Documentation check: ${summary.missing} missing, ${summary.outdated} outdated, ${summary.corrupted} corrupted`
                    );
                } else {
                    vscode.window.showInformationMessage('All documentation is up to date!');
                }
            } catch (error: any) {
                vscode.window.showErrorMessage(`Check failed: ${error.message}`);
            }
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
            await syncAll(binaryManager, outputChannel, false);
            await treeDataProvider.refresh();
            updateStatusBar();
        });
    }

    // Watch for config changes
    context.subscriptions.push(
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('ai-fdocs')) {
                outputChannel.appendLine('Configuration changed, refreshing...');
                treeDataProvider.refresh();
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
    const typeName = ProjectDetector.getProjectTypeName(currentProject.type);

    statusBarItem.text = `${emoji} ${typeName} - AI Docs`;
    statusBarItem.tooltip = 'Click to refresh documentation status';
}

export function deactivate() {
    if (projectDetector) {
        projectDetector.disposeWatchers();
    }
    outputChannel.appendLine('AI Fresh Docs extension deactivated');
}
