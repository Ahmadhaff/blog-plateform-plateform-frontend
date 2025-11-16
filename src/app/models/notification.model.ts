export interface Notification {
  _id: string;
  id?: string; // For compatibility with socket events
  type: 'new_article' | 'new_comment' | 'comment_reply' | 'article_liked' | 'comment_liked';
  title: string;
  message: string;
  data?: {
    articleId?: string;
    articleTitle?: string;
    authorId?: string;
    authorUsername?: string;
    commentId?: string;
  };
  read: boolean;
  readAt?: string;
  createdAt: string;
  articleId?: string; // For easy navigation
}

export interface NotificationResponse {
  notifications: Notification[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
  };
}

export interface NotificationCountResponse {
  count: number;
}

export interface NewNotificationEvent {
  id: string;
  type: string;
  title: string;
  message: string;
  data?: any;
  read: boolean;
  createdAt: string;
  articleId?: string;
  commentId?: string;
}

