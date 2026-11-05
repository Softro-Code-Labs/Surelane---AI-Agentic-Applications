// Skills and role families recognised by the built-in engine. Deliberately broad:
// the app must work for any CV, with attention to Sri Lankan qualifications.

export type Family =
  | 'software' | 'data' | 'qa' | 'devops' | 'it_support' | 'design' | 'product_project'
  | 'marketing' | 'sales' | 'finance' | 'banking' | 'hr' | 'admin' | 'customer_service'
  | 'logistics' | 'engineering' | 'healthcare' | 'education' | 'hospitality' | 'legal'
  | 'manufacturing' | 'research';

export const FAMILY_LABEL: Record<Family, string> = {
  software: 'Software development', data: 'Data and AI', qa: 'Quality assurance', devops: 'DevOps and cloud',
  it_support: 'IT support and networks', design: 'Design', product_project: 'Product and project management',
  marketing: 'Marketing', sales: 'Sales and business development', finance: 'Finance and accounting',
  banking: 'Banking and insurance', hr: 'Human resources', admin: 'Administration',
  customer_service: 'Customer service', logistics: 'Logistics and supply chain', engineering: 'Engineering',
  healthcare: 'Healthcare', education: 'Education and training', hospitality: 'Hospitality and tourism',
  legal: 'Legal and compliance', manufacturing: 'Manufacturing and apparel', research: 'Research',
};

/** Title words that identify a family. Checked longest-first against job titles. */
export const FAMILY_TITLES: Record<Family, string[]> = {
  software: ['software engineer', 'software developer', 'developer', 'programmer', 'full stack', 'fullstack', 'backend', 'back end', 'frontend', 'front end', 'web developer', 'mobile developer', 'android', 'ios engineer', 'application engineer', 'tech lead', 'technical lead', 'solutions engineer', 'automation engineer'],
  data: ['data scientist', 'data analyst', 'data engineer', 'machine learning', 'ml engineer', 'ai engineer', 'business intelligence', 'bi analyst', 'analytics', 'statistician'],
  qa: ['qa engineer', 'quality assurance', 'software tester', 'test engineer', 'sdet', 'qa analyst', 'qa automation', 'test automation', 'tester'],
  devops: ['devops', 'site reliability', 'sre', 'cloud engineer', 'platform engineer', 'infrastructure engineer'],
  it_support: ['it support', 'system administrator', 'systems administrator', 'network engineer', 'network administrator', 'help desk', 'helpdesk', 'it executive', 'it officer', 'security analyst', 'security engineer', 'cybersecurity', 'database administrator'],
  design: ['ui designer', 'ux designer', 'ui/ux', 'graphic designer', 'product designer', 'visual designer', 'designer', 'creative', 'video editor', 'illustrator'],
  product_project: ['product manager', 'project manager', 'product owner', 'scrum master', 'business analyst', 'project coordinator', 'program manager', 'delivery manager'],
  marketing: ['marketing', 'digital marketing', 'seo', 'content writer', 'copywriter', 'social media', 'brand manager', 'brand executive', 'communications', 'public relations', 'content creator'],
  sales: ['sales', 'business development', 'account manager', 'account executive', 'merchandiser', 'relationship manager', 'territory', 'key account', 'client solutions'],
  finance: ['accountant', 'accounting', 'finance', 'financial analyst', 'auditor', 'audit', 'accounts executive', 'accounts assistant', 'tax', 'treasury', 'payroll', 'bookkeeper', 'management accountant', 'finance executive'],
  banking: ['banking', 'bank', 'teller', 'credit officer', 'credit analyst', 'insurance', 'underwriter', 'loan', 'microfinance', 'wealth'],
  hr: ['human resources', 'hr executive', 'hr manager', 'hr assistant', 'hr business partner', 'recruiter', 'talent acquisition', 'people operations', 'hrbp', 'learning and development'],
  admin: ['administrative', 'admin', 'office assistant', 'secretary', 'executive assistant', 'personal assistant', 'receptionist', 'data entry', 'clerk', 'office manager'],
  customer_service: ['customer service', 'customer support', 'customer care', 'call center', 'call centre', 'customer success', 'support agent', 'contact center'],
  logistics: ['logistics', 'supply chain', 'procurement', 'purchasing', 'warehouse', 'shipping', 'freight', 'inventory', 'import', 'export', 'store keeper', 'storekeeper', 'driver'],
  engineering: ['civil engineer', 'mechanical engineer', 'electrical engineer', 'electronic engineer', 'quantity surveyor', 'site engineer', 'structural engineer', 'maintenance engineer', 'architect', 'draughtsman', 'technician', 'project engineer', 'telecommunication engineer'],
  healthcare: ['nurse', 'pharmacist', 'doctor', 'medical officer', 'medical', 'laboratory', 'radiographer', 'physiotherapist', 'caregiver', 'dental', 'clinical'],
  education: ['teacher', 'lecturer', 'tutor', 'instructor', 'trainer', 'academic', 'professor', 'teaching assistant', 'educator'],
  hospitality: ['chef', 'cook', 'waiter', 'steward', 'hotel', 'front office', 'housekeeping', 'barista', 'restaurant', 'travel consultant', 'tour', 'guest relations'],
  legal: ['lawyer', 'attorney', 'legal', 'compliance', 'paralegal', 'company secretary', 'risk officer'],
  manufacturing: ['production', 'garment', 'apparel', 'quality controller', 'quality control', 'factory', 'industrial engineer', 'plant', 'machine operator', 'pattern maker', 'textile', 'fabric'],
  research: ['research', 'researcher', 'research assistant', 'scientist', 'lab assistant'],
};

