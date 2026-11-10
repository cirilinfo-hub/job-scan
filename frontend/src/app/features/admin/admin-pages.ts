import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatSlideToggleChange, MatSlideToggleModule } from '@angular/material/slide-toggle';
import { AuthService } from '../../core/auth/auth.service';
import { PageMeta } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ConfigService } from '../../core/services/config.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { BarChart } from '../../shared/components/chart-canvas';
import { ConfirmService } from '../../shared/components/confirm-dialog';
import { ErrorBlock, LoadingSkeleton, StatCard, StatusBadge } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

interface Overview {
  totalUsers: number; activeUsers: number; newUsers: number; uploads: number; scans: number; jobs: number; applications: number;
  ai: { calls: number; inputTokens: number; outputTokens: number; estimatedCostUsd: number | null; errors: number; byFeature: { feature: string; calls: number; cost: number | null }[] };
  signups: { day: string; c: number }[]; scansDaily: { day: string; c: number }[];
}

@Component({
  imports: [UI, MatButtonToggleModule, BarChart, ErrorBlock, LoadingSkeleton, StatCard],
  template: `<div class="page">
    <div class="page-head"><div><h1>Metrics</h1><p>Platform activity from your own database.</p></div>
      <mat-button-toggle-group [value]="days()" (change)="days.set($event.value); load()" aria-label="Period" hideSingleSelectionIndicator>
        <mat-button-toggle [value]="7">7 days</mat-button-toggle><mat-button-toggle [value]="30">30 days</mat-button-toggle><mat-button-toggle [value]="90">90 days</mat-button-toggle>
      </mat-button-toggle-group></div>
    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (!d() && !error()) { <app-skeleton [count]="8" [height]="100" [min]="170" /> }
    @if (d(); as d) {
      <div class="grid g-stats">
        <app-stat-card label="Registered users" [value]="d.totalUsers" icon="group" [hint]="d.newUsers + ' new in this period'" link="/admin/users" />
        <app-stat-card label="Active users" [value]="d.activeUsers" icon="person_check" hint="Seen in this period" link="/admin/users" />
        <app-stat-card label="Resume uploads" [value]="d.uploads" icon="upload_file" hint="In this period" />
        <app-stat-card label="Resume scans" [value]="d.scans" icon="document_scanner" hint="In this period" />
        <app-stat-card label="Job records" [value]="d.jobs" icon="work" hint="Active listings" link="/admin/job-sources" />
        <app-stat-card label="Application activity" [value]="d.applications" icon="view_kanban" hint="Stage changes in this period" />
        <app-stat-card label="AI calls" [value]="d.ai.calls" icon="smart_toy" [hint]="d.ai.errors + ' errors'" link="/admin/ai" />
        <app-stat-card label="Estimated AI cost" [value]="d.ai.estimatedCostUsd === null ? 'Not tracked' : '$' + d.ai.estimatedCostUsd.toFixed(2)" icon="payments" [hint]="(d.ai.inputTokens + d.ai.outputTokens | number) + ' tokens'" link="/admin/ai" />
      </div>
      <div class="grid g2">
        <section class="card"><h2 style="margin-bottom:8px">New users per day</h2>@if (d.signups.length) { <app-bar-chart [labels]="days2(d.signups)" [values]="vals(d.signups)" label="New users per day" seriesName="New users" /> } @else { <p class="muted small">No signups in this period.</p> }</section>
        <section class="card"><h2 style="margin-bottom:8px">Scans per day</h2>@if (d.scansDaily.length) { <app-bar-chart [labels]="days2(d.scansDaily)" [values]="vals(d.scansDaily)" label="Scans per day" seriesName="Scans" /> } @else { <p class="muted small">No scans in this period.</p> }</section>
      </div>
      <section class="card card-tight"><div class="table-wrap"><table class="tbl"><caption class="sr-only">AI usage by feature</caption>
        <thead><tr><th>AI feature</th><th>Calls</th><th>Estimated cost</th></tr></thead>
        <tbody>@for (f of d.ai.byFeature; track f.feature) { <tr><td>{{ f.feature }}</td><td>{{ f.calls }}</td><td>{{ f.cost === null ? 'Not tracked' : '$' + (f.cost | number: '1.2-4') }}</td></tr> } @empty { <tr><td colspan="3" class="muted">No AI usage in this period.</td></tr> }</tbody>
      </table></div></section>
    }
  </div>`,
})
export class AdminOverviewPage implements OnInit {
  private api = inject(ApiService);
  d = signal<Overview | null>(null); days = signal(30); error = signal('');
  ngOnInit() { this.load(); }
  load() { this.error.set(''); this.api.get<Overview>('/admin/overview', { days: this.days() }).subscribe({ next: (d) => this.d.set(d), error: (e) => this.error.set(errorMessage(e)) }); }
  days2(r: { day: string }[]) { return r.map((x) => x.day.slice(5)); }
  vals(r: { c: number }[]) { return r.map((x) => x.c); }
}

