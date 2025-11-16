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
  private socketUrl = 'http://localhost:3001'; // WebSocket server URL
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

  /**
   * Connect to WebSocket server
   * @param token JWT token for authentication
   */
  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    this.socket = io(this.socketUrl, {
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.setupEventListeners();
  }

  /**
   * Disconnect from WebSocket server
   */
  disconnect(): void {
    if (this.socket) {
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

      this.socket.on('connect', () => {
        this.joinUserRoom();
        
        // Request count after connection
        setTimeout(() => {
          if (this.socket?.connected) {
            this.requestNotificationCount();
          }
        }, 300);
        
        // Emit socket ready event
        setTimeout(() => {
          this.socket?.emit('socketReady');
        }, 100);
      });

    this.socket.on('disconnect', () => {
      // Optionally handle disconnect event if needed
    });

    this.socket.on('connect_error', (error) => {
      console.error('❌ [SocketService] Socket connection error:', error);
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

