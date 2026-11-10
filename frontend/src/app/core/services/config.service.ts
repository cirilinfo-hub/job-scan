import { Injectable, inject, signal } from '@angular/core';
import { Observable, catchError, of, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface PublicConfig { features: Record<string, boolean>; supportEmail: string; announcement: string }

/** Site settings an admin controls. Screens hide what's turned off; the server enforces it regardless. */
@Injectable({ providedIn: 'root' })
export class ConfigService {
  private api = inject(ApiService);
  readonly config = signal<PublicConfig>({ features: {}, supportEmail: '', announcement: '' });
  load(): Observable<PublicConfig | null> {
    return this.api.get<PublicConfig>('/config').pipe(tap((c) => this.config.set(c)), catchError(() => of(null)));
  }
  enabled(name: string) { return this.config().features[name] !== false; }
}