/** Roles a person can realistically move between. */
export const ADJACENT: Record<Family, Family[]> = {
  software: ['qa', 'devops', 'data', 'product_project', 'it_support'],
  data: ['software', 'research', 'finance', 'product_project'],
  qa: ['software', 'devops', 'product_project'],
  devops: ['software', 'it_support', 'qa'],
  it_support: ['devops', 'software', 'customer_service'],
  design: ['marketing', 'product_project'],
  product_project: ['software', 'marketing', 'sales', 'admin'],
  marketing: ['sales', 'design', 'customer_service', 'product_project'],
  sales: ['marketing', 'customer_service', 'banking'],
  finance: ['banking', 'admin', 'data', 'legal'],
  banking: ['finance', 'sales', 'customer_service'],
  hr: ['admin', 'legal', 'education'],
  admin: ['hr', 'customer_service', 'finance'],
  customer_service: ['sales', 'admin', 'hospitality', 'it_support'],
  logistics: ['manufacturing', 'admin', 'sales'],
  engineering: ['manufacturing', 'product_project', 'research'],
  healthcare: ['research', 'education'],
  education: ['research', 'hr', 'admin'],
  hospitality: ['customer_service', 'sales'],
  legal: ['finance', 'hr', 'admin'],
  manufacturing: ['engineering', 'logistics'],
  research: ['education', 'data', 'healthcare'],
};

export const FAMILY_ROLES: Record<Family, string[]> = {
  software: ['Software Engineer', 'Full Stack Developer', 'Backend Developer', 'Solutions Engineer'],
  data: ['Data Analyst', 'BI Analyst', 'Data Engineer', 'Analytics Engineer'],
  qa: ['QA Engineer', 'Test Automation Engineer', 'QA Analyst'],
  devops: ['DevOps Engineer', 'Cloud Engineer', 'Site Reliability Engineer'],
  it_support: ['IT Support Engineer', 'Systems Administrator', 'Network Engineer'],
  design: ['UI/UX Designer', 'Graphic Designer', 'Product Designer'],
  product_project: ['Business Analyst', 'Project Coordinator', 'Product Owner'],
  marketing: ['Digital Marketing Executive', 'Content Strategist', 'Brand Executive'],
  sales: ['Business Development Executive', 'Account Manager', 'Sales Executive'],
  finance: ['Accounts Executive', 'Financial Analyst', 'Audit Associate'],
  banking: ['Banking Associate', 'Credit Analyst', 'Insurance Underwriter'],
  hr: ['HR Executive', 'Talent Acquisition Specialist', 'HR Business Partner'],
  admin: ['Administrative Executive', 'Executive Assistant', 'Office Coordinator'],
  customer_service: ['Customer Success Executive', 'Customer Support Specialist'],
  logistics: ['Supply Chain Executive', 'Procurement Officer', 'Logistics Coordinator'],
  engineering: ['Site Engineer', 'Project Engineer', 'Maintenance Engineer'],
  healthcare: ['Clinical Coordinator', 'Medical Officer', 'Pharmacy Associate'],
  education: ['Lecturer', 'Corporate Trainer', 'Academic Coordinator'],
  hospitality: ['Guest Relations Executive', 'Front Office Executive'],
  legal: ['Legal Executive', 'Compliance Officer'],
  manufacturing: ['Production Executive', 'Industrial Engineer', 'Quality Controller'],
  research: ['Research Assistant', 'Research Analyst'],
};

export type Skill = { name: string; aliases?: string[]; family?: Family; cs?: boolean };

