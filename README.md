# X Post Bridge

ClaudeのX投稿文をX APIに安全に流し込む予約投稿ブリッジWebアプリ。

## 特徴

- Claudeで作成した複数投稿文をまとめて貼り付け → 自動分割
- 各投稿に予約日時を設定（分単位）
- X API v2 (`POST /2/tweets`) 経由で投稿
- 予約はアプリ側ジョブで管理（Vercel Cron or node-cron）
- 429 対応: 指数バックオフ + 自動リトライ（最大3回）
- アクセストークンを AES-256-GCM で暗号化保存
- **ブラウザ自動操作は一切使用しない**

## セットアップ

### 1. リポジトリのクローン & 依存インストール

```bash
git clone <your-repo>
cd x-post-bridge
npm install
```

### 2. 環境変数の設定

```bash
cp .env.example .env.local
```

`.env.local` を開いて以下を埋める：

| 変数名 | 説明 | 取得方法 |
|--------|------|----------|
| `DATABASE_URL` | PostgreSQL 接続文字列 | Supabase / Neon / ローカル |
| `X_CLIENT_ID` | X OAuth 2.0 Client ID | X Developer Console → App → Keys |
| `X_CLIENT_SECRET` | X OAuth 2.0 Client Secret | 同上 |
| `X_CALLBACK_URL` | コールバックURL | `http://localhost:3000/api/auth/x/callback` |
| `ENCRYPTION_KEY` | トークン暗号化キー | `openssl rand -base64 32` |
| `CRON_SECRET` | Cronエンドポイント保護 | 任意の文字列 |
| `NEXT_PUBLIC_APP_URL` | アプリURL | デプロイ先URL |

### 3. X Developer Console の設定

1. [developer.x.com](https://developer.x.com) で Developer Account 作成
2. Project → App を作成
3. App の **User authentication settings** を設定：
   - OAuth 2.0 を **ON**
   - App type: **Web App**
   - Callback URL: `http://localhost:3000/api/auth/x/callback`
   - Website URL: 任意
4. **Keys and tokens** タブで Client ID / Client Secret を取得
5. App の **Permissions** で `Read and Write` を選択

### 4. DBのセットアップ

```bash
npm run db:push     # 開発時（スキーマを直接反映）
# または
npm run db:migrate  # マイグレーションファイルを生成して実行
```

### 5. 開発サーバー起動

```bash
npm run dev
```

`http://localhost:3000` → 自動的に `/import` にリダイレクト

---

## 使い方

### Step 1: アカウント接続 (`/accounts`)

「X アカウントを接続する」ボタンから OAuth 認証を行う。
接続後、アカウント名とアイコンが表示される。

### Step 2: 投稿インポート (`/import`)

Claudeで作成した投稿文を「まとめて貼り付け」欄に入力。

**区切り文字について：**
- `---`（ハイフン3つ）で区切ると自動分割
- `===` / `【投稿1】` / `## タイトル` なども対応
- 区切りがない場合は空行2行以上で分割

「分割プレビューを確認」→ 内容を確認 → 「保存」

### Step 3: 予約設定 (`/schedule`)

各投稿カードの日時ピッカーで投稿日時を設定。
設定するとステータスが「予約済」に変わる。

### Step 4: 投稿実行 (`/publish`)

- 予約時刻になると自動投稿（Vercel Cron が `/api/cron` を毎分叩く）
- 「今すぐ投稿」ボタンで手動即時投稿も可能

### Step 5: ログ確認 (`/logs`)

成功/失敗ログを一覧表示。失敗時はエラー詳細を展開して確認できる。

---

## スケジューラーの仕組み

```
[Vercel Cron / node-cron]
    ↓ 毎分
GET /api/cron?secret=CRON_SECRET
    ↓
scheduler.runScheduledJobs()
    ↓
scheduled_at <= now() の SCHEDULED 投稿を抽出
    ↓ 各投稿を
postTweet(accessToken, { text })
    ↓
成功 → status=PUBLISHED, PostLog(SUCCESS)
失敗 → 最大3回リトライ → status=FAILED, PostLog(FAILED)
```

### セルフホスト時のCron設定

Vercel を使わない場合は、サーバー側で node-cron を設定：

```typescript
// scripts/cron.ts
import cron from "node-cron";
import { runScheduledJobs } from "./src/services/scheduler";

cron.schedule("* * * * *", async () => {
  const result = await runScheduledJobs();
  console.log("[cron]", result);
});
```

---

## 画面構成

| URL | 役割 |
|-----|------|
| `/import` | 投稿文のまとめ貼り付け・分割・保存 |
| `/schedule` | 各投稿への予約日時設定 |
| `/publish` | 予約済み投稿の確認・即時投稿 |
| `/logs` | 投稿成功/失敗ログ一覧 |
| `/accounts` | Xアカウント接続管理 |

---

## 技術スタック

| 用途 | ライブラリ |
|------|-----------|
| フレームワーク | Next.js 14 (App Router) |
| 言語 | TypeScript |
| スタイリング | Tailwind CSS |
| ORM | Prisma |
| DB | PostgreSQL |
| HTTP | axios |
| 暗号化 | Node.js crypto (AES-256-GCM) |
| アイコン | lucide-react |

---

## 今後の拡張予定

- **画像投稿**: `src/services/x-api/media.ts` の stub を完成させる（twitter-api-v2 ライブラリ推奨）
- **複数アカウント**: Account テーブルで対応済み。UI側で切り替えUIを追加
- **スレッド投稿**: `reply.in_reply_to_tweet_id` を使ったスレッド化
- **分析ダッシュボード**: 投稿インプレッション取得（X API GET /2/tweets/:id）
