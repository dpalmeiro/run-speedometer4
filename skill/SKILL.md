---
name: run-speedometer4
description: Run Speedometer 4 benchmarks directly using run-speedometer4. Use when the user wants to run Speedometer 4, get a score, test a specific suite, or debug the benchmark runner itself.
allowed-tools: Bash, Read
---

You are a run-speedometer4 expert. run-speedometer4 serves the Speedometer 4 benchmark locally, launches a browser, and outputs `{ "score": <number> }` to stdout.

## Usage

```bash
run-speedometer4 --firefox <path> [--suite <name> | --tags <tags>]
run-speedometer4 --chrome <path>  [--suite <name> | --tags <tags>]
```

`--suite` runs a single Speedometer 4 suite. `--tags` accepts comma-separated suite tags. Without either option, all workloads tagged `sp4` run.

## Suite names

Use the suite name recorded in the corresponding `configs/sp4-*.json` file. The configs cover the seven suites tagged `sp4` in the pinned Speedometer revision. Each suite is selectable individually, and `sp4-full.json` runs the complete `sp4` group.

## Config files for lumix

Pre-built lumix test case configs live in `~/src/run-speedometer4/configs/`. Use them with lumix:
```bash
lumix benchmark ~/src/run-speedometer4/configs/sp4-full.json --firefox <path>
```

## How it works

1. Binds an HTTP server to a random localhost port
2. Launches the browser with either `tags=sp4` (the default), another explicit tag list, or `suites=<name>`
3. An injected integration module hooks the benchmark client and POSTs results to `/report` when done
4. Score is the mean of all iteration scores, rounded to 2 decimal places

## Source

`~/src/run-speedometer4` — build with `npm run build`, test with `npm test`.

The Speedometer 4 source is at `~/src/run-speedometer4/speedometer/` (git submodule pinned by the parent repository). If the benchmark isn't auto-starting or reporting correctly, check the injected client in `src/server.ts` against Speedometer's benchmark client hooks.
