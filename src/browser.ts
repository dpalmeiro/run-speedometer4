import { spawn, ChildProcess } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type BrowserName = 'firefox' | 'chrome';

export interface BrowserHandle {
  close(): Promise<void>;
}

// Minimal prefs to suppress first-run UI and dialogs without altering benchmark behaviour.
const FIREFOX_PREFS: Record<string, boolean | number | string> = {
  'browser.EULA.override': true,
  'browser.sessionstore.resume_from_crash': false,
  'browser.shell.checkDefaultBrowser': false,
  'browser.warnOnQuit': false,
  'datareporting.policy.dataSubmissionPolicyBypassNotification': true,
  'network.captive-portal-service.enabled': false,
  'startup.homepage_welcome_url': '',
  'startup.homepage_welcome_url.additional': '',
  'trailhead.firstrun.branches': 'join',
};

function writeFirefoxUserJs(profileDir: string): void {
  const lines = Object.entries(FIREFOX_PREFS).map(([key, val]) => {
    const jsVal = typeof val === 'string' ? JSON.stringify(val) : String(val);
    return `user_pref(${JSON.stringify(key)}, ${jsVal});`;
  });
  writeFileSync(join(profileDir, 'user.js'), lines.join('\n') + '\n');
}

async function activateOnMac(pid: number): Promise<void> {
  if (process.platform !== 'darwin') return;
  await new Promise<void>((resolve) => setTimeout(resolve, 2000));
  spawn('osascript', [
    '-e',
    `tell application "System Events" to set frontmost of first process whose unix id is ${pid} to true`,
  ]).unref();
}

export async function launchBrowser(
  browserName: BrowserName,
  binaryPath: string,
  url: string
): Promise<BrowserHandle> {
  const profileDir = mkdtempSync(join(tmpdir(), 'claudometer-'));

  let proc: ChildProcess;

  if (browserName === 'firefox') {
    writeFirefoxUserJs(profileDir);
    proc = spawn(binaryPath, ['-no-remote', '-profile', profileDir, url], {
      detached: false,
      stdio: 'ignore',
    });
  } else {
    proc = spawn(binaryPath, [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      url,
    ], {
      detached: false,
      stdio: 'ignore',
    });
  }

  proc.unref();
  if (proc.pid) activateOnMac(proc.pid);

  return {
    close: async () => {
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
