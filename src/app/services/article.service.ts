import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';

import { environment } from '../../environments/environment';
import { Article, ArticlesResponse } from '../models/article.model';

@Injectable({
  providedIn: 'root'
})
export class ArticleService {
  private readonly http = inject(HttpClient);
  private readonly baseUrl = environment.apiUrl;

  getArticles(params?: Record<string, string | number | boolean | undefined>): Observable<ArticlesResponse> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return this.http.get<ArticlesResponse>(`${this.baseUrl}/articles`, {
      params: httpParams
    });
  }

  getArticleById(id: string): Observable<{ article: Article }> {
    return this.http.get<{ article: Article }>(`${this.baseUrl}/articles/${id}`);
  }

  /**
   * Toggle like on an article
   */
  toggleLike(articleId: string): Observable<{ message: string; likes: number }> {
    return this.http.post<{ message: string; likes: number }>(`${this.baseUrl}/articles/${articleId}/like`, {});
  }

  /**
   * Get my articles (for Rédacteur/Éditeur/Admin)
   */
  getMyArticles(params?: Record<string, string | number | boolean | undefined>): Observable<ArticlesResponse> {
    let httpParams = new HttpParams();

    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
          httpParams = httpParams.set(key, String(value));
        }
      });
    }

    return this.http.get<ArticlesResponse>(`${this.baseUrl}/articles/my/articles`, {
      params: httpParams
    });
  }

  /**
   * Update an article
   */
  updateArticle(articleId: string, data: FormData): Observable<{ message: string; article: Article }> {
    return this.http.put<{ message: string; article: Article }>(`${this.baseUrl}/articles/${articleId}`, data);
  }

  /**
   * Create a new article
   */
  createArticle(data: FormData): Observable<{ message: string; article: Article }> {
    return this.http.post<{ message: string; article: Article }>(`${this.baseUrl}/articles`, data);
  }

  /**
   * Delete an article
   */
  deleteArticle(articleId: string): Observable<{ message: string }> {
    return this.http.delete<{ message: string }>(`${this.baseUrl}/articles/${articleId}`);
  }
}

