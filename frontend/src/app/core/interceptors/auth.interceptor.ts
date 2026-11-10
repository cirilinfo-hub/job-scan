import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, switchMap, throwError } from 'rxjs';
import { environment } from '../../../environments/environment';
import { AuthService } from '../auth/auth.service';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  if (!req.url.startsWith(environment.apiUrl)) return next(req);
  const auth = inject(AuthService);
  const router = inject(Router);
  const withAuth = (token: string | null) => req.clone({
    withCredentials: true,
    setHeaders: { 'X-Requested-With': 'rolewise', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  });
  return next(withAuth(auth.token())).pipe(
    catchError((err: HttpErrorResponse) => {
      const isAuthCall = req.url.includes('/auth/login') || req.url.includes('/auth/refresh') || req.url.includes('/auth/register');
      if (err.status !== 401 || isAuthCall) return throwError(() => err);
      return auth.refresh().pipe(switchMap((token) => {
        if (token) return next(withAuth(token));
        void router.navigate(['/login'], { queryParams: { returnUrl: router.url } });
        return throwError(() => err);
      }));
    }),
  );
};
