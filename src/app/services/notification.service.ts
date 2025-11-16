import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Notification, NotificationResponse, NotificationCountResponse } from '../models/notification.model';

@Injectable({
  providedIn: 'root'
})
export class NotificationService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/notifications`;

  /**
   * Get user notifications with pagination
   */
  getNotifications(page: number = 1, limit: number = 20, read?: boolean): Observable<NotificationResponse> {
    let params = new HttpParams()
      .set('page', page.toString())
      .set('limit', limit.toString());

    if (read !== undefined) {
      params = params.set('read', read.toString());
    }

    return this.http.get<NotificationResponse>(this.baseUrl, { params });
  }

  /**
   * Get unread notification count
   */
  getUnreadCount(): Observable<NotificationCountResponse> {
    return this.http.get<NotificationCountResponse>(`${this.baseUrl}/unread-count`);
  }

  /**
   * Mark a notification as read
   */
  markAsRead(notificationId: string): Observable<{ message: string; notification: Notification; articleId?: string }> {
    return this.http.patch<{ message: string; notification: Notification; articleId?: string }>(
      `${this.baseUrl}/${notificationId}/read`,
      {}
    );
  }

  /**
   * Mark all notifications as read
   */
  markAllAsRead(): Observable<{ message: string }> {
    return this.http.patch<{ message: string }>(`${this.baseUrl}/mark-all-read`, {});
  }
}

