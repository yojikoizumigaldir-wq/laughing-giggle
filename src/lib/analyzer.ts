// ============================================================
// X Account Analyzer - 分析エンジン
// ============================================================

import type {
  RawTweet,
  AnalyzedTweet,
  AnalysisResult,
  TierSummary,
  CsvRow,
} from "@/src/types/analyze";
import { format } from "date-fns";

// ============================================================
// 特徴量抽出
// ============================================================

function extractFeatures(tweet: RawTweet): Omit<AnalyzedTweet, "metrics" | "tier"> {
  const text = tweet.text;
  const lines = text.split("\n");

  const firstLine = lines[0] || "";
  const cleanText = text.replace(/https?:\/\/\S+/g, "").replace(/#\w+/g, "").trim();

  return {
    id: tweet.id,
    text,
    created_at: tweet.created_at,
    charCount: cleanText.length, // URL・ハッシュタグを除いた本文文字数
    lineCount: lines.filter((l) => l.trim() !== "").length,
    firstLine,
    firstLineLength: firstLine.length,
    hasHashtag: /#[\w\u3041-\u9FFF]+/.test(text),
    hasUrl: /https?:\/\//.test(text),
    hasMedia: Boolean(tweet.attachments?.media_keys?.length),
    hasBullets: /^[・•\-✓✅▶]/m.test(text),
    hasNumber: /[0-9０-９]/.test(cleanText),
    startsWithQuestion: /^[？?「]/.test(firstLine.trim()),
  };
}

// ============================================================
// エンゲージメントスコア計算
// ============================================================

function calcEngagement(m: RawTweet["public_metrics"]): {
  engagement_total: number;
  engagement_rate: number;
} {
  if (!m) return { engagement_total: 0, engagement_rate: 0 };
  // 重み付きスコア: いいね×3 + RT×2 + 返信×1 + 引用×2 + ブックマーク×1.5
  const total =
    m.like_count * 3 +
    m.retweet_count * 2 +
    m.reply_count * 1 +
    m.quote_count * 2 +
    m.bookmark_count * 1.5;
  const rate =
    m.impression_count > 0 ? total / m.impression_count : 0;
  return { engagement_total: total, engagement_rate: rate };
}

// ============================================================
// tier 分類 (上位30% = top, 下位30% = bottom)
// ============================================================

function assignTiers(tweets: AnalyzedTweet[]): AnalyzedTweet[] {
  const withMetrics = tweets.filter((t) => t.metrics);
  if (withMetrics.length < 6) {
    // メトリクスなしまたは少なすぎる場合は順序で分類
    return tweets.map((t, i) => ({
      ...t,
      tier:
        i < Math.floor(tweets.length * 0.3)
          ? "top"
          : i >= Math.ceil(tweets.length * 0.7)
          ? "bottom"
          : "middle",
    }));
  }

  const sorted = [...withMetrics].sort(
    (a, b) => (b.metrics!.engagement_total) - (a.metrics!.engagement_total)
  );
  const topN = Math.max(1, Math.floor(sorted.length * 0.3));
  const bottomN = Math.max(1, Math.floor(sorted.length * 0.3));

  const topIds = new Set(sorted.slice(0, topN).map((t) => t.id));
  const bottomIds = new Set(sorted.slice(sorted.length - bottomN).map((t) => t.id));

  return tweets.map((t) => ({
    ...t,
    tier: topIds.has(t.id) ? "top" : bottomIds.has(t.id) ? "bottom" : "middle",
  }));
}

// ============================================================
// tier ごとの集計
// ============================================================

function calcTierSummary(tweets: AnalyzedTweet[]): TierSummary {
  const n = tweets.length;
  if (n === 0) {
    return {
      avgCharCount: 0,
      avgLineCount: 0,
      avgFirstLineLength: 0,
      hashtagUsageRate: 0,
      urlUsageRate: 0,
      mediaUsageRate: 0,
      bulletUsageRate: 0,
      numberUsageRate: 0,
    };
  }
  const sum = <K extends keyof AnalyzedTweet>(key: K): number =>
    tweets.reduce((acc, t) => acc + (Number(t[key]) || 0), 0);
  const rate = (key: keyof AnalyzedTweet): number =>
    tweets.filter((t) => t[key]).length / n;

  const withMetrics = tweets.filter((t) => t.metrics);
  return {
    avgCharCount: Math.round(sum("charCount") / n),
    avgLineCount: Math.round((sum("lineCount") / n) * 10) / 10,
    avgFirstLineLength: Math.round(sum("firstLineLength") / n),
    hashtagUsageRate: rate("hasHashtag"),
    urlUsageRate: rate("hasUrl"),
    mediaUsageRate: rate("hasMedia"),
    bulletUsageRate: rate("hasBullets"),
    numberUsageRate: rate("hasNumber"),
    avgEngagement:
      withMetrics.length > 0
        ? Math.round(
            withMetrics.reduce((acc, t) => acc + t.metrics!.engagement_total, 0) /
              withMetrics.length
          )
        : undefined,
    avgEngagementRate:
      withMetrics.length > 0
        ? withMetrics.reduce((acc, t) => acc + t.metrics!.engagement_rate, 0) /
          withMetrics.length
        : undefined,
  };
}

// ============================================================
// ルール生成
// ============================================================

function generateRules(
  top: TierSummary,
  bottom: TierSummary,
  hasMetrics: boolean
): {
  winPatterns: string[];
  losePatterns: string[];
  rules: string[];
  ngRules: string[];
  testHypotheses: string[];
} {
  const winPatterns: string[] = [];
  const losePatterns: string[] = [];
  const rules: string[] = [];
  const ngRules: string[] = [];
  const testHypotheses: string[] = [];

  // --- 文字数 ---
  const charDiff = bottom.avgCharCount - top.avgCharCount;
  if (charDiff > 30) {
    winPatterns.push(`短い投稿が伸びやすい（上位平均 ${top.avgCharCount}文字 vs 下位平均 ${bottom.avgCharCount}文字）`);
    rules.push(`本文は ${top.avgCharCount + 20}文字以内を目安にする`);
    ngRules.push(`${bottom.avgCharCount}文字以上の長文投稿は避ける`);
  } else if (charDiff < -30) {
    winPatterns.push(`長い投稿が伸びやすい（上位平均 ${top.avgCharCount}文字）`);
    rules.push(`本文は ${top.avgCharCount - 20}文字以上を目安にする`);
  } else {
    testHypotheses.push(`文字数の違いは小さい（上位 ${top.avgCharCount}文字 / 下位 ${bottom.avgCharCount}文字）→ 内容の質で差がつく可能性あり`);
  }

  // --- 改行数 ---
  const lineDiff = top.avgLineCount - bottom.avgLineCount;
  if (lineDiff > 0.8) {
    winPatterns.push(`改行が多い構成が伸びやすい（上位平均 ${top.avgLineCount}行）`);
    rules.push(`改行を積極的に使い、${Math.round(top.avgLineCount)}行前後に分割する`);
  } else if (lineDiff < -0.8) {
    winPatterns.push(`連続した文章（改行少）が伸びやすい（上位平均 ${top.avgLineCount}行）`);
    rules.push(`改行を抑え、まとまりのある文章にする`);
  }

  // --- 1行目の長さ ---
  const firstLineDiff = bottom.avgFirstLineLength - top.avgFirstLineLength;
  if (firstLineDiff > 10) {
    winPatterns.push(`1行目が短く断定的な投稿が伸びやすい（上位平均 ${top.avgFirstLineLength}文字）`);
    rules.push(`1行目は ${top.avgFirstLineLength + 5}文字以内で断定的に始める`);
  } else if (firstLineDiff < -10) {
    winPatterns.push(`1行目がしっかり書かれた投稿が伸びやすい（上位平均 ${top.avgFirstLineLength}文字）`);
    rules.push(`1行目で十分な情報を伝える（${top.avgFirstLineLength}文字前後）`);
  }

  // --- ハッシュタグ ---
  const hashDiff = top.hashtagUsageRate - bottom.hashtagUsageRate;
  if (hashDiff < -0.2) {
    winPatterns.push(`ハッシュタグなしの投稿が伸びやすい（上位使用率 ${Math.round(top.hashtagUsageRate * 100)}%）`);
    ngRules.push("ハッシュタグの多用（投稿の印象を下げる）");
  } else if (hashDiff > 0.2) {
    winPatterns.push(`ハッシュタグあり投稿が伸びやすい（上位使用率 ${Math.round(top.hashtagUsageRate * 100)}%）`);
    rules.push("関連ハッシュタグを1〜2個付ける");
  } else {
    testHypotheses.push("ハッシュタグあり vs なし でエンゲージメントに差があるか検証する");
  }

  // --- URL ---
  const urlDiff = top.urlUsageRate - bottom.urlUsageRate;
  if (urlDiff < -0.2) {
    winPatterns.push(`URL なしの純テキスト投稿が伸びやすい（上位URL率 ${Math.round(top.urlUsageRate * 100)}%）`);
    rules.push("テキストのみの投稿を増やす（URLなし）");
  } else if (urlDiff > 0.2) {
    winPatterns.push(`URLあり投稿が伸びやすい（上位URL率 ${Math.round(top.urlUsageRate * 100)}%）`);
  }

  // --- メディア ---
  const mediaDiff = top.mediaUsageRate - bottom.mediaUsageRate;
  if (mediaDiff > 0.2) {
    winPatterns.push(`画像・動画付き投稿が伸びやすい（上位メディア率 ${Math.round(top.mediaUsageRate * 100)}%）`);
    rules.push("画像または動画を積極的に添付する");
  } else if (mediaDiff < -0.2) {
    winPatterns.push(`テキストのみ投稿が伸びやすい（上位メディア率 ${Math.round(top.mediaUsageRate * 100)}%）`);
    ngRules.push("毎回メディアを付ける必要はない（テキストのみで伸びる）");
  }

  // --- 箇条書き ---
  const bulletDiff = top.bulletUsageRate - bottom.bulletUsageRate;
  if (bulletDiff > 0.2) {
    winPatterns.push(`箇条書き（・）形式が伸びやすい（上位使用率 ${Math.round(top.bulletUsageRate * 100)}%）`);
    rules.push("「・」を使ったリスト形式で情報を整理する");
  }

  // --- 数字 ---
  const numDiff = top.numberUsageRate - bottom.numberUsageRate;
  if (numDiff > 0.2) {
    winPatterns.push(`数字を含む投稿が伸びやすい（上位使用率 ${Math.round(top.numberUsageRate * 100)}%）`);
    rules.push("具体的な数字（割合・金額・日数など）を必ず入れる");
  }

  // --- メトリクスなしの場合の補足 ---
  if (!hasMetrics) {
    testHypotheses.push("X API でメトリクス（いいね・RT数）を取得すると、より精度の高い分析が可能になります");
  }

  // --- 伸びなかったパターン（ルールの裏返し） ---
  if (winPatterns.length > 0 && losePatterns.length === 0) {
    if (charDiff > 30) losePatterns.push(`長文投稿（下位平均 ${bottom.avgCharCount}文字）は効果が低い`);
    if (bottom.hashtagUsageRate > 0.5 && top.hashtagUsageRate < 0.3)
      losePatterns.push("ハッシュタグを多用した投稿は伸びにくい");
    if (bottom.mediaUsageRate > 0.6 && top.mediaUsageRate < 0.4)
      losePatterns.push("メディアを付けても伸びるとは限らない");
    if (bottom.urlUsageRate > 0.6 && top.urlUsageRate < 0.3)
      losePatterns.push("URL を含む投稿はリーチが下がる傾向あり");
  }

  // デフォルトのテスト仮説
  if (testHypotheses.length < 2) {
    testHypotheses.push(`1行目を「問い」から始める vs「断定」で始める でエンゲージメントを比較する`);
    testHypotheses.push(`投稿時間帯（朝7時台 / 昼12時台 / 夜21時台）の違いによる差を検証する`);
  }

  return { winPatterns, losePatterns, rules, ngRules, testHypotheses };
}

// ============================================================
// 学習ルールテキスト生成
// ============================================================

function buildLearningRulesText(
  result: Omit<AnalysisResult, "learningRules">,
  today: string
): string {
  const lines = [
    `# ■ 最新学習ルール（${today}）`,
    `# アカウント: @${result.username} / 分析投稿数: ${result.totalTweets}件`,
    "",
    "強化：",
    ...result.winPatterns.map((p) => `・${p}`),
    "",
    "抑制：",
    ...result.losePatterns.map((p) => `・${p}`),
    "",
    "投稿ルール：",
    ...result.rules.map((r) => `・${r}`),
    "",
    "NG：",
    ...result.ngRules.map((r) => `・${r}`),
    "",
    "テスト：",
    ...result.testHypotheses.map((h) => `・${h}`),
  ];
  return lines.join("\n");
}

// ============================================================
// メイン分析関数
// ============================================================

export function analyzeTweets(
  rawTweets: RawTweet[],
  username: string
): AnalysisResult {
  if (rawTweets.length === 0) {
    throw new Error("分析するツイートがありません");
  }

  const today = format(new Date(), "yyyy-MM-dd");

  // 特徴量抽出
  const analyzed: AnalyzedTweet[] = rawTweets.map((raw) => {
    const features = extractFeatures(raw);
    const metrics = raw.public_metrics
      ? {
          ...raw.public_metrics,
          ...calcEngagement(raw.public_metrics),
        }
      : undefined;
    return { ...features, metrics };
  });

  const hasMetrics = analyzed.some((t) => t.metrics !== undefined);

  // tier 付与
  const tiered = assignTiers(analyzed);

  // tier ごとの集計
  const topTweets = tiered.filter((t) => t.tier === "top");
  const bottomTweets = tiered.filter((t) => t.tier === "bottom");
  const topSummary = calcTierSummary(topTweets);
  const bottomSummary = calcTierSummary(bottomTweets);

  // 全体集計
  const all = calcTierSummary(tiered);
  const summary = {
    avgCharCount: all.avgCharCount,
    avgLineCount: all.avgLineCount,
    avgFirstLineLength: all.avgFirstLineLength,
    hashtagUsageRate: all.hashtagUsageRate,
    urlUsageRate: all.urlUsageRate,
    mediaUsageRate: all.mediaUsageRate,
    bulletUsageRate: all.bulletUsageRate,
    numberUsageRate: all.numberUsageRate,
  };

  // ルール生成
  const { winPatterns, losePatterns, rules, ngRules, testHypotheses } =
    generateRules(topSummary, bottomSummary, hasMetrics);

  const partial: Omit<AnalysisResult, "learningRules"> = {
    username,
    analyzedAt: new Date().toISOString(),
    totalTweets: tiered.length,
    hasMetrics,
    tweets: tiered,
    summary,
    topSummary,
    bottomSummary,
    winPatterns,
    losePatterns,
    rules,
    ngRules,
    testHypotheses,
  };

  const learningRules = buildLearningRulesText(partial, today);

  return { ...partial, learningRules };
}

// ============================================================
// CSV パース
// ============================================================

export function parseCsvToRawTweets(csvText: string): RawTweet[] {
  const lines = csvText.trim().split("\n");
  if (lines.length < 2) throw new Error("CSV が空か、ヘッダー行のみです");

  const header = lines[0].split(",").map((h) => h.trim().replace(/^"|"$/g, ""));

  const get = (row: string[], key: string): string => {
    const idx = header.indexOf(key);
    if (idx === -1) return "";
    return (row[idx] || "").trim().replace(/^"|"$/g, "");
  };

  const tweets: RawTweet[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // 簡易 CSV パース（カンマ内のカンマには非対応）
    const cols = line.split(",");
    const text = get(cols, "text");
    if (!text) continue;

    const likeCount = parseInt(get(cols, "like_count") || "0") || 0;
    const retweetCount = parseInt(get(cols, "retweet_count") || "0") || 0;
    const replyCount = parseInt(get(cols, "reply_count") || "0") || 0;
    const quoteCount = parseInt(get(cols, "quote_count") || "0") || 0;
    const impressionCount = parseInt(get(cols, "impression_count") || "0") || 0;
    const bookmarkCount = parseInt(get(cols, "bookmark_count") || "0") || 0;

    const hasAnyMetric = likeCount + retweetCount + replyCount > 0 || impressionCount > 0;

    tweets.push({
      id: get(cols, "id") || String(i),
      text,
      created_at: get(cols, "created_at") || new Date().toISOString(),
      public_metrics: hasAnyMetric
        ? {
            like_count: likeCount,
            retweet_count: retweetCount,
            reply_count: replyCount,
            quote_count: quoteCount,
            impression_count: impressionCount,
            bookmark_count: bookmarkCount,
          }
        : undefined,
    });
  }

  if (tweets.length === 0) throw new Error("有効な行が見つかりませんでした");
  return tweets;
}

// ============================================================
// デモデータ
// ============================================================

export function getDemoTweets(): RawTweet[] {
  return [
    {
      id: "d1",
      text: "昨日、初めて自分のサービスで売上が立った。\n金額は小さいけど、人が動いてくれたことが純粋に嬉しかった。\nやっぱり作るより届けるほうが難しい。",
      created_at: "2024-01-15T09:00:00Z",
      public_metrics: { like_count: 820, retweet_count: 145, reply_count: 67, quote_count: 23, impression_count: 38000, bookmark_count: 210 },
    },
    {
      id: "d2",
      text: "副業で月10万を達成するまでにやったこと：\n・毎朝6時に起きる\n・SNS発信を毎日続ける\n・スキルより人脈を先に作る\nこれだけ。派手なことは何もしてない。",
      created_at: "2024-01-14T12:00:00Z",
      public_metrics: { like_count: 1540, retweet_count: 389, reply_count: 112, quote_count: 56, impression_count: 72000, bookmark_count: 480 },
    },
    {
      id: "d3",
      text: "フリーランスになって3年。一番きつかったのは収入ゼロの月じゃなくて、自分が何者かわからなくなった時期だった。",
      created_at: "2024-01-13T21:00:00Z",
      public_metrics: { like_count: 2100, retweet_count: 510, reply_count: 198, quote_count: 78, impression_count: 95000, bookmark_count: 620 },
    },
    {
      id: "d4",
      text: "今日のタスク：\n✅ 朝のルーティン\n✅ 企画書3件\n⬜ 営業メール送付\n⬜ 読書30分\n午後も集中できそう！ #生産性向上 #副業",
      created_at: "2024-01-12T08:00:00Z",
      public_metrics: { like_count: 89, retweet_count: 12, reply_count: 8, quote_count: 2, impression_count: 4200, bookmark_count: 15 },
    },
    {
      id: "d5",
      text: "なぜかいつも「仕事ができる人」の周りには余白がある。\n予定を詰め込まない、すぐ返信しない、断れる。\n忙しさは戦略ミスのサインかもしれない。",
      created_at: "2024-01-11T20:30:00Z",
      public_metrics: { like_count: 3200, retweet_count: 890, reply_count: 234, quote_count: 102, impression_count: 145000, bookmark_count: 890 },
    },
    {
      id: "d6",
      text: "新しいブログ記事を書きました。「副業を始める際の注意点について」というテーマで、初心者の方向けにわかりやすくまとめています。ぜひ読んでみてください！ https://example.com/blog #副業 #ブログ",
      created_at: "2024-01-10T15:00:00Z",
      public_metrics: { like_count: 43, retweet_count: 8, reply_count: 5, quote_count: 1, impression_count: 2800, bookmark_count: 22 },
    },
    {
      id: "d7",
      text: "「努力は必ず報われる」と言う人より「努力が報われるまで続けた人」の話を聞きたい。",
      created_at: "2024-01-09T22:00:00Z",
      public_metrics: { like_count: 4100, retweet_count: 1200, reply_count: 345, quote_count: 189, impression_count: 210000, bookmark_count: 1100 },
    },
    {
      id: "d8",
      text: "今月の収益報告です。\nブログ: 32,000円\nSNS運用代行: 80,000円\n物販: 15,000円\n合計: 127,000円\n来月は15万を目指します！ #副業収入 #フリーランス",
      created_at: "2024-01-08T18:00:00Z",
      public_metrics: { like_count: 560, retweet_count: 98, reply_count: 72, quote_count: 18, impression_count: 28000, bookmark_count: 145 },
    },
    {
      id: "d9",
      text: "20代で後悔したこと、ひとつだけ言うなら「もっと早くアウトプットすればよかった」。\nインプットは安心感を与えてくれるけど、成長させてくれるのはアウトプットだった。",
      created_at: "2024-01-07T21:00:00Z",
      public_metrics: { like_count: 2800, retweet_count: 720, reply_count: 189, quote_count: 94, impression_count: 120000, bookmark_count: 750 },
    },
    {
      id: "d10",
      text: "おはようございます☀️\n今日も一日頑張りましょう！\n#おは活 #朝活 #副業",
      created_at: "2024-01-06T06:30:00Z",
      public_metrics: { like_count: 34, retweet_count: 5, reply_count: 12, quote_count: 0, impression_count: 1900, bookmark_count: 3 },
    },
    {
      id: "d11",
      text: "「時間がない」は嘘で「優先順位がない」が正確。\n1日24時間は全員に平等で、使い方だけが違う。",
      created_at: "2024-01-05T19:00:00Z",
      public_metrics: { like_count: 3600, retweet_count: 980, reply_count: 267, quote_count: 134, impression_count: 168000, bookmark_count: 920 },
    },
    {
      id: "d12",
      text: "本日のセミナーのお知らせです。\n「副業で月10万円を稼ぐ方法」というテーマで登壇します。\n参加費は無料ですので、ぜひご参加ください。\n詳細はこちら→ https://example.com/seminar #セミナー #副業",
      created_at: "2024-01-04T10:00:00Z",
      public_metrics: { like_count: 67, retweet_count: 18, reply_count: 14, quote_count: 3, impression_count: 5200, bookmark_count: 38 },
    },
    {
      id: "d13",
      text: "稼げる人と稼げない人の差は「行動量」じゃなくて「撤退判断の速さ」だと思ってる。\n続けることより、やめることのほうが難しい。",
      created_at: "2024-01-03T20:00:00Z",
      public_metrics: { like_count: 2950, retweet_count: 810, reply_count: 201, quote_count: 88, impression_count: 130000, bookmark_count: 680 },
    },
    {
      id: "d14",
      text: "2024年の目標：\n1. 月収50万達成\n2. フォロワー1万人\n3. 本を出す\n4. 海外移住\n今年こそ本気でやる！ #2024年目標 #副業",
      created_at: "2024-01-02T00:30:00Z",
      public_metrics: { like_count: 156, retweet_count: 23, reply_count: 45, quote_count: 7, impression_count: 8900, bookmark_count: 67 },
    },
    {
      id: "d15",
      text: "会社員を辞めてよかったこと、一番は「月曜日が怖くなくなったこと」。",
      created_at: "2024-01-01T21:00:00Z",
      public_metrics: { like_count: 5200, retweet_count: 1560, reply_count: 423, quote_count: 210, impression_count: 290000, bookmark_count: 1400 },
    },
  ];
}
