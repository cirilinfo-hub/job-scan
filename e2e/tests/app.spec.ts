import { expect, Page, test } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const PASSWORD = 'Str0ng-password-1';
const shots = process.env.E2E_SHOTS;
const stamp = Date.now();
const EMAIL = `e2e${stamp}@example.com`;
const JOB_TEXT = `Senior Full Stack Engineer
Requirements:
5+ years of professional experience in software engineering
TypeScript, Angular and Node.js required
MySQL and REST APIs
Kubernetes is required
Strong communication
Nice to have:
GraphQL
Bachelor's degree in computer science`;

/** Fails the test on any console error, uncaught exception, or failed API call (except expected ones). */
function watch(page: Page) {
  const problems: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error' && !/status of 401|net::ERR_ABORTED|status of 503/.test(m.text())) problems.push(`console: ${m.text()}`); });
  page.on('pageerror', (e) => problems.push(`exception: ${e.message}`));
  page.on('response', (r) => { if (r.status() >= 500 && r.status() !== 503) problems.push(`HTTP ${r.status()} ${r.url()}`); });
  return problems;
}

async function shot(page: Page, name: string) {
  if (!shots) return;
  fs.mkdirSync(shots, { recursive: true });
  await page.screenshot({ path: path.join(shots, `${name}.png`), fullPage: false });
}

async function register(page: Page, email = EMAIL) {
  await page.goto('/register');
  await page.getByLabel('Full name').fill('Ana Silva');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(PASSWORD);
  await page.getByRole('button', { name: 'Create account' }).click();
  await expect(page.getByRole('heading', { name: /Hello, Ana/ })).toBeVisible();
}

async function login(page: Page, email = EMAIL, password = PASSWORD) {
  await page.goto('/login');
  await page.getByLabel('Email').fill(email);
  await page.getByLabel('Password').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: /Hello,/ })).toBeVisible();
}

const RESUME_PDF = path.join(__dirname, 'fixtures', 'resume.pdf');