interface AdminUser { id: number; email: string; full_name: string; status: string; roles: string | null; plan: string | null; email_verified_at: string | null; last_active_at: string | null; created_at: string }
interface Plan { id: number; code: string; name: string; price_cents: number; currency: string; limits: Record<string, number>; is_active: number; subscribers: number }

/** DataTable: a sortable, searchable, paginated table. */
@Component({
  imports: [UI, StatusBadge],
  styles: `th button { all: unset; cursor: pointer; } th button:focus-visible { outline: 2px solid var(--accent); }`,
  template: `<div class="page">
    <div class="page-head"><div><h1>Users</h1></div></div>
    <form class="card form-grid" (submit)="$event.preventDefault(); load(1)">
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Search name or email</mat-label><input matInput [formControl]="q" /></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Role</mat-label><mat-select [formControl]="role" (selectionChange)="load(1)"><mat-option [value]="null">All</mat-option><mat-option value="job_seeker">Job seeker</mat-option><mat-option value="admin">Admin</mat-option><mat-option value="super_admin">Super admin</mat-option></mat-select></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Status</mat-label><mat-select [formControl]="status" (selectionChange)="load(1)"><mat-option [value]="null">All</mat-option><mat-option value="active">Active</mat-option><mat-option value="suspended">Suspended</mat-option></mat-select></mat-form-field>
      <div class="row"><button mat-stroked-button type="submit">Search</button></div>
    </form>
    <section class="card card-tight"><div class="table-wrap"><table class="tbl">
      <thead><tr>
        <th [attr.aria-sort]="ariaSort('full_name')"><button type="button" (click)="by('full_name')">Name {{ arrow('full_name') }}</button></th>
        <th [attr.aria-sort]="ariaSort('email')"><button type="button" (click)="by('email')">Email {{ arrow('email') }}</button></th>
        <th>Roles</th><th>Plan</th><th>Status</th>
        <th [attr.aria-sort]="ariaSort('last_active_at')"><button type="button" (click)="by('last_active_at')">Last active {{ arrow('last_active_at') }}</button></th>
        <th [attr.aria-sort]="ariaSort('created_at')"><button type="button" (click)="by('created_at')">Joined {{ arrow('created_at') }}</button></th><th><span class="sr-only">Actions</span></th>
      </tr></thead>
      <tbody>@for (u of items(); track u.id) {
        <tr><td class="strong">{{ u.full_name }}</td><td>{{ u.email }}</td><td>{{ (u.roles || '').replace('_', ' ') }}</td><td>{{ u.plan || 'Free' }}</td><td><app-status [status]="u.status" /></td>
          <td>{{ u.last_active_at ? (u.last_active_at | date: 'mediumDate') : 'Never' }}</td><td>{{ u.created_at | date: 'mediumDate' }}</td>
          <td><button mat-icon-button type="button" [matMenuTriggerFor]="m" [attr.aria-label]="'Actions for ' + u.email"><mat-icon>more_vert</mat-icon></button>
            <mat-menu #m="matMenu">
              <button mat-menu-item type="button" (click)="setStatus(u, u.status === 'active' ? 'suspended' : 'active')">{{ u.status === 'active' ? 'Suspend' : 'Reactivate' }}</button>
              @if (auth.isSuperAdmin()) {
                <button mat-menu-item type="button" (click)="setRoles(u, ['job_seeker'])">Make job seeker</button>
                <button mat-menu-item type="button" (click)="setRoles(u, ['admin', 'job_seeker'])">Make admin</button>
                <button mat-menu-item type="button" (click)="setRoles(u, ['super_admin', 'job_seeker'])">Make super admin</button>
              }
              @for (p of plans(); track p.id) { <button mat-menu-item type="button" (click)="assign(u, p)">Set plan: {{ p.name }}</button> }
            </mat-menu></td></tr>
      } @empty { <tr><td colspan="8" class="muted">No users found.</td></tr> }</tbody>
    </table></div></section>
    @if (meta(); as m) { <nav class="row between" aria-label="Pagination"><button mat-stroked-button type="button" [disabled]="m.page <= 1" (click)="load(m.page - 1)">Previous</button><span class="muted small">{{ m.total }} users · Page {{ m.page }} of {{ m.totalPages }}</span><button mat-stroked-button type="button" [disabled]="m.page >= m.totalPages" (click)="load(m.page + 1)">Next</button></nav> }
  </div>`,
})
export class AdminUsersPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private confirm = inject(ConfirmService);
  auth = inject(AuthService);
  items = signal<AdminUser[]>([]); meta = signal<PageMeta | null>(null); plans = signal<Plan[]>([]); sort = signal('created_at'); dir = signal<'asc' | 'desc'>('desc');
  q = new FormControl('', { nonNullable: true }); role = new FormControl<string | null>(null); status = new FormControl<string | null>(null);
  ngOnInit() { this.load(1); this.api.get<Plan[]>('/admin/plans').subscribe((p) => this.plans.set(p)); }
  load(page: number) { this.api.page<AdminUser>('/admin/users', { q: this.q.value, role: this.role.value, status: this.status.value, sort: this.sort(), dir: this.dir(), page }).subscribe({ next: (r) => { this.items.set(r.items); this.meta.set(r.meta); }, error: (e) => this.toast.error(e) }); }
  by(c: string) { if (this.sort() === c) this.dir.update((d) => (d === 'asc' ? 'desc' : 'asc')); else { this.sort.set(c); this.dir.set('asc'); } this.load(1); }
  arrow(c: string) { return this.sort() === c ? (this.dir() === 'asc' ? '↑' : '↓') : ''; }
  ariaSort(c: string) { return this.sort() === c ? (this.dir() === 'asc' ? 'ascending' : 'descending') : 'none'; }
  private patch(u: AdminUser, body: unknown, done: string) { this.api.patch(`/admin/users/${u.id}`, body).subscribe({ next: () => { this.toast.ok(done); this.load(this.meta()?.page ?? 1); }, error: (e) => this.toast.error(e) }); }
  setStatus(u: AdminUser, status: string) {
    if (status === 'active') { this.patch(u, { status }, 'User reactivated.'); return; }
    this.confirm.ask({ title: 'Suspend this user?', message: `${u.email} will be signed out and unable to sign in.`, confirmLabel: 'Suspend', danger: true }).subscribe((y) => { if (y) this.patch(u, { status }, 'User suspended.'); });
  }
  setRoles(u: AdminUser, roles: string[]) {
    this.confirm.ask({ title: 'Change this role?', message: `${u.email} will have the roles: ${roles.join(', ').replace(/_/g, ' ')}.`, confirmLabel: 'Change role' }).subscribe((y) => { if (y) this.patch(u, { roles }, 'Role updated.'); });
  }
  assign(u: AdminUser, p: Plan) { this.api.post(`/admin/users/${u.id}/subscription`, { planId: p.id }).subscribe({ next: () => { this.toast.ok(`${u.email} is now on ${p.name}. No payment was taken.`); this.load(this.meta()?.page ?? 1); }, error: (e) => this.toast.error(e) }); }
}

