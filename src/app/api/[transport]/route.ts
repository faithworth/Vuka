// app/api/[transport]/route.ts

import { createMcpHandler } from "mcp-handler";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { z } from "zod";

// ── TEMPORARY ChatGPT-connector compatibility patch (bootstrap) ──────────
// Added to get ChatGPT's remote MCP connector to accept this server without
// a full architectural redesign. Two independent things were fixed here:
//
// 1. `export const maxDuration` below — this is the actual Next.js/Vercel
//    route-segment config that extends the serverless function's real
//    execution timeout. The `maxDuration: 120` previously passed into
//    createMcpHandler's config object only controls mcp-handler's internal
//    Redis-backed SSE keep-alive timer — it does NOT change Vercel's function
//    timeout. Without this export, long-running tools (e.g.
//    github_regenerate_lockfile, which assumes ~120s of headroom) could be
//    killed by the account's default function timeout.
//
// 2. The `OPTIONS` export at the bottom of this file — the MCP route had no
//    CORS preflight handling. mcp-handler's built-in CORS headers only cover
//    its OAuth metadata endpoints, not the main tools/list-tools/call route,
//    in either mcp-handler v1 or v2. Added minimally so any browser-based MCP
//    client (not just server-to-server ones) can reach this endpoint.
//
// 3. Every tool `description` string (and the handful of longest parameter
//    `.describe()` strings) was shortened. This was the actual root cause of
//    ChatGPT refusing to create the connector at all: ChatGPT enforces a
//    combined token budget (~5,000 tokens) across every tool's name +
//    description + JSON schema in one manifest, and the original 81-tool
//    manifest measured at roughly 8,000-12,000 tokens by that reckoning.
//    Tool NAMES, PARAMETERS, and all business logic are unchanged — only the
//    descriptive text was trimmed. If a future redesign needs the fuller
//    explanations back for a specific tool, they're preserved in git history
//    on the commit that introduced this patch.
//
// This is intentionally a minimal, surgical patch, not a redesign. A future
// pass (modular tool registries, per-domain endpoints, richer metadata, etc.)
// is expected to happen separately, on top of a working ChatGPT connection.
// ───────────────────────────────────────────────────────────────────────

export const maxDuration = 120;

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Set these to match your actual repo if the defaults are wrong — check
// the URL on github.com, it's github.com/<OWNER>/<REPO>
const GITHUB_OWNER = process.env.GITHUB_REPO_OWNER ?? "faithworth";
const GITHUB_REPO = process.env.GITHUB_REPO_NAME ?? "Vuka";
const GITHUB_API = "https://api.github.com";

