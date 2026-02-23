import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

@Component({
  standalone: true,
  selector: 'app-register',
  imports: [CommonModule, FormsModule, RouterLink],
  templateUrl: './register.html',
  styleUrl: './register.scss'
})
export class Register {
  firstName = '';
  lastName = '';
  email = '';
  password = '';
  confirmPassword = '';
  phone = '';
  docType = '';
  docNumber = '';
  department = '';
  city = '';
  neighborhood = '';
  address = '';
  errorMessage = '';
  successMessage = '';
  loading = false;

  constructor(
    private authService: AuthService,
    private router: Router
  ) {}

  async onSubmit() {
    this.errorMessage = '';
    this.successMessage = '';
    this.loading = true;
    try {
      const fullName = `${this.firstName} ${this.lastName}`.trim();
      if (!fullName) {
        this.errorMessage = 'Ingresa tus nombres y apellidos';
        return;
      }

      if (this.password !== this.confirmPassword) {
        this.errorMessage = 'Las contrasenas no coinciden';
        return;
      }

      const result = await Promise.race([
        this.authService.register({
          name: fullName,
          email: this.email,
          password: this.password
        }),
        new Promise<{ success: false; message: string }>((resolve) =>
          setTimeout(() => resolve({
            success: false,
            message: 'Tiempo de espera agotado. Revisa internet o la configuración de Supabase.'
          }), 15000)
        )
      ]);

      if (result.success) {
        this.successMessage = result.message ?? 'Usuario registrado correctamente';
        setTimeout(() => this.router.navigate(['/login']), 1200);
        return;
      }

      this.errorMessage = result.message ?? 'Error al registrar usuario';
    } catch {
      this.errorMessage = 'Ocurrió un error inesperado registrando el usuario';
    } finally {
      this.loading = false;
    }
  }
}
