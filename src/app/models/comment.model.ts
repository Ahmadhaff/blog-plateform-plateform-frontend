export interface CommentAuthor {
  _id: string;
  username: string;
  avatar?: string;
}

export interface Comment {
  _id: string;
  content: string;
  author: CommentAuthor;
  article: string;
  parentComment?: string | null;
  likes: string[];
  isDeleted: boolean;
  createdAt: string;
  updatedAt: string;
  replies?: Comment[];
}

export interface CommentResponse {
  comments: Comment[];
}

export interface CreateCommentRequest {
  content: string;
  articleId: string;
  parentCommentId?: string;
}

export interface UpdateCommentRequest {
  content: string;
}

export interface LikeResponse {
  message: string;
  likes: number;
}

export interface NewCommentEvent {
  comment: Comment;
  parentCommentId: string | null;
}

export interface UserTyping {
  userId: string;
  username: string;
  isTyping: boolean;
}

export interface CommentLikedEvent {
  commentId: string;
  likes: number;
  likesArray: string[];
  isLiked: boolean;
  userId: string;
}

export interface CommentUpdatedEvent {
  commentId: string;
  comment: Comment;
}

export interface CommentDeletedEvent {
  commentId: string;
}

