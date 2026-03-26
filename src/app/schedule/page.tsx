"use client";

import { useEffect, useState, useCallback } from "react";
import { PostCard } from "@/src/components/PostCard";
import type { PostDto } from "@/src/types";
import { RefreshCw, CheckSquare, Trash2, Square, CheckSquare2 } from "lucide-react";

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

let toastSeq = 0;

export default function SchedulePage() {
  const [posts, setPosts] = useState<PostDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = (type: Toast["type"], message: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts?status=DRAFT&status=SCHEDULED");
      const json = await res.json();
      if (json.ok) {
        setPosts(json.data);
        setSelected(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
  }, [fetchPosts]);

  const handleDelete = (id: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== id));
    setSelected((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
  };

  const handleUpdateSchedule = async (id: string, scheduledAt: string | null) => {
    setSaving(id);
    try {
      const res = await fetch(`/api/posts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
          status: scheduledAt ? "SCHEDULED" : "DRAFT",
        }),
      });
      const json = await res.json();
      if (json.ok) {
        setPosts((prev) => prev.map((p) => (p.id === id ? json.data : p)));
      }
    } finally {
      setSaving(null);
    }
  };

  // ── チェックボックス操作 ────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selected.size === posts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(posts.map((p) => p.id)));
    }
  };

  // ── 一括削除 ───────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`選択した ${selected.size} 件を削除しますか？`)) return;

    setBulkDeleting(true);
    const ids = Array.from(selected);
    let succeeded = 0;
    let failed = 0;

    await Promise.all(
      ids.map(async (id) => {
        try {
          const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
          const json = await res.json();
          if (json.ok) {
            succeeded++;
          } else {
            failed++;
          }
        } catch {
          failed++;
        }
      })
    );

    setPosts((prev) => prev.filter((p) => !selected.has(p.id) || failed > 0 ? !ids.includes(p.id) || false : true));
    // シンプルに再フェッチして整合性を保つ
    await fetchPosts();

    if (failed === 0) {
      addToast("success", `🗑️ ${succeeded} 件を削除しました`);
    } else {
      addToast("error", `⚠️ ${succeeded} 件削除、${failed} 件失敗`);
    }
    setBulkDeleting(false);
  };

  const scheduledCount = posts.filter((p) => p.status === "SCHEDULED").length;
  const allSelected = posts.length > 0 && selected.size === posts.length;
  const someSelected = selected.size > 0 && selected.size < posts.length;

  return (
    <div>
      {/* トースト */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-4 py-2.5 rounded-lg shadow-lg text-sm text-white ${
              t.type === "success" ? "bg-green-600" : "bg-red-600"
            }`}
          >
            {t.message}
          </div>
        ))}
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">スケジュール</h1>
          <p className="text-sm text-gray-500 mt-1">各投稿の予約日時を設定します。</p>
        </div>
        <button
          onClick={fetchPosts}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-black transition"
        >
          <RefreshCw size={14} />
          更新
        </button>
      </div>

      {/* サマリー + 一括操作バー */}
      {posts.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white p-4 mb-4 flex items-center justify-between gap-4 text-sm">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5 text-gray-600">
              <CheckSquare size={15} className="text-blue-500" />
              <span>予約済み: <strong>{scheduledCount}</strong> 件</span>
            </div>
            <div className="text-gray-400">
              未設定: <strong>{posts.length - scheduledCount}</strong> 件
            </div>
          </div>

          {/* 全選択 + 一括削除 */}
          <div className="flex items-center gap-3">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-black transition"
            >
              {allSelected ? (
                <CheckSquare2 size={15} className="text-black" />
              ) : someSelected ? (
                <CheckSquare2 size={15} className="text-gray-400" />
              ) : (
                <Square size={15} />
              )}
              {allSelected ? "全解除" : "全選択"}
            </button>

            {selected.size > 0 && (
              <button
                onClick={handleBulkDelete}
                disabled={bulkDeleting}
                className="flex items-center gap-1.5 text-xs border border-red-500 text-red-500 rounded-lg px-3 py-1.5 hover:bg-red-500 hover:text-white disabled:opacity-40 transition font-medium"
              >
                <Trash2 size={13} />
                {bulkDeleting ? "削除中..." : `${selected.size} 件を削除`}
              </button>
            )}
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-16 text-sm">読み込み中...</div>
      ) : posts.length === 0 ? (
        <div className="text-center text-gray-400 py-16 text-sm">
          投稿がありません。
          <a href="/import" className="underline ml-1 text-black">
            インポート
          </a>
          から追加してください。
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post) => (
            <div key={post.id} className="flex items-start gap-3">
              {/* チェックボックス */}
              <button
                onClick={() => toggleSelect(post.id)}
                className="mt-4 flex-shrink-0 text-gray-300 hover:text-black transition"
              >
                {selected.has(post.id) ? (
                  <CheckSquare2 size={18} className="text-black" />
                ) : (
                  <Square size={18} />
                )}
              </button>

              {/* カード */}
              <div className="flex-1 relative">
                {saving === post.id && (
                  <div className="absolute inset-0 bg-white/60 rounded-xl flex items-center justify-center z-10">
                    <span className="text-xs text-gray-500">保存中...</span>
                  </div>
                )}
                <PostCard
                  post={post}
                  onDelete={handleDelete}
                  onUpdateSchedule={handleUpdateSchedule}
                  showScheduler
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
