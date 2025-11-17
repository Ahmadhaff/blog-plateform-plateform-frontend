import { Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, NavigationEnd, RouterLink, RouterOutlet } from '@angular/router';
import { filter, Subscription } from 'rxjs';

import { AuthService } from './services/auth.service';
import { NotificationService } from './services/notification.service';
import { SocketService } from './services/socket.service';
import { User } from './models/auth.model';
import { Notification, NewNotificationEvent } from './models/notification.model';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [CommonModule, RouterLink, RouterOutlet],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  private readonly authService = inject(AuthService);
  private readonly notificationService = inject(NotificationService);
  private readonly socketService = inject(SocketService);
  private readonly router = inject(Router);

  readonly isAuthenticated = signal<boolean>(false);
  readonly currentUser = signal<User | null>(null);
  readonly avatarError = signal<boolean>(false);
  readonly notificationCount = signal<number>(0);
  readonly notifications = signal<Notification[]>([]);
  readonly showNotificationDropdown = signal<boolean>(false);
  readonly mobileMenuOpen = signal<boolean>(false);
  readonly logoutLoading = signal<boolean>(false);
  private tokenCheckInterval?: Subscription;
  private isRefreshing = false;
  private refreshTokenExpiresAt: number | null = null;
  private notificationSubscriptions?: Subscription;

  constructor() {
    // Update auth state when router navigates
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.checkAuth();
        // Close mobile menu on navigation
        this.closeMobileMenu();
      });

    // Listen for storage changes (login/logout from same or other tabs)
    window.addEventListener('storage', this.handleStorageChange.bind(this));
    
    // Also listen for custom events (login/logout from same tab)
    window.addEventListener('authStateChanged', this.handleAuthStateChange.bind(this));

    // Close dropdown when clicking outside
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.notification-container')) {
        this.showNotificationDropdown.set(false);
      }
    });

    // Close dropdown on navigation
    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      if (this.showNotificationDropdown()) {
        this.closeNotificationDropdown();
      }
    });
  }
  
  private handleStorageChange(event: StorageEvent): void {
    // Update auth state when localStorage changes (login/logout from another tab)
    if (event.key === 'token' || event.key === 'user') {
      this.checkAuth();
    }
  }
  
  private handleAuthStateChange(): void {
    // Update auth state when custom event is dispatched (login/logout from same tab)
    this.checkAuth();
  }

  ngOnInit(): void {
    this.checkAuth();
    
    if (this.authService.isAuthenticated()) {
      this.fetchUserProfile();
      this.loadNotifications();
      this.connectSocket();
      this.logTokenExpirationTimes();
      this.startTokenExpirationCheck();
    }
  }

  ngOnDestroy(): void {
    if (this.tokenCheckInterval) {
      this.tokenCheckInterval.unsubscribe();
    }
    if (this.notificationSubscriptions) {
      this.notificationSubscriptions.unsubscribe();
    }
  }

  isRedacteur(): boolean {
    return this.currentUser()?.role === 'Rédacteur';
  }

  logout(): void {
    // Prevent multiple simultaneous logout attempts
    if (this.logoutLoading()) {
      return;
    }

    // Show loader in logout button
    this.logoutLoading.set(true);

    // Make logout request to backend first, then clean frontend and redirect
    this.authService.logout().subscribe({
      next: () => {
        // Logout on server succeeded - now clean frontend and redirect
        this.completeLogout();
      },
      error: (error) => {
        // Even if logout fails, still clean frontend and redirect
        console.error('Error logging out from server:', error);
        this.completeLogout();
      }
    });
  }

  private completeLogout(): void {
    // Clear local state
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.notificationCount.set(0);
    this.notifications.set([]);
    this.refreshTokenExpiresAt = null;
    this.isRefreshing = false;
    
    // Disconnect socket
    this.socketService.disconnect();
    
    // Clear frontend storage
    this.authService.clearLocalStorage();
    
    // Hide loader
    this.logoutLoading.set(false);
    
    // Navigate to home page
    this.router.navigate(['/']).then(() => {
      // Force a check after navigation to ensure state is clean
      // This will also dispatch authStateChanged event if state changed
      this.checkAuth();
    });
  }

  private startTokenExpirationCheck(): void {
    if (this.tokenCheckInterval) {
      this.tokenCheckInterval.unsubscribe();
    }

    this.tokenCheckInterval = new Subscription();

    // Check every second for token expiration
    const interval = setInterval(() => {
      if (!this.authService.isAuthenticated()) {
        clearInterval(interval);
        this.tokenCheckInterval?.unsubscribe();
        return;
      }

      const now = Math.floor(Date.now() / 1000);
      const accessToken = this.authService.getToken();

      if (accessToken) {
        try {
          const payload = JSON.parse(atob(accessToken.split('.')[1]));
          const accessExp = payload.exp;

          if (accessExp && now >= accessExp && !this.isRefreshing) {
            this.isRefreshing = true;
            this.authService.refreshToken().subscribe({
              next: (response) => {
                this.isRefreshing = false;
                if (response.accessToken) {
                  this.logTokenExpirationTimes();
                }
              },
              error: (error) => {
                this.isRefreshing = false;
                console.error('❌ Failed to refresh access token:', error);
                
                // If refresh fails with 401 or invalid token error, logout immediately
                if (error.status === 401 || 
                    error.error?.error?.toLowerCase().includes('invalid') ||
                    error.error?.error?.toLowerCase().includes('expired')) {
                  console.error('❌ Refresh token is invalid or expired - Logging out');
                  this.logout();
                  return;
                }
                
                // Check if refresh token also expired by parsing it
                const refreshToken = this.authService.getRefreshToken();
                if (refreshToken) {
                  try {
                    const refreshPayload = JSON.parse(atob(refreshToken.split('.')[1]));
                    const refreshExp = refreshPayload.exp;

                    if (refreshExp && now >= refreshExp) {
                      console.error('❌ Refresh token expired - Logging out');
                      this.logout();
                    }
                  } catch (e) {
                    console.error('❌ Error parsing refresh token:', e);
                    // If we can't parse the token, it's likely invalid - logout
                    this.logout();
                  }
                } else {
                  // No refresh token available - logout
                  console.error('❌ No refresh token available - Logging out');
                  this.logout();
                }
              }
            });
          }
        } catch (error) {
          console.error('❌ Error parsing access token:', error);
        }
      }

      // Check refresh token expiration
      if (this.refreshTokenExpiresAt && now >= this.refreshTokenExpiresAt) {
        clearInterval(interval);
        this.tokenCheckInterval?.unsubscribe();
        this.logout();
      }
    }, 1000);

    this.tokenCheckInterval.add({ unsubscribe: () => clearInterval(interval) } as Subscription);
  }

  private logTokenExpirationTimes(): void {
    const accessToken = this.authService.getToken();
    const refreshToken = this.authService.getRefreshToken();

    if (accessToken) {
      try {
        const payload = JSON.parse(atob(accessToken.split('.')[1]));
        const accessExp = payload.exp;
        if (accessExp) {
          // store access token expiration if needed later
        }
      } catch (error) {
        console.error('❌ Error parsing access token:', error);
      }
    }

    if (refreshToken) {
      try {
        const payload = JSON.parse(atob(refreshToken.split('.')[1]));
        const refreshExp = payload.exp;
        if (refreshExp) {
          this.refreshTokenExpiresAt = refreshExp;
        }
      } catch (error) {
        console.error('❌ Error parsing refresh token:', error);
      }
    } else {
      this.refreshTokenExpiresAt = null;
    }
  }

  private checkAuth(): void {
    const isAuth = this.authService.isAuthenticated();
    const wasAuth = this.isAuthenticated();
    
    // Only dispatch event if auth state actually changed
    const authStateChanged = wasAuth !== isAuth;
    
    this.isAuthenticated.set(isAuth);
    
    if (isAuth) {
      this.currentUser.set(this.authService.getCurrentUser());
      if (!this.refreshTokenExpiresAt) {
        this.logTokenExpirationTimes();
      }
      
      // Only connect socket if not already connected and we weren't authenticated before
      // This prevents disconnecting and reconnecting on every route change
      if (!this.socketService.isConnected() && !wasAuth) {
        this.loadNotifications();
        this.connectSocket();
      } else if (this.socketService.isConnected()) {
        // Already connected, just setup listeners and load notifications
        this.setupNotificationListeners();
        this.socketService.requestNotificationCount();
        this.loadNotifications();
      }
    } else {
      // Only disconnect socket if we were authenticated before
      // This prevents disconnecting unnecessarily
      if (wasAuth) {
        this.currentUser.set(null);
        this.refreshTokenExpiresAt = null;
        this.isRefreshing = false;
        this.notificationCount.set(0);
        this.notifications.set([]);
        this.socketService.disconnect();
      }
    }
    
    // Dispatch event if auth state changed (for other components to react)
    if (authStateChanged) {
      window.dispatchEvent(new CustomEvent('authStateChanged'));
    }
  }

  private connectSocket(): void {
    const token = this.authService.getToken();
    
    if (token) {
      this.setupNotificationListeners();
      this.socketService.connect(token);
      
      setTimeout(() => {
        if (this.socketService.isConnected()) {
          this.socketService.requestNotificationCount();
        }
      }, 500);
    }
  }

  private setupNotificationListeners(): void {
    if (this.notificationSubscriptions) {
      this.notificationSubscriptions.unsubscribe();
    }

    const newNotificationSub = this.socketService.onNotification().subscribe((notification: NewNotificationEvent) => {
      const currentNotifications = this.notifications();
      const notificationExists = currentNotifications.some(n => n.id === notification.id || n._id === notification.id);
      
      if (notificationExists) {
        return;
      }
      
      const newNotif: Notification = {
        _id: notification.id,
        id: notification.id,
        type: notification.type as any,
        title: notification.title,
        message: notification.message,
        data: {
          ...notification.data,
          ...(notification.commentId && { commentId: notification.commentId })
        },
        read: notification.read,
        createdAt: notification.createdAt,
        articleId: notification.articleId
      };
      
      this.notifications.set([newNotif, ...currentNotifications]);
    });

    const countSub = this.socketService.onNotificationCount().subscribe((data) => {
      this.notificationCount.set(data.count || 0);
    });

    const readSub = this.socketService.onNotificationRead().subscribe(() => {
      // Count will be updated via notificationCount event
    });

    this.notificationSubscriptions = new Subscription();
    this.notificationSubscriptions.add(newNotificationSub);
    this.notificationSubscriptions.add(countSub);
    this.notificationSubscriptions.add(readSub);
  }

  private loadNotifications(): void {
    this.notificationService.getUnreadCount().subscribe({
      next: (response) => {
        this.notificationCount.set(response.count || 0);
      },
      error: () => {
        this.notificationCount.set(0);
      }
    });
  }

  private fetchUserProfile(): void {
    this.authService.getUserProfile().subscribe({
      next: (response) => {
        if (response.user) {
          this.currentUser.set(response.user);
          this.avatarError.set(false);
        }
      },
      error: (error) => {
        console.error('Failed to fetch user profile:', error);
        this.currentUser.set(this.authService.getCurrentUser());
      }
    });
  }

  onAvatarError(): void {
    this.avatarError.set(true);
  }

  toggleMobileMenu(): void {
    this.mobileMenuOpen.update(open => !open);
  }

  closeMobileMenu(): void {
    this.mobileMenuOpen.set(false);
  }

  toggleNotificationDropdown(): void {
    this.showNotificationDropdown.update(open => !open);
    if (this.showNotificationDropdown()) {
      this.notificationService.getNotifications(1, 10).subscribe({
        next: (response) => {
          this.notifications.set(response.notifications || []);
        },
        error: () => {
          this.notifications.set([]);
        }
      });
    }
  }

  closeNotificationDropdown(): void {
    this.showNotificationDropdown.set(false);
  }

  onNotificationClick(notification: Notification): void {
    if (!notification.read) {
      this.markAsRead(notification._id || notification.id!);
    }

    if (notification.articleId || notification.data?.articleId) {
      const articleId = notification.articleId || notification.data?.articleId;
      const commentId = notification.data?.commentId;
      
      // Navigate to article with commentId as query parameter if it's a comment-related notification
      if (commentId && (
        notification.type === 'new_comment' || 
        notification.type === 'comment_reply' || 
        notification.type === 'comment_liked'
      )) {
        this.router.navigate(['/article', articleId], { 
          queryParams: { commentId },
          fragment: `comment-${commentId}`
        });
      } else {
        this.router.navigate(['/article', articleId]);
      }
      this.closeNotificationDropdown();
    }
  }

  markAsRead(notificationId: string): void {
    this.socketService.markNotificationAsRead(notificationId);

    this.notificationService.markAsRead(notificationId).subscribe({
      next: () => {
        this.notifications.update(notifs =>
          notifs.map(n => n._id === notificationId || n.id === notificationId
            ? { ...n, read: true, readAt: new Date().toISOString() }
            : n
          )
        );
      },
      error: (error) => {
        console.error('Error marking notification as read:', error);
      }
    });
  }

  markAllAsRead(): void {
    const unreadIds = this.notifications()
      .filter(n => !n.read)
      .map(n => n._id || n.id!);

    if (unreadIds.length === 0) {
      return;
    }

    this.notificationService.markAllAsRead().subscribe({
      next: () => {
        this.notifications.update(notifs =>
          notifs.map(n => ({ ...n, read: true, readAt: new Date().toISOString() }))
        );
        this.notificationCount.set(0);
      },
      error: (error) => {
        console.error('Error marking all notifications as read:', error);
      }
    });
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }
}