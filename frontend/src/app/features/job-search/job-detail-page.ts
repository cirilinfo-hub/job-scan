import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { JobDetail } from '../../core/models';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { niceEnum, salaryText } from '../../shared/components/job-card';
import { MatchPanel } from '../../shared/components/match-panel';
import { EmptyState, ErrorBlock, LoadingSkeleton } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

@Component({
  imports: [UI, MatchPanel, EmptyState, ErrorBlock, LoadingSkeleton],
  template: `<div class="page">
    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (!j() && !error()) { <app-skeleton [count]="2" [height]="300" [min]="400" /> }
    @if (j(); as j) {
      <div class="page-head">
        <div><a class="small" routerLink="/jobs">Job search</a><h1>{{ j.title }}</h1>
          <p>{{ j.company || 'Company not listed' }}@if (j.location) { · {{ j.location }} }@if (mode()) { · {{ mode() }} }@if (type()) { · {{ type() }} }</p></div>
        <div class="actions">
          <button mat-stroked-button type="button" (click)="toggleSave()"><mat-icon>{{ j.is_saved ? 'bookmark' : 'bookmark_border' }}</mat-icon>{{ j.is_saved ? 'Saved' : 'Save job' }}</button>
          <button mat-stroked-button type="button" (click)="track()"><mat-icon>view_kanban</mat-icon>Add to tracker</button>
          <a mat-stroked-button routerLink="/scanner" [queryParams]="{ jobId: j.id }"><mat-icon>auto_fix_high</mat-icon>Optimize resume</a>
          @if (j.apply_url) { <a mat-flat-button [href]="j.apply_url" target="_blank" rel="noopener noreferrer nofollow"><mat-icon>open_in_new</mat-icon>Apply externally</a> }
        </div>
      </div>
      @if (j.is_demo) { <div class="notice warning"><mat-icon aria-hidden="true">science</mat-icon><div>This is an invented listing for testing. It isn't a real job.</div></div> }
      <div class="grid split">
        <div class="stack">
          <section class="card"><h2 style="margin-bottom:8px">Job description</h2><pre class="small" style="line-height:1.6">{{ j.description }}</pre></section>
        </div>
        <div class="stack">
          <section class="card stack-sm small">
            <h2 style="margin-bottom:6px">Details</h2>
            @if (j.posted_at) { <div><span class="muted">Posted:</span> {{ j.posted_at | date: 'mediumDate' }}</div> }
            @if (salary()) { <div><span class="muted">Salary:</span> {{ salary() }}</div> }
            @if (j.min_years !== null) { <div><span class="muted">Experience:</span> {{ j.min_years }}+ years</div> }
            @if (level()) { <div><span class="muted">Level:</span> {{ level() }} <span class="muted xs">(inferred)</span></div> }
            @if (j.category) { <div><span class="muted">Category:</span> {{ j.category }}</div> }
            @if (!j.is_demo) { <div class="xs muted" style="margin-top:8px">{{ j.source_attribution }} @if (j.source_homepage) { <a [href]="j.source_homepage" target="_blank" rel="noopener noreferrer">Visit {{ j.source_name }}</a> }</div> }
          </section>
          @if (j.company_description || j.company_website) {
            <section class="card small stack-sm"><h2>About {{ j.company }}</h2><div>{{ j.company_description }}</div>@if (j.company_website) { <a [href]="j.company_website" target="_blank" rel="noopener noreferrer">Company website</a> }</section>
          }
          <section class="card stack">
            <h2>Skills listed</h2>
            @if (required().length) { <div><h3 class="muted small" style="margin-bottom:4px">Required</h3><div class="chips">@for (s of required(); track s.id) { <span class="chip">{{ s.name }}</span> }</div></div> }
            @if (preferred().length) { <div><h3 class="muted small" style="margin-bottom:4px">Preferred</h3><div class="chips">@for (s of preferred(); track s.id) { <span class="chip">{{ s.name }}</span> }</div></div> }
            @if (!j.skills.length) { <p class="muted small">No catalogued skills recognised in this listing.</p> }
          </section>
          <section class="card">
            <h2 style="margin-bottom:8px">Match analysis</h2>
            @if (j.breakdown) {
              <app-match-panel [m]="j.breakdown" />
              @if (ai.available()) {
                <hr class="divider" style="margin:12px 0" />
                <button mat-stroked-button type="button" [disabled]="aiBusy()" (click)="explain()"><mat-icon>auto_awesome</mat-icon>{{ aiBusy() ? 'Thinking...' : 'Explain with AI' }}</button>
                @if (fit(); as f) { <div class="small stack-sm" style="margin-top:8px"><p>{{ f.relevance }}</p>@for (g of f.gaps; track g) { <div class="muted">Gap: {{ g }}</div> }@for (n of f.nextSteps; track n) { <div>Next: {{ n }}</div> }<p class="muted xs">AI-generated. Check it against what you know about your experience.</p></div> }
              }
            } @else { <app-empty icon="stars" title="No match yet" text="Add a resume to compare it with this job." actionLabel="Add a resume" actionLink="/resumes" /> }
          </section>
        </div>
      </div>
    }
  </div>`,
})
export class JobDetailPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private router = inject(Router);
  ai = inject(AiStatusService);
  id = input.required<string>();
  j = signal<JobDetail | null>(null); error = signal(''); aiBusy = signal(false); fit = signal<{ relevance: string; gaps: string[]; nextSteps: string[] } | null>(null);
  required = computed(() => this.j()?.skills.filter((s) => s.is_required) ?? []);
  preferred = computed(() => this.j()?.skills.filter((s) => !s.is_required) ?? []);
  salary = computed(() => (this.j() ? salaryText(this.j()!) : ''));
  mode = computed(() => niceEnum(this.j()?.work_mode ?? 'unknown')); type = computed(() => niceEnum(this.j()?.employment_type ?? 'unknown')); level = computed(() => niceEnum(this.j()?.experience_level ?? 'unknown'));
  ngOnInit() { this.load(); }
  load() { this.error.set(''); this.api.get<JobDetail>(`/jobs/${this.id()}`).subscribe({ next: (j) => this.j.set(j), error: (e) => this.error.set(errorMessage(e)) }); }
  toggleSave() {
    const j = this.j()!;
    (j.is_saved ? this.api.delete(`/jobs/${j.id}/save`) : this.api.post(`/jobs/${j.id}/save`)).subscribe({ next: () => this.j.set({ ...j, is_saved: !j.is_saved }), error: (e) => this.toast.error(e) });
  }
  track() { this.api.post('/job-tracker/from-job', { jobId: this.j()!.id }).subscribe({ next: () => { this.toast.ok('Added to your tracker.'); void this.router.navigateByUrl('/tracker'); }, error: (e) => this.toast.error(e) }); }
  explain() {
    this.aiBusy.set(true);
    this.api.post<{ relevance: string; gaps: string[]; nextSteps: string[] }>(`/job-matching/${this.j()!.id}/ai-explain`).subscribe({ next: (f) => { this.fit.set(f); this.aiBusy.set(false); }, error: (e) => { this.aiBusy.set(false); this.toast.error(e); } });
  }
}
