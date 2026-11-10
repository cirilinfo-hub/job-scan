import { AfterViewInit, ChangeDetectionStrategy, Component, ElementRef, OnDestroy, effect, inject, input, viewChild } from '@angular/core';
import type { Chart } from 'chart.js';
import { ThemeService } from '../../core/services/theme.service';

/** A single-series bar chart with tooltips. Chart.js loads only on screens that use it; a hidden table gives the same data to assistive tech. */
@Component({
  selector: 'app-bar-chart', changeDetection: ChangeDetectionStrategy.OnPush,
  styles: `.c { position: relative; width: 100%; }`,
  template: `<div class="c" [style.height.px]="height()"><canvas #canvas role="img" [attr.aria-label]="label()"></canvas></div>
    <table class="sr-only"><caption>{{ label() }}</caption><tbody>@for (l of labels(); track $index) { <tr><th scope="row">{{ l }}</th><td>{{ values()[$index] }}</td></tr> }</tbody></table>`,
})
export class BarChart implements AfterViewInit, OnDestroy {
  labels = input.required<string[]>(); values = input.required<number[]>(); label = input.required<string>(); height = input(220); horizontal = input(false); seriesName = input('Count');
  private canvas = viewChild.required<ElementRef<HTMLCanvasElement>>('canvas');
  private theme = inject(ThemeService);
  private chart: Chart | null = null;
  private ready = false;
  private destroyed = false;

  constructor() {
    effect(() => {
      const labels = this.labels(); const values = this.values(); this.theme.theme();
      if (this.ready) void this.render(labels, values);
    });
  }
  ngAfterViewInit() { this.ready = true; void this.render(this.labels(), this.values()); }
  ngOnDestroy() { this.destroyed = true; this.chart?.destroy(); }

  private async render(labels: string[], values: number[]) {
    const { default: ChartJS } = await import('chart.js/auto');
    if (this.destroyed) return;
    const css = getComputedStyle(document.documentElement);
    const v = (n: string) => css.getPropertyValue(n).trim();
    this.chart?.destroy();
    const axis = this.horizontal() ? 'y' : 'x';
    this.chart = new ChartJS(this.canvas().nativeElement, {
      type: 'bar',
      data: { labels, datasets: [{ label: this.seriesName(), data: values, backgroundColor: v('--accent'), hoverBackgroundColor: v('--accent'), borderRadius: 4, borderSkipped: 'start', maxBarThickness: 28, barPercentage: 0.7 }] },
      options: {
        indexAxis: axis, responsive: true, maintainAspectRatio: false, animation: false,
        plugins: { legend: { display: false }, tooltip: { backgroundColor: v('--text'), titleColor: v('--surface'), bodyColor: v('--surface'), displayColors: false, padding: 8, cornerRadius: 6 } },
        scales: {
          [axis]: { grid: { display: false }, border: { color: v('--border') }, ticks: { color: v('--text-2'), font: { family: 'Inter', size: 12 }, maxRotation: 0, autoSkip: true, maxTicksLimit: 10 } },
          [axis === 'x' ? 'y' : 'x']: { beginAtZero: true, grid: { color: v('--border') }, border: { display: false }, ticks: { color: v('--text-2'), font: { family: 'Inter', size: 12 }, precision: 0, maxTicksLimit: 5 } },
        },
      },
    });
  }
}
