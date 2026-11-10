import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatTooltipModule } from '@angular/material/tooltip';
import { BRAND } from '../../core/brand';
import { ConfigService } from '../../core/services/config.service';

export interface NavItem { label: string; icon: string; link: string; exact?: boolean; feature?: string }
export interface NavGroup { label: string; items: NavItem[] }

export const MAIN_NAV: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Dashboard', icon: 'space_dashboard', link: '/dashboard' }] },
  { label: 'Resume', items: [
    { label: 'Resumes', icon: 'description', link: '/resumes' }, { label: 'Scanner', icon: 'document_scanner', link: '/scanner' },
    { label: 'Optimizer', icon: 'auto_fix_high', link: '/optimizer' }, { label: 'Builder', icon: 'edit_document', link: '/builder', feature: 'resume_builder' },
  ] },
  { label: 'Jobs', items: [
    { label: 'Job search', icon: 'search', link: '/jobs', feature: 'job_search' }, { label: 'Best matches', icon: 'stars', link: '/matches', feature: 'job_search' }, { label: 'Tracker', icon: 'view_kanban', link: '/tracker' },
  ] },
  { label: 'Prepare', items: [
    { label: 'Cover letters', icon: 'mail', link: '/cover-letters', feature: 'cover_letters' }, { label: 'LinkedIn', icon: 'badge', link: '/linkedin', feature: 'linkedin' }, { label: 'Interview prep', icon: 'forum', link: '/interviews', feature: 'interview_prep' },
  ] },
];

@Component({
  selector: 'app-sidebar', imports: [RouterLink, RouterLinkActive, MatIconModule, MatTooltipModule], changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `:host { display: block; height: 100%; }
    nav { height: 100%; display: flex; flex-direction: column; gap: var(--space-5); padding: var(--space-4) var(--space-3) var(--space-4) var(--space-4); background: var(--bg); overflow-y: auto; overflow-x: hidden; }
    .brand { display: flex; align-items: center; gap: var(--space-3); height: 48px; padding: 0 var(--space-2); color: var(--text); }
    .brand:hover { text-decoration: none; } .brand img { width: 32px; height: 32px; flex: none; }
    .sub { font-size: 13px; font-weight: 500; letter-spacing: 0; color: var(--text-2); margin-left: 2px; }
    .glabel { font-size: 12px; font-weight: 500; letter-spacing: .01em; color: var(--text-2); padding: 0 var(--space-3) var(--space-1); }
    a.item { display: flex; align-items: center; gap: var(--space-3); height: 40px; padding: 0 var(--space-3); margin-bottom: 2px; border-radius: var(--radius-pill); color: var(--text); font-size: 15px; font-weight: 500; white-space: nowrap; transition: background-color var(--dur) var(--ease), color var(--dur) var(--ease); }
    a.item:hover { background: var(--surface-2); text-decoration: none; }
    a.item.active { background: var(--primary); color: var(--on-primary); }
    a.item .material-icons { font-size: 20px; width: 20px; height: 20px; flex: none; color: var(--text-2); }
    a.item:hover .material-icons { color: var(--text); } a.item.active .material-icons { color: inherit; }
    .collapsed { padding-left: var(--space-3); }
    .collapsed .item { justify-content: center; padding: 0; width: 44px; height: 44px; margin-left: auto; margin-right: auto; } .collapsed .brand { justify-content: center; padding: 0; }
    .collapsed .glabel { height: 1px; background: var(--border); padding: 0; margin: 0 var(--space-2) var(--space-2); overflow: hidden; color: transparent; }
    .bottom { margin-top: auto; }`,
  template: `<nav [class.collapsed]="collapsed()" [attr.aria-label]="navLabel()">
    <a class="brand" [routerLink]="home()" (click)="navigate.emit()"><img src="favicon.svg" alt="" />@if (!collapsed()) { <span class="wordmark">{{ brand.name }}@if (subtitle()) { <span class="sub">{{ subtitle() }}</span> }</span> }</a>
    @for (g of visible(); track g.label) {
      <div>
        <div class="glabel">{{ g.label }}</div>
        @for (i of g.items; track i.link) {
          <a class="item" [routerLink]="i.link" routerLinkActive="active" [routerLinkActiveOptions]="{ exact: !!i.exact }" (click)="navigate.emit()"
            [matTooltip]="collapsed() ? i.label : ''" matTooltipPosition="right" [attr.aria-label]="collapsed() ? i.label : null">
            <mat-icon aria-hidden="true">{{ i.icon }}</mat-icon>@if (!collapsed()) { <span>{{ i.label }}</span> }
          </a>
        }
      </div>
    }
    @if (footLink(); as f) {
      <div class="bottom"><a class="item" [routerLink]="f.link" (click)="navigate.emit()" [matTooltip]="collapsed() ? f.label : ''" matTooltipPosition="right" [attr.aria-label]="collapsed() ? f.label : null"><mat-icon aria-hidden="true">{{ f.icon }}</mat-icon>@if (!collapsed()) { <span>{{ f.label }}</span> }</a></div>
    }
  </nav>`,
})
export class AppSidebar {
  private config = inject(ConfigService);
  brand = BRAND;
  groups = input<NavGroup[]>(MAIN_NAV);
  collapsed = input(false);
  home = input('/dashboard');
  subtitle = input<string>();
  navLabel = input('Main');
  footLink = input<NavItem | null>(null);
  navigate = output<void>();
  visible = computed(() => this.groups()
    .map((g) => ({ ...g, items: g.items.filter((i) => !i.feature || this.config.enabled(i.feature)) }))
    .filter((g) => g.items.length));
}
