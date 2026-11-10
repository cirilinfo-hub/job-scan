import { Component, OnInit, inject, signal } from '@angular/core';
import { Router } from '@angular/router';
import { AppNotification, PageMeta } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { NotificationCountService } from '../../core/services/notification-count.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { EmptyState, ErrorBlock, LoadingSkeleton } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

const ICON: Record<string, string> = { follow_up: 'schedule', interview: 'event', job_recommendation: 'stars', resume_reminder: 'document_scanner', profile_reminder: 'person', system: 'info' };

@Component({
  imports: [UI, EmptyState, ErrorBlock, LoadingSkeleton],
  styles: `.n { display: flex; gap: 12px; padding: 12px 16px; border-bottom: 1px solid var(--border); align-items: flex-start; } .n:last-child { border-bottom: 0; } .n.unread { background: var(--accent-soft); }
    .open { all: unset; cursor: pointer; flex: 1; min-width: 0; display: block; } .open:focus-visible { outline: 2px solid var(--accent); } .open:hover .strong { color: var(--accent); }`,
  template: `<div class="page page-narrow">
    <div class="page-head"><div><h1>Notifications</h1></div>
      <div class="actions"><button mat-button type="button" (click)="unread.set(!unread()); load(1)">{{ unread() ? 'Show all' : 'Show unread' }}</button><button mat-stroked-button type="button" (click)="readAll()">Mark all as read</button></div></div>
    @if (error()) { <app-error [message]="error()" (retry)="load(1)" /> }
    @if (loading()) { <app-skeleton [count]="4" [height]="60" [min]="500" /> }
    @else {
      <section class="card card-tight">
        @for (n of items(); track n.id) {
          <div class="n" [class.unread]="!n.read_at">
            <mat-icon aria-hidden="true" class="muted">{{ icon(n.type) }}</mat-icon>
            <button class="open" type="button" (click)="open(n)"><div class="strong">{{ n.title }}@if (!n.read_at) { <span class="sr-only"> (unread)</span> }</div>@if (n.body) { <div class="small muted">{{ n.body }}</div> }<div class="xs muted">{{ n.created_at | date: 'MMM d, h:mm a' }}</div></button>
            <button mat-icon-button type="button" (click)="remove(n)" [attr.aria-label]="'Delete notification: ' + n.title"><mat-icon>close</mat-icon></button>
          </div>
        } @empty { <app-empty icon="notifications_none" title="You're all caught up" /> }
      </section>
      @if (meta() && meta()!.totalPages > 1) {
        <nav class="row between" aria-label="Pagination"><button mat-stroked-button type="button" [disabled]="page() <= 1" (click)="load(page() - 1)">Previous</button><span class="muted small">Page {{ page() }} of {{ meta()!.totalPages }}</span><button mat-stroked-button type="button" [disabled]="page() >= meta()!.totalPages" (click)="load(page() + 1)">Next</button></nav>
      }
    }
  </div>`,
})
export class NotificationsPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private router = inject(Router); private count = inject(NotificationCountService);
  items = signal<AppNotification[]>([]); meta = signal<PageMeta | null>(null); page = signal(1); unread = signal(false); loading = signal(true); error = signal('');
  ngOnInit() { this.load(1); }
  icon(t: string) { return ICON[t] ?? 'info'; }
  load(p: number) {
    this.error.set('');
    this.api.page<AppNotification>('/notifications', { page: p, pageSize: 20, unread: this.unread() ? 'true' : null }).subscribe({
      next: (r) => { this.items.set(r.items); this.meta.set(r.meta); this.page.set(p); this.loading.set(false); this.count.unread.set(Number(r.meta['unreadCount'] ?? 0)); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
  open(n: AppNotification) {
    const go = () => { if (n.link) void this.router.navigateByUrl(n.link); else this.load(this.page()); };
    if (n.read_at) { go(); return; }
    this.api.post(`/notifications/${n.id}/read`).subscribe({ next: go, error: go });
  }
  readAll() { this.api.post('/notifications/read-all').subscribe({ next: () => this.load(this.page()), error: (e) => this.toast.error(e) }); }
  remove(n: AppNotification) { this.api.delete(`/notifications/${n.id}`).subscribe({ next: () => this.load(this.page()), error: (e) => this.toast.error(e) }); }
}
