export interface ProductTechnicalSpec {
  section: string;
  label: string;
  value: string;
}

export interface Product {
  id?: string;
  name?: string;
  description?: string;
  price?: number;
  stock?: number;
  product_images?: { image_url?: string }[];
  is_custom?: boolean;
  seller_email?: string;
  brand?: string;
  available_units?: number;
  colors_available?: string[];
  technical_specs?: ProductTechnicalSpec[];
  terms_and_conditions?: string;
}
