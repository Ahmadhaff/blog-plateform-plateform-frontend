import { ChangeDetectionStrategy, Component, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink, ActivatedRoute } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-verify-otp',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './verify-otp.component.html',
  styleUrl: './verify-otp.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class VerifyOtpComponent implements OnInit, OnDestroy {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);

  readonly otpForm: FormGroup;
  readonly loading = signal<boolean>(false);
  readonly sendingOtp = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly email = signal<string>('');
  readonly resendCooldown = signal<number>(0);
  readonly otpSent = signal<boolean>(false);
  readonly otpType = signal<'email_verification' | 'password_reset'>('email_verification');
  private resendTimer: any = null;

  // Individual OTP input fields
  readonly otpFields = ['code1', 'code2', 'code3', 'code4', 'code5', 'code6'] as const;

  constructor() {
    // Create form with 6 separate fields
    const formControls: { [key: string]: any } = {};
    this.otpFields.forEach(field => {
      formControls[field] = ['', [Validators.required, Validators.pattern(/^\d$/)]];
    });
    this.otpForm = this.fb.group(formControls);
  }

  ngOnInit(): void {
    // Get email, type, and sent flag from query params
    this.route.queryParams.subscribe(params => {
      const email = params['email'];
      const type = params['type'] as 'email_verification' | 'password_reset';
      const sent = params['sent'] === 'true'; // Check if OTP was already sent
      
      if (email) {
        this.email.set(email);
        this.otpType.set(type || 'email_verification');
        
        // If OTP was already sent (from forgot password), show verify form directly
        if (sent) {
          this.otpSent.set(true);
          this.startResendCooldown();
          // Focus on first OTP input after a short delay
          setTimeout(() => {
            this.focusOtpInput(0);
          }, 100);
        }
      } else {
        // If no email, redirect based on type
        if (type === 'password_reset') {
          this.router.navigate(['/forgot-password']);
        } else {
          this.router.navigate(['/register']);
        }
      }
    });
  }

  ngOnDestroy(): void {
    if (this.resendTimer) {
      clearInterval(this.resendTimer);
    }
  }

  sendOtp(): void {
    const emailValue = this.email();
    const type = this.otpType();
    
    if (!emailValue) {
      this.error.set('Email is required');
      return;
    }

    this.sendingOtp.set(true);
    this.error.set(null);
    this.success.set(null);

    this.authService.sendOtp(emailValue, type).subscribe({
      next: (response) => {
        this.sendingOtp.set(false);
        this.otpSent.set(true);
        // Don't show success message for sending - just transition to verify form
        this.startResendCooldown();
        // Focus on first OTP input after sending
        setTimeout(() => {
          this.focusOtpInput(0);
        }, 100);
      },
      error: (error) => {
        this.sendingOtp.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Failed to send verification code. Please try again.';
        this.error.set(errorMessage);
      }
    });
  }

  onSubmit(): void {
    if (this.otpForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const emailValue = this.email();
    // Combine all 6 fields into a single code string
    const code = this.otpFields.map(field => this.otpForm.value[field]).join('');

    const type = this.otpType();
    
    this.authService.verifyOtp(emailValue, code, type).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.error.set(null);
        
        if (type === 'password_reset') {
          // For password reset, save token and redirect to reset password page
          if (response.token) {
            sessionStorage.setItem('resetPasswordToken', response.token);
            this.success.set('Code verified! Redirecting to reset password...');
            setTimeout(() => {
              this.router.navigate(['/reset-password'], {
                queryParams: { email: emailValue }
              });
            }, 1500);
          } else {
            this.error.set('Token not received. Please try again.');
          }
        } else {
          // For email verification, redirect to login
          this.success.set('Email verified successfully! Redirecting to login...');
          // Email and password should already be in sessionStorage from registration
          setTimeout(() => {
            this.router.navigate(['/login'], {
              queryParams: { verified: 'true' }
            });
          }, 2000);
        }
      },
      error: (error) => {
        this.loading.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Invalid verification code. Please try again.';
        this.error.set(errorMessage);
        // Clear all OTP inputs on error
        this.clearOtpInputs();
      }
    });
  }

  startResendCooldown(): void {
    let seconds = 60;
    this.resendCooldown.set(seconds);

    this.resendTimer = setInterval(() => {
      seconds--;
      this.resendCooldown.set(seconds);

      if (seconds <= 0) {
        clearInterval(this.resendTimer);
        this.resendTimer = null;
      }
    }, 1000);
  }

  canResend(): boolean {
    return this.resendCooldown() === 0;
  }

  onOtpInput(event: Event, index: number): void {
    const input = event.target as HTMLInputElement;
    const value = input.value;

    // Only allow single digit
    if (value.length > 1) {
      input.value = value.slice(0, 1);
    }

    // Update form control
    const fieldName = this.otpFields[index];
    this.otpForm.get(fieldName)?.setValue(input.value);

    // Move to next field if digit entered
    if (input.value && index < 5) {
      this.focusOtpInput(index + 1);
    }

    // If all fields filled, user can click verify
  }

  onOtpKeyDown(event: KeyboardEvent, index: number): void {
    const input = event.target as HTMLInputElement;

    // Handle backspace
    if (event.key === 'Backspace' && !input.value && index > 0) {
      this.focusOtpInput(index - 1);
      // Clear the previous field
      const prevFieldName = this.otpFields[index - 1];
      this.otpForm.get(prevFieldName)?.setValue('');
    }

    // Handle paste
    if ((event.ctrlKey || event.metaKey) && event.key === 'v') {
      event.preventDefault();
      navigator.clipboard.readText().then(text => {
        const digits = text.replace(/\D/g, '').slice(0, 6);
        digits.split('').forEach((digit, i) => {
          if (i < 6) {
            const fieldName = this.otpFields[i];
            this.otpForm.get(fieldName)?.setValue(digit);
          }
        });
        // Focus on last filled field or last field
        const lastIndex = Math.min(digits.length - 1, 5);
        this.focusOtpInput(lastIndex);
      });
    }
  }

  focusOtpInput(index: number): void {
    const inputId = `otp-${index}`;
    const input = document.getElementById(inputId);
    if (input) {
      (input as HTMLInputElement).focus();
    }
  }

  clearOtpInputs(): void {
    this.otpFields.forEach(field => {
      this.otpForm.get(field)?.setValue('');
    });
    this.focusOtpInput(0);
  }

  private markFormGroupTouched(): void {
    Object.keys(this.otpForm.controls).forEach(key => {
      const control = this.otpForm.get(key);
      control?.markAsTouched();
    });
  }

  getOtpControl(index: number) {
    return this.otpForm.get(this.otpFields[index]);
  }

  isFormComplete(): boolean {
    return this.otpFields.every(field => this.otpForm.get(field)?.value);
  }
}

