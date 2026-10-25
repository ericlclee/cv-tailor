import { z } from "zod";
import { getProfile, setProfile } from "@/lib/db";
import { handler } from "@/lib/http";

const profileInput = z.object({
  name: z.string(),
  headline: z.string(),
  email: z.string(),
  phone: z.string(),
  location: z.string(),
  links: z.array(z.object({ label: z.string(), url: z.string() })),
  summary: z.string(),
});

export const GET = handler(async () => getProfile());

export const PUT = handler(async (req: Request) => {
  const p = profileInput.parse(await req.json());
  await setProfile(p);
  return p;
});
