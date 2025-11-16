import { Injectable, inject } from '@angular/core';
import {
  HttpInterceptor,
  HttpRequest,
  HttpHandler,
  HttpErrorResponse,
  HttpEvent
} from '@angular/common/http';
import { Observable, throwError, BehaviorSubject } from 'rxjs';
import { catchError, switchMap, filter, take } from 'rxjs/operators';
import { Router } from '@angular/router';

import { AuthService } from '../services/auth.service';

@Injectable()
export class AuthInterceptor implements HttpInterceptor {
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private isRefreshing = false;
  private refreshTokenSubject: BehaviorSubject<any> = new BehaviorSubject<any>(null);

  intercept(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    // Get token fresh each time (might change during request)
    const token = this.authService.getToken();
    
    const skipAuth = request.url.includes('/auth/login') || 
                     request.url.includes('/auth/register') || 
                     request.url.includes('/auth/refresh') ||
                     request.url.includes('/auth/otp') ||
                     request.url.includes('/auth/send-otp') ||
                     request.url.includes('/auth/verify-otp') ||
                     request.url.includes('/auth/reset-password') ||
                     request.url.includes('/auth/forgot-password');

    // Skip auth for public endpoints
    if (skipAuth) {
      return next.handle(request);
    }

    // Add token to request if available
    if (token && token.trim().length > 0) {
      // Check if access token is expired
      if (this.authService.isTokenExpired(token)) {
        // Try to refresh the token BEFORE sending the request
        return this.handleTokenRefresh(request, next);
      }

      // Token exists and is not expired - add it to request
      request = this.addTokenToRequest(request, token);
      
      // Verify the header was actually added
      if (!request.headers.has('Authorization')) {
        console.error(`❌ CRITICAL: Authorization header missing after addTokenToRequest for ${request.url}`);
        return throwError(() => new Error('Failed to add Authorization header'));
      }
    } else {
      // No token available for protected endpoint
      console.warn(`⚠️ No token available for protected endpoint: ${request.url}`);
      console.warn(`Token value: ${token}, type: ${typeof token}, length: ${token?.length}`);
      
      // For protected endpoints, return error immediately if no token
      // Don't send request to backend
      if (!skipAuth) {
        console.error(`❌ Cannot send request to protected endpoint without token: ${request.url}`);
        return throwError(() => new Error('Authentication token missing'));
      }
    }

    return next.handle(request).pipe(
      catchError((error: HttpErrorResponse) => {
        // Get current token again (might have changed during request)
        const currentToken = this.authService.getToken();
        
        // If 401 Unauthorized, try to refresh token if we have a token
      if (error.status === 401 && currentToken && !skipAuth) {
          // Only try to refresh if we have a token (might be expired)
          return this.handleTokenRefresh(request, next);
        }

        // If 401 and no token, the user needs to log in
        if (error.status === 401 && !currentToken) {
          console.error(`❌ 401 Unauthorized: No authentication token available for ${request.url}`);
        }

        return throwError(() => error);
      })
    );
  }

  private addTokenToRequest(request: HttpRequest<any>, token: string): HttpRequest<any> {
    if (!token) {
      console.error('❌ Cannot add null/undefined token to request');
      return request;
    }
    
    const clonedRequest = request.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    
    // Verify token was added
    if (!clonedRequest.headers.has('Authorization')) {
      console.error('❌ Failed to add Authorization header to request');
    }
    
    return clonedRequest;
  }

  private handleTokenRefresh(request: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
    if (!this.isRefreshing) {
      this.isRefreshing = true;
      this.refreshTokenSubject.next(null);

      const refreshToken = this.authService.getRefreshToken();
      
      if (!refreshToken) {
        console.error('❌ No refresh token available');
        this.isRefreshing = false;
        // Don't clear session here - let the component handle it
        return throwError(() => new Error('No refresh token available'));
      }

      if (this.authService.isTokenExpired(refreshToken)) {
        console.error('❌ Refresh token expired - Session expired');
        this.isRefreshing = false;
        this.handleSessionExpired();
        return throwError(() => new Error('Refresh token expired'));
      }

      return this.authService.refreshToken().pipe(
        switchMap((response: any) => {
          this.isRefreshing = false;
          // Verify new token exists
          if (!response.accessToken) {
            console.error('❌ Refreshed token is missing from response');
            this.handleSessionExpired();
            return throwError(() => new Error('Refreshed token is missing'));
          }
          
          this.refreshTokenSubject.next(response.accessToken);
          
          // Update user data in localStorage if available
          if (response.user) {
            localStorage.setItem('user', JSON.stringify(response.user));
          }
          
          // Retry the original request with the new token
          const retryRequest = this.addTokenToRequest(request, response.accessToken);
          return next.handle(retryRequest);
        }),
        catchError((error) => {
          this.isRefreshing = false;
          console.error('❌ Failed to refresh token (on request):', error);
          
          // Only clear session if refresh token is actually expired/invalid
          // Don't clear on network errors or other issues
          if (error.status === 401 || error.error?.error?.includes('expired') || error.error?.error?.includes('invalid')) {
            console.error('❌ Refresh token is invalid or expired - Session expired');
            this.handleSessionExpired();
          } else {
            console.warn('⚠️ Token refresh failed, but not clearing session (might be network issue)');
          }
          
          return throwError(() => error);
        })
      );
      } else {
      // Wait for token refresh to complete
      return this.refreshTokenSubject.pipe(
        filter(token => token !== null),
        take(1),
        switchMap((token) => next.handle(this.addTokenToRequest(request, token)))
      );
    }
  }

  private handleSessionExpired(): void {
    // Clear localStorage - redirect will be handled by app.component.ts
    this.authService.clearLocalStorage();
  }
}
