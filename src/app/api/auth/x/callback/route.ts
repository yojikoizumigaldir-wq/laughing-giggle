// src/app/api/auth/x/callback/route.ts
// OAuth 2.0 callback handler

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { exchangeCodeForToken } from "@/src/services/x-api/auth";
import { getMe } from "@/src/services/x-api/tweet";

export async function GET(req: NextRequest) {
  try {
    const code = req.nextUrl.searchParams.get("code");
    const state = req.nextUrl.searchParams.get("state");

    if (!code) {
      return NextResponse.json(
        { error: "Authorization code not provided" },
        { status: 400 }
      );
    }

    if (!state) {
      return NextResponse.json(
        { error: "State parameter not provided" },
        { status: 400 }
      );
    }

    // Cookie から PKCE code_verifier を取得
    const codeVerifier = req.cookies.get("pkce_verifier")?.value;
    if (!codeVerifier) {
      return NextResponse.json(
        { error: "PKCE verifier missing or expired. Please try connecting again." },
        { status: 400 }
      );
    }

    // Exchange code for token
    const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/auth/x/callback`;
    const tokenData = await exchangeCodeForToken(code, redirectUri, codeVerifier);

    // Get authenticated user info
    let userInfo;
    try {
      userInfo = await getMe(tokenData.access_token);
    } catch (err) {
      console.error("[OAuth] Failed to get user info:", err);
      // Continue with limited user info
      userInfo = { id: "unknown", username: "unknown", name: "Unknown" };
    }

    // アカウント照合（X_EXPECTED_USERNAME が設定されている場合のみチェック）
    const expectedUsername = process.env.X_EXPECTED_USERNAME?.replace(/^@/, "");
    if (expectedUsername && userInfo.username !== expectedUsername) {
      console.warn(
        `[OAuth] Username mismatch: got @${userInfo.username}, expected @${expectedUsername}`
      );
      const mismatchResponse = NextResponse.json(
        {
          error: `認証されたアカウントは @${userInfo.username} です。期待している @${expectedUsername} ではありません。正しいアカウントで認可してください。`,
        },
        { status: 403 }
      );
      mismatchResponse.cookies.delete("pkce_verifier");
      return mismatchResponse;
    }

    // Save/update account in database
    const account = await prisma.account.upsert({
      where: { username: userInfo.username },
      update: {
        displayName: userInfo.name || userInfo.username,
        profileImage: userInfo.profile_image_url || null,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenExpiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        isActive: true,
      },
      create: {
        username: userInfo.username,
        displayName: userInfo.name || userInfo.username,
        profileImage: userInfo.profile_image_url || null,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token || null,
        tokenExpiresAt: tokenData.expires_in
          ? new Date(Date.now() + tokenData.expires_in * 1000)
          : null,
        isActive: true,
      },
    });

    console.log(`[OAuth] Account authenticated: ${account.username}`);

    // Redirect to import page（Cookie を削除してから）
    const successResponse = NextResponse.redirect(
      new URL("/import", process.env.NEXT_PUBLIC_APP_URL!)
    );
    successResponse.cookies.delete("pkce_verifier");
    return successResponse;
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[OAuth Callback Error]", errorMsg);

    const errorResponse = NextResponse.json(
      { error: "OAuth authentication failed", details: errorMsg },
      { status: 500 }
    );
    errorResponse.cookies.delete("pkce_verifier");
    return errorResponse;
  }
}
