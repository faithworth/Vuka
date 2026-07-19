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
