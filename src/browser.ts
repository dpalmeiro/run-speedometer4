import { spawn, spawnSync, ChildProcess } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';

export type BrowserName = 'firefox' | 'chrome';

export interface BrowserHandle {
  close(): Promise<void>;
  exited: Promise<never>;
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
  'layout.frame_rate': 60,
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

  // Poll until Firefox has a visible window, then bring it to the front.
  // For benchmark, proc.pid IS Firefox. For profile, proc.pid is the bash
  // wrapper and we need to walk bash → samply → firefox.
  for (let attempt = 0; attempt < 25; attempt++) {
    await new Promise<void>((resolve) => setTimeout(resolve, 200));

    let targetPid = pid;
    for (let depth = 0; depth < 3; depth++) {
      const { stdout } = spawnSync('pgrep', ['-P', String(targetPid)]);
      const children = stdout.toString().trim().split('\n').filter(Boolean);
      if (children.length !== 1) break;
      targetPid = parseInt(children[0]);
    }

    const { stdout: winOut } = spawnSync('osascript', [
      '-e',
      `tell application "System Events" to get count of windows of (first process whose unix id is ${targetPid})`,
    ]);
    if (parseInt(winOut.toString().trim()) > 0) {
      spawn('osascript', [
        '-e',
        `tell application "System Events" to set frontmost of first process whose unix id is ${targetPid} to true`,
      ]).unref();
      return;
    }
  }
}

function waitForExit(proc: ChildProcess, timeoutMs: number): Promise<void> {
  return Promise.race([
    new Promise<void>((resolve) => {
      proc.once('exit', () => resolve());
      proc.once('error', () => resolve());
    }),
    new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
  ]);
}

export async function launchBrowser(
  browserName: BrowserName,
  binaryPath: string,
  url: string,
  samplyOutput?: string,
): Promise<BrowserHandle> {
  const profileDir = mkdtempSync(join(tmpdir(), 'claudometer-'));

  let proc: ChildProcess;

  if (browserName === 'firefox') {
    writeFirefoxUserJs(profileDir);
    proc = spawn(binaryPath, ['-no-remote', '-profile', profileDir, url], {
      detached: false,
      stdio: ['ignore', 'ignore', 'pipe'],
      env: { ...process.env, MOZ_ENABLE_WAYLAND: '0' },
    });
  } else {
    proc = spawn(binaryPath, [
      `--user-data-dir=${profileDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      url,
    ], {
      detached: false,
      stdio: ['ignore', 'ignore', 'pipe'],
    });
  }

  const stderrChunks: Buffer[] = [];
  const verbose = !!process.env.LUMIX_VERBOSE;
  proc.stderr?.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk);
    if (verbose) process.stderr.write(chunk);
  });

  let intentionalClose = false;
  let processExited = false;
  const exited = new Promise<never>((_, reject) => {
    proc.once('exit', (code) => {
      processExited = true;
      if (intentionalClose) return;
      const stderr = Buffer.concat(stderrChunks).toString().trim();
      const firstLine = stderr.split('\n').find((l) => l.trim()) ?? '';
      const detail = firstLine ? `: ${firstLine}` : '';
      reject(new Error(`Browser exited with code ${code}${detail}`));
    });
    proc.once('error', (err) => {
      processExited = true;
      if (!intentionalClose) reject(err);
    });
  });

  proc.unref();
  if (proc.pid) activateOnMac(proc.pid);

  let samplyProc: ChildProcess | undefined;
  if (samplyOutput && proc.pid) {
    // Give Firefox a moment to initialize before attaching samply
    await new Promise<void>((resolve) => setTimeout(resolve, 2000));
    samplyProc = spawn('samply', [
      'record', '--save-only', '-o', samplyOutput, '-p', String(proc.pid),
    ], {
      detached: false,
      stdio: 'ignore',
    });
    samplyProc.unref();
  }

  return {
    exited,
    close: async () => {
      intentionalClose = true;
      // Kill Firefox; samply (attached via -p) will detect the exit and save automatically.
      try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      if (!processExited) await waitForExit(proc, 30_000);

      // Wait for samply to finish writing the profile (up to 60s for large profiles).
      if (samplyProc) {
        await waitForExit(samplyProc, 60_000);
      }

      try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
