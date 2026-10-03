"use client";
import { useRef } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { clipToDay, fmtRange, isOngoing } from "@/lib/time";
import { FLOORS, FLOOR_LABEL, type PublicReservation, type Room } from "@/lib/types";

/** 모바일: 층별 카드, 장소마다 그날 예약을 세로로 */
export default function MobileDayList({
  rooms,
  reservations,
  dateKey,
  now,
  onSwipe,
}: {
  rooms: Room[];
  reservations: PublicReservation[];
  dateKey: string;
  now: Date;
  onSwipe: (delta: number) => void;
}) {
  const touchX = useRef<number | null>(null);

  if (rooms.length === 0) {
    return <div className="card p-6 text-center text-muted">조건에 맞는 장소가 없습니다.</div>;
  }

  return (
    <div
      className="space-y-4"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return;
        const dx = e.changedTouches[0].clientX - touchX.current;
        touchX.current = null;
        if (Math.abs(dx) > 70) onSwipe(dx < 0 ? 1 : -1);
      }}
    >
      {FLOORS.map((floor) => {
        const floorRooms = rooms.filter((r) => r.floor === floor);
        if (floorRooms.length === 0) return null;
        const c = FLOOR_COLORS[floor];
        return (
          <section key={floor} className="card overflow-hidden">
            <h3 className="px-4 py-2 text-base font-bold" style={{ background: c.soft, color: c.text }}>
              {FLOOR_LABEL[floor]}
            </h3>
            <ul className="divide-y divide-line">
              {floorRooms.map((room) => {
                const items = reservations
                  .filter((r) => r.room_id === room.id && clipToDay(r.start_at, r.end_at, dateKey))
                  .sort((a, b) => a.start_at.localeCompare(b.start_at));
                return (
                  <li key={room.id} className="px-4 py-3">
                    <div className="mb-1 flex items-baseline justify-between">
                      <span className="text-lg font-semibold">{room.name}</span>
                      <span className="text-xs text-muted">
                        {room.capacity_text} · {room.seating_type}
                      </span>
                    </div>
                    {items.length === 0 ? (
                      <p className="text-sm text-muted">예약 없음</p>
                    ) : (
                      <ul className="space-y-1.5">
                        {items.map((r) => {
                          const ongoing = isOngoing(r.start_at, r.end_at, now);
                          return (
                            <li
                              key={r.id}
                              className="flex flex-wrap items-center gap-x-2 rounded-lg border-l-4 px-3 py-2"
                              style={{ borderColor: c.bg, background: c.soft }}
                            >
                              <span className="font-semibold tabular-nums" style={{ color: c.text }}>
                                {fmtRange(r.start_at, r.end_at)}
                              </span>
                              {ongoing && (
                                <span className="rounded bg-[#d93025] px-1.5 py-0.5 text-xs font-bold text-white">
                                  사용 중
                                </span>
                              )}
                              <span className="w-full text-base">
                                {r.title}
                                {r.department && <span className="text-muted"> · {r.department}</span>}
                              </span>
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
