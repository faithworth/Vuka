/**
 * VUKA — Realtime (Supabase Broadcast)
 *
 * Deliberately uses Broadcast, not Postgres Changes / CDC replication:
 * Broadcast is plain pub/sub over the Supabase Realtime websocket and
 * works immediately with the existing project — no "enable replication
 * on this table" step in the Supabase dashboard, and no RLS policy
 * reconciliation needed (Prisma's User.id isn't the same as Supabase
 * auth.uid(), which would otherwise complicate Postgres-Changes RLS).
 *
 * Flow: an API route writes to the DB via Prisma as normal, then calls
 * broadcast() to push the same event over a named channel. Clients
 * subscribe to that channel with the anon key (see src/lib/supabase.ts)
 * and merge the pushed payload into their state as a live update, while
 * a slower poll keeps running underneath as a safety net for missed
 * events (reconnects, tab was asleep, etc).
 */

import { createServiceClient } from './supabase_server';
import { logger } from './logger';

export async function broadcast(
  channelName: string,
  event: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const supabase = await createServiceClient();
    const channel = supabase.channel(channelName);
    await channel.send({ type: 'broadcast', event, payload });
    await supabase.removeChannel(channel);
  } catch (err) {
    // Realtime is a nice-to-have layer on top of polling — never let a
    // broadcast failure break the underlying write it's reporting on.
    logger.warn('[realtime] broadcast failed', {
      channelName, event, error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const channels = {
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  inbox: (userId: string) => `inbox:${userId}`,
};
