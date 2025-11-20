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
    this.router.events
      .pipe(filter(event => event instanceof NavigationEnd))
      .subscribe(() => {
        this.checkAuth();
        this.closeMobileMenu();
      });

    window.addEventListener('storage', this.handleStorageChange.bind(this));
    window.addEventListener('authStateChanged', this.handleAuthStateChange.bind(this));

    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (!target.closest('.notification-container')) {
        this.showNotificationDropdown.set(false);
      }
    });

    this.router.events.pipe(filter(event => event instanceof NavigationEnd)).subscribe(() => {
      if (this.showNotificationDropdown()) {
        this.closeNotificationDropdown();
      }
    });
  }
  
  private handleStorageChange(event: StorageEvent): void {
    if (event.key === 'token' || event.key === 'user') {
      this.checkAuth();
    }
  }
  
  private handleAuthStateChange(): void {
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
    if (this.logoutLoading()) {
      return;
    }

    this.logoutLoading.set(true);

    this.authService.logout().subscribe({
      next: () => {
        this.completeLogout();
      },
      error: () => {
        this.completeLogout();
      }
    });
  }

  private completeLogout(): void {
    this.isAuthenticated.set(false);
    this.currentUser.set(null);
    this.notificationCount.set(0);
    this.notifications.set([]);
    this.refreshTokenExpiresAt = null;
    this.isRefreshing = false;
    
    this.socketService.disconnect();
    this.authService.clearLocalStorage();
    this.logoutLoading.set(false);
    
    this.router.navigate(['/']).then(() => {
      this.checkAuth();
    });
  }

  private startTokenExpirationCheck(): void {
    if (this.tokenCheckInterval) {
      this.tokenCheckInterval.unsubscribe();
    }

    this.tokenCheckInterval = new Subscription();

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
                
                if (error.status === 401 || 
                    error.error?.error?.toLowerCase().includes('invalid') ||
                    error.error?.error?.toLowerCase().includes('expired')) {
                  this.logout();
                  return;
                }
                
                const refreshToken = this.authService.getRefreshToken();
                if (refreshToken) {
                  try {
                    const refreshPayload = JSON.parse(atob(refreshToken.split('.')[1]));
                    const refreshExp = refreshPayload.exp;

                    if (refreshExp && now >= refreshExp) {
                      this.logout();
                    }
                  } catch {
                    this.logout();
                  }
                } else {
                  this.logout();
                }
              }
            });
          }
        } catch {
          // Invalid token format
        }
      }

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
        // Access token expiration stored for future use
      } catch {
        // Invalid token format
      }
    }

    if (refreshToken) {
      try {
        const payload = JSON.parse(atob(refreshToken.split('.')[1]));
        const refreshExp = payload.exp;
        if (refreshExp) {
          this.refreshTokenExpiresAt = refreshExp;
        }
      } catch {
        // Invalid refresh token format
      }
    } else {
      this.refreshTokenExpiresAt = null;
    }
  }

  private checkAuth(): void {
    const isAuth = this.authService.isAuthenticated();
    const wasAuth = this.isAuthenticated();
    const authStateChanged = wasAuth !== isAuth;
    
    this.isAuthenticated.set(isAuth);
    
    if (isAuth) {
      this.currentUser.set(this.authService.getCurrentUser());
      if (!this.refreshTokenExpiresAt) {
        this.logTokenExpirationTimes();
      }
      
      if (!this.socketService.isConnected() && !wasAuth) {
        this.loadNotifications();
        this.connectSocket();
      } else if (this.socketService.isConnected()) {
        if (!this.notificationSubscriptions) {
          this.setupNotificationListeners();
        }
        this.socketService.requestNotificationCount();
        this.loadNotifications();
      }
    } else {
      if (wasAuth) {
        this.currentUser.set(null);
        this.refreshTokenExpiresAt = null;
        this.isRefreshing = false;
        this.notificationCount.set(0);
        this.notifications.set([]);
        this.socketService.disconnect();
      }
    }
    
    if (authStateChanged) {
      window.dispatchEvent(new CustomEvent('authStateChanged'));
    }
  }

  private connectSocket(): void {
    let token = this.authService.getToken();
    
    if (!token) {
      return;
    }
    
    if (this.authService.isTokenExpired(token)) {
      const refreshToken = this.authService.getRefreshToken();
      
      if (refreshToken && !this.authService.isTokenExpired(refreshToken)) {
        this.authService.refreshToken().subscribe({
          next: (response) => {
            if (response.accessToken) {
              token = response.accessToken;
              this.socketService.connect(token);
              this.setupSocketListeners();
            }
          },
          error: () => {
            if (token) {
              this.socketService.connect(token);
            }
          }
        });
        return;
      }
      
      return;
    }
    
    this.socketService.connect(token);
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    setTimeout(() => {
      if (this.socketService.isConnected()) {
        if (!this.notificationSubscriptions) {
          this.setupNotificationListeners();
        }
        this.socketService.requestNotificationCount();
      }
    }, 500);
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
      // Count updated via notificationCount event
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
      error: () => {
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
      error: () => {
        // Error handled silently
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
      error: () => {
        // Error handled silently
      }
    });
  }

  get currentYear(): number {
    return new Date().getFullYear();
  }
}
