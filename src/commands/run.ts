import { Command } from 'commander';
import { startServer, extractScore } from '../server.js';
import { launchBrowser, type BrowserName } from '../browser.js';

export function iterationsForSuite(suite?: string): number {
  return suite ? 100 : 10;
}

export function selectionParam(suite?: string, tags?: string): string {
  const selectedSuite = suite?.trim();
  const selectedTags = tags?.split(',').map((tag) => tag.trim()).filter(Boolean);
  if (selectedSuite && selectedTags?.length) {
    throw new Error('--suite and --tags cannot be used together');
  }
  if (selectedSuite) return `&suites=${encodeURIComponent(selectedSuite)}`;

  const effectiveTags = selectedTags?.length ? selectedTags : ['sp4'];
  return `&tags=${effectiveTags.map(encodeURIComponent).join(',')}`;
}

export function runCommand(): Command {
  return new Command('run')
    .description('Run Speedometer 4 and output score as JSON')
    .option('--firefox <path>', 'Path to Firefox binary (or BROWSER_BINARY env var)')
    .option('--chrome <path>', 'Path to Chrome binary (or BROWSER_BINARY env var)')
    .option('--suite <name>', 'Run a single Speedometer 4 suite (e.g. NewsSite-Nuxt)')
    .option('--tags <tags>', 'Comma-separated Speedometer 4 suite tags (defaults to sp4)')
    .option('--samply <output>', 'Record a samply profile and save to this path')
    .option('--disable-chrome-sandbox', 'Launch Chrome with --no-sandbox')
    .option('--verbose', 'Print progress updates to stdout')
    .action(async (opts) => {
      let binary: string;
      let browserName: BrowserName;

      if (opts.firefox) {
        binary = opts.firefox;
        browserName = 'firefox';
      } else if (opts.chrome) {
        binary = opts.chrome;
        browserName = 'chrome';
      } else {
        binary = process.env.BROWSER_BINARY ?? '';
        browserName = 'firefox';
      }

      if (!binary) {
        console.error(JSON.stringify({ error: 'No binary specified. Use --firefox, --chrome, or BROWSER_BINARY env var.' }));
        process.exit(1);
      }

      const iterations = iterationsForSuite(opts.suite);

      const verbose: boolean = !!opts.verbose;

      let server;
      let browser;
      let exitCode = 0;
      try {
        server = await startServer({ verbose });
        const selection = selectionParam(opts.suite, opts.tags);
        const url = `http://127.0.0.1:${server.port}/?iterationCount=${iterations}&startAutomatically${selection}`;
        if (verbose) process.stdout.write(`[run-speedometer4] launching ${browserName}: ${url}\n`);
        browser = await launchBrowser(
          browserName,
          binary,
          url,
          opts.samply,
          verbose,
          !!opts.disableChromeSandbox,
        );

        const payload = await Promise.race([server.waitForReport(), browser.exited]);
        const score = extractScore(payload);
        console.log(JSON.stringify({ score }));
      } catch (e) {
        console.error(JSON.stringify({ error: (e as Error).message }));
        exitCode = 1;
      } finally {
        await browser?.close();
        server?.close();
      }
      process.exit(exitCode);
    });
}
