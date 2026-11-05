import { describe, expect, it } from 'vitest';
import { analyseCv } from '@/lib/cv/parse';
import { requiredYears, scoreJob } from '@/lib/match/score';
import { profile } from './helpers';

const p = profile();
const job = (title: string, description: string) => ({ title, description });

describe('matching', () => {
  it('rates a direct match Strong and explains why', () => {
    const r = scoreJob(job('Senior Software Engineer', 'Requirements\n• 5+ years of experience\n• React, TypeScript, Node.js\n• PostgreSQL, AWS, Docker'), p);
    expect(r.tier).toBe('Strong');
    expect(r.score).toBeGreaterThanOrEqual(75);
    expect(r.matchingSkills).toEqual(expect.arrayContaining(['React', 'AWS']));
    expect(r.explanation).toContain('React');
    expect(r.mandatoryMissing).toEqual([]);
  });
  it('finds adjacent roles without exact title matches', () => {
    const r = scoreJob(job('DevOps Engineer', 'Requirements\n• Docker and AWS\n• Linux and Terraform\n• Git'), p);
    expect(r.relevant).toBe(true);
    expect(r.tier).not.toBeNull();
    expect(r.missingSkills).toEqual(expect.arrayContaining(['Terraform', 'Linux']));
  });
  it('does not recommend irrelevant jobs', () => {
    for (const j of [
      job('Registered Nurse', 'Requirements\n• Patient care and nursing\n• Nursing Council registration'),
      job('Chef de Partie', 'Requirements\n• Culinary training, food safety and HACCP'),
      job('Accounts Executive', 'Requirements\n• Accounting, bank reconciliation and VAT\n• Excel'),
    ]) {
      const r = scoreJob(j, p);
      expect(r.relevant, j.title).toBe(false);
      expect(r.tier, j.title).toBeNull();
    }
  });
  it('flags missing mandatory qualifications', () => {
    const r = scoreJob(job('Software Engineer', "Requirements\n• Master's degree in Computer Science\n• 12+ years of experience\n• React"), p);
    expect(r.mandatoryMissing).toEqual(expect.arrayContaining(["Master's degree", '12+ years of experience']));
    expect(r.explanation).toContain('Check before applying');
    expect(r.suitability).toContain('missing requirements');
  });
  it('scales to the candidate: a finance CV matches finance roles, not software', () => {
    const a = analyseCv('Kasun Silva\nAccounts Executive\n\nEXPERIENCE\nAccounts Executive, Hayleys PLC\n2019 - 2023\n\nEDUCATION\nCIMA\n\nSKILLS\nAccounting, Excel, Taxation, Financial Reporting, Bank Reconciliation');
    expect(scoreJob(job('Accountant', 'Requirements\n• Accounting and financial reporting\n• Taxation, bank reconciliation'), a).relevant).toBe(true);
    expect(scoreJob(job('Backend Developer', 'Requirements\n• Java, Spring Boot, Kubernetes'), a).relevant).toBe(false);
  });
  it('summarises the role, not the requirements, and keeps Node.js whole', async () => {
    const { jobSummaryDraft } = await import('@/lib/ai/drafts');
    const out = jobSummaryDraft({ title: 'Dev', company: 'A', score: 80, matching_skills: [], missing_skills: [], mandatory_missing: [], suitability: 'A strong fit.',
      requirements: ['Node.js'], description: 'Build payment products on Node.js for banks.\n\nRequirements\n• Node.js and React' });
    expect(out.split('\n')[0]).toBe('Build payment products on Node.js for banks.');
    expect(out).toContain('Is it worth applying? A strong fit.');
  });
  it('keeps a job open through its final day', async () => {
    const { parseDeadline } = await import('@/lib/text');
    expect(parseDeadline('2026-12-01')?.toISOString()).toBe('2026-12-01T18:29:59.000Z');
    expect(parseDeadline('2026-12-01T17:00')?.toISOString()).toBe('2026-12-01T11:30:00.000Z');
    expect(parseDeadline('2026-12-01T17:00:00Z')?.toISOString()).toBe('2026-12-01T17:00:00.000Z');
    expect(parseDeadline('nonsense')).toBeNull();
  });
  it('reads required years', () => {
    expect(requiredYears('At least 3+ years of relevant experience')).toBe(3);
    expect(requiredYears('2-4 years experience')).toBe(2);
    expect(requiredYears('Founded 15 years ago')).toBeNull();
  });
});
