// src/app/api/mcp-github/[transport]/route.ts
//
// ── Bootstrap ChatGPT-connector split ─────────────────────────────────
// One of several smaller MCP endpoints split out of the original
// src/app/api/[transport]/route.ts so each manifest comfortably fits
// ChatGPT's combined tool-manifest token budget. The original endpoint
// (used by Claude) is unchanged and still exposes all 81 tools at
// https://www.vukamusic.com/api/mcp — nothing about it was modified.
//
// This endpoint covers repo/devtools tools (reading, writing, searching,
// and inspecting the GitHub repo, branches, commits, and CI). No tool
// names, parameters, or business logic were changed in this split —
// every tool body below is copied verbatim from the original file.
// ───────────────────────────────────────────────────────────────────────

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  GITHUB_API,
  GITHUB_OWNER,
  GITHUB_REPO,
  githubHeaders,
} from "@/lib/mcp-shared";

export const maxDuration = 120;

const handler = createMcpHandler(
  (server) => {
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
          status: r.status,
          conclusion: r.conclusion,
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
  },
  {},
  { basePath: "/api/mcp-github", maxDuration: 120, verboseLogs: true }
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
