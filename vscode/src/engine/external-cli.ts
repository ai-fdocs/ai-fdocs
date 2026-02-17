import { BinaryManager } from '../binary-manager';
import { CommandExecutor } from '../core/command-types';

export class ExternalCliEngineExecutor implements CommandExecutor {
    readonly engine = 'external-cli' as const;

    constructor(private readonly binaryManager: BinaryManager) {}

    execute(args: string[], workspaceRoot: string): Promise<{ stdout: string; stderr: string }> {
        return this.binaryManager.execute(args, workspaceRoot);
    }
}
