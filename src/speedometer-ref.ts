import { execFileSync } from 'child_process';
import { existsSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const ROOT_DIR = join(fileURLToPath(import.meta.url), '../..');
export const DEFAULT_SPEEDOMETER_DIR = join(ROOT_DIR, 'speedometer');
export const SPEEDOMETER_REFS_DIR = join(ROOT_DIR, 'speedometer-refs');

export type GitRunner = (cwd: string, args: string[]) => string;

const runGit: GitRunner = (cwd, args) =>
  execFileSync('git', ['-C', cwd, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();

export function isValidSpeedometerRef(ref: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._/-]{0,199}$/.test(ref)
    && !ref.includes('..')
    && !ref.endsWith('/')
    && !ref.endsWith('.lock');
}

export function isCommitId(ref: string): boolean {
  return /^[0-9a-f]{40}$/i.test(ref);
}

export function speedometerRefDir(ref: string, refsDir = SPEEDOMETER_REFS_DIR): string {
  return join(refsDir, ref.replace(/[^A-Za-z0-9._-]/g, '_'));
}

/**
 * Returns the Speedometer checkout to serve: the bundled submodule, or a
 * worktree of the submodule's repository detached at `ref` (a branch name or
 * commit ID from mozilla/Speedometer). A commit ID that is already checked out
 * is reused without touching the network, so pinned configs stay reproducible.
 */
export function resolveSpeedometerDir(
  ref?: string,
  opts: { git?: GitRunner; exists?: (path: string) => boolean; baseDir?: string; refsDir?: string } = {},
): string {
  const git = opts.git ?? runGit;
  const exists = opts.exists ?? existsSync;
  const baseDir = opts.baseDir ?? DEFAULT_SPEEDOMETER_DIR;
  const trimmed = ref?.trim();
  if (!trimmed) return baseDir;
  if (!isValidSpeedometerRef(trimmed)) throw new Error(`Invalid --speedometer-ref: ${trimmed}`);

  const dir = speedometerRefDir(trimmed, opts.refsDir);
  if (isCommitId(trimmed) && exists(dir) && git(dir, ['rev-parse', 'HEAD']).toLowerCase() === trimmed.toLowerCase()) {
    return dir;
  }

  git(baseDir, ['fetch', '--quiet', 'origin', trimmed]);
  const commit = git(baseDir, ['rev-parse', 'FETCH_HEAD^{commit}']);
  if (exists(dir)) {
    git(dir, ['checkout', '--quiet', '--detach', '--force', commit]);
  } else {
    git(baseDir, ['worktree', 'prune']);
    git(baseDir, ['worktree', 'add', '--quiet', '--detach', '--force', dir, commit]);
  }
  const checkedOut = git(dir, ['rev-parse', 'HEAD']);
  if (checkedOut !== commit) throw new Error(`Speedometer checkout for ${trimmed} is at ${checkedOut}, expected ${commit}`);
  return dir;
}
