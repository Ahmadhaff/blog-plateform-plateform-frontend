import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Article, PaginationMeta } from '../../models/article.model';

export const ArticleActions = createActionGroup({
  source: 'Article API',
  events: {
    'Load Articles': emptyProps(),
    'Load Articles Success': props<{ articles: Article[]; pagination: PaginationMeta }>(),
    'Load Articles Failure': props<{ error: string }>()
  }
});
