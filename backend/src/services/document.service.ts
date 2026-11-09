import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx';
import PDFDocument from 'pdfkit';
import { DEFAULT_SECTION_ORDER, StructuredResume } from '../interfaces/resume';

export const TEMPLATES = [
  { id: 'classic', name: 'Classic', description: 'Serif headings, centred contact line.', font: 'Times-Roman', bold: 'Times-Bold', docxFont: 'Times New Roman', center: true, accent: '#000000', size: 10.5 },
  { id: 'modern', name: 'Modern', description: 'Clean sans-serif with a muted accent.', font: 'Helvetica', bold: 'Helvetica-Bold', docxFont: 'Calibri', center: false, accent: '#0B6E63', size: 10.5 },
  { id: 'compact', name: 'Compact', description: 'Tighter spacing for long histories.', font: 'Helvetica', bold: 'Helvetica-Bold', docxFont: 'Arial', center: false, accent: '#333333', size: 9.5 },
] as const;

export type TemplateId = (typeof TEMPLATES)[number]['id'];
const template = (id: string) => TEMPLATES.find((t) => t.id === id) ?? TEMPLATES[0];

/** One reading order for both formats: a single column of plain text, which parsers handle most reliably. */
type Block =
  | { t: 'heading'; text: string }
  | { t: 'role'; left: string; right: string }
  | { t: 'text'; text: string }
  | { t: 'bullet'; text: string };

const SECTION_TITLES: Record<string, string> = {
  summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills',
  projects: 'Projects', certifications: 'Certifications', achievements: 'Achievements', languages: 'Languages',
};

function blocks(r: StructuredResume): Block[] {
  const out: Block[] = [];
  const order = r.sectionOrder?.length ? r.sectionOrder : DEFAULT_SECTION_ORDER;
  for (const key of order) {
    const section: Block[] = [];
    if (key === 'summary' && r.summary) section.push({ t: 'text', text: r.summary });
    if (key === 'experience') {
      for (const e of r.experience) {
        section.push({ t: 'role', left: [e.title, e.company].filter(Boolean).join(', '), right: [e.startDate, e.current ? 'Present' : e.endDate].filter(Boolean).join(' - ') });
        if (e.location) section.push({ t: 'text', text: e.location });
        e.bullets.forEach((b) => section.push({ t: 'bullet', text: b }));
      }
    }
    if (key === 'education') {
      for (const e of r.education) section.push({ t: 'role', left: [e.degree, e.institution].filter(Boolean).join(', '), right: e.year ?? '' });
    }
    if (key === 'skills' && r.skills.length) section.push({ t: 'text', text: r.skills.join(', ') });
    if (key === 'projects') r.projects.forEach((p) => section.push({ t: 'bullet', text: [p.name, p.description].filter(Boolean).join(': ') }));
    if (key === 'certifications') r.certifications.forEach((c) => section.push({ t: 'bullet', text: c }));
    if (key === 'achievements') r.achievements.forEach((a) => section.push({ t: 'bullet', text: a }));
    if (key === 'languages' && r.languages.length) section.push({ t: 'text', text: r.languages.join(', ') });
    if (section.length) out.push({ t: 'heading', text: SECTION_TITLES[key] ?? key }, ...section);
  }
  return out;
}

const contactLine = (r: StructuredResume) =>
  [r.personal.email, r.personal.phone, r.personal.location, r.personal.linkedin, r.personal.website].filter(Boolean).join('  |  ');

function pdfToBuffer(build: (doc: PDFKit.PDFDocument) => void): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50, bufferPages: false });
    const chunks: Buffer[] = [];
    doc.on('data', (c: Buffer) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    build(doc);
    doc.end();
  });
}

