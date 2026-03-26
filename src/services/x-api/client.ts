// src/services/x-api/client.ts
// X API v2 の axios インスタンス + 自動 429 バックオフ

import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { withRetry, RateLimitError } from "@/src/lib/rate-limit";

export const X_API_BASE = "https://api.twitter.com/2";

/**
 * アクセストークンを渡すと、認証済みの X API クライアントを返す
 */
export function createXApiClient(accessToken: string): AxiosInstance {
  const instance = axios.create({
    baseURL: X_API_BASE,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    timeout: 15_000,
  });

  // レスポンスインターセプター: エラーを詳細にログ
  instance.interceptors.response.use(
    (res) => res,
    (err) => {
      if (axios.isAxiosError(err)) {
        console.error("[X API Error]", {
          status: err.response?.status,
          data: err.response?.data,
          headers: err.response?.headers,
          message: err.message,
        });

        if (err.response?.status === 429) {
          const retryAfter = Number(
            err.response.headers?.["x-ratelimit-reset"] ?? 0
          );
          throw new RateLimitError(429, retryAfter, "X API rate limit exceeded");
        }
      }
      throw err;
    }
  );

  return instance;
}

/**
 * リトライ付きでGETリクエストを実行
 */
export async function xGet<T>(
  client: AxiosInstance,
  url: string,
  config?: AxiosRequestConfig
): Promise<T> {
  return withRetry(async () => {
    const res = await client.get<T>(url, config);
    return res.data;
  });
}

/**
 * リトライ付きでPOSTリクエストを実行
 */
export async function xPost<T>(
  client: AxiosInstance,
  url: string,
  data?: unknown,
  config?: AxiosRequestConfig
): Promise<T> {
  return withRetry(async () => {
    const res = await client.post<T>(url, data, config);
    return res.data;
  });
}
