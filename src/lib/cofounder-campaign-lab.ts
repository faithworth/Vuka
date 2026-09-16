import { appendCofounderSettingArray, getCofounderSetting, isoNow, setCofounderSetting } from "@/lib/cofounder-store";
import { writeAdminLog } from "@/lib/mcp-shared";

export const DEFAULT_CAMPAIGN_LAB = {
  campaignId: "traction-lab-3000",
  name: "Vuka Traction Lab",
  budgetZAR: 3000,
  status: "planning",
  tracks: {
    artists: { label: "Artist acquisition + activation", allocationZAR: 1800 },
    friends: { label: "Friends/fans + transaction activation", allocationZAR: 1200 },
  },
  reserveZAR: 0,
  events: [],
  commitments: [],
  createdAt: isoNow(),
};

export async function initializeCampaignLab(budgetZAR: number, artistsAllocationZAR: number, friendsAllocationZAR: number, reserveZAR: number) {
  const total = artistsAllocationZAR + friendsAllocationZAR + reserveZAR;
  if (budgetZAR < 0 || budgetZAR > 3000 || total > budgetZAR) throw new Error(`Campaign budget exceeded: R${total.toFixed(2)} allocated against R${budgetZAR.toFixed(2)}.`);
  const existing = await getCofounderSetting<any>("cofounder.campaign.lab", null);
  if (existing?.events?.length || existing?.commitments?.length) throw new Error("Campaign lab already has activity; refusing to reset it.");
  const lab = { ...DEFAULT_CAMPAIGN_LAB, budgetZAR, tracks: { artists: { ...DEFAULT_CAMPAIGN_LAB.tracks.artists, allocationZAR: artistsAllocationZAR }, friends: { ...DEFAULT_CAMPAIGN_LAB.tracks.friends, allocationZAR: friendsAllocationZAR } }, reserveZAR, createdAt: isoNow(), updatedAt: isoNow() };
  await setCofounderSetting("cofounder.campaign.lab", lab);
  await writeAdminLog("cofounder.campaign_lab_initialized", "Campaign", lab.campaignId, JSON.stringify(lab));
  return lab;
}

export async function getCampaignLabStatus() {
  const lab = await getCofounderSetting<any>("cofounder.campaign.lab", DEFAULT_CAMPAIGN_LAB);
  const commitments = lab.commitments ?? [], events = lab.events ?? [];
  const committedZAR = commitments.reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0);
  const allocatedZAR = (lab.tracks?.artists?.allocationZAR ?? 0) + (lab.tracks?.friends?.allocationZAR ?? 0) + (lab.reserveZAR ?? 0);
  const byTrack: any = {};
  for (const track of ["artists", "friends"]) {
    const te = events.filter((e: any) => e.track === track), tc = commitments.filter((c: any) => c.track === track);
    byTrack[track] = { allocationZAR: lab.tracks?.[track]?.allocationZAR ?? 0, committedZAR: tc.reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0), events: te.length, transactions: te.filter((e: any) => e.type === "genuine_transaction").length, transactionValueZAR: te.filter((e: any) => e.type === "genuine_transaction").reduce((s: number, e: any) => s + (e.valueZAR ?? 0), 0) };
  }
  return { lab, byTrack, allocatedZAR, committedZAR, uncommittedZAR: lab.budgetZAR - committedZAR, unallocatedZAR: lab.budgetZAR - allocatedZAR, budgetSafe: allocatedZAR <= lab.budgetZAR && committedZAR <= lab.budgetZAR, generatedAt: isoNow() };
}

export async function allocateCampaignLabBudget(artistsAllocationZAR: number, friendsAllocationZAR: number, reserveZAR: number) {
  const lab = await getCofounderSetting<any>("cofounder.campaign.lab", DEFAULT_CAMPAIGN_LAB);
  const allocation = artistsAllocationZAR + friendsAllocationZAR + reserveZAR;
  const committed = (lab.commitments ?? []).reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0);
  if (allocation > lab.budgetZAR || allocation < committed) throw new Error(`Allocation blocked: requested R${allocation.toFixed(2)}, committed R${committed.toFixed(2)}, ceiling R${lab.budgetZAR.toFixed(2)}.`);
  const next = { ...lab, tracks: { ...lab.tracks, artists: { ...lab.tracks.artists, allocationZAR: artistsAllocationZAR }, friends: { ...lab.tracks.friends, allocationZAR: friendsAllocationZAR } }, reserveZAR, updatedAt: isoNow() };
  await setCofounderSetting("cofounder.campaign.lab", next);
  await writeAdminLog("cofounder.campaign_lab_reallocated", "Campaign", lab.campaignId, JSON.stringify({ artistsAllocationZAR, friendsAllocationZAR, reserveZAR }));
  return next;
}

export async function commitCampaignLabReward(track: "artists" | "friends", recipient: string, amountZAR: number, reason: string, evidence: string) {
  const lab = await getCofounderSetting<any>("cofounder.campaign.lab", DEFAULT_CAMPAIGN_LAB), commitments = lab.commitments ?? [];
  const committed = commitments.reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0), trackCommitted = commitments.filter((c: any) => c.track === track).reduce((s: number, c: any) => s + (c.amountZAR ?? 0), 0), allocation = lab.tracks?.[track]?.allocationZAR ?? 0;
  if (committed + amountZAR > lab.budgetZAR) throw new Error(`Commitment blocked: total would be R${(committed + amountZAR).toFixed(2)} against R${lab.budgetZAR.toFixed(2)}.`);
  if (trackCommitted + amountZAR > allocation) throw new Error(`Track budget blocked: ${track} would exceed R${allocation.toFixed(2)}.`);
  const commitment = { id: crypto.randomUUID(), track, recipient, amountZAR, reason, evidence, status: "reserved_pending_approval", createdAt: isoNow() };
  await setCofounderSetting("cofounder.campaign.lab", { ...lab, commitments: [commitment, ...commitments], updatedAt: isoNow() });
  await writeAdminLog("cofounder.campaign_lab_commitment", "Campaign", lab.campaignId, JSON.stringify(commitment));
  return commitment;
}

export async function recordCampaignLabEvent(input: { track: "artists" | "friends"; type: "prospect" | "contacted" | "signup" | "artist_activated" | "fan_activated" | "genuine_transaction" | "repeat_transaction" | "referral"; subject: string; evidence: string; valueZAR?: number }) {
  if (input.type === "genuine_transaction" && (!input.valueZAR || input.valueZAR <= 0)) throw new Error("A genuine_transaction event requires a positive valueZAR.");
  const lab = await getCofounderSetting<any>("cofounder.campaign.lab", DEFAULT_CAMPAIGN_LAB);
  const event = { id: crypto.randomUUID(), ...input, recordedAt: isoNow() };
  await setCofounderSetting("cofounder.campaign.lab", { ...lab, events: [event, ...(lab.events ?? [])], updatedAt: isoNow() });
  await appendCofounderSettingArray("cofounder.campaign.lab.events", event, 1000);
  await writeAdminLog("cofounder.campaign_lab_event", "Campaign", lab.campaignId, JSON.stringify(event));
  return event;
}
