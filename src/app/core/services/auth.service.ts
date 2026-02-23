import { Injectable } from '@angular/core';
import { SupabaseService } from './supabase.service';

export type UserRole = 'admin' | 'support' | 'user';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  password: string;
  role: UserRole;
  isActive: boolean;
}

export type PublicUser = Omit<AuthUser, 'password'>;

type ProfileRow = {
  id: string;
  email?: string | null;
  role?: string | null;
  is_active?: boolean | null;
  first_name?: string | null;
  last_name?: string | null;
};

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private usersKey = 'users';
  private currentUserKey = 'currentUser';

  constructor(private supabase: SupabaseService) {}

  async register(user: { name: string; email: string; password: string }) {
    try {
      const { data, error } = await this.supabase.client.auth.signUp({
        email: user.email,
        password: user.password,
        options: {
          data: { full_name: user.name }
        }
      });

      if (error) {
        return { success: false, message: `Supabase: ${error.message}` };
      }

      if (!data.session) {
        return {
          success: true,
          message: 'Te enviamos un correo de verificacion. Debes confirmarlo para activar tu cuenta.'
        };
      }

      const id = data.user?.id ?? `local-${Date.now()}`;
      const created: AuthUser = {
        id,
        name: user.name,
        email: user.email,
        password: user.password,
        role: 'user',
        isActive: true
      };
      this.upsertLocalUser(created);

      return { success: true, message: 'Usuario registrado correctamente' };
    } catch (error: any) {
      return {
        success: false,
        message: `Supabase no respondio: ${error?.message ?? 'error desconocido'}`
      };
    }
  }

  async login(email: string, password: string) {
    const { data, error } = await this.supabase.client.auth.signInWithPassword({
      email,
      password
    });

    if (error || !data.user) {
      if ((error?.message || '').includes('Invalid login credentials')) {
        const localExists = this.getUsersWithPasswordLocal().some((u) => u.email === email);
        return {
          success: false,
          message: localExists ? 'Contrasena incorrecta' : 'Usuario no registrado'
        };
      }

      const message = (error?.message || '').includes('Email not confirmed')
        ? 'Debes confirmar tu correo antes de iniciar sesion'
        : (error?.message || 'Credenciales incorrectas');
      return { success: false, message };
    }

    const localUsers = this.getUsersWithPasswordLocal();
    const localUser = localUsers.find((u) => u.email === email);

    let role: UserRole = localUser?.role ?? 'user';
    let isActive = localUser?.isActive ?? true;
    let name = localUser?.name ?? email.split('@')[0];

    const { data: profile } = await this.supabase.client
      .from('profiles')
      .select('first_name, last_name, role, is_active')
      .eq('id', data.user.id)
      .maybeSingle();

    if (profile) {
      const row = profile as ProfileRow;
      role = this.normalizeRole(row.role);
      isActive = row.is_active !== false;
      const composed = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
      name = composed || name;
    }

    if (!isActive) {
      await this.supabase.client.auth.signOut();
      return { success: false, message: 'Tu cuenta esta bloqueada' };
    }

    const current: AuthUser = {
      id: data.user.id,
      name,
      email,
      password,
      role,
      isActive
    };

    this.upsertLocalUser(current);
    localStorage.setItem(this.currentUserKey, JSON.stringify(current));
    return { success: true };
  }

  async logout() {
    await this.supabase.client.auth.signOut();
    localStorage.removeItem(this.currentUserKey);
  }

  async changePassword(newPassword: string) {
    const { error } = await this.supabase.client.auth.updateUser({
      password: newPassword
    });

    if (error) {
      return { success: false, message: error.message };
    }

    return { success: true };
  }

  isLoggedIn(): boolean {
    return this.getCurrentUser() !== null;
  }

  forgotPassword(email: string) {
    const users = this.getUsersWithPasswordLocal();
    const user = users.find((u) => u.email === email);

    if (user) {
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
    const localUsers = this.getUsersWithPasswordLocal();
    const localById = new Map(localUsers.map((u) => [u.id, u]));

    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('id, email, first_name, last_name, role, is_active');

    if (error || !data) {
      return localUsers.map(({ password, ...safe }) => safe);
    }

    const merged: PublicUser[] = (data as ProfileRow[]).map((profile) => {
      const local = localById.get(profile.id);
      const composedName = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim();
      return {
        id: profile.id,
        name: composedName || local?.name || 'Usuario',
        email: profile.email ?? local?.email ?? 'sin-email',
        role: this.normalizeRole(profile.role),
        isActive: profile.is_active !== false
      };
    });

    for (const user of merged) {
      const local = localById.get(user.id);
      this.upsertLocalUser({
        id: user.id,
        name: user.name,
        email: local?.email ?? 'sin-email',
        password: local?.password ?? '',
        role: user.role,
        isActive: user.isActive
      });
    }

    return merged;
  }

  async setUserRole(userId: string, role: UserRole) {
    const users = this.getUsersWithPasswordLocal();
    const index = users.findIndex((u) => u.id === userId);

    if (index < 0) {
      return { success: false, message: 'Usuario no encontrado' };
    }

    const { error } = await this.supabase.client
      .from('profiles')
      .update({ role })
      .eq('id', userId);

    if (error) {
      return { success: false, message: 'No se pudo actualizar el rol en Supabase' };
    }

    users[index].role = role;
    this.saveUsersLocal(users);
    this.syncCurrentUser(users[index]);
    return { success: true };
  }

  async setUserBlocked(userId: string, blocked: boolean) {
    const users = this.getUsersWithPasswordLocal();
    const index = users.findIndex((u) => u.id === userId);

    if (index < 0) {
      return { success: false, message: 'Usuario no encontrado' };
    }

    const { error } = await this.supabase.client
      .from('profiles')
      .update({ is_active: !blocked })
      .eq('id', userId);

    if (error) {
      return { success: false, message: 'No se pudo actualizar estado en Supabase' };
    }

    users[index].isActive = !blocked;
    this.saveUsersLocal(users);
    this.syncCurrentUser(users[index]);

    const current = this.getCurrentUser();
    if (current && current.id === userId && blocked) {
      await this.logout();
    }

    return { success: true };
  }

  async refreshCurrentUserFromProfile() {
    const current = this.getCurrentUser();
    if (!current?.id) {
      return;
    }

    const { data, error } = await this.supabase.client
      .from('profiles')
      .select('first_name, last_name, role, is_active')
      .eq('id', current.id)
      .maybeSingle();

    if (error || !data) {
      return;
    }

    const row = data as ProfileRow;
    const composedName = `${row.first_name ?? ''} ${row.last_name ?? ''}`.trim();
    const updated: AuthUser = {
      ...current,
      name: composedName || current.name,
      role: this.normalizeRole(row.role),
      isActive: row.is_active !== false
    };

    this.upsertLocalUser(updated);
    localStorage.setItem(this.currentUserKey, JSON.stringify(updated));
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
      isActive: user?.isActive !== false
    };
  }

  private normalizeRole(role: any): UserRole {
    const normalized = String(role ?? '').trim().toLowerCase();

    if (normalized === 'admin') {
      return 'admin';
    }

    if (normalized === 'support' || normalized === 'seller') {
      return 'support';
    }

    if (normalized === 'user' || normalized === 'customer') {
      return 'user';
    }

    return 'user';
  }

  private syncCurrentUser(updatedUser: AuthUser) {
    const current = this.getCurrentUser();
    if (current && current.id === updatedUser.id) {
      localStorage.setItem(this.currentUserKey, JSON.stringify(updatedUser));
    }
  }
}
