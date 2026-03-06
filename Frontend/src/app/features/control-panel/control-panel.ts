import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { NavigationEnd, Router } from '@angular/router';
import { AuthService, PublicUser, UserRole } from '../../core/services/auth.service';
import { ProductService } from '../../core/services/product.service';
import { Product, ProductTechnicalSpec } from '../../shared/interfaces/product';
import { LoadingScreen } from '../../shared/components/loading-screen/loading-screen';
import { PriceFormatPipe } from '../../shared/pipes/price-format.pipe';
import { Subscription, filter } from 'rxjs';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule, LoadingScreen, PriceFormatPipe],
  templateUrl: './control-panel.html',
  styleUrl: './control-panel.scss'
})
export class ControlPanel implements OnInit, OnDestroy {
  private readonly adminSellerModeKey = 'panel_admin_seller_mode';
  private readonly showProductManagerKey = 'panel_show_product_manager';
  private routerSub: Subscription | null = null;
  private usersRetryTimers: ReturnType<typeof setTimeout>[] = [];
  private credentialsCountdownTimer: ReturnType<typeof setInterval> | null = null;

  users: PublicUser[] = [];
  sellerProducts: Product[] = [];
  showProductManager = false;
  adminSellerMode = false;
  editingProductId = '';
  adminPasswordConfirm = '';
  adminPasswordInput = '';
  adminPasswordError = '';
  showAdminPasswordModal = false;
  adminPasswordUnlocked = false;
  private adminPasswordResolver: ((ok: boolean) => void) | null = null;
  targetUserId = '';
  targetUserName = '';
  targetUserPassword = '';

  name = '';
  description = '';
  price: number | null = null;
  imageUrl = '';
  brand = '';
  availableUnits: number | null = null;
  colorsInput = '';
  termsAndConditions = '';
  specSection = '';
  specLabel = '';
  specValue = '';
  technicalSpecs: ProductTechnicalSpec[] = [];
  editName = '';
  editDescription = '';
  editPrice: number | null = null;
  editStock: number | null = null;
  editImageUrl = '';

  message = '';
  error = '';
  creatingProduct = false;
  updatingUserCredentials = false;
  loadingAdminUsers = false;
  productSavedTag = false;
  userCredentialsSavedTag = false;
  credentialsSaveCountdown = 3;

  constructor(
    public authService: AuthService,
    private productService: ProductService,
    private router: Router
  ) {}