const list = (family: Family, names: (string | Skill)[]): Skill[] =>
  names.map((n) => (typeof n === 'string' ? { name: n, family } : { family, ...n }));

export const SKILLS: Skill[] = [
  ...list('software', ['JavaScript', 'TypeScript', 'Python', 'Java', 'Kotlin', 'Swift', 'PHP', 'Ruby', 'Rust', 'Scala', 'Dart', 'Laravel', 'Django', 'Flask', 'FastAPI', 'Spring Boot', 'Spring', 'Hibernate', 'Express', 'NestJS', 'React Native', 'Flutter', 'Angular', 'Vue', 'Svelte', 'HTML', 'CSS', 'Tailwind', 'Sass', 'jQuery', 'GraphQL', 'REST API', 'Microservices', 'WordPress', 'Shopify', 'Git', 'WebSockets', 'OAuth', 'Unity', 'Salesforce', 'SAP ABAP', 'Ballerina',
    { name: 'React', aliases: ['React', 'React.js', 'ReactJS'] }, { name: 'Next.js', aliases: ['Next.js', 'NextJS'] }, { name: 'Node.js', aliases: ['Node.js', 'NodeJS', 'Node'] },
    { name: 'C#', aliases: ['C#', 'C Sharp'] }, { name: 'C++', aliases: ['C++', 'CPP'] }, { name: '.NET', aliases: ['.NET', 'ASP.NET', 'dotnet', 'NET Core'] },
    { name: 'Go', aliases: ['Golang', 'Go'], cs: true }, { name: 'C', aliases: ['C'], cs: true }]),
  ...list('data', ['SQL', 'MySQL', 'PostgreSQL', 'MongoDB', 'Oracle Database', 'SQL Server', 'Redis', 'Elasticsearch', 'Power BI', 'Tableau', 'Looker', 'Pandas', 'NumPy', 'scikit-learn', 'TensorFlow', 'PyTorch', 'Machine Learning', 'Deep Learning', 'NLP', 'LangChain', 'Generative AI', 'Data Analysis', 'Data Visualization', 'Data Modeling', 'ETL', 'Apache Spark', 'Airflow', 'dbt', 'Hadoop', 'Statistics', 'SPSS', 'Stata', 'Google Analytics',
    { name: 'R', aliases: ['R'], cs: true }, { name: 'Excel', aliases: ['Excel', 'MS Excel', 'Microsoft Excel', 'Advanced Excel'] }, { name: 'LLMs', aliases: ['LLM', 'LLMs', 'large language models'] }]),
  ...list('qa', ['Selenium', 'Cypress', 'Playwright', 'Appium', 'JMeter', 'Postman', 'Manual Testing', 'Automation Testing', 'Test Cases', 'Regression Testing', 'Load Testing', 'JUnit', 'TestNG', 'Cucumber']),
  ...list('devops', ['Docker', 'Kubernetes', 'Terraform', 'Ansible', 'Jenkins', 'GitHub Actions', 'GitLab CI', 'CI/CD', 'Linux', 'Bash', 'Nginx', 'Prometheus', 'Grafana', 'Helm',
    { name: 'AWS', aliases: ['AWS', 'Amazon Web Services'] }, { name: 'Azure', aliases: ['Azure', 'Microsoft Azure'] }, { name: 'Google Cloud', aliases: ['GCP', 'Google Cloud'] }]),
  ...list('it_support', ['Windows Server', 'Active Directory', 'Networking', 'TCP/IP', 'Firewall', 'Troubleshooting', 'VMware', 'Cybersecurity', 'SIEM', 'Penetration Testing', 'ISO 27001', 'Microsoft 365', 'VPN', 'ITIL',
    { name: 'CCNA', cs: false }, { name: 'Help Desk', aliases: ['Help Desk', 'Helpdesk'] }]),
  ...list('design', ['Figma', 'Adobe XD', 'Sketch', 'Photoshop', 'Illustrator', 'InDesign', 'After Effects', 'Premiere Pro', 'CorelDRAW', 'Canva', 'Blender', 'Wireframing', 'Prototyping', 'User Research', 'Typography', 'Motion Graphics', 'Branding',
    { name: 'UI Design', aliases: ['UI Design', 'UI/UX'] }, { name: 'UX Design', aliases: ['UX Design', 'User Experience'] }]),
  ...list('product_project', ['Agile', 'Scrum', 'Kanban', 'Jira', 'Confluence', 'Project Management', 'Product Management', 'Requirements Gathering', 'Stakeholder Management', 'Risk Management', 'Roadmapping', 'Business Analysis', 'User Stories', 'Microsoft Project',
    { name: 'PMP', cs: true }, { name: 'PRINCE2' }]),
  ...list('marketing', ['Digital Marketing', 'SEO', 'SEM', 'Google Ads', 'Meta Ads', 'Social Media Marketing', 'Content Marketing', 'Email Marketing', 'Copywriting', 'Brand Management', 'Market Research', 'Campaign Management', 'Public Relations', 'HubSpot', 'Mailchimp', 'Event Management', 'CRM']),
  ...list('sales', ['Sales', 'Business Development', 'Lead Generation', 'Negotiation', 'Account Management', 'Cold Calling', 'B2B Sales', 'B2C Sales', 'Key Account Management', 'Salesforce CRM', 'Merchandising', 'Retail Sales', 'Client Relationship Management', 'Presentation Skills']),
  ...list('finance', ['Accounting', 'Bookkeeping', 'Financial Reporting', 'Financial Analysis', 'Budgeting', 'Forecasting', 'Auditing', 'Internal Audit', 'Taxation', 'VAT', 'Payroll', 'Accounts Payable', 'Accounts Receivable', 'Bank Reconciliation', 'IFRS', 'LKAS', 'SLFRS', 'QuickBooks', 'Tally', 'Xero', 'Sage', 'SAP FICO', 'Oracle Financials', 'Costing', 'Treasury Management', 'Variance Analysis']),
  ...list('banking', ['Credit Analysis', 'Retail Banking', 'Corporate Banking', 'Trade Finance', 'Underwriting', 'Loan Processing', 'AML', 'KYC', 'Microfinance', 'Leasing', 'Claims Handling', 'Wealth Management']),
  ...list('hr', ['Recruitment', 'Talent Acquisition', 'Employee Relations', 'Performance Management', 'Onboarding', 'HRIS', 'Labour Law', 'Training and Development', 'Compensation and Benefits', 'EPF', 'ETF', 'Succession Planning', 'Organisational Development']),
  ...list('admin', ['Office Administration', 'Data Entry', 'Scheduling', 'Minute Taking', 'Document Management', 'Calendar Management', 'Filing', 'Microsoft Office', 'Google Workspace', 'Typing', 'Correspondence']),
  ...list('customer_service', ['Customer Service', 'Customer Support', 'Complaint Handling', 'Call Handling', 'Zendesk', 'Live Chat', 'Customer Success', 'Telesales']),
  ...list('logistics', ['Supply Chain Management', 'Procurement', 'Inventory Management', 'Warehouse Management', 'Logistics', 'Freight Forwarding', 'Customs Clearance', 'Vendor Management', 'Demand Planning', 'SAP MM', 'Incoterms', 'Fleet Management']),
  ...list('engineering', ['AutoCAD', 'Revit', 'SolidWorks', 'MATLAB', 'ETABS', 'SAP2000', 'Civil 3D', 'Site Supervision', 'BOQ Preparation', 'Quantity Surveying', 'Electrical Design', 'PLC Programming', 'HVAC', 'Structural Analysis', 'Preventive Maintenance', 'Primavera']),
  ...list('healthcare', ['Patient Care', 'Nursing', 'Pharmacy', 'Clinical Research', 'Phlebotomy', 'Medical Records', 'First Aid', 'Infection Control', 'Medical Laboratory']),
  ...list('education', ['Teaching', 'Lesson Planning', 'Curriculum Development', 'Classroom Management', 'Lecturing', 'Student Assessment', 'Instructional Design', 'E-learning', 'Moodle', 'Mentoring']),
  ...list('hospitality', ['Front Office', 'Housekeeping', 'Food and Beverage', 'Food Safety', 'HACCP', 'Reservations', 'Opera PMS', 'Tour Planning', 'Ticketing', 'Banquet', 'Guest Relations', 'Culinary']),
  ...list('legal', ['Legal Research', 'Contract Drafting', 'Corporate Law', 'Regulatory Compliance', 'Litigation', 'Company Secretarial', 'Intellectual Property', 'Data Protection']),
  ...list('manufacturing', ['Lean Manufacturing', 'Six Sigma', 'Kaizen', '5S', 'Production Planning', 'Quality Control', 'Quality Assurance Systems', 'ISO 9001', 'Garment Technology', 'Pattern Making', 'Fabric Inspection', 'Line Balancing', 'Work Study', 'ERP']),
  ...list('research', ['Research Methods', 'Academic Writing', 'Literature Review', 'Lab Techniques', 'Grant Writing', 'Data Collection']),
  // Transferable skills: reported, but given less weight in matching.
  { name: 'Communication', aliases: ['Communication Skills', 'Communication'] },
  { name: 'Leadership', aliases: ['Leadership', 'Team Leadership', 'Team Lead'] },
  { name: 'Teamwork', aliases: ['Teamwork', 'Team Player'] },
  { name: 'Problem Solving', aliases: ['Problem Solving', 'Problem-Solving', 'Analytical Skills'] },
  { name: 'Time Management' }, { name: 'Critical Thinking' }, { name: 'Report Writing' }, { name: 'People Management' },
];

