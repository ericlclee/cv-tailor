"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { api } from "@/lib/client/api";
import { emitRefresh, useRefresh } from "@/lib/client/bus";
import type { Activity } from "@/lib/types";
import { toast, toastError } from "../toast";
import { cx } from "../ui";

// The right-hand panel: what your chat (or this app) changed, live, with Undo.
// The conversation itself happens in your own chat app over MCP.

type Item = Omit<Activity, "snapshots">;

const KIND_DOT: Record<Activity["kind"], string> = {
  profile: "bg-accent",
  application: "bg-ink",
  job: "bg-[#8a909a]",
  cv: "bg-hl border border-ink",
  status: "bg-accent-strong",
};

function when(iso: string) {
  const s = (Date.now() - new Date(iso).getTime()) / 1000;
  if (s < 45) return "just now";
  if (s < 3600) return `${Math.round(s / 60)} min ago`;
  if (s < 86400) return `${Math.round(s / 3600)} h ago`;
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short" });
}

export async function copyText(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast(`${what}. Paste it into your chat.`);
  } catch {
    toastError(new Error("Couldn't copy. Select the text and copy it yourself."));
  }
}

export function ActivityPanel({ scope, context, prompts }: { scope: string | null; context: string; prompts: string[] }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [everything, setEverything] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const latest = useRef("");

  const load = useCallback(() => {
    const q = everything ? "" : `?app=${scope ?? "master"}`;
    api<{ latest: string; items: Item[] }>(`/api/activity${q}`)
      .then((r) => {
        latest.current = r.latest;
        setItems(r.items);
      })
      .catch(() => {});
  }, [everything, scope]);
  useEffect(load, [load]);
  useRefresh(load);

  // Poll for changes made from the chat, and refresh every panel when one lands.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.hidden) return;
      api<{ latest: string }>("/api/activity?latest=1")
        .then((r) => {
          if (r.latest && r.latest !== latest.current) {
            latest.current = r.latest;
            emitRefresh();
          }
        })
        .catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, []);

  async function undo(id: string) {
    try {
      await api(`/api/activity/${id}/undo`, { method: "POST" });
      toast("Undone");
      emitRefresh();
    } catch (e) {
      toastError(e);
    }
  }

  const empty = items !== null && items.length === 0;

  return (
    <section aria-label="Activity" className="flex w-full flex-col border-line-soft bg-surface lg:h-full lg:w-[400px] lg:shrink-0 lg:border-l">
      <div className="flex items-center gap-2.5 border-b border-line-soft px-5 py-3.5">
        <h2 className="text-base font-semibold">Activity</h2>
        <span className="truncate rounded-full bg-paper px-2.5 py-0.5 text-[13px] text-ink-2">{everything ? "Everything" : context}</span>
        <span className="flex-1" />
        <button type="button" onClick={() => setEverything(!everything)} className="min-h-9 shrink-0 px-1 text-[13px] font-medium text-accent">
          {everything ? "Just this" : "Show all"}
        </button>
      </div>

      <div className="flex max-h-[70vh] min-h-[320px] flex-1 flex-col gap-3 overflow-y-auto px-5 py-5 lg:max-h-none" aria-live="polite">
        {items === null && <p className="text-sm text-muted">Loading…</p>}
        {empty && <ConnectGuide prompts={prompts} />}
        {items?.map((a) => (
          <article key={a.id} className={cx("rounded-xl border border-line px-4 py-3", a.status === "undone" && "opacity-55")}>
            <div className="flex items-start gap-2.5">
              <span aria-hidden="true" className={cx("mt-1.5 size-2.5 shrink-0 rounded-full", KIND_DOT[a.kind])} />
              <div className="min-w-0 flex-1">
                <p className={cx("text-[15px] leading-snug font-medium", a.status === "undone" && "line-through")}>{a.summary}</p>
                <p className="mt-0.5 text-xs text-muted">
                  {a.source === "chat" ? "From your chat" : "In this app"} · {when(a.at)}
                  {a.status === "undone" && " · undone"}
                </p>
              </div>
              {a.status === "applied" && (
                <button type="button" onClick={() => undo(a.id)} className="min-h-8 shrink-0 px-1 text-sm font-medium text-accent">
                  Undo
                </button>
              )}
            </div>
            {a.details.length > 0 && (
              <ul className="mt-2.5 ml-5 flex flex-col gap-2">
                {a.details.slice(0, 6).map((d, i) => (
                  <li key={i} className="text-sm leading-relaxed">
                    <p className="font-mono text-[11px] tracking-[0.05em] text-faint uppercase">{d.label}</p>
                    {d.before && <p className="text-faint line-through">{d.before}</p>}
                    {d.after && (
                      <p className="whitespace-pre-line">
                        <mark className="rounded-[2px] bg-hl-soft px-0.5 text-ink">{d.after}</mark>
                      </p>
                    )}
                  </li>
                ))}
                {a.details.length > 6 && <li className="text-xs text-muted">+ {a.details.length - 6} more</li>}
              </ul>
            )}
          </article>
        ))}
      </div>

      <div className="border-t border-line-soft px-5 pt-3 pb-4 lg:max-h-[55%] lg:shrink-0 lg:overflow-y-auto">
        {!empty && prompts.length > 0 && (
          <div className="mb-3 flex flex-col gap-1.5">
            <p className="text-xs font-medium text-muted">Try asking your chat</p>
            {prompts.map((p) => (
              <button key={p} type="button" onClick={() => copyText(p, "Prompt copied")} className="rounded-lg border border-control px-3 py-2 text-left text-sm hover:border-muted">
                “{p}”
              </button>
            ))}
          </div>
        )}
        {!empty && (
          <button type="button" onClick={() => setShowSetup(!showSetup)} className="text-[13px] font-medium text-accent">
            {showSetup ? "Hide" : "How to connect a chat app"}
          </button>
        )}
        {showSetup && !empty && (
          <div className="mt-3">
            <Setup />
          </div>
        )}
      </div>
    </section>
  );
}

