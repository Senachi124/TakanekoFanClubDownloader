# Existing VM home artifacts (2026-09-28, Hong Kong time)

New artifacts go under `/home/linuxuser/projects/takaneko/artifacts/`. No existing file was moved or removed. Runtime units execute `/opt/takaneko/current`, not historic home uploads. Unknown files stay until ownership/dependencies are confirmed.

| Existing absolute location | Purpose / ownership | Reference and disposition |
| --- | --- | --- |
| `/home/linuxuser/takaneko-release.tar.gz`, `/home/linuxuser/release-9af7a1c.tar.gz` | Historic releases | Retain; live code is extracted under `/opt/takaneko/releases/`. Proposed future location: project artifacts after references are checked. |
| `/home/linuxuser/takaneko-web.service`, `/home/linuxuser/takaneko-common.py` | Historic deployment patches | Retain; units use `/etc/systemd/system/`, Python uses current release. Future project artifacts. |
| `/home/linuxuser/takaneko-desktop-catalog.tar.gz`, `/home/linuxuser/takaneko-desktop-metadata.tar.gz`, `/home/linuxuser/takaneko-desktop-catalog-canonical.tar.gz` | Original import bundles | Retain import evidence; check import/restore references before moving. |
| `/home/linuxuser/takaneko-nas-plan.ndjson`, `/home/linuxuser/takaneko-nas-readable-receipt.json` | NAS migration evidence | Retain; worker-readable copies are in `/var/lib/takaneko/layout-migrations/`. |
| `/home/linuxuser/takaneko-verify-import.py`, `/home/linuxuser/verify-readable-vm.py`, `/home/linuxuser/verify-nas-migration.py`, `/home/linuxuser/verify-backup-controls.py` | Historic verification | Earlier maintenance instructions reference these locations; retain. New scripts reside in the versioned release. |
| `/home/linuxuser/takaneko-install.log` | Installation log | Retain private evidence; no automatic cleanup. |
| `/home/linuxuser/web.py`, `/home/linuxuser/backup_worker.py`, `/home/linuxuser/verify_import.py`, `/home/linuxuser/desktop-metadata.tar.gz`, `/home/linuxuser/repair_post_dates.py` | Ownership/dependencies need confirmation | Keep in place; no speculative moves or deletion. |

Other services' files are outside this cleanup scope. A future move must record the old/new mapping, check cron/unit/import/document references, and provide a reverse move for rollback.
