import { createServerSupabaseClient } from './superbase_server';
import prisma from './prisma';

export async function getServerUser() {
  try {
    const supabase = await createServerSupabaseClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user?.email) return null;

    const dbUser = await prisma.user.findUnique({
      where: { email: user.email },
      include: {
        artist: true,
        industryUser: true,
      },
    }).catch((err: unknown) => {
      console.error('[Auth] DB lookup failed:', err instanceof Error ? err.message.split('\n')[0] : err);
      return null;
    });

    return dbUser;
  } catch (err: unknown) {
    console.error('[Auth] getServerUser error:', err instanceof Error ? err.message.split('\n')[0] : err);
    return null;
  }
}

export async function requireArtist() {
  const user = await getServerUser();
  if (!user?.artist) return null;
  return user;
}

export async function requireIndustry() {
  const user = await getServerUser();
  if (!user || user.role !== 'industry') return null;
  return user;
}

export async function requireAuth() {
  const user = await getServerUser();
  if (!user) return null;
  return user;
}

export async function requireAdmin() {
  const user = await getServerUser();
  if (!user) return null;
  const adminRoles = ['owner', 'super_admin', 'admin', 'moderator'];
  if (!adminRoles.includes(user.role)) return null;
  return user;
}
