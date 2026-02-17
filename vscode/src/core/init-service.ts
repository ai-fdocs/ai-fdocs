import { CommandContext, CommandResult, createEmptyMetrics, ensureNotCancelled } from './command-types';

export interface InitOptions {
    force?: boolean;
}

export async function runInitCommand(
    context: CommandContext,
    options: InitOptions = {}
): Promise<CommandResult> {
    ensureNotCancelled(context);

    const args = ['init'];
    if (options.force) {
        args.push('--force');
    }

    const { stdout } = await context.binaryManager.execute(args, context.workspaceRoot);
    ensureNotCancelled(context);

    context.logger.info('Init command completed.');

    return {
        command: 'init',
        ok: true,
        message: 'Baseline configuration generated.',
        metrics: createEmptyMetrics(),
        rawOutput: stdout,
    };
}
