import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { ProductService } from '../../core/services/product.service';
import { AsyncPipe, NgIf, NgForOf } from '@angular/common';
import { CartService } from '../../core/services/cart.service';
import { AuthService } from '../../core/services/auth.service';
import { LoadingScreen } from '../../shared/components/loading-screen/loading-screen';
import { PriceFormatPipe } from '../../shared/pipes/price-format.pipe';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink, NgIf, NgForOf, AsyncPipe, LoadingScreen, PriceFormatPipe],
  templateUrl: './home.html',
  styleUrl: './home.scss'
})
export class Home implements OnInit, OnDestroy {
  addedProductId = '';
  homeMessage = '';
  homeMessageType: 'success' | 'error' = 'error';
  addingToCart = false;
  activeBanner = 0;
  private autoSlideRef: ReturnType<typeof setInterval> | null = null;

  banners = [
    {
      image: 'https://cdn.claro.com.co/imagenes/v9/assets/red/slider/2026/Marzo_2026/Celular-motorola-razr60-D.png',
      alt: 'Promocion Motorola Razr 60'
    },
    {
      image: 'https://cdn.claro.com.co/imagenes/v9/assets/red/slider/2026/Marzo_2026/Pasate_de_prepago_a_postpago_WIN_BP_D.png',
      alt: 'Promocion pasate de prepago a postpago'
    },
    {
      image: 'https://cdn.claro.com.co/imagenes/v9/assets/red/slider/2026/Marzo_2026/Oppo-Champions-D.png',
      alt: 'Promocion Oppo Champions'
    },
    {
      image: 'https://cdn.claro.com.co/imagenes/v9/assets/red/slider/2026/Febrero_2026/Miracle-lanzamiento-D.png',
      alt: 'Lanzamiento Miracle'
    },
    {
      image: 'https://cdn.claro.com.co/imagenes/v9/assets/red/slider/2026/Marzo_2026/Celular-56FIT3-D.gif',
      alt: 'Promocion 56FIT3'
    },
    {
      image: 'https://cdn.claro.com.co/imagenes/v9/assets/red/slider/2026/Marzo_2026/Celular-Magic8lite-D.gif',
      alt: 'Promocion Magic8 Lite'
    },
    {
      image: 'https://cdn.claro.com.co/imagenes/v9/assets/red/slider/2026/Marzo_2026/Fibra-optica-900-megas-claro-D.png',
      alt: 'Fibra optica 900 megas'
    }
  ];

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

  ngOnInit() {
    this.startAutoSlide();
  }

  ngOnDestroy() {
    this.stopAutoSlide();
  }

  get products$() {
    return this.productService.products$;
  }

  get loading$() {
    return this.productService.productsLoading$;
  }

  getProductImage(product: any): string {
    return product.product_images?.[0]?.image_url || 'assets/placeholder.png';
  }

  isOutOfStock(product: any): boolean {
    const raw = product?.available_units ?? product?.stock;
    const stock = Number(raw);
    if (!Number.isFinite(stock)) {
      return false;
    }
    const inCart = this.cartService.getQuantityByProduct(product?.id);
    return stock - inCart <= 0;
  }

  previousSlide() {
    this.activeBanner = (this.activeBanner - 1 + this.banners.length) % this.banners.length;
    this.restartAutoSlide();
  }

  nextSlide() {
    this.activeBanner = (this.activeBanner + 1) % this.banners.length;
    this.restartAutoSlide();
  }

  goToSlide(index: number) {
    this.activeBanner = index;
    this.restartAutoSlide();
  }

  addToCart(product: any) {
    if (!this.authService.isLoggedIn()) {
      this.homeMessageType = 'error';
      this.homeMessage = 'Debes iniciar sesion para agregar al carrito';
      setTimeout(() => (this.homeMessage = ''), 1600);
      return;
    }

    if (this.isOutOfStock(product)) {
      this.homeMessageType = 'error';
      this.homeMessage = 'Este producto no tiene stock disponible';
      setTimeout(() => (this.homeMessage = ''), 2000);
      return;
    }

    this.addingToCart = true;
    try {
      const result = this.cartService.add(product);

      if (!result.success) {
        this.homeMessageType = 'error';
        this.homeMessage = result.message || 'No hay stock disponible';
        setTimeout(() => (this.homeMessage = ''), 2000);
        return;
      }

      this.homeMessageType = 'success';
      this.homeMessage = 'Producto agregado satisfactoriamente';
      setTimeout(() => (this.homeMessage = ''), 1800);
      this.addedProductId = product?.id || '';
      setTimeout(() => {
        this.addedProductId = '';
      }, 1400);
    } finally {
      setTimeout(() => {
        this.addingToCart = false;
      }, 450);
    }
  }

  private startAutoSlide() {
    this.autoSlideRef = setInterval(() => {
      this.activeBanner = (this.activeBanner + 1) % this.banners.length;
    }, 4500);
  }

  private stopAutoSlide() {
    if (!this.autoSlideRef) {
      return;
    }
    clearInterval(this.autoSlideRef);
    this.autoSlideRef = null;
  }

  private restartAutoSlide() {
    this.stopAutoSlide();
    this.startAutoSlide();
  }
}
