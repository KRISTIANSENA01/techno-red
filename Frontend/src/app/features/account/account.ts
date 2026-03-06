import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { CartService } from '../../core/services/cart.service';

type AccountSection = 'profile' | 'addresses' | 'payments' | 'support' | 'password';

interface AddressItem {
  name: string;
  line1: string;
  city: string;
  detail: string;
  favorite: boolean;
}

@Component({
  selector: 'app-account',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './account.html',
  styleUrl: './account.scss'
})
export class Account implements OnInit {
  section: AccountSection = 'profile';

  fullName = '';
  email = '';
  docType = 'CC';
  docNumber = '';
  phone = '';
  additionalPhone = '';
  message = '';
  error = '';

  addresses: AddressItem[] = [];

  currentPassword = '';
  newPassword = '';
  confirmPassword = '';
  changingPassword = false;

  constructor(
    public authService: AuthService,
    private cartService: CartService,
    private router: Router
  ) {}

  ngOnInit() {
    const current = this.authService.getCurrentUser();
    if (!current) {
      this.router.navigate(['/login']);
      return;
    }

    this.fullName = current.name || '';
    this.email = current.email || '';
    this.loadProfile();
  }

  get greetingName() {
    return (this.fullName || 'Usuario').toUpperCase();
  }

  get passwordChecks() {
    return {
      length: this.newPassword.length >= 8,
      upper: /[A-Z]/.test(this.newPassword),
      special: /[^A-Za-z0-9]/.test(this.newPassword),
      noSpaces: !/\s/.test(this.newPassword) && this.newPassword.length > 0
    };
  }

  selectSection(section: AccountSection) {
    this.section = section;
    this.message = '';
    this.error = '';
  }

  saveProfile() {
    const current = this.authService.getCurrentUser();
    if (!current) {
      return;
    }

    const map = this.getProfileMap();
    map[current.id] = {
      fullName: this.fullName,
      docType: this.docType,
      docNumber: this.docNumber,
      phone: this.phone,
      additionalPhone: this.additionalPhone,
      addresses: this.addresses
    };
    localStorage.setItem('account_profiles', JSON.stringify(map));
    this.message = 'Datos guardados';
  }

  cancelProfile() {
    this.loadProfile();
    this.message = '';
    this.error = '';
  }

  addAddress() {
    this.addresses = [
      ...this.addresses,
      {
        name: 'Nueva direccion',
        line1: 'Calle 00 # 00 - 00',
        city: 'Bogota D.C.',
        detail: 'Editar direccion',
        favorite: this.addresses.length === 0
      }
    ];
    this.saveProfile();
  }

  async changePassword() {
    this.message = '';
    this.error = '';

    if (!this.currentPassword) {
      this.error = 'Ingresa tu contrasena actual';
      return;
    }

    if (this.newPassword !== this.confirmPassword) {
      this.error = 'La nueva contrasena no coincide';
      return;
    }

    const checks = this.passwordChecks;
    if (!checks.length || !checks.upper || !checks.special || !checks.noSpaces) {
      this.error = 'La nueva contrasena no cumple los requisitos';
      return;
    }

    this.changingPassword = true;
    const result = await this.authService.changePassword(this.newPassword);
    this.changingPassword = false;

    if (!result.success) {
      this.error = result.message ?? 'No se pudo cambiar la contrasena';
      return;
    }

    this.message = 'Contrasena actualizada';
    this.currentPassword = '';
    this.newPassword = '';
    this.confirmPassword = '';
  }

  async logout() {
    await this.authService.logout();
    this.cartService.setActiveUser(null);
    this.router.navigate(['/login']);
  }

  closeAccount() {
    this.router.navigate(['/']);
  }

  private loadProfile() {
    const current = this.authService.getCurrentUser();
    if (!current) {
      return;
    }

    const map = this.getProfileMap();
    const saved = map[current.id];

    if (saved) {
      this.fullName = saved.fullName ?? this.fullName;
      this.docType = saved.docType ?? 'CC';
      this.docNumber = saved.docNumber ?? '';
      this.phone = saved.phone ?? '';
      this.additionalPhone = saved.additionalPhone ?? '';
      this.addresses = saved.addresses ?? [];
      return;
    }

    this.addresses = [
      {
        name: 'Casa',
        line1: 'Carrera 68 bis sur # 18 - 17',
        city: 'Bogota, D.C.',
        detail: 'Su puerta',
        favorite: true
      }
    ];
  }

  private getProfileMap(): Record<string, any> {
    return JSON.parse(localStorage.getItem('account_profiles') || '{}') as Record<string, any>;
  }
}
