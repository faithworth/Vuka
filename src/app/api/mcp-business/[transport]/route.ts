// src/app/api/mcp-business/[transport]/route.ts
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
import { Client } from "pg";
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
  },
  {},
  { basePath: "/api/mcp-business", maxDuration: 120, verboseLogs: true }
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
