import { createServer, IncomingMessage, ServerResponse } from 'http';
import { createReadStream, existsSync, statSync } from 'fs';
import { join, extname } from 'path';
import { fileURLToPath } from 'url';

const MIME: Record<string, string> = {
  '.html': 'text/html',
  '.js':   'application/javascript',
  '.mjs':  'application/javascript',
  '.css':  'text/css',
  '.png':  'image/png',
  '.json': 'application/json',
  '.svg':  'image/svg+xml',
};

const SP3_DIR = join(fileURLToPath(import.meta.url), '../../speedometer');

export interface ReportPayload {
  'Speedometer-3': {
    metrics: {
      Score: { current: number[][] };
    };
  };
}

const REPORT_TIMEOUT_MS = 20 * 60 * 1000;

export interface ServerHandle {
  port: number;
  waitForReport(): Promise<ReportPayload>;
  close(): void;
}

export function startServer(opts: { verbose?: boolean } = {}): Promise<ServerHandle> {
  const { verbose = false } = opts;
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
      reportReject!(new Error('Timed out after 2 minutes waiting for benchmark report'));
      server.close();
    }, REPORT_TIMEOUT_MS);

    server = createServer((req: IncomingMessage, res: ServerResponse) => {
      const url = req.url ?? '/';

      if (req.method === 'POST' && url === '/started') {
        if (verbose) process.stdout.write(`[run-speedometer] benchmark started\n`);
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
            if (verbose) process.stdout.write(`[run-speedometer] report received\n`);
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
      const fullPath = join(SP3_DIR, filePath);

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
  const scores = payload['Speedometer-3'].metrics.Score.current[0];
  if (!scores || scores.length === 0) throw new Error('No scores in report payload');
  const mean = scores.reduce((a, b) => a + b, 0) / scores.length;
  return Math.round(mean * 100) / 100;
}
