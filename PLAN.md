# run-speedometer4

Speedometer 4 test runner for lumix. Serves Speedometer locally, launches a browser, waits
for the benchmark to finish, and prints `{ "score": <number> }` to stdout.

---

## Architecture

```
run-speedometer4/
├── speedometer/           # Speedometer 4 source submodule
├── src/
│   ├── cli.ts             # entry point
│   ├── program.ts         # commander program
│   ├── server.ts          # HTTP server: static files + /report + /shutdown
│   ├── browser.ts         # Playwright browser launcher
│   └── commands/
│       └── run.ts         # run-speedometer4 run [options]
└── package.json
```

## Usage

```
run-speedometer4 --firefox /path/to/firefox
```

Or via env var:

```
BROWSER_BINARY=/path/to/firefox run-speedometer4
```

## Output

```json
{ "score": 44.1 }
```

## lumix test case JSON

```json
{
  "name": "speedometer4",
  "unit": "score",
  "higher_is_better": true,
  "command": ["run-speedometer4"],
  "browsers": ["firefox"],
  "binary": { "type": "arg", "flag": "--binary" }
}
```

## How it works

1. `startServer()` binds to a random port on 127.0.0.1
2. Serves the `speedometer/` directory as static files
3. Browser navigates to `http://127.0.0.1:<port>/?iterationCount=<n>`
4. XHR patch auto-clicks start after 10 seconds
5. After last iteration, patch POSTs results JSON to `/report`
6. Server resolves `waitForReport()` with the payload
7. Score is extracted (mean of per-iteration scores) and printed as JSON
8. Browser and server are closed

## Status

- [x] Project scaffold
- [x] server.ts — static file server + /report + /shutdown
- [x] browser.ts — Playwright launcher for firefox/chrome
- [x] commands/run.ts — wire it all together
- [x] Tests: 12 passing (cli.test.ts, server.test.ts)
