import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { MatBadgeModule } from '@angular/material/badge';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatMenuModule } from '@angular/material/menu';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../core/auth/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { NotificationCountService } from '../../core/services/notification-count.service';
import { ThemeService } from '../../core/services/theme.service';

@Component({
  selector: 'app-header', imports: [ReactiveFormsModule, RouterLink, MatBadgeModule, MatButtonModule, MatIconModule, MatMenuModule, MatTooltipModule], changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `header { height: 56px; display: flex; align-items: center; gap: 8px; padding: 0 12px; background: var(--surface); border-bottom: 1px solid var(--border); }
    form.search { flex: 1 1 auto; max-width: 420px; position: relative; display: flex; align-items: center; }
    form.search .material-icons { position: absolute; left: 10px; font-size: 18px; width: 18px; height: 18px; color: var(--text-2); pointer-events: none; }
    form.search input { width: 100%; height: 36px; padding: 0 10px 0 34px; border-radius: 8px; border: 1px solid var(--border); background: var(--bg); color: var(--text); font: inherit; }
    form.search input:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
    .sp { flex: 1 1 auto; }
    .avatar { width: 32px; height: 32px; border-radius: 50%; background: var(--accent-soft); color: var(--accent); display: grid; place-items: center; font-weight: 600; font-size: 13px; }
    .who { padding: 8px 16px; max-width: 260px; }
    @media (max-width: 480px) { form.search { display: none; } }`,
  template: `<header>
    <button mat-icon-button type="button" (click)="menu.emit()" aria-label="Toggle navigation" matTooltip="Toggle navigation"><mat-icon>menu</mat-icon></button>
    @if (showSearch() && config.enabled('job_search')) {
      <form class="search" role="search" (submit)="search($event)">
        <mat-icon aria-hidden="true">search</mat-icon>
        <input type="search" [formControl]="q" placeholder="Search jobs" aria-label="Search jobs" />
      </form>
    }
    <span class="sp"></span>
    <button mat-icon-button type="button" (click)="theme.toggle()" [attr.aria-label]="theme.isDark() ? 'Use light theme' : 'Use dark theme'" [matTooltip]="theme.isDark() ? 'Use light theme' : 'Use dark theme'">
      <mat-icon>{{ theme.isDark() ? 'light_mode' : 'dark_mode' }}</mat-icon>
    </button>
    <a mat-icon-button routerLink="/notifications" [attr.aria-label]="count.unread() ? count.unread() + ' unread notifications' : 'Notifications'" matTooltip="Notifications">
      <mat-icon [matBadge]="count.unread() || null" matBadgeSize="small" aria-hidden="false">notifications</mat-icon>
    </a>
    <button mat-icon-button type="button" [matMenuTriggerFor]="account" aria-label="Account menu"><span class="avatar" aria-hidden="true">{{ initials() }}</span></button>
    <mat-menu #account="matMenu">
      <div class="who"><div class="strong truncate">{{ auth.user()?.fullName }}</div><div class="muted xs truncate">{{ auth.user()?.email }}</div></div>
      <a mat-menu-item routerLink="/profile"><mat-icon>person</mat-icon>Profile and settings</a>
      @if (auth.isAdmin()) { <a mat-menu-item routerLink="/admin"><mat-icon>admin_panel_settings</mat-icon>Admin portal</a> }
      @if (config.config().supportEmail; as mail) { <a mat-menu-item [href]="'mailto:' + mail"><mat-icon>support_agent</mat-icon>Contact support</a> }
      <button mat-menu-item type="button" (click)="auth.logout()"><mat-icon>logout</mat-icon>Sign out</button>
    </mat-menu>
  </header>`,
})
export class AppHeader {
  auth = inject(AuthService); theme = inject(ThemeService); count = inject(NotificationCountService);
  config = inject(ConfigService);
  private router = inject(Router);
  showSearch = input(true);
  menu = output<void>();
  q = new FormControl('', { nonNullable: true });
  initials = computed(() => (this.auth.user()?.fullName ?? '?').split(/\s+/).slice(0, 2).map((p) => p[0]).join('').toUpperCase());
  search(e: Event) {
    e.preventDefault();
    void this.router.navigate(['/jobs'], { queryParams: { q: this.q.value || null } });
  }
}
