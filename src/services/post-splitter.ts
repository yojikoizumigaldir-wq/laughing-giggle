// src/services/post-splitter.ts
// Claudeのまとめ貼り付けテキストを1投稿ずつ分割する

import type { SplitResult, SplitItem } from "@/src/types";

const TWEET_MAX_LENGTH = 280;

// ─── 分割区切り文字のパターン ─────────────────────────────
//
// Claude の出力で多いパターン：
//   ---       (水平線)
//   ===       (水平線)
//   [1]       (番号ブラケット)
//   1.        (番号ドット)
//   【投稿1】  (日本語ブラケット)
//
// いずれか1つが単独行にある場合を区切りとして扱う

const SEPARATOR_PATTERNS = [
  /^-{3,}$/,                     // ---
  /^={3,}$/,                     // ===
  /^\*{3,}$/,                    // ***
  /^\[?\d+\]?[.)]\s*$/,         // [1] / 1. / 1)
  /^【.{0,10}】\s*$/,            // 【投稿1】
  /^■.{0,20}$/,                  // ■投稿1
  /^#{1,3}\s*.+$/,               // ## 投稿1
];

/**
 * テキストを投稿ごとに分割する
 *
 * ① 区切り文字パターンで分割を試みる
 * ② 区切りが見つからない場合は連続する空行2行以上で分割
 * ③ それでも1つしかない場合はそのまま返す
 */
export function splitPosts(rawText: string): SplitResult {
  const warnings: string[] = [];

  // 正規化: CRLF → LF、行末スペース除去
  const normalized = rawText.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n");

  // ① 区切り文字で分割
  let segments = splitBySeparators(lines);

  // ② 区切りが1つ以下なら、連続空行で分割
  if (segments.length <= 1) {
    segments = splitByBlankLines(normalized);
  }

  // 空セグメント除去
  const cleaned = segments
    .map((s) => s.trim())
    .filter((s) => s.length > 0);

  if (cleaned.length === 0) {
    return { items: [], count: 0, warnings: ["No content found"] };
  }

  // 文字数チェック
  const items: SplitItem[] = cleaned.map((content) => {
    const charCount = countTweetChars(content);
    const isOverLimit = charCount > TWEET_MAX_LENGTH;
    if (isOverLimit) {
      warnings.push(
        `投稿「${content.slice(0, 20)}…」は ${charCount} 文字（上限 ${TWEET_MAX_LENGTH} 文字超過）`
      );
    }
    return { content, charCount, isOverLimit };
  });

  return { items, count: items.length, warnings };
}

// ─── Helpers ──────────────────────────────────────────────

function splitBySeparators(lines: string[]): string[] {
  const segments: string[] = [];
  let current: string[] = [];

  for (const line of lines) {
    if (SEPARATOR_PATTERNS.some((p) => p.test(line.trim()))) {
      if (current.length > 0) {
        segments.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push(line);
    }
  }
  if (current.length > 0) segments.push(current.join("\n"));

  return segments;
}

function splitByBlankLines(text: string): string[] {
  // 2行以上の連続空行を区切りとして扱う
  return text.split(/\n{2,}/).filter((s) => s.trim().length > 0);
}

/**
 * Xの文字カウント計算
 * - URL は 23文字としてカウント（t.co 短縮仕様）
 * - CJK文字は2文字としてカウント
 *
 * 簡易版実装（正確なカウントは twitter-text ライブラリを推奨）
 */
export function countTweetChars(text: string): number {
  // URL を 23文字に置換
  const withUrlReplaced = text.replace(
    /https?:\/\/[^\s]+/g,
    "x".repeat(23)
  );

  let count = 0;
  for (const char of withUrlReplaced) {
    const code = char.codePointAt(0) ?? 0;
    // CJK統合漢字・ひらがな・カタカナ等
    if (isCJK(code)) {
      count += 2;
    } else {
      count += 1;
    }
  }
  return Math.ceil(count / 2); // X は全角を0.5単位として扱う（実装上は2で割る）
}

function isCJK(code: number): boolean {
  return (
    (code >= 0x4e00 && code <= 0x9fff) || // CJK統合漢字
    (code >= 0x3040 && code <= 0x309f) || // ひらがな
    (code >= 0x30a0 && code <= 0x30ff) || // カタカナ
    (code >= 0xff00 && code <= 0xffef) || // 全角英数
    (code >= 0x3000 && code <= 0x303f)    // CJK記号
  );
}
