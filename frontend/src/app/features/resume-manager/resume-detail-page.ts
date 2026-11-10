import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, FormGroup } from '@angular/forms';
import { MatTabsModule } from '@angular/material/tabs';
import { ResumeDetail, ResumeSummary, StructuredResume } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { ResumeEditor } from '../../shared/components/resume-editor';
import { ResumePreview } from '../../shared/components/resume-preview';
import { ErrorBlock, LoadingSkeleton } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

@Component({
  imports: [UI, MatTabsModule, ResumeEditor, ResumePreview, ErrorBlock, LoadingSkeleton],
  template: `<div class="page">
    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (!d() && !error()) { <app-skeleton [count]="2" [height]="240" [min]="400" /> }
    @if (d(); as d) {
      <div class="page-head">
        <div><a class="small" routerLink="/resumes">Resumes</a><h1>{{ d.resume.title }}</h1><p>Version {{ d.version.version_no }}@if (d.version.label) { · {{ d.version.label }} }</p></div>
        <div class="actions">
          <a mat-stroked-button routerLink="/scanner" [queryParams]="{ resumeId: d.resume.id }"><mat-icon>document_scanner</mat-icon>Scan</a>
          <a mat-stroked-button routerLink="/optimizer" [queryParams]="{ resumeId: d.resume.id }"><mat-icon>auto_fix_high</mat-icon>Optimize</a>
          <button mat-stroked-button type="button" [matMenuTriggerFor]="dl"><mat-icon>download</mat-icon>Download</button>
          <mat-menu #dl="matMenu">
            <button mat-menu-item type="button" (click)="download('pdf')">PDF</button><button mat-menu-item type="button" (click)="download('docx')">DOCX</button>
            @if (d.version.file_name) { <button mat-menu-item type="button" (click)="download('original')">Original file</button> }
          </mat-menu>
        </div>
      </div>

      @if (d.version.change_source === 'upload') {
        <div class="notice info"><mat-icon aria-hidden="true">fact_check</mat-icon><div>We read this from your file automatically and may have missed something. Check each section, correct it, and save.</div></div>
      }

      <mat-tab-group>
        <mat-tab label="Edit">
          <div class="grid split" style="padding-top:16px">
            <div class="card">
              <form class="form-grid" [formGroup]="meta" (ngSubmit)="saveMeta()">
                <mat-form-field appearance="outline"><mat-label>Resume name</mat-label><input matInput formControlName="title" /></mat-form-field>
                <mat-form-field appearance="outline"><mat-label>Category</mat-label><input matInput formControlName="category" placeholder="e.g. Engineering" /></mat-form-field>
                <mat-form-field appearance="outline"><mat-label>Download template</mat-label><mat-select formControlName="template"><mat-option value="classic">Classic</mat-option><mat-option value="modern">Modern</mat-option><mat-option value="compact">Compact</mat-option></mat-select></mat-form-field>
                <div style="padding-top:6px"><button mat-stroked-button type="submit">Save details</button></div>
              </form>
              <hr class="divider" style="margin:8px 0 16px" />
              <app-resume-editor [value]="draft()!" (changed)="draft.set($event); dirty.set(true)" />
              <div class="row" style="margin-top:16px; position: sticky; bottom: 0; background: var(--surface); padding: 8px 0;">
                <mat-form-field appearance="outline" class="grow" subscriptSizing="dynamic" style="flex:1 1 200px"><mat-label>Version label (optional)</mat-label><input matInput [formControl]="label" /></mat-form-field>
                <button mat-flat-button type="button" [disabled]="saving() || !dirty()" (click)="save()">{{ saving() ? 'Saving...' : 'Save as new version' }}</button>
              </div>
            </div>
            <div class="stack">
              <section class="card">
                <h2 style="margin-bottom:8px">Version history</h2>
                <div class="list">
                  @for (v of d.versions; track v.id) {
                    <div class="list-item small">
                      <div class="grow"><div class="li-title">Version {{ v.version_no }}@if (v.id === d.version.id) { <span class="badge accent" style="margin-left:6px">Current</span> }</div>
                        <div class="muted xs">{{ v.label || source(v.change_source) }} · {{ v.created_at | date: 'MMM d, y, h:mm a' }}</div></div>
                      @if (v.id !== d.version.id) { <button mat-button type="button" (click)="restore(v.id)">Restore</button> }
                    </div>
                  }
                </div>
              </section>
              @if (d.version.format_signals; as f) {
                <section class="card small stack-sm"><h2 style="margin-bottom:4px">File details</h2>
                  <div>{{ d.version.file_name }}</div>
                  <div class="muted">{{ f.charCount | number }} characters read@if (f.pages) { · {{ f.pages }} page{{ f.pages === 1 ? '' : 's' }} }</div>
                </section>
              }
            </div>
          </div>
        </mat-tab>
        <mat-tab label="Preview"><div style="padding-top:16px; max-width: 820px"><app-resume-preview [value]="draft()!" [template]="d.resume.template" /></div></mat-tab>
        <mat-tab label="Extracted text"><div class="card" style="margin-top:16px"><pre class="side-text">{{ d.version.raw_text }}</pre></div></mat-tab>
      </mat-tab-group>
    }
  </div>`,
})
export class ResumeDetailPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  id = input.required<string>();
  d = signal<ResumeDetail | null>(null); draft = signal<StructuredResume | null>(null); error = signal(''); saving = signal(false); dirty = signal(false);
  label = new FormControl('', { nonNullable: true });
  meta = new FormGroup({ title: new FormControl('', { nonNullable: true }), category: new FormControl('', { nonNullable: true }), template: new FormControl('classic', { nonNullable: true }) });
  url = computed(() => `/resumes/${this.id()}`);

  ngOnInit() { this.load(); }
  private adopt(d: ResumeDetail) {
    this.d.set(d); this.draft.set(d.version.structured); this.dirty.set(false);
    this.meta.setValue({ title: d.resume.title, category: d.resume.category ?? '', template: d.resume.template });
  }
  load() { this.error.set(''); this.api.get<ResumeDetail>(this.url()).subscribe({ next: (d) => this.adopt(d), error: (e) => this.error.set(errorMessage(e)) }); }
  source(s: string) { return ({ upload: 'Uploaded', manual: 'Edited', optimizer: 'Optimized', builder: 'Built' } as Record<string, string>)[s] ?? s; }
  save() {
    this.saving.set(true);
    (document.activeElement as HTMLElement | null)?.blur();
    setTimeout(() => this.api.post<ResumeDetail>(`${this.url()}/versions`, { structured: this.draft(), label: this.label.value || null }).subscribe({
      next: (d) => { this.adopt(d); this.label.reset(); this.saving.set(false); this.toast.ok(`Saved as version ${d.version.version_no}.`); },
      error: (e) => { this.saving.set(false); this.toast.error(e); },
    }));
  }
  saveMeta() {
    const v = this.meta.getRawValue();
    if (!v.title.trim()) { this.toast.error('Give this resume a name.'); return; }
    this.api.patch<ResumeSummary>(this.url(), { title: v.title, category: v.category || null, template: v.template }).subscribe({
      next: () => { this.toast.ok('Details saved.'); this.api.get<ResumeDetail>(this.url()).subscribe((d) => this.d.set(d)); },
      error: (e) => this.toast.error(e),
    });
  }
  restore(versionId: number) { this.api.post<ResumeDetail>(`${this.url()}/versions/${versionId}/restore`).subscribe({ next: (d) => { this.adopt(d); this.toast.ok(`Restored as version ${d.version.version_no}.`); }, error: (e) => this.toast.error(e) }); }
  download(format: string) { this.api.download(`${this.url()}/download`, `resume.${format === 'original' ? 'pdf' : format}`, { format }).subscribe({ error: (e) => this.toast.error(e, 'That download failed.') }); }
}
