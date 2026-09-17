import { spawn, spawnSync, ChildProcess } from 'child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { dirname, join } from 'path';

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
  if (proc.exitCode !== null || proc.signalCode !== null) {
    return Promise.resolve();
  }
  return new Promise<void>((resolve) => {
    let interval: NodeJS.Timeout;
    let timeout: NodeJS.Timeout;
    const finish = () => {
      clearInterval(interval);
      clearTimeout(timeout);
      proc.off('exit', finish);
      proc.off('error', finish);
      resolve();
    };
    proc.once('exit', finish);
    proc.once('error', finish);
    interval = setInterval(() => {
      if (!proc.pid) {
        finish();
        return;
      }
      try {
        process.kill(proc.pid, 0);
      } catch {
        finish();
      }
    }, 100);
    timeout = setTimeout(finish, timeoutMs);
  });
}

export function chromeBrowserArgs(
  profileDir: string,
  url: string,
  enableJitProfile: boolean,
  disableSandbox = false,
): string[] {
  return [
    `--user-data-dir=${profileDir}`,
    '--no-first-run',
    '--no-default-browser-check',
    ...(disableSandbox ? ['--no-sandbox'] : []),
    ...(enableJitProfile ? [
      '--js-flags=--perf-prof --perf-prof-unwinding-info --interpreted-frames-native-stack',
    ] : []),
    url,
  ];
}

export function samplyRecordArgs(
  binaryPath: string,
  browserArgs: string[],
  outputPath: string,
): string[] {
  return [
    'record',
    '--save-only',
    '--jit-markers',
    '--presymbolicate',
    '-o', outputPath,
    '--', binaryPath, ...browserArgs,
  ];
}

export async function launchBrowser(
  browserName: BrowserName,
  binaryPath: string,
  url: string,
  samplyOutput?: string,
  verbose?: boolean,
  disableChromeSandbox = false,
): Promise<BrowserHandle> {
  const profileDir = mkdtempSync(join(tmpdir(), 'run-speedometer4-'));

  let browserArgs: string[];
  let browserEnv = process.env;

  if (browserName === 'firefox') {
    writeFirefoxUserJs(profileDir);
    browserArgs = ['-no-remote', '-profile', profileDir, url];
    browserEnv = { ...process.env, MOZ_ENABLE_WAYLAND: '0' };
    if (samplyOutput) {
      browserEnv.IONPERF = 'func';
      browserEnv.PERF_SPEW_DIR = dirname(samplyOutput);
      browserEnv.MOZ_USE_PERFORMANCE_MARKER_FILE = '1';
      browserEnv.MOZ_PERFORMANCE_MARKER_DIR = profileDir;
      browserEnv.MOZ_DISABLE_CONTENT_SANDBOX = '1';
    }
  } else {
    const enableJitProfile = !!samplyOutput || process.env.RUN_SPEEDOMETER_JIT_PROFILE === '1';
    browserArgs = chromeBrowserArgs(profileDir, url, enableJitProfile, disableChromeSandbox);
  }

  const wrapWithSamply = !!samplyOutput;
  const command = wrapWithSamply ? 'samply' : binaryPath;
  const commandArgs = wrapWithSamply
    ? samplyRecordArgs(binaryPath, browserArgs, samplyOutput)
    : browserArgs;
  const proc = spawn(command, commandArgs, {
    detached: wrapWithSamply,
    stdio: ['ignore', 'ignore', 'pipe'],
    env: browserEnv,
  });

  const stderrChunks: Buffer[] = [];
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

  if (proc.pid) activateOnMac(proc.pid);

  return {
    exited,
    close: async () => {
      intentionalClose = true;
      if (wrapWithSamply) {
        if (!processExited && proc.pid) {
          try { process.kill(-proc.pid, 'SIGINT'); } catch { /* already dead */ }
        }
      } else {
        try { proc.kill('SIGTERM'); } catch { /* already dead */ }
      }
      if (!processExited) await waitForExit(proc, wrapWithSamply ? 300_000 : 30_000);

      try { rmSync(profileDir, { recursive: true, force: true }); } catch { /* ignore */ }
    },
  };
}
