"use client";

import { useState } from "react";
import { CheckCircle, AlertTriangle, Upload } from "lucide-react";
import Link from "next/link";

interface ImportResult {
  created: number;
  skipped: number;
  batchId: string;
  errors: string[];
}

export function JsonImportEditor() {
  const [jsonText, setJsonText] = useState("");
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);

  const handleImport = async () => {
    setParseError(null);
    setResult(null);

    // JSONパース（クライアント側でエラーを早期検出）
    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText.trim());
    } catch {
      setParseError("JSON形式が正しくありません。配列 [ {...}, {...} ] の形式で入力してください。");
      return;
    }

    if (!Array.isArray(parsed)) {
      setParseError("JSONは配列 [ {...}, {...} ] 形式である必要があります。");
      return;
    }

    setIsImporting(true);
    try {
      const res = await fetch("/api/posts/import-json", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      });
      const json = await res.json();

      if (json.ok) {
        setResult(json.data);
        setJsonText("");
      } else {
        setParseError(`エラー: ${json.error}`);
      }
    } catch {
      setParseError("通信エラーが発生しました。再度お試しください。");
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {result ? (
        /* 結果表示 */
        <div className="rounded-xl border border-green-200 bg-green-50 p-5 space-y-3">
          <div className="flex items-center gap-2 text-green-700 font-medium">
            <CheckCircle size={18} />
            インポート完了
          </div>
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <dt className="text-gray-500">保存件数</dt>
            <dd className="font-mono font-bold text-green-700">{result.created} 件</dd>
            <dt className="text-gray-500">スキップ</dt>
            <dd className="font-mono text-gray-500">{result.skipped} 件</dd>
          </dl>
          {result.errors.length > 0 && (
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3">
              {result.errors.map((e, i) => (
                <p key={i} className="text-xs text-yellow-700 flex gap-1">
                  <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
                  {e}
                </p>
              ))}
            </div>
          )}
          <div className="flex gap-3 pt-1">
            <Link
              href="/schedule"
              className="flex-1 text-center bg-black text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition"
            >
              スケジュールページへ →
            </Link>
            <button
              onClick={() => setResult(null)}
              className="text-sm text-gray-400 hover:text-black underline"
            >
              続けてインポート
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* テキストエリア */}
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
              rows={14}
              placeholder={`[\n  {\n    "content": "投稿内容をここに",\n    "category": "共感あるある",\n    "purpose": "反応獲得",\n    "priority": 2\n  },\n  {\n    "content": "2件目の投稿内容",\n    "category": "あるある",\n    "purpose": "共感",\n    "priority": 3\n  }\n]`}
              className="w-full border border-gray-200 rounded-lg px-4 py-3 text-sm font-mono leading-relaxed focus:outline-none focus:ring-1 focus:ring-black resize-none"
            />
          </div>

          {/* エラー表示 */}
          {parseError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 flex gap-2 text-sm text-red-600">
              <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />
              {parseError}
            </div>
          )}

          <button
            onClick={handleImport}
            disabled={!jsonText.trim() || isImporting}
            className="w-full flex items-center justify-center gap-2 bg-black text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-gray-800 disabled:opacity-40 transition"
          >
            {isImporting ? (
              "保存中..."
            ) : (
              <>
                <Upload size={16} />
                JSONから一括インポート
              </>
            )}
          </button>
        </>
      )}
    </div>
  );
}
