// src/lib/mcp-shared.ts
//
// Shared helpers for Vuka's MCP endpoints. Extracted so the split
// ChatGPT-facing endpoints (src/app/api/mcp-*/[transport]/route.ts) don't
// each duplicate the Supabase client, GitHub helpers, and SQL guardrails.
// The original src/app/api/[transport]/route.ts (used by Claude, all 81
// tools) is untouched and still self-contained — this file is net-new and
// only consumed by the new split endpoints.

import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";

export const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Set these to match your actual repo if the defaults are wrong — check
// the URL on github.com, it's github.com/<OWNER>/<REPO>
export const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER ?? "faithworth";
export const GITHUB_REPO = process.env.GITHUB_REPO_NAME ?? "Vuka";
export const GITHUB_API = "https://api.github.com";

export function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

export async function writeAdminLog(action: string, targetType: string, targetId: string, notes: string) {
  await supabase.from("AdminLog").insert({
    id: crypto.randomUUID(),
    action,
    targetType,
    targetId,
    actorId: "mcp-employee",
    ipAddress: "",
    severity: "info",
    notes,
    createdAt: new Date().toISOString(),
  });
}

// ── run_sql_query guardrails ──────────────────────────────────
// This tool runs with full DB credentials under the hood (same connection
// Prisma uses), so "read-only" has to be enforced in code, not assumed.
// Rules: must start with SELECT or WITH, no semicolon-chaining to a second
// statement, no dangerous keywords anywhere in the string, row cap, and a
// hard statement_timeout so nothing runs away.

const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|DROP|ALTER|TRUNCATE|GRANT|REVOKE|CREATE|COPY|EXECUTE|CALL|MERGE|VACUUM|REINDEX|REFRESH)\b/i;

export function validateReadOnlyQuery(query: string): string | null {
  const trimmed = query.trim();
  if (!/^(SELECT|WITH)\s/i.test(trimmed)) {
    return "Only SELECT or WITH (CTE) queries are allowed.";
  }
  // Disallow a second statement after a semicolon (allow one optional trailing semicolon)
  const withoutTrailingSemi = trimmed.replace(/;\s*$/, "");
  if (withoutTrailingSemi.includes(";")) {
    return "Multiple statements are not allowed — one SELECT per call.";
  }
  if (FORBIDDEN_KEYWORDS.test(trimmed)) {
    return "Query contains a forbidden keyword (only reads are allowed).";
  }
  return null;
}

export async function runReadOnlyQuery(query: string, rowLimit: number) {
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
  });
  await client.connect();
  try {
    await client.query("SET statement_timeout = 5000"); // 5s hard cap
    const result = await client.query(query);
    const rows = result.rows.slice(0, rowLimit);
    return { rows, rowCount: result.rowCount, truncated: (result.rowCount ?? 0) > rowLimit };
  } finally {
    await client.end();
  }
}
