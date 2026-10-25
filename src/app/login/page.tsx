import { GoogleSignIn } from "@/components/google-sign-in";
import { accountsEnabled } from "@/lib/session";
import { PasswordForm } from "./password-form";

export const dynamic = "force-dynamic";

// Sign-in failures arrive as codes, so the page only ever shows its own messages.
const ERRORS: Record<string, string> = {
  not_invited: "This Google account hasn't been invited yet. Ask the owner for an invite link.",
  expired: "That sign-in took too long or didn't match. Try again.",
  cancelled: "Google sign-in was cancelled.",
  failed: "Google sign-in didn't work. Try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (!accountsEnabled()) return <PasswordForm />;
  const { next, error } = await searchParams;
  const to = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const message = typeof error === "string" ? (ERRORS[error] ?? ERRORS.failed) : "";
  return <GoogleSignIn href={`/api/auth/google?next=${encodeURIComponent(to)}`} message={message} />;
}
