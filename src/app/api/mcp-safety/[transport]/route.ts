// src/app/api/mcp-safety/[transport]/route.ts
//
// ── Bootstrap ChatGPT-connector split ─────────────────────────────────
// One of several smaller MCP endpoints split out of the original
// src/app/api/[transport]/route.ts so each manifest comfortably fits
// ChatGPT's combined tool-manifest token budget. The original endpoint
// (used by Claude) is unchanged and still exposes all 81 tools at
// https://www.vukamusic.com/api/mcp — nothing about it was modified.
//
// This endpoint covers PR safety/verification tools — built to catch
// unmerged safety fixes sitting idle, changes described as different
// from what they actually are, and payment/auth code shipping without
// tests. No tool names, parameters, or business logic were changed in
// this split — every tool body below is copied verbatim from the
// original file.
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
} from "@/lib/mcp-shared";

export const maxDuration = 120;

const handler = createMcpHandler(
  (server) => {
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
  },
  {},
  { basePath: "/api/mcp-safety", maxDuration: 120, verboseLogs: true }
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
