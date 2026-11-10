import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  imports: [RouterLink, MatButtonModule],
  styles: `:host { display: grid; place-items: center; min-height: 100vh; min-height: 100dvh; padding: var(--space-6); text-align: center; background: var(--bg); }
    .code { font-size: clamp(72px, 14vw, 140px); line-height: .9; font-weight: 600; letter-spacing: -0.05em; color: var(--blue-600); }`,
  template: `<div class="stack items-center">
    <p class="code" aria-hidden="true">404</p>
    <h1>Page not found</h1>
    <p class="muted">The page you asked for doesn't exist or has moved.</p>
    <a mat-flat-button routerLink="/dashboard">Go to dashboard</a>
  </div>`,
})
export class NotFoundPage {}
