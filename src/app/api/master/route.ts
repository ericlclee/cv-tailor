import { getMaster } from "@/lib/db";
import { aiEnabled, MODEL } from "@/lib/ai";
import { handler } from "@/lib/http";
import { profileStrength } from "@/lib/strength";

export const GET = handler(async () => {
  const m = await getMaster();
  return { ...m, strength: profileStrength(m), ai: { enabled: aiEnabled(), model: MODEL } };
});
