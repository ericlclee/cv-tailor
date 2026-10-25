import type { RenderedCv } from "@/lib/render";

/** HTML version of the ATS template: single column, standard headings, plain text. */
export function CvPreview({ cv }: { cv: RenderedCv }) {
  return (
    <div className="cv-page mx-auto w-full max-w-[794px] bg-white px-[56px] py-[48px] text-[13px] shadow-sm ring-1 ring-black/5">
      <h1 className="text-[24px] font-bold leading-tight">{cv.name || "Your name"}</h1>
      {cv.headline && <p className="mt-0.5 text-[14px]">{cv.headline}</p>}
      {cv.contact.length > 0 && <p className="mt-1 text-[12px] text-[#333]">{cv.contact.join("  |  ")}</p>}

      {cv.summary && (
        <Section title="Summary">
          <p>{cv.summary}</p>
        </Section>
      )}
      {cv.skills.length > 0 && (
        <Section title="Skills">
          {cv.skills.map((g, i) => (
            <p key={i} className="mb-0.5">
              {g.category && <strong>{g.category}: </strong>}
              {g.items.join(", ")}
            </p>
          ))}
        </Section>
      )}
      {cv.sections.map((s, i) => (
        <Section key={i} title={s.title}>
          {s.items.map((it, j) => (
            <div key={j} className="mb-2.5 break-inside-avoid">
              <div className="flex justify-between gap-4">
                <p>
                  <strong>{it.heading}</strong>
                  {it.subheading && <span>, {it.subheading}</span>}
                </p>
                {it.dates && <p className="shrink-0">{it.dates}</p>}
              </div>
              {it.bullets.length > 0 && (
                <ul className="mt-0.5 list-disc pl-5">
                  {it.bullets.map((b, k) => (
                    <li key={k} className="mb-0.5 pl-0.5">
                      {b}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ))}
        </Section>
      ))}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-4">
      <h2 className="mb-1.5 border-b border-[#222] pb-0.5 text-[13px] font-bold uppercase tracking-wide">{title}</h2>
      {children}
    </section>
  );
}
