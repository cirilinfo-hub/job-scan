import { ApplicationConfig, inject, provideAppInitializer, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideNativeDateAdapter } from '@angular/material/core';
import { provideRouter, withComponentInputBinding, withInMemoryScrolling } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { routes } from './app.routes';
import { AuthService } from './core/auth/auth.service';
import { authInterceptor } from './core/interceptors/auth.interceptor';
import { ConfigService } from './core/services/config.service';
import { ThemeService } from './core/services/theme.service';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes, withComponentInputBinding(), withInMemoryScrolling({ scrollPositionRestoration: 'enabled' })),
    provideHttpClient(withInterceptors([authInterceptor])),
    provideNativeDateAdapter(),
    // Restores the session from the cookie before routing, so a reload doesn't bounce to the sign-in page.
    provideAppInitializer(() => {
      inject(ThemeService);
      const config = firstValueFrom(inject(ConfigService).load());
      const auth = inject(AuthService);
      // One retry covers a brief outage or rate limit. If it still fails, the app starts signed out.
      const session = firstValueFrom(auth.refresh())
        .catch(() => new Promise((r) => setTimeout(r, 1500)).then(() => firstValueFrom(auth.refresh())))
        .catch(() => null);
      return Promise.all([config, session]);
    }),
  ],
};
