import { AdminPanel } from "@/components/workspace/admin-panel";
import { DocBar, DocBody, DocPanel } from "@/components/workspace/doc";
import { accountsEnabled } from "@/lib/session";
import { currentUser } from "@/lib/users";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const owner = accountsEnabled() && (await currentUser().catch(() => null))?.role === "owner";
  if (owner) return <AdminPanel />;
  return (
    <DocPanel>
      <DocBar title="People" />
      <DocBody>
        <p className="text-muted">{accountsEnabled() ? "Only the owner can manage people." : "Set up sign-in to let other people in. See the README."}</p>
      </DocBody>
    </DocPanel>
  );
}
