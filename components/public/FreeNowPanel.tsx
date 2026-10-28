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
    <section className="mb-6 px-1" aria-label="지금 비어 있는 장소">
      <h3 className="font-title mb-3 flex items-baseline gap-2.5 text-xl md:text-[22px]">
        {free.length === 0 ? (
          "지금은 모든 장소가 사용 중이에요"
        ) : (
          <>
            지금 <span className="text-accent">{free.length}곳</span>이 비어 있어요
          </>
        )}
        <span className="font-sans text-sm text-muted">{fmtTime(now)} 기준</span>
      </h3>
      {free.length > 0 && (
        <ul className="flex flex-wrap gap-2">
          {free.map((r) => (
            <li
              key={r.id}
              className="flex items-baseline gap-2 rounded-full border border-line bg-surface py-2 pr-4 pl-3.5"
            >
              <span
                className="h-2 w-2 shrink-0 self-center rounded-full"
                style={{ background: FLOOR_COLORS[r.floor].bg }}
                aria-label={FLOOR_SHORT[r.floor]}
              />
              <span className="font-semibold">{r.name}</span>
              <span className="text-sm text-muted">{nextFor(r.id)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
