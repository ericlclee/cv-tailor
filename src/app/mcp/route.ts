import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";
import { accountsEnabled, runAsUser } from "@/lib/session";
import { userForMcpKey } from "@/lib/users";

// The MCP endpoint (Streamable HTTP, stateless: a fresh server per request).
//
// Keys travel as "Authorization: Bearer <key>" or "?key=<key>" in the URL (for apps
// that only take a URL).
// - With accounts (Google sign-in), every request needs a user's own key, made in the
//   web app, and runs as that user. MCP_TOKEN still works as the owner's key.
// - In local mode (no Google settings), MCP_TOKEN guards the endpoint. Without it, only
//   requests addressed to localhost are served, so a tunnel or public address can't
//   reach your data by accident. A deployment without accounts serves nothing.

export const dynamic = "force-dynamic";

const keyOf = (req: Request) => req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? new URL(req.url).searchParams.get("key") ?? "";

function denied(req: Request): Response | null {
  const token = process.env.MCP_TOKEN;
  if (token) return keyOf(req) === token ? null : Response.json({ error: "Missing or wrong MCP token." }, { status: 401 });
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
  if (accountsEnabled()) {
    const user = await userForMcpKey(keyOf(req));
    if (!user) return Response.json({ error: "Missing or unknown key. Create your connection key in CV Tailor (Activity › How to connect a chat app)." }, { status: 401 });
    return runAsUser(user.id, () => serve(req));
  }
  if (process.env.VERCEL) return Response.json({ error: "Set up Google sign-in for this deployment first (see the README)." }, { status: 503 });
  return denied(req) ?? serve(req);
}

async function serve(req: Request) {
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
