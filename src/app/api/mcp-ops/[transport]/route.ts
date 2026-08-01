// src/app/api/mcp-ops/[transport]/route.ts
//
// ── Bootstrap ChatGPT-connector split ─────────────────────────────────
// This is one of several smaller MCP endpoints split out of the original
// src/app/api/[transport]/route.ts so each manifest comfortably fits
// ChatGPT's combined tool-manifest token budget. The original endpoint
// (used by Claude) is unchanged and still exposes all 81 tools at
// https://www.vukamusic.com/api/mcp — nothing about it was modified.
//
// Add THIS endpoint's URL as its own ChatGPT connector to get this
// group's tools; add the other mcp-* endpoints as separate connectors
// for the rest. No tool names, parameters, or business logic were
// changed in this split — every tool body below is copied verbatim
// from the original file.
// ───────────────────────────────────────────────────────────────────────

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  supabase,
  GITHUB_API,
  GITHUB_OWNER,
  GITHUB_REPO,
  githubHeaders,
  writeAdminLog,
  validateReadOnlyQuery,
  runReadOnlyQuery,
} from "@/lib/mcp-shared";

export const maxDuration = 120;

const handler = createMcpHandler(
  (server) => {
server.tool(
      "ping",
      "Health check; returns server time.",
      { message: z.string().optional().describe("Optional message to echo back") },
      async ({ message }) => ({
        content: [
          {
            type: "text",
            text: `Vuka Music MCP server is live. Server time: ${new Date().toISOString()}${
              message ? ` | Echo: ${message}` : ""
            }`,
          },
        ],
      })
    );

server.tool(
      "run_sql_query",
      "Read-only SELECT/WITH query against production Postgres.",
      {
        query: z.string().describe("A single SELECT or WITH query"),
        row_limit: z.number().int().min(1).max(200).optional().default(50).describe("Max rows to return, capped at 200"),
      },
      async ({ query, row_limit }) => {
        const validationError = validateReadOnlyQuery(query);
        if (validationError) {
          return { content: [{ type: "text", text: `Query rejected: ${validationError}` }], isError: true };
        }

        try {
          const { rows, rowCount, truncated } = await runReadOnlyQuery(query, row_limit);
          const summary = `${rowCount ?? rows.length} row(s) matched${truncated ? `, showing first ${row_limit}` : ""}.`;
          return {
            content: [{ type: "text", text: `${summary}\n\n${JSON.stringify(rows, null, 2)}` }],
          };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Query failed: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "explain_query",
      "EXPLAIN ANALYZE a read-only query.",
      { query: z.string() },
      async ({ query }) => {
        const validationError = validateReadOnlyQuery(query);
        if (validationError) return { content: [{ type: "text", text: `Query rejected: ${validationError}` }], isError: true };
        try {
          const { rows } = await runReadOnlyQuery(`EXPLAIN (ANALYZE, FORMAT TEXT) ${query}`, 200);
          const plan = (rows as any[]).map((r) => Object.values(r)[0]).join("\n");
          return { content: [{ type: "text", text: plan }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "get_schema_map",
      "Full DB schema map: columns, types, foreign keys.",
      { table: z.string().optional().describe("Optional: limit to one table name") },
      async ({ table }) => {
        if (table && !/^[A-Za-z_][A-Za-z0-9_]*$/.test(table)) return { content: [{ type: "text", text: "Invalid table name." }], isError: true };
        const tableFilter = table ? `AND c.table_name = '${table}'` : "";
        const fkFilter = table ? `AND tc.table_name='${table}'` : "";
        try {
          const { rows: columns } = await runReadOnlyQuery(
            `SELECT c.table_name, c.column_name, c.data_type, c.is_nullable FROM information_schema.columns c WHERE c.table_schema='public' ${tableFilter} ORDER BY c.table_name, c.ordinal_position`, 500
          );
          const { rows: fks } = await runReadOnlyQuery(
            `SELECT tc.table_name, kcu.column_name, ccu.table_name AS foreign_table, ccu.column_name AS foreign_column FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name JOIN information_schema.constraint_column_usage ccu ON tc.constraint_name = ccu.constraint_name WHERE tc.constraint_type='FOREIGN KEY' AND tc.table_schema='public' ${fkFilter}`, 300
          );
          const byTable: Record<string, string[]> = {};
          for (const c of columns as any[]) {
            byTable[c.table_name] = byTable[c.table_name] ?? [];
            byTable[c.table_name].push(`${c.column_name} (${c.data_type}${c.is_nullable === "NO" ? ", not null" : ""})`);
          }
          const fkText = (fks as any[]).map((f) => `${f.table_name}.${f.column_name} -> ${f.foreign_table}.${f.foreign_column}`).join("\n") || "(none)";
          const tableText = Object.entries(byTable).map(([t, cols]) => `## ${t}\n${cols.join(", ")}`).join("\n\n");
          return { content: [{ type: "text", text: `${tableText}\n\n# Foreign keys\n${fkText}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "check_missing_indexes",
      "Find FK columns missing a covering index.",
      {},
      async () => {
        try {
          const { rows } = await runReadOnlyQuery(
            `SELECT tc.table_name, kcu.column_name FROM information_schema.table_constraints tc JOIN information_schema.key_column_usage kcu ON tc.constraint_name = kcu.constraint_name WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema='public' AND NOT EXISTS (SELECT 1 FROM pg_indexes pi WHERE pi.tablename = tc.table_name AND pi.indexdef ILIKE '%' || kcu.column_name || '%') ORDER BY tc.table_name`, 200
          );
          if (rows.length === 0) return { content: [{ type: "text", text: "No missing FK indexes found." }] };
          return { content: [{ type: "text", text: (rows as any[]).map((r) => `${r.table_name}.${r.column_name}`).join("\n") }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "check_rls_policies",
      "List tables with RLS disabled or empty.",
      {},
      async () => {
        try {
          const { rows } = await runReadOnlyQuery(
            `SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, (SELECT count(*) FROM pg_policies p WHERE p.tablename = c.relname) AS policy_count FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY c.relname`, 300
          );
          const gaps = (rows as any[]).filter((r) => !r.rls_enabled || Number(r.policy_count) === 0);
          if (gaps.length === 0) return { content: [{ type: "text", text: "All public tables have RLS enabled with at least one policy." }] };
          return { content: [{ type: "text", text: gaps.map((r) => `${r.table_name}: RLS ${r.rls_enabled ? "enabled" : "DISABLED"}, ${r.policy_count} polic${Number(r.policy_count) === 1 ? "y" : "ies"}`).join("\n") }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "find_orphaned_records",
      "Find child rows with a broken foreign key.",
      { child_table: z.string(), child_fk_column: z.string(), parent_table: z.string(), parent_pk_column: z.string().optional().default("id") },
      async ({ child_table, child_fk_column, parent_table, parent_pk_column }) => {
        const ident = /^[A-Za-z_][A-Za-z0-9_]*$/;
        for (const v of [child_table, child_fk_column, parent_table, parent_pk_column]) {
          if (!ident.test(v)) return { content: [{ type: "text", text: `Invalid identifier: ${v}` }], isError: true };
        }
        try {
          const { rows, rowCount } = await runReadOnlyQuery(
            `SELECT ct.${child_fk_column}, count(*) FROM "${child_table}" ct LEFT JOIN "${parent_table}" pt ON ct.${child_fk_column} = pt.${parent_pk_column} WHERE ct.${child_fk_column} IS NOT NULL AND pt.${parent_pk_column} IS NULL GROUP BY ct.${child_fk_column} LIMIT 50`, 50
          );
          if (rows.length === 0) return { content: [{ type: "text", text: `No orphaned rows found (${child_table}.${child_fk_column} -> ${parent_table}.${parent_pk_column}).` }] };
          return { content: [{ type: "text", text: `${rowCount} distinct orphaned ${child_fk_column} value(s):\n${JSON.stringify(rows, null, 2)}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "diff_schema_vs_prisma",
      "Compare a Prisma model against the live DB table.",
      { model_name: z.string().describe("Prisma model name, e.g. 'Artist'"), table_name: z.string().describe("Actual DB table name") },
      async ({ model_name, table_name }) => {
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table_name)) return { content: [{ type: "text", text: "Invalid table name." }], isError: true };
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/prisma/schema.prisma`, { headers: githubHeaders() });
        if (!res.ok) return { content: [{ type: "text", text: `Couldn't read schema.prisma: ${await res.text()}` }], isError: true };
        const data = await res.json();
        const schema = Buffer.from(data.content, "base64").toString("utf-8");
        const modelMatch = schema.match(new RegExp(`model\\s+${model_name}\\s*{([\\s\\S]*?)}\\n`));
        if (!modelMatch) return { content: [{ type: "text", text: `Model "${model_name}" not found in schema.prisma.` }] };
        const fieldLines = modelMatch[1].split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("//") && !l.startsWith("@@"));
        const prismaFields = fieldLines.map((l) => l.split(/\s+/)[0]);
        try {
          const { rows } = await runReadOnlyQuery(`SELECT column_name FROM information_schema.columns WHERE table_schema='public' AND table_name='${table_name}'`, 200);
          const dbColumns = (rows as any[]).map((r) => r.column_name);
          const missingInDb = prismaFields.filter((f) => !dbColumns.some((c: string) => c.toLowerCase() === f.toLowerCase()));
          const missingInPrisma = dbColumns.filter((c: string) => !prismaFields.some((f) => f.toLowerCase() === c.toLowerCase()));
          return { content: [{ type: "text", text: `In schema.prisma but not in DB: ${missingInDb.join(", ") || "none"}\nIn DB but not in schema.prisma: ${missingInPrisma.join(", ") || "none"}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "check_migration_drift",
      "Compare migration files against applied migrations.",
      {},
      async () => {
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/prisma/migrations`, { headers: githubHeaders() });
        if (!res.ok) return { content: [{ type: "text", text: `Couldn't list migrations folder: ${await res.text()}` }], isError: true };
        const dirs = await res.json();
        const repoMigrations = (Array.isArray(dirs) ? dirs : []).filter((d: any) => d.type === "dir").map((d: any) => d.name);
        try {
          const { rows } = await runReadOnlyQuery(`SELECT migration_name FROM _prisma_migrations`, 300);
          const appliedNames = (rows as any[]).map((r) => r.migration_name);
          const notApplied = repoMigrations.filter((m) => !appliedNames.includes(m));
          const appliedNotInRepo = appliedNames.filter((m) => !repoMigrations.includes(m));
          return { content: [{ type: "text", text: `In repo but not applied to DB: ${notApplied.join(", ") || "none"}\nApplied to DB but not in repo (drift): ${appliedNotInRepo.join(", ") || "none"}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "get_table_row_counts",
      "Approximate row counts for every public table.",
      {},
      async () => {
        try {
          const { rows } = await runReadOnlyQuery(
            `SELECT relname AS table_name, reltuples::bigint AS approx_rows FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname='public' AND c.relkind='r' ORDER BY reltuples DESC`, 300
          );
          return { content: [{ type: "text", text: (rows as any[]).map((r) => `${r.table_name}: ~${r.approx_rows}`).join("\n") }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

server.tool(
      "check_env_vars",
      "Check which required env vars are set (names only).",
      {},
      async () => {
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/.env.example`, { headers: githubHeaders() });
        if (!res.ok) return { content: [{ type: "text", text: `Couldn't read .env.example: ${await res.text()}` }], isError: true };
        const data = await res.json();
        const content = Buffer.from(data.content, "base64").toString("utf-8");
        const names = content.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#") && l.includes("=")).map((l) => l.split("=")[0].trim());
        const missing = names.filter((n) => !process.env[n]);
        const present = names.filter((n) => !!process.env[n]);
        return { content: [{ type: "text", text: `Set (${present.length}): ${present.join(", ") || "none"}\n\nMISSING (${missing.length}): ${missing.join(", ") || "none"}` }] };
      }
    );

server.tool(
      "check_webhook_health",
      "Failed payment records in the last 7 days.",
      {},
      async () => {
        const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
        const [purchases, orders, subs] = await Promise.all([
          supabase.from("Purchase").select("id", { count: "exact", head: true }).eq("status", "failed").gte("createdAt", since),
          supabase.from("MarketplaceOrder").select("id", { count: "exact", head: true }).eq("status", "failed").gte("createdAt", since),
          supabase.from("artist_plan_subscriptions").select("id", { count: "exact", head: true }).eq("status", "failed").gte("createdAt", since),
        ]);
        return { content: [{ type: "text", text: `Last 7 days — failed Purchases: ${purchases.count ?? 0}, failed MarketplaceOrders: ${orders.count ?? 0}, failed subscription charges: ${subs.count ?? 0}.` }] };
      }
    );

server.tool(
      "health_check_full",
      "One-call health check across the whole system.",
      {},
      async () => {
        const [dbPing, issues, subs, ciRes] = await Promise.allSettled([
          supabase.from("Artist").select("id", { count: "exact", head: true }),
          supabase.from("KnownIssue").select("title, severity").in("severity", ["high", "critical"]).eq("status", "open"),
          supabase.from("artist_plan_subscriptions").select("status"),
          fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?branch=main&per_page=1`, { headers: githubHeaders() }),
        ]);
        const dbOk = dbPing.status === "fulfilled" && !(dbPing.value as any).error;
        const issuesText = issues.status === "fulfilled" && (issues.value as any).data ? ((issues.value as any).data.map((i: any) => `${i.severity}: ${i.title}`).join("; ") || "none") : "unknown";
        const subCounts: Record<string, number> = {};
        if (subs.status === "fulfilled" && (subs.value as any).data) {
          for (const s of (subs.value as any).data) subCounts[s.status] = (subCounts[s.status] ?? 0) + 1;
        }
        let ciText = "unknown";
        if (ciRes.status === "fulfilled" && (ciRes.value as any).ok) {
          const data = await (ciRes.value as any).json();
          const run = data.workflow_runs?.[0];
          if (run) ciText = `${run.name}: ${run.status}/${run.conclusion ?? "pending"} (${run.head_commit?.message?.split("\n")[0] ?? ""})`;
        }
        return { content: [{ type: "text", text: `DB connectivity: ${dbOk ? "OK" : "FAILED"}\nOpen high/critical issues: ${issuesText}\nSubscription status counts: ${JSON.stringify(subCounts)}\nLatest CI run: ${ciText}` }] };
      }
    );

server.tool(
      "get_admin_audit_log",
      "Recent admin action log entries.",
      { limit: z.number().int().min(1).max(100).optional().default(20) },
      async ({ limit }) => {
        const { data, error } = await supabase.from("AdminLog").select("action, targetType, targetId, actorId, severity, notes, createdAt").order("createdAt", { ascending: false }).limit(limit);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data || data.length === 0) return { content: [{ type: "text", text: "No admin log entries." }] };
        return { content: [{ type: "text", text: data.map((d: any) => `[${d.createdAt}] ${d.severity}/${d.action} on ${d.targetType}:${d.targetId} by ${d.actorId}${d.notes ? ` - ${d.notes}` : ""}`).join("\n") }] };
      }
    );

server.tool(
      "get_recent_errors",
      "Recent error/critical log entries.",
      { limit: z.number().int().min(1).max(100).optional().default(20) },
      async ({ limit }) => {
        const { data, error } = await supabase.from("AdminLog").select("action, targetType, targetId, severity, notes, createdAt").in("severity", ["error", "critical"]).order("createdAt", { ascending: false }).limit(limit);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data || data.length === 0) return { content: [{ type: "text", text: "No error/critical severity log entries recorded." }] };
        return { content: [{ type: "text", text: data.map((d: any) => `[${d.createdAt}] ${d.action} on ${d.targetType}:${d.targetId}${d.notes ? ` - ${d.notes}` : ""}`).join("\n") }] };
      }
    );

server.tool(
      "get_recent_admin_actions",
      "Get the N most recent admin log entries.",
      { limit: z.number().optional().default(20) },
      async ({ limit }) => {
        const { data, error } = await supabase.from("AdminLog").select("action, targetType, targetId, notes, createdAt").order("createdAt", { ascending: false }).limit(limit);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data?.length) return { content: [{ type: "text", text: "No admin log entries found." }] };
        return { content: [{ type: "text", text: data.map((d: any) => `${d.createdAt} — ${d.action} (${d.targetType}:${d.targetId}) — ${d.notes}`).join("\n") }] };
      }
    );

server.tool(
      "get_project_briefing",
      "Read FIRST each session: project memory, recent summaries, open issues.",
      {},
      async () => {
        const [memRes, sessionsRes, issuesRes] = await Promise.all([
          supabase.from("ProjectMemory").select("key, category, value, updatedAt").order("category"),
          supabase.from("SessionLog").select("summary, filesChanged, decisions, openItems, createdAt").order("createdAt", { ascending: false }).limit(5),
          supabase.from("KnownIssue").select("title, description, severity, area, status").neq("status", "resolved").order("severity"),
        ]);
        if (memRes.error) return { content: [{ type: "text", text: `Error loading memory: ${memRes.error.message}` }], isError: true };

        const byCategory: Record<string, string[]> = {};
        for (const row of memRes.data ?? []) {
          const cat = row.category || "general";
          byCategory[cat] = byCategory[cat] ?? [];
          byCategory[cat].push(`- ${row.key}: ${row.value}`);
        }
        const memoryText = Object.keys(byCategory).length
          ? Object.entries(byCategory).map(([cat, lines]) => `## ${cat}\n${lines.join("\n")}`).join("\n\n")
          : "(no memory entries stored yet — use memory_set to start building this up)";

        const sessionsText = (sessionsRes.data ?? []).length
          ? (sessionsRes.data ?? []).map((s: any) => `- [${s.createdAt}] ${s.summary}${s.openItems ? ` | Open: ${s.openItems}` : ""}`).join("\n")
          : "(no session logs yet — use log_session_summary at the end of a work session)";

        const issuesText = (issuesRes.data ?? []).length
          ? (issuesRes.data ?? []).map((i: any) => `- [${i.severity}/${i.area}] ${i.title}: ${i.description}`).join("\n")
          : "(no open known issues on record)";

        return {
          content: [
            {
              type: "text",
              text: `# Vuka Music — Project Briefing\n\n${memoryText}\n\n# Recent Sessions\n${sessionsText}\n\n# Open Known Issues\n${issuesText}`,
            },
          ],
        };
      }
    );

server.tool(
      "memory_set",
      "Store/update a durable project fact by key.",
      {
        key: z.string().describe("Short unique id, e.g. 'plan-tiers'"),
        category: z.string().describe("Category, e.g. 'gotchas'"),
        value: z.string().describe("The fact itself, in plain language"),
      },
      async ({ key, category, value }) => {
        const { data: existing } = await supabase.from("ProjectMemory").select("id").eq("key", key).maybeSingle();
        const now = new Date().toISOString();
        if (existing) {
          const { error } = await supabase.from("ProjectMemory").update({ category, value, updatedAt: now }).eq("id", existing.id);
          if (error) return { content: [{ type: "text", text: `Error updating memory: ${error.message}` }], isError: true };
          return { content: [{ type: "text", text: `Updated memory "${key}".` }] };
        }
        const { error } = await supabase.from("ProjectMemory").insert({ id: crypto.randomUUID(), key, category, value, createdAt: now, updatedAt: now });
        if (error) return { content: [{ type: "text", text: `Error saving memory: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: `Saved memory "${key}".` }] };
      }
    );

server.tool(
      "memory_get",
      "Fetch a project-memory fact by exact key.",
      { key: z.string() },
      async ({ key }) => {
        const { data, error } = await supabase.from("ProjectMemory").select("key, category, value, updatedAt").eq("key", key).maybeSingle();
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data) return { content: [{ type: "text", text: `No memory found for key "${key}".` }] };
        return { content: [{ type: "text", text: `[${data.category}] ${data.key}: ${data.value}\n(updated ${data.updatedAt})` }] };
      }
    );

server.tool(
      "memory_search",
      "Search project-memory facts by keyword.",
      { query: z.string() },
      async ({ query }) => {
        const { data, error } = await supabase
          .from("ProjectMemory")
          .select("key, category, value")
          .or(`key.ilike.%${query}%,category.ilike.%${query}%,value.ilike.%${query}%`)
          .limit(20);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data || data.length === 0) return { content: [{ type: "text", text: `No memory matched "${query}".` }] };
        return { content: [{ type: "text", text: data.map((d: any) => `[${d.category}] ${d.key}: ${d.value}`).join("\n") }] };
      }
    );

server.tool(
      "memory_bulk_set",
      "Store several project-memory facts at once.",
      { entries: z.array(z.object({ key: z.string(), category: z.string(), value: z.string() })).min(1).max(20) },
      async ({ entries }) => {
        const now = new Date().toISOString();
        let updated = 0, created = 0;
        for (const e of entries) {
          const { data: existing } = await supabase.from("ProjectMemory").select("id").eq("key", e.key).maybeSingle();
          if (existing) {
            await supabase.from("ProjectMemory").update({ category: e.category, value: e.value, updatedAt: now }).eq("id", (existing as any).id);
            updated++;
          } else {
            await supabase.from("ProjectMemory").insert({ id: crypto.randomUUID(), key: e.key, category: e.category, value: e.value, createdAt: now, updatedAt: now });
            created++;
          }
        }
        return { content: [{ type: "text", text: `Saved ${entries.length} memory entries (${created} new, ${updated} updated).` }] };
      }
    );

server.tool(
      "log_session_summary",
      "Record a summary of this session for future sessions.",
      {
        summary: z.string().describe("Session summary"),
        files_changed: z.string().optional().describe("Comma-separated list of files touched"),
        decisions: z.string().optional().describe("Key decisions made and why"),
        open_items: z.string().optional().describe("What's left unfinished or needs follow-up"),
      },
      async ({ summary, files_changed, decisions, open_items }) => {
        const { error } = await supabase.from("SessionLog").insert({
          id: crypto.randomUUID(),
          summary,
          filesChanged: files_changed ?? "",
          decisions: decisions ?? "",
          openItems: open_items ?? "",
          createdAt: new Date().toISOString(),
        });
        if (error) return { content: [{ type: "text", text: `Error logging session: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: "Session summary logged." }] };
      }
    );

server.tool(
      "get_recent_changes",
      "Get the N most recent session summaries.",
      { limit: z.number().int().min(1).max(50).optional().default(10) },
      async ({ limit }) => {
        const { data, error } = await supabase.from("SessionLog").select("summary, filesChanged, decisions, openItems, createdAt").order("createdAt", { ascending: false }).limit(limit);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data || data.length === 0) return { content: [{ type: "text", text: "No session logs recorded yet." }] };
        const text = data.map((s: any) => `[${s.createdAt}]\n${s.summary}${s.filesChanged ? `\nFiles: ${s.filesChanged}` : ""}${s.decisions ? `\nDecisions: ${s.decisions}` : ""}${s.openItems ? `\nOpen: ${s.openItems}` : ""}`).join("\n\n");
        return { content: [{ type: "text", text }] };
      }
    );

server.tool(
      "known_issue_action",
      "Create/update/resolve a known-issue record.",
      {
        action: z.enum(["create", "update", "resolve"]),
        id: z.string().optional().describe("Required for update/resolve — the issue id"),
        title: z.string().optional(),
        description: z.string().optional(),
        severity: z.enum(["low", "medium", "high", "critical"]).optional(),
        area: z.string().optional().describe("e.g. 'payments', 'auth', 'ci', 'testing'"),
      },
      async ({ action, id, title, description, severity, area }) => {
        const now = new Date().toISOString();
        if (action === "create") {
          if (!title) return { content: [{ type: "text", text: "title is required to create an issue." }], isError: true };
          const newId = crypto.randomUUID();
          const { error } = await supabase.from("KnownIssue").insert({
            id: newId, title, description: description ?? "", severity: severity ?? "medium", area: area ?? "general", status: "open", createdAt: now,
          });
          if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
          return { content: [{ type: "text", text: `Created known issue "${title}" (id: ${newId}).` }] };
        }
        if (!id) return { content: [{ type: "text", text: `id is required for action "${action}".` }], isError: true };
        if (action === "resolve") {
          const { error } = await supabase.from("KnownIssue").update({ status: "resolved", resolvedAt: now }).eq("id", id);
          if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
          return { content: [{ type: "text", text: `Marked issue ${id} as resolved.` }] };
        }
        const updates: Record<string, any> = {};
        if (title) updates.title = title;
        if (description) updates.description = description;
        if (severity) updates.severity = severity;
        if (area) updates.area = area;
        if (Object.keys(updates).length === 0) return { content: [{ type: "text", text: "No fields provided to update." }] };
        const { error } = await supabase.from("KnownIssue").update(updates).eq("id", id);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: `Updated issue ${id}.` }] };
      }
    );

server.tool(
      "search_known_issues",
      "Search all known issues by keyword.",
      { query: z.string() },
      async ({ query }) => {
        const { data, error } = await supabase.from("KnownIssue").select("id, title, description, severity, area, status").or(`title.ilike.%${query}%,description.ilike.%${query}%,area.ilike.%${query}%`).limit(20);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data || data.length === 0) return { content: [{ type: "text", text: `No issues matched "${query}".` }] };
        return { content: [{ type: "text", text: data.map((i: any) => `[${i.status}/${i.severity}] ${i.title} (${i.area}) — id:${i.id}`).join("\n") }] };
      }
    );

server.tool(
      "list_stale_open_issues",
      "List open known issues older than N days.",
      { days: z.number().optional().default(14) },
      async ({ days }) => {
        const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
        const { data, error } = await supabase.from("KnownIssue").select("id, title, severity, area, createdAt").eq("status", "open").lt("createdAt", cutoff).order("createdAt");
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data || data.length === 0) return { content: [{ type: "text", text: `No open issues older than ${days} days.` }] };
        return { content: [{ type: "text", text: data.map((i: any) => `[${i.severity}] ${i.title} (${i.area}) — open since ${i.createdAt}`).join("\n") }] };
      }
    );

server.tool(
      "get_test_coverage_snapshot",
      "Rough test-coverage proxy across route files.",
      {},
      async () => {
        async function listRecursive(path: string): Promise<string[]> {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, { headers: githubHeaders() });
          if (!res.ok) return [];
          const data = await res.json();
          if (!Array.isArray(data)) return [];
          let out: string[] = [];
          for (const item of data) {
            if (item.type === "dir") out = out.concat(await listRecursive(item.path));
            else out.push(item.path);
          }
          return out;
        }
        const apiFiles = (await listRecursive("src/app/api")).filter((p) => p.endsWith("route.ts"));
        const testSearchRes = await fetch(`${GITHUB_API}/search/code?q=extension:test.ts+repo:${GITHUB_OWNER}/${GITHUB_REPO}`, { headers: githubHeaders() });
        const testCount = testSearchRes.ok ? (await testSearchRes.json()).total_count ?? 0 : "unknown";
        return { content: [{ type: "text", text: `API route files: ${apiFiles.length}. Test files found (repo-wide search): ${testCount}.\n\nSample route files (first 20):\n${apiFiles.slice(0, 20).join("\n")}` }] };
      }
    );

server.tool(
      "check_dependency_vulnerabilities",
      "Check dependencies against OSV.dev for known CVEs.",
      {},
      async () => {
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/package.json`, { headers: githubHeaders() });
        if (!res.ok) return { content: [{ type: "text", text: `Couldn't read package.json: ${await res.text()}` }], isError: true };
        const data = await res.json();
        const pkg = JSON.parse(Buffer.from(data.content, "base64").toString("utf-8"));
        const deps = { ...pkg.dependencies, ...pkg.devDependencies };
        const entries = Object.entries(deps).slice(0, 60);
        try {
          const osvRes = await fetch("https://api.osv.dev/v1/querybatch", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ queries: entries.map(([name, version]) => ({ package: { name, ecosystem: "npm" }, version: String(version).replace(/^[\^~]/, "") })) }),
          });
          if (!osvRes.ok) return { content: [{ type: "text", text: `OSV query failed: ${await osvRes.text()}` }], isError: true };
          const result = await osvRes.json();
          const flagged: string[] = [];
          (result.results ?? []).forEach((r: any, i: number) => {
            if (r.vulns && r.vulns.length > 0) flagged.push(`${entries[i][0]}@${entries[i][1]}: ${r.vulns.map((v: any) => v.id).join(", ")}`);
          });
          return { content: [{ type: "text", text: flagged.length ? flagged.join("\n") : `No known vulnerabilities found across ${entries.length} checked dependencies.` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `OSV check failed (network?): ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );
  },
  {},
  { basePath: "/api/mcp-ops", maxDuration: 120, verboseLogs: true }
);

export { handler as GET, handler as POST, handler as DELETE };

// Minimal CORS preflight support (matches the original endpoint's patch).
export async function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "*",
      "Access-Control-Max-Age": "86400",
    },
  });
}
