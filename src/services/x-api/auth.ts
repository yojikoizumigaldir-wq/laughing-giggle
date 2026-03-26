// src/services/x-api/auth.ts
// OAuth 2.0 User Context フロー実装

import crypto from "crypto";

const X_API_BASE = "https://api.x.com/2";
const X_OAUTH_AUTHORIZE_URL = "https://x.com/i/oauth2/authorize";
const X_OAUTH_TOKEN_URL = "https://api.x.com/2/oauth2/token";

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope: string;
}

/**
 * PKCE の code_verifier / code_challenge を生成
 * code_verifier : 43〜128文字の base64url ランダム文字列
 * code_challenge: SHA-256(code_verifier) の base64url エンコード
 */
export function generatePKCE(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = crypto.randomBytes(32).toString("base64url");
  const codeChallenge = crypto
    .createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

/**
 * OAuth 2.0 Authorization URL を生成（PKCE 必須）
 */
export function generateAuthorizationUrl(codeChallenge: string): string {
  const clientId = process.env.X_CLIENT_ID;
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/x/callback`;
  const scopes = [
    "tweet.read",
    "tweet.write",
    "users.read",
    "follows.read",
    "follows.write",
  ];
  const state = crypto.randomBytes(32).toString("hex");

  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId!,
    redirect_uri: redirectUri,
    scope: scopes.join(" "),
    state: state,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
  });

  return `${X_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
}

/**
 * Authorization code を Access Token に exchange（PKCE 必須）
 */
export async function exchangeCodeForToken(
  code: string,
  redirectUri: string,
  codeVerifier: string
): Promise<OAuthTokenResponse> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("OAuth credentials not configured");
  }

  // Authorization: Basic base64(client_id:client_secret)
  const basicCredentials = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const authorizationHeader = `Basic ${basicCredentials}`;

  // body には grant_type / code / redirect_uri / code_verifier のみ
  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: code,
    redirect_uri: redirectUri,
    code_verifier: codeVerifier,
  });

  // デバッグ用ログ（先頭4文字・末尾4文字のみ出力）
  // NOTE: X OAuth 2.0 token exchange に必要なのは
  //   ✅ OAuth 2.0 Client ID     (X_CLIENT_ID)
  //   ✅ OAuth 2.0 Client Secret (X_CLIENT_SECRET)
  //   ❌ API Key / API Key Secret (X_API_KEY / X_API_SECRET) ← OAuth 1.0a 用・ここでは使わない
  const preview = (s: string) =>
    s.length >= 8 ? `${s.slice(0, 4)}...${s.slice(-4)}` : "(短すぎ)";
  console.log("[OAuth token exchange]", {
    endpoint: X_OAUTH_TOKEN_URL,
    // OAuth 2.0 Client ID の確認
    X_CLIENT_ID_preview: preview(clientId),
    X_CLIENT_ID_length: clientId.length,
    // OAuth 2.0 Client Secret の確認
    X_CLIENT_SECRET_preview: preview(clientSecret),
    X_CLIENT_SECRET_length: clientSecret.length,
    hasAuthorizationHeader: authorizationHeader.startsWith("Basic "),
    bodyKeys: Array.from(body.keys()),
  });

  const response = await fetch(X_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: authorizationHeader,
      "User-Agent": "X-Post-Bridge/1.0",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error("[OAuth Error]", {
      status: response.status,
      body: errorData,
    });
    throw new Error(`OAuth token exchange failed: ${response.statusText} - ${errorData}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;
  return data;
}

/**
 * Refresh Token を使って新しい Access Token を取得
 */
export async function refreshAccessToken(
  refreshToken: string
): Promise<OAuthTokenResponse> {
  const clientId = process.env.X_CLIENT_ID;
  const clientSecret = process.env.X_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("OAuth credentials not configured");
  }

  // Create Basic Auth header (clientId:clientSecret in Base64)
  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString(
    "base64"
  );

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: refreshToken,
  });

  const response = await fetch(X_OAUTH_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${credentials}`,
      "User-Agent": "X-Post-Bridge/1.0",
    },
    body: body.toString(),
  });

  if (!response.ok) {
    const errorData = await response.text();
    console.error("[OAuth Refresh Error]", {
      status: response.status,
      body: errorData,
    });
    throw new Error(`OAuth token refresh failed: ${response.statusText}`);
  }

  const data = (await response.json()) as OAuthTokenResponse;
  return data;
}

/**
 * Bearer Token を取得（後方互換性）
 */
export async function getAccessToken() {
  const token = process.env.X_BEARER_TOKEN!;
  if (!token) {
    throw new Error("X_BEARER_TOKEN is not set in environment variables");
  }
  return {
    access_token: token,
    token_type: "Bearer",
  };
}
