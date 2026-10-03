"use client";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { clipToDay, fmtDateKeyKo, fmtRange, isOngoing, todayKey, weekdayKo } from "@/lib/time";
import { FLOOR_SHORT, type PublicReservation } from "@/lib/types";

export default function WeekView({
  days,
  reservations,
  now,
  onSelectDay,
}: {
  days: string[];
  reservations: PublicReservation[];
  now: Date;
  onSelectDay: (dateKey: string) => void;
}) {
  const today = todayKey(now);
  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-7 md:gap-2">
      {days.map((d) => {
        const items = reservations
          .filter((r) => clipToDay(r.start_at, r.end_at, d))
          .sort((a, b) => a.start_at.localeCompare(b.start_at));
        const isToday = d === today;
        return (
          <section key={d} className={`card overflow-hidden ${isToday ? "ring-2 ring-accent" : ""}`}>
            <button
              className="flex w-full items-center justify-between px-3 py-2 text-left hover:bg-accent-soft"
              onClick={() => onSelectDay(d)}
            >
              <span className="font-bold">
                <span className="md:hidden">{fmtDateKeyKo(d).replace(/^\d+년 /, "")}</span>
                <span className="hidden md:inline">
                  {Number(d.slice(8, 10))}일 ({weekdayKo(d)})
                </span>
              </span>
              <span className="text-xs text-muted">{items.length}건</span>
            </button>
            <ul className="space-y-1 px-2 pb-2">
              {items.length === 0 && <li className="px-1 py-2 text-sm text-muted">예약 없음</li>}
              {items.map((r) => {
                const c = FLOOR_COLORS[r.floor];
                const ongoing = isOngoing(r.start_at, r.end_at, now);
                return (
                  <li
                    key={r.id}
                    className="rounded-md border-l-4 px-2 py-1 text-sm"
                    style={{ borderColor: c.bg, background: c.soft, color: c.text }}
                    title={`${r.room_name} · ${fmtRange(r.start_at, r.end_at)} · ${r.title}`}
                  >
                    <div className="flex items-center gap-1 font-semibold">
                      <span className="rounded px-1 text-[11px] text-white" style={{ background: c.bg }}>
                        {FLOOR_SHORT[r.floor]}
                      </span>
                      <span className="truncate">{r.room_name}</span>
                      {ongoing && <span className="ml-auto text-[11px] font-bold text-[#b42318]">사용 중</span>}
                    </div>
                    <div className="tabular-nums">{fmtRange(r.start_at, r.end_at)}</div>
                    <div className="truncate">
                      {r.title}
                      {r.department && <span className="opacity-70"> · {r.department}</span>}
                    </div>
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
