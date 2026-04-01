"use client";

import { useRef, useState } from "react";
import { Trash2, Clock, AlertTriangle, Camera, X as XIcon } from "lucide-react";
import { PostStatusBadge } from "./ui/StatusBadge";
import type { PostDto } from "@/src/types";
import type { ApiResponse } from "@/src/types";
import { clsx } from "clsx";

interface PostCardProps {
  post: PostDto;
  onDelete?: (id: string) => void;
  onUpdateSchedule?: (id: string, scheduledAt: string | null) => void;
  onMediaUpdate?: (id: string, mediaUrls: string[]) => void;
  showScheduler?: boolean;
}

export function PostCard({
  post,
  onDelete,
  onUpdateSchedule,
  onMediaUpdate,
  showScheduler = false,
}: PostCardProps) {
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [localMediaUrls, setLocalMediaUrls] = useState<string[]>(post.mediaUrls);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // X は最大 4 枚
    if (localMediaUrls.length >= 4) {
      setUploadError("画像は最大 4 枚まで添付できます");
      return;
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("postId", post.id);

      const res = await fetch("/api/media/upload", {
        method: "POST",
        body: formData,
      });

      const json: ApiResponse<{ url: string }> = await res.json();

      if (!json.ok || !json.data) {
        setUploadError(json.error ?? "アップロードに失敗しました");
        return;
      }

      const newUrls = [...localMediaUrls, json.data.url];
      setLocalMediaUrls(newUrls);
      onMediaUpdate?.(post.id, newUrls);
    } catch {
      setUploadError("アップロード中にエラーが発生しました");
    } finally {
      setIsUploading(false);
      // ファイル選択をリセット（同一ファイルを再選択できるように）
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleRemoveImage = async (urlToRemove: string) => {
    const newUrls = localMediaUrls.filter((u) => u !== urlToRemove);

    try {
      const res = await fetch(`/api/posts/${post.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mediaUrls: newUrls }),
      });

      const json: ApiResponse<PostDto> = await res.json();
      if (json.ok) {
        setLocalMediaUrls(newUrls);
        onMediaUpdate?.(post.id, newUrls);
      }
    } catch {
      // 楽観的更新はしない（エラー時は変更なし）
    }
  };

  const canAddMore =
    showScheduler &&
    !["PUBLISHED", "PUBLISHING"].includes(post.status) &&
    localMediaUrls.length < 4;

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

      {/* 画像サムネイル */}
      {localMediaUrls.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {localMediaUrls.map((url) => (
            <div key={url} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={url}
                alt="添付画像"
                className="w-[60px] h-[60px] object-cover rounded-md border border-gray-200"
              />
              {showScheduler && !["PUBLISHED", "PUBLISHING"].includes(post.status) && (
                <button
                  onClick={() => handleRemoveImage(url)}
                  className="absolute -top-1.5 -right-1.5 bg-gray-700 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity"
                  title="画像を削除"
                >
                  <XIcon size={10} />
                </button>
              )}
            </div>
          ))}
        </div>
      )}

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

            {/* 画像追加ボタン */}
            {canAddMore && (
              <div className="pl-0.5">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleFileSelect}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isUploading}
                  className={clsx(
                    "inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-md border transition",
                    isUploading
                      ? "border-gray-200 text-gray-400 cursor-not-allowed"
                      : "border-gray-300 text-gray-600 hover:border-gray-400 hover:text-gray-800"
                  )}
                >
                  <Camera size={13} />
                  {isUploading ? "アップロード中..." : "画像を追加"}
                  {localMediaUrls.length > 0 && (
                    <span className="text-gray-400">
                      ({localMediaUrls.length}/4)
                    </span>
                  )}
                </button>
                {uploadError && (
                  <p className="mt-1 text-xs text-red-500">{uploadError}</p>
                )}
              </div>
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
