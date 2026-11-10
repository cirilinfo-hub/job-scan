import { Injectable, inject } from '@angular/core';
import { HttpErrorResponse } from '@angular/common/http';
import { MatSnackBar } from '@angular/material/snack-bar';

export function errorMessage(err: unknown, fallback = 'Something went wrong. Please try again.'): string {
  if (err instanceof HttpErrorResponse) {
    if (err.status === 0) return 'We could not reach the server. Check your connection and try again.';
    return err.error?.error?.message ?? fallback;
  }
  return fallback;
}

/** NotificationToast: one place for short, polite status messages. */
@Injectable({ providedIn: 'root' })
export class ToastService {
  private bar = inject(MatSnackBar);
  ok(message: string) { this.bar.open(message, 'Dismiss', { duration: 4000, politeness: 'polite' }); }
  error(err: unknown, fallback?: string) {
    this.bar.open(typeof err === 'string' ? err : errorMessage(err, fallback), 'Dismiss', { duration: 7000, politeness: 'assertive', panelClass: 'toast-error' });
  }
}