export const documentService = {
  resumePdf(r: StructuredResume, templateId: string): Promise<Buffer> {
    const t = template(templateId);
    return pdfToBuffer((doc) => {
      const width = doc.page.width - 100;
      const align = t.center ? 'center' : 'left';
      doc.font(t.bold).fontSize(t.size + 8).fillColor('#000').text(r.personal.fullName || 'Your name', { align });
      doc.font(t.font).fontSize(t.size - 0.5).fillColor('#333').text(contactLine(r), { align }).moveDown(0.5);
      for (const b of blocks(r)) {
        if (b.t === 'heading') {
          doc.moveDown(0.5).font(t.bold).fontSize(t.size + 1.5).fillColor(t.accent).text(b.text.toUpperCase());
          doc.moveTo(50, doc.y).lineTo(50 + width, doc.y).lineWidth(0.5).strokeColor('#BBBBBB').stroke();
          doc.moveDown(0.25);
        } else if (b.t === 'role') {
          const y = doc.y;
          doc.font(t.font).fontSize(t.size).fillColor('#333').text(b.right, 50, y, { width, align: 'right' });
          doc.font(t.bold).fontSize(t.size).fillColor('#000').text(b.left, 50, y, { width: width - 110 });
        } else if (b.t === 'text') {
          doc.font(t.font).fontSize(t.size).fillColor('#111').text(b.text, 50, doc.y, { width, lineGap: 1 });
        } else {
          doc.font(t.font).fontSize(t.size).fillColor('#111').text(`•  ${b.text}`, 58, doc.y, { width: width - 8, lineGap: 1 });
        }
      }
    });
  },

  async resumeDocx(r: StructuredResume, templateId: string): Promise<Buffer> {
    const t = template(templateId);
    const size = Math.round(t.size * 2);
    const paragraphs: Paragraph[] = [
      new Paragraph({ alignment: t.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: r.personal.fullName || 'Your name', bold: true, size: size + 14, font: t.docxFont })] }),
      new Paragraph({ alignment: t.center ? AlignmentType.CENTER : AlignmentType.LEFT, children: [new TextRun({ text: contactLine(r), size: size - 1, font: t.docxFont })] }),
    ];
    for (const b of blocks(r)) {
      if (b.t === 'heading') paragraphs.push(new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 60 }, border: { bottom: { color: 'BBBBBB', size: 4, style: 'single', space: 1 } }, children: [new TextRun({ text: b.text.toUpperCase(), bold: true, size: size + 3, font: t.docxFont, color: t.accent.slice(1) })] }));
      else if (b.t === 'role') paragraphs.push(new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: b.left, bold: true, size, font: t.docxFont }), new TextRun({ text: b.right ? `   ${b.right}` : '', size, font: t.docxFont })] }));
      else if (b.t === 'text') paragraphs.push(new Paragraph({ children: [new TextRun({ text: b.text, size, font: t.docxFont })] }));
      else paragraphs.push(new Paragraph({ bullet: { level: 0 }, children: [new TextRun({ text: b.text, size, font: t.docxFont })] }));
    }
    return Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] }));
  },

  letterPdf(body: string, sender: string): Promise<Buffer> {
    return pdfToBuffer((doc) => {
      if (sender) doc.font('Helvetica-Bold').fontSize(13).text(sender).moveDown();
      doc.font('Helvetica').fontSize(11);
      for (const para of body.split(/\n{2,}/)) doc.text(para.trim(), { lineGap: 2 }).moveDown(0.8);
    });
  },

  async letterDocx(body: string, sender: string): Promise<Buffer> {
    const paragraphs = body.split(/\n{2,}/).map((p) => new Paragraph({ spacing: { after: 200 }, children: [new TextRun({ text: p.trim(), size: 22, font: 'Calibri' })] }));
    if (sender) paragraphs.unshift(new Paragraph({ spacing: { after: 240 }, children: [new TextRun({ text: sender, bold: true, size: 26, font: 'Calibri' })] }));
    return Packer.toBuffer(new Document({ sections: [{ children: paragraphs }] }));
  },
};
