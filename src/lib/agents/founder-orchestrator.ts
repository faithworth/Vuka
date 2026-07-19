/**
 * Founder Orchestrator
 * ---------------------------------------------------------------------------
 * A single entry point that delegates to read-only "department" sub-agents
 * (Data, Dev, Finance — add more as departments come online) and returns
 * one digest.
 *
 * SAFETY BOUNDARY (do not remove):
 *   Every tool listed below is read-only. Nothing in this file can commit
 *   code, verify a bank account, approve a payout, send a DMCA notice, or
 *   post publicly. Those stay explicit, one-off actions triggered by a
 *   human in a real conversation — never something this script (or a
 *   future cron job) reaches on its own. If you extend a department's tool
 *   list, keep write/draft-send tools out of it.
 *
 * RUN NOW (manual):
 *   npm run agents:founder
 *
 * RUN LATER (scheduled):
 *   This exports `runFounderDigest()` as a plain async function returning a
 *   JSON-serializable result — the same shape every job in
 *   src/lib/workers/jobs.ts already returns. To wire it into the existing
 *   cron system later:
 *     1. import { runFounderDigest } from '@/lib/agents/founder-orchestrator'
 *     2. in src/app/api/workers/cron/route.ts, add:
 *          if (job === 'founder_digest' || job === 'all') {
 *            results.founderDigest = await runFounderDigest();
 *          }
 *     3. add 'founder_digest' to Vercel Cron config on whatever cadence you want.
 *   No other changes needed — the auth/secret handling in that route already
 *   covers it.
 * ---------------------------------------------------------------------------
 */

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;
const VUKA_MCP_URL = process.env.VUKA_MCP_URL ?? 'https://www.vukamusic.com/api/mcp';
const MODEL = 'claude-sonnet-4-6';

type DepartmentConfig = {
  name: string;
  systemPrompt: string;
  allowedTools: string[]; // read-only tool names this department may call
  task: string;
};

const DEPARTMENTS: DepartmentConfig[] = [
  {
    name: 'data',
    systemPrompt: `You are the Data & Admin department agent for Vuka Music.
You only have read-only tools. Report facts and flag anything that looks
wrong (stalled payouts, unverified bank accounts sitting past cooldown,
unusual signup/GMV movement). You never take action — you report.`,
    allowedTools: ['run_sql_query', 'get_platform_metrics', 'search_users'],
    task: `Give a short status check: current platform metrics, and whether
anything in payouts or bank account verification looks stuck or needs
admin attention. Be concrete with numbers, not vague.`,
  },
  {
    name: 'dev',
    systemPrompt: `You are the Full-Stack Dev department agent for Vuka Music.
You only have read-only tools. Report facts about repo/CI state. You never
commit code — you report what a human should look at.`,
    allowedTools: ['get_ci_status', 'github_search_code', 'github_list_files', 'github_read_file'],
    task: `Check current CI status on main. If anything is failing, say
what and why in one or two sentences — don't just say "it's broken."`,
  },
  {
    name: 'finance',
    systemPrompt: `You are the Finance department agent for Vuka Music.
You only have read-only/draft-only tools — nothing here sends money, sends
a notice, or files anything. Report facts a founder should know: revenue
trend, VAT working estimate, and any bank accounts sitting in the
verification queue longer than expected. You never take action — you
report and flag for a human.`,
    allowedTools: ['get_platform_metrics', 'get_vat_summary', 'list_verification_queue', 'get_revenue_report'],
    task: `Give a short financial status check: this month's revenue and
VAT estimate, and whether anything is sitting in the bank-account
verification queue that looks like it needs admin attention. Be concrete
with numbers, not vague.`,
  },
];

type DepartmentResult = {
  department: string;
  summary: string;
  raw?: unknown;
};

async function runDepartment(dept: DepartmentConfig): Promise<DepartmentResult> {
  if (!ANTHROPIC_API_KEY) {
    return {
      department: dept.name,
      summary: 'Skipped — ANTHROPIC_API_KEY not set in this environment.',
    };
  }

  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 1000,
      system: dept.systemPrompt,
      messages: [{ role: 'user', content: dept.task }],
      mcp_servers: [
        {
          type: 'url',
          url: VUKA_MCP_URL,
          name: 'vuka-mcp',
          tool_configuration: {
            enabled: true,
            allowed_tools: dept.allowedTools,
          },
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => '');
    return {
      department: dept.name,
      summary: `Failed to reach agent (HTTP ${response.status}): ${errText.slice(0, 300)}`,
    };
  }

  const data = await response.json();
  const textBlocks = (data.content ?? [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('\n');

  return {
    department: dept.name,
    summary: textBlocks || '(agent returned no text — check raw output)',
    raw: data.content,
  };
}

export async function runFounderDigest(): Promise<{
  ok: boolean;
  timestamp: string;
  departments: DepartmentResult[];
  needsYourAttention: string[];
}> {
  const departments = await Promise.all(DEPARTMENTS.map(runDepartment));

  // Very simple heuristic flagging — refine once you see real digests.
  const needsYourAttention = departments
    .filter((d) => /fail|stuck|unverified|cooldown|error|unauthorized/i.test(d.summary))
    .map((d) => `${d.department}: ${d.summary}`);

  return {
    ok: true,
    timestamp: new Date().toISOString(),
    departments,
    needsYourAttention,
  };
}

// Allow running directly: npx ts-node --compiler-options {\"module\":\"CommonJS\"} src/lib/agents/founder-orchestrator.ts
if (require.main === module) {
  runFounderDigest()
    .then((result) => {
      console.log(JSON.stringify(result, null, 2));
      if (result.needsYourAttention.length > 0) {
        console.log('\n⚠️  Needs your attention:');
        result.needsYourAttention.forEach((line) => console.log(`  - ${line}`));
      }
    })
    .catch((err) => {
      console.error('Founder digest failed:', err);
      process.exit(1);
    });
}
