// src/lib/fixed-account.ts
// 固定アカウントモードのユーティリティ
//
// X_FIXED_ACCOUNT_ENABLED=true のとき、
// ブラウザ OAuth を使わず env vars の認証情報で投稿する「固定アカウント」を
// Account テーブルに upsert して管理する。
//
// 投稿処理（scheduler.ts / tweet.ts）は OAuth 1.0a env vars を直接参照するため、
// この関数は「DB への登録」のみを担当する。

import { prisma } from "./prisma";

/** 固定アカウントモードが有効かどうか */
export function isFixedAccountEnabled(): boolean {
  return process.env.X_FIXED_ACCOUNT_ENABLED === "true";
}

/**
 * 固定アカウントを Account テーブルに upsert する。
 * - すでに存在する場合は displayName / profileImage / isActive を更新
 * - 投稿に使う OAuth 1.0a トークンは env vars から直接読むため、
 *   accessToken には識別用の固定文字列 "oauth1a-fixed" を入れる
 */
export async function upsertFixedAccount(): Promise<void> {
  const username = process.env.X_FIXED_ACCOUNT_USERNAME;
  if (!username) {
    console.warn("[fixed-account] X_FIXED_ACCOUNT_USERNAME が未設定のためスキップ");
    return;
  }

  const displayName =
    process.env.X_FIXED_ACCOUNT_DISPLAY_NAME || username;
  const profileImage =
    process.env.X_FIXED_ACCOUNT_PROFILE_IMAGE || null;

  await prisma.account.upsert({
    where: { username },
    create: {
      username,
      displayName,
      profileImage: profileImage || null,
      // 投稿時は oauth1a.ts が env vars を直接読むため DB トークンは使わない
      accessToken: "oauth1a-fixed",
      refreshToken: null,
      tokenExpiresAt: null,
      isActive: true,
    },
    update: {
      displayName,
      profileImage: profileImage || null,
      isActive: true,
    },
  });

  console.log(`[fixed-account] @${username} を固定アカウントとして登録`);
}
