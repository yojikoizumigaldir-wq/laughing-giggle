// ============================================================
// POST /api/analyze/run
// ツイートデータを受け取って分析結果を返す
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { analyzeTweets, getDemoTweets, parseCsvToRawTweets } from "@/src/lib/analyzer";
import type { ApiResponse, AnalysisResult, RawTweet } from "@/src/types/analyze";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json() as {
      mode: "api" | "csv" | "demo";
      tweets?: RawTweet[];
      csvText?: string;
      username: string;
    };

    const { mode, username } = body;

    if (!username) {
      return NextResponse.json<ApiResponse<never>>(
        { success: false, error: "username が指定されていません" },
        { status: 400 }
      );
    }

    let rawTweets: RawTweet[];

    switch (mode) {
      case "api":
        if (!body.tweets || body.tweets.length === 0) {
          return NextResponse.json<ApiResponse<never>>(
            { success: false, error: "tweets が空です" },
            { status: 400 }
          );
        }
        rawTweets = body.tweets;
        break;

      case "csv":
        if (!body.csvText) {
          return NextResponse.json<ApiResponse<never>>(
            { success: false, error: "csvText が空です" },
            { status: 400 }
          );
        }
        rawTweets = parseCsvToRawTweets(body.csvText);
        break;

      case "demo":
        rawTweets = getDemoTweets();
        break;

      default:
        return NextResponse.json<ApiResponse<never>>(
          { success: false, error: `不明なモード: ${mode}` },
          { status: 400 }
        );
    }

    const result = analyzeTweets(rawTweets, username || "demo");

    return NextResponse.json<ApiResponse<AnalysisResult>>({
      success: true,
      data: result,
    });
  } catch (e: unknown) {
    const message = e instanceof Error ? e.message : "分析中にエラーが発生しました";
    return NextResponse.json<ApiResponse<never>>(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
