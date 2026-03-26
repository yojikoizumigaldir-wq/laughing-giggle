"use client";

import { useEffect, useState, useCallback } from "react";
import { LogStatusBadge } from "@/src/components/ui/StatusBadge";
import type { PostLogDto } from "@/src/types";
import { RefreshCw, ChevronDown, ChevronUp } from "lucide-react";

export default function LogsPage() {
  const [logs, setLogs] = useState<PostLogDto[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"" | "SUCCESS" | "FAILED" | "RETRYING">("");
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filter) params.set("status", filter);
      const res = await fetch(`/api/logs?${params.toString()}`);
      const json = await res.json();
      if (json.ok) {
        setLogs(json.data.logs);
        setTotal(json.data.total);
      }
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return (
    <div>
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">ログ</h1>
          <p className="text-sm text-gray-500 mt-1">
            投稿の成功・失敗記録を確認できます。
          </p>
        </div>
        <button
          onClick={fetchLogs}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-black transition"
        >
          <RefreshCw size={14} />
          更新
        </button>
      </div>

      {/* フィルター */}
      <div className="flex gap-2 mb-4">
        {(["", "SUCCESS", "FAILED", "RETRYING"] as const).map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
              filter === status
                ? "bg-black text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {status === "" ? "すべて" : status === "SUCCESS" ? "成功" : status === "FAILED" ? "失敗" : "再試行中"}
          </button>
        ))}
        <span className="ml-auto text-xs text-gray-400 self-center">
          {total} 件
        </span>
      </div>

      {loading ? (
        <div className="text-center text-gray-400 py-16 text-sm">読み込み中...</div>
      ) : logs.length === 0 ? (
        <div className="text-center text-gray-400 py-16 text-sm">
          ログがありません。
        </div>
      ) : (
        <div className="space-y-2">
          {logs.map((log) => (
            <div
              key={log.id}
              className="rounded-xl border border-gray-100 bg-white overflow-hidden"
            >
              {/* ヘッダー行 */}
              <div className="flex items-center gap-3 px-4 py-3">
                <LogStatusBadge status={log.status} />
                <span className="text-xs text-gray-400 font-mono">
                  @{log.accountUsername}
                </span>
                <span className="text-sm text-gray-700 truncate flex-1">
                  {log.postContent?.slice(0, 50)}
                  {(log.postContent?.length ?? 0) > 50 ? "…" : ""}
                </span>
                <span className="text-xs text-gray-400 whitespace-nowrap">
                  {new Date(log.createdAt).toLocaleString("ja-JP")}
                </span>
                {(log.xTweetId || log.errorBody) && (
                  <button
                    onClick={() =>
                      setExpandedId(expandedId === log.id ? null : log.id)
                    }
                    className="text-gray-300 hover:text-black transition"
                  >
                    {expandedId === log.id ? (
                      <ChevronUp size={16} />
                    ) : (
                      <ChevronDown size={16} />
                    )}
                  </button>
                )}
              </div>

              {/* 展開詳細 */}
              {expandedId === log.id && (
                <div className="px-4 pb-4 pt-0 border-t border-gray-50">
                  {log.xTweetId && (
                    <div className="mt-2 text-xs text-gray-500">
                      Tweet ID:{" "}
                      <a
                        href={`https://x.com/i/web/status/${log.xTweetId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-black underline font-mono"
                      >
                        {log.xTweetId}
                      </a>
                    </div>
                  )}
                  {log.errorCode && (
                    <div className="mt-2 text-xs text-red-500">
                      エラーコード: <code>{log.errorCode}</code>
                    </div>
                  )}
                  {log.errorBody && (
                    <div className="mt-2">
                      <p className="text-xs text-gray-500 mb-1">エラー詳細:</p>
                      <pre className="text-xs bg-gray-50 rounded-lg p-3 overflow-x-auto text-red-600 whitespace-pre-wrap break-all">
                        {log.errorBody}
                      </pre>
                    </div>
                  )}
                  {log.retryCount > 0 && (
                    <div className="mt-2 text-xs text-gray-400">
                      リトライ回数: {log.retryCount}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
