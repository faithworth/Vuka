import { afterEach, describe, expect, it } from "vitest";
import { authorizeMcpRequest } from "./mcpAuth";

const VALID_KEY = "a".repeat(96);
const originalKey = process.env.MCP_API_KEY;

afterEach(() => {
  if (originalKey === undefined) {
    delete process.env.MCP_API_KEY;
  } else {
    process.env.MCP_API_KEY = originalKey;
  }
});

describe("authorizeMcpRequest", () => {
  it("fails closed when the server key is missing", () => {
    delete process.env.MCP_API_KEY;
    const result = authorizeMcpRequest(new Request("https://vukamusic.com/api/mcp"));
    expect(result?.status).toBe(503);
  });

  it("fails closed when the configured key is malformed", () => {
    process.env.MCP_API_KEY = "not-a-96-character-hex-key";
    const result = authorizeMcpRequest(new Request("https://vukamusic.com/api/mcp"));
    expect(result?.status).toBe(503);
  });

  it("rejects requests without a bearer token", () => {
    process.env.MCP_API_KEY = VALID_KEY;
    const result = authorizeMcpRequest(new Request("https://vukamusic.com/api/mcp"));
    expect(result?.status).toBe(401);
    expect(result?.headers.get("cache-control")).toBe("no-store");
  });

  it("rejects an incorrect bearer token", () => {
    process.env.MCP_API_KEY = VALID_KEY;
    const request = new Request("https://vukamusic.com/api/mcp", {
      headers: { authorization: `Bearer ${"b".repeat(96)}` },
    });
    expect(authorizeMcpRequest(request)?.status).toBe(401);
  });

  it("allows the exact configured bearer token", () => {
    process.env.MCP_API_KEY = VALID_KEY;
    const request = new Request("https://vukamusic.com/api/mcp", {
      headers: { authorization: `Bearer ${VALID_KEY}` },
    });
    expect(authorizeMcpRequest(request)).toBeNull();
  });
});
