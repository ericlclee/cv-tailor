// Shared data shapes for the master profile, jobs and tailored CVs.

import type { Ambition } from "./ambition";

export type EntryKind =
  | "experience"
  | "project"
  | "education"
  | "volunteer"
  | "certification"
  | "award"
  | "publication";

export const ENTRY_KINDS: { kind: EntryKind; label: string; plural: string }[] = [
  { kind: "experience", label: "Experience", plural: "Experience" },
  { kind: "project", label: "Project", plural: "Projects" },
  { kind: "education", label: "Education", plural: "Education" },
  { kind: "volunteer", label: "Volunteering", plural: "Volunteering" },
  { kind: "certification", label: "Certification", plural: "Certifications" },
  { kind: "award", label: "Award", plural: "Awards" },
  { kind: "publication", label: "Publication", plural: "Publications" },
];

export interface Link {
  label: string;
  url: string;
}

export interface Profile {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: Link[];
  summary: string;
}

/** One reusable fact: a bullet that can be selected and reworded for a CV. */
export interface Achievement {
  id: string;
  text: string;
  skills: string[];
  metrics: string[];
}

/** A role, project, degree, etc. Holds the achievements that came out of it. */
export interface Entry {
  id: string;
  kind: EntryKind;
  title: string;
  organization: string;
  location: string;
  startDate: string;
  endDate: string;
  current: boolean;
  description: string;
  url: string;
  achievements: Achievement[];
  sort: number;
  updatedAt: string;
}

export interface Skill {
  id: string;
  name: string;
  category: string;
}

export interface ParsedJob {
  title: string;
  company: string;
  location: string;
  seniority: string;
  summary: string;
  mustHave: string[];
  niceToHave: string[];
  responsibilities: string[];
  keywords: string[];
  yearsExperience: string;
  education: string;
  /** As the listing states it, e.g. "£80k–£100k" (set when curated). */
  salary?: string;
}

/** Where an application is. The first five are the forward track; the rest close it. */
export type AppStatus = "saved" | "cv" | "applied" | "interview" | "offer" | "rejected" | "withdrawn";
export const TRACK: { status: AppStatus; label: string }[] = [
  { status: "saved", label: "Saved" },
  { status: "cv", label: "CV" },
  { status: "applied", label: "Applied" },
  { status: "interview", label: "Interview" },
  { status: "offer", label: "Offer" },
];
export const CLOSED_STATUSES: AppStatus[] = ["rejected", "withdrawn"];

export interface TimelineEvent {
  id: string;
  /** ISO date-time the event happened (or will happen, for an upcoming interview). */
  at: string;
  title: string;
  detail: string;
}

/** A job the user is applying for. Stored in the "jobs" collection. */
export interface Job {
  id: string;
  url: string;
  source: string;
  /** The listing as fetched or pasted, page furniture and all. */
  rawText: string;
  /** The listing slimmed down by the chat to what matters (set when curated). */
  description?: string;
  /** When the chat curated the listing; until then `parsed` is only a rough keyword guess. */
  curatedAt?: string;
  /** Achievement ids the chat judged to prove each requirement, keyed by requirementKey(name). */
  evidence?: Record<string, string[]>;
  parsed: ParsedJob | null;
  createdAt: string;
  status?: AppStatus;
  /** Furthest track stage reached before closing, so a closed application still shows how far it got. */
  reached?: AppStatus;
  events?: TimelineEvent[];
  notes?: string;
  /** Requirements the user said they don't have; never claimed on the CV. */
  unclaimed?: string[];
  /** How far the CV may go beyond the profile (see ambition.ts). Polished when unset. */
  ambition?: Ambition;
  cvId?: string | null;
  updatedAt?: string;
}

export interface CvBullet {
  id: string;
  text: string;
  /** Achievement ids from the master profile this bullet is based on. */
  sourceIds: string[];
  include: boolean;
  /** Set by the fact check when the bullet says something the sources don't support. */
  warning?: string;
  /** The writer's rating of how far this line goes beyond its sources. */
  ambition?: Ambition;
}

export interface CvItem {
  id: string;
  sourceEntryId: string | null;
  title: string;
  organization: string;
  location: string;
  dates: string;
  include: boolean;
  bullets: CvBullet[];
}

export interface CvSection {
  id: string;
  kind: EntryKind;
  title: string;
  include: boolean;
  items: CvItem[];
}

export interface CvSkillGroup {
  category: string;
  items: string[];
}

export interface CvContent {
  header: Omit<Profile, "summary">;
  summary: string;
  /** The writer's rating of the summary. */
  summaryAmbition?: Ambition;
  skills: CvSkillGroup[];
  sections: CvSection[];
}

export interface CvDraft {
  id: string;
  jobId: string | null;
  name: string;
  content: CvContent;
  /** Notes about choices made and gaps found. */
  notes: string[];
  /** The application's ambition level when this CV was written. */
  ambition?: Ambition;
  createdAt: string;
  updatedAt: string;
}

export type SuggestionKind = "missing-metric" | "thin-entry" | "missing-section" | "skill-evidence" | "job-gap" | "interview";

export interface Suggestion {
  id: string;
  kind: SuggestionKind;
  question: string;
  /** Why we are asking; shown under the question. */
  reason: string;
  entryId: string | null;
  achievementId: string | null;
  jobId: string | null;
  status: "open" | "answered" | "dismissed";
  createdAt: string;
}

export interface KeywordReport {
  score: number;
  matched: string[];
  missing: string[];
  mustHaveMatched: string[];
  mustHaveMissing: string[];
}

// CV edits (from the edit_cv tool)

export interface CvEdit {
  op: "replace" | "remove" | "add";
  /** Bullet to replace or remove. */
  bulletId?: string;
  /** CV item (role) to add a bullet to. */
  itemId?: string;
  text?: string;
  ambition?: Ambition;
  /** Text before the change, filled in by the server for display. */
  previous?: string;
}

// ---------------------------------------------------------------------------
// Activity: every change made from a connected chat, with what it replaced.

export type Snapshot = { collection: string; id: string; doc: unknown | null } | { kv: string; value: unknown };

export interface ActivityDetail {
  label: string;
  before?: string;
  after?: string;
}

export interface Activity {
  id: string;
  at: string;
  /** Where it came from: "chat" (an MCP client) or "web" (a button in this app). */
  source: "chat" | "web";
  kind: "profile" | "application" | "job" | "cv" | "status";
  summary: string;
  details: ActivityDetail[];
  /** The application it belongs to, or null for the master profile. */
  appId: string | null;
  status: "applied" | "undone";
  /** The state of everything this change touched, before it ran. Restored on undo. */
  snapshots: Snapshot[];
}

// ---------------------------------------------------------------------------
// Accounts (when Google sign-in is configured; see session.ts and users.ts)

export interface User {
  id: string;
  email: string;
  name: string;
  picture: string;
  role: "owner" | "member";
  /** scrypt hash for email and password sign-in, if they've set one. */
  passwordHash?: string;
  /** sha256 of the user's MCP key; the key itself is shown once, when created. */
  mcpKeyHash?: string;
  mcpKeyCreatedAt?: string;
  createdAt: string;
  lastSignInAt: string;
}

/** An email the owner has approved, waiting for its first sign-in. The id is the email. */
export interface Approval {
  id: string;
  email: string;
  approvedAt: string;
}
