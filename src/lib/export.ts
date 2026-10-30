import "server-only";
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import PDFDocument from "pdfkit";
import type { RenderedCv } from "./render";

// ATS-safe exports: one column, standard fonts, real text, no tables or images.

// One page is a hard limit. The PDF is laid out at the normal size if it fits, else at
// the first of a few tighter layouts that does (less spacing, then slightly smaller
// type and margins). pageFit measures this, so the chat's tools can refuse a CV that
// won't fit even at the tightest layout, and the CV tab can show how full the page is.

interface Layout {
  /** Scale for type sizes. */
  type: number;
  /** Scale for the space between lines, items and sections. */
  space: number;
  /** Scale for the page margins. */
  margin: number;
}
const LAYOUTS: Layout[] = [
  { type: 1, space: 1, margin: 1 },
  { type: 1, space: 0.7, margin: 0.85 },
  { type: 0.95, space: 0.55, margin: 0.75 },
  { type: 0.9, space: 0.45, margin: 0.7 },
];
const A4 = { width: 595.28, height: 841.89 };
const margins = (l: Layout) => ({ top: 46 * l.margin, bottom: 46 * l.margin, left: 52 * l.margin, right: 52 * l.margin });
/** Height of one line of bullet text at a layout, for turning points into lines. */
const lineHeight = (l: Layout) => 10 * l.type * 1.16 + 1.2;

/** Draw the CV. With onePage, no page breaks are forced (the layout is known to fit). */
function draw(doc: PDFKit.PDFDocument, cv: RenderedCv, l: Layout, onePage: boolean) {
  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const ink = "#111111";
  const t = (size: number) => size * l.type;
  const room = (needed: number) => {
    if (!onePage && doc.y > doc.page.height - doc.page.margins.bottom - needed) doc.addPage();
  };

  doc.fillColor(ink).font("Helvetica-Bold").fontSize(t(20)).text(cv.name || "Your name", { width });
  if (cv.headline) doc.font("Helvetica").fontSize(t(11)).text(cv.headline, { width });
  if (cv.contact.length) doc.moveDown(0.15 * l.space).font("Helvetica").fontSize(t(9.5)).fillColor("#333333").text(cv.contact.join("  |  "), { width }).fillColor(ink);

  const heading = (title: string) => {
    doc.moveDown(0.8 * l.space);
    room(60);
    doc.font("Helvetica-Bold").fontSize(t(10.5)).text(title.toUpperCase(), left, doc.y, { width, characterSpacing: 0.5 });
    const y = doc.y + 1.5;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor("#222222").stroke();
    doc.y = y + 5 * l.space;
  };

  if (cv.summary) {
    heading("Summary");
    doc.font("Helvetica").fontSize(t(10)).text(cv.summary, left, doc.y, { width, lineGap: 1.5 * l.space });
  }
  if (cv.skills.length) {
    heading("Skills");
    for (const g of cv.skills) {
      if (g.category) doc.font("Helvetica-Bold").fontSize(t(10)).text(`${g.category}: `, left, doc.y, { continued: true, width });
      doc.font("Helvetica").fontSize(t(10)).text(g.items.join(", "), g.category ? undefined : left, g.category ? undefined : doc.y, { width, lineGap: 1.5 * l.space });
    }
  }
  for (const s of cv.sections) {
    heading(s.title);
    s.items.forEach((it, idx) => {
      if (idx) doc.moveDown(0.45 * l.space);
      room(40);
      const y = doc.y;
      doc.font("Helvetica").fontSize(t(10));
      const datesWidth = it.dates ? doc.widthOfString(it.dates) + 6 : 0;
      if (it.dates) doc.text(it.dates, left + width - datesWidth, y, { width: datesWidth, align: "right" });
      doc.font("Helvetica-Bold").fontSize(t(10)).text(it.heading, left, y, { width: width - datesWidth - 8, continued: !!it.subheading });
      if (it.subheading) doc.font("Helvetica").text(`, ${it.subheading}`);
      doc.moveDown(0.15 * l.space);
      for (const b of it.bullets) {
        const by = doc.y;
        doc.font("Helvetica").fontSize(t(10)).text("•", left + 4, by, { width: 10 });
        doc.text(b, left + 16, by, { width: width - 16, lineGap: 1.2 * l.space });
        doc.moveDown(0.12 * l.space);
      }
    });
  }
}

/** Points of page height the CV needs at a layout, measured on an endless page. */
function heightAt(cv: RenderedCv, l: Layout) {
  const m = margins(l);
  const doc = new PDFDocument({ size: [A4.width, 100000], margins: m });
  draw(doc, cv, l, true);
  const used = doc.y - m.top;
  doc.end();
  return used;
}

