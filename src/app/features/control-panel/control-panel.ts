import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService, PublicUser, UserRole } from '../../core/services/auth.service';
import { ProductService } from '../../core/services/product.service';
import { Product, ProductTechnicalSpec } from '../../shared/interfaces/product';

@Component({
  selector: 'app-control-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './control-panel.html',
  styleUrl: './control-panel.scss'
})
export class ControlPanel implements OnInit {
  users: PublicUser[] = [];
  sellerProducts: Product[] = [];
  showProductManager = false;
  adminSellerMode = false;
  editingProductId = '';

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

  constructor(
    public authService: AuthService,
    private productService: ProductService,
    private router: Router
  ) {}

  async ngOnInit() {
    if (this.authService.isLoggedIn() && !this.authService.canAccessPanel()) {
      this.router.navigate(['/cart']);
      return;
    }

    await this.productService.loadProducts();
    await this.refreshUsers();
    this.refreshSellerProducts();
  }

  get canManageUsers() {
    return this.authService.isAdmin();
  }

  get canManageProducts() {
    return this.authService.getCurrentUserRole() === 'support' || this.adminSellerMode;
  }

  get canOpenProductManager() {
    return this.authService.isSeller();
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

    const result = await this.productService.addCustomProduct({
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
    });

    if (!result.success) {
      this.error = result.message ?? 'No se pudo agregar el producto';
      return;
    }

    this.message = 'Producto agregado';
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

    const result = await this.authService.setUserRole(userId, role);
    if (!result.success) {
      this.error = result.message ?? 'No se pudo actualizar el rol';
      return;
    }

    this.message = 'Rol actualizado';
    await this.refreshUsers();
  }

  openProductManager() {
    this.showProductManager = true;
    this.refreshSellerProducts();
  }

  toggleAdminSellerMode() {
    this.adminSellerMode = !this.adminSellerMode;
    if (this.adminSellerMode) {
      this.showProductManager = true;
    }
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

    const result = await this.authService.setUserBlocked(userId, blocked);
    if (!result.success) {
      this.error = result.message ?? 'No se pudo actualizar el estado';
      return;
    }

    this.message = blocked ? 'Cuenta bloqueada' : 'Cuenta desbloqueada';
    await this.refreshUsers();
  }

  private async refreshUsers() {
    this.users = await this.authService.getUsers();
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

  private parseColors(raw: string) {
    return raw
      .split(',')
      .map((c) => c.trim())
      .filter((c) => c.length > 0);
  }
}
