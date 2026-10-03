"use client";
import { useEffect, useRef } from "react";
import { FLOOR_COLORS } from "@/lib/floor-colors";
import { clipToDay, fmtRange, isOngoing, nowMinutesOfDay, todayKey } from "@/lib/time";
import { FLOORS, FLOOR_LABEL, type PublicReservation, type Room } from "@/lib/types";

const PX_PER_MIN = 1.5; // 30분 = 45px, 하루 = 2160px
const ROW_H = 52;
const LABEL_W = 180;

/** PC 타임라인: 세로 장소(층별 그룹) × 가로 00:00~24:00 */
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

  // 처음 열면 현재 시각 2시간 전으로 스크롤
  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const target = isToday ? Math.max(0, (nowMin - 120) * PX_PER_MIN) : 8 * 60 * PX_PER_MIN;
    el.scrollLeft = target;
    // dateKey 가 바뀔 때만 다시 맞춘다
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);

  if (rooms.length === 0) {
    return <div className="card p-8 text-center text-muted">조건에 맞는 장소가 없습니다.</div>;
  }

  const byRoom = new Map<string, PublicReservation[]>();
  for (const r of reservations) {
    const arr = byRoom.get(r.room_id) ?? [];
    arr.push(r);
    byRoom.set(r.room_id, arr);
  }

  const totalW = 24 * 60 * PX_PER_MIN;

  return (
    <div className="card overflow-hidden">
      <div ref={scroller} className="relative overflow-x-auto">
        <div style={{ width: LABEL_W + totalW }}>
          {/* 시간 헤더 */}
          <div className="sticky top-0 z-20 flex border-b border-line bg-surface">
            <div
              className="sticky left-0 z-30 shrink-0 border-r border-line bg-surface px-3 py-2 text-sm font-semibold text-muted"
              style={{ width: LABEL_W }}
            >
              장소
            </div>
            <div className="relative" style={{ width: totalW, height: 36 }}>
              {Array.from({ length: 25 }, (_, h) => (
                <div
                  key={h}
                  className="absolute top-0 h-full border-l border-line text-xs text-muted"
                  style={{ left: h * 60 * PX_PER_MIN }}
                >
                  <span className="absolute left-1 top-2">{String(h).padStart(2, "0")}:00</span>
                </div>
              ))}
            </div>
          </div>

          {FLOORS.map((floor) => {
            const floorRooms = rooms.filter((r) => r.floor === floor);
            if (floorRooms.length === 0) return null;
            const c = FLOOR_COLORS[floor];
            return (
              <div key={floor}>
                <div className="flex border-b border-line" style={{ background: c.soft }}>
                  <div
                    className="sticky left-0 z-10 shrink-0 px-3 py-1 text-sm font-bold"
                    style={{ width: LABEL_W, color: c.text, background: c.soft }}
                  >
                    {FLOOR_LABEL[floor]}
                  </div>
                </div>
                {floorRooms.map((room) => {
                  const items = byRoom.get(room.id) ?? [];
                  return (
                    <div key={room.id} className="flex border-b border-line" style={{ height: ROW_H }}>
                      <div
                        className="sticky left-0 z-10 flex shrink-0 flex-col justify-center border-r border-line bg-surface px-3"
                        style={{ width: LABEL_W }}
                      >
                        <span className="truncate font-semibold">{room.name}</span>
                        <span className="truncate text-xs text-muted">
                          {room.capacity_text} · {room.seating_type}
                        </span>
                      </div>
                      <div className="relative" style={{ width: totalW }}>
                        {/* 30분 격자 */}
                        {Array.from({ length: 48 }, (_, i) => (
                          <div
                            key={i}
                            className={`absolute top-0 h-full border-l ${i % 2 === 0 ? "border-line" : "border-line/40"}`}
                            style={{ left: i * 30 * PX_PER_MIN }}
                          />
                        ))}
                        {items.map((r) => {
                          const clip = clipToDay(r.start_at, r.end_at, dateKey);
                          if (!clip) return null;
                          const ongoing = isOngoing(r.start_at, r.end_at, now);
                          const left = clip.fromMin * PX_PER_MIN;
                          const width = Math.max(6, (clip.toMin - clip.fromMin) * PX_PER_MIN - 2);
                          return (
                            <div
                              key={r.id}
                              className="absolute top-1 flex h-[calc(100%-8px)] items-center gap-1 overflow-hidden px-2 text-sm text-white shadow-sm"
                              style={{
                                left: left + 1,
                                width,
                                background: c.bg,
                                borderRadius: `${clip.continuesBefore ? 0 : 8}px ${clip.continuesAfter ? 0 : 8}px ${clip.continuesAfter ? 0 : 8}px ${clip.continuesBefore ? 0 : 8}px`,
                                outline: ongoing ? "3px solid #d93025" : undefined,
                                outlineOffset: -3,
                              }}
                              title={`${FLOOR_LABEL[r.floor]} ${r.room_name} · ${fmtRange(r.start_at, r.end_at)} · ${r.title}${r.department ? ` · ${r.department}` : ""}`}
                            >
                              {ongoing && (
                                <span className="shrink-0 rounded bg-white/90 px-1 text-[11px] font-bold text-[#b42318]">
                                  사용 중
                                </span>
                              )}
                              <span className="truncate font-semibold">{r.title}</span>
                              {width > 160 && <span className="truncate opacity-90">· {r.department}</span>}
                              {width > 260 && <span className="shrink-0 opacity-90">· {fmtRange(r.start_at, r.end_at)}</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}

          {/* 현재 시각 선 */}
          {isToday && (
            <div
              className="pointer-events-none absolute top-0 z-20 h-full w-0.5 bg-[#d93025]"
              style={{ left: LABEL_W + nowMin * PX_PER_MIN }}
              aria-hidden
            >
              <span className="absolute -left-5 top-9 rounded bg-[#d93025] px-1 text-[11px] font-bold text-white">
                지금
              </span>
            </div>
          )}
        </div>
      </div>
      {reservations.length === 0 && (
        <p className="border-t border-line p-4 text-center text-muted">이 날 예약이 없습니다.</p>
      )}
    </div>
  );
}
