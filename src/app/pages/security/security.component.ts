import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-security',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './security.component.html',
  styleUrl: './security.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SecurityComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly changePasswordForm: FormGroup;
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly showOldPassword = signal<boolean>(false);
  readonly showNewPassword = signal<boolean>(false);
  readonly showConfirmPassword = signal<boolean>(false);

  constructor() {
    this.changePasswordForm = this.fb.group({
      oldPassword: ['', [Validators.required]],
      newPassword: ['', [Validators.required, Validators.minLength(8)]],
      confirmPassword: ['', [Validators.required]]
    }, {
      validators: [this.passwordMatchValidator.bind(this), this.newPasswordDifferentValidator.bind(this)]
    });

    // Trigger validation on any field change for real-time feedback
    // Validators will run automatically on valueChanges
    // We mark as touched only when user has typed something to show errors immediately
    this.changePasswordForm.valueChanges.subscribe(() => {
      // Auto-validate when user types - this ensures validators run
      const oldPassword = this.changePasswordForm.get('oldPassword')?.value;
      const newPassword = this.changePasswordForm.get('newPassword')?.value;
      const confirmPassword = this.changePasswordForm.get('confirmPassword')?.value;

      // Mark as touched if user has entered value (for immediate error display)
      if (oldPassword) {
        this.changePasswordForm.get('oldPassword')?.markAsTouched({ onlySelf: true });
      }
      if (newPassword) {
        this.changePasswordForm.get('newPassword')?.markAsTouched({ onlySelf: true });
      }
      if (confirmPassword) {
        this.changePasswordForm.get('confirmPassword')?.markAsTouched({ onlySelf: true });
      }
    });
  }

  ngOnInit(): void {
    // Check if user is authenticated
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }
  }

  private passwordMatchValidator(group: FormGroup): { [key: string]: any } | null {
    const newPassword = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    if (!newPassword || !confirmPassword) {
      return null; // Don't validate if fields are empty
    }
    return newPassword === confirmPassword ? null : { passwordMismatch: true };
  }

  private newPasswordDifferentValidator(group: FormGroup): { [key: string]: any } | null {
    const oldPassword = group.get('oldPassword')?.value;
    const newPassword = group.get('newPassword')?.value;
    const confirmPassword = group.get('confirmPassword')?.value;
    
    if (!oldPassword || !newPassword) {
      return null; // Don't validate if fields are empty
    }
    
    // Check if new password matches old password
    if (newPassword === oldPassword) {
      return { newPasswordSameAsOld: true };
    }
    
    // Check if confirm password matches old password
    if (confirmPassword && confirmPassword === oldPassword) {
      return { confirmPasswordSameAsOld: true };
    }
    
    return null;
  }

  onSubmit(): void {
    if (this.changePasswordForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const { oldPassword, newPassword, confirmPassword } = this.changePasswordForm.value;

    this.authService.changePassword(oldPassword, newPassword, confirmPassword).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.success.set(response.message || 'Password changed successfully!');
        
        // Clear form after success
        this.changePasswordForm.reset();
        
        // Redirect to login after a delay to force re-login with new password
        setTimeout(() => {
          this.authService.logout();
          this.router.navigate(['/login'], {
            queryParams: { passwordChanged: 'true' }
          });
        }, 2000);
      },
      error: (error) => {
        this.loading.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Failed to change password. Please try again.';
        this.error.set(errorMessage);
      }
    });
  }

  toggleOldPasswordVisibility(): void {
    this.showOldPassword.set(!this.showOldPassword());
  }

  toggleNewPasswordVisibility(): void {
    this.showNewPassword.set(!this.showNewPassword());
  }

  toggleConfirmPasswordVisibility(): void {
    this.showConfirmPassword.set(!this.showConfirmPassword());
  }

  private markFormGroupTouched(): void {
    Object.keys(this.changePasswordForm.controls).forEach(key => {
      const control = this.changePasswordForm.get(key);
      control?.markAsTouched();
    });
  }

  get oldPasswordControl() {
    return this.changePasswordForm.get('oldPassword');
  }

  get newPasswordControl() {
    return this.changePasswordForm.get('newPassword');
  }

  get confirmPasswordControl() {
    return this.changePasswordForm.get('confirmPassword');
  }

  get passwordMismatchError(): boolean {
    const newPassword = this.newPasswordControl?.value;
    const confirmPassword = this.confirmPasswordControl?.value;
    return this.changePasswordForm.errors?.['passwordMismatch'] === true &&
           !!newPassword &&
           !!confirmPassword &&
           (!!this.confirmPasswordControl?.touched || !!this.newPasswordControl?.touched || !!confirmPassword);
  }

  get newPasswordSameAsOldError(): boolean {
    const oldPassword = this.oldPasswordControl?.value;
    const newPassword = this.newPasswordControl?.value;
    return this.changePasswordForm.errors?.['newPasswordSameAsOld'] === true &&
           !!oldPassword &&
           !!newPassword &&
           (!!this.newPasswordControl?.touched || !!this.oldPasswordControl?.touched || !!newPassword);
  }

  get confirmPasswordSameAsOldError(): boolean {
    const oldPassword = this.oldPasswordControl?.value;
    const confirmPassword = this.confirmPasswordControl?.value;
    return this.changePasswordForm.errors?.['confirmPasswordSameAsOld'] === true &&
           !!oldPassword &&
           !!confirmPassword &&
           (!!this.confirmPasswordControl?.touched || !!this.oldPasswordControl?.touched || !!confirmPassword);
  }

  isFormValid(): boolean {
    return this.changePasswordForm.valid && 
           !this.passwordMismatchError &&
           !this.newPasswordSameAsOldError &&
           !this.confirmPasswordSameAsOldError;
  }
}
