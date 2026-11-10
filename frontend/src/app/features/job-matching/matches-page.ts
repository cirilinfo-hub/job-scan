import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { HttpParams } from '@angular/common/http';
import { Job, JobMatch, PageMeta } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { JobCard } from '../../shared/components/job-card';
import { MatchPanel } from '../../shared/components/match-panel';
import { EmptyState, ErrorBlock, LoadingSkeleton } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';
import { HttpClient } from '@angular/common/http';
import { environment } from '../../../environments/environment';

interface MatchPayload { items: JobMatch[]; hasProfile: boolean; disclaimer: string; weights: Record<string, number> }

@Component({
  imports: [UI, JobCard, MatchPanel, EmptyState, ErrorBlock, LoadingSkeleton],
  styles: `.m { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: 0; align-items: stretch; } @media (max-width: 900px) { .m { grid-template-columns: minmax(0, 1fr); } }`,
  template: `<div class="page">
    <div class="page-head">
      <div><h1>Best matches</h1><p>Listings ranked by how closely they compare with your default resume and preferences.</p></div>
      <div class="actions">
        <mat-form-field appearance="outline" subscriptSizing="dynamic" style="width:170px"><mat-label>Minimum score</mat-label>
          <mat-select [formControl]="min"><mat-option [value]="0">Any</mat-option><mat-option [value]="50">50+</mat-option><mat-option [value]="65">65+</mat-option><mat-option [value]="80">80+</mat-option></mat-select>
        </mat-form-field>
        <button mat-stroked-button type="button" (click)="refresh()"><mat-icon>refresh</mat-icon>Recalculate</button>
      </div>
    </div>
    @if (disclaimer()) { <div class="notice info"><mat-icon aria-hidden="true">info</mat-icon><div>{{ disclaimer() }} Weights: {{ weightText() }}.</div></div> }
    @if (error()) { <app-error [message]="error()" (retry)="load(page())" /> }
    @if (loading()) { <app-skeleton [count]="3" [height]="240" [min]="500" /> }
    @else if (!hasProfile()) { <div class="card"><app-empty icon="description" title="Add a resume to see matches" text="We compare your default resume and profile with the job listings we have." actionLabel="Add a resume" actionLink="/resumes" /></div> }
    @else {
      @for (j of items(); track j.id) {
        <div class="m card" style="padding:0; overflow:hidden">
          <app-job-card [job]="j" (toggleSave)="toggleSave($event)" />
          <div style="padding:16px">@if (j.breakdown) { <app-match-panel [m]="j.breakdown" /> }</div>
        </div>
      } @empty { <div class="card"><app-empty icon="search_off" title="No matches at this score" text="Lower the minimum score, or ask an administrator to sync more job sources." /></div> }
      @if (meta() && meta()!.totalPages > 1) {
        <nav class="row between" aria-label="Pagination">
          <button mat-stroked-button type="button" [disabled]="page() <= 1" (click)="load(page() - 1)">Previous</button>
          <span class="muted small">Page {{ page() }} of {{ meta()!.totalPages }}</span>
          <button mat-stroked-button type="button" [disabled]="page() >= meta()!.totalPages" (click)="load(page() + 1)">Next</button>
        </nav>
      }
    }
  </div>`,
})
export class MatchesPage implements OnInit {
  private http = inject(HttpClient); private api = inject(ApiService); private toast = inject(ToastService);
  min = new FormControl(0, { nonNullable: true });
  items = signal<JobMatch[]>([]); meta = signal<PageMeta | null>(null); page = signal(1); loading = signal(true); hasProfile = signal(true); error = signal(''); disclaimer = signal(''); weights = signal<Record<string, number>>({});
  weightText = computed(() => Object.entries(this.weights()).map(([k, v]) => `${k} ${v}`).join(', '));
  ngOnInit() { this.min.valueChanges.subscribe(() => this.load(1)); this.load(1); }
  load(p: number) {
    this.loading.set(true); this.error.set('');
    const params = new HttpParams().set('minScore', this.min.value).set('page', p).set('pageSize', 8);
    this.http.get<{ data: MatchPayload; meta: PageMeta }>(`${environment.apiUrl}/job-matching`, { params }).subscribe({
      next: (r) => { this.items.set(r.data.items); this.hasProfile.set(r.data.hasProfile); this.disclaimer.set(r.data.disclaimer); this.weights.set(r.data.weights); this.meta.set(r.meta); this.page.set(p); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
  refresh() { this.api.post('/job-matching/refresh').subscribe({ next: () => { this.toast.ok('Matches recalculated.'); this.load(1); }, error: (e) => this.toast.error(e) }); }
  toggleSave(j: Job) {
    (j.is_saved ? this.api.delete(`/jobs/${j.id}/save`) : this.api.post(`/jobs/${j.id}/save`)).subscribe({
      next: () => this.items.update((l) => l.map((x) => (x.id === j.id ? { ...x, is_saved: !x.is_saved } : x))), error: (e) => this.toast.error(e),
    });
  }
}
