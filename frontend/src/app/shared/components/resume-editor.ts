import { CdkDragDrop, DragDropModule, moveItemInArray } from '@angular/cdk/drag-drop';
import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { StructuredResume } from '../../core/models';

export const DEFAULT_ORDER = ['summary', 'experience', 'education', 'skills', 'projects', 'certifications', 'achievements', 'languages'];
export const SECTION_LABEL: Record<string, string> = { summary: 'Summary', experience: 'Experience', education: 'Education', skills: 'Skills', projects: 'Projects', certifications: 'Certifications', achievements: 'Achievements', languages: 'Languages' };

export const blankResume = (): StructuredResume => ({
  personal: { fullName: '', email: '', phone: '', location: '', linkedin: '', website: '' }, summary: '', experience: [], education: [],
  skills: [], certifications: [], projects: [], achievements: [], languages: [], sectionOrder: [...DEFAULT_ORDER],
});

const lines = (s: string) => s.split('\n').map((x) => x.trim()).filter(Boolean);
const commas = (s: string) => s.split(/[,\n]/).map((x) => x.trim()).filter(Boolean);

/** Edits every resume section. Emits a fresh object on each change, so parents can hold it in a signal. */
@Component({
  selector: 'app-resume-editor', imports: [FormsModule, DragDropModule, MatButtonModule, MatCheckboxModule, MatFormFieldModule, MatIconModule, MatInputModule], changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.sec { display: flex; flex-direction: column; gap: 8px; } .sec + .sec { border-top: 1px solid var(--border); padding-top: 16px; margin-top: 16px; }
    .item { border: 1px solid var(--border); border-radius: var(--radius-md); padding: 12px 12px 0; position: relative; margin-bottom: 8px; }
    .order { display: flex; flex-direction: column; gap: 4px; } .ord { display: flex; align-items: center; gap: 8px; padding: 2px 4px 2px 10px; background: var(--surface-2); border-radius: var(--radius-sm); cursor: grab; font-size: 13px; }
    .ord .sp { flex: 1; } .cdk-drag-preview { box-shadow: var(--shadow-lg); } .cdk-drag-placeholder { opacity: .3; }`,
  template: `@let r = value();
  <div class="sec">
    <h2>Personal details</h2>
    <div class="form-grid">
      <mat-form-field appearance="outline"><mat-label>Full name</mat-label><input matInput [ngModel]="r.personal.fullName" (ngModelChange)="setP('fullName', $event)" name="fn" /></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Email</mat-label><input matInput type="email" [ngModel]="r.personal.email" (ngModelChange)="setP('email', $event)" name="em" /></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Phone</mat-label><input matInput [ngModel]="r.personal.phone" (ngModelChange)="setP('phone', $event)" name="ph" /></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Location</mat-label><input matInput [ngModel]="r.personal.location" (ngModelChange)="setP('location', $event)" name="lo" /></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>LinkedIn URL</mat-label><input matInput [ngModel]="r.personal.linkedin" (ngModelChange)="setP('linkedin', $event)" name="li" /></mat-form-field>
      <mat-form-field appearance="outline"><mat-label>Website</mat-label><input matInput [ngModel]="r.personal.website" (ngModelChange)="setP('website', $event)" name="we" /></mat-form-field>
    </div>
  </div>

  @if (showOrder()) {
    <div class="sec">
      <h2>Section order</h2>
      <p class="muted small">Drag to reorder, or use the arrows.</p>
      <div class="order" cdkDropList (cdkDropListDropped)="dropSection($event)">
        @for (s of order(); track s; let i = $index) {
          <div class="ord" cdkDrag>
            <mat-icon class="icon-16" aria-hidden="true">drag_indicator</mat-icon>{{ labels[s] }}<span class="sp"></span>
            <button mat-icon-button type="button" [disabled]="i === 0" (click)="moveSection(i, -1)" [attr.aria-label]="'Move ' + labels[s] + ' up'"><mat-icon>arrow_upward</mat-icon></button>
            <button mat-icon-button type="button" [disabled]="i === order().length - 1" (click)="moveSection(i, 1)" [attr.aria-label]="'Move ' + labels[s] + ' down'"><mat-icon>arrow_downward</mat-icon></button>
          </div>
        }
      </div>
    </div>
  }

  <div class="sec">
    <h2>Summary</h2>
    <mat-form-field appearance="outline"><mat-label>Professional summary</mat-label><textarea matInput rows="4" [ngModel]="r.summary" (ngModelChange)="patch({ summary: $event })" name="su"></textarea></mat-form-field>
  </div>

  <div class="sec">
    <div class="row between"><h2>Experience</h2><button mat-stroked-button type="button" (click)="addExp()"><mat-icon>add</mat-icon>Add role</button></div>
    @for (e of r.experience; track $index; let i = $index) {
      <div class="item">
        <div class="form-grid">
          <mat-form-field appearance="outline"><mat-label>Job title</mat-label><input matInput [ngModel]="e.title" (ngModelChange)="setExp(i, { title: $event })" [name]="'et' + i" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Company</mat-label><input matInput [ngModel]="e.company" (ngModelChange)="setExp(i, { company: $event })" [name]="'ec' + i" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Start date</mat-label><input matInput placeholder="Jan 2021" [ngModel]="e.startDate" (ngModelChange)="setExp(i, { startDate: $event })" [name]="'es' + i" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>End date</mat-label><input matInput placeholder="Mar 2024" [disabled]="!!e.current" [ngModel]="e.endDate" (ngModelChange)="setExp(i, { endDate: $event })" [name]="'ee' + i" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Location</mat-label><input matInput [ngModel]="e.location" (ngModelChange)="setExp(i, { location: $event })" [name]="'el' + i" /></mat-form-field>
          <div class="pt-2"><mat-checkbox [ngModel]="!!e.current" (ngModelChange)="setExp(i, { current: $event })" [name]="'ecu' + i">I work here now</mat-checkbox></div>
          <mat-form-field appearance="outline" class="span-all"><mat-label>Achievements</mat-label><textarea matInput rows="4" [ngModel]="e.bullets.join('\n')" (ngModelChange)="setExp(i, { bullets: toLines($event) })" [ngModelOptions]="{ updateOn: 'blur', name: 'eb' + i }"></textarea><mat-hint>One bullet per line</mat-hint></mat-form-field>
        </div>
        <div class="row justify-end py-2"><button mat-button type="button" (click)="removeAt('experience', i)"><mat-icon>delete_outline</mat-icon>Remove role</button></div>
      </div>
    } @empty { <p class="muted small">No roles added.</p> }
  </div>

  <div class="sec">
    <div class="row between"><h2>Education</h2><button mat-stroked-button type="button" (click)="addEdu()"><mat-icon>add</mat-icon>Add education</button></div>
    @for (e of r.education; track $index; let i = $index) {
      <div class="item">
        <div class="form-grid">
          <mat-form-field appearance="outline"><mat-label>Degree</mat-label><input matInput [ngModel]="e.degree" (ngModelChange)="setEdu(i, { degree: $event })" [name]="'ed' + i" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Institution</mat-label><input matInput [ngModel]="e.institution" (ngModelChange)="setEdu(i, { institution: $event })" [name]="'ei' + i" /></mat-form-field>
          <mat-form-field appearance="outline"><mat-label>Year</mat-label><input matInput [ngModel]="e.year" (ngModelChange)="setEdu(i, { year: $event })" [name]="'ey' + i" /></mat-form-field>
        </div>
        <div class="row justify-end pb-2"><button mat-button type="button" (click)="removeAt('education', i)"><mat-icon>delete_outline</mat-icon>Remove</button></div>
      </div>
    } @empty { <p class="muted small">No education added.</p> }
  </div>

  <div class="sec">
    <div class="row between"><h2>Projects</h2><button mat-stroked-button type="button" (click)="addProject()"><mat-icon>add</mat-icon>Add project</button></div>
    @for (p of r.projects; track $index; let i = $index) {
      <div class="item">
        <mat-form-field appearance="outline"><mat-label>Name</mat-label><input matInput [ngModel]="p.name" (ngModelChange)="setProject(i, { name: $event })" [name]="'pn' + i" /></mat-form-field>
        <mat-form-field appearance="outline"><mat-label>Description</mat-label><textarea matInput rows="2" [ngModel]="p.description" (ngModelChange)="setProject(i, { description: $event })" [name]="'pd' + i"></textarea></mat-form-field>
        <div class="row justify-end pb-2"><button mat-button type="button" (click)="removeAt('projects', i)"><mat-icon>delete_outline</mat-icon>Remove</button></div>
      </div>
    } @empty { <p class="muted small">No projects added.</p> }
  </div>

  <div class="sec">
    <h2>Skills and more</h2>
    <mat-form-field appearance="outline"><mat-label>Skills</mat-label><textarea matInput rows="2" [ngModel]="r.skills.join(', ')" (ngModelChange)="patch({ skills: toList($event) })" [ngModelOptions]="{ updateOn: 'blur', name: 'sk' }"></textarea><mat-hint>Separate with commas</mat-hint></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Certifications</mat-label><textarea matInput rows="2" [ngModel]="r.certifications.join('\n')" (ngModelChange)="patch({ certifications: toLines($event) })" [ngModelOptions]="{ updateOn: 'blur', name: 'ce' }"></textarea><mat-hint>One per line</mat-hint></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Achievements and awards</mat-label><textarea matInput rows="2" [ngModel]="r.achievements.join('\n')" (ngModelChange)="patch({ achievements: toLines($event) })" [ngModelOptions]="{ updateOn: 'blur', name: 'ac' }"></textarea><mat-hint>One per line</mat-hint></mat-form-field>
    <mat-form-field appearance="outline"><mat-label>Languages</mat-label><input matInput [ngModel]="r.languages.join(', ')" (ngModelChange)="patch({ languages: toList($event) })" [ngModelOptions]="{ updateOn: 'blur', name: 'la' }" /><mat-hint>Separate with commas</mat-hint></mat-form-field>
  </div>`,
})
export class ResumeEditor {
  value = input.required<StructuredResume>();
  showOrder = input(false);
  changed = output<StructuredResume>();
  labels = SECTION_LABEL;
  toLines = lines; toList = commas;
  order = computed(() => this.value().sectionOrder?.length ? this.value().sectionOrder! : DEFAULT_ORDER);

  patch(p: Partial<StructuredResume>) { this.changed.emit({ ...this.value(), ...p }); }
  setP(k: keyof StructuredResume['personal'], v: string) { this.patch({ personal: { ...this.value().personal, [k]: v } }); }
  setExp(i: number, p: Partial<StructuredResume['experience'][number]>) { this.patch({ experience: this.value().experience.map((e, j) => (j === i ? { ...e, ...p } : e)) }); }
  setEdu(i: number, p: Partial<StructuredResume['education'][number]>) { this.patch({ education: this.value().education.map((e, j) => (j === i ? { ...e, ...p } : e)) }); }
  setProject(i: number, p: Partial<StructuredResume['projects'][number]>) { this.patch({ projects: this.value().projects.map((e, j) => (j === i ? { ...e, ...p } : e)) }); }
  addExp() { this.patch({ experience: [...this.value().experience, { title: '', company: '', bullets: [] }] }); }
  addEdu() { this.patch({ education: [...this.value().education, { degree: '', institution: '' }] }); }
  addProject() { this.patch({ projects: [...this.value().projects, { name: '', description: '' }] }); }
  removeAt(key: 'experience' | 'education' | 'projects', i: number) { this.patch({ [key]: (this.value()[key] as unknown[]).filter((_, j) => j !== i) } as Partial<StructuredResume>); }
  dropSection(e: CdkDragDrop<string[]>) { const o = [...this.order()]; moveItemInArray(o, e.previousIndex, e.currentIndex); this.patch({ sectionOrder: o }); }
  moveSection(i: number, d: number) { const o = [...this.order()]; moveItemInArray(o, i, i + d); this.patch({ sectionOrder: o }); }
}
