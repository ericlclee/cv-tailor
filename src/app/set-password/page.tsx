import { SetPasswordForm } from "@/components/password-sign-in";
import { SignInCard } from "@/components/sign-in";
import { MIN_PASSWORD } from "@/lib/passwords";
import { passwordsEnabled } from "@/lib/session";
import { checkPasswordLink } from "@/lib/users";

export const dynamic = "force-dynamic";

// Where the emailed set-password link lands.
export default async function SetPasswordPage({ searchParams }: PageProps<"/set-password">) {
  const { token } = await searchParams;
  const email = passwordsEnabled() && typeof token === "string" ? await checkPasswordLink(token) : null;
  if (!email) {
    return (
      <SignInCard intro={<p className="text-[15px] leading-relaxed text-ink-2">This link has expired or has already been used.</p>}>
        <a href="/login" className="text-sm font-medium text-accent">
          Ask for a new link
        </a>
      </SignInCard>
    );
  }
  return (
    <SignInCard intro={<p className="text-lg font-semibold">Set your password</p>}>
      <SetPasswordForm token={token as string} email={email} minLength={MIN_PASSWORD} />
    </SignInCard>
  );
}