const LOCAL = "http://localhost:3000";

/** The address the app is served from (localhost while server-rendering). */
export function useOrigin() {
  return useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => LOCAL,
  );
}

const isLocal = (origin: string) => /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);

function desktopConfig(origin: string) {
  const url = `${origin}/mcp`;
  if (isLocal(origin)) {
    return `{
  "mcpServers": {
    "cv-tailor": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${url}"]
    }
  }
}`;
  }
  return `{
  "mcpServers": {
    "cv-tailor": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${url}", "--header", "Authorization:\${AUTH_HEADER}"],
      "env": { "AUTH_HEADER": "Bearer <your MCP_TOKEN>" }
    }
  }
}`;
}

function codeCommand(origin: string) {
  const url = `${origin}/mcp`;
  return isLocal(origin) ? `claude mcp add --transport http cv-tailor ${url}` : `claude mcp add --transport http cv-tailor ${url} --header "Authorization: Bearer <your MCP_TOKEN>"`;
}

function ConnectGuide({ prompts }: { prompts: string[] }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-[15px] font-semibold">Work on this in your own chat</p>
        <p className="text-sm leading-relaxed text-ink-2">
          Connect Claude (or another MCP app) to CV Tailor. Then talk to it as usual: it reads your profile and jobs, writes your CV, and every change it makes shows up here with an Undo button.
        </p>
      </div>
      <Setup />
      {prompts.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <p className="text-xs font-medium text-muted">Then try</p>
          {prompts.map((p) => (
            <button key={p} type="button" onClick={() => copyText(p, "Prompt copied")} className="rounded-lg border border-control px-3 py-2 text-left text-sm hover:border-muted">
              “{p}”
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface Me {
  accounts: boolean;
  mcpKeyCreatedAt: string | null;
}

function Setup() {
  const [me, setMe] = useState<Me | null>(null);
  useEffect(() => {
    api<Me>("/api/me").then(setMe).catch(() => {});
  }, []);
  if (me?.accounts) return <KeySetup createdAt={me.mcpKeyCreatedAt} />;
  return <SharedTokenSetup />;
}

/** With accounts, each person connects with their own key, shown once when made. */
function KeySetup({ createdAt }: { createdAt: string | null }) {
  const origin = useOrigin();
  const [key, setKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const url = `${origin}/mcp?key=${key ?? "<your key>"}`;
  const config = `{
  "mcpServers": {
    "cv-tailor": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "${url}"]
    }
  }
}`;
  const cmd = `claude mcp add --transport http cv-tailor "${url}"`;

  async function make() {
    if (createdAt && !key && !confirm("Make a new key? Chat apps using your old key will stop working until you update them.")) return;
    setBusy(true);
    try {
      setKey((await api<{ key: string }>("/api/me/mcp-key", { method: "POST" })).key);
    } catch (e) {
      toastError(e);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3 text-sm">
      <div className="flex flex-col gap-2 rounded-lg bg-paper px-3 py-2.5">
        <p className="font-medium">Your connection key</p>
        {key ? (
          <>
            <p className="leading-relaxed text-ink-2">Copy it now: it&apos;s only shown once. Anyone with it can read and change your CV Tailor data.</p>
            <code className="rounded-md bg-surface p-2.5 font-mono text-xs break-all">{url}</code>
            <button type="button" onClick={() => copyText(url, "Address copied")} className="min-h-9 self-start rounded-lg border border-control bg-surface px-3 text-[13px] font-medium hover:border-muted">
              Copy address
            </button>
          </>
        ) : (
          <>
            <p className="leading-relaxed text-ink-2">
              {createdAt
                ? `You made a key on ${new Date(createdAt).toLocaleDateString("en-GB", { day: "numeric", month: "short" })}. Keys are only shown once; make a new one if you need it again.`
                : "Make a key to connect your chat app to your own CV Tailor data."}
            </p>
            <button type="button" disabled={busy} onClick={make} className="min-h-9 self-start rounded-lg bg-ink px-3 text-[13px] font-medium text-white disabled:opacity-60">
              {createdAt ? "Make a new key" : "Make my key"}
            </button>
          </>
        )}
      </div>
      <details open className="rounded-lg bg-paper px-3 py-2.5">
        <summary className="cursor-pointer font-medium">Claude (web and desktop), ChatGPT and other apps</summary>
        <p className="mt-2 leading-relaxed text-ink-2">
          Add a custom connector with the address above. In Claude: Settings › Connectors › Add custom connector. In ChatGPT: Settings › Connectors (developer mode).
        </p>
      </details>
      <details className="rounded-lg bg-paper px-3 py-2.5">
        <summary className="cursor-pointer font-medium">Claude Desktop config file</summary>
        <p className="mt-2 leading-relaxed text-ink-2">Settings › Developer › Edit Config, add this, then restart Claude Desktop. Needs Node.js.</p>
        <pre className="mt-2 overflow-x-auto rounded-md bg-surface p-2.5 font-mono text-xs leading-relaxed">{config}</pre>
        {key && (
          <button type="button" onClick={() => copyText(config, "Config copied")} className="mt-2 min-h-9 rounded-lg border border-control bg-surface px-3 text-[13px] font-medium hover:border-muted">
            Copy config
          </button>
        )}
      </details>
      <details className="rounded-lg bg-paper px-3 py-2.5">
        <summary className="cursor-pointer font-medium">Claude Code</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-surface p-2.5 font-mono text-xs">{cmd}</pre>
        {key && (
          <button type="button" onClick={() => copyText(cmd, "Command copied")} className="mt-2 min-h-9 rounded-lg border border-control bg-surface px-3 text-[13px] font-medium hover:border-muted">
            Copy command
          </button>
        )}
      </details>
    </div>
  );
}

/** Local mode: an optional shared MCP_TOKEN. */
function SharedTokenSetup() {
  const origin = useOrigin();
  const local = isLocal(origin);
  const config = desktopConfig(origin);
  const cmd = codeCommand(origin);
  return (
    <div className="flex flex-col gap-3 text-sm">
      <details open className="rounded-lg bg-paper px-3 py-2.5">
        <summary className="cursor-pointer font-medium">Claude Desktop</summary>
        <ol className="mt-2 list-decimal space-y-1.5 pl-5 leading-relaxed text-ink-2">
          <li>Open Settings › Developer › Edit Config.</li>
          <li>
            Add this to <code className="text-[13px]">claude_desktop_config.json</code>
            {local ? ":" : ", with your real MCP_TOKEN:"}
          </li>
        </ol>
        <pre className="mt-2 overflow-x-auto rounded-md bg-surface p-2.5 font-mono text-xs leading-relaxed">{config}</pre>
        <div className="mt-2 flex items-center gap-3">
          <button type="button" onClick={() => copyText(config, "Config copied")} className="min-h-9 rounded-lg border border-control bg-surface px-3 text-[13px] font-medium hover:border-muted">
            Copy config
          </button>
          <span className="text-xs text-muted">Then restart Claude Desktop. Needs Node.js.</span>
        </div>
      </details>
      <details className="rounded-lg bg-paper px-3 py-2.5">
        <summary className="cursor-pointer font-medium">Claude Code</summary>
        <pre className="mt-2 overflow-x-auto rounded-md bg-surface p-2.5 font-mono text-xs">{cmd}</pre>
        <button type="button" onClick={() => copyText(cmd, "Command copied")} className="mt-2 min-h-9 rounded-lg border border-control bg-surface px-3 text-[13px] font-medium hover:border-muted">
          Copy command
        </button>
      </details>
      <details className="rounded-lg bg-paper px-3 py-2.5">
        <summary className="cursor-pointer font-medium">claude.ai, ChatGPT and other web apps</summary>
        {local ? (
          <p className="mt-2 leading-relaxed text-ink-2">
            These connect over the internet, so CV Tailor needs a public address and a secret token. Deploy it (see the README) or expose port 3000 with a tunnel, set <code className="text-[13px]">MCP_TOKEN</code>, and add <code className="text-[13px]">https://&lt;your-address&gt;/mcp?key=&lt;token&gt;</code> as a custom connector.
          </p>
        ) : (
          <p className="mt-2 leading-relaxed text-ink-2">
            Add a custom connector with this address, replacing the token with your MCP_TOKEN: <code className="text-[13px] break-all">{origin}/mcp?key=&lt;your MCP_TOKEN&gt;</code>. In claude.ai: Settings › Connectors › Add custom connector. In ChatGPT: Settings › Connectors (developer mode).
          </p>
        )}
      </details>
    </div>
  );
}
