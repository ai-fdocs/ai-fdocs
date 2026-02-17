import * as vscode from 'vscode';
import { BinaryManager } from './binary-manager';
import { DependencyStatus, parseStatusOutput, getPackageName } from './types';
import * as path from 'path';
import * as fs from 'fs';

export type TreeItemType = DependencyItem | FileItem | InfoItem;

export interface StatusHealth {
    synced: number;
    outdated: number;
    errors: number;
}

export class DependencyTreeProvider implements vscode.TreeDataProvider<TreeItemType> {
    private _onDidChangeTreeData: vscode.EventEmitter<TreeItemType | undefined | null | void> =
        new vscode.EventEmitter<TreeItemType | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<TreeItemType | undefined | null | void> =
        this._onDidChangeTreeData.event;

    private dependencies: DependencyStatus[] = [];
    private projectRoot: string;

    constructor(
        private binaryManager: BinaryManager,
        private outputChannel: vscode.OutputChannel
    ) {
        this.projectRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
    }

    async refresh(): Promise<void> {
        try {
            const { stdout } = await this.binaryManager.execute(['status', '--format', 'json']);
            const statusOutput = parseStatusOutput(stdout);
            this.dependencies = statusOutput.statuses;
            this._onDidChangeTreeData.fire();
        } catch (error: any) {
            this.outputChannel.appendLine(`Failed to refresh: ${error.message}`);
            vscode.window.showErrorMessage(`Failed to refresh dependencies: ${error.message}`);
        }
    }

    getTreeItem(element: TreeItemType): vscode.TreeItem {
        return element;
    }

    async getChildren(element?: TreeItemType): Promise<TreeItemType[]> {
        if (!element) {
            return this.dependencies.map(dep => new DependencyItem(dep, this.projectRoot));
        }

        if (element instanceof DependencyItem) {
            return element.getChildren();
        }

        return [];
    }

    setProjectRoot(rootPath: string): void {
        this.projectRoot = rootPath;
    }

    getHealthSummary(): StatusHealth {
        let synced = 0;
        let outdated = 0;
        let errors = 0;

        for (const dep of this.dependencies) {
            const normalized = DependencyItem.normalizeStatus(dep.status);
            if (normalized === 'synced') {
                synced += 1;
            } else if (normalized === 'outdated') {
                outdated += 1;
            } else {
                errors += 1;
            }
        }

        return { synced, outdated, errors };
    }
}

export class DependencyItem extends vscode.TreeItem {
    readonly packageVersion: string;
    readonly normalizedStatus: 'synced' | 'outdated' | 'missing' | 'corrupted';
    readonly sourceKind: string;
    readonly fallback: boolean;
    readonly lastSyncAt?: string;

    constructor(
        public readonly dependency: DependencyStatus,
        private projectRoot: string
    ) {
        super(getPackageName(dependency), vscode.TreeItemCollapsibleState.Collapsed);

        this.packageVersion = dependency.docs_version || dependency.lock_version;
        this.normalizedStatus = DependencyItem.normalizeStatus(dependency.status);
        this.sourceKind = dependency.source_kind ?? 'unknown';
        this.fallback = Boolean(dependency.is_fallback || dependency.status === 'SyncedFallback');
        this.lastSyncAt = dependency.last_sync_at;

        this.tooltip = this.buildTooltip();
        this.description = this.buildDescription();
        this.iconPath = this.getIcon();
        this.contextValue = 'package';
    }

    static normalizeStatus(rawStatus: string): 'synced' | 'outdated' | 'missing' | 'corrupted' {
        if (rawStatus === 'Synced' || rawStatus === 'SyncedFallback') {
            return 'synced';
        }
        if (rawStatus === 'Outdated') {
            return 'outdated';
        }
        if (rawStatus === 'Missing') {
            return 'missing';
        }
        return 'corrupted';
    }

    getChildren(): TreeItemType[] {
        const children: TreeItemType[] = [];
        const docsDir = this.getDocsDirectory();

        if (!docsDir || !this.fileExists(docsDir)) {
            return [new InfoItem('No documentation files found', 'info')];
        }

        try {
            const files = fs.readdirSync(docsDir);
            const docFiles = files
                .filter(f => {
                    return f.endsWith('.md') && !f.startsWith('.aifd-meta');
                })
                .sort((a, b) => {
                    const priority: { [key: string]: number } = {
                        '_SUMMARY.md': 0,
                        'README.md': 1,
                        'CHANGELOG.md': 2,
                    };
                    const aPriority = priority[a] ?? 99;
                    const bPriority = priority[b] ?? 99;
                    return aPriority - bPriority;
                });

            docFiles.forEach(file => {
                const filePath = path.join(docsDir, file);
                children.push(new FileItem(file, filePath));
            });

            const syncInfo = this.lastSyncAt ? `Synced at: ${this.lastSyncAt}` : `Synced: v${this.packageVersion}`;
            children.push(new InfoItem(syncInfo, 'sync-info'));

            const hints = this.getSourceErrorHints();
            hints.forEach(hint => children.push(new InfoItem(hint, 'error')));
        } catch (error) {
            children.push(new InfoItem('Error reading directory', 'error'));
        }

        return children.length > 0 ? children : [new InfoItem('No files', 'info')];
    }

