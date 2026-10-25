import type { CvContent, KeywordReport, ParsedJob } from "./types";

// Deterministic keyword matching. Used for the ATS score (so it is stable and
// explainable) and for the offline fallbacks when no AI key is configured.

const ALIASES: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  kubernetes: ["k8s"],
  "ci/cd": ["cicd", "ci cd", "continuous integration", "continuous delivery", "continuous deployment"],
  "machine learning": ["ml"],
  "artificial intelligence": ["ai"],
  postgresql: ["postgres"],
  "amazon web services": ["aws"],
  "google cloud": ["gcp", "google cloud platform"],
  "user experience": ["ux"],
  "user interface": ["ui"],
  "search engine optimization": ["seo"],
  "node.js": ["node", "nodejs"],
  "react.js": ["react", "reactjs"],
  "vue.js": ["vue", "vuejs"],
  "project management": ["project manager", "managed projects"],
  "stakeholder management": ["stakeholders"],
  "a/b testing": ["ab testing", "a/b tests", "experimentation"],
};

const aliasIndex = new Map<string, string[]>();
for (const [canon, alts] of Object.entries(ALIASES)) {
  const group = [canon, ...alts];
  for (const t of group) aliasIndex.set(t, group);
}

export function normalize(s: string) {
  return ` ${s
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[^a-z0-9+#./\s-]/g, " ")
    .replace(/[-_]/g, " ")
    .replace(/\s+/g, " ")
    .trim()} `;
}

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function variants(term: string): string[] {
  const t = normalize(term).trim();
  if (!t) return [];
  const out = new Set<string>([t, ...(aliasIndex.get(t) ?? []).map((a) => normalize(a).trim())]);
  // Loose plural / singular handling: "apis" ~ "api", "database" ~ "databases".
  for (const v of [...out]) {
    if (v.length > 3 && v.endsWith("s")) out.add(v.slice(0, -1));
    else if (v.length > 2) out.add(`${v}s`);
  }
  return [...out];
}

/** Whether `term` (or a known alias) appears as a whole word/phrase in already-normalized text. */
export function containsTerm(normalizedText: string, term: string) {
  return variants(term).some((v) => new RegExp(`(^|[\\s/(])${escape(v)}(?=$|[\\s/).,])`).test(normalizedText));
}

export function cvPlainText(cv: CvContent) {
  const parts: string[] = [cv.header.headline, cv.summary];
  for (const g of cv.skills) parts.push(g.category, ...g.items);
  for (const s of cv.sections) {
    if (!s.include) continue;
    for (const it of s.items) {
      if (!it.include) continue;
      parts.push(it.title, it.organization);
      for (const b of it.bullets) if (b.include) parts.push(b.text);
    }
  }
  return parts.join("\n");
}

function dedupe(terms: string[]) {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of terms) {
    const k = normalize(t).trim();
    if (k && !seen.has(k)) {
      seen.add(k);
      out.push(t.trim());
    }
  }
  return out;
}

/** Score how well `text` covers a job's keywords. Must-haves count double. */
export function keywordReport(text: string, job: ParsedJob): KeywordReport {
  const norm = normalize(text);
  const must = dedupe(job.mustHave);
  const mustKeys = new Set(must.map((m) => normalize(m).trim()));
  const others = dedupe([...job.niceToHave, ...job.keywords]).filter((k) => !mustKeys.has(normalize(k).trim()));

  const mustHaveMatched = must.filter((t) => containsTerm(norm, t));
  const mustHaveMissing = must.filter((t) => !containsTerm(norm, t));
  const otherMatched = others.filter((t) => containsTerm(norm, t));
  const otherMissing = others.filter((t) => !containsTerm(norm, t));

  const total = must.length * 2 + others.length;
  const got = mustHaveMatched.length * 2 + otherMatched.length;
  return {
    score: total ? Math.round((got / total) * 100) : 0,
    matched: [...mustHaveMatched, ...otherMatched],
    missing: [...mustHaveMissing, ...otherMissing],
    mustHaveMatched,
    mustHaveMissing,
  };
}

/** How many of `terms` appear in `text`; used to rank achievements offline. */
export function overlap(text: string, terms: string[]) {
  const norm = normalize(text);
  return terms.filter((t) => containsTerm(norm, t)).length;
}

// A compact vocabulary for offline job parsing. The AI path does not use it.
export const COMMON_SKILLS = [
  "Python", "Java", "JavaScript", "TypeScript", "Go", "Rust", "C++", "C#", "Ruby", "PHP", "Swift", "Kotlin", "Scala", "R",
  "SQL", "NoSQL", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Kafka", "Spark", "Hadoop", "Airflow", "dbt",
  "Snowflake", "BigQuery", "Tableau", "Power BI", "Looker", "Excel", "React", "Next.js", "Vue", "Angular", "Svelte",
  "Node.js", "Django", "Flask", "FastAPI", "Spring", "Rails", ".NET", "GraphQL", "REST", "APIs", "microservices",
  "AWS", "Azure", "GCP", "Docker", "Kubernetes", "Terraform", "Ansible", "CI/CD", "Git", "Linux", "DevOps", "SRE",
  "machine learning", "deep learning", "NLP", "computer vision", "LLM", "PyTorch", "TensorFlow", "pandas", "statistics",
  "data analysis", "data engineering", "data science", "ETL", "A/B testing", "experimentation", "analytics",
  "Figma", "UX", "UI", "user research", "prototyping", "design systems", "accessibility", "HTML", "CSS", "Tailwind",
  "product management", "roadmap", "agile", "scrum", "Jira", "stakeholder management", "project management",
  "leadership", "mentoring", "communication", "collaboration", "cross-functional", "problem solving",
  "SEO", "SEM", "content marketing", "social media", "CRM", "Salesforce", "HubSpot", "B2B", "B2C", "SaaS",
  "sales", "negotiation", "account management", "customer success", "budgeting", "forecasting", "financial modeling",
  "security", "testing", "unit testing", "TDD", "QA", "mobile", "iOS", "Android", "React Native", "Flutter",
];
