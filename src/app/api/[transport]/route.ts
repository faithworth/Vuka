// app/api/[transport]/route.ts

import { createMcpHandler } from "mcp-handler";
import { createClient } from "@supabase/supabase-js";
import { Client } from "pg";
import { z } from "zod";

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
      "Simple health-check tool. Returns a confirmation message with the current server time.",
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
      "Run a read-only SQL query (SELECT or WITH only) directly against the Vuka Music production Postgres database. Use this for any data question not already covered by a dedicated tool — ad-hoc lookups, aggregates, joins across tables. Writes, DDL, and multi-statement queries are blocked. Results capped at 200 rows and a 5-second timeout.",
      {
        query: z.string().describe("A single SELECT or WITH query. No semicolons chaining multiple statements."),
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
      "Look up a Vuka Music artist by name or slug and return their full revenue picture (beat/release sales, tips, crowdfunding, marketplace orders), payout status, and plan status. Use this whenever the user asks about a specific artist's performance, earnings, or account status.",
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
      "Verify or unverify an artist's bank account by artist name/slug, enabling their payouts to that account once past the 48h cooldown. If the artist has multiple bank accounts, this returns a list asking you to specify bank_account_id.",
      {
        artist_query: z.string().describe("Artist name or slug to search for"),
        verified: z.boolean().describe("true to verify, false to unverify"),
        bank_account_id: z.string().optional().describe("Specific bank account id, required only if the artist has multiple accounts"),
        method: z.string().optional().describe("Verification method, e.g. 'manual_admin_review', 'micro_deposit'"),
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
      "Get a one-call snapshot of platform health: artist counts by plan tier, gross merchandise value (GMV) for the current calendar month across all revenue sources, total pending payouts awaiting admin action, and new signups in the last 7 days. Use this for any 'how's the business doing' or dashboard-style question.",
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
      "Search Vuka Music user accounts by name or email (partial match). Returns account status, role, and linked artist plan/verification info if they have an artist profile. Use this to look up any account — fan, artist, admin — not just artists.",
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
      "Get a month-by-month revenue trend across all sources (purchases, tips, crowdfunding, marketplace) for the last N months. Use this for 'how's revenue trending', bookkeeping summaries, or growth/decline questions — unlike get_platform_metrics, which only covers the current month.",
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
      "Get a VAT breakdown for a given period, based on confirmed revenue across all sources (purchases, tips, crowdfunding, marketplace). Assumes standard South African VAT (15%, VAT-inclusive pricing) unless a different rate is passed — this is a working estimate from platform data only, not a filing. Use this for bookkeeping prep, not as a substitute for an accountant or SARS submission.",
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
      "Get a snapshot of the platform funnel: total users, how many have created an artist profile, and how many of those artists have made at least one confirmed sale. Use this for growth/marketing questions about drop-off and conversion, not for individual artist lookups (use get_artist_summary for that).",
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
      "Draft (does not send) a DMCA-style takedown notice for a Vuka Music release, using the release and artist info on file. Returns text for a human to review, fill in contact details, and send themselves via whatever submission process the target platform actually requires. This tool never sends anything and never contacts the target platform.",
      {
        release_query: z.string().describe("Release title or id to search for"),
        infringing_url: z.string().describe("URL where the infringing content was found"),
        platform_name: z.string().optional().describe("Name of the platform hosting the infringing content, e.g. 'YouTube', 'SoundCloud'"),
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
      "List all artist bank accounts that are not yet verified, showing whether they're still in the 48h cooldown or already eligible for review. Use this to work through the verification backlog instead of checking artists one at a time.",
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
      "Read the current contents of a file from the Vuka Music GitHub repository. Use this before editing a file, to see what's currently there and get context.",
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
      "Create or update a file in the Vuka Music GitHub repository and commit the change directly. This triggers a real deployment via Vercel's GitHub integration if committed to main. Use with care — this pushes real code to the live repo. Prefer github_create_branch + create_pull_request for anything non-trivial, so changes get reviewed before going live. For editing part of a large existing file, prefer github_patch_file instead — it's much cheaper and safer than resending the whole file.",
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
      "List files and subdirectories at a given path in the Vuka Music GitHub repository. Use this to browse the repo structure and find the correct file path before reading or editing, instead of guessing paths.",
      {
        path: z.string().optional().default("").describe("Directory path in the repo, e.g. 'src/app/api'. Empty string for repo root."),
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
      "Search for a code snippet, function name, or string across the entire Vuka Music GitHub repository. Use this to find which files reference something (e.g. a model field, an env var, a function) instead of guessing paths.",
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
      "Create a new branch in the Vuka Music repo, branching off an existing branch (default: main). Use this before making a non-trivial code change, so the change can go through create_pull_request instead of committing straight to main.",
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
      "Open a pull request from a feature branch into main (or another base branch), for human review before merging. Use this after github_create_branch + github_commit_file, instead of committing straight to main, for anything beyond a trivial one-line fix.",
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
      "Check recent GitHub Actions workflow runs (tests, type-check) for a branch. Use this after committing code to confirm it actually passes tests, instead of assuming a commit is safe just because it went through.",
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
      "Get the actual log output for a GitHub Actions workflow run, focused on the first failed job/step. Use this after get_ci_status shows a failure, instead of guessing at the cause — pass the run id from get_ci_status's output.",
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
      "Edit a file in the repo using one or more targeted find/replace edits, without supplying the full file content. Fetches the current file, applies each edit in order (each old_str must match exactly once or the whole patch is rejected before anything is committed), and pushes the result. Use this instead of github_commit_file for any change to a large file — it's dramatically cheaper than retyping the whole file, and safer since a non-unique or missing old_str fails loudly instead of silently corrupting content. Files over ~1MB aren't supported by this endpoint — use github_read_file_range to inspect, and fall back to github_commit_file for those.",
      {
        path: z.string().describe("File path in the repo"),
        edits: z
          .array(
            z.object({
              old_str: z.string().describe("Exact text to find — must appear exactly once in the current file"),
              new_str: z.string().describe("Text to replace it with"),
            })
          )
          .min(1)
          .describe("One or more find/replace edits, applied in order against the same file"),
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
      "Delete a file from the repo. Use this instead of overwriting a file with a disabled/410 stub when the file should actually be removed from the tree.",
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
      "Read only a specific line range from a file in the repo, instead of the whole thing. Use this for large files when only a section near an error or a known area needs inspecting — much cheaper than github_read_file on a multi-hundred-line file.",
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
      "Commit changes to multiple files at once as a single atomic commit, using the Git Data API (blob → tree → commit → ref update). Use this when one logical change spans several files, instead of N separate github_commit_file calls — one commit, one deploy trigger, clearer history. Each file's full new content still has to be provided (this doesn't reduce per-file size cost — use github_patch_file for that), it just groups multiple files into one commit instead of many.",
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
      "Regenerate package-lock.json by running `npm install --package-lock-only` inside this serverless function against the repo's current package.json, then commit the result directly to GitHub. This solves the specific problem where a lockfile is too large to paste as a tool call argument — its content never passes through the calling model at all. Experimental: depends on npm being invocable and network-reachable inside this runtime, and on the install finishing inside the function's time limit. If it errors, the fallback is running `npm install` on a real machine and committing the file from there.",
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
      "Read this FIRST at the start of any Vuka Music work session, before re-reading code or docs. Returns the full persistent project memory (architecture, stack, business rules, conventions, gotchas) grouped by category, the 5 most recent session summaries, and all open known issues. Replaces re-deriving context from scratch.",
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
      "Store or update a durable fact about the Vuka Music project (architecture decision, business rule, convention, gotcha) so future sessions don't have to rediscover it. Upserts by key.",
      {
        key: z.string().describe("Short unique identifier, e.g. 'plan-tiers' or 'payout-cooldown-rule'"),
        category: z.string().describe("Grouping label, e.g. 'architecture', 'business-rules', 'conventions', 'gotchas'"),
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
      "Fetch a specific stored project-memory fact by its exact key. Use memory_search instead if you don't know the exact key.",
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
      "Search stored project-memory facts by keyword across key, category, and value. Use when you don't know the exact key.",
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
      "Record a summary of the current work session — what changed, key decisions made, and what's left open — so the next session (any Claude, any chat) can pick up context in one call via get_project_briefing/get_recent_changes instead of re-reading the whole conversation history.",
      {
        summary: z.string().describe("2-5 sentence plain-language summary of what happened this session"),
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
      "Get the N most recent session-summary log entries — a lightweight changelog of what's been done recently across all chats, without reading commit history or transcripts.",
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
      "Create, update, or resolve a known-issue record — persistent tracking of bugs/gaps/tech-debt across sessions so they don't get silently forgotten or rediscovered from scratch.",
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
      "Get a live top-level map of the Vuka Music repo (root files/dirs plus API route groups) in one call instead of browsing with multiple github_list_files calls. Cheap orientation tool for 'what exists' questions.",
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

    // --- More tools go here as we build them ---
  },
  {},
  { basePath: "/api", maxDuration: 120, verboseLogs: true }
);

export { handler as GET, handler as POST, handler as DELETE };
