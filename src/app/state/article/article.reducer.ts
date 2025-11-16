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
  on(ArticleActions.loadArticlesSuccess, (state, { articles, pagination, append }) => ({
    ...state,
    // If append is true, append new articles to existing ones, otherwise replace
    articles: append ? [...state.articles, ...articles] : articles,
    pagination,
    loading: false,
    error: null
  })),
  on(ArticleActions.loadArticlesFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
    // Only clear articles if this was not an append operation
    articles: state.loading ? [] : state.articles
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
