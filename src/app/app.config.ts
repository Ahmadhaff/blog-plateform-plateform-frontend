import { ApplicationConfig, inject } from '@angular/core';
import { provideHttpClient, withInterceptors, HttpInterceptorFn } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { provideStoreDevtools } from '@ngrx/store-devtools';

import { routes } from './app.routes';
import { reducers } from './state/app.reducers';
import { ArticleEffects } from './state/article/article.effects';
import { environment } from '../environments/environment';
import { AuthService } from './services/auth.service';
import { Router } from '@angular/router';
import { throwError, catchError, switchMap } from 'rxjs';

// Functional interceptor for Angular standalone apps
const authInterceptorFn: HttpInterceptorFn = (req, next) => {
  const authService = inject(AuthService);
  const router = inject(Router);
  
  // Get token fresh each time
  const token = authService.getToken();
  
    const skipAuth = req.url.includes('/auth/login') || 
                   req.url.includes('/auth/register') || 
                   req.url.includes('/auth/refresh') ||
                   req.url.includes('/auth/otp') ||
                   req.url.includes('/auth/send-otp') ||
                   req.url.includes('/auth/verify-otp') ||
                   req.url.includes('/auth/reset-password') ||
                   req.url.includes('/auth/forgot-password') ||
                   // Public API endpoints that don't require authentication
                   // Exclude /articles/my/* from public endpoints (requires auth)
                   (req.method === 'GET' && req.url.includes('/api/articles') && !req.url.includes('/articles/my')) ||
                   (req.method === 'GET' && req.url.includes('/api/comments/article/')) ||
                   (req.method === 'GET' && req.url.includes('/api/users/') && req.url.includes('/avatar'));

  // Skip auth for public endpoints
  if (skipAuth) {
    return next(req);
  }

  // Add token to request if available
  if (token && token.trim().length > 0) {
    // Check if access token is expired
    if (authService.isTokenExpired(token)) {
      // For now, just add the expired token and let the backend handle it
      // The interceptor will catch 401 and try to refresh
    }

    // Add token to request
    const clonedRequest = req.clone({
      setHeaders: {
        Authorization: `Bearer ${token}`
      }
    });
    
    // Verify the header was actually added
    if (!clonedRequest.headers.has('Authorization')) {
      console.error(`❌ CRITICAL: Authorization header missing after clone for ${req.url}`);
    }
    
    // Continue with the request
    return next(clonedRequest).pipe(
      catchError((error: any) => {
        // If 401 Unauthorized, try to refresh token
        if (error.status === 401 && token) {
          const refreshToken = authService.getRefreshToken();
          if (!refreshToken || authService.isTokenExpired(refreshToken)) {
            console.error('❌ No valid refresh token available');
            authService.clearLocalStorage();
            router.navigate(['/login']);
            return throwError(() => error);
          }
          
          // Try to refresh
          return authService.refreshToken().pipe(
            switchMap((response: any) => {
              if (response.accessToken) {
                // Retry with new token
                const retryRequest = req.clone({
                  setHeaders: {
                    Authorization: `Bearer ${response.accessToken}`
                  }
                });
                return next(retryRequest);
              }
              return throwError(() => error);
            }),
            catchError((refreshError) => {
              console.error('❌ Token refresh failed');
              authService.clearLocalStorage();
              router.navigate(['/login']);
              return throwError(() => refreshError);
            })
          );
        }
        
        return throwError(() => error);
      })
    );
          } else {
            // No token available - check if this is a public endpoint
            // Public endpoints should be allowed without token
            if (skipAuth) {
              // This is a public endpoint, proceed without token
              return next(req);
            }
            
            // Protected endpoint without token - return error
            console.warn(`⚠️ No token available for protected endpoint: ${req.url}`);
            console.error(`❌ Cannot send request to protected endpoint without token: ${req.url}`);
            return throwError(() => new Error('Authentication token missing'));
          }
};

export const appConfig: ApplicationConfig = {
  providers: [
    provideRouter(routes),
    provideHttpClient(
      withInterceptors([authInterceptorFn])
    ),
    provideStore(reducers),
    provideEffects([ArticleEffects]),
    provideStoreDevtools({ maxAge: 25, logOnly: environment.production })
  ]
};
