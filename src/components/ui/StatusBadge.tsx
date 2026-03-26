"use client";

import type { PostStatus, LogStatus } from "@/src/types";
import { clsx } from "clsx";

// ─── Post ステータスバッジ ─────────────────────────────────

const POST_STATUS_MAP: Record<
  PostStatus,
  { label: string; className: string }
> = {
  DRAFT: { label: "下書き", className: "bg-gray-100 text-gray-700" },
  SCHEDULED: { label: "予約済", className: "bg-blue-100 text-blue-700" },
  PUBLISHING: { label: "投稿中", className: "bg-yellow-100 text-yellow-700 animate-pulse" },
  PUBLISHED: { label: "投稿済", className: "bg-green-100 text-green-700" },
  FAILED: { label: "失敗", className: "bg-red-100 text-red-700" },
  CANCELLED: { label: "キャンセル", className: "bg-gray-100 text-gray-400" },
};

const LOG_STATUS_MAP: Record<
  LogStatus,
  { label: string; className: string }
> = {
  SUCCESS: { label: "成功", className: "bg-green-100 text-green-700" },
  FAILED: { label: "失敗", className: "bg-red-100 text-red-700" },
  RETRYING: { label: "再試行中", className: "bg-yellow-100 text-yellow-700" },
};

interface PostStatusBadgeProps {
  status: PostStatus;
  className?: string;
}

export function PostStatusBadge({ status, className }: PostStatusBadgeProps) {
  const { label, className: colorClass } = POST_STATUS_MAP[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}

interface LogStatusBadgeProps {
  status: LogStatus;
  className?: string;
}

export function LogStatusBadge({ status, className }: LogStatusBadgeProps) {
  const { label, className: colorClass } = LOG_STATUS_MAP[status];
  return (
    <span
      className={clsx(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        colorClass,
        className
      )}
    >
      {label}
    </span>
  );
}
