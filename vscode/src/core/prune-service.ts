import { CommandContext, CommandResult, createEmptyMetrics, ensureNotCancelled } from './command-types';

export async function runPruneCommand(context: CommandContext): Promise<CommandResult> {
    ensureNotCancelled(context);

    const { stdout } = await context.executor.execute(['prune'], context.workspaceRoot);
    ensureNotCancelled(context);

    return {
        command: 'prune',
        ok: true,
        message: 'Outdated artifacts removed.',
        metrics: createEmptyMetrics(),
        rawOutput: stdout,
    };
}
