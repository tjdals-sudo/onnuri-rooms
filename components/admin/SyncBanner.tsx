"use client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { resyncSheets } from "@/lib/actions/sheets";
import { fmtDateTime } from "@/lib/time";
import type { SheetSyncStatus } from "@/lib/types";

export default function SyncBanner({ errors, configured }: { errors: SheetSyncStatus[]; configured: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  if (!configured) {
    return (
      <div className="border-b border-line bg-[#f3ece2] px-4 py-1.5 text-center text-sm text-muted">
        Google 스프레드시트 연동이 아직 설정되지 않았습니다 (README 5단계). 예약 기능은 정상 동작합니다.
      </div>
    );
  }
  if (errors.length === 0 && !msg) return null;

  const run = () =>
    start(async () => {
      const r = await resyncSheets();
      setMsg(r.ok ? `동기화 완료 (${r.data.synced.join(", ")})` : `동기화 실패: ${r.error}`);
      router.refresh();
    });

  return (
    <div className="border-b border-danger/30 bg-red-50 px-4 py-2 text-sm text-danger">
      <div className="mx-auto flex max-w-[1500px] flex-wrap items-center gap-3">
        {errors.length > 0 ? (
          <span>
            ⚠ 구글 시트 동기화 실패:{" "}
            {errors.map((e) => `${e.target} (${fmtDateTime(e.synced_at)}) ${e.error_message}`).join(" / ")}
          </span>
        ) : (
          <span className="text-ok">{msg}</span>
        )}
        <button className="btn btn-sm ml-auto" onClick={run} disabled={pending}>
          {pending ? "동기화 중…" : "시트 다시 동기화"}
        </button>
      </div>
    </div>
  );
}
