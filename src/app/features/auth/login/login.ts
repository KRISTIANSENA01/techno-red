import { Component } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { AuthService } from '../../../core/services/auth.service';
import { CartService } from '../../../core/services/cart.service';

@Component({
  standalone: true,
  selector: 'app-login',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './login.html',
  styleUrl: './login.scss'
})
export class Login {

  email = '';
  password = '';
  errorMessage = '';
  loading = false;
  showPassword = false;

  constructor(
    private authService: AuthService,
    private cartService: CartService,
    private router: Router
  ) {}

  async onSubmit() {
    this.errorMessage = '';
    this.loading = true;

    try {
      const result = await Promise.race([
        this.authService.login(this.email, this.password),
        new Promise<{ success: false; message: string }>((resolve) =>
          setTimeout(() => resolve({
            success: false,
            message: 'No se pudo iniciar sesion a tiempo. Intenta nuevamente.'
          }), 9000)
        )
      ]);

      if (result.success) {
        this.cartService.setActiveUser(this.authService.getCurrentUser()?.id ?? null);
        if (this.authService.canAccessPanel()) {
          this.router.navigate(['/panel']);
        } else {
          this.router.navigate(['/']);
        }
        return;
      }

      this.errorMessage = result.message ?? 'Credenciales incorrectas';
    } finally {
      this.loading = false;
    }
  }

  togglePassword(event?: Event) {
    event?.preventDefault();
    event?.stopPropagation();
    this.showPassword = !this.showPassword;
  }
}
