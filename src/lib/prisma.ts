import { PrismaClient } from "@prisma/client";

/**
 * VUKA — Resilient Prisma Client
 *
 * - Singleton pattern (prevents connection storms in dev hot-reload)
 * - safeQuery() wrapper returns null instead of throwing on DB failure
 * - Circuit-breaker aware: detects ECIRCUITBREAKER and surfaces cleanly
 * - queryRaw / executeRaw typed wrappers fix TS2347 when the generated
 *   Prisma client declares PrismaClient as `any` (un-generated stubs).
 *   All callers should use these helpers instead of calling
 *   prisma.$queryRawUnsafe<T>() directly.
 */

declare global {
  // eslint-disable-next-line no-var
  var __vukaPrisma: PrismaClient | undefined;
}

export const prisma: PrismaClient =
  global.__vukaPrisma ??
  new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["error", "warn"]
        : ["error"],
    datasources: {
      db: {
        // In serverless environments (Vercel) each function invocation gets its
        // own process, so we need a tiny pool.  Appending ?pgbouncer=true tells
        // Prisma to use transaction-mode pooling (compatible with Supabase
        // PgBouncer).  connection_limit=1 prevents pool saturation when many
        // lambdas run concurrently; pool_timeout gives up fast rather than
        // queuing indefinitely.
        url: (() => {
          const base = process.env.DATABASE_URL ?? "";
          if (!base || base.includes("connection_limit=")) return base;
          const sep = base.includes("?") ? "&" : "?";
          return `${base}${sep}connection_limit=1&pool_timeout=10&pgbouncer=true`;
        })(),
      },
    },
  });

if (process.env.NODE_ENV !== "production") {
  global.__vukaPrisma = prisma;
}

// ── Typed raw-query helpers ───────────────────────────────────────────────────
//
// When `prisma generate` has not been run (e.g. during Vercel build before the
// postinstall script executes) the generated client declares PrismaClient as
// `any`.  TypeScript 4.9+ rejects generic type arguments on `any`-typed calls
// (error TS2347: Untyped function calls may not accept type arguments).
//
// These helpers cast through `unknown` so the type parameter is explicit in
// our code while avoiding the compiler error.

/**
 * Type-safe wrapper around $queryRawUnsafe.
 * Returns rows typed as T[] (default: any[]).
 */
export async function queryRaw<T = Record<string, unknown>>(
  sql: string,
  ...values: unknown[]
): Promise<T[]> {
  return (prisma as unknown as {
    $queryRawUnsafe: (sql: string, ...v: unknown[]) => Promise<T[]>;
  }).$queryRawUnsafe(sql, ...values);
}

/**
 * Type-safe wrapper around $executeRawUnsafe.
 * Returns the number of affected rows.
 */
export async function executeRaw(
  sql: string,
  ...values: unknown[]
): Promise<number> {
  return (prisma as unknown as {
    $executeRawUnsafe: (sql: string, ...v: unknown[]) => Promise<number>;
  }).$executeRawUnsafe(sql, ...values);
}

// ── safeQuery ─────────────────────────────────────────────────────────────────

/**
 * Wraps any Prisma query and returns null on failure instead of throwing.
 * Use in API routes so the frontend always gets a response.
 */
export async function safeQuery<T>(
  fn: () => Promise<T>
): Promise<T | null> {
  try {
    return await fn();
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    if (
      msg.includes("ECIRCUITBREAKER") ||
      msg.includes("Can't reach database") ||
      msg.includes("Authentication failed") ||
      msg.includes("Connection refused") ||
      msg.includes("ECONNREFUSED")
    ) {
      console.error("[DB] Connection failed:", msg.split("\n")[0]);
    } else {
      console.error("[DB] Query error:", err);
    }
    return null;
  }
}

export default prisma;