    getSummaryPath(): string | null {
        const docsDir = this.getDocsDirectory();
        if (!docsDir) {
            return null;
        }

        const summaryPath = path.join(docsDir, '_SUMMARY.md');
        return this.fileExists(summaryPath) ? summaryPath : null;
    }

    getProvenanceUrl(): string | null {
        return this.dependency.provenance_url || this.dependency.source_url || null;
    }

    private getSourceErrorHints(): string[] {
        const reason = `${this.dependency.reason ?? ''} ${this.dependency.reason_code ?? ''}`.toLowerCase();
        const hints: string[] = [];

        if (reason.includes('rate_limit') || reason.includes('rate limit') || reason.includes('429')) {
            hints.push('Hint: rate limit hit. Configure GITHUB_TOKEN/GH_TOKEN or retry later.');
        }
        if (reason.includes('not_found') || reason.includes('missing repo') || reason.includes('repo not found')) {
            hints.push('Hint: repository is missing/private. Verify package repository metadata.');
        }
        if (reason.includes('docs.rs') || reason.includes('docsrs') || reason.includes('latest_version_mismatch')) {
            hints.push('Hint: docs.rs may lag behind release. Retry later or use fallback source.');
        }
        if (reason.includes('tarball') || reason.includes('unavailable')) {
            hints.push('Hint: tarball is unavailable. Try docs source "github" or force sync.');
        }

        return hints;
    }

    private buildTooltip(): string {
        const name = getPackageName(this.dependency);
        const lines = [
            `${name}@${this.packageVersion}`,
            `Status: ${this.normalizedStatus}`,
            `Source: ${this.sourceKind}`,
            `Fallback: ${this.fallback ? 'yes' : 'no'}`,
            `Lock Version: ${this.dependency.lock_version}`,
        ];

        if (this.lastSyncAt) {
            lines.push(`Last Sync: ${this.lastSyncAt}`);
        }

        if (this.dependency.reason) {
            lines.push(`Reason: ${this.dependency.reason}`);
        }

        return lines.join('\n');
    }

    private buildDescription(): string {
        const parts = [this.packageVersion, this.normalizedStatus, this.sourceKind];
        if (this.fallback) {
            parts.push('fallback');
        }
        return parts.join(' · ');
    }

    private getIcon(): vscode.ThemeIcon {
        switch (this.normalizedStatus) {
            case 'synced':
                return new vscode.ThemeIcon('check-all', new vscode.ThemeColor('charts.green'));
            case 'outdated':
                return new vscode.ThemeIcon('warning', new vscode.ThemeColor('charts.yellow'));
            case 'missing':
                return new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
            case 'corrupted':
                return new vscode.ThemeIcon('tools', new vscode.ThemeColor('charts.orange'));
            default:
                return new vscode.ThemeIcon('question');
        }
    }

    private getDocsDirectory(): string | null {
        const config = vscode.workspace.getConfiguration('ai-fdocs');
        const outputDir = config.get<string>('outputDir') || 'fdocs';

        const name = getPackageName(this.dependency);
        const version = this.dependency.docs_version || this.dependency.lock_version;

        let docsDir = path.join(this.projectRoot, outputDir, 'rust', `${name}@${version}`);

        if (!this.fileExists(docsDir)) {
            docsDir = path.join(this.projectRoot, outputDir, 'npm', `${name}@${version}`);
        }

        if (!this.fileExists(docsDir)) {
            docsDir = path.join(this.projectRoot, outputDir, `${name}@${version}`);
        }

        return this.fileExists(docsDir) ? docsDir : null;
    }

    private fileExists(filePath: string): boolean {
        try {
            return fs.existsSync(filePath);
        } catch {
            return false;
        }
    }
}

export class FileItem extends vscode.TreeItem {
    constructor(
        public readonly fileName: string,
        public readonly filePath: string
    ) {
        super(fileName, vscode.TreeItemCollapsibleState.None);

        this.tooltip = filePath;
        this.contextValue = 'file';
        this.iconPath = this.getFileIcon();
        this.command = {
            command: 'vscode.open',
            title: 'Open File',
            arguments: [vscode.Uri.file(filePath)],
        };
    }

    private getFileIcon(): vscode.ThemeIcon {
        if (this.fileName === '_SUMMARY.md') {
            return new vscode.ThemeIcon('book');
        } else if (this.fileName === 'README.md') {
            return new vscode.ThemeIcon('file-text');
        } else if (this.fileName === 'CHANGELOG.md') {
            return new vscode.ThemeIcon('list-ordered');
        } else {
            return new vscode.ThemeIcon('file');
        }
    }
}

export class InfoItem extends vscode.TreeItem {
    constructor(
        public readonly text: string,
        public readonly infoType: 'sync-info' | 'error' | 'info'
    ) {
        super(text, vscode.TreeItemCollapsibleState.None);

        this.contextValue = 'info';

        if (infoType === 'sync-info') {
            this.iconPath = new vscode.ThemeIcon('info', new vscode.ThemeColor('charts.blue'));
        } else if (infoType === 'error') {
            this.iconPath = new vscode.ThemeIcon('error', new vscode.ThemeColor('charts.red'));
        } else {
            this.iconPath = new vscode.ThemeIcon('info');
        }
    }
}
