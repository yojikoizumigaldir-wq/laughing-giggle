"use client";

import { useEffect, useState, useCallback } from "react";
import { PostCard } from "@/src/components/PostCard";
import type { PostDto } from "@/src/types";
import {
  Send,
  RefreshCw,
  Trash2,
  RotateCcw,
  Square,
  CheckSquare2,
  CalendarClock,
  Check,
  X,
} from "lucide-react";

interface UserInfo {
  username: string;
  displayName: string;
  profileImage: string | null;
}

interface Toast {
  id: number;
  type: "success" | "error";
  message: string;
}

let toastSeq = 0;

// "YYYY-MM-DDTHH:mm" 形式に変換（datetime-local 用）
function toDatetimeLocal(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

export default function PublishPage() {
  const [posts, setPosts] = useState<PostDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState<string | null>(null);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);
  const [userInfo, setUserInfo] = useState<UserInfo | null>(null);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [bulkDeleting, setBulkDeleting] = useState(false);

  // リスケジュール用: postId → 入力中の日時文字列
  const [reschedulingId, setReschedulingId] = useState<string | null>(null);
  const [rescheduleValue, setRescheduleValue] = useState("");

  const addToast = (type: Toast["type"], message: string) => {
    const id = ++toastSeq;
    setToasts((prev) => [...prev, { id, type, message }]);
    setTimeout(() => setToasts((prev) => prev.filter((t) => t.id !== id)), 4000);
  };

  const fetchPosts = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/posts");
      const json = await res.json();
      if (json.ok) {
        const filtered = (json.data as PostDto[]).filter((p) =>
          ["DRAFT", "SCHEDULED", "FAILED", "PUBLISHED"].includes(p.status)
        );
        setPosts(filtered);
        setSelected(new Set());
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPosts();
    setUserInfo({
      username: "bearer_token",
      displayName: "Gigumin_Meg (Bearer Token)",
      profileImage: null,
    });
  }, [fetchPosts]);

  // ── 個別操作 ────────────────────────────────────────────────────────────────
  const handlePublishNow = async (postId: string) => {
    if (!window.confirm("今すぐ投稿しますか？")) return;
    setPublishing(postId);
    try {
      const res = await fetch("/api/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId }),
      });
      const json = await res.json();
      if (json.ok) {
        addToast("success", `✅ 投稿しました！ Tweet ID: ${json.data.tweetId}`);
        fetchPosts();
      } else {
        addToast("error", `❌ エラー: ${json.error}`);
      }
    } finally {
      setPublishing(null);
    }
  };

  const handleDeleteOne = async (postId: string) => {
    setActionInProgress(postId);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      const json = await res.json();
      if (json.ok) {
        addToast("success", "🗑️ 削除しました");
        setPosts((prev) => prev.filter((p) => p.id !== postId));
        setSelected((prev) => { const n = new Set(prev); n.delete(postId); return n; });
      } else {
        addToast("error", `❌ 削除失敗: ${json.error}`);
      }
    } finally {
      setActionInProgress(null);
    }
  };

  const handleRevertToDraft = async (postId: string) => {
    if (!window.confirm("この投稿を下書きに戻しますか？\nスケジュールはクリアされます。")) return;
    setActionInProgress(postId);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "DRAFT", scheduledAt: null }),
      });
      const json = await res.json();
      if (json.ok) {
        addToast("success", "↩️ 下書きに戻しました");
        setPosts((prev) => prev.filter((p) => p.id !== postId));
      } else {
        addToast("error", `❌ 失敗: ${json.error}`);
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // ── リスケジュール ───────────────────────────────────────────────────────────
  const openReschedule = (post: PostDto) => {
    setReschedulingId(post.id);
    setRescheduleValue(post.scheduledAt ? toDatetimeLocal(post.scheduledAt) : "");
  };

  const cancelReschedule = () => {
    setReschedulingId(null);
    setRescheduleValue("");
  };

  const commitReschedule = async (postId: string) => {
    if (!rescheduleValue) {
      addToast("error", "日時を選択してください");
      return;
    }
    const newDate = new Date(rescheduleValue);
    if (isNaN(newDate.getTime())) {
      addToast("error", "日時が不正です");
      return;
    }
    setActionInProgress(postId);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scheduledAt: newDate.toISOString(),
          status: "SCHEDULED",
        }),
      });
      const json = await res.json();
      if (json.ok) {
        addToast("success", "📅 リスケジュールしました");
        setPosts((prev) =>
          prev.map((p) =>
            p.id === postId
              ? { ...p, scheduledAt: newDate.toISOString(), status: "SCHEDULED" }
              : p
          )
        );
        cancelReschedule();
      } else {
        addToast("error", `❌ 失敗: ${json.error}`);
      }
    } finally {
      setActionInProgress(null);
    }
  };

  // ── チェックボックス ─────────────────────────────────────────────────────────
  const toggleSelect = (id: string) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      return n;
    });
  };

  const selectablePosts = posts.filter((p) => p.status !== "PUBLISHED");

  const toggleSelectAll = () => {
    if (selected.size === selectablePosts.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(selectablePosts.map((p) => p.id)));
    }
  };

  const toggleSelectSection = (sectionPosts: PostDto[]) => {
    const ids = sectionPosts.map((p) => p.id);
    const allIn = ids.every((id) => selected.has(id));
    setSelected((prev) => {
      const n = new Set(prev);
      if (allIn) ids.forEach((id) => n.delete(id));
      else ids.forEach((id) => n.add(id));
      return n;
    });
  };

  // ── 一括削除 ─────────────────────────────────────────────────────────────────
  const handleBulkDelete = async () => {
    if (selected.size === 0) return;
    if (!window.confirm(`選択した ${selected.size} 件を削除しますか？`)) return;
    setBulkDeleting(true);
    const ids = Array.from(selected);
    let ok = 0; let ng = 0;
    await Promise.all(ids.map(async (id) => {
      try {
        const res = await fetch(`/api/posts/${id}`, { method: "DELETE" });
        const json = await res.json();
        if (json.ok) ok++; else ng++;
      } catch { ng++; }
    }));
    await fetchPosts();
    if (ng === 0) addToast("success", `🗑️ ${ok} 件を削除しました`);
    else addToast("error", `⚠️ ${ok} 件削除、${ng} 件失敗`);
    setBulkDeleting(false);
  };

  const grouped = {
    scheduled: posts.filter((p) => p.status === "SCHEDULED"),
    failed: posts.filter((p) => p.status === "FAILED"),
    draft: posts.filter((p) => p.status === "DRAFT"),
    published: posts.filter((p) => p.status === "PUBLISHED"),
  };

  const allSelected = selectablePosts.length > 0 && selected.size === selectablePosts.length;

  // ── チェックボックス付きカード共通レンダラー ─────────────────────────────────
  const renderCheckableCard = (post: PostDto, actions: React.ReactNode) => (
    <div key={post.id} className="flex items-start gap-3">
      <button
        onClick={() => toggleSelect(post.id)}
        className="mt-4 flex-shrink-0 text-gray-300 hover:text-black transition"
      >
        {selected.has(post.id)
          ? <CheckSquare2 size={18} className="text-black" />
          : <Square size={18} />}
      </button>
      <div className="flex-1 flex flex-col gap-2">
        <PostCard post={post} />
        {actions}
      </div>
    </div>
  );

  return (
    <div>
      {/* トースト */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className={`px-4 py-2.5 rounded-lg shadow-lg text-sm text-white ${
            t.type === "success" ? "bg-green-600" : "bg-red-600"
          }`}>
            {t.message}
          </div>
        ))}
      </div>

      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">投稿確認</h1>
          <p className="text-sm text-gray-500 mt-1">予約済み投稿の確認・即時投稿ができます。</p>
        </div>
        <button onClick={fetchPosts} className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-black transition">
          <RefreshCw size={14} />更新
        </button>
      </div>

      {/* 投稿先アカウント情報 */}
      {userInfo && (
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 mb-4">
          <div className="flex items-center gap-3">
            {userInfo.profileImage && (
              <img src={userInfo.profileImage} alt={userInfo.username} className="w-10 h-10 rounded-full" />
            )}
            <div>
              <p className="text-sm font-semibold text-gray-900">投稿先: {userInfo.displayName}</p>
              <p className="text-xs text-gray-600">@{userInfo.username}</p>
            </div>
          </div>
        </div>
      )}

      {/* 一括操作バー */}
      {selectablePosts.length > 0 && (
        <div className="rounded-xl border border-gray-100 bg-white px-4 py-3 mb-6 flex items-center justify-between gap-4 text-sm">
          <button
            onClick={toggleSelectAll}
            className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-black transition"
          >
            {allSelected
              ? <CheckSquare2 size={15} className="text-black" />
              : <Square size={15} />}
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
      )}

      {loading ? (
        <div className="text-center text-gray-400 py-16 text-sm">読み込み中...</div>
      ) : (
        <div className="space-y-8">

          {/* 予約済み */}
          {grouped.scheduled.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-400 inline-block" />
                  予約済み ({grouped.scheduled.length})
                </h2>
                <button
                  onClick={() => toggleSelectSection(grouped.scheduled)}
                  className="text-xs text-gray-400 hover:text-black transition"
                >
                  {grouped.scheduled.every((p) => selected.has(p.id)) ? "解除" : "全選択"}
                </button>
              </div>
              <div className="space-y-3">
                {grouped.scheduled.map((post) =>
                  renderCheckableCard(post, (
                    <div className="flex flex-col gap-2">
                      {/* 3ボタン行 */}
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          onClick={() => handlePublishNow(post.id)}
                          disabled={publishing === post.id || actionInProgress === post.id || reschedulingId === post.id}
                          className="flex items-center justify-center gap-1.5 border border-black text-black rounded-lg px-3 py-2 text-sm hover:bg-black hover:text-white disabled:opacity-40 transition"
                        >
                          <Send size={13} />
                          {publishing === post.id ? "投稿中..." : "今すぐ投稿"}
                        </button>
                        <button
                          onClick={() =>
                            reschedulingId === post.id ? cancelReschedule() : openReschedule(post)
                          }
                          disabled={actionInProgress === post.id || publishing === post.id}
                          className={`flex items-center justify-center gap-1.5 border rounded-lg px-3 py-2 text-sm disabled:opacity-40 transition ${
                            reschedulingId === post.id
                              ? "border-orange-400 text-orange-500 bg-orange-50"
                              : "border-blue-400 text-blue-500 hover:bg-blue-50"
                          }`}
                        >
                          <CalendarClock size={13} />
                          {reschedulingId === post.id ? "キャンセル" : "リスケ"}
                        </button>
                        <button
                          onClick={() => handleDeleteOne(post.id)}
                          disabled={actionInProgress === post.id || publishing === post.id || reschedulingId === post.id}
                          className="flex items-center justify-center gap-1.5 border border-red-500 text-red-500 rounded-lg px-3 py-2 text-sm hover:bg-red-500 hover:text-white disabled:opacity-40 transition font-medium"
                        >
                          <Trash2 size={13} />
                          {actionInProgress === post.id ? "処理中..." : "削除"}
                        </button>
                      </div>

                      {/* リスケジュール入力欄（展開時のみ） */}
                      {reschedulingId === post.id && (
                        <div className="flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2">
                          <CalendarClock size={14} className="text-orange-400 flex-shrink-0" />
                          <input
                            type="datetime-local"
                            value={rescheduleValue}
                            onChange={(e) => setRescheduleValue(e.target.value)}
                            className="flex-1 text-sm border border-orange-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-orange-400 bg-white"
                            autoFocus
                          />
                          <button
                            onClick={() => commitReschedule(post.id)}
                            disabled={!rescheduleValue || actionInProgress === post.id}
                            className="flex items-center gap-1 bg-orange-500 text-white rounded px-2.5 py-1 text-xs font-medium hover:bg-orange-600 disabled:opacity-40 transition"
                          >
                            <Check size={12} />
                            保存
                          </button>
                          <button
                            onClick={cancelReschedule}
                            className="text-gray-400 hover:text-black transition"
                          >
                            <X size={16} />
                          </button>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* 失敗 */}
          {grouped.failed.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-red-600 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-red-400 inline-block" />
                  失敗（再試行可能）({grouped.failed.length})
                </h2>
                <button
                  onClick={() => toggleSelectSection(grouped.failed)}
                  className="text-xs text-gray-400 hover:text-black transition"
                >
                  {grouped.failed.every((p) => selected.has(p.id)) ? "解除" : "全選択"}
                </button>
              </div>
              <div className="space-y-3">
                {grouped.failed.map((post) =>
                  renderCheckableCard(post, (
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        onClick={() => handlePublishNow(post.id)}
                        disabled={publishing === post.id || actionInProgress === post.id}
                        className="flex items-center justify-center gap-1.5 border border-red-400 text-red-500 rounded-lg px-3 py-2 text-sm hover:bg-red-50 disabled:opacity-40 transition"
                      >
                        <Send size={13} />
                        {publishing === post.id ? "再試行中…" : "再試行"}
                      </button>
                      <button
                        onClick={() => handleRevertToDraft(post.id)}
                        disabled={actionInProgress === post.id || publishing === post.id}
                        className="flex items-center justify-center gap-1.5 border border-gray-400 text-gray-600 rounded-lg px-3 py-2 text-sm hover:bg-gray-50 disabled:opacity-40 transition"
                      >
                        <RotateCcw size={13} />
                        {actionInProgress === post.id ? "処理中…" : "下書きに戻す"}
                      </button>
                      <button
                        onClick={() => handleDeleteOne(post.id)}
                        disabled={actionInProgress === post.id || publishing === post.id}
                        className="flex items-center justify-center gap-1.5 border border-red-600 text-red-600 rounded-lg px-3 py-2 text-sm hover:bg-red-600 hover:text-white disabled:opacity-40 transition font-medium"
                      >
                        <Trash2 size={13} />
                        {actionInProgress === post.id ? "処理中…" : "削除"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* 下書き */}
          {grouped.draft.length > 0 && (
            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold text-gray-500 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300 inline-block" />
                  下書き（未スケジュール）({grouped.draft.length})
                </h2>
                <button
                  onClick={() => toggleSelectSection(grouped.draft)}
                  className="text-xs text-gray-400 hover:text-black transition"
                >
                  {grouped.draft.every((p) => selected.has(p.id)) ? "解除" : "全選択"}
                </button>
              </div>
              <div className="space-y-3">
                {grouped.draft.map((post) =>
                  renderCheckableCard(post, (
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => handlePublishNow(post.id)}
                        disabled={publishing === post.id || actionInProgress === post.id}
                        className="flex items-center justify-center gap-2 border border-gray-300 text-gray-500 rounded-lg px-4 py-2 text-sm hover:bg-gray-100 disabled:opacity-40 transition"
                      >
                        <Send size={14} />
                        {publishing === post.id ? "投稿中..." : "今すぐ投稿"}
                      </button>
                      <button
                        onClick={() => handleDeleteOne(post.id)}
                        disabled={actionInProgress === post.id || publishing === post.id}
                        className="flex items-center justify-center gap-1.5 border border-red-500 text-red-500 rounded-lg px-4 py-2 text-sm hover:bg-red-500 hover:text-white disabled:opacity-40 transition font-medium"
                      >
                        <Trash2 size={14} />
                        {actionInProgress === post.id ? "処理中..." : "削除"}
                      </button>
                    </div>
                  ))
                )}
              </div>
            </section>
          )}

          {/* 投稿済み（最新5件） */}
          {grouped.published.length > 0 && (
            <section>
              <h2 className="text-sm font-semibold text-green-600 mb-3 flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-green-400 inline-block" />
                投稿済み（最新5件）
              </h2>
              <div className="space-y-3">
                {grouped.published.slice(0, 5).map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            </section>
          )}

          {posts.length === 0 && (
            <div className="text-center text-gray-400 py-16 text-sm">
              投稿がありません。
              <a href="/import" className="underline ml-1 text-black">インポート</a>
              から追加してください。
            </div>
          )}
        </div>
      )}
    </div>
  );
}
