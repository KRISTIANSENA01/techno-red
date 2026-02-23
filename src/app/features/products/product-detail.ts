import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { ProductService } from '../../core/services/product.service';
import { Product } from '../../shared/interfaces/product';
import { CartService } from '../../core/services/cart.service';
import { AuthService } from '../../core/services/auth.service';

@Component({
  selector: 'app-product-detail',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './product-detail.html',
  styleUrl: './product-detail.scss'
})
export class ProductDetail implements OnInit {
  product: Product | null = null;
  loading = true;
  showSpecs = true;
  showTerms = false;
  addedMessage = '';

  constructor(
    private route: ActivatedRoute,
    private productService: ProductService,
    private cartService: CartService,
    private authService: AuthService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    this.route.paramMap.subscribe((params) => {
      const id = params.get('id');

      if (!id) {
        this.loading = false;
        this.cdr.detectChanges();
        return;
      }

      this.loading = true;
      this.productService.getProductById(id)
        .then((prod) => {
          this.product = prod;
          this.loading = false;
          this.cdr.detectChanges();
        })
        .catch((err) => {
          console.error(err);
          this.loading = false;
          this.cdr.detectChanges();
        });
    });
  }

  get groupedSpecs() {
    const specs = this.product?.technical_specs || [];
    const grouped = new Map<string, { label: string; value: string }[]>();

    for (const spec of specs) {
      const section = spec.section || 'General';
      if (!grouped.has(section)) {
        grouped.set(section, []);
      }
      grouped.get(section)?.push({ label: spec.label, value: spec.value });
    }

    return Array.from(grouped.entries()).map(([section, values]) => ({ section, values }));
  }

  get hasSpecs() {
    return (this.product?.technical_specs?.length || 0) > 0;
  }

  get colors() {
    return this.product?.colors_available || [];
  }

  addToCart() {
    if (!this.product) {
      return;
    }

    if (!this.authService.isLoggedIn()) {
      this.addedMessage = 'Debes iniciar sesion para agregar al carrito';
      setTimeout(() => {
        this.addedMessage = '';
        this.cdr.detectChanges();
      }, 1500);
      return;
    }

    this.cartService.add(this.product);
    this.addedMessage = 'Producto agregado al carrito';
    setTimeout(() => {
      this.addedMessage = '';
      this.cdr.detectChanges();
    }, 1500);
  }
}
