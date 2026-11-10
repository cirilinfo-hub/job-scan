import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BRAND } from '../../core/brand';

/** Sign-in, registration and password screens: brand copy and decorative blocks on the left, the form on the right. */
@Component({
  selector: 'app-auth-layout', imports: [RouterOutlet],
  styles: `:host { display: grid; min-height: 100vh; min-height: 100dvh; grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr); background: var(--bg); }
    .hero { display: flex; flex-direction: column; gap: var(--space-12); padding: var(--space-12); }
    .brand { display: flex; align-items: center; gap: var(--space-3); } .brand img { width: 36px; height: 36px; }
    .copy { position: relative; z-index: 1; max-width: 30rem; display: flex; flex-direction: column; gap: var(--space-6); }
    .intro { font-size: 18px; line-height: 1.45; color: var(--text-2); max-width: 46ch; }
    .points { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--space-3); font-weight: 500; }
    .points li { display: flex; align-items: center; gap: var(--space-3); }
    .dot { width: 12px; height: 12px; border-radius: 50%; flex: none; }
    .d1 { background: var(--blue-600); } .d2 { background: var(--navy-700); } .d3 { background: var(--accent-mint); }
    .art { align-self: flex-end; width: min(380px, 70%); height: auto; margin-top: auto; flex: none; }
    .slab { fill: var(--navy-700); } .disc { fill: var(--blue-600); } .sun { fill: var(--accent-yellow); } .mint { fill: var(--accent-mint); } .hole { fill: var(--bg); } .tint { fill: var(--surface-2); }
    .side { display: grid; place-items: center; padding: var(--space-8) var(--space-6); }
    .box { width: 100%; max-width: 440px; }
    .form-card { padding: var(--space-8); border-radius: var(--radius-xl); box-shadow: var(--shadow-lg); }
    @media (max-width: 1023px) {
      :host { grid-template-columns: minmax(0, 1fr); }
      .hero { padding: var(--space-6) var(--space-6) 0; } .copy, .art, .points { display: none; }
      .side { place-items: start center; padding: var(--space-6) var(--space-4) var(--space-12); }
    }
    @media (max-width: 767px) { .form-card { padding: var(--space-6) var(--space-5); border-radius: var(--radius-lg); } }`,
  template: `<section class="hero">
      <div class="brand"><img src="favicon.svg" alt="" /><span class="wordmark">{{ brand.name }}</span></div>
      <div class="copy">
        <p class="display">{{ brand.tagline }}</p>
        <p class="intro">Check your resume against a job description, track every application in one place, and get ready for interviews.</p>
        <ul class="points">
          <li><span class="dot d1" aria-hidden="true"></span>See which keywords a job asks for</li>
          <li><span class="dot d2" aria-hidden="true"></span>Keep applications moving on one board</li>
          <li><span class="dot d3" aria-hidden="true"></span>Practise answers before the interview</li>
        </ul>
      </div>
      <svg class="art" viewBox="0 0 440 400" aria-hidden="true" focusable="false">
        <rect class="slab" x="24" y="40" width="176" height="232" rx="40" />
        <circle class="hole" cx="64" cy="232" r="12" /><circle class="hole" cx="112" cy="232" r="12" /><circle class="hole" cx="160" cy="232" r="12" />
        <circle class="disc" cx="296" cy="128" r="80" />
        <rect class="sun" x="216" y="232" width="176" height="104" rx="24" />
        <rect class="mint" x="24" y="288" width="176" height="64" rx="32" />
        <circle class="tint" cx="404" cy="36" r="36" />
      </svg>
    </section>
    <div class="side">
      <div class="box">
        <main class="card form-card"><router-outlet /></main>
      </div>
    </div>`,
})
export class AuthLayout { brand = BRAND; }
