import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'priceFormat',
  standalone: true
})
export class PriceFormatPipe implements PipeTransform {
  transform(value: number | string | null | undefined): string {
    const numeric = Number(value ?? 0);
    if (!Number.isFinite(numeric)) {
      return '0';
    }

    return new Intl.NumberFormat('es-CO', {
      maximumFractionDigits: 0
    }).format(Math.round(numeric));
  }
}
