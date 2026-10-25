import { GoogleSignIn } from "@/components/google-sign-in";
import { Logo } from "@/components/workspace/logo";
import { accountsEnabled } from "@/lib/session";
import { openInvite } from "@/lib/users";

export const dynamic = "force-dynamic";

// Where an invite link lands. Signing in with Google from here uses the invite.
export default async function InvitePage({ params }: PageProps<"/invite/[code]">) {
  const { code } = await params;
  const invite = accountsEnabled() ? await openInvite(code) : null;
  if (!invite) {
    return (
      <main className="grid min-h-screen place-items-center bg-paper px-4">
        <div className="flex w-full max-w-sm flex-col gap-4 rounded-[14px] border border-line bg-surface px-7 py-8">
          <div className="flex items-center gap-2.5">
            <Logo />
            <span className="text-[17px] font-semibold tracking-tight">CV Tailor</span>
          </div>
          <p className="text-[15px] leading-relaxed text-ink-2">This invite has expired or has already been used. Ask whoever sent it for a new one.</p>
        </div>
      </main>
    );
  }
  return (
    <GoogleSignIn
      href={`/api/auth/google?invite=${encodeURIComponent(code)}`}
      intro={
        <div className="flex flex-col gap-1.5">
          <p className="text-lg font-semibold">You&apos;re invited to CV Tailor</p>
          <p className="text-[15px] leading-relaxed text-ink-2">
            Build your career profile in your own AI chat and tailor a CV for every job you apply to.
            {invite.email && (
              <>
                {" "}
                Sign in with <strong>{invite.email}</strong>.
              </>
            )}
          </p>
        </div>
      }
    />
  );
}
