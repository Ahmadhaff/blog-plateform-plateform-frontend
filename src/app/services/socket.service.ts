import { Injectable } from '@angular/core';
import { Observable, Subject } from 'rxjs';
import { io, Socket } from 'socket.io-client';

import { environment } from '../../environments/environment';
import { Comment, CommentLikedEvent, CommentUpdatedEvent, CommentDeletedEvent } from '../models/comment.model';
import { ArticleLikedEvent } from '../models/article.model';
import { NewNotificationEvent, NotificationCountResponse } from '../models/notification.model';

interface UserTyping {
  userId: string;
  username: string;
  isTyping: boolean;
}

interface NewCommentEvent {
  comment: Comment;
  parentCommentId: string | null;
}

interface ArticleViewUpdatedEvent {
  articleId: string;
  views: number;
}

@Injectable({
  providedIn: 'root'
})
export class SocketService {
  private socket: Socket | null = null;
  private socketUrl = environment.socketUrl || 'http://localhost:3001'; // WebSocket server URL
  private newCommentSubject = new Subject<NewCommentEvent>();
  private userTypingSubject = new Subject<UserTyping>();
  private notificationSubject = new Subject<NewNotificationEvent>();
  private notificationCountSubject = new Subject<NotificationCountResponse>();
  private notificationReadSubject = new Subject<{ notificationId: string; articleId?: string }>();
  private articleViewUpdatedSubject = new Subject<ArticleViewUpdatedEvent>();
  private commentLikedSubject = new Subject<CommentLikedEvent>();
  private commentUpdatedSubject = new Subject<CommentUpdatedEvent>();
  private commentDeletedSubject = new Subject<CommentDeletedEvent>();
  private articleLikedSubject = new Subject<ArticleLikedEvent>();

  private isConnecting = false;
  private listenersSetup = false;

  /**
   * Connect to WebSocket server
   * @param token JWT token for authentication
   */
  connect(token: string): void {
    // Prevent duplicate connections
    if (this.socket?.connected) {
      console.log('✅ [SocketService] Already connected, skipping');
      return;
    }

    // Prevent multiple simultaneous connection attempts
    if (this.isConnecting) {
      console.log('⚠️ [SocketService] Connection already in progress, skipping');
      return;
    }

    // If socket exists but not connected, clean it up first
    if (this.socket && !this.socket.connected) {
      console.log('⚠️ [SocketService] Cleaning up existing socket before reconnecting');
      // Don't call disconnect() here as it might trigger events
      // Just remove listeners and set to null
      this.socket.removeAllListeners();
      this.socket.close(); // Close the socket properly
      this.socket = null;
      this.listenersSetup = false;
    }

    this.isConnecting = true;
    console.log('🔌 [SocketService] Connecting to:', this.socketUrl);
    console.log('🔑 [SocketService] Token present:', !!token);

    // For Render.com, prefer polling first, then upgrade to websocket
    // This works better with proxies and load balancers
    this.socket = io(this.socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'], // Polling first for better compatibility
      upgrade: true, // Allow upgrade to websocket
      rememberUpgrade: false, // Don't remember upgrade preference
      timeout: 30000, // 30 seconds timeout (longer for production)
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 5,
      forceNew: true, // Force a new connection to prevent duplicates
      autoConnect: true,
      // Additional options for Render.com compatibility
      path: '/socket.io/',
      withCredentials: true
    });

    this.setupEventListeners();
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    this.isConnecting = false;
    this.listenersSetup = false;
    if (this.socket) {
      console.log('🔌 [SocketService] Disconnecting');
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  /**
   * Join an article room
   */
  joinArticle(articleId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('joinArticle', articleId);
    }
  }

