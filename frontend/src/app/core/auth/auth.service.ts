import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, catchError, finalize, map, of, shareReplay, tap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { User } from '../models';

interface SessionData { user: User; accessToken: string }

/** The access token lives only in memory. The long-lived refresh token is an HttpOnly cookie that scripts can't read. */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private http = inject(HttpClient);
  private router = inject(Router);
  private url = `${environment.apiUrl}/auth`;
  private refreshing$: Observable<string | null> | null = null;

  readonly user = signal<User | null>(null);
  readonly token = signal<string | null>(null);
  readonly isLoggedIn = computed(() => !!this.user());
  readonly isAdmin = computed(() => !!this.user()?.roles.some((r) => r === 'admin' || r === 'super_admin'));
  readonly isSuperAdmin = computed(() => !!this.user()?.roles.includes('super_admin'));

  private adopt = (r: { data: SessionData }) => { this.user.set(r.data.user); this.token.set(r.data.accessToken); };

  login(email: string, password: string) { return this.http.post<{ data: SessionData }>(`${this.url}/login`, { email, password }).pipe(tap(this.adopt)); }
  register(fullName: string, email: string, password: string) { return this.http.post<{ data: SessionData }>(`${this.url}/register`, { fullName, email, password }).pipe(tap(this.adopt)); }
  forgot(email: string) { return this.http.post<{ data: { message: string } }>(`${this.url}/forgot-password`, { email }).pipe(map((r) => r.data.message)); }
  reset(token: string, password: string) { return this.http.post<{ data: { message: string } }>(`${this.url}/reset-password`, { token, password }).pipe(map((r) => r.data.message)); }
  verify(token: string) { return this.http.post<{ data: { message: string } }>(`${this.url}/verify-email`, { token }).pipe(map((r) => r.data.message)); }

  /** Concurrent callers share one request, because each refresh token can be used only once. */
  refresh(): Observable<string | null> {
    this.refreshing$ ??= this.http.post<{ data: SessionData }>(`${this.url}/refresh`, {}).pipe(
      tap(this.adopt),
      map((r) => r.data.accessToken),
      // Only a rejected session signs the user out. A rate limit, network drop or server error is
      // passed on as an error, so a brief problem doesn't cost anyone their session.
      catchError((e: HttpErrorResponse) => {
        if (e.status === 401 || e.status === 403) { this.clear(); return of(null); }
        return throwError(() => e);
      }),
      finalize(() => { this.refreshing$ = null; }),
      shareReplay(1),
    );
    return this.refreshing$;
  }

  logout() {
    this.http.post(`${this.url}/logout`, {}).pipe(catchError(() => of(null))).subscribe(() => {
      this.clear();
      void this.router.navigateByUrl('/login');
    });
  }

  clear() { this.user.set(null); this.token.set(null); }
}
