import { Command } from 'commander';
import { startServer, extractScore } from '../server.js';
import { launchBrowser, type BrowserName } from '../browser.js';

export function runCommand(): Command {
  return new Command('run')
    .description('Run Speedometer3 and output score as JSON')
    .option('--binary <path>', 'Path to browser binary (or set BROWSER_BINARY env var)')
    .option('--browser <name>', 'Browser to use: firefox or chrome', 'firefox')
    .option('--iterations <n>', 'Number of SP3 iterations', '10')
    .action(async (opts) => {
      const binary: string = opts.binary ?? process.env.BROWSER_BINARY ?? '';
      if (!binary) {
        console.error(JSON.stringify({ error: 'No binary specified. Use --binary or BROWSER_BINARY env var.' }));
        process.exit(1);
      }

      const browserName = opts.browser as BrowserName;
      if (browserName !== 'firefox' && browserName !== 'chrome') {
        console.error(JSON.stringify({ error: `Unsupported browser: ${opts.browser}` }));
        process.exit(1);
      }

      const iterations = parseInt(opts.iterations, 10);
      if (isNaN(iterations) || iterations < 1) {
        console.error(JSON.stringify({ error: `Invalid iterations: ${opts.iterations}` }));
        process.exit(1);
      }

      let server;
      let browser;
      let exitCode = 0;
      try {
        server = await startServer();
        const url = `http://127.0.0.1:${server.port}/?iterationCount=${iterations}`;
        browser = await launchBrowser(browserName, binary, url);

        const payload = await server.waitForReport();
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
