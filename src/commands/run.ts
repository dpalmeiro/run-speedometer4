import { Command } from 'commander';
import { startServer, extractScore } from '../server.js';
import { launchBrowser, type BrowserName } from '../browser.js';

export function runCommand(): Command {
  return new Command('run')
    .description('Run Speedometer3 and output score as JSON')
    .option('--firefox <path>', 'Path to Firefox binary (or BROWSER_BINARY env var)')
    .option('--chrome <path>', 'Path to Chrome binary (or BROWSER_BINARY env var)')
    .option('--iterations <n>', 'Number of SP3 iterations', '10')
    .option('--suite <name>', 'Run a single SP3 suite (e.g. NewsSite-Nuxt)')
    .option('--samply <output>', 'Record a samply profile and save to this path')
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

      const iterations = parseInt(opts.iterations, 10);
      if (isNaN(iterations) || iterations < 1) {
        console.error(JSON.stringify({ error: `Invalid iterations: ${opts.iterations}` }));
        process.exit(1);
      }

      const verbose: boolean = !!opts.verbose;

      let server;
      let browser;
      let exitCode = 0;
      try {
        server = await startServer({ verbose });
        const suiteParam = opts.suite ? `&suites=${encodeURIComponent(opts.suite)}` : '';
        const url = `http://127.0.0.1:${server.port}/?iterationCount=${iterations}&startAutomatically${suiteParam}`;
        if (verbose) process.stdout.write(`[run-speedometer] launching ${browserName}: ${url}\n`);
        browser = await launchBrowser(browserName, binary, url, opts.samply, verbose);

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
