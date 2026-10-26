<!-- vm1-ai-startup:v1 -->
## Default startup: codebase-memory-mcp and Agency specialists

Use both integrations by default for each Takaneko codebase task;
do not wait for the user to request them again. Follow all existing VM1 rules.

1. **Start codebase memory.** From the configured service source root
   `/home/linuxuser/projects/takaneko`, check `codex mcp get codebase_memory --json`.
   Codex starts the stdio MCP launcher on connection. Read
   `.codex/service-memory.json` and use project
   `vm1_takaneko`. Call `index_status` with `format="json"`
   before exploration, then use `search_graph`, `search_code`, `trace_path` or
   `get_architecture` to locate the relevant implementation. Check
   `check_index_coverage` and the snapshot's `SOURCE-MAP.json`; verify findings
   in the original source before editing. The launcher refreshes code snapshots
   on connection. If stale or unavailable, run
   `python3 .codex/service-memory.py --index-only` and `--status`, reconnect the
   Codex chat when needed, and state any remaining tool/coverage limitation.
   Continue with direct source reads when necessary; never claim a tool ran if
   it was unavailable. Run these commands from the configured root above;
   nested repository contexts can use its absolute launcher path.
2. **Activate a relevant Agency specialist.** Read the matching native TOML
   under `.codex/agents/` and apply its `developer_instructions` within the
   current task. Preferred service specialists: `engineering-backend-architect`, `engineering-frontend-developer`, `engineering-database-optimizer`.
   Use Codebase Onboarding Engineer for discovery, Code Reviewer for substantive
   review, Test Automation Engineer for regression planning and AppSec Engineer
   for authentication, access-control or input-handling changes. Select the
   roles needed by the task; do not start the whole roster. Applying a profile
   does not require a separate worker. Delegate only when the user or applicable
   instructions explicitly authorize delegation; preserve SHOWROOM's in-chat rule.
3. **Keep the service boundaries.** These integrations grant no additional
   production action. Index only configured code roots. Preserve credentials,
   media, queues, NAS windows, existing accounts and fixed three-day sessions.
   Validate changes, refresh registrations/home indexes after deployment, and
   commit/push the corresponding source while retaining the three local-only
   Git exceptions and Saaraday exclusion.

User authorized the eight additional trusted roots on 2026-10-26. Trust is
configured in the VM1 user's Codex settings; fresh chats load the project MCP
and specialist files. Moving a checkout requires reviewing local paths and
regenerating its config with `--configure` before use.
<!-- /vm1-ai-startup:v1 -->
