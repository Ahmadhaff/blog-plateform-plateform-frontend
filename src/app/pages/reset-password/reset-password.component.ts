import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './reset-password.component.html',
  styleUrl: './reset-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ResetPasswordComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly resetPasswordForm: FormGroup;
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly email = signal<string>('');
  readonly showPassword = signal<boolean>(false);
  readonly showConfirmPassword = signal<boolean>(false);
  readonly resetToken = signal<string | null>(null);

  constructor() {
    this.resetPasswordForm = this.fb.group({
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
  }

  ngOnInit(): void {
    // Get email and token from query params or sessionStorage
    this.route.queryParams.subscribe(params => {
      const email = params['email'];
      if (email) {
        this.email.set(email);
      }
    });

    // Get token from sessionStorage
    const token = sessionStorage.getItem('resetPasswordToken');
    this.resetToken.set(token);
    if (!token) {
      // No token found, redirect to forgot password
      this.error.set('Invalid or expired reset link. Please request a new one.');
      setTimeout(() => {
        this.router.navigate(['/forgot-password']);
      }, 3000);
    }
  }

  private passwordMatchValidator(group: FormGroup): { [key: string]: any } | null {
    const password = group.get('password')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    if (!password || !confirmPassword) {
      return null; // Don't validate if fields are empty
    }
    return password === confirmPassword ? null : { passwordMismatch: true };
  }

  onSubmit(): void {
    const token = this.resetToken();
    if (this.resetPasswordForm.invalid || !token) {
      this.markFormGroupTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const { password, confirmPassword } = this.resetPasswordForm.value;

    this.authService.resetPassword(password, confirmPassword, token).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.success.set(response.message || 'Password reset successfully! Redirecting to login...');
        
        // Clear token from sessionStorage
        sessionStorage.removeItem('resetPasswordToken');
        
        // Redirect to login after a short delay
        setTimeout(() => {
          this.router.navigate(['/login'], {
            queryParams: { passwordReset: 'true' }
          });
        }, 2000);
      },
      error: (error) => {
        this.loading.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Failed to reset password. Please try again.';
        this.error.set(errorMessage);
        
        // If token is invalid/expired, redirect to forgot password
        if (error.status === 401 || error.status === 403) {
          sessionStorage.removeItem('resetPasswordToken');
          setTimeout(() => {
            this.router.navigate(['/forgot-password']);
          }, 3000);
        }
      }
    });
  }

  togglePasswordVisibility(): void {
    this.showPassword.set(!this.showPassword());
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.set(!this.showConfirmPassword());
  }

  private markFormGroupTouched(): void {
    Object.keys(this.resetPasswordForm.controls).forEach(key => {
      const control = this.resetPasswordForm.get(key);
      control?.markAsTouched();
    });
  }

  get passwordControl() {
    return this.resetPasswordForm.get('password');
  }

  get confirmPasswordControl() {
    return this.resetPasswordForm.get('confirmPassword');
  }

  get passwordMismatchError(): boolean {
    return this.resetPasswordForm.errors?.['passwordMismatch'] === true && 
           !!this.confirmPasswordControl?.touched && 
           !!this.passwordControl?.touched &&
           !!this.confirmPasswordControl?.value &&
           !!this.passwordControl?.value;
  }
}

