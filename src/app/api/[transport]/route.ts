// app/api/[transport]/route.ts

import { createMcpHandler } from "mcp-handler";
import { createClient } from "@supabase/supabase-js";
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

        // NOTE: status values vary by table in this schema — Purchase/SupportTxn/
        // campaign_backers use "confirmed", not "completed". Verified directly
        // against live data on 2026-07-18.
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
      "Create or update a file in the Vuka Music GitHub repository and commit the change directly. This triggers a real deployment via Vercel's GitHub integration. Use with care — this pushes real code to the live repo.",
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

    // --- More tools go here as we build them ---
  },
  {},
  { basePath: "/api", maxDuration: 60, verboseLogs: true }
);

export { handler as GET, handler as POST, handler as DELETE };
