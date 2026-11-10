import { Component, OnInit, inject, input, signal } from '@angular/core';
import { AuthService } from '../../core/auth/auth.service';
import { errorMessage } from '../../core/services/toast.service';
import { UI } from '../../shared/ui';

@Component({
  imports: [UI],
  styles: `:host { display: grid; place-items: center; min-height: 100vh; min-height: 100dvh; padding: var(--space-4); background: var(--bg); }
    .card { max-width: 440px; width: 100%; padding: var(--space-8); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); }`,
  template: `<main class="card stack">
    <h1>Email verification</h1>
    @if (state() === 'busy') { <p class="muted" role="status">Checking your link...</p> }
    @if (state() === 'ok') { <div class="notice info" role="status">{{ message() }}</div> }
    @if (state() === 'error') { <div class="notice danger" role="alert">{{ message() }}</div> }
    @if (state() !== 'busy') { <a mat-flat-button [routerLink]="auth.isLoggedIn() ? '/dashboard' : '/login'">Continue</a> }
  </main>`,
})
export class VerifyPage implements OnInit {
  auth = inject(AuthService);
  token = input<string>();
  state = signal<'busy' | 'ok' | 'error'>('busy');
  message = signal('');
  ngOnInit() {
    if (!this.token()) { this.state.set('error'); this.message.set('This link is missing its token.'); return; }
    this.auth.verify(this.token()!).subscribe({
      next: (m) => {
        this.state.set('ok'); this.message.set(m);
        const u = this.auth.user();
        if (u) this.auth.user.set({ ...u, emailVerified: true });
      },
      error: (e) => { this.state.set('error'); this.message.set(errorMessage(e)); },
    });
  }
}
