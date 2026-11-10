import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl, Validators } from '@angular/forms';
import { CoverLetter, CoverLetterVersion } from '../../core/models';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { ErrorBlock, LoadingSkeleton, StatusBadge } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

@Component({
  imports: [UI, ErrorBlock, LoadingSkeleton, StatusBadge],
  template: `<div class="page">
    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (!l() && !error()) { <app-skeleton [count]="1" [height]="400" [min]="500" /> }
    @if (l(); as l) {
      <div class="page-head">
        <div><a class="small" routerLink="/cover-letters">Cover letters</a><h1>{{ l.company }}</h1><p>{{ l.job_title }}</p></div>
        <div class="actions">
          <button mat-stroked-button type="button" [disabled]="busy()" (click)="regenerate('template')">New template draft</button>
          @if (ai.available()) { <button mat-stroked-button type="button" [disabled]="busy()" (click)="regenerate('ai')"><mat-icon>auto_awesome</mat-icon>{{ busy() ? 'Generating...' : 'Regenerate with AI' }}</button> }
          <button mat-stroked-button type="button" [matMenuTriggerFor]="dl"><mat-icon>download</mat-icon>Export</button>
          <mat-menu #dl="matMenu"><button mat-menu-item type="button" (click)="exportFile('pdf')">PDF</button><button mat-menu-item type="button" (click)="exportFile('docx')">DOCX</button></mat-menu>
        </div>
      </div>
      @if (current()?.source === 'ai') { <div class="notice info"><mat-icon aria-hidden="true">auto_awesome</mat-icon><div>AI wrote this draft from your resume. Check every statement before you send it.</div></div> }
      @if (current()?.source === 'template') { <div class="notice info"><mat-icon aria-hidden="true">article</mat-icon><div>This is a template, not AI-written text. Replace the parts in [square brackets] with your own words.</div></div> }
      <div class="grid split">
        <section class="card">
          <mat-form-field appearance="outline"><mat-label>Letter</mat-label><textarea matInput rows="20" [formControl]="body"></textarea></mat-form-field>
          <button mat-flat-button type="button" [disabled]="body.pristine || body.invalid" (click)="save()">Save as new version</button>
        </section>
        <section class="card">
          <h2 style="margin-bottom:8px">Version history</h2>
          <div class="list">
            @for (v of l.versions; track v.id) {
              <div class="list-item small"><div class="grow"><div class="li-title">Version {{ v.version_no }}</div><div class="muted xs">{{ v.created_at | date: 'MMM d, h:mm a' }}</div></div><app-status [status]="v.source" /><button mat-button type="button" (click)="view(v)">Open</button></div>
            }
          </div>
        </section>
      </div>
    }
  </div>`,
})
export class LetterDetailPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  ai = inject(AiStatusService);
  id = input.required<string>();
  l = signal<CoverLetter | null>(null); shown = signal<CoverLetterVersion | null>(null); error = signal(''); busy = signal(false);
  body = new FormControl('', { nonNullable: true, validators: Validators.required });
  current = computed(() => this.shown() ?? this.l()?.versions[0] ?? null);
  ngOnInit() { this.load(); }
  private adopt(l: CoverLetter) { this.l.set(l); this.view(l.versions[0]); }
  load() { this.error.set(''); this.api.get<CoverLetter>(`/cover-letters/${this.id()}`).subscribe({ next: (l) => this.adopt(l), error: (e) => this.error.set(errorMessage(e)) }); }
  view(v: CoverLetterVersion) { this.shown.set(v); this.body.setValue(v.body); this.body.markAsPristine(); }
  save() { this.api.post<CoverLetter>(`/cover-letters/${this.id()}/versions`, { body: this.body.value }).subscribe({ next: (l) => { this.adopt(l); this.toast.ok('Saved.'); }, error: (e) => this.toast.error(e) }); }
  regenerate(mode: 'ai' | 'template') {
    this.busy.set(true);
    this.api.post<CoverLetter>(`/cover-letters/${this.id()}/regenerate`, { mode }).subscribe({ next: (l) => { this.adopt(l); this.busy.set(false); }, error: (e) => { this.busy.set(false); this.toast.error(e); } });
  }
  exportFile(format: string) { this.api.download(`/cover-letters/${this.id()}/export`, `cover-letter.${format}`, { format, versionId: this.current()?.id }).subscribe({ error: (e) => this.toast.error(e, 'That export failed.') }); }
}
