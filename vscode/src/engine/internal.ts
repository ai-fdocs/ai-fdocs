import { BinaryManager } from '../binary-manager';
import { CommandExecutor } from '../core/command-types';
import { normalizeCommandArgs } from './arg-builder';

export class InternalEngineExecutor implements CommandExecutor {
    readonly engine = 'internal' as const;

    constructor(private readonly binaryManager: BinaryManager) {}

    execute(args: string[], workspaceRoot: string): Promise<{ stdout: string; stderr: string }> {
        const normalizedArgs = normalizeCommandArgs(args, this.engine, this.binaryManager.getBinaryInfo());
        return this.binaryManager.execute(normalizedArgs, workspaceRoot);
    }
}
