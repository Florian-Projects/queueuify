import {
  Component,
  EventEmitter,
  Input,
  OnChanges,
  Output,
  SimpleChanges,
} from '@angular/core';

@Component({
  selector: 'app-menubar',
  templateUrl: './menubar.component.html',
  styleUrls: ['./menubar.component.scss'],
})
export class MenubarComponent {
  @Input() loggedIn: boolean = false;
  @Output() login = new EventEmitter<{ type: string }>();

  protected onLogin(type: string): void {
    this.login.emit({ type });
  }
}
