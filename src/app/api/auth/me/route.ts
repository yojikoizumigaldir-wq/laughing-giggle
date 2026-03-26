// src/app/api/auth/me/route.ts
// GET /api/auth/me - 現在の認証ユーザー情報を取得（OAuth 1.0a）

import { NextResponse } from "next/server";
import { getMe } from "@/src/services/x-api/tweet";
import type { ApiResponse } from "@/src/types";

export async function GET() {
  try {
    // OAuth 1.0a: 環境変数から直接トークンを使用
    const user = await getMe();

    return NextResponse.json<ApiResponse>(
      {
        ok: true,
        data: {
          username: user.username,
          displayName: user.name,
          profileImage: user.profile_image_url,
        },
      },
      { status: 200 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[GET /api/auth/me]", error);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: `Failed to fetch user info: ${message}` },
      { status: 400 }
    );
  }
}
