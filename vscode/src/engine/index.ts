import * as vscode from 'vscode';
import { BinaryManager } from '../binary-manager';
import { CommandExecutor, EngineName } from '../core/command-types';
import { ExternalCliEngineExecutor } from './external-cli';
import { InternalEngineExecutor } from './internal';

export function isCanaryBuild(context: vscode.ExtensionContext): boolean {
    const version = String(context.extension.packageJSON?.version ?? '');
    const preview = Boolean(context.extension.packageJSON?.preview);

    return preview || /canary|dev|alpha|beta|rc/i.test(version);
}

export function getDefaultEngine(context: vscode.ExtensionContext): EngineName {
    if (context.extensionMode === vscode.ExtensionMode.Development || isCanaryBuild(context)) {
        return 'internal';
    }

    return 'external-cli';
}

export function resolveEngine(config: vscode.WorkspaceConfiguration, context: vscode.ExtensionContext): EngineName {
    const configured = config.get<EngineName>('engine');
    return configured ?? getDefaultEngine(context);
}

export function createEngineExecutor(engine: EngineName, binaryManager: BinaryManager): CommandExecutor {
    if (engine === 'internal') {
        return new InternalEngineExecutor(binaryManager);
    }

    return new ExternalCliEngineExecutor(binaryManager);
}
