import { Component, inject, input, signal } from '@angular/core';
import { FormBuilder, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';
import { ConfigService } from '../../core/services/config.service';
import { errorMessage } from '../../core/services/toast.service';
import { UI } from '../../shared/ui';

const PASSWORD = [Validators.required, Validators.minLength(10), Validators.maxLength(72), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)];
const PW_HINT = 'At least 10 characters, with a letter and a number.';

@Component({
  imports: [UI],
  template: `<form class="stack" [formGroup]="form" (ngSubmit)="submit()">
    <div><h1>Sign in</h1><p class="muted">Welcome back.</p></div>
    @if (error()) { <div class="notice danger" role="alert">{{ error() }}</div> }
    <div>
      <mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput type="email" autocomplete="email" formControlName="email" /><mat-error>Enter a valid email address.</mat-error></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Password</mat-label><input matInput type="password" autocomplete="current-password" formControlName="password" /><mat-error>Enter your password.</mat-error></mat-form-field>
    </div>
    <button mat-flat-button class="btn-accent btn-lg" type="submit" [disabled]="busy()">{{ busy() ? 'Signing in...' : 'Sign in' }}</button>
    <div class="row between small"><a routerLink="/forgot-password">Forgot password?</a>@if (config.enabled('registration')) { <a routerLink="/register">Create an account</a> }</div>
  </form>`,
})
export class LoginPage {
  private auth = inject(AuthService); private router = inject(Router);
  config = inject(ConfigService);
  returnUrl = input<string>();
  busy = signal(false); error = signal('');
  form = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]], password: ['', Validators.required] });
  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true); this.error.set('');
    const { email, password } = this.form.getRawValue();
    this.auth.login(email, password).subscribe({
      next: () => void this.router.navigateByUrl(this.returnUrl()?.startsWith('/') ? this.returnUrl()! : '/dashboard'),
      error: (e) => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }
}

@Component({
  imports: [UI],
  template: `<form class="stack" [formGroup]="form" (ngSubmit)="submit()">
    <div><h1>Create your account</h1><p class="muted">Compare your resume with jobs and track your applications.</p></div>
    @if (!config.enabled('registration')) { <div class="notice warning" role="status">New registrations are closed right now.</div> }
    @if (error()) { <div class="notice danger" role="alert">{{ error() }}</div> }
    <div>
      <mat-form-field appearance="outline"><mat-label>Full name</mat-label><input matInput autocomplete="name" formControlName="fullName" /><mat-error>Enter your name.</mat-error></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput type="email" autocomplete="email" formControlName="email" /><mat-error>Enter a valid email address.</mat-error></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Password</mat-label><input matInput type="password" autocomplete="new-password" formControlName="password" /><mat-hint>{{ hint }}</mat-hint><mat-error>{{ hint }}</mat-error></mat-form-field>
    </div>
    <button mat-flat-button class="btn-accent btn-lg" type="submit" [disabled]="busy() || !config.enabled('registration')">{{ busy() ? 'Creating account...' : 'Create account' }}</button>
    <div class="small">Already registered? <a routerLink="/login">Sign in</a></div>
  </form>`,
})
export class RegisterPage {
  private auth = inject(AuthService); private router = inject(Router);
  config = inject(ConfigService);
  hint = PW_HINT; busy = signal(false); error = signal('');
  form = inject(FormBuilder).nonNullable.group({ fullName: ['', [Validators.required, Validators.minLength(2)]], email: ['', [Validators.required, Validators.email]], password: ['', PASSWORD] });
  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true); this.error.set('');
    const v = this.form.getRawValue();
    this.auth.register(v.fullName, v.email, v.password).subscribe({
      next: () => void this.router.navigateByUrl('/dashboard'),
      error: (e) => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }
}

@Component({
  imports: [UI],
  template: `<form class="stack" [formGroup]="form" (ngSubmit)="submit()">
    <div><h1>Reset your password</h1><p class="muted">We'll email you a link to set a new one.</p></div>
    @if (done()) { <div class="notice info" role="status">{{ done() }}</div> }
    @if (error()) { <div class="notice danger" role="alert">{{ error() }}</div> }
    <mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput type="email" autocomplete="email" formControlName="email" /><mat-error>Enter a valid email address.</mat-error></mat-form-field>
    <button mat-flat-button class="btn-accent btn-lg" type="submit" [disabled]="busy()">Send reset link</button>
    <a class="small" routerLink="/login">Back to sign in</a>
  </form>`,
})
export class ForgotPage {
  private auth = inject(AuthService);
  busy = signal(false); done = signal(''); error = signal('');
  form = inject(FormBuilder).nonNullable.group({ email: ['', [Validators.required, Validators.email]] });
  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true); this.error.set('');
    this.auth.forgot(this.form.getRawValue().email).subscribe({
      next: (m) => { this.busy.set(false); this.done.set(m); },
      error: (e) => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }
}

@Component({
  imports: [UI],
  template: `<form class="stack" [formGroup]="form" (ngSubmit)="submit()">
    <h1>Choose a new password</h1>
    @if (!token()) { <div class="notice danger" role="alert">This link is missing its token. <a routerLink="/forgot-password">Request a new link</a>.</div> }
    @if (error()) { <div class="notice danger" role="alert">{{ error() }}</div> }
    <mat-form-field appearance="outline"><mat-label>New password</mat-label><input matInput type="password" autocomplete="new-password" formControlName="password" /><mat-hint>{{ hint }}</mat-hint><mat-error>{{ hint }}</mat-error></mat-form-field>
    <button mat-flat-button class="btn-accent btn-lg" type="submit" [disabled]="busy() || !token()">Reset password</button>
  </form>`,
})
export class ResetPage {
  private auth = inject(AuthService); private router = inject(Router);
  token = input<string>();
  hint = PW_HINT; busy = signal(false); error = signal('');
  form = inject(FormBuilder).nonNullable.group({ password: ['', PASSWORD] });
  submit() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    this.busy.set(true); this.error.set('');
    this.auth.reset(this.token()!, this.form.getRawValue().password).subscribe({
      next: () => void this.router.navigate(['/login']),
      error: (e) => { this.busy.set(false); this.error.set(errorMessage(e)); },
    });
  }
}
