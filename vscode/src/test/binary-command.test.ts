import test from 'node:test';
import assert from 'node:assert/strict';
import { cargoSubcommandCommand, commandFromBinaryPath, composeArgs, formatCommandForLog } from '../binary-command';

test('builds command line for npm ai-fdocs binary detection', () => {
    const command = commandFromBinaryPath('ai-fdocs');
    const cliArgs = composeArgs(command, ['sync', '--format', 'json']);

    assert.equal(command.executable, 'ai-fdocs');
    assert.deepEqual(command.baseArgs, []);
    assert.deepEqual(cliArgs, ['sync', '--format', 'json']);
    assert.equal(formatCommandForLog(command, ['sync', '--format', 'json']), 'ai-fdocs sync --format json');
});

test('builds command line for cargo-ai-fdocs binary detection', () => {
    const command = commandFromBinaryPath('cargo-ai-fdocs');
    const cliArgs = composeArgs(command, ['status']);

    assert.equal(command.executable, 'cargo-ai-fdocs');
    assert.deepEqual(command.baseArgs, []);
    assert.deepEqual(cliArgs, ['status']);
    assert.equal(formatCommandForLog(command, ['status']), 'cargo-ai-fdocs status');
});

test('builds command line for cargo subcommand detection', () => {
    const command = cargoSubcommandCommand();
    const cliArgs = composeArgs(command, ['check', '--strict']);

    assert.equal(command.executable, 'cargo');
    assert.deepEqual(command.baseArgs, ['ai-fdocs']);
    assert.deepEqual(cliArgs, ['ai-fdocs', 'check', '--strict']);
    assert.equal(formatCommandForLog(command, ['check', '--strict']), 'cargo ai-fdocs check --strict');
});
