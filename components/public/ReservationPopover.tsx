"use client";
import { useEffect, useRef } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { fmtRange, isOngoing } from "@/lib/time";
import { FLOOR_LABEL, type PublicReservation } from "@/lib/types";

const POP_W = 240;

/** 예약 막대(카드)를 누르면 뜨는 작은 정보 칸. 누른 요소에는 data-res-bar 를 붙인다 */
export default function ReservationPopover({
  r,
  rect,
  now,
  onClose,
}: {
  r: PublicReservation;
  rect: DOMRect;
  now: Date;
  onClose: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const c = FLOOR_COLORS[r.floor];

  // 바깥 클릭·Esc·스크롤·창 크기 변경 시 닫기
  useEffect(() => {
    const onDown = (e: PointerEvent) => {
      const t = e.target as Element;
      if (box.current?.contains(t) || t.closest?.("[data-res-bar]")) return;
      onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  // 막대 아래에 띄우되, 화면 아래가 모자라면 위로
  const vw = typeof window === "undefined" ? 1024 : window.innerWidth;
  const vh = typeof window === "undefined" ? 768 : window.innerHeight;
  const w = Math.min(POP_W, vw - 16);
  const left = Math.min(Math.max(8, rect.left), vw - w - 8);
  const below = rect.bottom + 6 + 150 < vh;
  const pos = below ? { top: rect.bottom + 6 } : { bottom: vh - rect.top + 6 };
  const ongoing = isOngoing(r.start_at, r.end_at, now);

  return (
    <div
      ref={box}
      role="dialog"
      aria-label="예약 정보"
      className="fixed z-50 rounded-lg border border-line bg-surface p-3 text-sm shadow-lg"
      style={{ left, width: w, borderTop: `4px solid ${c.bg}`, ...pos }}
    >
      <button
        type="button"
        onClick={onClose}
        aria-label="닫기"
        className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded text-muted hover:bg-line/50"
      >
        ✕
      </button>
      <p className="pr-6 font-bold leading-snug break-keep">{r.title}</p>
      <dl className="mt-2 space-y-1 text-[13px]">
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-muted">시간</dt>
          <dd>
            {fmtRange(r.start_at, r.end_at)}
            {ongoing && <span className="ml-1 font-bold text-[#b42318]">사용 중</span>}
          </dd>
        </div>
        <div className="flex gap-2">
          <dt className="w-10 shrink-0 text-muted">장소</dt>
          <dd>
            {FLOOR_LABEL[r.floor]} {r.room_name}
          </dd>
        </div>
        {r.department && (
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-muted">부서</dt>
            <dd className="break-keep">{r.department}</dd>
          </div>
        )}
        {r.attendees != null && (
          <div className="flex gap-2">
            <dt className="w-10 shrink-0 text-muted">인원</dt>
            <dd>{r.attendees}명</dd>
          </div>
        )}
      </dl>
    </div>
  );
}
