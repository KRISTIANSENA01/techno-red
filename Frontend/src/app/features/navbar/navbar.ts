import { Component, DoCheck, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule, Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service'; 
import { CartService } from '../../core/services/cart.service';
import { LoadingScreen } from '../../shared/components/loading-screen/loading-screen';
import { PriceFormatPipe } from '../../shared/pipes/price-format.pipe';

@Component({
  selector: 'app-navbar',
  standalone: true,
  imports: [CommonModule, RouterModule, LoadingScreen, PriceFormatPipe],
  templateUrl: './navbar.html',
  styleUrl: './navbar.scss'
})
export class Navbar implements OnInit, DoCheck, OnDestroy {
  private lastUserId: string | null = null;
  private inactivityTimeout: ReturnType<typeof setTimeout> | null = null;
  private readonly inactivityMs = 10 * 60 * 1000;
  private readonly trackedEvents = ['click', 'mousemove', 'keydown', 'scroll', 'touchstart'];
  private readonly activityHandler = () => this.resetInactivityTimer();
  private readonly navLoadingDurationMs = 1000;
  private readonly navLoadingMaxMs = 1000;
  private readonly panelLoadingDurationMs = 1500;
  private readonly panelLoadingMaxMs = 2000;
  miniCartOpen = false;
  navLoading = false;
  private miniCartCloseTimer: ReturnType<typeof setTimeout> | null = null;

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
    if (this.miniCartCloseTimer) {
      clearTimeout(this.miniCartCloseTimer);
      this.miniCartCloseTimer = null;
    }
  }

  async logout(): Promise<void> {
    await this.withNavLoading(async () => {
      await this.authService.logout();
      this.cartService.setActiveUser(null);
      this.stopInactivityTracking();
      await this.router.navigate(['/login']);
    });
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

  openMiniCart() {
    if (this.miniCartCloseTimer) {
      clearTimeout(this.miniCartCloseTimer);
      this.miniCartCloseTimer = null;
    }
    this.miniCartOpen = true;
  }

  scheduleMiniCartClose() {
    if (this.miniCartCloseTimer) {
      clearTimeout(this.miniCartCloseTimer);
    }
    this.miniCartCloseTimer = setTimeout(() => {
      this.miniCartOpen = false;
    }, 120);
  }

  async navigateHome(event?: Event) {
    event?.preventDefault();
    await this.navigateWithLoading('/');
  }

  async navigatePanel(event?: Event) {
    event?.preventDefault();
    await this.navigateWithLoading('/panel', this.panelLoadingDurationMs, this.panelLoadingMaxMs);
  }

  async navigateAccount(event?: Event) {
    event?.preventDefault();
    const target = this.authService.isLoggedIn() ? '/account' : '/login';
    await this.navigateWithLoading(target);
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

  private async navigateWithLoading(path: string, minDurationMs?: number, maxDurationMs?: number) {
    if (this.router.url === path) {
      return;
    }
    await this.withNavLoading(async () => {
      await this.router.navigate([path]);
    }, minDurationMs, maxDurationMs);
  }

  private async withNavLoading(action: () => Promise<void>, minDurationMs?: number, maxDurationMs?: number) {
    if (this.navLoading) {
      return;
    }

    const minMs = minDurationMs ?? this.navLoadingDurationMs;
    const maxMs = Math.max(minMs, maxDurationMs ?? this.navLoadingMaxMs);
    const startedAt = Date.now();
    this.navLoading = true;
    try {
      await Promise.race([
        action(),
        new Promise<void>((resolve) => setTimeout(resolve, maxMs))
      ]);
    } finally {
      const elapsed = Date.now() - startedAt;
      const remaining = minMs - elapsed;
      if (remaining > 0) {
        await new Promise<void>((resolve) => setTimeout(resolve, remaining));
      }
      this.navLoading = false;
    }
  }
}
