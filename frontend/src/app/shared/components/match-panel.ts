import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { MatchBreakdown } from '../../core/models';
import { ProgressBar, ScoreIndicator, scoreTone } from './widgets';

@Component({
  selector: 'app-match-panel', imports: [ProgressBar, ScoreIndicator], changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.l { display: grid; grid-template-columns: 110px 1fr 28px; gap: 8px; align-items: center; font-size: 12px; } h3 { margin: 8px 0 4px; font-size: 13px; }`,
  template: `@let b = m();
  <div class="stack small">
    <div class="row nowrap"><app-score [value]="b.score" [size]="56" label="Match score" /><span class="muted xs">{{ b.disclaimer }}</span></div>
    <div class="stack-sm">
      @for (c of b.components; track c.key) {
        <div class="l"><span>{{ c.label }}</span>
          @if (c.score === null) { <span class="muted">Not enough information</span><span></span> }
          @else { <app-progress [value]="c.score" [tone]="tone(c.score)" [label]="c.label" /><span class="strong">{{ c.score }}</span> }
        </div>
      }
    </div>
    @if (b.reasons.length) { <div><h3>Why it's relevant</h3>@for (r of b.reasons; track r) { <div>{{ r }}</div> }</div> }
    @if (b.skillsMatched.length) { <div><h3>Skills matched</h3><div class="chips">@for (s of b.skillsMatched; track s) { <span class="chip ok">{{ s }}</span> }</div></div> }
    @if (b.skillsMissing.length) { <div><h3>Missing skills</h3><div class="chips">@for (s of b.skillsMissing; track s) { <span class="chip miss">{{ s }}</span> }</div></div> }
    @if (b.experienceGap) { <div><h3>Experience gap</h3><div>{{ b.experienceGap }}</div></div> }
    @if (b.improvements.length) { <div><h3>Recommended improvements</h3>@for (r of b.improvements; track r) { <div>{{ r }}</div> }</div> }
    @if (b.unknown.length) { <div class="muted xs">Left out of this score because we don't have it: {{ b.unknown.join(', ') }}.</div> }
  </div>`,
})
export class MatchPanel { m = input.required<MatchBreakdown>(); tone = scoreTone; }
