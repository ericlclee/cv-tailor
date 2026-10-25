import { z } from "zod";

const level = z.union([z.literal(0), z.literal(1), z.literal(2), z.literal(3)]);
const kind = z.enum(["experience", "project", "education", "volunteer", "certification", "award", "publication"]);

export const cvContentSchema = z.object({
  header: z.object({
    name: z.string(),
    headline: z.string(),
    email: z.string(),
    phone: z.string(),
    location: z.string(),
    links: z.array(z.object({ label: z.string(), url: z.string() })),
  }),
  summary: z.string(),
  summaryAmbition: level.optional(),
  skills: z.array(z.object({ category: z.string(), items: z.array(z.string()) })),
  sections: z.array(
    z.object({
      id: z.string(),
      kind,
      title: z.string(),
      include: z.boolean(),
      items: z.array(
        z.object({
          id: z.string(),
          sourceEntryId: z.string().nullable(),
          title: z.string(),
          organization: z.string(),
          location: z.string(),
          dates: z.string(),
          include: z.boolean(),
          bullets: z.array(
            z.object({ id: z.string(), text: z.string(), sourceIds: z.array(z.string()), include: z.boolean(), warning: z.string().optional(), ambition: level.optional() }),
          ),
        }),
      ),
    }),
  ),
});
