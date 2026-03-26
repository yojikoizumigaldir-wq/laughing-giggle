// src/app/api/posts/import-scheduled/route.ts
// POST /api/posts/import-scheduled
// スロット自動スケジュール済み投稿を一括登録する

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { SLOT_DEFINITIONS } from "@/src/lib/slot-scheduler";
import type { ApiResponse } from "@/src/types";

interface ScheduledPostItem {
  text: string;
  slot: string;
  category?: string | null;
  priority?: number | null;
  scheduledAt: string; // ISO8601 (クライアント側でプレビュー計算済み)
}

interface ImportScheduledResult {
  created: number;
  batchId: string;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const posts: ScheduledPostItem[] = body?.posts;

    if (!Array.isArray(posts) || posts.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "posts が空または不正です" },
        { status: 400 }
      );
    }

    // ── バリデーション ──────────────────────────────────────────────────────
    const validSlots = new Set(Object.keys(SLOT_DEFINITIONS));
    for (let i = 0; i < posts.length; i++) {
      const post = posts[i];
      if (!post.text?.trim()) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `#${i + 1}: text が空です` },
          { status: 400 }
        );
      }
      if (!post.slot || !validSlots.has(post.slot)) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `#${i + 1}: slot "${post.slot}" は未定義です` },
          { status: 400 }
        );
      }
      if (!post.scheduledAt || isNaN(Date.parse(post.scheduledAt))) {
        return NextResponse.json<ApiResponse>(
          { ok: false, error: `#${i + 1}: scheduledAt が不正です` },
          { status: 400 }
        );
      }
    }

    // ── アカウント取得（既存ロジックと共通） ────────────────────────────────
    let accountId: string;
    const account = await prisma.account.findFirst({ orderBy: { createdAt: "asc" } });
    if (account) {
      accountId = account.id;
    } else {
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

    const batchId = crypto.randomUUID();

    // ── バルクインサート ─────────────────────────────────────────────────────
    await prisma.$transaction(
      posts.map((post, index) => {
        const scheduledAt = new Date(post.scheduledAt);
        console.log(
          `[import-scheduled] #${index + 1} slot=${post.slot} scheduledAt=${scheduledAt.toISOString()} text="${post.text.slice(0, 20)}…"`
        );
        return prisma.post.create({
          data: {
            content: post.text.trim(),
            sortOrder: index,
            batchId,
            accountId,
            status: "SCHEDULED",
            scheduledAt,
            category: post.category ?? null,
            purpose: null,
            priority:
              typeof post.priority === "number" ? post.priority : 0,
          },
        });
      })
    );

    console.log(
      `[import-scheduled] 完了 batchId=${batchId} created=${posts.length}`
    );

    return NextResponse.json<ApiResponse<ImportScheduledResult>>(
      { ok: true, data: { created: posts.length, batchId } },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/posts/import-scheduled]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "スケジュール登録に失敗しました" },
      { status: 500 }
    );
  }
}
