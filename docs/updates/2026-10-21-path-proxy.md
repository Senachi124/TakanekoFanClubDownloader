# 2026-10-21 — Shared HTTPS path ingress

VM1 now serves these archives through `https://vm1.learnfromidol.com` on HTTPS 443:

| Archive | Path | Internal HTTP upstream |
| --- | --- | --- |
| Instagram | `/instagram/` | `127.0.0.1:42053` |
| Takaneko | `/takaneko/` | `127.0.0.1:42083` |
| ME LINK | `/melink/` | `127.0.0.1:8787` |

Public TCP 2053/2083/8443 listeners and IPv4/IPv6 UFW allowances were removed
at 2026-10-21 10:31 Hong Kong time after authenticated HTTP and browser checks.
Only the existing shared 443 ingress is public for these services. HTTP 80 ACME
validation, SSH and other services remain. No Cloudflare account changes.

The portal cards, API/media/static URLs, navigation/download links, session
cookie paths and allowed origins follow the new paths. Credentials are unchanged;
application restarts require a fresh login. Production media, DB, queues and NAS
were preserved. Automatic NAS remains Hong Kong 03:00–09:00 with deadlines;
resource reports retain their existing immediate-upload exception.

Live validation: all three pages, authenticated APIs, CSS/JS, browser login and
media previews passed; real 16-byte media Range reads returned 206, wrong-Origin
requests were rejected and cookies were scoped to their service paths. Portal,
XLoader and SHOWROOM health remained 200. Capture/media/backup workers were not
restarted. Service backup registration and the home service index were refreshed;
pre-existing unrelated coverage drift remains visible.

Operator evidence/rollback: server-admin `docs/path-proxy-20261021.md`,
`scripts/deploy-path-proxy.py`, and root-only
`/var/backups/vm1-admin/path-proxy-20261021T102257+0800/`.
These changes are published for review; unrelated outstanding PRs are not merged.

## Takaneko implementation

- `TAKANEKO_ORIGIN=https://vm1.learnfromidol.com`, `TAKANEKO_BASE_PATH=/takaneko`.
- Internal NGINX listens on loopback 42083, with the existing API at 43130.
- The shared ingress strips `/takaneko/` before proxying. HTML/script/API/media
  links retain the prefix, including direct `/takaneko/library` navigation.
- The ingress rewrites session Cookie Path to `/takaneko/`; CSRF/Origin checks
  remain enabled. Trust X-Real-IP only from loopback for per-client login limits.
- The deployment endpoint/portal generators use the new URL. Installers allow
  only shared 443, with no public rule for 42083 or 2083.