  /**
   * Leave an article room
   */
  leaveArticle(articleId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leaveArticle', articleId);
    }
  }

  /**
   * Join user's personal room for notifications
   */
  joinUserRoom(): void {
    if (this.socket?.connected) {
      this.socket.emit('joinUserRoom');
    }
  }

  /**
   * Send typing status
   */
  sendTypingStatus(articleId: string, isTyping: boolean): void {
    if (this.socket?.connected) {
      this.socket.emit('typing', { articleId, isTyping });
    }
  }

  /**
   * Emit article view increment event
   */
  incrementArticleView(articleId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('incrementArticleView', { articleId });
    }
  }

  /**
   * Listen for article view updates
   */
  onArticleViewUpdated(): Observable<ArticleViewUpdatedEvent> {
    return this.articleViewUpdatedSubject.asObservable();
  }

  /**
   * Listen for new comments
   */
  onNewComment(): Observable<NewCommentEvent> {
    return this.newCommentSubject.asObservable();
  }

  /**
   * Listen for user typing indicators
   */
  onUserTyping(): Observable<UserTyping> {
    return this.userTypingSubject.asObservable();
  }

  /**
   * Listen for new notifications
   */
  onNotification(): Observable<NewNotificationEvent> {
    return this.notificationSubject.asObservable();
  }

  /**
   * Listen for notification count updates
   */
  onNotificationCount(): Observable<NotificationCountResponse> {
    return this.notificationCountSubject.asObservable();
  }

  /**
   * Listen for notification read events
   */
  onNotificationRead(): Observable<{ notificationId: string; articleId?: string }> {
    return this.notificationReadSubject.asObservable();
  }

  /**
   * Mark a notification as read via socket
   */
  markNotificationAsRead(notificationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('notification:markRead', notificationId);
    }
  }

  /**
   * Request notification count
   */
  requestNotificationCount(): void {
    if (this.socket?.connected) {
      this.socket.emit('notification:getCount');
    }
  }

  /**
   * Listen for comment liked events
   */
  onCommentLiked(): Observable<CommentLikedEvent> {
    return this.commentLikedSubject.asObservable();
  }

  /**
   * Listen for comment updated events
   */
  onCommentUpdated(): Observable<CommentUpdatedEvent> {
    return this.commentUpdatedSubject.asObservable();
  }

  /**
   * Listen for comment deleted events
   */
  onCommentDeleted(): Observable<CommentDeletedEvent> {
    return this.commentDeletedSubject.asObservable();
  }

  /**
   * Listen for article liked events
   */
  onArticleLiked(): Observable<ArticleLikedEvent> {
    return this.articleLikedSubject.asObservable();
  }

  /**
   * Check if socket is connected
   */
  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  private setupEventListeners(): void {
    if (!this.socket) {
      return;
    }

    // Only setup listeners once per socket instance
    if (this.listenersSetup) {
      console.log('⚠️ [SocketService] Listeners already setup, skipping');
      return;
    }

    this.listenersSetup = true;

    this.socket.on('connect', () => {
      this.isConnecting = false;
      console.log('✅ [SocketService] Connected successfully');
      this.joinUserRoom();
      
      // Request count after connection
      setTimeout(() => {
        if (this.socket?.connected) {
          this.requestNotificationCount();
        }
      }, 300);
      
      // Emit socket ready event
      setTimeout(() => {
        if (this.socket?.connected) {
          this.socket.emit('socketReady');
        }
      }, 100);
    });

    this.socket.on('disconnect', (reason) => {
      this.isConnecting = false;
      console.log('⚠️ [SocketService] Disconnected:', reason);
      
      // If disconnected due to transport error or server error, reset connection state
      if (reason === 'transport close' || reason === 'transport error' || reason === 'ping timeout') {
        console.log('⚠️ [SocketService] Transport error, will allow reconnection');
        // Don't reset isConnecting here - let reconnection handle it
      }
      
      // Only reset socket to null if it was a manual disconnect or server disconnect
      // Don't reset on client-side disconnect (might reconnect)
      if (reason === 'io client disconnect' || reason === 'io server disconnect') {
        // Keep socket instance for reconnection attempts
        // Only set to null on explicit disconnect() call
      }
    });

    this.socket.on('connect_error', (error) => {
      this.isConnecting = false;
      console.error('❌ [SocketService] Socket connection error:', error);
      console.error('❌ [SocketService] Error type:', error.constructor.name);
      console.error('❌ [SocketService] Error message:', error.message);
      
      // Reset connection state on error to allow retry
      // Socket.IO will handle reconnection automatically
      setTimeout(() => {
        if (!this.socket?.connected && !this.isConnecting) {
          console.log('⚠️ [SocketService] Connection failed, will retry via auto-reconnect');
        }
      }, 2000);
    });
    
    // Handle timeout specifically
    this.socket.on('error', (error) => {
      this.isConnecting = false;
      console.error('❌ [SocketService] Socket error:', error);
    });

    this.socket.on('newComment', (data: NewCommentEvent) => {
      this.newCommentSubject.next(data);
    });

    this.socket.on('userTyping', (data: UserTyping) => {
      this.userTypingSubject.next(data);
    });

    this.socket.on('newNotification', (data: NewNotificationEvent) => {
      this.notificationSubject.next(data);
    });

    this.socket.on('notificationCount', (data: NotificationCountResponse) => {
      this.notificationCountSubject.next(data);
    });

    this.socket.on('notification:read', (data: { notificationId: string; articleId?: string }) => {
      this.notificationReadSubject.next(data);
    });

    // Legacy support for old notification event name
    this.socket.on('notification', (data: any) => {
      this.notificationSubject.next(data);
    });

    this.socket.on('articleViewUpdated', (data: ArticleViewUpdatedEvent) => {
      this.articleViewUpdatedSubject.next(data);
    });

    this.socket.on('commentLiked', (data: CommentLikedEvent) => {
      this.commentLikedSubject.next(data);
    });

    this.socket.on('commentUpdated', (data: CommentUpdatedEvent) => {
      this.commentUpdatedSubject.next(data);
    });

    this.socket.on('commentDeleted', (data: CommentDeletedEvent) => {
      this.commentDeletedSubject.next(data);
    });

    this.socket.on('articleLiked', (data: ArticleLikedEvent) => {
      this.articleLikedSubject.next(data);
    });

    this.socket.on('error', (error: any) => {
      console.error('❌ [SocketService] WebSocket error:', error);
    });
  }
}

