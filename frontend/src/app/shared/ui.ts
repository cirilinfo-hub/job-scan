import { DatePipe, DecimalPipe, NgTemplateOutlet } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatCheckboxModule } from '@angular/material/checkbox';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatMenuModule } from '@angular/material/menu';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatSelectModule } from '@angular/material/select';
import { MatTooltipModule } from '@angular/material/tooltip';
import { RouterLink } from '@angular/router';

/** The building blocks most screens need. */
export const UI = [
  RouterLink, ReactiveFormsModule, DatePipe, DecimalPipe, NgTemplateOutlet, MatButtonModule, MatIconModule, MatFormFieldModule,
  MatInputModule, MatSelectModule, MatMenuModule, MatTooltipModule, MatProgressSpinnerModule, MatCheckboxModule,
] as const;
