"use client";

import { useState } from "react";
import {
  CheckCircle,
  AlertTriangle,
  Upload,
  Eye,
  ArrowLeft,
  Calendar,
} from "lucide-react";
import Link from "next/link";
import {
  assignSchedule,
  SLOT_DEFINITIONS,
  SLOT_ORDER,
  SlotSchedulerError,
} from "@/src/lib/slot-scheduler";
import type { SchedulerConfig, InputPost, ScheduledPost } from "@/src/lib/slot-scheduler";

// ─── 定数 ────────────────────────────────────────────────────────────────────
const DAY_LABELS = ["日", "月", "火", "水", "木", "金", "土"];

const ALL_SLOTS = SLOT_ORDER.map((id) => ({ id, ...SLOT_DEFINITIONS[id] }));

function getTodayString(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatDateTime(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  const h = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  const dayLabel = DAY_LABELS[date.getDay()];
  return `${y}/${m}/${d}(${dayLabel}) ${h}:${min}`;
}

// ─── 型 ──────────────────────────────────────────────────────────────────────
interface ImportResult {
  created: number;
  batchId: string;
}

// ─── コンポーネント ───────────────────────────────────────────────────────────
export function ScheduledJsonImportEditor() {
  // ── 入力状態 ──────────────────────────────────────────────────────────────
  const [jsonText, setJsonText] = useState("");
  const [parseError, setParseError] = useState<string | null>(null);

  // ── スケジュール設定 ───────────────────────────────────────────────────────
  const [startDate, setStartDate] = useState(getTodayString());
  const [activeDays, setActiveDays] = useState<number[]>([1, 3, 5]); // 月・水・金
  const [slotTimes, setSlotTimes] = useState<Record<string, string>>(
    Object.fromEntries(ALL_SLOTS.map((s) => [s.id, s.defaultTime]))
  );
  const [usedSlots, setUsedSlots] = useState<string[]>(["lunch", "night"]);
  const [prioritySort, setPrioritySort] = useState(true);

  // ── フェーズ管理 ──────────────────────────────────────────────────────────
  const [preview, setPreview] = useState<ScheduledPost[] | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // ─── ハンドラ ──────────────────────────────────────────────────────────────
  const toggleDay = (day: number) => {
    setActiveDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort((a, b) => a - b)
    );
  };

  const toggleSlot = (slotId: string) => {
    setUsedSlots((prev) =>
      prev.includes(slotId)
        ? prev.filter((s) => s !== slotId)
        : [...prev, slotId]
    );
  };

  const handlePreview = () => {
    setParseError(null);

    // JSON パース
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch {
      setParseError(
        "JSON形式が正しくありません。配列 [ {...}, {...} ] の形式で貼り付けてください。"
      );
      return;
    }

    if (!Array.isArray(parsed)) {
      setParseError("JSONは配列 [ {...}, {...} ] 形式である必要があります。");
      return;
    }

    // アイテムバリデーション
    const items: InputPost[] = [];
    const errs: string[] = [];

    const parsedArr = parsed as Record<string, unknown>[];
    for (let i = 0; i < parsedArr.length; i++) {
      const item = parsedArr[i];
      const text = typeof item.text === "string" ? item.text.trim() : "";
      const slot = typeof item.slot === "string" ? item.slot : "";

      if (!text) {
        errs.push(`#${i + 1}: "text" が空です`);
        continue;
      }
      if (!slot) {
        errs.push(`#${i + 1}: "slot" が必須です`);
        continue;
      }

      items.push({
        text,
        slot,
        category: typeof item.category === "string" ? item.category : null,
        priority: typeof item.priority === "number" ? item.priority : null,
      });
    }

    if (errs.length > 0) {
      setParseError(errs.join("\n"));
      return;
    }

    if (items.length === 0) {
      setParseError("有効な投稿がありません。");
      return;
    }

    if (activeDays.length === 0) {
      setParseError("投稿曜日を1つ以上選択してください。");
      return;
    }

    if (usedSlots.length === 0) {
      setParseError("使用するスロットを1つ以上選択してください。");
      return;
    }

    const config: SchedulerConfig = {
      startDate,
      activeDays,
      slotTimes,
      usedSlots,
      prioritySort,
    };

    try {
      const scheduled = assignSchedule(items, config);
      setPreview(scheduled);
    } catch (e) {
      setParseError(
        e instanceof SlotSchedulerError ? e.message : "スケジュール計算に失敗しました。"
      );
    }
  };

  const handleSave = async () => {
    if (!preview) return;
    setIsSaving(true);
    setParseError(null);

    try {
      const res = await fetch("/api/posts/import-scheduled", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          posts: preview.map((p) => ({
            text: p.text,
            slot: p.slot,
            category: p.category,
            priority: p.priority,
            scheduledAt: p.scheduledAt.toISOString(),
          })),
        }),
      });

      const json = await res.json();
      if (json.ok) {
        setResult(json.data);
        setPreview(null);
        setJsonText("");
      } else {
        setParseError(`保存エラー: ${json.error}`);
        setPreview(null);
      }
    } catch {
      setParseError("通信エラーが発生しました。再度お試しください。");
      setPreview(null);
    } finally {
      setIsSaving(false);
    }
  };

  // ─── 結果フェーズ ─────────────────────────────────────────────────────────
  if (result) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
        <div className="flex items-center gap-2 text-green-700 font-medium">
          <CheckCircle size={18} />
          スケジュール登録完了
        </div>
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <dt className="text-gray-500">登録件数</dt>
          <dd className="font-mono font-bold text-green-700">{result.created} 件</dd>
        </dl>
        <div className="flex gap-3 pt-1">
          <Link
            href="/publish"
            className="flex-1 text-center bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition"
          >
            投稿確認ページへ →
          </Link>
          <button
            onClick={() => {
              setResult(null);
              setParseError(null);
            }}
            className="text-sm text-gray-400 hover:text-black underline"
          >
            続けてインポート
          </button>
        </div>
      </div>
    );
  }

  // ─── プレビューフェーズ ────────────────────────────────────────────────────
  if (preview) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-gray-700">
            割り当てプレビュー（{preview.length} 件）
          </h3>
          <button
            onClick={() => setPreview(null)}
            className="flex items-center gap-1 text-xs text-gray-400 hover:text-black transition"
          >
            <ArrowLeft size={12} />
            設定に戻る
          </button>
        </div>

        <div className="overflow-x-auto rounded-lg border border-gray-200">
          <table className="w-full text-xs">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="px-3 py-2 text-left text-gray-500 font-medium whitespace-nowrap">
                  割当日時
                </th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">slot</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">P</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">category</th>
                <th className="px-3 py-2 text-left text-gray-500 font-medium">内容（先頭40字）</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {preview.map((post, i) => (
                <tr key={i} className="hover:bg-gray-50">
                  <td className="px-3 py-2 font-mono text-gray-800 whitespace-nowrap">
                    {formatDateTime(post.scheduledAt)}
                  </td>
                  <td className="px-3 py-2">
                    <span className="px-1.5 py-0.5 bg-blue-100 text-blue-700 rounded text-xs font-medium">
                      {post.slot}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-gray-400">
                    {post.priority ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-500 whitespace-nowrap">
                    {post.category ?? "—"}
                  </td>
                  <td className="px-3 py-2 text-gray-700">
                    {post.text.length > 40
                      ? post.text.slice(0, 40) + "…"
                      : post.text}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {parseError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex gap-2 text-sm text-red-600">
            <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
            {parseError}
          </div>
        )}

        <button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
        >
          {isSaving ? (
            "保存中..."
          ) : (
            <>
              <Upload size={16} />
              {preview.length} 件をスケジュール登録
            </>
          )}
        </button>
      </div>
    );
  }

  // ─── 入力フェーズ ─────────────────────────────────────────────────────────
  return (
    <div className="space-y-5">
      {/* JSON テキストエリア */}
      <div>
        <label className="text-xs font-medium text-gray-500 block mb-1">
          ClaudeのJSON出力を貼り付け
        </label>
        <textarea
          value={jsonText}
          onChange={(e) => {
            setJsonText(e.target.value);
            setParseError(null);
          }}
          rows={10}
          placeholder={`[\n  { "text": "投稿本文1", "slot": "lunch", "category": "共感", "priority": 1 },\n  { "text": "投稿本文2", "slot": "night", "category": "論点提示", "priority": 2 },\n  { "text": "投稿本文3", "slot": "lunch", "priority": 3 }\n]`}
          className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-black resize-none"
        />
      </div>

      {/* スケジュール設定パネル */}
      <div className="rounded-xl border border-gray-200 p-4 space-y-5">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-1.5">
          <Calendar size={14} />
          スケジュール設定
        </h3>

        {/* 開始日 */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">開始日</label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-black"
          />
        </div>

        {/* 投稿曜日 */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">
            投稿曜日（複数選択可）
          </label>
          <div className="flex gap-1.5 flex-wrap">
            {DAY_LABELS.map((label, i) => (
              <button
                key={i}
                type="button"
                onClick={() => toggleDay(i)}
                className={`w-8 h-8 rounded-full text-xs font-medium transition ${
                  activeDays.includes(i)
                    ? "bg-black text-white"
                    : "bg-gray-100 text-gray-500 hover:bg-gray-200"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          {activeDays.length === 0 && (
            <p className="text-xs text-red-500 mt-1">1つ以上選択してください</p>
          )}
        </div>

        {/* スロット設定 */}
        <div>
          <label className="text-xs text-gray-500 block mb-1.5">
            スロット設定（使用するslotにチェック・時間を編集可）
          </label>
          <div className="space-y-2">
            {ALL_SLOTS.map((slot) => {
              const enabled = usedSlots.includes(slot.id);
              return (
                <div key={slot.id} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    id={`slot-${slot.id}`}
                    checked={enabled}
                    onChange={() => toggleSlot(slot.id)}
                    className="rounded flex-shrink-0"
                  />
                  <label
                    htmlFor={`slot-${slot.id}`}
                    className={`text-sm w-20 flex-shrink-0 transition ${
                      enabled ? "text-gray-800" : "text-gray-400"
                    }`}
                  >
                    {slot.label}
                    <span className="text-xs ml-1 text-gray-400">({slot.id})</span>
                  </label>
                  <input
                    type="time"
                    value={slotTimes[slot.id] ?? slot.defaultTime}
                    onChange={(e) =>
                      setSlotTimes((prev) => ({ ...prev, [slot.id]: e.target.value }))
                    }
                    disabled={!enabled}
                    className="border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-black disabled:opacity-30 disabled:bg-gray-50"
                  />
                </div>
              );
            })}
          </div>
        </div>

        {/* priority順 */}
        <div className="flex items-center gap-2">
          <input
            type="checkbox"
            id="priority-sort"
            checked={prioritySort}
            onChange={(e) => setPrioritySort(e.target.checked)}
            className="rounded"
          />
          <label htmlFor="priority-sort" className="text-sm text-gray-700">
            priority 順で並べる（数値が小さいほど早い枠に割り当て）
          </label>
        </div>
      </div>

      {/* エラー表示 */}
      {parseError && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex gap-2 text-sm text-red-600">
          <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
          <pre className="whitespace-pre-wrap font-sans">{parseError}</pre>
        </div>
      )}

      {/* プレビューボタン */}
      <button
        onClick={handlePreview}
        disabled={!jsonText.trim()}
        className="w-full flex items-center justify-center gap-2 bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
      >
        <Eye size={16} />
        割り当てプレビューを確認
      </button>
    </div>
  );
}
