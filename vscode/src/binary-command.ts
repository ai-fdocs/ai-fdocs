export interface BinaryCommand {
    executable: string;
    baseArgs: string[];
}

export function commandFromBinaryPath(binaryPath: string): BinaryCommand {
    return {
        executable: binaryPath,
        baseArgs: [],
    };
}

export function cargoSubcommandCommand(): BinaryCommand {
    return {
        executable: 'cargo',
        baseArgs: ['ai-fdocs'],
    };
}

export function composeArgs(command: BinaryCommand, args: string[]): string[] {
    return [...command.baseArgs, ...args];
}

export function formatCommandForLog(command: BinaryCommand, args: string[]): string {
    return [command.executable, ...composeArgs(command, args)].join(' ');
}
