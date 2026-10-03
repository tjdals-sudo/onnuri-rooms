"use client";
import { daysOfMonth, fmtMonthKo, todayKey, weekOf } from "@/lib/time";

const WEEKDAYS = ["월", "화", "수", "목", "금", "토", "일"];

export default function AdminCalendar({
  monthKey,
  counts,
  selected,
  onSelect,
  onMonthChange,
}: {
  monthKey: string;
  counts: Record<string, number>;
  selected: string;
  onSelect: (dateKey: string) => void;
  onMonthChange: (delta: number) => void;
}) {
  const days = daysOfMonth(monthKey);
  const leading = weekOf(days[0]).indexOf(days[0]);
  const cells: (string | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const today = todayKey();

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button className="btn btn-sm" onClick={() => onMonthChange(-1)} aria-label="이전 달">◀</button>
        <h2 className="text-lg font-bold">{fmtMonthKo(monthKey)}</h2>
        <button className="btn btn-sm" onClick={() => onMonthChange(1)} aria-label="다음 달">▶</button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">{w}</div>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) =>
          d ? (
            <button
              key={d}
              onClick={() => onSelect(d)}
              className={`flex h-12 flex-col items-center justify-center rounded-lg border text-sm ${
                d === selected ? "border-accent bg-accent text-white" : d === today ? "border-accent bg-accent-soft" : "border-line hover:bg-accent-soft"
              }`}
              aria-pressed={d === selected}
            >
              <span className="font-semibold">{Number(d.slice(8, 10))}</span>
              {counts[d] ? <span className={`text-[11px] ${d === selected ? "text-white/90" : "text-muted"}`}>{counts[d]}건</span> : null}
            </button>
          ) : (
            <div key={`e${i}`} />
          ),
        )}
      </div>
    </div>
  );
}