test.describe.serial('job seeker journey', () => {
  test('auth pages: validation, register, reload keeps the session, sign out', async ({ page }) => {
    const problems = watch(page);
    await page.goto('/dashboard');
    await expect(page).toHaveURL(/\/login\?returnUrl=%2Fdashboard/);
    await shot(page, 'login');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByText('Enter a valid email address.')).toBeVisible();
    await page.getByLabel('Email').fill('nobody@example.com');
    await page.getByLabel('Password').fill('wrong-password-1');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.getByRole('alert')).toContainText('incorrect');

    await register(page);
    await page.reload();
    await expect(page.getByRole('heading', { name: /Hello, Ana/ })).toBeVisible();
    await shot(page, 'dashboard-empty');

    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/tracker');
    await expect(page).toHaveURL(/\/login/);
    expect(problems).toEqual([]);
  });

  test('resume: upload a PDF, review, edit a new version, download', async ({ page }) => {
    const problems = watch(page);
    await login(page);
    await page.goto('/resumes');
    await page.locator('input[type=file]').setInputFiles(RESUME_PDF);
    await expect(page).toHaveURL(/\/resumes\/\d+$/);
    await expect(page.getByText('We read this from your file automatically')).toBeVisible();
    await expect(page.getByLabel('Full name')).toHaveValue('Ana Silva');
    await expect(page.getByLabel('Email').first()).toHaveValue('ana@example.com');
    await page.getByLabel('Professional summary').fill('Full stack engineer building web products with Angular.');
    await page.getByLabel('Version label (optional)').fill('Tuned summary');
    await page.getByRole('button', { name: 'Save as new version' }).click();
    await expect(page.getByText('Version 2').first()).toBeVisible();
    await shot(page, 'resume-detail');
    const [dl] = await Promise.all([page.waitForEvent('download'), (async () => {
      await page.getByRole('button', { name: 'Download', exact: false }).first().click();
      await page.getByRole('menuitem', { name: 'PDF' }).click();
    })()]);
    expect(dl.suggestedFilename()).toMatch(/\.pdf$/);
    await page.getByRole('tab', { name: 'Preview' }).click();
    await expect(page.locator('.paper')).toContainText('Ana Silva');
    expect(problems).toEqual([]);
  });

  test('scanner: run, read report, exclude a term, compare side by side', async ({ page }) => {
    const problems = watch(page);
    await login(page);
    await page.goto('/scanner');
    await page.getByRole('button', { name: 'Scan resume' }).click();
    await expect(page.getByText('Enter the job title.')).toBeVisible();
    await page.getByLabel('Company (optional)').fill('Acme');
    await page.getByLabel('Job title').fill('Senior Full Stack Engineer');
    await page.getByLabel('Job description').fill(JOB_TEXT);
    await page.getByRole('button', { name: 'Scan resume' }).click();
    await expect(page).toHaveURL(/\/scanner\/\d+$/);
    await expect(page.getByText(/not the score of any employer/)).toBeVisible();
    await expect(page.locator('.chip.miss', { hasText: 'Kubernetes' })).toBeVisible();
    await shot(page, 'report');
    await page.getByLabel('Exclude Kubernetes').first().click();
    await expect(page.getByText('Excluded by you')).toBeVisible();
    await page.getByLabel('Include Kubernetes again').click();
    await expect(page.locator('.chip.miss', { hasText: 'Kubernetes' })).toBeVisible();
    await page.getByRole('tab', { name: 'Improvements' }).click();
    await expect(page.getByRole('heading', { name: 'Formatting and readability' })).toBeVisible();
    await page.getByRole('tab', { name: 'Side by side' }).click();
    await expect(page.locator('mark.hit-ok').first()).toBeVisible();
    await shot(page, 'side-by-side');
    expect(problems).toEqual([]);
  });

  test('optimizer: confirm a claim, accept, rescore, save a version', async ({ page }) => {
    const problems = watch(page);
    await login(page);
    await page.goto('/scanner');
    await page.locator('app-score').first().waitFor();
    await page.locator('.list-item a').first().click();
    await page.getByRole('link', { name: 'Optimize resume' }).click();
    await expect(page.getByRole('heading', { name: 'Resume optimizer' })).toBeVisible();
    await expect(page.getByText("AI features aren't available")).toBeVisible();
    const sug = page.locator('.sug', { hasText: 'Kubernetes' });
    await expect(sug.getByRole('button', { name: 'Accept' })).toBeDisabled();
    await sug.getByRole('checkbox').check();
    await sug.getByRole('button', { name: 'Accept' }).click();
    await expect(page.locator('.sug', { hasText: 'Kubernetes' })).toHaveCount(0);
    await page.getByRole('button', { name: 'Recalculate' }).click();
    await expect(page.getByText(/[+-]?\d+ points/)).toBeVisible();
    await shot(page, 'optimizer');
    await page.getByRole('button', { name: 'Compare before and after' }).click();
    await expect(page.getByRole('heading', { name: 'After' })).toBeVisible();
    await page.getByRole('button', { name: 'Save version' }).click();
    await expect(page).toHaveURL(/\/resumes\/\d+$/);
    expect(problems).toEqual([]);
  });

  test('builder: fill, reorder, switch template, download, save', async ({ page }) => {
    const problems = watch(page);
    await login(page);
    await page.goto('/builder');
    await page.getByLabel('Full name').fill('Ana Builder');
    await page.getByLabel('Professional summary').fill('Builds things.');
    await expect(page.locator('.paper')).toContainText('Ana Builder');
    await page.getByRole('button', { name: 'Add role' }).click();
    await page.getByLabel('Job title').fill('Engineer');
    await page.getByLabel('Company').fill('Acme');
    await expect(page.locator('.paper')).toContainText('Engineer, Acme');
    await page.getByRole('button', { name: 'Move Experience up' }).click();
    const headings = await page.locator('.paper h3').allTextContents();
    expect(headings[0].toLowerCase()).toContain('experience');
    await page.getByRole('radio', { name: /Modern/ }).click();
    await expect(page.locator('.paper.modern')).toBeVisible();
    await shot(page, 'builder');
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'DOCX' }).click()]);
    expect(dl.suggestedFilename()).toMatch(/\.docx$/);
    await page.getByLabel('Resume name').fill('Built in test');
    await page.getByRole('button', { name: 'Save resume' }).click();
    await expect(page).toHaveURL(/\/resumes\/\d+$/);
    expect(problems).toEqual([]);
  });

  test('jobs: search, filter, open detail, save, track, matches', async ({ page }) => {
    const problems = watch(page);
    await login(page);
    await page.goto('/jobs');
    await expect(page.locator('app-job-card').first()).toBeVisible();
    await shot(page, 'jobs');
    await page.getByRole('checkbox', { name: 'Remote' }).check();
    await expect(page.locator('app-job-card').first()).toBeVisible();
    await page.getByLabel('Job title').fill('Senior Full Stack Engineer');
    await page.getByRole('button', { name: 'Search', exact: true }).click();
    const card = page.locator('app-job-card', { hasText: 'Senior Full Stack Engineer' }).first();
    await expect(card.getByText('Demo listing')).toBeVisible();
    await card.getByRole('button', { name: 'Save job' }).click();
    await expect(card.getByRole('button', { name: 'Remove from saved jobs' })).toBeVisible();
    await card.getByRole('link', { name: 'Senior Full Stack Engineer' }).click();
    await expect(page.getByText("This is an invented listing for testing.")).toBeVisible();
    await expect(page.getByText(/not a prediction/)).toBeVisible();
    await shot(page, 'job-detail');
    await page.getByRole('button', { name: 'Add to tracker' }).click();
    await expect(page).toHaveURL(/\/tracker$/);
    await page.goto('/matches');
    await expect(page.locator('app-match-panel').first()).toBeVisible();
    await shot(page, 'matches');
    expect(problems).toEqual([]);
  });

  test('tracker: drag between stages, keep it after reload, notes and table view', async ({ page }) => {
    const problems = watch(page);
    await login(page);
    await page.goto('/tracker');
    await page.getByRole('button', { name: 'Add application' }).click();
    await page.getByRole('dialog').getByLabel('Company').fill('Drag Corp');
    await page.getByRole('dialog').getByLabel('Job title').fill('Drag Engineer');
    await page.getByRole('dialog').getByRole('button', { name: 'Add application' }).click();
    const card = page.locator('.c', { hasText: 'Drag Corp' });
    await expect(card).toBeVisible();

    const from = (await card.boundingBox())!;
    const target = (await page.locator('#interview').boundingBox())!;
    await page.mouse.move(from.x + 40, from.y + 30);
    await page.mouse.down();
    await page.mouse.move(from.x + 60, from.y + 40, { steps: 5 });
    await page.mouse.move(target.x + target.width / 2, target.y + 40, { steps: 15 });
    const saved = page.waitForResponse((r) => /\/move$/.test(r.url()) && r.ok());
    await page.mouse.up();
    await saved;
    await expect(page.locator('#interview .c', { hasText: 'Drag Corp' })).toBeVisible();
    await shot(page, 'tracker');
    await page.reload();
    await expect(page.locator('#interview .c', { hasText: 'Drag Corp' })).toBeVisible();

    await page.getByRole('button', { name: 'Change stage for Drag Engineer' }).click();
    await page.getByRole('menuitem', { name: 'Move to Offer' }).click();
    await expect(page.locator('#offer .c', { hasText: 'Drag Corp' })).toBeVisible();

    await page.locator('#offer .c-title', { hasText: 'Drag Engineer' }).click();
    await page.getByRole('tab', { name: /Notes/ }).click();
    await page.getByLabel('Add a note').fill('Great call with the recruiter');
    await page.getByRole('button', { name: 'Add note' }).click();
    await expect(page.getByText('Great call with the recruiter')).toBeVisible();
    await page.getByRole('tab', { name: 'History' }).click();
    await expect(page.getByText('Interview to Offer')).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByRole('radio', { name: 'Table' }).or(page.getByRole('button', { name: 'Table' })).first().click();
    await expect(page.locator('table.tbl', { hasText: 'Drag Corp' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('prepare: cover letter template, LinkedIn check, mock interview', async ({ page }) => {
    const problems = watch(page);
    await login(page);
    await page.goto('/cover-letters');
    await page.getByLabel('Company').fill('Acme');
    await page.getByLabel('Job title').fill('Engineer');
    await page.getByLabel('Job description').fill(JOB_TEXT);
    await page.getByRole('button', { name: 'Create template draft' }).click();
    await expect(page).toHaveURL(/\/cover-letters\/\d+$/);
    await expect(page.getByText('This is a template, not AI-written text.')).toBeVisible();
    await page.getByLabel('Letter').fill('Dear team, I would like to apply. Thank you.');
    await page.getByRole('button', { name: 'Save as new version' }).click();
    await expect(page.getByText('Version 2')).toBeVisible();
    await shot(page, 'cover-letter');
    const [dl] = await Promise.all([page.waitForEvent('download'), (async () => {
      await page.getByRole('button', { name: 'Export' }).click();
      await page.getByRole('menuitem', { name: 'DOCX' }).click();
    })()]);
    expect(dl.suggestedFilename()).toMatch(/\.docx$/);

    await page.goto('/linkedin');
    await page.getByLabel('Headline').fill('Software engineer');
    await page.getByLabel('Target job title').fill('Platform Engineer');
    await page.getByLabel('Target job description').fill(JOB_TEXT);
    await page.getByRole('button', { name: 'Analyze profile' }).click();
    await expect(page.getByText('It is not a LinkedIn score')).toBeVisible();
    await shot(page, 'linkedin');

    await page.goto('/interviews');
    await page.locator('.q mat-checkbox input').first().check();
    await page.getByRole('button', { name: /Start with 1 question/ }).click();
    await expect(page).toHaveURL(/\/interviews\/session\/\d+$/);
    await page.getByLabel('Your answer').fill('When our release slipped, I needed to recover it. I reviewed the plan and as a result we shipped 2 weeks early.');
    await page.getByRole('button', { name: 'Save and check' }).click();
    await expect(page.getByRole('heading', { name: 'Structure check' })).toBeVisible();
    await shot(page, 'interview');
    await page.getByRole('button', { name: 'Finish session' }).click();
    await expect(page.locator('app-status', { hasText: 'Completed' })).toBeVisible();
    expect(problems).toEqual([]);
  });

  test('dashboard shows the journey; notifications and profile work', async ({ page }) => {
    const problems = watch(page);
    await login(page);
    await expect(page.locator('app-bar-chart').first()).toBeVisible();
    await expect(page.locator('section', { hasText: 'Recent scans' }).locator('app-score').first()).toBeVisible();
    await shot(page, 'dashboard');
    await page.getByRole('radio', { name: '7 days' }).or(page.getByRole('button', { name: '7 days' })).first().click();
    await expect(page.locator('app-stat-card').first()).toBeVisible();
    await page.getByRole('button', { name: 'Use dark theme' }).click();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await shot(page, 'dashboard-dark');
    await page.getByRole('button', { name: 'Use light theme' }).click();

    await page.goto('/notifications');
    await expect(page.locator('h1', { hasText: 'Notifications' })).toBeVisible();
    await page.getByRole('button', { name: 'Mark all as read' }).click();

    await page.goto('/profile');
    await page.getByLabel('Target job title').fill('Platform Engineer');
    await page.getByLabel('Add a skill').fill('Type');
    await page.getByRole('option', { name: 'TypeScript' }).click();
    await expect(page.locator('.chip', { hasText: 'TypeScript' })).toBeVisible();
    await page.getByRole('button', { name: 'Save profile' }).click();
    await expect(page.getByText('Profile saved.')).toBeVisible();
    await page.reload();
    await expect(page.getByLabel('Target job title')).toHaveValue('Platform Engineer');
    await shot(page, 'profile');
    expect(problems).toEqual([]);
  });

  test('job seekers cannot open the admin portal', async ({ page }) => {
    await login(page);
    await page.goto('/admin/users');
    await expect(page).toHaveURL(/\/dashboard/);
    await expect(page.getByRole('menuitem', { name: 'Admin portal' })).toHaveCount(0);
  });
});

test.describe('admin portal', () => {
  test.skip(!process.env.E2E_ADMIN_EMAIL, 'Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD');

  test('every admin page loads and key actions work', async ({ page }) => {
    const problems = watch(page);
    await login(page, process.env.E2E_ADMIN_EMAIL, process.env.E2E_ADMIN_PASSWORD);
    await page.getByRole('button', { name: 'Account menu' }).click();
    await page.getByRole('menuitem', { name: 'Admin portal' }).click();
    await expect(page.getByRole('heading', { name: 'Metrics' })).toBeVisible();
    await shot(page, 'admin-metrics');

    for (const [link, heading] of [['Users', 'Users'], ['Roles', 'Roles'], ['Plans and limits', 'Plans and limits'], ['Job sources', 'Job sources'], ['Job categories', 'Job categories'], ['Skills', 'Skills'], ['Features', 'Features'], ['AI provider', 'AI provider'], ['Scoring rules', 'Scoring rules'], ['System logs', 'System logs'], ['Settings', 'Settings']]) {
      await page.getByRole('link', { name: link, exact: true }).click();
      await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    }

    await page.goto('/admin/ai');
    await page.getByRole('button', { name: 'Test connection' }).click();
    await expect(page.getByText('No AI provider is configured on this server.')).toBeVisible();
    await shot(page, 'admin-ai');

    await page.goto('/admin/job-sources');
    await expect(page.getByText('ADZUNA_APP_ID')).toBeVisible();
    await shot(page, 'admin-sources');

    await page.goto('/admin/skills');
    const skill = `Test skill ${stamp}`;
    await page.getByLabel('Skill name').fill(skill);
    await page.getByRole('button', { name: 'Add skill' }).click();
    await page.getByLabel('Search skills').fill(skill);
    await page.getByLabel('Search skills').press('Enter');
    await expect(page.getByRole('cell', { name: skill, exact: true })).toBeVisible();
    await page.getByRole('button', { name: `Delete ${skill}` }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Delete' }).click();
    await expect(page.getByRole('cell', { name: skill, exact: true })).toHaveCount(0);

    await page.goto('/admin/settings');
    await page.getByLabel('Announcement').fill('Scheduled maintenance tonight');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByText('Scheduled maintenance tonight')).toBeVisible();
    await page.goto('/admin/settings');
    await page.getByLabel('Announcement').fill('');
    await page.getByRole('button', { name: 'Save settings' }).click();
    await expect(page.getByText('Settings saved.')).toBeVisible();

    await page.goto('/admin/features');
    await page.getByRole('switch', { name: 'Linkedin' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    await page.goto('/dashboard');
    await expect(page.getByRole('navigation').getByRole('link', { name: 'LinkedIn' })).toHaveCount(0);
    await page.goto('/admin/features');
    await page.getByRole('switch', { name: 'Linkedin' }).click();
    await expect(page.getByText('Saved.')).toBeVisible();
    expect(problems).toEqual([]);
  });
});

const VIEWPORTS = [{ name: 'phone', width: 375, height: 760 }, { name: 'tablet', width: 820, height: 1100 }, { name: 'desktop', width: 1440, height: 900 }];
const ROUTES = ['/dashboard', '/resumes', '/scanner', '/optimizer', '/builder', '/jobs', '/matches', '/tracker', '/cover-letters', '/linkedin', '/interviews', '/notifications', '/profile'];

test.describe('responsive layout', () => {
  for (const vp of VIEWPORTS) {
    test(`no sideways page scroll or console errors at ${vp.name}`, async ({ page }) => {
      await page.setViewportSize({ width: vp.width, height: vp.height });
      const problems = watch(page);
      await register(page, `rs${vp.name}${Date.now()}@example.com`);
      for (const route of ROUTES) {
        await page.goto(route);
        await page.waitForLoadState('networkidle');
        const over = await page.evaluate(() => {
          const main = document.querySelector('main');
          return { page: document.documentElement.scrollWidth - window.innerWidth, main: main ? main.scrollWidth - main.clientWidth : 0 };
        });
        if (over.main > 0 || over.page > 0) {
          const wide = await page.evaluate(() => [...document.querySelectorAll('main *')].filter((e) => e.getBoundingClientRect().right > window.innerWidth + 1 && !e.closest('.table-wrap, .board')).slice(0, 4).map((e) => `${e.tagName}.${e.className}`));
          console.log(route, vp.name, wide);
        }
        expect(over.page, `${route} page overflow`).toBeLessThanOrEqual(0);
        expect(over.main, `${route} main overflow`).toBeLessThanOrEqual(0);
        if (vp.name !== 'desktop') await shot(page, `${vp.name}${route.replace('/', '-')}`);
      }
      expect(problems).toEqual([]);
    });
  }

  test('phone: the drawer opens, navigates and closes', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 760 });
    await register(page, `drawer${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    const nav = page.getByRole('navigation', { name: 'Main' });
    await expect(nav).toBeVisible();
    await nav.getByRole('link', { name: 'Tracker' }).click();
    await expect(page).toHaveURL(/\/tracker/);
    await expect(nav).toBeHidden();
  });

  test('desktop: the sidebar collapses and remembers it', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await register(page, `rail${Date.now()}@example.com`);
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.locator('.side.rail')).toBeVisible();
    await page.reload();
    await expect(page.locator('.side.rail')).toBeVisible();
    await page.getByRole('button', { name: 'Toggle navigation' }).click();
    await expect(page.locator('.side.rail')).toHaveCount(0);
  });
});
