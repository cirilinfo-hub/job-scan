import { Component, inject } from '@angular/core';
import { MAT_DIALOG_DATA, MatDialog, MatDialogModule, MatDialogRef } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { Observable } from 'rxjs';
import { Injectable } from '@angular/core';

export interface ConfirmData { title: string; message: string; confirmLabel: string; danger?: boolean }

@Component({
  imports: [MatDialogModule, MatButtonModule],
  template: `<h2 mat-dialog-title>{{ data.title }}</h2>
    <mat-dialog-content><p>{{ data.message }}</p></mat-dialog-content>
    <mat-dialog-actions align="end">
      <button mat-button type="button" (click)="ref.close(false)">Cancel</button>
      <button mat-flat-button type="button" [style.--mat-button-filled-container-color]="data.danger ? 'var(--danger)' : null" (click)="ref.close(true)">{{ data.confirmLabel }}</button>
    </mat-dialog-actions>`,
})
export class ConfirmationDialog {
  data = inject<ConfirmData>(MAT_DIALOG_DATA);
  ref = inject(MatDialogRef<ConfirmationDialog>);
}

@Injectable({ providedIn: 'root' })
export class ConfirmService {
  private dialog = inject(MatDialog);
  ask(data: ConfirmData): Observable<boolean> {
    return this.dialog.open(ConfirmationDialog, { data, width: '420px', maxWidth: '94vw' }).afterClosed();
  }
}