@Component({
  imports: [UI],
  template: `<div class="page page-narrow">
    <div class="page-head"><div><h1>Roles</h1><p>Assign roles from the Users page. Only a super admin can grant admin access.</p></div></div>
    <section class="card card-tight"><div class="table-wrap"><table class="tbl"><thead><tr><th>Role</th><th>Users</th><th>Can do</th></tr></thead><tbody>
      @for (r of roles(); track r.id) { <tr><td class="strong">{{ r.name }}</td><td>{{ r.user_count }}</td><td>{{ can[r.code] }}</td></tr> }
    </tbody></table></div></section>
  </div>`,
})
export class AdminRolesPage implements OnInit {
  private api = inject(ApiService);
  roles = signal<{ id: number; code: string; name: string; user_count: number }[]>([]);
  can: Record<string, string> = {
    super_admin: 'Everything, including roles, plans, features, AI settings and scoring rules.',
    admin: 'View metrics and logs; manage job seekers, job sources, categories and skills.',
    job_seeker: 'Use the workspace. Sees only their own data.',
  };
  ngOnInit() { this.api.get<{ id: number; code: string; name: string; user_count: number }[]>('/admin/roles').subscribe((r) => this.roles.set(r)); }
}

@Component({
  imports: [UI],
  template: `<div class="page">
    <div class="page-head"><div><h1>Plans and limits</h1><p>Limits apply per calendar month, and -1 means unlimited. No payment provider is connected, so plans are assigned by hand on the Users page.</p></div></div>
    <div class="grid g3">
      @for (p of plans(); track p.id) {
        <form class="card stack" (submit)="$event.preventDefault(); save(p)">
          <div class="row between"><h2>{{ p.name }}</h2><span class="badge">{{ p.subscribers }} subscribers</span></div>
          <div class="muted small">{{ p.price_cents / 100 | number: '1.2-2' }} {{ p.currency }} per month</div>
          @for (k of keys; track k.key) {
            <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>{{ k.label }}</mat-label><input matInput type="number" min="-1" [value]="p.limits[k.key]" (input)="setLimit(p, k.key, $event)" [disabled]="!auth.isSuperAdmin()" /></mat-form-field>
          }
          @if (auth.isSuperAdmin()) { <button mat-stroked-button type="submit">Save {{ p.name }}</button> }
        </form>
      }
    </div>
  </div>`,
})
export class AdminPlansPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  auth = inject(AuthService);
  plans = signal<Plan[]>([]);
  keys = [{ key: 'resumes', label: 'Resumes stored' }, { key: 'scans_per_month', label: 'Scans per month' }, { key: 'uploads_per_month', label: 'Uploads per month' }, { key: 'ai_calls_per_month', label: 'AI calls per month' }];
  ngOnInit() { this.api.get<Plan[]>('/admin/plans').subscribe((p) => this.plans.set(p)); }
  setLimit(p: Plan, key: string, e: Event) { p.limits[key] = Number((e.target as HTMLInputElement).value); }
  save(p: Plan) { this.api.put<Plan[]>(`/admin/plans/${p.id}`, { code: p.code, name: p.name, priceCents: p.price_cents, currency: p.currency, limits: p.limits, isActive: !!p.is_active }).subscribe({ next: (l) => { this.plans.set(l); this.toast.ok(`${p.name} saved.`); }, error: (e) => this.toast.error(e) }); }
}

