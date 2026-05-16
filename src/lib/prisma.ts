import { PrismaClient } from "@prisma/client";

/**
 * VUKA — Resilient Prisma Client
 *
 * - Singleton pattern (prevents connection storms in dev hot-reload)
 * - safeQuery() wrapper returns null instead of throwing on DB failure
 * - Circuit-breaker aware: detects ECIRCUITBREAKER and surfaces cleanly
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
  });

if (process.env.NODE_ENV !== "production") {
  global.__vukaPrisma = prisma;
}

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
