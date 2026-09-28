# Takaneko service maintenance

- Responsible role: Takaneko application maintainer. Shared VM resources remain the VM1 administrator's responsibility.
- Source: https://github.com/Senachi124/TakanekoFanClubDownloader ; local workspace `C:\Users\Sena\Documents\Git\TakanekoFanClubDownloader`.
- VM maintenance artifacts: `/home/linuxuser/projects/takaneko/artifacts/`. Historical home files are consolidated under `artifacts/home-legacy-20260928/`; the path mapping is in `deployment/vm1/home-inventory.md` (VM copy: `/home/linuxuser/projects/takaneko/docs/home-inventory.md`). Do not move ambiguous/shared files.
- Runtime: `/opt/takaneko/current` -> `/opt/takaneko/releases/<revision>`; configuration `/etc/takaneko/`; archive `/var/lib/takaneko/`; login/control state `/var/lib/takaneko-control/`; logs via journal and `/var/log/takaneko/`. No media cache allocated.
- Read `/home/linuxuser/AGENTS.md` and `/opt/AGENTS.md` before deployment. Read only `SERVICES_DOMAIN` from `/home/linuxuser/.env` when configuring the public domain. Secrets never enter Git, logs or reports.
- Operations, units, accounts, DB isolation, NAS paths, schedules, verification, retention and rollback: [deployment/vm1/README.md](deployment/vm1/README.md).
- All user-facing times and schedules use `Asia/Hong_Kong`, UTC+08:00, 24-hour time. Immutable paths and original publication metadata may retain the Japanese source timezone. Do not shift stored instants or rename verified archives just to change display.
- Automatic NAS transmission is restricted to 03:00 <= Hong Kong time < 09:00, including in-flight I/O and retries. Manual requests retain separate provenance and bypass only this window. Test with temporary files/local sockets and isolated DB tables; never start a real archive backup as a health check.
- Do not restart other services, change shared helpers, delete originals or manipulate helper resource tables. Deploy only while this application's downloads/backups are idle. Register verified results in home AGENTS.md without overwriting other maintainers' entries.
