// src/lib/slot-scheduler.ts
// 汎用スロットスケジューラ - 投稿リストにslotベースで日時を自動割り当てする

// ─── スロット定義（拡張可能） ─────────────────────────────────────────────────
export interface SlotDefinition {
  label: string;        // 表示名
  defaultTime: string;  // デフォルト時刻 "HH:mm"
  order: number;        // 同日内の順序（小さいほど早い）
}

export type SlotId = string;

export const SLOT_DEFINITIONS: Record<SlotId, SlotDefinition> = {
  lunch: { label: "ランチ", defaultTime: "12:00", order: 0 },
  night: { label: "夜",     defaultTime: "21:00", order: 1 },
  late:  { label: "深夜",   defaultTime: "23:30", order: 2 },
};

// 同日内ソート順（SLOT_DEFINITIONS の order 準拠）
export const SLOT_ORDER: SlotId[] = Object.entries(SLOT_DEFINITIONS)
  .sort((a, b) => a[1].order - b[1].order)
  .map(([id]) => id);

// ─── 型定義 ───────────────────────────────────────────────────────────────────
export interface SchedulerConfig {
  startDate: string;                    // "YYYY-MM-DD"
  activeDays: number[];                 // 0=日, 1=月, …, 6=土
  slotTimes: Record<SlotId, string>;    // slot → "HH:mm"
  usedSlots: SlotId[];                  // 使用するスロット
  prioritySort: boolean;                // priority昇順でソートするか
}

export interface InputPost {
  text: string;
  slot: SlotId;
  category?: string | null;
  priority?: number | null;
}

export interface ScheduledPost extends InputPost {
  scheduledAt: Date;
}

// ─── エラー ──────────────────────────────────────────────────────────────────
export class SlotSchedulerError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SlotSchedulerError";
  }
}

// ─── ユーティリティ ──────────────────────────────────────────────────────────
function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split("-").map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0);
}

function parseTime(timeStr: string): { hours: number; minutes: number } {
  const [h, m] = timeStr.split(":").map(Number);
  return { hours: h || 0, minutes: m || 0 };
}

function slotSortOrder(slotId: SlotId): number {
  const idx = SLOT_ORDER.indexOf(slotId);
  return idx === -1 ? 999 : idx;
}

// ─── メイン関数 ──────────────────────────────────────────────────────────────
/**
 * 投稿リストにスロットベースのスケジュールを割り当てる（純粋関数）
 *
 * アルゴリズム:
 * 1. prioritySort=true ならば priority 昇順でソート
 * 2. アクティブ曜日を順に辿り (date, slot) ペアをキューとして生成
 * 3. 各投稿に対して、slot が一致する最初の未使用日時を割り当てる
 * 4. ウォーターマーク（最後に割り当てた日時）以降しか使わないため
 *    投稿間の時系列順が保証される
 */
export function assignSchedule(
  posts: InputPost[],
  config: SchedulerConfig
): ScheduledPost[] {
  if (posts.length === 0) return [];

  // ── バリデーション ──────────────────────────────────────────────────────────
  const validSlotIds = Object.keys(SLOT_DEFINITIONS);

  for (const post of posts) {
    if (!validSlotIds.includes(post.slot)) {
      throw new SlotSchedulerError(
        `未定義のslotです: "${post.slot}"。使用可能: ${Object.keys(SLOT_DEFINITIONS).join(", ")}`
      );
    }
    if (!config.usedSlots.includes(post.slot)) {
      throw new SlotSchedulerError(
        `slot "${post.slot}" は「使用するスロット」に含まれていません`
      );
    }
  }

  if (config.activeDays.length === 0) {
    throw new SlotSchedulerError("投稿曜日が1つも選択されていません");
  }

  // ── ソート ──────────────────────────────────────────────────────────────────
  const sorted = config.prioritySort
    ? [...posts].sort((a, b) => (a.priority ?? 999) - (b.priority ?? 999))
    : [...posts];

  // ── 使用スロットを同日内順序でソート ──────────────────────────────────────
  const orderedUsedSlots = config.usedSlots
    .slice()
    .sort((a, b) => slotSortOrder(a) - slotSortOrder(b));

  // ── スロットごとの日時キューを生成 ────────────────────────────────────────
  // 最大生成日数 = 投稿数 × 14日（余裕係数）
  const MAX_DAYS = Math.max(posts.length * 14, 90);

  const slotQueues: Record<SlotId, Date[]> = {};
  for (const slotId of orderedUsedSlots) {
    slotQueues[slotId] = [];
  }

  const start = parseLocalDate(config.startDate);
  const current = new Date(start);

  for (let day = 0; day < MAX_DAYS; day++) {
    const dow = current.getDay();
    if (config.activeDays.includes(dow)) {
      for (const slotId of orderedUsedSlots) {
        const timeStr =
          config.slotTimes[slotId] ?? SLOT_DEFINITIONS[slotId]?.defaultTime ?? "12:00";
        const { hours, minutes } = parseTime(timeStr);
        const dt = new Date(current);
        dt.setHours(hours, minutes, 0, 0);
        slotQueues[slotId].push(dt);
      }
    }
    current.setDate(current.getDate() + 1);
  }

  // ── ウォーターマーク方式でスロット割り当て ─────────────────────────────────
  // 最後に割り当てた日時。次の割り当てはこれより後でなければならない。
  let watermark = new Date(0);

  const queuePtrs: Record<SlotId, number> = {};
  for (const slotId of orderedUsedSlots) {
    queuePtrs[slotId] = 0;
  }

  const result: ScheduledPost[] = [];

  for (const post of sorted) {
    const { slot } = post;
    const queue = slotQueues[slot];
    let ptr = queuePtrs[slot];

    // ウォーターマーク以降の最初のスロットを探す
    while (ptr < queue.length && queue[ptr] <= watermark) {
      ptr++;
    }

    if (ptr >= queue.length) {
      throw new SlotSchedulerError(
        `slot "${slot}" の日程が不足しました。投稿曜日を増やすか、投稿数を減らしてください。`
      );
    }

    watermark = queue[ptr];
    queuePtrs[slot] = ptr + 1;

    result.push({ ...post, scheduledAt: new Date(watermark) });
  }

  return result;
}
