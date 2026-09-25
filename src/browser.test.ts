import { describe, expect, it } from 'vitest';
import { browserSpawnInvocation, chromeBrowserArgs, firefoxBrowserArgs, resolveBrowserBinary, samplyRecordArgs, windowsCloseBrowserScript } from './browser.js';

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

describe('firefoxBrowserArgs', () => {
  it('waits for the handed-off browser process on Windows', () => {
    expect(firefoxBrowserArgs('C:\\Temp\\profile', 'http://localhost/', 'win32'))
      .toEqual(['-wait-for-browser', '-no-remote', '-profile', 'C:\\Temp\\profile', 'http://localhost/']);
  });

  it('does not add the Windows launcher flag on other platforms', () => {
    expect(firefoxBrowserArgs('/tmp/profile', 'http://localhost/', 'linux'))
      .toEqual(['-no-remote', '-profile', '/tmp/profile', 'http://localhost/']);
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

describe('browserSpawnInvocation', () => {
  it('runs Windows command wrappers through cmd.exe', () => {
    const invocation = browserSpawnInvocation(
      'C:\\Temp\\wrapper.cmd',
      ['-profile', 'C:\\Temp\\profile', 'http://127.0.0.1/?a=1&b=2'],
      'win32',
    );
    expect(invocation.command).toBe(process.env.ComSpec || 'cmd.exe');
    expect(invocation.args.slice(0, 3)).toEqual(['/d', '/s', '/c']);
    expect(invocation.args[3]).toContain('wrapper.cmd');
    expect(invocation.args[3]).toContain('^&');
    expect(invocation.windowsVerbatimArguments).toBe(true);
  });

  it('spawns native executables directly', () => {
    expect(browserSpawnInvocation('/usr/bin/firefox', ['-profile', '/tmp/profile'], 'linux'))
      .toEqual({ command: '/usr/bin/firefox', args: ['-profile', '/tmp/profile'] });
  });
});

describe('windowsCloseBrowserScript', () => {
  it('closes visible matching browser windows in the current session', () => {
    const script = windowsCloseBrowserScript('firefox.exe');
    expect(script).toContain('$targetProcessName = "firefox.exe"');
    expect(script).toContain('$_.SessionId -eq $sessionId');
    expect(script).toContain('$target.CloseMainWindow()');
    expect(script).not.toContain('Get-CimInstance');
    expect(script).not.toContain('Stop-Process');
  });
});
