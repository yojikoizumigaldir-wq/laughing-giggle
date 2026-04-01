// ============================================================
// X Account Analyzer - Type Definitions
// ============================================================

/** X API v2 から取得した生ツイート */
export interface RawTweet {
  id: string;
  text: string;
  created_at: string;
  public_metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count: number;
    bookmark_count: number;
  };
  attachments?: {
    media_keys?: string[];
  };
}

/** 特徴量を付与した分析済みツイート */
export interface AnalyzedTweet {
  id: string;
  text: string;
  created_at: string;
  // 構造特徴
  charCount: number;
  lineCount: number;
  firstLine: string;
  firstLineLength: number;
  hasHashtag: boolean;
  hasUrl: boolean;
  hasMedia: boolean;
  hasBullets: boolean;
  hasNumber: boolean;
  startsWithQuestion: boolean;
  // メトリクス
  metrics?: {
    retweet_count: number;
    reply_count: number;
    like_count: number;
    quote_count: number;
    impression_count: number;
    bookmark_count: number;
    engagement_total: number;
    engagement_rate: number; // engagement_total / impression_count (impressions がある場合)
  };
  tier?: "top" | "middle" | "bottom";
}

/** 分析結果全体 */
export interface AnalysisResult {
  username: string;
  analyzedAt: string;
  totalTweets: number;
  hasMetrics: boolean; // public_metrics が取れたかどうか
  tweets: AnalyzedTweet[];
  summary: {
    avgCharCount: number;
    avgLineCount: number;
    avgFirstLineLength: number;
    hashtagUsageRate: number; // 0〜1
    urlUsageRate: number;
    mediaUsageRate: number;
    bulletUsageRate: number;
    numberUsageRate: number;
  };
  topSummary: TierSummary;
  bottomSummary: TierSummary;
  winPatterns: string[];
  losePatterns: string[];
  rules: string[];
  ngRules: string[];
  testHypotheses: string[];
  learningRules: string; // コピペ用学習ルールテキスト
}

export interface TierSummary {
  avgCharCount: number;
  avgLineCount: number;
  avgFirstLineLength: number;
  hashtagUsageRate: number;
  urlUsageRate: number;
  mediaUsageRate: number;
  bulletUsageRate: number;
  numberUsageRate: number;
  avgEngagement?: number;
  avgEngagementRate?: number;
}

/** CSV インポート用の行フォーマット */
export interface CsvRow {
  id?: string;
  text: string;
  created_at?: string;
  like_count?: string | number;
  retweet_count?: string | number;
  reply_count?: string | number;
  quote_count?: string | number;
  impression_count?: string | number;
  bookmark_count?: string | number;
}

/** 分析履歴エントリ（localStorage 保存用） */
export interface HistoryEntry {
  id: string;
  username: string;
  analyzedAt: string;
  totalTweets: number;
  result: AnalysisResult;
}

/** API レスポンス */
export type ApiResponse<T> =
  | { success: true; data: T }
  | { success: false; error: string; details?: string };
