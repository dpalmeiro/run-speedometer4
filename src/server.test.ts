import { describe, it, expect } from 'vitest';
import { extractScore, startServer, type ReportPayload } from './server.js';

function makePayload(scores: number[]): ReportPayload {
  return {
    'Speedometer-3': {
      metrics: {
        Score: { current: [scores] },
      },
    },
  };
}

describe('extractScore', () => {
  it('returns mean of scores rounded to 2 decimal places', () => {
    expect(extractScore(makePayload([100, 110, 120]))).toBe(110);
  });

  it('returns single score unchanged', () => {
    expect(extractScore(makePayload([44.12]))).toBe(44.12);
  });

  it('rounds to 2 decimal places', () => {
    expect(extractScore(makePayload([1, 2, 3]))).toBe(2);
  });

  it('throws on empty scores array', () => {
    expect(() => extractScore(makePayload([]))).toThrow('No scores');
  });
});

describe('startServer — /report and /shutdown', () => {
  it('resolves waitForReport with posted payload', async () => {
    const server = await startServer();
    const url = `http://127.0.0.1:${server.port}`;

    const payload = makePayload([50, 60]);
    const postDone = fetch(`${url}/report`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });

    const result = await server.waitForReport();
    await postDone;

    expect(result['Speedometer-3'].metrics.Score.current[0]).toEqual([50, 60]);
    server.close();
  });

  it('serves index.html at /', async () => {
    const server = await startServer();
    const res = await fetch(`http://127.0.0.1:${server.port}/`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<!DOCTYPE html>');
    expect(text).toContain('<script src="/run-speedometer-client.mjs" type="module"></script>');
    server.close();
  });

  it('serves the benchmark reporting integration', async () => {
    const server = await startServer();
    const res = await fetch(`http://127.0.0.1:${server.port}/run-speedometer-client.mjs`);

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/javascript');
    expect(await res.text()).toContain("fetch('/report'");
    server.close();
  });

  it('serves index.html with query string (/?iterationCount=3)', async () => {
    const server = await startServer();
    const res = await fetch(`http://127.0.0.1:${server.port}/?iterationCount=3`);
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain('<!DOCTYPE html>');
    server.close();
  });

  it('returns 404 for unknown paths', async () => {
    const server = await startServer();
    const res = await fetch(`http://127.0.0.1:${server.port}/does-not-exist.xyz`);
    expect(res.status).toBe(404);
    server.close();
  });
});
