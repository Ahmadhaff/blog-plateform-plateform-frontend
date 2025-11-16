import { ActionReducerMap } from '@ngrx/store';

import { ArticleState, articleReducer } from './article/article.reducer';

export interface AppState {
  articles: ArticleState;
}

export const reducers: ActionReducerMap<AppState> = {
  articles: articleReducer
};
