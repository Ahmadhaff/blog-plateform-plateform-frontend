export interface ArticleAuthor {
  id: string;
  username?: string;
  avatar?: string;
  role?: string;
}

export interface Article {
  id: string;
  title: string;
  content: string;
  tags: string[];
  status: 'draft' | 'published' | 'archived';
  views: number;
  likesCount: number;
  likes?: string[]; // Array of user IDs who liked the article
  commentCount: number;
  author: ArticleAuthor | null;
  imageUrl: string | null;
  createdAt?: string;
  updatedAt?: string;
}

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface ArticlesResponse {
  articles: Article[];
  pagination: PaginationMeta;
}

export interface ArticleLikedEvent {
  articleId: string;
  likes: number;
  likesArray: string[];
  isLiked: boolean;
  userId: string;
}

