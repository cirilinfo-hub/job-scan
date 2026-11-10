import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark' | 'system';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  readonly theme = signal<Theme>(this.read());
  constructor() { this.apply(this.theme()); }

  private read(): Theme {
    try { return (localStorage.getItem('rw-theme') as Theme) || 'light'; } catch { return 'light'; }
  }
  private apply(t: Theme) {
    if (t === 'system') document.documentElement.removeAttribute('data-theme');
    else document.documentElement.setAttribute('data-theme', t);
  }
  set(t: Theme) {
    this.theme.set(t);
    this.apply(t);
    try { localStorage.setItem('rw-theme', t); } catch { /* Private browsing: keep the theme for this session only. */ }
  }
  isDark(): boolean {
    const t = this.theme();
    return t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  }
  toggle() { this.set(this.isDark() ? 'light' : 'dark'); }
}
