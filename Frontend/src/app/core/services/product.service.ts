import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { Product } from '../../shared/interfaces/product';
import { AuthService } from './auth.service';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private apiBase = `${environment.apiUrl}/products`;
  private productsSubject = new BehaviorSubject<Product[]>([]);
  products$ = this.productsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(true);
  productsLoading$ = this.loadingSubject.asObservable();

  constructor(
    private http: HttpClient,
    private authService: AuthService
  ) {
    this.loadProducts();
  }

  async loadProducts() {
    try {
      const result = await firstValueFrom(
        this.http.get<{ success: boolean; products?: Product[] }>(this.apiBase)
      );
      this.productsSubject.next(result.products || []);
    } catch {
      this.productsSubject.next([]);
    } finally {
      this.loadingSubject.next(false);
    }
  }

  async getProductById(id: string) {
    try {
      const result = await firstValueFrom(
        this.http.get<{ success: boolean; product?: Product }>(`${this.apiBase}/${id}`)
      );
      return result.product || null;
    } catch {
      return null;
    }
  }

  async addCustomProduct(input: {
    name: string;
    description: string;
    price: number;
    imageUrl?: string;
    sellerEmail: string;
    brand?: string;
    availableUnits?: number;
    colorsAvailable?: string[];
    technicalSpecs?: { section: string; label: string; value: string }[];
    termsAndConditions?: string;
  }) {
    try {
      const result = await firstValueFrom(
        this.http.post<{ success: boolean; message?: string }>(this.apiBase, input, {
          headers: this.authHeaders()
        })
      );

      if (!result.success) {
        return { success: false, message: result.message || 'No se pudo guardar producto' };
      }

      await this.loadProducts();
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.error?.message || 'No se pudo guardar producto' };
    }
  }

  async deleteCustomProduct(productId: string, _requesterEmail: string, _isAdmin: boolean) {
    try {
      const result = await firstValueFrom(
        this.http.delete<{ success: boolean; message?: string }>(`${this.apiBase}/${productId}`, {
          headers: this.authHeaders()
        })
      );

      if (!result.success) {
        return { success: false, message: result.message || 'No se pudo borrar producto' };
      }

      await this.loadProducts();
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.error?.message || 'No se pudo borrar producto' };
    }
  }

  async updateCustomProduct(
    productId: string,
    input: {
      name: string;
      description: string;
      price: number;
      stock: number;
      imageUrl?: string;
    },
    _requesterEmail: string,
    _isAdmin: boolean
  ) {
    try {
      const result = await firstValueFrom(
        this.http.put<{ success: boolean; message?: string }>(`${this.apiBase}/${productId}`, input, {
          headers: this.authHeaders()
        })
      );

      if (!result.success) {
        return { success: false, message: result.message || 'No se pudo editar producto' };
      }

      await this.loadProducts();
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.error?.message || 'No se pudo editar producto' };
    }
  }

  getCustomProducts() {
    return [] as Product[];
  }

  getCurrentProducts() {
    return this.productsSubject.value;
  }

  private authHeaders() {
    const token = this.authService.getCurrentUser()?.token;
    if (!token) {
      return new HttpHeaders({ 'Content-Type': 'application/json' });
    }

    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    });
  }
}
