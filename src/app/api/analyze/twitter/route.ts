// ============================================================
// POST /api/analyze/twitter
// X API v2 からユーザーのツイートを取得する
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { fetchUserTweets, isBearerTokenConfigured } from "@/src/lib/twitterAnalyzer";
import type { ApiResponse, RawTweet } from "@/src/types/analyze";

export async function POST(req: NextRequest) {
  try {
    if (!isBearerTokenConfigured()) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: "X_BEARER_TOKEN が未設定です",
          details:
            ".env.local に X_BEARER_TOKEN を設定してください。設定するまで「デモデータ」または「CSV アップロード」で分析できます。",
        },
        { status: 503 }
      );
    }

    const body = await req.json();
    const { username, maxResults = 50 } = body as {
      username: string;
      maxResults?: number;
    };

    if (!username || typeof username !== "string") {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "username が指定されていません" },
        { status: 400 }
      );
    }

    const { tweets, username: cleanUsername } = await fetchUserTweets(
      username,
      maxResults
    );

    if (tweets.length === 0) {
      return NextResponse.json<ApiResponse<never>>(
        {
          success: false,
          error: "ツイートが見つかりませんでした",
          details: "アカウントが存在するか、投稿があるか確認してください",
        },
        { status: 404 }
      );
    }

    return NextResponse.json<ApiResponse<{ tweets: RawTweet[]; username: string }>>({
      success: true,
      data: { tweets, username: cleanUsername },
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "不明なエラーが発生しました";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
