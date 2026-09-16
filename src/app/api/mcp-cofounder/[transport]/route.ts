// VUKA — ChatGPT Co-Founder Control Plane
// This endpoint is the operational bridge between ChatGPT and Vuka.
// It intentionally does NOT call another AI API. ChatGPT is the reasoning
// layer; these tools provide durable company state, planning, approvals,
// campaign tracking, research notes, and execution auditability.

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";
import {
  supabase,
  writeAdminLog,
} from "@/lib/mcp-shared";
import {
  appendCofounderSettingArray,
  getCofounderSetting,
  isoNow,
  setCofounderSetting,
} from "@/lib/cofounder-store";

export const maxDuration = 120;

const DEFAULT_STATE = {
  company: "Vuka Music - The Rise Up (Pty) Ltd",
  role: "ChatGPT is the AI co-founder; Vuka MCP is its operational bridge.",
  operatingModel: "understand -> investigate -> plan -> prepare -> approve -> execute -> verify -> report -> remember",
  approvalBoundaries: [
    "spending money",
    "external communications",
    "public publishing",
    "production changes",
    "financial transactions",
    "payment configuration",
    "data deletion",
    "legal commitments",
    "security controls",
  ],
  activeGoal: "Launch Vuka from zero traction using the R3,000 Founding 15 campaign and convert the first cohort into repeat users, artists and sales.",
  updatedAt: isoNow(),
};

const DEFAULT_FOUNDING15 = {
  campaignId: "founding-15-3000",
  name: "Founding 15",
  budgetZAR: 3000,
  maxParticipants: 15,
  rewards: {
    signupUploadAndFirstPurchase: 100,
    crowdfunding3Backers: 300,
    albumOr8BeatsAndPurchase: 200,
  },
  rule: "Rewards are subject to budget approval and must never cause total committed rewards to exceed the campaign budget.",
  status: "planning",
  candidates: [],
  events: [],
  createdAt: isoNow(),
};

