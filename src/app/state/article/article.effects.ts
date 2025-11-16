import { inject, Injectable } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { catchError, map, of, switchMap } from 'rxjs';

import { ArticleService } from '../../services/article.service';
import { ArticleActions } from './article.actions';

@Injectable()
export class ArticleEffects {
  private readonly actions$ = inject(Actions);
  private readonly articleService = inject(ArticleService);

  loadArticles$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ArticleActions.loadArticles),
      switchMap(({ page = 1, limit = 10, append = false }) =>
        this.articleService.getArticles({ page, limit }).pipe(
          map((response) => ArticleActions.loadArticlesSuccess({
            articles: response.articles,
            pagination: response.pagination,
            append
          })),
          catchError((error) => of(ArticleActions.loadArticlesFailure({
            error: error?.error?.error || 'Failed to load articles'
          })))
        )
      )
    )
  );
}
