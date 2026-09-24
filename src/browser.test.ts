import { describe, expect, it } from 'vitest';
import { chromeBrowserArgs, resolveBrowserBinary, samplyRecordArgs } from './browser.js';

describe('resolveBrowserBinary', () => {
  it('resolves a Firefox macOS application bundle', () => {
    expect(resolveBrowserBinary('firefox', '/Applications/Firefox.app', 'darwin'))
      .toBe('/Applications/Firefox.app/Contents/MacOS/firefox');
  });

  it('resolves a Chrome macOS application bundle', () => {
    expect(resolveBrowserBinary('chrome', '/Applications/Google Chrome.app/', 'darwin'))
      .toBe('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome');
  });

  it('leaves executable paths unchanged', () => {
    expect(resolveBrowserBinary('firefox', '/usr/bin/firefox', 'linux')).toBe('/usr/bin/firefox');
  });
});

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
