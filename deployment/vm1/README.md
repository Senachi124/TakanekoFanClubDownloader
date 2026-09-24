# VM1 Takaneko Fanclub Archive

Based on upstream `main` at `f3c7d99` (2026-09-24). Deployment follows VM `/opt/AGENTS.md`, read on that date.

## Access and layout

- Public URL: **https://vm1.learnfromidol.com:2083/**; also registered in the VM1 service directory.
- Private HTTP: `127.0.0.1:43130`. Dedicated nginx process; existing nginx, ME LINK and Instagram services are not reconfigured or restarted.
- Release: `/opt/takaneko/releases/<revision>`; active symlink `/opt/takaneko/current`.
- Worker: `takanekowork`; reader/web: `takanekoweb`. Only the worker belongs to `vm1-backup`. The web process uses `vm1-media-readers` and has read-only filesystem access to completed originals.
- PostgreSQL: `vm1_backup`, application schema `takaneko`. Worker role `svc_takaneko` owns its tables; web role `svc_takaneko_web` can read the catalog and update only settings/jobs. Both roles are provisioned through `vm1-backup-admin` for catalog-backup grants. Web has no access to helper resource/transfer tables.
- Original files: `/var/lib/takaneko/complete`; incomplete downloads: `/var/lib/takaneko/staging` (worker only).
- Fanclub login import: `/var/lib/takaneko-control/session.json` (0640). Cookies and refresh tokens are never returned through the API or included in PostgreSQL dumps, source code or process arguments. Legacy `/var/lib/takaneko-control/token` is accepted for migration.
- Web admin password: `/etc/takaneko/admin-password` (root 0600); password hash `/etc/takaneko/auth.json`. Retrieve over SSH with `sudo cat /etc/takaneko/admin-password`. Treat it as a secret.

## Installation / update

Create a release archive containing `package.json`, `package-lock.json`, `src/`, `server/`, `deployment/`, `tests/`, `README.md`; exclude credentials, `.git`, `node_modules`, exported content and `deployment-access.txt`.

```sh
sudo mkdir -p /opt/takaneko/releases/REVISION
sudo tar -xzf takaneko-release.tar.gz -C /opt/takaneko/releases/REVISION
sudo bash /opt/takaneko/releases/REVISION/deployment/vm1/install.sh
```

The installer uses Node 22+ and Ubuntu packages (`npm`, `ffmpeg` already installed on vm1, `yt-dlp`, `python3-pil`, `python3-psycopg`), production-only npm dependencies, isolated service users, the existing domain certificate, UFW port 2083, and the existing portal's documented registration interface. `NEEDRESTART_MODE=l` prevents package installation from restarting unrelated services. Check that ports 2083 and 43130 are free before first installation. Updates restart this application's services only; finish/cancel active downloads first.

Desktop concurrency and web settings accept **1–100**, default **5**. The old 32/50 discrepancy is removed. VM video conversions have a separate two-process queue to fit the host's RAM/CPU. No bandwidth cap is imposed. Authentication throttling is independent from download concurrency.

## Storage and backup

Each post/blog has a stable helper resource key `takaneko:<kind>:<source-id>:v1`. Claim precedes downloading, long downloads renew the lease, and failures release it. Completed output is renamed atomically into an immutable content-hash version. Publication creates metadata and image thumbnails before making it visible. The catalog tracks SHA-256, bytes, MIME, image dimensions, owner/private permission, variants and independent VM/NAS availability.

`takaneko-nas.timer` runs **03:15, 03:45, 04:15, 04:45, 05:15, 05:45 Asia/Hong_Kong**. Missed windows do not trigger daytime uploads. Each transfer uses the shared helper's verification/locking; only successful `nas_verified` output publishes NAS availability. Retries use the same version/key. All completed local originals remain on VM; this deployment does **not** authorize or implement automatic original deletion.

Media routes authenticate on every request, serve local completed files first, and fall back to the shared NAS read-only account over the helper's certificate-pinned HTTPS transport. Local/NAS paths remain private. Both sources support GET/HEAD, Range, Content-Length and SHA-256 ETags. No additional disk cache is allocated: VM's existing 5 GiB cache budget is already assigned to other services. NAS reads are streamed with two concurrent slots.

New downloads pause below 5 GiB free space; in-flight downloads finish. NAS transfer errors block new jobs until a successful retry. Failed staging is retained for diagnosis; no automatic deletion of original/failed files or historical NAS versions. Stop/pause prevents scheduling new items while already-running items finish. Re-running skips cataloged resources; interrupted claim-to-catalog transitions reconcile through helper claims after stale leases expire. Source updates require an explicit new version key; the default archives the first successfully captured source ID.

No shared ME LINK private media socket or other service's DB credentials are reused. The current web reader is isolated and uses the common NAS transport; it does not claim to provide a VM-wide unified media API. NAS backup is one verified NAS copy plus retained VM originals, not an independent second NAS backup.

## Operations / rollback

```sh
systemctl status takaneko takaneko-web takaneko-https takaneko-nas.timer
journalctl -u takaneko -u takaneko-web -u takaneko-nas -n 80 --no-pager
systemctl list-timers takaneko-nas.timer takaneko-tls-reload.timer
sudo systemctl start takaneko-nas.service # explicit manual transfer/retry
```

TLS is reused from `/etc/letsencrypt/live/vm1.learnfromidol.com/`; a dedicated timer reloads only `takaneko-https.service` daily. To roll back application code, point `/opt/takaneko/current` to a retained compatible release and restart these three application services. Do not drop the schema, delete archives, or roll back another service.

## Verification

```sh
node tests/server.test.js
python3 -m unittest discover -s tests -p 'test_*.py'
sudo python3 deployment/vm1/verify.py
```

The integration check logs in with the protected admin secret, verifies CSRF and authentication boundaries, checks settings at 100, inserts a temporary synthetic catalog fixture, verifies complete/partial/conditional media responses, and removes that fixture afterwards. `--nas` additionally sends this synthetic fixture through the real helper and tests NAS GET/HEAD/Range using the read-only account; the helper audit and NAS fixture remain, local/catalog test data are removed.

Real Fanclub download verification requires a current membership login. The browser UI accepts Netscape cookies.txt, cookie-export JSON, and Playwright-style storageState JSON. Only official Fanclub domains are retained. The current official site stores `refreshToken` in localStorage/sessionStorage and calls `POST https://api.takanekofc.com/auth/refresh`; cookies-only exports may therefore be insufficient. The UI includes a copyable browser export command for the logged-in official site that creates `takaneko-login.json` including the refresh token. Import validates the refreshed access token against `/auth/notifications/count` before replacing the previous session. The worker renews its in-memory access token periodically and before expiration. No password is requested for the Fanclub account; the separate management password protects this private web app.

Verified on 2026-09-24: JavaScript adapter/concurrency/video queue tests, Python cookie parsing/range/path/worker tests, real login/CSRF/settings checks, local and NAS media streaming, and HTTPS reachability. Existing desktop tokens expired on 2026-09-08; a fresh browser login export is required before a real Fanclub archive job can run.
