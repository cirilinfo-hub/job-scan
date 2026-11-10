import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { ResumeDetail, ResumeSummary, ResumeVersion, ScanListItem, StructuredResume, Suggestion } from '../../core/models';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ResumeEditor } from '../../shared/components/resume-editor';
import { AiNotice, EmptyState, LoadingSkeleton, ScoreIndicator, StatusBadge } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

interface LoadResult { version: ResumeVersion; suggestions: Suggestion[]; ai: { available: boolean } }

@Component({
  imports: [UI, MatDialogModule, ResumeEditor, AiNotice, EmptyState, LoadingSkeleton, ScoreIndicator, StatusBadge],
  styles: `.sug { border: 1px solid var(--border); border-radius: 8px; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
    .before { text-decoration: line-through; color: var(--text-2); font-size: 13px; } .after { font-size: 13px; background: var(--success-soft); padding: 6px 8px; border-radius: 6px; }
    .kind { text-transform: capitalize; } .delta { font-weight: 600; } .up { color: var(--success); } .down { color: var(--danger); }
    .confirm { font-size: 13px; background: var(--warning-soft); padding: 6px 10px; border-radius: 6px; } textarea.edit { width: 100%; font: inherit; font-size: 13px; padding: 8px; border-radius: 6px; border: 1px solid var(--border); background: var(--surface); color: var(--text); }`,
  template: `<div class="page">
    <div class="page-head">
      <div><h1>Resume optimizer</h1><p>Review each suggestion. Nothing changes on your resume unless you accept it and save.</p></div>
    </div>
    <section class="card form-grid">
      <mat-form-field appearance="outline"><mat-label>Resume</mat-label><mat-select [formControl]="resumeCtl">@for (r of resumes(); track r.id) { <mat-option [value]="r.id">{{ r.title }}</mat-option> }</mat-select></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Target job (from your scans)</mat-label><mat-select [formControl]="scanCtl"><mat-option [value]="null">No specific job</mat-option>@for (s of scans(); track s.id) { <mat-option [value]="s.id">{{ s.job_title }}{{ s.company ? ' at ' + s.company : '' }} ({{ s.overall_score }})</mat-option> }</mat-select></mat-form-field>
    </section>

    @if (!resumes().length && !loading()) { <div class="card"><app-empty icon="description" title="Add a resume first" actionLabel="Go to resumes" actionLink="/resumes" /></div> }
    @if (loading()) { <app-skeleton [count]="2" [height]="260" [min]="400" /> }
    @if (draft(); as draft) {
      <div class="grid split-even">
        <section class="card">
          <div class="card-head">
            <h2>Your content</h2>
            <button mat-button type="button" (click)="showCompare.set(!showCompare())"><mat-icon>compare_arrows</mat-icon>{{ showCompare() ? 'Back to editor' : 'Compare before and after' }}</button>
          </div>
          @if (showCompare()) {
            <div class="grid split-even">
              <div><h3 style="margin-bottom:6px">Before</h3><pre class="side-text">{{ beforeText() }}</pre></div>
              <div><h3 style="margin-bottom:6px">After</h3><pre class="side-text">{{ afterText() }}</pre></div>
            </div>
          } @else { <app-resume-editor [value]="draft" (changed)="edit($event)" /> }
          <hr class="divider" style="margin:16px 0" />
          <div class="row">
            <mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1 1 200px"><mat-label>Version name</mat-label><input matInput [formControl]="label" /></mat-form-field>
            <button mat-flat-button type="button" [disabled]="saving() || !dirty()" (click)="save(false)">Save version</button>
            <button mat-stroked-button type="button" [disabled]="saving() || !dirty()" (click)="save(true)">Save as new resume</button>
            <button mat-stroked-button type="button" (click)="download('pdf')"><mat-icon>download</mat-icon>PDF</button>
            <button mat-stroked-button type="button" (click)="download('docx')"><mat-icon>download</mat-icon>DOCX</button>
          </div>
        </section>

        <div class="stack">
          @if (scanCtl.value) {
            <section class="card">
              <div class="row between"><h2>Estimated match</h2><button mat-stroked-button type="button" [disabled]="scoring()" (click)="rescore()"><mat-icon>calculate</mat-icon>{{ scoring() ? 'Calculating...' : 'Recalculate' }}</button></div>
              @if (score(); as sc) {
                <div class="row" style="gap:16px; margin-top:12px">
                  <app-score [value]="sc.before" [size]="56" label="Before" /><mat-icon aria-hidden="true">arrow_forward</mat-icon><app-score [value]="sc.after" [size]="56" label="After" />
                  <span class="delta" [class.up]="sc.after > sc.before" [class.down]="sc.after < sc.before">{{ sc.after - sc.before > 0 ? '+' : '' }}{{ sc.after - sc.before }} points</span>
                </div>
                <p class="muted xs" style="margin-top:8px">An estimate from our rules, using your unsaved edits. It doesn't predict hiring.</p>
              } @else { <p class="muted small" style="margin-top:6px">Accept or edit something, then recalculate to compare.</p> }
            </section>
          }

          @if (ai.available() === false) { <app-ai-notice text="The rule-based suggestions below still work." /> }
          <section class="card stack">
            <div class="row between">
              <h2>Suggestions ({{ pending().length }})</h2>
              @if (ai.available()) { <button mat-flat-button type="button" [disabled]="aiBusy()" (click)="generateAi()"><mat-icon>auto_awesome</mat-icon>{{ aiBusy() ? 'Generating...' : 'Get AI suggestions' }}</button> }
            </div>
            @for (s of pending(); track s.id) {
              <div class="sug">
                <div class="row between"><span class="strong small kind">{{ s.kind }} · {{ where(s) }}</span><app-status [status]="s.source" /></div>
                @if (s.original) { <div class="before">{{ s.original }}</div> }
                @if (editing() === s.id) {
                  <textarea class="edit" rows="3" [formControl]="editText" aria-label="Edit suggestion"></textarea>
                } @else { <div class="after">{{ s.suggested }}</div> }
                @if (s.rationale) { <div class="muted xs">{{ s.rationale }}</div> }
                @if (s.needsConfirmation) { <mat-checkbox class="confirm" [checked]="confirmed().has(s.id)" (change)="toggleConfirm(s.id)">This is true and I can back it up</mat-checkbox> }
                <div class="row">
                  <button mat-flat-button type="button" [disabled]="s.needsConfirmation && !confirmed().has(s.id)" (click)="decide(s, 'accepted')">Accept</button>
                  @if (editing() === s.id) { <button mat-button type="button" (click)="editing.set(null)">Cancel edit</button> } @else { <button mat-button type="button" (click)="startEdit(s)">Edit</button> }
                  <button mat-button type="button" (click)="decide(s, 'rejected')">Reject</button>
                </div>
              </div>
            } @empty { <p class="muted small">No suggestions waiting. Choose a target job for more.</p> }
            @if (done().length) {
              <details class="small"><summary style="cursor:pointer">{{ done().length }} reviewed</summary>
                @for (s of done(); track s.id) { <div class="row between" style="padding:4px 0; flex-wrap:nowrap"><span class="truncate grow">{{ s.finalText || s.suggested }}</span><app-status [status]="s.status" /></div> }
              </details>
            }
          </section>
        </div>
      </div>
    }
  </div>`,
})
export class OptimizerPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private router = inject(Router);
  ai = inject(AiStatusService); dialog = inject(MatDialog);
  resumeId = input<string>(); scanId = input<string>();
  resumes = signal<ResumeSummary[]>([]); scans = signal<ScanListItem[]>([]); loading = signal(true); suggestions = signal<Suggestion[]>([]);
  draft = signal<StructuredResume | null>(null); original = signal<StructuredResume | null>(null); dirty = signal(false); saving = signal(false); aiBusy = signal(false); scoring = signal(false);
  score = signal<{ before: number; after: number } | null>(null); confirmed = signal(new Set<number>()); editing = signal<number | null>(null); showCompare = signal(false);
  resumeCtl = new FormControl<number | null>(null); scanCtl = new FormControl<number | null>(null); label = new FormControl('', { nonNullable: true }); editText = new FormControl('', { nonNullable: true });
  pending = computed(() => this.suggestions().filter((s) => s.status === 'pending'));
  done = computed(() => this.suggestions().filter((s) => s.status !== 'pending'));
  beforeText = computed(() => this.plain(this.original()));
  afterText = computed(() => this.plain(this.draft()));

  ngOnInit() {
    this.api.get<ResumeSummary[]>('/resumes').subscribe((list) => {
      this.resumes.set(list);
      const wanted = list.find((r) => r.id === Number(this.resumeId())) ?? list.find((r) => r.is_default) ?? list[0];
      if (!wanted) { this.loading.set(false); return; }
      this.scanCtl.setValue(this.scanId() ? Number(this.scanId()) : null, { emitEvent: false });
      this.resumeCtl.setValue(wanted.id, { emitEvent: false });
      this.loadScans();
      this.load();
    });
    this.resumeCtl.valueChanges.subscribe(() => { this.scanCtl.setValue(null, { emitEvent: false }); this.loadScans(); this.load(); });
    this.scanCtl.valueChanges.subscribe(() => { this.score.set(null); this.load(); });
  }
  private loadScans() {
    this.api.get<ScanListItem[]>('/resume-scanner', { pageSize: 50 }).subscribe((all) => this.scans.set(all.filter((s) => s.resume_id === this.resumeCtl.value)));
  }
  private load() {
    this.loading.set(true); this.draft.set(null);
    this.api.get<LoadResult>(`/resume-optimizer/resumes/${this.resumeCtl.value}`, { scanId: this.scanCtl.value }).subscribe({
      next: (r) => { this.draft.set(r.version.structured); this.original.set(r.version.structured); this.suggestions.set(r.suggestions); this.dirty.set(false); this.loading.set(false); },
      error: (e) => { this.loading.set(false); this.toast.error(e); },
    });
  }
  edit(r: StructuredResume) { this.draft.set(r); this.dirty.set(true); }
  where(s: Suggestion) {
    const m = s.sectionPath.match(/^experience\.(\d+)/);
    if (m) return this.draft()?.experience[Number(m[1])]?.title || `Role ${Number(m[1]) + 1}`;
    return s.sectionPath;
  }
  toggleConfirm(id: number) { this.confirmed.update((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  startEdit(s: Suggestion) { this.editText.setValue(s.suggested); this.editing.set(s.id); }
  decide(s: Suggestion, status: 'accepted' | 'rejected') {
    const body = { status, confirmed: this.confirmed().has(s.id), finalText: this.editing() === s.id ? this.editText.value : undefined, structured: this.draft() };
    this.api.post<{ suggestion: Suggestion; structured: StructuredResume }>(`/resume-optimizer/suggestions/${s.id}/decision`, body).subscribe({
      next: (r) => {
        this.suggestions.update((l) => l.map((x) => (x.id === s.id ? r.suggestion : x)));
        this.editing.set(null);
        if (status === 'accepted') { this.draft.set(r.structured); this.dirty.set(true); }
      },
      error: (e) => this.toast.error(e),
    });
  }
  generateAi() {
    this.aiBusy.set(true);
    this.api.post<Suggestion[]>(`/resume-optimizer/resumes/${this.resumeCtl.value}/ai-suggestions${this.scanCtl.value ? `?scanId=${this.scanCtl.value}` : ''}`).subscribe({
      next: (s) => { this.suggestions.set(s); this.aiBusy.set(false); },
      error: (e) => { this.aiBusy.set(false); this.toast.error(e); },
    });
  }
  rescore() {
    this.scoring.set(true);
    this.api.post<{ before: number; after: number }>('/resume-optimizer/rescore', { scanId: this.scanCtl.value, structured: this.draft() }).subscribe({
      next: (r) => { this.score.set(r); this.scoring.set(false); },
      error: (e) => { this.scoring.set(false); this.toast.error(e); },
    });
  }
  save(asNew: boolean) {
    const title = this.resumes().find((r) => r.id === this.resumeCtl.value)?.title;
    this.saving.set(true);
    this.api.post<ResumeDetail>(`/resume-optimizer/resumes/${this.resumeCtl.value}/save`, { structured: this.draft(), label: this.label.value || 'Optimized', asNew, title: asNew ? `${title} (optimized)` : undefined }).subscribe({
      next: (d) => {
        this.saving.set(false); this.dirty.set(false);
        this.toast.ok(asNew ? 'Saved as a new resume.' : `Saved as version ${d.version.version_no}.`);
        void this.router.navigate(['/resumes', d.resume.id]);
      },
      error: (e) => { this.saving.set(false); this.toast.error(e); },
    });
  }
  download(format: 'pdf' | 'docx') {
    const template = this.resumes().find((r) => r.id === this.resumeCtl.value)?.template ?? 'classic';
    this.api.downloadPost('/resume-builder/render', { template, format, structured: this.draft() }, `resume.${format}`).subscribe({ error: (e) => this.toast.error(e, 'That download failed.') });
  }
  private plain(r: StructuredResume | null) {
    if (!r) return '';
    return [r.summary, ...r.experience.flatMap((e) => [`${e.title}, ${e.company}`, ...e.bullets.map((b) => `• ${b}`)]), r.skills.length ? `Skills: ${r.skills.join(', ')}` : ''].filter(Boolean).join('\n');
  }
}
