import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './forgot-password.component.html',
  styleUrl: './forgot-password.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ForgotPasswordComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly emailForm: FormGroup;
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);

  constructor() {
    this.emailForm = this.fb.group({
      email: ['', [Validators.required, Validators.email]]
    });
  }

  onSubmit(): void {
    if (this.emailForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const email = this.emailForm.value.email;

    // Send OTP immediately
    this.authService.sendOtp(email, 'password_reset').subscribe({
      next: (response) => {
        this.loading.set(false);
        // OTP sent successfully, redirect to verify OTP page
        // The verify page will show the OTP input form directly
        this.router.navigate(['/verify-otp'], {
          queryParams: { 
            email: email,
            type: 'password_reset',
            sent: 'true' // Flag to indicate OTP was already sent
          }
        });
      },
      error: (error) => {
        this.loading.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Failed to send verification code. Please try again.';
        this.error.set(errorMessage);
      }
    });
  }

  private markFormGroupTouched(): void {
    Object.keys(this.emailForm.controls).forEach(key => {
      const control = this.emailForm.get(key);
      control?.markAsTouched();
    });
  }

  get emailControl() {
    return this.emailForm.get('email');
  }
}

