import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { Router } from '@angular/router';
import { MatTabsModule } from '@angular/material/tabs';
import { KeywordRow, ScanDetail } from '../../core/models';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { ErrorBlock, LoadingSkeleton, ProgressBar, ScoreIndicator, scoreTone, scoreWord } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

/** Splits text into plain and highlighted pieces. Rendering pieces as text keeps user content from ever being treated as HTML. */
export function highlight(text: string, terms: { term: string; cls: string }[]) {
  const usable = terms.filter((t) => t.term.length > 1).sort((a, b) => b.term.length - a.term.length);
  if (!usable.length) return [{ text, cls: '' }];
  const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`(?<![A-Za-z0-9+#])(${usable.map((t) => esc(t.term)).join('|')})(?![A-Za-z0-9+#])`, 'gi');
  const out: { text: string; cls: string }[] = [];
  let last = 0;
  for (const m of text.matchAll(re)) {
    if (m.index > last) out.push({ text: text.slice(last, m.index), cls: '' });
    out.push({ text: m[0], cls: usable.find((t) => t.term.toLowerCase() === m[0].toLowerCase())?.cls ?? '' });
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push({ text: text.slice(last), cls: '' });
  return out;
}

@Component({
  imports: [UI, MatTabsModule, ErrorBlock, LoadingSkeleton, ProgressBar, ScoreIndicator],
  styles: `.hero { display: flex; flex-wrap: wrap; gap: 24px; align-items: center; } .line { display: grid; grid-template-columns: minmax(90px, 130px) 1fr 36px; gap: 12px; align-items: center; font-size: 13px; }
    .formula { font-size: 12px; color: var(--text-2); padding: 2px 0 8px; } summary { cursor: pointer; list-style: none; } summary::-webkit-details-marker { display: none; }
    .sev { font-size: 18px; width: 18px; height: 18px; flex: none; } .sev.critical { color: var(--danger); } .sev.warning { color: var(--warning); } .sev.info { color: var(--info); }
    .check .material-icons { font-size: 18px; width: 18px; height: 18px; } .yes { color: var(--success); } .no { color: var(--danger); }
    .legend { display: flex; gap: 12px; flex-wrap: wrap; font-size: 12px; color: var(--text-2); margin-bottom: 8px; }`,
  template: `<div class="page">
    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (!s() && !error()) { <app-skeleton [count]="2" [height]="220" [min]="400" /> }
    @if (s(); as s) {
      <div class="page-head">
        <div><a class="small" routerLink="/scanner">Scanner</a><h1>{{ s.job_title }}</h1><p>{{ s.company || 'No company' }} · {{ s.resume_title }}, version {{ s.version_no }} · {{ s.created_at | date: 'mediumDate' }}</p></div>
        <div class="actions">
          <button mat-stroked-button type="button" (click)="rescan()" matTooltip="Scan this job against the newest version of your resume"><mat-icon>refresh</mat-icon>Rescan</button>
          <button mat-stroked-button type="button" (click)="track()"><mat-icon>view_kanban</mat-icon>Add to tracker</button>
          <a mat-flat-button routerLink="/optimizer" [queryParams]="{ resumeId: s.resume_id, scanId: s.id }"><mat-icon>auto_fix_high</mat-icon>Optimize resume</a>
        </div>
      </div>

      <section class="card hero">
        <div class="row" style="gap:16px">
          <app-score [value]="r().overall" [size]="96" label="Overall estimated match" />
          <div><div class="strong" style="font-size:16px">{{ word() }} match</div><div class="muted small">Estimated overall match</div></div>
        </div>
        <div class="grow stack-sm" style="flex-basis:320px">
          @for (l of r().lines; track l.key) {
            <details>
              <summary class="line" [attr.aria-label]="l.label + ': ' + l.score + '. Show how this is calculated'">
                <span class="row" style="flex-wrap:nowrap; gap:4px"><mat-icon aria-hidden="true" style="font-size:16px;width:16px;height:16px">expand_more</mat-icon>{{ l.label }}</span>
                <app-progress [value]="l.score" [tone]="tone(l.score)" [label]="l.label" /><span class="strong" style="text-align:right">{{ l.score }}</span>
              </summary>
              <div class="formula">{{ l.detail }} {{ l.formula }} Weight: {{ share(l.weight) }}% of the overall estimate.</div>
            </details>
          }
        </div>
      </section>
      <div class="notice info"><mat-icon aria-hidden="true">info</mat-icon><div>{{ r().disclaimer }} Select a row above to see its formula.</div></div>

      <mat-tab-group>
        <mat-tab label="Keywords and skills">
          <div class="grid g2" style="padding-top:16px">
            <section class="card stack">
              <div class="row between"><h2>Missing ({{ missing().length }})</h2><span class="muted xs">Required by the job</span></div>
              <p class="muted small">Add these only if they're true for you. Remove any that don't apply and the estimate will be recalculated.</p>
              <div class="chips">
                @for (k of missing(); track k.term) { <span class="chip miss">{{ k.term }}<span class="muted">×{{ k.jobCount }}</span><button type="button" (click)="exclude(k.term)" [attr.aria-label]="'Exclude ' + k.term" matTooltip="This doesn't apply"><mat-icon>close</mat-icon></button></span> }
                @empty { <span class="muted small">Nothing missing.</span> }
              </div>
            </section>
            <section class="card stack">
              <div class="row between"><h2>Recommended ({{ recommended().length }})</h2><span class="muted xs">Mentioned or preferred</span></div>
              <div class="chips">
                @for (k of recommended(); track k.term) { <span class="chip rec">{{ k.term }}<button type="button" (click)="exclude(k.term)" [attr.aria-label]="'Exclude ' + k.term" matTooltip="This doesn't apply"><mat-icon>close</mat-icon></button></span> }
                @empty { <span class="muted small">Nothing to recommend.</span> }
              </div>
            </section>
            <section class="card stack">
              <h2>Matched ({{ matched().length }})</h2>
              <div class="chips">
                @for (k of matched(); track k.term) { <span class="chip ok">{{ k.term }}<span class="muted">{{ k.resumeCount }}/{{ k.jobCount }}</span></span> }
                @empty { <span class="muted small">No matches found yet.</span> }
              </div>
              <p class="muted xs">Numbers show mentions in your resume / in the job.</p>
            </section>
            @if (s.excluded_terms.length) {
              <section class="card stack">
                <h2>Excluded by you</h2>
                <div class="chips">@for (t of s.excluded_terms; track t) { <span class="chip">{{ t }}<button type="button" (click)="include(t)" [attr.aria-label]="'Include ' + t + ' again'" matTooltip="Include again"><mat-icon>undo</mat-icon></button></span> }</div>
              </section>
            }
            <section class="card span-all" style="grid-column:1/-1">
              <div class="card-head"><h2>Skills comparison</h2></div>
              <div class="table-wrap"><table class="tbl">
                <thead><tr><th>Skill</th><th>Type</th><th>Importance</th><th>In job</th><th>In resume</th><th>Result</th></tr></thead>
                <tbody>@for (k of skills(); track k.term) {
                  <tr><td class="strong">{{ k.term }}</td><td>{{ k.category === 'soft' ? 'Soft' : k.category === 'certification' ? 'Certification' : k.category === 'tool' ? 'Tool' : 'Technical' }}</td><td>{{ k.required ? 'Required' : 'Preferred' }}</td><td>{{ k.jobCount }}</td><td>{{ k.resumeCount }}</td>
                    <td><span class="badge" [class.success]="k.status === 'matched'" [class.danger]="k.status === 'missing'" [class.warning]="k.status === 'recommended'">{{ k.status === 'matched' ? 'Found' : k.status === 'missing' ? 'Missing' : 'Optional' }}</span></td></tr>
                } @empty { <tr><td colspan="6" class="muted">We didn't recognise any catalogued skills in this job description.</td></tr> }</tbody>
              </table></div>
            </section>
            @if (ai.available()) {
              <section class="card stack" style="grid-column:1/-1">
                <div class="row between"><h2>AI keyword ideas</h2><button mat-stroked-button type="button" [disabled]="aiBusy()" (click)="aiKeywords()"><mat-icon>auto_awesome</mat-icon>{{ aiBusy() ? 'Thinking...' : 'Suggest more' }}</button></div>
                @for (k of aiTerms(); track k.term) { <div class="small"><span class="strong">{{ k.term }}</span> <span class="muted">{{ k.why }}</span></div> }
                <p class="muted xs">AI-generated and not part of your score. Use only what's true for you.</p>
              </section>
            }
          </div>
        </mat-tab>

        <mat-tab label="Improvements">
          <div class="grid g2" style="padding-top:16px">
            <section class="card stack">
              <h2>Suggestions</h2>
              @for (x of r().suggestions; track $index) { <div><div class="strong small">{{ x.area }}</div><div class="small">{{ x.message }}</div></div> }
              @empty { <p class="muted small">No specific suggestions.</p> }
            </section>
            <section class="card stack">
              <h2>Formatting and readability</h2>
              @for (w of r().warnings; track w.code) {
                <div class="row small" style="flex-wrap:nowrap; align-items:flex-start"><mat-icon aria-hidden="true" class="sev" [class]="'sev ' + w.severity">{{ w.severity === 'info' ? 'info' : 'warning' }}</mat-icon><div class="grow">{{ w.message }}@if (w.deduction) { <span class="muted"> (-{{ w.deduction }} points)</span> }</div></div>
              } @empty { <p class="muted small">No formatting issues found.</p> }
            </section>
            <section class="card stack small">
              <h2>Sections found</h2>
              <div class="grid" style="grid-template-columns:repeat(auto-fill,minmax(130px,1fr)); gap:6px">
                @for (e of sectionList(); track e[0]) { <div class="row check"><mat-icon aria-hidden="true" [class]="e[1] ? 'yes' : 'no'">{{ e[1] ? 'check_circle' : 'cancel' }}</mat-icon><span style="text-transform:capitalize">{{ e[0] }}</span><span class="sr-only">{{ e[1] ? 'found' : 'not found' }}</span></div> }
              </div>
            </section>
            <section class="card stack small">
              <h2>Requirements</h2>
              <div>Experience: {{ r().experience.requiredYears === null ? 'no requirement stated' : r().experience.requiredYears + '+ years' }}; your dated roles: {{ r().experience.evidencedYears === null ? 'not readable' : r().experience.evidencedYears + ' years' }}.</div>
              <div>Education: {{ r().education.required ?? 'no degree mentioned' }}; your resume: {{ r().education.found ?? 'none recognised' }}.</div>
              <div>Achievements: {{ r().achievements.quantified }} of {{ r().achievements.bullets }} bullets include a number. This doesn't affect the score.</div>
            </section>
          </div>
        </mat-tab>

        <mat-tab label="Side by side">
          <div style="padding-top:16px">
            <div class="legend"><span><mark class="hit-ok">Found in both</mark></span><span><mark class="hit-miss">In the job only</mark></span></div>
            <div class="grid split-even">
              <section class="card"><h2 style="margin-bottom:8px">Your resume</h2><div class="side-text" tabindex="0" aria-label="Resume text">@for (p of resumeParts(); track $index) { @if (p.cls) { <mark [class]="p.cls">{{ p.text }}</mark> } @else { {{ p.text }} } }</div></section>
              <section class="card"><h2 style="margin-bottom:8px">Job description</h2><div class="side-text" tabindex="0" aria-label="Job description text">@for (p of jobParts(); track $index) { @if (p.cls) { <mark [class]="p.cls">{{ p.text }}</mark> } @else { {{ p.text }} } }</div></section>
            </div>
          </div>
        </mat-tab>
      </mat-tab-group>
    }
  </div>`,
})
export class ReportPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private router = inject(Router);
  ai = inject(AiStatusService);
  id = input.required<string>();
  s = signal<ScanDetail | null>(null); error = signal(''); aiBusy = signal(false); aiTerms = signal<{ term: string; why: string }[]>([]);
  r = computed(() => this.s()!.report);
  word = computed(() => scoreWord(this.r().overall));
  tone = scoreTone;
  totalWeight = computed(() => this.r().lines.reduce((a, l) => a + l.weight, 0));
  private byStatus = (st: KeywordRow['status']) => this.r().keywords.filter((k) => k.status === st);
  missing = computed(() => this.byStatus('missing')); recommended = computed(() => this.byStatus('recommended')); matched = computed(() => this.byStatus('matched'));
  skills = computed(() => this.r().keywords.filter((k) => k.category !== 'keyword'));
  sectionList = computed(() => Object.entries(this.r().sections));
  resumeParts = computed(() => highlight(this.s()!.resume_text, this.matched().map((k) => ({ term: k.term, cls: 'hit-ok' }))));
  jobParts = computed(() => highlight(this.s()!.job_description, this.r().keywords.filter((k) => k.status !== 'recommended' || k.resumeCount === 0).map((k) => ({ term: k.term, cls: k.status === 'matched' ? 'hit-ok' : 'hit-miss' }))));

  ngOnInit() { this.load(); }
  load() { this.error.set(''); this.api.get<ScanDetail>(`/resume-scanner/${this.id()}`).subscribe({ next: (s) => this.s.set(s), error: (e) => this.error.set(errorMessage(e)) }); }
  share(w: number) { return Math.round((w / this.totalWeight()) * 100); }
  private setExcluded(excluded: string[]) { this.api.put<ScanDetail>(`/resume-scanner/${this.id()}/excluded-terms`, { excluded }).subscribe({ next: (s) => this.s.set(s), error: (e) => this.toast.error(e) }); }
  exclude(t: string) { this.setExcluded([...this.s()!.excluded_terms, t]); }
  include(t: string) { this.setExcluded(this.s()!.excluded_terms.filter((x) => x !== t)); }
  rescan() { this.api.post<ScanDetail>(`/resume-scanner/${this.id()}/rescan`).subscribe({ next: (n) => { void this.router.navigate(['/scanner', n.id]).then(() => this.s.set(n)); this.toast.ok('Rescanned with your newest version.'); }, error: (e) => this.toast.error(e) }); }
  track() {
    const s = this.s()!;
    this.api.post('/job-tracker', { company: s.company || 'Company not set', jobTitle: s.job_title, jobDescription: s.job_description, resumeVersionId: s.version_id, jobId: s.job_id }).subscribe({ next: () => { this.toast.ok('Added to your tracker.'); void this.router.navigateByUrl('/tracker'); }, error: (e) => this.toast.error(e) });
  }
  aiKeywords() {
    this.aiBusy.set(true);
    this.api.post<{ keywords: { term: string; why: string }[] }>(`/resume-scanner/${this.id()}/ai-keywords`).subscribe({ next: (r) => { this.aiTerms.set(r.keywords); this.aiBusy.set(false); }, error: (e) => { this.aiBusy.set(false); this.toast.error(e); } });
  }
}
