import { HttpErrorResponse, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router, UrlTree } from '@angular/router';
import { Application, Stage } from './models';
import { AuthService } from './auth/auth.service';
import { adminGuard, authGuard, guestGuard } from './guards/auth.guards';
import { authInterceptor } from './interceptors/auth.interceptor';
import { ApiService, toParams } from './services/api.service';
import { errorMessage } from './services/toast.service';
import { highlight } from '../features/resume-scanner/report-page';
import { blankResume, DEFAULT_ORDER } from '../shared/components/resume-editor';
import { niceEnum, salaryText } from '../shared/components/job-card';
import { scoreTone, scoreWord, ScoreIndicator, StatusBadge, EmptyState, ProgressBar } from '../shared/components/widgets';
import { toLocalInput } from '../features/job-tracker/application-dialog';
import { firstValueFrom } from 'rxjs';

const setup = () => TestBed.configureTestingModule({
  providers: [provideRouter([{ path: '**', component: class {} as never }]), provideHttpClient(withInterceptors([authInterceptor])), provideHttpClientTesting()],
});

const session = (over = {}) => ({ data: { accessToken: 'new-token', user: { id: 1, email: 'a@b.c', fullName: 'A B', emailVerified: true, roles: ['job_seeker'], theme: 'light', emailNotifications: false, createdAt: '', ...over } } });

describe('auth interceptor', () => {
  beforeEach(setup);

  it('attaches the token, the CSRF header and credentials', () => {
    const api = TestBed.inject(ApiService); const http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).token.set('abc');
    api.get('/x').subscribe();
    const req = http.expectOne('/api/v1/x');
    expect(req.request.headers.get('Authorization')).toBe('Bearer abc');
    expect(req.request.headers.get('X-Requested-With')).toBe('rolewise');
    expect(req.request.withCredentials).toBe(true);
    req.flush({ success: true, data: 1 });
  });

  it('refreshes once on 401 and retries with the new token', async () => {
    const api = TestBed.inject(ApiService); const http = TestBed.inject(HttpTestingController);
    TestBed.inject(AuthService).token.set('old');
    const results: unknown[] = [];
    api.get('/a').subscribe((r) => results.push(r));
    api.get('/b').subscribe((r) => results.push(r));
    http.expectOne('/api/v1/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/v1/b').flush({}, { status: 401, statusText: 'Unauthorized' });
    // Two failures share one refresh, because each refresh token can be used only once.
    http.expectOne('/api/v1/auth/refresh').flush(session());
    const a = http.expectOne('/api/v1/a'); const b = http.expectOne('/api/v1/b');
    expect(a.request.headers.get('Authorization')).toBe('Bearer new-token');
    a.flush({ success: true, data: 'A' }); b.flush({ success: true, data: 'B' });
    expect(results).toEqual(['A', 'B']);
  });

  it('signs out and goes to login when the refresh fails', () => {
    const api = TestBed.inject(ApiService); const http = TestBed.inject(HttpTestingController); const auth = TestBed.inject(AuthService);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.token.set('old');
    let failed = false;
    api.get('/a').subscribe({ error: () => { failed = true; } });
    http.expectOne('/api/v1/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 401, statusText: 'Unauthorized' });
    expect(failed).toBe(true);
    expect(auth.token()).toBeNull();
    expect(nav.mock.calls[0][0]).toEqual(['/login']);
  });

  it('keeps the session when the refresh is only rate-limited', () => {
    const api = TestBed.inject(ApiService); const http = TestBed.inject(HttpTestingController); const auth = TestBed.inject(AuthService);
    const nav = vi.spyOn(TestBed.inject(Router), 'navigate').mockResolvedValue(true);
    auth.user.set(session().data.user as never);
    auth.token.set('old');
    let status = 0;
    api.get('/a').subscribe({ error: (e) => { status = e.status; } });
    http.expectOne('/api/v1/a').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectOne('/api/v1/auth/refresh').flush({}, { status: 429, statusText: 'Too Many Requests' });
    expect(status).toBe(429);
    expect(auth.user()).not.toBeNull();
    expect(nav).not.toHaveBeenCalled();
  });

  it('does not try to refresh after a failed login', () => {
    const http = TestBed.inject(HttpTestingController);
    let status = 0;
    TestBed.inject(AuthService).login('a@b.c', 'x').subscribe({ error: (e) => { status = e.status; } });
    http.expectOne('/api/v1/auth/login').flush({}, { status: 401, statusText: 'Unauthorized' });
    http.expectNone('/api/v1/auth/refresh');
    expect(status).toBe(401);
  });

  it('never sends the token to other origins', () => {
    TestBed.inject(AuthService).token.set('secret');
    const http = TestBed.inject(HttpTestingController);
    TestBed.runInInjectionContext(() => TestBed.inject(ApiService));
    const client = TestBed.inject(ApiService)['http'];
    client.get('https://example.com/x').subscribe();
    expect(http.expectOne('https://example.com/x').request.headers.has('Authorization')).toBe(false);
  });
});

describe('guards', () => {
  beforeEach(setup);
  const run = (g: typeof authGuard, url = '/x') => TestBed.runInInjectionContext(() => g({} as never, { url } as never));

  it('sends signed-out users to login with a return URL', () => {
    const r = run(authGuard, '/tracker') as UrlTree;
    expect(r.toString()).toBe('/login?returnUrl=%2Ftracker');
  });
  it('lets signed-in users in and keeps them out of guest pages', () => {
    TestBed.inject(AuthService).user.set(session().data.user as never);
    expect(run(authGuard)).toBe(true);
    expect((run(guestGuard) as UrlTree).toString()).toBe('/dashboard');
  });
  it('allows only admin roles into the admin portal', () => {
    const auth = TestBed.inject(AuthService);
    auth.user.set(session().data.user as never);
    expect((run(adminGuard) as UrlTree).toString()).toBe('/dashboard');
    auth.user.set(session({ roles: ['admin'] }).data.user as never);
    expect(run(adminGuard)).toBe(true);
    expect(auth.isSuperAdmin()).toBe(false);
  });
});

