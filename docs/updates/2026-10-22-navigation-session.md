# 2026-10-22 — Catalog navigation and session loading

Two page-navigation issues are fixed:

- Catalog browse/library links retain basePath and the encoded member query,
  avoiding the portal /library 404 after content loads or member selection.
- Initial HTML shows a neutral loading state with login and workspace hidden.
  A valid server session reveals the workspace without flashing login; HTTP 401
  shows login. Network/503 failures offer retry. Optional YouTube settings load
  after the workspace is revealed. A no-JavaScript hint is included.

Cookie validation, accounts, session lifetime, authorization, CSP and proxy
settings are unchanged. The Cloudflare beacon blocked on the original 404 page
was a secondary message, not the cause of the missing library route.

Run: node --test server/tests/navigation.test.cjs server/tests/session.test.cjs

All 13 tests passed for both VM maintenance and publication copies: catalog
rendering at root/prefixed mounts, encoded/null member queries, initial hidden
HTML, pending valid session, 401, network/503 failure and retry.

VM1 deployed the navigation fix at 2026-10-22 18:54:28 and loading UI at 19:03:29
Asia/Hong_Kong. Eight original HTTPS browser cases verified catalog round trips,
member query preservation and reloads. Eight additional Chromium cases at
1360/390 widths verified browse/library/backup/downloads with the initial status
request deliberately delayed 1200 ms. Frame observations found no login flash
for valid sessions. Real login, HTTP 200 pages, network retry, logout and an
invalid Cookie were verified on both screen sizes.

Takaneko download/web/HTTPS/backup and portal PIDs stayed unchanged. No restart,
production media/queue, credential or NAS operation. Manifest hashes, service
backup registration and home/opt service indexes were refreshed. Automatic NAS
remains Hong Kong 03:00–09:00; resource reports retain their immediate-upload
exception. Full-host coverage/restore is not claimed.

Reload existing tabs; use https://vm1.learnfromidol.com/takaneko/library .
The unassigned root /library route continues to return 404.

Existing VM-only unified-login payload/markup changes remain outside this patch;
full upstream/VM equivalence is not claimed. Operator records and guarded
deployment/browser scripts are in server-admin/docs/takaneko-navigation-20261022.md
and docs/takaneko-auth-loading-20261022.md. Privileged original files/browser
state are root-only under
/var/backups/vm1-admin/takaneko-auth-loading-20261022T190329+0800/.
Rollback only reviewed static files atomically with recorded ownership/modes,
refreshing matching manifest/registration/index. No restart or data rollback.

