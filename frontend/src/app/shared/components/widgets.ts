import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';

export const scoreTone = (s: number | null | undefined) => (s === null || s === undefined ? '' : s >= 75 ? 'success' : s >= 50 ? 'warning' : 'danger');
export const scoreWord = (s: number) => (s >= 75 ? 'Strong' : s >= 50 ? 'Moderate' : 'Weak');

@Component({
  selector: 'app-stat-card', imports: [MatIconModule, RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: block; height: 100%; }
    .s { display: flex; flex-direction: column; gap: var(--space-2); height: 100%; color: inherit; padding: var(--space-5); }
    a.s:hover { text-decoration: none; } a.s:hover .v { color: var(--accent); }
    .t { display: flex; align-items: center; justify-content: space-between; color: var(--text-2); font-size: 13px; font-weight: 500; gap: var(--space-2); }
    .ic { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 50%; background: var(--surface-2); color: var(--text); flex: none; }
    .ic .material-icons { font-size: 18px; width: 18px; height: 18px; }
    .v { font-size: 36px; line-height: 1; font-weight: 500; letter-spacing: -0.03em; font-variant-numeric: tabular-nums; margin-top: var(--space-2); transition: color var(--dur) var(--ease); }`,
  template: `<div class="card card-tight h-full">
    <a class="s" [routerLink]="link()">
      <span class="t">{{ label() }} <span class="ic"><mat-icon aria-hidden="true">{{ icon() }}</mat-icon></span></span>
      <span class="v">{{ value() ?? '–' }}</span>
      @if (hint()) { <span class="muted xs">{{ hint() }}</span> }
    </a></div>`,
})
export class StatCard {
  label = input.required<string>(); value = input<string | number | null>(null); icon = input('insights'); hint = input<string>(); link = input<string>('.');
}

@Component({
  selector: 'app-score', changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: inline-flex; } svg { display: block; transform: rotate(-90deg); }
    .wrap { position: relative; display: inline-grid; place-items: center; }
    .n { position: absolute; font-weight: 600; font-variant-numeric: tabular-nums; }
    .track { stroke: var(--surface-2); } .n { color: var(--text); letter-spacing: -0.02em; } .success { stroke: var(--success); } .warning { stroke: var(--warning); } .danger { stroke: var(--danger); }`,
  template: `<div class="wrap" role="img" [attr.aria-label]="label() + ': ' + (value() ?? 'not available') + ' out of 100'">
    <svg [attr.width]="size()" [attr.height]="size()" viewBox="0 0 36 36" aria-hidden="true">
      <circle class="track" cx="18" cy="18" r="15.5" fill="none" stroke-width="3.5" />
      <circle [class]="tone()" cx="18" cy="18" r="15.5" fill="none" stroke-width="3.5" stroke-linecap="round" pathLength="100" [attr.stroke-dasharray]="(value() ?? 0) + ' 100'" />
    </svg>
    <span class="n" [style.font-size.px]="size() * 0.3">{{ value() ?? '–' }}</span>
  </div>`,
})
export class ScoreIndicator {
  value = input<number | null>(null); size = input(56); label = input('Score');
  tone = computed(() => scoreTone(this.value()));
}

