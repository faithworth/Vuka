# MCP Tooling Log

This file tracks additions to the Vuka AI Agent MCP server, so changes to it are visible in normal repo history alongside application code.

## 2026-07-18
Added Tier A department tools:
- `get_revenue_report` — monthly revenue trend across all sources
- `get_conversion_funnel` — signup → artist → first-sale conversion
- `list_verification_queue` — bank accounts pending verification review
- `github_create_branch` + `create_pull_request` — available for use on anything touching money, auth, or existing live logic; default workflow otherwise is direct-to-main.

## 2026-07-18 (later)
Added CI: GitHub Actions workflow running type-check + vitest on every push/PR to main.
Added `get_ci_status` tool to check run results without leaving chat.
Fixed CI failing on `prisma generate` (postinstall) by wiring DATABASE_URL/DIRECT_URL as GitHub Actions secrets.

## 2026-07-22
Added persistent project-memory tools, backed by the (previously empty/unused) ProjectMemory, SessionLog, and KnownIssue tables:
- `get_project_briefing` — one-call summary of stored architecture/business-rule memory + last 5 sessions + open issues. Read this first each session.
- `memory_set` / `memory_get` / `memory_search` — durable facts, upserted by key.
- `log_session_summary` — record what happened at the end of a session.
- `get_recent_changes` — lightweight changelog from SessionLog.
- `known_issue_action` — create/update/resolve tracked issues.
- `repo_map` — live top-level repo listing in one call instead of multiple github_list_files round-trips.
Seeded ProjectMemory with core architecture/business facts so get_project_briefing is useful immediately.
