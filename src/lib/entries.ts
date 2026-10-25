import "server-only";
import { z } from "zod";
import { newId } from "./db";
import type { Achievement, Entry } from "./types";

export const entryKind = z.enum(["experience", "project", "education", "volunteer", "certification", "award", "publication"]);

export const achievementInput = z.object({
  id: z.string().optional(),
  text: z.string(),
  skills: z.array(z.string()).default([]),
  metrics: z.array(z.string()).default([]),
});

export const entryInput = z.object({
  id: z.string().optional(),
  kind: entryKind,
  title: z.string().default(""),
  organization: z.string().default(""),
  location: z.string().default(""),
  startDate: z.string().default(""),
  endDate: z.string().default(""),
  current: z.boolean().default(false),
  description: z.string().default(""),
  url: z.string().default(""),
  achievements: z.array(achievementInput).default([]),
  sort: z.number().default(0),
});
export type EntryInput = z.input<typeof entryInput>;

export function toAchievement(a: z.input<typeof achievementInput>): Achievement {
  return {
    id: a.id && !a.id.startsWith("tmp-") ? a.id : newId(),
    text: a.text.trim(),
    skills: (a.skills ?? []).map((s) => s.trim()).filter(Boolean),
    metrics: a.metrics?.length ? a.metrics : extractMetrics(a.text),
  };
}

export function toEntry(input: EntryInput, existing?: Entry | null): Entry {
  const e = entryInput.parse(input);
  return {
    ...e,
    id: existing?.id ?? e.id ?? newId(),
    achievements: e.achievements.filter((a) => a.text.trim()).map(toAchievement),
    updatedAt: new Date().toISOString(),
  };
}

/** Pull out numbers that make an achievement concrete: 40%, $2M, 3x, 12 people. */
export function extractMetrics(text: string): string[] {
  const m = text.match(/(?:[$£€]\s?\d[\d,.]*\s?(?:k|m|bn|b|million|billion)?|\d[\d,.]*\s?(?:%|x\b|k\b|m\b|\+)|\b\d[\d,.]*\s+(?:people|users|customers|clients|engineers|members|projects|countries|hours|days|weeks|months|years))/gi);
  return [...new Set((m ?? []).map((s) => s.trim()))];
}
