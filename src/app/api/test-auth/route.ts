// src/app/api/test-auth/route.ts
// OAuth 1.0a 認証テスト + Bearer Token テスト

import { NextResponse } from "next/server";
import crypto from "crypto";

function percentEncode(str: string): string {
  return encodeURIComponent(str)
    .replace(/!/g, "%21")
    .replace(/\*/g, "%2A")
    .replace(/'/g, "%27")
    .replace(/\(/g, "%28")
    .replace(/\)/g, "%29");
}

export async function GET() {
  const results: Record<string, unknown> = {};

  // ===== Test 1: Bearer Token =====
  try {
    const bearerToken = process.env.X_BEARER_TOKEN;
    if (bearerToken) {
      const res = await fetch("https://api.x.com/2/users/me", {
        headers: { Authorization: `Bearer ${bearerToken}` },
      });
      const text = await res.text();
      results.bearerTokenTest = {
        status: res.status,
        response: text.substring(0, 300),
        note: "Bearer Token はアプリ専用（ユーザー情報取得不可の場合あり）",
      };
    }
  } catch (e) {
    results.bearerTokenTest = { error: String(e) };
  }

  // ===== Test 2: OAuth 1.0a GET /users/me =====
  try {
    const consumerKey = process.env.X_API_KEY!;
    const consumerSecret = process.env.X_API_SECRET!;
    const accessToken = process.env.X_ACCESS_TOKEN!;
    const accessTokenSecret = process.env.X_ACCESS_TOKEN_SECRET!;

    const method = "GET";
    const url = "https://api.x.com/2/users/me";

    const oauthParams: Record<string, string> = {
      oauth_consumer_key: consumerKey,
      oauth_nonce: crypto.randomBytes(32).toString("hex"),
      oauth_signature_method: "HMAC-SHA1",
      oauth_timestamp: Math.floor(Date.now() / 1000).toString(),
      oauth_token: accessToken,
      oauth_version: "1.0",
    };

    const paramString = Object.keys(oauthParams)
      .sort()
      .map((k) => `${percentEncode(k)}=${percentEncode(oauthParams[k])}`)
      .join("&");

    const baseString = `${method}&${percentEncode(url)}&${percentEncode(paramString)}`;
    const signingKey = `${percentEncode(consumerSecret)}&${percentEncode(accessTokenSecret)}`;
    const signature = crypto.createHmac("sha1", signingKey).update(baseString).digest("base64");

    oauthParams.oauth_signature = signature;

    const authHeader =
      "OAuth " +
      Object.keys(oauthParams)
        .sort()
        .map((k) => `${percentEncode(k)}="${percentEncode(oauthParams[k])}"`)
        .join(", ");

    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: authHeader },
    });
    const text = await res.text();

    results.oauth1aTest = {
      status: res.status,
      response: text.substring(0, 500),
      keys: {
        consumerKey,
        consumerKeyLength: consumerKey.length,
        consumerSecretLength: consumerSecret.length,
        accessToken,
        accessTokenLength: accessToken.length,
        accessTokenSecret: accessTokenSecret.substring(0, 5) + "...",
        accessTokenSecretLength: accessTokenSecret.length,
      },
      debug: {
        timestamp: oauthParams.oauth_timestamp,
        signature: signature,
        baseStringPreview: baseString.substring(0, 200),
      },
    };
  } catch (e) {
    results.oauth1aTest = { error: String(e) };
  }

  // ⚠️ Test 3 (実際に投稿するテスト) は誤爆防止のため削除済み
  // 本番アカウントに「テスト投稿 from X Post Bridge」が投稿されていた原因だった

  return NextResponse.json(results, { status: 200 });
}
