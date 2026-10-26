import { GoogleSignIn } from "@/components/google-sign-in";
import { accountsEnabled } from "@/lib/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

// Sign-in failures arrive as codes, so the page only ever shows its own messages.
const ERRORS: Record<string, string> = {
  not_approved: "This Google account hasn't been approved yet. Ask the owner to add your email.",
  expired: "That sign-in took too long or didn't match. Try again.",
  cancelled: "Google sign-in was cancelled.",
  failed: "Google sign-in didn't work. Try again.",
};

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  // Without Google sign-in the app only runs locally, with nobody to sign in.
  if (!accountsEnabled()) redirect("/");
  const { next, error } = await searchParams;
  const to = typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
  const message = typeof error === "string" ? (ERRORS[error] ?? ERRORS.failed) : "";
  return <GoogleSignIn href={`/api/auth/google?next=${encodeURIComponent(to)}`} message={message} />;
}