  async ngOnInit() {
    await this.authService.refreshCurrentUserFromProfile();

    if (this.authService.isLoggedIn() && !this.authService.canAccessPanel()) {
      this.router.navigate(['/cart']);
      return;
    }

    this.loadPanelState();
    await this.productService.loadProducts();
    if (this.canManageUsers) {
      await this.refreshUsers();
      this.scheduleUsersAutoRetry();
    }
    this.refreshSellerProducts();

    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const nav = event as NavigationEnd;
        if ((nav.urlAfterRedirects || nav.url).startsWith('/panel')) {
          if (this.canManageUsers) {
            void this.refreshUsers();
            this.scheduleUsersAutoRetry();
          }
        }
      });
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
    this.routerSub = null;
    for (const timer of this.usersRetryTimers) {
      clearTimeout(timer);
    }
    this.usersRetryTimers = [];
    if (this.credentialsCountdownTimer) {
      clearInterval(this.credentialsCountdownTimer);
      this.credentialsCountdownTimer = null;
    }
  }

  get canManageUsers() {
    return this.authService.isAdmin();
  }

  get canManageProducts() {
    return this.authService.getCurrentUserRole() === 'support' || this.adminSellerMode;
  }

  get canOpenProductManager() {
    return this.authService.getCurrentUserRole() === 'support' || this.authService.isAdmin();
  }

  async addProduct() {
    this.message = '';
    this.error = '';

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.error = 'Debes iniciar sesión';
      return;
    }

    if (!this.name || !this.description || this.price === null || this.price <= 0) {
      this.error = 'Completa nombre, descripción y precio válido';
      return;
    }

    this.creatingProduct = true;
    let result: { success: boolean; message?: string };
    const timeoutMs = 10000;
    try {
      result = await Promise.race([
        this.productService.addCustomProduct({
          name: this.name,
          description: this.description,
          price: Number(this.price),
          imageUrl: this.imageUrl,
          sellerEmail: currentUser.email,
          brand: this.brand,
          availableUnits: this.availableUnits ?? undefined,
          colorsAvailable: this.parseColors(this.colorsInput),
          technicalSpecs: this.technicalSpecs,
          termsAndConditions: this.termsAndConditions
        }),
        new Promise<{ success: false; message: string }>((resolve) =>
          setTimeout(() => resolve({
            success: false,
            message: 'La operacion tardo mas de 10 segundos. Intenta de nuevo.'
          }), timeoutMs)
        )
      ]);
    } finally {
      this.creatingProduct = false;
    }

    if (!result.success) {
      this.error = result.message ?? 'No se pudo agregar el producto';
      return;
    }

    this.message = 'Producto agregado';
    this.productSavedTag = true;
    setTimeout(() => {
      this.productSavedTag = false;
    }, 3200);
    this.name = '';
    this.description = '';
    this.price = null;
    this.imageUrl = '';
    this.brand = '';
    this.availableUnits = null;
    this.colorsInput = '';
    this.termsAndConditions = '';
    this.specSection = '';
    this.specLabel = '';
    this.specValue = '';
    this.technicalSpecs = [];
    this.refreshSellerProducts();
  }

  async deleteProduct(productId?: string) {
    if (!productId) {
      return;
    }

    this.message = '';
    this.error = '';

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.error = 'Debes iniciar sesión';
      return;
    }

    const result = await this.productService.deleteCustomProduct(
      productId,
      currentUser.email,
      this.authService.isAdmin()
    );

    if (result.success) {
      this.message = 'Producto eliminado';
      this.refreshSellerProducts();
      return;
    }

    this.error = result.message ?? 'No se pudo eliminar el producto';
  }

  async updateRole(userId: string, role: UserRole) {
    this.message = '';
    this.error = '';

    if (!(await this.ensureAdminPassword())) {
      this.error = 'Debes confirmar tu clave admin para continuar';
      return;
    }

    const result = await this.authService.setUserRole(userId, role, this.adminPasswordConfirm);
    if (!result.success) {
      this.error = result.message ?? 'No se pudo actualizar el rol';
      return;
    }

    this.message = 'Rol actualizado';
    await this.refreshUsers();
  }

  openProductManager() {
    this.showProductManager = true;
    this.persistPanelState();
    this.refreshSellerProducts();
  }

  closeProductManager() {
    this.showProductManager = false;
    this.persistPanelState();
  }

  toggleProductManager() {
    this.showProductManager = !this.showProductManager;
    this.persistPanelState();
    if (this.showProductManager) {
      this.refreshSellerProducts();
    }
  }

  toggleAdminSellerMode() {
    this.adminSellerMode = !this.adminSellerMode;
    if (this.adminSellerMode) {
      this.showProductManager = true;
    } else if (this.authService.getCurrentUserRole() !== 'support') {
      this.showProductManager = false;
    }
    this.persistPanelState();
    this.refreshSellerProducts();
  }

  startEdit(product: Product) {
    this.editingProductId = product.id || '';
    this.editName = product.name || '';
    this.editDescription = product.description || '';
    this.editPrice = Number(product.price || 0);
    this.editStock = Number(product.available_units ?? product.stock ?? 0);
    this.editImageUrl = product.product_images?.[0]?.image_url || '';
  }

  cancelEdit() {
    this.editingProductId = '';
    this.editName = '';
    this.editDescription = '';
    this.editPrice = null;
    this.editStock = null;
    this.editImageUrl = '';
  }

  async saveEdit(productId?: string) {
    if (!productId) {
      return;
    }

    const currentUser = this.authService.getCurrentUser();
    if (!currentUser) {
      this.error = 'Debes iniciar sesion';
      return;
    }

    if (!this.editName || !this.editDescription || this.editPrice === null || this.editPrice <= 0) {
      this.error = 'Completa nombre, descripcion y precio valido';
      return;
    }

    const result = await this.productService.updateCustomProduct(
      productId,
      {
        name: this.editName,
        description: this.editDescription,
        price: Number(this.editPrice),
        stock: this.editStock ?? 0,
        imageUrl: this.editImageUrl
      },
      currentUser.email,
      this.authService.isAdmin()
    );

    if (!result.success) {
      this.error = result.message ?? 'No se pudo editar el producto';
      return;
    }

    this.message = 'Producto actualizado';
    this.error = '';
    this.cancelEdit();
    this.refreshSellerProducts();
  }

  async toggleBlocked(userId: string, blocked: boolean) {
    this.message = '';
    this.error = '';

    if (!(await this.ensureAdminPassword())) {
      this.error = 'Debes confirmar tu clave admin para continuar';
      return;
    }

    const result = await this.authService.setUserBlocked(userId, blocked, this.adminPasswordConfirm);
    if (!result.success) {
      this.error = result.message ?? 'No se pudo actualizar el estado';
      return;
    }

    this.message = blocked ? 'Cuenta bloqueada' : 'Cuenta desbloqueada';
    await this.refreshUsers();
  }

  async refreshUsers() {
    if (!this.canManageUsers) {
      this.users = [];
      return;
    }

    this.loadingAdminUsers = true;
    try {
      const startedAt = Date.now();
      const maxWaitMs = 5000;
      const retryEveryMs = 600;
      let loadedUsers: PublicUser[] = [];

      while (Date.now() - startedAt < maxWaitMs) {
        loadedUsers = await this.authService.getUsers();
        if (loadedUsers.length > 0) {
          break;
        }
        await this.delay(retryEveryMs);
      }

      if (loadedUsers.length > 0) {
        this.users = loadedUsers;
        return;
      }

      const current = this.authService.getCurrentUser();
      if (current) {
        this.users = [{
          id: current.id,
          name: current.name,
          email: current.email,
          role: current.role,
          isActive: current.isActive
        }];
        return;
      }

      this.users = [];
      this.error = 'No se pudieron cargar usuarios admin por ahora. Intenta recargar.';
    } finally {
      this.loadingAdminUsers = false;
    }
  }

  private delay(ms: number) {
    return new Promise<void>((resolve) => setTimeout(resolve, ms));
  }

  private scheduleUsersAutoRetry() {
    for (const timer of this.usersRetryTimers) {
      clearTimeout(timer);
    }
    this.usersRetryTimers = [];

    const retryDelays = [1200, 3000, 5500];
    for (const delayMs of retryDelays) {
      const timer = setTimeout(() => {
        if (this.canManageUsers && this.users.length === 0) {
          void this.refreshUsers();
        }
      }, delayMs);
      this.usersRetryTimers.push(timer);
    }
  }

  private refreshSellerProducts() {
    const currentUser = this.authService.getCurrentUser();
    const allProducts = this.productService.getCurrentProducts();

    if (!currentUser) {
      this.sellerProducts = [];
      return;
    }

    if (this.authService.isAdmin()) {
      this.sellerProducts = allProducts;
      return;
    }

    this.sellerProducts = allProducts.filter(
      (p) => p.seller_email === currentUser.email || !p.seller_email
    );
  }

  addTechnicalSpec() {
    if (!this.specSection || !this.specLabel || !this.specValue) {
      this.error = 'Completa sección, campo y valor para la ficha técnica';
      return;
    }

    this.error = '';
    this.technicalSpecs = [
      ...this.technicalSpecs,
      {
        section: this.specSection.trim(),
        label: this.specLabel.trim(),
        value: this.specValue.trim()
      }
    ];
    this.specLabel = '';
    this.specValue = '';
  }

  removeTechnicalSpec(index: number) {
    this.technicalSpecs = this.technicalSpecs.filter((_, i) => i !== index);
  }

  async updateUserCredentials() {
    this.message = '';
    this.error = '';

    if (!(await this.ensureAdminPassword())) {
      this.error = 'Debes confirmar tu clave admin para continuar';
      return;
    }

    if (!this.targetUserId) {
      this.error = 'Selecciona un usuario';
      return;
    }

    if (!this.targetUserName.trim() && !this.targetUserPassword.trim()) {
      this.error = 'Ingresa nombre o nueva contrasena';
      return;
    }

    this.updatingUserCredentials = true;
    this.userCredentialsSavedTag = false;
    this.startCredentialsCountdown(3);
    let result: { success: boolean; message?: string };
    try {
      const savePromise = this.authService.adminUpdateUserCredentials(
        this.targetUserId,
        {
          name: this.targetUserName,
          newPassword: this.targetUserPassword
        },
        this.adminPasswordConfirm
      );
      const saveOrTimeout = Promise.race<{ success: boolean; message?: string }>([
        savePromise,
        this.delay(5000).then(() => ({
          success: false,
          message: 'Tiempo de espera agotado al guardar. Intenta de nuevo.'
        }))
      ]);

      const [saveResult] = await Promise.all([saveOrTimeout, this.delay(3000)]);
      result = saveResult;
    } finally {
      if (this.credentialsCountdownTimer) {
        clearInterval(this.credentialsCountdownTimer);
        this.credentialsCountdownTimer = null;
      }
      this.updatingUserCredentials = false;
    }

    if (!result.success) {
      this.error = result.message ?? 'No se pudo actualizar el usuario';
      return;
    }

    this.message = 'Datos del usuario actualizados';
    this.userCredentialsSavedTag = true;
    setTimeout(() => {
      this.userCredentialsSavedTag = false;
    }, 3200);
    this.targetUserName = '';
    this.targetUserPassword = '';
    await this.refreshUsers();
  }

  private startCredentialsCountdown(seconds: number) {
    this.credentialsSaveCountdown = seconds;
    if (this.credentialsCountdownTimer) {
      clearInterval(this.credentialsCountdownTimer);
    }

    this.credentialsCountdownTimer = setInterval(() => {
      this.credentialsSaveCountdown = Math.max(0, this.credentialsSaveCountdown - 1);
    }, 1000);
  }

  openAdminPasswordModal() {
    this.adminPasswordInput = this.adminPasswordConfirm || '';
    this.adminPasswordError = '';
    this.showAdminPasswordModal = true;
  }

  acceptAdminPasswordModal() {
    if (!this.authService.confirmAdminPassword(this.adminPasswordInput)) {
      this.adminPasswordError = 'Contrasena de admin incorrecta';
      return;
    }

    this.adminPasswordConfirm = this.adminPasswordInput;
    this.adminPasswordUnlocked = true;
    this.showAdminPasswordModal = false;

    if (this.adminPasswordResolver) {
      this.adminPasswordResolver(true);
      this.adminPasswordResolver = null;
    }
  }

  cancelAdminPasswordModal() {
    this.showAdminPasswordModal = false;
    this.adminPasswordError = '';

    if (this.adminPasswordResolver) {
      this.adminPasswordResolver(false);
      this.adminPasswordResolver = null;
    }
  }

  get adminKeyButtonLabel() {
    return 'Cambio de claves';
  }

  closeAdminKeyOptions() {
    this.adminPasswordUnlocked = false;
    this.adminPasswordInput = '';
    this.adminPasswordError = '';
    this.targetUserId = '';
    this.targetUserName = '';
    this.targetUserPassword = '';
  }

  private parseColors(raw: string) {
    return raw
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }

  private loadPanelState() {
    if (!this.authService.isAdmin()) {
      this.adminSellerMode = false;
      this.showProductManager = this.authService.getCurrentUserRole() === 'support';
      return;
    }

    this.adminSellerMode = localStorage.getItem(this.adminSellerModeKey) === '1';
    this.showProductManager = localStorage.getItem(this.showProductManagerKey) === '1';
  }

  private persistPanelState() {
    if (!this.authService.isAdmin()) {
      return;
    }

    localStorage.setItem(this.adminSellerModeKey, this.adminSellerMode ? '1' : '0');
    localStorage.setItem(this.showProductManagerKey, this.showProductManager ? '1' : '0');
  }

  private async ensureAdminPassword() {
    if (!this.authService.isAdmin()) {
      return true;
    }

    if (this.adminPasswordUnlocked && this.authService.confirmAdminPassword(this.adminPasswordConfirm)) {
      return true;
    }

    this.openAdminPasswordModal();
    return await new Promise<boolean>((resolve) => {
      this.adminPasswordResolver = resolve;
    });
  }
}
