// src/app/api/posts/import-json/route.ts
// POST /api/posts/import-json - JSON配列から一括DRAFT保存

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import type { ApiResponse } from "@/src/types";

interface JsonPostItem {
  content?: string;
  category?: string | null;
  purpose?: string | null;
  priority?: number | null;
}

interface ImportJsonResult {
  created: number;
  skipped: number;
  batchId: string;
  errors: string[];
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!Array.isArray(body)) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "リクエストボディはJSON配列である必要があります" },
        { status: 400 }
      );
    }

    if (body.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "配列が空です" },
        { status: 400 }
      );
    }

    // アカウント取得（既存の /api/posts と同じロジック）
    let accountId: string;
    const account = await prisma.account.findFirst({
      orderBy: { createdAt: "asc" },
    });
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
    const errors: string[] = [];
    const validItems: { item: JsonPostItem; index: number }[] = [];

    // バリデーション：content 空はスキップ
    (body as JsonPostItem[]).forEach((item, i) => {
      if (!item.content?.trim()) {
        errors.push(`#${i + 1}: content が空のためスキップしました`);
      } else {
        validItems.push({ item, index: validItems.length });
      }
    });

    if (validItems.length === 0) {
      return NextResponse.json<ApiResponse>(
        { ok: false, error: "保存できる投稿がありません（全件スキップ）", },
        { status: 400 }
      );
    }

    // バルクインサート
    await prisma.$transaction(
      validItems.map(({ item, index }) =>
        prisma.post.create({
          data: {
            content: item.content!.trim(),
            sortOrder: index,
            batchId,
            accountId,
            status: "DRAFT",
            category: item.category ?? null,
            purpose: item.purpose ?? null,
            priority: typeof item.priority === "number" ? item.priority : 0,
          },
        })
      )
    );

    return NextResponse.json<ApiResponse<ImportJsonResult>>(
      {
        ok: true,
        data: {
          created: validItems.length,
          skipped: errors.length,
          batchId,
          errors,
        },
      },
      { status: 201 }
    );
  } catch (err) {
    console.error("[POST /api/posts/import-json]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "インポートに失敗しました" },
      { status: 500 }
    );
  }
}
