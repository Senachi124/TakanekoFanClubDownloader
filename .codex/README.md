# VM1 development tooling: Takaneko

MCP: codebase_memory, project `vm1_takaneko`. The launcher refreshes a
code-only source snapshot on each new connection, indexes it locally and serves
13 read-only analysis tools. It has no HTTP listener. CBM is pinned to v0.12.1;
SHA-256 verified binary: `/home/linuxuser/codex-space/projects/server-admin/tools/codebase-memory-mcp/codebase-memory-mcp`. Shared cache: `/home/linuxuser/codex-space/projects/server-admin/work/service-ai-tooling/cache`.
Snapshot: `/home/linuxuser/codex-space/projects/server-admin/work/service-ai-tooling/snapshots/takaneko`. Its SOURCE-MAP.json maps every indexed path
back to its original absolute source and SHA-256; confirm findings there before edits.
Inspect index_status and check_index_coverage; an index is not completeness evidence.
Already-open MCP sessions retain their snapshot until reconnect or explicit refresh.

Refresh/check: `python3 .codex/service-memory.py --index-only` / `--status`.
After relocating a checkout, run `python3 .codex/service-memory.py --configure`;
review service-memory.json source, snapshot, cache and binary paths first.
A fresh Codex chat must trust this project to load project configuration.
Project trust is a separate explicit user decision. Automatic approval rejected
bulk trust changes during this rollout; existing trusted contexts load normally.
If the shared binary is missing, install with:
`python3 .codex/install-codebase-memory.py /home/linuxuser/codex-space/projects/server-admin/tools/codebase-memory-mcp/codebase-memory-mcp`.

Native Codex specialists in .codex/agents (upstream MIT, fixed commit
b37b5bb33b78f2c1d6567d98e25ca818e3259219):
- engineering-backend-architect
- engineering-frontend-developer
- engineering-database-optimizer
- engineering-codebase-onboarding-engineer
- engineering-code-reviewer
- testing-test-automation-engineer
- security-appsec-engineer

Use the relevant specialist when the task calls for that expertise; installing
profiles does not start autonomous workers. All retain VM1 policy, isolated-test
requirements, service boundaries, three local-only Git exceptions and Saaraday
exclusion. No model or reasoning override is installed. Existing AGENTS.md applies.
No runtime credentials, databases, media, queues, environment files or rollback
copies are indexed. Only listed code roots and allowlisted text source files enter
snapshots; symlinks, dependency trees, artifacts, work, data and backups are skipped.
No NAS upload/timer or production service restart is added. Normal scheduled NAS
remains HK03:00-09:00; resource reports retain their immediate-upload exception.

Rollback: remove only the managed files listed in this bundle, or restore the
saved originals under root-only /var/backups/vm1-admin using the deployment receipt.
Keep unrelated configuration. Cached code graphs may be retained; never delete
production data. Refresh backup registration and home/opt service index afterwards.
