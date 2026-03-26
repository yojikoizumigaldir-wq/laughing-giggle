"use client";

import { useState } from "react";
import { splitPosts } from "@/src/services/post-splitter";
import type { SplitItem, AccountDto } from "@/src/types";
import { AlertTriangle, CheckCircle, ChevronRight } from "lucide-react";

interface ImportEditorProps {
  accounts: AccountDto[];
  onImported?: (batchId: string, count: number) => void;
}

export function ImportEditor({ onImported }: ImportEditorProps) {
  const [rawText, setRawText] = useState("");
  const [preview, setPreview] = useState<SplitItem[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [isImporting, setIsImporting] = useState(false);
  const [step, setStep] = useState<"input" | "preview">("input");

  const handlePreview = () => {
    if (!rawText.trim()) return;
    const result = splitPosts(rawText);
    setPreview(result.items);
    setWarnings(result.warnings);
    setStep("preview");
  };

  const handleImport = async () => {
    if (preview.length === 0) return;
    setIsImporting(true);

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      const json = await res.json();

      if (json.ok) {
        onImported?.(json.data.batchId, json.data.posts.length);
        setRawText("");
        setPreview([]);
        setStep("input");
      } else {
        alert(`エラー: ${json.error}`);
      }
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">

      {step === "input" ? (
        <>
          {/* テキストエリア */}
          <div>
            <label className="text-xs font-medium text-gray-500 block mb-1">
              Claudeの出力をまとめて貼り付け
            </label>
            <textarea
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              rows={14}
              placeholder={`--- で区切られた複数の投稿文を貼り付けてください。\n\n例:\n---\n今日のイベントは大成功でした！\nご来場いただいた皆さんありがとうございました。\n---\n次回のライブは来月を予定しています。\n詳細は近日公開予定です！\n---`}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-black resize-none"
            />
          </div>
          <button
            onClick={handlePreview}
            disabled={!rawText.trim()}
            className="w-full flex items-center justify-center gap-2 bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            分割プレビューを確認
            <ChevronRight size={16} />
          </button>
        </>
      ) : (
        <>
          {/* プレビュー */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-medium text-gray-500">
                {preview.length} 件に分割されました
              </span>
              <button
                onClick={() => setStep("input")}
                className="text-xs text-gray-400 hover:text-black underline"
              >
                ← 戻って編集
              </button>
            </div>

            {warnings.length > 0 && (
              <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 mb-3">
                {warnings.map((w, i) => (
                  <p key={i} className="text-xs text-yellow-700 flex gap-1">
                    <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                    {w}
                  </p>
                ))}
              </div>
            )}

            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {preview.map((item, i) => (
                <div
                  key={i}
                  className={`rounded-lg border p-3 ${
                    item.isOverLimit
                      ? "border-red-200 bg-red-50"
                      : "border-gray-100 bg-gray-50"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span className="text-xs text-gray-400">#{i + 1}</span>
                    <span
                      className={`text-xs font-mono ${
                        item.isOverLimit ? "text-red-500 font-bold" : "text-gray-400"
                      }`}
                    >
                      {item.charCount}/280
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">
                    {item.content}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <button
            onClick={handleImport}
            disabled={isImporting || preview.some((p) => p.isOverLimit)}
            className="w-full flex items-center justify-center gap-2 bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {isImporting ? (
              "保存中..."
            ) : (
              <>
                <CheckCircle size={16} />
                {preview.length} 件を保存してスケジュールへ
              </>
            )}
          </button>
          {preview.some((p) => p.isOverLimit) && (
            <p className="text-xs text-red-500 text-center">
              280文字を超える投稿があります。内容を修正してください。
            </p>
          )}
        </>
      )}
    </div>
  );
}
