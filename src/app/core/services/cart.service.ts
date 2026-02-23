import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { Product } from '../../shared/interfaces/product';

export interface CartItem {
  product: Product;
  quantity: number;
}

type CartBucket = {
  updatedAt: number;
  items: CartItem[];
};

type CartStore = Record<string, CartBucket>;

@Injectable({ providedIn: 'root' })
export class CartService {
  private readonly cartKey = 'cart_items_by_user_v2';
  private readonly oneDayMs = 24 * 60 * 60 * 1000;

  private activeUserId: string | null = null;
  private itemsSubject = new BehaviorSubject<CartItem[]>([]);
  items$ = this.itemsSubject.asObservable();

  constructor() {
    this.setActiveUser(this.readCurrentUserIdFromStorage());
  }

  setActiveUser(userId: string | null) {
    this.activeUserId = userId;
    this.cleanupExpiredCarts();

    if (!this.activeUserId) {
      this.itemsSubject.next([]);
      return;
    }

    const store = this.readStore();
    const bucket = store[this.activeUserId];
    this.itemsSubject.next(bucket?.items ?? []);
  }

  add(product: Product) {
    const current = [...this.itemsSubject.value];
    const index = current.findIndex((item) => item.product.id === product.id);

    if (index >= 0) {
      current[index] = { ...current[index], quantity: current[index].quantity + 1 };
    } else {
      current.push({ product, quantity: 1 });
    }

    this.updateCart(current);
  }

  remove(productId: string) {
    const current = this.itemsSubject.value.filter((item) => item.product.id !== productId);
    this.updateCart(current);
  }

  increment(productId: string) {
    const current = this.itemsSubject.value.map((item) =>
      item.product.id === productId ? { ...item, quantity: item.quantity + 1 } : item
    );
    this.updateCart(current);
  }

  decrement(productId: string) {
    const current = this.itemsSubject.value.map((item) =>
      item.product.id === productId ? { ...item, quantity: Math.max(1, item.quantity - 1) } : item
    );
    this.updateCart(current);
  }

  clear() {
    this.updateCart([]);
  }

  getItemsCount() {
    return this.itemsSubject.value.reduce((sum, item) => sum + item.quantity, 0);
  }

  getSubtotal() {
    return this.itemsSubject.value.reduce((sum, item) => sum + (item.product.price || 0) * item.quantity, 0);
  }

  private updateCart(items: CartItem[]) {
    this.itemsSubject.next(items);

    if (!this.activeUserId) {
      return;
    }

    const store = this.readStore();
    store[this.activeUserId] = {
      updatedAt: Date.now(),
      items
    };
    this.writeStore(store);
  }

  private cleanupExpiredCarts() {
    const now = Date.now();
    const store = this.readStore();
    const cleaned: CartStore = {};

    for (const [key, bucket] of Object.entries(store)) {
      if (now - bucket.updatedAt < this.oneDayMs) {
        cleaned[key] = bucket;
      }
    }

    this.writeStore(cleaned);
  }

  private readStore(): CartStore {
    const raw = localStorage.getItem(this.cartKey);
    if (!raw) {
      return {};
    }

    try {
      const parsed = JSON.parse(raw) as CartStore;
      const normalized: CartStore = {};

      for (const [key, bucket] of Object.entries(parsed)) {
        normalized[key] = {
          updatedAt: bucket?.updatedAt || 0,
          items: (bucket?.items || []).filter((item) => item?.product?.id && item.quantity > 0)
        };
      }

      return normalized;
    } catch {
      return {};
    }
  }

  private writeStore(store: CartStore) {
    localStorage.setItem(this.cartKey, JSON.stringify(store));
  }

  private readCurrentUserIdFromStorage() {
    const raw = localStorage.getItem('currentUser');
    if (!raw) {
      return null;
    }

    try {
      const parsed = JSON.parse(raw) as { id?: string };
      return parsed?.id ?? null;
    } catch {
      return null;
    }
  }
}
