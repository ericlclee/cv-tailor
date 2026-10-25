import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";

// The MCP endpoint (Streamable HTTP, stateless: a fresh server per request).
//
// Access: with MCP_TOKEN set, every request must carry it, as
// "Authorization: Bearer <token>" or "?key=<token>" in the URL (for apps that
// only take a URL). Without MCP_TOKEN, only requests addressed to localhost
// are served, so a tunnel or public address can't reach your data by accident.

export const dynamic = "force-dynamic";

function denied(req: Request): Response | null {
  const token = process.env.MCP_TOKEN;
  const url = new URL(req.url);
  if (token) {
    const given = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? url.searchParams.get("key");
    return given === token ? null : Response.json({ error: "Missing or wrong MCP token." }, { status: 401 });
  }
  const host = (req.headers.get("host") ?? "").replace(/:\d+$/, "");
  if (!["localhost", "127.0.0.1", "[::1]"].includes(host)) {
    return Response.json({ error: "Set MCP_TOKEN to allow access from outside this computer." }, { status: 403 });
  }
  const origin = req.headers.get("origin");
  if (origin && !/^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin)) {
    return Response.json({ error: "Cross-origin requests are not allowed." }, { status: 403 });
  }
  return null;
}

async function handle(req: Request) {
  const no = denied(req);
  if (no) return no;
  const server = createMcpServer();
  const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  await server.connect(transport);
  try {
    return await transport.handleRequest(req);
  } finally {
    void server.close();
  }
}

export const GET = handle;
export const POST = handle;
export const DELETE = handle;
