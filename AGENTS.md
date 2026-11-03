# AI Contributor Guidelines

These instructions apply to the entire repository. This is a public source repository; all additions and changes must be suitable for public disclosure.

## Project Scope

- Develop and maintain the local Electron desktop application: its UI, downloads, settings, and local archive Reader.
- Keep application code under `src/`, including the Reader in `src/main/local-reader/`.
- Do not add server applications, hosted web interfaces, database services, remote backup workers, server deployment templates, or infrastructure configuration unless the user explicitly changes this scope.
- Reading an archive on an already mounted NAS is a local filesystem feature and remains supported. It does not require a server or a remote backup service.
- Desktop installers, packaging scripts, and CI checks for the desktop application remain in scope.

## Private Deployment Information and Operational Records

- Do not add, extend, or copy private server deployment information or operational records belonging to the author or other users into this repository. This applies to source code, comments, documentation, `docs/`, `AGENTS.md`, test fixtures, configuration, scripts, and generated reports. Do not use the repository to store private records, even in files excluded by `.gitignore`.
- Private information includes actual server IP addresses and domains, SSH connection details, accounts, private service topology, absolute deployment/data/NAS/backup paths, and host-specific configuration, deployment timestamps, running versions, operational history, validation output, incident records, and rollback receipts. Never write passwords, tokens, cookies, private keys, or other credentials into the repository.
- When private deployment records must be saved, use a private location outside the repository designated by the maintainer. If no location has been designated, do not create temporary records inside the repository; ask for a destination only when the task actually requires saving them.
- Do not copy private information from home-level instructions, other workspaces, machine configuration, or tool output into this repository. If external instructions require recording actual deployment details, keep those details in private operational documentation outside the repository.
- Existing private deployment content is not permission to continue recording or copying it. When found, identify only the affected files and information categories; do not repeat actual values in new documentation, commit messages, or PR descriptions. Clean up as requested by the user, and do not rewrite Git history on your own initiative.

## Public Documentation

- Document the desktop architecture, local setup, settings, archive formats, packaging, and tests that do not depend on private environments. Server deployment documentation is outside this repository's scope.
- Use explicit placeholders such as `example.com`, `<SERVER_HOST>`, `<DEPLOY_ROOT>`, and `<NAS_ROOT>`, or synthetic data, in examples. Do not populate examples with private values taken from real environments.
- Keep general usage and validation instructions separate from records of actions on a particular machine. Do not record the author's private installation or operational history.
- Before committing, review changes and new files for private deployment information, credentials, and output from real environments. `.gitignore` does not remove information from tracked files or existing Git history.

## Where to Start Reading

- `README.md`, `package.json`: features, the desktop entry point, and development and build commands.
- `src/main/main.js`, `src/main/preload.js`, `src/main/desktopV2.js`: Electron startup, communication between the UI and main process, and download/Reader operations.
- `src/renderer/`, `src/shared/`: the desktop UI, reusable UI helpers, styles, and translations.
- `src/main/downloadJob.js`, `src/main/api/archiveEngine.js`: desktop download jobs and the download engine.
- `src/main/local-reader/`: the local Reader and supported archive and catalog formats.
- `test/`, `tests/`: behavior examples and regression tests.
- `scripts/`, `.github/workflows/build.yml`: desktop smoke checks, packaging validation, and release builds.
