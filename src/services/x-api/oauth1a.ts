// src/services/x-api/oauth1a.ts
// OAuth 1.0a HMAC-SHA1 署名を Node.js 組み込みモジュールのみで実装
// 外部パッケージ不要

import crypto from "crypto";

export interface OAuth1aCredentials {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}

/**
 * OAuth 1.0a の Authorization ヘッダーを生成する
 */
export function generateOAuth1aHeader(
  method: string,
  url: string,
  credentials: OAuth1aCredentials,
  bodyParams?: Record<string, string>
): string {
  const p = (s: string) => s.length >= 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : "(短)";

  const oauthParams: Record<string, string> = {
    oauth_consumer_key: credentials.consumerKey,
    oauth_nonce: generateNonce(),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
    oauth_token: credentials.accessToken,
    oauth_version: "1.0",
  };

  // 署名ベース文字列に含めるパラメータを集める
  // Note: JSON body の場合、body params は署名に含めない（X API v2 は JSON）
  const allParams = { ...oauthParams, ...(bodyParams || {}) };

  // パラメータをソートしてエンコード
  const paramString = Object.keys(allParams)
    .sort()
    .map(
      (key) =>
        `${percentEncode(key)}=${percentEncode(allParams[key])}`
    )
    .join("&");

  // 署名ベース文字列
  const signatureBaseString = [
    method.toUpperCase(),
    percentEncode(url),
    percentEncode(paramString),
  ].join("&");

  // 署名キー（consumerSecret & accessTokenSecret の組み合わせ）
  const signingKey = `${percentEncode(credentials.consumerSecret)}&${percentEncode(credentials.accessTokenSecret)}`;

  // HMAC-SHA1 署名
  const signature = crypto
    .createHmac("sha1", signingKey)
    .update(signatureBaseString)
    .digest("base64");

  oauthParams["oauth_signature"] = signature;

  // Authorization ヘッダー生成
  const headerParts = Object.keys(oauthParams)
    .sort()
    .map(
      (key) =>
        `${percentEncode(key)}="${percentEncode(oauthParams[key])}"`
    )
    .join(", ");

  // ── 署名デバッグログ ─────────────────────────────────────
  console.log("[generateOAuth1aHeader] 署名詳細", {
    method: method.toUpperCase(),
    url,
    // 実際に使っている資格情報 preview（値は出さない）
    consumerKey_preview:       p(credentials.consumerKey),
    accessToken_preview:       p(credentials.accessToken),
    consumerSecret_preview:    p(credentials.consumerSecret),
    accessTokenSecret_preview: p(credentials.accessTokenSecret),
    // 署名に使ったパラメータキー一覧
    signedParamKeys: Object.keys(allParams).sort(),
    // 署名ベース文字列（秘密情報は含まれない）
    signatureBaseString,
    // 生成した署名（送信後は意味がないので公開して問題なし）
    signature,
  });
  // ────────────────────────────────────────────────────────

  return `OAuth ${headerParts}`;
}

/**
 * RFC 3986 に準拠したパーセントエンコード
 */
function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

/**
 * OAuth nonce（ランダム文字列）を生成
 */
