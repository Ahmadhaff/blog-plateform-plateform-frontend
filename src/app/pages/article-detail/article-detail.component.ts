import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Subject, takeUntil, tap } from 'rxjs';

import { ArticleService } from '../../services/article.service';
import { CommentService } from '../../services/comment.service';
import { SocketService } from '../../services/socket.service';
import { AuthService } from '../../services/auth.service';
import { Article, ArticleLikedEvent } from '../../models/article.model';
import { Comment, NewCommentEvent, UserTyping, CommentLikedEvent, CommentUpdatedEvent, CommentDeletedEvent } from '../../models/comment.model';
import { CommentComponent } from '../../components/comment/comment.component';

@Component({
  selector: 'app-article-detail',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, CommentComponent, RouterLink],
  templateUrl: './article-detail.component.html',
  styleUrl: './article-detail.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ArticleDetailComponent implements OnInit, OnDestroy {
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);
  private readonly articleService = inject(ArticleService);
  private readonly commentService = inject(CommentService);
  private readonly socketService = inject(SocketService);
  private readonly authService = inject(AuthService);
  private readonly destroy$ = new Subject<void>();

  readonly article = signal<Article | null>(null);
  readonly comments = signal<Comment[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly typingUsers = signal<string[]>([]);
  readonly replyingTo = signal<Comment | null>(null);
  readonly editingComment = signal<Comment | null>(null);
  readonly isAuthenticated = signal<boolean>(false);
  readonly currentUserId = signal<string | null>(null);
  
  commentForm: FormGroup;
  replyForm: FormGroup = this.fb.group({
    content: ['', [Validators.required, Validators.maxLength(1000)]]
  });
  editForm: FormGroup = this.fb.group({
    content: ['', [Validators.required, Validators.maxLength(1000)]]
  });

  private typingTimeout: any;
  private articleIdValue: string = '';

  constructor() {
    this.commentForm = this.fb.group({
      content: ['', [Validators.required, Validators.maxLength(1000)]]
    });
  }

  ngOnInit(): void {
    // Subscribe to route params to handle navigation changes
    this.route.paramMap
      .pipe(
        takeUntil(this.destroy$),
        tap(params => {
          const articleId = params.get('id');
          if (!articleId) {
            this.router.navigate(['/']);
            return;
          }
          
          // Disconnect previous socket connection if any
          if (this.socketService.isConnected() && this.articleIdValue) {
            this.socketService.leaveArticle(this.articleIdValue);
            this.socketService.disconnect();
          }
          
          this.articleIdValue = articleId;
          this.loading.set(true);
          this.error.set(null);
          
          // Load article and comments
          this.loadArticle();
          this.loadComments();
          // Don't connect socket here - app.component.ts manages socket connections globally
          // Socket connection is handled by app.component.ts to prevent duplicates
          this.setupSocketListeners();
          
          // Check for commentId in query params or fragment after comments load
          this.route.queryParams.pipe(takeUntil(this.destroy$)).subscribe(queryParams => {
            if (queryParams['commentId']) {
              setTimeout(() => this.scrollToComment(queryParams['commentId']), 500);
            }
          });
          
          this.route.fragment.pipe(takeUntil(this.destroy$)).subscribe(fragment => {
            if (fragment && fragment.startsWith('comment-')) {
              const commentId = fragment.replace('comment-', '');
              setTimeout(() => this.scrollToComment(commentId), 500);
            }
          });
        })
      )
      .subscribe();
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }
    this.socketService.leaveArticle(this.articleIdValue);
    this.socketService.disconnect();
  }

  private loadArticle(): void {
    this.loading.set(true);
    
    // Load article (view incrementing is now handled via Socket.IO)
    this.articleService.getArticleById(this.articleIdValue)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.article.set(response.article);
          this.loading.set(false);
          
          // Try to emit view increment after article loads
          // This will be handled by connectSocket if socket is not ready yet
          this.emitViewIncrementIfReady();
        },
        error: (error) => {
          this.error.set(error.error?.error || 'Failed to load article');
          this.loading.set(false);
        }
      });
  }

  /**
   * Emit view increment if socket is connected and user is authenticated
   */
  private emitViewIncrementIfReady(): void {
    if (!this.isAuthenticated() || !this.articleIdValue) {
      return;
    }

    // Check if socket is connected
    if (this.socketService.isConnected()) {
      // Ensure we're in the article room
      this.socketService.joinArticle(this.articleIdValue);
      
      // Small delay to ensure we're in the room before emitting
      setTimeout(() => {
        if (this.socketService.isConnected() && this.articleIdValue) {
          this.socketService.incrementArticleView(this.articleIdValue);
        }
      }, 200);
    } else {
      // Socket not ready yet, connectSocket will handle emission after connection
    }
  }

  private loadComments(): void {
    this.commentService.getCommentsByArticle(this.articleIdValue)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.comments.set(response.comments || []);
          
          // After comments are loaded, check for commentId in URL and scroll to it
          setTimeout(() => {
            const queryParams = this.route.snapshot.queryParams;
            const fragment = this.route.snapshot.fragment;
            
            if (queryParams['commentId']) {
              this.scrollToComment(queryParams['commentId']);
            } else if (fragment && fragment.startsWith('comment-')) {
              const commentId = fragment.replace('comment-', '');
              this.scrollToComment(commentId);
            }
          }, 300);
        },
        error: (error) => {
          console.error('Error loading comments:', error);
        }
      });
  }

  private scrollToComment(commentId: string): void {
    // Try to find the comment element by ID
    const element = document.getElementById(`comment-${commentId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Add a highlight effect
      element.classList.add('comment-highlight');
      setTimeout(() => {
        element.classList.remove('comment-highlight');
      }, 2000);
    }
  }

  private connectSocket(): void {
    // Check authentication using AuthService
    const isAuth = this.authService.isAuthenticated();
    this.isAuthenticated.set(isAuth);
    
    // Get current user ID if authenticated
    if (isAuth) {
      // Get user from localStorage
      const userStr = localStorage.getItem('user');
      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          this.currentUserId.set(user?._id || null);
        } catch (e) {
          console.error('Error parsing user from localStorage:', e);
          this.currentUserId.set(null);
        }
      }
      
      // Don't connect socket here - app.component.ts manages socket connections globally
      // Just wait for socket to be ready, then join article room
      // Use a small delay to ensure socket is ready, then join article room
      setTimeout(() => {
        if (this.socketService.isConnected() && this.articleIdValue) {
          this.socketService.joinArticle(this.articleIdValue);
            this.socketService.joinUserRoom();
            
            // After joining the room, emit view increment if article is loaded
            // Use emitViewIncrementIfReady to ensure proper timing
            setTimeout(() => {
              this.emitViewIncrementIfReady();
            }, 300);
          }
        }, 300);
      }
    }
  }

  private setupSocketListeners(): void {
    // Listen for new comments
    this.socketService.onNewComment()
      .pipe(takeUntil(this.destroy$))
      .subscribe((event: NewCommentEvent) => {
        // Verify the comment belongs to the current article
        if (event.comment.article === this.articleIdValue || 
            event.comment.article?.toString() === this.articleIdValue) {
          
            if (event.parentCommentId) {
            // This is a reply - add to replies of parent comment
            this.addReplyToComment(event.parentCommentId, event.comment);
            // Increment comment count (reply is still a comment)
            this.article.update(current => {
              if (current) {
                return { ...current, commentCount: (current.commentCount || 0) + 1 };
              }
              return current;
            });
          } else {
            // This is a root comment - add to root comments list
            // Check if comment already exists (prevent duplicates)
            const existingIndex = this.comments().findIndex(
              c => c._id === event.comment._id
            );
            
            if (existingIndex === -1) {
              this.comments.update(comments => [...comments, event.comment]);
              // Increment comment count
              this.article.update(current => {
                if (current) {
                  return { ...current, commentCount: (current.commentCount || 0) + 1 };
                }
                return current;
              });
            }
          }
        }
      });

    // Listen for typing indicators
    this.socketService.onUserTyping()
      .pipe(takeUntil(this.destroy$))
      .subscribe((data: UserTyping) => {
        if (data.isTyping) {
          this.typingUsers.update(users => {
            if (!users.includes(data.username)) {
              return [...users, data.username];
            }
            return users;
          });

          // Remove after 3 seconds
          setTimeout(() => {
            this.typingUsers.update(users => users.filter(u => u !== data.username));
          }, 3000);
        } else {
          this.typingUsers.update(users => users.filter(u => u !== data.username));
        }
      });

            // Listen for article view updates
            this.socketService.onArticleViewUpdated()
              .pipe(takeUntil(this.destroy$))
              .subscribe((data) => {
                if (data.articleId === this.articleIdValue) {
                  // Update article views in real-time
                  this.article.update(current => {
                    if (current) {
                      return { ...current, views: data.views };
                    }
                    return current;
                  });
                }
              });

            // Listen for comment liked events
            this.socketService.onCommentLiked()
              .pipe(takeUntil(this.destroy$))
              .subscribe((event: CommentLikedEvent) => {
                // Update the comment's likes in real-time
                this.updateCommentLikes(event.commentId, event.likes, event.likesArray);
              });

            // Listen for comment updated events
            this.socketService.onCommentUpdated()
              .pipe(takeUntil(this.destroy$))
              .subscribe((event: CommentUpdatedEvent) => {
                if (event.commentId && event.comment) {
                  this.updateCommentInList(event.commentId, event.comment);
                }
              });

            // Listen for comment deleted events
            this.socketService.onCommentDeleted()
              .pipe(takeUntil(this.destroy$))
              .subscribe((event: CommentDeletedEvent) => {
                if (event.commentId) {
                  this.removeCommentFromList(event.commentId);
                }
              });

            // Listen for article liked events
            this.socketService.onArticleLiked()
              .pipe(takeUntil(this.destroy$))
              .subscribe((event: ArticleLikedEvent) => {
                // Verify the event is for the current article
                if (event.articleId === this.articleIdValue) {
                  // Update article likes in real-time
                  this.article.update(current => {
                    if (current) {
                      return { 
                        ...current, 
                        likesCount: event.likes,
                        likes: event.likesArray
                      };
                    }
                    return current;
                  });
                }
              });
          }

  onCommentInput(): void {
    if (!this.socketService.isConnected()) {
      return;
    }

    // Debounce typing indicator
    if (this.typingTimeout) {
      clearTimeout(this.typingTimeout);
    }

    this.socketService.sendTypingStatus(this.articleIdValue, true);

    this.typingTimeout = setTimeout(() => {
      this.socketService.sendTypingStatus(this.articleIdValue, false);
    }, 3000);
  }

  postComment(): void {
    if (this.commentForm.invalid) {
      return;
    }

    // Check if user is authenticated
    if (!this.isAuthenticated()) {
      console.error('❌ Cannot post comment: User not authenticated');
      this.error.set('Please log in to post a comment');
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    // Verify token exists
    const token = this.authService.getToken();
    if (!token) {
      console.error('❌ Cannot post comment: Token missing');
      this.error.set('Authentication token is missing. Please log in again.');
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    // Verify token is not expired
    if (this.authService.isTokenExpired(token)) {
      // Interceptor will handle token refresh
    }

    const content = this.commentForm.get('content')?.value;
    
    // Clear any previous errors
    this.error.set(null);
    
    // Disable form while posting
    this.commentForm.disable();
    
    this.commentService.createComment(this.articleIdValue, content)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          // Reset form after successful post
          this.commentForm.reset();
          this.commentForm.enable();
          
          // The comment will be added via WebSocket event
          // So we don't need to manually add it here
          // This ensures all users (including the commenter) see it at the same time
        },
        error: (error) => {
          console.error('❌ Error posting comment:', error);
          console.error('Error details:', {
            status: error.status,
            statusText: error.statusText,
            error: error.error,
            url: error.url
          });
          
          // Handle 401 Unauthorized specifically
          if (error.status === 401) {
            // Check if token still exists (interceptor might have cleared it)
            const token = this.authService.getToken();
            const refreshToken = this.authService.getRefreshToken();
            
            if (!token && !refreshToken) {
              // Session was already cleared by interceptor
              this.error.set('Your session has expired. Please log in again.');
              setTimeout(() => {
                this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
              }, 2000);
            } else {
              // Token exists but still got 401 - might be invalid format or user not active
              const errorMessage = error.error?.error || 'Authentication failed. Please try again or log in again.';
              this.error.set(errorMessage);
              
              // Only logout if it's a clear session expiration
              if (error.error?.error?.includes('expired') || error.error?.error?.includes('Session')) {
                setTimeout(() => {
                  this.authService.logout();
                  this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
                }, 2000);
              }
            }
          } else {
            this.error.set(error.error?.error || error.error?.message || 'Failed to post comment');
          }
          
          this.commentForm.enable();
        }
      });
  }

  replyToComment(comment: Comment): void {
    this.replyingTo.set(comment);
    this.replyForm.reset();
  }

  cancelReply(): void {
    this.replyingTo.set(null);
    this.replyForm.reset();
  }

  postReply(parentComment: Comment): void {
    if (this.replyForm.invalid) {
      return;
    }

    const content = this.replyForm.get('content')?.value;
    this.commentService.createComment(this.articleIdValue, content, parentComment._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.cancelReply();
        },
        error: (error) => {
          this.error.set(error.error?.error || 'Failed to post reply');
        }
      });
  }

  startEdit(comment: Comment): void {
    this.editingComment.set(comment);
    this.editForm.patchValue({ content: comment.content });
  }

  cancelEdit(): void {
    this.editingComment.set(null);
    this.editForm.reset();
  }

  saveEdit(comment: Comment): void {
    if (this.editForm.invalid) {
      return;
    }

    const content = this.editForm.get('content')?.value;
    this.commentService.updateComment(comment._id, content)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          this.updateCommentInList(comment._id, response.comment);
          this.cancelEdit();
        },
        error: (error) => {
          this.error.set(error.error?.error || 'Failed to update comment');
        }
      });
  }

  deleteComment(comment: Comment): void {
    if (!confirm('Are you sure you want to delete this comment?')) {
      return;
    }

    this.commentService.deleteComment(comment._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: () => {
          this.removeCommentFromList(comment._id);
        },
        error: (error) => {
          this.error.set(error.error?.error || 'Failed to delete comment');
        }
      });
  }

  toggleLike(comment: Comment): void {
    if (!this.isAuthenticated()) {
      this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
      return;
    }

    const currentUserId = this.currentUserId();
    if (!currentUserId) {
      console.error('Cannot like comment: User ID not available');
      return;
    }

    // Check if current user has liked this comment
    const currentLikes = comment.likes || [];
    const hasLiked = currentLikes.includes(currentUserId);

    this.commentService.toggleLike(comment._id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Update likes count in comment
          const newLikesCount = response.likes;
          
          let updatedLikes: string[];
          if (hasLiked) {
            // User unliked - remove user ID from likes array
            updatedLikes = currentLikes.filter(likeId => likeId !== currentUserId);
          } else {
            // User liked - add user ID to likes array
            if (!currentLikes.includes(currentUserId)) {
              updatedLikes = [...currentLikes, currentUserId];
            } else {
              updatedLikes = currentLikes;
            }
          }
          
          // Ensure the array length matches the backend response
          // This handles edge cases where backend state might differ
          if (updatedLikes.length !== newLikesCount) {
            if (newLikesCount > updatedLikes.length && !hasLiked) {
              // Backend says more likes - ensure current user is included
              if (!updatedLikes.includes(currentUserId)) {
                updatedLikes.push(currentUserId);
              }
            } else if (newLikesCount < updatedLikes.length && hasLiked) {
              // Backend says fewer likes - ensure current user is removed
              updatedLikes = updatedLikes.filter(id => id !== currentUserId);
            }
          }
          
          this.updateCommentInList(comment._id, { likes: updatedLikes });
        },
        error: (error) => {
          console.error('Error toggling like:', error);
          this.error.set(error.error?.error || 'Failed to toggle like');
        }
      });
  }

  private addReplyToComment(parentCommentId: string, reply: Comment): void {
    const findAndAdd = (comments: Comment[]): Comment[] => {
      return comments.map(comment => {
        // Check if this is the parent comment
        if (comment._id === parentCommentId || 
            comment._id?.toString() === parentCommentId) {
          // Check if reply already exists
          const existingReplyIndex = (comment.replies || []).findIndex(
            r => r._id === reply._id || r._id?.toString() === reply._id?.toString()
          );
          
          if (existingReplyIndex === -1) {
            // Add reply to parent
            return {
              ...comment,
              replies: [...(comment.replies || []), reply]
            };
          } else {
            // Reply already exists, update it instead
            const updatedReplies = [...(comment.replies || [])];
            updatedReplies[existingReplyIndex] = reply;
            return {
              ...comment,
              replies: updatedReplies
            };
          }
        }
        
        // Recursively search in replies
        if (comment.replies && comment.replies.length > 0) {
          return {
            ...comment,
            replies: findAndAdd(comment.replies)
          };
        }
        
        return comment;
      });
    };

    this.comments.update(findAndAdd);
  }

  private updateCommentInList(commentId: string, updatedComment: Partial<Comment>): void {
    const findAndUpdate = (comments: Comment[]): Comment[] => {
      return comments.map(comment => {
        if (comment._id === commentId) {
          return { ...comment, ...updatedComment };
        }
        if (comment.replies) {
          return {
            ...comment,
            replies: findAndUpdate(comment.replies)
          };
        }
        return comment;
      });
    };

    this.comments.update(findAndUpdate);
  }

  private removeCommentFromList(commentId: string): void {
    // First, find and count the comment before removing it
    const allComments = this.comments();
    const findCommentAndCount = (comments: Comment[]): { comment: Comment | null, count: number } => {
      for (const comment of comments) {
        if (comment._id === commentId || comment._id?.toString() === commentId) {
          // Count this comment + all its replies
          let count = 1; // The comment itself
          if (comment.replies && comment.replies.length > 0) {
            count += this.countAllComments(comment.replies);
          }
          return { comment, count };
        }
        if (comment.replies && comment.replies.length > 0) {
          const found = findCommentAndCount(comment.replies);
          if (found.comment) {
            return found;
          }
        }
      }
      return { comment: null, count: 1 }; // If not found, assume it's a root comment (count = 1)
    };

    const { count: commentsToRemove } = findCommentAndCount(allComments);

    // Now remove the comment from the list
    const findAndRemove = (comments: Comment[]): Comment[] => {
      return comments
        .filter(comment => comment._id !== commentId && comment._id?.toString() !== commentId)
        .map(comment => {
          if (comment.replies) {
            return {
              ...comment,
              replies: findAndRemove(comment.replies)
            };
          }
          return comment;
        });
    };

    // Remove comment from list
    this.comments.update(findAndRemove);

    // Update article comment count
    this.article.update(current => {
      if (current) {
        const newCount = Math.max(0, (current.commentCount || 0) - commentsToRemove);
        return { ...current, commentCount: newCount };
      }
      return current;
    });
  }

  /**
   * Recursively count all comments including replies
   */
  private countAllComments(comments: Comment[]): number {
    let count = comments.length;
    for (const comment of comments) {
      if (comment.replies && comment.replies.length > 0) {
        count += this.countAllComments(comment.replies);
      }
    }
    return count;
  }

  /**
   * Update comment likes in real-time when received from WebSocket
   */
  private updateCommentLikes(commentId: string, likesCount: number, likesArray: string[]): void {
    const findAndUpdate = (comments: Comment[]): Comment[] => {
      return comments.map(comment => {
        if (comment._id === commentId) {
          return { 
            ...comment, 
            likes: likesArray,
            // Note: likes count is derived from likesArray.length, but we also have likesCount from event
          };
        }
        if (comment.replies && comment.replies.length > 0) {
          return {
            ...comment,
            replies: findAndUpdate(comment.replies)
          };
        }
        return comment;
      });
    };

    this.comments.update(findAndUpdate);
  }

  trackByCommentId(_index: number, comment: Comment): string {
    return comment._id;
  }

  isAuthor(comment: Comment): boolean {
    // This should check against current user ID from auth service
    // For now, returning false as placeholder
    return false;
  }

  hasLiked(comment: Comment): boolean {
    // This should check if current user ID is in comment.likes
    // For now, returning false as placeholder
    return false;
  }

  /**
   * Check if current user has liked the article
   */
  hasLikedArticle(): boolean {
    const currentArticle = this.article();
    const userId = this.currentUserId();
    
    if (!currentArticle || !userId || !currentArticle.likes || currentArticle.likes.length === 0) {
      return false;
    }
    
    return currentArticle.likes.includes(userId);
  }

  /**
   * Navigate to login page
   */
  navigateToLogin(): void {
    this.router.navigate(['/login'], { queryParams: { returnUrl: this.router.url } });
  }

  /**
   * Toggle like on the article
   */
  toggleArticleLike(): void {
    if (!this.isAuthenticated()) {
      this.navigateToLogin();
      return;
    }

    const currentArticle = this.article();
    const currentUserId = this.currentUserId();
    
    if (!currentArticle || !currentUserId) {
      console.error('Cannot like article: Article or User ID not available');
      return;
    }

    const hasLiked = this.hasLikedArticle();

    this.articleService.toggleLike(currentArticle.id)
      .pipe(takeUntil(this.destroy$))
      .subscribe({
        next: (response) => {
          // Update article likes locally
          // The real-time event will also update it, but this gives immediate feedback
          const currentLikes = currentArticle.likes || [];
          let updatedLikes: string[];
          
          if (hasLiked) {
            // User unliked - remove user ID from likes array
            updatedLikes = currentLikes.filter(likeId => likeId !== currentUserId);
          } else {
            // User liked - add user ID to likes array
            if (!currentLikes.includes(currentUserId)) {
              updatedLikes = [...currentLikes, currentUserId];
            } else {
              updatedLikes = currentLikes;
            }
          }

          this.article.update(current => {
            if (current) {
              return {
                ...current,
                likesCount: response.likes,
                likes: updatedLikes
              };
            }
            return current;
          });
        },
        error: (error) => {
          console.error('Error toggling article like:', error);
          this.error.set(error.error?.error || 'Failed to toggle like');
        }
      });
  }
}

