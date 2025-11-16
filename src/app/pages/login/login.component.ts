import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './login.component.html',
  styleUrl: './login.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly loginForm: FormGroup;
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  
  // Background particles for visual effect
  readonly particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 3
  }));

  constructor() {
    // Check for pending login credentials from registration/verification flow
    const pendingEmail = sessionStorage.getItem('pendingLoginEmail');
    const pendingPassword = sessionStorage.getItem('pendingLoginPassword');
    
    this.loginForm = this.fb.group({
      email: [pendingEmail || '', [Validators.required, Validators.email]],
      password: [pendingPassword || '', [Validators.required, Validators.minLength(8)]]
    });

    // Keep credentials in sessionStorage until successful login
    // They will be cleared after successful login
  }

  ngOnInit(): void {
    // If user is already authenticated, redirect to home page
    if (this.authService.isAuthenticated()) {
      this.router.navigate(['/']);
      return;
    }
  }

  ngOnDestroy(): void {
    // Don't clear credentials here - let user use them if they navigate back
  }

  onSubmit(): void {
    if (this.loginForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const { email, password } = this.loginForm.value;

    this.authService.login(email, password).subscribe({
      next: (response) => {
        // After successful login, fetch full user profile to get avatar URL
        this.authService.getUserProfile().subscribe({
          next: () => {
            this.loading.set(false);
            // Clear pending credentials after successful login
            sessionStorage.removeItem('pendingLoginEmail');
            sessionStorage.removeItem('pendingLoginPassword');
            
            // Don't show success message - redirect immediately
            // The home page will show the authenticated state
            this.router.navigate(['/']).then(() => {
              // Force a page reload to update auth state across all components
              window.location.reload();
            });
          },
          error: (profileError) => {
            // Even if profile fetch fails, proceed with login
            console.error('Failed to fetch user profile:', profileError);
            this.loading.set(false);
            sessionStorage.removeItem('pendingLoginEmail');
            sessionStorage.removeItem('pendingLoginPassword');
            this.router.navigate(['/']).then(() => {
              window.location.reload();
            });
          }
        });
      },
      error: (error) => {
        this.loading.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Login failed. Please check your credentials.';
        
        // Check if email is not verified
        if (errorMessage.toLowerCase().includes('email not verified') || 
            (error.status === 403 && errorMessage.toLowerCase().includes('email'))) {
          // Show error message briefly, then redirect to OTP verification page
          this.error.set('Please verify your email address before logging in. Redirecting to verification page...');
          setTimeout(() => {
            this.router.navigate(['/verify-otp'], {
              queryParams: { email: email }
            });
          }, 2000);
        } else {
          // Display other errors normally
          this.error.set(errorMessage);
        }
      }
    });
  }

  private markFormGroupTouched(): void {
    Object.keys(this.loginForm.controls).forEach(key => {
      const control = this.loginForm.get(key);
      control?.markAsTouched();
    });
  }

  get emailControl() {
    return this.loginForm.get('email');
  }

  get passwordControl() {
    return this.loginForm.get('password');
  }
}

