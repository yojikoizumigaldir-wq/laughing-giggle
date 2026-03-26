// src/app/api/posts/[id]/route.ts
// PATCH /api/posts/[id] - 投稿更新（日時・ステータス・内容）
// DELETE /api/posts/[id] - 投稿削除

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import type { ApiResponse, PostDto, UpdatePostInput } from "@/src/types";
import { PostStatus } from "@prisma/client";

// ─── PATCH ───────────────────────────────────────────────

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const body = (await req.json()) as UpdatePostInput;
    const { id } = params;

    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Post not found" },
        { status: 404 }
      );
    }

    // PUBLISHED / PUBLISHING は直接編集不可
    if (["PUBLISHED", "PUBLISHING"].includes(existing.status)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot edit a published post" },
        { status: 409 }
      );
    }

    const updated = await prisma.post.update({
      where: { id },
      data: {
        ...(body.content !== undefined ? { content: body.content } : {}),
        ...(body.scheduledAt !== undefined
          ? { scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null }
          : {}),
        ...(body.status !== undefined ? { status: body.status } : {}),
        ...(body.sortOrder !== undefined ? { sortOrder: body.sortOrder } : {}),
        ...(body.mediaUrls !== undefined ? { mediaUrls: body.mediaUrls } : {}),
      },
    });

    return NextResponse.json<ApiResponse<PostDto>>({
      ok: true,
      data: serializePost(updated),
    });
  } catch (err) {
    console.error("[PATCH /api/posts/[id]]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to update post" },
      { status: 500 }
    );
  }
}

// ─── DELETE ──────────────────────────────────────────────

export async function DELETE(
  _req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;

    const existing = await prisma.post.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Post not found" },
        { status: 404 }
      );
    }

    if (existing.status === "PUBLISHING") {
      console.warn(`[DELETE /api/posts/[id]] 削除不可 id=${id} status=PUBLISHING`);
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "Cannot delete a post that is currently publishing" },
        { status: 409 }
      );
    }

    console.log(`[DELETE /api/posts/[id]] 削除実行 id=${id} status=${existing.status}`);
    await prisma.post.delete({ where: { id } });
    console.log(`[DELETE /api/posts/[id]] 削除成功 id=${id}`);
    return NextResponse.json<ApiResponse>({ ok: true });
  } catch (err) {
    console.error("[DELETE /api/posts/[id]]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to delete post" },
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
