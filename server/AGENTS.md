# Server maintenance

- Role: Takaneko application maintainer. Shared VM resources remain the host administrator's responsibility.
- Before deployment read the host's home AGENTS.md and /opt/AGENTS.md. Store host-specific locations and maintenance records outside public Git.
- Use the configured domain source; read only SERVICES_DOMAIN from that file, never output or execute the whole environment file.
- Deploy only when this application's downloads and NAS transfers are idle. Restart only this application's services. Do not change shared helpers, other services or helper resource tables.
- All display and schedule times use Asia/Hong_Kong and 24-hour notation. Automatic NAS transmission, including in-flight I/O and retries, is restricted to 03:00 <= time < 09:00. Manual jobs retain separate provenance and bypass only this window.
- Never delete originals or rename verified files to change display. No additional media cache is allocated.
- Test with temporary files, local sockets and isolated application test databases. Never start a real archive backup as a health check.
- Keep private configuration outside releases. Preserve other maintainers' entries when registering verified deployment results in the host's home AGENTS.md.
