import { Sidebar } from "@/components/workspace/sidebar";

// The three-panel workspace: sidebar here, document and activity panel from each page.
export default function WorkspaceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-wrap items-stretch lg:h-screen lg:flex-nowrap lg:overflow-hidden">
      <Sidebar />
      {children}
    </div>
  );
}
