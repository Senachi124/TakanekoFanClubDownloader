# VM1 Takaneko Fanclub Archive

Based on upstream `main` at `f3c7d99` (2026-09-24). Deployment follows VM `/opt/AGENTS.md`, read on that date.

## Access and layout

- Public URL: **https://vm1.learnfromidol.com:2083/**; also registered in the VM1 service directory.
- Downloads/login/schedules: `/downloads`; private collection: `/browse`. Cookies can be pasted as a `Cookie: name=value; ...` header, JSON, or Netscape text, or uploaded as a file. An optional refreshToken field supports cookies exports missing the official site's localStorage login data.
- `/browse` uses member buttons like the desktop gallery; the first member is selected by default. Each member's posts are ordered by publication date descending, with stable resource-key ties and 48 items per page. Dates display in Japan time. New downloads use the source date from the export metadata, with capture time only as a fallback when it is absent/invalid.
- `/library` is the separate multimedia library with the same member selection/date order, image/video filters, prebuilt image thumbnails, original-image viewing and video playback. Navigation between collection pages keeps the selected member. The viewer supports previous/next media within the current page and opening the parent post. Only cataloged, available originals are included; thumbnails and zero-byte media are not separate items. Video cards use a play placeholder when no thumbnail exists.
- Verify catalog member isolation, tied-date pagination, filters, thumbnail matching and authentication with `sudo python3 deployment/vm1/verify-library.py` on the deployed release. The script removes its own temporary metadata in `finally` and does not create NAS files.
- When upgrading older catalogs, run `sudo -u takanekowork -g takaneko-read python3 server/repair_post_dates.py --apply` once. This idempotently corrects post timestamps using stored `**Date**` metadata (Japan time), including older VM captures and desktop folder timestamps from a different local timezone. Missing/invalid source dates retain their existing fallback. Media files, storage locations and deduplication keys stay intact.
- Private HTTP: `127.0.0.1:43130`. Dedicated nginx process; existing nginx, ME LINK and Instagram services are not reconfigured or restarted.
- Release: `/opt/takaneko/releases/<revision>`; active symlink `/opt/takaneko/current`.
- Worker: `takanekowork`; reader/web: `takanekoweb`. Only the worker belongs to `vm1-backup`. The web process uses `vm1-media-readers` and has read-only filesystem access to completed originals.
- PostgreSQL: `vm1_backup`, application schema `takaneko`. Worker role `svc_takaneko` owns its tables; web role `svc_takaneko_web` can read the catalog and update only settings/jobs. Both roles are provisioned through `vm1-backup-admin` for catalog-backup grants. Web has no access to helper resource/transfer tables.
- Readable VM archive: `/var/lib/takaneko/complete/members/<member>/<posts|blogs>/<Japan publication date>/<time>_<title>__<identity>-v<version>/`. Each post has `index.md` for reading and `record.json` with full source identity, hashes and VM/NAS locations; locally saved originals and prebuilt thumbnails retain their filenames under `files/`. Missing publication dates use `unknown-date`. Incomplete downloads remain under `/var/lib/takaneko/staging` (worker only).
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

## Automatic backups

`takaneko-auto.timer` checks every five minutes and queues a download when due. Default: enabled, every six hours. The download page can disable it or choose 1–168 hours. Missing login data, another active download, NAS transfer failure, or less than 5 GiB free space postpones the run; existing work is not interrupted. Schedule state persists in PostgreSQL and prevents duplicate concurrent jobs. The worker skips verified NAS originals before fetching their details. Nightly VM-to-NAS transfer remains a separate timer with its existing Hong Kong overnight window.

## Import an existing desktop collection

`backup_desktop.py` copies to a new `takaneko/desktop-imports/<snapshot>` NAS directory via an existing authenticated SMB session. It reads unusual Windows filenames through extended paths (the NAS may normalize trailing-dot directory names), never overwrites different existing data, writes temporary files before publication, and verifies every final NAS file with SHA-256. Source files remain untouched. A source manifest and completion receipt are saved outside Git. `--resume` requires the original manifest and rechecks any existing destination files.

`desktop-imports` is an archival backup only. The running application never serves files from that layout. `build-desktop-catalog.py` prepares an NDJSON catalog, a canonical media manifest and 480px thumbnails. After the raw backup verifies, `publish-desktop-media.py --bundle BUNDLE_DIRECTORY` copies its post files into the application's immutable `takaneko/media/<resource-hash>/<version>/` layout using native Windows SMB copying, and verifies each final file with SHA-256. It leaves the raw backup intact and writes a separate receipt under `takaneko/import-receipts/` only when the canonical publication finishes.

For the user's requested migration without retaining a raw NAS copy, run `publish-desktop-media.py --bundle BUNDLE_DIRECTORY --move --source-manifest ORIGINAL_MANIFEST`. This moves NAS staging files into the formal layout and checks each destination against the original manifest. It tolerates NAS-normalized legacy folder names only after matching content hashes. Repeated gallery copies are removed only when an identical canonical file has verified; unmatched unique files are moved without adding catalog posts or download markers, allowing the VM service to fetch their actual posts later. Task scratch files and empty staging directories are removed after successful verification. Windows source files are not moved or deleted. The canonical receipt records `backup_retained=false`; the browser uses only the canonical media paths. A raw completion receipt is unnecessary in move mode because every moved destination is verified against the original source manifest.

