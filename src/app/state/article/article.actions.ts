import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Article, PaginationMeta } from '../../models/article.model';

export const ArticleActions = createActionGroup({
  source: 'Article API',
  events: {
    'Load Articles': props<{ page?: number; limit?: number; append?: boolean }>(),
    'Load Articles Success': props<{ articles: Article[]; pagination: PaginationMeta; append?: boolean }>(),
    'Load Articles Failure': props<{ error: string }>()
  }
});
