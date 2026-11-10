import { Component, HostListener, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { AppHeader } from '../main-layout/app-header';
import { AppSidebar, NavGroup } from '../main-layout/app-sidebar';
import { SHELL_STYLES } from '../main-layout/main-layout';
import { ShellState } from '../main-layout/shell';

const NAV: NavGroup[] = [
  { label: 'Overview', items: [{ label: 'Metrics', icon: 'monitoring', link: '/admin', exact: true }] },
  { label: 'People', items: [{ label: 'Users', icon: 'group', link: '/admin/users' }, { label: 'Roles', icon: 'shield_person', link: '/admin/roles' }, { label: 'Plans and limits', icon: 'workspace_premium', link: '/admin/plans' }] },
  { label: 'Content', items: [{ label: 'Job sources', icon: 'cloud_sync', link: '/admin/job-sources' }, { label: 'Job categories', icon: 'category', link: '/admin/job-categories' }, { label: 'Skills', icon: 'psychology', link: '/admin/skills' }] },
  { label: 'System', items: [{ label: 'Features', icon: 'toggle_on', link: '/admin/features' }, { label: 'AI provider', icon: 'smart_toy', link: '/admin/ai' }, { label: 'Scoring rules', icon: 'tune', link: '/admin/scoring' }, { label: 'System logs', icon: 'receipt_long', link: '/admin/logs' }, { label: 'Settings', icon: 'settings', link: '/admin/settings' }] },
];

@Component({
  selector: 'app-admin-layout', imports: [RouterOutlet, AppHeader, AppSidebar], providers: [ShellState], styles: SHELL_STYLES,
  template: `<div class="side" [class.rail]="shell.collapsed()" [class.open]="shell.drawerOpen()">
      <app-sidebar [groups]="nav" home="/admin" subtitle="Admin" navLabel="Admin" [collapsed]="shell.collapsed()" [footLink]="back" (navigate)="shell.drawerOpen.set(false)" />
    </div>
    @if (shell.isSmall() && shell.drawerOpen()) { <div class="scrim" (click)="shell.drawerOpen.set(false)" aria-hidden="true"></div> }
    <div class="main">
      <app-header [showSearch]="false" (menu)="shell.toggle()" />
      <main><router-outlet /></main>
    </div>`,
})
export class AdminLayout {
  shell = inject(ShellState);
  nav = NAV;
  back = { label: 'Back to workspace', icon: 'arrow_back', link: '/dashboard' };
  @HostListener('document:keydown.escape') esc() { this.shell.drawerOpen.set(false); }
}