interface Source { id: number; code: string; name: string; homepage: string | null; attribution: string | null; is_enabled: number; last_sync_at: string | null; last_sync_status: string | null; last_sync_message: string | null; last_sync_count: number | null; job_count: number; missingConfig: string[]; hasAdapter: boolean }

@Component({
  imports: [UI, MatSlideToggleModule, StatusBadge],
  template: `<div class="page">
    <div class="page-head"><div><h1>Job sources</h1><p>Enabled sources sync automatically every 6 hours. Check each provider's current terms before enabling it.</p></div></div>
    <div class="grid g3">
      @for (s of items(); track s.id) {
        <section class="card stack">
          <div class="row between" style="flex-wrap:nowrap"><h2>{{ s.name }}</h2>@if (s.hasAdapter) { <mat-slide-toggle [checked]="!!s.is_enabled" (change)="toggle(s, $event)" [aria-label]="'Enable ' + s.name" /> }</div>
          <div class="small muted">{{ s.attribution }}</div>
          @if (s.homepage) { <a class="small" [href]="s.homepage" target="_blank" rel="noopener noreferrer">{{ s.homepage }}</a> }
          <div class="small">{{ s.job_count | number }} active listings</div>
          @if (s.last_sync_at) { <div class="row small"><app-status [status]="s.last_sync_status ?? 'info'" /><span class="muted">{{ s.last_sync_at | date: 'MMM d, h:mm a' }}@if (s.last_sync_count !== null && s.last_sync_status === 'ok') { · {{ s.last_sync_count }} synced }</span></div> } @else { <div class="small muted">Never synced.</div> }
          @if (s.last_sync_message) { <div class="notice danger">{{ s.last_sync_message }}</div> }
          @if (s.missingConfig.length) { <div class="notice warning"><div>Needs server settings: {{ s.missingConfig.join(', ') }}</div></div> }
          @if (s.hasAdapter) { <div><button mat-stroked-button type="button" [disabled]="busy() === s.id || s.missingConfig.length > 0" (click)="sync(s)"><mat-icon>sync</mat-icon>{{ busy() === s.id ? 'Syncing...' : 'Sync now' }}</button></div> }
        </section>
      }
    </div>
  </div>`,
})
export class AdminSourcesPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  items = signal<Source[]>([]); busy = signal<number | null>(null);
  ngOnInit() { this.load(); }
  load() { this.api.get<Source[]>('/admin/job-sources').subscribe((s) => this.items.set(s)); }
  toggle(s: Source, e: MatSlideToggleChange) { this.api.patch<Source[]>(`/admin/job-sources/${s.id}`, { isEnabled: e.checked }).subscribe({ next: (l) => this.items.set(l), error: (err) => { this.toast.error(err); this.load(); } }); }
  sync(s: Source) {
    this.busy.set(s.id);
    this.api.post<{ count: number }>(`/admin/job-sources/${s.id}/sync`).subscribe({
      next: (r) => { this.busy.set(null); this.toast.ok(`${s.name}: ${r.count} listings synced.`); this.load(); },
      error: (e) => { this.busy.set(null); this.toast.error(e); this.load(); },
    });
  }
}

