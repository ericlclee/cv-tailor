"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { toastError } from "@/components/toast";
import { Button, Field, Input, Textarea } from "@/components/ui";
import { ActivityPanel } from "@/components/workspace/activity-panel";
import { DocBar, DocBody, DocPanel, SectionLabel } from "@/components/workspace/doc";
import { api } from "@/lib/client/api";
import { emitRefresh } from "@/lib/client/bus";

export default function NewApplicationPage() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    setBusy(true);
    try {
      const { id } = await api<{ id: string }>("/api/applications", { body: { url, description: text } });
      emitRefresh();
      router.push(`/apps/${id}`);
    } catch (e) {
      toastError(e);
      setBusy(false);
    }
  }

  return (
    <>
      <DocPanel>
        <DocBar title="New application" />
        <DocBody>
          <section className="flex flex-col gap-4 rounded-[14px] border border-line bg-surface px-6 py-6">
            <SectionLabel>Add a job</SectionLabel>
            <p className="text-[22px] font-semibold tracking-tight">Paste the job link into your chat</p>
            <p className="text-[15px] leading-relaxed text-ink-2">
              Your chat creates the application, reads the requirements, and checks them against your profile. Or add it here and ask your chat to take it from there. Links from Greenhouse, Lever, Ashby, Workday and most career pages are read automatically; for LinkedIn and Indeed, paste the description.
            </p>
            <Field label="Job link">
              <Input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://jobs.lever.co/company/…" />
            </Field>
            <Field label="Or the full job description">
              <Textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Include the requirements section" className="max-h-96 min-h-32 overflow-y-auto" />
            </Field>
            <div>
              <Button variant="primary" loading={busy} disabled={!url.trim() && text.trim().length < 100} onClick={create}>
                Add the application
              </Button>
            </div>
          </section>
        </DocBody>
      </DocPanel>
      <ActivityPanel scope="none" context="New application" prompts={["Start a CV Tailor application for this job: <paste link>"]} />
    </>
  );
}
