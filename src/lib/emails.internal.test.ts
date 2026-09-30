import { afterEach, describe, expect, it } from 'vitest';
import { getInternalNotificationRecipients } from './emails';

const original = process.env.VUKA_INTERNAL_NOTIFICATION_EMAILS;

afterEach(() => {
  if (original === undefined) {
    delete process.env.VUKA_INTERNAL_NOTIFICATION_EMAILS;
  } else {
    process.env.VUKA_INTERNAL_NOTIFICATION_EMAILS = original;
  }
});

describe('getInternalNotificationRecipients', () => {
  it('uses the four Vuka internal business mailboxes by default', () => {
    delete process.env.VUKA_INTERNAL_NOTIFICATION_EMAILS;

    expect(getInternalNotificationRecipients()).toEqual([
      'tshepang@vukamusic.com',
      'admin@vukamusic.com',
      'accounts@vukamusic.com',
      'support@vukamusic.com',
    ]);
  });

  it('accepts a configured comma-separated recipient list and removes duplicates', () => {
    process.env.VUKA_INTERNAL_NOTIFICATION_EMAILS =
      'admin@vukamusic.com, accounts@vukamusic.com, ADMIN@VUKAMUSIC.COM';

    expect(getInternalNotificationRecipients()).toEqual([
      'admin@vukamusic.com',
      'accounts@vukamusic.com',
    ]);
  });
});
