"use client";

import { useState } from "react";
import { Plus, Loader, AlertCircle } from "lucide-react";
import type { AccountDto } from "@/src/types";

export function ConnectButton() {
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConnect = async () => {
    setIsConnecting(true);
    setError(null);

    try {
      // OAuth フローを開始 → X にリダイレクト
      window.location.href = "/api/auth/x";
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      setError(message);
      console.error("[ConnectButton]", err);
      setIsConnecting(false);
    }
  };

  return (
    <>
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-6 flex items-center gap-2 text-sm text-red-700">
          <AlertCircle size={16} />
          {error}
        </div>
      )}

      <button
        onClick={handleConnect}
        disabled={isConnecting}
        className="flex items-center justify-center gap-2 w-full bg-black text-white rounded-xl px-4 py-3 text-sm font-medium hover:bg-gray-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {isConnecting ? (
          <>
            <Loader size={16} className="animate-spin" />
            接続中...
          </>
        ) : (
          <>
            <Plus size={16} />
            X アカウントを接続する
          </>
        )}
      </button>
    </>
  );
}
