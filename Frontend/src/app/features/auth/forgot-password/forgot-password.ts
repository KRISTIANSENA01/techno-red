import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  standalone: true,
  selector: 'app-forgot-password',
  imports: [CommonModule, FormsModule],
  templateUrl: './forgot-password.html'
})
export class ForgotPassword {
  email = '';
  loading = false;
  message = '';
  error = '';

  constructor(private authService: AuthService) {}

  onSubmit() {
    this.loading = true;
    this.message = '';
    this.error = '';

    const result = this.authService.forgotPassword(this.email);

    if (result.success) {
      this.message = result.message;
    } else {
      this.error = result.message;
    }

    this.loading = false;
  }
}
