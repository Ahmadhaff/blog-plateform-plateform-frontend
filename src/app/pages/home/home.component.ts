import { ChangeDetectionStrategy, Component, OnInit, OnDestroy, inject, signal, ElementRef, ViewChild, AfterViewInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { Store } from '@ngrx/store';
import { Subject, takeUntil, distinctUntilChanged, fromEvent, debounceTime } from 'rxjs';

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
export class HomeComponent implements OnInit, AfterViewInit, OnDestroy {
  private readonly store = inject(Store);
  private readonly router = inject(Router);
  private readonly articleService = inject(ArticleService);
  private readonly authService = inject(AuthService);
  private readonly socketService = inject(SocketService);
  private readonly destroy$ = new Subject<void>();
  private readonly elementRef = inject(ElementRef);

  @ViewChild('loadMoreTrigger', { static: false }) loadMoreTrigger?: ElementRef<HTMLElement>;

  readonly articles = this.store.selectSignal(selectArticleList);
  readonly pagination = this.store.selectSignal(selectArticlePagination);
  readonly loading = this.store.selectSignal(selectArticleLoading);
  readonly error = this.store.selectSignal(selectArticleError);
  private readonly imageErrors = signal<ReadonlySet<string>>(new Set());
  readonly isAuthenticated = signal<boolean>(false);
  readonly loadingMore = signal<boolean>(false);
  readonly showScrollToTop = signal<boolean>(false);
  
  // Pagination constants
  private readonly INITIAL_LIMIT = 10;
  private currentPage = signal<number>(1);
  private isLoadingMore = false;
  private observer?: IntersectionObserver;
  private readonly SCROLL_THRESHOLD = 400; // Show button after scrolling 400px
  
  // Background particles for visual effect
  readonly particles = Array.from({ length: 12 }, (_, i) => ({
    id: i,
    left: Math.random() * 100,
    top: Math.random() * 100,
    delay: Math.random() * 3
  }));
  readonly currentUserId = signal<string | null>(null);

  ngOnInit(): void {
    // Load first page of articles
    this.store.dispatch(ArticleActions.loadArticles({ 
      page: 1, 
      limit: this.INITIAL_LIMIT,
      append: false 
    }));
    
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

      // Don't connect socket here - app.component.ts manages socket connections globally
      // Socket connection is handled by app.component.ts to prevent duplicates
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
          pagination: this.pagination() || { page: 1, limit: 10, total: 0, pages: 0 },
          append: false
        }));
      });

    // Set up scroll listener to show/hide scroll-to-top button
    this.setupScrollListener();
    
    // Check initial scroll position
    this.checkScrollPosition();
  }

  /**
   * Check current scroll position (for when component loads while already scrolled)
   */
  private checkScrollPosition(): void {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    this.showScrollToTop.set(scrollY > this.SCROLL_THRESHOLD);
  }

  ngAfterViewInit(): void {
    // Set up intersection observer for infinite scrolling
    this.setupIntersectionObserver();

    // Watch for loading state changes to update current page and reset flags
    this.store.select(selectArticleLoading)
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe(loading => {
        if (!loading) {
          // Update current page from pagination when loading completes
          const pagination = this.pagination();
          if (pagination && pagination.page !== this.currentPage()) {
            this.currentPage.set(pagination.page);
          }
          // Reset loading flags when loading completes
          if (this.isLoadingMore) {
            this.isLoadingMore = false;
            this.loadingMore.set(false);
          }
        }
      });

    // Also watch pagination changes to update current page
    this.store.select(selectArticlePagination)
      .pipe(
        takeUntil(this.destroy$),
        distinctUntilChanged()
      )
      .subscribe(pagination => {
        if (pagination && pagination.page !== this.currentPage()) {
          this.currentPage.set(pagination.page);
        }
        // Re-setup observer when pagination changes (articles loaded)
        // This ensures the observer is attached to the trigger after new articles are added
        setTimeout(() => {
          this.setupIntersectionObserver();
        }, 200);
      });
  }

  ngOnDestroy(): void {
    // Clean up intersection observer
    if (this.observer) {
      this.observer.disconnect();
    }
    this.destroy$.next();
    this.destroy$.complete();
  }

  /**
   * Set up scroll listener to detect scroll position
   */
  private setupScrollListener(): void {
    fromEvent(window, 'scroll')
      .pipe(
        debounceTime(10), // Debounce scroll events for performance
        takeUntil(this.destroy$)
      )
      .subscribe(() => {
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        this.showScrollToTop.set(scrollY > this.SCROLL_THRESHOLD);
      });
  }

  /**
   * Refresh articles to check for new ones (user scrolls manually)
   */
  refreshArticles(): void {
    // Reset to page 1 and reload articles (to check for new articles)
    this.currentPage.set(1);
    this.store.dispatch(ArticleActions.loadArticles({
      page: 1,
      limit: this.INITIAL_LIMIT,
      append: false // Replace existing articles, don't append
    }));
  }

  /**
   * Set up Intersection Observer to detect when load more trigger is visible
   */
  private setupIntersectionObserver(): void {
    if (typeof IntersectionObserver === 'undefined') {
      // Fallback for browsers without IntersectionObserver
      return;
    }

    // Disconnect existing observer if any
    if (this.observer) {
      this.observer.disconnect();
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !this.loading() && !this.loadingMore() && !this.isLoadingMore && this.hasMoreArticles()) {
            this.loadMoreArticles();
          }
        });
      },
      {
        rootMargin: '200px' // Start loading 200px before reaching the trigger
      }
    );

    // Observe the trigger element when it's available
    // Use multiple attempts to catch it after view initialization
    const observeTrigger = () => {
      if (this.loadMoreTrigger?.nativeElement) {
        this.observer?.observe(this.loadMoreTrigger.nativeElement);
      } else {
        // Retry after a short delay if element not yet available
        setTimeout(observeTrigger, 100);
      }
    };
    
    observeTrigger();
  }

  /**
   * Load more articles (next page)
   */
  loadMoreArticles(): void {
    const pagination = this.pagination();
    if (!pagination) {
      return;
    }

    // Check if there are more pages to load
    if (this.currentPage() >= pagination.pages) {
      return; // No more pages to load
    }

    if (this.isLoadingMore || this.loading()) {
      return; // Already loading
    }

    this.isLoadingMore = true;
    this.loadingMore.set(true);

    const nextPage = this.currentPage() + 1;

    this.store.dispatch(ArticleActions.loadArticles({
      page: nextPage,
      limit: this.INITIAL_LIMIT,
      append: true // Append to existing articles
    }));
  }

  /**
   * Check if there are more articles to load
   */
  hasMoreArticles(): boolean {
    const pagination = this.pagination();
    if (!pagination) {
      return false;
    }
    return this.currentPage() < pagination.pages;
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
            pagination: this.pagination() || { page: 1, limit: 10, total: 0, pages: 0 },
            append: false
          }));
        },
        error: (error) => {
          console.error('Error toggling article like:', error);
        }
      });
  }
}

