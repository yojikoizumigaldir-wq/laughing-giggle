"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { clsx } from "clsx";
import {
  Upload,
  CalendarDays,
  Send,
  ScrollText,
  UserCircle2,
  BarChart2,
} from "lucide-react";

const NAV_ITEMS = [
  { href: "/import", label: "インポート", icon: Upload },
  { href: "/schedule", label: "スケジュール", icon: CalendarDays },
  { href: "/publish", label: "投稿確認", icon: Send },
  { href: "/logs", label: "ログ", icon: ScrollText },
  { href: "/accounts", label: "アカウント", icon: UserCircle2 },
  { href: "/analyze", label: "アカウント分析", icon: BarChart2 },
];

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="h-screen w-56 border-r border-gray-100 bg-white flex flex-col p-4 gap-1 fixed left-0 top-0">
      {/* ロゴ */}
      <div className="px-3 py-4 mb-2">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 bg-black rounded-md flex items-center justify-center">
            <span className="text-white text-xs font-bold">X</span>
          </div>
          <div>
            <p className="text-sm font-bold text-gray-900 leading-tight">
              Post Bridge
            </p>
            <p className="text-xs text-gray-400">予約投稿管理</p>
          </div>
        </div>
      </div>

      {/* ナビゲーション */}
      {NAV_ITEMS.map(({ href, label, icon: Icon }) => {
        const isActive = pathname === href || pathname.startsWith(href + "/");
        return (
          <Link
            key={href}
            href={href}
            className={clsx(
              "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
              isActive
                ? "bg-black text-white"
                : "text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            )}
          >
            <Icon size={16} />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
