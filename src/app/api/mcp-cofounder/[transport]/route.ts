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

const DEFAULT_CAMPAIGN_LAB = {
  campaignId: "traction-lab-3000",
  name: "Vuka Traction Lab",
  budgetZAR: 3000,
  status: "planning",
  tracks: {
    artists: { label: "Artist acquisition + activation", allocationZAR: 1800, objective: "Recruit artists, get music live, and create the conditions for first genuine fan purchases." },
    friends: { label: "Friends/fans + transaction activation", allocationZAR: 1200, objective: "Recruit real early fans/friends and turn attention into genuine purchases and repeat activity." },
  },
  reserveZAR: 0,
  events: [],
  commitments: [],
  createdAt: isoNow(),
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
    mcp.tool("get_cofounder_state", "Read the durable operating state for the ChatGPT/Vuka AI co-founder relationship.", {}, async () => {
      const [state, goals, decisions, approvals, actions] = await Promise.all([
        getCofounderSetting("cofounder.state", DEFAULT_STATE),
        getCofounderSetting("cofounder.goals", []),
        getCofounderSetting("cofounder.decisions", []),
        getCofounderSetting("cofounder.approvals", []),
        getCofounderSetting("cofounder.actions", []),
      ]);
      return { content: [{ type: "text", text: JSON.stringify({ state, goals, decisions, approvals: (approvals as unknown[]).slice(0, 20), recentActions: (actions as unknown[]).slice(0, 20) }, null, 2) }] };
    });

    mcp.tool("set_cofounder_goal", "Create or update a company goal. Planning state only; does not spend money or publish anything.", {
      title: z.string().min(3).max(200), description: z.string().min(3).max(2000), priority: z.enum(["critical", "high", "medium", "low"]).default("high"), targetDate: z.string().optional(), successMetric: z.string().max(500).optional(),
    }, async ({ title, description, priority, targetDate, successMetric }) => {
      const goal = { id: crypto.randomUUID(), title, description, priority, targetDate: targetDate ?? null, successMetric: successMetric ?? null, status: "active", createdAt: isoNow(), updatedAt: isoNow() };
      const goals = await appendCofounderSettingArray("cofounder.goals", goal);
      await writeAdminLog("cofounder.goal_created", "CofounderGoal", goal.id, JSON.stringify(goal));
      return { content: [{ type: "text", text: JSON.stringify(goal, null, 2) + `\n\nActive goals stored: ${goals.filter((g: any) => g.status === "active").length}` }] };
    });

    mcp.tool("propose_cofounder_decision", "Record a decision that needs a human approval before a bounded execution step.", {
      title: z.string().min(3).max(200), objective: z.string().min(3).max(2000), recommendation: z.string().min(3).max(3000), rationale: z.string().min(3).max(4000), risk: z.enum(["low", "medium", "high", "critical"]), requestedAuthority: z.string().min(3).max(1000), budgetZAR: z.number().min(0).optional(),
    }, async (input) => {
      const decision = { id: crypto.randomUUID(), ...input, status: "awaiting_approval", createdAt: isoNow() };
      await appendCofounderSettingArray("cofounder.decisions", decision);
      await writeAdminLog("cofounder.decision_proposed", "CofounderDecision", decision.id, JSON.stringify(decision));
      return { content: [{ type: "text", text: JSON.stringify({ ...decision, approvalRequired: true, instruction: "Ask the founder for explicit approval before executing the requested authority." }, null, 2) }] };
    });

    mcp.tool("approve_cofounder_decision", "Record explicit founder approval for a previously proposed decision. This does not itself execute the action.", {
      decisionId: z.string().min(1), approvedBy: z.string().min(1).max(200), scope: z.string().min(1).max(2000), budgetApprovedZAR: z.number().min(0).optional(), expiresAt: z.string().optional(), notes: z.string().max(2000).optional(),
    }, async ({ decisionId, approvedBy, scope, budgetApprovedZAR, expiresAt, notes }) => {
      const decisions = await getCofounderSetting<any[]>("cofounder.decisions", []);
      const decision = decisions.find((d) => d.id === decisionId);
      if (!decision) return { content: [{ type: "text", text: `Decision ${decisionId} not found.` }], isError: true };
      const approval = { id: crypto.randomUUID(), decisionId, approvedBy, scope, budgetApprovedZAR: budgetApprovedZAR ?? null, expiresAt: expiresAt ?? null, notes: notes ?? "", approvedAt: isoNow(), status: "approved" };
      await appendCofounderSettingArray("cofounder.approvals", approval);
      const next = decisions.map((d) => d.id === decisionId ? { ...d, status: "approved", approvedAt: approval.approvedAt, approvalId: approval.id } : d);
      await setCofounderSetting("cofounder.decisions", next);
      await writeAdminLog("cofounder.decision_approved", "CofounderDecision", decisionId, JSON.stringify(approval));
      return { content: [{ type: "text", text: JSON.stringify({ approval, decision: { ...decision, status: "approved" } }, null, 2) }] };
    });

    mcp.tool("record_cofounder_action", "Audit an action taken under an approved objective. Use approvalId for any externally consequential action.", {
      action: z.string().min(3).max(300), objective: z.string().min(3).max(1000), outcome: z.string().min(1).max(3000), status: z.enum(["prepared", "executed", "verified", "blocked", "failed"]), approvalId: z.string().optional(), externalSideEffect: z.boolean().default(false),
    }, async (input) => {
      if (input.externalSideEffect && !input.approvalId) return { content: [{ type: "text", text: "Blocked: externalSideEffect=true requires an approvalId." }], isError: true };
      const item = { id: crypto.randomUUID(), ...input, createdAt: isoNow() };
      await appendCofounderSettingArray("cofounder.actions", item);
      await writeAdminLog("cofounder.action", "CofounderAction", item.id, JSON.stringify(item));
      return { content: [{ type: "text", text: JSON.stringify(item, null, 2) }] };
    });

    mcp.tool("initialize_campaign_lab", "Initialize the flexible R3,000 traction experiment with separate artist and friends/fan tracks. Does not spend money.", {
      budgetZAR: z.number().min(0).max(3000).default(3000), artistsAllocationZAR: z.number().min(0).default(1800), friendsAllocationZAR: z.number().min(0).default(1200), reserveZAR: z.number().min(0).default(0),
    }, async ({ budgetZAR, artistsAllocationZAR, friendsAllocationZAR, reserveZAR }) => {
      const total = artistsAllocationZAR + friendsAllocationZAR + reserveZAR;
      if (total > budgetZAR) return { content: [{ type: "text", text: `Budget guard blocked initialization: R${total.toFixed(2)} allocated against R${budgetZAR.toFixed(2)}.` }], isError: true };
      const existing = await getCofounderSetting<any>("cofounder.campaign.lab", null);
      if (existing?.events?.length || existing?.commitments?.length) return { content: [{ type: "text", text: "Campaign lab already has tracked activity. Refusing to reset it; update the allocation instead." }], isError: true };
      const lab = { ...DEFAULT_CAMPAIGN_LAB, budgetZAR, tracks: { artists: { ...DEFAULT_CAMPAIGN_LAB.tracks.artists, allocationZAR: artistsAllocationZAR }, friends: { ...DEFAULT_CAMPAIGN_LAB.tracks.friends, allocationZAR: friendsAllocationZAR } }, reserveZAR, createdAt: isoNow(), updatedAt: isoNow() };
      await setCofounderSetting("cofounder.campaign.lab", lab);
      await writeAdminLog("cofounder.campaign_lab_initialized", "Campaign", lab.campaignId, JSON.stringify(lab));
      return { content: [{ type: "text", text: JSON.stringify(lab, null, 2) }] };
    });

    mcp.tool("get_campaign_lab_status", "Return artist/friends allocations, commitments, transaction activity and budget safety.", {}, async () => {
      const lab = await getCofounderSetting<any>("cofounder.campaign.lab", DEFAULT_CAMPAIGN_LAB);
      const commitments = lab.commitments ?? [], events = lab.events ?? [];
      const committed = commitments.reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0);
      const byTrack = ["artists", "friends"].reduce((a: any, track) => {
        const te = events.filter((e: any) => e.track === track), tc = commitments.filter((c: any) => c.track === track);
        a[track] = { allocationZAR: lab.tracks?.[track]?.allocationZAR ?? 0, committedZAR: tc.reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0), events: te.length, transactions: te.filter((e: any) => e.type === "genuine_transaction").length, transactionValueZAR: te.filter((e: any) => e.type === "genuine_transaction").reduce((s: number, e: any) => s + (e.valueZAR ?? 0), 0) };
        return a;
      }, {});
      const allocated = (lab.tracks?.artists?.allocationZAR ?? 0) + (lab.tracks?.friends?.allocationZAR ?? 0) + (lab.reserveZAR ?? 0);
      return { content: [{ type: "text", text: JSON.stringify({ lab, byTrack, allocatedZAR: allocated, committedZAR: committed, uncommittedZAR: lab.budgetZAR - committed, unallocatedZAR: lab.budgetZAR - allocated, budgetSafe: committed <= lab.budgetZAR && allocated <= lab.budgetZAR, generatedAt: isoNow() }, null, 2) }] };
    });

    mcp.tool("allocate_campaign_lab_budget", "Rebalance artist and friends/fan allocations. Existing commitments are protected and the hard R3,000 ceiling cannot be exceeded.", {
      artistsAllocationZAR: z.number().min(0), friendsAllocationZAR: z.number().min(0), reserveZAR: z.number().min(0).default(0),
    }, async ({ artistsAllocationZAR, friendsAllocationZAR, reserveZAR }) => {
      const lab = await getCofounderSetting<any>("cofounder.campaign.lab", DEFAULT_CAMPAIGN_LAB);
      const allocation = artistsAllocationZAR + friendsAllocationZAR + reserveZAR;
      const committed = (lab.commitments ?? []).reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0);
      if (allocation > lab.budgetZAR || allocation < committed) return { content: [{ type: "text", text: `Allocation blocked. Requested R${allocation.toFixed(2)}, committed R${committed.toFixed(2)}, ceiling R${lab.budgetZAR.toFixed(2)}.` }], isError: true };
      const next = { ...lab, tracks: { ...lab.tracks, artists: { ...lab.tracks.artists, allocationZAR: artistsAllocationZAR }, friends: { ...lab.tracks.friends, allocationZAR: friendsAllocationZAR } }, reserveZAR, updatedAt: isoNow() };
      await setCofounderSetting("cofounder.campaign.lab", next);
      await writeAdminLog("cofounder.campaign_lab_reallocated", "Campaign", lab.campaignId, JSON.stringify({ artistsAllocationZAR, friendsAllocationZAR, reserveZAR }));
      return { content: [{ type: "text", text: JSON.stringify({ ...next, committedZAR: committed, remainingZAR: lab.budgetZAR - committed }, null, 2) }] };
    });

    mcp.tool("commit_campaign_lab_reward", "Reserve an incentive against either campaign track without sending money. Track and global budget guards apply.", {
      track: z.enum(["artists", "friends"]), recipient: z.string().min(1).max(300), amountZAR: z.number().min(0), reason: z.string().min(3).max(1000), evidence: z.string().min(3).max(2000),
    }, async ({ track, recipient, amountZAR, reason, evidence }) => {
      const lab = await getCofounderSetting<any>("cofounder.campaign.lab", DEFAULT_CAMPAIGN_LAB), commitments = lab.commitments ?? [];
      const committed = commitments.reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0), trackCommitted = commitments.filter((c: any) => c.track === track).reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0), allocation = lab.tracks?.[track]?.allocationZAR ?? 0;
      if (committed + amountZAR > lab.budgetZAR) return { content: [{ type: "text", text: `Commitment blocked: total would be R${(committed + amountZAR).toFixed(2)} against R${lab.budgetZAR.toFixed(2)}.` }], isError: true };
      if (trackCommitted + amountZAR > allocation) return { content: [{ type: "text", text: `Track budget blocked: ${track} would exceed its R${allocation.toFixed(2)} allocation.` }], isError: true };
      const commitment = { id: crypto.randomUUID(), track, recipient, amountZAR, reason, evidence, status: "reserved_pending_approval", createdAt: isoNow() };
      await setCofounderSetting("cofounder.campaign.lab", { ...lab, commitments: [commitment, ...commitments], updatedAt: isoNow() });
      await writeAdminLog("cofounder.campaign_lab_commitment", "Campaign", lab.campaignId, JSON.stringify(commitment));
      return { content: [{ type: "text", text: JSON.stringify({ commitment, committedZAR: committed + amountZAR, remainingZAR: lab.budgetZAR - committed - amountZAR, approvalRequired: true, instruction: "Do not pay or externally promise this reward until the founder approves the specific commitment." }, null, 2) }] };
    });

    mcp.tool("record_campaign_lab_event", "Record a measurable artist or friends/fan event. Genuine transactions require positive value and evidence; recording never creates a payment.", {
      track: z.enum(["artists", "friends"]), type: z.enum(["prospect", "contacted", "signup", "artist_activated", "fan_activated", "genuine_transaction", "repeat_transaction", "referral"]), subject: z.string().min(1).max(300), evidence: z.string().min(3).max(2000), valueZAR: z.number().min(0).optional(),
    }, async (input) => {
      if (input.type === "genuine_transaction" && (!input.valueZAR || input.valueZAR <= 0)) return { content: [{ type: "text", text: "A genuine_transaction event requires a positive valueZAR." }], isError: true };
      const lab = await getCofounderSetting<any>("cofounder.campaign.lab", DEFAULT_CAMPAIGN_LAB);
      const event = { id: crypto.randomUUID(), ...input, recordedAt: isoNow() };
      await setCofounderSetting("cofounder.campaign.lab", { ...lab, events: [event, ...(lab.events ?? [])], updatedAt: isoNow() });
      await writeAdminLog("cofounder.campaign_lab_event", "Campaign", lab.campaignId, JSON.stringify(event));
      return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }] };
    });

    // Original Founding 15 tools from PR #28 remain available below.
    mcp.tool("initialize_founding15_campaign", "Initialize or safely reset the Founding 15 R3,000 campaign configuration. Does not pay anyone.", { budgetZAR: z.number().min(0).default(3000), maxParticipants: z.number().int().min(1).max(100).default(15) }, async ({ budgetZAR, maxParticipants }) => {
      const existing = await getCofounderSetting<any>("cofounder.campaign.founding15", null);
      if (existing?.candidates?.length || existing?.events?.length) return { content: [{ type: "text", text: "Founding 15 already has tracked activity. Refusing to reset it; use update_founding15_candidate and record_founding15_event instead." }], isError: true };
      const campaign = { ...DEFAULT_FOUNDING15, budgetZAR, maxParticipants, createdAt: isoNow() };
      await setCofounderSetting("cofounder.campaign.founding15", campaign);
      await writeAdminLog("cofounder.founding15_initialized", "Campaign", campaign.campaignId, JSON.stringify(campaign));
      return { content: [{ type: "text", text: JSON.stringify(campaign, null, 2) }] };
    });

    mcp.tool("get_founding15_status", "Calculate Founding 15 participation, reward commitments, remaining budget, and conversion progress from tracked events plus live Vuka data.", {}, async () => {
      const campaign = await getCofounderSetting<any>("cofounder.campaign.founding15", DEFAULT_FOUNDING15);
      const { data: artists, error } = await supabase.from("Artist").select("id,name,slug,isFoundingArtist,createdAt");
      if (error) return { content: [{ type: "text", text: `Artist query failed: ${error.message}` }], isError: true };
      const candidates = campaign.candidates ?? [], events = campaign.events ?? [], committed = candidates.reduce((sum: number, c: any) => sum + (c.rewardCommittedZAR ?? 0), 0);
      return { content: [{ type: "text", text: JSON.stringify({ campaign, trackedCandidates: candidates.length, committedRewardsZAR: committed, remainingBudgetZAR: campaign.budgetZAR - committed, firstPurchaseConfirmed: events.filter((e: any) => e.type === "first_purchase_confirmed").length, crowdfundingQualified: events.filter((e: any) => e.type === "crowdfunding_3_backers").length, albumQualified: events.filter((e: any) => e.type === "album_or_8_beats_and_purchase").length, liveFoundingArtists: (artists ?? []).filter((a: any) => a.isFoundingArtist).length, budgetSafe: committed <= campaign.budgetZAR, liveArtistCount: (artists ?? []).length, generatedAt: isoNow() }, null, 2) }] };
    });

    mcp.tool("update_founding15_candidate", "Add or update one Founding 15 candidate. Reward amounts are calculated from configured rules and budget is checked before committing them.", {
      candidateId: z.string().optional(), name: z.string().min(1).max(200), email: z.string().email(), source: z.string().max(500).optional(), status: z.enum(["prospect", "contacted", "signed_up", "uploaded", "first_sale", "qualified", "reward_pending", "rewarded", "declined"]).default("prospect"), signupUploadFirstPurchase: z.boolean().default(false), crowdfunding3Backers: z.boolean().default(false), albumOr8BeatsAndPurchase: z.boolean().default(false), notes: z.string().max(3000).optional(),
    }, async (input) => {
      const campaign = await getCofounderSetting<any>("cofounder.campaign.founding15", DEFAULT_FOUNDING15), candidates = campaign.candidates ?? [], id = input.candidateId ?? crypto.randomUUID();
      const rewardCommittedZAR = (input.signupUploadFirstPurchase ? campaign.rewards.signupUploadAndFirstPurchase : 0) + (input.crowdfunding3Backers ? campaign.rewards.crowdfunding3Backers : 0) + (input.albumOr8BeatsAndPurchase ? campaign.rewards.albumOr8BeatsAndPurchase : 0);
      const old = candidates.find((c: any) => c.id === id), oldReward = old?.rewardCommittedZAR ?? 0;
      const newTotal = candidates.reduce((sum: number, c: any) => sum + (c.id === id ? rewardCommittedZAR : (c.rewardCommittedZAR ?? 0)), 0);
      if (!old && candidates.length >= campaign.maxParticipants) return { content: [{ type: "text", text: `Participant limit reached (${campaign.maxParticipants}).` }], isError: true };
      if (newTotal > campaign.budgetZAR) return { content: [{ type: "text", text: `Budget guard blocked this update. New committed rewards would be R${newTotal.toFixed(2)} against R${campaign.budgetZAR.toFixed(2)}.` }], isError: true };
      const candidate = { id, ...input, rewardCommittedZAR, updatedAt: isoNow(), createdAt: old?.createdAt ?? isoNow() };
      const next = old ? candidates.map((c: any) => c.id === id ? candidate : c) : [candidate, ...candidates];
      await setCofounderSetting("cofounder.campaign.founding15", { ...campaign, candidates: next, status: "active", updatedAt: isoNow() });
      await writeAdminLog("cofounder.founding15_candidate_updated", "CampaignCandidate", id, JSON.stringify({ ...candidate, previousRewardZAR: oldReward }));
      return { content: [{ type: "text", text: JSON.stringify({ candidate, committedRewardsZAR: newTotal, remainingBudgetZAR: campaign.budgetZAR - newTotal }, null, 2) }] };
    });

    mcp.tool("record_founding15_event", "Record a verifiable campaign milestone. This only records progress; it does not pay rewards.", { candidateId: z.string(), type: z.enum(["contacted", "signed_up", "music_uploaded", "first_purchase_confirmed", "crowdfunding_3_backers", "album_or_8_beats_and_purchase", "reward_approved", "reward_paid"]), evidence: z.string().min(1).max(2000), valueZAR: z.number().min(0).optional() }, async (input) => {
      const campaign = await getCofounderSetting<any>("cofounder.campaign.founding15", DEFAULT_FOUNDING15), candidate = (campaign.candidates ?? []).find((c: any) => c.id === input.candidateId);
      if (!candidate) return { content: [{ type: "text", text: `Candidate ${input.candidateId} not found.` }], isError: true };
      const event = { id: crypto.randomUUID(), ...input, recordedAt: isoNow() };
      await setCofounderSetting("cofounder.campaign.founding15", { ...campaign, events: [event, ...(campaign.events ?? [])], updatedAt: isoNow() });
      await writeAdminLog("cofounder.founding15_event", "CampaignCandidate", input.candidateId, JSON.stringify(event));
      return { content: [{ type: "text", text: JSON.stringify(event, null, 2) }] };
    });

    mcp.tool("analyze_founding15_budget", "Stress-test the R3,000 Founding 15 reward design before money is committed.", { participants: z.number().int().min(0).max(100).default(15), crowdfundingQualified: z.number().int().min(0).max(100).default(0), albumQualified: z.number().int().min(0).max(100).default(0) }, async ({ participants, crowdfundingQualified, albumQualified }) => {
      const campaign = await getCofounderSetting<any>("cofounder.campaign.founding15", DEFAULT_FOUNDING15), total = participants * campaign.rewards.signupUploadAndFirstPurchase + crowdfundingQualified * campaign.rewards.crowdfunding3Backers + albumQualified * campaign.rewards.albumOr8BeatsAndPurchase;
      return { content: [{ type: "text", text: JSON.stringify({ budgetZAR: campaign.budgetZAR, scenario: { participants, crowdfundingQualified, albumQualified }, maximumPossibleUnderScenarioZAR: total, remainingZAR: campaign.budgetZAR - total, withinBudget: total <= campaign.budgetZAR, warning: total > campaign.budgetZAR ? "Scenario exceeds budget. Do not promise all rewards simultaneously." : "Scenario fits within the configured budget." }, null, 2) }] };
    });

    mcp.tool("draft_founding15_email", "Prepare a Founding 15 outreach email for founder approval. It never sends the email.", { recipientName: z.string().min(1).max(200), recipientEmail: z.string().email(), angle: z.enum(["invitation", "follow_up", "qualified", "reward_ready"]).default("invitation"), personalContext: z.string().max(1500).optional() }, async ({ recipientName, recipientEmail, angle, personalContext }) => {
      const subjects: Record<string, string> = { invitation: "Vuka Music — I want you in our Founding 15", follow_up: "Quick follow-up — Vuka Music Founding 15", qualified: "You’ve qualified for Vuka’s Founding 15", reward_ready: "Your Vuka Founding 15 reward is ready" };
      const body = angle === "invitation" ? `Hey ${recipientName},\n\nI’m building Vuka Music — a direct-to-fan platform for independent artists — and I’m inviting a very small first group into our Founding 15.\n\n${personalContext ? `Why I thought of you: ${personalContext}\n\n` : ""}If you’re interested, I’ll send you the exact steps.\n\n— Vuka Music` : `Hey ${recipientName},\n\nJust following up on the Vuka Music Founding 15. I’ll confirm the exact next step and reward status before anything is paid.\n\n— Vuka Music`;
      return { content: [{ type: "text", text: JSON.stringify({ to: recipientEmail, subject: subjects[angle], body, sendStatus: "draft_only" }, null, 2) }] };
    });

    mcp.tool("log_cofounder_research", "Store a research finding, source, confidence, and the decision it may affect.", { topic: z.string().min(2).max(300), finding: z.string().min(2).max(5000), source: z.string().max(1000).optional(), confidence: z.enum(["high", "medium", "low"]), implication: z.string().max(2000).optional() }, async (input) => {
      const finding = { id: crypto.randomUUID(), ...input, createdAt: isoNow() };
      await appendCofounderSettingArray("cofounder.research", finding, 1000);
      await writeAdminLog("cofounder.research_logged", "ResearchFinding", finding.id, JSON.stringify(finding));
      return { content: [{ type: "text", text: JSON.stringify(finding, null, 2) }] };
    });

    mcp.tool("get_cofounder_decision_queue", "Return unresolved decisions and their approvals so ChatGPT can keep execution aligned with founder authority.", {}, async () => {
      const [decisions, approvals] = await Promise.all([getCofounderSetting<any[]>("cofounder.decisions", []), getCofounderSetting<any[]>("cofounder.approvals", [])]);
      const approvalByDecision = new Map(approvals.map((a) => [a.decisionId, a]));
      return { content: [{ type: "text", text: JSON.stringify(decisions.filter((d) => d.status !== "executed").map((d) => ({ ...d, approval: approvalByDecision.get(d.id) ?? null })).slice(0, 100), null, 2) }] };
    });

    mcp.tool("get_company_dashboard", "One-call founder dashboard combining live Vuka metrics, revenue, campaign state, budget, open decisions, and operational risks.", {}, async () => {
      const [artists, users, purchases, payouts, campaigns, decisions, state] = await Promise.all([
        supabase.from("Artist").select("id,planSlug,isVerified,isFoundingArtist,lifetimeGrossSales"), supabase.from("User").select("id", { count: "exact", head: true }), supabase.from("Purchase").select("amount,netAmount,status,createdAt"), supabase.from("PayoutRequest").select("amount,status,createdAt"), supabase.from("campaigns").select("id,status,targetAmount,currentAmount,backerCount"), getCofounderSetting<any[]>("cofounder.decisions", []), getCofounderSetting("cofounder.state", DEFAULT_STATE),
      ]);
      const confirmed = (purchases.data ?? []).filter((p: any) => p.status === "confirmed");
      return { content: [{ type: "text", text: JSON.stringify({ company: state, users: users.count ?? 0, artists: (artists.data ?? []).length, verifiedArtists: (artists.data ?? []).filter((a: any) => a.isVerified).length, foundingArtists: (artists.data ?? []).filter((a: any) => a.isFoundingArtist).length, confirmedPurchaseGMVZAR: confirmed.reduce((s: number, p: any) => s + (p.amount ?? 0), 0), confirmedArtistNetZAR: confirmed.reduce((s: number, p: any) => s + (p.netAmount ?? 0), 0), pendingPayoutRequestsZAR: (payouts.data ?? []).filter((p: any) => p.status === "pending" || p.status === "approved").reduce((s: number, p: any) => s + (p.amount ?? 0), 0), activeCrowdfundingCampaigns: (campaigns.data ?? []).filter((c: any) => c.status === "active").length, openDecisions: decisions.filter((d: any) => d.status === "awaiting_approval").length, asOf: isoNow() }, null, 2) }] };
    });
  },
  {},
  { basePath: "/api/mcp-cofounder", maxDuration: 120, verboseLogs: true }
);

export { server as GET, server as POST, server as DELETE };

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS", "Access-Control-Allow-Headers": "*", "Access-Control-Max-Age": "86400" } });
}
