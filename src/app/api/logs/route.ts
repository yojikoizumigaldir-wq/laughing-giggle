// src/app/api/logs/route.ts
// GET /api/logs - 投稿ログ一覧

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import type { ApiResponse, PostLogDto } from "@/src/types";
import { LogStatus } from "@prisma/client";

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as LogStatus | null;
    const accountId = searchParams.get("accountId");
    const limit = Math.min(Number(searchParams.get("limit") ?? "50"), 200);
    const offset = Number(searchParams.get("offset") ?? "0");

    const [logs, total] = await prisma.$transaction([
      prisma.postLog.findMany({
        where: {
          ...(status ? { status } : {}),
          ...(accountId ? { accountId } : {}),
        },
        include: {
          post: { select: { content: true } },
          account: { select: { username: true } },
        },
        orderBy: { createdAt: "desc" },
        take: limit,
        skip: offset,
      }),
      prisma.postLog.count({
        where: {
          ...(status ? { status } : {}),
          ...(accountId ? { accountId } : {}),
        },
      }),
    ]);

    const data: PostLogDto[] = logs.map((log) => ({
      id: log.id,
      postId: log.postId,
      accountId: log.accountId,
      status: log.status,
      xTweetId: log.xTweetId,
      errorCode: log.errorCode,
      errorBody: log.errorBody,
      retryCount: log.retryCount,
      createdAt: log.createdAt.toISOString(),
      postContent: log.post.content,
      accountUsername: log.account.username,
    }));

    return NextResponse.json<ApiResponse<{ logs: PostLogDto[]; total: number }>>({
      ok: true,
      data: { logs: data, total },
    });
  } catch (err) {
    console.error("[GET /api/logs]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to fetch logs" },
      { status: 500 }
    );
  }
}
