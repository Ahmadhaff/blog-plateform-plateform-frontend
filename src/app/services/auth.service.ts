import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpHeaders } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import { tap } from 'rxjs/operators';

import { environment } from '../../environments/environment';
import { 
  LoginRequest, 
  LoginResponse, 
  RegisterRequest, 
  RegisterResponse,
  ResetPasswordRequest,
  ResetPasswordResponse
} from '../models/auth.model';

@Injectable({
  providedIn: 'root'
})
export class AuthService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/auth`;

  login(email: string, password: string): Observable<LoginResponse> {
    const body: LoginRequest = { email, password };
    return this.http.post<LoginResponse>(`${this.baseUrl}/login`, body).pipe(
      tap(response => {
        if (response.accessToken) {
          localStorage.setItem('token', response.accessToken);
          localStorage.setItem('refreshToken', response.refreshToken);
          localStorage.setItem('user', JSON.stringify(response.user));
        }
      })
    );
  }

  register(username: string, email: string, password: string, role: 'Rédacteur' | 'Lecteur'): Observable<RegisterResponse> {
    const body: RegisterRequest = { username, email, password, role };
    return this.http.post<RegisterResponse>(`${this.baseUrl}/register`, body).pipe(
      tap(response => {
        if (response.accessToken) {
          localStorage.setItem('token', response.accessToken);
          localStorage.setItem('refreshToken', response.refreshToken);
          localStorage.setItem('user', JSON.stringify(response.user));
        }
      })
    );
  }

  resetPassword(password: string, confirmPassword: string, token: string): Observable<ResetPasswordResponse> {
    const body: ResetPasswordRequest = { password, confirmPassword };
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${token}`
    });
    return this.http.post<ResetPasswordResponse>(`${this.baseUrl}/reset-password`, body, { headers });
  }

  logout(): Observable<any> {
    const token = this.getToken();
    
    if (token) {
      const headers = new HttpHeaders({
        'Authorization': `Bearer ${token}`
      });
      return this.http.post<any>(`${this.baseUrl}/logout`, {}, { headers });
    }
    
    return of({});
  }

  clearLocalStorage(): void {
    localStorage.removeItem('token');
    localStorage.removeItem('refreshToken');
    localStorage.removeItem('user');
    localStorage.removeItem('viewedArticles');
  }

  isAuthenticated(): boolean {
    return !!localStorage.getItem('token');
  }

  getCurrentUser(): any {
    const userStr = localStorage.getItem('user');
    return userStr ? JSON.parse(userStr) : null;
  }

  updateUserData(user: any): void {
    if (user) {
      localStorage.setItem('user', JSON.stringify(user));
    }
  }

  getToken(): string | null {
    return localStorage.getItem('token');
  }

  getUserProfile(): Observable<any> {
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.getToken()}`
    });
    return this.http.get<any>(`${environment.apiUrl}/users/me`, { headers }).pipe(
      tap(response => {
        if (response.user) {
          localStorage.setItem('user', JSON.stringify(response.user));
        }
      })
    );
  }

  changePassword(oldPassword: string, newPassword: string, confirmPassword: string): Observable<{ message: string }> {
    const body = { oldPassword, newPassword, confirmPassword };
    const headers = new HttpHeaders({
      'Authorization': `Bearer ${this.getToken()}`
    });
    return this.http.post<{ message: string }>(`${this.baseUrl}/change-password`, body, { headers });
  }

  refreshToken(): Observable<{ user: any; accessToken: string; refreshToken: string }> {
    const refreshToken = localStorage.getItem('refreshToken');
    if (!refreshToken) {
      throw new Error('No refresh token available');
    }
    
    return this.http.post<{ user: any; accessToken: string; refreshToken: string }>(
      `${this.baseUrl}/refresh`,
      { token: refreshToken }
    ).pipe(
      tap(response => {
        if (response.accessToken && response.refreshToken) {
          localStorage.setItem('token', response.accessToken);
          localStorage.setItem('refreshToken', response.refreshToken);
          if (response.user) {
            localStorage.setItem('user', JSON.stringify(response.user));
          }
        } else {
          this.clearLocalStorage();
          throw new Error('Invalid refresh response');
        }
      })
    );
  }

  getRefreshToken(): string | null {
    return localStorage.getItem('refreshToken');
  }

  isTokenExpired(token: string | null): boolean {
    if (!token) {
      return true;
    }
    try {
      const payload = JSON.parse(atob(token.split('.')[1]));
      const exp = payload.exp * 1000; // Convert to milliseconds
      const now = Date.now();
      return exp < now;
    } catch (error) {
      return true;
    }
  }
}

