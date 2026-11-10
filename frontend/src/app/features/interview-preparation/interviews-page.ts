import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm-dialog';
import { AiNotice, StatusBadge } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

interface Question { id: number; category: string; role_family: string; question: string; guidance: string | null; sample_answer: string | null; source: string }
interface Guide { star: { key: string; label: string; hint: string }[]; categories: string[]; roleFamilies: string[] }
interface SessionItem { id: number; title: string; status: string; created_at: string; total: number; answered: number }
const CAT: Record<string, string> = { behavioral: 'Behavioral', technical: 'Technical', hr: 'HR', scenario: 'Scenario', job_specific: 'Job-specific' };
const family = (s: string) => s.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());

@Component({
  imports: [UI, AiNotice, StatusBadge],
  styles: `.q { border-bottom: 1px solid var(--border); padding: 10px 0; } .q:last-child { border-bottom: 0; } .star { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }`,
  template: `<div class="page">
    <div class="page-head"><div><h1>Interview preparation</h1><p>Practise with common and role-specific questions, then review your answers.</p></div></div>
    <section class="card">
      <h2 style="margin-bottom:8px">The STAR method</h2>
      <div class="star">@for (s of guide()?.star; track s.key) { <div><div class="strong small">{{ s.label }}</div><div class="muted small">{{ s.hint }}</div></div> }</div>
    </section>
    <div class="grid split">
      <section class="card stack">
        <div class="row between"><h2>Question bank</h2><span class="muted small">{{ chosen().size }} selected</span></div>
        <div class="form-grid">
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Category</mat-label><mat-select [formControl]="category"><mat-option [value]="null">All</mat-option>@for (c of guide()?.categories; track c) { <mat-option [value]="c">{{ cat[c] }}</mat-option> }</mat-select></mat-form-field>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Role</mat-label><mat-select [formControl]="role"><mat-option [value]="null">All</mat-option>@for (r of guide()?.roleFamilies; track r) { <mat-option [value]="r">{{ fam(r) }}</mat-option> }</mat-select></mat-form-field>
        </div>
        <div>
          @for (q of questions(); track q.id) {
            <div class="q">
              <mat-checkbox [checked]="chosen().has(q.id)" (change)="toggle(q.id)"><span class="strong small">{{ q.question }}</span></mat-checkbox>
              <div class="row" style="margin:2px 0 0 40px"><span class="badge">{{ cat[q.category] }}</span>@if (q.source === 'ai') { <app-status status="ai" /> }</div>
              <details class="small" style="margin-left:40px"><summary style="cursor:pointer; color:var(--accent)">Guidance and sample outline</summary>
                <p style="margin-top:4px">{{ q.guidance }}</p><p class="muted" style="margin-top:4px">{{ q.sample_answer }}</p></details>
            </div>
          } @empty { <p class="muted small">No questions match these filters.</p> }
        </div>
      </section>
      <div class="stack">
        <form class="card stack" [formGroup]="start" (ngSubmit)="startSession()">
          <h2>Start a mock interview</h2>
          <div>
            <mat-form-field appearance="outline"><mat-label>Session name</mat-label><input matInput formControlName="title" /><mat-error>Name this session.</mat-error></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Job title (optional)</mat-label><input matInput formControlName="jobTitle" /></mat-form-field>
          </div>
          <button mat-flat-button type="submit" [disabled]="!chosen().size">Start with {{ chosen().size }} question{{ chosen().size === 1 ? '' : 's' }}</button>
        </form>
        @if (ai.available()) {
          <form class="card stack" [formGroup]="gen" (ngSubmit)="generate()">
            <h2>Generate job-specific questions</h2>
            <div>
              <mat-form-field appearance="outline"><mat-label>Job title</mat-label><input matInput formControlName="jobTitle" /><mat-error>Enter the job title.</mat-error></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Company (optional)</mat-label><input matInput formControlName="company" /></mat-form-field>
              <mat-form-field appearance="outline"><mat-label>Job description (optional)</mat-label><textarea matInput rows="4" formControlName="jobDescription"></textarea></mat-form-field>
            </div>
            <button mat-stroked-button type="submit" [disabled]="busy()"><mat-icon>auto_awesome</mat-icon>{{ busy() ? 'Generating...' : 'Generate questions' }}</button>
          </form>
        } @else if (ai.available() === false) { <app-ai-notice text="The question bank and practice sessions still work." /> }
        <section class="card">
          <h2 style="margin-bottom:8px">Past sessions</h2>
          <div class="list">
            @for (s of sessions(); track s.id) {
              <div class="list-item"><a class="grow" style="color:inherit; min-width:0" [routerLink]="['/interviews/session', s.id]"><div class="li-title truncate">{{ s.title }}</div><div class="muted xs">{{ s.answered }} of {{ s.total }} answered · {{ s.created_at | date: 'mediumDate' }}</div></a>
                <button mat-icon-button type="button" [attr.aria-label]="'Delete session ' + s.title" (click)="remove(s)"><mat-icon>delete_outline</mat-icon></button></div>
            } @empty { <p class="muted small">No sessions yet.</p> }
          </div>
        </section>
      </div>
    </div>
  </div>`,
})
export class InterviewsPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private router = inject(Router); private confirm = inject(ConfirmService); private fb = inject(FormBuilder);
  ai = inject(AiStatusService);
  cat = CAT; fam = family;
  guide = signal<Guide | null>(null); questions = signal<Question[]>([]); sessions = signal<SessionItem[]>([]); chosen = signal(new Set<number>()); busy = signal(false);
  category = new FormControl<string | null>(null); role = new FormControl<string | null>(null);
  start = this.fb.nonNullable.group({ title: ['Practice session', Validators.required], jobTitle: [''] });
  gen = this.fb.nonNullable.group({ jobTitle: ['', [Validators.required, Validators.minLength(2)]], company: [''], jobDescription: [''] });
  count = computed(() => this.chosen().size);
  ngOnInit() {
    this.api.get<Guide>('/interviews/guide').subscribe((g) => this.guide.set(g));
    this.loadQuestions(); this.loadSessions();
    this.category.valueChanges.subscribe(() => this.loadQuestions());
    this.role.valueChanges.subscribe(() => this.loadQuestions());
  }
  loadQuestions() { this.api.get<Question[]>('/interviews/questions', { category: this.category.value, roleFamily: this.role.value }).subscribe((q) => this.questions.set(q)); }
  loadSessions() { this.api.get<SessionItem[]>('/interviews/sessions').subscribe((s) => this.sessions.set(s)); }
  toggle(id: number) { this.chosen.update((c) => { const n = new Set(c); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  startSession() {
    if (this.start.invalid) { this.start.markAllAsTouched(); return; }
    const v = this.start.getRawValue();
    this.api.post<{ id: number }>('/interviews/sessions', { title: v.title, jobTitle: v.jobTitle || undefined, questionIds: [...this.chosen()] }).subscribe({ next: (s) => void this.router.navigate(['/interviews/session', s.id]), error: (e) => this.toast.error(e) });
  }
  generate() {
    if (this.gen.invalid) { this.gen.markAllAsTouched(); return; }
    this.busy.set(true);
    const v = this.gen.getRawValue();
    this.api.post<{ ids: number[]; questions: Question[] }>('/interviews/questions/generate', { jobTitle: v.jobTitle, company: v.company || undefined, jobDescription: v.jobDescription }).subscribe({
      next: (r) => { this.busy.set(false); this.questions.set(r.questions); this.chosen.set(new Set(r.ids)); this.toast.ok('Questions added and selected.'); },
      error: (e) => { this.busy.set(false); this.toast.error(e); },
    });
  }
  remove(s: SessionItem) {
    this.confirm.ask({ title: 'Delete this session?', message: `"${s.title}" and your answers will be removed.`, confirmLabel: 'Delete', danger: true }).subscribe((yes) => {
      if (yes) this.api.delete(`/interviews/sessions/${s.id}`).subscribe({ next: () => this.loadSessions(), error: (e) => this.toast.error(e) });
    });
  }
}
