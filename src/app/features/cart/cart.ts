import { Component, inject } from '@angular/core';
import { CommonModule, AsyncPipe } from '@angular/common';
import { RouterLink } from '@angular/router';
import { CartService } from '../../core/services/cart.service';

@Component({
  standalone: true,
  selector: 'app-cart',
  imports: [CommonModule, AsyncPipe, RouterLink],
  templateUrl: './cart.html',
  styleUrl: './cart.scss'
})
export class Cart {
  cartService = inject(CartService);
  items$ = this.cartService.items$;

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
    this.cartService.increment(productId);
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
