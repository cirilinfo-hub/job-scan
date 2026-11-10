import { BreakpointObserver } from '@angular/cdk/layout';
import { Injectable, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';

/** Sidebar behaviour for all layouts: wide = full or rail, medium = rail, small = off-canvas drawer. */
@Injectable()
export class ShellState {
  private bp = inject(BreakpointObserver);
  readonly isSmall = toSignal(this.bp.observe('(max-width: 767px)').pipe(map((r) => r.matches)), { initialValue: false });
  readonly isMedium = toSignal(this.bp.observe('(max-width: 1199px)').pipe(map((r) => r.matches)), { initialValue: false });
  readonly userCollapsed = signal(this.read());
  readonly drawerOpen = signal(false);

  private read() { try { return localStorage.getItem('rw-sidebar') === 'rail'; } catch { return false; } }
  collapsed() { return !this.isSmall() && (this.isMedium() || this.userCollapsed()); }
  toggle() {
    if (this.isSmall()) { this.drawerOpen.update((v) => !v); return; }
    this.userCollapsed.update((v) => !v);
    try { localStorage.setItem('rw-sidebar', this.userCollapsed() ? 'rail' : 'full'); } catch { /* Not remembered in private browsing. */ }
  }
}
