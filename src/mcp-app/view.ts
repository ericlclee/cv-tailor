// The in-chat CV view: an MCP App that Claude (and other hosts that support MCP
// Apps) renders inside the conversation when show_cv, save_cv or edit_cv runs.
// Buttons either call CV Tailor tools directly (changing the ambition level) or
// send a message into the conversation so the chat model takes the next turn.
// Bundled into one HTML file by scripts/build-mcp-app.mjs.

import { App, applyDocumentTheme, applyHostStyleVariables, type McpUiHostContext } from "@modelcontextprotocol/ext-apps/app-with-deps";
import { AMBITION, type Ambition } from "../lib/ambition";
import type { CvViewData } from "../lib/cv-view-data";

const app = new App({ name: "CV Tailor", version: "1.0.0" });
const root = document.getElementById("root")!;

let data: CvViewData | null = null;
let highlights = true;
let openLine: string | null = null;
let busy = false;
let notice: { text: string; tone: "info" | "error"; fallback?: string; lineId?: string } | null = null;

// ---------------------------------------------------------------------------
// Tiny DOM helper

type Child = Node | string | null | undefined | false;
function h<K extends keyof HTMLElementTagNameMap>(tag: K, props: Record<string, unknown> = {}, ...children: Child[]): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (v === undefined || v === false || v === null) continue;
    if (k.startsWith("on") && typeof v === "function") el.addEventListener(k.slice(2).toLowerCase(), v as EventListener);
    else if (k === "class") el.className = String(v);
    else el.setAttribute(k, v === true ? "" : String(v));
  }
  for (const c of children) if (c !== null && c !== undefined && c !== false) el.append(c);
  return el;
}

// ---------------------------------------------------------------------------
// Host actions

async function say(text: string, lineId?: string) {
  if (busy) return;
  busy = true;
  notice = null;
  render();
  try {
    const r = await app.sendMessage({ role: "user", content: [{ type: "text", text }] });
    notice = r.isError ? { text: "Claude didn't accept the message. Copy it into the chat instead:", tone: "error", fallback: text, lineId } : { text: "Sent to the chat.", tone: "info", lineId };
  } catch {
    notice = { text: "Couldn't reach the chat. Copy this into it instead:", tone: "error", fallback: text, lineId };
  } finally {
    busy = false;
    render();
  }
}

async function setLevel(level: Ambition) {
  if (!data || busy || level === data.ambition) return;
  busy = true;
  render();
  try {
    const r = await app.callServerTool({ name: "update_application", arguments: { application_id: data.applicationId, ambition: AMBITION[level].name } });
    if (r.isError) throw new Error("rejected");
    data = { ...data, ambition: level };
    notice = null;
    await app.updateModelContext({
      content: [{ type: "text", text: `In the CV Tailor view, the user set the ambition level for ${data.role} (application ${data.applicationId}) to ${AMBITION[level].name}.${data.writtenAt !== null && data.writtenAt !== level ? ` The current CV was written at ${AMBITION[data.writtenAt].name}.` : ""}` }],
    });
  } catch {
    notice = { text: "Couldn't change the level. Try again, or ask in the chat.", tone: "error" };
  } finally {
    busy = false;
    render();
  }
}

const open = (url?: string) => url && app.openLink({ url }).catch(() => {});

// ---------------------------------------------------------------------------
// Rendering

const where = () => `my CV for ${data!.role} in CV Tailor (application ${data!.applicationId})`;

function rated(text: string, level: Ambition, above: boolean) {
  if (!highlights || (!level && !above)) return document.createTextNode(text);
  return h("span", { class: `hl l${level}${above ? " above" : ""}` }, text);
}

function picker(d: CvViewData) {
  return h(
    "div",
    { class: "picker", role: "radiogroup", "aria-label": "Ambition" },
    ...AMBITION.map((a) =>
      h("button", { type: "button", role: "radio", "aria-checked": String(a.level === d.ambition), class: a.level === d.ambition ? "on" : "", disabled: busy, onClick: () => setLevel(a.level) }, h("i", { class: `dot l${a.level}`, "aria-hidden": "true" }), a.name),
    ),
  );
}

