import { describe, expect, it } from 'vitest';
import type { CandidateProfile } from '@/lib/cv/parse';
import { DEFAULT_OLLAMA_MODEL, getProvider, profileBrief, refineMatch, stripThinking, type Provider } from '@/lib/ai/provider';

const profile = {
  name: 'Nimali Perera', email: 'nimali@example.com', phone: '+94 77 123 4567', headline: 'Accountant', summary: '', yearsExperience: 6, experienceLevel: 'Mid level',
  education: ['BSc Accounting, University of Colombo'], degreeLevel: 3, certifications: ['ACCA'], qualifications: [],
  workHistory: [{ title: 'Senior Accountant', company: 'Ceylon Traders', period: '2021 - Present' }],
  projects: ['Moved month-end close to SAP'], achievements: ['Cut month-end close from 8 days to 5'], skills: ['SAP', 'IFRS', 'Excel'],
  languages: [], strengths: ['Attention to detail'], industries: [], families: [], targetTitles: ['Accountant'], interests: [], keywords: [],
} as unknown as CandidateProfile;

/** A stand-in for Ollama's API that records each chat request. */
function fakeOllama(reply: (body: any) => Response) {
  const asked: any[] = [];
  const f = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/api/tags')) return new Response('{}');
    const body = JSON.parse(String(init?.body));
    asked.push(body);
    return reply(body);
  }) as typeof fetch;
  return { f, asked };
}
const chat = (content: string) => new Response(JSON.stringify({ message: { content } }));

describe('local model (Ollama)', () => {
  it('uses a free, open-source model by default, with thinking switched off', async () => {
    expect(DEFAULT_OLLAMA_MODEL).toBe('qwen3:1.7b');
    const { f, asked } = fakeOllama(() => chat('Hello'));
    const p = (await getProvider({ AI_PROVIDER: 'ollama' }, f))!;
    expect(p).toMatchObject({ id: 'ollama:qwen3:1.7b', cloud: false, scoreWeight: 0.5, jobChars: 2400 });
    expect(await p.complete('Hi', { json: true, maxTokens: 50 })).toBe('Hello');
    expect(asked[0]).toMatchObject({ model: 'qwen3:1.7b', think: false, format: 'json', options: { num_ctx: 4096, num_predict: 50 } });
  });

  it('drops the thinking switch for a model that does not support it, and remembers that', async () => {
    const { f, asked } = fakeOllama((b) => (b.think === false ? new Response('{"error":"\\"granite\\" does not support thinking"}', { status: 400 }) : chat('Done')));
    const p = (await getProvider({ AI_PROVIDER: 'ollama', OLLAMA_MODEL: 'granite' }, f))!;
    expect(await p.complete('Hi')).toBe('Done');
    expect(await p.complete('Again')).toBe('Done');
    expect(asked.map((b) => 'think' in b)).toEqual([true, false, false]);
  });

  it('removes any thinking that still comes back', () => {
    expect(stripThinking('<think>Let me see.\nOk.</think>\n{"score": 70}')).toBe('{"score": 70}');
    expect(stripThinking('reasoning without an opening tag</think>Answer')).toBe('Answer');
    expect(stripThinking('Plain answer')).toBe('Plain answer');
  });

  it('is not used when Ollama is not running, so the built-in engine carries on', async () => {
    const down = (async () => { throw new Error('connection refused'); }) as typeof fetch;
    expect(await getProvider({ AI_PROVIDER: 'ollama' }, down)).toBeNull();
    expect(await getProvider({}, down)).toBeNull();
  });
});

describe('what the model sees', () => {
  it('gives writing tasks employers, achievements and projects, and keeps scoring short', () => {
    const full = profileBrief(profile, false, 'full');
    expect(full).toContain('Senior Accountant at Ceylon Traders (2021 - Present)');
    expect(full).toContain('Achievements: Cut month-end close from 8 days to 5');
    expect(full).toContain('Projects: Moved month-end close to SAP');
    const short = profileBrief(profile, false);
    expect(short).not.toContain('Achievements');
    expect(short).toContain('Recent roles: Senior Accountant');
  });

  it('removes contact details and the name before a cloud model sees anything', () => {
    const cloud = profileBrief({ ...profile, achievements: ['Praised by Nimali Perera\'s manager; email nimali@example.com'] }, true, 'full');
    expect(cloud).not.toMatch(/Nimali|Perera|nimali@example\.com/);
  });
});

describe('AI second opinion on a match', () => {
  const job = { title: 'Accountant', company: 'Hayleys', description: 'x'.repeat(5000) };
  const base = { score: 60, matchingSkills: ['SAP'], missingSkills: [] };
  const model = (scoreWeight: number | undefined, jobChars: number | undefined, seen: string[]): Provider => ({
    id: 'test', cloud: false, paceMs: 0, scoreWeight, jobChars,
    complete: async (prompt) => { seen.push(prompt); return '{"score": 90, "explanation": "Strong fit for your SAP work. IFRS experience is a bonus."}'; },
  });

  it('never lets the model override the built-in score on its own', async () => {
    expect((await refineMatch(model(undefined, undefined, []), profile, job, base)).score).toBe(75);
    expect((await refineMatch(model(0.6, undefined, []), profile, job, base)).score).toBe(78);
    expect((await refineMatch(model(1, undefined, []), profile, job, base)).score).toBe(78);
  });

  it('shows each model as much of the job as it can handle', async () => {
    const seen: string[] = [];
    await refineMatch(model(0.5, 2400, seen), profile, job, base);
    await refineMatch(model(0.5, undefined, seen), profile, job, base);
    expect(seen[0]!.match(/x{100,}/)![0].length).toBeGreaterThan(2300);
    expect(seen[1]!.match(/x{100,}/)![0].length).toBeLessThan(1801);
  });
});
