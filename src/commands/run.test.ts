import { describe, expect, it } from 'vitest';
import { resolveIterations } from './run.js';

describe('resolveIterations', () => {
  it('defaults full runs to 10 iterations', () => {
    expect(resolveIterations(undefined)).toBe(10);
  });

  it('defaults subtests to 100 iterations', () => {
    expect(resolveIterations(undefined, 'NewsSite-Nuxt')).toBe(100);
  });

  it('accepts the full-run minimum', () => {
    expect(resolveIterations('10')).toBe(10);
  });

  it('rejects full runs below 10 iterations', () => {
    expect(() => resolveIterations('9')).toThrow('Full runs require at least 10 iterations');
  });

  it('accepts the subtest minimum', () => {
    expect(resolveIterations('100', 'NewsSite-Nuxt')).toBe(100);
  });

  it('rejects subtests below 100 iterations', () => {
    expect(() => resolveIterations('99', 'NewsSite-Nuxt')).toThrow('Subtests require at least 100 iterations');
  });

  it('rejects non-integer values', () => {
    expect(() => resolveIterations('10.5')).toThrow('Full runs require at least 10 iterations');
  });
});
