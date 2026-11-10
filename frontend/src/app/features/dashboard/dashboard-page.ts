import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { Dashboard, Job } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { AuthService } from '../../core/auth/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { BarChart } from '../../shared/components/chart-canvas';
import { JobCard } from '../../shared/components/job-card';
import { EmptyState, ErrorBlock, LoadingSkeleton, ProgressBar, ScoreIndicator, StatCard, StatusBadge, stageLabel } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

const STAGES = ['saved', 'applied', 'assessment', 'interview', 'offer', 'rejected'];

@Component({
  imports: [UI, MatButtonToggleModule, BarChart, JobCard, EmptyState, ErrorBlock, LoadingSkeleton, ProgressBar, ScoreIndicator, StatCard, StatusBadge],
  styles: `.tl { display: flex; gap: var(--space-3); padding: var(--space-2) 0; border-radius: var(--radius-sm); } .tl:hover { text-decoration: none; } .tl:hover .truncate { color: var(--accent); }
    .tl-icon { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--surface-2); flex: none; } .tl-icon .material-icons { font-size: 18px; width: 18px; height: 18px; color: var(--text); }
    .range { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; } .range form { display: flex; flex-wrap: wrap; gap: var(--space-2); align-items: center; }
    .hello { font-size: clamp(30px, 4vw, 44px); line-height: 1.05; letter-spacing: -0.04em; }
    .step-icon { color: var(--text-2); }`,
  template: `<div class="page">
    <div class="page-head">
      <div><h1 class="hello">Hello, {{ firstName() }}</h1><p>Here's where your job search stands.</p></div>
      <div class="range">
        <mat-button-toggle-group [value]="days()" (change)="setDays($event.value)" aria-label="Date range" hideSingleSelectionIndicator>
          <mat-button-toggle [value]="7">7 days</mat-button-toggle><mat-button-toggle [value]="30">30 days</mat-button-toggle><mat-button-toggle [value]="90">90 days</mat-button-toggle>
        </mat-button-toggle-group>
        <form [formGroup]="custom" (ngSubmit)="applyCustom()">
          <input class="input" type="date" formControlName="from" aria-label="From date" /><input class="input" type="date" formControlName="to" aria-label="To date" />
          <button mat-stroked-button type="submit">Apply</button>
        </form>
      </div>
    </div>

    <nav class="tiles" aria-label="Quick actions">
      <a class="tile tile-blue" routerLink="/scanner">
        <span class="tile-icon"><mat-icon aria-hidden="true">document_scanner</mat-icon></span>
        <span class="stack-sm"><span class="tile-label">Scan resume</span><span class="tile-text">Compare a resume with a job description and see what's missing.</span></span>
        <span class="tile-go" aria-hidden="true"><mat-icon>arrow_forward</mat-icon></span>
      </a>
      @if (config.enabled('job_search')) {
        <a class="tile tile-navy" routerLink="/jobs">
          <span class="tile-icon"><mat-icon aria-hidden="true">search</mat-icon></span><span class="tile-label">Find jobs</span>
          <span class="tile-go" aria-hidden="true"><mat-icon>arrow_forward</mat-icon></span>
        </a>
      } @else {
        <a class="tile tile-navy" routerLink="/resumes">
          <span class="tile-icon"><mat-icon aria-hidden="true">upload_file</mat-icon></span><span class="tile-label">Upload resume</span>
          <span class="tile-go" aria-hidden="true"><mat-icon>arrow_forward</mat-icon></span>
        </a>
      }
      <a class="tile tile-mint" routerLink="/tracker">
        <span class="tile-icon"><mat-icon aria-hidden="true">add</mat-icon></span><span class="tile-label">Track application</span>
        <span class="tile-go" aria-hidden="true"><mat-icon>arrow_forward</mat-icon></span>
      </a>
    </nav>

    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (loading() && !d()) { <app-skeleton [count]="8" [height]="100" [min]="170" /> }

    @if (d(); as d) {
      <div class="grid g-stats">
        <app-stat-card label="Jobs discovered" [value]="d.stats.jobsDiscovered" icon="travel_explore" [hint]="d.stats.jobsInRange + ' added in this period'" link="/jobs" />
        <app-stat-card label="Jobs saved" [value]="d.stats.jobsSaved" icon="bookmark" hint="In this period" link="/jobs" />
        <app-stat-card label="Applications" [value]="d.stats.applicationsSubmitted" icon="send" hint="Submitted in this period" link="/tracker" />
        <app-stat-card label="Interviews" [value]="d.stats.interviewsScheduled" icon="event" hint="Scheduled in this period" link="/tracker" />
        <app-stat-card label="Offers" [value]="d.stats.offersReceived" icon="handshake" hint="In this period" link="/tracker" />
        <app-stat-card label="Latest match" [value]="d.stats.latestAtsScore === null ? null : d.stats.latestAtsScore + '%'" icon="speed" [hint]="d.latestScan ? d.latestScan.job_title : 'Run a scan to see this'" link="/scanner" />
      </div>

      <div class="grid split">
        <section class="card">
          <div class="card-head"><h2>Applications per week</h2></div>
          @if (hasActivity()) {
            <app-bar-chart [labels]="weekLabels()" [values]="weekValues()" label="Applications submitted per week" seriesName="Applications" />
          } @else { <app-empty icon="bar_chart" title="No applications in this period" text="Move a tracker card to Applied and it will show here." actionLabel="Open tracker" actionLink="/tracker" /> }
        </section>
        <section class="card stack">
          <div class="row between"><h2>Profile completion</h2><span class="strong">{{ d.completion.percent }}%</span></div>
          <app-progress [value]="d.completion.percent" label="Profile completion" />
          <div class="list">
            @for (i of nextSteps(); track i.key) { <a class="list-item small" [routerLink]="i.link"><mat-icon class="icon-18 muted" aria-hidden="true">radio_button_unchecked</mat-icon>{{ i.label }}</a> }
            @empty { <p class="muted small">Your profile is complete.</p> }
          </div>
        </section>
      </div>

      <div class="grid g2">
        <section class="card">
          <div class="card-head"><h2>Pipeline</h2><a class="small" routerLink="/tracker">Open tracker</a></div>
          @if (pipelineTotal()) {
            <app-bar-chart [labels]="stageNames()" [values]="stageValues()" label="Applications by stage" seriesName="Applications" [horizontal]="true" [height]="200" />
          } @else { <app-empty icon="view_kanban" title="Nothing tracked yet" actionLabel="Add an application" actionLink="/tracker" /> }
        </section>
        <section class="card">
          <div class="card-head"><h2>Recent scans</h2><a class="small" routerLink="/scanner">New scan</a></div>
          <div class="list">
            @for (s of d.recentScans; track s.id) {
              <a class="list-item" [routerLink]="['/scanner', s.id]"><app-score [value]="s.overall_score" [size]="40" label="Estimated match" />
                <div class="grow"><div class="li-title truncate">{{ s.job_title }}</div><div class="muted xs truncate">{{ s.company || 'No company' }} · {{ s.created_at | date: 'mediumDate' }}</div></div></a>
            } @empty { <app-empty icon="document_scanner" title="No scans yet" text="Compare a resume with a job description to see what's missing." actionLabel="Scan a resume" actionLink="/scanner" /> }
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Upcoming interviews</h2></div>
          <div class="list">
            @for (i of d.upcomingInterviews; track i.id) {
              <a class="list-item" routerLink="/tracker"><div class="grow"><div class="li-title truncate">{{ i.company }}: {{ i.job_title }}</div><div class="muted xs">{{ i.scheduled_at | date: 'EEE, MMM d, h:mm a' }} · {{ i.kind }}</div></div></a>
            } @empty { <p class="muted small">No interviews scheduled.</p> }
          </div>
        </section>
        <section class="card">
          <div class="card-head"><h2>Follow-up reminders</h2></div>
          <div class="list">
            @for (f of d.followUps; track f.id) {
              <a class="list-item" routerLink="/tracker"><div class="grow"><div class="li-title truncate">{{ f.company }}: {{ f.job_title }}</div><div class="muted xs">Follow up by {{ f.follow_up_at | date: 'mediumDate' }}</div></div><app-status [status]="f.status" /></a>
            } @empty { <p class="muted small">No follow-ups due in the next 7 days.</p> }
          </div>
        </section>
      </div>

      <section class="stack">
        <div class="row between"><h2>Recommended jobs</h2><a class="small" routerLink="/matches">See all matches</a></div>
        <div class="grid g3">
          @for (j of d.recommendedJobs; track j.id) { <app-job-card [job]="j" (toggleSave)="toggle($event)" /> }
          @empty {
            <div class="card span-all"><app-empty icon="stars" title="No recommendations yet" text="Add a resume and make sure job listings have been synced. Recommendations compare your resume with the listings we have." actionLabel="Add a resume" actionLink="/resumes" /></div>
          }
        </div>
      </section>

      <section class="card">
        <div class="card-head"><h2>Recent activity</h2></div>
        @for (t of d.timeline; track $index) {
          <a class="tl inherit" [routerLink]="t.link"><span class="tile-icon tl-icon"><mat-icon aria-hidden="true">{{ icon(t.kind) }}</mat-icon></span>
            <div class="grow"><div class="truncate">{{ t.title }}</div><div class="muted xs">{{ t.detail }} · {{ t.at | date: 'MMM d, h:mm a' }}</div></div></a>
        } @empty { <p class="muted small">Your activity will appear here.</p> }
      </section>
    }
  </div>`,
})
export class DashboardPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  auth = inject(AuthService); config = inject(ConfigService);
  d = signal<Dashboard | null>(null); loading = signal(true); error = signal(''); days = signal<number | null>(30);
  custom = new FormGroup({ from: new FormControl('', { nonNullable: true }), to: new FormControl('', { nonNullable: true }) });

  firstName = computed(() => this.auth.user()?.fullName.split(' ')[0] ?? '');
  hasActivity = computed(() => !!this.d()?.weeklyActivity.some((w) => w.count > 0));
  weekLabels = computed(() => this.d()?.weeklyActivity.map((w) => new Date(`${w.week}T00:00:00Z`).toLocaleDateString(undefined, { month: 'short', day: 'numeric', timeZone: 'UTC' })) ?? []);
  weekValues = computed(() => this.d()?.weeklyActivity.map((w) => w.count) ?? []);
  stageNames = computed(() => STAGES.map(stageLabel));
  stageValues = computed(() => STAGES.map((s) => this.d()?.pipeline.find((p) => p.status === s)?.c ?? 0));
  pipelineTotal = computed(() => this.stageValues().reduce((a, b) => a + b, 0));
  nextSteps = computed(() => this.d()?.completion.items.filter((i) => !i.done).slice(0, 4) ?? []);

  private query: Record<string, string | number> = { days: 30 };
  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    this.api.get<Dashboard>('/dashboard', this.query).subscribe({
      next: (d) => { this.d.set(d); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
  setDays(n: number) { this.days.set(n); this.query = { days: n }; this.custom.reset(); this.load(); }
  applyCustom() {
    const { from, to } = this.custom.getRawValue();
    if (!from || !to) { this.toast.error('Choose both a start and an end date.'); return; }
    this.days.set(null); this.query = { from, to }; this.load();
  }
  icon(kind: string) { return ({ scan: 'document_scanner', application: 'view_kanban', resume: 'description', letter: 'mail' } as Record<string, string>)[kind] ?? 'circle'; }
  toggle(j: Job) {
    const req = j.is_saved ? this.api.delete(`/jobs/${j.id}/save`) : this.api.post(`/jobs/${j.id}/save`);
    req.subscribe({ next: () => this.load(), error: (e) => this.toast.error(e) });
  }
}