export interface PageFit {
  fits: boolean;
  /** Whether the layout had to be tightened to fit. */
  tightened: boolean;
  /** Spare lines at the normal layout (when it fits without tightening). */
  spareLines: number;
  /** Lines past one page at the tightest layout (when it doesn't fit). */
  overLines: number;
  /** The layout the PDF uses. */
  layout: number;
}

/** Whether the CV fits on one A4 page, and at which layout. */
export function pageFit(cv: RenderedCv): PageFit {
  let last = 0;
  for (const [i, l] of LAYOUTS.entries()) {
    const m = margins(l);
    const available = A4.height - m.top - m.bottom - 2;
    const used = heightAt(cv, l);
    if (used <= available) return { fits: true, tightened: i > 0, spareLines: i ? 0 : Math.floor((available - used) / lineHeight(l)), overLines: 0, layout: i };
    last = used - available;
  }
  return { fits: false, tightened: true, spareLines: 0, overLines: Math.ceil(last / lineHeight(LAYOUTS[LAYOUTS.length - 1])), layout: 0 };
}

export async function toPdf(cv: RenderedCv): Promise<Buffer> {
  const fit = pageFit(cv);
  const l = LAYOUTS[fit.layout];
  const doc = new PDFDocument({ size: "A4", margins: margins(l), info: { Title: `${cv.name} CV`, Author: cv.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));
  // Only a CV edited past one page by hand still runs over; it then breaks pages as before.
  draw(doc, cv, l, fit.fits);
  doc.end();
  return done;
}

export async function toDocx(cv: RenderedCv): Promise<Buffer> {
  const font = "Calibri";
  const l = LAYOUTS[pageFit(cv).layout];
  const size = (halfPoints: number) => Math.round(halfPoints * l.type);
  const gap = (twips: number) => Math.round(twips * l.space);
  const pageWidth = 11906;
  const margin = Math.round(1080 * l.margin);
  const contentWidth = pageWidth - margin * 2;
  const children: Paragraph[] = [];

  children.push(new Paragraph({ children: [new TextRun({ text: cv.name || "Your name", bold: true, size: size(40), font })] }));
  if (cv.headline) children.push(new Paragraph({ children: [new TextRun({ text: cv.headline, size: size(23), font })] }));
  if (cv.contact.length) children.push(new Paragraph({ spacing: { after: gap(80) }, children: [new TextRun({ text: cv.contact.join("  |  "), size: size(19), font, color: "333333" })] }));

  const heading = (title: string) =>
    new Paragraph({
      spacing: { before: gap(220), after: gap(80) },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "222222", space: 1 } },
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: size(21), font })],
    });

  if (cv.summary) {
    children.push(heading("Summary"));
    children.push(new Paragraph({ children: [new TextRun({ text: cv.summary, size: size(20), font })] }));
  }
  if (cv.skills.length) {
    children.push(heading("Skills"));
    for (const g of cv.skills) {
      children.push(
        new Paragraph({
          spacing: { after: gap(40) },
          children: [...(g.category ? [new TextRun({ text: `${g.category}: `, bold: true, size: size(20), font })] : []), new TextRun({ text: g.items.join(", "), size: size(20), font })],
        }),
      );
    }
  }
  for (const s of cv.sections) {
    children.push(heading(s.title));
    s.items.forEach((it, idx) => {
      children.push(
        new Paragraph({
          spacing: { before: idx ? gap(140) : 0, after: gap(40) },
          tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
          keepNext: true,
          children: [
            new TextRun({ text: it.heading, bold: true, size: size(20), font }),
            ...(it.subheading ? [new TextRun({ text: `, ${it.subheading}`, size: size(20), font })] : []),
            ...(it.dates ? [new TextRun({ text: `\t${it.dates}`, size: size(20), font })] : []),
          ],
        }),
      );
      for (const b of it.bullets) {
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: gap(30) }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: b, size: size(20), font })] }));
      }
    });
  }

  const doc = new Document({
    creator: cv.name || "CV Tailor",
    title: `${cv.name} CV`,
    styles: { default: { document: { run: { font, size: size(20) } } } },
    sections: [{ properties: { page: { size: { width: pageWidth, height: 16838 }, margin: { top: Math.round(900 * l.margin), bottom: Math.round(900 * l.margin), left: margin, right: margin } } }, children }],
  });
  return Packer.toBuffer(doc);
}
