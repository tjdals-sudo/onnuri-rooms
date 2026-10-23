"use client";
import { useEffect } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { fmtDateKo, fmtRange } from "@/lib/time";
import { FLOOR_SHORT, type ConflictInfo, type Room } from "@/lib/types";

/**
 * 예약이 겹칠 때 뜨는 팝업 — 어느 장소·시간에 어느 팀(부서)과 겹치는지 보여 주고,
 * 같은 시간에 비어 있는 장소를 고르면 그 장소로 바꾼다.
 */
export default function ConflictDialog({
  conflicts,
  alternatives,
  onPickRoom,
  onClose,
}: {
  conflicts: ConflictInfo[];
  /** null = 아직 찾는 중 / 추천 안 함 */
  alternatives: Room[] | null;
  onPickRoom: (room: Room) => void;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const teams = Array.from(new Set(conflicts.map((c) => c.department || "부서 미입력")));

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4" role="alertdialog" aria-modal aria-labelledby="conflict-title" onClick={onClose}>
      <div className="card w-full max-w-md p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        <h2 id="conflict-title" className="text-xl font-bold text-danger">⚠ 예약이 겹쳐요</h2>
        <p className="mt-1 text-base">
          이 시간에는 이미 <strong>{teams.join(", ")}</strong> 예약이 있어요.
        </p>

        <ul className="mt-3 max-h-64 space-y-2 overflow-y-auto">
          {conflicts.map((c) => {
            const color = FLOOR_COLORS[c.floor];
            return (
              <li key={c.id} className="rounded-lg border-l-4 px-3 py-2" style={{ borderColor: color.bg, background: color.soft, color: color.text }}>
                <div className="flex flex-wrap items-baseline gap-x-2">
                  <span className="text-lg font-bold">{c.department || "부서 미입력"}</span>
                  <span className="min-w-0 truncate">&lsquo;{c.title}&rsquo;</span>
                </div>
                <div className="text-sm tabular-nums">
                  {FLOOR_SHORT[c.floor]} {c.room_name} · {fmtDateKo(c.start_at)} {fmtRange(c.start_at, c.end_at)}
                </div>
              </li>
            );
          })}
        </ul>

        {alternatives && alternatives.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold">같은 시간에 비어 있는 장소 — 누르면 이 장소로 바꿔요</p>
            <div className="flex flex-wrap gap-2">
              {alternatives.map((r) => (
                <button
                  key={r.id}
                  className="btn btn-sm"
                  style={{ borderColor: FLOOR_COLORS[r.floor].border, color: FLOOR_COLORS[r.floor].text }}
                  onClick={() => onPickRoom(r)}
                >
                  {FLOOR_SHORT[r.floor]} {r.name} · {r.capacity_text}
                </button>
              ))}
            </div>
          </div>
        )}
        {alternatives && alternatives.length === 0 && <p className="mt-4 text-sm text-muted">같은 시간에 비어 있는 다른 장소가 없습니다.</p>}

        <div className="mt-5 flex justify-end">
          <button className="btn btn-primary" onClick={onClose} autoFocus>
            시간·장소 다시 고르기
          </button>
        </div>
      </div>
    </div>
  );
}
