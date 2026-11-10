import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';

@Component({
  imports: [RouterLink, MatButtonModule],
  styles: `:host { display: grid; place-items: center; min-height: 100vh; padding: 24px; text-align: center; }`,
  template: `<div class="stack" style="align-items:center">
    <h1>Page not found</h1>
    <p class="muted">The page you asked for doesn't exist or has moved.</p>
    <a mat-flat-button routerLink="/dashboard">Go to dashboard</a>
  </div>`,
})
export class NotFoundPage {}