@Component({
  imports: [UI],
  template: `<div class="page page-narrow">
    <div class="page-head"><div><h1>Job categories</h1><p>Categories are created during job sync, and you can add your own.</p></div></div>
    <form class="card row" (submit)="$event.preventDefault(); add()" style="align-items:flex-start"><mat-form-field appearance="outline" subscriptSizing="dynamic" style="flex:1 1 220px"><mat-label>New category</mat-label><input matInput [formControl]="name" /></mat-form-field><button mat-flat-button type="submit" style="margin-top:6px">Add</button></form>
    <section class="card card-tight"><div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Jobs</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
      @for (c of items(); track c.id) { <tr><td>{{ c.name }}</td><td>{{ c.job_count }}</td><td style="text-align:right"><button mat-icon-button type="button" (click)="remove(c)" [attr.aria-label]="'Delete ' + c.name"><mat-icon>delete_outline</mat-icon></button></td></tr> } @empty { <tr><td colspan="3" class="muted">No categories yet.</td></tr> }
    </tbody></table></div></section>
  </div>`,
})
export class AdminCategoriesPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private confirm = inject(ConfirmService);
  items = signal<{ id: number; name: string; job_count: number }[]>([]); name = new FormControl('', { nonNullable: true });
  ngOnInit() { this.load(); }
  load() { this.api.get<{ id: number; name: string; job_count: number }[]>('/admin/job-categories').subscribe((c) => this.items.set(c)); }
  add() { if (!this.name.value.trim()) return; this.api.post('/admin/job-categories', { name: this.name.value }).subscribe({ next: () => { this.name.reset(); this.load(); }, error: (e) => this.toast.error(e) }); }
  remove(c: { id: number; name: string; job_count: number }) { this.confirm.ask({ title: 'Delete this category?', message: `${c.job_count} jobs will lose the category "${c.name}".`, confirmLabel: 'Delete', danger: true }).subscribe((y) => { if (y) this.api.delete(`/admin/job-categories/${c.id}`).subscribe({ next: () => this.load(), error: (e) => this.toast.error(e) }); }); }
}

interface SkillRow { id: number; name: string; type: string; aliases: string[]; is_active: number }

