// src/app/api/posts/route.ts
// GET /api/posts  - 投稿一覧
// POST /api/posts - 投稿まとめ貼り付け → 分割保存

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { splitPosts } from "@/src/services/post-splitter";
import type { CreatePostsInput, ApiResponse, PostDto } from "@/src/types";
import { PostStatus } from "@prisma/client";

// ─── GET /api/posts ───────────────────────────────────────

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status") as PostStatus | null;
    const accountId = searchParams.get("accountId");

    const posts = await prisma.post.findMany({
      where: {
        ...(status ? { status } : {}),
        ...(accountId ? { accountId } : {}),
      },
      orderBy: [{ scheduledAt: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
    });

    const data: PostDto[] = posts.map(serializePost);
    return NextResponse.json<ApiResponse<PostDto[]>>({ ok: true, data });
  } catch (err) {
    console.error("[GET /api/posts]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to fetch posts" },
      { status: 500 }
    );
  }
}

// ─── POST /api/posts ──────────────────────────────────────

export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as CreatePostsInput;

    if (!body.rawText?.trim()) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "rawText is required" },
        { status: 400 }
      );
    }

    // アカウント取得またはデフォルト値を使用
    let accountId = body.accountId;
    if (!accountId) {
      // デフォルトアカウント（またはシステムアカウント）を取得
      const account = await prisma.account.findFirst({
        orderBy: { createdAt: "asc" },
      });
      if (account) {
        accountId = account.id;
      } else {
        // アカウントがない場合はダミーアカウントを作成
        const dummy = await prisma.account.create({
          data: {
            username: "system",
            displayName: "System",
            profileImage: null,
            accessToken: "dummy",
            refreshToken: null,
            tokenExpiresAt: null,
            isActive: true,
          },
        });
        accountId = dummy.id;
      }
    }

    // 分割
    const { items, warnings } = splitPosts(body.rawText);
    if (items.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "No posts found after splitting" },
        { status: 400 }
      );
    }

    const batchId = body.batchId ?? crypto.randomUUID();

    // バルクインサート
    const created = await prisma.$transaction(
      items.map((item, index) =>
        prisma.post.create({
          data: {
            content: item.content,
            sortOrder: index,
            batchId,
            accountId,
            status: "DRAFT",
          },
        })
      )
    );

    return NextResponse.json<ApiResponse<{ posts: PostDto[]; warnings: string[]; batchId: string }>>(
      {
        ok: true,
        data: {
          posts: created.map(serializePost),
          warnings,
          batchId,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/posts]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to create posts" },
      { status: 500 }
    );
  }
}

// ─── Serializer ───────────────────────────────────────────

function serializePost(post: {
  id: string;
  content: string;
  mediaUrls: string[];
  scheduledAt: Date | null;
  status: PostStatus;
  sortOrder: number;
  batchId: string | null;
  category: string | null;
  purpose: string | null;
  priority: number;
  accountId: string;
  createdAt: Date;
  updatedAt: Date;
}): PostDto {
  return {
    ...post,
    scheduledAt: post.scheduledAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}
