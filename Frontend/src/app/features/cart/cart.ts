import { Component, inject } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartService } from '../../core/services/cart.service';
import { LoadingScreen } from '../../shared/components/loading-screen/loading-screen';
import { PriceFormatPipe } from '../../shared/pipes/price-format.pipe';

@Component({
  standalone: true,
  selector: 'app-cart',
  imports: [CommonModule, AsyncPipe, RouterLink, LoadingScreen, PriceFormatPipe],
  templateUrl: './cart.html',
  styleUrl: './cart.scss'
})
export class Cart {
  cartService = inject(CartService);
  items$ = this.cartService.items$;
  alertMessage = '';
  loading = true;

  constructor() {
    setTimeout(() => {
      this.loading = false;
    }, 550);
  }

  remove(productId?: string) {
    if (!productId) {
      return;
    }
    this.cartService.remove(productId);
  }

  increment(productId?: string) {
    if (!productId) {
      return;
    }
    const result = this.cartService.increment(productId);
    if (!result.success) {
      this.alertMessage = result.message || 'No hay stock disponible';
      setTimeout(() => (this.alertMessage = ''), 1800);
    }
  }

  decrement(productId?: string) {
    if (!productId) {
      return;
    }
    this.cartService.decrement(productId);
  }

  getSubtotal() {
    return this.cartService.getSubtotal();
  }
}
