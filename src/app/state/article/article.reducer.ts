import { createFeature, createReducer, on } from '@ngrx/store';

import { Article, PaginationMeta } from '../../models/article.model';
import { ArticleActions } from './article.actions';

export interface ArticleState {
  articles: Article[];
  pagination: PaginationMeta | null;
  loading: boolean;
  error: string | null;
}

export const initialState: ArticleState = {
  articles: [],
  pagination: null,
  loading: false,
  error: null
};

const reducer = createReducer(
  initialState,
  on(ArticleActions.loadArticles, (state) => ({
    ...state,
    loading: true,
    error: null
  })),
  on(ArticleActions.loadArticlesSuccess, (state, { articles, pagination }) => ({
    ...state,
    articles,
    pagination,
    loading: false,
    error: null
  })),
  on(ArticleActions.loadArticlesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
    articles: []
  }))
);

export const articleFeature = createFeature({
  name: 'articles',
  reducer
});

export const articleReducer = articleFeature.reducer;
export const {
  selectArticles,
  selectPagination,
  selectLoading,
  selectError
} = articleFeature;
