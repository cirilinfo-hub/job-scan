import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { Router } from '@angular/router';
import { MatCheckboxChange } from '@angular/material/checkbox';
import { Job, PageMeta } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { JobCard } from '../../shared/components/job-card';
import { EmptyState, ErrorBlock, LoadingSkeleton } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

const GROUPS = [
  { key: 'workMode', label: 'Work mode', options: [['remote', 'Remote'], ['hybrid', 'Hybrid'], ['onsite', 'On-site']] },
  { key: 'employmentType', label: 'Employment type', options: [['full_time', 'Full-time'], ['contract', 'Contract'], ['part_time', 'Part-time'], ['internship', 'Internship']] },
  { key: 'level', label: 'Experience level', options: [['intern', 'Intern'], ['entry', 'Entry'], ['mid', 'Mid'], ['senior', 'Senior'], ['lead', 'Lead'], ['executive', 'Executive']] },
] as const;

type Key = (typeof GROUPS)[number]['key'];

@Component({
  imports: [UI, JobCard, EmptyState, ErrorBlock, LoadingSkeleton],
  styles: `.layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 16px; align-items: start; } @media (max-width: 960px) { .layout { grid-template-columns: minmax(0, 1fr); } }
    .fgroup { display: flex; flex-direction: column; } .fgroup h3 { margin: 8px 0 2px; }`,
  template: `<div class="page">
    <div class="page-head"><div><h1>Job search</h1><p>Listings come from the sources shown on each card, and may be delayed by the source.</p></div>
      <button mat-stroked-button type="button" (click)="savedOnly.set(!savedOnly()); search(1)" [attr.aria-pressed]="savedOnly()"><mat-icon>{{ savedOnly() ? 'bookmark' : 'bookmark_border' }}</mat-icon>{{ savedOnly() ? 'Showing saved' : 'Saved jobs' }}</button>
    </div>
    <form class="card form-grid" [formGroup]="form" (ngSubmit)="search(1)" role="search">
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Keywords</mat-label><input matInput formControlName="q" /></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Job title</mat-label><input matInput formControlName="title" /></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Company</mat-label><input matInput formControlName="company" /></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Location</mat-label><input matInput formControlName="location" /></mat-form-field>
      <div class="row items-center"><button mat-flat-button type="submit">Search</button><button mat-button type="button" (click)="clear()">Clear</button></div>
    </form>
    <div class="layout">
      <aside class="card" aria-label="Filters">
        <div class="row between"><h2>Filters</h2></div>
        @for (g of groups; track g.key) {
          <div class="fgroup"><h3>{{ g.label }}</h3>
            @for (o of g.options; track o[0]) { <mat-checkbox [checked]="selected()[g.key].includes(o[0])" (change)="toggle(g.key, o[0], $event)">{{ o[1] }}</mat-checkbox> }
          </div>
        }
        <form [formGroup]="extra" (ngSubmit)="search(1)" class="stack-sm mt-3">
          <mat-form-field appearance="outline"><mat-label>Posted within</mat-label><mat-select formControlName="postedWithinDays" (selectionChange)="search(1)"><mat-option [value]="null">Any time</mat-option><mat-option [value]="1">24 hours</mat-option><mat-option [value]="7">7 days</mat-option><mat-option [value]="30">30 days</mat-option></mat-select></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Max years required</mat-label><input matInput type="number" min="0" formControlName="maxYears" /></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic" class="mb-4"><mat-label>Minimum salary</mat-label><input matInput type="number" min="0" formControlName="minSalary" /><mat-hint>Hides jobs with no listed salary</mat-hint></mat-form-field>
          <mat-form-field class="mt-2" appearance="outline"><mat-label>Minimum match score</mat-label><input matInput type="number" min="0" max="100" formControlName="minScore" /></mat-form-field>
          <button mat-stroked-button type="submit">Apply filters</button>
        </form>
      </aside>
      <div class="stack">
        <div class="row between">
          <span class="muted small" role="status">{{ meta()?.total ?? 0 | number }} job{{ meta()?.total === 1 ? '' : 's' }}</span>
          <mat-form-field class="w-190" appearance="outline" subscriptSizing="dynamic"><mat-label>Sort by</mat-label><mat-select [value]="sort()" (selectionChange)="sort.set($event.value); search(1)"><mat-option value="recent">Most recent</mat-option><mat-option value="match">Best match</mat-option><mat-option value="salary">Highest salary</mat-option></mat-select></mat-form-field>
        </div>
        @if (error()) { <app-error [message]="error()" (retry)="search(page())" /> }
        @if (loading()) { <app-skeleton [count]="6" [height]="200" [min]="300" /> }
        @else {
          <div class="grid g3">
            @for (j of jobs(); track j.id) { <app-job-card [job]="j" (toggleSave)="toggleSave($event)" /> }
            @empty {
              <div class="card span-all">
                @if (filtered()) { <app-empty icon="search_off" title="No jobs match these filters" text="Try removing a filter or using broader terms." /> }
                @else { <app-empty icon="cloud_off" title="No job listings yet" text="An administrator needs to enable and sync a job source in the admin portal." /> }
              </div>
            }
          </div>
          @if (meta() && meta()!.totalPages > 1) {
            <nav class="row between" aria-label="Pagination">
              <button mat-stroked-button type="button" [disabled]="page() <= 1" (click)="search(page() - 1)">Previous</button>
              <span class="muted small">Page {{ page() }} of {{ meta()!.totalPages }}</span>
              <button mat-stroked-button type="button" [disabled]="page() >= meta()!.totalPages" (click)="search(page() + 1)">Next</button>
            </nav>
          }
        }
      </div>
    </div>
  </div>`,
})
export class JobSearchPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private fb = inject(FormBuilder); private router = inject(Router);
  q = input<string>();
  groups = GROUPS;
  form = this.fb.nonNullable.group({ q: [''], title: [''], company: [''], location: [''] });
  extra = this.fb.group({ postedWithinDays: [null as number | null], maxYears: [null as number | null], minSalary: [null as number | null], minScore: [null as number | null] });
  selected = signal<Record<Key, string[]>>({ workMode: [], employmentType: [], level: [] });
  sort = signal('recent'); savedOnly = signal(false);
  jobs = signal<Job[]>([]); meta = signal<PageMeta | null>(null); page = signal(1); loading = signal(true); error = signal('');
  filtered = computed(() => this.savedOnly() || Object.values(this.selected()).some((x) => x.length) || this.lastHadText());
  private lastHadText = signal(false);

  ngOnInit() { if (this.q()) this.form.patchValue({ q: this.q()! }); this.search(1); }
  toggle(key: Key, value: string, e: MatCheckboxChange) {
    this.selected.update((s) => ({ ...s, [key]: e.checked ? [...s[key], value] : s[key].filter((x) => x !== value) }));
    this.search(1);
  }
  clear() { this.form.reset(); this.extra.reset(); this.selected.set({ workMode: [], employmentType: [], level: [] }); this.savedOnly.set(false); this.search(1); }
  search(p: number) {
    this.loading.set(true); this.error.set('');
    const f = this.form.getRawValue(); const s = this.selected(); const x = this.extra.getRawValue();
    this.lastHadText.set(!!(f.q || f.title || f.company || f.location || x.postedWithinDays || x.maxYears !== null || x.minSalary || x.minScore));
    this.api.page<Job>('/jobs', {
      ...f, workMode: s.workMode.join(','), employmentType: s.employmentType.join(','), level: s.level.join(','), ...x,
      saved: this.savedOnly() ? 'true' : null, sort: this.sort(), page: p, pageSize: 12,
    }).subscribe({
      next: (r) => { this.jobs.set(r.items); this.meta.set(r.meta); this.page.set(p); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
  toggleSave(j: Job) {
    const req = j.is_saved ? this.api.delete(`/jobs/${j.id}/save`) : this.api.post(`/jobs/${j.id}/save`);
    req.subscribe({
      next: () => this.jobs.update((l) => this.savedOnly() && j.is_saved ? l.filter((x) => x.id !== j.id) : l.map((x) => (x.id === j.id ? { ...x, is_saved: !x.is_saved } : x))),
      error: (e) => this.toast.error(e),
    });
  }
}
