import { createServerSupabaseClient } from './superbase_server';
import prisma from './prisma';

/**
 * Returns the full User (with artist) for the currently logged-in Supabase session.
 * Returns null on ANY failure — auth failure, DB failure, missing session.
 */
export async function getServerUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return null;

    const dbUser = await prisma.user.findUnique({
      where: { email: user.email },
      include: { artist: true },
    }).catch((err) => {
      console.error('[Auth] DB lookup failed:', err instanceof Error ? err.message.split('\n')[0] : err);
      return null;
    });

    return dbUser;
  } catch (err) {
    console.error('[Auth] getServerUser error:', err instanceof Error ? err.message.split('\n')[0] : err);
    return null;
  }
}

/**
 * Like getServerUser but also asserts the user has an Artist profile.
 * Returns null if not authenticated, no artist profile, or DB is down.
 */
export async function requireArtist() {
  const user = await getServerUser();
  if (!user?.artist) return null;
  return user;
}
