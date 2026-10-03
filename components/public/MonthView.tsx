"use client";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { daysOfMonth, fmtTime, todayKey, weekOf } from "@/lib/time";
import type { PublicReservation } from "@/lib/types";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function MonthView({
  monthKey,
  reservations,
  onSelectDay,
}: {
  monthKey: string;
  reservations: PublicReservation[];
  onSelectDay: (dateKey: string) => void;
}) {
  const days = daysOfMonth(monthKey);
  const firstWeek = weekOf(days[0]);
  const leading = firstWeek.indexOf(days[0]); // 월요일 시작 기준 앞 빈칸
  const today = todayKey();

  // 날짜별 집계 (시작일 기준)
  const byDay = new Map<string, PublicReservation[]>();
  for (const r of reservations) {
    const key = new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date(r.start_at));
    const arr = byDay.get(key) ?? [];
    arr.push(r);
    byDay.set(key, arr);
  }

  const cells: (string | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7 !== 0) cells.push(null);

  return (
    <div className="card overflow-hidden">
      <div className="grid grid-cols-7 border-b border-line bg-[#f3ece2] text-center text-sm font-semibold text-muted">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-2 ${i === 5 ? "text-[#2c6fb0]" : i === 6 ? "text-[#b42318]" : ""}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d) return <div key={`e${i}`} className="min-h-[88px] border-b border-r border-line/60 bg-[#faf6ef]" />;
          const items = (byDay.get(d) ?? []).sort((a, b) => a.start_at.localeCompare(b.start_at));
          const isToday = d === today;
          const dow = i % 7;
          return (
            <button
              key={d}
              onClick={() => onSelectDay(d)}
              className={`flex min-h-[88px] flex-col items-stretch border-b border-r border-line/60 p-1 text-left hover:bg-accent-soft md:min-h-[120px] ${isToday ? "bg-accent-soft/60" : ""}`}
            >
              <div className="flex items-center justify-between px-1">
                <span
                  className={`text-sm font-bold ${dow === 5 ? "text-[#2c6fb0]" : dow === 6 ? "text-[#b42318]" : ""} ${isToday ? "rounded-full bg-accent px-1.5 text-white" : ""}`}
                >
                  {Number(d.slice(8, 10))}
                </span>
                {items.length > 0 && <span className="text-xs text-muted">{items.length}건</span>}
              </div>
              <ul className="mt-1 hidden space-y-0.5 md:block">
                {items.slice(0, 3).map((r) => {
                  const c = FLOOR_COLORS[r.floor];
                  return (
                    <li
                      key={r.id}
                      className="truncate rounded px-1 text-xs"
                      style={{ background: c.soft, color: c.text }}
                    >
                      {fmtTime(r.start_at)} {r.room_name} · {r.title}
                    </li>
                  );
                })}
                {items.length > 3 && <li className="px-1 text-xs text-muted">외 {items.length - 3}건</li>}
              </ul>
              {items.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5 md:hidden">
                  {items.slice(0, 6).map((r) => (
                    <span
                      key={r.id}
                      className="h-2 w-2 rounded-full"
                      style={{ background: FLOOR_COLORS[r.floor].bg }}
                      aria-hidden
                    />
                  ))}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}
