import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder } from '@angular/forms';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { AiNotice, ScoreIndicator } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

interface Check { section: string; status: 'good' | 'improve' | 'missing'; message: string; points: number; earned: number }
interface AiSuggestions { headline: string[]; about: string; experience: string[]; skills: string[]; keywords: string[]; featured: string[] }
interface Payload {
  profile: Record<string, string | null> | null;
  analysis: { score: number; createdAt: string; aiSuggestions: AiSuggestions | null; report: { checks: Check[]; keywords: { matched: string[]; missing: string[] }; note: string } } | null;
}

@Component({
  imports: [UI, AiNotice, ScoreIndicator],
  styles: `.c { display: flex; gap: 8px; align-items: flex-start; font-size: 13px; padding: 6px 0; } .c .material-icons { font-size: 18px; width: 18px; height: 18px; flex: none; } .good { color: var(--success); } .improve { color: var(--warning); } .missing { color: var(--danger); }`,
  template: `<div class="page">
    <div class="page-head"><div><h1>LinkedIn optimizer</h1><p>Paste your profile sections here. We never connect to or read your LinkedIn account.</p></div></div>
    <div class="grid split-even">
      <form class="card" [formGroup]="form" (ngSubmit)="analyze()">
        <h2 class="mb-3">Your profile</h2>
        <mat-form-field appearance="outline"><mat-label>Headline</mat-label><input matInput formControlName="headline" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>About</mat-label><textarea matInput rows="5" formControlName="about"></textarea></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Experience</mat-label><textarea matInput rows="6" formControlName="experience"></textarea></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Skills</mat-label><textarea matInput rows="2" formControlName="skills"></textarea><mat-hint>Separate with commas</mat-hint></mat-form-field>
        <div class="form-grid mt-2">
          <mat-form-field appearance="outline"><mat-label>Certifications</mat-label><textarea matInput rows="2" formControlName="certifications"></textarea></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Education</mat-label><textarea matInput rows="2" formControlName="education"></textarea></mat-form-field>
        </div>
        <mat-form-field appearance="outline"><mat-label>Featured items</mat-label><textarea matInput rows="2" formControlName="featured"></textarea></mat-form-field>
        <h2 class="mt-2 mb-3">Target role</h2>
        <mat-form-field appearance="outline"><mat-label>Target job title</mat-label><input matInput formControlName="targetTitle" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Target job description</mat-label><textarea matInput rows="6" formControlName="targetDescription"></textarea></mat-form-field>
        <button mat-flat-button type="submit" [disabled]="busy()">{{ busy() ? 'Analyzing...' : 'Analyze profile' }}</button>
      </form>

      <div class="stack">
        @if (a(); as a) {
          <section class="card stack">
            <div class="row gap-4 nowrap"><app-score [value]="a.score" [size]="72" label="Profile completeness" /><div><h2>Profile checklist</h2><p class="muted small">{{ a.report.note }}</p></div></div>
            <div>@for (c of a.report.checks; track c.section) { <div class="c"><mat-icon aria-hidden="true" [class]="c.status">{{ c.status === 'good' ? 'check_circle' : c.status === 'improve' ? 'error_outline' : 'cancel' }}</mat-icon><div><span class="strong">{{ c.section }}.</span> {{ c.message }}</div></div> }</div>
          </section>
          @if (a.report.keywords.matched.length || a.report.keywords.missing.length) {
            <section class="card stack">
              <h2>Target role keywords</h2>
              <div><h3 class="small mb-1">In your profile</h3><div class="chips">@for (k of a.report.keywords.matched; track k) { <span class="chip ok">{{ k }}</span> } @empty { <span class="muted small">None found.</span> }</div></div>
              <div><h3 class="small mb-1">Not in your profile</h3><div class="chips">@for (k of a.report.keywords.missing; track k) { <span class="chip miss">{{ k }}</span> } @empty { <span class="muted small">None.</span> }</div></div>
              <p class="muted xs">Add only what truly reflects your experience.</p>
            </section>
          }
          @if (ai.available()) {
            <section class="card stack">
              <div class="row between"><h2>AI suggestions</h2><button mat-stroked-button type="button" [disabled]="aiBusy()" (click)="aiSuggest()"><mat-icon>auto_awesome</mat-icon>{{ aiBusy() ? 'Generating...' : 'Generate' }}</button></div>
              @if (a.aiSuggestions; as s) {
                <div class="small stack">
                  <div><h3>Headline ideas</h3>@for (h of s.headline; track h) { <div>{{ h }}</div> }</div>
                  <div><h3>About</h3><pre>{{ s.about }}</pre></div>
                  <div><h3>Experience</h3>@for (h of s.experience; track h) { <div>{{ h }}</div> }</div>
                  <div><h3>Skills</h3><div class="chips">@for (h of s.skills; track h) { <span class="chip">{{ h }}</span> }</div></div>
                  <div><h3>Keywords</h3><div class="chips">@for (h of s.keywords; track h) { <span class="chip">{{ h }}</span> }</div></div>
                  <div><h3>Featured section</h3>@for (h of s.featured; track h) { <div>{{ h }}</div> }</div>
                  <p class="muted xs">AI-generated. These aren't saved to your profile. Use only what's true for you.</p>
                </div>
              }
            </section>
          } @else if (ai.available() === false) { <app-ai-notice text="The checklist above is rule-based and still works." /> }
        } @else { <section class="card muted small">Fill in the sections and select Analyze profile to see your checklist.</section> }
      </div>
    </div>
  </div>`,
})
export class LinkedinPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  ai = inject(AiStatusService);
  a = signal<Payload['analysis']>(null); busy = signal(false); aiBusy = signal(false);
  form = inject(FormBuilder).nonNullable.group({ headline: [''], about: [''], experience: [''], skills: [''], certifications: [''], education: [''], featured: [''], targetTitle: [''], targetDescription: [''] });
  ngOnInit() {
    this.api.get<Payload>('/linkedin').subscribe((d) => {
      this.a.set(d.analysis);
      const p = d.profile;
      if (p) this.form.patchValue({ headline: p['headline'] ?? '', about: p['about'] ?? '', experience: p['experience'] ?? '', skills: p['skills'] ?? '', certifications: p['certifications'] ?? '', education: p['education'] ?? '', featured: p['featured'] ?? '', targetTitle: p['target_title'] ?? '', targetDescription: p['target_description'] ?? '' });
    });
  }
  analyze() {
    this.busy.set(true);
    this.api.post<Payload>('/linkedin/analyze', this.form.getRawValue()).subscribe({ next: (d) => { this.a.set(d.analysis); this.busy.set(false); }, error: (e) => { this.busy.set(false); this.toast.error(e); } });
  }
  aiSuggest() {
    this.aiBusy.set(true);
    this.api.post<Payload>('/linkedin/ai-suggestions').subscribe({ next: (d) => { this.a.set(d.analysis); this.aiBusy.set(false); }, error: (e) => { this.aiBusy.set(false); this.toast.error(e); } });
  }
}
