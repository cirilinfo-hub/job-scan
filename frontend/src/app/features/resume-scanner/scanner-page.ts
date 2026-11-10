import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { JobDetail, Page, ResumeDetail, ResumeSummary, ScanDetail, ScanListItem } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm-dialog';
import { EmptyState, ScoreIndicator } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

@Component({
  imports: [UI, EmptyState, ScoreIndicator],
  template: `<div class="page">
    <div class="page-head"><div><h1>Resume scanner</h1><p>Compare a resume with a job description to see what matches and what's missing.</p></div></div>
    <div class="grid split">
      <form class="card" [formGroup]="form" (ngSubmit)="run()">
        <h2 class="mb-3">New scan</h2>
        <div class="row items-start nowrap">
          <mat-form-field appearance="outline" class="grow"><mat-label>Resume</mat-label>
            <mat-select formControlName="resumeId">
              @for (r of resumes(); track r.id) { <mat-option [value]="r.id">{{ r.title }}@if (r.is_default) { (default) }</mat-option> }
            </mat-select>
            <mat-error>Choose a resume or upload one.</mat-error>
          </mat-form-field>
          <input #file type="file" hidden accept=".pdf,.docx" (change)="upload($event)" />
          <button class="mt-2 flex-none" mat-stroked-button type="button" [disabled]="uploading()" (click)="file.click()"><mat-icon>upload_file</mat-icon>{{ uploading() ? 'Uploading...' : 'Upload' }}</button>
        </div>
        <div class="form-grid">
          <mat-form-field appearance="outline"><mat-label>Company (optional)</mat-label><input matInput formControlName="company" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Job title</mat-label><input matInput formControlName="jobTitle" /><mat-error>Enter the job title.</mat-error></mat-form-field>
        </div>
        <mat-form-field appearance="outline"><mat-label>Job description</mat-label><textarea matInput rows="12" formControlName="jobDescription"></textarea><mat-error>Paste the full job description (at least 50 characters).</mat-error></mat-form-field>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Scanning...' : 'Scan resume' }}</button>
        <p class="muted xs mt-3">The result is an estimate from our published rules. It isn't the score of an employer's system and doesn't predict an interview or a job offer.</p>
      </form>
      <section class="card">
        <h2 class="mb-2">Scan history</h2>
        <div class="list">
          @for (s of history(); track s.id) {
            <div class="list-item">
              <app-score [value]="s.overall_score" [size]="40" label="Estimated match" />
              <a class="grow inherit min-w-0" [routerLink]="['/scanner', s.id]"><div class="li-title truncate">{{ s.job_title }}</div><div class="muted xs truncate">{{ s.company || 'No company' }} · {{ s.created_at | date: 'mediumDate' }}</div></a>
              <button mat-icon-button type="button" (click)="remove(s)" [attr.aria-label]="'Delete scan for ' + s.job_title" matTooltip="Delete"><mat-icon>delete_outline</mat-icon></button>
            </div>
          } @empty { <app-empty icon="history" title="No scans yet" text="Your results will appear here." /> }
        </div>
        @if (meta() && meta()!.totalPages > 1) {
          <div class="row between mt-2">
            <button mat-button type="button" [disabled]="page() <= 1" (click)="loadHistory(page() - 1)">Previous</button>
            <span class="muted xs">Page {{ page() }} of {{ meta()!.totalPages }}</span>
            <button mat-button type="button" [disabled]="page() >= meta()!.totalPages" (click)="loadHistory(page() + 1)">Next</button>
          </div>
        }
      </section>
    </div>
  </div>`,
})
export class ScannerPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private router = inject(Router); private confirm = inject(ConfirmService);
  resumeId = input<string>(); jobId = input<string>();
  resumes = signal<ResumeSummary[]>([]); history = signal<ScanListItem[]>([]); busy = signal(false); uploading = signal(false); page = signal(1); meta = signal<Page<unknown>['meta'] | null>(null);
  private linkedJob: number | null = null;
  form = inject(FormBuilder).group({
    resumeId: [null as number | null, Validators.required], company: [''], jobTitle: ['', [Validators.required, Validators.minLength(2)]],
    jobDescription: ['', [Validators.required, Validators.minLength(50)]],
  });

  ngOnInit() {
    this.api.get<ResumeSummary[]>('/resumes').subscribe((r) => {
      this.resumes.set(r);
      const wanted = Number(this.resumeId());
      this.form.patchValue({ resumeId: r.find((x) => x.id === wanted)?.id ?? r.find((x) => x.is_default)?.id ?? r[0]?.id ?? null });
    });
    if (this.jobId()) {
      this.api.get<JobDetail>(`/jobs/${this.jobId()}`).subscribe((j) => {
        this.linkedJob = j.id;
        this.form.patchValue({ company: j.company ?? '', jobTitle: j.title, jobDescription: j.description });
      });
    }
    this.loadHistory(1);
  }
  loadHistory(p: number) { this.api.page<ScanListItem>('/resume-scanner', { page: p, pageSize: 10 }).subscribe((r) => { this.history.set(r.items); this.meta.set(r.meta); this.page.set(p); }); }
  upload(e: Event) {
    const input = e.target as HTMLInputElement; const f = input.files?.[0]; input.value = '';
    if (!f) return;
    const fd = new FormData(); fd.append('file', f);
    this.uploading.set(true);
    this.api.post<ResumeDetail>('/resumes', fd).subscribe({
      next: (d) => { this.uploading.set(false); this.resumes.update((r) => [d.resume, ...r]); this.form.patchValue({ resumeId: d.resume.id }); this.toast.ok('Uploaded. You can review the extracted details under Resumes.'); },
      error: (err) => { this.uploading.set(false); this.toast.error(err); },
    });
  }
  run() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.api.post<ScanDetail>('/resume-scanner', { ...this.form.getRawValue(), company: this.form.value.company || null, jobId: this.linkedJob }).subscribe({
      next: (s) => void this.router.navigate(['/scanner', s.id]),
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
  remove(s: ScanListItem) {
    this.confirm.ask({ title: 'Delete this scan?', message: `The report for "${s.job_title}" will be removed.`, confirmLabel: 'Delete', danger: true }).subscribe((yes) => {
      if (yes) this.api.delete(`/resume-scanner/${s.id}`).subscribe({ next: () => this.loadHistory(this.page()), error: (e) => this.toast.error(e) });
    });
  }
}
