"use client";

import { useState, useRef, useCallback } from "react";
import {
  BarChart2,
  Copy,
  Check,
  Download,
  Upload,
  RefreshCw,
  AlertCircle,
  Info,
  ChevronDown,
  ChevronUp,
  Zap,
  XCircle,
  BookOpen,
  FlaskConical,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { clsx } from "clsx";
import type { AnalysisResult, AnalyzedTweet, HistoryEntry } from "@/src/types/analyze";
import { format } from "date-fns";

// ============================================================
// 型・定数
// ============================================================

type InputMode = "api" | "csv" | "demo";

const HISTORY_KEY = "xanalyzer_history";

// ============================================================
// ユーティリティ
// ============================================================

function getHistory(): HistoryEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
  } catch {
    return [];
  }
}

function saveToHistory(result: AnalysisResult): void {
  const history = getHistory();
  const entry: HistoryEntry = {
    id: `${Date.now()}`,
    username: result.username,
    analyzedAt: result.analyzedAt,
    totalTweets: result.totalTweets,
    result,
  };
  const updated = [entry, ...history].slice(0, 20); // 最大20件
  localStorage.setItem(HISTORY_KEY, JSON.stringify(updated));
}

function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

// ============================================================
// サブコンポーネント
// ============================================================

function SectionTitle({ icon: Icon, title }: { icon: React.ElementType; title: string }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <Icon size={16} className="text-gray-500" />
      <h3 className="text-sm font-semibold text-gray-800">{title}</h3>
    </div>
  );
}

function Tag({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className={clsx("inline-block text-xs font-medium px-2 py-0.5 rounded-full", color)}>
      {children}
    </span>
  );
}

