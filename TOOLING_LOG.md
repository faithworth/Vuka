# MCP Tooling Log

This file tracks additions to the Vuka AI Agent MCP server, so changes to it are visible in normal repo history alongside application code.

## 2026-07-18
Added Tier A department tools:
- `get_revenue_report` — monthly revenue trend across all sources
- `get_conversion_funnel` — signup → artist → first-sale conversion
- `list_verification_queue` — bank accounts pending verification review
- `github_create_branch` + `create_pull_request` — safer dev workflow, branch + review instead of direct-to-main commits

This PR itself is the first real test of that new branch + PR workflow.
