import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { MAT_DIALOG_DATA, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatTabsModule } from '@angular/material/tabs';
import { ApplicationDetail, ResumeDetail, ResumeSummary, VersionListItem } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm-dialog';
import { stageLabel } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

/** Converts between UTC timestamps and the local-time value that datetime-local inputs expect. */
export const toLocalInput = (iso: string | null | undefined) => {
  if (!iso) return '';
  const d = new Date(iso);
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};
const fromLocal = (v: string | null | undefined) => (v ? new Date(v).toISOString() : null);

interface VersionOption { id: number; label: string }

@Component({
  imports: [UI, MatDialogModule, MatTabsModule],
  styles: `.log { font-size: 13px; display: flex; justify-content: space-between; gap: 8px; padding: 6px 0; border-bottom: 1px solid var(--border); }`,
  template: `<h2 mat-dialog-title>{{ data.id ? 'Application details' : 'Add application' }}</h2>
  <mat-dialog-content>
    <mat-tab-group [mat-stretch-tabs]="false">
      <mat-tab label="Details">
        <form [formGroup]="form" class="form-grid" style="padding-top:12px" id="appForm" (ngSubmit)="save()">
          <mat-form-field appearance="outline"><mat-label>Company</mat-label><input matInput formControlName="company" /><mat-error>Enter the company.</mat-error></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Job title</mat-label><input matInput formControlName="jobTitle" /><mat-error>Enter the job title.</mat-error></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Location</mat-label><input matInput formControlName="location" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Salary</mat-label><input matInput formControlName="salary" /></mat-form-field>
          <mat-form-field appearance="outline" class="span-all"><mat-label>Application link</mat-label><input matInput type="url" formControlName="applicationUrl" /><mat-error>Links must start with http:// or https://</mat-error></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Applied on</mat-label><input matInput type="datetime-local" formControlName="appliedAt" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Follow up on</mat-label><input matInput type="datetime-local" formControlName="followUpAt" /></mat-form-field>
          <mat-form-field appearance="outline" class="span-all"><mat-label>Resume version used</mat-label>
            <mat-select formControlName="resumeVersionId"><mat-option [value]="null">None</mat-option>@for (v of versions(); track v.id) { <mat-option [value]="v.id">{{ v.label }}</mat-option> }</mat-select>
          </mat-form-field>
          <mat-form-field appearance="outline" class="span-all"><mat-label>Job description</mat-label><textarea matInput rows="6" formControlName="jobDescription"></textarea></mat-form-field>
          @if (data.id && form.value.applicationUrl) { <a class="small span-all" [href]="form.value.applicationUrl" target="_blank" rel="noopener noreferrer nofollow">Open application link</a> }
        </form>
      </mat-tab>
      @if (detail(); as d) {
        <mat-tab [label]="'Notes (' + d.notes.length + ')'">
          <div class="stack" style="padding-top:12px">
            <div class="row" style="align-items:flex-start">
              <mat-form-field appearance="outline" style="flex:1 1 240px"><mat-label>Add a note</mat-label><textarea matInput rows="2" [formControl]="note"></textarea></mat-form-field>
              <button mat-stroked-button type="button" style="margin-top:6px" (click)="addNote()">Add note</button>
            </div>
            @for (n of d.notes; track n.id) {
              <div class="row" style="flex-wrap:nowrap; align-items:flex-start"><div class="grow small"><pre>{{ n.body }}</pre><div class="muted xs">{{ n.created_at | date: 'MMM d, y, h:mm a' }}</div></div>
                <button mat-icon-button type="button" aria-label="Delete note" (click)="removeNote(n.id)"><mat-icon>delete_outline</mat-icon></button></div>
            } @empty { <p class="muted small">No notes yet.</p> }
          </div>
        </mat-tab>
        <mat-tab [label]="'Interviews (' + d.interviews.length + ')'">
          <div class="stack" style="padding-top:12px">
            <form [formGroup]="iv" class="form-grid" (ngSubmit)="addInterview()">
              <mat-form-field appearance="outline"><mat-label>Date and time</mat-label><input matInput type="datetime-local" formControlName="scheduledAt" /><mat-error>Choose a date and time.</mat-error></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Type</mat-label><mat-select formControlName="kind"><mat-option value="phone screen">Phone screen</mat-option><mat-option value="technical interview">Technical</mat-option><mat-option value="interview">Interview</mat-option><mat-option value="final interview">Final</mat-option></mat-select></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Location or link</mat-label><input matInput formControlName="location" /></mat-form-field>
              <div style="padding-top:6px"><button mat-stroked-button type="submit">Schedule</button></div>
            </form>
            @for (i of d.interviews; track i.id) {
              <div class="row between small"><div><div class="strong">{{ i.scheduled_at | date: 'EEE, MMM d, y, h:mm a' }}</div><div class="muted xs">{{ i.kind }}@if (i.location) { · {{ i.location }} }</div></div>
                <button mat-icon-button type="button" aria-label="Delete interview" (click)="removeInterview(i.id)"><mat-icon>delete_outline</mat-icon></button></div>
            } @empty { <p class="muted small">No interviews scheduled.</p> }
          </div>
        </mat-tab>
        <mat-tab label="History">
          <div style="padding-top:12px">
            @for (h of d.history; track h.id) { <div class="log"><span>{{ h.from_status ? stage(h.from_status) + ' to ' : 'Added as ' }}{{ stage(h.to_status) }}</span><span class="muted">{{ h.changed_at | date: 'MMM d, y, h:mm a' }}</span></div> }
          </div>
        </mat-tab>
      }
    </mat-tab-group>
  </mat-dialog-content>
  <mat-dialog-actions>
    @if (data.id) { <button mat-button type="button" (click)="remove()">Delete</button> }
    <span style="flex:1"></span>
    <button mat-button type="button" mat-dialog-close>Close</button>
    <button mat-flat-button type="submit" form="appForm" [disabled]="busy()">{{ data.id ? 'Save changes' : 'Add application' }}</button>
  </mat-dialog-actions>`,
})
export class ApplicationDialog implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private confirm = inject(ConfirmService); private fb = inject(FormBuilder);
  ref = inject(MatDialogRef<ApplicationDialog>);
  data = inject<{ id: number | null; status?: string }>(MAT_DIALOG_DATA);
  detail = signal<ApplicationDetail | null>(null); versions = signal<VersionOption[]>([]); busy = signal(false);
  stage = stageLabel;
  note = new FormControl('', { nonNullable: true });
  form = this.fb.group({
    company: ['', Validators.required], jobTitle: ['', Validators.required], location: [''], salary: [''],
    applicationUrl: ['', Validators.pattern(/^https?:\/\/.+/i)], appliedAt: [''], followUpAt: [''], resumeVersionId: [null as number | null], jobDescription: [''],
  });
  iv = this.fb.group({ scheduledAt: ['', Validators.required], kind: ['interview'], location: [''] });

  ngOnInit() {
    this.loadVersions();
    if (this.data.id) this.load();
  }
  private loadVersions() {
    this.api.get<ResumeSummary[]>('/resumes').subscribe((list) => {
      for (const r of list) {
        this.api.get<ResumeDetail>(`/resumes/${r.id}`).subscribe((d) => this.versions.update((v) => [...v, ...d.versions.map((x: VersionListItem) => ({ id: x.id, label: `${r.title}, version ${x.version_no}${x.label ? ` (${x.label})` : ''}` }))]));
      }
    });
  }
  private load() {
    this.api.get<ApplicationDetail>(`/job-tracker/${this.data.id}`).subscribe((d) => {
      this.detail.set(d);
      this.form.patchValue({
        company: d.company, jobTitle: d.job_title, location: d.location, salary: d.salary, applicationUrl: d.application_url,
        appliedAt: toLocalInput(d.applied_at), followUpAt: toLocalInput(d.follow_up_at), resumeVersionId: d.resume_version_id, jobDescription: d.job_description ?? '',
      });
    });
  }
  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = { company: v.company, jobTitle: v.jobTitle, location: v.location, salary: v.salary, applicationUrl: v.applicationUrl, jobDescription: v.jobDescription, resumeVersionId: v.resumeVersionId, appliedAt: fromLocal(v.appliedAt), followUpAt: fromLocal(v.followUpAt) };
    this.busy.set(true);
    const req = this.data.id ? this.api.put(`/job-tracker/${this.data.id}`, body) : this.api.post('/job-tracker', { ...body, status: this.data.status ?? 'saved' });
    req.subscribe({ next: () => this.ref.close(true), error: (e) => { this.busy.set(false); this.toast.error(e); } });
  }
  addNote() {
    if (!this.note.value.trim()) return;
    this.api.post(`/job-tracker/${this.data.id}/notes`, { body: this.note.value }).subscribe({ next: () => { this.note.reset(); this.load(); }, error: (e) => this.toast.error(e) });
  }
  removeNote(id: number) { this.api.delete(`/job-tracker/${this.data.id}/notes/${id}`).subscribe({ next: () => this.load(), error: (e) => this.toast.error(e) }); }
  addInterview() {
    if (this.iv.invalid) { this.iv.markAllAsTouched(); return; }
    const v = this.iv.getRawValue();
    this.api.post(`/job-tracker/${this.data.id}/interviews`, { scheduledAt: fromLocal(v.scheduledAt), kind: v.kind, location: v.location }).subscribe({ next: () => { this.iv.reset({ scheduledAt: '', kind: 'interview', location: '' }); this.load(); }, error: (e) => this.toast.error(e) });
  }
  removeInterview(id: number) { this.api.delete(`/job-tracker/${this.data.id}/interviews/${id}`).subscribe({ next: () => this.load(), error: (e) => this.toast.error(e) }); }
  remove() {
    this.confirm.ask({ title: 'Delete this application?', message: 'Its notes, interviews and history will be removed.', confirmLabel: 'Delete', danger: true }).subscribe((yes) => {
      if (yes) this.api.delete(`/job-tracker/${this.data.id}`).subscribe({ next: () => this.ref.close(true), error: (e) => this.toast.error(e) });
    });
  }
}
