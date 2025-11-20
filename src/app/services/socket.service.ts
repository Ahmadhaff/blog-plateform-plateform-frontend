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
  private socketUrl = environment.socketUrl || 'http://localhost:3001';
  private isConnecting = false;
  private listenersSetup = false;

  // Event subjects
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

  connect(token: string): void {
    if (this.socket?.connected) {
      return;
    }

    if (this.isConnecting) {
      return;
    }

    if (this.socket && !this.socket.connected) {
      this.socket.removeAllListeners();
      this.socket.close();
      this.socket = null;
      this.listenersSetup = false;
    }

    this.isConnecting = true;

    this.socket = io(this.socketUrl, {
      auth: { token },
      transports: ['polling', 'websocket'],
      upgrade: true,
      rememberUpgrade: false,
      timeout: 30000,
      reconnection: true,
      reconnectionDelay: 2000,
      reconnectionDelayMax: 10000,
      reconnectionAttempts: 5,
      forceNew: true,
      autoConnect: true,
      path: '/socket.io/',
      withCredentials: true
    });

    this.setupEventListeners();
  }

  disconnect(): void {
    this.isConnecting = false;
    this.listenersSetup = false;
    if (this.socket) {
      // Emit disconnect event to backend before disconnecting
      if (this.socket.connected) {
        this.socket.emit('userDisconnect');
      }
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
  }

  joinArticle(articleId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('joinArticle', articleId);
    }
  }

  leaveArticle(articleId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('leaveArticle', articleId);
    }
  }

  joinUserRoom(): void {
    if (this.socket?.connected) {
      this.socket.emit('joinUserRoom');
    }
  }

  sendTypingStatus(articleId: string, isTyping: boolean): void {
    if (this.socket?.connected) {
      this.socket.emit('typing', { articleId, isTyping });
    }
  }

  incrementArticleView(articleId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('incrementArticleView', { articleId });
    }
  }

  markNotificationAsRead(notificationId: string): void {
    if (this.socket?.connected) {
      this.socket.emit('notification:markRead', notificationId);
    }
  }

  requestNotificationCount(): void {
    if (this.socket?.connected) {
      this.socket.emit('notification:getCount');
    }
  }

  isConnected(): boolean {
    return this.socket?.connected ?? false;
  }

  // Observables
  onArticleViewUpdated(): Observable<ArticleViewUpdatedEvent> {
    return this.articleViewUpdatedSubject.asObservable();
  }

  onNewComment(): Observable<NewCommentEvent> {
    return this.newCommentSubject.asObservable();
  }

  onUserTyping(): Observable<UserTyping> {
    return this.userTypingSubject.asObservable();
  }

  onNotification(): Observable<NewNotificationEvent> {
    return this.notificationSubject.asObservable();
  }

  onNotificationCount(): Observable<NotificationCountResponse> {
    return this.notificationCountSubject.asObservable();
  }

  onNotificationRead(): Observable<{ notificationId: string; articleId?: string }> {
    return this.notificationReadSubject.asObservable();
  }

  onCommentLiked(): Observable<CommentLikedEvent> {
    return this.commentLikedSubject.asObservable();
  }

  onCommentUpdated(): Observable<CommentUpdatedEvent> {
    return this.commentUpdatedSubject.asObservable();
  }

  onCommentDeleted(): Observable<CommentDeletedEvent> {
    return this.commentDeletedSubject.asObservable();
  }

  onArticleLiked(): Observable<ArticleLikedEvent> {
    return this.articleLikedSubject.asObservable();
  }

  private setupEventListeners(): void {
    if (!this.socket || this.listenersSetup) {
      return;
    }

    this.listenersSetup = true;

    this.socket.on('connect', () => {
      this.isConnecting = false;
      this.joinUserRoom();
      
      setTimeout(() => {
        if (this.socket?.connected) {
          this.requestNotificationCount();
          this.socket.emit('socketReady');
        }
      }, 300);
    });

    this.socket.on('disconnect', () => {
      this.isConnecting = false;
    });

    this.socket.on('connect_error', () => {
      this.isConnecting = false;
    });

    this.socket.on('error', () => {
      this.isConnecting = false;
    });

    // Event handlers
    this.socket.on('newComment', (data: NewCommentEvent) => {
      this.newCommentSubject.next(data);
    });

    this.socket.on('userTyping', (data: UserTyping) => {
      this.userTypingSubject.next(data);
    });

    this.socket.on('newNotification', (data: NewNotificationEvent) => {
      this.notificationSubject.next(data);
    });

    this.socket.on('notification', (data: NewNotificationEvent) => {
      this.notificationSubject.next(data);
    });

    this.socket.on('notificationCount', (data: NotificationCountResponse) => {
      this.notificationCountSubject.next(data);
    });

    this.socket.on('notification:read', (data: { notificationId: string; articleId?: string }) => {
      this.notificationReadSubject.next(data);
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
  }
}

