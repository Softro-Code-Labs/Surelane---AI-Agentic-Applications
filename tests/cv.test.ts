import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyseCv, extractText, sniffType, yearsFromRanges } from '@/lib/cv/parse';
import { cvText, profile } from './helpers';

describe('CV analysis', () => {
  const p = profile();
  it('extracts contact details and identity', () => {
    expect(p.name).toBe('Nimali Perera');
    expect(p.email).toBe('nimali.perera@example.com');
    expect(p.phone).toContain('77 123 4567');
  });
  it('extracts experience, roles and level', () => {
    expect(p.yearsExperience).toBeGreaterThan(8);
    expect(p.yearsExperience).toBeLessThan(9);
    expect(p.experienceLevel).toBe('Senior');
    expect(p.workHistory[0]?.title).toBe('Senior Software Engineer');
    expect(p.workHistory[0]?.company).toContain('Lanka Fintech Labs');
  });
  it('extracts education, skills, languages and achievements', () => {
    expect(p.education[0]).toContain('University of Moratuwa');
    expect(p.degreeLevel).toBe(3);
    expect(p.skills).toEqual(expect.arrayContaining(['React', 'TypeScript', 'Node.js', 'PostgreSQL', 'AWS']));
    expect(p.languages).toEqual(expect.arrayContaining(['English', 'Sinhala', 'Tamil']));
    expect(p.achievements.some((a) => a.includes('35%'))).toBe(true);
    expect(p.families[0]).toBe('software');
  });
  it('does not mistake an employer name for a skill', () => {
    expect(p.skills).not.toContain('Logistics');
    expect(analyseCv('Sam\n\nSKILLS\nLogistics, Sales').skills).toEqual(expect.arrayContaining(['Logistics', 'Sales']));
  });
  it('counts overlapping jobs once', () => {
    expect(yearsFromRanges(['Jan 2020 - Dec 2020', 'Jun 2020 - Dec 2021'], new Date('2026-01-01'))).toBeCloseTo(1.9, 1);
  });
  it('handles a non-IT, Sri Lankan accounting CV', () => {
    const a = analyseCv(`Kasun Silva\nAccounts Executive\nkasun@example.com\n\nEXPERIENCE\nAccounts Executive, Hayleys PLC\n2019 - 2023\n• Prepared monthly financial reporting and bank reconciliation\n\nEDUCATION\nCIMA Passed Finalist\nG.C.E. A/L Commerce\n\nSKILLS\nAccounting, Excel, Taxation, SAP FICO`);
    expect(a.families[0]).toBe('finance');
    expect(a.qualifications).toEqual(expect.arrayContaining(['CIMA', 'CIMA Passed Finalist']));
    expect(a.skills).toEqual(expect.arrayContaining(['Accounting', 'Taxation', 'SAP FICO']));
  });
  it('rejects anything that is not really a PDF or DOCX', () => {
    expect(sniffType(Buffer.from('%PDF-1.7 ...'))).toBe('application/pdf');
    expect(sniffType(Buffer.from('<html>hello</html>'))).toBeNull();
    expect(sniffType(Buffer.from('MZ executable'))).toBeNull();
  });
  it('reads real PDF and DOCX files end to end', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cv-'));
    const script = `
import sys
from docx import Document
from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
lines=open(sys.argv[1]).read().split('\\n')
d=Document()
for l in lines: d.add_paragraph(l)
d.save(sys.argv[2]+'/cv.docx')
c=canvas.Canvas(sys.argv[2]+'/cv.pdf',pagesize=A4); y=800
for l in lines:
    c.drawString(40,y,l.replace('•','-')[:95]); y-=16
c.save()`;
    execFileSync('python3', ['-c', script, new URL('./fixtures/sample-cv.txt', import.meta.url).pathname, dir]);
    for (const f of ['cv.pdf', 'cv.docx']) {
      const buf = readFileSync(join(dir, f));
      const mime = sniffType(buf)!;
      expect(mime).toBeTruthy();
      const text = await extractText(buf, mime);
      const parsed = analyseCv(text, new Date('2026-11-04'));
      expect(parsed.name, f).toBe('Nimali Perera');
      expect(parsed.skills, f).toEqual(expect.arrayContaining(['React', 'PostgreSQL']));
      expect(parsed.yearsExperience, f).toBeGreaterThan(8);
      expect(parsed.education[0], f).toContain('Moratuwa');
    }
  });
});

describe('a two-page CV whose projects continue on page 2', () => {
  // The layout of a real CV: each project has a title line with "|" and dates, a detail line,
  // and wrapped bullets. The projects section starts on page 1 and carries on over the page break.
  const page1 = [
    'JANE PERERA', 'Full-Stack Software Engineer', 'Colombo, Sri Lanka | +94 77 000 0000 | jane@example.com',
    'PROFESSIONAL EXPERIENCE', 'Software Engineer | Acme Labs 2025 - Present', '• Built web apps.',
    'PROJECTS', 'Baileyn | Bilingual E-Commerce Store Aug 2026 - Oct 2026', 'Technologies: Next.js, Supabase | Live: baileynstore.com',
    '• Built a live online store in English and Sinhala for a coconut oil producer, designed for customers who order on a', 'phone.',
    '• Implemented product pages with size options, cart, buy-now flow and guest checkout with cash on delivery, with delivery',
    'fees calculated by district and order size.', '• Added order tracking by order number and one-time SMS code.',
    '• Developed an admin dashboard with a sales chart, order status workflow from New to Cancelled, low-stock panel and', 'failed-message alerts.',
  ];
  const page2 = [
    'TourVista Tours | Tour Discovery and Booking Platform Apr 2026 - Jun 2026', 'Technologies: Next.js, Mastercard Payment Gateway | Live: tourvistatours.com',
    '• Implemented landmark search, themed attraction pages and a packages page with search and budget filter, with', 'SEO-focused page titles, descriptions and share images.',
    'Swift Converter Hub | Privacy-First File Conversion Platform Jul 2026 - Present', '• Built 46 free tools.',
    'One World College Website | School Website and Content Platform May 2025 - Sep 2025', 'Live: owf.lk',
    '• Enabled non-technical staff to update site content from Excel files and shared folders, with no database access or technical', 'training.',
    '• Live and in active use by the school.',
    'EDUCATION', 'BSc (Hons) in Information Technology May 2025',
    'CERTIFICATIONS', 'Spring Boot Bootcamp | STEMLink Apr 2026', '• Java fundamentals and OOP.', 'MongoDB University Certifications | MongoDB Sep 2023', '• Data Modeling Intro.',
    'REFERENCES', 'A. Referee | Founder, Example Ltd',
  ];
  const p = analyseCv([...page1, ...page2].join('\n'));

  it('lists every project once, by its title, including those on page 2', () => {
    expect(p.projects).toEqual([
      'Baileyn | Bilingual E-Commerce Store', 'TourVista Tours | Tour Discovery and Booking Platform',
      'Swift Converter Hub | Privacy-First File Conversion Platform', 'One World College Website | School Website and Content Platform',
    ]);
  });

  it('does not take the wrapped word "training." for a Training heading', () => {
    expect(p.certifications).toEqual(['Spring Boot Bootcamp | STEMLink', 'MongoDB University Certifications | MongoDB']);
  });
});
