# run-speedometer4

Automated Speedometer 4 benchmark runner. Serves the benchmark locally, launches a browser, waits for results, and outputs `{ "score": <number> }` to stdout as JSON.

## Build & test

```bash
npm run setup       # after cloning: init submodule, install, build, link
npm run build       # compile TypeScript
npm run dev         # watch mode
npm test            # run tests
```

## Usage

```bash
run-speedometer4 --firefox <path> [--suite <name> | --tags <tags>]
run-speedometer4 --chrome <path>  [--suite <name> | --tags <tags>]
```

`--suite` filters to a single Speedometer 4 suite (e.g. `ChatRoom-React`). `--tags` accepts a comma-separated tag list. Without either option, the workloads tagged `sp4` run.

On macOS, pass `.app` bundles — the browser launcher handles them directly via `spawn`.

## Key files

- `src/server.ts` — HTTP server that serves `speedometer/` and receives results via `POST /report`
- `src/browser.ts` — launches Firefox or Chrome with a clean temp profile
- `src/commands/run.ts` — CLI action: starts server, launches browser, races report vs browser exit
- `speedometer/` — Speedometer 4 submodule (Mozilla's `sp4-exp` branch, pinned commit recorded by this repo)
- `configs/` — one lumix test case JSON file for each of the seven `sp4`-tagged suites, plus the complete `sp4` workload group

## How it works

1. Binds an HTTP server to a random localhost port
2. Launches the browser pointing at `http://127.0.0.1:<port>/?iterationCount=N&startAutomatically&tags=sp4` by default
3. The server injects a small integration module that hooks `didFinishLastIteration()` and POSTs results to `/report`
4. Server extracts the mean score and the CLI prints `{ "score": <number> }`

## Configs

`configs/` contains lumix test case definitions. Reference them with:

```bash
lumix benchmark ~/src/run-speedometer4/configs/sp4-full.json --firefox /path/to/firefox
```

`sp4-full.json` runs all workloads tagged `sp4`. Individual suite configs select their suite explicitly.
