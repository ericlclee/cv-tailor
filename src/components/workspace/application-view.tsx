"use client";

import { useSearchParams } from "next/navigation";
import { ActivityPanel } from "./activity-panel";
import { ApplicationDocument } from "./application-doc";

// An application's page. The tab lives in the URL but switches in the browser
// (history.pushState), so changing tabs never waits for the server.

export type AppTab = "match" | "cv" | "timeline";

export function ApplicationView({ id, role, context }: { id: string; role: string; context: string }) {
  const param = useSearchParams().get("tab");
  const tab: AppTab = param === "cv" ? "cv" : param === "timeline" ? "timeline" : "match";

  function select(next: AppTab) {
    if (next === tab) return;
    window.history.pushState(null, "", next === "match" ? `/apps/${id}` : `/apps/${id}?tab=${next}`);
  }

  const prompts =
    tab === "cv"
      ? [`Review my CV Tailor CV for ${role} and suggest improvements.`, `Make my ${role} CV shorter.`]
      : tab === "timeline"
        ? [`I applied for ${role} today. Update CV Tailor.`, `Help me prepare for my ${role} interview using my CV Tailor profile.`]
        : [`Go through the gaps for ${role} in CV Tailor with me.`, `Draft my CV for ${role} in CV Tailor.`];

  return (
    <>
      <ApplicationDocument id={id} tab={tab} role={role} onTab={select} />
      <ActivityPanel key={id} scope={id} context={context} prompts={prompts} />
    </>
  );
}
