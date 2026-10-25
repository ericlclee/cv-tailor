import type { NextRequest } from "next/server";
import { latestActivityAt, listActivity } from "@/lib/activity";
import { handler } from "@/lib/http";

// ?app=<id> for one application, ?app=master for profile changes, nothing for everything.
// ?latest=1 returns only the newest timestamp, for cheap polling.
export const GET = handler(async (req: NextRequest) => {
  const p = req.nextUrl.searchParams;
  if (p.get("latest")) return { latest: await latestActivityAt() };
  const app = p.get("app");
  return { latest: await latestActivityAt(), items: await listActivity(app === null ? undefined : app === "master" ? null : app) };
});
