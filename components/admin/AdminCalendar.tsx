"use client";
import { daysOfMonth, todayKey, weekOf } from "@/lib/time";

const WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];

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
  const leading = weekOf(days[0], "sun").indexOf(days[0]);
  const cells: (string | null)[] = [...Array(leading).fill(null), ...days];
  while (cells.length % 7) cells.push(null);
  const today = todayKey();

  // 년/월 바로 고르기: 선택한 달과의 차이만큼 onMonthChange 로 이동
  const [y, m] = monthKey.split("-").map(Number);
  const thisYear = Number(today.slice(0, 4));
  const years = Array.from({ length: 7 }, (_, i) => thisYear - 3 + i);
  if (!years.includes(y)) years.push(y);
  years.sort((a, b) => a - b);
  const jump = (ny: number, nm: number) => {
    const delta = ny * 12 + nm - (y * 12 + m);
    if (delta) onMonthChange(delta);
  };

  return (
    <div className="card p-3">
      <div className="mb-2 flex items-center justify-between">
        <button className="btn btn-sm" onClick={() => onMonthChange(-1)} aria-label="이전 달">◀</button>
        <div className="flex items-center gap-1 text-lg font-bold">
          <select
            className="cursor-pointer rounded-md border border-line bg-surface px-1 py-0.5 hover:bg-accent-soft"
            value={y}
            onChange={(e) => jump(Number(e.target.value), m)}
            aria-label="년"
          >
            {years.map((x) => <option key={x} value={x}>{x}년</option>)}
          </select>
          <select
            className="cursor-pointer rounded-md border border-line bg-surface px-1 py-0.5 hover:bg-accent-soft"
            value={m}
            onChange={(e) => jump(y, Number(e.target.value))}
            aria-label="월"
          >
            {Array.from({ length: 12 }, (_, i) => i + 1).map((x) => <option key={x} value={x}>{x}월</option>)}
          </select>
        </div>
        <button className="btn btn-sm" onClick={() => onMonthChange(1)} aria-label="다음 달">▶</button>
      </div>
      <div className="grid grid-cols-7 text-center text-xs font-semibold text-muted">
        {WEEKDAYS.map((w, i) => (
          <div key={w} className={`py-1 ${i === 0 ? "text-[#b42318]" : i === 6 ? "text-[#2c6fb0]" : ""}`}>{w}</div>
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