@Component({
  imports: [UI],
  template: `<div class="page">
    <div class="page-head"><div><h1>Skills</h1><p>The scanner and job matching recognise these skills and their alternative names.</p></div></div>
    <form class="card form-grid" [formGroup]="form" (ngSubmit)="save()">
      <mat-form-field appearance="outline"><mat-label>Skill name</mat-label><input matInput formControlName="name" /><mat-error>Enter a name.</mat-error></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Type</mat-label><mat-select formControlName="type"><mat-option value="hard">Technical</mat-option><mat-option value="tool">Tool</mat-option><mat-option value="soft">Soft</mat-option><mat-option value="certification">Certification</mat-option></mat-select></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Other names</mat-label><input matInput formControlName="aliases" /><mat-hint>Separate with commas</mat-hint></mat-form-field>
      <div class="row" style="padding-top:6px; align-items:flex-start"><button mat-flat-button type="submit">{{ editId() ? 'Save skill' : 'Add skill' }}</button>@if (editId()) { <button mat-button type="button" (click)="cancel()">Cancel</button> }</div>
    </form>
    <form class="card" (submit)="$event.preventDefault(); load(1)"><mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Search skills</mat-label><input matInput [formControl]="q" /></mat-form-field></form>
    <section class="card card-tight"><div class="table-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Type</th><th>Other names</th><th><span class="sr-only">Actions</span></th></tr></thead><tbody>
      @for (s of items(); track s.id) { <tr><td class="strong">{{ s.name }}</td><td>{{ s.type }}</td><td>{{ s.aliases.join(', ') }}</td><td style="text-align:right; white-space:nowrap"><button mat-icon-button type="button" (click)="edit(s)" [attr.aria-label]="'Edit ' + s.name"><mat-icon>edit</mat-icon></button><button mat-icon-button type="button" (click)="remove(s)" [attr.aria-label]="'Delete ' + s.name"><mat-icon>delete_outline</mat-icon></button></td></tr> } @empty { <tr><td colspan="4" class="muted">No skills found.</td></tr> }
    </tbody></table></div></section>
    @if (meta(); as m) { <nav class="row between" aria-label="Pagination"><button mat-stroked-button type="button" [disabled]="m.page <= 1" (click)="load(m.page - 1)">Previous</button><span class="muted small">{{ m.total }} skills · Page {{ m.page }} of {{ m.totalPages }}</span><button mat-stroked-button type="button" [disabled]="m.page >= m.totalPages" (click)="load(m.page + 1)">Next</button></nav> }
  </div>`,
})
export class AdminSkillsPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private confirm = inject(ConfirmService);
  items = signal<SkillRow[]>([]); meta = signal<PageMeta | null>(null); editId = signal<number | null>(null); q = new FormControl('', { nonNullable: true });
  form = inject(FormBuilder).nonNullable.group({ name: ['', Validators.required], type: ['hard'], aliases: [''] });
  ngOnInit() { this.load(1); }
  load(page: number) { this.api.page<SkillRow>('/admin/skills', { q: this.q.value, page, pageSize: 25 }).subscribe({ next: (r) => { this.items.set(r.items); this.meta.set(r.meta); }, error: (e) => this.toast.error(e) }); }
  edit(s: SkillRow) { this.editId.set(s.id); this.form.setValue({ name: s.name, type: s.type, aliases: s.aliases.join(', ') }); }
  cancel() { this.editId.set(null); this.form.reset(); }
  save() {
    if (this.form.invalid) { this.form.markAllAsTouched(); return; }
    const v = this.form.getRawValue();
    const body = { name: v.name, type: v.type, aliases: v.aliases.split(',').map((x) => x.trim()).filter(Boolean), isActive: true };
    (this.editId() ? this.api.put(`/admin/skills/${this.editId()}`, body) : this.api.post('/admin/skills', body)).subscribe({ next: () => { this.toast.ok('Skill saved.'); this.cancel(); this.load(this.meta()?.page ?? 1); }, error: (e) => this.toast.error(e) });
  }
  remove(s: SkillRow) { this.confirm.ask({ title: 'Delete this skill?', message: `"${s.name}" will no longer be recognised in scans or jobs.`, confirmLabel: 'Delete', danger: true }).subscribe((y) => { if (y) this.api.delete(`/admin/skills/${s.id}`).subscribe({ next: () => this.load(this.meta()?.page ?? 1), error: (e) => this.toast.error(e) }); }); }
}

@Component({
  imports: [UI, MatSlideToggleModule],
  template: `<div class="page page-narrow">
    <div class="page-head"><div><h1>Features</h1><p>Turning off AI stops all AI calls immediately, even when a provider is configured.@if (!auth.isSuperAdmin()) { Only a super admin can change these. }</p></div></div>
    <section class="card stack">
      @for (k of keys(); track k) { <div class="row between"><span>{{ label(k) }}</span><mat-slide-toggle [checked]="flags()[k]" [disabled]="!auth.isSuperAdmin()" (change)="set(k, $event)" [aria-label]="label(k)" /></div> }
    </section>
    <p class="muted small">Each switch is enforced by the server and hides the tool from navigation. Data is kept while a tool is off.</p>
  </div>`,
})
export class AdminFeaturesPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  auth = inject(AuthService);
  private config = inject(ConfigService);
  flags = signal<Record<string, boolean>>({}); keys = computed(() => Object.keys(this.flags()));
  ngOnInit() { this.api.get<Record<string, boolean>>('/admin/features').subscribe((f) => this.flags.set(f)); }
  label(k: string) { const s = k.replace(/_/g, ' '); return k === 'ai' ? 'AI features' : s[0].toUpperCase() + s.slice(1); }
  set(k: string, e: MatSlideToggleChange) {
    const next = { ...this.flags(), [k]: e.checked };
    this.api.put<Record<string, boolean>>('/admin/features', next).subscribe({ next: (f) => { this.flags.set(f); this.config.load().subscribe(); this.toast.ok('Saved.'); }, error: (err) => this.toast.error(err) });
  }
}

interface AiConfig { provider: string; configured: boolean; enabled: boolean; envModel: string | null; modelOverride: string | null; costTracking: boolean; emailConfigured: boolean; howToConfigure: string }

