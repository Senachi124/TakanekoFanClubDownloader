# Home instruction update — 2026-09-28 (Hong Kong time)

Responsible role: Takaneko application maintainer. Source and actual paths are in root AGENTS.md; existing home uploads are inventoried in home-inventory.md. New deployment artifacts use `/home/linuxuser/projects/takaneko/artifacts/`. Existing home files remain pending ownership/reference confirmation.

## Endpoints and time

`configure_endpoint.py` reads only SERVICES_DOMAIN from `/home/linuxuser/.env`, never executes that file, and renders `/etc/takaneko/runtime.env` and `/etc/takaneko/nginx.conf`. The verified portal is HTTPS 443 `/`; this app remains HTTPS 2083 `/downloads`, `/browse`, `/library`. The shared header's standard 返回首頁 link uses the full portal URL on desktop/mobile, including before login. Reconfigure endpoints when the authoritative domain changes; provision the matching certificate before reloading only this application's HTTPS unit.

API timestamps convert stored instants to ISO 8601 UTC+08:00; the UI uses Asia/Hong_Kong and 24-hour time. Source publication metadata and immutable directory names retain their Japanese timezone. No stored instant is shifted and no verified archive is renamed.

## Automatic and manual backup

Automatic jobs persist trigger=scheduled, next_run_at, counters and verified-file identities. The consumer selects manual requests first, and automatic jobs only inside 03:00 <= Hong Kong time < 09:00. A waiting automatic job never blocks manual requests. Failure retries wait 15 minutes inside the window; after 09:00 they resume no earlier than the next Hong Kong calendar day at 03:00. Restart recovery checks the same rule. The timer enqueues at 03:00 and every 15 minutes through 08:45; an already pending scheduled job is reused.

Each job runs in a separate child. An absolute 09:00 deadline covers preparation, helper locks, DNS, TLS, upload, full read-back and retry sleeps. A signal interrupts blocking I/O; guarded helper requests refuse all new network operations, including temporary cleanup, after cutoff. The supervisor kills only an overdue automatic child as a fallback for a non-interruptible library call. Manual children have no deadline. Other applications and this app's download/web processes are not stopped.

Sources, outboxes, stable delivery keys and counters persist. Retry uses the helper's remote hash check, so verified files are not uploaded again; an incomplete file may restart from its beginning. There is no byte-range upload resume. Unverified NAS temporary objects are not published or automatically cleaned by this application. The shared helper is unchanged.

## Boot, checks and deployment

Enabled units: takaneko.service, takaneko-web.service, takaneko-https.service, takaneko-backup.service, takaneko-auto.timer, takaneko-nas.timer, takaneko-tls-reload.timer. Worker/web/backup order after network-online and PostgreSQL, with controlled RestartSec retries; HTTPS orders after web. Check both is-enabled and is-active, calendars, `/healthz`, authenticated media and queue state. Do not reboot merely to test boot configuration.

Tests use temporary files, loopback sockets and temporary PostgreSQL tables: 02:59 / 03:00 / 08:59 / 09:00, month rollover, restart outside the window, manual priority, interrupted upload/read-back/lock/backoff, immutable retry and progress persistence. Do not start a production backup as a test.

Update: verify own queues idle; unpack a Git release under `/opt/takaneko/releases/`; configure endpoints; initialize this app's schema as its worker; install its units; reload systemd; switch current; restart only affected application processes/timer. Retain original files, staging, outboxes and NAS copies. Record revision, verification and completion timestamp in home AGENTS.md.

Rollback must remain window-aware. The pre-2026-09-28 worker can transmit outside the window and cannot consume waiting jobs. To roll back web/download code, leave the new backup worker pinned to its release; otherwise stop only this application's idle backup consumer and NAS timer, retaining the queue until a compliant worker is restored. Never downgrade schema or clear pending jobs. Restore from retained versioned code and the existing catalog/archive; NAS originals and metadata have no automatic deletion policy.
