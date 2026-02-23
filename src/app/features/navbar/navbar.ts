import { Component, DoCheck, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service'; 
import { CartService } from '../../core/services/cart.service';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar implements OnInit, DoCheck, OnDestroy {
  private lastUserId: string | null = null;
  private inactivityTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly inactivityMs = 10 * 60 * 1000;
  private readonly trackedEvents = ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'];
  private readonly activityHandler = () => this.resetInactivityTimer();

  constructor(
    public authService: AuthService,
    public cartService: CartService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.authService.refreshCurrentUserFromProfile();
    const id = this.authService.getCurrentUser()?.id ?? null;
    this.lastUserId = id;
    this.cartService.setActiveUser(id);
    this.startInactivityTracking();
  }

  ngDoCheck() {
    const currentId = this.authService.getCurrentUser()?.id ?? null;
    if (currentId !== this.lastUserId) {
      this.lastUserId = currentId;
      this.cartService.setActiveUser(currentId);
      this.resetInactivityTimer();
    }
  }

  ngOnDestroy() {
    this.stopInactivityTracking();
  }

  async logout(): Promise<void> {
    await this.authService.logout();
    this.cartService.setActiveUser(null);
    this.stopInactivityTracking();
    this.router.navigate(['/login']);
  }

  get cartCount() {
    return this.cartService.getItemsCount();
  }

  get cartSubtotal() {
    return this.cartService.getSubtotal();
  }

  removeFromMiniCart(productId?: string) {
    if (!productId) {
      return;
    }
    this.cartService.remove(productId);
  }

  get roleLabel() {
    const role = this.authService.getCurrentUserRole();
    if (!role || role === 'user') {
      return '';
    }
    if (role === 'support') {
      return 'Rol: vendedor';
    }
    return `Rol: ${role}`;
  }

  get showLogoutIcon() {
    return this.authService.isLoggedIn() && this.authService.getCurrentUserRole() !== 'user';
  }

  private startInactivityTracking() {
    for (const eventName of this.trackedEvents) {
      window.addEventListener(eventName, this.activityHandler);
    }
    this.resetInactivityTimer();
  }

  private stopInactivityTracking() {
    for (const eventName of this.trackedEvents) {
      window.removeEventListener(eventName, this.activityHandler);
    }
    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
      this.inactivityTimeout = null;
    }
  }

  private resetInactivityTimer() {
    if (!this.shouldAutoLogoutByInactivity()) {
      if (this.inactivityTimeout) {
        clearTimeout(this.inactivityTimeout);
        this.inactivityTimeout = null;
      }
      return;
    }

    if (this.inactivityTimeout) {
      clearTimeout(this.inactivityTimeout);
    }

    this.inactivityTimeout = setTimeout(() => {
      void this.logoutByInactivity();
    }, this.inactivityMs);
  }

  private shouldAutoLogoutByInactivity() {
    const role = this.authService.getCurrentUserRole();
    return role === 'admin' || role === 'support';
  }

  private async logoutByInactivity() {
    if (!this.shouldAutoLogoutByInactivity()) {
      return;
    }
    await this.logout();
    alert('Sesion cerrada por inactividad de 10 minutos.');
  }
}
