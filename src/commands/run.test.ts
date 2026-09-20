import { describe, expect, it } from 'vitest';
import { iterationsForSuite } from './run.js';

describe('iterationsForSuite', () => {
  it('uses 10 iterations for full runs', () => {
    expect(iterationsForSuite()).toBe(10);
  });

  it('uses 100 iterations for subtests', () => {
    expect(iterationsForSuite('NewsSite-Nuxt')).toBe(100);
  });
});
