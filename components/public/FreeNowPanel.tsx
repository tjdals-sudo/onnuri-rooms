"use client";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { fmtTime, isOngoing } from "@/lib/time";
import { FLOOR_SHORT, type PublicReservation, type Room } from "@/lib/types";

export default function FreeNowPanel({
  rooms,
  reservations,
  now,
}: {
  rooms: Room[];
  reservations: PublicReservation[];
  now: Date;
}) {
  const busy = new Set(reservations.filter((r) => isOngoing(r.start_at, r.end_at, now)).map((r) => r.room_id));
  const free = rooms.filter((r) => !busy.has(r.id));

  const nextFor = (roomId: string) => {
    const upcoming = reservations
      .filter((r) => r.room_id === roomId && new Date(r.start_at) > now)
      .sort((a, b) => a.start_at.localeCompare(b.start_at))[0];
    return upcoming ? `다음 예약 ${fmtTime(upcoming.start_at)}` : "오늘 남은 예약 없음";
  };

  return (
    <section className="card mb-4 p-4" aria-label="지금 비어 있는 장소">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-lg font-bold">
          지금 비어 있는 장소 <span className="text-muted">({free.length}곳)</span>
        </h3>
        <span className="text-sm text-muted">{fmtTime(now)} 기준</span>
      </div>
      {free.length === 0 ? (
        <p className="text-muted">지금은 모든 장소가 사용 중입니다.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {free.map((r) => {
            const c = FLOOR_COLORS[r.floor];
            return (
              <li
                key={r.id}
                className="flex items-center gap-2 rounded-lg border px-3 py-2"
                style={{ background: c.soft, borderColor: c.border, color: c.text }}
              >
                <span className="rounded px-1.5 py-0.5 text-xs font-bold text-white" style={{ background: c.bg }}>
                  {FLOOR_SHORT[r.floor]}
                </span>
                <span className="font-semibold">{r.name}</span>
                <span className="text-sm opacity-80">{nextFor(r.id)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
