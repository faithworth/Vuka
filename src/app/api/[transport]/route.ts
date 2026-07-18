// app/api/[transport]/route.ts
//
// Base MCP server for Vuka Music, using Vercel's official mcp-handler
// package. This replaces the manual transport adapter, which caused
// the HTTP 500 — the SDK's transport expects a real Node.js req/res,
// not a Fetch API Request, and my hand-rolled adapter didn't bridge
// that correctly.
//
// The [transport] segment means this route responds at /api/mcp
// (matching the URL already entered in your Claude connector settings).

import { createMcpHandler } from "mcp-handler";
import { z } from "zod";

const handler = createMcpHandler(
  (server) => {
    // --- Test tool: proves the connector is wired up correctly ---
    server.tool(
      "ping",
      "Simple health-check tool. Returns a confirmation message with the current server time. Use this to verify the Vuka Music connector is working.",
      {
        message: z
          .string()
          .optional()
          .describe("Optional message to echo back"),
      },
      async ({ message }) => {
        return {
          content: [
            {
              type: "text",
              text: `Vuka Music MCP server is live. Server time: ${new Date().toISOString()}${
                message ? ` | Echo: ${message}` : ""
              }`,
            },
          ],
        };
      }
    );

    // --- Real tools go here as we build them ---
    // server.tool("get_artist_summary", "...", { artist_id: z.string() }, async ({ artist_id }) => { ... });
  },
  {},
  {
    basePath: "/api",
    maxDuration: 60,
    verboseLogs: true,
  }
);

export { handler as GET, handler as POST, handler as DELETE };