@Component({
  imports: [UI],
  template: `<div class="page page-narrow">
    <div class="page-head"><div><h1>AI provider</h1><p>API keys stay in server environment variables and are never shown here.</p></div></div>
    @if (c(); as c) {
      <section class="card stack small">
        <div class="row between"><span>Provider</span><span class="strong">{{ c.provider }}</span></div>
        <div class="row between"><span>Credentials</span><span class="badge" [class.success]="c.configured" [class.warning]="!c.configured">{{ c.configured ? 'Configured' : 'Not configured' }}</span></div>
        <div class="row between"><span>AI feature switch</span><span class="badge" [class.success]="c.enabled" [class.warning]="!c.enabled">{{ c.enabled ? 'On' : 'Off' }}</span></div>
        <div class="row between"><span>Model from environment</span><span>{{ c.envModel || 'Provider default' }}</span></div>
        <div class="row between"><span>Cost monitoring</span><span>{{ c.costTracking ? 'On' : 'Off (set AI_COST_INPUT_PER_MTOK and AI_COST_OUTPUT_PER_MTOK)' }}</span></div>
        <div class="row between"><span>Email (SMTP)</span><span>{{ c.emailConfigured ? 'Configured' : 'Not configured' }}</span></div>
        @if (!c.configured) { <div class="notice warning"><div>{{ c.howToConfigure }}</div></div> }
      </section>
      @if (auth.isSuperAdmin()) {
        <section class="card stack">
          <h2>Model override</h2>
          <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Model name (optional)</mat-label><input matInput [formControl]="model" /></mat-form-field>
          <div class="row"><button mat-stroked-button type="button" (click)="save()">Save</button><button mat-stroked-button type="button" [disabled]="testing()" (click)="test()"><mat-icon>network_check</mat-icon>{{ testing() ? 'Testing...' : 'Test connection' }}</button></div>
          @if (result(); as r) { <div class="notice" [class.info]="r.ok" [class.danger]="!r.ok" role="status">{{ r.message }}</div> }
          <p class="muted xs">The test sends one very small real request, which the provider may bill.</p>
        </section>
      }
    }
  </div>`,
})
export class AdminAiPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  auth = inject(AuthService);
  c = signal<AiConfig | null>(null); testing = signal(false); result = signal<{ ok: boolean; message: string } | null>(null); model = new FormControl('', { nonNullable: true });
  ngOnInit() { this.api.get<AiConfig>('/admin/ai').subscribe((c) => { this.c.set(c); this.model.setValue(c.modelOverride ?? ''); }); }
  save() { this.api.put<AiConfig>('/admin/ai', { model: this.model.value || null }).subscribe({ next: (c) => { this.c.set(c); this.toast.ok('Saved.'); }, error: (e) => this.toast.error(e) }); }
  test() { this.testing.set(true); this.result.set(null); this.api.post<{ ok: boolean; message: string }>('/admin/ai/test').subscribe({ next: (r) => { this.result.set(r); this.testing.set(false); }, error: (e) => { this.testing.set(false); this.toast.error(e); } }); }
}

@Component({
  imports: [UI],
  template: `<div class="page page-narrow">
    <div class="page-head"><div><h1>Scoring rules</h1><p>These numbers drive every new scan. Existing reports keep the rules they were calculated with.@if (!auth.isSuperAdmin()) { Only a super admin can change these. }</p></div></div>
    @if (json()) {
      <section class="card stack">
        <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Rules (JSON)</mat-label><textarea matInput rows="26" [formControl]="text" style="font-family:ui-monospace,monospace; font-size:13px" spellcheck="false"></textarea></mat-form-field>
        @if (bad()) { <div class="notice danger" role="alert">{{ bad() }}</div> }
        @if (auth.isSuperAdmin()) { <div><button mat-flat-button type="button" (click)="save()">Save rules</button></div> }
      </section>
    }
  </div>`,
})
export class AdminScoringPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  auth = inject(AuthService);
  json = signal<unknown>(null); bad = signal(''); text = new FormControl('', { nonNullable: true });
  ngOnInit() { this.api.get<unknown>('/admin/scoring-rules').subscribe((r) => { this.json.set(r); this.text.setValue(JSON.stringify(r, null, 2)); }); }
  save() {
    this.bad.set('');
    let parsed: unknown;
    try { parsed = JSON.parse(this.text.value); } catch { this.bad.set("That isn't valid JSON. Check for a missing comma or quote."); return; }
    this.api.put('/admin/scoring-rules', parsed).subscribe({ next: () => this.toast.ok('Rules saved. New scans will use them.'), error: (e) => this.bad.set(errorMessage(e) + ' ' + (e.error?.error?.details?.map((d: { path: string; message: string }) => `${d.path}: ${d.message}`).join('; ') ?? '')) });
  }
}