function legend(counts: number[], d: CvViewData, anyAbove: boolean) {
  return h(
    "div",
    { class: "legend" },
    h(
      "div",
      { class: "legend-head" },
      h("span", {}, "Each line is highlighted by how far it goes beyond your profile"),
      h("button", { type: "button", class: "link", onClick: () => ((highlights = !highlights), render()) }, highlights ? "Hide highlights" : "Show highlights"),
    ),
    h("ul", {}, ...AMBITION.map((a) => h("li", {}, h("i", { class: `sw l${a.level}`, "aria-hidden": "true" }), h("b", {}, a.name), h("span", { class: "count" }, String(counts[a.level])), h("span", { class: "muted" }, a.line)))),
    anyAbove && highlights && h("p", { class: "above-note" }, h("i", { class: "sw outline", "aria-hidden": "true" }), `Dashed outline: above the ${AMBITION[d.ambition].name} level you chose`),
  );
}

function bullet(b: { id: string; text: string; level: Ambition; warning?: string }, d: CvViewData) {
  const above = b.level > d.ambition;
  const isOpen = openLine === b.id;
  return h(
    "li",
    {},
    h(
      "button",
      {
        type: "button",
        class: "line",
        "aria-expanded": String(isOpen),
        title: `${AMBITION[b.level].name}: ${AMBITION[b.level].line}${above ? ` (above ${AMBITION[d.ambition].name})` : ""}${b.warning ? `\n${b.warning}` : ""}`,
        onClick: () => ((openLine = isOpen ? null : b.id), render()),
      },
      rated(b.text, b.level, above),
    ),
    isOpen &&
      h(
        "div",
        { class: "line-actions" },
        h("span", { class: "muted" }, `${AMBITION[b.level].name}${b.warning ? ` · ${b.warning}` : ""}`),
        notice?.lineId === b.id ? noticeEl(notice) : null,
        h("div", { class: "row" },
          h("button", { type: "button", class: "chip", disabled: busy, onClick: () => say(`In ${where()}, make this line stronger, within the ${AMBITION[d.ambition].name} level: "${b.text}"`, b.id) }, "Make stronger"),
          h("button", { type: "button", class: "chip", disabled: busy, onClick: () => say(`In ${where()}, tone this line down: "${b.text}"`, b.id) }, "Tone down"),
          h("button", { type: "button", class: "chip", disabled: busy, onClick: () => say(`In ${where()}, rewrite this line another way: "${b.text}"`, b.id) }, "Rewrite"),
        ),
      ),
  );
}

