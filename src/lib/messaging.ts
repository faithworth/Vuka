/**
 * VUKA — Messaging Infrastructure (Phase 3)
 * Creator-fan messaging, inquiry system, moderation protections
 */

import prisma from './prisma';
import { createNotification } from './social';
import { broadcast, channels } from './realtime';

const MAX_MESSAGE_LENGTH = 2000;
const MAX_ATTACHMENT_SIZE_MB = 10;
const ALLOWED_ATTACHMENT_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'audio/mpeg', 'audio/wav', 'application/pdf'];

// ── CONVERSATIONS ─────────────────────────────────────────────

/** Get or create a conversation between two users. */
export async function getOrCreateConversation(
  userId1: string,
  userId2: string
): Promise<object> {
  // Ensure deterministic ordering (participant1 < participant2 lexicographically)
  const [p1, p2] = [userId1, userId2].sort();

  const existing = await prisma.messageConversation.findUnique({
    where: { participant1_participant2: { participant1: p1, participant2: p2 } },
    include: { messages: { orderBy: { createdAt: 'desc' }, take: 1 } },
  });

  if (existing) return existing;

  return prisma.messageConversation.create({
    data: { participant1: p1, participant2: p2 },
  });
}

/** Get all conversations for a user (inbox). */
export async function getConversations(
  userId: string,
  page = 1,
  limit = 30
): Promise<{ conversations: object[]; total: number; hasMore: boolean }> {
  const skip = (page - 1) * Math.min(limit, 50);
  const take = Math.min(limit, 50);

  const where = {
    OR: [{ participant1: userId }, { participant2: userId }],
    NOT: [
      { AND: [{ participant1: userId }, { isArchived1: true }] },
      { AND: [{ participant2: userId }, { isArchived2: true }] },
    ],
  };

  const [conversations, total] = await Promise.all([
    prisma.messageConversation.findMany({
      where,
      include: {
        messages: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
        },
      },
      orderBy: { lastMessageAt: 'desc' },
      skip,
      take,
    }),
    prisma.messageConversation.count({ where }),
  ]);

  // Enrich with partner user info
  const enriched = await Promise.all(
    conversations.map(async (conv) => {
      const partnerId = (conv as { participant1: string; participant2: string }).participant1 === userId
        ? (conv as { participant2: string }).participant2
        : (conv as { participant1: string }).participant1;

      const partner = await prisma.user.findUnique({
        where: { id: partnerId },
        select: { id: true, name: true, artist: { select: { slug: true, photoUrl: true } } },
      });

      const isP1 = (conv as { participant1: string }).participant1 === userId;
      const unread = isP1 ? (conv as { unread1: number }).unread1 : (conv as { unread2: number }).unread2;

      return { ...conv, partner, unread };
    })
  );

  return { conversations: enriched, total, hasMore: skip + conversations.length < total };
}

/** Get messages in a conversation. */
export async function getMessages(
  conversationId: string,
  userId: string,
  cursor?: string,
  limit = 50
): Promise<{ messages: object[]; nextCursor: string | null }> {
  // Verify user is a participant
  const conv = await prisma.messageConversation.findUnique({
    where: { id: conversationId },
  });
  if (!conv) throw new Error('Conversation not found');
  const c = conv as { participant1: string; participant2: string };
  if (c.participant1 !== userId && c.participant2 !== userId) {
    throw new Error('Unauthorized');
  }

  const take = Math.min(limit, 100);
  const cursorDate = cursor ? new Date(cursor) : new Date();

  const messages = await prisma.message.findMany({
    where: {
      conversationId,
      isDeleted: false,
      createdAt: { lt: cursorDate },
    },
    include: {
      sender: { select: { id: true, name: true, artist: { select: { slug: true, photoUrl: true } } } },
    },
    orderBy: { createdAt: 'desc' },
    take,
  });

  // Mark unread messages as read
  await markMessagesRead(conversationId, userId);

  const nextCursor = messages.length === take
    ? messages[messages.length - 1].createdAt.toISOString()
    : null;

  return { messages: messages.reverse(), nextCursor };
}

/** Total unread message count across all (non-archived) conversations for a user. */
export async function getTotalUnreadCount(userId: string): Promise<number> {
  const conversations = await prisma.messageConversation.findMany({
    where: {
      OR: [{ participant1: userId }, { participant2: userId }],
      NOT: [
        { AND: [{ participant1: userId }, { isArchived1: true }] },
        { AND: [{ participant2: userId }, { isArchived2: true }] },
      ],
    },
    select: { participant1: true, unread1: true, unread2: true },
  });
  return conversations.reduce((sum, c) => sum + (c.participant1 === userId ? c.unread1 : c.unread2), 0);
}

// ── PEOPLE DIRECTORY (for "New Message") ───────────────────────

export interface MessagablePerson {
  id: string;
  name: string;
  role: 'artist' | 'industry' | 'fan';
  photoUrl: string;
  subtitle: string;
  isVerified: boolean;
  slug?: string;
  isFollowing?: boolean;
}

