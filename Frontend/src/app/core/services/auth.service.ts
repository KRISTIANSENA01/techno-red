import { Injectable } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { firstValueFrom } from 'rxjs';
import { environment } from '../../../environments/environment';

export type UserRole = 'admin' | 'support' | 'user';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
  token?: string;
}

export type PublicUser = Omit<AuthUser, 'password' | 'token'>;

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private usersKey = 'users';
  private currentUserKey = 'currentUser';
  private apiBase = `${environment.apiUrl}/auth`;
  private usersApiBase = `${environment.apiUrl}/users`;

  constructor(private http: HttpClient) {}

  async register(user: { name: string; email: string; password: string }) {
    try {
      const result = await firstValueFrom(
        this.http.post<{ success: boolean; message?: string }>(`${this.apiBase}/register`, user)
      );

      if (!result.success) {
        return { success: false, message: result.message || 'No se pudo registrar' };
      }

      this.upsertLocalUser({
        id: `local-${Date.now()}`,
        name: user.name,
        email: user.email,
        password: user.password,
        role: 'user',
        isActive: true
      });

      return { success: true, message: result.message || 'Usuario registrado correctamente' };
    } catch (error: any) {
      return { success: false, message: error?.error?.message || 'Error en registro' };
    }
  }

  async login(email: string, password: string) {
    try {
      const result = await firstValueFrom(
        this.http.post<{
          success: boolean;
          message?: string;
          token?: string;
          user?: Omit<AuthUser, 'password' | 'token'>;
        }>(`${this.apiBase}/login`, { email, password })
      );

      if (!result.success || !result.user || !result.token) {
        return { success: false, message: result.message || 'Credenciales incorrectas' };
      }

      const current: AuthUser = {
        ...result.user,
        password,
        token: result.token
      };

      this.upsertLocalUser(current);
      localStorage.setItem(this.currentUserKey, JSON.stringify(current));
      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.error?.message || 'No se pudo iniciar sesion' };
    }
  }

  async logout() {
    try {
      await firstValueFrom(
        this.http.post<{ success: boolean }>(`${this.apiBase}/logout`, {}, { headers: this.authHeaders() })
      );
    } catch {
      // no-op
    }

    localStorage.removeItem(this.currentUserKey);
  }

  async changePassword(newPassword: string) {
    try {
      const result = await firstValueFrom(
        this.http.post<{ success: boolean; message?: string }>(
          `${this.apiBase}/change-password`,
          { newPassword },
          { headers: this.authHeaders() }
        )
      );

      if (!result.success) {
        return { success: false, message: result.message || 'No se pudo cambiar la contrasena' };
      }

      const current = this.getCurrentUser();
      if (current) {
        const updated: AuthUser = { ...current, password: newPassword };
        localStorage.setItem(this.currentUserKey, JSON.stringify(updated));
        this.upsertLocalUser(updated);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.error?.message || 'No se pudo cambiar la contrasena' };
    }
  }

  isLoggedIn(): boolean {
    return this.getCurrentUser() !== null;
  }

  forgotPassword(email: string) {
    const users = this.getUsersWithPasswordLocal();
    const user = users.find((u) => u.email === email);

    if (user?.password) {
      return { success: true, message: 'Tu contrasena es: ' + user.password };
    }

    return { success: false, message: 'Email no encontrado' };
  }

  getCurrentUser(): AuthUser | null {
    const raw = localStorage.getItem(this.currentUserKey);
    if (!raw) {
      return null;
    }

    try {
      return this.normalizeUser(JSON.parse(raw));
    } catch {
      return null;
    }
  }

  getCurrentUserRole(): UserRole | null {
    return this.getCurrentUser()?.role ?? null;
  }

  isAdmin(): boolean {
    return this.getCurrentUserRole() === 'admin';
  }

  isSeller(): boolean {
    const role = this.getCurrentUserRole();
    return role === 'support' || role === 'admin';
  }

  canAccessPanel(): boolean {
    const role = this.getCurrentUserRole();
    return role === 'admin' || role === 'support';
  }

  async getUsers(): Promise<PublicUser[]> {
    try {
      const result = await firstValueFrom(
        this.http.get<{ success: boolean; users?: PublicUser[]; message?: string }>(this.usersApiBase, {
          headers: this.authHeaders()
        })
      );

      if (!result.success || !result.users) {
        return this.getUsersWithPasswordLocal().map(({ password, token, ...safe }) => safe);
      }

      for (const user of result.users) {
        const local = this.getUsersWithPasswordLocal().find((u) => u.id === user.id);
        this.upsertLocalUser({
          ...user,
          password: local?.password || '',
          token: local?.token
        });
      }

      return result.users;
    } catch {
      return this.getUsersWithPasswordLocal().map(({ password, token, ...safe }) => safe);
    }
  }

  async setUserRole(userId: string, role: UserRole, adminPassword?: string) {
    if (!this.validateAdminPassword(adminPassword)) {
      return { success: false, message: 'Debes confirmar tu contrasena de admin' };
    }

    try {
      const result = await firstValueFrom(
        this.http.patch<{ success: boolean; message?: string }>(
          `${this.usersApiBase}/${userId}/role`,
          { role, adminPassword },
          { headers: this.authHeaders() }
        )
      );

      if (!result.success) {
        return { success: false, message: result.message || 'No se pudo actualizar rol' };
      }

      const users = this.getUsersWithPasswordLocal();
      const index = users.findIndex((u) => u.id === userId);
      if (index >= 0) {
        users[index].role = role;
        this.saveUsersLocal(users);
        this.syncCurrentUser(users[index]);
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.error?.message || 'No se pudo actualizar rol' };
    }
  }

  async setUserBlocked(userId: string, blocked: boolean, adminPassword?: string) {
    if (!this.validateAdminPassword(adminPassword)) {
      return { success: false, message: 'Debes confirmar tu contrasena de admin' };
    }

    try {
      const result = await firstValueFrom(
        this.http.patch<{ success: boolean; message?: string }>(
          `${this.usersApiBase}/${userId}/blocked`,
          { blocked, adminPassword },
          { headers: this.authHeaders() }
        )
      );

      if (!result.success) {
        return { success: false, message: result.message || 'No se pudo actualizar estado' };
      }

      const users = this.getUsersWithPasswordLocal();
      const index = users.findIndex((u) => u.id === userId);
      if (index >= 0) {
        users[index].isActive = !blocked;
        this.saveUsersLocal(users);
        this.syncCurrentUser(users[index]);
      }

      const current = this.getCurrentUser();
      if (current && current.id === userId && blocked) {
        await this.logout();
      }

      return { success: true };
    } catch (error: any) {
      return { success: false, message: error?.error?.message || 'No se pudo actualizar estado' };
    }
  }

  async adminUpdateUserCredentials(
    userId: string,
    payload: { name?: string; newPassword?: string },
    adminPassword?: string
  ) {
    if (!this.validateAdminPassword(adminPassword)) {
      return { success: false, message: 'Debes confirmar tu contrasena de admin' };
    }

    const users = this.getUsersWithPasswordLocal();
    const index = users.findIndex((u) => u.id === userId);
    if (index < 0) {
      return { success: false, message: 'Usuario no encontrado' };
    }

    if (payload.name && payload.name.trim()) {
      users[index].name = payload.name.trim();
    }

    if (payload.newPassword && payload.newPassword.trim()) {
      users[index].password = payload.newPassword.trim();
    }

    this.saveUsersLocal(users);
    this.syncCurrentUser(users[index]);
    return { success: true };
  }

  async refreshCurrentUserFromProfile() {
    const current = this.getCurrentUser();
    if (!current?.token) {
      return;
    }

    try {
      const result = await firstValueFrom(
        this.http.get<{ success: boolean; user?: PublicUser }>(`${this.apiBase}/me`, {
          headers: this.authHeaders()
        })
      );

      if (!result.success || !result.user) {
        return;
      }

      const updated: AuthUser = {
        ...current,
        ...result.user
      };

      this.upsertLocalUser(updated);
      localStorage.setItem(this.currentUserKey, JSON.stringify(updated));
    } catch {
      // no-op
    }
  }

  private authHeaders() {
    const token = this.getCurrentUser()?.token;
    if (!token) {
      return new HttpHeaders({ 'Content-Type': 'application/json' });
    }

    return new HttpHeaders({
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`
    });
  }

  private getUsersWithPasswordLocal(): AuthUser[] {
    const users = JSON.parse(localStorage.getItem(this.usersKey) || '[]') as any[];
    const normalized = users.map((u) => this.normalizeUser(u));
    this.saveUsersLocal(normalized);
    return normalized;
  }

  private saveUsersLocal(users: AuthUser[]) {
    localStorage.setItem(this.usersKey, JSON.stringify(users));
  }

  private upsertLocalUser(user: AuthUser) {
    const users = this.getUsersWithPasswordLocal();
    const index = users.findIndex((u) => u.id === user.id || u.email === user.email);

    if (index >= 0) {
      users[index] = user;
    } else {
      users.push(user);
    }

    this.saveUsersLocal(users);
  }

  private normalizeUser(user: any): AuthUser {
    return {
      id: user?.id ?? '',
      name: user?.name ?? '',
      email: user?.email ?? '',
      password: user?.password ?? '',
      role: this.normalizeRole(user?.role),
      isActive: user?.isActive !== false,
      token: user?.token
    };
  }

  private normalizeRole(role: any): UserRole {
    const normalized = String(role ?? '').trim().toLowerCase();
    if (normalized === 'admin') return 'admin';
    if (normalized === 'support' || normalized === 'seller' || normalized === 'ventas') return 'support';
    return 'user';
  }

  private syncCurrentUser(updatedUser: AuthUser) {
    const current = this.getCurrentUser();
    if (current && current.id === updatedUser.id) {
      localStorage.setItem(this.currentUserKey, JSON.stringify({ ...updatedUser, token: current.token }));
    }
  }

  private validateAdminPassword(adminPassword?: string) {
    const current = this.getCurrentUser();
    if (!current || current.role !== 'admin') {
      return true;
    }

    return !!adminPassword && adminPassword === current.password;
  }

  confirmAdminPassword(adminPassword?: string) {
    return this.validateAdminPassword(adminPassword);
  }
}
