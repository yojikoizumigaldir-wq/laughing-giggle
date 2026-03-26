import { prisma } from "@/src/lib/prisma";
import { isFixedAccountEnabled, upsertFixedAccount } from "@/src/lib/fixed-account";
import type { AccountDto } from "@/src/types";
import { CheckCircle, AlertCircle, ExternalLink, Lock } from "lucide-react";
import { ConnectButton } from "./ConnectButton";

async function getAccounts(): Promise<AccountDto[]> {
  // 固定アカウントモードが有効なら、ページ表示のたびに DB へ upsert
  if (isFixedAccountEnabled()) {
    await upsertFixedAccount();
  }

  const accounts = await prisma.account.findMany({
    orderBy: { createdAt: "asc" },
  });
  return accounts.map((acc) => ({
    id: acc.id,
    username: acc.username,
    displayName: acc.displayName,
    profileImage: acc.profileImage,
    isActive: acc.isActive,
    tokenExpiresAt: acc.tokenExpiresAt?.toISOString() ?? null,
    createdAt: acc.createdAt.toISOString(),
  }));
}

export default async function AccountsPage({
  searchParams,
}: {
  searchParams: { success?: string; error?: string };
}) {
  const accounts = await getAccounts();
  const fixedEnabled = isFixedAccountEnabled();
  const fixedUsername = process.env.X_FIXED_ACCOUNT_USERNAME ?? "";

  const errorMessages: Record<string, string> = {
    oauth_denied: "X認証が拒否されました。再度お試しください。",
    missing_params: "認証パラメータが不正です。",
    state_mismatch: "セキュリティエラー: state が一致しませんでした。",
    missing_verifier: "認証情報が見つかりません。",
    token_exchange_failed: "トークン取得に失敗しました。X Developer Consoleの設定を確認してください。",
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">アカウント</h1>
        <p className="text-sm text-gray-500 mt-1">
          X アカウントの接続・管理を行います。
        </p>
      </div>

      {/* 固定アカウントモードバナー */}
      {fixedEnabled && (
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4 mb-6 flex items-start gap-3 text-sm text-indigo-800">
          <Lock size={16} className="flex-shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">固定アカウントモード有効</p>
            <p className="text-indigo-600 mt-0.5">
              投稿先は <strong>@{fixedUsername}</strong> に固定されています。
              OAuth 1.0a 環境変数（X_ACCESS_TOKEN）の認証情報を使って投稿します。
            </p>
          </div>
        </div>
      )}

      {/* 成功 / エラーメッセージ */}
      {searchParams.success === "connected" && (
        <div className="rounded-xl border border-green-200 bg-green-50 p-4 mb-6 flex items-center gap-2 text-sm text-green-700">
          <CheckCircle size={16} />
          アカウントが正常に接続されました。
        </div>
      )}
      {searchParams.error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-6 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {errorMessages[searchParams.error] ?? "エラーが発生しました。"}
        </div>
      )}

      {/* アカウント一覧 */}
      <div className="space-y-3 mb-6">
        {accounts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-gray-200 bg-white p-8 text-center">
            <p className="text-sm text-gray-400 mb-4">
              まだアカウントが接続されていません。
            </p>
          </div>
        ) : (
          accounts.map((acc) => {
            const isFixed = fixedEnabled && acc.username === fixedUsername;
            const isExpired =
              !isFixed && // 固定アカウントはトークン期限切れ扱いにしない
              acc.tokenExpiresAt
                ? new Date(acc.tokenExpiresAt) < new Date()
                : false;

            return (
              <div
                key={acc.id}
                className={`rounded-xl border p-4 flex items-center gap-4 ${
                  isFixed
                    ? "border-indigo-200 bg-indigo-50"
                    : "border-gray-100 bg-white"
                }`}
              >
                {/* アイコン */}
                {acc.profileImage ? (
                  <img
                    src={acc.profileImage}
                    alt={acc.username}
                    className="w-10 h-10 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-gray-200 flex items-center justify-center text-gray-500 font-bold text-sm">
                    {acc.username[0]?.toUpperCase()}
                  </div>
                )}

                {/* 情報 */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-semibold text-gray-900 truncate">
                      {acc.displayName}
                    </p>
                    {isFixed && (
                      <span className="text-xs text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                        <Lock size={10} />
                        固定投稿アカウント
                      </span>
                    )}
                    {isExpired && (
                      <span className="text-xs text-red-500 bg-red-50 px-2 py-0.5 rounded-full">
                        トークン期限切れ
                      </span>
                    )}
                    {acc.isActive && !isExpired && (
                      <CheckCircle size={14} className="text-green-500" />
                    )}
                  </div>
                  <p className="text-xs text-gray-400 mt-0.5">@{acc.username}</p>
                  {isFixed ? (
                    <p className="text-xs text-indigo-400 mt-0.5">
                      OAuth 1.0a（環境変数）で認証
                    </p>
                  ) : (
                    acc.tokenExpiresAt && (
                      <p className="text-xs text-gray-300 mt-0.5">
                        トークン有効期限:{" "}
                        {new Date(acc.tokenExpiresAt).toLocaleString("ja-JP")}
                      </p>
                    )
                  )}
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* 固定モード有効時は OAuth 接続ボタンを注意書き付きで表示 */}
      {fixedEnabled ? (
        <div className="rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-400">
          固定アカウントモードが有効なため、ブラウザ OAuth 接続は投稿には使用されません。
        </div>
      ) : (
        <ConnectButton />
      )}

      {/* 設定ガイド */}
      <div className="mt-6 rounded-xl border border-gray-100 bg-gray-50 p-4 text-xs text-gray-500 space-y-2">
        <p className="font-semibold text-gray-700">事前準備</p>
        <ol className="space-y-1 list-decimal list-inside">
          <li>
            <a
              href="https://developer.x.com/en/portal/dashboard"
              target="_blank"
              rel="noopener noreferrer"
              className="text-black underline inline-flex items-center gap-0.5"
            >
              X Developer Console <ExternalLink size={10} />
            </a>{" "}
            で App を作成
          </li>
          <li>
            固定アカウントモード：X_ACCESS_TOKEN / X_ACCESS_TOKEN_SECRET を
            投稿したいアカウントのトークンに設定
          </li>
          <li>X_FIXED_ACCOUNT_ENABLED=true を .env.local に設定</li>
        </ol>
      </div>
    </div>
  );
}
