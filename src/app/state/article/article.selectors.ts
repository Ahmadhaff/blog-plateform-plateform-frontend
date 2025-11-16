import { createSelector } from '@ngrx/store';
import { AppState } from '../app.reducers';

const selectArticleState = (state: AppState) => state.articles;

export const selectArticleList = createSelector(selectArticleState, (state) => state.articles);
export const selectArticleLoading = createSelector(selectArticleState, (state) => state.loading);
export const selectArticleError = createSelector(selectArticleState, (state) => state.error);
export const selectArticlePagination = createSelector(selectArticleState, (state) => state.pagination);