function render() {
  root.replaceChildren();
  if (!data) {
    root.append(h("p", { class: "muted pad" }, "Loading the CV…"));
    return;
  }
  const d = data;
  const levelName = AMBITION[d.ambition].name;
  const stale = d.cv && d.writtenAt !== null && d.writtenAt !== d.ambition;

  const head = h(
    "header",
    {},
    h("div", { class: "title" }, h("span", { class: "eyebrow" }, "CV Tailor"), h("strong", {}, d.role)),
    h("div", { class: "controls" }, h("span", { class: "label" }, "Ambition"), picker(d)),
    h("p", { class: "muted setting" }, AMBITION[d.ambition].setting, stale ? h("span", { class: "warn" }, ` This CV was written at ${AMBITION[d.writtenAt!].name}.`) : null),
  );

  if (!d.cv) {
    root.append(
      head,
      h("div", { class: "empty" }, h("p", {}, "No CV yet for this application."), h("button", { type: "button", class: "primary", disabled: busy, onClick: () => say(`Draft ${where()} at the ${levelName} ambition level.`) }, `Draft at ${levelName}`)),
      footer(d),
    );
    return;
  }

  const lines = d.cv.sections.flatMap((s) => s.items.flatMap((i) => i.bullets));
  const counts = AMBITION.map((a) => lines.filter((b) => b.level === a.level).length);
  const anyAbove = lines.some((b) => b.level > d.ambition) || d.cv.summary.level > d.ambition;

  const actions = h(
    "div",
    { class: "actions" },
    h("button", { type: "button", class: stale ? "primary" : "secondary", disabled: busy, onClick: () => say(`Redraft ${where()} at the ${levelName} ambition level.`) }, `Redraft at ${levelName}`),
    anyAbove && h("button", { type: "button", class: "secondary", disabled: busy, onClick: () => say(`In ${where()}, rewrite the lines above the ${levelName} level so they fit it.`) }, `Fit lines to ${levelName}`),
  );

  const cv = d.cv;
  const page = h(
    "article",
    { class: "page", "aria-label": "CV" },
    h("h1", {}, cv.name || "Your name"),
    cv.headline && h("p", { class: "headline" }, cv.headline),
    cv.contact.length > 0 && h("p", { class: "contact" }, cv.contact.join("  |  ")),
    cv.summary.text && h("h2", {}, "Summary"),
    cv.summary.text && h("p", {}, rated(cv.summary.text, cv.summary.level, cv.summary.level > d.ambition)),
    cv.skills.length > 0 && h("h2", {}, "Skills"),
    ...cv.skills.map((g) => h("p", { class: "skills" }, g.category ? h("b", {}, `${g.category}: `) : null, ...g.items.flatMap((s, i) => [i > 0 ? ", " : null, rated(s.name, s.level, false)]))),
    ...cv.sections.flatMap((s) => [
      h("h2", {}, s.title),
      ...s.items.map((it) =>
        h("div", { class: "item" }, h("div", { class: "item-head" }, h("span", {}, h("b", {}, it.heading), it.subheading ? `, ${it.subheading}` : ""), h("span", { class: "dates" }, it.dates)), h("ul", {}, ...it.bullets.map((b) => bullet(b, d)))),
      ),
    ]),
  );

  root.append(
    head,
    actions,
    ...(notice && !notice.lineId ? [noticeEl(notice)] : []),
    legend(counts, d, anyAbove),
    page,
    h("p", { class: "muted hint" }, "Click a line to ask Claude to strengthen, tone down or rewrite it. Highlights never appear in the PDF or DOCX."),
    footer(d),
  );
}

function noticeEl(n: NonNullable<typeof notice>) {
  return h("div", { class: `notice ${n.tone}`, role: "status" }, n.text, n.fallback ? h("pre", {}, n.fallback) : null);
}

function footer(d: CvViewData) {
  return h(
    "footer",
    {},
    h("button", { type: "button", class: "link", onClick: () => open(d.links.app) }, "Open in CV Tailor"),
    d.links.pdf && h("button", { type: "button", class: "link", onClick: () => open(d.links.pdf) }, "PDF"),
    d.links.docx && h("button", { type: "button", class: "link", onClick: () => open(d.links.docx) }, "DOCX"),
  );
}

// ---------------------------------------------------------------------------
// Wiring

function applyHost(ctx: McpUiHostContext | undefined) {
  if (!ctx) return;
  if (ctx.theme) applyDocumentTheme(ctx.theme);
  if (ctx.styles?.variables) applyHostStyleVariables(ctx.styles.variables);
}

app.ontoolresult = (result) => {
  const view = (result.structuredContent as { cvView?: CvViewData } | undefined)?.cvView;
  if (view) {
    data = view;
    notice = null;
    openLine = null;
  } else if (!data) {
    root.replaceChildren(h("p", { class: "muted pad" }, "Couldn't load the CV. Ask Claude to show it again."));
    return;
  }
  render();
};
app.onhostcontextchanged = (ctx) => applyHost(ctx);

render();
app
  .connect()
  .then(() => applyHost(app.getHostContext()))
  .catch(() => {});
