import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../core/services/product.service';
import { AsyncPipe, NgIf, NgForOf } from '@angular/common';
import { CartService } from '../../core/services/cart.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, NgIf, NgForOf, AsyncPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home {
  addedProductId = '';
  homeMessage = '';

  categories = [
    { name: 'Celulares', icon: 'bi-phone' },
    { name: 'Tablets', icon: 'bi-tablet' },
    { name: 'TV', icon: 'bi-tv' },
    { name: 'Gaming', icon: 'bi-controller' },
    { name: 'Audio', icon: 'bi-headphones' }
  ];

  constructor(
    private productService: ProductService,
    private cartService: CartService,
    public authService: AuthService
  ) {}

  get products$() {
    return this.productService.products$;
  }

  get loading$() {
    return this.productService.productsLoading$;
  }

  getProductImage(product: any): string {
    return product.product_images?.[0]?.image_url || 'assets/placeholder.png';
  }

  addToCart(product: any) {
    if (!this.authService.isLoggedIn()) {
      this.homeMessage = 'Debes iniciar sesion para agregar al carrito';
      setTimeout(() => (this.homeMessage = ''), 1600);
      return;
    }

    this.cartService.add(product);
    this.addedProductId = product?.id || '';
    setTimeout(() => {
      this.addedProductId = '';
    }, 1400);
  }
}
