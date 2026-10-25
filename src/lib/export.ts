import "server-only";
import { AlignmentType, BorderStyle, Document, Packer, Paragraph, TabStopType, TextRun } from "docx";
import PDFDocument from "pdfkit";
import type { RenderedCv } from "./render";

// ATS-safe exports: one column, standard fonts, real text, no tables or images.

export async function toPdf(cv: RenderedCv): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 46, bottom: 46, left: 52, right: 52 }, info: { Title: `${cv.name} CV`, Author: cv.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve) => doc.on("end", () => resolve(Buffer.concat(chunks))));

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const ink = "#111111";

  doc.fillColor(ink).font("Helvetica-Bold").fontSize(20).text(cv.name || "Your name", { width });
  if (cv.headline) doc.font("Helvetica").fontSize(11).text(cv.headline, { width });
  if (cv.contact.length) doc.moveDown(0.15).font("Helvetica").fontSize(9.5).fillColor("#333333").text(cv.contact.join("  |  "), { width }).fillColor(ink);

  const heading = (title: string) => {
    doc.moveDown(0.8);
    if (doc.y > doc.page.height - doc.page.margins.bottom - 60) doc.addPage();
    doc.font("Helvetica-Bold").fontSize(10.5).text(title.toUpperCase(), left, doc.y, { width, characterSpacing: 0.5 });
    const y = doc.y + 1.5;
    doc.moveTo(left, y).lineTo(left + width, y).lineWidth(0.7).strokeColor("#222222").stroke();
    doc.y = y + 5;
  };

  if (cv.summary) {
    heading("Summary");
    doc.font("Helvetica").fontSize(10).text(cv.summary, left, doc.y, { width, lineGap: 1.5 });
  }
  if (cv.skills.length) {
    heading("Skills");
    for (const g of cv.skills) {
      if (g.category) doc.font("Helvetica-Bold").fontSize(10).text(`${g.category}: `, left, doc.y, { continued: true, width });
      doc.font("Helvetica").fontSize(10).text(g.items.join(", "), g.category ? undefined : left, g.category ? undefined : doc.y, { width, lineGap: 1.5 });
    }
  }
  for (const s of cv.sections) {
    heading(s.title);
    s.items.forEach((it, idx) => {
      if (idx) doc.moveDown(0.45);
      if (doc.y > doc.page.height - doc.page.margins.bottom - 40) doc.addPage();
      const y = doc.y;
      doc.font("Helvetica").fontSize(10);
      const datesWidth = it.dates ? doc.widthOfString(it.dates) + 6 : 0;
      if (it.dates) doc.text(it.dates, left + width - datesWidth, y, { width: datesWidth, align: "right" });
      doc.font("Helvetica-Bold").fontSize(10).text(it.heading, left, y, { width: width - datesWidth - 8, continued: !!it.subheading });
      if (it.subheading) doc.font("Helvetica").text(`, ${it.subheading}`);
      doc.moveDown(0.15);
      for (const b of it.bullets) {
        const by = doc.y;
        doc.font("Helvetica").fontSize(10).text("•", left + 4, by, { width: 10 });
        doc.text(b, left + 16, by, { width: width - 16, lineGap: 1.2 });
        doc.moveDown(0.12);
      }
    });
  }
  doc.end();
  return done;
}

export async function toDocx(cv: RenderedCv): Promise<Buffer> {
  const font = "Calibri";
  const pageWidth = 11906;
  const margin = 1080;
  const contentWidth = pageWidth - margin * 2;
  const children: Paragraph[] = [];

  children.push(new Paragraph({ children: [new TextRun({ text: cv.name || "Your name", bold: true, size: 40, font })] }));
  if (cv.headline) children.push(new Paragraph({ children: [new TextRun({ text: cv.headline, size: 23, font })] }));
  if (cv.contact.length) children.push(new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: cv.contact.join("  |  "), size: 19, font, color: "333333" })] }));

  const heading = (title: string) =>
    new Paragraph({
      spacing: { before: 220, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "222222", space: 1 } },
      children: [new TextRun({ text: title.toUpperCase(), bold: true, size: 21, font })],
    });

  if (cv.summary) {
    children.push(heading("Summary"));
    children.push(new Paragraph({ children: [new TextRun({ text: cv.summary, size: 20, font })] }));
  }
  if (cv.skills.length) {
    children.push(heading("Skills"));
    for (const g of cv.skills) {
      children.push(
        new Paragraph({
          spacing: { after: 40 },
          children: [...(g.category ? [new TextRun({ text: `${g.category}: `, bold: true, size: 20, font })] : []), new TextRun({ text: g.items.join(", "), size: 20, font })],
        }),
      );
    }
  }
  for (const s of cv.sections) {
    children.push(heading(s.title));
    s.items.forEach((it, idx) => {
      children.push(
        new Paragraph({
          spacing: { before: idx ? 140 : 0, after: 40 },
          tabStops: [{ type: TabStopType.RIGHT, position: contentWidth }],
          keepNext: true,
          children: [
            new TextRun({ text: it.heading, bold: true, size: 20, font }),
            ...(it.subheading ? [new TextRun({ text: `, ${it.subheading}`, size: 20, font })] : []),
            ...(it.dates ? [new TextRun({ text: `\t${it.dates}`, size: 20, font })] : []),
          ],
        }),
      );
      for (const b of it.bullets) {
        children.push(new Paragraph({ bullet: { level: 0 }, spacing: { after: 30 }, alignment: AlignmentType.LEFT, children: [new TextRun({ text: b, size: 20, font })] }));
      }
    });
  }

  const doc = new Document({
    creator: cv.name || "CV Tailor",
    title: `${cv.name} CV`,
    styles: { default: { document: { run: { font, size: 20 } } } },
    sections: [{ properties: { page: { size: { width: pageWidth, height: 16838 }, margin: { top: 900, bottom: 900, left: margin, right: margin } } }, children }],
  });
  return Packer.toBuffer(doc);
}
