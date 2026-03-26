// src/services/x-api/tweet.ts
// POST /2/tweets エンドポイントラッパー
// OAuth 1.0a (HMAC-SHA1) で認証

import { generateOAuth1aHeader, getOAuth1aCredentials } from "./oauth1a";
import type { XTweetResponse, XUserResponse } from "@/src/types";

const X_API_V2_BASE = "https://api.x.com/2";

// ─── Tweet 投稿 ───────────────────────────────────────────

export interface TweetPayload {
  text: string;
  media?: {
    media_ids: string[]; // 事前にアップロードしたメディアID
  };
}

/**
 * X API v2 でツイートを投稿する（OAuth 1.0a User Context）
 * @returns tweet_id（ログ保存用）
 */
export async function postTweet(
  _accessToken: string, // 後方互換性のため引数は残すが未使用
  payload: TweetPayload
): Promise<string> {
  // ── 呼び出しフロー ────────────────────────────────────────
  // /publish → api/publish/route.ts → scheduler.publishPost()
  //   → postTweet() [tweet.ts] → generateOAuth1aHeader() [oauth1a.ts]
  //   → fetch POST https://api.twitter.com/2/tweets
  // ─────────────────────────────────────────────────────────
  const p = (s: string) => s.length >= 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : "(短すぎ)";
  const isAT = (s: string) => /^\d{5,}-/.test(s);

  // 環境変数から直接読んで実際に使われる値を確認
  const envSnapshot = {
    X_API_KEY:             process.env.X_API_KEY             ?? "(未設定)",
    X_API_SECRET:          process.env.X_API_SECRET          ?? "(未設定)",
    X_ACCESS_TOKEN:        process.env.X_ACCESS_TOKEN        ?? "(未設定)",
    X_ACCESS_TOKEN_SECRET: process.env.X_ACCESS_TOKEN_SECRET ?? "(未設定)",
  };

  console.log("━━━ [postTweet] 開始 ━━━");
  console.log("[postTweet] 実際に process.env から読んだ値 preview:", {
    X_API_KEY:             { preview: p(envSnapshot.X_API_KEY),             len: envSnapshot.X_API_KEY.length,             isAT: isAT(envSnapshot.X_API_KEY) },
    X_API_SECRET:          { preview: p(envSnapshot.X_API_SECRET),          len: envSnapshot.X_API_SECRET.length,          isAT: isAT(envSnapshot.X_API_SECRET) },
    X_ACCESS_TOKEN:        { preview: p(envSnapshot.X_ACCESS_TOKEN),        len: envSnapshot.X_ACCESS_TOKEN.length,        isAT: isAT(envSnapshot.X_ACCESS_TOKEN) },
    X_ACCESS_TOKEN_SECRET: { preview: p(envSnapshot.X_ACCESS_TOKEN_SECRET), len: envSnapshot.X_ACCESS_TOKEN_SECRET.length, isAT: isAT(envSnapshot.X_ACCESS_TOKEN_SECRET) },
  });

  const credentials = getOAuth1aCredentials();
  const url = `${X_API_V2_BASE}/tweets`;

  console.log("[postTweet] リクエスト情報:", {
    method: "POST",
    url,
    bodyKeys: Object.keys(payload),
    bodyText_preview: payload.text.slice(0, 30) + (payload.text.length > 30 ? "..." : ""),
  });

  // OAuth 1.0a 署名を生成（generateOAuth1aHeader 内でも詳細ログ出力）
  const authHeader = generateOAuth1aHeader("POST", url, credentials);

  console.log("[postTweet] Authorization header:", {
    startsWithOAuth: authHeader.startsWith("OAuth "),
    length: authHeader.length,
    head: authHeader.slice(0, 60) + "...",
  });

  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: authHeader,
      "User-Agent": "X-Post-Bridge/1.0",
    },
    body: JSON.stringify(payload),
  });

  // レスポンスヘッダーを全件記録
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((v, k) => { responseHeaders[k] = v; });

  if (!response.ok) {
    const errorData = await response.text();
    console.error("━━━ [postTweet] 401/エラー詳細 ━━━", {
      status: response.status,
      statusText: response.statusText,
      responseBody: errorData,
      responseHeaders,
    });
    throw new Error(
      `Tweet posting failed (${response.status}): ${errorData}`
    );
  }

  const data = (await response.json()) as XTweetResponse;
  return data.data.id;
}

// ─── 接続ユーザー確認 ─────────────────────────────────────

/**
 * 現在の認証ユーザー情報を取得 (/2/users/me)
 * OAuth 1.0a User Context で認証
 */
export async function getMe(
  _accessToken?: string // 後方互換性のため引数は残すが未使用
): Promise<XUserResponse["data"]> {
  const credentials = getOAuth1aCredentials();
  const baseUrl = `${X_API_V2_BASE}/users/me`;
  const queryParams = "user.fields=name,username,profile_image_url";
  const fullUrl = `${baseUrl}?${queryParams}`;

  // OAuth 1.0a 署名はクエリパラメータを含める
  const authHeader = generateOAuth1aHeader("GET", baseUrl, credentials, {
    "user.fields": "name,username,profile_image_url",
  });

  const response = await fetch(fullUrl, {
    method: "GET",
    headers: {
      Authorization: authHeader,
      "User-Agent": "X-Post-Bridge/1.0",
    },
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error("[X API getMe Error]", {
      status: response.status,
      body: errorData,
    });
    throw new Error(
      `Failed to get user info (${response.status}): ${errorData}`
    );
  }

  const data = (await response.json()) as XUserResponse;
  return data.data;
}
