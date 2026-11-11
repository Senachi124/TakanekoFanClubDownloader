# AI Contributor Guidelines

These instructions apply to the entire repository. This is a public source repository; all additions and changes must be suitable for public disclosure.

## Project Scope

- Maintain Takaneko Fanclub Downloader, a local Electron desktop application for downloading posts, blogs, galleries, and movies and browsing saved content.
- Keep application code under `src/`. Desktop installers, bundled media tools, packaging scripts, and CI are also in scope.
- Keep the architecture local to the desktop application. Do not introduce hosted services or infrastructure unless explicitly requested.
- The app currently targets Takaneko Fanclub. Do not assume compatibility with other FaveConnect sites.

## Repository Map

- `README.md`, `README.ja.md`: user documentation in Traditional Chinese and Japanese.
- `docs/`: developer documentation for API/IPC contracts, application architecture, core processing, and interaction flows.
- `package.json`: Electron entry point, dependencies, npm commands, and packaging configuration.
- `src/main/main.js`: application startup, login, and token capture.
- `src/main/preload.js`: the renderer's allowlisted IPC bridge.
- `src/main/desktopV2.js`: desktop settings, download controls, and Reader operations.
- `src/main/downloadJob.js`, `src/main/api/`: download jobs, exporters, and the archive engine.
- `src/main/api/takaneko/`: Fanclub API configuration, shared JSON client, and notification/blog/gallery/movie endpoints.
- `src/main/utils/`: network, concurrency, media tools, cookies, and download error handling.
- `src/main/archiveActions.js`: saving posts and original media to another location.
- `src/main/local-reader/`: archive scanning and reading; its `README.md` defines supported formats.
- `src/renderer/`, `src/shared/`: UI, styles, shared helpers, and translations.
- `test/`, `tests/`: regression tests, both included by `npm test`.
- `scripts/`, `.github/workflows/build.yml`: desktop smoke tests, bundled tool preparation, packaging checks, and release builds.

## Implementation Guidelines

- Follow the existing JavaScript and CommonJS conventions. Keep changes focused and avoid unrelated formatting or dependency changes.
- Keep filesystem access, credentials, downloads, and external tool execution in the main process. Expose renderer operations through the explicit preload allowlist and validate IPC inputs in the main process.
- Keep Fanclub API origins, endpoint paths, and JSON requests in `src/main/api/takaneko/`. Download orchestration and exporters should call its resource modules rather than construct API URLs or duplicate request helpers.
- Preserve pause, resume, cancellation, retry, and progress behavior when changing downloads. Write the `.post-id` completion marker only after a successful download.
- The Reader supports completed download folders with `index.md` and `.post-id`, and app-generated saved posts with `record.json` schema v2. Consult the Reader documentation before changing these formats; legacy records and external catalogs are unsupported.
- Reader indexing stays in memory and must not modify source files. Preserve path and symlink containment checks, missing-media handling, and clearing stale results when the source cannot be read.
- Saving a post or media file copies it to the selected destination without changing the source. Changing the download location must not move existing files.
- Display publication times in JST (UTC+9), using a 24-hour clock in both UI languages. Missing or invalid publication dates remain unknown; do not substitute the current time or filesystem timestamps.
- Keep Traditional Chinese and Japanese UI text aligned. Update both README language versions when documented behavior changes.
- Preserve the app ID and user-data compatibility unless a migration is explicitly part of the task.

## Development and Validation

Use Node.js 22 and npm, matching CI:

```sh
npm ci
npm start
npm test
npm run check:release
```

- Run relevant regression tests for behavior changes. A single test file can be run with `node tests/<name>.test.js` or `node test/<name>.test.js`; run `npm test` and `npm run check:release` before completing code or packaging changes.
- For UI or Electron integration changes, run `npm run test:desktop` in an environment that can launch Electron. Report any checks that could not run and why.
- Build Windows packages with `npm run build:win`. Build macOS packages with `npm run build:mac`, optionally using `-- --x64` or `-- --arm64`, on the corresponding platform.
- For packaging changes, validate built artifacts with `node scripts/check-release.js --packages`. Actual bundled tool execution must be checked on the target platform and architecture.
- Keep bundled tool versions, checksums, architecture checks, and license files consistent when updating media tools.
- Documentation-only changes need a diff and accuracy review; application tests are unnecessary unless executable behavior also changes.

## Privacy and Public Contributions

- Never add credentials, tokens, cookies, private keys, account details, member-only content, personal archives, or private machine configuration to the repository, including ignored files and fixtures.
- Use synthetic content and placeholder paths in tests and documentation. Keep private operational records outside the repository; do not copy them from other workspaces or tool output.
- Keep authentication data in the application's user-data storage and out of logs, exported archives, and release packages.
- Before committing, inspect the diff and new files for sensitive data and unintended generated artifacts. If existing sensitive material is found, identify affected files without repeating its values; do not rewrite Git history without explicit instruction.
