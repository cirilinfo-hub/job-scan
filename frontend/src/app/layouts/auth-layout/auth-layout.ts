import { Component } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { BRAND } from '../../core/brand';

@Component({
  selector: 'app-auth-layout', imports: [RouterOutlet],
  styles: `:host { display: grid; min-height: 100vh; min-height: 100dvh; place-items: center; padding: 24px 16px; }
    .box { width: 100%; max-width: 400px; display: flex; flex-direction: column; gap: 16px; }
    .brand { display: flex; align-items: center; gap: 10px; font-size: 18px; font-weight: 600; justify-content: center; } .brand img { width: 32px; height: 32px; }`,
  template: `<div class="box">
    <div class="brand"><img src="favicon.svg" alt="" />{{ brand.name }}</div>
    <main class="card" style="padding:24px"><router-outlet /></main>
  </div>`,
})
export class AuthLayout { brand = BRAND; }
