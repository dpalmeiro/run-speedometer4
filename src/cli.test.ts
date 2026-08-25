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

  it('"run" has --firefox option', () => {
    const run = program.commands.find((c) => c.name() === 'run');
    expect(run).toBeDefined();
    const optionNames = run!.options.map((o) => o.long);
    expect(optionNames).toContain('--firefox');
  });

  it('"run" has --chrome option', () => {
    const run = program.commands.find((c) => c.name() === 'run');
    const optionNames = run!.options.map((o) => o.long);
    expect(optionNames).toContain('--chrome');
  });

  it('"run" does not expose an iteration override', () => {
    const run = program.commands.find((c) => c.name() === 'run');
    const optionNames = run!.options.map((o) => o.long);
    expect(optionNames).not.toContain('--iterations');
  });

  it('"run" has an opt-in Chrome sandbox override', () => {
    const run = program.commands.find((c) => c.name() === 'run');
    const optionNames = run!.options.map((o) => o.long);
    expect(optionNames).toContain('--disable-chrome-sandbox');
  });
});
