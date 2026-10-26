import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { approvals, currentUserId, newId, users } from "./db";
import { HttpError } from "./http";
import { hashPassword, linkStillUnused, MIN_PASSWORD, readSetPasswordToken, sendEmail, setPasswordToken, verifyPassword } from "./passwords";
import { accountsEnabled, LOCAL_USER_ID } from "./session";
import type { Approval, User } from "./types";

// Accounts: who may sign in, and each user's MCP key.
//
// Sign-in is by approval only. OWNER_EMAIL can always sign in and becomes the owner,
// taking over any data from before accounts were turned on. Everyone else needs the
// owner to approve their email first. People sign in with Google, or with email and a
// password they set through a link emailed to them.

const now = () => new Date().toISOString();
const ownerEmail = () => (process.env.OWNER_EMAIL ?? "").trim().toLowerCase();

export class NotApproved extends Error {}

const findByEmail = async (email: string) => (await users.list()).find((u) => u.email === email.toLowerCase()) ?? null;

/** Called once someone has proved they own an email (Google, or a set-password link). Returns their user, creating it if they're approved. */
export async function signIn(profile: { email: string; name: string; picture?: string; passwordHash?: string }): Promise<User> {
  const email = profile.email.toLowerCase();
  const existing = await findByEmail(email);
  if (existing) {
    return users.put({
      ...existing,
      name: profile.name || existing.name,
      picture: profile.picture ?? existing.picture,
      ...(profile.passwordHash ? { passwordHash: profile.passwordHash } : {}),
      lastSignInAt: now(),
    });
  }

  const at = now();
  const fresh = (role: User["role"]): User => ({ id: newId(), email, name: profile.name, picture: profile.picture ?? "", role, passwordHash: profile.passwordHash, createdAt: at, lastSignInAt: at });

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
// Email and password

const mayJoin = async (email: string) => email === ownerEmail() || Boolean(await findByEmail(email)) || Boolean(await approvals.get(email));

export async function passwordSignIn(rawEmail: string, password: string): Promise<User> {
  const user = await findByEmail(rawEmail.trim());
  const ok = await verifyPassword(password, user?.passwordHash);
  if (!user || !ok) throw new HttpError(401, "That email and password don't match. If you haven't set a password yet, use \"Set or reset your password\".");
  return users.put({ ...user, lastSignInAt: now() });
}

/**
 * Email a link for setting (or resetting) a password, if this email may sign in.
 * Says nothing either way, so the form can't be used to find out who's approved.
 */
export async function requestPasswordLink(rawEmail: string, appUrl: string) {
  const email = rawEmail.trim().toLowerCase();
  if (!(await mayJoin(email))) return;
  const user = await findByEmail(email);
  const link = `${appUrl}/set-password?token=${encodeURIComponent(setPasswordToken(email, user?.passwordHash))}`;
  const verb = user?.passwordHash ? "reset" : "set";
  await sendEmail(
    email,
    `${verb === "reset" ? "Reset" : "Set"} your CV Tailor password`,
    `Use this link to ${verb} your CV Tailor password. It works once and expires in an hour:\n\n${link}\n\nIf you didn't ask for this, ignore this email.`,
    `<p>Use this link to ${verb} your CV Tailor password. It works once and expires in an hour.</p><p><a href="${link}">${verb === "reset" ? "Reset" : "Set"} my password</a></p><p>If you didn't ask for this, ignore this email.</p>`,
  );
}

/** Who a set-password link is for, if it can still be used. */
export async function checkPasswordLink(token: string): Promise<string | null> {
  const t = readSetPasswordToken(token);
  if (!t || !(await mayJoin(t.email))) return null;
  return linkStillUnused(t.fingerprint, (await findByEmail(t.email))?.passwordHash) ? t.email : null;
}

/** Set the password from an emailed link, creating the account if this is their first sign-in. */
export async function setPasswordFromLink(token: string, password: string): Promise<User> {
  const email = await checkPasswordLink(token);
  if (!email) throw new HttpError(400, "This link has expired or has already been used. Ask for a new one.");
  if (password.length < MIN_PASSWORD) throw new HttpError(400, `Use at least ${MIN_PASSWORD} characters.`);
  if (password.length > 200) throw new HttpError(400, "That password is too long.");
  return signIn({ email, name: "", passwordHash: await hashPassword(password) });
}

// ---------------------------------------------------------------------------
// Approvals

/** Approve an email: that Google account can now sign in. */
export async function approveEmail(raw: string): Promise<Approval> {
  const email = raw.trim().toLowerCase();
  if (email === ownerEmail() || (await findByEmail(email))) throw new HttpError(409, "That email already has an account.");
  return approvals.put({ id: email, email, approvedAt: now() });
}