const server = createMcpHandler(
  (mcp) => {
    mcp.tool(
      "get_cofounder_state",
      "Read the durable operating state for the ChatGPT/Vuka AI co-founder relationship.",
      {},
      async () => {
        const [state, goals, decisions, approvals, actions] = await Promise.all([
          getCofounderSetting("cofounder.state", DEFAULT_STATE),
          getCofounderSetting("cofounder.goals", []),
          getCofounderSetting("cofounder.decisions", []),
          getCofounderSetting("cofounder.approvals", []),
          getCofounderSetting("cofounder.actions", []),
        ]);
        return { content: [{ type: "text", text: JSON.stringify({ state, goals, decisions, approvals: (approvals as unknown[]).slice(0, 20), recentActions: (actions as unknown[]).slice(0, 20) }, null, 2) }] };
      }
    );

    mcp.tool(
      "set_cofounder_goal",
      "Create or update a company goal. Planning state only; does not spend money or publish anything.",
      {
        title: z.string().min(3).max(200),
        description: z.string().min(3).max(2000),
        priority: z.enum(["critical", "high", "medium", "low"]).default("high"),
        targetDate: z.string().optional(),
        successMetric: z.string().max(500).optional(),
      },
      async ({ title, description, priority, targetDate, successMetric }) => {
        const goal = { id: crypto.randomUUID(), title, description, priority, targetDate: targetDate ?? null, successMetric: successMetric ?? null, status: "active", createdAt: isoNow(), updatedAt: isoNow() };
        const goals = await appendCofounderSettingArray("cofounder.goals", goal);
        await writeAdminLog("cofounder.goal_created", "CofounderGoal", goal.id, JSON.stringify(goal));
        return { content: [{ type: "text", text: JSON.stringify(goal, null, 2) + `\n\nActive goals stored: ${goals.filter((g: any) => g.status === "active").length}` }] };
      }
    );

    mcp.tool(
      "propose_cofounder_decision",
      "Record a decision that needs a human approval before a bounded execution step.",
      {
        title: z.string().min(3).max(200),
        objective: z.string().min(3).max(2000),
        recommendation: z.string().min(3).max(3000),
        rationale: z.string().min(3).max(4000),
        risk: z.enum(["low", "medium", "high", "critical"]),
        requestedAuthority: z.string().min(3).max(1000),
        budgetZAR: z.number().min(0).optional(),
      },
      async (input) => {
        const decision = { id: crypto.randomUUID(), ...input, status: "awaiting_approval", createdAt: isoNow() };
        await appendCofounderSettingArray("cofounder.decisions", decision);
        await writeAdminLog("cofounder.decision_proposed", "CofounderDecision", decision.id, JSON.stringify(decision));
        return { content: [{ type: "text", text: JSON.stringify({ ...decision, approvalRequired: true, instruction: "Ask the founder for explicit approval before executing the requested authority." }, null, 2) }] };
      }
    );

    mcp.tool(
      "approve_cofounder_decision",
      "Record explicit founder approval for a previously proposed decision. This does not itself execute the action.",
      {
        decisionId: z.string().min(1),
        approvedBy: z.string().min(1).max(200),
        scope: z.string().min(1).max(2000),
        budgetApprovedZAR: z.number().min(0).optional(),
        expiresAt: z.string().optional(),
        notes: z.string().max(2000).optional(),
      },
      async ({ decisionId, approvedBy, scope, budgetApprovedZAR, expiresAt, notes }) => {
        const decisions = await getCofounderSetting<any[]>("cofounder.decisions", []);
        const decision = decisions.find((d) => d.id === decisionId);
        if (!decision) return { content: [{ type: "text", text: `Decision ${decisionId} not found.` }], isError: true };
        const approval = { id: crypto.randomUUID(), decisionId, approvedBy, scope, budgetApprovedZAR: budgetApprovedZAR ?? null, expiresAt: expiresAt ?? null, notes: notes ?? "", approvedAt: isoNow(), status: "approved" };
        await appendCofounderSettingArray("cofounder.approvals", approval);
        const next = decisions.map((d) => d.id === decisionId ? { ...d, status: "approved", approvedAt: approval.approvedAt, approvalId: approval.id } : d);
        await setCofounderSetting("cofounder.decisions", next);
        await writeAdminLog("cofounder.decision_approved", "CofounderDecision", decisionId, JSON.stringify(approval));
        return { content: [{ type: "text", text: JSON.stringify({ approval, decision: { ...decision, status: "approved" } }, null, 2) }] };
      }
    );

    mcp.tool(
      "record_cofounder_action",
      "Audit an action taken under an approved objective. Use approvalId for any externally consequential action.",
      {
        action: z.string().min(3).max(300),
        objective: z.string().min(3).max(1000),
        outcome: z.string().min(1).max(3000),
        status: z.enum(["prepared", "executed", "verified", "blocked", "failed"]),
        approvalId: z.string().optional(),
        externalSideEffect: z.boolean().default(false),
      },
      async (input) => {
        if (input.externalSideEffect && !input.approvalId) {
          return { content: [{ type: "text", text: "Blocked: externalSideEffect=true requires an approvalId." }], isError: true };
        }
        const item = { id: crypto.randomUUID(), ...input, createdAt: isoNow() };
        await appendCofounderSettingArray("cofounder.actions", item);
        await writeAdminLog("cofounder.action", "CofounderAction", item.id, JSON.stringify(item));
        return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
      }
    );

    mcp.tool(
      "initialize_founding15_campaign",
      "Initialize or safely reset the Founding 15 R3,000 campaign configuration. Does not pay anyone.",
      { budgetZAR: z.number().min(0).default(3000), maxParticipants: z.number().int().min(1).max(100).default(15) },
      async ({ budgetZAR, maxParticipants }) => {
        const existing = await getCofounderSetting<any>("cofounder.campaign.founding15", null);
        if (existing?.candidates?.length || existing?.events?.length) {
          return { content: [{ type: "text", text: "Founding 15 already has tracked activity. Refusing to reset it; use update_founding15_candidate and record_founding15_event instead." }], isError: true };
        }
        const campaign = { ...DEFAULT_FOUNDING15, budgetZAR, maxParticipants, createdAt: isoNow() };
        await setCofounderSetting("cofounder.campaign.founding15", campaign);
        await writeAdminLog("cofounder.founding15_initialized", "Campaign", campaign.campaignId, JSON.stringify(campaign));
        return { content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }] };
      }
    );

    mcp.tool(
      "get_founding15_status",
      "Calculate Founding 15 participation, reward commitments, remaining budget, and conversion progress from tracked events plus live Vuka data.",
      {},
      async () => {
        const campaign = await getCofounderSetting<any>("cofounder.campaign.founding15", DEFAULT_FOUNDING15);
        const { data: artists, error } = await supabase.from("Artist").select("id,name,slug,isFoundingArtist,createdAt");
        if (error) return { content: [{ type: "text", text: `Artist query failed: ${error.message}` }], isError: true };
        const candidates = campaign.candidates ?? [];
        const events = campaign.events ?? [];
        const committed = candidates.reduce((sum: number, c: any) => sum + (c.rewardCommittedZAR ?? 0), 0);
        const confirmedSales = events.filter((e: any) => e.type === "first_purchase_confirmed").length;
        const crowdfundingQualified = events.filter((e: any) => e.type === "crowdfunding_3_backers").length;
        const albumQualified = events.filter((e: any) => e.type === "album_or_8_beats_and_purchase").length;
        const liveFoundingArtists = (artists ?? []).filter((a: any) => a.isFoundingArtist).length;
        const status = { campaign, trackedCandidates: candidates.length, committedRewardsZAR: committed, remainingBudgetZAR: campaign.budgetZAR - committed, firstPurchaseConfirmed: confirmedSales, crowdfundingQualified, albumQualified, liveFoundingArtists, budgetSafe: committed <= campaign.budgetZAR, liveArtistCount: (artists ?? []).length, generatedAt: isoNow() };
        return { content: [{ type: "text", text: JSON.stringify(status, null, 2) }] };
      }
    );

    mcp.tool(
      "update_founding15_candidate",
      "Add or update one Founding 15 candidate. Reward amounts are calculated from the configured rules and budget is checked before committing them.",
      {
        candidateId: z.string().optional(),
        name: z.string().min(1).max(200),
        email: z.string().email(),
        source: z.string().max(500).optional(),
        status: z.enum(["prospect", "contacted", "signed_up", "uploaded", "first_sale", "qualified", "reward_pending", "rewarded", "declined"]).default("prospect"),
        signupUploadFirstPurchase: z.boolean().default(false),
        crowdfunding3Backers: z.boolean().default(false),
        albumOr8BeatsAndPurchase: z.boolean().default(false),
        notes: z.string().max(3000).optional(),
      },
      async (input) => {
        const campaign = await getCofounderSetting<any>("cofounder.campaign.founding15", DEFAULT_FOUNDING15);
        const candidates = campaign.candidates ?? [];
        const id = input.candidateId ?? crypto.randomUUID();
        const rewardCommittedZAR = (input.signupUploadFirstPurchase ? campaign.rewards.signupUploadAndFirstPurchase : 0) + (input.crowdfunding3Backers ? campaign.rewards.crowdfunding3Backers : 0) + (input.albumOr8BeatsAndPurchase ? campaign.rewards.albumOr8BeatsAndPurchase : 0);
        const old = candidates.find((c: any) => c.id === id);
        const oldReward = old?.rewardCommittedZAR ?? 0;
        const newTotal = candidates.reduce((sum: number, c: any) => sum + (c.id === id ? rewardCommittedZAR : (c.rewardCommittedZAR ?? 0)), 0);
        if (!old && candidates.length >= campaign.maxParticipants) return { content: [{ type: "text", text: `Participant limit reached (${campaign.maxParticipants}).` }], isError: true };
        if (newTotal > campaign.budgetZAR) return { content: [{ type: "text", text: `Budget guard blocked this update. New committed rewards would be R${newTotal.toFixed(2)} against R${campaign.budgetZAR.toFixed(2)}.` }], isError: true };
        const candidate = { id, ...input, rewardCommittedZAR, updatedAt: isoNow(), createdAt: old?.createdAt ?? isoNow() };
        const next = old ? candidates.map((c: any) => c.id === id ? candidate : c) : [candidate, ...candidates];
        await setCofounderSetting("cofounder.campaign.founding15", { ...campaign, candidates: next, status: "active", updatedAt: isoNow() });
        await writeAdminLog("cofounder.founding15_candidate_updated", "CampaignCandidate", id, JSON.stringify({ ...candidate, previousRewardZAR: oldReward }));
        return { content: [{ type: "text", text: JSON.stringify({ candidate, committedRewardsZAR: newTotal, remainingBudgetZAR: campaign.budgetZAR - newTotal }, null, 2) }] };
      }
    );

    mcp.tool(
      "record_founding15_event",
      "Record a verifiable campaign milestone. This only records progress; it does not pay rewards.",
      {
        candidateId: z.string(),
        type: z.enum(["contacted", "signed_up", "music_uploaded", "first_purchase_confirmed", "crowdfunding_3_backers", "album_or_8_beats_and_purchase", "reward_approved", "reward_paid"]),
        evidence: z.string().min(1).max(2000),
        valueZAR: z.number().min(0).optional(),
      },
      async (input) => {
        const campaign = await getCofounderSetting<any>("cofounder.campaign.founding15", DEFAULT_FOUNDING15);
        const candidate = (campaign.candidates ?? []).find((c: any) => c.id === input.candidateId);
        if (!candidate) return { content: [{ type: "text", text: `Candidate ${input.candidateId} not found.` }], isError: true };
        const event = { id: crypto.randomUUID(), ...input, recordedAt: isoNow() };
        const nextCampaign = { ...campaign, events: [event, ...(campaign.events ?? [])], updatedAt: isoNow() };
        await setCofounderSetting("cofounder.campaign.founding15", nextCampaign);
        await writeAdminLog("cofounder.founding15_event", "CampaignCandidate", input.candidateId, JSON.stringify(event));
        return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }] };
      }
    );

    mcp.tool(
      "analyze_founding15_budget",
      "Stress-test the R3,000 Founding 15 reward design before money is committed.",
      { participants: z.number().int().min(0).max(100).default(15), crowdfundingQualified: z.number().int().min(0).max(100).default(0), albumQualified: z.number().int().min(0).max(100).default(0) },
      async ({ participants, crowdfundingQualified, albumQualified }) => {
        const campaign = await getCofounderSetting<any>("cofounder.campaign.founding15", DEFAULT_FOUNDING15);
        const base = participants * campaign.rewards.signupUploadAndFirstPurchase;
        const crowdfunding = crowdfundingQualified * campaign.rewards.crowdfunding3Backers;
        const album = albumQualified * campaign.rewards.albumOr8BeatsAndPurchase;
        const total = base + crowdfunding + album;
        const result = { budgetZAR: campaign.budgetZAR, scenario: { participants, crowdfundingQualified, albumQualified }, maximumPossibleUnderScenarioZAR: total, remainingZAR: campaign.budgetZAR - total, withinBudget: total <= campaign.budgetZAR, warning: total > campaign.budgetZAR ? "Scenario exceeds budget. Do not promise all rewards simultaneously without increasing the budget or changing the rules." : "Scenario fits within the configured budget." };
        return { content: [{ type: "text", text: JSON.stringify(result, null, 2) }] };
      }
    );

    mcp.tool(
      "draft_founding15_email",
      "Prepare a Founding 15 outreach email for founder approval. It never sends the email.",
      { recipientName: z.string().min(1).max(200), recipientEmail: z.string().email(), angle: z.enum(["invitation", "follow_up", "qualified", "reward_ready"]).default("invitation"), personalContext: z.string().max(1500).optional() },
      async ({ recipientName, recipientEmail, angle, personalContext }) => {
        const subjects: Record<string, string> = { invitation: "Vuka Music — I want you in our Founding 15", follow_up: "Quick follow-up — Vuka Music Founding 15", qualified: "You’ve qualified for Vuka’s Founding 15", reward_ready: "Your Vuka Founding 15 reward is ready" };
        const body = angle === "invitation"
          ? `Hey ${recipientName},\n\nI’m building Vuka Music — a direct-to-fan platform for independent artists — and I’m inviting a very small first group into our Founding 15.\n\nThe goal is simple: get your music properly set up on Vuka, get your first real fan purchase, and help us prove the platform with the artists who join first.\n\n${personalContext ? `Why I thought of you: ${personalContext}\n\n` : ""}I’d love to have you as one of the first 15.\n\nIf you’re interested, I’ll send you the exact steps.\n\n— Vuka Music`
          : `Hey ${recipientName},\n\n${angle === "follow_up" ? "Just following up on the Vuka Music Founding 15 invitation." : angle === "qualified" ? "You’ve reached the qualification milestone we were tracking for the Founding 15." : "We’ve reached the reward stage we were tracking for your Founding 15 participation."}\n\nI’ll confirm the exact next step and reward status before anything is paid.\n\n— Vuka Music`;
        return { content: [{ type: "text", text: JSON.stringify({ to: recipientEmail, subject: subjects[angle], body, sendStatus: "draft_only" }, null, 2) }] };
      }
    );

    mcp.tool(
      "log_cofounder_research",
      "Store a research finding, source, confidence, and the decision it may affect.",
      { topic: z.string().min(2).max(300), finding: z.string().min(2).max(5000), source: z.string().max(1000).optional(), confidence: z.enum(["high", "medium", "low"]), implication: z.string().max(2000).optional() },
      async (input) => {
        const finding = { id: crypto.randomUUID(), ...input, createdAt: isoNow() };
        await appendCofounderSettingArray("cofounder.research", finding, 1000);
        await writeAdminLog("cofounder.research_logged", "ResearchFinding", finding.id, JSON.stringify(finding));
        return { content: [{ type: "text", text: JSON.stringify(finding, null, 2) }] };
      }
    );

    mcp.tool(
      "get_cofounder_decision_queue",
      "Return unresolved decisions and their approvals so ChatGPT can keep execution aligned with founder authority.",
      {},
      async () => {
        const [decisions, approvals] = await Promise.all([
          getCofounderSetting<any[]>("cofounder.decisions", []),
          getCofounderSetting<any[]>("cofounder.approvals", []),
        ]);
        const approvalByDecision = new Map(approvals.map((a) => [a.decisionId, a]));
        const queue = decisions.filter((d) => d.status !== "executed").map((d) => ({ ...d, approval: approvalByDecision.get(d.id) ?? null }));
        return { content: [{ type: "text", text: JSON.stringify(queue.slice(0, 100), null, 2) }] };
      }
    );

    mcp.tool(
      "get_company_dashboard",
      "One-call founder dashboard combining live Vuka metrics, revenue, campaign state, budget, open decisions, and operational risks.",
      {},
      async () => {
        const [artists, users, purchases, payouts, campaigns, decisions, state] = await Promise.all([
          supabase.from("Artist").select("id,planSlug,isVerified,isFoundingArtist,lifetimeGrossSales"),
          supabase.from("User").select("id", { count: "exact", head: true }),
          supabase.from("Purchase").select("amount,netAmount,status,createdAt"),
          supabase.from("PayoutRequest").select("amount,status,createdAt"),
          supabase.from("campaigns").select("id,status,targetAmount,currentAmount,backerCount"),
          getCofounderSetting<any[]>("cofounder.decisions", []),
          getCofounderSetting("cofounder.state", DEFAULT_STATE),
        ]);
        const confirmed = (purchases.data ?? []).filter((p: any) => p.status === "confirmed");
        const dashboard = {
          company: state,
          users: users.count ?? 0,
          artists: (artists.data ?? []).length,
          verifiedArtists: (artists.data ?? []).filter((a: any) => a.isVerified).length,
          foundingArtists: (artists.data ?? []).filter((a: any) => a.isFoundingArtist).length,
          confirmedPurchaseGMVZAR: confirmed.reduce((s: number, p: any) => s + (p.amount ?? 0), 0),
          confirmedArtistNetZAR: confirmed.reduce((s: number, p: any) => s + (p.netAmount ?? 0), 0),
          pendingPayoutRequestsZAR: (payouts.data ?? []).filter((p: any) => p.status === "pending" || p.status === "approved").reduce((s: number, p: any) => s + (p.amount ?? 0), 0),
          activeCrowdfundingCampaigns: (campaigns.data ?? []).filter((c: any) => c.status === "active").length,
          openDecisions: decisions.filter((d: any) => d.status === "awaiting_approval").length,
          asOf: isoNow(),
        };
        return { content: [{ type: "text", text: JSON.stringify(dashboard, null, 2) }] };
      }
    );
  },
  {},
  { basePath: "/api/mcp-cofounder", maxDuration: 120, verboseLogs: true }
);

export { server as GET, server as POST, server as DELETE };

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