function generateNonce(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * X API OAuth 1.0a 資格情報の形式を検証する
 * 不整合が検出された場合は人間が読めるエラーを throw する
 *
 * 期待フォーマット:
 *   X_API_KEY             (Consumer Key)         : 20〜30 文字、英数字のみ
 *   X_API_SECRET          (Consumer Secret)       : 40〜60 文字、英数字+記号、先頭に "{数字}-" を含まない
 *   X_ACCESS_TOKEN        (Access Token)          : "{数字}-{文字列}" 形式
 *   X_ACCESS_TOKEN_SECRET (Access Token Secret)   : 40〜50 文字、英数字のみ
 *
 * Developer Console での正しい取得先:
 *   X_API_KEY             ← "Consumer Keys" セクション → API Key
 *   X_API_SECRET          ← "Consumer Keys" セクション → API Key Secret
 *   X_ACCESS_TOKEN        ← "Authentication Tokens" セクション → Access Token
 *   X_ACCESS_TOKEN_SECRET ← "Authentication Tokens" セクション → Access Token Secret
 */
export function validateOAuth1aCredentials(creds: {
  consumerKey: string;
  consumerSecret: string;
  accessToken: string;
  accessTokenSecret: string;
}): void {
  const p = (s: string) =>
    s.length >= 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : "(短すぎ: " + s.length + "文字)";
  const isAccessTokenFormat = (s: string) => /^\d{5,}-/.test(s);

  const errors: string[] = [];

  // X_API_SECRET が Access Token 形式になっていないか
  if (isAccessTokenFormat(creds.consumerSecret)) {
    errors.push(
      `[X_API_SECRET] Consumer Secret の位置に Access Token らしき値が入っています (preview: ${p(creds.consumerSecret)})。` +
      " Developer Console → Consumer Keys → API Key Secret をコピーしてください。"
    );
  }

  // X_ACCESS_TOKEN が Access Token 形式になっているか
  if (!isAccessTokenFormat(creds.accessToken)) {
    errors.push(
      `[X_ACCESS_TOKEN] Access Token は "{数字}-{文字列}" 形式である必要があります (preview: ${p(creds.accessToken)})。` +
      " Developer Console → Authentication Tokens → Access Token をコピーしてください。"
    );
  }

  // X_API_KEY が長すぎる場合（Access Token Secret と混在）
  if (creds.consumerKey.length > 50) {
    errors.push(
      `[X_API_KEY] Consumer Key が長すぎます (${creds.consumerKey.length}文字)。` +
      " Developer Console → Consumer Keys → API Key (短い方) をコピーしてください。"
    );
  }

  if (errors.length > 0) {
    const msg = [
      "━━━ OAuth 1.0a 資格情報の不整合を検出しました ━━━",
      ...errors.map((e, i) => `  ${i + 1}. ${e}`),
      "",
      ".env.local の正しい設定方法:",
      "  X_API_KEY             ← Developer Console > Consumer Keys > API Key",
      "  X_API_SECRET          ← Developer Console > Consumer Keys > API Key Secret",
      "  X_ACCESS_TOKEN        ← Developer Console > Authentication Tokens > Access Token",
      "  X_ACCESS_TOKEN_SECRET ← Developer Console > Authentication Tokens > Access Token Secret",
      "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━",
    ].join("\n");
    throw new Error(msg);
  }
}

/**
 * 環境変数から OAuth 1.0a 認証情報を取得（形式検証つき）
 */
export function getOAuth1aCredentials(): OAuth1aCredentials {
  const consumerKey = process.env.X_API_KEY;
  const consumerSecret = process.env.X_API_SECRET;
  const accessToken = process.env.X_ACCESS_TOKEN;
  const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET;

  if (!consumerKey || !consumerSecret || !accessToken || !accessTokenSecret) {
    throw new Error(
      [
        "OAuth 1.0a 認証情報が未設定です。.env.local に以下を設定してください:",
        "  X_API_KEY             ← Developer Console > Consumer Keys > API Key",
        "  X_API_SECRET          ← Developer Console > Consumer Keys > API Key Secret",
        "  X_ACCESS_TOKEN        ← Developer Console > Authentication Tokens > Access Token",
        "  X_ACCESS_TOKEN_SECRET ← Developer Console > Authentication Tokens > Access Token Secret",
        `  未設定: ${[
          !consumerKey && "X_API_KEY",
          !consumerSecret && "X_API_SECRET",
          !accessToken && "X_ACCESS_TOKEN",
          !accessTokenSecret && "X_ACCESS_TOKEN_SECRET",
        ].filter(Boolean).join(", ")}`,
      ].join("\n")
    );
  }

  const creds = { consumerKey, consumerSecret, accessToken, accessTokenSecret };
  validateOAuth1aCredentials(creds); // 形式チェック
  return creds;
}