@Component({
  selector: 'app-progress', changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.bar { height: 8px; border-radius: var(--radius-pill); background: var(--surface-2); overflow: hidden; } .fill { height: 100%; border-radius: var(--radius-pill); background: var(--accent); transition: width var(--dur) var(--ease); }
    .fill.success { background: var(--success); } .fill.warning { background: var(--warning); } .fill.danger { background: var(--danger); }`,
  template: `<div class="bar" role="progressbar" [attr.aria-valuenow]="value()" aria-valuemin="0" aria-valuemax="100" [attr.aria-label]="label()"><div class="fill" [class]="tone()" [style.width.%]="value()"></div></div>`,
})
export class ProgressBar { value = input(0); tone = input(''); label = input('Progress'); }

const STATUS: Record<string, { tone: string; label: string }> = {
  saved: { tone: '', label: 'Saved' }, applied: { tone: 'info', label: 'Applied' }, assessment: { tone: 'warning', label: 'Assessment' },
  interview: { tone: 'accent', label: 'Interview' }, offer: { tone: 'success', label: 'Offer' }, rejected: { tone: 'danger', label: 'Rejected' },
  active: { tone: 'success', label: 'Active' }, suspended: { tone: 'danger', label: 'Suspended' }, completed: { tone: 'success', label: 'Completed' },
  ai: { tone: 'accent', label: 'AI' }, rule: { tone: '', label: 'Rule-based' }, template: { tone: 'info', label: 'Template' }, manual: { tone: '', label: 'Edited by you' }, bank: { tone: '', label: 'Question bank' },
  pending: { tone: 'warning', label: 'Pending' }, accepted: { tone: 'success', label: 'Accepted' },
  ok: { tone: 'success', label: 'OK' }, error: { tone: 'danger', label: 'Error' }, info: { tone: 'info', label: 'Info' }, warn: { tone: 'warning', label: 'Warning' },
};

@Component({
  selector: 'app-status', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<span class="badge" [class]="'badge ' + meta().tone">{{ meta().label }}</span>`,
})
export class StatusBadge {
  status = input.required<string>();
  meta = computed(() => STATUS[this.status()] ?? { tone: '', label: this.status() });
}
export const stageLabel = (s: string) => STATUS[s]?.label ?? s;

@Component({
  selector: 'app-empty', imports: [MatIconModule, MatButtonModule, RouterLink], changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.e { display: flex; flex-direction: column; align-items: center; text-align: center; gap: var(--space-3); padding: var(--space-8) var(--space-4); }
    .ei { display: grid; place-items: center; width: 64px; height: 64px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); margin-bottom: var(--space-1); }
    .ei .material-icons { font-size: 30px; height: 30px; width: 30px; } .e p { color: var(--text-2); max-width: 420px; }`,
  template: `<div class="e">
    <span class="ei"><mat-icon aria-hidden="true">{{ icon() }}</mat-icon></span>
    <h2>{{ title() }}</h2>
    @if (text()) { <p>{{ text() }}</p> }
    @if (actionLink()) { <a mat-flat-button [routerLink]="actionLink()">{{ actionLabel() }}</a> }
    <ng-content />
  </div>`,
})
export class EmptyState {
  icon = input('inbox'); title = input.required<string>(); text = input<string>(); actionLabel = input<string>(); actionLink = input<string>();
}

@Component({
  selector: 'app-skeleton', changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.sk { border-radius: var(--radius-lg); background: var(--surface-2); animation: p 1.4s ease-in-out infinite; } @keyframes p { 50% { opacity: .55; } }`,
  template: `<div class="grid" [style.grid-template-columns]="'repeat(auto-fill, minmax(min(100%,' + min() + 'px), 1fr))'" role="status" aria-label="Loading">
    @for (i of items(); track i) { <div class="sk" [style.height.px]="height()"></div> }
  </div>`,
})
export class LoadingSkeleton {
  count = input(3); height = input(96); min = input(240);
  items = computed(() => Array.from({ length: this.count() }, (_, i) => i));
}

@Component({
  selector: 'app-error', imports: [MatButtonModule, MatIconModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="notice danger" role="alert"><mat-icon aria-hidden="true">error_outline</mat-icon>
    <div class="grow">{{ message() }}</div>
    <button mat-button type="button" (click)="retry.emit()">Try again</button></div>`,
})
export class ErrorBlock { message = input('This could not be loaded.'); retry = output<void>(); }

@Component({
  selector: 'app-ai-notice', imports: [MatIconModule], changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<div class="notice warning"><mat-icon aria-hidden="true">info</mat-icon>
    <div>AI features aren't available on this server right now. {{ text() }}</div></div>`,
})
export class AiNotice { text = input(''); }
