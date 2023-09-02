import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

@Component({
  selector: 'app-join-session-dialog',
  templateUrl: './join-session-dialog.component.html',
  styleUrls: ['./join-session-dialog.component.scss'],
})
export class JoinSessionDialogComponent {
  constructor(
    protected readonly dialogRef: MatDialogRef<JoinSessionDialogComponent>,
  ) {}

  protected onCancel(): void {
    this.dialogRef.close();
  }
}
