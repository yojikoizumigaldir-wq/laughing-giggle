// ============================================================
// X API v2 Client - アカウント分析用
// ※ 投稿用 OAuth 認証とは別の App-Only Bearer Token を使用
// ============================================================

import type { RawTweet } from "@/src/types/analyze";

const TWITTER_API_BASE = "https://api.twitter.com/2";

/**
 * Bearer Token が設定されているか確認する
 */
export function isBearerTokenConfigured(): boolean {
  return Boolean(process.env.X_BEARER_TOKEN);
}

/**
 * ユーザー名からユーザー ID を取得する
 * GET /2/users/by/username/:username
 */
async function getUserId(username: string): Promise<string> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) throw new Error("X_BEARER_TOKEN が設定されていません");

  const cleanUsername = username.replace(/^@/, "").replace(/.*x\.com\//, "").replace(/.*twitter\.com\//, "").split("/")[0].split("?")[0];

  const res = await fetch(
    `${TWITTER_API_BASE}/users/by/username/${encodeURIComponent(cleanUsername)}`,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error("Bearer Token が無効です。X_BEARER_TOKEN を確認してください");
    if (res.status === 403) throw new Error("このエンドポイントへのアクセス権がありません。API アクセスレベルを確認してください");
    if (res.status === 404) throw new Error(`ユーザー @${cleanUsername} が見つかりません`);
    if (res.status === 429) throw new Error("X API のレート制限に達しました。しばらく待ってから再試行してください");
    throw new Error(`X API エラー (${res.status}): ${body}`);
  }

  const data = await res.json();
  // API がエラーオブジェクトを返している場合
  if (data.errors) {
    const msg = data.errors[0]?.message || data.errors[0]?.detail || JSON.stringify(data.errors[0]);
    throw new Error(`X API エラー: ${msg}`);
  }
  if (!data.data?.id) {
    throw new Error(`ユーザー ID の取得に失敗しました (レスポンス: ${JSON.stringify(data).slice(0, 200)})`);
  }
  return data.data.id;
}

/**
 * ユーザーの直近ツイートを取得する
 * GET /2/users/:id/tweets
 *
 * ⚠️ X API 制約:
 * - Free tier: 月 500 リクエスト (アプリ全体)
 * - Basic tier: 月 10,000 ツイート読み取り
 * - 1リクエストで最大 100 件取得可能
 * - public_metrics には impression_count が含まれる（要 OAuth 2.0 または Basic以上）
 */
export async function fetchUserTweets(
  username: string,
  maxResults = 50
): Promise<{ tweets: RawTweet[]; username: string }> {
  const bearerToken = process.env.X_BEARER_TOKEN;
  if (!bearerToken) throw new Error("X_BEARER_TOKEN が設定されていません");

  const cleanUsername = parseUsername(username);
  const userId = await getUserId(cleanUsername);

  const params = new URLSearchParams({
    max_results: String(Math.min(maxResults, 100)),
    "tweet.fields": "created_at,public_metrics,attachments",
    "expansions": "attachments.media_keys",
    exclude: "retweets,replies", // リツイート・返信を除外（任意）
  });

  const res = await fetch(
    `${TWITTER_API_BASE}/users/${userId}/tweets?${params}`,
    {
      headers: {
        Authorization: `Bearer ${bearerToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!res.ok) {
    const body = await res.text();
    if (res.status === 401) throw new Error("Bearer Token が無効です");
    if (res.status === 403) throw new Error("ツイート取得の権限がありません。API プランを確認してください（Free tier は制限あり）");
    if (res.status === 429) throw new Error("X API のレート制限に達しました。15分後に再試行してください");
    throw new Error(`X API エラー (${res.status}): ${body}`);
  }

  const data = await res.json();

  if (!data.data || data.data.length === 0) {
    return { tweets: [], username: cleanUsername };
  }

  const tweets: RawTweet[] = data.data.map((t: RawTweet) => ({
    id: t.id,
    text: t.text,
    created_at: t.created_at,
    public_metrics: t.public_metrics,
    attachments: t.attachments,
  }));

  return { tweets, username: cleanUsername };
}

/**
 * URL または @username からクリーンなユーザー名を抽出する
 */
export function parseUsername(input: string): string {
  const trimmed = input.trim();
  // URL パターン: https://x.com/username or https://twitter.com/username
  const urlMatch = trimmed.match(/(?:x\.com|twitter\.com)\/([A-Za-z0-9_]+)/);
  if (urlMatch) return urlMatch[1];
  // @username
  return trimmed.replace(/^@/, "");
}
