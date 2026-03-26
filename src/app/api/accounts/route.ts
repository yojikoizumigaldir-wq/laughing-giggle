// src/app/api/accounts/route.ts
// GET /api/accounts - アカウント一覧
// POST /api/accounts - OAuth 1.0a で新規アカウント接続

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/src/lib/prisma";
import { getMe } from "@/src/services/x-api/tweet";
import type { ApiResponse, AccountDto } from "@/src/types";

export async function GET() {
  try {
    const accounts = await prisma.account.findMany({
      orderBy: { createdAt: "asc" },
    });

    const data: AccountDto[] = accounts.map((acc) => ({
      id: acc.id,
      username: acc.username,
      displayName: acc.displayName,
      profileImage: acc.profileImage,
      isActive: acc.isActive,
      tokenExpiresAt: acc.tokenExpiresAt?.toISOString() ?? null,
      createdAt: acc.createdAt.toISOString(),
    }));

    return NextResponse.json<ApiResponse<AccountDto[]>>({ ok: true, data });
  } catch (err) {
    console.error("[GET /api/accounts]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: "Failed to fetch accounts" },
      { status: 500 }
    );
  }
}

export async function POST() {
  try {
    // OAuth 1.0a: 環境変数からトークンを使ってユーザー情報を取得
    const user = await getMe();

    // アカウントを upsert（既存なら更新）
    const account = await prisma.account.upsert({
      where: { username: user.username },
      create: {
        username: user.username,
        displayName: user.name,
        profileImage: user.profile_image_url ?? null,
        accessToken: "oauth1a_env", // OAuth 1.0a トークンは環境変数から直接読み込む
        refreshToken: null,
        tokenExpiresAt: null, // OAuth 1.0a トークンは無期限
        isActive: true,
      },
      update: {
        displayName: user.name,
        profileImage: user.profile_image_url ?? null,
        isActive: true,
      },
    });

    const response: AccountDto = {
      id: account.id,
      username: account.username,
      displayName: account.displayName,
      profileImage: account.profileImage,
      isActive: account.isActive,
      tokenExpiresAt: account.tokenExpiresAt?.toISOString() ?? null,
      createdAt: account.createdAt.toISOString(),
    };

    return NextResponse.json<ApiResponse<AccountDto>>(
      { ok: true, data: response },
      { status: 201 }
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("[POST /api/accounts]", err);
    return NextResponse.json<ApiResponse>(
      { ok: false, error: `Failed to connect account: ${message}` },
      { status: 400 }
    );
  }
}
