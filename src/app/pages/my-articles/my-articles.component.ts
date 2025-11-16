import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';

import { ArticleService } from '../../services/article.service';
import { AuthService } from '../../services/auth.service';
import { Article, ArticlesResponse } from '../../models/article.model';

@Component({
  selector: 'app-my-articles',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, RouterLink],
  templateUrl: './my-articles.component.html',
  styleUrl: './my-articles.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MyArticlesComponent implements OnInit {
  private readonly articleService = inject(ArticleService);
  private readonly authService = inject(AuthService);
  private readonly router = inject(Router);
  private readonly fb = inject(FormBuilder);

  readonly articles = signal<Article[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly editingArticle = signal<Article | null>(null);
  readonly creatingArticle = signal<boolean>(false);
  readonly pagination = signal<any>(null);

  editForm: FormGroup;
  createForm: FormGroup;

  constructor() {
    this.editForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      content: ['', [Validators.required]],
      tags: ['', [Validators.required]],
      status: ['draft', [Validators.required]],
      image: [null]
    });

    this.createForm = this.fb.group({
      title: ['', [Validators.required, Validators.maxLength(200)]],
      content: ['', [Validators.required]],
      tags: ['', [Validators.required]],
      status: ['draft', [Validators.required]],
      image: [null, [Validators.required]] // Image is required for new articles
    });
  }

  ngOnInit(): void {
    // Check if user is authenticated and has the right role
    if (!this.authService.isAuthenticated()) {
      this.router.navigate(['/login']);
      return;
    }

    const userStr = localStorage.getItem('user');
    if (!userStr) {
      this.router.navigate(['/']);
      return;
    }

    try {
      const user = JSON.parse(userStr);
      const allowedRoles = ['Rédacteur', 'Éditeur', 'Admin'];
      if (!user || !allowedRoles.includes(user.role)) {
        this.router.navigate(['/']);
        return;
      }
    } catch (e) {
      console.error('Error parsing user:', e);
      this.router.navigate(['/']);
      return;
    }

    this.loadMyArticles();
  }

  loadMyArticles(): void {
    this.loading.set(true);
    this.error.set(null);

    this.articleService.getMyArticles()
      .subscribe({
        next: (response: ArticlesResponse) => {
          this.articles.set(response.articles);
          this.pagination.set(response.pagination);
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Error loading my articles:', error);
          this.error.set(error.error?.error || 'Failed to load articles');
          this.loading.set(false);
        }
      });
  }

  startEdit(article: Article): void {
    this.editingArticle.set(article);
    this.editForm.patchValue({
      title: article.title,
      content: article.content,
      tags: Array.isArray(article.tags) ? article.tags.join(', ') : '',
      status: article.status,
      image: null
    });
  }

  cancelEdit(): void {
    this.editingArticle.set(null);
    this.editForm.reset({
      status: 'draft'
    });
  }

  onImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.editForm.patchValue({ image: file });
    }
  }

  saveEdit(): void {
    if (this.editForm.invalid) {
      this.editForm.markAllAsTouched();
      return;
    }

    const article = this.editingArticle();
    if (!article) {
      return;
    }

    const formValue = this.editForm.value;
    const formData = new FormData();
    
    formData.append('title', formValue.title);
    formData.append('content', formValue.content);
    
    // Convert comma-separated tags to array
    const tags = formValue.tags
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);
    formData.append('tags', JSON.stringify(tags));
    
    formData.append('status', formValue.status);
    
    if (formValue.image) {
      formData.append('image', formValue.image);
    }

    this.loading.set(true);
    this.error.set(null);

    this.articleService.updateArticle(article.id, formData)
      .subscribe({
        next: (response) => {
          // Update the article in the list
          this.articles.update(articles => 
            articles.map(a => a.id === article.id ? response.article : a)
          );
          this.cancelEdit();
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Error updating article:', error);
          this.error.set(error.error?.error || 'Failed to update article');
          this.loading.set(false);
        }
      });
  }

  startCreate(): void {
    this.creatingArticle.set(true);
    this.editingArticle.set(null); // Close any open edit form
    this.createForm.reset({
      status: 'draft'
    });
  }

  cancelCreate(): void {
    this.creatingArticle.set(false);
    this.createForm.reset({
      status: 'draft'
    });
  }

  onCreateImageSelected(event: Event): void {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      this.createForm.patchValue({ image: file });
    }
  }

  saveCreate(): void {
    if (this.createForm.invalid) {
      this.createForm.markAllAsTouched();
      return;
    }

    const formValue = this.createForm.value;
    const formData = new FormData();
    
    formData.append('title', formValue.title);
    formData.append('content', formValue.content);
    
    // Convert comma-separated tags to array
    const tags = formValue.tags
      .split(',')
      .map((tag: string) => tag.trim())
      .filter((tag: string) => tag.length > 0);
    formData.append('tags', JSON.stringify(tags));
    
    formData.append('status', formValue.status);
    
    if (formValue.image) {
      formData.append('image', formValue.image);
    }

    this.loading.set(true);
    this.error.set(null);

    this.articleService.createArticle(formData)
      .subscribe({
        next: (response) => {
          // Add the new article to the list
          this.articles.update(articles => [response.article, ...articles]);
          this.cancelCreate();
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Error creating article:', error);
          this.error.set(error.error?.error || 'Failed to create article');
          this.loading.set(false);
        }
      });
  }

  deleteArticle(article: Article): void {
    if (!confirm(`Are you sure you want to delete "${article.title}"? This action cannot be undone.`)) {
      return;
    }

    this.loading.set(true);
    this.error.set(null);

    this.articleService.deleteArticle(article.id)
      .subscribe({
        next: () => {
          // Remove the article from the list
          this.articles.update(articles => 
            articles.filter(a => a.id !== article.id)
          );
          this.loading.set(false);
        },
        error: (error) => {
          console.error('Error deleting article:', error);
          this.error.set(error.error?.error || 'Failed to delete article');
          this.loading.set(false);
        }
      });
  }

  trackByArticleId(_index: number, article: Article): string {
    return article.id;
  }
}

