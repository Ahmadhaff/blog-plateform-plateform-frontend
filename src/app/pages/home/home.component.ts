import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { Subject, takeUntil } from 'rxjs';

import { Article, ArticleLikedEvent } from '../../models/article.model';
import { ArticleActions } from '../../state/article/article.actions';
import {
  selectArticleError,
  selectArticleList,
  selectArticleLoading,
  selectArticlePagination
} from '../../state/article/article.selectors';
import { ArticleService } from '../../services/article.service';
import { AuthService } from '../../services/auth.service';
import { SocketService } from '../../services/socket.service';

@Component({
  selector: 'app-home',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './home.component.html',
  styleUrl: './home.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class HomeComponent implements OnInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly articleService = inject(ArticleService);
  private readonly authService = inject(AuthService);
  private readonly socketService = inject(SocketService);
  private readonly destroy$ = new Subject<void>();

  readonly articles = this.store.selectSignal(selectArticleList);
  readonly pagination = this.store.selectSignal(selectArticlePagination);
  readonly loading = this.store.selectSignal(selectArticleLoading);
  readonly error = this.store.selectSignal(selectArticleError);
  private readonly imageErrors = signal<ReadonlySet<string>>(new Set());
  readonly isAuthenticated = signal<boolean>(false);
  readonly currentUserId = signal<string | null>(null);

  ngOnInit(): void {
    this.store.dispatch(ArticleActions.loadArticles());
    
    // Check authentication and get user ID
    const isAuth = this.authService.isAuthenticated();
    this.isAuthenticated.set(isAuth);
    
    if (isAuth) {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          this.currentUserId.set(user?._id || null);
        } catch (e) {
          console.error('Error parsing user from localStorage:', e);
        }
      }

      // Connect to socket for real-time updates
      const token = this.authService.getToken();
      if (token) {
        this.socketService.connect(token);
      }
    }

    // Listen for article liked events for real-time updates
    this.socketService.onArticleLiked()
      .pipe(takeUntil(this.destroy$))
      .subscribe((event: ArticleLikedEvent) => {
        // Update article likes in the store
        const currentArticles = this.articles();
        const updatedArticles = currentArticles.map(article => {
          if (article.id === event.articleId) {
            return {
              ...article,
              likesCount: event.likes,
              likes: event.likesArray
            };
          }
          return article;
        });
        
        // Dispatch action to update articles in store
        this.store.dispatch(ArticleActions.loadArticlesSuccess({
          articles: updatedArticles,
          pagination: this.pagination() || { page: 1, limit: 10, total: 0, pages: 0 }
        }));
      });
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
  }

  trackByArticleId(_index: number, article: Article): string {
    return article.id;
  }

  hasImage(article: Article): boolean {
    return Boolean(article.imageUrl) && !this.imageErrors().has(article.id);
  }

  onImageError(articleId: string): void {
    const next = new Set(this.imageErrors());
    next.add(articleId);
    this.imageErrors.set(next);
  }

  navigateToArticle(articleId: string, event?: Event): void {
    // RouterLink will handle navigation, this is just a fallback
    // Don't prevent default to allow RouterLink to work
  }

  /**
   * Check if current user has liked an article
   */
  hasLikedArticle(article: Article): boolean {
    const userId = this.currentUserId();
    if (!userId || !article.likes || article.likes.length === 0) {
      return false;
    }
    return article.likes.includes(userId);
  }

  /**
   * Toggle like on an article (prevents navigation when clicking like button)
   */
  toggleArticleLike(event: Event, article: Article): void {
    event.preventDefault();
    event.stopPropagation();

    if (!this.isAuthenticated()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    const currentUserId = this.currentUserId();
    if (!currentUserId) {
      console.error('Cannot like article: User ID not available');
      return;
    }

    const hasLiked = this.hasLikedArticle(article);

    this.articleService.toggleLike(article.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Update article likes locally in the store
          const currentArticles = this.articles();
          const updatedArticles = currentArticles.map(a => {
            if (a.id === article.id) {
              const currentLikes = a.likes || [];
              let updatedLikes: string[];
              
              if (hasLiked) {
                updatedLikes = currentLikes.filter(likeId => likeId !== currentUserId);
              } else {
                if (!currentLikes.includes(currentUserId)) {
                  updatedLikes = [...currentLikes, currentUserId];
                } else {
                  updatedLikes = currentLikes;
                }
              }

              return {
                ...a,
                likesCount: response.likes,
                likes: updatedLikes
              };
            }
            return a;
          });
          
          // Dispatch action to update articles in store
          this.store.dispatch(ArticleActions.loadArticlesSuccess({
            articles: updatedArticles,
            pagination: this.pagination() || { page: 1, limit: 10, total: 0, pages: 0 }
          }));
        },
        error: (error) => {
          console.error('Error toggling article like:', error);
        }
      });
  }
}

