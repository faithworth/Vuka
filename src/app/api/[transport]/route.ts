// app/api/[transport]/route.ts

import { createMcpHandler } from "mcp-handler";
import { createClient } from "@supabase/supabase-js";
import { z } from "zod";

// Server-side client using the service role key — bypasses RLS, so this
// file must NEVER be imported into client-side code. It's a route handler,
// so that's already guaranteed, but worth flagging for future edits.
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const handler = createMcpHandler(
  (server) => {
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

    server.tool(
      "get_artist_summary",
      "Look up a Vuka Music artist by name or slug and return their sales, payout, and plan status. Use this whenever the user asks about a specific artist's performance, earnings, or account status.",
      {
        query: z
          .string()
          .describe("Artist name or slug to search for (partial match allowed)"),
      },
      async ({ query }) => {
        // Find the artist — try slug exact match first, then name partial match
        const { data: artists, error: artistError } = await supabase
          .from("Artist")
          .select(
            "id, name, slug, isVerified, isFoundingArtist, planSlug, planExpiresAt, lifetimeGrossSales, currency, city, country, createdAt"
          )
          .or(`slug.eq.${query},name.ilike.%${query}%`)
          .limit(5);

        if (artistError) {
          return {
            content: [{ type: "text", text: `Error looking up artist: ${artistError.message}` }],
            isError: true,
          };
        }

        if (!artists || artists.length === 0) {
          return {
            content: [{ type: "text", text: `No artist found matching "${query}".` }],
          };
        }

        // If multiple matches, ask which one rather than guessing
        if (artists.length > 1) {
          const list = artists.map((a) => `- ${a.name} (slug: ${a.slug})`).join("\n");
          return {
            content: [
              {
                type: "text",
                text: `Multiple artists matched "${query}":\n${list}\n\nAsk again with the exact slug.`,
              },
            ],
          };
        }

        const artist = artists[0];

        // Purchases for this artist
        const { data: purchases, error: purchaseError } = await supabase
          .from("Purchase")
          .select("amount, netAmount, platformFee, status, currency, createdAt")
          .eq("artistId", artist.id);

        if (purchaseError) {
          return {
            content: [{ type: "text", text: `Error loading purchases: ${purchaseError.message}` }],
            isError: true,
          };
        }

        const completedPurchases = (purchases ?? []).filter((p) => p.status === "completed");
        const totalGross = completedPurchases.reduce((sum, p) => sum + (p.amount ?? 0), 0);
        const totalNet = completedPurchases.reduce((sum, p) => sum + (p.netAmount ?? 0), 0);
        const totalFees = completedPurchases.reduce((sum, p) => sum + (p.platformFee ?? 0), 0);

        // Payouts for this artist
        const { data: payouts, error: payoutError } = await supabase
          .from("ArtistPayout")
          .select("amount, status, method, createdAt, processedAt")
          .eq("artistId", artist.id);

        if (payoutError) {
          return {
            content: [{ type: "text", text: `Error loading payouts: ${payoutError.message}` }],
            isError: true,
          };
        }

        const pendingPayouts = (payouts ?? []).filter((p) => p.status === "pending");
        const paidPayouts = (payouts ?? []).filter((p) => p.status === "paid" || p.status === "completed");
        const totalPaidOut = paidPayouts.reduce((sum, p) => sum + (p.amount ?? 0), 0);
        const totalPending = pendingPayouts.reduce((sum, p) => sum + (p.amount ?? 0), 0);

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
          sales: {
            completedPurchaseCount: completedPurchases.length,
            totalGross,
            totalFeesTaken: totalFees,
            totalNetToArtist: totalNet,
            lifetimeGrossSalesOnRecord: artist.lifetimeGrossSales,
          },
          payouts: {
            totalPaidOut,
            totalPending,
            pendingCount: pendingPayouts.length,
          },
        };

        return {
          content: [{ type: "text", text: JSON.stringify(summary, null, 2) }],
        };
      }
    );

    // --- More tools go here as we build them ---
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
