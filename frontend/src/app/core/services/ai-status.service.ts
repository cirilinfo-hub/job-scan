import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

/** Lets screens explain up front when AI isn't available, rather than failing after a click. */
@Injectable({ providedIn: 'root' })
export class AiStatusService {
  private api = inject(ApiService);
  readonly available = signal<boolean | null>(null);
  load() {
    this.api.get<{ available: boolean }>('/resume-scanner/ai-status').subscribe({ next: (s) => this.available.set(s.available), error: () => this.available.set(false) });
  }
}