describe('api service', () => {
  beforeEach(setup);
  it('omits empty query values', () => {
    expect(toParams({ a: 1, b: '', c: null, d: undefined, e: false }).toString()).toBe('a=1&e=false');
  });
  it('unwraps data and page envelopes', async () => {
    const api = TestBed.inject(ApiService); const http = TestBed.inject(HttpTestingController);
    const p = firstValueFrom(api.page<number>('/n', { page: 2 }));
    http.expectOne('/api/v1/n?page=2').flush({ success: true, data: [1, 2], meta: { page: 2, pageSize: 2, total: 4, totalPages: 2 } });
    expect(await p).toEqual({ items: [1, 2], meta: { page: 2, pageSize: 2, total: 4, totalPages: 2 } });
  });
});

describe('errorMessage', () => {
  it('prefers the server message and explains connection failures', () => {
    expect(errorMessage(new HttpErrorResponse({ status: 422, error: { error: { message: 'Nope' } } }))).toBe('Nope');
    expect(errorMessage(new HttpErrorResponse({ status: 0 }))).toMatch(/could not reach/);
    expect(errorMessage(new Error('x'), 'Fallback')).toBe('Fallback');
  });
});

describe('side-by-side highlighting', () => {
  it('marks whole terms and keeps the text intact', () => {
    const text = 'Java and JavaScript with C++ daily';
    const parts = highlight(text, [{ term: 'Java', cls: 'a' }, { term: 'C++', cls: 'b' }]);
    expect(parts.map((p) => p.text).join('')).toBe(text);
    expect(parts.filter((p) => p.cls).map((p) => p.text)).toEqual(['Java', 'C++']);
  });
  it('prefers the longer term when terms overlap', () => {
    expect(highlight('Machine Learning', [{ term: 'Machine', cls: 'a' }, { term: 'Machine Learning', cls: 'b' }])[0]).toEqual({ text: 'Machine Learning', cls: 'b' });
  });
  it('keeps user text as plain data, including markup and regex characters', () => {
    const text = '<img src=x onerror=alert(1)> (.*) Go';
    expect(highlight(text, [{ term: '(.*)', cls: 'x' }]).map((p) => p.text).join('')).toBe(text);
  });
  it('handles no terms', () => { expect(highlight('abc', [])).toEqual([{ text: 'abc', cls: '' }]); });
});

describe('helpers', () => {
  it('words and colours scores consistently', () => {
    expect([scoreTone(80), scoreTone(60), scoreTone(10), scoreTone(null)]).toEqual(['success', 'warning', 'danger', '']);
    expect([scoreWord(75), scoreWord(50), scoreWord(49)]).toEqual(['Strong', 'Moderate', 'Weak']);
  });
  it('formats salary and enums', () => {
    expect(salaryText({ salary_min: null, salary_max: null, salary_currency: null })).toBe('');
    expect(salaryText({ salary_min: 1000, salary_max: null, salary_currency: 'USD' })).toBe('1,000 USD');
    expect(niceEnum('full_time')).toBe('Full-time');
    expect(niceEnum('unknown')).toBe('');
  });
  it('creates a blank resume with every section in order', () => {
    expect(blankResume().sectionOrder).toEqual(DEFAULT_ORDER);
    expect(blankResume().experience).toEqual([]);
  });
  it('converts stored times to datetime-local values', () => {
    expect(toLocalInput(null)).toBe('');
    expect(new Date(toLocalInput('2026-03-01T10:30:00.000Z')).toISOString()).toBe('2026-03-01T10:30:00.000Z');
  });
});

@Component({ imports: [ScoreIndicator, StatusBadge, ProgressBar], template: `<app-score [value]="v()" label="Match" /><app-status [status]="s()" /><app-progress [value]="v() ?? 0" label="Bar" />` })
class Host { v = signal<number | null>(82); s = signal('offer'); }

describe('widgets', () => {
  beforeEach(setup);
  it('exposes scores and status in text, not just colour', async () => {
    const f = TestBed.createComponent(Host);
    await f.whenStable();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('[role=img]')?.getAttribute('aria-label')).toBe('Match: 82 out of 100');
    expect(el.querySelector('.badge')?.textContent?.trim()).toBe('Offer');
    expect(el.querySelector('[role=progressbar]')?.getAttribute('aria-valuenow')).toBe('82');
    f.componentInstance.v.set(null);
    await f.whenStable();
    expect(el.querySelector('[role=img]')?.getAttribute('aria-label')).toBe('Match: not available out of 100');
  });
  it('renders empty states with an action', async () => {
    const f = TestBed.createComponent(EmptyState);
    f.componentRef.setInput('title', 'Nothing here');
    f.componentRef.setInput('actionLink', '/resumes');
    f.componentRef.setInput('actionLabel', 'Add one');
    await f.whenStable();
    const a = (f.nativeElement as HTMLElement).querySelector('a');
    expect(a?.textContent?.trim()).toBe('Add one');
    expect(a?.getAttribute('href')).toBe('/resumes');
  });
});

export type _Keep = Application | Stage;