/**
 * Directory of everyone on Vuka a user can start a conversation with —
 * powers the messenger's "New Message" picker. Fans typically message
 * artists/industry; artists message back fans, other artists, and industry
 * contacts (labels/services) about orders, exclusives, collabs, etc.
 *
 * `tab` narrows the pool; `q` free-text searches name / company / genre.
 * Results are ordered so people the caller already follows (or who
 * follow the caller, i.e. mutuals/fans) surface first.
 */
export async function getMessageablePeople(
  userId: string,
  opts: { q?: string; tab?: 'all' | 'artists' | 'industry' | 'fans' | 'following'; limit?: number } = {}
): Promise<{ people: MessagablePerson[]; hasMore: boolean }> {
  const limit = Math.min(opts.limit ?? 30, 60);
  const q = opts.q?.trim();
  const tab = opts.tab ?? 'all';

  // Artists the caller follows — used both for the "following" tab and to
  // rank results across other tabs.
  const followedArtistIds = new Set(
    (await prisma.follow.findMany({ where: { userId }, select: { artistId: true } })).map((f) => f.artistId)
  );

  const nameFilter = q ? { name: { contains: q, mode: 'insensitive' as const } } : {};

  const roleWhere =
    tab === 'artists'    ? { role: 'artist' } :
    tab === 'industry'   ? { role: 'industry' } :
    tab === 'fans'       ? { role: 'fan' } :
    {}; // 'all' / 'following' — role filtered after fetch for 'following'

  const users = await prisma.user.findMany({
    where: {
      id: { not: userId },
      isSuspended: false,
      ...nameFilter,
      ...roleWhere,
    },
    select: {
      id: true, name: true, role: true,
      artist: { select: { slug: true, photoUrl: true, isVerified: true, genreTags: true, city: true, id: true } },
      industryUser: { select: { companyName: true, role: true, verified: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: tab === 'following' ? 500 : limit * 3, // over-fetch so we can rank, then trim
  });

  let people: MessagablePerson[] = users
    // Only surface people with a "presence" worth messaging: artists, industry,
    // or fans who already have some relationship with the caller (kept broad
    // otherwise the fan directory could be thousands of unrelated accounts).
    .filter((u) => {
      if (u.role === 'artist' && u.artist) return true;
      if (u.role === 'industry' && u.industryUser) return true;
      if (u.role === 'fan') return tab === 'fans' || followedArtistIds.size >= 0; // fans are messageable by anyone (artists reply to fans)
      return true; // admins etc. — rare, harmless to include
    })
    .map((u) => {
      const isFollowing = !!u.artist && followedArtistIds.has(u.artist.id);
      if (u.role === 'artist' && u.artist) {
        return {
          id: u.id,
          name: u.name,
          role: 'artist' as const,
          photoUrl: u.artist.photoUrl,
          subtitle: [u.artist.genreTags?.[0], u.artist.city].filter(Boolean).join(' • ') || 'Artist',
          isVerified: u.artist.isVerified,
          slug: u.artist.slug,
          isFollowing,
        };
      }
      if (u.role === 'industry' && u.industryUser) {
        return {
          id: u.id,
          name: u.name,
          role: 'industry' as const,
          photoUrl: '',
          subtitle: [u.industryUser.companyName, u.industryUser.role].filter(Boolean).join(' • '),
          isVerified: u.industryUser.verified,
        };
      }
      return {
        id: u.id,
        name: u.name,
        role: 'fan' as const,
        photoUrl: '',
        subtitle: 'Fan',
        isVerified: false,
      };
    });

  if (tab === 'following') {
    people = people.filter((p) => p.isFollowing);
  }

  // Rank: following first, then verified, then alphabetical.
  people.sort((a, b) => {
    if (!!a.isFollowing !== !!b.isFollowing) return a.isFollowing ? -1 : 1;
    if (a.isVerified !== b.isVerified) return a.isVerified ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const hasMore = people.length > limit;
  return { people: people.slice(0, limit), hasMore };
}

// ── SEND MESSAGE ──────────────────────────────────────────────

export interface SendMessageInput {
  senderId: string;
  recipientId: string;
  body: string;
  attachments?: Array<{ url: string; filename: string; fileType: string; size: number }>;
}

export async function sendMessage(input: SendMessageInput): Promise<object> {
  const { senderId, recipientId, body, attachments = [] } = input;

  if (!body?.trim() && attachments.length === 0) throw new Error('Message cannot be empty');
  if (body.length > MAX_MESSAGE_LENGTH) throw new Error('Message exceeds maximum length');

  // Validate attachments
  for (const att of attachments) {
    if (!ALLOWED_ATTACHMENT_TYPES.includes(att.fileType)) {
      throw new Error(`File type ${att.fileType} is not allowed`);
    }
    if (att.size > MAX_ATTACHMENT_SIZE_MB * 1024 * 1024) {
      throw new Error(`File exceeds ${MAX_ATTACHMENT_SIZE_MB}MB limit`);
    }
  }

  // Anti-spam check
  await checkMessageSpam(senderId);

  // Get/create conversation
  const [p1, p2] = [senderId, recipientId].sort();
  const conv = await prisma.messageConversation.upsert({
    where: { participant1_participant2: { participant1: p1, participant2: p2 } },
    create: { participant1: p1, participant2: p2 },
    update: {},
  });

  const isP1Sender = conv.participant1 === senderId;

  // Create message
  const message = await prisma.message.create({
    data: {
      conversationId: conv.id,
      senderId,
      body: body.trim(),
      attachments,
    },
    include: {
      sender: { select: { id: true, name: true, artist: { select: { slug: true, photoUrl: true } } } },
    },
  });

  // Update conversation metadata
  await prisma.messageConversation.update({
    where: { id: conv.id },
    data: {
      lastMessageAt: new Date(),
      lastMessagePreview: body.slice(0, 100),
      ...(isP1Sender ? { unread2: { increment: 1 } } : { unread1: { increment: 1 } }),
    },
  });

  // Notify recipient
  const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { name: true } });
  if (sender) {
    await createNotification({
      userId: recipientId,
      type: 'message_received',
      actorId: senderId,
      actorName: sender.name,
      targetType: 'conversation',
      targetId: conv.id,
      title: `New message from ${sender.name}`,
      body: body.slice(0, 80),
      actionUrl: `/messages/${conv.id}`,
    });
  }

  // Push instantly to anyone with the thread open, and ping the
  // recipient's inbox so their conversation list updates live too.
  // Fire-and-forget — broadcast() already swallows its own errors.
  void broadcast(channels.conversation(conv.id), 'new_message', { message, conversationId: conv.id });
  void broadcast(channels.inbox(recipientId), 'new_message', { conversationId: conv.id, senderId });

  return message;
}

async function markMessagesRead(conversationId: string, userId: string) {
  await prisma.message.updateMany({
    where: { conversationId, senderId: { not: userId }, isRead: false },
    data: { isRead: true, readAt: new Date() },
  });

  const conv = await prisma.messageConversation.findUnique({ where: { id: conversationId } });
  if (!conv) return;
  const c = conv as { participant1: string };
  const isP1 = c.participant1 === userId;
  await prisma.messageConversation.update({
    where: { id: conversationId },
    data: isP1 ? { unread1: 0 } : { unread2: 0 },
  });

  void broadcast(channels.conversation(conversationId), 'read_receipt', { conversationId, readByUserId: userId });
}

/** Delete a message (soft delete, only sender can). */
export async function deleteMessage(messageId: string, userId: string): Promise<void> {
  const msg = await prisma.message.findUnique({ where: { id: messageId } });
  if (!msg || msg.senderId !== userId) throw new Error('Not found or not authorized');
  await prisma.message.update({
    where: { id: messageId },
    data: { isDeleted: true, deletedAt: new Date(), body: '[Message deleted]' },
  });
}

/** Archive a conversation (hide from inbox). */
export async function archiveConversation(conversationId: string, userId: string): Promise<void> {
  const conv = await prisma.messageConversation.findUnique({ where: { id: conversationId } });
  if (!conv) throw new Error('Not found');
  const c = conv as { participant1: string; participant2: string };
  if (c.participant1 !== userId && c.participant2 !== userId) throw new Error('Unauthorized');

  const isP1 = c.participant1 === userId;
  await prisma.messageConversation.update({
    where: { id: conversationId },
    data: isP1 ? { isArchived1: true } : { isArchived2: true },
  });
}

// ── ANTI-SPAM ─────────────────────────────────────────────────

async function checkMessageSpam(userId: string): Promise<void> {
  const windowStart = new Date(Date.now() - 60_000); // 1-minute window
  const MAX_PER_MINUTE = 20;

  const existing = await prisma.spamSignal.findFirst({
    where: { userId, action: 'message_send', windowStart: { gte: windowStart } },
  });

  if (existing) {
    if ((existing as { count: number }).count >= MAX_PER_MINUTE) {
      await prisma.spamSignal.update({
        where: { id: existing.id },
        data: { count: { increment: 1 }, isFlagged: true },
      });
      throw new Error('Rate limit exceeded. Please slow down.');
    }
    await prisma.spamSignal.update({
      where: { id: existing.id },
      data: { count: { increment: 1 } },
    });
  } else {
    await prisma.spamSignal.create({
      data: { userId, action: 'message_send', count: 1, windowStart },
    });
  }
}

// ── MODERATION ────────────────────────────────────────────────

/** Flag a message as potentially harmful. */
export async function flagMessage(messageId: string, reason: string): Promise<void> {
  await prisma.message.update({
    where: { id: messageId },
    data: { isFlagged: true, flagReason: reason },
  });
}
