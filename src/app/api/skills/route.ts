import { z } from "zod";
import { getSkills, newId, setSkills } from "@/lib/db";
import { handler } from "@/lib/http";

const skillsInput = z.array(z.object({ id: z.string().optional(), name: z.string(), category: z.string().default("") }));

export const GET = handler(async () => getSkills());

export const PUT = handler(async (req: Request) => {
  const seen = new Set<string>();
  const skills = skillsInput
    .parse(await req.json())
    .map((s) => ({ id: s.id || newId(), name: s.name.trim(), category: s.category.trim() }))
    .filter((s) => s.name && !seen.has(s.name.toLowerCase()) && seen.add(s.name.toLowerCase()));
  await setSkills(skills);
  return skills;
});
