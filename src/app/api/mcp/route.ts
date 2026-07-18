// app/api/mcp/route.ts
//
// Base MCP server for Vuka Music. Runs as a Vercel serverless function.
// Exposes tools Claude can call over the MCP protocol.
//
// This starter includes ONE test tool ("ping") so we can confirm the
// connector works end-to-end before wiring up real database/Paystack/etc
// tools. Once this is live and connected, we add tools one at a time.

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";

export const dynamic = "force-dynamic"; // never statically cache this route

function buildServer() {
  const server = new McpServer({
    name: "vuka-music",
    version: "0.1.0",
  });

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

  return server;
}

async function handleRequest(req: Request) {
  const server = buildServer();

  // Stateless mode: no session persistence between calls, which is required
  // for serverless functions (Vercel spins up a fresh instance per request).
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);

  const body = req.method === "POST" ? await req.json() : undefined;

  // Adapt the Web Request/Response to Node-style req/res the SDK expects.
  return new Promise<Response>((resolve) => {
    const chunks: Uint8Array[] = [];
    let statusCode = 200;
    const headers: Record<string, string> = {};

    const fakeRes = {
      writeHead(code: number, hdrs?: Record<string, string>) {
        statusCode = code;
        if (hdrs) Object.assign(headers, hdrs);
        return fakeRes;
      },
      setHeader(key: string, value: string) {
        headers[key] = value;
      },
      write(chunk: string | Uint8Array) {
        chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        return true;
      },
      end(chunk?: string | Uint8Array) {
        if (chunk) {
          chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
        }
        resolve(
          new Response(Buffer.concat(chunks), {
            status: statusCode,
            headers,
          })
        );
      },
    };

    // @ts-expect-error - adapting fetch Request to Node-style handling
    transport.handleRequest(req, fakeRes, body);
  });
}

export async function POST(req: Request) {
  return handleRequest(req);
}

export async function GET(req: Request) {
  return handleRequest(req);
}
