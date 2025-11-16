import { ChangeDetectionStrategy, Component, EventEmitter, Input, Output, signal, OnChanges } from '@angular/core';
import { CommonModule, DatePipe } from '@angular/common';
import { ReactiveFormsModule, FormGroup } from '@angular/forms';

import { Comment } from '../../models/comment.model';

@Component({
  selector: 'app-comment',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, DatePipe, CommentComponent],
  templateUrl: './comment.component.html',
  styleUrl: './comment.component.scss',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class CommentComponent implements OnChanges {
  @Input({ required: true }) comment!: Comment;
  @Input() depth: number = 0;
  @Input() replyingTo: Comment | null = null;
  @Input() editingComment: Comment | null = null;
  @Input() replyForm!: FormGroup;
  @Input() editForm!: FormGroup;
  @Input() currentUserId: string | null = null;

  @Output() reply = new EventEmitter<Comment>();
  @Output() cancelReply = new EventEmitter<void>();
  @Output() postReply = new EventEmitter<Comment>();
  @Output() edit = new EventEmitter<Comment>();
  @Output() cancelEdit = new EventEmitter<void>();
  @Output() saveEdit = new EventEmitter<Comment>();
  @Output() delete = new EventEmitter<Comment>();
  @Output() like = new EventEmitter<Comment>();

  readonly maxDepth = 3;
  readonly isReplying = signal(false);
  readonly isEditing = signal(false);

  ngOnChanges(): void {
    this.isReplying.set(this.replyingTo?._id === this.comment._id);
    this.isEditing.set(this.editingComment?._id === this.comment._id);
  }

  onReply(): void {
    this.reply.emit(this.comment);
  }

  onCancelReply(): void {
    this.cancelReply.emit();
  }

  onPostReply(): void {
    if (this.replyForm.valid) {
      this.postReply.emit(this.comment);
    }
  }

  onEdit(): void {
    this.edit.emit(this.comment);
  }

  onCancelEdit(): void {
    this.cancelEdit.emit();
  }

  onSaveEdit(): void {
    if (this.editForm.valid) {
      this.saveEdit.emit(this.comment);
    }
  }

  onDelete(): void {
    this.delete.emit(this.comment);
  }

  onLike(): void {
    this.like.emit(this.comment);
  }

  trackByCommentId(_index: number, comment: Comment): string {
    return comment._id;
  }

  canReply(): boolean {
    return this.depth < this.maxDepth;
  }

  getReplies(): Comment[] {
    return this.comment.replies || [];
  }

  getIndent(): number {
    return Math.min(this.depth * 40, 120);
  }

  getAvatarUrl(avatar: string | null | undefined): string {
    // Return default avatar if avatar is null, undefined, or empty
    if (!avatar || avatar.trim().length === 0) {
      return 'assets/images/default-avatar.svg';
    }
    return avatar;
  }

  onAvatarError(event: Event): void {
    // If avatar image fails to load, set it to default avatar
    const img = event.target as HTMLImageElement;
    if (img && img.src !== 'assets/images/default-avatar.svg') {
      img.src = 'assets/images/default-avatar.svg';
    }
  }

  /**
   * Check if current user is the author of this comment
   */
  isAuthor(): boolean {
    if (!this.currentUserId || !this.comment.author) {
      return false;
    }
    
    // Check if current user ID matches the comment author ID
    return this.comment.author._id === this.currentUserId;
  }

  /**
   * Check if current user has liked this comment
   */
  hasLiked(): boolean {
    if (!this.currentUserId || !this.comment.likes || this.comment.likes.length === 0) {
      return false;
    }
    
    // Check if current user ID is in the likes array
    return this.comment.likes.includes(this.currentUserId);
  }

  /**
   * Get the count of likes
   */
  getLikesCount(): number {
    return this.comment.likes?.length || 0;
  }
}

