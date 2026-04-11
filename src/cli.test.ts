import { describe, it, expect } from 'vitest';
import { program } from './program.js';

describe('CLI', () => {
  it('registers "run" command', () => {
    const names = program.commands.map((c) => c.name());
    expect(names).toContain('run');
  });

  it('version is 0.1.0', () => {
    expect(program.version()).toBe('0.1.0');
  });

  it('"run" has --binary option', () => {
    const run = program.commands.find((c) => c.name() === 'run');
    expect(run).toBeDefined();
    const optionNames = run!.options.map((o) => o.long);
    expect(optionNames).toContain('--binary');
  });

  it('"run" has --browser option', () => {
    const run = program.commands.find((c) => c.name() === 'run');
    const optionNames = run!.options.map((o) => o.long);
    expect(optionNames).toContain('--browser');
  });

  it('"run" has --iterations option', () => {
    const run = program.commands.find((c) => c.name() === 'run');
    const optionNames = run!.options.map((o) => o.long);
    expect(optionNames).toContain('--iterations');
  });
});
