// src/app/api/publish/route.ts
// POST /api/publish - 指定した投稿を即時投稿する（手動トリガー）

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { publishPost } from "@/src/services/scheduler";
import type { ApiResponse } from "@/src/types";

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as { postId: string };

    if (!body.postId) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "postId is required" },
        { status: 400 }
      );
    }

    const post = await prisma.post.findUnique({
      where: { id: body.postId },
      include: { account: true },
    });

    if (!post) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Post not found" },
        { status: 404 }
      );
    }

    if (!["DRAFT", "SCHEDULED", "FAILED"].includes(post.status)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: `Cannot publish a post with status: ${post.status}` },
        { status: 409 }
      );
    }

    const result = await publishPost(post.id);

    if (result.success) {
      return NextResponse.json<ApiResponse<{ tweetId: string }>>({
        ok: true,
        data: { tweetId: result.tweetId! },
      });
    } else {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: result.error ?? "Publish failed" },
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[POST /api/publish]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Publish failed unexpectedly" },
      { status: 500 }
    );
  }
}
