// src/types/index.ts

import type { PostStatus, LogStatus } from "@prisma/client";

// ─── Re-export Prisma enums ───────────────────────────────
export type { PostStatus, LogStatus };

// ─── API レスポンス共通型 ─────────────────────────────────
export interface ApiResponse<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

// ─── Post ─────────────────────────────────────────────────
export interface PostDto {
  id: string;
  content: string;
  mediaUrls: string[];
  scheduledAt: string | null;  // ISO8601
  status: PostStatus;
  sortOrder: number;
  batchId: string | null;
  category: string | null;
  purpose: string | null;
  priority: number;
  accountId: string;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePostsInput {
  rawText: string;        // まとめ貼り付けテキスト
  accountId: string;
  batchId?: string;
}

export interface UpdatePostInput {
  content?: string;
  scheduledAt?: string | null;
  status?: PostStatus;
  sortOrder?: number;
  mediaUrls?: string[];
}

// ─── Account ──────────────────────────────────────────────
export interface AccountDto {
  id: string;
  username: string;
  displayName: string;
  profileImage: string | null;
  isActive: boolean;
  tokenExpiresAt: string | null;
  createdAt: string;
}

// ─── PostLog ──────────────────────────────────────────────
export interface PostLogDto {
  id: string;
  postId: string;
  accountId: string;
  status: LogStatus;
  xTweetId: string | null;
  errorCode: string | null;
  errorBody: string | null;
  retryCount: number;
  createdAt: string;
  // join
  postContent?: string;
  accountUsername?: string;
}

// ─── Post splitter ────────────────────────────────────────
export interface SplitResult {
  items: SplitItem[];
  count: number;
  warnings: string[];
}

export interface SplitItem {
  content: string;
  charCount: number;
  isOverLimit: boolean;  // 280文字超過
}

// ─── X API ────────────────────────────────────────────────
export interface XTweetResponse {
  data: {
    id: string;
    text: string;
  };
}

export interface XUserResponse {
  data: {
    id: string;
    name: string;
    username: string;
    profile_image_url?: string;
  };
}
