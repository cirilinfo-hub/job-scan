import { Injectable, inject, signal } from '@angular/core';
import { ApiService } from './api.service';

@Injectable({ providedIn: 'root' })
export class NotificationCountService {
  private api = inject(ApiService);
  readonly unread = signal(0);
  refresh() { this.api.get<{ count: number }>('/notifications/unread-count').subscribe({ next: (r) => this.unread.set(r.count), error: () => undefined }); }
}