export const SOFT_SKILLS = new Set(['Communication', 'Leadership', 'Teamwork', 'Problem Solving', 'Time Management', 'Critical Thinking', 'Report Writing', 'People Management', 'Microsoft Office', 'Excel', 'Git']);

/** Qualifications that a vacancy can make mandatory. */
export const QUALIFICATIONS: { name: string; pattern: RegExp }[] = [
  { name: 'CIMA', pattern: /\bCIMA\b/ }, { name: 'ACCA', pattern: /\bACCA\b/ },
  { name: 'CA Sri Lanka', pattern: /\bCA Sri Lanka\b|\bChartered Accountant|\bICASL\b/i },
  { name: 'CMA', pattern: /\bCMA\b/ }, { name: 'AAT', pattern: /\bAAT\b/ }, { name: 'CFA', pattern: /\bCFA\b/ },
  { name: 'CIPM', pattern: /\bCIPM\b/ }, { name: 'CIM', pattern: /\bCIM\b/ }, { name: 'SLIM', pattern: /\bSLIM\b/ },
  { name: 'CIMA Passed Finalist', pattern: /passed finalist/i }, { name: 'IESL', pattern: /\bIESL\b/ },
  { name: 'NVQ', pattern: /\bNVQ\b/ }, { name: 'PMP', pattern: /\bPMP\b/ },
  { name: 'AWS Certification', pattern: /\bAWS Certified\b/i }, { name: 'CCNA', pattern: /\bCCNA\b/ },
  { name: 'SLMC registration', pattern: /\bSLMC\b/ }, { name: 'Nursing Council registration', pattern: /\bNursing Council\b/i },
  { name: 'Attorney-at-Law', pattern: /\bAttorney[- ]at[- ]Law\b/i },
];

