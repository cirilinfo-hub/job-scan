import { Component, OnInit, computed, inject, input, signal } from '@angular/core';
import { FormControl } from '@angular/forms';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { ErrorBlock, LoadingSkeleton, ProgressBar, ScoreIndicator, StatusBadge } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

interface Answer {
  id: number; question: string; category: string; guidance: string | null; sample_answer: string | null; answer: string | null; answered_at: string | null;
  rule_feedback: { words: number; star: Record<string, boolean>; notes: string[] } | null;
  ai_feedback: { score: number; strengths: string[]; improvements: string[]; improvedOutline: string } | null;
}
interface Session { id: number; title: string; status: string; answers: Answer[] }

@Component({
  imports: [UI, ErrorBlock, LoadingSkeleton, ProgressBar, ScoreIndicator, StatusBadge],
  template: `<div class="page page-narrow">
    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (!s() && !error()) { <app-skeleton [count]="1" [height]="340" [min]="500" /> }
    @if (s(); as s) {
      <div class="page-head">
        <div><a class="small" routerLink="/interviews">Interview prep</a><h1>{{ s.title }}</h1><p>{{ answered() }} of {{ s.answers.length }} answered</p></div>
        <div class="actions"><app-status [status]="s.status" />@if (s.status === 'active') { <button mat-stroked-button type="button" (click)="complete()">Finish session</button> }</div>
      </div>
      <app-progress [value]="s.answers.length ? (answered() / s.answers.length) * 100 : 0" label="Session progress" />
      @if (cur(); as a) {
        <section class="card stack">
          <div class="muted small">Question {{ index() + 1 }} of {{ s.answers.length }}</div>
          <h2>{{ a.question }}</h2>
          <mat-form-field appearance="outline"><mat-label>Your answer</mat-label><textarea matInput rows="9" [formControl]="text"></textarea></mat-form-field>
          <div class="row">
            <button mat-flat-button type="button" [disabled]="!text.value.trim() || busy()" (click)="save()">Save and check</button>
            @if (ai.available() && a.answer) { <button mat-stroked-button type="button" [disabled]="aiBusy()" (click)="aiFeedback()"><mat-icon>auto_awesome</mat-icon>{{ aiBusy() ? 'Reviewing...' : 'Get AI feedback' }}</button> }
          </div>
          <details class="small"><summary style="cursor:pointer; color:var(--accent)">Guidance and sample outline</summary><p style="margin-top:4px">{{ a.guidance }}</p><p class="muted" style="margin-top:4px">{{ a.sample_answer }}</p></details>
        </section>
        @if (a.rule_feedback; as f) {
          <section class="card stack small">
            <div class="row between"><h2>Structure check</h2><span class="badge">Rule-based</span></div>
            <p class="muted xs">A simple text check of length and structure. It can't judge how good or true your answer is.</p>
            <div class="chips">@for (k of starKeys; track k) { <span class="chip" [class.ok]="f.star[k]"><mat-icon aria-hidden="true" style="font-size:14px;width:14px;height:14px">{{ f.star[k] ? 'check' : 'remove' }}</mat-icon>{{ k }}</span> }<span class="chip">{{ f.words }} words</span></div>
            @for (n of f.notes; track n) { <div>{{ n }}</div> } @empty { <div>No structure issues spotted.</div> }
          </section>
        }
        @if (a.ai_feedback; as f) {
          <section class="card stack small">
            <div class="row" style="flex-wrap:nowrap; gap:12px"><app-score [value]="f.score" [size]="56" label="AI answer rating" /><div><h2>AI feedback</h2><p class="muted xs">One AI reviewer's opinion on this answer. It isn't how an interviewer would score you.</p></div></div>
            <div><h3>Strengths</h3>@for (x of f.strengths; track x) { <div>{{ x }}</div> }</div>
            <div><h3>To improve</h3>@for (x of f.improvements; track x) { <div>{{ x }}</div> }</div>
            <div><h3>Improved outline</h3><pre>{{ f.improvedOutline }}</pre></div>
          </section>
        }
        <div class="row between">
          <button mat-stroked-button type="button" [disabled]="index() === 0" (click)="go(index() - 1)"><mat-icon>arrow_back</mat-icon>Previous</button>
          <button mat-stroked-button type="button" [disabled]="index() >= s.answers.length - 1" (click)="go(index() + 1)">Next<mat-icon iconPositionEnd>arrow_forward</mat-icon></button>
        </div>
      }
    }
  </div>`,
})
export class SessionPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  ai = inject(AiStatusService);
  id = input.required<string>();
  s = signal<Session | null>(null); index = signal(0); error = signal(''); busy = signal(false); aiBusy = signal(false);
  text = new FormControl('', { nonNullable: true });
  starKeys = ['situation', 'task', 'action', 'result'];
  cur = computed(() => this.s()?.answers[this.index()] ?? null);
  answered = computed(() => this.s()?.answers.filter((a) => a.answered_at).length ?? 0);
  ngOnInit() { this.load(); }
  load() { this.error.set(''); this.api.get<Session>(`/interviews/sessions/${this.id()}`).subscribe({ next: (s) => { this.s.set(s); this.go(Math.max(0, s.answers.findIndex((a) => !a.answered_at))); }, error: (e) => this.error.set(errorMessage(e)) }); }
  go(i: number) { this.index.set(i); this.text.setValue(this.s()?.answers[i]?.answer ?? ''); }
  save() {
    this.busy.set(true);
    this.api.put<Session>(`/interviews/sessions/${this.id()}/answers/${this.cur()!.id}`, { answer: this.text.value }).subscribe({ next: (s) => { this.s.set(s); this.busy.set(false); }, error: (e) => { this.busy.set(false); this.toast.error(e); } });
  }
  aiFeedback() {
    this.aiBusy.set(true);
    this.api.post<Session>(`/interviews/sessions/${this.id()}/answers/${this.cur()!.id}/ai-feedback`).subscribe({ next: (s) => { this.s.set(s); this.aiBusy.set(false); }, error: (e) => { this.aiBusy.set(false); this.toast.error(e); } });
  }
  complete() { this.api.post<Session>(`/interviews/sessions/${this.id()}/complete`).subscribe({ next: (s) => { this.s.set(s); this.toast.ok('Session finished.'); }, error: (e) => this.toast.error(e) }); }
}
