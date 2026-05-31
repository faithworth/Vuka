// src/lib/services/notification.service.ts
// Centralized notification creation service.
// All systems that need to notify users import from here.
// Supports: new_sale, new_follower, new_comment, new_like,
//           new_message, new_post, milestone_followers, milestone_sales

import prisma from '@/lib/prisma';

export type NotificationType =
  | 'new_sale'
  | 'new_follower'
  | 'new_comment'
  | 'new_like'
  | 'new_message'
  | 'new_post'
  | 'milestone_followers'
  | 'milestone_sales';

export type NotificationLinkType =
  | 'post'
  | 'artist'
  | 'beat'
  | 'release'
  | 'message'
  | 'sale'
  | '';

interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  linkType?: NotificationLinkType;
  linkId?: string;
}

/**
 * Create a single notification for a user.
 * Silently swallows errors so a notification failure never breaks the primary flow.
 */
export async function createNotification(input: CreateNotificationInput): Promise<void> {
  try {
    await prisma.notification.create({
      data: {
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body,
        linkType: input.linkType ?? '',
        linkId: input.linkId ?? '',
        isRead: false,
      },
    });
  } catch (err) {
    console.error('[NotificationService] createNotification failed silently:', err);
  }
}

/**
 * Notify all followers of an artist when they post.
 * Batched in chunks of 100 to avoid large transactions.
 */
export async function notifyFollowersOfPost(
  artistId: string,
  artistName: string,
  postId: string
): Promise<void> {
  try {
    const followers = await prisma.follow.findMany({
      where: { artistId },
      select: { userId: true },
    });

    if (followers.length === 0) return;

    const CHUNK = 100;
    for (let i = 0; i < followers.length; i += CHUNK) {
      const chunk = followers.slice(i, i + CHUNK);
      await prisma.notification.createMany({
        data: chunk.map((f) => ({
          userId: f.userId,
          type: 'new_post' as NotificationType,
          title: `${artistName} posted an update`,
          body: 'Tap to view their latest post in the feed.',
          linkType: 'post',
          linkId: postId,
          isRead: false,
        })),
        skipDuplicates: true,
      });
    }
  } catch (err) {
    console.error('[NotificationService] notifyFollowersOfPost failed:', err);
  }
}

/**
 * Notify an artist when someone buys their beat or release.
 */
export async function notifyArtistOfSale(
  artistUserId: string,
  buyerName: string,
  itemTitle: string,
  amount: number,
  currency: string = 'ZAR'
): Promise<void> {
  await createNotification({
    userId: artistUserId,
    type: 'new_sale',
    title: `New sale: ${itemTitle}`,
    body: `${buyerName} purchased "${itemTitle}" for ${currency} ${amount.toFixed(2)}.`,
    linkType: 'sale',
    linkId: '',
  });
}

/**
 * Notify an artist when someone follows them.
 */
export async function notifyArtistOfFollow(
  artistUserId: string,
  followerName: string,
  followerSlug: string
): Promise<void> {
  await createNotification({
    userId: artistUserId,
    type: 'new_follower',
    title: `${followerName} started following you`,
    body: 'You have a new follower on Vuka.',
    linkType: 'artist',
    linkId: followerSlug,
  });
}

/**
 * Notify a user of a new message.
 */
export async function notifyOfNewMessage(
  recipientUserId: string,
  senderName: string
): Promise<void> {
  await createNotification({
    userId: recipientUserId,
    type: 'new_message',
    title: `New message from ${senderName}`,
    body: 'You have an unread message waiting.',
    linkType: 'message',
    linkId: '',
  });
}

/**
 * Check and fire milestone notifications.
 * Call this after a follow or sale event.
 */
export async function checkAndFireMilestones(
  artistId: string,
  artistUserId: string,
  type: 'followers' | 'sales'
): Promise<void> {
  const FOLLOWER_MILESTONES = [10, 50, 100, 500, 1000, 5000, 10000];
  const SALES_MILESTONES = [1, 10, 50, 100, 500, 1000];

  try {
    if (type === 'followers') {
      const count = await prisma.follow.count({ where: { artistId } });
      if (FOLLOWER_MILESTONES.includes(count)) {
        await createNotification({
          userId: artistUserId,
          type: 'milestone_followers',
          title: `🎉 ${count.toLocaleString()} followers!`,
          body: `You've reached ${count.toLocaleString()} followers on Vuka. Keep creating!`,
          linkType: '',
          linkId: '',
        });
      }
    } else {
      const count = await prisma.purchase.count({
        where: { beat: { artistId } },
      });
      if (SALES_MILESTONES.includes(count)) {
        await createNotification({
          userId: artistUserId,
          type: 'milestone_sales',
          title: `🎉 ${count} sale${count === 1 ? '' : 's'}!`,
          body: `You've made ${count} sale${count === 1 ? '' : 's'} on Vuka. Your beats are moving!`,
          linkType: '',
          linkId: '',
        });
      }
    }
  } catch (err) {
    console.error('[NotificationService] checkAndFireMilestones failed:', err);
  }
}
