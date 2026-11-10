import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { StructuredResume } from '../../core/models';
import { DEFAULT_ORDER, SECTION_LABEL } from './resume-editor';

/** HTML preview using the same reading order and template choices as the PDF and DOCX output. */
@Component({
  selector: 'app-resume-preview', changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.paper { background: #fff; color: #111; padding: 32px; border-radius: 4px; border: 1px solid var(--border); font-size: 13px; line-height: 1.45; word-break: break-word; }
    .name { font-size: 22px; font-weight: 700; } .contact { color: #333; font-size: 12px; margin-bottom: 8px; }
    h3 { font-size: 13px; letter-spacing: .04em; border-bottom: 1px solid #bbb; margin: 12px 0 6px; padding-bottom: 2px; text-transform: uppercase; }
    .role { display: flex; justify-content: space-between; gap: 12px; font-weight: 600; margin-top: 6px; } .role span:last-child { font-weight: 400; white-space: nowrap; }
    ul { margin: 2px 0 6px; padding-left: 18px; } p { margin: 0; }
    .classic { font-family: 'Times New Roman', Times, serif; } .classic .name, .classic .contact { text-align: center; }
    .modern h3 { color: #0b6e63; } .compact { font-size: 12px; line-height: 1.3; padding: 24px; } .compact h3 { margin-top: 8px; }`,
  template: `@let r = value();
  <div class="paper" [class]="'paper ' + template()">
    <div class="name">{{ r.personal.fullName || 'Your name' }}</div>
    <div class="contact">{{ contact() }}</div>
    @for (s of order(); track s) {
      @switch (s) {
        @case ('summary') { @if (r.summary) { <h3>{{ labels[s] }}</h3><p>{{ r.summary }}</p> } }
        @case ('experience') { @if (r.experience.length) { <h3>{{ labels[s] }}</h3>
          @for (e of r.experience; track $index) {
            <div class="role"><span>{{ join([e.title, e.company]) }}</span><span>{{ e.startDate }}{{ e.startDate ? ' - ' : '' }}{{ e.current ? 'Present' : e.endDate }}</span></div>
            @if (e.location) { <div>{{ e.location }}</div> }
            @if (e.bullets.length) { <ul>@for (b of e.bullets; track $index) { <li>{{ b }}</li> }</ul> }
          } } }
        @case ('education') { @if (r.education.length) { <h3>{{ labels[s] }}</h3>
          @for (e of r.education; track $index) { <div class="role"><span>{{ join([e.degree, e.institution]) }}</span><span>{{ e.year }}</span></div> } } }
        @case ('skills') { @if (r.skills.length) { <h3>{{ labels[s] }}</h3><p>{{ r.skills.join(', ') }}</p> } }
        @case ('projects') { @if (r.projects.length) { <h3>{{ labels[s] }}</h3><ul>@for (p of r.projects; track $index) { <li>{{ join([p.name, p.description], ': ') }}</li> }</ul> } }
        @case ('certifications') { @if (r.certifications.length) { <h3>{{ labels[s] }}</h3><ul>@for (c of r.certifications; track $index) { <li>{{ c }}</li> }</ul> } }
        @case ('achievements') { @if (r.achievements.length) { <h3>{{ labels[s] }}</h3><ul>@for (a of r.achievements; track $index) { <li>{{ a }}</li> }</ul> } }
        @case ('languages') { @if (r.languages.length) { <h3>{{ labels[s] }}</h3><p>{{ r.languages.join(', ') }}</p> } }
      }
    }
  </div>`,
})
export class ResumePreview {
  value = input.required<StructuredResume>();
  template = input('classic');
  labels = SECTION_LABEL;
  order = computed(() => this.value().sectionOrder?.length ? this.value().sectionOrder! : DEFAULT_ORDER);
  contact = computed(() => { const p = this.value().personal; return [p.email, p.phone, p.location, p.linkedin, p.website].filter(Boolean).join('  |  '); });
  join(xs: (string | undefined)[], sep = ', ') { return xs.filter(Boolean).join(sep); }
}
