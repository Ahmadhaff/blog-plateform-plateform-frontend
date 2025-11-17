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
        this.loading.set(false);
        // Clear pending credentials after successful login
        sessionStorage.removeItem('pendingLoginEmail');
        sessionStorage.removeItem('pendingLoginPassword');
        
        // Redirect immediately - don't wait for profile fetch
        // The profile can be fetched on the home page if needed
        this.router.navigate(['/']).then(() => {
          // Force a page reload to update auth state across all components
          window.location.reload();
        });
      },
      error: (error) => {
        this.loading.set(false);
        // Display error message from server or default message
        const errorMessage = error.error?.error || error.error?.message || 'Login failed. Please check your credentials.';
        this.error.set(errorMessage);
        console.error('❌ Login error:', error);
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

