import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { createClient } from '@supabase/supabase-js';
import { Product } from '../../shared/interfaces/product';

@Injectable({ providedIn: 'root' })
export class ProductService {
  private supabase = createClient(
    'https://uzamffsbckljxoytcbtz.supabase.co',
    'sb_publishable_LI5I9H6eULDyYJ0N8PHA-Q_56oY51uC'
  );

  private readonly customProductsKey = 'customProducts';
  private readonly productMetaKey = 'productMeta';

  private productsSubject = new BehaviorSubject<Product[]>([]);
  products$ = this.productsSubject.asObservable();

  private loadingSubject = new BehaviorSubject<boolean>(true);
  productsLoading$ = this.loadingSubject.asObservable();

  constructor() {
    this.loadProducts();
  }

  async loadProducts() {
    const { data, error } = await this.supabase
      .from('products')
      .select('*, product_images(*)')
      .order('created_at', { ascending: false });

    if (error) {
      console.error('Error cargando productos:', error);
      this.productsSubject.next([]);
    } else {
      this.productsSubject.next((data as Product[]).map((p) => this.mergeProductMeta(p)));
    }

    this.loadingSubject.next(false);
  }

  async getProductById(id: string) {
    const { data, error } = await this.supabase
      .from('products')
      .select('*, product_images(*)')
      .eq('id', id)
      .single();

    if (error) {
      const custom = this.getCustomProducts().find((p) => p.id === id) ?? null;
      if (!custom) {
        console.error('Error al obtener producto:', error);
      }
      return custom;
    }

    return this.mergeProductMeta(data as Product);
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
    const { data: inserted, error } = await this.supabase
      .from('products')
      .insert({
        name: input.name,
        description: input.description,
        price: input.price,
        stock: input.availableUnits ?? 0,
        is_active: true
      })
      .select('id, name, description, price, stock, created_at')
      .single();

    if (error || !inserted) {
      return { success: false, message: `No se pudo guardar en base de datos: ${error?.message ?? ''}` };
    }

    if (input.imageUrl) {
      await this.supabase
        .from('product_images')
        .insert({
          product_id: inserted.id,
          image_url: input.imageUrl,
          is_primary: true
        });
    }

    this.saveProductMeta(inserted.id, {
      brand: input.brand || 'Techno Red',
      available_units: input.availableUnits,
      colors_available: input.colorsAvailable || [],
      technical_specs: input.technicalSpecs || [],
      terms_and_conditions: input.termsAndConditions || '',
      seller_email: input.sellerEmail
    });

    await this.loadProducts();
    return { success: true };
  }

  async deleteCustomProduct(productId: string, requesterEmail: string, isAdmin: boolean) {
    const meta = this.getProductMeta(productId);
    if (meta?.seller_email && !isAdmin && meta.seller_email !== requesterEmail) {
      return { success: false, message: 'No tienes permisos para borrar este producto' };
    }

    const { error } = await this.supabase
      .from('products')
      .delete()
      .eq('id', productId);

    if (error) {
      return { success: false, message: `No se pudo borrar en base de datos: ${error.message}` };
    }

    this.deleteProductMeta(productId);
    await this.loadProducts();
    return { success: true };
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
    requesterEmail: string,
    isAdmin: boolean
  ) {
    const meta = this.getProductMeta(productId);
    if (meta?.seller_email && !isAdmin && meta.seller_email !== requesterEmail) {
      return { success: false, message: 'No tienes permisos para editar este producto' };
    }

    const { error } = await this.supabase
      .from('products')
      .update({
        name: input.name,
        description: input.description,
        price: input.price,
        stock: input.stock
      })
      .eq('id', productId);

    if (error) {
      return { success: false, message: `No se pudo editar en base de datos: ${error.message}` };
    }

    if (input.imageUrl && input.imageUrl.trim()) {
      const { data: existingImage } = await this.supabase
        .from('product_images')
        .select('id')
        .eq('product_id', productId)
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle();

      if (existingImage?.id) {
        await this.supabase
          .from('product_images')
          .update({ image_url: input.imageUrl.trim() })
          .eq('id', existingImage.id);
      } else {
        await this.supabase
          .from('product_images')
          .insert({
            product_id: productId,
            image_url: input.imageUrl.trim(),
            is_primary: true
          });
      }
    }

    this.saveProductMeta(productId, {
      available_units: input.stock,
      seller_email: meta?.seller_email || requesterEmail
    });

    await this.loadProducts();
    return { success: true };
  }

  getCustomProducts() {
    return JSON.parse(localStorage.getItem(this.customProductsKey) || '[]') as Product[];
  }

  getCurrentProducts() {
    return this.productsSubject.value;
  }

  private getAllProductMeta(): Record<string, Partial<Product>> {
    return JSON.parse(localStorage.getItem(this.productMetaKey) || '{}') as Record<string, Partial<Product>>;
  }

  private getProductMeta(productId: string): Partial<Product> | null {
    const meta = this.getAllProductMeta();
    return meta[productId] ?? null;
  }

  private saveProductMeta(productId: string, patch: Partial<Product>) {
    const meta = this.getAllProductMeta();
    meta[productId] = { ...(meta[productId] || {}), ...patch };
    localStorage.setItem(this.productMetaKey, JSON.stringify(meta));
  }

  private deleteProductMeta(productId: string) {
    const meta = this.getAllProductMeta();
    delete meta[productId];
    localStorage.setItem(this.productMetaKey, JSON.stringify(meta));
  }

  private mergeProductMeta(product: Product): Product {
    const meta = this.getProductMeta(product.id || '');
    if (!meta) {
      return product;
    }

    return { ...product, ...meta };
  }
}
