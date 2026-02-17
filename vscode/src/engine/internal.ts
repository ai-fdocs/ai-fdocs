import { BinaryManager } from '../binary-manager';
import { CommandExecutor } from '../core/command-types';

export class InternalEngineExecutor implements CommandExecutor {
    readonly engine = 'internal' as const;

    constructor(private readonly binaryManager: BinaryManager) {}

    execute(args: string[], workspaceRoot: string): Promise<{ stdout: string; stderr: string }> {
        return this.binaryManager.execute(args, workspaceRoot);
    }
}
