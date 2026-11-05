// TEST ONLY. Drives the real worker with labelled fixture listings, because the
// test environment has no route to job sites. Never imported by the application.
import { closePool } from '../../src/lib/db';
import { tick } from '../../src/worker/tick';
import { source, jobDescription } from '../helpers';

const posted = new Date(Date.now() - 2 * 86_400_000);
const soon = new Date(Date.now() + 9 * 86_400_000);
const local = source('fixture-lk', [
  { title: 'Senior Software Engineer', company: 'Test Fixture Fintech', location: 'Colombo', employmentType: 'Full-time', workMode: 'hybrid', salary: 'LKR 450,000-600,000', postedAt: posted, deadline: soon, description: `Build payment products for local banks.\n\n${jobDescription()}\n\nNice to have\n• Kubernetes and Terraform` },
  { title: 'Full Stack Developer', company: 'Test Fixture Logistics', location: 'Kandy', employmentType: 'Full-time', workMode: 'onsite', postedAt: posted, description: `Shipping software team.\n\nRequirements\n• React, Node.js, PostgreSQL\n• GraphQL and Redis` },
  { title: 'DevOps Engineer', company: 'Test Fixture Cloud', location: 'Colombo', employmentType: 'Contract', workMode: 'remote', postedAt: posted, description: `Requirements\n• AWS, Docker, Kubernetes, Terraform\n• Linux and CI/CD\n• CCNA certification` },
  { title: 'Engineering Manager', company: 'Test Fixture Bank', location: 'Colombo', employmentType: 'Part-time', workMode: 'onsite', postedAt: posted, description: `Requirements\n• Master's degree in Computer Science\n• 12+ years of experience\n• Leadership, Agile and AWS\n• TypeScript` },
  { title: 'Expired Test Role', company: 'Test Fixture Old', location: 'Colombo', postedAt: posted, deadline: new Date(Date.now() - 86_400_000) },
  { title: 'Registered Nurse', company: 'Test Fixture Hospital', location: 'Galle', postedAt: posted, description: 'Requirements\n• Patient care and nursing' },
]);
const intl = source('fixture-remote', [
  { title: 'Backend Engineer', company: 'Test Fixture Remote', location: 'Remote, worldwide', country: null, workMode: 'remote', slEligibility: 'yes', employmentType: 'Full-time', salary: 'USD 60,000-80,000', postedAt: posted },
  { title: 'Staff Software Engineer', company: 'Test Fixture Berlin', location: 'Berlin, Germany', country: 'Germany', workMode: 'onsite', employmentType: 'Full-time', postedAt: posted },
]);
const failing = source('fixture-down', [], { label: 'Failing test source', search: async () => { throw new Error('HTTP 503 from test source'); } } as any);

await tick({ sources: [local, intl, failing], provider: null, fetch: (async () => new Response('', { status: 404 })) as any, sleep: async () => {} });
await closePool();
