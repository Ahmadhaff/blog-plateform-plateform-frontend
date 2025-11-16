import { ChangeDetectionStrategy, Component, inject, signal, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

import { UserService, UserProfile } from '../../services/user.service';
import { AuthService } from '../../services/auth.service';

@Component({
  selector: 'app-settings',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink],
  templateUrl: './settings.component.html',
  styleUrl: './settings.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsComponent implements OnInit {
  private readonly fb = inject(FormBuilder);
  private readonly userService = inject(UserService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);

  readonly profileForm: FormGroup;
  readonly loading = signal<boolean>(false);
  readonly uploadingAvatar = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly success = signal<string | null>(null);
  readonly user = signal<UserProfile | null>(null);
  readonly selectedFile = signal<File | null>(null);
  readonly previewUrl = signal<string | null>(null);

  constructor() {
    this.profileForm = this.fb.group({
      username: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(50)]],
      email: [{ value: '', disabled: true }], // Email is read-only
      role: [{ value: '', disabled: true }] // Role is read-only
    });
  }

  ngOnInit(): void {
    // Check if user is authenticated
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    // Load user profile
    this.loadUserProfile();
  }

  private loadUserProfile(): void {
    this.loading.set(true);
    this.error.set(null);

    this.userService.getProfile().subscribe({
      next: (response) => {
        this.loading.set(false);
        if (response.user) {
          this.user.set(response.user);
          this.profileForm.patchValue({
            username: response.user.username,
            email: response.user.email,
            role: response.user.role
          });

          // Set preview URL if avatar exists
          if (response.user.avatar) {
            this.previewUrl.set(response.user.avatar);
          }
        }
      },
      error: (error) => {
        this.loading.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Failed to load profile.';
        this.error.set(errorMessage);
      }
    });
  }

  onFileSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];

      // Validate file type
      if (!file.type.startsWith('image/')) {
        this.error.set('Please select an image file.');
        return;
      }

      // Validate file size (2MB)
      if (file.size > 2 * 1024 * 1024) {
        this.error.set('Image size must be less than 2MB.');
        return;
      }

      this.selectedFile.set(file);
      this.error.set(null);

      // Create preview
      const reader = new FileReader();
      reader.onload = () => {
        this.previewUrl.set(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  }

  uploadAvatar(): void {
    const file = this.selectedFile();
    if (!file) {
      this.error.set('Please select an image file.');
      return;
    }

    this.uploadingAvatar.set(true);
    this.error.set(null);
    this.success.set(null);

    this.userService.uploadAvatar(file).subscribe({
      next: (response) => {
        this.uploadingAvatar.set(false);
        this.success.set('Avatar uploaded successfully!');
        this.selectedFile.set(null);

        // Update user data
        if (response.user) {
          this.user.set(response.user);
          // Update AuthService user data (which updates localStorage)
          this.authService.updateUserData(response.user);
          // Update preview with new avatar (cache-busted URL from server)
          if (response.user.avatar) {
            this.previewUrl.set(response.user.avatar);
          }

          // Clear avatar error state
          // Trigger app component to refresh user data immediately
          // Use a custom event to notify app component
          window.dispatchEvent(new CustomEvent('avatarUpdated', { 
            detail: { user: response.user } 
          }));
        }
      },
      error: (error) => {
        this.uploadingAvatar.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Failed to upload avatar.';
        this.error.set(errorMessage);
      }
    });
  }

  onSubmit(): void {
    if (this.profileForm.invalid) {
      this.markFormGroupTouched();
      return;
    }

    this.loading.set(true);
    this.error.set(null);
    this.success.set(null);

    const { username } = this.profileForm.value;

    this.userService.updateProfile({ username }).subscribe({
      next: (response) => {
        this.loading.set(false);
        this.success.set('Profile updated successfully!');

        // Update user data
        if (response.user) {
          this.user.set(response.user);
          // Update localStorage
          localStorage.setItem('user', JSON.stringify(response.user));

          // Trigger app component to refresh user data
          setTimeout(() => {
            window.location.reload();
          }, 1500);
        }
      },
      error: (error) => {
        this.loading.set(false);
        const errorMessage = error.error?.error || error.error?.message || 'Failed to update profile.';
        this.error.set(errorMessage);
      }
    });
  }

  private markFormGroupTouched(): void {
    Object.keys(this.profileForm.controls).forEach(key => {
      const control = this.profileForm.get(key);
      control?.markAsTouched();
    });
  }

  get usernameControl() {
    return this.profileForm.get('username');
  }

  get emailControl() {
    return this.profileForm.get('email');
  }

  get roleControl() {
    return this.profileForm.get('role');
  }
}
