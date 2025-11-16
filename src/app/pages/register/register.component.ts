import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-register',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './register.component.html',
  styleUrl: './register.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class RegisterComponent {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly registerForm: FormGroup;
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly showPassword = signal<boolean>(false);
  readonly showConfirmPassword = signal<boolean>(false);

  readonly roles: { value: 'Rédacteur' | 'Lecteur'; label: string }[] = [
    { value: 'Rédacteur', label: 'Writer (Rédacteur)' },
    { value: 'Lecteur', label: 'Reader (Lecteur)' }
  ];

  constructor() {
    this.registerForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      email: ['', [Validators.required, Validators.email]],
      password: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]],
      role: ['Lecteur', [Validators.required]]
    }, {
      validators: this.passwordMatchValidator
    });
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
    if (this.registerForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const { username, email, password, role } = this.registerForm.value;

    this.authService.register(username, email, password, role).subscribe({
      next: (response) => {
        this.loading.set(false);
        // Save email and password temporarily for login pre-fill
        sessionStorage.setItem('pendingLoginEmail', email);
        sessionStorage.setItem('pendingLoginPassword', password);
        
        // Don't show success message - redirect immediately to verify OTP
        // The verify page will show appropriate messages
        this.router.navigate(['/verify-otp'], {
          queryParams: { email: email }
        });
      },
      error: (error) => {
        this.loading.set(false);
        // Display error message from server or default message
        const errorMessage = error.error?.error || error.error?.message || 'Registration failed. Please try again.';
        this.error.set(errorMessage);
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
    Object.keys(this.registerForm.controls).forEach(key => {
      const control = this.registerForm.get(key);
      control?.markAsTouched();
    });
  }

  get usernameControl() {
    return this.registerForm.get('username');
  }

  get emailControl() {
    return this.registerForm.get('email');
  }

  get passwordControl() {
    return this.registerForm.get('password');
  }

  get confirmPasswordControl() {
    return this.registerForm.get('confirmPassword');
  }

  get roleControl() {
    return this.registerForm.get('role');
  }

  get passwordMismatchError(): boolean {
    return this.registerForm.errors?.['passwordMismatch'] === true && 
           !!this.confirmPasswordControl?.touched && 
           !!this.passwordControl?.touched &&
           !!this.confirmPasswordControl?.value &&
           !!this.passwordControl?.value;
  }
}