Transfer only the catalog and thumbnails to VM, then run `sudo python3 server/import_desktop.py BUNDLE_DIRECTORY`. The importer verifies the canonical publication receipt, both manifest identities, thumbnail hashes and catalog hash before committing the catalog. Originals are served from the formal NAS media layout; thumbnails are readable on VM and queued for the nightly helper transfer to `takaneko/thumbnails/<snapshot>`. Thumbnail NAS availability remains false until that transfer verifies successfully. Existing `.post-id` values become the same resource keys used by the downloader. Posts missing a completion ID are browseable legacy records, without falsely suppressing future downloads of their unknown source IDs. Duplicate IDs are indexed once.

This explicit desktop import uses the user's local SMB access and full SHA-256 verification instead of round-tripping 12 GiB through VM. It records the verification in `desktop_imports`; it never fabricates or modifies helper `resources`/`transfer_runs` records. The ongoing service continues using the shared VM backup helper for newly downloaded content.

## Storage and backup

The readable layout follows the member/category organization of VM1's existing Instagram archive and the author/date/index separation documented by ME LINK. Files under `files/` remain immutable. Generated `index.md` / `record.json` sidecars sit outside the helper's source directory, so refreshing metadata never changes an already registered backup manifest. NAS-only desktop imports get readable text and location records on VM without downloading all their originals. Their thumbnails remain in the existing shared batch, referenced by `local_path` in each record.

Upgrade an existing VM catalog while this application's download/transfer jobs are idle:

```sh
sudo systemctl stop takaneko-auto.timer takaneko-nas.timer takaneko.service takaneko-web.service
sudo -u takanekowork -g takaneko-read python3 server/migrate_archive_layout.py --apply --verify
sudo systemctl start takaneko.service takaneko-web.service takaneko-auto.timer takaneko-nas.timer
```

Check `takaneko-nas.service` and `takaneko-auto.service` are inactive before moving; stopping a timer does not stop its already-running service. Do not interrupt active transfers. The migration only renames this application's completed local directories after checksum verification, updates its catalog transactionally, and reconciles unsent resources through the helper's public claim/downloaded protocol. Journals under `/var/lib/takaneko/layout-migrations` let the same command recover a rename interrupted before its DB commit. Full media IDs, versions, hashes, NAS destinations and download keys remain unchanged. Empty legacy hash containers may be removed; original file bytes are not deleted. The web reader already accepts the new paths beneath `complete/`.

New downloads use the readable hierarchy on both VM and future NAS destinations under `takaneko/media/members/`. Existing NAS objects and imported thumbnail batches keep their verified destinations. Sidecars refresh on publication and successful transfers; rerun the migration command to rebuild them after a desktop import. `--verify` alone checks all local media against the catalog and readable text against stored post content. The archive root includes a Chinese `README.md` explaining paths and NAS-only content.

Migrated on 2026-09-25: 8,865 readable post records, including 98 complete VM publications; all 10,382 locally available media files passed SHA-256 verification. Existing media identities and NAS paths were compared before/after and stayed unchanged. The interrupted-rename recovery, checksum mismatch refusal and NAS-only handling tests passed, as did authenticated HTTP access to a newly published fixture in the new layout.

Each post/blog has a stable helper resource key `takaneko:<kind>:<source-id>:v1`. Claim precedes downloading, long downloads renew the lease, and failures release it. Completed output is renamed atomically into an immutable content-hash version. Publication creates metadata and image thumbnails before making it visible. The catalog tracks SHA-256, bytes, MIME, image dimensions, owner/private permission, variants and independent VM/NAS availability.

`takaneko-nas.timer` runs **03:15, 03:45, 04:15, 04:45, 05:15, 05:45 Asia/Hong_Kong**. Missed windows do not trigger daytime uploads. Each transfer uses the shared helper's verification/locking; only successful `nas_verified` output publishes NAS availability. Retries use the same version/key. All completed local originals remain on VM; this deployment does **not** authorize or implement automatic original deletion.

Media routes authenticate on every request, serve local completed files first, and fall back to the shared NAS read-only account over the helper's certificate-pinned HTTPS transport. Local/NAS paths remain private. Both sources support GET/HEAD, Range, Content-Length and SHA-256 ETags. No additional disk cache is allocated: VM's existing 5 GiB cache budget is already assigned to other services. NAS reads are streamed with two concurrent slots.

New downloads pause below 5 GiB free space; in-flight downloads finish. NAS transfer errors block new jobs until a successful retry. Failed staging is retained for diagnosis; no automatic deletion of original/failed files or historical NAS versions. Stop/pause prevents scheduling new items while already-running items finish. Re-running skips cataloged resources; interrupted claim-to-catalog transitions reconcile through helper claims after stale leases expire. Source updates require an explicit new version key; the default archives the first successfully captured source ID.

No shared ME LINK private media socket or other service's DB credentials are reused. The current web reader is isolated and uses the common NAS transport; it does not claim to provide a VM-wide unified media API. NAS backup is one verified NAS copy plus retained VM originals, not an independent second NAS backup.

## Operations / rollback

Migration completed 2026-09-25: 8,767 desktop posts indexed, including 8,759 existing source IDs used for download deduplication. A total of 27,689 canonical files (7,641,157,724 bytes) verified; 10,086 identical gallery copies removed. NAS `desktop-imports` staging was removed. No synthetic post or download marker was added for unmatched files. The Windows `exported` source remains intact. All 10,094 thumbnails are readable on VM and queued for the overnight NAS helper transfer. Original-image reads, video Range/HEAD, browser video playback and private access checks passed. A fresh Fanclub login import is required for new downloads.

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
