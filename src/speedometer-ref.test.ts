import { describe, expect, it } from 'vitest';
import { isValidSpeedometerRef, resolveSpeedometerDir, speedometerRefDir } from './speedometer-ref.js';

const COMMIT = 'd32c74199fcf59ba57108e7fd196e48bc7f4721e';

function fakeGit(head: Record<string, string>, fetched = COMMIT) {
  const calls: string[] = [];
  const git = (cwd: string, args: string[]) => {
    calls.push(`${cwd}: ${args.join(' ')}`);
    if (args[0] === 'rev-parse' && args[1] === 'FETCH_HEAD^{commit}') return fetched;
    if (args[0] === 'rev-parse') return head[cwd] ?? '';
    if (args[0] === 'worktree' && args[1] === 'add') head[args[5]] = args[6];
    if (args[0] === 'checkout') head[cwd] = args[4];
    return '';
  };
  return { git, calls };
}

describe('resolveSpeedometerDir', () => {
  const opts = { baseDir: '/runner/speedometer', refsDir: '/runner/speedometer-refs' };

  it('serves the bundled checkout without a ref', () => {
    expect(resolveSpeedometerDir(undefined, opts)).toBe('/runner/speedometer');
    expect(resolveSpeedometerDir('  ', opts)).toBe('/runner/speedometer');
  });

  it('rejects refs that are not plain branch names or commit IDs', () => {
    for (const ref of ['../escape', '-flag', 'a b', 'branch/', 'x.lock']) {
      expect(isValidSpeedometerRef(ref), ref).toBe(false);
      expect(() => resolveSpeedometerDir(ref, opts)).toThrow('Invalid --speedometer-ref');
    }
  });

  it('fetches a ref into a new worktree on first use', () => {
    const { git, calls } = fakeGit({});
    const dir = resolveSpeedometerDir(COMMIT, { ...opts, git, exists: () => false });
    expect(dir).toBe(`/runner/speedometer-refs/${COMMIT}`);
    expect(calls).toContain(`/runner/speedometer: fetch --quiet origin ${COMMIT}`);
    expect(calls).toContain(`/runner/speedometer: worktree add --quiet --detach --force ${dir} ${COMMIT}`);
  });

  it('reuses a pinned commit that is already checked out without fetching', () => {
    const dir = speedometerRefDir(COMMIT, opts.refsDir);
    const { git, calls } = fakeGit({ [dir]: COMMIT });
    expect(resolveSpeedometerDir(COMMIT, { ...opts, git, exists: (path) => path === dir })).toBe(dir);
    expect(calls.some((call) => call.includes('fetch'))).toBe(false);
  });

  it('moves an existing branch checkout to the latest fetched commit', () => {
    const dir = speedometerRefDir('chatroom-svelte', opts.refsDir);
    const { git, calls } = fakeGit({ [dir]: 'old' }, COMMIT);
    expect(resolveSpeedometerDir('chatroom-svelte', { ...opts, git, exists: (path) => path === dir })).toBe(dir);
    expect(calls).toContain(`${dir}: checkout --quiet --detach --force ${COMMIT}`);
  });
});