interface LogRow { id: number; level: string; action: string; target: string | null; detail: unknown; ip: string | null; created_at: string; actor: string | null }

@Component({
  imports: [UI, StatusBadge],
  template: `<div class="page">
    <div class="page-head"><div><h1>System logs</h1><p>Administrator actions. Server logs are written to the host's log output.</p></div></div>
    <form class="card form-grid" (submit)="$event.preventDefault(); load(1)">
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Action contains</mat-label><input matInput [formControl]="action" /></mat-form-field>
      <mat-form-field appearance="outline" subscriptSizing="dynamic"><mat-label>Level</mat-label><mat-select [formControl]="level" (selectionChange)="load(1)"><mat-option [value]="null">All</mat-option><mat-option value="info">Info</mat-option><mat-option value="warn">Warning</mat-option><mat-option value="error">Error</mat-option></mat-select></mat-form-field>
      <div class="row"><button mat-stroked-button type="submit">Filter</button></div>
    </form>
    <section class="card card-tight"><div class="table-wrap"><table class="tbl"><thead><tr><th>Time</th><th>Level</th><th>Action</th><th>Target</th><th>By</th><th>IP</th></tr></thead><tbody>
      @for (l of items(); track l.id) { <tr><td style="white-space:nowrap">{{ l.created_at | date: 'MMM d, HH:mm:ss' }}</td><td><app-status [status]="l.level" /></td><td>{{ l.action }}</td><td>{{ l.target || '–' }}</td><td>{{ l.actor || 'System' }}</td><td>{{ l.ip || '–' }}</td></tr> } @empty { <tr><td colspan="6" class="muted">No log entries.</td></tr> }
    </tbody></table></div></section>
    @if (meta(); as m) { <nav class="row between" aria-label="Pagination"><button mat-stroked-button type="button" [disabled]="m.page <= 1" (click)="load(m.page - 1)">Previous</button><span class="muted small">Page {{ m.page }} of {{ m.totalPages }}</span><button mat-stroked-button type="button" [disabled]="m.page >= m.totalPages" (click)="load(m.page + 1)">Next</button></nav> }
  </div>`,
})
export class AdminLogsPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  items = signal<LogRow[]>([]); meta = signal<PageMeta | null>(null); action = new FormControl('', { nonNullable: true }); level = new FormControl<string | null>(null);
  ngOnInit() { this.load(1); }
  load(page: number) { this.api.page<LogRow>('/admin/logs', { action: this.action.value, level: this.level.value, page }).subscribe({ next: (r) => { this.items.set(r.items); this.meta.set(r.meta); }, error: (e) => this.toast.error(e) }); }
}

@Component({
  imports: [UI],
  template: `<div class="page page-narrow">
    <div class="page-head"><div><h1>Settings</h1>@if (!auth.isSuperAdmin()) { <p>Only a super admin can change these.</p> }</div></div>
    <form class="card" [formGroup]="form" (ngSubmit)="save()">
      <mat-form-field appearance="outline"><mat-label>Support email</mat-label><input matInput type="email" formControlName="supportEmail" /><mat-hint>Shown in the account menu</mat-hint></mat-form-field>
      <mat-form-field appearance="outline" style="margin-top:8px"><mat-label>Announcement</mat-label><input matInput formControlName="announcement" maxlength="300" /><mat-hint>Shown to everyone at the top of the workspace. Leave empty to hide it.</mat-hint></mat-form-field>
      <div style="height:12px"></div>
      @if (auth.isSuperAdmin()) { <button mat-flat-button type="submit">Save settings</button> }
    </form>
  </div>`,
})
export class AdminSettingsPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService);
  auth = inject(AuthService);
  private config = inject(ConfigService);
  form = inject(FormBuilder).nonNullable.group({ supportEmail: [''], announcement: [''] });
  ngOnInit() { this.api.get<{ supportEmail?: string; announcement?: string }>('/admin/settings').subscribe((s) => { this.form.patchValue(s); if (!this.auth.isSuperAdmin()) this.form.disable(); }); }
  save() { this.api.put('/admin/settings', this.form.getRawValue()).subscribe({ next: () => { this.toast.ok('Settings saved.'); this.config.load().subscribe(); }, error: (e) => this.toast.error(e) }); }
}
