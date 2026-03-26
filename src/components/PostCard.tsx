"use client";

import { useState } from "react";
import { Trash2, Clock, AlertTriangle } from "lucide-react";
import { PostStatusBadge } from "./ui/StatusBadge";
import type { PostDto } from "@/src/types";
import { clsx } from "clsx";

interface PostCardProps {
  post: PostDto;
  onDelete?: (id: string) => void;
  onUpdateSchedule?: (id: string, scheduledAt: string | null) => void;
  showScheduler?: boolean;
}

export function PostCard({
  post,
  onDelete,
  onUpdateSchedule,
  showScheduler = false,
}: PostCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const charCount = post.content.length;
  const isOverLimit = charCount > 280;

  const handleDelete = async () => {
    if (!window.confirm("この投稿を削除しますか？")) return;
    setIsDeleting(true);
    try {
      await fetch(`/api/posts/${post.id}`, { method: "DELETE" });
      onDelete?.(post.id);
    } finally {
      setIsDeleting(false);
    }
  };

  const handleScheduleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdateSchedule?.(post.id, e.target.value || null);
  };

  return (
    <div
      className={clsx(
        "rounded-xl border bg-white p-4 shadow-sm transition",
        isOverLimit ? "border-red-300" : "border-gray-200",
        post.status === "PUBLISHED" && "opacity-60"
      )}
    >
      {/* ヘッダー */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <PostStatusBadge status={post.status} />
        <div className="flex items-center gap-2">
          <span
            className={clsx(
              "text-xs font-mono",
              isOverLimit ? "text-red-500 font-bold" : "text-gray-400"
            )}
          >
            {charCount}/280
          </span>
          {isOverLimit && (
            <AlertTriangle size={14} className="text-red-500" />
          )}
          {onDelete && post.status !== "PUBLISHED" && (
            <button
              onClick={handleDelete}
              disabled={isDeleting}
              className="text-gray-300 hover:text-red-400 transition"
              title="削除"
            >
              <Trash2 size={15} />
            </button>
          )}
        </div>
      </div>

      {/* 本文 */}
      <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
        {post.content}
      </p>

      {/* スケジューラー */}
      {showScheduler && !["PUBLISHED", "PUBLISHING"].includes(post.status) && (() => {
        const isOverdue =
          post.status === "SCHEDULED" &&
          !!post.scheduledAt &&
          new Date(post.scheduledAt) < new Date();
        return (
          <div className="mt-3 pt-3 border-t border-gray-100 space-y-1.5">
            <div className="flex items-center gap-2">
              <Clock
                size={14}
                className={isOverdue ? "text-orange-400 flex-shrink-0" : "text-gray-400 flex-shrink-0"}
              />
              <input
                type="datetime-local"
                defaultValue={
                  post.scheduledAt
                    ? new Date(post.scheduledAt).toISOString().slice(0, 16)
                    : ""
                }
                onChange={handleScheduleChange}
                className={clsx(
                  "text-xs border rounded-md px-2 py-1 focus:outline-none focus:ring-1 focus:ring-black",
                  isOverdue
                    ? "border-orange-300 text-orange-600 bg-orange-50"
                    : "border-gray-200 text-gray-700"
                )}
              />
            </div>
            {isOverdue && (
              <p className="text-xs text-orange-500 font-medium pl-5">
                ⚠ 予約時刻を過ぎています。時刻を更新してください。
              </p>
            )}
          </div>
        );
      })()}

      {/* 予約日時表示（スケジューラーなしモード） */}
      {!showScheduler && post.scheduledAt && (() => {
        const isOverdue =
          post.status === "SCHEDULED" &&
          new Date(post.scheduledAt) < new Date();
        return (
          <div
            className={clsx(
              "mt-2 flex items-center gap-1 text-xs rounded px-1.5 py-0.5 w-fit",
              isOverdue
                ? "bg-orange-50 text-orange-500 font-medium"
                : "text-gray-400"
            )}
          >
            <Clock size={12} className={isOverdue ? "text-orange-400" : ""} />
            <span>
              {new Date(post.scheduledAt).toLocaleString("ja-JP")}
            </span>
            {isOverdue && (
              <span className="ml-0.5 text-orange-400 font-bold">⚠ 期限超過</span>
            )}
          </div>
        );
      })()}
    </div>
  );
}
