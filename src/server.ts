import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createReadStream, existsSync, readFileSync, statSync } from 'fs';
import { join, extname } from 'path';
import { DEFAULT_SPEEDOMETER_DIR } from './speedometer-ref.js';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
  '.wasm': 'application/wasm',
};

const CLIENT_PATH = '/run-speedometer4-client.mjs';
const CLIENT_SCRIPT = `
const client = globalThis.benchmarkClient;
if (!client) throw new Error('Speedometer benchmark client was not initialized');

const willStartFirstIteration = client.willStartFirstIteration.bind(client);
client.willStartFirstIteration = async (...args) => {
  await fetch('/started', { method: 'POST' });
  return willStartFirstIteration(...args);
};

const didFinishLastIteration = client.didFinishLastIteration.bind(client);
client.didFinishLastIteration = async (metrics, ...args) => {
  didFinishLastIteration(metrics, ...args);
  const scores = metrics?.Score?.values;
  if (!Array.isArray(scores) || scores.length === 0)
    throw new Error('Speedometer did not produce score values');
  await fetch('/report', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      'Speedometer-4': { metrics: { Score: { current: [scores] }, breakdown: metrics } },
    }),
  });
};
`;

export interface ReportPayload {
  'Speedometer-4': {
    metrics: {
      Score: { current: number[][] };
      breakdown?: Record<string, SerializedMetric>;
    };
  };
}

export interface SerializedMetric {
  name?: string;
  unit?: string;
  values?: number[];
  mean?: number;
}

export interface BenchmarkBreakdownEntry {
  suite_id: string;
  subtest_id: string;
  label: string;
  unit: string;
  higher_is_better: boolean;
  samples: number[];
  mean: number;
  stddev: number;
}

export interface BenchmarkResult {
  score: number;
  breakdown: BenchmarkBreakdownEntry[];
}

const REPORT_TIMEOUT_MS = 20 * 60 * 1000;

export interface ServerHandle {
  port: number;
  waitForReport(): Promise<ReportPayload>;
  close(): void;
}

export function startServer(opts: { verbose?: boolean; root?: string } = {}): Promise<ServerHandle> {
  const { verbose = false, root = DEFAULT_SPEEDOMETER_DIR } = opts;
  return new Promise((resolve, reject) => {
    let reportResolve: ((payload: ReportPayload) => void) | null = null;
    let reportReject: ((err: Error) => void) | null = null;
    const reportPromise = new Promise<ReportPayload>((res, rej) => {
      reportResolve = res;
      reportReject = rej;
    });

    // eslint-disable-next-line prefer-const
    let server: ReturnType<typeof createServer>;

    const timeout = setTimeout(() => {
      reportReject!(new Error('Timed out after 20 minutes waiting for benchmark report'));
      server.close();
    }, REPORT_TIMEOUT_MS);

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '/';

      if (req.method === 'GET' && url === CLIENT_PATH) {
        res.writeHead(200, { 'Content-Type': 'application/javascript' });
        res.end(CLIENT_SCRIPT);
        return;
      }

      if (req.method === 'POST' && url === '/started') {
        if (verbose) process.stdout.write(`[run-speedometer4] benchmark started\n`);
        res.writeHead(200);
        res.end('{}');
        return;
      }

      if (req.method === 'POST' && url === '/report') {
        let body = '';
        req.on('data', (chunk) => { body += chunk; });
        req.on('end', () => {
          try {
            const payload = JSON.parse(body) as ReportPayload;
            clearTimeout(timeout);
            res.writeHead(200, { 'Content-Type': 'application/json' });
            res.end('{}');
            if (verbose) process.stdout.write(`[run-speedometer4] report received\n`);
            reportResolve!(payload);
          } catch (e) {
            clearTimeout(timeout);
            res.writeHead(400);
            res.end('Bad JSON');
            reportReject!(new Error(`Invalid report payload: ${e}`));
          }
        });
        return;
      }

      if (req.method === 'GET' && url === '/shutdown') {
        res.writeHead(200);
        res.end('ok');
        server.close();
        return;
      }

      const pathname = url.split('?')[0];
      const filePath = pathname === '/' ? '/index.html' : pathname;
      const fullPath = join(root, filePath);

      let resolvedPath = fullPath;
      if (existsSync(fullPath) && statSync(fullPath).isDirectory()) {
        resolvedPath = join(fullPath, 'index.html');
      }
      if (!existsSync(resolvedPath)) {
        res.writeHead(404);
        res.end('Not found');
        return;
      }

      const mime = MIME[extname(resolvedPath)] ?? 'application/octet-stream';
      res.writeHead(200, { 'Content-Type': mime });
      if (resolvedPath === join(root, 'index.html')) {
        const html = readFileSync(resolvedPath, 'utf8').replace(
          '</head>',
          `        <script src="${CLIENT_PATH}" type="module"></script>\n    </head>`,
        );
        res.end(html);
        return;
      }
      createReadStream(resolvedPath).pipe(res);
    });

    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      if (!addr || typeof addr === 'string') {
        reject(new Error('Failed to get server address'));
        return;
      }
      resolve({
        port: addr.port,
        waitForReport: () => reportPromise,
        close: () => { clearTimeout(timeout); server.close(); },
      });
    });
  });
}

export function extractScore(payload: ReportPayload): number {
  const scores = payload['Speedometer-4'].metrics.Score.current[0];
  if (!scores || scores.length === 0) throw new Error('No scores in report payload');
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(mean * 100) / 100;
}

function stableId(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

function standardDeviation(values: number[], mean: number): number {
  if (values.length < 2) return 0;
  const variance = values.reduce((sum, value) => sum + ((value - mean) ** 2), 0) / values.length;
  return Math.sqrt(variance);
}

export function extractBreakdown(payload: ReportPayload): BenchmarkBreakdownEntry[] {
  const metrics = payload['Speedometer-4'].metrics.breakdown ?? {};
  const ignored = new Set(['Score', 'Geomean', 'Prepare']);
  return Object.entries(metrics).flatMap(([key, metric]) => {
    const name = metric.name || key;
    if (ignored.has(name) || name.startsWith('Iteration-')) return [];
    const samples = Array.isArray(metric.values)
      ? metric.values.filter((value): value is number => Number.isFinite(value))
      : [];
    if (!samples.length) return [];
    const segments = name.split('/').filter(Boolean);
    if (segments.length > 2) return [];
    const suite = segments[0] || name;
    const subtest = segments.slice(1).join('/') || '__total__';
    const mean = Number.isFinite(metric.mean)
      ? metric.mean!
      : samples.reduce((sum, value) => sum + value, 0) / samples.length;
    return [{
      suite_id: stableId(suite),
      subtest_id: subtest === '__total__' ? subtest : stableId(subtest),
      label: name,
      unit: metric.unit || 'ms',
      higher_is_better: false,
      samples,
      mean,
      stddev: standardDeviation(samples, mean),
    }];
  });
}

export function extractResult(payload: ReportPayload): BenchmarkResult {
  return { score: extractScore(payload), breakdown: extractBreakdown(payload) };
}
