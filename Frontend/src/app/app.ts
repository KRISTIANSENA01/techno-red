import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Navbar } from './features/navbar/navbar';
import { Router, NavigationEnd } from '@angular/router';
import { filter, Subscription } from 'rxjs';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterOutlet, Navbar],
  templateUrl: './app.html'
})
export class App implements OnInit, OnDestroy {
  showNavbar = true;
  private routerSub?: Subscription;

  constructor(private router: Router) {}

  ngOnInit() {
    this.updateNavbarVisibility(this.router.url);
    this.routerSub = this.router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe((event) => {
        const nav = event as NavigationEnd;
        this.updateNavbarVisibility(nav.urlAfterRedirects || nav.url);
      });
  }

  ngOnDestroy() {
    this.routerSub?.unsubscribe();
  }

  private updateNavbarVisibility(url: string) {
    const cleanUrl = (url || '').split('?')[0].toLowerCase();
    const hiddenRoutes = ['/login', '/register', '/forgot-password'];
    this.showNavbar = !hiddenRoutes.some((route) => cleanUrl.startsWith(route));
  }
}
