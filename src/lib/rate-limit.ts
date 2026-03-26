// src/lib/rate-limit.ts
// X API 429 対応: 指数バックオフ付きリトライ

export interface RetryOptions {
  maxRetries?: number;     // 最大リトライ回数（デフォルト: 3）
  baseDelayMs?: number;    // 初回遅延ms（デフォルト: 1000）
  maxDelayMs?: number;     // 最大遅延ms（デフォルト: 60000）
  jitter?: boolean;        // ランダムジッター追加（デフォルト: true）
}

export class RateLimitError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly retryAfter?: number,
    message?: string
  ) {
    super(message ?? `Rate limited (${statusCode})`);
    this.name = "RateLimitError";
  }
}

/**
 * 指数バックオフで fn を最大 maxRetries 回リトライする
 *
 * - 429: X-RateLimit-Reset ヘッダがあればその時刻まで待機
 * - 5xx: 指数バックオフ
 * - それ以外: 即座に throw
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 60_000,
    jitter = true,
  } = options;

  let lastError: unknown;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;

      // リトライ対象か判定
      const shouldRetry = isRetryable(err);
      if (!shouldRetry || attempt === maxRetries) throw err;

      // 待機時間を計算
      const delayMs = calcDelay(err, attempt, baseDelayMs, maxDelayMs, jitter);
      console.warn(
        `[withRetry] attempt=${attempt + 1}/${maxRetries} waiting ${delayMs}ms…`
      );
      await sleep(delayMs);
    }
  }

  throw lastError;
}

// ─── helpers ──────────────────────────────────────────────

function isRetryable(err: unknown): boolean {
  if (err instanceof RateLimitError) return true;
  if (isAxiosError(err)) {
    const status = err.response?.status;
    return status === 429 || (status != null && status >= 500);
  }
  return false;
}

function calcDelay(
  err: unknown,
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitter: boolean
): number {
  // 429 で Retry-After ヘッダがある場合はそれを使う
  if (isAxiosError(err) && err.response?.status === 429) {
    const retryAfter = err.response.headers?.["x-ratelimit-reset"];
    if (retryAfter) {
      const waitMs = (parseInt(retryAfter, 10) * 1000) - Date.now();
      if (waitMs > 0 && waitMs < maxDelayMs) return waitMs;
    }
  }

  // 指数バックオフ: baseDelayMs * 2^attempt
  let delay = Math.min(baseDelayMs * Math.pow(2, attempt), maxDelayMs);
  if (jitter) delay = delay * (0.5 + Math.random() * 0.5);
  return Math.floor(delay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// axios エラー型ガード（axios を直接 import せず型だけ使う）
function isAxiosError(err: unknown): err is {
  response?: { status: number; headers: Record<string, string>; data: unknown };
  isAxiosError: true;
} {
  return (
    typeof err === "object" &&
    err !== null &&
    "isAxiosError" in err &&
    (err as { isAxiosError: unknown }).isAxiosError === true
  );
}
