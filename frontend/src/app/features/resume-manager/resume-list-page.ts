import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { ResumeDetail, ResumeSummary } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm-dialog';
import { EmptyState, ErrorBlock, LoadingSkeleton, ScoreIndicator } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

@Component({
  imports: [UI, EmptyState, ErrorBlock, LoadingSkeleton, ScoreIndicator],
  styles: `.rc { display: flex; flex-direction: column; gap: 10px; height: 100%; } .rc h2 a { color: inherit; } .rc h2 a:hover { color: var(--accent); }
    .drop { border: 2px dashed var(--border-strong); border-radius: var(--radius-lg); padding: var(--space-6); text-align: center; background: var(--surface); } .drop.over { border-color: var(--accent); background: var(--accent-soft); }`,
  template: `<div class="page">
    <div class="page-head">
      <div><h1>Resumes</h1><p>Keep versions for different roles. Check what we read from each file before you rely on it.</p></div>
      <div class="actions"><a mat-stroked-button routerLink="/builder"><mat-icon>edit_document</mat-icon>Build a resume</a></div>
    </div>

    <div class="drop" [class.over]="over()" (dragover)="$event.preventDefault(); over.set(true)" (dragleave)="over.set(false)" (drop)="onDrop($event)">
      <input #file type="file" hidden accept=".pdf,.docx" (change)="onPick($event)" />
      @if (busy()) { <div class="row justify-center" role="status"><mat-spinner diameter="20" />Reading your file...</div> }
      @else {
        <p>Drag a PDF or DOCX here, or</p>
        <button class="mt-2" mat-flat-button type="button" (click)="file.click()"><mat-icon>upload_file</mat-icon>Choose a file</button>
        <p class="muted xs mt-2">Up to 5 MB. Files are stored privately and only you can download them.</p>
      }
    </div>

    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (loading()) { <app-skeleton [height]="150" [min]="300" /> }
    @else {
      <div class="grid g3">
        @for (r of items(); track r.id) {
          <article class="card rc">
            <div class="row between nowrap">
              <div class="grow">
                <h2 class="truncate"><a [routerLink]="['/resumes', r.id]">{{ r.title }}</a></h2>
                <div class="muted xs">Updated {{ r.updated_at | date: 'mediumDate' }} · {{ r.version_count }} version{{ r.version_count === 1 ? '' : 's' }}</div>
              </div>
              @if (r.last_score !== null) { <app-score [value]="r.last_score" [size]="44" label="Latest estimated match" /> }
            </div>
            <div class="chips">
              @if (r.is_default) { <span class="badge accent">Default</span> }
              @if (r.category) { <span class="badge">{{ r.category }}</span> }
              <span class="badge">{{ origin(r.origin) }}</span>
            </div>
            <div class="row between mt-auto">
              <a mat-button [routerLink]="['/resumes', r.id]">Open</a>
              <div>
                <a mat-icon-button routerLink="/scanner" [queryParams]="{ resumeId: r.id }" aria-label="Scan this resume" matTooltip="Scan"><mat-icon>document_scanner</mat-icon></a>
                <button mat-icon-button type="button" [matMenuTriggerFor]="m" [attr.aria-label]="'More actions for ' + r.title"><mat-icon>more_vert</mat-icon></button>
                <mat-menu #m="matMenu">
                  @if (!r.is_default) { <button mat-menu-item type="button" (click)="setDefault(r)"><mat-icon>star</mat-icon>Set as default</button> }
                  <button mat-menu-item type="button" (click)="download(r, 'pdf')"><mat-icon>picture_as_pdf</mat-icon>Download PDF</button>
                  <button mat-menu-item type="button" (click)="download(r, 'docx')"><mat-icon>article</mat-icon>Download DOCX</button>
                  @if (r.file_name) { <button mat-menu-item type="button" (click)="download(r, 'original')"><mat-icon>file_download</mat-icon>Download original</button> }
                  <button mat-menu-item type="button" (click)="remove(r)"><mat-icon>delete_outline</mat-icon>Delete</button>
                </mat-menu>
              </div>
            </div>
          </article>
        } @empty {
          <div class="card span-all"><app-empty icon="description" title="No resumes yet" text="Upload a resume above, or build one from a template." actionLabel="Build a resume" actionLink="/builder" /></div>
        }
      </div>
    }
  </div>`,
})
export class ResumeListPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private confirm = inject(ConfirmService); private router = inject(Router);
  items = signal<ResumeSummary[]>([]); loading = signal(true); busy = signal(false); over = signal(false); error = signal('');
  ngOnInit() { this.load(); }
  load() {
    this.loading.set(true); this.error.set('');
    this.api.get<ResumeSummary[]>('/resumes').subscribe({
      next: (r) => { this.items.set(r); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
  origin(o: string) { return ({ upload: 'Uploaded', builder: 'Built here', optimizer: 'Optimized' } as Record<string, string>)[o] ?? o; }
  onPick(e: Event) { const input = e.target as HTMLInputElement; if (input.files?.[0]) this.upload(input.files[0]); input.value = ''; }
  onDrop(e: DragEvent) { e.preventDefault(); this.over.set(false); const f = e.dataTransfer?.files[0]; if (f) this.upload(f); }
  upload(file: File) {
    const fd = new FormData(); fd.append('file', file);
    this.busy.set(true);
    this.api.post<ResumeDetail>('/resumes', fd).subscribe({
      next: (r) => { this.busy.set(false); this.toast.ok('Uploaded. Please review what we extracted.'); void this.router.navigate(['/resumes', r.resume.id]); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
  setDefault(r: ResumeSummary) { this.api.post(`/resumes/${r.id}/default`).subscribe({ next: () => { this.toast.ok('Default resume updated.'); this.load(); }, error: (e) => this.toast.error(e) }); }
  download(r: ResumeSummary, format: string) { this.api.download(`/resumes/${r.id}/download`, `${r.title}.${format === 'original' ? 'pdf' : format}`, { format }).subscribe({ error: (e) => this.toast.error(e, 'That download failed.') }); }
  remove(r: ResumeSummary) {
    this.confirm.ask({ title: 'Delete this resume?', message: `"${r.title}" and its versions and scans will be removed. This can't be undone from the app.`, confirmLabel: 'Delete', danger: true }).subscribe((yes) => {
      if (yes) this.api.delete(`/resumes/${r.id}`).subscribe({ next: () => { this.toast.ok('Resume deleted.'); this.load(); }, error: (e) => this.toast.error(e) });
    });
  }
}
