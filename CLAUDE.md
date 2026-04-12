# run-speedometer

Automated Speedometer 3 benchmark runner. Serves the benchmark locally, launches a browser, waits for results, and outputs `{ "score": <number> }` to stdout as JSON.

## Build & test

```bash
npm run setup       # after cloning: init submodule, install, build, link
npm run build       # compile TypeScript
npm run dev         # watch mode
npm test            # run tests
```

## Usage

```bash
run-speedometer --firefox <path> [--iterations 10] [--suite <name>]
run-speedometer --chrome <path>  [--iterations 10] [--suite <name>]
```

`--suite` filters to a single Speedometer 3 suite (e.g. `NewsSite-Nuxt`, `Perf-Dashboard`). Without it, all suites run.

On macOS, pass `.app` bundles — the browser launcher handles them directly via `spawn`.

## Key files

- `src/server.ts` — HTTP server that serves `speedometer/` and receives results via `POST /report`
- `src/browser.ts` — launches Firefox or Chrome with a clean temp profile
- `src/commands/run.ts` — CLI action: starts server, launches browser, races report vs browser exit
- `speedometer/` — Speedometer 3 submodule (WebKit/Speedometer, branch release/3.1)
- `configs/` — lumix test case JSON files for each SP3 suite

## How it works

1. Binds an HTTP server to a random localhost port
2. Launches the browser pointing at `http://127.0.0.1:<port>/?iterationCount=N&startAutomatically`
3. A patch in `speedometer/resources/benchmark-runner.mjs` hooks `didFinishLastIteration()` and POSTs results to `/report`
4. Server extracts the mean score and the CLI prints `{ "score": <number> }`

## Configs

`configs/` contains lumix test case definitions. Reference them with:

```bash
lumix benchmark ~/src/run-speedometer/configs/sp3-full.json --firefox /path/to/firefox
```
