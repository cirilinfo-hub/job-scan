import { Component, OnInit, inject, input, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { CoverLetter, CoverLetterItem, JobDetail, ResumeSummary } from '../../core/models';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm-dialog';
import { AiNotice, EmptyState, StatusBadge } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

@Component({
  imports: [UI, AiNotice, EmptyState, StatusBadge],
  template: `<div class="page">
    <div class="page-head"><div><h1>Cover letters</h1><p>Start from your resume, then edit until it sounds like you.</p></div></div>
    @if (ai.available() === false) { <app-ai-notice text="You can still create a fill-in draft built from your resume, clearly marked as a template." /> }
    <div class="grid split">
      <form class="card" [formGroup]="form" (ngSubmit)="create(ai.available() ? 'ai' : 'template')">
        <h2 class="mb-3">New cover letter</h2>
        <div class="form-grid">
          <mat-form-field appearance="outline"><mat-label>Resume</mat-label><mat-select formControlName="resumeVersionId">@for (r of resumes(); track r.id) { <mat-option [value]="r.current_version_id">{{ r.title }}</mat-option> }</mat-select><mat-error>Choose a resume.</mat-error></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Writing style</mat-label><mat-select formControlName="tone"><mat-option value="professional">Professional</mat-option><mat-option value="confident">Confident</mat-option><mat-option value="warm">Warm</mat-option><mat-option value="concise">Concise</mat-option></mat-select></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Company</mat-label><input matInput formControlName="company" /><mat-error>Enter the company.</mat-error></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Job title</mat-label><input matInput formControlName="jobTitle" /><mat-error>Enter the job title.</mat-error></mat-form-field>
          <mat-form-field appearance="outline" class="span-all"><mat-label>Job description</mat-label><textarea matInput rows="8" formControlName="jobDescription"></textarea><mat-error>Paste the job description (at least 50 characters).</mat-error></mat-form-field>
        </div>
        <div class="row">
          @if (ai.available()) { <button mat-flat-button type="submit" [disabled]="busy()"><mat-icon>auto_awesome</mat-icon>{{ busy() ? 'Generating...' : 'Generate with AI' }}</button>
            <button mat-stroked-button type="button" [disabled]="busy()" (click)="create('template')">Use a template instead</button> }
          @else { <button mat-flat-button type="submit" [disabled]="busy()">Create template draft</button> }
        </div>
      </form>
      <section class="card">
        <h2 class="mb-2">Your letters</h2>
        <div class="list">
          @for (l of items(); track l.id) {
            <div class="list-item"><a class="grow inherit min-w-0" [routerLink]="['/cover-letters', l.id]"><div class="li-title truncate">{{ l.company }}</div><div class="muted xs truncate">{{ l.job_title }} · {{ l.updated_at | date: 'mediumDate' }}</div></a>
              <app-status [status]="l.latest_source" /><button mat-icon-button type="button" [attr.aria-label]="'Delete letter for ' + l.company" (click)="remove(l)"><mat-icon>delete_outline</mat-icon></button></div>
          } @empty { <app-empty icon="mail" title="No letters yet" /> }
        </div>
      </section>
    </div>
  </div>`,
})
export class LettersPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private router = inject(Router); private confirm = inject(ConfirmService);
  ai = inject(AiStatusService);
  jobId = input<string>();
  items = signal<CoverLetterItem[]>([]); resumes = signal<ResumeSummary[]>([]); busy = signal(false);
  form = inject(FormBuilder).group({
    resumeVersionId: [null as number | null, Validators.required], tone: ['professional'], company: ['', Validators.required], jobTitle: ['', Validators.required],
    jobDescription: ['', [Validators.required, Validators.minLength(50)]],
  });
  ngOnInit() {
    this.load();
    this.api.get<ResumeSummary[]>('/resumes').subscribe((r) => { this.resumes.set(r); this.form.patchValue({ resumeVersionId: (r.find((x) => x.is_default) ?? r[0])?.current_version_id ?? null }); });
    if (this.jobId()) this.api.get<JobDetail>(`/jobs/${this.jobId()}`).subscribe((j) => this.form.patchValue({ company: j.company ?? '', jobTitle: j.title, jobDescription: j.description }));
  }
  load() { this.api.get<CoverLetterItem[]>('/cover-letters').subscribe((l) => this.items.set(l)); }
  create(mode: 'ai' | 'template') {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true);
    this.api.post<CoverLetter>('/cover-letters', { ...this.form.getRawValue(), mode }).subscribe({
      next: (l) => void this.router.navigate(['/cover-letters', l.id]),
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
  remove(l: CoverLetterItem) {
    this.confirm.ask({ title: 'Delete this letter?', message: `The letter for ${l.company} and its versions will be removed.`, confirmLabel: 'Delete', danger: true }).subscribe((yes) => {
      if (yes) this.api.delete(`/cover-letters/${l.id}`).subscribe({ next: () => this.load(), error: (e) => this.toast.error(e) });
    });
  }
}
