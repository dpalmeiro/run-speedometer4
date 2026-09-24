import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const rootDir = join(fileURLToPath(import.meta.url), '../..');
const configsDir = join(rootDir, 'configs');

function suiteNamesWithTagFrom(relativePath: string, wantedTag: string): string[] {
  const source = readFileSync(join(rootDir, relativePath), 'utf8');
  const suiteNames: string[] = [];
  let currentName: string | undefined;

  for (const line of source.split('\n')) {
    const nameMatch = line.match(/^\s+name: "([^"]+)",$/);
    if (nameMatch) currentName = nameMatch[1];

    const tagsMatch = line.match(/^\s+tags: \[([^\]]+)\],$/);
    if (!tagsMatch || !currentName) continue;
    const tags = [...tagsMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1]);
    if (tags.includes(wantedTag)) suiteNames.push(currentName);
  }

  return suiteNames;
}

describe('Speedometer 4 configs', () => {
  it('runs the Speedometer 4 workloads in the full config', () => {
    const config = JSON.parse(readFileSync(join(configsDir, 'sp4-full.json'), 'utf8'));
    expect(config.ci_test_suite).toBe('speedometer-experimental');
    expect(config.command).toEqual(['run-speedometer4', '--tags', 'sp4']);
    expect(config.modes.profile.command).toEqual(['run-speedometer4', '--tags', 'sp4']);
  });

  it('has one subtest config for each of the seven sp4-tagged suites', () => {
    const suiteNames = suiteNamesWithTagFrom(
      'speedometer/suites-experimental/suites.mjs',
      'sp4',
    ).sort();

    const configuredSuiteNames = readdirSync(configsDir)
      .filter((file) => file.startsWith('sp4-') && file.endsWith('.json') && file !== 'sp4-full.json')
      .map((file) => JSON.parse(readFileSync(join(configsDir, file), 'utf8')).command[2] as string)
      .sort();

    expect(suiteNames).toHaveLength(7);
    expect(configuredSuiteNames).toEqual(suiteNames);
  });

  it('selects the experimental Firefox CI test for every sp4 subtest', () => {
    for (const file of readdirSync(configsDir)) {
      if (!file.startsWith('sp4-') || !file.endsWith('.json') || file === 'sp4-full.json') continue;
      const config = JSON.parse(readFileSync(join(configsDir, file), 'utf8'));
      expect(config.ci_test_suite, file).toBe('speedometer-experimental');
    }
  });
});
