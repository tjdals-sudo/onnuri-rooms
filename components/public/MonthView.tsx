"use client";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { daysOfMonth, fmtRange, fmtTime, todayKey, weekOf } from "@/lib/time";
import type { PublicReservation } from "@/lib/types";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const PREVIEW = 3; // 전체 장소를 볼 때 하루 칸에 보여 줄 건수

export default function MonthView({
  monthKey,
  reservations,
  showAll,
  singleRoom,
  onSelectDay,
}: {
  monthKey: string;
  reservations: PublicReservation[];
  /** 하루 칸에 예약을 전부 보여 줄지 (장소 하나 / 검색 중) */
  showAll: boolean;
  /** 장소가 하나뿐이면 칸마다 장소 이름을 반복하지 않는다 */
  singleRoom: boolean;
  onSelectDay: (dateKey: string) => void;
}) {
  const days = daysOfMonth(monthKey);
  const leading = weekOf(days[0], "sun").indexOf(days[0]); // 일요일 시작 기준 앞 빈칸
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
    <div className="card overflow-hidden print:rounded-none print:shadow-none">
      <div className="grid grid-cols-7 border-b border-line bg-[#eceef3] text-center text-sm font-semibold text-muted">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-2 print:py-1 ${i === 0 ? "text-[#b42318]" : i === 6 ? "text-[#2c6fb0]" : ""}`}>
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d, i) => {
          if (!d)
            return (
              <div key={`e${i}`} className="min-h-[88px] border-b border-r border-line/60 bg-[#f5f6f9] md:min-h-[120px] print:min-h-[44px]" />
            );
          const items = (byDay.get(d) ?? []).sort((a, b) => a.start_at.localeCompare(b.start_at));
          const shown = showAll ? items : items.slice(0, PREVIEW);
          const isToday = d === today;
          const dow = i % 7;
          return (
            <button
              key={d}
              onClick={() => onSelectDay(d)}
              className={`flex min-h-[88px] flex-col items-stretch border-b border-r border-line/60 p-1 text-left hover:bg-accent-soft md:min-h-[120px] print:min-h-[44px] print:break-inside-avoid ${isToday ? "bg-accent-soft/60 print:bg-transparent" : ""}`}
            >
              <div className="flex items-center justify-between px-1">
                <span
                  className={`text-sm font-bold ${dow === 0 ? "text-[#b42318]" : dow === 6 ? "text-[#2c6fb0]" : ""} ${isToday ? "rounded-full bg-accent px-1.5 text-white print:bg-transparent print:px-0 print:text-inherit" : ""}`}
                >
                  {Number(d.slice(8, 10))}
                </span>
                {items.length > 0 && <span className="text-xs text-muted print:hidden">{items.length}건</span>}
              </div>
              <ul className="mt-1 hidden space-y-0.5 md:block print:block">
                {shown.map((r) => {
                  const c = FLOOR_COLORS[r.floor];
                  return singleRoom ? (
                    <li
                      key={r.id}
                      className="rounded px-1 py-0.5 text-xs leading-snug break-keep print:text-[11px]"
                      style={{ background: c.soft, color: c.text }}
                    >
                      <span className="block font-semibold tabular-nums print:mr-1 print:inline">{fmtRange(r.start_at, r.end_at)}</span>
                      {r.title}
                      {r.department && <span className="opacity-75"> · {r.department}</span>}
                    </li>
                  ) : (
                    <li
                      key={r.id}
                      className={`rounded px-1 text-xs ${showAll ? "leading-snug break-keep" : "truncate"}`}
                      style={{ background: c.soft, color: c.text }}
                    >
                      {fmtTime(r.start_at)} {r.room_name} · {r.title}
                    </li>
                  );
                })}
                {items.length > shown.length && <li className="px-1 text-xs text-muted">외 {items.length - shown.length}건</li>}
              </ul>
              {items.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-0.5 md:hidden print:hidden">
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