export const DEGREE_LEVELS: { level: number; label: string; pattern: RegExp }[] = [
  { level: 5, label: 'PhD', pattern: /\b(ph\.?d|doctorate)\b/i },
  { level: 4, label: "Master's degree", pattern: /\b(master'?s?|msc|m\.sc|mba|m\.a\.|meng|mphil)\b/i },
  { level: 3, label: "Bachelor's degree", pattern: /\b(bachelor'?s?|bsc|b\.sc|b\.a\.|beng|b\.eng|bba|bcom|b\.com|llb|degree|undergraduate)\b/i },
  { level: 2, label: 'Diploma', pattern: /\b(hnd|hndit|higher national|diploma)\b/i },
  { level: 1, label: 'G.C.E. A/L', pattern: /\b(a\/l|advanced level|g\.?c\.?e\.?\s*a)\b/i },
];

function escape(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
}

const compiled = SKILLS.map((s) => {
  const names = s.aliases ?? [s.name];
  const body = names.map(escape).join('|');
  return { skill: s, re: new RegExp(`(?<![\\w+#.])(?:${body})(?![\\w+#]|\\.\\w)`, s.cs ? '' : 'i') };
});

export function findSkills(text: string): string[] {
  const out = new Set<string>();
  for (const { skill, re } of compiled) if (re.test(text)) out.add(skill.name);
  if (out.has('React Native') && !/\breact(?:\.js|js)?\b(?! native)/i.test(text)) out.delete('React');
  return [...out];
}

export function skillFamily(name: string): Family | undefined {
  return SKILLS.find((s) => s.name === name)?.family;
}

export function familyOfTitle(title: string): Family | null {
  const t = ` ${title.toLowerCase()} `;
  let best: { family: Family; len: number } | null = null;
  for (const [family, words] of Object.entries(FAMILY_TITLES) as [Family, string[]][]) {
    for (const w of words) {
      if (new RegExp(`(?<![a-z])${escape(w)}(?![a-z])`).test(t) && (!best || w.length > best.len)) {
        best = { family, len: w.length };
      }
    }
  }
  return best?.family ?? null;
}

export function findQualifications(text: string): string[] {
  return QUALIFICATIONS.filter((q) => q.pattern.test(text)).map((q) => q.name);
}

export function degreeLevel(text: string): number {
  return DEGREE_LEVELS.find((d) => d.pattern.test(text))?.level ?? 0;
}
