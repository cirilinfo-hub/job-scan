import { CdkDragDrop, DragDropModule, moveItemInArray, transferArrayItem } from '@angular/cdk/drag-drop';
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { MatButtonToggleModule } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { Application, FollowUp, Stage } from '../../core/models';
import { ApiService } from '../../core/services/api.service';
import { ToastService, errorMessage } from '../../core/services/toast.service';
import { ErrorBlock, LoadingSkeleton, StatusBadge, stageLabel } from '../../shared/components/widgets';
import { UI } from '../../shared/ui';
import { ApplicationDialog } from './application-dialog';

interface Board { stages: Stage[]; items: Application[]; followUps: FollowUp[] }

@Component({
  imports: [UI, DragDropModule, MatButtonToggleModule, ErrorBlock, LoadingSkeleton, StatusBadge],
  styles: `.board { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(240px, 1fr); gap: var(--space-3); overflow-x: auto; padding-bottom: 8px; align-items: start; }
    .col { background: var(--surface-2); border-radius: var(--radius-lg); padding: var(--space-3); display: flex; flex-direction: column; gap: 8px; min-width: 0; }
    .col-head { display: flex; align-items: center; justify-content: space-between; padding: var(--space-1) var(--space-2); font-weight: 600; }
    .drop { min-height: 80px; display: flex; flex-direction: column; gap: 8px; flex: 1; }
    .c { background: var(--surface); border: 1px solid transparent; border-radius: var(--radius-md); padding: var(--space-3); cursor: grab; box-shadow: var(--shadow); display: flex; flex-direction: column; gap: 4px; }
    .c:hover { border-color: var(--border-strong); } .c-title { all: unset; cursor: pointer; font-weight: 600; font-size: 14px; display: block; overflow-wrap: anywhere; } .c-title:hover { color: var(--accent); } .c-title:focus-visible { outline: 2px solid var(--focus-ring); }
    .meta { display: flex; gap: 4px; align-items: center; font-size: 12px; color: var(--text-2); } .meta .material-icons { font-size: 14px; width: 14px; height: 14px; }
    .due { color: var(--warning); font-weight: 500; }
    .cdk-drag-preview { box-shadow: var(--shadow-lg); border-radius: var(--radius-md); } .cdk-drag-placeholder { opacity: .35; } .cdk-drag-animating { transition: transform 120ms ease-out; } .drop.cdk-drop-list-dragging .c:not(.cdk-drag-placeholder) { transition: transform 120ms ease-out; }`,
  template: `<div class="page">
    <div class="page-head">
      <div><h1>Application tracker</h1><p>Drag cards between stages, or use the stage menu on each card.</p></div>
      <div class="actions">
        <mat-button-toggle-group [value]="view()" (change)="view.set($event.value)" aria-label="View" hideSingleSelectionIndicator>
          <mat-button-toggle value="board"><mat-icon aria-hidden="true">view_kanban</mat-icon> Board</mat-button-toggle><mat-button-toggle value="table"><mat-icon aria-hidden="true">table_rows</mat-icon> Table</mat-button-toggle>
        </mat-button-toggle-group>
        <button mat-flat-button type="button" (click)="open(null)"><mat-icon>add</mat-icon>Add application</button>
      </div>
    </div>

    @if (followUps().length) {
      <div class="notice warning"><mat-icon aria-hidden="true">notifications_active</mat-icon>
        <div><div class="strong">Follow-ups due</div>@for (f of followUps(); track f.id) { <div><button class="c-title inline medium" type="button" (click)="open(f.id)">{{ f.company }}: {{ f.job_title }}</button> <span class="muted">by {{ f.follow_up_at | date: 'mediumDate' }}</span></div> }</div></div>
    }
    @if (error()) { <app-error [message]="error()" (retry)="load()" /> }
    @if (loading()) { <app-skeleton [count]="6" [height]="260" [min]="180" /> }
    @else if (view() === 'board') {
      <div class="board" cdkDropListGroup>
        @for (s of stages; track s) {
          <section class="col" [attr.aria-label]="label(s)">
            <div class="col-head"><app-status [status]="s" /><span class="muted xs">{{ columns()[s].length }}</span></div>
            <div class="drop" cdkDropList [cdkDropListData]="columns()[s]" [id]="s" (cdkDropListDropped)="drop($event, s)">
              @for (a of columns()[s]; track a.id) {
                <article class="c" cdkDrag [cdkDragData]="a">
                  <div class="row between nowrap items-start">
                    <div class="grow"><button class="c-title" type="button" (click)="open(a.id)">{{ a.job_title }}</button><div class="muted xs">{{ a.company }}</div></div>
                    <button class="icon-btn-28" mat-icon-button type="button" [matMenuTriggerFor]="m" [attr.aria-label]="'Change stage for ' + a.job_title" (mousedown)="$event.stopPropagation()"><mat-icon>more_horiz</mat-icon></button>
                    <mat-menu #m="matMenu">@for (t of stages; track t) { @if (t !== s) { <button mat-menu-item type="button" (click)="moveTo(a, t)">Move to {{ label(t) }}</button> } }</mat-menu>
                  </div>
                  @if (a.next_interview) { <div class="meta"><mat-icon aria-hidden="true">event</mat-icon>{{ a.next_interview | date: 'MMM d, h:mm a' }}</div> }
                  @if (a.follow_up_at && s !== 'offer' && s !== 'rejected') { <div class="meta" [class.due]="isDue(a.follow_up_at)"><mat-icon aria-hidden="true">schedule</mat-icon>Follow up {{ a.follow_up_at | date: 'MMM d' }}</div> }
                  @if (a.resume_title) { <div class="meta"><mat-icon aria-hidden="true">description</mat-icon><span class="truncate">{{ a.resume_title }} v{{ a.version_no }}</span></div> }
                  @if (a.note_count) { <div class="meta"><mat-icon aria-hidden="true">sticky_note_2</mat-icon>{{ a.note_count }} note{{ a.note_count === 1 ? '' : 's' }}</div> }
                </article>
              }
            </div>
            <button mat-button type="button" (click)="open(null, s)"><mat-icon>add</mat-icon>Add</button>
          </section>
        }
      </div>
    } @else {
      <section class="card card-tight"><div class="table-wrap"><table class="tbl">
        <thead><tr><th>Role</th><th>Company</th><th>Stage</th><th>Applied</th><th>Follow up</th><th>Next interview</th><th>Resume</th></tr></thead>
        <tbody>
          @for (a of items(); track a.id) {
            <tr><td><button class="c-title" type="button" (click)="open(a.id)">{{ a.job_title }}</button></td><td>{{ a.company }}</td>
              <td><mat-select class="w-120" [value]="a.status" (selectionChange)="moveTo(a, $event.value)" [aria-label]="'Stage for ' + a.job_title">@for (t of stages; track t) { <mat-option [value]="t">{{ label(t) }}</mat-option> }</mat-select></td>
              <td>{{ a.applied_at ? (a.applied_at | date: 'mediumDate') : '–' }}</td><td [class.due]="a.follow_up_at && isDue(a.follow_up_at)">{{ a.follow_up_at ? (a.follow_up_at | date: 'mediumDate') : '–' }}</td>
              <td>{{ a.next_interview ? (a.next_interview | date: 'MMM d, h:mm a') : '–' }}</td><td>{{ a.resume_title ? a.resume_title + ' v' + a.version_no : '–' }}</td></tr>
          } @empty { <tr><td colspan="7" class="muted p-6 text-center">Nothing tracked yet. Add your first application.</td></tr> }
        </tbody>
      </table></div></section>
    }
  </div>`,
})
export class TrackerPage implements OnInit {
  private api = inject(ApiService); private toast = inject(ToastService); private dialog = inject(MatDialog);
  stages: Stage[] = ['saved', 'applied', 'assessment', 'interview', 'offer', 'rejected'];
  view = signal<'board' | 'table'>('board'); items = signal<Application[]>([]); followUps = signal<FollowUp[]>([]); loading = signal(true); error = signal('');
  label = stageLabel;
  columns = computed(() => {
    const out = Object.fromEntries(this.stages.map((s) => [s, [] as Application[]])) as Record<Stage, Application[]>;
    for (const a of this.items()) out[a.status].push(a);
    return out;
  });
  ngOnInit() { this.load(); }
  load() {
    this.error.set('');
    this.api.get<Board>('/job-tracker').subscribe({
      next: (b) => { this.items.set(b.items); this.followUps.set(b.followUps); this.loading.set(false); },
      error: (e) => { this.error.set(errorMessage(e)); this.loading.set(false); },
    });
  }
  isDue(d: string) { return new Date(d).getTime() <= Date.now(); }
  open(id: number | null, status?: Stage) {
    this.dialog.open(ApplicationDialog, { data: { id, status }, width: '720px', maxWidth: '94vw', maxHeight: '90vh' }).afterClosed().subscribe((changed) => { if (changed) this.load(); });
  }
  drop(e: CdkDragDrop<Application[]>, to: Stage) {
    const a = e.item.data as Application;
    if (e.previousContainer === e.container && e.previousIndex === e.currentIndex) return;
    // Update the screen first, so the card doesn't jump back while the save is in flight.
    const cols = this.columns();
    if (e.previousContainer === e.container) moveItemInArray(cols[to], e.previousIndex, e.currentIndex);
    else transferArrayItem(cols[a.status], cols[to], e.previousIndex, e.currentIndex);
    this.items.set(this.stages.flatMap((s) => cols[s].map((x) => (x.id === a.id ? { ...x, status: to } : x))));
    this.send(a.id, to, e.currentIndex);
  }
  moveTo(a: Application, to: Stage) {
    if (a.status === to) return;
    this.items.update((l) => l.map((x) => (x.id === a.id ? { ...x, status: to } : x)));
    this.send(a.id, to, this.columns()[to].length);
  }
  private send(id: number, status: Stage, index: number) {
    this.api.post(`/job-tracker/${id}/move`, { status, index }).subscribe({
      next: () => this.load(),
      error: (e) => { this.toast.error(e, "That change wasn't saved."); this.load(); },
    });
  }
}
