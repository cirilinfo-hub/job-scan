import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { Job } from '../../core/models';
import { ScoreIndicator } from './widgets';

export const salaryText = (j: Pick<Job, 'salary_min' | 'salary_max' | 'salary_currency'>) => {
  if (!j.salary_min && !j.salary_max) return '';
  const fmt = (n: number) => n.toLocaleString();
  return [j.salary_min, j.salary_max].filter((x): x is number => !!x).map(fmt).join(' - ') + (j.salary_currency ? ` ${j.salary_currency}` : '');
};
export const niceEnum = (s: string) => (s === 'unknown' ? '' : (s[0].toUpperCase() + s.slice(1)).replace(/_/g, '-'));

@Component({
  selector: 'app-job-card', imports: [DatePipe, RouterLink, MatButtonModule, MatIconModule, MatTooltipModule, ScoreIndicator], changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.j { display: flex; flex-direction: column; gap: 10px; height: 100%; }
    .top { display: flex; gap: 12px; align-items: flex-start; }
    .logo { flex: none; width: 44px; height: 44px; border-radius: 50%; background: var(--surface-2); display: grid; place-items: center; font-weight: 600; color: var(--text-2); overflow: hidden; }
    .logo img { width: 100%; height: 100%; object-fit: contain; }
    .title { font-weight: 600; font-size: 16px; letter-spacing: -0.01em; color: var(--text); display: block; } .title:hover { color: var(--accent); }
    .meta { display: flex; flex-wrap: wrap; gap: 4px 12px; color: var(--text-2); font-size: 13px; } .meta span { display: inline-flex; gap: 4px; align-items: center; } .meta .material-icons { font-size: 15px; width: 15px; height: 15px; }
    .sum { color: var(--text-2); font-size: 13px; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; }
    .foot { margin-top: auto; display: flex; align-items: center; justify-content: space-between; gap: 8px; }`,
  template: `@let j = job();
  <article class="card j">
    <div class="top">
      <div class="logo" aria-hidden="true">
        @if (j.company_logo && !logoFailed) { <img [src]="j.company_logo" alt="" loading="lazy" referrerpolicy="no-referrer" (error)="logoFailed = true" /> } @else { {{ initial() }} }
      </div>
      <div class="grow">
        <a class="title" [routerLink]="['/jobs', j.id]">{{ j.title }}</a>
        <div class="muted small">{{ j.company || 'Company not listed' }}</div>
      </div>
      @if (j.match_score !== null) { <div matTooltip="Compares your resume with this listing. It doesn't predict hiring."><app-score [value]="j.match_score" [size]="44" label="Match score" /></div> }
    </div>
    <div class="meta">
      @if (j.location) { <span><mat-icon aria-hidden="true">place</mat-icon>{{ j.location }}</span> }
      @if (mode() && mode() !== j.location) { <span><mat-icon aria-hidden="true">apartment</mat-icon>{{ mode() }}</span> }
      @if (type()) { <span><mat-icon aria-hidden="true">schedule</mat-icon>{{ type() }}</span> }
      @if (j.min_years !== null) { <span><mat-icon aria-hidden="true">work_history</mat-icon>{{ j.min_years }}+ yrs</span> }
      @if (salary()) { <span><mat-icon aria-hidden="true">payments</mat-icon>{{ salary() }}</span> }
    </div>
    @if (j.summary) { <p class="sum">{{ j.summary }}</p> }
    @if (j.skills.length) {
      <div class="chips">@for (s of j.skills.slice(0, 5); track s) { <span class="chip">{{ s }}</span> } @if (j.skills.length > 5) { <span class="chip">+{{ j.skills.length - 5 }}</span> }</div>
    }
    <div class="foot">
      <span class="muted xs">
        @if (j.is_demo) { <span class="badge warning">Demo listing</span> }
        @else { {{ j.source_name }}@if (j.posted_at) { · {{ j.posted_at | date: 'mediumDate' }} } }
      </span>
      <button mat-icon-button type="button" [attr.aria-label]="j.is_saved ? 'Remove from saved jobs' : 'Save job'" [attr.aria-pressed]="j.is_saved" [matTooltip]="j.is_saved ? 'Saved' : 'Save job'" (click)="toggleSave.emit(j)">
        <mat-icon>{{ j.is_saved ? 'bookmark' : 'bookmark_border' }}</mat-icon>
      </button>
    </div>
  </article>`,
})
export class JobCard {
  job = input.required<Job>();
  toggleSave = output<Job>();
  logoFailed = false;
  initial = computed(() => (this.job().company ?? '?').charAt(0).toUpperCase());
  mode = computed(() => niceEnum(this.job().work_mode));
  type = computed(() => niceEnum(this.job().employment_type));
  salary = computed(() => salaryText(this.job()));
}
