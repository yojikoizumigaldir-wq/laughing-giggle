"use client";

import { useState } from "react";
import { ImportEditor } from "@/src/components/ImportEditor";
import { JsonImportEditor } from "@/src/components/JsonImportEditor";
import { ScheduledJsonImportEditor } from "@/src/components/ScheduledJsonImportEditor";

type Tab = "text" | "json" | "scheduled";

export default function ImportPage() {
  const [tab, setTab] = useState<Tab>("text");

  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-t-lg transition ${
      tab === t
        ? "bg-white border border-b-white border-gray-200 -mb-px text-black"
        : "text-gray-500 hover:text-black"
    }`;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">インポート</h1>
        <p className="text-sm text-gray-500 mt-1">
          Claudeで作成した投稿文を一括で保存します。
        </p>
      </div>

      {/* タブ切り替え */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        <button onClick={() => setTab("text")} className={tabClass("text")}>
          テキスト貼り付け
        </button>
        <button onClick={() => setTab("json")} className={tabClass("json")}>
          JSON貼り付け
        </button>
        <button onClick={() => setTab("scheduled")} className={tabClass("scheduled")}>
          自動スケジュール
        </button>
      </div>

      {tab === "text" && (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 mb-6 text-sm text-blue-700">
            <strong>区切り文字について：</strong>{" "}
            <code className="bg-blue-100 px-1 rounded">---</code>、{" "}
            <code className="bg-blue-100 px-1 rounded">===</code>、{" "}
            <code className="bg-blue-100 px-1 rounded">【投稿1】</code>{" "}
            などをClaudeの出力に含めると自動分割されます。
            区切りがない場合は連続する空行で分割します。
          </div>
          <ImportEditor accounts={[]} />
        </>
      )}

      {tab === "json" && (
        <>
          <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 mb-6 text-sm text-blue-700">
            <strong>JSON形式について：</strong>{" "}
            <code className="bg-blue-100 px-1 rounded">content</code> は必須。{" "}
            <code className="bg-blue-100 px-1 rounded">category</code>、{" "}
            <code className="bg-blue-100 px-1 rounded">purpose</code>、{" "}
            <code className="bg-blue-100 px-1 rounded">priority</code> は任意です。
            投稿はすべてDRAFT状態で保存され、スケジュールページから予約できます。
          </div>
          <JsonImportEditor />
        </>
      )}

      {tab === "scheduled" && (
        <>
          <div className="rounded-xl border border-purple-100 bg-purple-50 p-4 mb-6 text-sm text-purple-700 space-y-1.5">
            <p>
              <strong>自動スケジュールについて：</strong>{" "}
              <code className="bg-purple-100 px-1 rounded">text</code>（投稿本文）と{" "}
              <code className="bg-purple-100 px-1 rounded">slot</code>（
              <code className="bg-purple-100 px-1 rounded">lunch</code> /{" "}
              <code className="bg-purple-100 px-1 rounded">night</code> /{" "}
              <code className="bg-purple-100 px-1 rounded">late</code>）が必須です。
            </p>
            <p>
              開始日と投稿曜日を選ぶだけで、全投稿の予約日時が自動で決まります。
              投稿はSCHEDULED状態で保存されます。
            </p>
          </div>
          <ScheduledJsonImportEditor />
        </>
      )}
    </div>
  );
}