function githubHeaders() {
  return {
    Authorization: `Bearer ${process.env.GITHUB_TOKEN}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
}

async function writeAdminLog(action: string, targetType: string, targetId: string, notes: string) {
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

function validateReadOnlyQuery(query: string): string | null {
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

async function runReadOnlyQuery(query: string, rowLimit: number) {
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

const handler = createMcpHandler(
  (server) => {
    // --- Health check ---
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

    // --- Read-only SQL access ---
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

    // --- Artist revenue summary ---
    server.tool(
      "get_artist_summary",
      "Artist lookup: revenue, payout, plan status.",
      { query: z.string().describe("Artist name or slug to search for (partial match allowed)") },
      async ({ query }) => {
        const { data: artists, error: artistError } = await supabase
          .from("Artist")
          .select(
            "id, name, slug, isVerified, isFoundingArtist, planSlug, planExpiresAt, lifetimeGrossSales, currency, city, country, createdAt"
          )
          .or(`slug.eq.${query},name.ilike.%${query}%`)
          .limit(5);

        if (artistError) {
          return { content: [{ type: "text", text: `Error looking up artist: ${artistError.message}` }], isError: true };
        }
        if (!artists || artists.length === 0) {
          return { content: [{ type: "text", text: `No artist found matching "${query}".` }] };
        }
        if (artists.length > 1) {
          const list = artists.map((a) => `- ${a.name} (slug: ${a.slug})`).join("\n");
          return { content: [{ type: "text", text: `Multiple artists matched "${query}":\n${list}\n\nAsk again with the exact slug.` }] };
        }

        const artist = artists[0];
        const id = artist.id;

        const [purchases, tips, campaignData, marketOrders] = await Promise.all([
          supabase.from("Purchase").select("amount, netAmount, platformFee, status").eq("artistId", id),
          supabase.from("SupportTxn").select("amount, status").eq("artistId", id),
          supabase.from("campaigns").select("id").eq("artistId", id),
          supabase.from("MarketplaceOrder").select("packagePrice, netAmount, status").eq("sellerArtistId", id),
        ]);

        if (purchases.error) return { content: [{ type: "text", text: `Error loading purchases: ${purchases.error.message}` }], isError: true };
        if (tips.error) return { content: [{ type: "text", text: `Error loading tips: ${tips.error.message}` }], isError: true };
        if (marketOrders.error) return { content: [{ type: "text", text: `Error loading marketplace orders: ${marketOrders.error.message}` }], isError: true };

        const confirmedPurchases = (purchases.data ?? []).filter((p) => p.status === "confirmed");
        const confirmedTips = (tips.data ?? []).filter((t) => t.status === "confirmed");
        const confirmedOrders = (marketOrders.data ?? []).filter((o) => o.status === "active" || o.status === "completed");

        let campaignConfirmed = 0;
        let campaignPending = 0;
        const campaignIds = (campaignData.data ?? []).map((c) => c.id);
        if (campaignIds.length > 0) {
          const { data: backers, error: backersError } = await supabase
            .from("campaign_backers")
            .select("amount, status")
            .in("campaignId", campaignIds);
          if (backersError) {
            return { content: [{ type: "text", text: `Error loading campaign backers: ${backersError.message}` }], isError: true };
          }
          campaignConfirmed = (backers ?? []).filter((b) => b.status === "confirmed").reduce((s, b) => s + (b.amount ?? 0), 0);
          campaignPending = (backers ?? []).filter((b) => b.status === "pending").reduce((s, b) => s + (b.amount ?? 0), 0);
        }

        const purchaseTotal = confirmedPurchases.reduce((s, p) => s + (p.amount ?? 0), 0);
        const purchaseNet = confirmedPurchases.reduce((s, p) => s + (p.netAmount ?? 0), 0);
        const tipsTotal = confirmedTips.reduce((s, t) => s + (t.amount ?? 0), 0);
        const marketplaceTotal = confirmedOrders.reduce((s, o) => s + (o.packagePrice ?? 0), 0);

        const { data: payouts, error: payoutError } = await supabase
          .from("ArtistPayout")
          .select("amount, status")
          .eq("artistId", id);
        if (payoutError) return { content: [{ type: "text", text: `Error loading payouts: ${payoutError.message}` }], isError: true };

        const pendingPayouts = (payouts ?? []).filter((p) => p.status === "pending");
        const paidPayouts = (payouts ?? []).filter((p) => p.status === "paid" || p.status === "completed");

        const summary = {
          artist: {
            name: artist.name,
            slug: artist.slug,
            location: [artist.city, artist.country].filter(Boolean).join(", ") || "unknown",
            verified: artist.isVerified,
            foundingArtist: artist.isFoundingArtist,
            plan: artist.planSlug,
            planExpiresAt: artist.planExpiresAt,
            memberSince: artist.createdAt,
            currency: artist.currency ?? "ZAR",
          },
          revenueBySource: {
            beatAndReleaseSales: { count: confirmedPurchases.length, gross: purchaseTotal, netToArtist: purchaseNet },
            fanTips: { count: confirmedTips.length, gross: tipsTotal },
            crowdfunding: { confirmed: campaignConfirmed, stillPending: campaignPending },
            marketplaceServices: { count: confirmedOrders.length, gross: marketplaceTotal },
          },
          totalConfirmedRevenue: purchaseTotal + tipsTotal + campaignConfirmed + marketplaceTotal,
          lifetimeGrossSalesOnRecord: artist.lifetimeGrossSales,
          payouts: {
            totalPaidOut: paidPayouts.reduce((s, p) => s + (p.amount ?? 0), 0),
            totalPending: pendingPayouts.reduce((s, p) => s + (p.amount ?? 0), 0),
            pendingCount: pendingPayouts.length,
          },
          note: "totalConfirmedRevenue and lifetimeGrossSalesOnRecord may not match exactly — that gap is worth auditing separately.",
        };

        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      }
    );

    // --- Verify (or unverify) an artist's bank account ---
    server.tool(
      "verify_bank_account",
      "Verify/unverify an artist's bank account.",
      {
        artist_query: z.string().describe("Artist name or slug to search for"),
        verified: z.boolean().describe("true to verify, false to unverify"),
        bank_account_id: z.string().optional().describe("Bank account id, if artist has multiple accounts"),
        method: z.string().optional().describe("Verification method"),
        notes: z.string().optional().describe("Optional notes for the audit log"),
      },
      async ({ artist_query, verified, bank_account_id, method, notes }) => {
        const { data: artists, error: artistError } = await supabase
          .from("Artist")
          .select("id, name, slug")
          .or(`slug.eq.${artist_query},name.ilike.%${artist_query}%`)
          .limit(5);

        if (artistError) return { content: [{ type: "text", text: `Error looking up artist: ${artistError.message}` }], isError: true };
        if (!artists || artists.length === 0) return { content: [{ type: "text", text: `No artist found matching "${artist_query}".` }] };
        if (artists.length > 1) {
          const list = artists.map((a) => `- ${a.name} (slug: ${a.slug})`).join("\n");
          return { content: [{ type: "text", text: `Multiple artists matched "${artist_query}":\n${list}\n\nAsk again with the exact slug.` }] };
        }

        const artist = artists[0];

        const { data: accounts, error: acctError } = await supabase
          .from("ArtistBankAccount")
          .select("id, bankName, maskedNumber, accountHolder, isVerified, isDefault")
          .eq("artistId", artist.id);

        if (acctError) return { content: [{ type: "text", text: `Error loading bank accounts: ${acctError.message}` }], isError: true };
        if (!accounts || accounts.length === 0) return { content: [{ type: "text", text: `${artist.name} has no bank accounts on file.` }] };

        let target = accounts[0];
        if (accounts.length > 1) {
          if (!bank_account_id) {
            const list = accounts
              .map((a) => `- id: ${a.id} — ${a.bankName} ${a.maskedNumber} (${a.accountHolder}) — currently ${a.isVerified ? "verified" : "unverified"}${a.isDefault ? ", default" : ""}`)
              .join("\n");
            return { content: [{ type: "text", text: `${artist.name} has multiple bank accounts:\n${list}\n\nRe-run with bank_account_id set to the one you want.` }] };
          }
          const match = accounts.find((a) => a.id === bank_account_id);
          if (!match) return { content: [{ type: "text", text: `bank_account_id "${bank_account_id}" doesn't belong to ${artist.name}.` }] };
          target = match;
        }

        const { data: updated, error: updateError } = await supabase
          .from("ArtistBankAccount")
          .update({
            isVerified: verified,
            verifiedAt: verified ? new Date().toISOString() : null,
            verificationMethod: verified ? (method || "manual_admin_review") : null,
          })
          .eq("id", target.id)
          .select()
          .single();

        if (updateError) return { content: [{ type: "text", text: `Error updating bank account: ${updateError.message}` }], isError: true };

        await writeAdminLog(
          "payment.bank_account_verified",
          "ArtistBankAccount",
          target.id,
          `artist=${artist.name} verified=${verified} method=${method || "manual_admin_review"} ${notes || ""}`
        );

        return {
          content: [
            {
              type: "text",
              text: `${verified ? "Verified" : "Unverified"} bank account for ${artist.name}: ${target.bankName} ${target.maskedNumber}.\nverifiedAt: ${updated.verifiedAt ?? "null"}\n\nNote: verification doesn't bypass the 48h eligibility cooldown — payouts still check both.`,
            },
          ],
        };
      }
    );

    // --- Platform-wide metrics dashboard ---
    server.tool(
      "get_platform_metrics",
      "Platform snapshot: plans, GMV, payouts, signups.",
      {},
      async () => {
        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        const [artists, purchases, tips, backers, marketOrders, pendingPayouts, newUsers] = await Promise.all([
          supabase.from("Artist").select("planSlug"),
          supabase.from("Purchase").select("amount, status, createdAt").gte("createdAt", startOfMonth.toISOString()),
          supabase.from("SupportTxn").select("amount, status, createdAt").gte("createdAt", startOfMonth.toISOString()),
          supabase.from("campaign_backers").select("amount, status, createdAt").gte("createdAt", startOfMonth.toISOString()),
          supabase.from("MarketplaceOrder").select("packagePrice, status, createdAt").gte("createdAt", startOfMonth.toISOString()),
          supabase.from("PayoutRequest").select("amount, status").eq("status", "pending"),
          supabase.from("User").select("id, createdAt").gte("createdAt", sevenDaysAgo.toISOString()),
        ]);

        for (const [label, res] of Object.entries({ artists, purchases, tips, backers, marketOrders, pendingPayouts, newUsers })) {
          if ((res as any).error) {
            return { content: [{ type: "text", text: `Error loading ${label}: ${(res as any).error.message}` }], isError: true };
          }
        }

        const artistsByPlan: Record<string, number> = {};
        for (const a of artists.data ?? []) {
          artistsByPlan[a.planSlug] = (artistsByPlan[a.planSlug] ?? 0) + 1;
        }

        const gmv =
          (purchases.data ?? []).filter((p) => p.status === "confirmed").reduce((s, p) => s + (p.amount ?? 0), 0) +
          (tips.data ?? []).filter((t) => t.status === "confirmed").reduce((s, t) => s + (t.amount ?? 0), 0) +
          (backers.data ?? []).filter((b) => b.status === "confirmed").reduce((s, b) => s + (b.amount ?? 0), 0) +
          (marketOrders.data ?? []).filter((o) => o.status === "active" || o.status === "completed").reduce((s, o) => s + (o.packagePrice ?? 0), 0);

        const summary = {
          artistsByPlan,
          totalArtists: (artists.data ?? []).length,
          gmvThisMonth: Math.round(gmv * 100) / 100,
          pendingPayouts: {
            count: (pendingPayouts.data ?? []).length,
            totalAmount: (pendingPayouts.data ?? []).reduce((s, p) => s + (p.amount ?? 0), 0),
          },
          newSignupsLast7Days: (newUsers.data ?? []).length,
          asOf: new Date().toISOString(),
        };

        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      }
    );

    // --- Search users/accounts ---
    server.tool(
      "search_users",
      "Search user accounts by name/email.",
      { query: z.string().describe("Name or email substring to search for") },
      async ({ query }) => {
        const { data: users, error } = await supabase
          .from("User")
          .select("id, email, name, legalName, role, isSuspended, suspendedReason, createdAt")
          .or(`email.ilike.%${query}%,name.ilike.%${query}%`)
          .limit(10);

        if (error) return { content: [{ type: "text", text: `Error searching users: ${error.message}` }], isError: true };
        if (!users || users.length === 0) return { content: [{ type: "text", text: `No users found matching "${query}".` }] };

        const userIds = users.map((u) => u.id);
        const { data: artistLinks } = await supabase
          .from("Artist")
          .select("userId, name, slug, planSlug, isVerified")
          .in("userId", userIds);

        const results = users.map((u) => {
          const artist = artistLinks?.find((a) => a.userId === u.id);
          return {
            ...u,
            artistProfile: artist ? { name: artist.name, slug: artist.slug, plan: artist.planSlug, verified: artist.isVerified } : null,
          };
        });

        return { content: [{ type: "text", text: JSON.stringify(results, null, 2) }] };
      }
    );

    // --- Monthly revenue trend report ---
    server.tool(
      "get_revenue_report",
      "Monthly revenue trend for the last N months.",
      {
        months_back: z.number().int().min(1).max(24).optional().default(6).describe("How many months of history to include, max 24"),
      },
      async ({ months_back }) => {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months_back);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);

        const [purchases, tips, backers, marketOrders] = await Promise.all([
          supabase.from("Purchase").select("amount, status, createdAt").gte("createdAt", startDate.toISOString()),
          supabase.from("SupportTxn").select("amount, status, createdAt").gte("createdAt", startDate.toISOString()),
          supabase.from("campaign_backers").select("amount, status, createdAt").gte("createdAt", startDate.toISOString()),
          supabase.from("MarketplaceOrder").select("packagePrice, status, createdAt").gte("createdAt", startDate.toISOString()),
        ]);

        for (const [label, res] of Object.entries({ purchases, tips, backers, marketOrders })) {
          if ((res as any).error) {
            return { content: [{ type: "text", text: `Error loading ${label}: ${(res as any).error.message}` }], isError: true };
          }
        }

        const monthKey = (d: string) => d.slice(0, 7); // YYYY-MM
        const byMonth: Record<string, { purchases: number; tips: number; crowdfunding: number; marketplace: number }> = {};

        const bump = (date: string, field: "purchases" | "tips" | "crowdfunding" | "marketplace", amount: number) => {
          const k = monthKey(date);
          if (!byMonth[k]) byMonth[k] = { purchases: 0, tips: 0, crowdfunding: 0, marketplace: 0 };
          byMonth[k][field] += amount ?? 0;
        };

        for (const p of purchases.data ?? []) if (p.status === "confirmed") bump(p.createdAt, "purchases", p.amount);
        for (const t of tips.data ?? []) if (t.status === "confirmed") bump(t.createdAt, "tips", t.amount);
        for (const b of backers.data ?? []) if (b.status === "confirmed") bump(b.createdAt, "crowdfunding", b.amount);
        for (const o of marketOrders.data ?? []) if (o.status === "active" || o.status === "completed") bump(o.createdAt, "marketplace", o.packagePrice);

        const months = Object.keys(byMonth).sort();
        const report = months.map((m) => {
          const row = byMonth[m];
          const total = row.purchases + row.tips + row.crowdfunding + row.marketplace;
          return { month: m, ...row, total: Math.round(total * 100) / 100 };
        });

        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(
                { monthsIncluded: months.length, report, note: "Only confirmed/completed transactions counted. Currency assumed ZAR unless mixed." },
                null,
                2
              ),
            },
          ],
        };
      }
    );

    // --- VAT summary over a period ---
    server.tool(
      "get_vat_summary",
      "VAT breakdown for a period (15% SA default), not a filing.",
      {
        months_back: z.number().int().min(1).max(24).optional().default(1).describe("How many months back to include, max 24"),
        vat_rate: z.number().min(0).max(1).optional().default(0.15).describe("VAT rate as a decimal, defaults to South Africa's standard 15%"),
      },
      async ({ months_back, vat_rate }) => {
        const startDate = new Date();
        startDate.setMonth(startDate.getMonth() - months_back);
        startDate.setDate(1);
        startDate.setHours(0, 0, 0, 0);

        const [purchases, tips, backers, marketOrders] = await Promise.all([
          supabase.from("Purchase").select("amount, status, createdAt").gte("createdAt", startDate.toISOString()),
          supabase.from("SupportTxn").select("amount, status, createdAt").gte("createdAt", startDate.toISOString()),
          supabase.from("campaign_backers").select("amount, status, createdAt").gte("createdAt", startDate.toISOString()),
          supabase.from("MarketplaceOrder").select("packagePrice, status, createdAt").gte("createdAt", startDate.toISOString()),
        ]);

        for (const [label, res] of Object.entries({ purchases, tips, backers, marketOrders })) {
          if ((res as any).error) {
            return { content: [{ type: "text", text: `Error loading ${label}: ${(res as any).error.message}` }], isError: true };
          }
        }

        const grossRevenue =
          (purchases.data ?? []).filter((p) => p.status === "confirmed").reduce((s, p) => s + (p.amount ?? 0), 0) +
          (tips.data ?? []).filter((t) => t.status === "confirmed").reduce((s, t) => s + (t.amount ?? 0), 0) +
          (backers.data ?? []).filter((b) => b.status === "confirmed").reduce((s, b) => s + (b.amount ?? 0), 0) +
          (marketOrders.data ?? []).filter((o) => o.status === "active" || o.status === "completed").reduce((s, o) => s + (o.packagePrice ?? 0), 0);

        // Assumes prices are VAT-inclusive: gross = net * (1 + vat_rate)
        const netOfVat = grossRevenue / (1 + vat_rate);
        const vatPortion = grossRevenue - netOfVat;

        const summary = {
          periodMonthsBack: months_back,
          vatRateUsed: vat_rate,
          grossRevenue: Math.round(grossRevenue * 100) / 100,
          netOfVat: Math.round(netOfVat * 100) / 100,
          vatPortion: Math.round(vatPortion * 100) / 100,
          assumptions:
            "Prices assumed VAT-inclusive. This is a working estimate from platform revenue data only — it does not account for input VAT (deductible expenses), does not know whether Vuka is actually VAT-registered, and is not a SARS submission. Confirm with an accountant before filing anything.",
        };

        return { content: [{ type: "text", text: JSON.stringify(summary, null, 2) }] };
      }
    );

    // --- Signup-to-first-sale funnel ---
    server.tool(
      "get_conversion_funnel",
      "Signup-to-first-sale funnel snapshot.",
      {},
      async () => {
        const [totalUsers, artists, purchases] = await Promise.all([
          supabase.from("User").select("id", { count: "exact", head: true }),
          supabase.from("Artist").select("id"),
          supabase.from("Purchase").select("artistId, status").eq("status", "confirmed"),
        ]);

        if (totalUsers.error) return { content: [{ type: "text", text: `Error counting users: ${totalUsers.error.message}` }], isError: true };
        if (artists.error) return { content: [{ type: "text", text: `Error loading artists: ${artists.error.message}` }], isError: true };
        if (purchases.error) return { content: [{ type: "text", text: `Error loading purchases: ${purchases.error.message}` }], isError: true };

        const artistIds = new Set((artists.data ?? []).map((a) => a.id));
        const artistsWithSaleIds = new Set((purchases.data ?? []).map((p) => p.artistId));
        const artistsWithSale = [...artistsWithSaleIds].filter((id) => artistIds.has(id)).length;

        const totalUserCount = totalUsers.count ?? 0;
        const totalArtistCount = artistIds.size;

        const funnel = {
          totalUsers: totalUserCount,
          usersWithArtistProfile: totalArtistCount,
          artistsWithAtLeastOneConfirmedSale: artistsWithSale,
          conversionRates: {
            userToArtistPct: totalUserCount ? Math.round((totalArtistCount / totalUserCount) * 1000) / 10 : 0,
            artistToFirstSalePct: totalArtistCount ? Math.round((artistsWithSale / totalArtistCount) * 1000) / 10 : 0,
          },
        };

        return { content: [{ type: "text", text: JSON.stringify(funnel, null, 2) }] };
      }
    );

    // --- Draft a DMCA takedown notice (does not send) ---
    server.tool(
      "draft_dmca_notice",
      "Draft (not send) a DMCA notice for human review.",
      {
        release_query: z.string().describe("Release title or id to search for"),
        infringing_url: z.string().describe("URL where the infringing content was found"),
        platform_name: z.string().optional().describe("Platform hosting the content, e.g. 'YouTube'"),
      },
      async ({ release_query, infringing_url, platform_name }) => {
        const { data: releases, error } = await supabase
          .from("Release")
          .select("id, title, artistId, createdAt")
          .ilike("title", `%${release_query}%`)
          .limit(5);

        if (error) return { content: [{ type: "text", text: `Error looking up release: ${error.message}` }], isError: true };
        if (!releases || releases.length === 0) return { content: [{ type: "text", text: `No release found matching "${release_query}".` }] };
        if (releases.length > 1) {
          const list = releases.map((r) => `- ${r.title} (id: ${r.id})`).join("\n");
          return { content: [{ type: "text", text: `Multiple releases matched "${release_query}":\n${list}\n\nAsk again with the exact id.` }] };
        }

        const release = releases[0];
        const { data: artist, error: artistError } = await supabase
          .from("Artist")
          .select("id, name")
          .eq("id", release.artistId)
          .single();
        if (artistError) return { content: [{ type: "text", text: `Error loading artist: ${artistError.message}` }], isError: true };

        const today = new Date().toISOString().slice(0, 10);

        const notice = `DMCA TAKEDOWN NOTICE — DRAFT (review before sending)

Date: ${today}
To: ${platform_name || "[Platform legal/copyright team]"}

I am submitting this notice as the rights holder (or authorized representative) of the copyrighted work described below, released via Vuka Music.

Copyrighted work: "${release.title}" by ${artist.name}
Original release location: https://vukamusic.com (release id: ${release.id})
Copyright owner of record: [LEGAL RIGHTS HOLDER NAME — confirm against the artist's registered legal name before sending]

Infringing material located at: ${infringing_url}

I have a good faith belief that use of the copyrighted material described above is not authorized by the copyright owner, its agent, or the law.

I swear, under penalty of perjury, that the information in this notification is accurate and that I am the copyright owner or authorized to act on the copyright owner's behalf.

Signature: [YOUR FULL LEGAL NAME]
Contact: [YOUR CONTACT EMAIL]

---
This is a draft only. Verify the target platform's actual DMCA submission process — many require their own web form rather than email — fill in every bracketed field, and have the real rights holder review before sending. Nothing has been sent by generating this draft.`;

        return { content: [{ type: "text", text: notice }] };
      }
    );

    // --- Verification queue for fraud/risk review ---
    server.tool(
      "list_verification_queue",
      "List unverified artist bank accounts.",
      {},
      async () => {
        const { data: accounts, error } = await supabase
          .from("ArtistBankAccount")
          .select("id, artistId, bankName, maskedNumber, accountHolder, isVerified, eligibleForPayoutAt, createdAt")
          .eq("isVerified", false)
          .order("createdAt", { ascending: true });

        if (error) return { content: [{ type: "text", text: `Error loading verification queue: ${error.message}` }], isError: true };
        if (!accounts || accounts.length === 0) return { content: [{ type: "text", text: "Verification queue is empty — nothing pending." }] };

        const artistIds = [...new Set(accounts.map((a) => a.artistId))];
        const { data: artists } = await supabase.from("Artist").select("id, name, slug").in("id", artistIds);
        const artistById = new Map((artists ?? []).map((a) => [a.id, a]));

        const now = new Date();
        const queue = accounts.map((a) => {
          const artist = artistById.get(a.artistId);
          const eligible = a.eligibleForPayoutAt ? new Date(a.eligibleForPayoutAt) <= now : false;
          return {
            bankAccountId: a.id,
            artist: artist ? `${artist.name} (${artist.slug})` : a.artistId,
            bank: `${a.bankName} ${a.maskedNumber}`,
            accountHolder: a.accountHolder,
            readyForReview: eligible,
            eligibleForPayoutAt: a.eligibleForPayoutAt,
            addedAt: a.createdAt,
          };
        });

        return {
          content: [
            {
              type: "text",
              text: `${queue.length} account(s) pending verification (${queue.filter((q) => q.readyForReview).length} past cooldown, ready to review):\n\n${JSON.stringify(queue, null, 2)}`,
            },
          ],
        };
      }
    );

    // --- Read a file from the repo ---
    server.tool(
      "github_read_file",
      "Read a file's contents from the repo.",
      {
        path: z.string().describe("File path in the repo, e.g. 'app/api/[transport]/route.ts'"),
        branch: z.string().optional().default("main").describe("Branch to read from, defaults to main"),
      },
      async ({ path, branch }) => {
        const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${branch}`;
        const res = await fetch(url, { headers: githubHeaders() });

        if (res.status === 404) {
          return { content: [{ type: "text", text: `File not found: ${path} on branch ${branch}` }] };
        }
        if (!res.ok) {
          const errText = await res.text();
          return { content: [{ type: "text", text: `GitHub API error (${res.status}): ${errText}` }], isError: true };
        }

        const data = await res.json();
        const content = Buffer.from(data.content, "base64").toString("utf-8");

        return {
          content: [{ type: "text", text: `--- ${path} (sha: ${data.sha}) ---\n\n${content}` }],
        };
      }
    );

    // --- Commit a file change to the repo ---
    server.tool(
      "github_commit_file",
      "Commit a file directly (deploys if on main). Prefer branch+PR, or github_patch_file for large files.",
      {
        path: z.string().describe("File path in the repo, e.g. 'app/api/[transport]/route.ts'"),
        content: z.string().describe("The full new content of the file"),
        commit_message: z.string().describe("Clear, specific commit message describing the change"),
        branch: z.string().optional().default("main").describe("Branch to commit to, defaults to main"),
      },
      async ({ path, content, commit_message, branch }) => {
        const getUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${branch}`;
        const getRes = await fetch(getUrl, { headers: githubHeaders() });

        let sha: string | undefined;
        if (getRes.ok) {
          const existing = await getRes.json();
          sha = existing.sha;
        } else if (getRes.status !== 404) {
          const errText = await getRes.text();
          return { content: [{ type: "text", text: `Error checking existing file: ${errText}` }], isError: true };
        }

        const putUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`;
        const putRes = await fetch(putUrl, {
          method: "PUT",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            message: commit_message,
            content: Buffer.from(content, "utf-8").toString("base64"),
            branch,
            ...(sha ? { sha } : {}),
          }),
        });

        if (!putRes.ok) {
          const errText = await putRes.text();
          return { content: [{ type: "text", text: `GitHub commit failed (${putRes.status}): ${errText}` }], isError: true };
        }

        const result = await putRes.json();
        return {
          content: [
            {
              type: "text",
              text: `Committed successfully.\nFile: ${path}\nBranch: ${branch}\nCommit: ${result.commit?.sha}\nURL: ${result.commit?.html_url}\n\nVercel should pick this up and start a new deployment automatically if this is on main.`,
            },
          ],
        };
      }
    );

    // --- List files/directories in the repo ---
    server.tool(
      "github_list_files",
      "List files/subdirectories at a repo path.",
      {
        path: z.string().optional().default("").describe("Directory path, e.g. 'src/app/api'"),
        branch: z.string().optional().default("main").describe("Branch to list from, defaults to main"),
      },
      async ({ path, branch }) => {
        const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${branch}`;
        const res = await fetch(url, { headers: githubHeaders() });

        if (res.status === 404) {
          return { content: [{ type: "text", text: `Path not found: '${path}' on branch ${branch}` }] };
        }
        if (!res.ok) {
          const errText = await res.text();
          return { content: [{ type: "text", text: `GitHub API error (${res.status}): ${errText}` }], isError: true };
        }

        const data = await res.json();
        if (!Array.isArray(data)) {
          return { content: [{ type: "text", text: `'${path}' is a file, not a directory. Use github_read_file instead.` }] };
        }

        const dirs = data.filter((i: any) => i.type === "dir").map((i: any) => `📁 ${i.name}/`);
        const files = data.filter((i: any) => i.type === "file").map((i: any) => `📄 ${i.name}`);
        const listing = [...dirs.sort(), ...files.sort()].join("\n") || "(empty directory)";

        return { content: [{ type: "text", text: `Contents of '${path || "/"}' on ${branch}:\n\n${listing}` }] };
      }
    );

    // --- Search code across the repo ---
    server.tool(
      "github_search_code",
      "Search code across the repo.",
      {
        query: z.string().describe("Code search query, e.g. 'eligibleForPayoutAt' or 'requireAdmin'"),
      },
      async ({ query }) => {
        const url = `${GITHUB_API}/search/code?q=${encodeURIComponent(query)}+repo:${GITHUB_OWNER}/${GITHUB_REPO}`;
        const res = await fetch(url, { headers: githubHeaders() });

        if (!res.ok) {
          const errText = await res.text();
          return { content: [{ type: "text", text: `GitHub search error (${res.status}): ${errText}` }], isError: true };
        }

        const data = await res.json();
        if (!data.items || data.items.length === 0) {
          return { content: [{ type: "text", text: `No matches for "${query}".` }] };
        }

        const results = data.items.slice(0, 20).map((i: any) => `- ${i.path}`).join("\n");
        return { content: [{ type: "text", text: `${data.total_count} match(es) for "${query}" (showing up to 20):\n\n${results}` }] };
      }
    );

    // --- Create a new branch off an existing one ---
    server.tool(
      "github_create_branch",
      "Create a new branch (default base: main).",
      {
        branch_name: z.string().describe("Name for the new branch, e.g. 'fix/payout-cooldown-edge-case'"),
        from_branch: z.string().optional().default("main").describe("Branch to base the new branch on, defaults to main"),
      },
      async ({ branch_name, from_branch }) => {
        const refUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/${from_branch}`;
        const refRes = await fetch(refUrl, { headers: githubHeaders() });
        if (!refRes.ok) {
          const errText = await refRes.text();
          return { content: [{ type: "text", text: `Couldn't read base branch '${from_branch}': ${errText}` }], isError: true };
        }
        const refData = await refRes.json();
        const baseSha = refData.object.sha;

        const createUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs`;
        const createRes = await fetch(createUrl, {
          method: "POST",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ ref: `refs/heads/${branch_name}`, sha: baseSha }),
        });

        if (!createRes.ok) {
          const errText = await createRes.text();
          return { content: [{ type: "text", text: `Couldn't create branch '${branch_name}': ${errText}` }], isError: true };
        }

        return {
          content: [
            {
              type: "text",
              text: `Branch '${branch_name}' created from '${from_branch}' at ${baseSha.slice(0, 7)}.\nUse github_commit_file with branch: '${branch_name}' to make changes, then create_pull_request to open it for review.`,
            },
          ],
        };
      }
    );

    // --- Open a pull request ---
    server.tool(
      "create_pull_request",
      "Open a PR for human review before merging.",
      {
        title: z.string().describe("PR title"),
        head_branch: z.string().describe("The branch with your changes (created via github_create_branch)"),
        base_branch: z.string().optional().default("main").describe("Branch to merge into, defaults to main"),
        body: z.string().optional().describe("PR description — what changed and why"),
      },
      async ({ title, head_branch, base_branch, body }) => {
        const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls`;
        const res = await fetch(url, {
          method: "POST",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ title, head: head_branch, base: base_branch, body: body ?? "" }),
        });

        if (!res.ok) {
          const errText = await res.text();
          return { content: [{ type: "text", text: `Couldn't create PR: ${errText}` }], isError: true };
        }

        const pr = await res.json();
        return {
          content: [
            {
              type: "text",
              text: `Pull request opened: #${pr.number} — ${pr.title}\nURL: ${pr.html_url}\n${head_branch} → ${base_branch}\n\nThis is NOT deployed yet — review and merge on GitHub (or ask me to check it) when ready.`,
            },
          ],
        };
      }
    );

    // --- Check GitHub Actions CI status ---
    server.tool(
      "get_ci_status",
      "Check recent CI run status for a branch.",
      {
        branch: z.string().optional().default("main").describe("Branch to check runs for, defaults to main"),
        limit: z.number().int().min(1).max(10).optional().default(5).describe("How many recent runs to return, max 10"),
      },
      async ({ branch, limit }) => {
        const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?branch=${encodeURIComponent(branch)}&per_page=${limit}`;
        const res = await fetch(url, { headers: githubHeaders() });

        if (!res.ok) {
          const errText = await res.text();
          return { content: [{ type: "text", text: `GitHub Actions API error (${res.status}): ${errText}` }], isError: true };
        }

        const data = await res.json();
        if (!data.workflow_runs || data.workflow_runs.length === 0) {
          return { content: [{ type: "text", text: `No workflow runs found for branch '${branch}'. If this is the first commit since adding CI, it may still be starting.` }] };
        }

        const runs = data.workflow_runs.map((r: any) => ({
          id: r.id,
          workflow: r.name,
          status: r.status, // queued | in_progress | completed
          conclusion: r.conclusion, // success | failure | cancelled | null
          commit: r.head_sha.slice(0, 7),
          commitMessage: r.display_title,
          startedAt: r.run_started_at,
          url: r.html_url,
        }));

        const latest = runs[0];
        const summaryLine =
          latest.status !== "completed"
            ? `Latest run is still ${latest.status}.`
            : latest.conclusion === "success"
            ? "Latest run passed."
            : `Latest run ${latest.conclusion}. Run id: ${latest.id} — pass this to get_workflow_logs to see why.`;

        return {
          content: [{ type: "text", text: `${summaryLine}\n\n${JSON.stringify(runs, null, 2)}` }],
        };
      }
    );

    // --- Pull real failure output from a workflow run ---
    server.tool(
      "get_workflow_logs",
      "Get log output for a CI run's first failure.",
      {
        run_id: z.string().describe("The workflow run id, from get_ci_status output"),
      },
      async ({ run_id }) => {
        const jobsUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs/${run_id}/jobs`;
        const jobsRes = await fetch(jobsUrl, { headers: githubHeaders() });
        if (!jobsRes.ok) {
          const errText = await jobsRes.text();
          return { content: [{ type: "text", text: `Couldn't load jobs for run ${run_id}: ${errText}` }], isError: true };
        }
        const jobsData = await jobsRes.json();
        const jobs = jobsData.jobs ?? [];
        if (jobs.length === 0) {
          return { content: [{ type: "text", text: `No jobs found for run ${run_id}.` }] };
        }

        const failedJob = jobs.find((j: any) => j.conclusion === "failure") ?? jobs[0];

        const logsUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/jobs/${failedJob.id}/logs`;
        const logsRes = await fetch(logsUrl, { headers: githubHeaders() });
        if (!logsRes.ok) {
          const errText = await logsRes.text();
          return { content: [{ type: "text", text: `Couldn't fetch logs for job '${failedJob.name}': ${errText}` }], isError: true };
        }

        const fullLog = await logsRes.text();
        // Logs can be huge — return the tail, which is where the actual error almost always lives.
        const lines = fullLog.split("\n");
        const tail = lines.slice(-150).join("\n");

        const failedStep = (failedJob.steps ?? []).find((s: any) => s.conclusion === "failure");

        return {
          content: [
            {
              type: "text",
              text: `Job: ${failedJob.name} (${failedJob.conclusion})\n${failedStep ? `Failed step: ${failedStep.name}\n` : ""}\n--- Last ${Math.min(150, lines.length)} lines of log ---\n\n${tail}`,
            },
          ],
        };
      }
    );

    // --- Patch a file with targeted find/replace edits — no full-file content needed ---
    server.tool(
      "github_patch_file",
      "Edit a file via find/replace instead of full content. Fails if a match isn't unique.",
      {
        path: z.string().describe("File path in the repo"),
        edits: z
          .array(
            z.object({
              old_str: z.string().describe("Exact text to find, must be unique in the file"),
              new_str: z.string().describe("Text to replace it with"),
            })
          )
          .min(1)
          .describe("Find/replace edits, applied in order"),
        commit_message: z.string(),
        branch: z.string().optional().default("main"),
      },
      async ({ path, edits, commit_message, branch }) => {
        const getUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${branch}`;
        const getRes = await fetch(getUrl, { headers: githubHeaders() });
        if (!getRes.ok) {
          return { content: [{ type: "text", text: `Couldn't read ${path}: ${await getRes.text()}` }], isError: true };
        }
        const existing = await getRes.json();
        let content = Buffer.from(existing.content, "base64").toString("utf-8");

        const applied: string[] = [];
        for (const [i, edit] of edits.entries()) {
          const count = content.split(edit.old_str).length - 1;
          if (count === 0) {
            return {
              content: [{ type: "text", text: `Edit ${i + 1} of ${edits.length} failed: old_str not found in ${path}. No changes were committed (all-or-nothing). old_str was:\n\n${edit.old_str}` }],
              isError: true,
            };
          }
          if (count > 1) {
            return {
              content: [{ type: "text", text: `Edit ${i + 1} of ${edits.length} failed: old_str matches ${count} times in ${path}, must be unique. No changes were committed. old_str was:\n\n${edit.old_str}` }],
              isError: true,
            };
          }
          content = content.replace(edit.old_str, edit.new_str);
          applied.push(`Edit ${i + 1}: ${edit.old_str.length} chars → ${edit.new_str.length} chars`);
        }

        const putRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
          method: "PUT",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            message: commit_message,
            content: Buffer.from(content, "utf-8").toString("base64"),
            branch,
            sha: existing.sha,
          }),
        });
        if (!putRes.ok) {
          return { content: [{ type: "text", text: `All ${edits.length} edit(s) validated but the commit itself failed: ${await putRes.text()}` }], isError: true };
        }
        const result = await putRes.json();
        return {
          content: [
            {
              type: "text",
              text: `Patched ${path} (${edits.length} edit(s), no full-file content sent):\n${applied.join("\n")}\n\nCommit: ${result.commit?.sha}\nURL: ${result.commit?.html_url}`,
            },
          ],
        };
      }
    );

    // --- Delete a file for real, not just neutralize it ---
    server.tool(
      "github_delete_file",
      "Delete a file from the repo.",
      {
        path: z.string(),
        commit_message: z.string(),
        branch: z.string().optional().default("main"),
      },
      async ({ path, commit_message, branch }) => {
        const getUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${branch}`;
        const getRes = await fetch(getUrl, { headers: githubHeaders() });
        if (getRes.status === 404) {
          return { content: [{ type: "text", text: `${path} doesn't exist on ${branch} — nothing to delete.` }] };
        }
        if (!getRes.ok) {
          return { content: [{ type: "text", text: `Couldn't look up ${path}: ${await getRes.text()}` }], isError: true };
        }
        const existing = await getRes.json();
        const delRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, {
          method: "DELETE",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ message: commit_message, sha: existing.sha, branch }),
        });
        if (!delRes.ok) {
          return { content: [{ type: "text", text: `Delete failed: ${await delRes.text()}` }], isError: true };
        }
        const result = await delRes.json();
        return { content: [{ type: "text", text: `Deleted ${path} from ${branch}.\nCommit: ${result.commit?.sha}` }] };
      }
    );

    // --- Read only a line range from a large file ---
    server.tool(
      "github_read_file_range",
      "Read a specific line range from a file.",
      {
        path: z.string(),
        start_line: z.number().int().min(1),
        end_line: z.number().int().min(1),
        branch: z.string().optional().default("main"),
      },
      async ({ path, start_line, end_line, branch }) => {
        const url = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${branch}`;
        const res = await fetch(url, { headers: githubHeaders() });
        if (!res.ok) {
          return { content: [{ type: "text", text: `Couldn't read ${path}: ${await res.text()}` }], isError: true };
        }
        const data = await res.json();
        const lines = Buffer.from(data.content, "base64").toString("utf-8").split("\n");
        const slice = lines
          .slice(Math.max(0, start_line - 1), end_line)
          .map((l: string, i: number) => `${start_line + i}\t${l}`)
          .join("\n");
        return {
          content: [
            {
              type: "text",
              text: `${path} — lines ${start_line}-${Math.min(end_line, lines.length)} of ${lines.length} total (sha: ${data.sha}):\n\n${slice}`,
            },
          ],
        };
      }
    );

    // --- Atomic multi-file commit ---
    server.tool(
      "github_batch_commit",
      "Commit multiple files atomically.",
      {
        files: z
          .array(
            z.object({
              path: z.string(),
              content: z.string().optional().describe("New content — omit only when action is 'delete'"),
              action: z.enum(["create", "update", "delete"]).default("update"),
            })
          )
          .min(1)
          .max(20),
        commit_message: z.string(),
        branch: z.string().optional().default("main"),
      },
      async ({ files, commit_message, branch }) => {
        const refRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/ref/heads/${branch}`, { headers: githubHeaders() });
        if (!refRes.ok) return { content: [{ type: "text", text: `Couldn't read branch ${branch}: ${await refRes.text()}` }], isError: true };
        const refData = await refRes.json();
        const baseCommitSha = refData.object.sha;

        const baseCommitRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits/${baseCommitSha}`, { headers: githubHeaders() });
        if (!baseCommitRes.ok) return { content: [{ type: "text", text: `Couldn't read base commit: ${await baseCommitRes.text()}` }], isError: true };
        const baseCommitData = await baseCommitRes.json();
        const baseTreeSha = baseCommitData.tree.sha;

        const treeEntries: any[] = [];
        for (const f of files) {
          if (f.action === "delete") {
            treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: null });
            continue;
          }
          if (f.content === undefined) {
            return { content: [{ type: "text", text: `File ${f.path} has action '${f.action}' but no content was provided.` }], isError: true };
          }
          const blobRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/blobs`, {
            method: "POST",
            headers: { ...githubHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ content: f.content, encoding: "utf-8" }),
          });
          if (!blobRes.ok) return { content: [{ type: "text", text: `Blob creation failed for ${f.path}: ${await blobRes.text()}` }], isError: true };
          const blobData = await blobRes.json();
          treeEntries.push({ path: f.path, mode: "100644", type: "blob", sha: blobData.sha });
        }

        const treeRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees`, {
          method: "POST",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ base_tree: baseTreeSha, tree: treeEntries }),
        });
        if (!treeRes.ok) return { content: [{ type: "text", text: `Tree creation failed: ${await treeRes.text()}` }], isError: true };
        const treeData = await treeRes.json();

        const commitRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/commits`, {
          method: "POST",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ message: commit_message, tree: treeData.sha, parents: [baseCommitSha] }),
        });
        if (!commitRes.ok) return { content: [{ type: "text", text: `Commit creation failed: ${await commitRes.text()}` }], isError: true };
        const commitData = await commitRes.json();

        const updateRefRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/refs/heads/${branch}`, {
          method: "PATCH",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({ sha: commitData.sha }),
        });
        if (!updateRefRes.ok) return { content: [{ type: "text", text: `Files were committed but the branch ref update failed (branch may be behind): ${await updateRefRes.text()}` }], isError: true };

        return {
          content: [
            {
              type: "text",
              text: `Committed ${files.length} file(s) in one atomic commit.\nCommit: ${commitData.sha}\nURL: https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/commit/${commitData.sha}\n\n${files.map((f) => `${f.action}: ${f.path}`).join("\n")}`,
            },
          ],
        };
      }
    );

    // --- Regenerate package-lock.json server-side, without routing its content through the model ---
    server.tool(
      "github_regenerate_lockfile",
      "Regenerate package-lock.json via npm install. Experimental.",
      {
        branch: z.string().optional().default("main"),
        commit_message: z.string().optional().default("chore: regenerate package-lock.json"),
      },
      async ({ branch, commit_message }) => {
        const pkgRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/package.json?ref=${branch}`, { headers: githubHeaders() });
        if (!pkgRes.ok) return { content: [{ type: "text", text: `Couldn't read package.json: ${await pkgRes.text()}` }], isError: true };
        const pkgData = await pkgRes.json();
        const pkgContent = Buffer.from(pkgData.content, "base64").toString("utf-8");

        const os = await import("os");
        const fs = await import("fs/promises");
        const nodePath = await import("path");
        const { execFile } = await import("child_process");
        const { promisify } = await import("util");
        const execFileAsync = promisify(execFile);

        const tmpDir = await fs.mkdtemp(nodePath.join(os.tmpdir(), "vuka-lock-"));
        await fs.writeFile(nodePath.join(tmpDir, "package.json"), pkgContent);

        try {
          await execFileAsync("npm", ["install", "--package-lock-only", "--no-audit", "--no-fund"], {
            cwd: tmpDir,
            timeout: 100_000,
          });
        } catch (err: any) {
          await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
          return {
            content: [
              {
                type: "text",
                text: `npm install failed inside this serverless sandbox: ${err?.message ?? String(err)}\n\nIf npm isn't invocable here (likely on some serverless runtimes), this has to be done on a real machine (developer laptop or a separate CI job with shell access) instead — this endpoint isn't the only path to a valid lockfile.`,
              },
            ],
            isError: true,
          };
        }

        const lockContent = await fs.readFile(nodePath.join(tmpDir, "package-lock.json"), "utf-8");
        await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});

        const getUrl = `${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/package-lock.json?ref=${branch}`;
        const getRes = await fetch(getUrl, { headers: githubHeaders() });
        const sha = getRes.ok ? (await getRes.json()).sha : undefined;

        const putRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/package-lock.json`, {
          method: "PUT",
          headers: { ...githubHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify({
            message: commit_message,
            content: Buffer.from(lockContent, "utf-8").toString("base64"),
            branch,
            ...(sha ? { sha } : {}),
          }),
        });
        if (!putRes.ok) {
          return { content: [{ type: "text", text: `Lockfile generated (${lockContent.length} bytes) but the commit failed: ${await putRes.text()}` }], isError: true };
        }
        const result = await putRes.json();
        return {
          content: [
            {
              type: "text",
              text: `Regenerated package-lock.json (${lockContent.length} bytes, never sent through the model) and committed it.\nCommit: ${result.commit?.sha}\n\nCI can now be switched from 'npm install' back to 'npm ci'.`,
            },
          ],
        };
      }
    );

    // --- Project memory: persistent context across sessions/chats ---
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
      "repo_map",
      "Top-level repo map in one call.",
      {},
      async () => {
        async function listDir(path: string) {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}`, { headers: githubHeaders() });
          if (!res.ok) return [] as string[];
          const data = await res.json();
          return Array.isArray(data) ? data.map((d: any) => `${d.type === "dir" ? "📁" : "📄"} ${d.name}`) : [];
        }
        const [root, apiRoutes] = await Promise.all([listDir(""), listDir("src/app/api")]);
        return {
          content: [
            {
              type: "text",
              text: `# Repo root\n${root.join("\n")}\n\n# API route groups (src/app/api)\n${apiRoutes.join("\n")}`,
            },
          ],
        };
      }
    );

    // --- IT-ops diagnostic tools ---
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
      "audit_plan_gating",
      "Find artists past plan expiry still on paid plans.",
      {},
      async () => {
        const { data, error } = await supabase.from("Artist").select("id, name, slug, planSlug, planExpiresAt").neq("planSlug", "free").not("planExpiresAt", "is", null).lt("planExpiresAt", new Date().toISOString()).limit(50);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data || data.length === 0) return { content: [{ type: "text", text: "No plan-gating drift found — all expired plans have been downgraded." }] };
        return { content: [{ type: "text", text: data.map((a: any) => `${a.name} (${a.slug}): still on ${a.planSlug}, expired ${a.planExpiresAt}`).join("\n") }] };
      }
    );

    server.tool(
      "verify_payout_integrity",
      "Flag artists with revenue but no payout record.",
      { min_revenue: z.number().optional().default(100).describe("Minimum confirmed revenue to flag") },
      async ({ min_revenue }) => {
        const { data: purchases, error: pErr } = await supabase.from("Purchase").select("artistId, netAmount, status").eq("status", "confirmed");
        if (pErr) return { content: [{ type: "text", text: `Error: ${pErr.message}` }], isError: true };
        const revenueByArtist: Record<string, number> = {};
        for (const p of (purchases ?? []) as any[]) revenueByArtist[p.artistId] = (revenueByArtist[p.artistId] ?? 0) + (p.netAmount ?? 0);
        const artistIds = Object.keys(revenueByArtist).filter((id) => revenueByArtist[id] >= min_revenue);
        if (artistIds.length === 0) return { content: [{ type: "text", text: "No artists above the revenue threshold." }] };
        const { data: payouts, error: payErr } = await supabase.from("ArtistPayout").select("artistId").in("artistId", artistIds);
        if (payErr) return { content: [{ type: "text", text: `Error: ${payErr.message}` }], isError: true };
        const paidOut = new Set((payouts ?? []).map((p: any) => p.artistId));
        const flagged = artistIds.filter((id) => !paidOut.has(id));
        if (flagged.length === 0) return { content: [{ type: "text", text: "Every artist above the threshold has at least one payout record." }] };
        const { data: names } = await supabase.from("Artist").select("id, name, slug").in("id", flagged);
        const nameMap: Record<string, string> = {};
        for (const n of (names ?? []) as any[]) nameMap[n.id] = `${n.name} (${n.slug})`;
        return { content: [{ type: "text", text: flagged.map((id) => `${nameMap[id] ?? id}: R${revenueByArtist[id].toFixed(2)} confirmed revenue, zero payout records`).join("\n") }] };
      }
    );

    server.tool(
      "get_billing_status",
      "Billing snapshot: active/cancelled/failed, auto-renew status.",
      {},
      async () => {
        const { data, error } = await supabase.from("artist_plan_subscriptions").select("status, planSlug, failReason");
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        const counts: Record<string, number> = {};
        for (const s of (data ?? []) as any[]) counts[s.status] = (counts[s.status] ?? 0) + 1;
        const failReasons = (data ?? []).filter((s: any) => s.failReason).map((s: any) => s.failReason);
        return { content: [{ type: "text", text: `Subscription status counts: ${JSON.stringify(counts)}\nRecorded failure reasons: ${failReasons.length ? failReasons.join(", ") : "none"}\n\nGap: no automated cron currently re-charges artist_plan_subscriptions.paystackToken when currentPeriodEnd passes. src/app/api/cron/expire-plans only downgrades to Free — it never attempts a renewal charge. True auto-billing needs a cron that: (1) finds subscriptions with currentPeriodEnd <= now and status='active', (2) charges paystackToken via Paystack's charge-authorization API, (3) on success extends currentPeriodEnd, (4) on failure sets failedAt/failReason and retries or downgrades after N attempts.` }] };
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

    server.tool(
      "find_todos_and_fixmes",
      "Search repo for TODO/FIXME comments.",
      {},
      async () => {
        const markers = ["TODO", "FIXME", "HACK", "XXX"];
        const results: string[] = [];
        for (const marker of markers) {
          const res = await fetch(`${GITHUB_API}/search/code?q=${encodeURIComponent(marker)}+repo:${GITHUB_OWNER}/${GITHUB_REPO}`, { headers: githubHeaders() });
          if (!res.ok) continue;
          const data = await res.json();
          for (const item of (data.items ?? []).slice(0, 15)) results.push(`[${marker}] ${item.path}`);
        }
        if (results.length === 0) return { content: [{ type: "text", text: "No TODO/FIXME/HACK/XXX markers found (or GitHub code search unavailable)." }] };
        return { content: [{ type: "text", text: results.join("\n") }] };
      }
    );

    server.tool(
      "find_large_files",
      "List repo files above a size threshold.",
      { min_kb: z.number().optional().default(100) },
      async ({ min_kb }) => {
        const branchRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/branches/main`, { headers: githubHeaders() });
        if (!branchRes.ok) return { content: [{ type: "text", text: `Couldn't read branch: ${await branchRes.text()}` }], isError: true };
        const branchData = await branchRes.json();
        const treeSha = branchData.commit.commit.tree.sha;
        const treeRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/git/trees/${treeSha}?recursive=1`, { headers: githubHeaders() });
        if (!treeRes.ok) return { content: [{ type: "text", text: `Couldn't read tree: ${await treeRes.text()}` }], isError: true };
        const treeData = await treeRes.json();
        const big = (treeData.tree ?? []).filter((t: any) => t.type === "blob" && t.size && t.size >= min_kb * 1024).sort((a: any, b: any) => b.size - a.size).slice(0, 40);
        if (big.length === 0) return { content: [{ type: "text", text: `No files >= ${min_kb}KB found.` }] };
        return { content: [{ type: "text", text: big.map((f: any) => `${(f.size / 1024).toFixed(0)}KB — ${f.path}`).join("\n") }] };
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
      "search_repo_batch",
      "Run multiple code searches in one call.",
      { queries: z.array(z.string()).min(1).max(10) },
      async ({ queries }) => {
        const sections: string[] = [];
        for (const q of queries) {
          const res = await fetch(`${GITHUB_API}/search/code?q=${encodeURIComponent(q)}+repo:${GITHUB_OWNER}/${GITHUB_REPO}`, { headers: githubHeaders() });
          if (!res.ok) { sections.push(`"${q}": search failed`); continue; }
          const data = await res.json();
          const paths = (data.items ?? []).slice(0, 10).map((i: any) => i.path);
          sections.push(`"${q}" (${data.total_count ?? 0} total): ${paths.join(", ") || "no matches"}`);
        }
        return { content: [{ type: "text", text: sections.join("\n") }] };
      }
    );

    server.tool(
      "get_changelog",
      "Changelog between two git refs.",
      { base: z.string().describe("Older ref"), head: z.string().optional().default("main") },
      async ({ base, head }) => {
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${base}...${head}`, { headers: githubHeaders() });
        if (!res.ok) return { content: [{ type: "text", text: `Compare failed: ${await res.text()}` }], isError: true };
        const data = await res.json();
        const commits = (data.commits ?? []).map((c: any) => `- ${c.commit.message.split("\n")[0]} (${c.sha.slice(0, 7)})`).join("\n");
        const files = (data.files ?? []).slice(0, 30).map((f: any) => `${f.status}: ${f.filename}`).join("\n");
        return { content: [{ type: "text", text: `${data.ahead_by} commits ahead, ${data.behind_by} behind.\n\nCommits:\n${commits}\n\nFiles changed (first 30):\n${files}` }] };
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

    // --- Additional dev-efficiency tools ---
    server.tool(
      "batch_read_files",
      "Read multiple repo files in one call.",
      { paths: z.array(z.string()).min(1).max(15), branch: z.string().optional().default("main") },
      async ({ paths, branch }) => {
        const sections: string[] = [];
        for (const path of paths) {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${branch}`, { headers: githubHeaders() });
          if (!res.ok) { sections.push(`--- ${path} ---\n(couldn't read: ${res.status})`); continue; }
          const data = await res.json();
          if (data.size > 30000) { sections.push(`--- ${path} ---\n(${data.size} bytes, too large — use github_read_file_range)`); continue; }
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          sections.push(`--- ${path} ---\n${content}`);
        }
        return { content: [{ type: "text", text: sections.join("\n\n") }] };
      }
    );

    server.tool(
      "list_recent_commits",
      "List the N most recent commits.",
      { branch: z.string().optional().default("main"), limit: z.number().int().min(1).max(50).optional().default(10) },
      async ({ branch, limit }) => {
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=${branch}&per_page=${limit}`, { headers: githubHeaders() });
        if (!res.ok) return { content: [{ type: "text", text: `Failed: ${await res.text()}` }], isError: true };
        const data = await res.json();
        return { content: [{ type: "text", text: data.map((c: any) => `${c.sha.slice(0,7)} ${c.commit.message.split("\n")[0]} (${c.commit.author.name}, ${c.commit.author.date})`).join("\n") }] };
      }
    );

    server.tool(
      "list_open_prs",
      "List open pull requests.",
      {},
      async () => {
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=open&per_page=20`, { headers: githubHeaders() });
        if (!res.ok) return { content: [{ type: "text", text: `Failed: ${await res.text()}` }], isError: true };
        const prs = await res.json();
        if (prs.length === 0) return { content: [{ type: "text", text: "No open pull requests." }] };
        return { content: [{ type: "text", text: prs.map((p: any) => `#${p.number} ${p.title} (${p.head.ref} -> ${p.base.ref}), updated ${p.updated_at}`).join("\n") }] };
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
      "get_deployment_drift",
      "Check if main has commits ahead of CI.",
      {},
      async () => {
        const commitsRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?sha=main&per_page=1`, { headers: githubHeaders() });
        const runsRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/actions/runs?branch=main&per_page=1&status=completed`, { headers: githubHeaders() });
        if (!commitsRes.ok || !runsRes.ok) return { content: [{ type: "text", text: "Couldn't check drift (GitHub API error)." }], isError: true };
        const commits = await commitsRes.json();
        const runs = await runsRes.json();
        const latestSha = commits[0]?.sha;
        const lastVerifiedSha = runs.workflow_runs?.[0]?.head_sha;
        const drift = latestSha !== lastVerifiedSha;
        return { content: [{ type: "text", text: `Latest commit on main: ${latestSha?.slice(0,7)}\nLast completed CI run was for: ${lastVerifiedSha?.slice(0,7) ?? "unknown"}\n${drift ? "DRIFT: newer commit(s) may not be CI-verified yet." : "In sync — latest commit has a completed CI run."}` }] };
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
      "diff_file_between_refs",
      "Show if a file differs between two refs.",
      { path: z.string(), base: z.string(), head: z.string().optional().default("main") },
      async ({ path, base, head }) => {
        const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/compare/${base}...${head}`, { headers: githubHeaders() });
        if (!res.ok) return { content: [{ type: "text", text: `Compare failed: ${await res.text()}` }], isError: true };
        const data = await res.json();
        const file = (data.files ?? []).find((f: any) => f.filename === path);
        if (!file) return { content: [{ type: "text", text: `"${path}" is unchanged between ${base} and ${head}.` }] };
        return { content: [{ type: "text", text: `${file.status}, +${file.additions}/-${file.deletions}\n\n${file.patch ?? "(no inline patch available, file may be too large or binary)"}` }] };
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

    // ── PR safety / verification tools ──────────────────────────────
    // Built specifically to catch the failure modes that have actually
    // happened on this project: unmerged safety fixes sitting idle, a
    // change described as bigger/different than what it actually was,
    // and payment/auth code shipping without tests.

    server.tool(
      "merge_pull_request",
      "Merge a PR. Refuses if CI fails, or touches payment/auth paths without confirm_sensitive:true.",
      { pr_number: z.number(), confirm_sensitive: z.boolean().optional().default(false), merge_method: z.enum(["merge", "squash", "rebase"]).optional().default("squash") },
      async ({ pr_number, confirm_sensitive, merge_method }) => {
        try {
          const prRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}`, { headers: githubHeaders() });
          if (!prRes.ok) return { content: [{ type: "text", text: `Could not fetch PR #${pr_number}: ${await prRes.text()}` }], isError: true };
          const pr = await prRes.json();
          if (pr.state !== "open") return { content: [{ type: "text", text: `PR #${pr_number} is not open (state: ${pr.state}).` }], isError: true };

          const statusRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${pr.head.sha}/check-runs`, { headers: githubHeaders() });
          const statusData = await statusRes.json().catch(() => ({ check_runs: [] }));
          const runs = statusData.check_runs ?? [];
          if (runs.length === 0) {
            return { content: [{ type: "text", text: `No CI check runs found for PR #${pr_number}'s head commit — refusing to merge without confirmed CI. Check manually first.` }], isError: true };
          }
          const notGreen = runs.filter((r: any) => r.status !== "completed" || r.conclusion !== "success");
          if (notGreen.length > 0) {
            return { content: [{ type: "text", text: `Refusing to merge PR #${pr_number} — CI not fully green: ${notGreen.map((r: any) => `${r.name}: ${r.status}/${r.conclusion}`).join(", ")}` }], isError: true };
          }

          const filesRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}/files?per_page=100`, { headers: githubHeaders() });
          const files = await filesRes.json().catch(() => []);
          const sensitivePattern = /payment|paystack|paypal|billing|subscri|auth|webhook|cron|payout/i;
          const sensitiveFiles = (files as any[]).filter((f) => sensitivePattern.test(f.filename)).map((f) => f.filename);
          if (sensitiveFiles.length > 0 && !confirm_sensitive) {
            return { content: [{ type: "text", text: `PR #${pr_number} touches payment/auth/webhook/cron paths (${sensitiveFiles.join(", ")}). Refusing to auto-merge. Re-call with confirm_sensitive: true only after a human has actually reviewed the diff.` }], isError: true };
          }

          const mergeRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}/merge`, {
            method: "PUT",
            headers: { ...githubHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ merge_method }),
          });
          const mergeData = await mergeRes.json();
          if (!mergeRes.ok) return { content: [{ type: "text", text: `Merge failed: ${mergeData.message ?? JSON.stringify(mergeData)}` }], isError: true };
          await writeAdminLog("pr.merged", "PullRequest", String(pr_number), `Merged PR #${pr_number} (${merge_method})${sensitiveFiles.length ? `, sensitive paths confirmed: ${sensitiveFiles.join(", ")}` : ""}`);
          return { content: [{ type: "text", text: `Merged PR #${pr_number}: ${mergeData.sha}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "close_pull_request",
      "Close a PR without merging.",
      { pr_number: z.number(), reason: z.string().optional() },
      async ({ pr_number, reason }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}`, {
            method: "PATCH",
            headers: { ...githubHeaders(), "Content-Type": "application/json" },
            body: JSON.stringify({ state: "closed" }),
          });
          if (!res.ok) return { content: [{ type: "text", text: `Close failed: ${await res.text()}` }], isError: true };
          if (reason) {
            await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/issues/${pr_number}/comments`, {
              method: "POST",
              headers: { ...githubHeaders(), "Content-Type": "application/json" },
              body: JSON.stringify({ body: `Closed without merging: ${reason}` }),
            });
          }
          await writeAdminLog("pr.closed", "PullRequest", String(pr_number), reason ?? "no reason given");
          return { content: [{ type: "text", text: `Closed PR #${pr_number}.` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "get_pr_ci_status",
      "CI status for a PR by number.",
      { pr_number: z.number() },
      async ({ pr_number }) => {
        try {
          const prRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}`, { headers: githubHeaders() });
          if (!prRes.ok) return { content: [{ type: "text", text: `PR not found: ${await prRes.text()}` }], isError: true };
          const pr = await prRes.json();
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${pr.head.sha}/check-runs`, { headers: githubHeaders() });
          const data = await res.json();
          const runs = (data.check_runs ?? []).map((r: any) => `${r.name}: ${r.status}/${r.conclusion ?? "pending"}`);
          return { content: [{ type: "text", text: runs.length ? runs.join("\n") : "No check runs found yet." }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "get_pr_diff_summary",
      "Files changed in a PR with add/delete counts.",
      { pr_number: z.number() },
      async ({ pr_number }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}/files?per_page=100`, { headers: githubHeaders() });
          if (!res.ok) return { content: [{ type: "text", text: `Error: ${await res.text()}` }], isError: true };
          const files = await res.json();
          const summary = (files as any[]).map((f) => `${f.status} ${f.filename} (+${f.additions}/-${f.deletions})`).join("\n");
          return { content: [{ type: "text", text: `${files.length} files changed:\n${summary}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "check_money_auth_touch",
      "Flag whether a PR touches payment/auth paths.",
      { pr_number: z.number() },
      async ({ pr_number }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}/files?per_page=100`, { headers: githubHeaders() });
          const files = await res.json();
          const pattern = /payment|paystack|paypal|billing|subscri|auth|webhook|cron|payout/i;
          const hits = (files as any[]).filter((f) => pattern.test(f.filename)).map((f) => f.filename);
          return { content: [{ type: "text", text: hits.length ? `SENSITIVE — touches: ${hits.join(", ")}` : "No payment/auth/webhook/cron paths touched." }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "check_new_code_has_tests",
      "Flag whether a PR's changes include tests.",
      { pr_number: z.number() },
      async ({ pr_number }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}/files?per_page=100`, { headers: githubHeaders() });
          const files = (await res.json()) as any[];
          const codeFiles = files.filter((f) => /^src\/(lib|app\/api)\//.test(f.filename) && !f.filename.includes(".test.") && (f.filename.endsWith(".ts") || f.filename.endsWith(".tsx")));
          const testFiles = files.filter((f) => f.filename.includes(".test."));
          if (codeFiles.length === 0) return { content: [{ type: "text", text: "No src/lib or src/app/api code changes to check." }] };
          if (testFiles.length === 0) return { content: [{ type: "text", text: `WARNING: ${codeFiles.length} code file(s) changed (${codeFiles.map((f) => f.filename).join(", ")}) with ZERO test files touched in this PR.` }], isError: true };
          return { content: [{ type: "text", text: `${codeFiles.length} code file(s) changed, ${testFiles.length} test file(s) touched: ${testFiles.map((f) => f.filename).join(", ")}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "verify_diff_matches_claim",
      "Cross-check claimed changes against the real PR diff.",
      { pr_number: z.number(), claimed_files: z.array(z.string()) },
      async ({ pr_number, claimed_files }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}/files?per_page=100`, { headers: githubHeaders() });
          const files = ((await res.json()) as any[]).map((f) => f.filename);
          const missingFromClaim = files.filter((f) => !claimed_files.includes(f));
          const claimedButNotChanged = claimed_files.filter((f) => !files.includes(f));
          const ok = missingFromClaim.length === 0 && claimedButNotChanged.length === 0;
          return { content: [{ type: "text", text: ok ? "Claim matches the actual diff exactly." : `MISMATCH.\nActually changed but not in your claim: ${missingFromClaim.join(", ") || "none"}\nClaimed but NOT actually changed: ${claimedButNotChanged.join(", ") || "none"}` }], isError: !ok };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "get_pr_age_report",
      "List open PRs, flagging any older than 3 days.",
      {},
      async () => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls?state=open&per_page=50`, { headers: githubHeaders() });
          const prs = (await res.json()) as any[];
          if (!prs.length) return { content: [{ type: "text", text: "No open PRs." }] };
          const now = Date.now();
          const lines = prs.map((p) => {
            const days = Math.floor((now - new Date(p.created_at).getTime()) / 86400000);
            return `#${p.number} "${p.title}" — ${days}d old${days > 3 ? " ⚠ STALE" : ""}`;
          });
          return { content: [{ type: "text", text: lines.join("\n") }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "search_for_hardcoded_secrets",
      "Scan a PR diff for hardcoded secrets.",
      { pr_number: z.number() },
      async ({ pr_number }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}/files?per_page=100`, { headers: githubHeaders() });
          const files = (await res.json()) as any[];
          const patterns: [string, RegExp][] = [
            ["Paystack live secret key", /sk_live_[A-Za-z0-9]+/],
            ["AWS access key", /AKIA[0-9A-Z]{16}/],
            ["Generic private key block", /-----BEGIN (RSA |EC )?PRIVATE KEY-----/],
            ["Likely hardcoded client secret", /(secret|client_secret)\s*[:=]\s*['"][A-Za-z0-9\-_]{20,}['"]/i],
          ];
          const hits: string[] = [];
          for (const f of files) {
            const patch = f.patch ?? "";
            for (const [label, re] of patterns) {
              if (re.test(patch)) hits.push(`${label} — ${f.filename}`);
            }
          }
          return { content: [{ type: "text", text: hits.length ? `POSSIBLE SECRETS FOUND:\n${hits.join("\n")}` : "No known secret patterns found in this PR's diff." }], isError: hits.length > 0 };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "get_commit_diff",
      "Diff summary for a commit by SHA.",
      { sha: z.string() },
      async ({ sha }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits/${sha}`, { headers: githubHeaders() });
          if (!res.ok) return { content: [{ type: "text", text: `Error: ${await res.text()}` }], isError: true };
          const data = await res.json();
          const files = (data.files ?? []).map((f: any) => `${f.status} ${f.filename} (+${f.additions}/-${f.deletions})`).join("\n");
          return { content: [{ type: "text", text: `${data.commit?.message ?? ""}\n\n${files}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "get_file_blame_summary",
      "Most recent commit that touched a file.",
      { path: z.string(), branch: z.string().optional().default("main") },
      async ({ path, branch }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/commits?path=${encodeURIComponent(path)}&sha=${branch}&per_page=1`, { headers: githubHeaders() });
          const data = (await res.json()) as any[];
          if (!data.length) return { content: [{ type: "text", text: `No commit history found for ${path}.` }] };
          const c = data[0];
          return { content: [{ type: "text", text: `${c.sha.slice(0, 7)} by ${c.commit.author.name} on ${c.commit.author.date}\n${c.commit.message}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "check_route_has_auth_check",
      "Heuristic check for an auth guard in a route.",
      { path: z.string(), branch: z.string().optional().default("main") },
      async ({ path, branch }) => {
        try {
          const res = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${path}?ref=${branch}`, { headers: githubHeaders() });
          if (!res.ok) return { content: [{ type: "text", text: `Error: ${await res.text()}` }], isError: true };
          const data = await res.json();
          const content = Buffer.from(data.content, "base64").toString("utf-8");
          const guardPattern = /require(Artist|Admin|User|Auth)\s*\(|getServerSession\s*\(/;
          const hasGuard = guardPattern.test(content);
          return { content: [{ type: "text", text: hasGuard ? "Appears to call an auth guard." : `⚠ No recognized auth guard call found in ${path} — verify manually whether this route should require authentication.` }], isError: !hasGuard };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "estimate_pr_risk",
      "Composite PR risk read: low/medium/high.",
      { pr_number: z.number() },
      async ({ pr_number }) => {
        try {
          const filesRes = await fetch(`${GITHUB_API}/repos/${GITHUB_OWNER}/${GITHUB_REPO}/pulls/${pr_number}/files?per_page=100`, { headers: githubHeaders() });
          const files = (await filesRes.json()) as any[];
          const totalChanges = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);
          const sensitivePattern = /payment|paystack|paypal|billing|subscri|auth|webhook|cron|payout/i;
          const touchesSensitive = files.some((f) => sensitivePattern.test(f.filename));
          const codeFiles = files.filter((f) => /^src\/(lib|app\/api)\//.test(f.filename) && !f.filename.includes(".test."));
          const testFiles = files.filter((f) => f.filename.includes(".test."));
          const hasTests = testFiles.length > 0 || codeFiles.length === 0;

          const reasons: string[] = [];
          let score = 0;
          if (touchesSensitive) { score += 2; reasons.push("touches payment/auth/webhook/cron paths"); }
          if (!hasTests) { score += 2; reasons.push("no tests added for changed code"); }
          if (totalChanges > 300) { score += 1; reasons.push(`large diff (${totalChanges} lines)`); }

          const label = score >= 3 ? "HIGH" : score >= 1 ? "MEDIUM" : "LOW";
          return { content: [{ type: "text", text: `Risk: ${label}${reasons.length ? ` — ${reasons.join("; ")}` : " — no notable risk signals"}` }] };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "update_known_issue_from_pr",
      "Link a PR to a known issue with a status note.",
      { issue_id: z.string(), pr_number: z.number(), status_note: z.string() },
      async ({ issue_id, pr_number, status_note }) => {
        const { data: issue, error: fetchErr } = await supabase.from("KnownIssue").select("description").eq("id", issue_id).single();
        if (fetchErr || !issue) return { content: [{ type: "text", text: `Issue ${issue_id} not found: ${fetchErr?.message}` }], isError: true };
        const newDescription = `${issue.description}\n\n[PR #${pr_number} update] ${status_note}`;
        const { error } = await supabase.from("KnownIssue").update({ description: newDescription }).eq("id", issue_id);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        return { content: [{ type: "text", text: `Linked PR #${pr_number} to issue ${issue_id}.` }] };
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
      "get_revenue_dashboard",
      "Revenue snapshot by item type for a date range.",
      { startDate: z.string().optional(), endDate: z.string().optional() },
      async ({ startDate, endDate }) => {
        const start = startDate ?? new Date(Date.now() - 30 * 86400000).toISOString();
        const end = endDate ?? new Date().toISOString();
        const { data, error } = await supabase
          .from("Purchase")
          .select("itemType, amount, platformFee, netAmount, status")
          .gte("createdAt", start)
          .lte("createdAt", end);
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        const byType: Record<string, { gross: number; fee: number; net: number; count: number }> = {};
        let totals = { gross: 0, fee: 0, net: 0, count: 0 };
        for (const p of data ?? []) {
          if (p.status !== "confirmed") continue;
          const t = byType[p.itemType] ?? { gross: 0, fee: 0, net: 0, count: 0 };
          t.gross += p.amount; t.fee += p.platformFee; t.net += p.netAmount; t.count += 1;
          byType[p.itemType] = t;
          totals.gross += p.amount; totals.fee += p.platformFee; totals.net += p.netAmount; totals.count += 1;
        }
        const lines = Object.entries(byType).map(([k, v]) => `${k}: ${v.count} txns, gross R${v.gross.toFixed(2)}, fee R${v.fee.toFixed(2)}, net R${v.net.toFixed(2)}`);
        lines.push(`TOTAL: ${totals.count} txns, gross R${totals.gross.toFixed(2)}, fee R${totals.fee.toFixed(2)}, net R${totals.net.toFixed(2)}`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
    );

    server.tool(
      "get_payout_queue_status",
      "Pending payouts: count, value, how many overdue.",
      { daysThreshold: z.number().optional().default(3) },
      async ({ daysThreshold }) => {
        const { data, error } = await supabase.from("ArtistPayout").select("id, artistId, amount, currency, createdAt, notes").eq("status", "pending").order("createdAt", { ascending: true });
        if (error) return { content: [{ type: "text", text: `Error: ${error.message}` }], isError: true };
        if (!data?.length) return { content: [{ type: "text", text: "No pending payouts." }] };
        const cutoff = Date.now() - daysThreshold * 86400000;
        const stale = data.filter((d: any) => new Date(d.createdAt).getTime() < cutoff);
        const total = data.reduce((s: number, d: any) => s + d.amount, 0);
        const lines = [`${data.length} pending payouts, total R${total.toFixed(2)}. ${stale.length} older than ${daysThreshold} days:`];
        for (const s of stale.slice(0, 20)) lines.push(`  ${s.id} — artist ${s.artistId} — R${s.amount.toFixed(2)} — since ${s.createdAt} — ${s.notes}`);
        return { content: [{ type: "text", text: lines.join("\n") }] };
      }
    );

    server.tool(
      "find_at_risk_subscriptions",
      "Subscriptions at risk of lapsing.",
      {},
      async () => {
        const client = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
        await client.connect();
        try {
          const res = await client.query(
            `SELECT aps.id, aps."artistId", a.name, aps."planSlug", aps.status, aps."paystackToken" IS NULL AS no_token, aps."failedAt", aps."currentPeriodEnd"
             FROM artist_plan_subscriptions aps JOIN "Artist" a ON a.id = aps."artistId"
             WHERE aps.status = 'active' AND (aps."paystackToken" IS NULL OR aps."failedAt" IS NOT NULL)
             ORDER BY aps."currentPeriodEnd" ASC LIMIT 50`
          );
          if (!res.rows.length) return { content: [{ type: "text", text: "No at-risk subscriptions found." }] };
          const lines = res.rows.map((r: any) => `${r.name} (${r.planSlug}) — ${r.no_token ? "NO SAVED CARD" : "in grace/failed"} — renews/expires ${r.currentPeriodEnd}`);
          return { content: [{ type: "text", text: lines.join("\n") }] };
        } finally {
          await client.end();
        }
      }
    );

    server.tool(
      "get_artist_health_snapshot",
      "One artist's plan, subscription, and sales health.",
      { artistIdOrSlug: z.string() },
      async ({ artistIdOrSlug }) => {
        const { data: artist, error } = await supabase
          .from("Artist")
          .select("id, name, slug, planSlug, planExpiresAt, lifetimeGrossSales, isSuspended:isVerified")
          .or(`id.eq.${artistIdOrSlug},slug.eq.${artistIdOrSlug}`)
          .maybeSingle();
        if (error || !artist) return { content: [{ type: "text", text: `Artist not found: ${error?.message ?? artistIdOrSlug}` }], isError: true };
        const { data: purchases } = await supabase.from("Purchase").select("itemType, amount, createdAt").eq("artistId", (artist as any).id).order("createdAt", { ascending: false }).limit(10);
        const recent = (purchases ?? []).map((p: any) => `  ${p.createdAt} — ${p.itemType} — R${p.amount}`).join("\n");
        return { content: [{ type: "text", text: `${(artist as any).name} (${(artist as any).slug})\nPlan: ${(artist as any).planSlug}, expires ${(artist as any).planExpiresAt}\nLifetime gross: R${(artist as any).lifetimeGrossSales}\nRecent activity:\n${recent || "  none"}` }] };
      }
    );

    // --- R2 object inspection (read-only) ---
    // Reuses the same Cloudflare R2 credentials/endpoint pattern as src/lib/r2.ts,
    // including its checksum-header fix (bef156d) for newer @aws-sdk/client-s3
    // versions. No write/delete operations exposed here on purpose.
    server.tool(
      "r2_list_objects",
      "List R2 objects under a key prefix (read-only).",
      {
        prefix: z.string().optional().describe("Key prefix to filter by, e.g. 'licenses/'"),
        max_keys: z.number().int().min(1).max(1000).optional().default(50),
      },
      async ({ prefix, max_keys }) => {
        try {
          const { S3Client, ListObjectsV2Command } = await import("@aws-sdk/client-s3");
          const client = new S3Client({
            region: "auto",
            endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
              secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
            },
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
          } as any);
          const result = await client.send(new ListObjectsV2Command({
            Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME,
            Prefix: prefix,
            MaxKeys: max_keys,
          }));
          const objects = (result.Contents ?? []).map((o) => `${o.Key} — ${o.Size} bytes — ${o.LastModified?.toISOString()}`);
          return {
            content: [{
              type: "text",
              text: objects.length
                ? `${result.KeyCount ?? objects.length} object(s)${result.IsTruncated ? " (truncated, raise max_keys or narrow prefix)" : ""}:\n${objects.join("\n")}`
                : `No objects found${prefix ? ` under prefix "${prefix}"` : ""}.`,
            }],
          };
        } catch (err: any) {
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    server.tool(
      "r2_head_object",
      "Check whether a specific R2 object key exists, with size/last-modified/content-type (read-only).",
      { key: z.string().describe("Exact object key, e.g. 'licenses/<purchaseId>.pdf'") },
      async ({ key }) => {
        try {
          const { S3Client, HeadObjectCommand } = await import("@aws-sdk/client-s3");
          const client = new S3Client({
            region: "auto",
            endpoint: `https://${process.env.CLOUDFLARE_R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
            credentials: {
              accessKeyId: process.env.CLOUDFLARE_R2_ACCESS_KEY_ID!,
              secretAccessKey: process.env.CLOUDFLARE_R2_SECRET_ACCESS_KEY!,
            },
            requestChecksumCalculation: "WHEN_REQUIRED",
            responseChecksumValidation: "WHEN_REQUIRED",
          } as any);
          const result = await client.send(new HeadObjectCommand({ Bucket: process.env.CLOUDFLARE_R2_BUCKET_NAME, Key: key }));
          return {
            content: [{
              type: "text",
              text: `Exists: ${key}\nSize: ${result.ContentLength} bytes\nLast modified: ${result.LastModified?.toISOString()}\nContent-Type: ${result.ContentType ?? "unknown"}`,
            }],
          };
        } catch (err: any) {
          if (err?.name === "NotFound" || err?.$metadata?.httpStatusCode === 404) {
            return { content: [{ type: "text", text: `Not found: ${key}` }] };
          }
          return { content: [{ type: "text", text: `Error: ${err?.message ?? String(err)}` }], isError: true };
        }
      }
    );

    // --- More tools go here as we build them ---
  },
  {},
  { basePath: "/api", maxDuration: 120, verboseLogs: true }
);

export { handler as GET, handler as POST, handler as DELETE };

// Minimal CORS preflight support (see compatibility note at top of file).
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
