// src/app/api/cron/route.ts
// GET /api/cron - スケジューラジョブ（1分ごとに実行）
//
// Vercel の場合: vercel.json に cron 設定を追加する
// セルフホストの場合: node-cron でこのエンドポイントを叩く、またはサーバー側で直接呼ぶ
//
// 認証: CRON_SECRET ヘッダ or クエリパラメータで保護

import { NextRequest, NextResponse } from "next/server";
import { runScheduledJobs } from "@/src/services/scheduler";
import type { ApiResponse } from "@/src/types";

export async function GET(req: NextRequest) {
  // CRON_SECRET による保護
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret) {
    const authHeader = req.headers.get("authorization");
    const querySecret = new URL(req.url).searchParams.get("secret");
    const provided = authHeader?.replace("Bearer ", "") ?? querySecret;

    if (provided !== cronSecret) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Unauthorized" },
        { status: 401 }
      );
    }
  }

  try {
    const result = await runScheduledJobs();
    return NextResponse.json<ApiResponse<typeof result>>({
      ok: true,
      data: result,
    });
  } catch (err) {
    console.error("[GET /api/cron]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Cron job failed" },
      { status: 500 }
    );
  }
}
