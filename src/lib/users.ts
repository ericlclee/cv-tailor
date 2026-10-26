import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { approvals, currentUserId, newId, users } from "./db";
import { HttpError } from "./http";
import { accountsEnabled, LOCAL_USER_ID } from "./session";
import type { Approval, User } from "./types";

// Accounts: who may sign in, and each user's MCP key.
//
// Sign-in is by approval only. OWNER_EMAIL's Google account can always sign in and
// becomes the owner, taking over any data from before accounts were turned on. Everyone
// else needs the owner to approve their email first; they then sign in with Google.

const now = () => new Date().toISOString();
const ownerEmail = () => (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

export class NotApproved extends Error {}

const findByEmail = async (email: string) => (await users.list()).find((u) => u.email === email.toLowerCase()) ?? null;

/** Called after Google has confirmed who someone is. Returns their user, creating it if they're approved. */
export async function signIn(profile: { email: string; name: string; picture: string }): Promise<User> {
  const email = profile.email.toLowerCase();
  const existing = await findByEmail(email);
  if (existing) return users.put({ ...existing, name: profile.name || existing.name, picture: profile.picture, lastSignInAt: now() });

  const at = now();
  const fresh = (role: User["role"]): User => ({ id: newId(), email, name: profile.name, picture: profile.picture, role, createdAt: at, lastSignInAt: at });

  if (email === ownerEmail()) {
    const owner = await users.put(fresh("owner"));
    await users.claimUnowned(owner.id);
    return owner;
  }

  if (!(await approvals.get(email))) throw new NotApproved();
  const user = await users.put(fresh("member"));
  // From now on they sign in as an existing user; removing them from People ends access.
  await approvals.remove(email);
  return user;
}

/** The signed-in user (in local mode, a stand-in for the one local user). */
export async function currentUser(): Promise<User> {
  const id = await currentUserId();
  if (id === LOCAL_USER_ID) return { id, email: "", name: "", picture: "", role: "owner", createdAt: "", lastSignInAt: "" };
  const user = await users.get(id);
  if (!user) throw new HttpError(401, "Sign in to CV Tailor first.");
  return user;
}

export async function requireOwner(): Promise<User> {
  const user = await currentUser();
  if (user.role !== "owner" || !accountsEnabled()) throw new HttpError(403, "Only the owner can manage users.");
  return user;
}

// ---------------------------------------------------------------------------
// MCP keys: each user connects their own chat app with their own key.

const hashKey = (key: string) => createHash("sha256").update(key).digest("hex");

/** Make a new key for the current user, replacing any old one. The key is only returned here. */
export async function createMcpKey(): Promise<string> {
  const user = await currentUser();
  if (user.id === LOCAL_USER_ID) throw new HttpError(400, "Connection keys need Google sign-in. Locally, use MCP_TOKEN.");
  const key = `cvt_${randomBytes(24).toString("base64url")}`;
  await users.put({ ...user, mcpKeyHash: hashKey(key), mcpKeyCreatedAt: now() });
  return key;
}

/**
 * The user an MCP key belongs to. MCP_TOKEN, the key from before accounts, keeps
 * working as the owner's (once the owner has signed in), so existing connections
 * carry on.
 */
export async function userForMcpKey(key: string): Promise<User | null> {
  if (!key) return null;
  if (process.env.MCP_TOKEN && key === process.env.MCP_TOKEN) {
    const owner = ownerEmail() ? await findByEmail(ownerEmail()) : null;
    return owner;
  }
  const hash = hashKey(key);
  return (await users.list()).find((u) => u.mcpKeyHash === hash) ?? null;
}

// ---------------------------------------------------------------------------
// Approvals

/** Approve an email: that Google account can now sign in. */
export async function approveEmail(raw: string): Promise<Approval> {
  const email = raw.trim().toLowerCase();
  if (email === ownerEmail() || (await findByEmail(email))) throw new HttpError(409, "That email already has an account.");
  return approvals.put({ id: email, email, approvedAt: now() });
}
