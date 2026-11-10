import { Component, HostListener, OnInit, inject } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { filter } from 'rxjs';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { AiStatusService } from '../../core/services/ai-status.service';
import { ConfigService } from '../../core/services/config.service';
import { NotificationCountService } from '../../core/services/notification-count.service';
import { AppHeader } from './app-header';
import { AppSidebar } from './app-sidebar';
import { ShellState } from './shell';

export const SHELL_STYLES = `:host { display: grid; height: 100vh; height: 100dvh; grid-template-columns: auto minmax(0, 1fr); background: var(--bg); }
  .side { width: var(--sidebar-w); transition: width var(--dur) var(--ease); height: 100%; min-height: 0; } .side.rail { width: var(--rail-w); }
  .main { display: flex; flex-direction: column; min-width: 0; min-height: 0; }
  main { flex: 1 1 auto; overflow: auto; min-height: 0; }
  .scrim { position: fixed; inset: 0; background: var(--scrim); z-index: 40; }
  @media (max-width: 767px) { :host { grid-template-columns: minmax(0, 1fr); }
    .side, .side.rail { position: fixed; z-index: 50; left: 0; top: 0; bottom: 0; width: 272px; transform: translateX(-100%); transition: transform var(--dur) var(--ease); box-shadow: var(--shadow-lg); visibility: hidden; border-radius: 0 var(--radius-lg) var(--radius-lg) 0; overflow: hidden; }
    .side.open { transform: none; visibility: visible; } }`;

/** DashboardLayout: the workspace shell for job seekers. */
@Component({
  selector: 'app-main-layout', imports: [RouterOutlet, AppHeader, AppSidebar], providers: [ShellState], styles: SHELL_STYLES,
  template: `<div class="side" [class.rail]="shell.collapsed()" [class.open]="shell.drawerOpen()">
      <app-sidebar [collapsed]="shell.collapsed()" (navigate)="shell.drawerOpen.set(false)" />
    </div>
    @if (shell.isSmall() && shell.drawerOpen()) { <div class="scrim" (click)="shell.drawerOpen.set(false)" aria-hidden="true"></div> }
    <div class="main">
      <app-header (menu)="shell.toggle()" />
      @if (config.config().announcement; as note) { <div class="notice info notice-bar" role="status">{{ note }}</div> }
      <main id="content"><router-outlet /></main>
    </div>`,
})
export class MainLayout implements OnInit {
  shell = inject(ShellState);
  config = inject(ConfigService);
  private count = inject(NotificationCountService);
  private ai = inject(AiStatusService);
  private router = inject(Router);

  constructor() {
    this.router.events.pipe(filter((e) => e instanceof NavigationEnd), takeUntilDestroyed()).subscribe(() => {
      document.getElementById('content')?.scrollTo(0, 0);
      this.count.refresh();
    });
  }
  ngOnInit() { this.count.refresh(); this.ai.load(); }
  @HostListener('document:keydown.escape') esc() { this.shell.drawerOpen.set(false); }
}
