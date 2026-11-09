import { exec, one, pool } from '../config/db';
import { env } from '../config/env';
import { ingestJob } from '../services/job.service';

const DEMO = [
  { id: 'demo-1', title: 'Senior Full Stack Engineer', company: 'Example Logistics (demo)', location: 'Remote', mode: 'remote' as const, type: 'full_time' as const, min: 110000, max: 140000,
    d: 'Build customer-facing features across an Angular and Node.js stack.\n\nRequirements:\n• 5+ years of professional experience in software engineering\n• TypeScript, Angular and Node.js\n• MySQL and REST APIs\n• Docker and AWS\n• Strong communication and collaboration\n\nNice to have:\n• Kubernetes\n• GraphQL\n\nBachelor\'s degree in computer science or equivalent.' },
  { id: 'demo-2', title: 'Data Analyst', company: 'Example Retail (demo)', location: 'Chicago, IL', mode: 'hybrid' as const, type: 'full_time' as const, min: 70000, max: 90000,
    d: 'Turn sales data into decisions for merchandising teams.\n\nRequirements:\n• 2+ years of experience in data analysis\n• SQL, Excel and Tableau\n• Statistics and A/B testing\n• Attention to detail and presentation skills\n\nNice to have:\n• Python\n• dbt' },
  { id: 'demo-3', title: 'Product Manager', company: 'Example Health (demo)', location: 'Boston, MA', mode: 'onsite' as const, type: 'full_time' as const, min: 105000, max: 130000,
    d: 'Own the roadmap for a patient scheduling product.\n\nRequirements:\n• 4+ years of experience in product management\n• User research and product strategy\n• Roadmapping and stakeholder management\n• Agile and Jira\n\nNice to have:\n• SQL\n• A/B testing' },
  { id: 'demo-4', title: 'Junior Frontend Developer', company: 'Example Studio (demo)', location: 'Remote', mode: 'remote' as const, type: 'contract' as const, min: null, max: null,
    d: 'Help build marketing sites and small web apps.\n\nRequirements:\n• 1+ years of experience\n• HTML, CSS, JavaScript and React\n• Git\n• Teamwork and adaptability\n\nNice to have:\n• TypeScript\n• Figma' },
  { id: 'demo-5', title: 'DevOps Engineer Intern', company: 'Example Cloud (demo)', location: 'Austin, TX', mode: 'hybrid' as const, type: 'internship' as const, min: null, max: null,
    d: 'Learn how production systems run while improving our deployment tooling.\n\nRequirements:\n• Linux and Bash\n• Git and Docker\n• Problem solving\n\nNice to have:\n• Terraform\n• AWS' },
  { id: 'demo-6', title: 'Marketing Manager', company: 'Example Foods (demo)', location: 'Denver, CO', mode: 'onsite' as const, type: 'part_time' as const, min: 45000, max: 60000,
    d: 'Plan and run seasonal campaigns.\n\nRequirements:\n• 3+ years of experience in marketing\n• SEO, email marketing and content marketing\n• Google Analytics\n• Leadership and creativity\n\nNice to have:\n• HubSpot\n• Paid media' },
];

/** Invented listings for trying the product locally. Every row has is_demo = 1 and shows a Demo badge in the UI. */
async function main() {
  if (env.isProd) throw new Error('Demo data cannot be loaded in production.');
  await exec(`INSERT INTO job_sources (code, name, homepage, attribution) VALUES ('demo', 'Demo data', NULL, 'Invented sample listing for testing. This is not a real job.') ON DUPLICATE KEY UPDATE id = id`);
  const source = await one<{ id: number }>(`SELECT id FROM job_sources WHERE code = 'demo'`);
  for (const [i, j] of DEMO.entries()) {
    await ingestJob(source!.id, {
      externalId: j.id, title: j.title, company: j.company, description: j.d, location: j.location, workMode: j.mode, employmentType: j.type,
      salaryMin: j.min, salaryMax: j.max, salaryCurrency: j.min ? 'USD' : null, category: 'Demo', postedAt: new Date(Date.now() - i * 2 * 864e5),
    }, { isDemo: true });
  }
  console.log(`Loaded ${DEMO.length} demo listings. They are marked as demo data in the UI.`);
}

main().then(() => pool.end()).catch((e) => { console.error(e); process.exit(1); });
