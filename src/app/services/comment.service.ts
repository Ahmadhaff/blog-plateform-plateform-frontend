import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import {
  Comment,
  CommentResponse,
  CreateCommentRequest,
  UpdateCommentRequest,
  LikeResponse
} from '../models/comment.model';

@Injectable({
  providedIn: 'root'
})
export class CommentService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = `${environment.apiUrl}/comments`;

  /**
   * Get all comments for an article
   */
  getCommentsByArticle(articleId: string): Observable<CommentResponse> {
    return this.http.get<CommentResponse>(`${this.baseUrl}/article/${articleId}`);
  }

  /**
   * Create a new comment
   */
  createComment(articleId: string, content: string, parentCommentId?: string): Observable<{ message: string; comment: Comment }> {
    const body: CreateCommentRequest = {
      content,
      articleId,
      ...(parentCommentId && { parentCommentId })
    };
    return this.http.post<{ message: string; comment: Comment }>(this.baseUrl, body);
  }

  /**
   * Update a comment
   */
  updateComment(commentId: string, content: string): Observable<{ message: string; comment: Comment }> {
    const body: UpdateCommentRequest = { content };
    return this.http.put<{ message: string; comment: Comment }>(`${this.baseUrl}/${commentId}`, body);
  }

  /**
   * Delete a comment (soft delete)
   */
  deleteComment(commentId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/${commentId}`);
  }

  /**
   * Toggle like on a comment
   */
  toggleLike(commentId: string): Observable<LikeResponse> {
    return this.http.post<LikeResponse>(`${this.baseUrl}/${commentId}/like`, {});
  }
}

