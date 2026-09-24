import { describe, expect, it } from 'vitest';
import { iterationsForSuite, selectionParam } from './run.js';

describe('iterationsForSuite', () => {
  it('uses 10 iterations for full runs', () => {
    expect(iterationsForSuite()).toBe(10);
  });

  it('uses 100 iterations for subtests', () => {
    expect(iterationsForSuite('NewsSite-Nuxt')).toBe(100);
  });
});

describe('selectionParam', () => {
  it('selects Speedometer 4 workloads by default', () => {
    expect(selectionParam()).toBe('&tags=sp4');
  });

  it('selects an individual suite without a tags parameter', () => {
    expect(selectionParam('NewsSite-Nuxt')).toBe('&suites=NewsSite-Nuxt');
  });

  it('supports multiple explicit tags', () => {
    expect(selectionParam(undefined, 'default, experimental')).toBe('&tags=default,experimental');
  });

  it('rejects combining a suite with tags', () => {
    expect(() => selectionParam('NewsSite-Nuxt', 'experimental'))
      .toThrow('--suite and --tags cannot be used together');
  });
});
