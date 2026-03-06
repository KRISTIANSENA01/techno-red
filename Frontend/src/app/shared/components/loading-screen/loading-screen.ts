import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-loading-screen',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './loading-screen.html',
  styleUrl: './loading-screen.scss'
})
export class LoadingScreen {
  @Input() visible = false;
  @Input() message = 'Cargando...';
  @Input() fullScreen = false;
}
