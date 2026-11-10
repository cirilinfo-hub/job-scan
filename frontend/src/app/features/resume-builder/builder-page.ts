import { Component, OnInit, inject, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { ResumeDetail, StructuredResume } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ResumeEditor, blankResume } from '../../shared/components/resume-editor';
import { ResumePreview } from '../../shared/components/resume-preview';
import { UI } from '../../shared/ui';

interface Template { id: string; name: string; description: string }

@Component({
  imports: [UI, ResumeEditor, ResumePreview],
  styles: `.tpl { display: flex; gap: 8px; flex-wrap: wrap; } .t { all: unset; cursor: pointer; flex: 1 1 140px; padding: var(--space-3) var(--space-4); border: 1.5px solid var(--border-strong); border-radius: var(--radius-md); font-size: 14px; background: var(--surface); } .t:hover { border-color: var(--text); }
    .t:focus-visible { outline: 2px solid var(--focus-ring); } .t.on { border-color: var(--accent); background: var(--accent-soft); box-shadow: inset 0 0 0 1px var(--accent); } .sticky { position: sticky; top: 16px; max-height: calc(100vh - 110px); overflow: auto; }`,
  template: `<div class="page">
    <div class="page-head">
      <div><h1>Resume builder</h1><p>Single-column templates that most resume parsers can read. Your draft stays on this page until you save it.</p></div>
      <div class="actions">
        <button mat-stroked-button type="button" (click)="download('pdf')"><mat-icon>download</mat-icon>PDF</button>
        <button mat-stroked-button type="button" (click)="download('docx')"><mat-icon>download</mat-icon>DOCX</button>
      </div>
    </div>
    <div class="grid split-even">
      <div class="stack">
        <section class="card stack">
          <h2>Template</h2>
          <div class="tpl" role="radiogroup" aria-label="Template">
            @for (t of templates(); track t.id) {
              <button type="button" class="t" role="radio" [attr.aria-checked]="template() === t.id" [class.on]="template() === t.id" (click)="template.set(t.id)"><div class="strong">{{ t.name }}</div><div class="muted xs">{{ t.description }}</div></button>
            }
          </div>
        </section>
        <section class="card"><app-resume-editor [value]="draft()" [showOrder]="true" (changed)="draft.set($event)" /></section>
        <section class="card row items-start">
          <mat-form-field class="flex-220" appearance="outline"><mat-label>Resume name</mat-label><input matInput [formControl]="title" /><mat-error>Give this resume a name.</mat-error></mat-form-field>
          <button class="mt-2" mat-flat-button type="button" [disabled]="saving()" (click)="save()">{{ saving() ? 'Saving...' : 'Save resume' }}</button>
        </section>
      </div>
      <div><div class="sticky"><h2 class="mb-2">Live preview</h2><app-resume-preview [value]="draft()" [template]="template()" /></div></div>
    </div>
  </div>`,
})
export class BuilderPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private router = inject(Router);
  templates = signal<Template[]>([]); template = signal('classic'); draft = signal<StructuredResume>(blankResume()); saving = signal(false);
  title = new FormControl('', { nonNullable: true, validators: Validators.required });
  ngOnInit() { this.api.get<{ templates: Template[] }>('/resume-builder/templates').subscribe((r) => this.templates.set(r.templates)); }
  download(format: 'pdf' | 'docx') {
    (document.activeElement as HTMLElement | null)?.blur();
    setTimeout(() => this.api.downloadPost('/resume-builder/render', { template: this.template(), format, structured: this.draft() }, `resume.${format}`).subscribe({ error: (e) => this.toast.error(e, 'That download failed.') }));
  }
  save() {
    if (this.title.invalid) { this.title.markAsTouched(); return; }
    (document.activeElement as HTMLElement | null)?.blur();
    this.saving.set(true);
    setTimeout(() => this.api.post<ResumeDetail>('/resume-builder', { title: this.title.value, template: this.template(), structured: this.draft() }).subscribe({
      next: (d) => { this.toast.ok('Resume saved.'); void this.router.navigate(['/resumes', d.resume.id]); },
      error: (e) => { this.saving.set(false); this.toast.error(e); },
    }));
  }
}
