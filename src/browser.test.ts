import { describe, expect, it } from 'vitest';
import { chromeBrowserArgs, samplyRecordArgs } from './browser.js';

describe('chromeBrowserArgs', () => {
  it('keeps the Chrome sandbox enabled by default', () => {
    const args = chromeBrowserArgs('/tmp/profile', 'http://localhost/', false);

    expect(args).not.toContain('--no-sandbox');
  });

  it('disables the Chrome sandbox only when explicitly requested', () => {
    const args = chromeBrowserArgs('/tmp/profile', 'http://localhost/', false, true);

    expect(args).toContain('--no-sandbox');
  });
});

describe('samplyRecordArgs', () => {
  it('presymbolicates and records until the browser is closed', () => {
    const args = samplyRecordArgs('/path/to/firefox', ['--profile', '/tmp/profile'], '/tmp/profile.json.gz');

    expect(args).toContain('--presymbolicate');
    expect(args).not.toContain('--duration');
    expect(args).toEqual(expect.arrayContaining([
      '-o', '/tmp/profile.json.gz', '--', '/path/to/firefox', '--profile', '/tmp/profile',
    ]));
  });
});