function TweetCard({ tweet }: { tweet: AnalyzedTweet }) {
  const [expanded, setExpanded] = useState(false);
  const tierColor =
    tweet.tier === "top"
      ? "border-l-green-400 bg-green-50"
      : tweet.tier === "bottom"
      ? "border-l-red-300 bg-red-50"
      : "border-l-gray-200 bg-white";

  return (
    <div className={clsx("border-l-4 rounded-r-lg p-3 mb-2", tierColor)}>
      <div className="flex items-start justify-between gap-2">
        <p className={clsx("text-sm text-gray-800 flex-1 whitespace-pre-wrap", !expanded && "line-clamp-2")}>
          {tweet.text}
        </p>
        <button onClick={() => setExpanded(!expanded)} className="text-gray-400 hover:text-gray-600 flex-shrink-0 mt-0.5">
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-2 mt-2">
        {tweet.tier === "top" && <Tag color="bg-green-100 text-green-700">上位</Tag>}
        {tweet.tier === "bottom" && <Tag color="bg-red-100 text-red-700">下位</Tag>}
        <span className="text-xs text-gray-400">{tweet.charCount}文字</span>
        <span className="text-xs text-gray-400">{tweet.lineCount}行</span>
        {tweet.hasHashtag && <Tag color="bg-blue-50 text-blue-600">#タグ</Tag>}
        {tweet.hasMedia && <Tag color="bg-purple-50 text-purple-600">メディア</Tag>}
        {tweet.hasUrl && <Tag color="bg-yellow-50 text-yellow-700">URL</Tag>}
        {tweet.hasBullets && <Tag color="bg-gray-100 text-gray-600">箇条書き</Tag>}
        {tweet.metrics && (
          <span className="text-xs text-gray-500 ml-auto">
            ❤️ {tweet.metrics.like_count.toLocaleString()}
            {" · "}🔁 {tweet.metrics.retweet_count.toLocaleString()}
            {tweet.metrics.impression_count > 0 && (
              <> · 👁 {tweet.metrics.impression_count.toLocaleString()}</>
            )}
          </span>
        )}
      </div>
    </div>
  );
}

function StatRow({ label, topVal, bottomVal, unit = "" }: {
  label: string;
  topVal: string | number;
  bottomVal: string | number;
  unit?: string;
}) {
  return (
    <div className="flex items-center text-xs py-1.5 border-b border-gray-100 last:border-0">
      <span className="w-36 text-gray-500">{label}</span>
      <span className="w-20 font-medium text-green-700">{topVal}{unit}</span>
      <span className="w-20 text-red-600">{bottomVal}{unit}</span>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs bg-black text-white px-3 py-1.5 rounded-md hover:bg-gray-800 transition-colors"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "コピーしました" : "コピー"}
    </button>
  );
}

// ============================================================
// メインページ
// ============================================================

export default function AnalyzePage() {
  const [username, setUsername] = useState("");
  const [inputMode, setInputMode] = useState<InputMode>("demo");
  const [csvText, setCsvText] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetail, setErrorDetail] = useState<string | null>(null);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [showAllTweets, setShowAllTweets] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadHistory = useCallback(() => {
    setHistory(getHistory());
    setShowHistory(true);
  }, []);

  const runAnalysis = async () => {
    if (inputMode !== "demo" && !username.trim()) {
      setError("ユーザー名を入力してください");
      return;
    }
    setLoading(true);
    setError(null);
    setErrorDetail(null);
    setResult(null);

    try {
      let tweets = undefined;
      let effectiveUsername = username.trim() || "demo";

      // X API モードの場合、先にツイートを取得
      if (inputMode === "api") {
        const twitterRes = await fetch("/api/analyze/twitter", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ username: effectiveUsername, maxResults: 50 }),
        });
        const twitterData = await twitterRes.json();
        if (!twitterData.success) {
          setError(twitterData.error);
          setErrorDetail(twitterData.details || null);
          setLoading(false);
          return;
        }
        tweets = twitterData.data.tweets;
        effectiveUsername = twitterData.data.username;
      }

      // 分析実行
      const runRes = await fetch("/api/analyze/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: inputMode,
          tweets,
          csvText: inputMode === "csv" ? csvText : undefined,
          username: effectiveUsername,
        }),
      });
      const runData = await runRes.json();
      if (!runData.success) {
        setError(runData.error);
        setErrorDetail(runData.details || null);
        setLoading(false);
        return;
      }

      const analysisResult: AnalysisResult = runData.data;
      setResult(analysisResult);
      saveToHistory(analysisResult);
    } catch (e) {
      setError("通信エラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  const handleCsvFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setCsvText(ev.target?.result as string);
    reader.readAsText(file, "utf-8");
  };

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            <BarChart2 size={20} />
            アカウント分析
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            投稿の傾向を分析し、改善ルールを自動生成します
          </p>
        </div>
        <button
          onClick={loadHistory}
          className="text-xs text-gray-500 hover:text-gray-700 flex items-center gap-1"
        >
          <BookOpen size={13} />
          履歴
        </button>
      </div>

      {/* 入力エリア */}
      <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-4">
        {/* モード選択 */}
        <div className="flex gap-2">
          {(["api", "csv", "demo"] as InputMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setInputMode(m)}
              className={clsx(
                "px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors",
                inputMode === m
                  ? "bg-black text-white border-black"
                  : "text-gray-600 border-gray-200 hover:border-gray-400"
              )}
            >
              {m === "api" && "X API"}
              {m === "csv" && "CSV"}
              {m === "demo" && "デモデータ"}
            </button>
          ))}
        </div>

        {/* API モードの説明 */}
        {inputMode === "api" && (
          <div className="flex gap-2 text-xs bg-blue-50 border border-blue-100 rounded-lg p-3">
            <Info size={14} className="text-blue-400 flex-shrink-0 mt-0.5" />
            <p className="text-blue-700">
              X API (Bearer Token) でツイートを取得します。取得件数は最大50件です。
            </p>
          </div>
        )}

        {/* ユーザー名入力 */}
        {(inputMode === "api" || inputMode === "csv") && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">
              {inputMode === "api" ? "X アカウント URL または @username" : "分析対象のアカウント名（任意）"}
            </label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={inputMode === "api" ? "@username または https://x.com/username" : "@username（任意）"}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-gray-400"
            />
          </div>
        )}

        {/* CSV 入力 */}
        {inputMode === "csv" && (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <label className="block text-xs text-gray-500">CSV ファイル</label>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-1 text-xs bg-gray-100 hover:bg-gray-200 px-2 py-1 rounded"
              >
                <Upload size={12} />
                ファイルを選択
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleCsvFile}
              />
            </div>
            <textarea
              value={csvText}
              onChange={(e) => setCsvText(e.target.value)}
              placeholder={`text,like_count,retweet_count,reply_count,impression_count\n投稿本文,100,20,5,5000`}
              rows={5}
              className="w-full border border-gray-200 rounded-lg px-3 py-2 text-xs font-mono focus:outline-none focus:border-gray-400"
            />
            <p className="text-xs text-gray-400">
              必須カラム: <code>text</code> ／ 任意: <code>like_count, retweet_count, reply_count, quote_count, impression_count, bookmark_count, created_at, id</code>
            </p>
          </div>
        )}

        {/* デモモード */}
        {inputMode === "demo" && (
          <div className="flex gap-2 text-xs bg-blue-50 border border-blue-200 rounded-lg p-3">
            <Info size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
            <p className="text-blue-700">
              副業系アカウントのサンプルデータ（15件）で分析を実行します。
              API キー不要でそのまま試せます。
            </p>
          </div>
        )}

        {/* 実行ボタン */}
        <button
          onClick={runAnalysis}
          disabled={loading}
          className="w-full flex items-center justify-center gap-2 bg-black text-white py-2.5 rounded-lg text-sm font-medium hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {loading ? (
            <>
              <RefreshCw size={15} className="animate-spin" />
              分析中…
            </>
          ) : (
            <>
              <BarChart2 size={15} />
              分析を実行
            </>
          )}
        </button>

        {/* エラー */}
        {error && (
          <div className="flex gap-2 text-xs bg-red-50 border border-red-200 rounded-lg p-3">
            <AlertCircle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="font-medium text-red-800">{error}</p>
              {errorDetail && <p className="text-red-700 mt-0.5">{errorDetail}</p>}
            </div>
          </div>
        )}
      </div>

      {/* 分析結果 */}
      {result && (
        <div className="space-y-4">
          {/* メタ情報 */}
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-semibold text-gray-900">
                @{result.username} の分析結果
              </p>
              <p className="text-xs text-gray-400">
                {result.totalTweets}件 ·{" "}
                {format(new Date(result.analyzedAt), "yyyy/MM/dd HH:mm")}
                {!result.hasMetrics && (
                  <span className="ml-2 text-amber-600">
                    ⚠ メトリクスなし（構造分析のみ）
                  </span>
                )}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  downloadJson(
                    result,
                    `analysis_${result.username}_${format(new Date(), "yyyyMMdd_HHmm")}.json`
                  )
                }
                className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700 border border-gray-200 rounded-md px-2 py-1.5"
              >
                <Download size={12} />
                保存
              </button>
            </div>
          </div>

          {/* 全体サマリー */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionTitle icon={BarChart2} title="全体傾向" />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { label: "平均文字数", value: `${result.summary.avgCharCount}文字` },
                { label: "平均行数", value: `${result.summary.avgLineCount}行` },
                { label: "ハッシュタグ率", value: pct(result.summary.hashtagUsageRate) },
                { label: "URL含有率", value: pct(result.summary.urlUsageRate) },
                { label: "メディア率", value: pct(result.summary.mediaUsageRate) },
                { label: "箇条書き率", value: pct(result.summary.bulletUsageRate) },
                { label: "数字含有率", value: pct(result.summary.numberUsageRate) },
                { label: "1行目平均", value: `${result.summary.avgFirstLineLength}文字` },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-3">
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className="text-lg font-bold text-gray-900 mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* 上位 vs 下位比較 */}
          {result.hasMetrics && (
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <SectionTitle icon={BarChart2} title="上位 vs 下位 比較" />
              <div className="flex text-xs text-gray-400 mb-1 pl-36">
                <span className="w-20 font-medium text-green-700">上位 30%</span>
                <span className="w-20 text-red-600">下位 30%</span>
              </div>
              <StatRow label="平均文字数" topVal={result.topSummary.avgCharCount} bottomVal={result.bottomSummary.avgCharCount} unit="文字" />
              <StatRow label="平均行数" topVal={result.topSummary.avgLineCount} bottomVal={result.bottomSummary.avgLineCount} unit="行" />
              <StatRow label="1行目文字数" topVal={result.topSummary.avgFirstLineLength} bottomVal={result.bottomSummary.avgFirstLineLength} unit="文字" />
              <StatRow label="ハッシュタグ率" topVal={pct(result.topSummary.hashtagUsageRate)} bottomVal={pct(result.bottomSummary.hashtagUsageRate)} />
              <StatRow label="URL率" topVal={pct(result.topSummary.urlUsageRate)} bottomVal={pct(result.bottomSummary.urlUsageRate)} />
              <StatRow label="メディア率" topVal={pct(result.topSummary.mediaUsageRate)} bottomVal={pct(result.bottomSummary.mediaUsageRate)} />
              <StatRow label="箇条書き率" topVal={pct(result.topSummary.bulletUsageRate)} bottomVal={pct(result.bottomSummary.bulletUsageRate)} />
              <StatRow label="数字含有率" topVal={pct(result.topSummary.numberUsageRate)} bottomVal={pct(result.bottomSummary.numberUsageRate)} />
              {result.topSummary.avgEngagement !== undefined && (
                <StatRow label="平均エンゲージメント" topVal={result.topSummary.avgEngagement!.toLocaleString()} bottomVal={result.bottomSummary.avgEngagement?.toLocaleString() ?? "-"} />
              )}
            </div>
          )}

          {/* 勝ちパターン / 負けパターン */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <SectionTitle icon={TrendingUp} title="勝ちパターン" />
              <ul className="space-y-1.5">
                {result.winPatterns.length > 0 ? (
                  result.winPatterns.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-green-500 flex-shrink-0">✓</span>
                      <span className="text-gray-700">{p}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-gray-400">データ不足のため生成できません</li>
                )}
              </ul>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <SectionTitle icon={TrendingDown} title="負けパターン" />
              <ul className="space-y-1.5">
                {result.losePatterns.length > 0 ? (
                  result.losePatterns.map((p, i) => (
                    <li key={i} className="flex gap-2 text-sm">
                      <span className="text-red-400 flex-shrink-0">✗</span>
                      <span className="text-gray-700">{p}</span>
                    </li>
                  ))
                ) : (
                  <li className="text-sm text-gray-400">データ不足のため生成できません</li>
                )}
              </ul>
            </div>
          </div>

          {/* 投稿ルール / NG ルール */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <SectionTitle icon={Zap} title="投稿ルール" />
              <ul className="space-y-1.5">
                {result.rules.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-blue-500 flex-shrink-0">・</span>
                    <span className="text-gray-700">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="bg-white border border-gray-200 rounded-xl p-5">
              <SectionTitle icon={XCircle} title="NG ルール" />
              <ul className="space-y-1.5">
                {result.ngRules.map((r, i) => (
                  <li key={i} className="flex gap-2 text-sm">
                    <span className="text-red-400 flex-shrink-0">×</span>
                    <span className="text-gray-700">{r}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* テスト仮説 */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <SectionTitle icon={FlaskConical} title="テスト仮説" />
            <ul className="space-y-1.5">
              {result.testHypotheses.map((h, i) => (
                <li key={i} className="flex gap-2 text-sm">
                  <span className="text-purple-400 flex-shrink-0">▶</span>
                  <span className="text-gray-700">{h}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* ★ 最新学習ルール（コピペ用） */}
          <div className="bg-gray-900 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-white flex items-center gap-2">
                <BookOpen size={15} />
                最新学習ルール（コピペ用）
              </h3>
              <CopyButton text={result.learningRules} />
            </div>
            <pre className="text-xs text-gray-200 whitespace-pre-wrap font-mono leading-relaxed">
              {result.learningRules}
            </pre>
          </div>

          {/* 投稿一覧 */}
          <div className="bg-white border border-gray-200 rounded-xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-gray-800 flex items-center gap-2">
                <BarChart2 size={15} />
                投稿一覧 ({result.tweets.length}件)
              </h3>
              <button
                onClick={() => setShowAllTweets(!showAllTweets)}
                className="text-xs text-gray-400 hover:text-gray-600"
              >
                {showAllTweets ? "折りたたむ" : "全件表示"}
              </button>
            </div>
            {(showAllTweets ? result.tweets : result.tweets.slice(0, 8)).map((tweet) => (
              <TweetCard key={tweet.id} tweet={tweet} />
            ))}
            {!showAllTweets && result.tweets.length > 8 && (
              <button
                onClick={() => setShowAllTweets(true)}
                className="w-full text-xs text-gray-400 hover:text-gray-600 py-2 border border-dashed border-gray-200 rounded-lg mt-1"
              >
                残り {result.tweets.length - 8} 件を表示
              </button>
            )}
          </div>
        </div>
      )}

      {/* 履歴パネル */}
      {showHistory && (
        <div className="bg-white border border-gray-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-semibold text-gray-800">分析履歴</h3>
            <button onClick={() => setShowHistory(false)} className="text-xs text-gray-400">
              閉じる
            </button>
          </div>
          {history.length === 0 ? (
            <p className="text-sm text-gray-400">履歴はありません</p>
          ) : (
            <ul className="space-y-2">
              {history.map((entry) => (
                <li
                  key={entry.id}
                  className="flex items-center justify-between p-3 bg-gray-50 rounded-lg cursor-pointer hover:bg-gray-100"
                  onClick={() => {
                    setResult(entry.result);
                    setShowHistory(false);
                  }}
                >
                  <div>
                    <p className="text-sm font-medium text-gray-800">@{entry.username}</p>
                    <p className="text-xs text-gray-400">
                      {entry.totalTweets}件 · {format(new Date(entry.analyzedAt), "MM/dd HH:mm")}
                    </p>
                  </div>
                  <ChevronDown size={14} className="text-gray-400 -rotate-90" />
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
