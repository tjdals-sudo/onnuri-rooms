"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { SLOT_MINUTES, clipToDay, fmtRange, isOngoing, minToLabel, nowMinutesOfDay, todayKey } from "@/lib/time";
import { FLOORS, FLOOR_LABEL, type PublicReservation, type Room } from "@/lib/types";

const ROW_H = 30; // 30분 = 30px → 1분 = 1px
const TIME_W = 60; // 왼쪽 시간 열 폭
const EARLY_END = 6 * 60; // 새벽 0~6시는 기본 접힘

/** PC 타임라인: 세로 시간(00:00~24:00) × 가로 장소(층별 그룹) */
export default function DayGrid({
  rooms,
  reservations,
  dateKey,
  now,
}: {
  rooms: Room[];
  reservations: PublicReservation[];
  dateKey: string;
  now: Date;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const isToday = dateKey === todayKey(now);
  const nowMin = nowMinutesOfDay(now);

  // 하루 안으로 자른 예약 조각 (자정 넘김은 전날/다음날에 각각 한 조각)
  const pieces = useMemo(() => {
    const byRoom = new Map<string, { r: PublicReservation; clip: NonNullable<ReturnType<typeof clipToDay>> }[]>();
    for (const r of reservations) {
      const clip = clipToDay(r.start_at, r.end_at, dateKey);
      if (!clip) continue;
      const arr = byRoom.get(r.room_id) ?? [];
      arr.push({ r, clip });
      byRoom.set(r.room_id, arr);
    }
    return byRoom;
  }, [reservations, dateKey]);

  // 새벽에 예약이 있거나 지금이 새벽이면 자동으로 펼침
  const hasEarly = useMemo(
    () => Array.from(pieces.values()).some((arr) => arr.some((p) => p.clip.fromMin < EARLY_END)),
    [pieces],
  );
  const [showEarly, setShowEarly] = useState(false);
  const earlyOpen = showEarly || hasEarly || (isToday && nowMin < EARLY_END);
  const startMin = earlyOpen ? 0 : EARLY_END;
  const totalH = (24 * 60 - startMin) * (ROW_H / SLOT_MINUTES);

  // 처음 열면 현재 시각 2시간 전(오늘) 또는 08:00 으로 스크롤
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = isToday ? nowMin - 120 : 8 * 60;
    el.scrollTop = Math.max(0, (target - startMin) * (ROW_H / SLOT_MINUTES));
    // dateKey 가 바뀔 때만 다시 맞춘다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey, startMin]);

  if (rooms.length === 0) {
    return <div className="card p-8 text-center text-muted">조건에 맞는 장소가 없습니다.</div>;
  }

  const floorGroups = FLOORS.map((f) => ({ floor: f, rooms: rooms.filter((r) => r.floor === f) })).filter((g) => g.rooms.length > 0);
  const colStyle = { flex: "1 1 0", minWidth: 76 } as const;
  const hourLines = `repeating-linear-gradient(to bottom, var(--line) 0, var(--line) 1px, transparent 1px, transparent ${ROW_H}px)`;
  const hourStrong = `repeating-linear-gradient(to bottom, #b9c7dc 0, #b9c7dc 1px, transparent 1px, transparent ${ROW_H * 2}px)`;

  return (
    <div className="card overflow-hidden">
      {!earlyOpen && (
        <button className="w-full border-b border-line bg-[#f4f8fc] py-1.5 text-sm text-muted hover:bg-accent-soft" onClick={() => setShowEarly(true)}>
          ▾ 새벽 0시~6시 펼치기 (예약 없음)
        </button>
      )}
      <div ref={scroller} className="relative max-h-[calc(100vh-290px)] min-h-[420px] overflow-auto">
        <div style={{ minWidth: TIME_W + rooms.length * 76 }}>
          {/* 머리글: 층 띠 + 장소명 (스크롤해도 고정) */}
          <div className="sticky top-0 z-20 bg-surface shadow-[0_1px_0_var(--line)]">
            <div className="flex">
              <div className="sticky left-0 z-30 shrink-0 border-r border-line bg-surface" style={{ width: TIME_W }} />
              {floorGroups.map((g) => {
                const c = FLOOR_COLORS[g.floor];
                return (
                  <div
                    key={g.floor}
                    className="truncate px-2 py-1 text-center text-xs font-bold"
                    style={{ flex: `${g.rooms.length} 1 0`, minWidth: 76 * g.rooms.length, background: c.soft, color: c.text }}
                  >
                    {FLOOR_LABEL[g.floor]}
                  </div>
                );
              })}
            </div>
            <div className="flex border-b border-line">
              <div className="sticky left-0 z-30 flex shrink-0 items-end justify-center border-r border-line bg-surface pb-1 text-xs text-muted" style={{ width: TIME_W }}>
                시간
              </div>
              {floorGroups.flatMap((g) =>
                g.rooms.map((room) => {
                  const c = FLOOR_COLORS[g.floor];
                  return (
                    <div key={room.id} className="flex h-14 flex-col items-center justify-center border-l border-line px-1 text-center" style={colStyle}>
                      <span className="line-clamp-2 text-sm font-semibold leading-tight" style={{ color: c.text }} title={`${room.name} · ${room.capacity_text} · ${room.seating_type}`}>
                        {room.name}
                      </span>
                      <span className="truncate text-[11px] text-muted">{room.capacity_text}</span>
                    </div>
                  );
                }),
              )}
            </div>
          </div>

          {/* 본문 */}
          <div className="relative flex" style={{ height: totalH }}>
            {/* 시간 열 */}
            <div className="sticky left-0 z-10 shrink-0 border-r border-line bg-surface" style={{ width: TIME_W }}>
              {Array.from({ length: (24 * 60 - startMin) / 60 + 1 }, (_, i) => {
                const m = startMin + i * 60;
                return (
                  <div key={m} className="absolute right-1.5 -translate-y-1/2 text-xs tabular-nums text-muted" style={{ top: (m - startMin) * (ROW_H / SLOT_MINUTES) }}>
                    {minToLabel(m)}
                  </div>
                );
              })}
            </div>

            {/* 장소 열 */}
            {floorGroups.flatMap((g) =>
              g.rooms.map((room) => {
                const c = FLOOR_COLORS[g.floor];
                const items = pieces.get(room.id) ?? [];
                return (
                  <div key={room.id} className="relative border-l border-line" style={{ ...colStyle, backgroundImage: `${hourStrong}, ${hourLines}` }}>
                    {items.map(({ r, clip }) => {
                      const top = (Math.max(clip.fromMin, startMin) - startMin) * (ROW_H / SLOT_MINUTES);
                      const height = Math.max(22, (clip.toMin - Math.max(clip.fromMin, startMin)) * (ROW_H / SLOT_MINUTES) - 2);
                      if (clip.toMin <= startMin) return null;
                      const ongoing = isOngoing(r.start_at, r.end_at, now);
                      const tall = height >= 58;
                      const taller = height >= 80;
                      return (
                        <div
                          key={r.id}
                          className="absolute inset-x-0.5 overflow-hidden px-1.5 py-1 text-left text-xs leading-tight text-white shadow-sm"
                          style={{
                            top: top + 1,
                            height,
                            background: c.bg,
                            borderRadius: `${clip.continuesBefore ? 0 : 6}px ${clip.continuesBefore ? 0 : 6}px ${clip.continuesAfter ? 0 : 6}px ${clip.continuesAfter ? 0 : 6}px`,
                            outline: ongoing ? "3px solid #d93025" : undefined,
                            outlineOffset: -3,
                          }}
                          title={`${FLOOR_LABEL[r.floor]} ${r.room_name} · ${fmtRange(r.start_at, r.end_at)} · ${r.title}${r.department ? ` · ${r.department}` : ""}`}
                        >
                          {ongoing && (
                            <span className="mb-0.5 inline-block rounded bg-white/90 px-1 text-[10px] font-bold text-[#b42318]">사용 중</span>
                          )}
                          <div className="truncate font-bold">{r.department || r.title}</div>
                          {tall && r.department && <div className="truncate opacity-95">{r.title}</div>}
                          {taller && <div className="truncate tabular-nums opacity-85">{fmtRange(r.start_at, r.end_at)}</div>}
                        </div>
                      );
                    })}
                  </div>
                );
              }),
            )}

            {/* 현재 시각 선 */}
            {isToday && nowMin >= startMin && (
              <div className="pointer-events-none absolute inset-x-0 z-10 h-0.5 bg-[#d93025]" style={{ top: (nowMin - startMin) * (ROW_H / SLOT_MINUTES) }} aria-hidden>
                <span className="absolute left-1 -top-2.5 whitespace-nowrap rounded bg-[#d93025] px-1 text-[10px] font-bold text-white">지금 {minToLabel(nowMin)}</span>
              </div>
            )}
          </div>
        </div>
      </div>
      {reservations.length === 0 && <p className="border-t border-line p-3 text-center text-sm text-muted">이 날 예약이 없습니다.</p>}
    </div>
  );
}
