import { Routes } from '@angular/router';

export const routes: Routes = [

  {
    path: '',
    loadComponent: () =>
      import('./features/home/home').then(m => m.Home) 
  },

  {
    path: 'home',
    pathMatch: 'full',
    redirectTo: ''
  },

  {
    path: 'product/:id',
    loadComponent: () =>
      import('./features/products/product-detail')
        .then(m => m.ProductDetail)
  },

  { 
    path: 'cart',
    loadComponent: () =>
      import('./features/cart/cart').then(m => m.Cart)
  },

  {
    path: 'login',
    loadComponent: () =>
      import('./features/auth/login/login')
        .then(m => m.Login)
  },

  {
    path: 'register',
    loadComponent: () =>
      import('./features/auth/register/register')
        .then(m => m.Register)
  },

  {
    path: 'forgot-password',
    loadComponent: () =>
      import('./features/auth/forgot-password/forgot-password')
        .then(m => m.ForgotPassword)
  },

  {
    path: 'panel',
    loadComponent: () =>
      import('./features/control-panel/control-panel')
        .then(m => m.ControlPanel)
  },

  {
    path: 'account',
    loadComponent: () =>
      import('./features/account/account')
        .then(m => m.Account)
  },

  
  { path: '**', redirectTo: '' }

];
