import { Component, OnInit, inject, signal } from '@angular/core';
import { FormBuilder, FormControl, Validators } from '@angular/forms';
import { MatAutocompleteModule, MatAutocompleteSelectedEvent } from '@angular/material/autocomplete';
import { MatSlideToggleModule } from '@angular/material/slide-toggle';
import { Router } from '@angular/router';
import { debounceTime, distinctUntilChanged, switchMap } from 'rxjs';
import { AuthService } from '../../core/auth/auth.service';
import { Completion, ProfileData, User } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { Theme, ThemeService } from '../../core/services/theme.service';
import { ToastService } from '../../core/services/toast.service';
import { ConfirmService } from '../../shared/components/confirm-dialog';
import { ProgressBar } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';

interface SkillOption { id: number; name: string; type: string }
interface SessionRow { id: number; user_agent: string | null; ip: string | null; created_at: string }

@Component({
  imports: [UI, MatAutocompleteModule, MatSlideToggleModule, ProgressBar],
  template: `<div class="page">
    <div class="page-head"><div><h1>Profile and settings</h1><p>Your preferences shape job matches. Unset preferences are left out of the comparison.</p></div></div>
    @if (!auth.user()?.emailVerified) {
      <div class="notice warning"><mat-icon aria-hidden="true">mark_email_unread</mat-icon><div class="grow">Your email isn't verified yet.</div><button mat-button type="button" (click)="resend()">Send a new link</button></div>
    }
    <div class="grid split">
      <div class="stack">
        <form class="card" [formGroup]="profile" (ngSubmit)="saveProfile()">
          <h2 class="mb-3">Career profile</h2>
          <div class="form-grid">
            <mat-form-field appearance="outline"><mat-label>Headline</mat-label><input matInput formControlName="headline" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Target job title</mat-label><input matInput formControlName="targetTitle" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Location</mat-label><input matInput formControlName="location" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Phone</mat-label><input matInput formControlName="phone" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Years of experience</mat-label><input matInput type="number" min="0" max="60" formControlName="yearsExperience" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Seniority</mat-label><mat-select formControlName="seniority"><mat-option [value]="null">Not set</mat-option><mat-option value="intern">Intern</mat-option><mat-option value="entry">Entry</mat-option><mat-option value="mid">Mid</mat-option><mat-option value="senior">Senior</mat-option><mat-option value="lead">Lead</mat-option><mat-option value="executive">Executive</mat-option></mat-select></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Preferred work mode</mat-label><mat-select formControlName="preferredWorkMode"><mat-option value="any">Any</mat-option><mat-option value="remote">Remote</mat-option><mat-option value="hybrid">Hybrid</mat-option><mat-option value="onsite">On-site</mat-option></mat-select></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Preferred employment type</mat-label><mat-select formControlName="preferredEmploymentType"><mat-option value="any">Any</mat-option><mat-option value="full_time">Full-time</mat-option><mat-option value="part_time">Part-time</mat-option><mat-option value="contract">Contract</mat-option><mat-option value="internship">Internship</mat-option></mat-select></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Preferred job location</mat-label><input matInput formControlName="preferredLocation" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Industry</mat-label><input matInput formControlName="industry" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Minimum salary</mat-label><input matInput type="number" min="0" formControlName="salaryMin" /></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>LinkedIn URL</mat-label><input matInput type="url" formControlName="linkedinUrl" /><mat-error>Links must start with http:// or https://</mat-error></mat-form-field>
            <mat-form-field appearance="outline"><mat-label>Website</mat-label><input matInput type="url" formControlName="websiteUrl" /><mat-error>Links must start with http:// or https://</mat-error></mat-form-field>
          </div>
          <h3 class="mt-1 mb-2">Skills</h3>
          <div class="chips mb-2">
            @for (s of skills(); track s.id) { <span class="chip">{{ s.name }}<button type="button" (click)="removeSkill(s.id)" [attr.aria-label]="'Remove ' + s.name"><mat-icon>close</mat-icon></button></span> }
          </div>
          <mat-form-field appearance="outline"><mat-label>Add a skill</mat-label><input matInput [formControl]="skillQ" [matAutocomplete]="auto" />
            <mat-autocomplete #auto="matAutocomplete" (optionSelected)="addSkill($event)">@for (o of options(); track o.id) { <mat-option [value]="o">{{ o.name }}</mat-option> }</mat-autocomplete>
          </mat-form-field>
          <button mat-flat-button type="submit">Save profile</button>
        </form>
      </div>
      <div class="stack">
        @if (completion(); as c) {
          <section class="card stack">
            <div class="row between"><h2>Profile completion</h2><span class="strong">{{ c.percent }}%</span></div>
            <app-progress [value]="c.percent" label="Profile completion" />
            <div class="small stack-sm">@for (i of c.items; track i.key) { <div class="row nowrap"><mat-icon class="icon-18" aria-hidden="true" [style.color]="i.done ? 'var(--success)' : 'var(--text-2)'">{{ i.done ? 'check_circle' : 'radio_button_unchecked' }}</mat-icon>{{ i.label }}<span class="sr-only">{{ i.done ? 'done' : 'to do' }}</span></div> }</div>
          </section>
        }
        <form class="card" [formGroup]="account" (ngSubmit)="saveAccount()">
          <h2 class="mb-3">Account</h2>
          <mat-form-field appearance="outline"><mat-label>Full name</mat-label><input matInput formControlName="fullName" /><mat-error>Enter your name.</mat-error></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Theme</mat-label><mat-select formControlName="theme"><mat-option value="light">Light</mat-option><mat-option value="dark">Dark</mat-option><mat-option value="system">Same as device</mat-option></mat-select></mat-form-field>
          <div class="mb-3"><mat-slide-toggle formControlName="emailNotifications">Email me reminders too</mat-slide-toggle><div class="muted xs mt-1">Sent only when email is set up on this server.</div></div>
          <button mat-stroked-button type="submit">Save account</button>
        </form>
        <form class="card" [formGroup]="pw" (ngSubmit)="changePassword()">
          <h2 class="mb-3">Change password</h2>
          <mat-form-field appearance="outline"><mat-label>Current password</mat-label><input matInput type="password" autocomplete="current-password" formControlName="currentPassword" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>New password</mat-label><input matInput type="password" autocomplete="new-password" formControlName="newPassword" /><mat-hint>At least 10 characters, with a letter and a number.</mat-hint><mat-error>At least 10 characters, with a letter and a number.</mat-error></mat-form-field>
          <button class="mt-2" mat-stroked-button type="submit">Change password</button>
        </form>
        <section class="card">
          <h2 class="mb-2">Active sessions</h2>
          <div class="list">@for (s of sessions(); track s.id) { <div class="list-item small"><div class="grow"><div class="truncate">{{ s.user_agent || 'Unknown device' }}</div><div class="muted xs">{{ s.ip }} · {{ s.created_at | date: 'MMM d, h:mm a' }}</div></div><button mat-button type="button" (click)="revoke(s.id)">Sign out</button></div> }</div>
        </section>
        <section class="card stack">
          <h2>Delete account</h2><p class="muted small">Your account closes right away. Your data is permanently removed after the retention period.</p>
          <div><button class="text-danger" mat-stroked-button type="button" (click)="deleteAccount()">Delete my account</button></div>
        </section>
      </div>
    </div>
  </div>`,
})
export class ProfilePage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private fb = inject(FormBuilder); private confirm = inject(ConfirmService); private router = inject(Router); private theme = inject(ThemeService);
  auth = inject(AuthService);
  completion = signal<Completion | null>(null); skills = signal<SkillOption[]>([]); options = signal<SkillOption[]>([]); sessions = signal<SessionRow[]>([]);
  skillQ = new FormControl<string | SkillOption>('', { nonNullable: true });
  private url = Validators.pattern(/^https?:\/\/.+/i);
  profile = this.fb.group({
    headline: [''], targetTitle: [''], location: [''], phone: [''], yearsExperience: [null as number | null], seniority: [null as string | null], preferredWorkMode: ['any'], preferredEmploymentType: ['any'],
    preferredLocation: [''], industry: [''], salaryMin: [null as number | null], linkedinUrl: ['', this.url], websiteUrl: ['', this.url],
  });
  account = this.fb.nonNullable.group({ fullName: ['', [Validators.required, Validators.minLength(2)]], theme: ['light' as Theme], emailNotifications: [false] });
  pw = this.fb.nonNullable.group({ currentPassword: ['', Validators.required], newPassword: ['', [Validators.required, Validators.minLength(10), Validators.pattern(/^(?=.*[A-Za-z])(?=.*\d).+$/)]] });

  ngOnInit() {
    const u = this.auth.user()!;
    this.account.setValue({ fullName: u.fullName, theme: this.theme.theme(), emailNotifications: u.emailNotifications });
    this.api.get<ProfileData>('/users/me/profile').subscribe((p) => { const { skills, ...rest } = p; this.profile.patchValue(rest); this.skills.set(skills); });
    this.loadCompletion(); this.loadSessions();
    this.skillQ.valueChanges.pipe(debounceTime(200), distinctUntilChanged(), switchMap((q) => this.api.get<SkillOption[]>('/users/skills', { q: typeof q === 'string' ? q : q.name }))).subscribe((o) => this.options.set(o));
  }
  private loadCompletion() { this.api.get<Completion>('/users/me/profile-completion').subscribe((c) => this.completion.set(c)); }
  private loadSessions() { this.api.get<SessionRow[]>('/users/me/sessions').subscribe((s) => this.sessions.set(s)); }
  addSkill(e: MatAutocompleteSelectedEvent) {
    const o = e.option.value as SkillOption;
    if (!this.skills().some((s) => s.id === o.id)) this.skills.update((l) => [...l, o]);
    this.skillQ.setValue('');
  }
  removeSkill(id: number) { this.skills.update((l) => l.filter((s) => s.id !== id)); }
  saveProfile() {
    if (this.profile.invalid) { this.profile.markAllAsTouched(); return; }
    this.api.put('/users/me/profile', { ...this.profile.getRawValue(), skillIds: this.skills().map((s) => s.id) }).subscribe({ next: () => { this.toast.ok('Profile saved.'); this.loadCompletion(); }, error: (e) => this.toast.error(e) });
  }
  saveAccount() {
    if (this.account.invalid) { this.account.markAllAsTouched(); return; }
    this.api.put<User>('/users/me', this.account.getRawValue()).subscribe({ next: (u) => { this.auth.user.set(u); this.theme.set(this.account.getRawValue().theme); this.toast.ok('Account saved.'); }, error: (e) => this.toast.error(e) });
  }
  changePassword() {
    if (this.pw.invalid) { this.pw.markAllAsTouched(); return; }
    this.api.post('/users/me/password', this.pw.getRawValue()).subscribe({ next: () => { this.auth.clear(); this.toast.ok('Password changed. Please sign in again.'); void this.router.navigateByUrl('/login'); }, error: (e) => this.toast.error(e) });
  }
  resend() { this.api.post('/auth/resend-verification').subscribe({ next: () => this.toast.ok('A new link is on its way.'), error: (e) => this.toast.error(e) }); }
  revoke(id: number) { this.api.delete(`/users/me/sessions/${id}`).subscribe({ next: () => { this.toast.ok('Session ended.'); this.loadSessions(); }, error: (e) => this.toast.error(e) }); }
  deleteAccount() {
    this.confirm.ask({ title: 'Delete your account?', message: 'You will be signed out and your account will close. This cannot be undone from the app.', confirmLabel: 'Delete account', danger: true }).subscribe((yes) => {
      if (yes) this.api.delete('/users/me').subscribe({ next: () => { this.auth.clear(); void this.router.navigateByUrl('/login'); }, error: (e) => this.toast.error(e) });
    });
  }
}
