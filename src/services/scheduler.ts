// src/services/scheduler.ts
// スケジュール済み投稿を実行するジョブロジック
// /api/cron から呼ばれる（or node-cron でセルフホスト時に直接呼ぶ）
// OAuth 1.0a 認証: 環境変数からトークンを取得（DB保存トークン不要）

import { prisma } from "@/src/lib/prisma";
import { postTweet } from "./x-api/tweet";
import { withRetry } from "@/src/lib/rate-limit";

const MAX_RETRIES = 3;

// ─── 公開: 定期実行エントリポイント ──────────────────────

export interface SchedulerResult {
  processed: number;
  succeeded: number;
  failed: number;
  skipped: number;
}

/**
 * scheduled_at が現在以前の SCHEDULED 投稿を取得して投稿する
 */
export async function runScheduledJobs(): Promise<SchedulerResult> {
  const now = new Date();

  const pendingPosts = await prisma.post.findMany({
    where: {
      status: "SCHEDULED",
      scheduledAt: { lte: now },
    },
    include: { account: true },
    orderBy: { scheduledAt: "asc" },
  });

  const result: SchedulerResult = {
    processed: pendingPosts.length,
    succeeded: 0,
    failed: 0,
    skipped: 0,
  };

  for (const post of pendingPosts) {
    const publishResult = await publishPost(post.id);
    if (publishResult.success) {
      result.succeeded++;
    } else {
      result.failed++;
    }
  }

  return result;
}

// ─── 公開: 単一投稿を実行 ─────────────────────────────────

export interface PublishResult {
  success: boolean;
  tweetId?: string;
  error?: string;
}

/**
 * 指定した postId の投稿を X API に送信する
 * OAuth 1.0a: 環境変数のトークンを使用（トークンリフレッシュ不要）
 */
export async function publishPost(postId: string): Promise<PublishResult> {
  const post = await prisma.post.findUnique({
    where: { id: postId },
    include: { account: true },
  });

  if (!post) return { success: false, error: "Post not found" };
  if (!post.account) return { success: false, error: "Account not found" };

  // PUBLISHING 状態にして二重実行を防止
  await prisma.post.update({
    where: { id: postId },
    data: { status: "PUBLISHING" },
  });

  let retryCount = 0;

  try {
    // OAuth 1.0a: 環境変数から直接トークンを使うため、accessToken引数は "oauth1a" とする
    const tweetId = await withRetry(
      () =>
        postTweet("oauth1a", {
          text: post.content,
          ...(post.mediaUrls.length > 0
            ? { media: { media_ids: post.mediaUrls } }
            : {}),
        }),
      { maxRetries: MAX_RETRIES }
    );

    // 成功
    await prisma.$transaction([
      prisma.post.update({
        where: { id: postId },
        data: { status: "PUBLISHED" },
      }),
      prisma.postLog.create({
        data: {
          postId,
          accountId: post.accountId,
          status: "SUCCESS",
          xTweetId: tweetId,
          retryCount,
        },
      }),
    ]);

    console.log(`[scheduler] Published post ${postId} → tweet ${tweetId}`);
    return { success: true, tweetId };
  } catch (err: unknown) {
    const errorCode = extractErrorCode(err);
    const errorBody = extractErrorBody(err);

    // 最終失敗
    await prisma.$transaction([
      prisma.post.update({
        where: { id: postId },
        data: { status: "FAILED" },
      }),
      prisma.postLog.create({
        data: {
          postId,
          accountId: post.accountId,
          status: "FAILED",
          errorCode,
          errorBody,
          retryCount,
        },
      }),
    ]);

    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`[scheduler] Failed post ${postId}:`, errorMsg);
    return { success: false, error: errorMsg };
  }
}

// ─── Private helpers ──────────────────────────────────────

function extractErrorCode(err: unknown): string | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    typeof (err as { response?: { status?: unknown } }).response?.status ===
      "number"
  ) {
    return String((err as { response: { status: number } }).response.status);
  }
  // fetch ベースのエラーからステータスを抽出
  if (err instanceof Error) {
    const match = err.message.match(/\((\d{3})\)/);
    if (match) return match[1];
  }
  return null;
}

function extractErrorBody(err: unknown): string | null {
  if (
    typeof err === "object" &&
    err !== null &&
    "response" in err &&
    (err as { response?: { data?: unknown } }).response?.data !== undefined
  ) {
    try {
      return JSON.stringify(
        (err as { response: { data: unknown } }).response.data
      );
    } catch {
      return null;
    }
  }
  return err instanceof Error ? err.message : null;
}
