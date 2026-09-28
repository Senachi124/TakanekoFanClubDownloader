# VM home files — organized

Completed 2026-09-28T19:01:20+08:00. All 19 confirmed Takaneko files were moved into `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/`. Total: 738,211,304 bytes; all SHA-256 hashes and sizes matched after the move. No contents were edited, overwritten or deleted.

Before moving, systemd/cron, running command arguments and open file descriptors were checked: no active references to these home files. Only historical inventory documents referenced their old paths. The three application PIDs stayed unchanged and `/healthz` returned ok after the move. No services were restarted; production code, configuration, DB, local archives and NAS paths remain unchanged.

The unprefixed web/backup/import scripts contain Takaneko paths or match its modules; the desktop archive contains Takaneko resource keys. Other services' files and shared home AGENTS.md/.env remain in place.

## Path mapping

| Former path | Current path |
| --- | --- |
| `/home/linuxuser/backup_worker.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/backup_worker.py` |
| `/home/linuxuser/desktop-metadata.tar.gz` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/desktop-metadata.tar.gz` |
| `/home/linuxuser/release-9af7a1c.tar.gz` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/release-9af7a1c.tar.gz` |
| `/home/linuxuser/repair_post_dates.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/repair_post_dates.py` |
| `/home/linuxuser/takaneko-common.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-common.py` |
| `/home/linuxuser/takaneko-desktop-catalog-canonical.tar.gz` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-desktop-catalog-canonical.tar.gz` |
| `/home/linuxuser/takaneko-desktop-catalog.tar.gz` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-desktop-catalog.tar.gz` |
| `/home/linuxuser/takaneko-desktop-metadata.tar.gz` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-desktop-metadata.tar.gz` |
| `/home/linuxuser/takaneko-install.log` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-install.log` |
| `/home/linuxuser/takaneko-nas-plan.ndjson` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-nas-plan.ndjson` |
| `/home/linuxuser/takaneko-nas-readable-receipt.json` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-nas-readable-receipt.json` |
| `/home/linuxuser/takaneko-release.tar.gz` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-release.tar.gz` |
| `/home/linuxuser/takaneko-verify-import.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-verify-import.py` |
| `/home/linuxuser/takaneko-web.service` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/takaneko-web.service` |
| `/home/linuxuser/verify-backup-controls.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/verify-backup-controls.py` |
| `/home/linuxuser/verify-nas-migration.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/verify-nas-migration.py` |
| `/home/linuxuser/verify-readable-vm.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/verify-readable-vm.py` |
| `/home/linuxuser/verify_import.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/verify_import.py` |
| `/home/linuxuser/web.py` | `/home/linuxuser/projects/takaneko/artifacts/home-legacy-20260928/web.py` |

## Maintenance and rollback

Authoritative current inventory on VM: `/home/linuxuser/projects/takaneko/docs/home-inventory.md`. Full verification receipt (paths, bytes, SHA-256): `/home/linuxuser/projects/takaneko/artifacts/home-reorganization-20260928.json`.

The legacy folder preserves historical upload files, not executable maintenance entrypoints. Use scripts from `/opt/takaneko/current/deployment/vm1/`; old standalone copies may assume imports relative to their original release and are retained solely as evidence. Do not run a historical repair/import script merely to check health. Read previous release inventories as historical paths and use this mapping to locate their files.

Rollback, only if explicitly needed: verify each destination against the receipt, confirm the old path is absent and no process is using either path, then rename that exact file back to its recorded old path. Never overwrite an existing file; update this inventory and home AGENTS.md after a reverse move. No symlinks were left in home.
