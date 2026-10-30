import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Fail-closed bearer authentication shared by every Vuka MCP transport.
 * The configured key is 48 random bytes encoded as 96 hexadecimal characters.
 * Compare fixed-length SHA-256 digests so timingSafeEqual never receives
 * attacker-controlled lengths. Never log or return credential material.
 */
export function authorizeMcpRequest(request: Request): Response | null {
  const expected = process.env.MCP_API_KEY;
  if (!expected || !/^[a-f0-9]{96}$/i.test(expected)) {
    return new Response(JSON.stringify({ error: "MCP authentication is not configured." }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }

  const authorization = request.headers.get("authorization") ?? "";
  const match = /^Bearer ([a-f0-9]{96})$/i.exec(authorization);
  const supplied = match?.[1] ?? "";
  const expectedDigest = createHash("sha256").update(expected, "utf8").digest();
  const suppliedDigest = createHash("sha256").update(supplied, "utf8").digest();
  const valid = timingSafeEqual(expectedDigest, suppliedDigest) && Boolean(match);

  if (!valid) {
    return new Response(JSON.stringify({ error: "Unauthorized." }), {
      status: 401,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "WWW-Authenticate": "Bearer",
      },
    });
  }

  return null;
}
