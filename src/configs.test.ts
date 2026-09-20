import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';

const rootDir = join(fileURLToPath(import.meta.url), '../..');
const configsDir = join(rootDir, 'configs');

function suiteNamesFrom(relativePath: string): string[] {
  const source = readFileSync(join(rootDir, relativePath), 'utf8');
  return [...source.matchAll(/^ {8}name: "([^"]+)",$/gm)].map((match) => match[1]);
}

describe('Speedometer 4 configs', () => {
  it('runs the experimental workloads in the full config', () => {
    const config = JSON.parse(readFileSync(join(configsDir, 'sp4-full.json'), 'utf8'));
    expect(config.ci_test_suite).toBe('speedometer-experimental');
    expect(config.command).toEqual(['run-speedometer4', '--tags', 'experimental']);
    expect(config.modes.profile.command).toEqual(['run-speedometer4', '--tags', 'experimental']);
  });

  it('has one config for every selectable suite', () => {
    const suiteNames = [
      ...suiteNamesFrom('speedometer/suites/default-suites.mjs'),
      ...suiteNamesFrom('speedometer/suites-experimental/suites.mjs'),
    ].sort();

    const configuredSuiteNames = readdirSync(configsDir)
      .filter((file) => file.startsWith('sp4-') && file.endsWith('.json') && file !== 'sp4-full.json')
      .map((file) => JSON.parse(readFileSync(join(configsDir, file), 'utf8')).command[2] as string)
      .sort();

    expect(configuredSuiteNames).toEqual(suiteNames);
  });

  it('selects the matching Firefox CI test for each suite', () => {
    const experimentalSuiteNames = new Set(
      suiteNamesFrom('speedometer/suites-experimental/suites.mjs'),
    );

    for (const file of readdirSync(configsDir)) {
      if (!file.startsWith('sp4-') || !file.endsWith('.json') || file === 'sp4-full.json') continue;
      const config = JSON.parse(readFileSync(join(configsDir, file), 'utf8'));
      const suiteName = config.command[2] as string;
      const expectedCiTest = experimentalSuiteNames.has(suiteName)
        ? 'speedometer-experimental'
        : 'speedometer3';
      expect(config.ci_test_suite, file).toBe(expectedCiTest);
    }
  });
});
