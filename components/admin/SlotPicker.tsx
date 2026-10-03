"use client";
import { useState } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { SLOT_MINUTES, clipToDay, fmtRange, minToLabel } from "@/lib/time";
import type { Reservation, Room } from "@/lib/types";

/** 30분 슬롯 48개. 찬 칸은 비활성. 시작 → 종료 순서로 두 번 클릭 */
export default function SlotPicker({
  room,
  dateKey,
  reservations,
  onPick,
}: {
  room: Room;
  dateKey: string;
  reservations: Reservation[];
  onPick: (startTime: string, endTime: string) => void;
}) {
  const [start, setStart] = useState<number | null>(null);
  const [end, setEnd] = useState<number | null>(null);

  const dayItems = reservations
    .filter((r) => r.room_id === room.id)
    .map((r) => ({ r, clip: clipToDay(r.start_at, r.end_at, dateKey) }))
    .filter((x) => x.clip !== null) as { r: Reservation; clip: NonNullable<ReturnType<typeof clipToDay>> }[];

  const occupied = (slotMin: number) => dayItems.find((x) => x.clip.fromMin < slotMin + SLOT_MINUTES && x.clip.toMin > slotMin);
  const c = FLOOR_COLORS[room.floor];

  const click = (slotMin: number) => {
    if (start === null || end !== null) {
      setStart(slotMin);
      setEnd(null);
      return;
    }
    if (slotMin < start) {
      setStart(slotMin);
      return;
    }
    // start~slot 사이에 찬 칸이 있으면 선택 불가
    for (let m = start; m <= slotMin; m += SLOT_MINUTES) if (occupied(m)) return;
    setEnd(slotMin + SLOT_MINUTES);
  };

  return (
    <div>
      <p className="mb-2 text-sm text-muted">
        <strong style={{ color: c.text }}>{room.name}</strong> · {room.capacity_text} · {room.seating_type} — 시작 칸을 누른 뒤 종료 칸을 누르세요.
        자정을 넘기는 예약은 폼에서 종료 날짜를 다음날로 바꾸면 됩니다.
      </p>
      <div className="grid grid-cols-6 gap-1 sm:grid-cols-8 md:grid-cols-12">
        {Array.from({ length: 48 }, (_, i) => {
          const m = i * SLOT_MINUTES;
          const occ = occupied(m);
          const inRange = start !== null && (end !== null ? m >= start && m < end : m === start);
          return (
            <button
              key={i}
              disabled={Boolean(occ)}
              onClick={() => click(m)}
              title={occ ? `${fmtRange(occ.r.start_at, occ.r.end_at)} '${occ.r.title}'` : minToLabel(m)}
              className={`h-10 rounded border text-xs tabular-nums ${
                occ
                  ? "cursor-not-allowed border-line bg-[#ece6dc] text-muted line-through"
                  : inRange
                    ? "border-accent bg-accent font-bold text-white"
                    : "border-line bg-surface hover:bg-accent-soft"
              }`}
              aria-pressed={inRange}
            >
              {minToLabel(m)}
            </button>
          );
        })}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="text-base">
          선택: {start !== null ? minToLabel(start) : "—"} ~ {end !== null ? minToLabel(end) : start !== null ? "(종료 칸 선택)" : "—"}
        </span>
        <button
          className="btn btn-primary ml-auto"
          disabled={start === null || end === null}
          onClick={() => start !== null && end !== null && onPick(minToLabel(start), minToLabel(end))}
        >
          이 시간으로 예약 →
        </button>
      </div>
      {dayItems.length > 0 && (
        <ul className="mt-3 space-y-1 text-sm">
          {dayItems.map(({ r }) => (
            <li key={r.id} className="flex gap-2 rounded px-2 py-1" style={{ background: c.soft, color: c.text }}>
              <span className="font-semibold tabular-nums">{fmtRange(r.start_at, r.end_at)}</span>
              <span className="truncate">{r.title}{r.department ? ` · ${r.department}` : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
